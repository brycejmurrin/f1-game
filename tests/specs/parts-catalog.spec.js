// @ts-check
// Tests for car setup UI catalog rendering:
// - Every Parts.CATALOG category appears as a tab in the setup panel
// - GEARBOX and FUEL options are visible and selectable via the active tab
// - Factory/supplier-exclusive parts only appear for the matching team engine
// - Part descriptions update when an option is selected
//
// ONE BOOT PER WORKER (sharedTest): 19 boots (14 goto + 5 team-switch reloads)
// became none. openSetup() walks back to the title, pins the team through the
// store AND the #mb-race handler that copies it into the game (the team-switch
// tests used to seed localStorage and reload for exactly that), forgets the
// fitted parts, and comes in through START. UNVERIFIED IN A BROWSER at
// conversion time — tests/helpers/shared-page.js has the mechanics.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { toMenu, forgetStored, pinFreePlay, freeBuildOff } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

// `team` is a Teams.LIST id or index; the default is the game's own (McLaren).
async function openSetup(page, team = "mclaren", opts) {
  await toMenu(page);
  await forgetStored(page, ["unlimitedBudget"]);
  // Empty factory sheet (HIT), not a forgotten key: GarageDefaults would fill
  // the signature kit and mark Standard / high_octane over-budget.
  await pinFreePlay(page, { team, click: false });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await freeBuildOff(page);              // the in-memory flag, not just the key
  // `draw` opts BACK IN to the render loop. The garage draws a live turntable
  // and getSetupPreviewMesh() re-keys on partsVisualKey, so every option click
  // rebuilds the car mesh and repaints the livery atlas at SwiftShader speed —
  // most of this file's cost, and none of what its DOM assertions read.
  // Stopped by default (render() returns early on headlessMode, js/game.js).
  //
  // THE GALLERY TESTS MUST OPT BACK IN. An undrawn canvas keeps its LAST frame,
  // so a screenshot taken with the loop stopped is a stale car — a silently
  // wrong capture, which is worse than a slow one. Every test below that calls
  // page.screenshot passes { draw: true }, and that is the whole rule.
  const draw = !!(opts && opts.draw);
  await page.evaluate((on) => window.__apex.headless(!on), draw);
}

async function openCat(page, catId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
}

function opt(page, optId) {
  return page.locator(`#cs-options [data-cs-opt="${optId}"]`);
}

// Expectations come from the catalog itself (js/car/parts.js), so a legitimate
// price, copy or category change moves the test with it instead of failing it.
async function catalogOpt(page, catId, optId) {
  return page.evaluate(([c, o]) => {
    const cat = Parts.CATALOG.find((x) => x.id === c);
    const op = cat && cat.options.find((x) => x.id === o);
    if (!op) throw new Error(`parts-catalog: no ${c}/${o} in Parts.CATALOG`);
    return { cost: op.cost, desc: op.desc || "", tag: op.tag || "" };
  }, [catId, optId]);
}

test.describe("Car setup catalog — all categories render", () => {
  test.use({ viewport: LANDSCAPE });

  test("every catalog category label is visible", async ({ page }) => {
    await openSetup(page, "mclaren", { draw: true });

    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    expect(ids.length, "Parts.CATALOG has categories").toBeGreaterThan(0);
    for (const id of ids) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toBeVisible();
    }
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-all-categories.png") });
  });

  test("GEARBOX section contains Standard and F1 Spec options", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "f1_spec")).toBeVisible();
  });

  test("FUEL section contains Standard and Qualifying Mix options", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "quali_mix")).toBeVisible();
  });

  test("ENGINE section shows every engine option the team may fit", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "engine");
    const want = await page.evaluate(() => {
      const team = Teams.LIST.find((t) => t.id === "mclaren");
      return Parts.CATALOG.find((c) => c.id === "engine").options
        .filter((o) => Parts.isOptionAvailable(o, team)).map((o) => o.id).sort();
    });
    expect(want.length, "McLaren may fit more than the stock unit").toBeGreaterThan(1);
    const shown = await page.locator("#cs-options .cs-opt[data-cs-opt]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-cs-opt")).sort());
    expect(shown).toEqual(want);
  });
});

