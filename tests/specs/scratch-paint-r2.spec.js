// @ts-check
// SCRATCH DIAGNOSTIC COPY (#5387) of perf-idle-pipeline-churn.spec.js — never merged.
// Steady driving must not compile anything: after a warm-up, equal idle race windows build ZERO render pipelines.
//
// #3713 (A·W50): the BOOST gate's no-BOOST control windows still built an fx particle-stream pipeline
// (attributes fxAlpha, fxColor, fxCorner, fxSize, position) — three releasing a pipeline and minting it again
// while nothing changed. On Bryce's iPhone (THREE PATH: WEBGPU) every re-mint is a compile stall in the
// middle of a lap. Counted exactly through renderer.backend.createRenderPipeline (WebGPU and WebGL2
// backends alike; counts are exact on a software adapter even where ms are not).
//
// What this pins: TLX on three's WebGPU backend, monza, GAS held on the real keyboard, no BOOST, 120 warm
// frames, a warm pass over the counted stretch, a jump back to its start, then 6 windows of 60 frames over road
// already drawn (#5387), with the performance governor's render scale pinned and its tier held across both passes
// (a governor step re-creates the post targets: a resize, an intended cost of its own, not steady-state churn)
// — every window builds 0 pipelines. Driver:
// tools/perf/idle-pipeline-census.mjs. Red on the tree of 2026-10-24 by design until #3713 lands.
// Where the runner has no WebGPU adapter (CI's llvmpipe) three falls back to WebGL2 and an annotation says so.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";
import { diagHooks, groupRows } from "../helpers/scratch-diag.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test.describe.configure({ retries: 0 });
test("SCRATCH paint normal r2: steady driving builds no render pipelines after warm-up", async ({ page }, testInfo) => {
  await page.addInitScript(diagHooks);
  test.setTimeout(900000);
  const { hook, warm, gpuDevice, replay, gov, windows } = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  {   // SCRATCH: name the call site of every new render object, and every rebind
    const D = await page.evaluate(() => window.__dg).catch((e) => ({ err: String(e) }));
    const site = (r) => (r.mk ? (r.mk.on ? "AFTER:" : "before:") + r.mk.s.split(" < ").slice(0, 3).join(" < ") : "-");
    const roG = groupRows(D.ro, ["kind", "verts", "key", "ident", "geoSeen", site]);
    const rbG = groupRows(D.rb, ["obj", "verts", "bg", (r) => (r.changed || []).map((c) => c.name + ":" + c.tex + ":" + c.wh).join("+")]);
    console.log("DIAG " + JSON.stringify({ burn: 0, gov, replay, w: windows.map((w) => [w.pipelines, w.bindGroups, w.buffers]), nRO: (D.ro || []).length, nRB: (D.rb || []).length,
      mkWrapped: D.mkWrapped, err: D.err, roFrames: [...new Set((D.ro || []).map((r) => r.at))].slice(0, 20), roG, rbG: rbG.slice(0, 8) }));
  }
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: ran on three's WebGL2 backend" });
  // The counted windows must stay on the stretch the warm pass drew, or new scenery enters and a first draw reads
  // as churn (#5387): the census says how far each pass went.
  testInfo.annotations.push({ type: "replay", description: JSON.stringify(replay) });
  expect(replay.jumped, "the census must jump back to the warm pass's start (__apex.jump)").toBe(true);
  expect(replay.countedM, `the counted windows drove past the warmed stretch (${JSON.stringify(replay)})`).toBeLessThanOrEqual(replay.warmM);
  // The governor was held for both passes (#5387): a scale step or a tier shed inside them would be a resize or a
  // feature change, not steady driving. The pin must have held.
  testInfo.annotations.push({ type: "governor", description: JSON.stringify(gov) });
  expect({ scale: gov.scale, tier: gov.tier }, `the governor moved while held (${JSON.stringify(gov)})`).toEqual({ scale: gov.scale0, tier: gov.tier0 });
  testInfo.annotations.push({ type: "windows", description: `${warm} pipelines through warm-up; per window ${windows.map((w) => w.pipelines).join(",")}` });
  const churn = windows.filter((w) => w.pipelines > 0);
  expect(churn.map((w) => ({ window: w.window, pipelines: w.pipelines, built: w.built.slice(0, 6) })),
    "idle windows that minted render pipelines (#3713: a pipeline released and built again while nothing changed)").toEqual([]);
  // The twin (#4783): idle createBindGroup / createBuffer == 0 after warm, culprit labels logged. Only on a real
  // GPUDevice; the WebGL2 fallback has none, so there the check would pass vacuously and is skipped.
  if (gpuDevice) {
    testInfo.annotations.push({ type: "gpu-churn", description: `per window bindGroups ${windows.map((w) => w.bindGroups).join(",")} buffers ${windows.map((w) => w.buffers).join(",")}` });
    // A geometry's FIRST draw makes its vertex/index buffer inside three's updateForRender (measured on lavapipe:
    // one 90480 B index buffer in window 3, same frame in two runs). That is a mesh coming into view, not churn, so
    // it is reported (annotation) and not failed; a size that recurs in a second window IS churn (released and
    // rebuilt). Everything else, and every bind group, must be 0.
    const firstUse = (b) => b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "") && /updateForRender/.test(b.from || "");
    const other = windows.map((w) => ({ window: w.window, bindGroups: w.bindGroups, built: w.gpuBuilt.filter((b) => !firstUse(b)).slice(0, 6) }))
      .filter((w) => w.bindGroups > 0 || w.built.length > 0);
    expect(other, "idle windows that created bind groups or non-first-draw buffers after warm-up").toEqual([]);
    const seen = new Map();
    for (const w of windows) for (const b of w.gpuBuilt.filter(firstUse)) { const k = String(b.size); seen.set(k, (seen.get(k) || new Set()).add(w.window)); }
    testInfo.annotations.push({ type: "first-draw-buffers", description: [...seen].map(([size, ws]) => `${size}B@w${[...ws].join(",")}`).join(" ") || "none" });
    expect([...seen].filter(([, ws]) => ws.size > 1).map(([size, ws]) => ({ size, windows: [...ws] })),
      "a first-draw buffer size that recurs across idle windows is a geometry released and rebuilt").toEqual([]);
  } else {
    // No GPUDevice to wrap: the bind-group / buffer check could not observe anything. Say so; never a vacuous 0.
    testInfo.annotations.push({ type: "gpu-churn", description: "blind: no GPUDevice on this run (WebGL2 path), bind-group / buffer churn not measured" });
  }
});
