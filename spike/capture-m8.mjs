#!/usr/bin/env node
// Apex 26 — TLX M8 post-chain A/B capture: TLX (three backend, forced WebGL2
// like CI) vs GLX pairs on the M8 money shots, plus a ?viz=ssao bisect view.
//
//   node spike/capture-m8.mjs [outdir]     # default scratch/captures/spike
//
// Shots: tlx-m8-monza-day-{tlx,glx}.png       composite / bloom / ACES
//        tlx-m8-singapore-night-{tlx,glx}.png shafts / glow / bloom
//        tlx-m8-monza-viz-ssao.png            SSAO bisect blit (TLX)
// Runs SEQUENTIALLY (one browser at a time) — shared-box etiquette.
// Patterns follow spike/capture.mjs (free-port server, preinstalled Chromium).

import { createRequire } from "node:module";
import { existsSync, mkdirSync, createReadStream, statSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { join, normalize, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const OUT = process.argv[2] || join(ROOT, "scratch/captures/spike");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = { width: 960, height: 540 };

function chromePath() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined;
}
function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "application/octet-stream" };
async function startServer() {
  const port = await freePort();
  const server = createHttpServer((req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
      if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if (url.pathname === "/") p = join(ROOT, "index.html");
      if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
      createReadStream(p).pipe(res);
    } catch (_) { res.writeHead(500).end(); }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { port, close: () => new Promise((r) => server.close(r)) };
}

async function shot({ port, backend, track, name, query = "", postCheck = false }) {
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: VP });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript((b) => {
    try {
      if (b === "three") {
        localStorage.setItem("apex26.gfxBackend", "three");
        localStorage.setItem("apex26.tlxForceGL", "1");
      } else {
        localStorage.removeItem("apex26.gfxBackend");
      }
    } catch (_) {}
  }, backend);
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 60_000 });
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 120_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await sleep(1500);
  let post = null;
  if (postCheck) {
    post = await page.evaluate(() =>
      (GLX.__tlx && GLX.__tlx.postState) ? GLX.__tlx.postState() : null);
  }
  const file = join(OUT, name + ".png");
  await page.locator("canvas#game").screenshot({ path: file });
  const size = statSync(file).size;
  await browser.close();
  return { name, size, blank: size < 5000, errors: errors.slice(0, 5), post };
}

const srv = await startServer();
const results = [];
const jobs = [
  { backend: "three", track: "monza", name: "tlx-m8-monza-day-tlx", postCheck: true },
  { backend: "glx", track: "monza", name: "tlx-m8-monza-day-glx" },
  { backend: "three", track: "singapore", name: "tlx-m8-singapore-night-tlx", postCheck: true },
  { backend: "glx", track: "singapore", name: "tlx-m8-singapore-night-glx" },
  { backend: "three", track: "monza", name: "tlx-m8-monza-viz-ssao", query: "?viz=ssao", postCheck: true },
];
for (const j of jobs) {
  try {
    const r = await shot({ port: srv.port, ...j });
    results.push(r);
    console.log(JSON.stringify(r));
  } catch (e) {
    results.push({ name: j.name, error: String(e).slice(0, 300) });
    console.log(JSON.stringify(results[results.length - 1]));
  }
}
writeFileSync(join(OUT, "tlx-m8-results.json"), JSON.stringify(results, null, 2));
await srv.close();
