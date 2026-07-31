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
