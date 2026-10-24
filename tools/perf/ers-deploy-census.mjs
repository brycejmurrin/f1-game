#!/usr/bin/env node
// tools/perf/ers-deploy-census.mjs — which render pipelines three builds on the player's FIRST ERS deploy (A·W15 #3611).
// @doc First-ERS-deploy pipeline census: every three createRenderPipeline across the first BOOST deploy, named
// @doc with object, material, attributes and render target, plus TLX material misses; --mirror on|off, --cam.
//
// The iPhone stall (docs/notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md): the first frame that deploys ERS (BOOST on
// while GAS is held) blocks the WebGPU frame ~0.74-0.93 s outside JS, a first-use pipeline compile. That frame
// draws the player's ERS strip (js/car/car-draw.js drawExhaustFx -> CarMesh.getErsLight) for the first time.
// This census names every pipeline three builds lazily across that deploy and the render target it was built
// for, so the warm-list owner can tell a main-pass miss from the rear-view mirror RT or a shadow/depth pass.
// Read the NAMES and COUNT; absolute ms only mean something on a real GPU (gpu-census.yml macos-latest), not
// under SwiftShader here.
//
//   npx serve -l 3456 .     (or let the harness serve: it does by default)
//   node tools/perf/ers-deploy-census.mjs [--backend tlx-gpu|tlx-gl] [--cam helmet|chase|…] [--mirror on|off|auto]
//        [--track monza] [--warm 6] [--after 4] [--json artifacts/perf/ers-deploy-census.json]
//
// Output: `= ers-deploy-census backend=… cam=… mirror=… api=… deployed=… pre=N lazy=M misses=K` and one line per
// pipeline built after BOOST went on: `  +<ms after boost> <obj> <mat> rt=<target> attrs=<…> <build ms>`.
import { startStaticServer, launchChromium } from "../lib/harness.mjs";
import { gotoGame } from "../shot/probe-page.mjs";
import { raceGate } from "../lib/census-entry.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(argv) {
  const o = { backend: "tlx-gpu", cam: "helmet", mirror: "on", track: "monza", warm: 6, after: 4, presses: 0, gap: 3, hold: 1.5, json: "artifacts/perf/ers-deploy-census.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--backend") { if (!["tlx-gpu", "tlx-gl"].includes(v)) throw new Error("--backend tlx-gpu|tlx-gl"); o.backend = v; i++; }
    else if (a === "--cam") { o.cam = String(v); i++; }
    else if (a === "--mirror") { if (!["on", "off", "auto"].includes(v)) throw new Error("--mirror on|off|auto"); o.mirror = v; i++; }
    else if (a === "--track") { o.track = String(v); i++; }
    else if (a === "--warm") { o.warm = Math.max(1, Math.min(60, +v || 6)); i++; }
    else if (a === "--after") { o.after = Math.max(1, Math.min(30, +v || 4)); i++; }
    else if (a === "--presses") { o.presses = Math.max(0, Math.min(12, +v | 0)); i++; }
    else if (a === "--gap") { o.gap = Math.max(0.5, Math.min(60, +v || 3)); i++; }
    else if (a === "--hold") { o.hold = Math.max(0.2, Math.min(10, +v || 1.5)); i++; }
    else if (a === "--json") { o.json = String(v); i++; }
    else throw new Error("unknown flag: " + a);
  }
  return o;
}

