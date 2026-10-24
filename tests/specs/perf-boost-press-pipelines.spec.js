// @ts-check
// BOOST must not compile anything after its first use: the 2nd..Nth spaced press builds ZERO render pipelines.
//
// Bryce's top complaint (#3677, docs/notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md, DEVICE-FARM-ANALYSIS-2026-10-24):
// on his iPhone (SETTINGS › THREE PATH: WEBGPU) a BOOST tap with GAS held freezes the frame for 0.7–0.9 s — a
// first-use pipeline compile outside JS. A compile costs milliseconds of SwiftShader time but is still COUNTED
// exactly here: every three.js render pipeline goes through renderer.backend.createRenderPipeline, on the WebGPU
// backend and the WebGL2 one alike (docs/notes/PERF-FINDINGS.md: pipeline counts are exact on a software adapter
// even where milliseconds are not).
//
// What this pins, per leg:
//   - press 1 may build pipelines (that is the open first-press warm-up work, A·W45 #3677) — reported, not asserted;
//   - presses 2..PRESSES, each spaced by BOOST off for SPACING frames, build none. A press that compiles again
//     means a material or pipeline key that churns per press (a fresh material, a toggled define, a new render
//     target size) — a hitch on EVERY press, not just the first.
//   - every press really deployed (carEffects().ersDeploy) — a press that never deployed would pass vacuously.
// Legs: TLX on three's WebGPU backend (Bryce's path) first, then TLX on WebGL2 (tlxForceGL). Where the runner has no
// WebGPU adapter (CI's llvmpipe), three falls back to WebGL2 and the first leg says so in an annotation.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { raceGate } from "../../tools/lib/census-entry.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const PRESSES = 4;
const DEPLOY_FRAMES = 30;   // BOOST on, GAS held: the ERS strip and exhaust FX draw every one of these
const SPACING = 30;         // BOOST off between presses: a "spaced" press, as a player taps it

// Page side: count every pipeline three's backend builds, and our own frame counter.
function hookPipelines() {
  const P = window.__bpp = { count: 0, log: [], frames: 0 };
  const tick = () => { P.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const T = typeof GLX !== "undefined" ? GLX.__tlx : null, be = T && T.renderer && T.renderer.backend;
  if (!be || typeof be.createRenderPipeline !== "function") return "no three backend";
  const o = be.createRenderPipeline;
  be.createRenderPipeline = function (ro) {
    P.count++;
    try {
      const m = (ro && ro.material) || {}, ob = (ro && ro.object) || {};
      if (P.log.length < 200) P.log.push({ at: P.frames, mat: (m.type || "") + ":" + (m.name || ""), obj: (ob.type || "") + ":" + (ob.name || "") });
    } catch (_) { /* naming is best-effort */ }
    return o.apply(this, arguments);
  };
  let api = null; try { api = T.backendState().api; } catch (_) { /* older TLX */ }
  return "ok " + (api || (be.isWebGPUBackend ? "webgpu" : "webgl2"));
}

async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__bpp.frames);
  await page.waitForFunction(([f, k]) => window.__bpp.frames >= f + k, [f0, n], { polling: 100, timeout: 180000 });
}

async function runLeg(page, testInfo, forceGL) {
  test.setTimeout(900000);
  await page.addInitScript((gl) => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", gl);
      localStorage.setItem("apex26.gfxPreset", '"medium"');
      localStorage.setItem("apex26.gfxBootStepMs", "45000");   // TLX init can exceed 8 s on a busy software-GL runner
    } catch (_) { /* private mode */ }
  }, forceGL ? "1" : "0");
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof GLX !== "undefined" && !!GLX.__tlx, null, { polling: 100, timeout: BOOT_MS * 2 });
  const hook = await page.evaluate(hookPipelines);
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!forceGL && !/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: the WebGPU leg ran on three's WebGL2 backend" });

  await page.evaluate(() => { const A = window.__apex; A.race("monza"); });
  await page.waitForFunction(() => { try { const i = window.__apex.info(); return i.track === "monza" && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    null, { polling: 200, timeout: 300000 });
  await page.evaluate(() => window.__apex.go());
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  await page.evaluate(() => window.__apex.setEnergy && window.__apex.setEnergy(1));
  await page.keyboard.down("ArrowUp");   // GAS held, the iPhone sequence
  await frames(page, SPACING);           // driving on the throttle: everything but BOOST is warm

  const presses = [];
  for (let i = 1; i <= PRESSES; i++) {
    const before = await page.evaluate(() => { const A = window.__apex; if (A.setEnergy) A.setEnergy(1); return window.__bpp.count; });
    await page.evaluate(() => window.__apex.setBoost(true));
    let deployed = false;
    const f0 = await page.evaluate(() => window.__bpp.frames);
    await page.waitForFunction(([f, k]) => window.__bpp.frames >= f + k, [f0, 3], { polling: 50, timeout: 60000 });
    deployed = await page.evaluate(() => { const e = window.__apex.carEffects(); return !!(e && e.ersDeploy); });
    await frames(page, DEPLOY_FRAMES);
    await page.evaluate(() => window.__apex.setBoost(false));
    await frames(page, SPACING);
    const after = await page.evaluate(() => window.__bpp.count);
    const built = await page.evaluate(([a, b]) => window.__bpp.log.slice(a, b), [before, after]);
    presses.push({ press: i, deployed, pipelines: after - before, built });
  }
  await page.keyboard.up("ArrowUp");

  const out = { hook, forceGL, presses };
  mkdirSync("artifacts/perf", { recursive: true });
  writeFileSync(`artifacts/perf/boost-press-pipelines-${forceGL ? "gl" : "gpu"}.json`, JSON.stringify(out, null, 1));
  testInfo.annotations.push({ type: "press 1", description: `${presses[0].pipelines} pipelines on the first press (first-use warm-up, #3677)` });
  for (const p of presses) expect(p.deployed, `press ${p.press} never deployed ERS: the count would pass vacuously`).toBe(true);
  for (const p of presses.slice(1)) {
    expect(p.pipelines, `press ${p.press} built ${p.pipelines} render pipelines: ${JSON.stringify(p.built.slice(0, 8))}`).toBe(0);
  }
}

test("TLX WebGPU: BOOST presses 2..N build no render pipelines", async ({ page }, testInfo) => {
  await runLeg(page, testInfo, false);
});

test("TLX WebGL2: BOOST presses 2..N build no render pipelines", async ({ page }, testInfo) => {
  await runLeg(page, testInfo, true);
});
