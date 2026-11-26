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
// frames, a warm pass over the counted stretch, a seeded field reset to its start, then 6 windows of 60 frames over road
// already drawn (#5387), with the performance governor's render scale pinned and its tier held across both passes
// (a governor step re-creates the post targets: a resize, an intended cost of its own, not steady-state churn)
// — every window builds 0 pipelines. Driver:
// tools/perf/idle-pipeline-census.mjs. Red on the tree of 2026-10-24 by design until #3713 lands.
// Where the runner has no WebGPU adapter (CI's llvmpipe) three falls back to WebGL2 and an annotation says so.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureIdleWindows } from "../../tools/perf/idle-pipeline-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

test("TLX WebGPU: steady driving builds no render pipelines after warm-up", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const { hook, warm, gpuDevice, replay, gov, soft, windows, spread, late } = await measureIdleWindows(page, { forceGL: false, bootMs: BOOT_MS * 2,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  if (!/webgpu/i.test(hook)) testInfo.annotations.push({ type: "fallback", description: "no WebGPU adapter on this runner: ran on three's WebGL2 backend" });
  // The counted windows must stay on the stretch the warm pass drew, or new scenery enters and a first draw reads
  // as churn (#5387): the census says how far each pass went.
  testInfo.annotations.push({ type: "replay", description: JSON.stringify(replay) });
  // Which geometries were bound for the FIRST time after the green flag (#6665), by phase: a mesh primeRace never drew.
  // Diagnostic only, on green runs too; the spread leg's assertion below is the contract.
  testInfo.annotations.push({ type: "late-first-binds", description: (late || []).map((r) => `${r.phase}@${r.at} #${r.geo} ${r.d}`).join(" | ").slice(0, 6000) || "none" });
  expect(replay.countedStart, "both passes must start at the same race progress").toBe(replay.warmStart);
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
    // Whose bind groups (census `ro`, the render object three was binding): the label alone names no culprit.
    const owners = [...new Set(windows.flatMap((w) => w.gpuBuilt.filter((b) => b.kind === "createBindGroup").map((b) => `w${w.window}@${b.at} ${b.ro || "(no render object)"}`)))];
    testInfo.annotations.push({ type: "bind-group-owners", description: owners.join(" | ").slice(0, 4000) || "none" });
    // A geometry's FIRST draw makes its vertex/index buffer inside three's updateForRender (measured on lavapipe:
    // one 90480 B index buffer in window 3, same frame in two runs). That is a mesh coming into view, not churn, so
    // it is reported (annotation) and not failed; a size that recurs in a second window IS churn (released and
    // rebuilt). Everything else, and every bind group, must be 0.
    const firstUse = (b) => b.kind === "createBuffer" && /create(Index)?Attribute/.test(b.from || "") && /updateForRender/.test(b.from || "");
    // The SOFT-BLIT READBACK is not a player's cost (#5387): tlx.js copies each frame back for putImageData only on a
    // software adapter or headless (.claude/rules/render-tlx.md: a headed player has neither flag), and that MAP_READ
    // buffer comes from _startSoftBlitRead. It is skipped by its creating stack only; every bind group stays counted.
    const softRead = (b) => b.kind === "createBuffer" && /_startSoftBlitRead/.test(b.from || "");
    const readbacks = windows.map((w) => w.gpuBuilt.filter(softRead).length);
    testInfo.annotations.push({ type: "soft-blit-readbacks", description: `per window ${readbacks.join(",")}; path ${JSON.stringify(soft)}` });
    if (readbacks.some((n) => n > 0)) {
      expect(!!(soft && (soft.softAdapter || soft.headless) && soft.softBlit), `a readback was exempted, so this run must be on the soft-blit path (${JSON.stringify(soft)})`).toBe(true);
    }
    const other = windows.map((w) => ({ window: w.window, bindGroups: w.bindGroups, built: w.gpuBuilt.filter((b) => !firstUse(b) && !softRead(b)).slice(0, 6) }))
      .filter((w) => w.bindGroups > 0 || w.built.length > 0);
    expect(other, "idle windows that created bind groups or non-first-draw buffers after warm-up").toEqual([]);
    // The spread leg (#6485): rivals jump to tier 1 (compound stripes) and past the far-body cut (far-LOD wheel pair)
    // only now. CarDraw.primeRace drew every such shared mesh at its most-in-view count, so this mints no bind group.
    const spreadBg = spread.gpuBuilt.filter((b) => b.kind === "createBindGroup").map((b) => `@${b.at} ${b.ro || b.label}`);
    testInfo.annotations.push({ type: "spread", description: `placed ${spread.placed}; pipelines ${spread.pipelines} bindGroups ${spread.bindGroups} buffers ${spread.buffers}; ${spreadBg.join(" | ").slice(0, 2000) || "no bind groups"}` });
    expect(spread.placed, "the spread leg placed the field").toBeGreaterThan(0);
    expect({ pipelines: spread.pipelines, bindGroups: spread.bindGroups, owners: spreadBg.slice(0, 8) },
      "a strung-out field minted GPU objects: a shared mesh drawn more times than primeRace drew it (#6485)").toEqual({ pipelines: 0, bindGroups: 0, owners: [] });
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
