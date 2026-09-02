#!/usr/bin/env node
"use strict";
// @doc Localhost half of `apex-report.js`: serves the tree to a PHONE and collects the bundle it posts back.
// @skill mcp-probe
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
 * The printed URL contains a random session capability. Every read and write
 * requires it (or the HttpOnly cookie installed by that URL), only runtime files
 * are served, and accepted report names are created once rather than replaced.
 *
 *   node tools/report-server.mjs [--port 3456] [--host 0.0.0.0] [--root .]
 *
 * A report only reaches this collector when the PAGE came from here too: a
 * phone on the https deployed site cannot POST to a plain-http laptop (mixed
 * content, and cross-origin besides). That is the trade — serve the build you
 * want to debug, which is usually the point anyway. The deployed site keeps the
 * download path.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./harness.mjs";

const MAX_BYTES = 32 * 1024 * 1024;   // a bundle with a PNG is ~100 KB; this is only a floodgate
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const PUBLIC_FILES = new Set(["index.html", "version.json", "manifest.json", "sw.js"]);
const PUBLIC_DIRS = ["css/", "js/", "assets/", "icons/", "vendor/"];

function publicPath(local) {
  return PUBLIC_FILES.has(local) || PUBLIC_DIRS.some((prefix) => local.startsWith(prefix))
    || local === "tools/apex-report.js";
}

function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}

function cookieToken(req) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "apex26_report_token") return decodeURIComponent(value.join("="));
  }
  return "";
}

// Reports are named by the page, so treat the name as hostile: basename only,
// and a conservative character class.
export function safeName(raw) {
  const base = String(raw || "").split(/[\\/]/).pop() || "";
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return /\.json$/.test(clean) && clean.length > 5 ? clean : `apex-report-${Date.now()}.json`;
}

// `?report=1` on the shell injects a tap-to-send button. The whole console
// story falls apart on the device that actually has the bug: iOS Safari has no
// console at all without a Mac on the other end of a cable and Web Inspector
// enabled, which is a lot to ask of someone reporting a bug. A button also
// samples at the RIGHT MOMENT — the reporter taps when the cars look wrong,
// instead of describing it. Injected here rather than shipped in index.html so
// nothing reaches the deployed page and no cache version moves.
const BUTTON = `
<div id="apexReportBtn" role="button" tabindex="0" style="position:fixed;top:8px;right:8px;
  z-index:2147483647;min-width:132px;min-height:44px;padding:12px 14px;box-sizing:border-box;
  font:600 14px/1.2 system-ui,sans-serif;text-align:center;color:#fff;background:#c1121f;
  border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.5);touch-action:manipulation;
  cursor:pointer;-webkit-user-select:none;user-select:none">SEND REPORT</div>
<script>
(function () {
  var b = document.getElementById("apexReportBtn");
  var busy = false;
  b.addEventListener("click", function () {
    if (busy) return;
    busy = true;
    b.textContent = "sampling...";
    b.style.background = "#555";
    fetch("/tools/apex-report.js").then(function (r) { return r.text(); })
      .then(function (s) { return (0, eval)(s); })
      .then(function (x) {
        b.textContent = x && x.posted ? "SENT" : (x && x.downloaded ? "DOWNLOADED" : "NOT SENT");
        b.style.background = x && (x.posted || x.downloaded) ? "#127a2a" : "#c1121f";
      })
      .catch(function (e) { b.textContent = "FAILED"; b.title = String((e && e.message) || e); })
      .then(function () { busy = false; });
  });
})();
</script>
`;

