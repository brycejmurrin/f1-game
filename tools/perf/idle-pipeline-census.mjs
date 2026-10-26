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
  const warm = await page.evaluate(() => window.__bpp.count);
  const windows = [];
  for (let i = 1; i <= WINDOWS; i++) {
    const c0 = await page.evaluate(() => window.__bpp.count);
    await frames(page, WINDOW_FRAMES);
    const c1 = await page.evaluate(() => window.__bpp.count);
    windows.push({ window: i, pipelines: c1 - c0, built: await page.evaluate(([a, b]) => window.__bpp.log.slice(a, b), [c0, c1]) });
  }
  await gas(false);
  const out = { hook, forceGL, warm, windows };
  mkdirSync("artifacts/perf", { recursive: true });
  writeFileSync(`artifacts/perf/idle-pipeline-churn-${forceGL ? "gl" : "gpu"}.json`, JSON.stringify(out, null, 1));
  return out;
}
