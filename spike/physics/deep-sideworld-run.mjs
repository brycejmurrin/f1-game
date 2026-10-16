#!/usr/bin/env node
// deep-sideworld-run.mjs — drives side-world.html in headless Chromium and
// prints the measured R1 side-world costs (see deep-sideworld.js for what is
// measured). Static server + preinstalled Chromium, same pattern as the
// graphics-spike probes.
//
// Usage: node spike/physics/deep-sideworld-run.mjs

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createServer as netServer } from "node:net";
import { statSync, createReadStream, existsSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import os from "node:os";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const MIME = { ".html": "text/html", ".js": "application/javascript",
               ".mjs": "application/javascript", ".json": "application/json" };
const port = await new Promise((r) => {
  const s = netServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); });
});
const server = createServer((req, res) => {
  try {
    const file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    const st = statSync(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream",
                         "Content-Length": st.size,
                         // cross-origin isolation unclamps performance.now()
                         // (100 us -> 5 us) for credible sub-ms phase timing
                         "Cross-Origin-Opener-Policy": "same-origin",
                         "Cross-Origin-Embedder-Policy": "require-corp" });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));

console.log(`loadavg before run: [${os.loadavg().map((x) => x.toFixed(2)).join(", ")}]` +
  ` on ${os.cpus().length} cores`);

const browser = await chromium.launch({
  executablePath: existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
  args: ["--use-angle=swiftshader", "--enable-precise-memory-info"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE[error]:", m.text().slice(0, 300));
});

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/spike/physics/side-world.html`,
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__sideworld && window.__sideworld.done,
  null, { timeout: 240000 });
const wall = Date.now() - t0;

const sw = await page.evaluate(() => window.__sideworld);
if (sw.error) {
  console.log("RUN FAILED:", sw.error);
} else {
  const r = sw.result;
  const f = (o) => `mean ${o.mean.toFixed(3)}  p95 ${o.p95.toFixed(3)}  max ${o.max.toFixed(3)}`;
  console.log(`\nUA: ${r.ua}`);
  console.log(`wall time (nav -> done): ${wall} ms`);
  console.log(`\nload+init: import ${r.importMs.toFixed(0)} ms, RAPIER.init ${r.initMs.toFixed(0)} ms,` +
    ` geometry fetch+parse ${r.geoFetchMs.toFixed(0)} ms,` +
    ` trimesh ${r.trimeshBuildMs.toFixed(0)} ms, 122 bodies ${r.bodiesBuildMs.toFixed(0)} ms`);
  console.log(`\nper-tick (ms, 600 ticks after 60 warm-up):`);
  console.log(`  sync-in   (22 kinematic mirror writes)  ${f(r.sync)}`);
  console.log(`  step      (world.step)                  ${f(r.step)}`);
  console.log(`    early 300 ticks                       ${f(r.stepEarly)}`);
  console.log(`    late  300 ticks                       ${f(r.stepLate)}`);
  console.log(`  read-back (100 debris poses)            ${f(r.read)}`);
  const tot = r.sync.mean + r.step.mean + r.read.mean;
  const totP95 = r.sync.p95 + r.step.p95 + r.read.p95;
  console.log(`  TOTAL mean ${tot.toFixed(3)} ms  (p95 sum ${totP95.toFixed(3)} ms)`);
  console.log(`\nheap (JS only, WASM linear memory NOT included):`);
  console.log(`  +rapier import/init ${(r.heap.addedByRapierJs / 1e6).toFixed(1)} MB,` +
    ` +world/geometry ${(r.heap.addedByWorld / 1e6).toFixed(1)} MB,` +
    ` afterRun ${(r.heap.afterRun / 1e6).toFixed(1)} MB used / ${(r.heap.total / 1e6).toFixed(1)} MB total`);
  console.log(`\nnon-finite in read-back buffer: ${r.nonFinite}`);
  console.log(`loadavg after run: [${os.loadavg().map((x) => x.toFixed(2)).join(", ")}]`);
  console.log("\nJSON:", JSON.stringify(r));
}

await browser.close();
server.close();
