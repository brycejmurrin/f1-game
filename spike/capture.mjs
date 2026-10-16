#!/usr/bin/env node
// Apex 26 — graphics-spike headless capture + GLX baseline.
//
//   node spike/capture.mjs [spike|baseline|all] [outdir]
//
// spike     — load spike/three-spike.html?gl=1 (WebGL2/SwiftShader — the CI-
//             representative path), capture 4 orbit angles + stats JSON,
//             measure frame ms at 32 vs 8 lamps (criterion 3) and 22-draw vs
//             instanced cars (criterion 4).
// baseline  — load the real game, __apex.race('singapore') at night, same
//             orbit angles, frame ms + a wrapped-context draw-call count.
// Output:   scratch/captures/spike/  (results.json + PNGs). Frames < ~5 KB are
//           flagged blank:true (SwiftShader blank-canvas guard).
//
// Patterns follow tools/apex-capture.mjs (free-port async static server,
// preinstalled Chromium, playwright LIBRARY — deliberately not @playwright/test:
// the spike must stay outside the test suite).

import { createRequire } from "node:module";
import { existsSync, mkdirSync, statSync, createReadStream, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { join, normalize, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const [cmd = "all", outArg] = process.argv.slice(2);
const OUT = outArg || join(ROOT, "scratch/captures/spike");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = { width: 960, height: 540 };
const ANGLES = [
  { name: "a155", az: 155, el: 14, dist: 46, frac: 0.0 },
  { name: "a065", az: 65,  el: 10, dist: 38, frac: 0.0 },
  { name: "a245", az: 245, el: 24, dist: 70, frac: 0.0 },
  { name: "t030", az: 200, el: 12, dist: 42, frac: 0.30 },
];

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
async function startStaticServer() {
  const port = await freePort();
  const root = ROOT + sep;
  const server = createHttpServer((req, res) => {
    try {
      const u = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      let rel = decodeURIComponent(u.pathname);
      if (rel === "/") rel = "/index.html";
      const file = normalize(join(ROOT, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      let st; try { st = statSync(file); } catch { res.writeHead(404); res.end(); return; }
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size, "Cache-Control": "no-store" });
      createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e?.message || e)); }
  });
  await new Promise((res, rej) => { server.once("error", rej); server.listen(port, "127.0.0.1", res); });
  return { url: `http://127.0.0.1:${port}/`, kill: () => new Promise((r) => server.close(() => r())) };
}
const launch = () => chromium.launch({
  executablePath: chromePath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
});
const blank = (file) => { try { return statSync(file).size < 5 * 1024; } catch { return true; } };

/* ── spike capture ────────────────────────────────────────────────────────── */
async function captureSpike(baseUrl) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: VP });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  // renderer.info is per-internal-pass under the post pipeline — count REAL GL
  // draws with the same wrapped-context trick as the GLX baseline.
  await page.addInitScript(() => {
    window.__spikeDraws = 0;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = WebGL2RenderingContext.prototype[fn];
      WebGL2RenderingContext.prototype[fn] = function (...a) { window.__spikeDraws++; return orig.apply(this, a); };
    }
  });
  console.log("spike: loading page…");
  await page.goto(baseUrl + "spike/three-spike.html?gl=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__spike && window.__spike.ready, { timeout: 180000 });
  console.log("spike: ready — first stats:", JSON.stringify(await page.evaluate(() => window.__spike.stats())));
  await sleep(1000);

  const shots = [];
  for (const a of ANGLES) {
    await page.evaluate((v) => window.__spike.setCamera(v.az, v.el, v.dist, v.frac), a);
    await sleep(700);
    const file = join(OUT, `spike-${a.name}.png`);
    console.log("spike: shooting", a.name);
    await page.screenshot({ path: file, timeout: 120000 });
    shots.push({ ...a, file, blank: blank(file) });
  }

  // frame-time samples: 32 lamps vs 8 lamps (criterion 3), instanced cars (criterion 4).
  // Sample by FRAME COUNT, not wall time — SwiftShader runs seconds-per-frame and a
  // fixed sleep can straddle zero completed frames (ms would read 0).
  async function sampleMs(setup) {
    await page.evaluate(setup);
    const s0 = await page.evaluate(() => ({ f: window.__spike.stats().frames, d: window.__spikeDraws }));
    await page.evaluate(() => window.__spike.resetMs());
    await page.waitForFunction((f) => window.__spike.stats().frames >= f + 4, s0.f, { timeout: 150000 });
    const s1 = await page.evaluate(() => ({ s: window.__spike.stats(), d: window.__spikeDraws }));
    s1.s.glDrawsPerFrame = Math.round((s1.d - s0.d) / (s1.s.frames - s0.f));
    return s1.s;
  }
  await page.evaluate((v) => window.__spike.setCamera(v.az, v.el, v.dist, v.frac), ANGLES[0]);
  console.log("spike: sampling ms (32 lamps)…");
  const s32 = await sampleMs(() => { __spike.setLightCount(32); __spike.toggleInstancing(false); });
  console.log("spike: sampling ms (8 lamps)…");
  const s8 = await sampleMs(() => { __spike.setLightCount(8); });
  console.log("spike: sampling ms (instanced)…");
  const sInst = await sampleMs(() => { __spike.setLightCount(32); __spike.toggleInstancing(true); });
  const instShot = join(OUT, "spike-a155-instanced.png");
  await page.screenshot({ path: instShot, timeout: 120000 });
  await page.evaluate(() => __spike.toggleInstancing(false));

  await browser.close();
  return {
    backend: s32.backend, forced: s32.forced, triangles: s32.triangles, shots, errors,
    ms32: s32.ms, fps32: s32.fps, drawCalls: s32.glDrawsPerFrame, lights32: s32.lights,
    ms8: s8.ms, lights8: s8.lights,
    msInstanced: sInst.ms, drawCallsInstanced: sInst.glDrawsPerFrame,
    instancedShotBlank: blank(instShot),
  };
}

