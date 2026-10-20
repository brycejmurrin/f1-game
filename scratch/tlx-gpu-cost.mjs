#!/usr/bin/env node
// TLX-WebGPU GPU cost per pass, phone tier (B·H7 2026-10-20). Census request leg `tlx-gpu-cost`.
//
// The macos-latest adapter is an Apple PARAVIRTUAL device with no timestamp-query, so three's
// gpuTimer is {supported:false} there and no per-pass GPU time exists. This measures GPU THROUGHPUT
// instead: with the sim frozen and the clock pinned, render N frames back to back in ONE task
// (__apex.snapCam(true) = one full game render + present), then await queue.onSubmittedWorkDone().
//   cpu  = encode wall per frame (the loop alone)
//   wall = loop + drain per frame; when wall >> cpu the GPU is the bottleneck and wall IS gpu ms/frame
// Arms are toggled LIVE and interleaved round-robin, so runner drift lands on every arm alike.
// Arms: bloom / ssao+contact / godray / matTex (PBR pack) via lightTune, and render scale 0.75 / 0.5
// (fill sensitivity). A full chain "all post off" arm bounds the post chain.
import { startStaticServer, launchChromium, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../tools/lib/harness.mjs";
import { gotoGame } from "../tools/shot/probe-page.mjs";
import { raceGate } from "../tools/lib/census-entry.mjs";
import { writeFileSync } from "node:fs";

const TRACKS = (process.env.H7_TRACKS || "monaco,spa").split(",");
const CAMS = (process.env.H7_CAMS || "chase,cockpit").split(",");
const PROFILES = (process.env.H7_PROFILES || "phone,desktop").split(",");
const ROUNDS = +(process.env.H7_ROUNDS || 7), N = +(process.env.H7_N || 8);
const OUT = process.env.H7_OUT || "tlx-gpu-cost.json";
const report = { started: new Date().toISOString(), rounds: ROUNDS, n: N, rows: [] };
const save = () => writeFileSync(OUT, JSON.stringify(report, null, 2));
const log = (m) => console.log("[h7] " + m);

const PROFILE = {
  phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, ls: { "apex26.forceMobileTier": "1" } },
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, ls: {} },
};

function counters() {
  // Pass + submit counts, and every render pass's attachment sizes (tagged at createView).
  const C = window.__h7 = { passes: 0, submits: 0, kinds: new Map(), on: false };
  const vsz = new WeakMap();
  try {
    const cv = GPUTexture.prototype.createView;
    GPUTexture.prototype.createView = function (d) {
      const v = cv.call(this, d);
      try { vsz.set(v, this.width + "x" + this.height + "/" + this.format + (this.sampleCount > 1 ? "x" + this.sampleCount : "")); } catch (_) {}
      return v;
    };
    const bp = GPUCommandEncoder.prototype.beginRenderPass;
    GPUCommandEncoder.prototype.beginRenderPass = function (d) {
      if (C.on) {
        C.passes++;
        try {
          const k = (d.colorAttachments || []).filter(Boolean).map((a) => vsz.get(a.view) || "?").join("+")
            + (d.depthStencilAttachment ? "|d:" + (vsz.get(d.depthStencilAttachment.view) || "?") + ":" + (d.depthStencilAttachment.depthStoreOp || "") : "");
          C.kinds.set(k, (C.kinds.get(k) || 0) + 1);
        } catch (_) {}
      }
      return bp.call(this, d);
    };
    const sb = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (b) { if (C.on) C.submits++; return sb.call(this, b); };
  } catch (_) {}
}

