#!/usr/bin/env node
// Live race frame time at the phone shape (B·H10 2026-10-20). Census request leg `h10-live-frame`.
//
// Per row (backend x track): boot at 844x390 css x 1.5 (the mobile DPR cap) with touch and GRAPHICS MEDIUM
// (the phone default), WITHOUT apex26.forceMobileTier (it loses the WebGPU device on the paravirtual runner,
// TLX-GPU-COST-PARAVIRTUAL §3). Backends: tlx-gl = three's WebGL2 (what WebKit / an iPhone binds on AUTO),
// tlx-gpu = three's WebGPU (what Android Chrome binds). The default helmet camera; the car DRIVES (the
// census closed-loop law) for a WARM s settle then a WIN s window. Recorded over the window:
//   frame  rAF interval p50/p95/p99/max and the share over 33/50/100 ms
//   cpu    the game's rAF callback wall (all JS a frame runs), p50/p95/max
//   spans  PerfSpans per phase (frame input physics ai collide camera audio render hud)
//   loaf   long-animation-frame entries (>50 ms) with their top scripts
//   trace  TRACE s of CDP tracing: GC pauses (MinorGC/MajorGC) and per-thread busy ms/frame (renderer main,
//          compositor, GPU main, viz) from merged toplevel tasks — the GPU-process side we can see without
//          timestamp-query.
import { startStaticServer, launchChromium } from "../tools/lib/harness.mjs";
import { gotoGame } from "../tools/shot/probe-page.mjs";
import { raceGate } from "../tools/lib/census-entry.mjs";
import { writeFileSync } from "node:fs";

const TRACKS = (process.env.H10_TRACKS || "monaco,spa,singapore").split(",");
const BACKENDS = (process.env.H10_BACKENDS || "tlx-gl").split(",");
const CAM = process.env.H10_CAM || "helmet";
const WARM = +(process.env.H10_WARM || 8), WIN = +(process.env.H10_WIN || 40), TRACE = +(process.env.H10_TRACE || 6);
const EXTRA = (process.env.H10_LS || "").split(/\s+/).filter(Boolean).map((kv) => kv.split("="));
const OUT = process.env.H10_OUT || "h10-live-frame.json";
const report = { started: new Date().toISOString(), warm: WARM, win: WIN, trace: TRACE, cam: CAM, extra: EXTRA, rows: [] };
const save = () => writeFileSync(OUT, JSON.stringify(report, null, 2));
const log = (m) => console.log("[h10] " + m);

function recorder() {
  // Wrap rAF: every callback's wall into __h10.cb (summed per frame), every frame's timestamp into __h10.ts.
  const r = window.requestAnimationFrame.bind(window);
  const H = window.__h10 = { on: false, ts: [], cb: [], acc: 0, lastT: -1, raw: r };
  window.requestAnimationFrame = (f) => r((t) => {
    if (H.on && t !== H.lastT) { if (H.lastT >= 0) H.cb.push(H.acc); H.ts.push(t); H.acc = 0; H.lastT = t; }
    const a = performance.now();
    try { return f(t); } finally { if (H.on) H.acc += performance.now() - a; }
  });
}
function driver() {
  // gpu-game-check.mjs's closed-loop law (braking envelope over scan(), pure pursuit on probe()), on the raw rAF.
  const raw = window.requestAnimationFrame.bind(window);
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, A_LAT = 13, A_BRAKE = 24, KP = 2.4;
  let on = false, prev = 0, hold = 30, stalled = 0, lastProg = null, lastS = null;
  const D = window.__h10d = { frames: 0, dist: 0, off: 0, err: null, start() { on = true; prev = 0; raw(tick); }, stop() { on = false; try { window.__apex.clearInput(); } catch (_) {} } };
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
  const S = window.__h10s = { on: false, slow: [], links: { pre: 0, win: 0 }, pipes: { pre: 0, win: 0 }, linkNames: [], cur: "", srcs: new WeakMap() };
  const stack = () => (new Error().stack || "").split("\n").slice(3, 7).map((l) => l.trim().replace(/^at /, "").replace(/https?:\/\/[^/]+\//, "").replace(/\?v=[^:]+/, "")).join(" < ");
  const wrap = (proto, name, tag) => {
    const o = proto && proto[name]; if (typeof o !== "function") return;
    proto[name] = function () {
      const a = performance.now();
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
  } catch (_) {}
}

const pct = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)].toFixed(2); };
function dist(a) { return { n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: a.length ? +Math.max(...a).toFixed(2) : null, mean: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null }; }

