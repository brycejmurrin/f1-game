// @ts-check
// GARAGE LIVERY PICK COST (B·H13, 2026-10-21; PR #3383). A LIVERY pick rebuilds the setup sheet, and before
// the swatch cache every one of the ~113 cards repainted its paint + crest lockup: 286-590 ms of a pick at
// CPU x4 on an 844x390 touch phone (scratch/h13/garage-probe.mjs). This pins the work ONE pick may do, by
// count rather than by time (SwiftShader timings are noise here): the cards blit (LiveryTex.swatchStats),
// and the car, atlas and texture work stays inside a fixed ceiling, so a regression that rebuilds the car
// or the atlas twice, or repaints every card again, fails by name.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const PICKS = 4;
// Measured on this branch (one pick = one card click, garage open, LIVERY tab): see the PR body.
const CEIL = Object.freeze({ cardPaints: 2, car3dBuilds: 4, atlases: 4, textures: 8 });

test.describe("garage livery pick cost", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("a livery pick blits its cards and keeps car / atlas / texture work under a ceiling", async ({ page }) => {
    test.setTimeout(240_000);
    // Same entry as garage-livery-churn.spec.js: the shipped TLX backend (window.renderer is behind
    // ?three-devtools=1), START, then CAR from the select screen.
    await page.addInitScript(() => {
      try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {}
    });
    await page.goto("/?three-devtools=1");
    await page.waitForFunction(() => window.__apex != null && typeof Teams !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-car").click();
    await page.locator("#carsetup").waitFor({ state: "visible", timeout: 90_000 });
    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.waitForFunction((n) => document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)").length > n + 1,
      PICKS, { polling: 100, timeout: 30_000 });
    // Count through the shared globals every pick path calls at call time (Car3D / LiveryTex are not
    // frozen), and the GPU textures three actually allocates when TLX is the backend.
    await page.evaluate(() => {
      const n = (window.__pickCount = { car3dBuilds: 0, atlases: 0, textures: 0 });
      const wrap = (obj, key, field) => { const f = obj[key]; obj[key] = function () { n[field]++; return f.apply(this, arguments); }; };
      wrap(Car3D, "build", "car3dBuilds");   // eslint-disable-line no-undef -- script-level const in the page
      wrap(LiveryTex, "buildAtlas", "atlases");   // eslint-disable-line no-undef
      const b = window.renderer && window.renderer.backend;
      if (b && b.createTexture) { const c = b.createTexture.bind(b);
        b.createTexture = function (t, o) { if (!t.isRenderTargetTexture && !t.isDepthTexture) n.textures++; return c(t, o); }; }
    });
    const rows = [];
    for (let i = 1; i <= PICKS; i++) {
      const before = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      await page.evaluate((k) => { const s = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")][k]; s.click(); }, i);
      // The pick's synchronous rebuild plus a few frames for the deferred preview mesh / atlas.
      await page.evaluate(() => new Promise((done) => { let f = 0; const t = () => (++f >= 8 ? done(null) : requestAnimationFrame(t)); requestAnimationFrame(t); }));
      const after = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      rows.push({ cardPaints: after.paints - before.paints, cardBlits: after.blits - before.blits,
        car3dBuilds: after.car3dBuilds - before.car3dBuilds, atlases: after.atlases - before.atlases,
        textures: after.textures - before.textures });
    }
    test.info().annotations.push({ type: "pick-cost", description: JSON.stringify(rows) });
    // Pick 1 may meet cards (new liveries' tags) for the first time; from pick 2 the sheet is known.
    for (const [i, r] of rows.entries()) {
      expect(r.cardBlits, `pick ${i + 1}: the cards are drawn from the cache`).toBeGreaterThan(0);
      if (i > 0) expect(r.cardPaints, `pick ${i + 1}: cards repainted ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.cardPaints);
      expect(r.car3dBuilds, `pick ${i + 1}: meshes created ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.car3dBuilds);
      expect(r.atlases, `pick ${i + 1}: atlases built ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.atlases);
      expect(r.textures, `pick ${i + 1}: textures created ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.textures);
    }
  });
});
