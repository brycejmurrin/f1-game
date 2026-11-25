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
//   - before each press, a control window of the same length with BOOST off counts what ordinary driving builds
//     (reported as an annotation): a press window that builds while its control window stays at 0 is BOOST's.
// This file is the TLX WebGL2 leg (tlxForceGL); perf-boost-press-pipelines.spec.js is TLX on WebGPU, Bryce's path.
// One leg per spec file: a second TLX boot in one Chromium process stalls (tools/perf/boost-press-census.mjs).
// RUNTIME (#6669, #6673): on CI's llvmpipe this leg drew under 1 fps and its 510 live ticks hit the 900 s budget
// (903.7 s, 905.5 s; a 652 s pass). It now runs the game's own software-GL race path (swRaceShed: 0.5 scale + tier 4
// from race entry; Bryce's "A + small post check", 2026-11-25). Same windows, same presses, same verdict for lit-mesh
// and fx churn: a pipeline's key never holds a target's size. The post chain is OFF here; its per-press re-mint
// is pinned by perf-boost-press-post-gl.spec.js (two presses, post chain on).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureBoostPresses, boostVerdict } from "../../tools/perf/boost-press-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("TLX WebGL2: BOOST presses 2..N re-mint no BOOST pipelines and add no background ones", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const { hook, presses, render, warmMs } = await measureBoostPresses(page, { forceGL: true, bootMs: BOOT_MS * 2, swRaceShed: true,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  testInfo.annotations.push({ type: "render", description: JSON.stringify(render) });
  // The cut only costs time, never the verdict; a cut that did not take fails by name, not as a 900 s timeout.
  expect(render.before, "the software race cut must hold from the warm-up window to the last press").toEqual(render.after);
  expect(render.before.scale, "apex26.swRaceShed=1 must present at 0.5 (llvmpipe is software GL)").toBeCloseTo(0.5, 2);
  expect(render.before.tier, "apex26.swRaceShed=1 must pin tier 4").toBe(4);
  testInfo.annotations.push({ type: "timings", description: `warm-up ${warmMs} ms; presses ${presses.map((p) => p.ms).join(",")} ms` });
  testInfo.annotations.push({ type: "press 1", description: `${presses[0].pipelines} pipelines on the first press (first-use warm-up, #3677)` });
  testInfo.annotations.push({ type: "control windows", description: presses.map((p) => p.control).join(",") + " pipelines in the equal no-BOOST windows" });
  for (const p of presses) expect(p.deployed, `press ${p.press} never deployed ERS: the count would pass vacuously`).toBe(true);
  const v = boostVerdict(presses);
  testInfo.annotations.push({ type: "fx streams", description: `${v.fxPress} in presses 2..N vs ${v.fxCtrl} in their control windows (background, #3713)` });
  expect(v.fail, v.fail.join("; ")).toEqual([]);
});