function analyseTrace(events, frames) {
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

function analyseProfile(p) {
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
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true });
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
  await gotoGame(page, server.url, 180000);
  await page.evaluate(() => {
    // Name every render pipeline three builds after boot (the WebGL2 backend links its program here, synchronously).
    const S = window.__h10s, T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
    S.pipeNames = [];
    if (!be || typeof be.createRenderPipeline !== "function" || be.__h10) return;
    be.__h10 = true;
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
            pos: (() => { try { const p = window.__apex.probe(); return p ? +(p.s).toFixed(0) : null; } catch (_) { return null; } })() });
        } catch (_) {}
      }
    };
  });
  await page.evaluate(async (t) => { const A = window.__apex; await A.race(t); A.go(); }, track);
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  await page.evaluate((c) => { const A = window.__apex; try { A.camera(c); } catch (_) {} window.__h10d.start(); }, CAM);
  await page.waitForTimeout(WARM * 1000);
  const env = await page.evaluate(() => {
    const t = typeof GLX !== "undefined" ? GLX.__tlx : null; let bs = null; try { bs = t && t.backendState && t.backendState(); } catch (_) {}
    const A = window.__apex;
    return { api: bs && bs.api, forceWebGL: bs && bs.forceWebGL, liteGpu: bs && bs.liteGpu, isMobile: bs && bs.isMobile, mobileTier: bs && bs.mobileTier,
      present: t && t.renderer && [t.renderer.domElement.width, t.renderer.domElement.height], gov: A.renderScale(), state: A.info().state,
      gpuErrors: bs && bs.gpuErrors, preset: localStorage.getItem("apex26.gfxPreset"), gpuTimer: (() => { try { return A.gpuTimer(true); } catch (_) { return null; } })() };
  });
  await page.evaluate(() => { window.__apex.perf({ on: true, reset: true }); const H = window.__h10; H.ts = []; H.cb = []; H.lastT = -1; H.on = true; window.__h10s.on = true; });
  // Trace the middle TRACE s of the window.
  const pre = 4;
  await page.waitForTimeout(pre * 1000);
  const cdp = await ctx.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", (d) => { for (const e of d.value) events.push(e); });
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  const f0 = await page.evaluate(() => window.__h10.ts.length);
  await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["toplevel", "devtools.timeline", "v8", "disabled-by-default-v8.gc", "gpu", "viz", "__metadata"], recordMode: "recordAsMuchAsPossible" } });
  await page.waitForTimeout(TRACE * 1000);
  const f1 = await page.evaluate(() => window.__h10.ts.length);
  await cdp.send("Tracing.end"); await Promise.race([done, new Promise((r) => setTimeout(r, 60000))]);
  // V8 CPU profile over PROF s of the window, after the trace.
  const PROF = +(process.env.H10_PROF || 12);
  const g0 = await page.evaluate(() => window.__h10.ts.length);
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start");
  await page.waitForTimeout(PROF * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  const g1 = await page.evaluate(() => window.__h10.ts.length);
  const cpuProf = Object.assign(analyseProfile(profile), { frames: g1 - g0 });
  await page.waitForTimeout(Math.max(0, WIN - pre - TRACE - PROF) * 1000);
  const got = await page.evaluate(() => {
    const H = window.__h10; H.on = false; window.__h10d.stop(); const SC = window.__h10s; SC.on = false;
    const A = window.__apex, p = A.perf();
    const iv = []; for (let i = 1; i < H.ts.length; i++) iv.push(H.ts[i] - H.ts[i - 1]);
    let gpuMs = null; try { gpuMs = A.gpuTimer().ms; } catch (_) {}
    return { iv, cb: H.cb, spans: p.spans, loaf: p.loaf, drive: { frames: window.__h10d.frames, dist: Math.round(window.__h10d.dist), off: window.__h10d.off, err: window.__h10d.err },
      gpuMs, slow: { calls: SC.slow, links: SC.links, pipes: SC.pipes, linkNames: SC.linkNames, pipeNames: SC.pipeNames }, gov: A.renderScale(), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  });
  const over = (ms) => +(got.iv.filter((x) => x > ms).length / Math.max(1, got.iv.length) * 100).toFixed(1);
  const loafE = (got.loaf && got.loaf.entries) || [];
  const row = {
    env, frame: Object.assign(dist(got.iv), { over33: over(33.4), over50: over(50), over100: over(100), fps: +(1000 * got.iv.length / Math.max(1, got.iv.reduce((a, b) => a + b, 0))).toFixed(1) }),
    cpu: dist(got.cb), spans: got.spans, slow: got.slow, drive: got.drive, gpuMs: got.gpuMs, govEnd: got.gov, heapMB: got.heap,
    loaf: { supported: got.loaf && got.loaf.supported, n: loafE.length, top: loafE.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 6) },
    trace: analyseTrace(events, f1 - f0), prof: cpuProf, console: cons,
  };
  await ctx.close().catch(() => {});
  return row;
}

const server = await startStaticServer(process.cwd());
try {
  for (const backend of BACKENDS) for (const track of TRACKS) {
    const row = { backend, track }; report.rows.push(row);
    const t0 = Date.now(); let browser = null;
    try {
      browser = await launchChromium({ args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling", "--enable-features=LongAnimationFrameTiming"] });
      Object.assign(row, await Promise.race([runRow(browser, server, backend, track), new Promise((_, rej) => setTimeout(() => rej(new Error("row cap 600 s")), 600000))]));
      const f = row.frame, c = row.cpu;
      log(`${backend} ${track} ${JSON.stringify(row.env).slice(0, 400)}`);
      log(`  frame p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} max ${f.max} fps ${f.fps} >33 ${f.over33}% >50 ${f.over50}% | cpu p50 ${c.p50} p95 ${c.p95} max ${c.max} | drive ${JSON.stringify(row.drive)}`);
      log(`  spans ${JSON.stringify(row.spans)}`);
      log(`  trace ${JSON.stringify(row.trace)}`);
      log(`  slow ${JSON.stringify(row.slow).slice(0, 2500)}`);
      log(`  prof ${JSON.stringify(row.prof).slice(0, 3000)}`);
      log(`  loaf ${JSON.stringify(row.loaf).slice(0, 1500)}`);
    } catch (e) { row.error = String((e && e.stack) || e).slice(0, 600); log(`${backend} ${track} FAILED ${row.error}`); }
    finally { row.ms = Date.now() - t0; save(); if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]); }
  }
} finally { save(); server.close && server.close(); process.exit(0); }
