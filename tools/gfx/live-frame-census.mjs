#!/usr/bin/env node
// live-frame-census.mjs — race frame time and stutter at the PHONE shape, on a real GPU (gpu-census leg `live-frame`).
// @doc Phone-shaped driven race per backend x track: frame/JS percentiles, GC, slow GL/WebGPU calls, mid-race pipelines.
// @skill mcp-probe
//
// One fresh browser per row (backend x track): 844x390 css x 1.5 (the mobile DPR cap) with touch, GRAPHICS
// MEDIUM (the phone default), WITHOUT apex26.forceMobileTier (it loses the WebGPU device on the paravirtual
// macos-latest runner: docs/notes/TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md §3). Backends: tlx-gl = three's WebGL2
// (what WebKit / an iPhone binds on AUTO, tlx.js), tlx-gpu = three's WebGPU (Android Chrome). The default helmet
// camera; the car DRIVES (gpu-game-check.mjs's closed-loop law) for --warm s, then a --win s window records:
//   frame  rAF interval p50/p95/p99/max, share over 33/50/100 ms; cpu = the game's rAF callback wall
//   spans  PerfSpans per phase; loaf = long-animation frames with their scripts
//   trace  --trace s of CDP tracing: GC pauses and merged per-thread toplevel busy (renderer main, GPU main, viz)
//   prof   --prof s V8 CPU profile: self time by function and by file
//   slow   every GL / WebGPU call over 20 ms (with a stack), program links and pipeline creations in the window,
//          and every three `createRenderPipeline` named (material, object, attributes, render target, gov tier)
// Absolute ms on macos-latest are its paravirtual present path, not a phone (TLX-GPU-COST note §2): read the rows
// for STRUCTURE — a synchronous call that blocks, a mid-race compile, a GC pause. Findings:
// docs/notes/LIVE-FRAME-H10-2026-10-20.md.
//
//   node tools/gfx/live-frame-census.mjs [--tracks monaco,spa] [--backends tlx-gl,tlx-gpu] [--cam helmet]
//        [--warm 8] [--win 40] [--trace 6] [--prof 12] [--ls "apex26.k=v ..."] [--json live-frame.json]
//        [--dsf 1.5] [--cpu-throttle 1] [--lab dpr3] [--sweep 3,2,1.5] [--step 6] [--row-cap 480] [--alloc 0] [--poke 'weather("rain")']
//
// Phone-cost options (phone perf hunt 2026-11-10, docs/notes/PHONE-PERF-MEASURE-2026-11-10.md):
//   --dsf N          the context's deviceScaleFactor (an iPhone is 3; the renderer's DPR cap decides what is drawn)
//   --cpu-throttle N CDP Emulation.setCPUThrottlingRate after the race gate: a phone-class main thread (4 or 6)
//   --sweep caps     after the window, with the governor's ladder held: for each DPR cap (DESCENDING, capDpr only
//                    lowers; boot the row with --lab dpr3 or dpr2 and --dsf >= it) x scale 1 / 0.75 / 0.5,
//                    --step s of frames: canvas px, rAF interval, callback wall, GPU timer ms. Frame ms against
//                    pixels on THIS adapter: the pixel-bound vs CPU-bound answer.
//   --alloc N        N s of V8's sampling heap profiler WITH collected objects kept (includeObjectsCollectedByMinorGC /
//                    ByMajorGC): bytes allocated per frame and the top allocating functions. Garbage by site.
//   --poke "expr"    after the window: run window.__apex.<expr> (e.g. 'weather("rain")') and record the next 12 s:
//                    frame intervals, pipelines and shader modules created, calls over 20 ms. A hitch at an event.
//   counts           every row reports createBuffer / createTexture / createBindGroup / writeBuffer / draw / pass
//                    per frame over the window (WebGPU), the top call stacks of each create*, and boot / race-entry wall.
// The request relay passes only `ls`, so the same options ride it as pseudo-keys: `lf.dsf=3 lf.sweep=3,2,1.5
// lf.cpuThrottle=4 lf.lab=dpr3 lf.step=6 lf.win=30` (stripped before the page's localStorage is seeded).
import { startStaticServer, launchChromium } from "../lib/harness.mjs";
import { gotoGame } from "../shot/probe-page.mjs";
import { raceGate } from "../lib/census-entry.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BACKENDS = ["tlx-gl", "tlx-gpu"];
export function parseArgs(argv) {
  const o = { tracks: ["monaco", "spa", "singapore"], backends: BACKENDS.slice(), cam: "helmet", warm: 8, win: 40, trace: 6, prof: 12, ls: [], json: "live-frame.json", dsf: 1.5, cpuThrottle: 1, sweep: [], step: 6, rowCap: 480, lab: "", poke: "", alloc: 0 };
  const labs = (v) => String(v || "").split(",").map((x) => x.trim()).filter((x) => /^[A-Za-z0-9]+$/.test(x)).join(",");
  const caps = (v) => String(v || "").split(",").map((x) => +x).filter((x) => x >= 1 && x <= 3).sort((a, b) => b - a);
  const num = (v, lo, hi) => { const n = +v; if (!Number.isFinite(n)) throw new Error("not a number: " + v); return Math.min(hi, Math.max(lo, n)); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--tracks") { o.tracks = String(v).split(",").map((s) => s.trim()).filter(Boolean); i++; }
    else if (a === "--backends") { o.backends = String(v).split(",").map((s) => s.trim()).filter((b) => BACKENDS.includes(b)); i++; }
    else if (a === "--cam") { o.cam = String(v); i++; }
    else if (a === "--warm") { o.warm = num(v, 0, 60); i++; }
    else if (a === "--win") { o.win = num(v, 10, 120); i++; }
    else if (a === "--trace") { o.trace = num(v, 0, 20); i++; }
    else if (a === "--prof") { o.prof = num(v, 0, 30); i++; }
    else if (a === "--ls") { o.ls = String(v || "").split(/\s+/).filter(Boolean).map((kv) => { const k = kv.indexOf("="); return k > 0 ? [kv.slice(0, k), kv.slice(k + 1)] : null; }).filter(Boolean); i++; }
    else if (a === "--json") { o.json = String(v); i++; }
    else if (a === "--dsf") { o.dsf = num(v, 1, 3); i++; }
    else if (a === "--cpu-throttle") { o.cpuThrottle = num(v, 1, 20); i++; }
    else if (a === "--sweep") { o.sweep = caps(v); i++; }
    else if (a === "--lab") { o.lab = labs(v); i++; }
    else if (a === "--alloc") { o.alloc = num(v, 0, 30); i++; }
    else if (a === "--poke") { o.poke = String(v || ""); i++; }
    else if (a === "--step") { o.step = num(v, 2, 30); i++; }
    else if (a === "--row-cap") { o.rowCap = num(v, 60, 1500); i++; }
    else throw new Error("unknown flag: " + a);
  }
  if (!o.backends.length) o.backends = BACKENDS.slice();
  // `lf.*` pseudo-keys in --ls are tool options (the request relay passes only `ls`); they never reach the page.
  for (const [k, v] of o.ls) {
    if (k === "lf.dsf") o.dsf = num(v, 1, 3); else if (k === "lf.cpuThrottle") o.cpuThrottle = num(v, 1, 20);
    else if (k === "lf.sweep") o.sweep = caps(v); else if (k === "lf.step") o.step = num(v, 2, 30);
    else if (k === "lf.win") o.win = num(v, 10, 120); else if (k === "lf.rowCap") o.rowCap = num(v, 60, 1500);
    else if (k === "lf.lab") o.lab = labs(v); else if (k === "lf.alloc") o.alloc = num(v, 0, 30);
  }
  o.ls = o.ls.filter(([k]) => !/^lf\./.test(k));
  // The window must hold the trace and the profile, which run back to back after a 4 s lead.
  o.win = Math.max(o.win, 4 + o.trace + o.prof + o.alloc);
  return o;
}

