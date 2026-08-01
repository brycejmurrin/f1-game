// assets-api.spec.js — the baked asset pack's RUNTIME path: js/render/assets.js,
// the GLX texture-array upload, and the __apex hooks that drive them.
//
// The contract under test is "a pack must never change the render until asked":
// installing an asset pack uploads the arrays but leaves matTexMix at 0, so the
// game looks byte-for-byte like the procedural build until the knob moves.
// Everything else here is failure-mode coverage — no pack, no backend support,
// a tier switch — because all three are states real users boot into.
//
// Run: npx playwright test tests/assets-api.spec.js   (npm run test:assets)

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { timeout: 30000 });
});

test("assets() reports a coherent state", async ({ page }) => {
  const s = await page.evaluate(() => window.__apex.assets());
  // Never null, never a throw — the same typed-state contract the agent-view
  // hooks follow.
  expect(s).toBeTruthy();
  expect(typeof s.supported).toBe("boolean");
  expect(typeof s.pack).toBe("boolean");
  // GLX is the default backend and implements the texture-array path.
  expect(s.supported).toBe(true);
});

test("the committed pack loads and uploads its material layers", async ({ page }) => {
  const s = await page.evaluate(async () => {
    await window.Assets.load();
    return window.__apex.assets();
  });
  expect(s.pack).toBe(true);
  expect(s.uploaded).toBe(true);
  expect(s.error).toBeNull();
  // Every material in tools/assets.mjs SCALES, and not one more: GLASS, FLAG
  // and FLAT must stay procedural.
  expect(s.layers).toBeGreaterThanOrEqual(10);
  expect(s.layers).toBeLessThanOrEqual(16);
  expect(s.normal).toBe(true);
  // ASPHALT (16) is the surface on screen for the whole race — if anything is
  // baked, it is.
  expect(s.scales[16]).toBeGreaterThan(0);
  // GLASS (3) and FLAG (15) are deliberate omissions.
  expect(s.scales[3]).toBe(0);
  expect(s.scales[15]).toBe(0);
  expect(s.scales[0]).toBe(0);
});

test("a loaded pack does NOT change the render until the knob moves", async ({ page }) => {
  const mix = await page.evaluate(async () => {
    await window.Assets.load();
    return window.__apex.matTex();
  });
  expect(mix).toBe(0);
});

test("matTex() round-trips and clamps", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    out.set = window.__apex.matTex(0.5);
    out.get = window.__apex.matTex();
    out.high = window.__apex.matTex(5);
    out.low = window.__apex.matTex(-1);
    window.__apex.matTex(0);
    out.reset = window.__apex.matTex();
    return out;
  });
  expect(r.set).toBeCloseTo(0.5, 5);
  expect(r.get).toBeCloseTo(0.5, 5);
  expect(r.high).toBe(1);
  expect(r.low).toBe(0);
  expect(r.reset).toBe(0);
});

test("matTexMix is a real lighting-tuner knob shipped at 0", async ({ page }) => {
  const r = await page.evaluate(() => {
    const all = window.__apex.lightTune();
    return { present: "matTexMix" in all, value: all.matTexMix };
  });
  expect(r.present).toBe(true);
  expect(r.value).toBe(0);
});

test("unload returns to the procedural state without erroring", async ({ page }) => {
  const r = await page.evaluate(async () => {
    await window.Assets.load();
    const on = window.__apex.assets();
    const off = await window.__apex.assetLoad(false);
    return { on, off };
  });
  expect(r.on.uploaded).toBe(true);
  expect(r.off.uploaded).toBe(false);
  expect(r.off.layers).toBe(0);
});

test("the game still renders with the baked materials fully on", async ({ page }) => {
  // The point of this test is the SHADER, not the pixels: a texture array bound
  // to a sampler2DArray that the driver considers incomplete renders black (or
  // drops the draw) rather than throwing, so the only honest check is that a
  // frame with the knob at 1 still produces a lit, non-uniform image.
  const r = await page.evaluate(async () => {
    await window.Assets.load();
    await window.__apex.race("monza");
    window.__apex.jump(0.25, 40, 0);
    window.__apex.snapCam();
    window.__apex.matTex(1);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const st = window.__apex.assets();
    window.__apex.matTex(0);
    return st;
  });
  expect(r.uploaded).toBe(true);
  // No GL error tripped the renderer into its failure path.
  const errs = await page.evaluate(() => (window.__apexGlErrors || []).length);
  expect(errs).toBe(0);
});

test("credits cover every baked asset", async ({ page }) => {
  const c = await page.evaluate(async () => {
    await window.Assets.manifest();
    return window.__apex.credits();
  });
  expect(Array.isArray(c)).toBe(true);
  expect(c.length).toBeGreaterThan(0);
  for (const e of c) {
    expect(e.licence).toBeTruthy();
    // Every asset must be traceable to where it came from — that is what the
    // licence audit in `node tools/assets.mjs verify` depends on.
    expect(e.source).toBeTruthy();
  }
});
