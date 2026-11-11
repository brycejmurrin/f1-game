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
  const { hook, warm, gpuDevice, firstDrawHooked, firstDrawLog = [], windows } = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: ran on three's WebGL2 backend" });
  testInfo.annotations.push({ type: "windows", description: `${warm} pipelines through warm-up; per window ${windows.map((w) => w.pipelines).join(",")}` });
  const churn = windows.filter((w) => w.pipelines > 0);
  expect(churn.map((w) => ({ window: w.window, pipelines: w.pipelines, built: w.built.slice(0, 6) })),
    "idle windows that minted render pipelines (#3713: a pipeline released and built again while nothing changed)").toEqual([]);
  // The twin (#4783): idle createBindGroup / createBuffer == 0 after warm, culprit labels logged. Only on a real
  // GPUDevice; the WebGL2 fallback has none, so there the check would pass vacuously and is skipped.
  if (gpuDevice) {
    testInfo.annotations.push({ type: "gpu-churn", description: `per window bindGroups ${windows.map((w) => w.bindGroups).join(",")} buffers ${windows.map((w) => w.buffers).join(",")}` });
    // FIRST DRAWS ARE NOT CHURN. A geometry's FIRST draw makes its vertex/index buffer inside three's updateForRender
    // (measured on lavapipe: one 90480 B index buffer in window 3, same frame in two runs), and its new render object
    // gets a bind group and uniform buffers inside Bindings.getForRender. The 120 warm frames do not cover the lap, so
    // where the car reaches new scenery first draws land in an idle window: measured on the tip (#5387, 8 runs), 5 red,
    // each ONE frame minting 33-48 render objects for never-drawn geometry, nothing in any other window. The driver
    // tags every device object minted while a never-drawn geometry is bound (firstDraw); those are reported, not
    // failed. A render object rebuilt for a geometry ALREADY drawn (released and minted again) is untagged and fails,
    // and a first-draw buffer size that recurs in a second window is a geometry released and rebuilt.
    expect(firstDrawHooked, "the census must reach three's Bindings.getForRender to tell a first draw from churn").toBe(true);
    testInfo.annotations.push({ type: "first-draw-objects", description: `per window ${windows.map((w) => `${w.firstDrawObjects}ro/${w.firstDrawBindGroups}bg`).join(",")}; ` +
      firstDrawLog.slice(0, 8).map((r) => `${r.obj}|${r.mat}|${r.verts}v@${r.at}`).join(" ") });
    const firstUse = (b) => b.firstDraw || (b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "") && /updateForRender/.test(b.from || ""));
    const other = windows.map((w) => ({ window: w.window, bindGroups: w.bindGroups - w.firstDrawBindGroups, built: w.gpuBuilt.filter((b) => !firstUse(b)).slice(0, 6) }))
      .filter((w) => w.bindGroups > 0 || w.built.length > 0);
    expect(other, "idle windows that created bind groups or buffers after warm-up for anything but a first draw").toEqual([]);
    const attr = (b) => !b.firstDraw && b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "");
    const seen = new Map();
    for (const w of windows) for (const b of w.gpuBuilt.filter(attr)) { const k = String(b.size); seen.set(k, (seen.get(k) || new Set()).add(w.window)); }
    testInfo.annotations.push({ type: "first-draw-buffers", description: [...seen].map(([size, ws]) => `${size}B@w${[...ws].join(",")}`).join(" ") || "none" });
    expect([...seen].filter(([, ws]) => ws.size > 1).map(([size, ws]) => ({ size, windows: [...ws] })),
      "a first-draw buffer size that recurs across idle windows is a geometry released and rebuilt").toEqual([]);
  } else {
    // No GPUDevice to wrap: the bind-group / buffer check could not observe anything. Say so; never a vacuous 0.
    testInfo.annotations.push({ type: "gpu-churn", description: "blind: no GPUDevice on this run (WebGL2 path), bind-group / buffer churn not measured" });
  }
});