let TRACKS, CAM, WARM, WIN, TRACE, PROF, EXTRA, DSF = 1.5, THROTTLE = 1, SWEEP = [], STEP = 6, LAB = "", POKE = "", ALLOC = 0, report, save;
export const SWEEP_SCALES = [1, 0.75, 0.5];
/** The sweep's steps in run order: caps descending (capDpr only lowers), each at scale 1 / 0.75 / 0.5. */
export function sweepSteps(capList) { const out = []; for (const cap of capList) for (const scale of SWEEP_SCALES) out.push({ cap, scale }); return out; }
const log = (m) => console.log("[live-frame] " + m);

export function recorder() {
  // Wrap rAF: every callback's wall into __lf.cb (summed per frame), every frame's timestamp into __lf.ts.
  const r = window.requestAnimationFrame.bind(window);
  const H = window.__lf = { on: false, ts: [], cb: [], acc: 0, lastT: -1, raw: r };
  window.requestAnimationFrame = (f) => r((t) => {
    if (H.on && t !== H.lastT) { if (H.lastT >= 0) H.cb.push(H.acc); H.ts.push(t); H.acc = 0; H.lastT = t; }
    const a = performance.now();
    try { return f(t); } finally { if (H.on) H.acc += performance.now() - a; }
  });
}
export function driver() {
  // gpu-game-check.mjs's closed-loop law (braking envelope over scan(), pure pursuit on probe()), on the raw rAF.
  const raw = window.requestAnimationFrame.bind(window);
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, A_LAT = 13, A_BRAKE = 24, KP = 2.4;
  let on = false, prev = 0, hold = 30, stalled = 0, lastProg = null, lastS = null;
  const D = window.__lfDrive = { frames: 0, dist: 0, off: 0, err: null, start() { on = true; prev = 0; raw(tick); }, stop() { on = false; try { window.__apex.clearInput(); } catch (_) {} } };
  function tick(ts) {
    if (!on) return; raw(tick);
    const A = window.__apex; if (!A || !A.probe || !A.scan) return;
    const dt = prev ? Math.min(0.1, Math.max(0.001, (ts - prev) / 1000)) : 1 / 60; prev = ts;
    let p, pts; try { p = A.probe(); pts = p ? A.scan(DISTS) : null; } catch (e) { D.err = String(e.message).slice(0, 80); return; }
    if (!p || !pts) return;
    let kS = p.k; const look = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < pts.length; j++) {
      const d = DISTS[j], k = Math.abs(pts[j].k); if (d <= look) kS = pts[j].k;
      const vc = k > 1e-4 ? Math.sqrt(A_LAT / k) : VMAX, va = Math.sqrt(vc * vc + 2 * A_BRAKE * d); if (va < vT) vT = va;
    }
    vT = Math.max(11, Math.min(VMAX, vT)); hold = Math.min(vT, hold + 30 * dt); vT = hold;
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    let steer = Math.max(-1, Math.min(1, KP * (Math.atan2(kS * L * L * 0.5 - p.x, L) - p.angle)));
    const offRoad = Math.abs(p.x) - p.hw > 0.4;
    if (lastProg != null && p.s - lastProg < 0.05 && p.speed < 3) stalled++; else stalled = 0; lastProg = p.s;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
    if (stalled > 10) { steer = Math.max(-0.4, Math.min(0.4, steer)); throttle = true; brake = false; } else if (offRoad) throttle = false;
    try { A.setInput({ steer, throttle, brake }); } catch (e) { D.err = String(e.message).slice(0, 80); }
    D.frames++; if (offRoad) D.off++;
    if (lastS != null) { const ds = p.s - lastS; if (ds > 0 && ds < 50) D.dist += ds; } lastS = p.s;
  }
}

