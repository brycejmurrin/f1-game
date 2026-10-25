// @ts-check
// Steady driving must not compile anything: after a warm-up, equal idle race windows build ZERO render pipelines.
//
// #3713 (A·W50): the BOOST gate's no-BOOST control windows still built an fx particle-stream pipeline
// (attributes fxAlpha, fxColor, fxCorner, fxSize, position) — three releasing a pipeline and minting it again
// while nothing changed. On Bryce's iPhone (THREE PATH: WEBGPU) every re-mint is a compile stall in the
// middle of a lap. Counted exactly through renderer.backend.createRenderPipeline (WebGPU and WebGL2
// backends alike; counts are exact on a software adapter even where ms are not).
//
// What this pins: TLX on three's WebGPU backend, monza, GAS held on the real keyboard, no BOOST, 120 warm
// frames, then 6 windows of 60 frames — every window builds 0 pipelines. Driver:
// tools/perf/idle-pipeline-census.mjs. Red on the tree of 2026-10-24 by design until #3713 lands.
// Where the runner has no WebGPU adapter (CI's llvmpipe) three falls back to WebGL2 and an annotation says so.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("TLX WebGPU: steady driving builds no render pipelines after warm-up", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const { hook, warm, windows } = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: ran on three's WebGL2 backend" });
  testInfo.annotations.push({ type: "windows", description: `${warm} pipelines through warm-up; per window ${windows.map((w) => w.pipelines).join(",")}` });
  const churn = windows.filter((w) => w.pipelines > 0);
  expect(churn.map((w) => ({ window: w.window, pipelines: w.pipelines, built: w.built.slice(0, 6) })),
    "idle windows that minted render pipelines (#3713: a pipeline released and built again while nothing changed)").toEqual([]);
});
