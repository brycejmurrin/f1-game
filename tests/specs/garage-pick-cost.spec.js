// @ts-check
// GARAGE LIVERY PICK COST (B·H13, 2026-10-21; PR #3383). A LIVERY pick rebuilds the setup sheet, and before
// the swatch cache every one of the ~113 cards repainted its paint + crest lockup: 286-590 ms of a pick at
// CPU x4 on an 844x390 touch phone (scratch/h13/garage-probe.mjs). This pins the work ONE pick may do, by
// count rather than by time (SwiftShader timings are noise here): the cards adopt last build's painted canvas or
// blit the cached swatch (LiveryTex.swatchStats; B·H32 2026-10-21 made adoption the normal path),
// and the car, atlas and atlas-texture work stays inside a fixed ceiling, so a regression that rebuilds the
// car or the atlas twice, or repaints every card again, fails by name.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const PICKS = 4;
// Measured on this branch (TLX, 844x390 touch, 4 picks, 2026-10-21): every pick 0 card repaints + 113 blits (113 adopted canvases since B·H32),
// 1 Car3D.build, 2 LiveryTex.buildAtlas (the 1024 preview, then the deferred 2048). The ceilings ARE those
// counts: one more is a regression. Atlas textures are held to one upload per atlas painted (below).
// cardPaints 1 since #5224 (PR #5360, Bryce's decision 2026-11-10 15:35Z "raise garage-pick-cost CEIL to 1"): cards
// paint at their own box x DPR, and the picked card moves from the factory fold into the grid, so it paints once
// at the grid size (measured: cardPaints 1, cardReused 112). A second repaint is still the regression.
const CEIL = Object.freeze({ cardPaints: 1, car3dBuilds: 1, atlases: 2 });

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
    await page.waitForFunction(() => typeof CarDraw !== "undefined" && CarDraw.instance && CarDraw.instance(), null, { polling: 100 });   // eslint-disable-line no-undef
    // Count through the shared globals every pick path calls at call time (Car3D / LiveryTex are not
    // frozen), and the GPU textures three allocates FOR A LIVERY ATLAS: a texture counts only when its
    // source is a canvas buildAtlas returned (or a bitmap made from one). Counting every createTexture
    // caught unrelated uploads on a slow runner (pack / model textures landing mid-pick: 11 on Pages
    // run cfefcbf7, shard selected-7), which says nothing about the pick. Each upload is credited to the
    // pick that PAINTED its atlas (window.__pick at buildAtlas time), not to the window it lands in: a
    // pick's deferred upload can arrive during the next pick (B·H17's 3x run on 60118264).
    await page.evaluate(() => {
      const n = (window.__pickCount = { car3dBuilds: 0, atlases: 0, reuploads: 0, texByPick: {} });
      window.__pick = 0; window.__pickOf = {};
      const atlas = new WeakMap(), uploaded = new WeakSet();
      const wrap = (obj, key, field, after) => { const f = obj[key]; obj[key] = function () { n[field]++; const r = f.apply(this, arguments); if (after) after(r); return r; }; };
      // A Car3D build is credited like an atlas: to the pick whose livery it builds (opts.livery.id), else the
      // window's pick. The window now waits for the deferred 2048 to settle, so a late build of another livery can
      // land inside it (ready CI on 4b39df10: pick 2 counted 2). Each build keeps its caller for the failure message.
      n.buildByPick = {}; n.buildLog = [];
      const build = Car3D.build;   // eslint-disable-line no-undef -- script-level const in the page
      Car3D.build = function (_c1, _c2, opts) {   // eslint-disable-line no-undef
        n.car3dBuilds++;
        const liv = opts && opts.livery, id = liv && liv.id;
        const k = id != null && window.__pickOf[id] != null ? window.__pickOf[id] : window.__pick;
        n.buildByPick[k] = (n.buildByPick[k] || 0) + 1;
        const at = String(new Error().stack || "").split("\n").slice(2, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\//, "").replace(/\?v=[^:]*/, "")).join(" < ");
        n.buildLog.push({ pick: k, win: window.__pick, liv: id == null ? null : String(id), at });
        return build.apply(this, arguments);
      };
      // An atlas is credited to the pick whose card names its livery, like its upload below: the 2048 is
      // built on an idle slot (car-draw.js requestIdleCallback), which on a slow runner lands in the NEXT
      // pick's window (CI on 17d0d8c: pick 2 counted 3). Unknown id: the window's pick, as before.
      n.atlasByPick = {};
      const buildAtlas = LiveryTex.buildAtlas;   // eslint-disable-line no-undef
      LiveryTex.buildAtlas = function (teamId, liv) {   // eslint-disable-line no-undef
        n.atlases++;
        const k = liv && liv.id != null && window.__pickOf[liv.id] != null ? window.__pickOf[liv.id] : window.__pick;
        n.atlasByPick[k] = (n.atlasByPick[k] || 0) + 1;
        const c = buildAtlas.apply(this, arguments);
        if (c && typeof c === "object") atlas.set(c, k);
        return c;
      };
      const creditAtlasUpload = (src) => {
        if (!src || !atlas.has(src)) return;
        const k = atlas.get(src);
        n.texByPick[k] = (n.texByPick[k] || 0) + 1;
        if (uploaded.has(src)) n.reuploads++;
        uploaded.add(src);
      };
      if (typeof window.createImageBitmap === "function") {
        const cib = window.createImageBitmap;
        window.createImageBitmap = function (src) {
          const p = cib.apply(this, arguments);
          return atlas.has(src) && p && p.then ? p.then((b) => { atlas.set(b, atlas.get(src)); return b; }) : p;
        };
      }
      // TLX: pooled decal re-fill and fresh uploads go through renderer.initTexture
      // (createTexture / refillTexture / uploadTexture), not always backend.createTexture.
      const ren = window.renderer;
      if (ren && typeof ren.initTexture === "function") {
        const it = ren.initTexture.bind(ren);
        ren.initTexture = function (tex) {
          if (tex && tex.image) creditAtlasUpload(tex.image);
          return it(tex);
        };
      } else {
        const b = ren && ren.backend;
        if (b && b.createTexture) { const c = b.createTexture.bind(b);
          b.createTexture = function (t, o) {
            if (t && t.image) creditAtlasUpload(t.image);
            return c(t, o);
          }; }
      }
    });
    // The deferred 2048 (car-draw schedulePlayerHiRes) is bounded: an idle {timeout} plus a patience cap, so a
    // queue that never drains within this wait is the regression, not the runner.
    const settleHiRes = () => page.waitForFunction(() => CarDraw.instance().decalBytes().hiPending === 0,   // eslint-disable-line no-undef
      null, { polling: 100, timeout: 30_000 });
    const rows = [];
    // i = -1 and 0 are UNCOUNTED warm-up picks (card PICKS + 1, which the swatch wait above guarantees). The
    // sheet's first open can paint while the faces are still loading, so nothing is cached and pick 1 repainted
    // all 113 cards (#5985 draft CI, selected-1: cardPaints 113, cardReused 0). Two, not one: after the first,
    // its own livery's small fold card is still unpainted and would cost pick 1 a second paint. With the fonts
    // in, every counted pick then measures the cache, the steady state a player's later picks see.
    for (let i = -1; i <= PICKS; i++) {
      const before = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      // Fonts settle first, and the click goes in the SAME task as the check: LiveryTex.paintSwatch / swatchCanvas
      // bypass both caches while document.fonts.status is "loading" (a lockup in the fallback face must not stick),
      // and that bypass counts nothing. The previous pick's deferred 2048 atlas can start a face the cards never
      // used (canvas ctx.font), still in flight on a slow runner: #5726 run 44693184227 selected-2 read pick 2 as
      // {cardPaints:0, cardBlits:0, cardReused:0} with the rebuild done. Bounded: the faces are local files.
      const fonts = await page.evaluate(async ([k, n1]) => {
        const t0 = performance.now();
        while (document.fonts && document.fonts.status !== "loaded") {
          if (performance.now() - t0 > 30_000) break;
          await document.fonts.ready;
        }
        const st = document.fonts ? document.fonts.status : "none";
        if (st !== "loaded" && st !== "none") return st;
        window.__pick = k; const s = [...document.querySelectorAll(".cs-liv-swatch:not(.cs-liv-plus)")][k > 0 ? k : n1];
        window.__pickOf[s.closest("[data-cs-livery]").dataset.csLivery] = k; s.click();
        return st;
      }, [i, PICKS + 1]);
      expect(fonts, `pick ${i}: web fonts still loading after 30 s, so the card caches are bypassed`).not.toBe("loading");
      // The pick's synchronous rebuild plus a few frames for the deferred preview mesh / atlas, then the
      // product's own settle signal: no deferred 2048 still queued (car-draw decalBytes().hiPending). A fixed
      // frame count read before the idle slot fired on a slow runner (0 uploads seen: #2394 tally).
      await page.evaluate(() => new Promise((done) => { let f = 0; const t = () => (++f >= 8 ? done(null) : requestAnimationFrame(t)); requestAnimationFrame(t); }));
      await settleHiRes();
      const after = await page.evaluate(() => ({ ...window.__pickCount, ...LiveryTex.swatchStats() }));
      if (i <= 0) continue;
      rows.push({ cardPaints: after.paints - before.paints, cardBlits: after.blits - before.blits, cardReused: after.reused - before.reused,
        windowBuilds: after.car3dBuilds - before.car3dBuilds,
        reuploads: after.reuploads - before.reuploads });
    }
    // Late uploads settle, then each pick reads the uploads of the atlases IT painted.
    await settleHiRes();
    const { texByPick, atlasByPick, buildByPick, buildLog } = await page.evaluate(() => ({ texByPick: { ...window.__pickCount.texByPick },
      atlasByPick: { ...window.__pickCount.atlasByPick }, buildByPick: { ...window.__pickCount.buildByPick }, buildLog: window.__pickCount.buildLog.slice() }));
    for (const [i, r] of rows.entries()) {
      r.textures = texByPick[i + 1] || 0; r.atlases = atlasByPick[i + 1] || 0; r.car3dBuilds = buildByPick[i + 1] || 0;
      r.builds = buildLog.filter((b) => b.pick === i + 1);
    }
    test.info().annotations.push({ type: "pick-cost", description: JSON.stringify(rows) });
    console.log("pick-cost " + JSON.stringify(rows));   // the measured counts behind CEIL, in the run log
    // Not vacuous: the attribution must still see the picks' own atlas uploads.
    expect(rows.reduce((a, r) => a + r.textures, 0), "livery atlas textures seen across the picks").toBeGreaterThan(0);
    for (const [i, r] of rows.entries()) {
      expect(r.cardReused, `pick ${i + 1}: the cards adopt last build's canvases ${JSON.stringify(r)}`).toBeGreaterThan(0);
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