function slowCalls() {
  // Every GL / WebGPU call that takes > 20 ms, with the bound program's SHADER_NAME and a short stack; plus
  // program links and pipeline creations counted per phase (window on = after the gate).
  const S = window.__lfSlow = { on: false, n: {}, who: { createBuffer: {}, createTexture: {}, createBindGroup: {} }, slow: [], links: { pre: 0, win: 0 }, pipes: { pre: 0, win: 0 }, linkNames: [], cur: "", srcs: new WeakMap() };
  const stack = () => (new Error().stack || "").split("\n").slice(3, 7).map((l) => l.trim().replace(/^at /, "").replace(/https?:\/\/[^/]+\//, "").replace(/\?v=[^:]+/, "")).join(" < ");
  const wrap = (proto, name, tag) => {
    const o = proto && proto[name]; if (typeof o !== "function") return;
    proto[name] = function () {
      const a = performance.now();
      if (S.on) { S.n[name] = (S.n[name] || 0) + 1; if (S.who[name]) { const k = stack(); S.who[name][k] = (S.who[name][k] || 0) + 1; } }
      try { return o.apply(this, arguments); } finally {
        const d = performance.now() - a;
        if (d > 20 && S.slow.length < 60) S.slow.push({ fn: tag + "." + name, ms: +d.toFixed(1), win: S.on, prog: S.cur, at: Math.round(a), stack: stack() });
      }
    };
  };
  try {
    const P = WebGL2RenderingContext.prototype;
    const ss = P.shaderSource; P.shaderSource = function (sh, src) { S.srcs.set(sh, src); return ss.call(this, sh, src); };
    const at = P.attachShader; P.attachShader = function (pr, sh) { const m = String(S.srcs.get(sh) || "").match(/#define SHADER_NAME\s+(.+)/); if (m) pr.__n = m[1]; return at.call(this, pr, sh); };
    const lk = P.linkProgram; P.linkProgram = function (pr) { S.links[S.on ? "win" : "pre"]++; if (S.on && S.linkNames.length < 40) S.linkNames.push((pr.__n || "?") + "@" + Math.round(performance.now())); return lk.call(this, pr); };
    const up = P.useProgram; P.useProgram = function (pr) { S.cur = (pr && pr.__n) || ""; return up.call(this, pr); };
    for (const n of ["linkProgram", "getProgramParameter", "getShaderParameter", "compileShader", "drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced",
      "drawBuffers", "readPixels", "getError", "texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "texStorage2D", "texStorage3D", "bufferData", "bufferSubData", "clientWaitSync", "finish",
      "flush", "generateMipmap", "blitFramebuffer", "clear", "uniform4fv", "uniformMatrix4fv", "getUniformLocation", "getActiveUniform", "vertexAttribPointer", "bindVertexArray", "checkFramebufferStatus", "invalidateFramebuffer", "framebufferTexture2D", "framebufferTextureLayer"]) wrap(P, n, "gl");
  } catch (_) {}
  try {
    const D = GPUDevice.prototype;
    const cp = D.createRenderPipeline; D.createRenderPipeline = function () { S.pipes[S.on ? "win" : "pre"]++; return cp.apply(this, arguments); };
    for (const n of ["createRenderPipeline", "createShaderModule", "createBindGroup", "createBuffer", "createTexture", "createComputePipeline"]) wrap(D, n, "gpu");
    for (const n of ["submit", "writeBuffer", "writeTexture", "copyExternalImageToTexture"]) wrap(GPUQueue.prototype, n, "queue");
    wrap(GPUCanvasContext.prototype, "getCurrentTexture", "ctx");
    wrap(GPUCommandEncoder.prototype, "finish", "enc");
    // Count only (no clock read): draws and passes per frame.
    const count = (proto, name, key) => { const o = proto && proto[name]; if (typeof o !== "function") return; proto[name] = function () { if (S.on) S.n[key] = (S.n[key] || 0) + 1; return o.apply(this, arguments); }; };
    for (const n of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) count(GPURenderPassEncoder.prototype, n, "draw");
    count(GPUCommandEncoder.prototype, "beginRenderPass", "pass");
  } catch (_) {}
}

export const pct = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)].toFixed(2); };
export function dist(a) { return { n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: a.length ? +Math.max(...a).toFixed(2) : null, mean: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null }; }

export function analyseTrace(events, frames) {
  // Thread names, then per-thread merged toplevel busy time; GC events on every thread.
  const tname = new Map(), pname = new Map();
  for (const e of events) if (e.ph === "M") { if (e.name === "thread_name") tname.set(e.pid + ":" + e.tid, e.args.name); if (e.name === "process_name") pname.set(e.pid, e.args.name); }
  const busy = new Map(), gc = { minor: [], major: [], other: [] };
  let tMin = Infinity, tMax = -Infinity;
  for (const e of events) {
    if (e.ph !== "X" || !e.dur) continue;
    const key = e.pid + ":" + e.tid;
    if (e.ts < tMin) tMin = e.ts; if (e.ts + e.dur > tMax) tMax = e.ts + e.dur;
    if (e.cat && e.cat.indexOf("toplevel") >= 0) { let a = busy.get(key); if (!a) busy.set(key, a = []); a.push([e.ts, e.ts + e.dur]); }
    if (e.name === "MinorGC" || e.name === "V8.GC_SCAVENGER" || e.name === "MinorMS") gc.minor.push(e.dur / 1000);
    else if (e.name === "MajorGC" || e.name === "V8.GC_MARK_COMPACTOR") gc.major.push(e.dur / 1000);
    else if (/^V8\.GC_(MC_INCREMENTAL|SCAVENGER_BACKGROUND|MC_BACKGROUND)/.test(e.name) && e.dur > 500) gc.other.push(e.dur / 1000);
  }
  const threads = [];
  for (const [k, iv] of busy) {
    iv.sort((a, b) => a[0] - b[0]); let tot = 0, s = -1, en = -1;
    for (const [a, b] of iv) { if (a > en) { if (en > s) tot += en - s; s = a; en = b; } else if (b > en) en = b; }
    if (en > s) tot += en - s;
    const pid = +k.split(":")[0];
    threads.push({ thread: tname.get(k) || k, proc: pname.get(pid) || String(pid), busyMs: +(tot / 1000).toFixed(1), perFrame: frames ? +(tot / 1000 / frames).toFixed(2) : null });
  }
  threads.sort((a, b) => b.busyMs - a.busyMs);
  const sum = (a) => +a.reduce((x, y) => x + y, 0).toFixed(2);
  return { spanMs: +((tMax - tMin) / 1000).toFixed(0), frames, threads: threads.slice(0, 12),
    gc: { minorN: gc.minor.length, minorMs: sum(gc.minor), minorMax: gc.minor.length ? +Math.max(...gc.minor).toFixed(2) : 0,
      majorN: gc.major.length, majorMs: sum(gc.major), majorMax: gc.major.length ? +Math.max(...gc.major).toFixed(2) : 0, bgN: gc.other.length } };
}

/** A sampling heap profile taken with collected objects kept: bytes by allocating function, per frame. */
export function analyseAlloc(profile, frames) {
  const by = new Map(); let total = 0;
  (function walk(n) {
    const cf = n.callFrame || {}, sz = n.selfSize || 0;
    if (sz) { total += sz; const file = (cf.url || "").split("/").pop().replace(/\?.*$/, "") || "(native)"; const k = (cf.functionName || "(anon)") + " " + file + ":" + ((cf.lineNumber | 0) + 1); by.set(k, (by.get(k) || 0) + sz); }
    for (const c of n.children || []) walk(c);
  })(profile.head || {});
  const f = Math.max(1, frames | 0);
  return { frames: frames | 0, totalKB: +(total / 1024).toFixed(0), kbPerFrame: +(total / 1024 / f).toFixed(1),
    top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +(v / 1024 / f).toFixed(2)]) };
}

