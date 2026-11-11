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
  // FIRST DRAWS (#5387). A geometry drawn for the first time gets a new render object, and three binds it inside
  // Bindings.getForRender: one bindGroup_object plus its uniform buffers. That is content entering view, not churn
  // (measured on the tip, 8 runs: 5 red, each ONE frame minting 33-48 render objects for never-drawn geometry at
  // frame 799-957, and nothing in any other window; the 120 warm frames do not cover the lap). So every device
  // object minted while getForRender binds such a render object is tagged firstDraw and counted apart; a render
  // object rebuilt for a geometry already drawn (released and minted again) stays untagged and fails the spec.
  P.bindGroupsFirst = 0; P.buffersFirst = 0; P.firstDrawObjects = 0; P.firstDrawLog = []; P.firstDrawHooked = false;
  const binds = T.renderer._bindings;
  let firstNow = false;
  if (binds && typeof binds.getForRender === "function") {
    const seenGeo = new WeakSet(), og = binds.getForRender;
    P.firstDrawHooked = true;
    binds.getForRender = function (ro) {
      const geo = ro && ro.geometry, first = !!geo && !seenGeo.has(geo);
      if (!first) return og.apply(this, arguments);
      seenGeo.add(geo);
      if (P.gpuLogOn) {
        P.firstDrawObjects++;
        try {
          const pos = geo.attributes && geo.attributes.position;
          if (P.firstDrawLog.length < 100) P.firstDrawLog.push({ at: P.frames, obj: ((ro.object && ro.object.type) || "") + ":" + ((ro.object && ro.object.name) || ""),
            mat: ((ro.material && ro.material.type) || "") + ":" + ((ro.material && ro.material.name) || ""), verts: pos ? pos.count : null });
        } catch (_) { /* naming is best-effort */ }
      }
      firstNow = true;
      try { return og.apply(this, arguments); } finally { firstNow = false; }
    };
  }
  const dev = be.device;
  if (dev && typeof dev.createBindGroup === "function" && typeof dev.createBuffer === "function") {
    P.gpuDevice = true;
    const wrap = (name, key) => {
      const orig = dev[name];
      dev[name] = function (desc) {
        P[key]++;
        if (firstNow) P[key + "First"]++;
        try { if (P.gpuLogOn && P.gpuLog.length < 200) P.gpuLog.push({ at: P.frames, kind: name, firstDraw: firstNow, label: String((desc && desc.label) || "(none)").slice(0, 80), size: desc && desc.size, usage: desc && desc.usage,
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

/** Boot TLX (forceGL selects three's WebGL2 backend), race monza with GAS held through `gas(true|false)`
 *  (the spec passes page.keyboard), warm WARM_FRAMES, then count pipelines in WINDOWS equal windows. */
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
  const warm = await page.evaluate(() => { window.__bpp.gpuLogOn = true; return window.__bpp.count; });
  const windows = [];
  for (let i = 1; i <= WINDOWS; i++) {
    const snap = () => page.evaluate(() => { const P = window.__bpp;
      return { p: P.count, bg: P.bindGroups, b: P.buffers, g: P.gpuLog.length, bgF: P.bindGroupsFirst, bF: P.buffersFirst, fd: P.firstDrawObjects }; });
    const c0 = await snap();
    await frames(page, WINDOW_FRAMES);
    const c1 = await snap();
    windows.push({ window: i, pipelines: c1.p - c0.p, built: await page.evaluate(([a, b]) => window.__bpp.log.slice(a, b), [c0.p, c1.p]),
      bindGroups: c1.bg - c0.bg, buffers: c1.b - c0.b, gpuBuilt: await page.evaluate(([a, b]) => window.__bpp.gpuLog.slice(a, b), [c0.g, c1.g]),
      firstDrawBindGroups: c1.bgF - c0.bgF, firstDrawBuffers: c1.bF - c0.bF, firstDrawObjects: c1.fd - c0.fd });
  }
  await gas(false);
  const { gpuDevice, firstDrawLog, firstDrawHooked } = await page.evaluate(() => ({ gpuDevice: window.__bpp.gpuDevice,
    firstDrawLog: window.__bpp.firstDrawLog, firstDrawHooked: window.__bpp.firstDrawHooked }));
  const out = { hook, forceGL, warm, gpuDevice, firstDrawHooked, firstDrawLog, windows };
  mkdirSync("artifacts/perf", { recursive: true });
  writeFileSync(`artifacts/perf/idle-pipeline-churn-${forceGL ? "gl" : "gpu"}.json`, JSON.stringify(out, null, 1));
  return out;
}