// Page side, after boot: name every pipeline three's backend builds (the same hook as tools/gfx/live-frame-census.mjs).
export function hookPipelines() {
  const P = window.__edc = { pipes: [], boostAt: null };
  const T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
  if (!be || typeof be.createRenderPipeline !== "function") { P.hook = "no three backend"; return P.hook; }
  const o = be.createRenderPipeline;
  be.createRenderPipeline = function (ro, promises) {
    const a = performance.now();
    try { return o.apply(this, arguments); } finally {
      try {
        const m = ro.material || {}, ob = ro.object || {}, g = ro.geometry || {}, c = ro.context || {};
        let par = ob.parent; const chain = []; for (let i = 0; par && i < 3; i++) { chain.push(par.name || par.type); par = par.parent; }
        const rt = c.renderTarget ? (c.renderTarget.texture && c.renderTarget.texture.name || c.renderTarget.name || "rt") + ":" + c.width + "x" + c.height
          + (c.depth && !c.textures ? ":depth" : "") : "canvas";
        if (P.pipes.length < 200) P.pipes.push({ at: Math.round(a), ms: +(performance.now() - a).toFixed(1), async: !!promises,
          mat: (m.type || "") + ":" + (m.name || ""), transparent: !!m.transparent, depthWrite: m.depthWrite !== false, colorWrite: m.colorWrite !== false,
          obj: (ob.type || "") + ":" + (ob.name || "") + (ob.isInstancedMesh ? ":inst" + ob.count : ""), parents: chain.join("<"),
          attrs: Object.keys(g.attributes || {}).sort().join(","), rt,
          pass: c.renderTarget && c.renderTarget.depthTexture && !c.textures ? "depth" : (c.renderTarget ? "rt" : "main") });
      } catch (_) { /* naming is best-effort; the build itself already returned */ }
    }
  };
  P.hook = "ok";
  return P.hook;
}

// Page side: the counters one BOOST press can move. Every field is a running total; a press is the delta.
export function pressSnap() {
  const P = window.__edc, T = GLX.__tlx; let ms = null; try { ms = T.memState(); } catch (_) { /* no memState */ }
  if (!P.mo && typeof MutationObserver !== "undefined") {
    P.mut = 0; P.mo = new MutationObserver((l) => { P.mut += l.length; });
    P.mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
  }
  return { at: performance.now(), pipes: P.pipes.length, matMiss: ms ? ms.matMiss : null, matEvict: ms ? ms.matEvict : null,
    mats: ms ? ms.mats : null, pool: ms ? ms.pool : null, rObj: ms ? ms.rObj : null, mut: P.mut || 0 };
}

// Per-press deltas, then the worst rAF gap in the first second after the press.
export function pressDelta(a, b, frames) {
  const d = (k) => (a[k] == null || b[k] == null ? null : b[k] - a[k]);
  return { pipes: d("pipes"), matMiss: d("matMiss"), matEvict: d("matEvict"), pool: d("pool"), rObj: d("rObj"), mut: d("mut"),
    frameMax: frames && frames.length ? Math.max(...frames) : null };
}