async function boot(browser, server, prof, track, cam) {
  const P = PROFILE[prof];
  const ctx = await browser.newContext({ viewport: P.viewport, deviceScaleFactor: P.deviceScaleFactor, hasTouch: P.hasTouch, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const cons = [];
  page.on("console", (m) => { if (m.type() === "error" && cons.length < 20) cons.push(m.text().slice(0, 200)); });
  await page.addInitScript((ls) => {
    window.__TEST_MODE = true;
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", ls.__forceGL || "0");
    localStorage.setItem("apex26.wgxCapture", "0");
    try { sessionStorage.setItem("apex26.wgxCapture", "0"); } catch (_) {}
    for (const k of Object.keys(ls)) if (k !== "__forceGL") localStorage.setItem(k, ls[k]);
  }, Object.assign({}, P.ls, process.env.H7_FORCEGL ? { __forceGL: "1" } : {}));
  await page.addInitScript(counters);
  await gotoGame(page, server.url, 180000);
  await page.evaluate(async ([t, c]) => {
    const A = window.__apex;
    await A.race(t);
    A.go();
  }, [track, cam]);
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  await page.evaluate((c) => window.__apex.camera(c), cam);
  // Let the race settle (pipelines compile, packs land).
  await page.waitForTimeout(6000);
  const env = await page.evaluate(() => {
    const g = typeof GLX !== "undefined" ? GLX : null, t = g && g.__tlx;
    let bs = null; try { bs = t && t.backendState && t.backendState(); } catch (_) {}
    return { api: bs && bs.api, softBlit: bs && bs.softBlit, isMobile: bs && bs.isMobile, mobileTier: bs && bs.mobileTier,
      liteGpu: bs && bs.liteGpu, present: t && t.renderer && [t.renderer.domElement.width, t.renderer.domElement.height],
      dpr: devicePixelRatio, gov: window.__apex.renderScale(), track: window.__apex.info().track };
  });
  return { ctx, page, env, cons };
}

async function bench(page, positions) {
  return page.evaluate(async ([ROUNDS, N, positions]) => {
    const A = window.__apex, T = GLX.__tlx;
    const be = T.renderer.backend;
    const q = be.device ? be.device.queue : { onSubmittedWorkDone: async () => { be.gl.finish(); } };   // GL path: local smoke only
    const base = A.lightTune();
    A.renderClock(12, true); A.freeze(true); A.renderScale(1); try { A.govHold(true); } catch (_) {}
    const tune = (o) => A.lightTune(Object.assign({}, { bloomMul: base.bloomMul, aoStr: base.aoStr, contactStr: base.contactStr, grMul: base.grMul, matTexMix: base.matTexMix }, o));
    const ARMS = {
      base: () => { tune({}); A.renderScale(1); },
      noBloom: () => { tune({ bloomMul: 0 }); A.renderScale(1); },
      noAO: () => { tune({ aoStr: 0, contactStr: 0 }); A.renderScale(1); },
      noGodray: () => { tune({ grMul: 0 }); A.renderScale(1); },
      noMatTex: () => { tune({ matTexMix: 0 }); A.renderScale(1); },
      noPost: () => { tune({ bloomMul: 0, aoStr: 0, contactStr: 0, grMul: 0 }); A.renderScale(1); },
      scale75: () => { tune({}); A.renderScale(0.75); },
      scale50: () => { tune({}); A.renderScale(0.5); },
    };
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const burst = async (n) => {
      await q.onSubmittedWorkDone();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) A.snapCam(true);
      const t1 = performance.now();
      await q.onSubmittedWorkDone();
      const t2 = performance.now();
      return { cpu: (t1 - t0) / n, wall: (t2 - t0) / n };
    };
    const res = {};
    const dbg = { info: A.info(), hasGPU: typeof GPUCommandEncoder, patched: String(GPUCommandEncoder.prototype.beginRenderPass).slice(0, 60) };
    window.__h7.on = true; for (let i = 0; i < 10; i++) await raf(); dbg.rafPasses = window.__h7.passes; dbg.rafSubmits = window.__h7.submits;
    window.__h7.passes = 0; A.snapCam(true); dbg.snapPasses = window.__h7.passes; window.__h7.on = false; window.__h7.passes = 0; window.__h7.submits = 0;
    for (const k of Object.keys(ARMS)) res[k] = { cpu: [], wall: [], passes: 0, submits: 0, frames: 0, kinds: {}, post: null };
    for (const pos of positions) {
      A.freeze(false); A.jump(pos, 55); A.freeze(true); A.snapCam(true);
      for (const k of Object.keys(ARMS)) { ARMS[k](); for (let i = 0; i < 4; i++) await raf(); await burst(3); }   // warm every arm's programs
      for (let r = 0; r < ROUNDS; r++) {
        for (const k of Object.keys(ARMS)) {
          ARMS[k](); await raf(); await raf(); await raf();
          window.__h7.on = true; const p0 = window.__h7.passes, s0 = window.__h7.submits; window.__h7.kinds.clear();
          const b = await burst(N);
          window.__h7.on = false;
          const R = res[k];
          R.cpu.push(b.cpu); R.wall.push(b.wall);
          R.passes += window.__h7.passes - p0; R.submits += window.__h7.submits - s0; R.frames += N;
          for (const [kk, v] of window.__h7.kinds) R.kinds[kk] = (R.kinds[kk] || 0) + v;
          if (r === 0 && !R.post) { try { R.post = T.postState && T.postState(); } catch (_) {} R.size = [T.renderer.domElement.width, T.renderer.domElement.height]; }
        }
      }
    }
    ARMS.base(); A.freeze(false); A.renderClock(null, false);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(2) : null; };
    const out = {};
    for (const k of Object.keys(res)) {
      const R = res[k], kinds = {};
      for (const kk of Object.keys(R.kinds)) kinds[kk] = +(R.kinds[kk] / R.frames).toFixed(2);
      out[k] = { cpuMs: med(R.cpu), wallMs: med(R.wall), wallP25: +R.wall.slice().sort((a, b) => a - b)[R.wall.length >> 2].toFixed(2),
        passesPerFrame: +(R.passes / R.frames).toFixed(2), submitsPerFrame: +(R.submits / R.frames).toFixed(2), kinds, post: R.post, size: R.size, samples: R.wall.length };
    }
    for (const k of Object.keys(res)) if (k !== "base" && out.base.wallMs) out[k].deltaMs = +(out[k].wallMs - out.base.wallMs).toFixed(2);
    out.dbg = dbg;
    return out;
  }, [ROUNDS, N, positions]);
}

