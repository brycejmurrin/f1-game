// @doc Idle pipeline-churn census: three createRenderPipeline per equal idle race window (GAS held, no BOOST).
// tools/perf/idle-pipeline-census.mjs — the page driver behind tests/specs/perf-idle-pipeline-churn.spec.js.
//
// The BOOST gate (perf-boost-press-pipelines*.spec.js) found a pipeline that is NOT BOOST's: an fx
// particle-stream quad (attributes fxAlpha, fxColor, fxCorner, fxSize, position) built again in the
// no-BOOST control windows, i.e. three released a pipeline and minted it again while the player just drove
// (#3713). On a phone each re-mint is a compile stall. This census drives the same race with nothing
// changing and counts every pipeline built per window after a warm-up: steady driving must build none.
//
// One leg per Chromium process: a second TLX boot in one process stalls (measured 2026-10-24).
// Self-contained on purpose: the pipeline hook below is the same one as the BOOST gate's census, copied so this
// gate can land with #3713 without waiting for the BOOST gate's PR (#3677).
import { mkdirSync, writeFileSync } from "node:fs";
import { raceGate } from "../lib/census-entry.mjs";

// Page side: count every pipeline three's backend builds, and our own frame counter.
export function hookPipelines() {
  const P = window.__bpp = { count: 0, log: [], frames: 0 };
  const tick = () => { P.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
  if (!be || typeof be.createRenderPipeline !== "function") return "no three backend";
  const o = be.createRenderPipeline;
  be.createRenderPipeline = function (ro) {
    P.count++;
    try {
      const m = (ro && ro.material) || {}, ob = (ro && ro.object) || {}, g = (ro && ro.geometry) || {}, c = (ro && ro.context) || {};
      let par = ob.parent; const chain = []; for (let i = 0; par && i < 4; i++) { chain.push(par.name || par.type); par = par.parent; }
      const rt = c.renderTarget ? (c.renderTarget.texture && c.renderTarget.texture.name || c.renderTarget.name || "rt") + ":" + c.width + "x" + c.height : "canvas";
      if (P.log.length < 200) P.log.push({ at: P.frames, mat: (m.type || "") + ":" + (m.name || ""), obj: (ob.type || "") + ":" + (ob.name || ""),
        parents: chain.join("<"), rt, attrs: Object.keys(g.attributes || {}).sort().join(","), transparent: !!m.transparent });
    } catch (_) { /* naming is best-effort */ }
    return o.apply(this, arguments);
  };
  // The twin counters (#4783): bind groups and buffers minted on the GPUDevice itself, with the label of the
  // first few so a culprit is named. WebGL2 has no device: both stay 0 and `gpuDevice` says so.
  P.bindGroups = 0; P.buffers = 0; P.gpuLog = []; P.gpuDevice = false; P.gpuLogOn = false;   // the log opens after warm-up: warm-up alone fills any cap
  // WHOSE bind group (deploy red 2026-11-25): three labels an object group "bindGroup_object", which names no culprit.
  // Bindings.getForRender(renderObject) is the frame that mints a render object's bindings, so while it runs
  // P.ro names that object (type:name, material, parent chain, geometry, render target) for the gpuLog rows.
  P.ro = null;
  const bnd = T.renderer._bindings;
  if (bnd && typeof bnd.getForRender === "function") {
    const og = bnd.getForRender;
    bnd.getForRender = function (ro) {
      const prev = P.ro;
      if (P.gpuLogOn) {
        try {
          const ob = (ro && ro.object) || {}, m = (ro && ro.material) || {}, g = (ro && ro.geometry) || ob.geometry || {}, c = (ro && ro.context) || {};
          let par = ob.parent; const chain = []; for (let i = 0; par && i < 4; i++) { chain.push(par.name || par.type); par = par.parent; }
          const rt = c.renderTarget ? (c.renderTarget.texture && c.renderTarget.texture.name || c.renderTarget.name || "rt") + ":" + c.width + "x" + c.height : "canvas";
          const ud = ob.userData || {};
          P.ro = (ob.type || "") + ":" + (ob.name || "") + " mat " + (m.type || "") + ":" + (m.name || "") + " geo " + (g.type || "") + ":" + (g.name || "") + "#" + (g.id | 0) +
            " in " + (chain.join("<") || "-") + " rt " + rt + (ob.__tlxIdent ? " pool" : "") + (ud.tlxLgRoad ? " road" : "");
        } catch (_) { P.ro = "(unnamed)"; }
      }
      try { return og.apply(this, arguments); } finally { P.ro = prev; }
    };
  }
  const dev = be.device;
  if (dev && typeof dev.createBindGroup === "function" && typeof dev.createBuffer === "function") {
    P.gpuDevice = true;
    const wrap = (name, key) => {
      const orig = dev[name];
      dev[name] = function (desc) {
        P[key]++;
        try { if (P.gpuLogOn && P.gpuLog.length < 200) P.gpuLog.push({ at: P.frames, kind: name, label: String((desc && desc.label) || "(none)").slice(0, 80), size: desc && desc.size, usage: desc && desc.usage, ro: P.ro ? String(P.ro).slice(0, 240) : undefined,
          from: (new Error().stack || "").split("\n").slice(2, 9).map((l) => l.trim().replace(/^at\s+/, "").replace(/\?v=[a-z0-9]+/g, "").replace(/https?:\/\/[^\s)]*\//g, "")).join(" < ").slice(0, 600) }); } catch (_) { /* naming is best-effort */ }
        return orig.apply(this, arguments);
      };
    };
    wrap("createBindGroup", "bindGroups");
    wrap("createBuffer", "buffers");
  }
  let api = null; try { api = T.backendState().api; } catch (_) { /* older TLX */ }
  return "ok " + (api || (be.isWebGPUBackend ? "webgpu" : "webgl2"));
}

export async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__bpp.frames);
  await page.waitForFunction(([f, k]) => window.__bpp.frames >= f + k, [f0, n], { polling: 100, timeout: 180000 });
}

export const WARM_FRAMES = 120;   // driving on the throttle until everything the lap draws has been seen once
export const WINDOWS = 6;
export const WINDOW_FRAMES = 60;
export const SPREAD_FRAMES = 120;   // the spread leg (#6485): ~2 s at 60 fps for every rival to settle its tier
export const REPLAY_MARGIN = 1.5;   // the warm pass drives the counted frames x this, so a slower counted pass stays on warmed road

/** Boot TLX (forceGL selects three's WebGL2 backend), race monza with GAS held through `gas(true|false)`
 *  (the spec passes page.keyboard), warm WARM_FRAMES, drive the counted stretch once (the warm pass), reset the field,
 *  then count pipelines in WINDOWS equal windows over that same stretch. */
export async function measureIdleWindows(page, { forceGL, bootMs, gas }) {
  await page.addInitScript((gl) => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", gl);
      localStorage.setItem("apex26.gfxPreset", '"medium"');
      localStorage.setItem("apex26.gfxBootStepMs", "45000");   // TLX init can exceed 8 s on a busy software-GL runner
    } catch (_) { /* private mode */ }
  }, forceGL ? "1" : "0");
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof GLX !== "undefined" && !!GLX.__tlx, null, { polling: 100, timeout: bootMs });
  const hook = await page.evaluate(hookPipelines);
  if (!/^ok /.test(hook)) return { hook, windows: [] };
  await page.evaluate(() => { window.__apex.race("monza"); });
  await page.waitForFunction(() => { try { const i = window.__apex.info(); return i.track === "monza" && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    null, { polling: 200, timeout: 300000 });
  await page.evaluate(() => window.__apex.go());
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  await gas(true);
  await frames(page, WARM_FRAMES);
  // THE GOVERNOR IS HELD FOR BOTH PASSES (#5387). PerfGov steps the render scale when frames run slow (a busy runner,
  // a CPU burn), and each step re-creates the post targets: three rebinds the ~10 fullscreen passes that sample them
  // (diagnostic run 42949086546: 549x254 -> 422x195 -> 633x293 under burn). That is a resize, a separate and intended
  // cost, not idle churn. Pin the scale where it is and hold the tier; the spec asserts both held, then both are released.
  const govAt = () => page.evaluate(() => { const r = window.__apex.renderScale({ lite: true }); return { scale: r.scale, tier: r.tier }; });
  const gov0 = await govAt();
  await page.evaluate((v) => { window.__apex.renderScale(v); window.__apex.govHold(true); }, gov0.scale);
  // THE COUNTED WINDOWS REPLAY A STRETCH THE WARM-UP ALREADY DREW (#5387). Frames are not distance: 120 warm frames
  // left the car short of scenery it then reached inside a window, and every geometry, pool wrapper and pass seen
  // there for the first time minted its render object and bind groups. Measured on the tip, 8 runs: 5 red, each one
  // frame (799-957) minting 33-48 render objects; under a per-frame CPU burn (the car further per frame) 8 of 8 red,
  // in up to 4 windows. So: note where the car is, drive the windows' frames again with margin (the warm pass), jump
  // back to that spot at that speed and count over road whose draws have all been seen. What a window builds then is
  // churn — "nothing changed" holds by construction — and the run says how far each pass got.
  // Rewind the field as well as the player. A player-only jump leaves rivals farther along
  // the course, so a car first entering the camera or shadow pass can allocate during replay.
  const start = await page.evaluate(() => {
    const p = window.__apex.physState();
    return { fraction: p.s / window.__apex.info().total, speed: p.speed, x: p.x };
  });
  const restart = () => page.evaluate(({ fraction, speed, x }) => {
    if (!window.__apex.reset(fraction, speed, x, 3713)) throw new Error("Could not reset the census race field");
    window.__apex.snapCam();
    return window.__apex.physState().prog;
  }, start);
  const progress = () => page.evaluate(() => window.__apex.physState().prog);
  const warmStart = await restart();
  await frames(page, Math.ceil(WINDOWS * WINDOW_FRAMES * REPLAY_MARGIN));
  const warmM = (await progress()) - warmStart;
  const prog0 = await restart();
  const warm = await page.evaluate(() => { window.__bpp.gpuLogOn = true; return window.__bpp.count; });
  const windows = [];
  for (let i = 1; i <= WINDOWS; i++) {
    const snap = () => page.evaluate(() => ({ p: window.__bpp.count, bg: window.__bpp.bindGroups, b: window.__bpp.buffers, g: window.__bpp.gpuLog.length }));
    const c0 = await snap();
    await frames(page, WINDOW_FRAMES);
    const c1 = await snap();
    windows.push({ window: i, pipelines: c1.p - c0.p, built: await page.evaluate(([a, b]) => window.__bpp.log.slice(a, b), [c0.p, c1.p]),
      bindGroups: c1.bg - c0.bg, buffers: c1.b - c0.b, gpuBuilt: await page.evaluate(([a, b]) => window.__bpp.gpuLog.slice(a, b), [c0.g, c1.g]) });
  }
  const replay = { warmStart, countedStart: prog0, warmM: Math.round(warmM), countedM: Math.round((await progress()) - prog0) };
  // THE SPREAD LEG (#6485): the field above stays bunched, so no rival changes LOD tier and no shared mesh reaches a new
  // most-in-view count. Here, unwarmed, half the rivals jump to tier 1 (55-115 m: compound stripes on) and half past the
  // far-body cut (280-460 m: the far-LOD wheel pair), on one compound. TLX mints a pool wrapper per occurrence, so a
  // count CarDraw.primeRace did not reach shows up as bind groups in this window.
  const spread = await (async () => {
    const placed = await page.evaluate(() => {
      const A = window.__apex, n = Math.max(0, (A.fieldState() || []).length - 1), list = [];
      for (let i = 0; i < n; i++) {
        const near = i % 2 === 0, j = i >> 1;
        list.push({ dProg: near ? 55 + j * 6 : 280 + j * 18, dx: (i % 4 < 2 ? -1 : 1) * (1 + (j % 3) * 1.5) });
      }
      const ids = A.rivals(list);
      A.snapCam();
      return Array.isArray(ids) ? ids.length : 0;
    });
    const snap = () => page.evaluate(() => ({ p: window.__bpp.count, bg: window.__bpp.bindGroups, b: window.__bpp.buffers, g: window.__bpp.gpuLog.length }));
    const c0 = await snap();
    await frames(page, SPREAD_FRAMES);
    const c1 = await snap();
    return { window: "spread", placed, pipelines: c1.p - c0.p, bindGroups: c1.bg - c0.bg, buffers: c1.b - c0.b,
      gpuBuilt: await page.evaluate(([a, b]) => window.__bpp.gpuLog.slice(a, b), [c0.g, c1.g]) };
  })();
  const gov = { scale0: gov0.scale, tier0: gov0.tier, ...(await govAt()) };
  await page.evaluate(() => { window.__apex.govHold(false); window.__apex.renderScale(true); });
  await gas(false);
  const gpuDevice = await page.evaluate(() => window.__bpp.gpuDevice);
  // Whether this run took TLX's soft-blit path (software adapter or headless): the spec exempts that path's readback
  // buffers and asserts the path was on whenever it does (#5387).
  const soft = await page.evaluate(() => { try { const b = GLX.__tlx.backendState(); return { softAdapter: !!b.softAdapter, headless: !!b.headless, softBlit: !!b.softBlit, reads: b.softRead ? b.softRead.gen | 0 : 0 }; } catch (_) { return null; } });
  const out = { hook, forceGL, warm, gpuDevice, replay, gov, soft, windows, spread };
  mkdirSync("artifacts/perf", { recursive: true });
  writeFileSync(`artifacts/perf/idle-pipeline-churn-${forceGL ? "gl" : "gpu"}.json`, JSON.stringify(out, null, 1));
  return out;
}
