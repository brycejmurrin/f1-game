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
//   node tools/gfx/pass-census.mjs [track=monaco] [--frames 120] [--warm 60] [--real-link] [--mobile] [--by-object] [--webgpu] [--json PATH]
//        [--camera chase|helmet|...] [--park] [--park-at 0.1] [--baseline FILE] [--ls key=value]... [--tune knob=value]...
//
// --park is the EXACT mode (#4783 row 1): frozen sim, camera snapped to --park-at of the lap, tier and render scale
// pinned. It prints each pass's [min, max] calls and triangles per render and three's memory counters, fails when the
// uniform buffers grow over the parked window, and with --baseline compares the cell exactly (pass-census-lib.mjs).
//
// Output: one table row per pass key: frames it ran in (of N), mean draw calls and triangles per frame it
// ran, and per game frame. Then `= pass-census {…}` with the totals.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { parkKey, parkPasses, baselineCell, uboFlat, compareParkBaseline, PARK_MEMORY_REPORTED } from "./pass-census-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/gfx/pass-census.mjs [track=monaco] [--frames 120] [--warm 60] [--real-link] [--mobile] [--by-object] [--camera MODE] [--park] [--park-at 0.1] [--baseline FILE] [--ls key=value]... [--tune knob=value]... [--json PATH]
  --by-object attributes each pass's triangles to object groups (the mesh's userData flags: tlxLgRoad, tlxBatch, ...), for the mirror and main passes.
  --webgpu runs three's WebGPU backend on Mesa lavapipe (CI Lavapipe shard) instead of the WebGL2 pin.
  --mobile forces the phone tier (apex26.forceMobileTier=1: mirror "lite" rung etc.).
  --park freezes the normal camera at 10% of the track, pins tier/resolution, and preserves the real fog/distance budgets (free cameras disable them).
  --park-at sets the lap fraction the parked camera sits at (0 to 1, default 0.1); implies nothing without --park.
  --baseline compares the parked cell exactly against FILE (built by pass-census-lib.mjs --collect): exit 1 on a diff or a cell the file lacks; a missing FILE is reported, not failed.
  --ls sets a localStorage key before boot (apex26. is prefixed when absent); repeatable (e.g. --ls tlxChunkMerge=2).
  --tune applies a numeric lighting knob after staging; repeatable (e.g. --tune fogDensityMul=3.625).
  Draw calls and triangles per render pass per frame on TLX's WebGL2 path (exact counts, not timings).
  Link calls are stubbed unless --real-link, so the scene reaches steady state quickly under SwiftShader.`);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--frames", "--warm", "--json", "--camera", "--tune", "--park-at", "--baseline", "--ls"]);
const track = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]))[0] || "monaco";
const FRAMES = Math.max(10, +flag("--frames", 120) || 120);
const WARM = Math.max(0, +flag("--warm", 60) || 60);
const REAL_LINK = argv.includes("--real-link");
const MOBILE = argv.includes("--mobile");
const BY_OBJECT = argv.includes("--by-object");
const CAMERA = flag("--camera", null);
const PARK = argv.includes("--park");
const PARK_AT = +flag("--park-at", 0.1);
if (!(PARK_AT >= 0 && PARK_AT <= 1)) throw new Error("--park-at must be a lap fraction from 0 to 1");
const BASELINE = flag("--baseline", null);
const LS = {};
for (let i = 0; i < argv.length; i++) if (argv[i] === "--ls" || argv[i].startsWith("--ls=")) {
  const pair = /^([\w.]+)=(.*)$/.exec((argv[i] === "--ls" ? argv[++i] : argv[i].slice(5)) || "");
  if (!pair) throw new Error("--ls requires key=value");
  LS[pair[1].startsWith("apex26.") ? pair[1] : "apex26." + pair[1]] = pair[2];
}
// --webgpu: three's WebGPU backend (Bryce's iPhone path) on Mesa lavapipe. Needs the lvp ICD; SwiftShader cannot run it.
// Software skips batches (skipBatches: true), so counts are exact for the deterministic scenario but not equal to hardware.
const WEBGPU = argv.includes("--webgpu");
const TUNES = {};
for (let i = 0; i < argv.length; i++) if (argv[i] === "--tune" || argv[i].startsWith("--tune=")) {
  const value = argv[i] === "--tune" ? argv[++i] : argv[i].slice(7);
  const pair = /^(\w+)=(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(value || "");
  if (!pair || !Number.isFinite(+pair[2])) throw new Error("--tune requires knob=number");
  TUNES[pair[1]] = +pair[2];
}
const JSON_OUT = flag("--json", null);
const WAIT_MS = Math.max(60000, +process.env.APEX_PROFILE_WAIT_MS || 60000);

/** Page-side init script: force TLX onto three's WebGL2 path and (unless --real-link) stub program links. */
function initScript({ stub, mobile, webgpu, ls }) {
  try {
    if (mobile) localStorage.setItem("apex26.forceMobileTier", "1");
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", webgpu ? "0" : "1");
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
    sessionStorage.setItem("apex26.wgxCapture", "0");
    for (const k of Object.keys(ls || {})) localStorage.setItem(k, ls[k]);
  } catch (_) { /* blocked storage: the defaults still run TLX */ }
  window.__TEST_MODE = true;
  if (!stub || webgpu) return;
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
  r.__passCensus = { rows, on: false, seen: 0 };
  // three's `info.render.drawCalls` / `.triangles` accumulate across the passes of ONE frame and reset when the
  // next frame starts (info.autoReset), so a pass's own count is the delta around its render() call; a value
  // that went DOWN means a reset happened inside the call, and the after-value is then the pass's count.
  const objRows = [];
  r.__passCensus.objRows = objRows;
  let curKey = "canvas";
  if (typeof r.renderObject === "function") {
    const origRO = r.renderObject.bind(r);
    // Group label: the mesh's userData flags (tlxLgRoad, tlxEmissive, tlxBatch, ...), which are what TLX marks its mesh kinds with
    // (meshes carry no names, and every material is the same node-material class, so neither separates them).
    const label = (o) => { const k = o.userData ? Object.keys(o.userData).join(",") : ""; return k || (o.geometry && o.geometry.name) || "unflagged"; };
    r.renderObject = function (object) {
      if (!r.__passCensus.on || !r.__passCensus.byObject) return origRO.apply(this, arguments);
      const i = r.info.render, c0 = i.drawCalls | 0, t0 = i.triangles | 0;
      const out = origRO.apply(this, arguments);
      const c1 = i.drawCalls | 0, t1 = i.triangles | 0;
      objRows.push([curKey, label(object) + (object.isInstancedMesh ? " [inst]" : ""), c1 >= c0 ? c1 - c0 : c1, t1 >= t0 ? t1 - t0 : t1]);
      return out;
    };
  }
  r.render = function (scene, camera) {
    r.__passCensus.seen++;   // every top-level render() call, measured or not: the readiness signal on software WebGPU
    const i = r.info.render, c0 = i.drawCalls | 0, t0 = i.triangles | 0;
    { const t = r.getRenderTarget && r.getRenderTarget(); curKey = t ? ((t.texture && t.texture.name) || t.name || "rt") + " " + t.width + "x" + t.height : "canvas"; }
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
  const browser = await launchChromium((WEBGPU ? { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new", "--disable-background-timer-throttling"], env: { ...process.env, ...WEBGPU_LAVAPE_ENV } } : { args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"] }));
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(initScript, { stub: !REAL_LINK, mobile: MOBILE, webgpu: WEBGPU, ls: LS });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    // TLX exposes window.renderer / GLX.__tlx only behind this flag (tools/lib/mem-census.mjs reads it too).
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1");
    await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { timeout: WAIT_MS, polling: 100 });
    await page.evaluate((t) => { window.__apex.race(t); }, track);
    await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: WAIT_MS, polling: 100 });
    // --park also holds the governor's tier and the render scale HERE, before the warm (#5451): pinned only at the park
    // block below, a governor step during the warm had already been taken (monza helmet mobile: textures 40 vs 39 at
    // memoryStart on two boots of one tree). The park block's own pin stays as a no-op re-assertion.
    // --park freezes the sim in the SAME task that starts the race and places the car: the field is still on the grid
    // and nothing has stepped. Driving the warm first (as the unparked census does) left the field and the mesh pool
    // wherever that boot's frame times put them, and two boots then disagreed (monza, 2026-11-11: main 143067 vs
    // 143139 triangles, mirror 23 vs 21 calls).
    await page.evaluate(({ cam, park, at }) => { const A = window.__apex; A.go(); if (park) { A.govHold(true); A.renderScale(1); } A.jump(park ? at : 0.1, park ? 0 : 55, 0); if (cam && A.camera) A.camera(cam); if (park) A.freeze(true); }, { cam: CAMERA, park: PARK, at: PARK_AT });
    const ok = await page.waitForFunction(() => !!window.renderer, null, { timeout: WAIT_MS, polling: 100 }).then(() => true, () => false);
    if (!ok) throw new Error("window.renderer never appeared: this tool measures TLX (backend three) behind ?three-devtools=1");
    const backend = await page.evaluate(() => { const b = window.renderer.backend; return { api: b && b.isWebGPUBackend ? "webgpu" : "webgl2", forceWebGL: !(b && b.isWebGPUBackend) }; });
    await page.evaluate(async ({ warm, park }) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < warm; i++) { if (!park) A.setInput({ throttle: true, steer: 0.35 * Math.sin(i / 25) }); await raf(); }
    }, { warm: WARM, park: PARK });
    // Parked, the warm and the window are counted in PRESENTED frames (tlx.js's own counter), not rAF ticks: on a
    // software adapter rAF runs far ahead of presents (docs/notes/PERF-CENSUS-WEBGPU-2026-11-04.md run 13), and a
    // window of too few presents would miss a pass that runs every Nth frame, which reads as a baseline diff.
    if (PARK) {
      const warmed = await page.evaluate(async (want) => {
        const P = () => { try { return window.GLX.__tlx.backendState().presents | 0; } catch (_) { return -1; } };
        const p0 = P(), end = performance.now() + 180000;
        while (p0 >= 0 && P() - p0 < want && performance.now() < end) await new Promise((r) => requestAnimationFrame(r));
        return p0 < 0 ? null : P() - p0;
      }, WARM);
      if (warmed == null || warmed < WARM) console.error(`park: ${warmed == null ? "no present counter" : "only " + warmed + " frames presented"} in the warm (wanted ${WARM})`);
    }
    const camStill = (PARK || Object.keys(TUNES).length) ? await page.evaluate(async ({ park, tunes, at }) => {
      const A = window.__apex;
      if (park) { A.govHold(true); A.renderScale(1); A.jump(at, 0, 0); A.snapCam(); A.freeze(true); }
      if (Object.keys(tunes).length) A.lightTune(tunes);
      for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
      if (!park || !A.cameraState) return null;
      // snapCam() does not stop the chase rig: its eye kept easing for 40+ frames on a frozen car (monza, 2026-11-11),
      // and the road chunks culled against it flickered between 54 and 55 calls. Wait until eye, target and fov are
      // bit-identical on 3 consecutive frames, so the window measures ONE view.
      const pose = () => { try { const c = A.cameraState(); return JSON.stringify([c.eye, c.target, c.fov]); } catch (_) { return null; } };
      let last = pose(), same = 0, ticks = 0;
      const end = performance.now() + 120000;
      while (same < 3 && ticks < 3000 && performance.now() < end) {
        await new Promise(r => requestAnimationFrame(r)); ticks++;
        const now = pose();
        same = now != null && now === last ? same + 1 : 0; last = now;
      }
      return { still: same >= 3, ticks };
    }, { park: PARK, tunes: TUNES, at: PARK_AT }) : null;
    if (PARK && camStill && !camStill.still) console.error(`park: the camera never came to rest (${camStill.ticks} frames); this cell is not one view`);
    await page.evaluate(installWrap);
    // Software WebGPU compiles pipelines lazily, so frames can lag the rAF count far behind. Measure only once
    // three itself reports frames advancing, else the window records nothing.
    if (WEBGPU) {
      const advanced = await page.waitForFunction(() => {
        const pc = window.renderer.__passCensus;
        if (!pc) return false;
        if (pc.seen0 == null) pc.seen0 = pc.seen;
        return pc.seen >= pc.seen0 + 5;
      }, null, { timeout: 180000, polling: 500 }).then(() => true, () => false);
      if (!advanced) console.error("webgpu: renderer.render() was not called 5 times within 180s of the wrap");
    }
    // three's memory counters (tlx.js memState().resources) at both ends of the window: flat on a parked frame.
    const memory = () => page.evaluate(() => { try { return window.GLX.__tlx.memState().resources || null; } catch (_) { return null; } });
    const mem0 = PARK ? await memory() : null;
    const rows = await page.evaluate(async ({ n, by, park }) => {
      const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
      const r = window.renderer, pc = r.__passCensus;
      const P = () => { try { return window.GLX.__tlx.backendState().presents | 0; } catch (_) { return -1; } };
      pc.rows.length = 0; pc.objRows.length = 0; pc.byObject = by; pc.on = true;
      let frames = 0;
      const p0 = park ? P() : -1, end = performance.now() + 180000;
      // Parked: until n frames were PRESENTED (see the warm above); driven: n rAF ticks, as before.
      for (let i = 0; p0 >= 0 ? (P() - p0 < n && performance.now() < end) : i < n; i++) { if (!A.freeze()) A.setInput({ throttle: true, steer: 0.35 * Math.sin((i + 200) / 25) }); await raf(); frames++; }
      pc.on = false; A.clearInput();
      return { frames: p0 >= 0 ? P() - p0 : frames, ticks: frames, rows: pc.rows.slice(), objRows: pc.objRows.slice() };
    }, { n: FRAMES, by: BY_OBJECT, park: PARK });
    const mem1 = PARK ? await memory() : null;
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
    console.log(`pass-census ${track} (${FRAMES} frames, ${WEBGPU ? "webgpu" : REAL_LINK ? "real" : "stubbed"} links)`);
    console.log("pass".padEnd(34) + "ran/frame  calls/render  tris/render  calls/frame  tris/frame");
    for (const e of table) {
      console.log(e.pass.padEnd(34) + String(e.perFrameRan).padStart(9) + String(e.callsPerRender).padStart(14) + String(e.trisPerRender).padStart(13) + String(e.callsPerFrame).padStart(13) + String(e.trisPerFrame).padStart(12));
    }
    let byObj = [];
    if (BY_OBJECT) {
      const m = new Map();
      for (const [pass, lab, calls, tris] of rows.objRows) { const k = pass + " | " + lab; const e = m.get(k) || { pass, group: lab, draws: 0, calls: 0, tris: 0 }; e.draws++; e.calls += calls; e.tris += tris; m.set(k, e); }
      byObj = [...m.values()].map((e) => ({ pass: e.pass, group: e.group, callsPerFrame: +(e.calls / rows.frames).toFixed(1), trisPerFrame: Math.round(e.tris / rows.frames) })).sort((a, b) => b.trisPerFrame - a.trisPerFrame);
      console.log("\nby object group (pass | group)".padEnd(58) + "calls/frame  tris/frame");
      for (const e of byObj.slice(0, 24)) console.log((e.pass + " | " + e.group).slice(0, 56).padEnd(58) + String(e.callsPerFrame).padStart(11) + String(e.trisPerFrame).padStart(12));
      if (!byObj.length) console.log("(no renderObject calls seen: this three build does not expose renderer.renderObject)");
    }
    const summary = { track, frames: rows.frames, backend: backend.api, forceWebGL: backend.forceWebGL,
      stubbedLinks: !REAL_LINK && !WEBGPU, requestedWebgpu: WEBGPU, skipBatches: WEBGPU ? true : undefined, mobileTier: MOBILE, parked: PARK, tunes: TUNES,
      callsPerFrame: +total.calls.toFixed(1), trisPerFrame: total.tris, pageErrors: errors.length };
    if (PARK) {
      // The exact cell: per pass the [min, max] counts per render (a parked pass draws the same thing each time it
      // runs), never the per-frame mean, which carries the pass's cadence.
      const passes = parkPasses(rows.rows), cell = baselineCell(passes, mem1);
      const key = parkKey({ track, camera: CAMERA, mobile: MOBILE, backend: backend.api + (WEBGPU ? "" : REAL_LINK ? "" : "-stubbed"), at: PARK_AT });
      const ubo = uboFlat(mem0, mem1);
      let baseline = null;
      if (BASELINE && existsSync(BASELINE)) baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
      const cmp = BASELINE ? compareParkBaseline(baseline, key, cell) : { status: "not-asked", diffs: [] };
      console.log(`\npark ${key}`);
      console.log("pass".padEnd(34) + "renders   calls/render [min,max]   tris/render [min,max]");
      for (const k of Object.keys(passes).sort()) console.log(k.padEnd(34) + String(passes[k].renders).padStart(7) + ("   " + JSON.stringify(passes[k].calls)).padEnd(27) + JSON.stringify(passes[k].tris));
      console.log("memory " + JSON.stringify(cell.memory) + " reported " + JSON.stringify(Object.fromEntries(PARK_MEMORY_REPORTED.map((k) => [k, mem1 ? mem1[k] : null]))) + (ubo.length ? "   <- UNIFORM BUFFERS NOT FLAT: " + ubo.join("; ") : "   (uniform buffers flat over the window)"));
      console.log("baseline " + (BASELINE || "(none asked)") + ": " + cmp.status);
      for (const d of cmp.diffs) console.error("  " + d);
      summary.park = { key, at: PARK_AT, ls: LS, camera: camStill, cell, renders: Object.fromEntries(Object.keys(passes).map((k) => [k, passes[k].renders])), memoryStart: mem0, memoryEnd: mem1, uboFlat: ubo.length === 0, uboFails: ubo, baseline: cmp };
      if (ubo.length || cmp.status === "diff" || cmp.status === "no-cell" || (camStill && !camStill.still)) process.exitCode = 1;
    } else if (Object.keys(LS).length) summary.ls = LS;
    console.log("= pass-census " + JSON.stringify(summary));
    if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify({ summary, table, byObject: byObj, errors }, null, 2)); }
    if (WEBGPU && backend.api !== "webgpu") { console.error("--webgpu asked for the WebGPU backend but three fell back to " + backend.api); process.exitCode = 1; }
    if (!table.length) {
      const diag = await page.evaluate(() => { const r = window.renderer; return { frame: r && r.info.render.frame, calls: r && r.info.render.calls, seen: r && r.__passCensus ? r.__passCensus.seen : null, state: (() => { try { return window.__apex.info(); } catch (e) { return String(e); } })(), wrapped: !!(r && r.__passCensus), recorded: r && r.__passCensus ? r.__passCensus.rows.length : null, rafHz: null }; }).catch((e) => ({ error: String(e) }));
      console.error("no render() calls recorded; diag " + JSON.stringify(diag).slice(0, 1500));
      process.exitCode = 1;
    }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }
}

main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
