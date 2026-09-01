// @ts-check
// Liveries: catalog shape, the paint FINISH axis (gloss/satin/chrome), and the
// creator's round-trip of a finish into a saved custom livery.
//
// FINISH is a MATERIAL, not a colour: Car3D.build remaps the body-paint surface
// id (SURFACES.paint) to the id the lit shader already treats as matte (panel)
// or mirror (metal). These tests pin that remap — that only PAINT moves, that
// nothing else does, and that an absent finish leaves the mesh untouched.
//
// ONE BOOT PER WORKER (sharedTest): 14 boots (11 goto + 3 reloads) became
// none. The catalog and finish tests only read modules off a live page; the
// creator tests used to seed storage and reload so the boot would read it —
// the same keys now go through the store (cache and disk) and #mb-race's own
// re-read of the team. UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page) {
  await ensureLive(page);
}

// Team 2 (McLaren, the boot default) made the live team with nothing fitted,
// then in through START. The creator tests forget that team's custom liveries
// first, as their old localStorage.removeItem + reload did.
async function openSetup(page) {
  await toMenu(page);
  await pinFreePlay(page, { team: 2, click: false });   // #mb-race re-reads the store
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Liveries — catalog", () => {
  test("every livery has well-formed colours and a known finish", async ({ page }) => {
    await load(page);
    const bad = await page.evaluate(() => {
      const COLOURS = ["c1", "c2", "stripe", "noseStripe", "accent", "nose", "pod", "wing", "fin", "finArt", "logo", "halo"];
      const FINISHES = ["gloss", "satin", "chrome"];
      const all = [...Liveries.UNIVERSAL, ...Object.values(Liveries.BY_TEAM).flat()];
      const problems = [];
      const ids = new Set();
      for (const liv of all) {
        if (ids.has(liv.id)) problems.push(`${liv.id}: duplicate id`);
        ids.add(liv.id);
        if (!liv.name) problems.push(`${liv.id}: missing name`);
        for (const key of COLOURS) {
          const v = liv[key];
          if (v === undefined) continue;
          if (!Array.isArray(v) || v.length !== 3 || v.some((c) => !(c >= 0 && c <= 1))) {
            problems.push(`${liv.id}.${key}: not an [r,g,b] in 0..1`);
          }
        }
        if (liv.finish !== undefined && !FINISHES.includes(liv.finish)) {
          problems.push(`${liv.id}: unknown finish ${liv.finish}`);
        }
      }
      return problems;
    });
    expect(bad).toEqual([]);
  });

  test("every team's picker leads with its own default livery", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => Teams.LIST.map((team) => {
      const list = Liveries.forTeam(team);
      return { id: team.id, first: list[0].id, count: list.length,
               complete: list.every((l) => Array.isArray(l.c1) && Array.isArray(l.c2)) };
    }));
    for (const team of result) {
      expect(team.first, team.id).toBe("default");
      expect(team.complete, team.id).toBe(true);
      expect(team.count, team.id).toBeGreaterThanOrEqual(30);
    }
  });

  test("a custom team's stored finish reaches its default livery", async ({ page }) => {
    await load(page);
    const finish = await page.evaluate(() => {
      const team = { id: "custom", color: [1, 0, 0], color2: [0, 0, 1], livery: { finish: "chrome" } };
      return Liveries.forTeam(team)[0].finish;
    });
    expect(finish).toBe("chrome");
  });
});

test.describe("Liveries — paint finish", () => {
  test("gloss (and an absent finish) leave every paint face on the paint surface", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const count = (mesh, id) => mesh.mat.filter((m) => m === id).length;
      const build = (livery) => Car3D.build([0.7, 0.05, 0.05], [0.9, 0.8, 0.1], { noWheels: true, livery });
      const bare = build({});
      const gloss = build({ finish: "gloss" });
      return {
        barePaint: count(bare, Car3D.SURFACES.paint),
        glossPaint: count(gloss, Car3D.SURFACES.paint),
        identical: JSON.stringify(Array.from(bare.mat)) === JSON.stringify(Array.from(gloss.mat)),
      };
    });
    expect(result.barePaint).toBeGreaterThan(0);
    expect(result.glossPaint).toBe(result.barePaint);
    expect(result.identical).toBe(true);
  });

  test("satin and chrome move the paint faces — and only the paint faces", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const build = (livery) => Car3D.build([0.7, 0.05, 0.05], [0.9, 0.8, 0.1], { noWheels: true, livery });
      const bare = build({});
      const report = (finish) => {
        const mesh = build({ finish });
        const target = Car3D.FINISH_SURFACE[finish];
        let movedFromPaint = 0, movedFromOther = 0;
        for (let i = 0; i < mesh.mat.length; i++) {
          if (mesh.mat[i] === bare.mat[i]) continue;
          if (bare.mat[i] === Car3D.SURFACES.paint && mesh.mat[i] === target) movedFromPaint++;
          else movedFromOther++;
        }
        return {
          target,
          movedFromPaint,
          movedFromOther,
          paintLeft: mesh.mat.filter((m) => m === Car3D.SURFACES.paint).length,
          // geometry is untouched — a finish is a material change, not a mesh change
          samePositions: mesh.pos.length === bare.pos.length
            && Array.from(mesh.pos).every((v, i) => v === bare.pos[i]),
          sameColours: Array.from(mesh.col).every((v, i) => v === bare.col[i]),
        };
      };
      return { satin: report("satin"), chrome: report("chrome"),
               ids: { panel: Car3D.SURFACES.panel, mirror: Car3D.SURFACES.mirror } };
    });
    expect(result.satin.target).toBe(result.ids.panel);
    // chrome targets `mirror`, not `metal`: metalness kills the diffuse response
    // while the shader's env lobe is gated on clearcoat, which metal has none of,
    // so the old mapping rendered the body darker and flatter than plain gloss.
    // See the FINISH_SURFACE comment in js/car/car3d.js.
    expect(result.chrome.target).toBe(result.ids.mirror);
    for (const finish of ["satin", "chrome"]) {
      const r = result[finish];
      expect(r.movedFromPaint, finish).toBeGreaterThan(0);
      expect(r.movedFromOther, finish).toBe(0);
      expect(r.paintLeft, finish).toBe(0);
      expect(r.samePositions, finish).toBe(true);
      expect(r.sameColours, finish).toBe(true);
    }
  });

  test("a fitted satin livery repaints the in-race player car", async ({ page }) => {
    await load(page);
    // Fitted through the store, so the cache agrees with the disk — the reload
    // this replaced was how the old seed reached the game.
    const surfaces = await page.evaluate(async () => {
      const team = Teams.LIST[2];
      const satin = Liveries.forTeam(team).find((l) => l.finish === "satin");
      GameStore.store.set("team", 2);
      GameStore.store.set("livery." + team.id, satin.id);
      return { livery: satin.id, teamId: team.id };
    });
    const result = await page.evaluate((ctx) => {
      const team = Teams.LIST.find((t) => t.id === ctx.teamId);
      const liv = Liveries.forTeam(team).find((l) => l.id === ctx.livery);
      const mesh = Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, noWheels: true });
      return {
        finish: liv.finish,
        paint: mesh.mat.filter((m) => m === Car3D.SURFACES.paint).length,
        panel: mesh.mat.filter((m) => m === Car3D.SURFACES.panel).length,
      };
    }, surfaces);
    expect(result.finish).toBe("satin");
    expect(result.paint).toBe(0);
    expect(result.panel).toBeGreaterThan(0);
  });
});

