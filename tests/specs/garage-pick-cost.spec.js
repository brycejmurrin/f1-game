// @ts-check
// GARAGE LIVERY PICK COST (B·H13, 2026-10-21; PR #3383). A LIVERY pick rebuilds the setup sheet, and before
// the swatch cache every one of the ~113 cards repainted its paint + crest lockup: 286-590 ms of a pick at
// CPU x4 on an 844x390 touch phone (scratch/h13/garage-probe.mjs). This pins the work ONE pick may do, by
// count rather than by time (SwiftShader timings are noise here): the cards blit (LiveryTex.swatchStats),
// and the car, atlas and atlas-texture work stays inside a fixed ceiling, so a regression that rebuilds the
// car or the atlas twice, or repaints every card again, fails by name.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const PICKS = 4;
// Measured on this branch (TLX, 844x390 touch, 4 picks, 2026-10-21): every pick 0 card repaints + 113 blits,
// 1 Car3D.build, 2 LiveryTex.buildAtlas (the 1024 preview, then the deferred 2048). The ceilings ARE those
// counts: one more is a regression. Atlas textures are held to one upload per atlas painted (below).
const CEIL = Object.freeze({ cardPaints: 0, car3dBuilds: 1, atlases: 2 });

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
    // frozen), and the GPU textures three allocates FOR A LIVERY ATLAS: a texture counts only when its
    // source is a canvas buildAtlas returned (or a bitmap made from one). Counting every createTexture
    // caught unrelated uploads on a slow runner (pack / model textures landing mid-pick: 11 on Pages
    // run cfefcbf7, shard selected-7), which says nothing about the pick. Each upload is credited to the
    // pick that PAINTED its atlas (window.__pick at buildAtlas time), not to the window it lands in: a
    // pick's deferred upload can arrive during the next pick (B·H17's 3x run on 60118264).
    await page.evaluate(() => {
      const n = (window.__pickCount = { car3dBuilds: 0, atlases: 0, reuploads: 0, texByPick: {} });
      window.__pick = 0;
      const atlas = new WeakMap(), uploaded = new WeakSet();
      const wrap = (obj, key, field, after) => { const f = obj[key]; obj[key] = function () { n[field]++; const r = f.apply(this, arguments); if (after) after(r); return r; }; };
      wrap(Car3D, "build", "car3dBuilds");   // eslint-disable-line no-undef -- script-level const in the page
      wrap(LiveryTex, "buildAtlas", "atlases", (c) => { if (c && typeof c === "object") atlas.set(c, window.__pick); });   // eslint-disable-line no-undef
      if (typeof window.createImageBitmap === "function") {
        const cib = window.createImageBitmap;
        window.createImageBitmap = function (src) {
          const p = cib.apply(this, arguments);
          return atlas.has(src) && p && p.then ? p.then((b) => { atlas.set(b, atlas.get(src)); return b; }) : p;
        };
      }
      const b = window.renderer && window.renderer.backend;
      if (b && b.createTexture) { const c = b.createTexture.bind(b);
        b.createTexture = function (t, o) {
          if (t && t.image && atlas.has(t.image)) {
            const k = atlas.get(t.image);
            n.texByPick[k] = (n.texByPick[k] || 0) + 1;
            if (uploaded.has(t.image)) n.reuploads++;
            uploaded.add(t.image);
          }
          return c(t, o);
        }; }
    });
    const rows = [];
    for (let i = 1; i <= PICKS; i++) {
      const before = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      await page.evaluate((k) => { window.__pick = k; const s = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")][k]; s.click(); }, i);
      // The pick's synchronous rebuild plus a few frames for the deferred preview mesh / atlas.
      await page.evaluate(() => new Promise((done) => { let f = 0; const t = () => (++f >= 8 ? done(null) : requestAnimationFrame(t)); requestAnimationFrame(t); }));
      const after = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      rows.push({ cardPaints: after.paints - before.paints, cardBlits: after.blits - before.blits,
        car3dBuilds: after.car3dBuilds - before.car3dBuilds, atlases: after.atlases - before.atlases,
        reuploads: after.reuploads - before.reuploads });
    }
    // Late uploads settle, then each pick reads the uploads of the atlases IT painted.
    await page.evaluate(() => new Promise((done) => { let f = 0; const t = () => (++f >= 16 ? done(null) : requestAnimationFrame(t)); requestAnimationFrame(t); }));
    const texByPick = await page.evaluate(() => ({ ...window.__pickCount.texByPick }));
    for (const [i, r] of rows.entries()) r.textures = texByPick[i + 1] || 0;
    test.info().annotations.push({ type: "pick-cost", description: JSON.stringify(rows) });
    console.log("pick-cost " + JSON.stringify(rows));   // the measured counts behind CEIL, in the run log
    // Not vacuous: the attribution must still see the picks' own atlas uploads.
    expect(rows.reduce((a, r) => a + r.textures, 0), "livery atlas textures seen across the picks").toBeGreaterThan(0);
    for (const [i, r] of rows.entries()) {
      expect(r.cardBlits, `pick ${i + 1}: the cards are drawn from the cache`).toBeGreaterThan(0);
      expect(r.cardPaints, `pick ${i + 1}: cards repainted ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.cardPaints);
      expect(r.car3dBuilds, `pick ${i + 1}: Car3D builds ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.car3dBuilds);
      expect(r.atlases, `pick ${i + 1}: atlases built ${JSON.stringify(r)}`).toBeLessThanOrEqual(CEIL.atlases);
      // One upload per atlas the pick painted, at most: three uploads on first draw, so the 1024 preview
      // uploads only when a frame draws it before the deferred 2048 replaces it (1 or 2 by timing). An
      // atlas uploaded twice, or more uploads than atlases, is the regression.
      expect(r.reuploads, `pick ${i + 1}: an atlas uploaded twice ${JSON.stringify(r)}`).toBe(0);
      expect(r.textures, `pick ${i + 1}: atlas textures created ${JSON.stringify(r)}`).toBeLessThanOrEqual(r.atlases);
    }
  });
});
