import { test, expect } from "@playwright/test";

test("shared scenery kits are bound and Silverstone diagnostics stay finite", async ({ page }) => {
  await page.addInitScript(() => {
    const defs = [];
    defs.push = function (...entries) {
      for (const def of entries) {
        if (def.id !== "silverstone" || typeof def.scenery !== "function") continue;
        // Replace only the track-owned callback so this test isolates the binding
        // contract; Task 6 separately exercises real kit placement by each track.
        def.scenery = (api) => {
          window.__sceneryKitContract = {
            theme: api.sceneryTheme && {
              name: api.sceneryTheme.name,
              palette: api.sceneryTheme.palette,
              budgets: api.sceneryTheme.budgets,
            },
            landmarkMethods: api.landmarkKit ? Object.keys(api.landmarkKit).sort() : [],
            circuitMethods: api.circuitKit ? Object.keys(api.circuitKit).sort() : [],
          };
        };
      }
      return Array.prototype.push.apply(this, entries);
    };
    window.TrackDefs = defs;
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race);

  const state = await page.evaluate(() => {
    window.__sceneryKitContract = null;
    window.__apex.headless(true);
    window.__apex.race("silverstone", "day", "dry");
    return {
      contract: window.__sceneryKitContract,
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    };
  });

  expect(state.contract.theme.name).toBe("permanent");
  expect(state.contract.theme.palette.shell.every(Number.isFinite)).toBe(true);
  expect(state.contract.theme.budgets).toEqual({
    hero: 50000,
    facility: 25000,
    repeated: 10000,
  });
  expect(state.contract.landmarkMethods).toEqual([
    "arch", "canopy", "facade", "roof", "stadiumSection", "tower",
  ]);
  expect(state.contract.circuitMethods).toEqual([
    "cameraCrane", "hospitality", "marshalShelter", "pedestrianBridge",
    "pitBuilding", "raceControl", "recoveryBay", "serviceCompound", "trackSigns",
  ]);
  expect(state.geometry.every((entry) => entry.ok)).toBe(true);
  const hard = [
    ...state.models.invalid,
    ...state.models.suppressed,
    ...state.models.unsafe,
  ].filter((entry) => entry.required);
  expect(hard).toEqual([]);
  expect(state.models.invalid.every((entry) => typeof entry.reason === "string")).toBe(true);
});