test.describe("Liveries — creator", () => {
  test.use({ viewport: LANDSCAPE });

  test("the creator offers a finish choice and saves it onto the custom livery", async ({ page }) => {
    await load(page);
    await forgetStored(page, [await page.evaluate(() => "livery.custom." + Teams.LIST[2].id)]);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.locator(".cs-liv-create").click();

    // Against Car3D.FINISH_SURFACE, not a literal. This asserted 3 and the row
    // has offered 7 since four finishes landed on 2026-08-28 (3898741) — the
    // count is a FEATURE's size, so hard-coding it makes the next finish look
    // like a regression. Gloss is the implicit default and has no surface id,
    // hence the +1.
    // BOTH LINEAGES fixed this independently and identically; the merge keeps
    // the deploy side's wording and this side's floor. The floor is not
    // redundant: if FINISH_SURFACE were ever emptied the computed count would
    // be 1 and toHaveCount(1) would pass vacuously, asserting nothing.
    const finishes = await page.evaluate(() => Object.keys(Car3D.FINISH_SURFACE).length + 1);
    const finish = page.locator(".cs-liv-ed-finish [data-cs-finish]");
    expect(finishes).toBeGreaterThan(3);
    await expect(finish).toHaveCount(finishes);
    await expect(page.locator('.cs-liv-ed-finish [data-cs-finish="gloss"]')).toHaveClass(/active/);

    await page.locator('.cs-liv-ed-finish [data-cs-finish="chrome"]').click();
    await expect(page.locator('.cs-liv-ed-finish [data-cs-finish="chrome"]')).toHaveClass(/active/);
    await expect(page.locator('.cs-liv-ed-finish [data-cs-finish="gloss"]')).not.toHaveClass(/active/);
    await expect(page.locator('.cs-liv-ed-finish [data-cs-finish="chrome"]')).toHaveAttribute("aria-pressed", "true");

    await page.locator(".cs-liv-ed-name").fill("Chrome Test");
    await page.screenshot({ path: galleryPath("parts-liveries", "creator-finish-row.png") });
    await page.locator(".cs-liv-ed-save").click();

    const saved = await page.evaluate(() => {
      const team = Teams.LIST[2];
      const list = JSON.parse(localStorage.getItem("apex26.livery.custom." + team.id) || "[]");
      return { list, fitted: JSON.parse(localStorage.getItem("apex26.livery." + team.id) || '""') };
    });
    expect(saved.list).toHaveLength(1);
    expect(saved.list[0].finish).toBe("chrome");
    expect(saved.list[0].name).toBe("Chrome Test");
    expect(saved.fitted).toBe(saved.list[0].id);
  });

  test("a gloss draft stores no finish field at all", async ({ page }) => {
    await load(page);
    await forgetStored(page, [await page.evaluate(() => "livery.custom." + Teams.LIST[2].id)]);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.locator(".cs-liv-create").click();
    await page.locator(".cs-liv-ed-name").fill("Plain Test");
    await page.locator(".cs-liv-ed-save").click();

    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("apex26.livery.custom." + Teams.LIST[2].id) || "[]"));
    expect(saved).toHaveLength(1);
    expect(saved[0].finish).toBeUndefined();
  });

  test("stock satin and chrome schemes are badged in the picker", async ({ page }) => {
    await load(page);
    await openSetup(page);
    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    const badges = await page.locator("#cs-options .cs-opt-tag").allTextContents();
    expect(badges).toContain("SATIN");
    expect(badges).toContain("CHROME");
    await page.screenshot({ path: galleryPath("parts-liveries", "livery-picker-finishes.png") });
  });
});
