// @ts-check
// TLX backend probes — the three.js/TSL renderer behind apex26.gfxBackend="three".
// Mirrors webgl-probes.spec.js's role for GLX: boot integrity, backend identity
// (the descriptor-copy install onto the GLX object), and a console/GL-error
// scrape. CI runs three's WebGL2 fallback on SwiftShader (no WebGPU headless),
// pinned via apex26.tlxForceGL so local repros match CI exactly.
// Grows per milestone: M2 pixel-nonblank, M3+ __tlx shader-dump/?viz= hooks.
import { test, expect } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) {}
  });
});

test.describe("TLX — boot", () => {
  test("boots with the TLX backend installed on the GLX object", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon/i.test(msg.text())) errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });

    // The descriptor-copy install is the compatibility contract: the SAME GLX
    // object every test monkey-patches must now carry the TLX surface.
    // NOTE: GLX is a top-level `const` in a classic script — page-scope
    // lexical, NOT window.GLX (same access pattern as webgl-probes.spec.js).
    const state = await page.evaluate(() => ({
      backend: GLX.backend,
      hdr: typeof GLX.hdrMode === "function" ? GLX.hdrMode() : null,
      scale: GLX.getRenderScale ? GLX.getRenderScale() : null,
      aspect: GLX.aspect,
    }));
    expect(state.backend).toBe("three");
    expect(typeof state.hdr).toBe("boolean");
    expect(state.scale).toBeGreaterThan(0);
    expect(state.aspect).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("falls back to GLX when the backend key is absent", async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem("apex26.gfxBackend"); } catch (_) {}
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    const backend = await page.evaluate(() => GLX.backend);
    expect(backend).toBeUndefined();   // plain GLX carries no backend id
  });

  test("track renders a non-blank frame on TLX (M2 world geometry)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(400);
    // Same heuristic as smoke.spec.js: a rendered scene PNG is tens of KB,
    // a blank/solid canvas < ~2 KB.
    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
  });

  test("M4 shadow subsystem arms on a day race (car map per-frame, lamp idle)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({
      car: GLX.carShadowState(),
      lamp: GLX.lampShadowState(),
      pcss: GLX.pcss(),
      hdr: GLX.hdrMode(),
    }));
    // Desktop headless = full tier: all three maps exist; the per-frame car
    // pass has armed at least once by now. Monza day never opens the lamp
    // pass (night-gated in game.js), so its arms stay 0 / idx -1.
    expect(st.car.enabled).toBe(true);
    expect(st.car.arms).toBeGreaterThan(0);
    expect(st.lamp.enabled).toBe(true);
    expect(st.lamp.arms).toBe(0);
    expect(st.lamp.idx).toBe(-1);
    expect(st.pcss).toBe(false);   // TODO M4-PCSS: blocker map not ported
    expect(st.hdr).toBe(false);    // truthful until M8's HDR post chain
    expect(errors).toEqual([]);
  });

  test("M5 sky arms on a race frame and honours the night gate", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(400);
    const day = await page.evaluate(() => GLX.__tlx.skyState());
    // Day race: the background node is armed each frame, stars flag off.
    expect(day.on).toBe(true);
    expect(day.stars).toBe(0);
    expect(day.sunDir[1]).toBeGreaterThan(0);   // sun above the horizon
    // Night: uStars flips to 1 (SKY_FS's nightSky gate keys off it — the sun
    // disc must never paint among the stars even though sunDir stays high).
    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // The day->night flip rebuilds scenery before the next sky frame lands —
    // wait on the uniform, not a fixed sleep (SwiftShader rebuilds are slow).
    await page.waitForFunction(() => GLX.__tlx.skyState().stars === 1, { timeout: 60_000 });
    const night = await page.evaluate(() => GLX.__tlx.skyState());
    expect(night.on).toBe(true);
    expect(night.stars).toBe(1);
    expect(errors).toEqual([]);
  });

  test("menu is reachable and canvas is sized (no-track begin/present path)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await expect(page.locator("#mb-race")).toBeVisible();
    const dims = await page.evaluate(() => {
      const c = document.getElementById("game");
      return { w: c.width, h: c.height };
    });
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
  });
});
