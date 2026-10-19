#!/usr/bin/env node
// mesh-census.mjs — triangles submitted per pass (main vs mirror), by distance
// band (<150 m / ≥150 m) and source (ribbon vs props), for GLX and TLX.
// @doc Mesh census (#2657/#2631): main/mirror tris by distance band and source.
// @skill playwright-probe / renderer-debug
//
// Measure-first, no js/render edits. Wraps renderer / GL prototypes from the
// outside the way tools/gfx/pass-census.mjs (2026-10-17) did. Shadow / env /
// post passes are recorded separately and never presented as the main scene
// (#2631 measurement contract).
//
//   node tools/perf/mesh-census.mjs [track=monaco] [--backend tlx|glx|both]
//        [--frames 40] [--warm 30] [--tracks monaco,monza,spa] [--all]
//        [--real-link] [--mobile] [--json PATH] [--md PATH]
//
// Output: per-circuit tables on stdout, `= mesh-census {…}` summary JSON, and
// optional --json / --md artifacts. Aggregation helpers: mesh-census-lib.mjs.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { startStaticServer, launchChromium, shutdown } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import {
  aggregateRows, tableRows, formatBandTable, recommend,
} from "./mesh-census-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/perf/mesh-census.mjs [track] [--backend tlx|glx|both] [--frames N] [--warm N]
                    [--tracks a,b,c] [--all] [--real-link] [--mobile] [--json PATH] [--md PATH]
  Triangles submitted per pass (main/mirror), by distance band (<150 m / ≥150 m) and
  source (ribbon vs props), at the chase camera. TLX also records draw calls,
  renderer.info and culled/total chunk split. No renderer source edits.`);

function flag(name, dflt) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return dflt;
}
const VALUED = new Set(["--backend", "--frames", "--warm", "--tracks", "--json", "--md"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const FRAMES = Math.max(8, +flag("--frames", 40) || 40);
const WARM = Math.max(0, +flag("--warm", 30) || 30);
const REAL_LINK = argv.includes("--real-link");
const MOBILE = argv.includes("--mobile");
const BACKEND = (flag("--backend", "both") || "both").toLowerCase();
const JSON_OUT = flag("--json", null);
const MD_OUT = flag("--md", null);
const WAIT_MS = Math.max(90000, +process.env.APEX_PROFILE_WAIT_MS || 90000);
const BAND_M = 150;

function allCircuitIds() {
  try {
    const m = require("../manifest.cjs");
    return (m.CIRCUITS || []).slice();
  } catch {
    return ["monaco", "monza", "spa"];
  }
}

let tracks;
if (argv.includes("--all")) tracks = allCircuitIds();
else if (flag("--tracks", null)) tracks = flag("--tracks").split(",").map((s) => s.trim()).filter(Boolean);
else tracks = [positional[0] || "monaco"];

const backends = BACKEND === "both" ? ["tlx", "glx"] : [BACKEND];
if (!backends.every((b) => b === "tlx" || b === "glx")) {
  console.error("backend must be tlx, glx, or both");
  process.exit(2);
}

/** Init script: pick backend, stub TLX program links (SwiftShader speed). */
function initScript({ backend, stub, mobile }) {
  try {
    if (mobile) localStorage.setItem("apex26.forceMobileTier", "1");
    if (backend === "tlx") {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } else {
      localStorage.setItem("apex26.gfxBackend", "glx");
    }
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
    sessionStorage.setItem("apex26.wgxCapture", "0");
  } catch (_) { /* blocked storage */ }
  window.__TEST_MODE = true;
  if (!(backend === "tlx" && stub)) return;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    P.linkProgram = function () {};
    P.compileShader = function () {};
    P.validateProgram = function () {};
    const gp = P.getProgramParameter, gs = P.getShaderParameter;
    P.getProgramParameter = function (p, k) {
      return k === this.LINK_STATUS || k === this.VALIDATE_STATUS || k === this.COMPLETION_STATUS_KHR
        ? true : gp.call(this, p, k);
    };
    P.getShaderParameter = function (s, k) {
      return k === this.COMPILE_STATUS ? true : gs.call(this, s, k);
    };
    P.getProgramInfoLog = function () { return ""; };
    P.getShaderInfoLog = function () { return ""; };
  }
}

/** TLX: wrap renderer.render + renderObject; attribute tris by pass/source/distance. */
function installTlxWrap(bandM) {
  const r = window.renderer;
  if (!r || r.__meshCensus) return !!r;
  const rows = [];
  const orig = r.render.bind(r);
  const state = { rows, on: false, curPass: "main", cam: null, frames: 0,
    chunkDrawn: 0, chunkTotal: 0, infoSamples: [], passKeys: Object.create(null) };
  r.__meshCensus = state;
  // three.getWorldPosition requires a Vector3 (plain {x,y,z} silently fails).
  const THREE = window.THREE;
  const _wp = THREE && THREE.Vector3 ? new THREE.Vector3() : null;

  const labelOf = (o) => {
    const ud = o.userData || {};
    const keys = Object.keys(ud).filter((k) => ud[k]).join(",");
    return keys || (o.geometry && o.geometry.name) || (o.isInstancedMesh ? "inst" : "unflagged");
  };
  const isChunk = (o) => {
    const ud = o.userData || {};
    return !!(ud.tlxLgRoad || ud.tlxChunked || o.__tlxChunk
      || (o.geometry && o.geometry.userData && o.geometry.userData.tlxChunked));
  };
  const sourceOf = (lab) => {
    const s = String(lab).toLowerCase();
    if (/\btlxlgroad\b|\broad\b|\bterrain\b|\bkerb\b|\bribbon\b/.test(s)) return "ribbon";
    if (/\btlxbatch\b|\binst\b|\bbatch\b|\bprops?\b|\bscenery\b|\bquad\b/.test(s)) return "props";
    return "other";
  };

  // Keep in lockstep with tools/perf/mesh-census-lib.mjs classifyPass.
  const passOf = (key) => {
    const k = String(key || "").toLowerCase();
    if (!k || k === "canvas") return "main";
    if (/mirror|rear|hud-mirror|pip/.test(k)) return "mirror";
    if (/shadow|depth|sunshadow|carshadow|lampshadow/.test(k)) return "shadow";
    if (/env|cube|probe|post|bloom|ssao|fxaa|sgsr|composite|godray/.test(k)) return "aux";
    const dim = k.match(/(\d+)\s*x\s*(\d+)/);
    if (dim) {
      const w = +dim[1], h = +dim[2];
      if (w === h && (w === 256 || w === 512 || w === 1024 || w === 2048)) return "shadow";
      if (h <= 160 && w / Math.max(1, h) >= 2.2) return "mirror";
      if (w * h >= 80_000) return "main";
    }
    if (/output|scene|hdr|color|main/.test(k)) return "main";
    return "aux";
  };

  if (typeof r.renderObject === "function") {
    const origRO = r.renderObject.bind(r);
    r.renderObject = function (object) {
      if (!state.on) return origRO.apply(this, arguments);
      const pass = state.curPass;
      if (pass === "shadow" || pass === "aux") return origRO.apply(this, arguments);
      const i = r.info.render, c0 = i.drawCalls | 0, t0 = i.triangles | 0;
      const out = origRO.apply(this, arguments);
      const c1 = i.drawCalls | 0, t1 = i.triangles | 0;
      const calls = c1 >= c0 ? c1 - c0 : c1;
      const tris = t1 >= t0 ? t1 - t0 : t1;
      if (!tris && !calls) return out;
      const lab = labelOf(object) + (object.isInstancedMesh ? ",inst" : "");
      let dist = NaN;
      try {
        const cam = state.cam || r.__meshCensusCam;
        if (cam && object.getWorldPosition && _wp) {
          object.getWorldPosition(_wp);
          dist = cam.position.distanceTo(_wp);
        } else if (cam && object.position && cam.position) {
          dist = cam.position.distanceTo(object.position);
        }
      } catch (_) { /* no world matrix yet */ }
      const band = Number.isFinite(dist) ? (dist < bandM ? "near" : "far") : "unknown";
      let source = sourceOf(lab);
      if (source === "other" && isChunk(object)) source = "ribbon";
      // Chunked road often lands as unflagged in renderObject; large indexed
      // BufferGeometry draws without instancing are the ribbon path.
      if (source === "other" && object.geometry && object.geometry.index
          && !object.isInstancedMesh && (tris | 0) >= 500) source = "ribbon";
      rows.push({ pass, source, band, draws: 1, tris, calls, dist, group: lab });
      if (pass === "main" && (isChunk(object) || source === "ribbon")) {
        state._drawnChunkIds.add(object.uuid || object.id);
      }
      return out;
    };
  }

  r.render = function (scene, camera) {
    const t = r.getRenderTarget && r.getRenderTarget();
    const key = t
      ? ((t.texture && t.texture.name) || t.name || "rt") + " " + t.width + "x" + t.height
      : "canvas";
    state.curPass = passOf(key);
    state.passKeys[key] = (state.passKeys[key] || 0) + 1;
    state.cam = camera || state.cam;
    r.__meshCensusCam = state.cam;
    const i = r.info.render, c0 = i.drawCalls | 0, t0 = i.triangles | 0;
    if (state.on && state.curPass === "main") {
      state._drawnChunkIds = state._drawnChunkIds || new Set();
    }
    const out = orig(scene, camera);
    if (state.on) {
      const c1 = i.drawCalls | 0, t1 = i.triangles | 0;
      const calls = c1 >= c0 ? c1 - c0 : c1;
      const tris = t1 >= t0 ? t1 - t0 : t1;
      state.infoSamples.push({
        pass: state.curPass, passKey: key,
        calls, tris,
        memory: r.info.memory ? { geometries: r.info.memory.geometries, textures: r.info.memory.textures } : null,
      });
      if (state.curPass === "main" && scene && typeof scene.traverse === "function") {
        let total = 0;
        scene.traverse((o) => {
          if (!o.isMesh && !o.isInstancedMesh) return;
          if (isChunk(o) || (o.userData && o.userData.tlxLgRoad) || (o.visible && o.geometry && o.geometry.index && !o.isInstancedMesh)) {
            total++;
          }
        });
        const drawn = (state._drawnChunkIds && state._drawnChunkIds.size) || 0;
        state.chunkTotal += total;
        state.chunkDrawn += drawn;
        state._drawnChunkIds = new Set();
        state.frames++;
      }
    }
    return out;
  };
  return true;
}

/** GLX: wrap draw*; pass from the DRAW stack (not bindFramebuffer — that mis-tags main as mirror). */
function installGlxWrap(bandM) {
  const canvas = document.getElementById("game");
  const gl = canvas && canvas.getContext("webgl2");
  if (!gl || gl.__meshCensus) return !!gl;
  const state = {
    rows: [], on: false, curPass: "main", fboName: "canvas",
    eye: null, frames: 0, infoSamples: [], passKeys: Object.create(null),
  };
  gl.__meshCensus = state;

  const passOfStack = (stack) => {
    const s = String(stack || "").toLowerCase();
    if (/mirror-pass|mirrorbegin|mirrorend|\/mirror[\./]|drawmirror/i.test(s)) return "mirror";
    if (/shadowbegin|castshadow|shadowend|shadow\.js|sunshadow|carshadow/i.test(s)) return "shadow";
    if (/envface|envprobe|post\.js|bloom|ssao|fxaa|sgsr|composite|godray/i.test(s)) return "aux";
    return "main";
  };
  const sourceOfStack = (stack) => {
    const s = String(stack || "").toLowerCase();
    if (/chunked\.js|\/road|terrain|kerb|ribbon|trk/.test(s)) return "ribbon";
    if (/props|scenery|instance|batch|nature|structures/.test(s)) return "props";
    return "other";
  };

  const wrapDraw = (name, countIdx) => {
    const orig = gl[name].bind(gl);
    gl[name] = function (...args) {
      if (!state.on) return orig.apply(this, args);
      const st = (new Error()).stack || "";
      const pass = passOfStack(st);
      if (pass === "shadow" || pass === "aux") return orig.apply(this, args);
      const count = args[countIdx] | 0;
      const inst = name.includes("Instanced") ? (args[countIdx + 1] | 0) || 1 : 1;
      const mode = args[0];
      const tris = (mode === gl.TRIANGLES || mode === 4) ? Math.floor((count * inst) / 3) : 0;
      const source = sourceOfStack(st);
      const band = "unknown";
      const passKey = pass + ":" + name;
      state.passKeys[passKey] = (state.passKeys[passKey] || 0) + 1;
      state.rows.push({ pass, source, band, draws: 1, tris, calls: 1, group: name + ":" + source });
      state.infoSamples.push({ pass, passKey, calls: 1, tris });
      return orig.apply(this, args);
    };
  };
  wrapDraw("drawElements", 2);
  wrapDraw("drawArrays", 2);
  if (gl.drawElementsInstanced) wrapDraw("drawElementsInstanced", 2);
  if (gl.drawArraysInstanced) wrapDraw("drawArraysInstanced", 2);
  if (typeof gl.multiDrawElementsWEBGL === "function") {
    const orig = gl.multiDrawElementsWEBGL.bind(gl);
    gl.multiDrawElementsWEBGL = function (mode, counts, countsOffset, type, offsets, offsetsOffset, drawCount) {
      if (!state.on) return orig.apply(this, arguments);
      const st = (new Error()).stack || "";
      const pass = passOfStack(st);
      if (pass !== "shadow" && pass !== "aux") {
        let tris = 0;
        const n = drawCount | 0;
        if (counts && counts.length) {
          for (let i = 0; i < n; i++) tris += Math.floor(((counts[countsOffset + i] | 0)) / 3);
        }
        const source = sourceOfStack(st);
        state.rows.push({
          pass, source, band: "unknown",
          draws: n, tris, calls: 1, group: "multiDraw:" + source,
        });
        state.infoSamples.push({ pass, passKey: "multiDraw", calls: 1, tris });
      }
      return orig.apply(this, arguments);
    };
  }
  void bandM;
  return true;
}

async function runOne(page, track, backend) {
  await page.evaluate((t) => { window.__apex.race(t); }, track);
  await page.waitForFunction((t) => {
    try { return window.__apex.info().track === t; } catch { return false; }
  }, track, { timeout: WAIT_MS, polling: 100 });
  await page.evaluate(() => {
    const A = window.__apex;
    A.go();
    A.jump(0.1, 55, 0);
    if (A.camera) A.camera("chase");
    A.govHold && A.govHold(true);
    A.renderScale && A.renderScale(1);
    A.snapCam && A.snapCam();
    // Do NOT freeze: freeze stalls MirrorPass and yields mirror=0 (pass-census drives).
  });
  // Ensure mirror is on so the mirror pass runs; settle one frame for shown/rect.
  await page.evaluate(async () => {
    try { if (window.__apex.mirror) window.__apex.mirror("on"); } catch (_) { /* no mirror hook */ }
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  });
  await page.evaluate(async (warm) => {
    const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < warm; i++) { A.setInput({ throttle: true, steer: 0.2 * Math.sin(i / 20) }); await raf(); }
    A.clearInput && A.clearInput();
  }, WARM);

  if (backend === "tlx") {
    const ok = await page.waitForFunction(() => !!window.renderer, null, { timeout: WAIT_MS, polling: 100 })
      .then(() => true, () => false);
    if (!ok) throw new Error("TLX: window.renderer missing (need ?three-devtools=1)");
    await page.evaluate(installTlxWrap, BAND_M);
  } else {
    await page.evaluate(installGlxWrap, BAND_M);
  }

  const captured = await page.evaluate(async ({ n, backend, bandM }) => {
    const A = window.__apex, raf = () => new Promise((r) => requestAnimationFrame(r));
    const state = backend === "tlx" ? window.renderer.__meshCensus : document.getElementById("game").getContext("webgl2").__meshCensus;
    state.rows.length = 0;
    state.infoSamples.length = 0;
    state.on = true;
    state.frames = 0;
    state.chunkDrawn = 0;
    state.chunkTotal = 0;
    for (let i = 0; i < n; i++) {
      A.setInput({ throttle: true, steer: 0.15 * Math.sin((i + 50) / 20) });
      await raf();
    }
    state.on = false;
    A.clearInput && A.clearInput();
    let rendererInfo = null;
    if (backend === "tlx" && window.renderer && window.renderer.info) {
      const inf = window.renderer.info;
      rendererInfo = {
        render: { ...(inf.render || {}) },
        memory: inf.memory ? { ...(inf.memory) } : null,
      };
    }
    let multiDraw = null, occlusion = null;
    try { multiDraw = A.multiDraw ? A.multiDraw() : null; } catch (_) { /* */ }
    try { occlusion = A.occlusionCull ? A.occlusionCull() : null; } catch (_) { /* */ }
    // GLX distance oracle (build-side) — complements unknown bands on the GL wrap.
    let oracle = null;
    if (backend === "glx") {
      try {
        // inline of glxDistanceOracle (page has no import)
        const info = A.info ? A.info() : {};
        void info;
        const f = A.fieldState && A.fieldState();
        const me = Array.isArray(f) && f.find((c) => c.isPlayer);
        const track = window.G && window.G.track;
        const props = track && track.meshes && track.meshes.props;
        const geo = props && (props.__cap || props);
        if (me && geo && geo.pos && geo.idx) {
          const ex = me.x, ey = (me.y || 0) + 1.2, ez = me.z;
          const CELL = 72;
          const bins = new Map();
          const pos = geo.pos, idx = geo.idx;
          for (let t = 0; t < idx.length; t += 3) {
            const a = idx[t], b = idx[t + 1], c = idx[t + 2];
            const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3;
            const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
            const key = (Math.floor(cx / CELL) + 1024) * 4096 + (Math.floor(cz / CELL) + 1024);
            let bk = bins.get(key);
            if (!bk) bins.set(key, bk = { cx: 0, cy: 0, cz: 0, n: 0, tris: 0 });
            bk.cx += cx; bk.cz += cz;
            bk.cy += (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
            bk.n++; bk.tris++;
          }
          let near = 0, far = 0;
          for (const bk of bins.values()) {
            const x = bk.cx / bk.n, y = bk.cy / bk.n, z = bk.cz / bk.n;
            const d = Math.hypot(x - ex, y - ey, z - ez);
            if (d < bandM) near += bk.tris; else far += bk.tris;
          }
          oracle = { propsNearTris: near, propsFarTris: far, chunks: bins.size, note: "build-oracle" };
        }
      } catch (e) { oracle = { err: String(e && e.message || e) }; }
    }
    const frames = Math.max(1, state.frames || n);
    let mirrorState = null;
    try { mirrorState = A.mirror ? A.mirror() : null; } catch (_) { /* */ }
    return {
      rows: state.rows.slice(),
      infoSamples: state.infoSamples.slice(),
      passKeys: state.passKeys || {},
      frames,
      chunkDrawn: state.chunkDrawn,
      chunkTotal: state.chunkTotal,
      rendererInfo,
      multiDraw,
      occlusion,
      oracle,
      mirrorState,
      backendLive: (A.info && A.info().gfx) || null,
    };
  }, { n: FRAMES, backend, bandM: BAND_M });

  const agg = aggregateRows(captured.rows, { threshold: BAND_M });
  const bandTable = tableRows(agg, FRAMES);
  // Pass-level means from infoSamples (TLX renderer.info deltas / GLX draw wrap).
  const passInfo = { main: { calls: 0, tris: 0, n: 0 }, mirror: { calls: 0, tris: 0, n: 0 } };
  for (const s of captured.infoSamples) {
    if (s.pass !== "main" && s.pass !== "mirror") continue;
    passInfo[s.pass].calls += s.calls || 0;
    passInfo[s.pass].tris += s.tris || 0;
    passInfo[s.pass].n++;
  }
  const mainCalls = passInfo.main.n ? passInfo.main.calls / Math.max(1, FRAMES) : 0;
  const mirrorCalls = passInfo.mirror.n ? passInfo.mirror.calls / Math.max(1, FRAMES) : 0;
  const mainTris = passInfo.main.n ? Math.round(passInfo.main.tris / Math.max(1, FRAMES)) : (agg.passTotals.main ? Math.round(agg.passTotals.main.tris / FRAMES) : 0);
  const mirrorTris = passInfo.mirror.n ? Math.round(passInfo.mirror.tris / Math.max(1, FRAMES)) : (agg.passTotals.mirror ? Math.round(agg.passTotals.mirror.tris / FRAMES) : 0);

  const cell = (pass, source, band) => {
    const c = agg.by[pass] && agg.by[pass][source] && agg.by[pass][source][band];
    return c ? Math.round(c.tris / FRAMES) : 0;
  };
  const chunkFrames = Math.max(1, captured.frames || FRAMES);
  const visibleChunks = captured.chunkTotal ? +(captured.chunkDrawn / chunkFrames).toFixed(1) : null;
  const totalChunks = captured.chunkTotal ? +(captured.chunkTotal / chunkFrames).toFixed(1) : null;
  const culledChunks = (visibleChunks != null && totalChunks != null)
    ? +(Math.max(0, totalChunks - visibleChunks)).toFixed(1) : null;

  const rec = recommend({
    mainRibbonNear: cell("main", "ribbon", "near"),
    mainRibbonFar: cell("main", "ribbon", "far"),
    mirrorRibbon: cell("mirror", "ribbon", "near") + cell("mirror", "ribbon", "far") + cell("mirror", "ribbon", "unknown"),
    mainPropsFar: cell("main", "props", "far"),
    mainTris, mirrorTris,
    culledChunks: culledChunks || 0,
    totalChunks: totalChunks || 0,
    mainCalls, mirrorCalls,
  });

  return {
    track, backend, frames: FRAMES, warm: WARM, bandM: BAND_M,
    stubbedLinks: backend === "tlx" && !REAL_LINK,
    mobileTier: MOBILE,
    bandTable,
    passInfo: {
      main: { callsPerFrame: +mainCalls.toFixed(1), trisPerFrame: mainTris },
      mirror: { callsPerFrame: +mirrorCalls.toFixed(1), trisPerFrame: mirrorTris },
    },
    passKeys: captured.passKeys || {},
    mirrorState: captured.mirrorState || null,
    chunks: backend === "tlx" ? {
      visiblePerFrame: visibleChunks,
      totalPerFrame: totalChunks,
      culledPerFrame: culledChunks,
    } : null,
    rendererInfo: captured.rendererInfo,
    glxOracle: captured.oracle,
    multiDraw: captured.multiDraw,
    recommendation: rec,
  };
}

async function main() {
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"],
  });
  const results = [];
  const errors = [];
  try {
    for (const backend of backends) {
      for (const track of tracks) {
        process.stderr.write(`mesh-census ${backend} ${track}…\n`);
        const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
        await ctx.addInitScript(initScript, { backend, stub: !REAL_LINK, mobile: MOBILE });
        const page = await ctx.newPage();
        page.on("pageerror", (e) => errors.push(`${backend}/${track}: ${String(e).slice(0, 180)}`));
        const q = backend === "tlx" ? "three-devtools=1" : "gfx=glx";
        await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + q);
        await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, {
          timeout: WAIT_MS, polling: 100,
        });
        try {
          const one = await runOne(page, track, backend);
          results.push(one);
          console.log(`\n# ${backend.toUpperCase()} ${track} (chase, ${FRAMES} frames, band ${BAND_M} m)`);
          console.log(formatBandTable(one.bandTable));
          console.log(`pass totals: main ${one.passInfo.main.callsPerFrame} calls / ${one.passInfo.main.trisPerFrame} tris; ` +
            `mirror ${one.passInfo.mirror.callsPerFrame} calls / ${one.passInfo.mirror.trisPerFrame} tris`);
          if (one.passKeys) console.log("passKeys:", JSON.stringify(one.passKeys));
          if (one.chunks) {
            console.log(`chunks (main): visible ${one.chunks.visiblePerFrame} / total ${one.chunks.totalPerFrame} (culled ${one.chunks.culledPerFrame})`);
          }
          if (one.glxOracle && !one.glxOracle.err) {
            console.log(`glx build-oracle props bins: near ${one.glxOracle.propsNearTris} far ${one.glxOracle.propsFarTris} chunks ${one.glxOracle.chunks}`);
          }
          console.log(`recommend: ${one.recommendation.summary}`);
        } catch (e) {
          errors.push(`${backend}/${track}: ${e && e.message || e}`);
          console.error(`FAIL ${backend}/${track}:`, e && e.stack || e);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await srv.close?.();
    shutdown();
  }

  const summary = {
    tracks, backends, frames: FRAMES, bandM: BAND_M,
    results: results.map((r) => ({
      track: r.track, backend: r.backend,
      passInfo: r.passInfo, chunks: r.chunks,
      recommendation: r.recommendation.summary,
      passFirst: r.recommendation.passFirst,
      lodPays: r.recommendation.lodPays,
    })),
    errors: errors.length, pageErrors: errors,
  };
  console.log("= mesh-census " + JSON.stringify(summary));

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify({ summary, results }, null, 2));
  }
  if (MD_OUT) {
    mkdirSync(dirname(MD_OUT), { recursive: true });
    writeFileSync(MD_OUT, buildMarkdown(results, summary));
  }
  if (!results.length) process.exitCode = 1;
}