const server = await startStaticServer(process.cwd());
const SOFT = process.env.H7_SOFT === "1";   // local smoke only (lavapipe); the census runs the real adapter
if (SOFT) Object.assign(process.env, WEBGPU_LAVAPE_ENV || {});
const browser = await launchChromium(SOFT ? { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"], env: { ...process.env, ...(WEBGPU_LAVAPE_ENV || {}) } }
  : { args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
try {
  for (const prof of PROFILES) for (const track of TRACKS) for (const cam of CAMS) {
    if (prof === "desktop" && cam !== "chase") continue;   // desktop is the reference row only
    const row = { prof, track, cam };
    report.rows.push(row);
    const t0 = Date.now();
    let ctx = null;
    try {
      const b = await boot(browser, server, prof, track, cam);
      ctx = b.ctx; row.env = b.env;
      log(`${prof} ${track} ${cam} booted ${JSON.stringify(b.env)}`);
      row.arms = await bench(b.page, [0.18, 0.62]);
      row.consoleErrors = b.cons;
      log("  dbg " + JSON.stringify(row.arms.dbg).slice(0, 600));
      for (const k of Object.keys(row.arms)) { if (k === "dbg") continue; const a = row.arms[k]; log(`  ${k.padEnd(9)} wall ${a.wallMs} cpu ${a.cpuMs} d ${a.deltaMs ?? "-"} passes ${a.passesPerFrame} submits ${a.submitsPerFrame}`); }
    } catch (e) { row.error = String((e && e.stack) || e).slice(0, 600); log("FAILED " + row.error); }
    finally { row.ms = Date.now() - t0; save(); if (ctx) await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 15000))]); }
  }
} finally {
  save();
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]);
  server.close && server.close();
  process.exit(0);
}