export function analyseProfile(p) {
  // Self time by function (url:line) and by file, over the sampled window.
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const cnt = new Map(); for (const id of p.samples) cnt.set(id, (cnt.get(id) || 0) + 1);
  const dt = (p.endTime - p.startTime) / 1000 / Math.max(1, p.samples.length);   // ms per sample
  const fnS = new Map(), fileS = new Map(); let total = 0, idle = 0;
  for (const [id, c] of cnt) {
    const n = byId.get(id), cf = n.callFrame, ms = c * dt; total += ms;
    if (cf.functionName === "(idle)" || cf.functionName === "(program)") { idle += ms; }
    const file = (cf.url || "").split("/").pop().replace(/\?.*$/, "") || cf.functionName;
    const k = (cf.functionName || "(anon)") + " " + file + ":" + (cf.lineNumber + 1);
    fnS.set(k, (fnS.get(k) || 0) + ms); fileS.set(file, (fileS.get(file) || 0) + ms);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]);
  return { ms: +total.toFixed(0), idleMs: +idle.toFixed(0), fns: top(fnS, 30), files: top(fileS, 15) };
}

async function runRow(browser, server, backend, track) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: DSF, hasTouch: true });
  const page = await ctx.newPage();
  const cons = [];
  const t0 = Date.now();
  page.on("console", (m) => { if ((m.type() === "error") && cons.length < 40) cons.push(((Date.now() - t0) / 1000).toFixed(1) + "s " + m.text().slice(0, 240)); });
  page.on("pageerror", (e) => { if (cons.length < 40) cons.push("pageerror " + String(e && e.message).slice(0, 240)); });
  await page.addInitScript(([gl, extra]) => {
    window.__TEST_MODE = true;
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", gl);
    localStorage.setItem("apex26.gfxPreset", '"medium"');
    localStorage.setItem("apex26.wgxCapture", "0");
    try { sessionStorage.setItem("apex26.wgxCapture", "0"); } catch (_) {}
    for (const [k, v] of extra) localStorage.setItem(k, v);
  }, [backend === "tlx-gl" ? "1" : "0", EXTRA]);
  await page.addInitScript(recorder);
  await page.addInitScript(driver);
  await page.addInitScript(slowCalls);
  await page.addInitScript(() => { const L = window.__lfTier = []; let last = null; setInterval(() => { try { const t = PerfGov.tier(); if (t !== last) { L.push([Math.round(performance.now()), t, window.__apex && window.__apex.info ? window.__apex.info().state : ""]); last = t; } } catch (_) {} }, 250); });
  const tBoot = Date.now();
  await gotoGame(page, server.url + (LAB ? (server.url.indexOf("?") >= 0 ? "&" : "?") + "lab=" + LAB : ""), 180000);
  const bootMs = Date.now() - tBoot, tEntry = Date.now();
  await page.evaluate(() => {
    // Name every render pipeline three builds after boot (the WebGL2 backend links its program here, synchronously).
    const S = window.__lfSlow, T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
    S.pipeNames = [];
    if (!be || typeof be.createRenderPipeline !== "function" || be.__lf) return;
    be.__lf = true;
    const o = be.createRenderPipeline;
    be.createRenderPipeline = function (ro, promises) {
      const a = performance.now();
      try { return o.apply(this, arguments); } finally {
        try {
          const m = ro.material || {}, ob = ro.object || {}, g = ro.geometry || {};
          const ud = Object.keys(ob.userData || {}).filter((k) => !/^_/.test(k)).slice(0, 6).join(",");
          let par = ob.parent, chain = []; for (let i = 0; par && i < 3; i++) { chain.push(par.name || par.type); par = par.parent; }
          if (S.pipeNames.length < 80) S.pipeNames.push({ win: S.on, at: Math.round(a), ms: +(performance.now() - a).toFixed(1), async: !!promises,
            mat: (m.type || "") + ":" + (m.name || ""), obj: (ob.type || "") + ":" + (ob.name || "") + (ob.isInstancedMesh ? ":inst" + ob.count : ""), ud, parents: chain.join("<"),
            attrs: Object.keys(g.attributes || {}).join(","), rt: ro.context && ro.context.renderTarget ? (ro.context.renderTarget.texture && ro.context.renderTarget.texture.name || "rt") + ":" + ro.context.width + "x" + ro.context.height : "canvas",
            tier: (() => { try { return PerfGov.tier(); } catch (_) { return null; } })(),
            pos: (() => { try { const p = window.__apex.probe(); return p ? +(p.s).toFixed(0) : null; } catch (_) { return null; } })() });
        } catch (_) {}
      }
    };
  });
  await page.evaluate(async (t) => { const A = window.__apex; await A.race(t); A.go(); }, track);
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  const entryMs = Date.now() - tEntry;
  if (THROTTLE > 1) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.evaluate((c) => { const A = window.__apex; try { A.camera(c); } catch (_) {} window.__lfDrive.start(); }, CAM);
  await page.waitForTimeout(WARM * 1000);
  const env = await page.evaluate(() => {
    const t = typeof GLX !== "undefined" ? GLX.__tlx : null; let bs = null; try { bs = t && t.backendState && t.backendState(); } catch (_) {}
    const A = window.__apex;
    return { api: bs && bs.api, forceWebGL: bs && bs.forceWebGL, liteGpu: bs && bs.liteGpu, isMobile: bs && bs.isMobile, mobileTier: bs && bs.mobileTier,
      present: t && t.renderer && [t.renderer.domElement.width, t.renderer.domElement.height], gov: A.renderScale(), state: A.info().state,
      gpuErrors: bs && bs.gpuErrors, preset: localStorage.getItem("apex26.gfxPreset"),
      adapter: (() => { try { const c = document.createElement("canvas").getContext("webgl2"), d = c && c.getExtension("WEBGL_debug_renderer_info");
        const s = d ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : ""; const l = c && c.getExtension("WEBGL_lose_context"); if (l) l.loseContext(); return s; } catch (_) { return ""; } })(), gpuTimer: (() => { try { return A.gpuTimer(true); } catch (_) { return null; } })() };
  });
  await page.evaluate(() => { window.__apex.perf({ on: true, reset: true }); const H = window.__lf; H.ts = []; H.cb = []; H.lastT = -1; H.on = true; window.__lfSlow.on = true; });
  // Trace the middle TRACE s of the window.
  const pre = 4;
  await page.waitForTimeout(pre * 1000);
  const cdp = await ctx.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", (d) => { for (const e of d.value) events.push(e); });
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  const f0 = await page.evaluate(() => window.__lf.ts.length);
  await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["toplevel", "devtools.timeline", "v8", "disabled-by-default-v8.gc", "gpu", "viz", "__metadata"], recordMode: "recordAsMuchAsPossible" } });
  await page.waitForTimeout(TRACE * 1000);
  const f1 = await page.evaluate(() => window.__lf.ts.length);
  await cdp.send("Tracing.end"); await Promise.race([done, new Promise((r) => setTimeout(r, 60000))]);
  // V8 CPU profile over PROF s of the window, after the trace.
  const g0 = await page.evaluate(() => window.__lf.ts.length);
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start");
  await page.waitForTimeout(PROF * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  const g1 = await page.evaluate(() => window.__lf.ts.length);
  const cpuProf = Object.assign(analyseProfile(profile), { frames: g1 - g0 });
  let alloc = null;
  if (ALLOC > 0) {
    try {
      const a0 = await page.evaluate(() => window.__lf.ts.length);
      await cdp.send("HeapProfiler.enable");
      await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.waitForTimeout(ALLOC * 1000);
      const hp = await cdp.send("HeapProfiler.stopSampling");
      alloc = analyseAlloc(hp.profile, (await page.evaluate(() => window.__lf.ts.length)) - a0);
    } catch (e) { alloc = { error: String((e && e.message) || e).slice(0, 160) }; }
  }
  await page.waitForTimeout(Math.max(0, WIN - pre - TRACE - PROF - ALLOC) * 1000);
  const got = await page.evaluate(() => {
    const H = window.__lf; H.on = false; window.__lfDrive.stop(); const SC = window.__lfSlow; SC.on = false;
    const A = window.__apex, p = A.perf();
    const iv = []; for (let i = 1; i < H.ts.length; i++) iv.push(H.ts[i] - H.ts[i - 1]);
    let gpuMs = null; try { gpuMs = A.gpuTimer().ms; } catch (_) {}
    const nf = Math.max(1, H.ts.length), counts = { frames: H.ts.length, perFrame: {} }; for (const k of Object.keys(SC.n)) counts.perFrame[k] = +(SC.n[k] / nf).toFixed(2);
    // Who creates GPU objects mid-race: the top call stacks per create* (count over the window).
    counts.who = {}; for (const k of Object.keys(SC.who)) counts.who[k] = Object.entries(SC.who[k]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([st, n]) => ({ n, stack: st.slice(0, 260) }));
    return { iv, cb: H.cb, counts, spans: p.spans, loaf: p.loaf, drive: { frames: window.__lfDrive.frames, dist: Math.round(window.__lfDrive.dist), off: window.__lfDrive.off, err: window.__lfDrive.err },
      tierLog: window.__lfTier, warm: (() => { try { const m = GLX.__tlx.memState(); return m && m.warm; } catch (_) { return null; } })(), gpuMs, slow: { calls: SC.slow, links: SC.links, pipes: SC.pipes, linkNames: SC.linkNames, pipeNames: SC.pipeNames }, gov: A.renderScale(), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  });
  // The event poke: what the 12 s after one __apex call cost (a weather change, a camera cut).
  let poke = null;
  if (POKE) {
    const before = await page.evaluate((expr) => { const H = window.__lf, S = window.__lfSlow; H.ts = []; H.cb = []; H.lastT = -1; H.on = true; S.on = true; window.__lfDrive.start();
      const b = { n: Object.assign({}, S.n), pipes: S.pipes.win, names: (S.pipeNames || []).length, slow: S.slow.length, links: S.links.win };
      try { b.ret = JSON.stringify(new Function("A", "return A." + expr)(window.__apex)).slice(0, 200); } catch (e) { b.err = String(e.message).slice(0, 160); } return b; }, POKE);
    await page.waitForTimeout(12000);
    const after = await page.evaluate((b) => { const H = window.__lf, S = window.__lfSlow; H.on = false; S.on = false; window.__lfDrive.stop(); const iv = []; for (let i = 1; i < H.ts.length; i++) iv.push(H.ts[i] - H.ts[i - 1]);
      const dn = {}; for (const k of Object.keys(S.n)) { const d = S.n[k] - (b.n[k] || 0); if (d) dn[k] = d; }
      return { iv, cb: H.cb, pipes: S.pipes.win - b.pipes, links: S.links.win - b.links, pipeNames: (S.pipeNames || []).slice(b.names), slow: S.slow.slice(b.slow), created: { createShaderModule: dn.createShaderModule || 0, createRenderPipeline: dn.createRenderPipeline || 0, createTexture: dn.createTexture || 0, createBuffer: dn.createBuffer || 0 } }; }, before);
    poke = { expr: POKE, ret: before.ret, err: before.err, frame: Object.assign(dist(after.iv), { over33: after.iv.filter((x) => x > 33.4).length, over100: after.iv.filter((x) => x > 100).length }), cpu: dist(after.cb),
      pipes: after.pipes, links: after.links, created: after.created, pipeNames: after.pipeNames, slow: after.slow };
    log(`  poke ${POKE} -> ${before.ret || before.err} frame ${JSON.stringify(poke.frame)} cpu ${JSON.stringify(poke.cpu)} pipes ${after.pipes} links ${after.links} created ${JSON.stringify(after.created)} names ${JSON.stringify(after.pipeNames).slice(0, 900)} slow ${JSON.stringify(after.slow).slice(0, 600)}`);
  }
  // The pixel sweep: frame ms against drawn pixels, the ladder held so a shed feature cannot pass for a pixel saving.
  const sweep = [];
  if (SWEEP.length) {
    await page.evaluate(() => { const A = window.__apex; try { A.govHold(true); } catch (_) {} try { A.gpuTimer(true); } catch (_) {} window.__lfSlow.on = false; window.__lfDrive.start(); });
    for (const st of sweepSteps(SWEEP)) {
      const set = await page.evaluate(({ cap, scale }) => { const A = window.__apex, T = GLX.__tlx; let capped = null; try { capped = T.capDpr(cap); } catch (e) { capped = String(e.message); }
        const r = A.renderScale(scale); return { capped, scale: r && r.scale }; }, st);
      await page.waitForTimeout(1500);
      await page.evaluate(() => { const H = window.__lf; H.ts = []; H.cb = []; H.lastT = -1; H.on = true; });
      const gpu = [];
      for (let k = 0; k < Math.max(2, Math.round(STEP * 2)); k++) { await page.waitForTimeout(500); const g = await page.evaluate(() => { try { return window.__apex.gpuTimer().ms; } catch (_) { return null; } }); if (g > 0) gpu.push(g); }
      const r = await page.evaluate(() => { const H = window.__lf; H.on = false; const iv = []; for (let i = 1; i < H.ts.length; i++) iv.push(H.ts[i] - H.ts[i - 1]);
        const T = GLX.__tlx, c = T.renderer.domElement, ps = T.getPresentSize ? T.getPresentSize() : null; let post = null; try { const s = T.postState && T.postState(); post = s && { rtResizes: s.rtResizes }; } catch (_) {}
        return { iv, cb: H.cb, canvas: [c.width, c.height], present: ps && [ps.width, ps.height], post, tier: PerfGov.tier() }; });
      const ivd = dist(r.iv);
      sweep.push({ cap: st.cap, scale: st.scale, set, canvas: r.canvas, present: r.present, px: r.canvas[0] * r.canvas[1], tier: r.tier, post: r.post,
        frame: Object.assign(ivd, { over33: +(r.iv.filter((x) => x > 33.4).length / Math.max(1, r.iv.length) * 100).toFixed(1) }), cpu: dist(r.cb), gpuMs: dist(gpu) });
      log(`  sweep cap ${st.cap} scale ${st.scale} canvas ${r.canvas.join("x")} frame p50 ${ivd.p50} p95 ${ivd.p95} cpu p50 ${pct(r.cb, 0.5)} gpu p50 ${pct(gpu, 0.5)} (n ${gpu.length})`);
    }
    await page.evaluate(() => { try { window.__lfDrive.stop(); } catch (_) {} });
  }
  const over = (ms) => +(got.iv.filter((x) => x > ms).length / Math.max(1, got.iv.length) * 100).toFixed(1);
  const loafE = (got.loaf && got.loaf.entries) || [];
  // Frame k's interval is ts[k]-ts[k-1]; a rebuild recorded while frame index n was the last pushed ts runs in the
  // callback of frame n-1 -> its cost shows as interval iv[n-1] (ts[n]-ts[n-1]).
  const row = { ivs: got.iv.map((x) => Math.round(x)),
    env, frame: Object.assign(dist(got.iv), { over33: over(33.4), over50: over(50), over100: over(100), fps: +(1000 * got.iv.length / Math.max(1, got.iv.reduce((a, b) => a + b, 0))).toFixed(1) }),
    cpu: dist(got.cb), counts: got.counts, alloc, sweep, poke, t: { bootMs, entryMs }, dsf: DSF, cpuThrottle: THROTTLE, spans: got.spans, slow: got.slow, tierLog: got.tierLog, warm: got.warm, drive: got.drive, gpuMs: got.gpuMs, govEnd: got.gov, heapMB: got.heap,
    loaf: { supported: got.loaf && got.loaf.supported, n: loafE.length, top: loafE.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 6) },
    trace: analyseTrace(events, f1 - f0), prof: cpuProf, console: cons,
  };
  await ctx.close().catch(() => {});
  return row;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  TRACKS = o.tracks; CAM = o.cam; WARM = o.warm; WIN = o.win; TRACE = o.trace; PROF = o.prof; EXTRA = o.ls; DSF = o.dsf; THROTTLE = o.cpuThrottle; SWEEP = o.sweep; STEP = o.step; LAB = o.lab; POKE = o.poke; ALLOC = o.alloc;
  report = { started: new Date().toISOString(), warm: WARM, win: WIN, trace: TRACE, prof: PROF, cam: CAM, extra: EXTRA, dsf: DSF, cpuThrottle: THROTTLE, sweep: SWEEP, step: STEP, lab: LAB, rows: [] };
  save = () => writeFileSync(o.json, JSON.stringify(report, null, 2));
  const BACK = o.backends;
  const server = await startStaticServer(process.cwd());
  try {
    for (const backend of BACK) for (const track of TRACKS) {
      const row = { backend, track }; report.rows.push(row);
      const t0 = Date.now(); let browser = null;
      try {
        browser = await launchChromium({ args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling", "--enable-features=LongAnimationFrameTiming"] });
        Object.assign(row, await Promise.race([runRow(browser, server, backend, track), new Promise((_, rej) => setTimeout(() => rej(new Error("row cap " + o.rowCap + " s")), o.rowCap * 1000))]));
        const f = row.frame, c = row.cpu;
        // THE PARAVIRTUAL FLAG: macos-latest's Apple Paravirtual device answers frame time from its present path, not
      // from pixels or passes (docs/notes/TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md §2). Its ms are structure, never GPU cost.
      row.paravirtual = /paravirtual/i.test(row.env.adapter || "");
      if (row.paravirtual) log("  PARAVIRTUAL adapter: frame ms here are the runner's present path, not GPU cost; read stalls, links and counts only");
      log(`${backend} ${track} ${JSON.stringify(row.env).slice(0, 400)}`);
        log(`  frame p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} max ${f.max} fps ${f.fps} >33 ${f.over33}% >50 ${f.over50}% | cpu p50 ${c.p50} p95 ${c.p95} max ${c.max} | drive ${JSON.stringify(row.drive)}`);
        log(`  counts/frame ${JSON.stringify(row.counts)} boot ${row.t.bootMs} ms entry ${row.t.entryMs} ms throttle x${THROTTLE} dsf ${DSF}`);
        if (row.alloc) log(`  alloc ${JSON.stringify(row.alloc).slice(0, 2600)}`);
        log(`  spans ${JSON.stringify(row.spans)}`);
        log(`  trace ${JSON.stringify(row.trace)}`);
          log(`  slow ${JSON.stringify(row.slow).slice(0, 2500)}`);
        log(`  prof ${JSON.stringify(row.prof).slice(0, 3000)}`);
        log(`  loaf ${JSON.stringify(row.loaf).slice(0, 1500)}`);
      } catch (e) { row.error = String((e && e.stack) || e).slice(0, 600); log(`${backend} ${track} FAILED ${row.error}`); }
      finally { row.ms = Date.now() - t0; save(); if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]); }
    }
  } finally { save(); server.close && server.close(); process.exit(0); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
