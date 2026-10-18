// @ts-check
// Livery sidewallInk (garage slice S5): paint-only tyre sidewall lettering ink; the compound band keeps its colour.
// Unset = today's wheels byte for byte; set = colour arrays only, on all four wheels.
// The node twin is tests/unit/livery-sidewall.test.mjs; this pins the same contract on the live
// page's real globals. UNRUN at authoring (no browser in the authoring session): the parent
// runs it with `npm test -- tests/specs/livery-sidewall.spec.js`.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

test.describe("Livery sidewall ink", () => {
  test("sidewallInk recolours the four wheels' lettering, keeps the compound band, and nothing else", async ({ page }) => {
    await ensureLive(page);
    const r = await page.evaluate(() => {
      const team = Teams.LIST[2];
      const parts = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
      const build = (livery) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: team.id, parts, livery, noDriver: true });
      const none = build(undefined), unset = build({ sidewallInk: null });
      const tinted = build({ sidewallInk: [1, 1, 0] });
      const same = (a, b, k) => a[k].length === b[k].length && a[k].every((v, i) => v === b[k][i]);
      const A = Car3D.AXLES, centres = [[0.79, A.frontZ], [0.76, A.rearZ]].flatMap(([x, z]) => [[x, z], [-x, z]]);
      // Only the stock dark lettering may take the ink: any other changed vertex (the compound
      // band above all) would mean the tyre stops reading as its compound.
      const SW = [0.16, 0.16, 0.17], near = (a, b) => Math.abs(a - b) < 1e-4;   // col may be doubles or Float32
      const off = [], corners = new Set();
      let notLettering = 0;
      for (let i = 0; i < none.col.length / 3; i++) {
        if (none.col[i * 3] === tinted.col[i * 3] && none.col[i * 3 + 1] === tinted.col[i * 3 + 1] && none.col[i * 3 + 2] === tinted.col[i * 3 + 2]) continue;
        if (!near(none.col[i * 3], SW[0]) || !near(none.col[i * 3 + 1], SW[1]) || !near(none.col[i * 3 + 2], SW[2])) notLettering++;
        const x = none.pos[i * 3], y = none.pos[i * 3 + 1], z = none.pos[i * 3 + 2];
        if (!centres.some(([cx, cz]) => Math.hypot(x - cx, y - A.wheelY, z - cz) < 0.45)) off.push(i);
        corners.add((x > 0 ? "R" : "L") + (z > 0 ? "F" : "B"));
      }
      return {
        unsetIdentical: ["pos", "nrm", "col", "mat", "idx"].every((k) => same(none, unset, k)),
        geometryIdentical: ["pos", "nrm", "mat", "idx"].every((k) => same(none, tinted, k)),
        colourChanged: !same(none, tinted, "col"),
        offWheel: off.length,
        notLettering,
        corners: [...corners].sort(),
        key: CarWheels.tints({ sidewallInk: [1, 1, 0] }).key,
        emptyKey: CarWheels.tints({}).key,
      };
    });
    expect(r.unsetIdentical).toBe(true);
    expect(r.geometryIdentical).toBe(true);
    expect(r.colourChanged).toBe(true);
    expect(r.offWheel).toBe(0);
    // the compound band stays readable on an inked car (player and AI teammate alike)
    expect(r.notLettering).toBe(0);
    expect(r.corners).toEqual(["LB", "LF", "RB", "RF"]);
    expect(r.emptyKey).toBe("");
    expect(r.key).not.toBe("");
  });

  test("the creator's WHEELS & BRAKES section offers a SIDEWALL INK colour row", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await ensureLive(page);
    // same entry path as parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR, LIVERY, create
    const key = await page.evaluate(() => "livery.custom." + Teams.LIST[2].id);
    await forgetStored(page, [key]);
    await page.evaluate((k) => GameStore.store.set(k, []), key);
    await toMenu(page);
    await pinFreePlay(page, { team: 2, click: false });
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-car").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.locator(".cs-liv-create").click();
    const sec = page.locator('[data-liv-section="WHEELS & BRAKES"]');
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).toHaveCount(1);
    await sec.locator('input[data-liv-field="sidewallInk"]').fill("#ff00ff");
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).not.toHaveClass(/cs-liv-off/);
  });
});
