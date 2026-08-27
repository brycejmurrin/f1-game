// @ts-check
// AI car meshes use fixed team factory visuals, independent of player saves.
import { test, expect } from "@playwright/test";

test("AI full-body meshes use deterministic factory presets instead of saved setups", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });

  await page.evaluate(() => {
    const teamIndex = Teams.LIST.findIndex((team) => team.id === "mclaren");
    localStorage.setItem("apex26.team", JSON.stringify(teamIndex));
    localStorage.setItem("apex26.parts.mclaren", JSON.stringify({
      engine: "quali_engine",
      aero: "extreme",
      suspension: "active",
      brakes: "brembo_evo",
      tyres: "hypersoft",
      ers: "overcharge",
      gearbox: "f1_spec",
      fuel: "custom_formula",
    }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });

  await page.evaluate(() => {
    const captures = {};
    const build = Car3D.build;
    Car3D.build = function (c1, c2, opts) {
      if (opts && opts.parts && !opts.noWheels) {
        const ids = Object.assign({}, opts.parts._ids);
        const key = Parts.CATALOG.map((cat) => ids[cat.id]).join("|");
        captures[key] = ids;
      }
      return build(c1, c2, opts);
    };
    window.__factoryMeshCaptures = captures;
    window.__apex.race("monza");
    window.__apex.park(0.1);
    for (let i = 0; i < window.__apex.cars().length; i++) {
      window.__apex.aiPlace(i, 0.1 + i * 0.0002, 0, (i % 4 - 1.5) * 1.5);
    }
  });

  await page.waitForFunction(() =>
    Object.keys(window.__factoryMeshCaptures).length >= 11,
    null, { polling: 100, timeout: 30_000 }
  );

  const result = await page.evaluate(() => {
    const mismatches = [];
    for (const team of Teams.LIST.filter((item) => !item.custom)) {
      const expected = Parts.getFactorySetup(team);
      const actual = window.__factoryMeshCaptures[Parts.factoryKey(team)];
      if (!actual || Parts.CATALOG.some((cat) => actual[cat.id] !== expected[cat.id])) {
        mismatches.push({ id: team.id, expected, actual });
      }
    }
    return {
      mismatches,
      savedAero: JSON.parse(localStorage.getItem("apex26.parts.mclaren")).aero,
      factoryAero: Parts.getFactorySetup(Teams.LIST.find((team) => team.id === "mclaren")).aero,
      renderedAero: window.__factoryMeshCaptures[
        Parts.factoryKey(Teams.LIST.find((team) => team.id === "mclaren"))
      ].aero,
    };
  });

  expect(result.mismatches).toEqual([]);
  expect(result.savedAero).toBe("extreme");
  expect(result.factoryAero).not.toBe(result.savedAero);
  expect(result.renderedAero).toBe(result.factoryAero);
});
