#!/usr/bin/env node
/**
 * soft-present-bench.mjs — measure WGX soft-present cost with spatial upscale
 * ON vs OFF at a fixed renderScale (default 0.75). Software readback ≠ player
 * headed FPS; report path/softPresent and wall times only.
 *
 *   node docs/archive/tools/gfx/soft-present-bench.mjs [track] [--frames N] [--scale 0.75]
 *     [--out artifacts/soft-present-bench.json]
 *
 * @doc Soft-present upscale ON/OFF timing (software blit ≠ player FPS).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { readFileSync, statSync } from "fs";
import { extname } from "path";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const args = process.argv.slice(2);
let track = "montreal", frames = 90, scale = 0.75;
let outPath = join(ROOT, "artifacts", "soft-present-bench.json");
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--frames") frames = Math.max(30, +args[++i] || 90);
  else if (a === "--scale") scale = Math.min(0.95, Math.max(0.25, +args[++i] || 0.75));
  else if (a === "--out") outPath = args[++i];
  else if (!a.startsWith("--")) track = a;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function serve() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || "/").split("?")[0]);
        if (p === "/") p = "/index.html";
        const file = join(ROOT, p.replace(/^\//, ""));
        if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        const body = readFileSync(file);
        res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch (_) { res.writeHead(404); res.end("missing"); }
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

async function leg(page, { baseUrl, upscale, gatherPin }) {
  const gather = gatherPin == null ? "" : gatherPin;
  await page.goto(`${baseUrl}?gfx=webgpu&upscale=${upscale ? 1 : 0}&gather=${gather}`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await page.waitForFunction(() => window.__apex && typeof window.__apex.race === "function", null, { timeout: 90000, polling: 100 });
  await page.evaluate(async (tr) => { await window.__apex.race(tr); }, track);
  await page.waitForFunction(() => window.__apex.info().track, null, { timeout: 60000, polling: 100 });
  await page.evaluate(({ scale, upscale }) => {
    window.__apex.renderScale(scale);
    window.__apex.spatialUpscale(upscale ? 1 : 0);
  }, { scale, upscale });
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.18, 40); window.__apex.snapCam(); });
  // Warm a soft present if any
  if (typeof (await page.evaluate(() => window.GLX && typeof GLX.awaitSoftPresent)) === "function"
      || await page.evaluate(() => !!(window.GLX && GLX.awaitSoftPresent))) {
    try {
      await page.evaluate(async () => { if (GLX.awaitSoftPresent) await GLX.awaitSoftPresent(20000); });
    } catch (_) { /* */ }
  }
  const timing = await page.evaluate(async (n) => {
    const soft = !!(window.GLX && GLX.softPresent && GLX.softPresent());
    const path = soft ? "soft-blit" : "native-or-direct";
    const spat = window.__apex.spatialUpscale();
    const present = window.GLX && GLX.getPresentSize ? GLX.getPresentSize() : null;
    const rs = window.GLX && GLX.getRenderScale ? GLX.getRenderScale() : spat.scale;
    const t0 = performance.now();
    let softAwaitMs = 0;
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (soft && GLX.awaitSoftPresent) {
        const a0 = performance.now();
        try { await GLX.awaitSoftPresent(5000); } catch (_) { /* */ }
        softAwaitMs += performance.now() - a0;
      }
    }
    const wallMs = performance.now() - t0;
    const softState = (GLX.softPresentState && GLX.softPresentState()) || null;
    return {
      frames: n, wallMs, softAwaitMs, soft, path, spat, present, renderScale: rs,
      softState, backend: (window.__apex.info && window.__apex.info().gfx) || null,
    };
  }, frames);
  return timing;
}

const { srv, port } = await serve();
const results = {
  track, frames, scale,
  note: "Software soft-present readback grows with present size when upscale is ON; not player headed FPS. Compare path: rows only.",
  legs: {},
};
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan",
      "--use-gl=angle", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get("gather") === "0") localStorage.setItem("apex26.spatialUpscaleGather", "0");
      else localStorage.removeItem("apex26.spatialUpscaleGather");
      localStorage.setItem("apex26.spatialUpscale", q.get("upscale") === "1" ? "1" : "0");
    } catch (_) { /* blocked storage */ }
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  results.legs.off = await leg(page, { baseUrl, upscale: false, gatherPin: null });
  results.legs.on_gather = await leg(page, { baseUrl, upscale: true, gatherPin: null });
  results.legs.on_tap = await leg(page, { baseUrl, upscale: true, gatherPin: "0" });
} finally {
  if (browser) await browser.close();
  srv.close();
}

const summary = {};
for (const [k, v] of Object.entries(results.legs)) {
  summary[k] = {
    wallMs: Math.round(v.wallMs),
    softAwaitMs: Math.round(v.softAwaitMs),
    msPerFrame: +(v.wallMs / frames).toFixed(2),
    path: v.path,
    active: v.spat && v.spat.active,
    gather: v.spat && v.spat.gather,
    present: v.present,
    renderScale: v.renderScale,
  };
}
results.summary = summary;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ out: outPath, summary }, null, 2));