/* ── GLX baseline ─────────────────────────────────────────────────────────── */
async function captureBaseline(baseUrl) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: VP });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // wrap the WebGL2 draw entry points so we can read draws-per-frame
  await page.addInitScript(() => {
    window.__glxDraws = 0;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = WebGL2RenderingContext.prototype[fn];
      WebGL2RenderingContext.prototype[fn] = function (...a) { window.__glxDraws++; return orig.apply(this, a); };
    }
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__apex != null, { timeout: 60000 });
  await page.evaluate(() => __apex.race("singapore"));
  await page.waitForFunction(() => { try { return !!__apex.probe(); } catch { return false; } }, { timeout: 120000 });
  await page.evaluate(() => __apex.setTimeOfDay("night"));
  await page.evaluate(() => __apex.park(0.0));
  await page.evaluate(() => __apex.hud(false));
  await sleep(2500);

  const shots = [];
  for (const a of ANGLES) {
    await page.evaluate((v) => __apex.orbit(v.frac, v.az, v.el, v.dist), a);
    await sleep(900);
    const file = join(OUT, `glx-${a.name}.png`);
    await page.screenshot({ path: file });
    shots.push({ ...a, file, blank: blank(file) });
  }

  await page.evaluate((v) => __apex.orbit(v.frac, v.az, v.el, v.dist), ANGLES[0]);
  await sleep(500);
  const perf = await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now(); const d0 = window.__glxDraws; let frames = 0;
    const tick = () => {
      frames++;
      if (performance.now() - t0 > 2800) {
        resolve({ ms: (performance.now() - t0) / frames,
                  drawCalls: Math.round((window.__glxDraws - d0) / frames) });
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const light = await page.evaluate(() => __apex.lightState());
  await browser.close();
  return { shots, errors, ms: perf.ms, fps: 1000 / perf.ms, drawCalls: perf.drawCalls,
           numLights: light && light.numLights };
}

/* ── main ─────────────────────────────────────────────────────────────────── */
const server = await startStaticServer();
const results = { when: new Date().toISOString(), viewport: VP };
try {
  if (cmd === "spike" || cmd === "all") {
    console.log("capturing spike (WebGL2/SwiftShader)…");
    results.spike = await captureSpike(server.url);
    console.log(JSON.stringify(results.spike, null, 2));
  }
  if (cmd === "baseline" || cmd === "all") {
    console.log("capturing GLX baseline…");
    results.baseline = await captureBaseline(server.url);
    console.log(JSON.stringify(results.baseline, null, 2));
  }
} finally {
  await server.kill();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log("wrote", join(OUT, "results.json"));
if (results.spike && (results.spike.shots.some((s) => s.blank) || results.spike.errors.length)) {
  console.error("SPIKE HARD GATE: blank frames or console errors — see results.json");
  process.exit(1);
}