function shell(req, res, url, root, token) {
  if (!(url.pathname === "/" || url.pathname === "/index.html")) return false;
  if (!url.searchParams.has("report")) return false;
  let html;
  try { html = readFileSync(join(root, "index.html"), "utf8"); } catch { return false; }
  const out = html.includes("</body>") ? html.replace("</body>", BUTTON + "</body>") : html + BUTTON;
  const buf = Buffer.from(out, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,     // rewritten body: the static path's length would be wrong
    "Cache-Control": "no-store",
    // The printed token is exchanged for a SameSite cookie on the first
    // navigation. Subresources and the report POST then authenticate without
    // putting the capability into every URL or exposing it to fetched scripts.
    "Set-Cookie": `apex26_report_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
  }).end(buf);
  return true;
}

export function createReportRoute({ root, out, token, maxTotalBytes = MAX_TOTAL_BYTES }) {
  let acceptedBytes = 0;
  // Bytes held by requests that have started but have not yet committed. Without
  // this reservation, concurrent uploads all compare against the same old
  // acceptedBytes value and can collectively sail past the session quota.
  let reservedBytes = 0;
  return function collect(req, res, url) {
    const supplied = url.searchParams.get("token") || cookieToken(req);
    if (!sameToken(supplied, token)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
        .end("report-server token required");
      return true;
    }
    if (shell(req, res, url, root, token) === true) return true;
    if (url.pathname !== "/apex-report") return false;

    if (req.method === "GET") {               // typed into a browser bar: say what this is
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
        .end("apex-report collector. POST a JSON bundle from the authenticated report page.\n");
      return true;
    }
    if (req.method !== "POST") { res.writeHead(405).end("POST a report here"); return true; }
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] || ""))) {
      res.writeHead(415).end("application/json required"); return true;
    }

    const chunks = [];
    let bytes = 0;
    let reserved = 0;
    let aborted = false;
    const releaseReservation = () => {
      if (!reserved) return;
      reservedBytes = Math.max(0, reservedBytes - reserved);
      reserved = 0;
    };
    req.on("data", (c) => {
      if (aborted) return;
      const next = bytes + c.length;
      if (next > MAX_BYTES || acceptedBytes + reservedBytes + c.length > maxTotalBytes) {
        aborted = true;
        releaseReservation();
        res.writeHead(413).end("report quota exceeded");
        req.destroy();
        return;
      }
      bytes = next;
      reserved += c.length;
      reservedBytes += c.length;
      chunks.push(c);
    });
    // A client that disconnects before `end` must not hold quota forever.
    req.on("aborted", releaseReservation);
    req.on("error", releaseReservation);
    req.on("end", () => {
      if (aborted) return;
      const text = Buffer.concat(chunks).toString("utf8");
      const name = safeName(url.searchParams.get("file"));
      let rep;
      try { rep = JSON.parse(text); }
      catch (_) { releaseReservation(); res.writeHead(400).end("invalid JSON"); return; }
      try {
        mkdirSync(out, { recursive: true });
        // Never let a repeated or forged filename erase the evidence already
        // collected. The client names reports with a timestamp, so a collision
        // is an error worth surfacing rather than silently inventing a name.
        writeFileSync(join(out, name), text, { flag: "wx", mode: 0o600 });
      } catch (e) {
        releaseReservation();
        const status = e && e.code === "EEXIST" ? 409 : 500;
        res.writeHead(status).end(status === 409 ? "report already exists" : "could not write report");
        return;
      }
      acceptedBytes += reserved;
      reservedBytes = Math.max(0, reservedBytes - reserved);
      reserved = 0;
      const kb = (bytes / 1024).toFixed(1);
      console.log(`\n[report] ${name}  (${kb} KB)  -> artifacts/reports/${name}`);
      console.log(`[report] build ${rep.build} · backend ${rep.backend} · state ${rep.state}`);
      const cc = rep.canvasContext || {};
      console.log(`[report] canvas alpha: ${cc.webgl2 ? cc.alpha : cc.note || "n/a"}`);
      if (rep.agent) console.log(`[report] ${rep.agent.ua}`);
      for (const line of rep.verdict || []) console.log(`[report]   ${line}`);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
        .end(JSON.stringify({ ok: true, saved: `artifacts/reports/${name}`, bytes }));
    });
    return true;
  };
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

export async function startReportServer({
  root = process.cwd(),
  port = 3456,
  host = "0.0.0.0",
  token = randomBytes(24).toString("base64url"),
  maxTotalBytes = MAX_TOTAL_BYTES,
} = {}) {
  const resolvedRoot = resolve(root);
  const out = join(resolvedRoot, "artifacts", "reports");
  if (!existsSync(join(resolvedRoot, "index.html"))) {
    throw new Error(`no index.html in ${resolvedRoot} — run from the repo root or pass --root`);
  }
  const route = createReportRoute({ root: resolvedRoot, out, token, maxTotalBytes });
  const srv = await startStaticServer(resolvedRoot, {
    port, host, route,
    allowPath: (local) => publicPath(local),
  });
  return { ...srv, root: resolvedRoot, out, token };
}

function invokedAsCli() {
  const entry = process.argv[1];
  return !!entry && fileURLToPath(import.meta.url) === resolve(entry);
}

if (invokedAsCli()) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const srv = await startReportServer({
    port: Number(flag("--port", "3456")),
    host: flag("--host", "0.0.0.0"),
    root: flag("--root", process.cwd()),
  }).catch((e) => { console.error(e.message); process.exit(1); });

  // The BOUND port, never the requested one: --port 0 means "pick one", and
  // printing the request would print 0 and send the reader nowhere.
  const port = srv.port;
  const lan = lanURLs(port);
  const auth = (base) => `${base}?report=1&token=${encodeURIComponent(srv.token)}`;
  console.log(`serving ${srv.root}`);
  console.log(`  this machine : ${auth(`http://127.0.0.1:${port}/`)}`);
  for (const u of lan) console.log(`  from a phone : ${auth(u)}`);
  if (!lan.length) console.log("  (no external IPv4 found — a phone will not be able to reach this box)");
  console.log(`  reports      -> ${srv.out}`);
  console.log("\nOpen one of the complete tokenised URLs above. The token is random for this run;");
  console.log("requests without it cannot read the working tree or post reports.");
  console.log("\nCtrl-C to stop.");

  // startStaticServer unrefs its handle so a forgetful tool can still exit. This
  // tool's whole job is to stay up, so hold the loop open explicitly.
  const keepalive = setInterval(() => {}, 1 << 30);
  const bye = () => { clearInterval(keepalive); Promise.resolve(srv.close()).finally(() => process.exit(0)); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}