async function run(o) {
  const server = await startStaticServer(process.cwd());
  let browser = null;
  const out = { started: new Date().toISOString(), ...o };
  try {
    browser = await launchChromium({ args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(([gl]) => {
      window.__TEST_MODE = true;
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", gl);
      localStorage.setItem("apex26.gfxPreset", '"medium"');
    }, [o.backend === "tlx-gl" ? "1" : "0"]);
    await gotoGame(page, server.url, 180000);
    out.hook = await page.evaluate(hookPipelines);
    await page.evaluate(async (t) => { const A = window.__apex; await A.race(t); A.go(); }, o.track);
    await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
    await page.evaluate(({ cam, mirror }) => { const A = window.__apex; try { A.camera(cam); } catch (_) { /* unknown mode: keep default */ } if (mirror !== "auto") try { A.mirror(mirror); } catch (_) { /* no mirror hook */ } }, o);
    // Drive on the throttle with BOOST off (the warm list's chance), then BOOST on with the throttle still held:
    // the first ERS deploy, exactly the iPhone sequence (GAS held when BOOST lands).
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(o.warm * 1000);
    out.pre = await page.evaluate(() => {
      const P = window.__edc, T = GLX.__tlx; let ms = null; try { ms = T.memState(); } catch (_) { /* no memState */ }
      let st = null; try { st = T.backendState(); } catch (_) { /* none */ }
      return { pipes: P.pipes.length, matMissKeys: ms && ms.matMissKeys, matMisses: ms && ms.matMisses, api: st && st.api, mirror: (() => { try { return window.__apex.mirror(); } catch (_) { return null; } })() };
    });
    await page.evaluate(() => { const P = window.__edc; P.boostAt = performance.now(); P.preCount = P.pipes.length; window.__apex.setBoost(true);
      const F = P.frames = []; let last = -1; const end = performance.now() + 3000;
      requestAnimationFrame(function f(t) { if (last >= 0) F.push(Math.round(t - last)); last = t; if (t < end) requestAnimationFrame(f); }); });
    await page.waitForTimeout(o.after * 1000);
    out.post = await page.evaluate(() => {
      const P = window.__edc, T = GLX.__tlx; let ms = null; try { ms = T.memState(); } catch (_) { /* no memState */ }
      const me = window.__apex.carState().find((c) => c.boostOn) || null;
      return { deployed: !!(me && me.deploying), energy: me && me.energy, lazy: P.pipes.slice(P.preCount).map((p) => ({ ...p, at: Math.round(p.at - P.boostAt) })),
        matMissKeys: ms && ms.matMissKeys, matMisses: ms && ms.matMisses, frameMax: P.frames.length ? Math.max(...P.frames) : null, frames: P.frames.slice(0, 40) };
    });
    // --presses N: the EVERY-press question (Bryce 2026-10-24, "every press, a hitch"). BOOST off, then N
    // more presses spaced --gap s apart, each held --hold s; the off window before each is the control.
    out.presses = [];
    for (let i = 0; i < o.presses; i++) {
      await page.evaluate(() => window.__apex.setBoost(false));
      const c0 = await page.evaluate(pressSnap);
      await page.waitForTimeout(Math.max(0, o.gap - o.hold) * 1000);
      const a = await page.evaluate(pressSnap);
      await page.evaluate(() => { const P = window.__edc; window.__apex.setBoost(true);
        const F = P.pf = []; let last = -1; const end = performance.now() + 1000;
        requestAnimationFrame(function f(t) { if (last >= 0) F.push(Math.round(t - last)); last = t; if (t < end) requestAnimationFrame(f); }); });
      await page.waitForTimeout(o.hold * 1000);
      const r = await page.evaluate(() => ({ s: null, f: window.__edc.pf.slice(), dep: !!(window.__apex.carState().find((c) => c.boostOn) || {}).deploying }));
      const b = await page.evaluate(pressSnap);
      out.presses.push({ n: i + 2, deployed: r.dep, press: pressDelta(a, b, r.f), control: pressDelta(c0, a, null) });
    }
    await page.keyboard.up("ArrowUp");
  } finally {
    mkdirSync(path.dirname(o.json), { recursive: true });
    writeFileSync(o.json, JSON.stringify(out, null, 2));
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]);
    if (server.close) server.close();
  }
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const r = await run(o);
  const pre = r.pre || {}, post = r.post || {};
  const missNew = (post.matMissKeys || []).filter((k) => !(pre.matMissKeys || []).includes(k));
  console.log(`= ers-deploy-census backend=${o.backend} cam=${o.cam} mirror=${o.mirror} api=${pre.api} hook=${r.hook} deployed=${post.deployed} ` +
    `pre=${pre.pipes} lazy=${(post.lazy || []).length} misses=${missNew.length} frameMax=${post.frameMax}`);
  for (const p of post.lazy || []) console.log(`  +${p.at}ms ${p.obj} ${p.mat} pass=${p.pass} rt=${p.rt} attrs=${p.attrs} parents=${p.parents} ${p.ms}ms${p.async ? " async" : ""}`);
  for (const k of missNew) console.log(`  miss ${k}`);
  for (const p of r.presses || []) {
    const f = (x) => `pipes=${x.pipes} matMiss=${x.matMiss} matEvict=${x.matEvict} pool=${x.pool} rObj=${x.rObj} mut=${x.mut}`;
    console.log(`  press ${p.n} deployed=${p.deployed} ${f(p.press)} frameMax=${p.press.frameMax} | control ${f(p.control)}`);
  }
  console.log("json: " + o.json);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
