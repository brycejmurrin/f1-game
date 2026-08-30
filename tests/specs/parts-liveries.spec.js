// @ts-check
// Liveries: catalog shape, the paint FINISH axis (gloss/satin/chrome), and the
// creator's round-trip of a finish into a saved custom livery.
//
// FINISH is a MATERIAL, not a colour: Car3D.build remaps the body-paint surface
// id (SURFACES.paint) to the id the lit shader already treats as matte (panel)
// or mirror (metal). These tests pin that remap — that only PAINT moves, that
// nothing else does, and that an absent finish leaves the mesh untouched.
import { test, expect } from "@playwright/test";
import { galleryPath } from "../helpers/output-paths.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
}

async function openSetup(page) {
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
    const surfaces = await page.evaluate(async () => {
      const team = Teams.LIST[2];
      const satin = Liveries.forTeam(team).find((l) => l.finish === "satin");
      localStorage.setItem("apex26.team", JSON.stringify(2));
      localStorage.setItem("apex26.livery." + team.id, JSON.stringify(satin.id));
      return { livery: satin.id, teamId: team.id };
    });
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
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
    await page.evaluate(() => {
      localStorage.setItem("apex26.team", JSON.stringify(2));
      const team = Teams.LIST[2];
      localStorage.removeItem("apex26.livery.custom." + team.id);
    });
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.locator(".cs-liv-create").click();

    // Counted from Car3D.FINISH_SURFACE, which is what setup-ui builds the row
    // from, plus gloss (the default, which remaps no surface and so has no
    // entry). This asserted a bare 3, the finishes round took the row to 7, and
    // the spec sat red for as long as it took to run a 2.5-hour browser group.
    const finish = page.locator(".cs-liv-ed-finish [data-cs-finish]");
    const wantFinishes = await page.evaluate(() => 1 + Object.keys(Car3D.FINISH_SURFACE).length);
    expect(wantFinishes).toBeGreaterThan(3);
    await expect(finish).toHaveCount(wantFinishes);
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
    await page.evaluate(() => {
      localStorage.setItem("apex26.team", JSON.stringify(2));
      localStorage.removeItem("apex26.livery.custom." + Teams.LIST[2].id);
    });
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
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
