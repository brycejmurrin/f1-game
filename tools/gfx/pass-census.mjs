#!/usr/bin/env node
// pass-census.mjs — draw calls and triangles per render pass, per frame, on TLX's WebGL path.
// @doc Draw calls and triangles per render pass (main, mirror, sun/lamp shadow, post) per frame: the exact count behind #2657.
// @skill renderer-debug / playwright-probe
//
// WHAT IT ANSWERS. "How many triangles does each pass submit?" — the counting step of #2657 (index LOD for
// distant chunks and the mirror pass) and of every draw-call hunt (docs/notes/PERF-HUNT-TLX-2026-10-17.md
// did it with an untracked scratch script; this is that script as a tool). The numbers are COUNTS from
// three's own `renderer.info.render` read right after each top-level `renderer.render()`: exact on any
// box, never a frame time (PERF-FINDINGS §0, MEASURING-GPU-PERF §4).
//
// HOW. Headless Chromium, the default TLX backend forced onto three's WebGL2 path (the iPhone's path:
// `apex26.tlxForceGL=1`), the same deterministic scenario as tools/perf/profile.mjs (race → go → jump
// 0.1/55/0, throttle + a steer sine). By default the program-link calls are STUBBED (compileShader /
// linkProgram / validateProgram no-ops, status queries true): a draw on an unlinked program costs nothing,
// so a frame is JS plus counters and the scene reaches steady state in seconds under SwiftShader instead of
// minutes (docs/notes/TLX-PERF-HUNT-5-2026-10-16.md §Method). `--real-link` restores real programs.
// Each pass is keyed by its render target (name + size) or "canvas"; `render.drawCalls` and `.triangles`
// are summed per key per frame and averaged over the measured frames.
//
//   node tools/gfx/pass-census.mjs [track=monaco] [--frames 120] [--warm 60] [--real-link] [--json PATH]
//        [--camera chase|helmet|...]   (a __apex camera mode name; default: leave the race default)
//
// Output: one table row per pass key: frames it ran in (of N), mean draw calls and triangles per frame it
// ran, and per game frame. Then `= pass-census {…}` with the totals.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/gfx/pass-census.mjs [track=monaco] [--frames 120] [--warm 60] [--real-link] [--camera MODE] [--json PATH]
  Draw calls and triangles per render pass per frame on TLX's WebGL2 path (exact counts, not timings).
  Link calls are stubbed unless --real-link, so the scene reaches steady state quickly under SwiftShader.`);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--frames", "--warm", "--json", "--camera"]);
const track = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]))[0] || "monaco";
const FRAMES = Math.max(10, +flag("--frames", 120) || 120);
const WARM = Math.max(0, +flag("--warm", 60) || 60);
const REAL_LINK = argv.includes("--real-link");
const CAMERA = flag("--camera", null);
const JSON_OUT = flag("--json", null);
const WAIT_MS = Math.max(60000, +process.env.APEX_PROFILE_WAIT_MS || 60000);

/** Page-side init script: force TLX onto three's WebGL2 path and (unless --real-link) stub program links. */
function initScript(stub) {
  try {
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "1");
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
    sessionStorage.setItem("apex26.wgxCapture", "0");
  } catch (_) { /* blocked storage: the defaults still run TLX */ }
  window.__TEST_MODE = true;
  if (!stub) return;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    P.linkProgram = function () {};
    P.compileShader = function () {};
    P.validateProgram = function () {};
    const gp = P.getProgramParameter, gs = P.getShaderParameter;
    P.getProgramParameter = function (p, k) { return k === this.LINK_STATUS || k === this.VALIDATE_STATUS || k === this.COMPLETION_STATUS_KHR ? true : gp.call(this, p, k); };
    P.getShaderParameter = function (s, k) { return k === this.COMPILE_STATUS ? true : gs.call(this, s, k); };
    P.getProgramInfoLog = function () { return ""; };
    P.getShaderInfoLog = function () { return ""; };
  }
}

/** Page-side: wrap renderer.render so every top-level call records (target key, drawCalls, triangles). */
function installWrap() {
  const r = window.renderer;   // exposed by ?three-devtools=1
  if (!r || r.__passCensus) return !!r;
  const rows = [];
  const orig = r.render.bind(r);
  r.__passCensus = { rows, on: false };
  // three's `info.render.drawCalls` / `.triangles` accumulate across the passes of ONE frame and reset when the
  // next frame starts (info.autoReset), so a pass's own count is the delta around its render() call; a value
  // that went DOWN means a reset happened inside the call, and the after-value is then the pass's count.
  r.render = function (scene, camera) {
    const i = r.info.render, c0 = i.drawCalls | 0, t0 = i.triangles | 0;
    const out = orig(scene, camera);
    if (r.__passCensus.on) {
      const t = r.getRenderTarget && r.getRenderTarget();
      const key = t ? ((t.texture && t.texture.name) || t.name || "rt") + " " + t.width + "x" + t.height : "canvas";
      const c1 = i.drawCalls | 0, t1 = i.triangles | 0;
      rows.push([key, c1 >= c0 ? c1 - c0 : c1, t1 >= t0 ? t1 - t0 : t1]);
    }
    return out;
  };
  return true;
}

async function main() {
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(initScript, !REAL_LINK);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    // TLX exposes window.renderer / GLX.__tlx only behind this flag (tools/lib/mem-census.mjs reads it too).
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1");
    await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((cam) => { window.__apex.go(); window.__apex.jump(0.1, 55, 0); if (cam && window.__apex.camera) window.__apex.camera(cam); }, CAMERA);
    const ok = await page.waitForFunction(() => !!window.renderer, null, { timeout: WAIT_MS, polling: 100 }).then(() => true, () => false);
    if (!ok) throw new Error("window.renderer never appeared: this tool measures TLX (backend three) behind ?three-devtools=1");
    const backend = await page.evaluate(() => { const b = window.renderer.backend; return { api: b && b.isWebGPUBackend ? "webgpu" : "webgl2", forceWebGL: !(b && b.isWebGPUBackend) }; });
    await page.evaluate(async (warm) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < warm; i++) { A.setInput({ throttle: true, steer: 0.35 * Math.sin(i / 25) }); await raf(); }
    }, WARM);
    await page.evaluate(installWrap);
    const rows = await page.evaluate(async ({ n }) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      const r = window.renderer, pc = r.__passCensus;
      pc.rows.length = 0; pc.on = true;
      let frames = 0;
      for (let i = 0; i < n; i++) { A.setInput({ throttle: true, steer: 0.35 * Math.sin((i + 200) / 25) }); await raf(); frames++; }
      pc.on = false; A.clearInput();
      return { frames, rows: pc.rows.slice() };
    }, { n: FRAMES });
    const by = new Map();
    for (const [key, calls, tris] of rows.rows) {
      const e = by.get(key) || { key, renders: 0, calls: 0, tris: 0 };
      e.renders++; e.calls += calls; e.tris += tris; by.set(key, e);
    }
    const table = [...by.values()].map((e) => ({
      pass: e.key, renders: e.renders, perFrameRan: +(e.renders / rows.frames).toFixed(2),
      callsPerRender: +(e.calls / e.renders).toFixed(1), trisPerRender: Math.round(e.tris / e.renders),
      callsPerFrame: +(e.calls / rows.frames).toFixed(1), trisPerFrame: Math.round(e.tris / rows.frames),
    })).sort((a, b) => b.trisPerFrame - a.trisPerFrame);
    const total = table.reduce((s, e) => ({ calls: s.calls + e.callsPerFrame, tris: s.tris + e.trisPerFrame }), { calls: 0, tris: 0 });
    console.log(`pass-census ${track} (${FRAMES} frames, ${REAL_LINK ? "real" : "stubbed"} links)`);
    console.log("pass".padEnd(34) + "ran/frame  calls/render  tris/render  calls/frame  tris/frame");
    for (const e of table) {
      console.log(e.pass.padEnd(34) + String(e.perFrameRan).padStart(9) + String(e.callsPerRender).padStart(14) + String(e.trisPerRender).padStart(13) + String(e.callsPerFrame).padStart(13) + String(e.trisPerFrame).padStart(12));
    }
    const summary = { track, frames: rows.frames, backend: backend.api, forceWebGL: backend.forceWebGL,
      stubbedLinks: !REAL_LINK, callsPerFrame: +total.calls.toFixed(1), trisPerFrame: total.tris, pageErrors: errors.length };
    console.log("= pass-census " + JSON.stringify(summary));
    if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify({ summary, table, errors }, null, 2)); }
    if (!table.length) { console.error("no render() calls recorded"); process.exitCode = 1; }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
