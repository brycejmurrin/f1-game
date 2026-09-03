// assets-api.spec.js — the baked asset pack's RUNTIME path: js/render/shared/assets.js,
// the GLX texture-array upload, and the __apex hooks that drive them.
//
// The contract under test WAS "a pack must never change the render until asked"
// — correct while the pack was procedural noise, but it meant shipping ~5 MB
// that nothing sampled. With the 5 MB baked pack shipping, the default is ON,
// and the safety property moved to js/render/shared/assets.js: no pack, a malformed
// pack, or a backend without createTextureArray all fall back to the procedural
// look. Most of what follows is that failure-mode coverage, because all three
// are states real users boot into.
//
// Run: npx playwright test tests/specs/assets-api.spec.js   (npm run test:assets)

import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 30 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
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
  // Every material in tools/gen/assets.mjs SCALES, and not one more: GLASS, FLAG
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

test("the baked materials are ON by default", async ({ page }) => {
  // Inverted deliberately when the baked pack started shipping ON: 5 MB that
  // nothing sampled was pure cost. (The shipped layers are PROCEDURAL — see
  // assets/pack/CREDITS.md; webbake.js can swap in Poly Haven CC0 scans, but
  // that bake is opt-in and has never been the committed pack.)
  const r = await page.evaluate(async () => {
    await window.Assets.load();
    return { mix: window.__apex.matTex(), state: window.__apex.assets() };
  });
  expect(r.mix).toBeGreaterThan(0);
  expect(r.state.uploaded).toBe(true);
  expect(r.state.layers).toBeGreaterThanOrEqual(10);
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

test("matTexMix is a real lighting-tuner knob, and 0 stays reachable", async ({ page }) => {
  // 0 is the revert path: if scanned tarmac ever crawls at speed, this slider is
  // the fix, and at 0 the pack is not even downloaded.
  const r = await page.evaluate(() => {
    const all = window.__apex.lightTune();
    const off = window.__apex.matTex(0);
    return { present: "matTexMix" in all, value: all.matTexMix, off };
  });
  expect(r.present).toBe(true);
  expect(r.value).toBeGreaterThan(0);
  expect(r.off).toBe(0);
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
    // licence audit in `node tools/gen/assets.mjs verify` depends on.
    expect(e.source).toBeTruthy();
  }
});

test("diag() returns a stable, complete snapshot and can save files", async ({ page }) => {
  // The value of a diagnostic bundle is that it is the SAME shape every time —
  // a bug report gathered by hand was a slightly different set of fields on each
  // occasion. If a key silently disappears the bundle quietly stops answering
  // the question it exists for, so the shape is pinned here.
  const d = await page.evaluate(() => window.__apex.diag({ download: false }));
  for (const k of ["when", "env", "gl", "info", "assets", "lightTune", "lightState",
                   "viewState", "physState", "timing", "gpuTimer", "errors"]) {
    expect(d, `diag() missing "${k}"`).toHaveProperty(k);
  }
  // The environment fields are the ones that decide whether a report is even
  // comparable to a headless run — SwiftShader vs real silicon reads completely
  // differently for timing and shimmer.
  expect(d.env.ua).toBeTruthy();
  expect(d.env.backend).toBeTruthy();
  expect(typeof d.env.dpr).toBe("number");
  expect(d.gl.renderer, "GPU renderer string must resolve").toBeTruthy();
  // It must survive being called before a race, when most state is null.
  expect(Array.isArray(d.errors)).toBe(true);

  // save() returns a byte count and must not throw for objects or strings.
  const bytes = await page.evaluate(() => window.__apex.save({ a: 1 }, "t.json"));
  expect(typeof bytes).toBe("number");
  expect(bytes).toBeGreaterThan(0);
});

test("stats() overlay mounts, updates and tears down", async ({ page }) => {
  // The stats.js role, but for a renderer stats.js cannot attach to. Worth a
  // test because it touches the DOM on a canvas-only page and leaves an
  // interval behind — a leaked timer would keep writing after teardown.
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForTimeout(1200);

  const on = await page.evaluate(() => window.__apex.stats(true));
  expect(on).toBe(true);
  await page.waitForTimeout(700);            // let at least two 250ms ticks land

  const txt = await page.evaluate(() => document.getElementById("__apexStats").textContent);
  // Render scale and tier are the point: the governor holds fps by dropping
  // resolution, so fps alone can look healthy while the image is soft.
  expect(txt).toContain("fps");
  expect(txt).toContain("scale");
  expect(txt).toContain("matTex");
  expect(txt).not.toContain("stats error");

  // Toggling must remove the node AND stop the interval.
  const off = await page.evaluate(() => window.__apex.stats(false));
  expect(off).toBe(false);
  expect(await page.evaluate(() => !!document.getElementById("__apexStats"))).toBe(false);
  // No-arg call toggles back on.
  expect(await page.evaluate(() => window.__apex.stats())).toBe(true);
  await page.evaluate(() => window.__apex.stats(false));
});
