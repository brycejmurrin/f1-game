#!/usr/bin/env node
"use strict";
/**
 * report-server — serve this working tree to a phone and collect its reports.
 *
 * The localhost half of tools/apex-report.js. Two things it buys over
 * `npx serve`:
 *
 *   1. It is reachable from the DEVICE. startStaticServer binds loopback by
 *      design, and a phone cannot reach a laptop's 127.0.0.1 — so this one asks
 *      for 0.0.0.0 and prints the LAN URLs to type into the phone.
 *   2. POST /apex-report writes the bundle straight to artifacts/reports/ and
 *      prints its verdict in the terminal. Nothing to download, AirDrop, or
 *      copy out of a console on a device with no filesystem worth the name.
 *
 * Serving the tree also means tools/apex-report.js is a same-origin path, so
 * the console line is `fetch("/tools/apex-report.js")` with no GitHub in it.
 * (pages.yml stages runtime directories only, which is why the DEPLOYED site
 * cannot offer that.)
 *
 *   node tools/report-server.mjs [--port 3456] [--host 0.0.0.0] [--root .]
 *
 * A report only reaches this collector when the PAGE came from here too: a
 * phone on the https deployed site cannot POST to a plain-http laptop (mixed
 * content, and cross-origin besides). That is the trade — serve the build you
 * want to debug, which is usually the point anyway. The deployed site keeps the
 * download path.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { startStaticServer } from "./harness.mjs";

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const PORT = Number(flag("--port", "3456"));
const HOST = flag("--host", "0.0.0.0");
const ROOT = resolve(flag("--root", process.cwd()));
const OUT = join(ROOT, "artifacts", "reports");

const MAX_BYTES = 32 * 1024 * 1024;   // a bundle with a PNG is ~100 KB; this is only a floodgate

// Reports are named by the page, so treat the name as hostile: basename only,
// and a conservative character class.
function safeName(raw) {
  const base = String(raw || "").split(/[\\/]/).pop() || "";
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return /\.json$/.test(clean) && clean.length > 5 ? clean : `apex-report-${Date.now()}.json`;
}

function collect(req, res, url) {
  if (url.pathname !== "/apex-report") return false;

  if (req.method === "OPTIONS") {           // a probe before POST, and CORS for the odd setup
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }).end();
    return true;
  }
  if (req.method === "GET") {               // typed into a browser bar: say what this is
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
      .end(`apex-report collector. POST a bundle here; it lands in ${OUT}.\n` +
           `On this device's console:  fetch("/tools/apex-report.js").then(r=>r.text()).then(s=>(0,eval)(s))\n`);
    return true;
  }
  if (req.method !== "POST") { res.writeHead(405).end("POST a report here"); return true; }

  const chunks = [];
  let bytes = 0;
  let aborted = false;
  req.on("data", (c) => {
    if (aborted) return;
    bytes += c.length;
    if (bytes > MAX_BYTES) {
      aborted = true;
      res.writeHead(413, { "Access-Control-Allow-Origin": "*" }).end("report too large");
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (aborted) return;
    const text = Buffer.concat(chunks).toString("utf8");
    const name = safeName(url.searchParams.get("file"));
    let rep = null;
    try { rep = JSON.parse(text); } catch (e) { /* still worth keeping on disk */ }
    try {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, name), text);
    } catch (e) {
      res.writeHead(500, { "Access-Control-Allow-Origin": "*" }).end("could not write: " + e.message);
      return;
    }
    const kb = (text.length / 1024).toFixed(1);
    console.log(`\n[report] ${name}  (${kb} KB)  -> artifacts/reports/${name}`);
    if (rep) {
      console.log(`[report] build ${rep.build} · backend ${rep.backend} · state ${rep.state}`);
      const cc = rep.canvasContext || {};
      console.log(`[report] canvas alpha: ${cc.webgl2 ? cc.alpha : cc.note || "n/a"}`);
      if (rep.agent) console.log(`[report] ${rep.agent.ua}`);
      for (const line of rep.verdict || []) console.log(`[report]   ${line}`);
    } else {
      console.log("[report] body is not JSON — saved raw");
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      .end(JSON.stringify({ ok: true, saved: `artifacts/reports/${name}`, bytes: text.length }));
  });
  return true;
}

function lanURLs(port) {
  const out = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}/`);
    }
  }
  return out;
}

if (!existsSync(join(ROOT, "index.html"))) {
  console.error(`no index.html in ${ROOT} — run from the repo root or pass --root`);
  process.exit(1);
}

const srv = await startStaticServer(ROOT, { port: PORT, host: HOST, route: collect });
// The BOUND port, never the requested one: --port 0 means "pick one", and
// printing the request would print 0 and send the reader nowhere.
const port = srv.port;
const lan = lanURLs(port);
console.log(`serving ${ROOT}`);
console.log(`  this machine : http://127.0.0.1:${port}/`);
for (const u of lan) console.log(`  from a phone : ${u}`);
if (!lan.length) console.log("  (no external IPv4 found — a phone will not be able to reach this box)");
console.log(`  reports      -> ${OUT}`);
console.log("\nOn the device, open one of those URLs, start a race, then in the console:");
console.log('  fetch("/tools/apex-report.js").then(r=>r.text()).then(s=>(0,eval)(s))');
console.log("\nCtrl-C to stop.");

// startStaticServer unrefs its handle so a forgetful tool can still exit. This
// tool's whole job is to stay up, so hold the loop open explicitly.
const keepalive = setInterval(() => {}, 1 << 30);
const bye = () => { clearInterval(keepalive); Promise.resolve(srv.close()).finally(() => process.exit(0)); };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