test.describe("Car setup catalog — option interaction", () => {
  test.use({ viewport: LANDSCAPE });

  test("GEARBOX Standard option is active by default", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("FUEL Standard option is active by default", async ({ page }) => {
    await openSetup(page, "mclaren", { draw: true });

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("clicking Close Ratio gearbox makes it active", async ({ page }) => {
    await openSetup(page, "mclaren", { draw: true });

    await openCat(page, "gearbox");
    await opt(page, "close_ratio").click();
    await expect(opt(page, "close_ratio")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-gearbox-close-ratio.png") });
  });

  test("clicking High Octane fuel makes it active", async ({ page }) => {
    await openSetup(page, "mclaren", { draw: true });

    await openCat(page, "fuel");
    await opt(page, "high_octane").click();
    await expect(opt(page, "high_octane")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-fuel-high-octane.png") });
  });

  test("description updates when an option is selected", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await opt(page, "race_blend").click();
    const { desc: want } = await catalogOpt(page, "fuel", "race_blend");
    expect(want, "race_blend carries a description").not.toBe("");
    const desc = await page.locator("#cs-options .cs-opt.active .cs-opt-desc").textContent();
    expect(desc).toBe(want);
  });

  test("GEARBOX Sequential Pro option has a cost badge", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    const seqPro = opt(page, "sequential_pro");
    await expect(seqPro.locator(".cs-opt-cost")).toBeVisible();
    const { cost: want } = await catalogOpt(page, "gearbox", "sequential_pro");
    expect(want, "Sequential Pro is a paid part").toBeGreaterThan(0);
    await expect(seqPro.locator(".cs-opt-cost")).toHaveText(`${want} cr`);
  });
});

test.describe("Car setup catalog — factory/supplier parts", () => {
  test.use({ viewport: LANDSCAPE });

  test("AMG HPP option visible when team is Mercedes", async ({ page }) => {
    await openSetup(page, "mercedes", { draw: true });
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toBeVisible();
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-mercedes-factory.png") });
  });

  test("AMG HPP option NOT visible when team is not Mercedes", async ({ page }) => {
    // The first team on the Red Bull Ford unit, as the old seed picked it.
    const idx = await page.evaluate(() => Teams.LIST.findIndex((t) => t.engine === "Red Bull Ford"));
    await openSetup(page, idx, { draw: true });
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toHaveCount(0);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-non-mercedes.png") });
  });

  test("factory option has FACTORY tag badge", async ({ page }) => {
    await openSetup(page, "mercedes");
    await openCat(page, "engine");
    const { tag } = await catalogOpt(page, "engine", "manu_mercedes");
    expect(tag).not.toBe("");
    await expect(opt(page, "manu_mercedes").locator(".cs-opt-tag")).toContainText(tag);
  });

  test("unrestricted options have UNIVERSAL badges", async ({ page }) => {
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "stock").locator(".cs-opt-tag")).toContainText("UNIVERSAL");
  });

  test("team signatures are visible only to their eligible team", async ({ page }) => {
    await openSetup(page, "mclaren");
    await openCat(page, "aero");
    const { tag } = await catalogOpt(page, "aero", "sig_mclaren_flex");
    expect(tag).not.toBe("");
    await expect(opt(page, "sig_mclaren_flex").locator(".cs-opt-tag")).toContainText(tag);

    // DONE goes on to race settings; openSetup walks back from there and
    // re-enters as Mercedes (the reload this replaced only existed to make the
    // stored team the live one).
    await page.locator("#cs-done").click();
    await openSetup(page, "mercedes", { draw: true });
    await openCat(page, "aero");
    await expect(opt(page, "sig_mclaren_flex")).toHaveCount(0);
  });
});

// C2-23: livery-tier.test.mjs, parts-ladder.test.mjs and
// parts-locked-equivalent.test.mjs pin the TIER DATA in node; this block runs
// the code that APPLIES it on the shipped page — Parts.getVisualTiers into
// Car3D.build, and LiveryTex.buildAtlas at each atlas tier — so a regression
// in the applying code fails a test, not only one in the tables.
test.describe("Car setup catalog — tiers reach the mesh", () => {
  test.use({ viewport: LANDSCAPE });

  test("every visual tier of every category builds a different car mesh", async ({ page }) => {
    await toMenu(page);
    const r = await page.evaluate(() => {
      const team = Teams.LIST.find((t) => t.id === "mclaren");
      // A cheap, order-sensitive fingerprint of the built geometry.
      const fp = (m) => {
        let s = 0;
        for (let i = 0; i < m.pos.length; i += 7) s += m.pos[i] * ((i % 13) + 1);
        return m.pos.length + ":" + s.toFixed(3);
      };
      const out = {};
      for (const cat of Parts.CATALOG) {
        const byTier = new Map();   // first option the team may fit, per visualTier
        for (const o of cat.options) {
          if (!Parts.isOptionAvailable(o, team)) continue;
          const t = o.visualTier != null ? o.visualTier : 1;
          if (!byTier.has(t)) byTier.set(t, o.id);
        }
        out[cat.id] = [...byTier].sort((a, b) => a[0] - b[0]).map(([tier, id]) => {
          const parts = Parts.getVisualTiers(Object.assign({}, Parts.DEFAULTS, { [cat.id]: id }), team);
          return { tier, id, applied: parts[cat.id], fp: fp(Car3D.build(team.color, team.color2, { teamId: team.id, parts })) };
        });
      }
      return out;
    });
    const cats = Object.keys(r);
    expect(cats.length, "Parts.CATALOG has categories").toBeGreaterThan(0);
    for (const cat of cats) {
      const rows = r[cat];
      expect(rows.length, `${cat}: more than one visual tier on sale`).toBeGreaterThan(1);
      for (const row of rows) expect(row.applied, `${cat}/${row.id}: getVisualTiers keeps the tier`).toBe(row.tier);
      const fps = rows.map((x) => x.fp);
      expect(new Set(fps).size, `${cat}: each tier builds its own mesh ${JSON.stringify(rows)}`).toBe(fps.length);
    }
  });

  test("each livery atlas tier paints a canvas of its own size", async ({ page }) => {
    await toMenu(page);
    const r = await page.evaluate(() => {
      const team = Teams.LIST.find((t) => t.id === "mclaren");
      const mobile = (player) => LiveryTex.atlasMobile(player, LiveryTex.IS_MOBILE, LiveryTex.IS_PHONE);
      const tiers = [["ai", false, false], ["player", true, false], ["playerHi", true, true]];
      return tiers.map(([name, player, hi]) => {
        const div = LiveryTex.atlasDiv(player, mobile(player), hi);
        const cv = LiveryTex.buildAtlas(team.id, {}, undefined, player, hi);
        // Painted, not just allocated: shrink to 64×80 and count opaque texels.
        const thumb = document.createElement("canvas");
        thumb.width = 64; thumb.height = 80;
        const tctx = thumb.getContext("2d");
        tctx.drawImage(cv, 0, 0, 64, 80);
        const px = tctx.getImageData(0, 0, 64, 80).data;
        let opaque = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) opaque++;
        return { name, div, w: cv.width, h: cv.height, wantW: LiveryTex.SIZE / div, wantH: LiveryTex.SIZE_H / div, opaque };
      });
    });
    for (const t of r) {
      expect(t.w, `${t.name} atlas width`).toBe(t.wantW);
      expect(t.h, `${t.name} atlas height`).toBe(t.wantH);
      expect(t.opaque, `${t.name} atlas is painted`).toBeGreaterThan(0);
    }
    // The tiers are real tiers: the player never gets less than an AI car.
    const by = Object.fromEntries(r.map((t) => [t.name, t]));
    expect(by.player.w).toBeGreaterThanOrEqual(by.ai.w);
    expect(by.playerHi.w).toBeGreaterThanOrEqual(by.player.w);
  });
});

test.describe("Car setup catalog — screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // portrait

  test("portrait setup screenshot", async ({ page }) => {
    await openSetup(page, "mclaren", { draw: true });
    await expect(page.locator("#carsetup")).toBeVisible();
    const png = await page.screenshot({ path: galleryPath("parts-catalog", "catalog-portrait.png") });
    expect(png.length, "a captured frame, not an empty buffer").toBeGreaterThan(1000);
  });
});
