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
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureBoostPresses } from "../../tools/perf/boost-press-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("TLX WebGL2: BOOST presses 2..N build no render pipelines", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const { hook, presses } = await measureBoostPresses(page, { forceGL: true, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  testInfo.annotations.push({ type: "press 1", description: `${presses[0].pipelines} pipelines on the first press (first-use warm-up, #3677)` });
  testInfo.annotations.push({ type: "control windows", description: presses.map((p) => p.control).join(",") + " pipelines in the equal no-BOOST windows" });
  for (const p of presses) expect(p.deployed, `press ${p.press} never deployed ERS: the count would pass vacuously`).toBe(true);
  for (const p of presses.slice(1)) {
    expect(p.pipelines, `press ${p.press} built ${p.pipelines} render pipelines (#3703): ${JSON.stringify(p.built.slice(0, 8))}`).toBe(0);
  }
});
