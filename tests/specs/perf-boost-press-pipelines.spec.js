// @ts-check
// BOOST must not compile anything after its first use: the 2nd..Nth spaced press re-mints ZERO BOOST pipelines.
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
//   - presses 2..PRESSES, each spaced by BOOST off for SPACING frames, build NO pipeline on a lit mesh layout (the
//     BOOST/deploy draws): one that compiles again is a per-press re-mint — a hitch on EVERY press. The fx particle
//     streams' own background re-mint (#3713) must not run faster in the press windows than in the matched control
//     windows. Both rules: tools/perf/boost-press-census.mjs boostVerdict.
//   - every press really deployed (carEffects().ersDeploy) — a press that never deployed would pass vacuously.
//   - before each press, a control window of the same length with BOOST off counts what ordinary driving builds
//     (reported as an annotation): a press window that builds while its control window stays at 0 is BOOST's.
// This file is the TLX WebGPU leg (Bryce's path); perf-boost-press-pipelines-gl.spec.js is TLX on WebGL2 (one leg per
// spec file: a second TLX boot in one Chromium process stalls — tools/perf/boost-press-census.mjs). Where the runner has no
// WebGPU adapter (CI's llvmpipe), three falls back to WebGL2 and this leg says so in an annotation.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureBoostPresses, boostVerdict } from "../../tools/perf/boost-press-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("TLX WebGPU: BOOST presses 2..N re-mint no BOOST pipelines and add no background ones", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const { hook, presses } = await measureBoostPresses(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: the WebGPU leg ran on three's WebGL2 backend" });
  testInfo.annotations.push({ type: "press 1", description: `${presses[0].pipelines} pipelines on the first press (first-use warm-up, #3677)` });
  testInfo.annotations.push({ type: "control windows", description: presses.map((p) => p.control).join(",") + " pipelines in the equal no-BOOST windows" });
  for (const p of presses) expect(p.deployed, `press ${p.press} never deployed ERS: the count would pass vacuously`).toBe(true);
  const v = boostVerdict(presses);
  testInfo.annotations.push({ type: "fx streams", description: `${v.fxPress} in presses 2..N vs ${v.fxCtrl} in their control windows (background, #3713)` });
  expect(v.fail, v.fail.join("; ")).toEqual([]);
});