function buildMarkdown(results, summary) {
  const lines = [
    "# Mesh census (main vs mirror × distance × source)",
    "",
    `Generated by \`tools/perf/mesh-census.mjs\` on ${new Date().toISOString().slice(0, 10)}.`,
    `Chase camera, ${summary.frames} measured frames, distance band ${summary.bandM} m.`,
    "Shadow/env/post passes excluded from the band tables (#2631: first-scene must not be a shadow scene).",
    "TLX forced onto three's WebGL2 path with stubbed program links under SwiftShader (same method as `tools/gfx/pass-census.mjs`).",
    "",
  ];
  for (const r of results) {
    lines.push(formatBandTable(r.bandTable, { title: `${r.backend.toUpperCase()} — ${r.track}` }), "");
    lines.push(`- Pass totals: main **${r.passInfo.main.callsPerFrame}** calls / **${r.passInfo.main.trisPerFrame}** tris; mirror **${r.passInfo.mirror.callsPerFrame}** / **${r.passInfo.mirror.trisPerFrame}**.`);
    if (r.chunks) {
      lines.push(`- Chunks (main, TLX): visible **${r.chunks.visiblePerFrame}** / total **${r.chunks.totalPerFrame}** (culled **${r.chunks.culledPerFrame}**).`);
    }
    if (r.glxOracle && !r.glxOracle.err) {
      lines.push(`- GLX build-oracle (props centroid bins, not submitted): near ${r.glxOracle.propsNearTris} / far ${r.glxOracle.propsFarTris} tris across ${r.glxOracle.chunks} bins.`);
    }
    lines.push(`- ${r.recommendation.summary}`);
    for (const e of r.recommendation.experiments) lines.push(`  - ${e}`);
    lines.push("");
  }
  // Fleet-level recommendation: majority vote on passFirst among TLX rows.
  const tlx = results.filter((r) => r.backend === "tlx");
  if (tlx.length) {
    const votes = { mirror: 0, "main-far": 0, none: 0 };
    for (const r of tlx) votes[r.recommendation.passFirst] = (votes[r.recommendation.passFirst] || 0) + 1;
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    lines.push("## Recommendation", "");
    lines.push(`Across ${tlx.length} TLX circuit(s), preferred first cut: **${best}**.`);
    lines.push("");
    lines.push(tlx[0].recommendation.summary);
    lines.push("");
    lines.push("### Which #2631 experiments are worth running");
    const seen = new Set();
    for (const r of tlx) {
      for (const e of r.recommendation.experiments) {
        if (seen.has(e)) continue;
        seen.add(e);
        lines.push(`- ${e}`);
      }
    }
    lines.push("");
  }
  lines.push("## Method caveats", "");
  lines.push("- Counts are exact submitted triangles / draw calls, never frame times (SwiftShader).");
  lines.push("- GLX per-object distance bands are `unknown` at the GL wrap; the build-oracle line is a centroid reach estimate, labelled as such.");
  lines.push("- TLX distance uses each draw's world-position distance to the active camera.");
  lines.push("- Mirror must be ON (`__apex.mirror(\"on\")`); lite-rung mobile tier optional via `--mobile`.");
  return lines.join("\n");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e && e.stack || e); shutdown(); process.exit(2); });
}
