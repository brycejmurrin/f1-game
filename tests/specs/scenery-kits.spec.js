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

  const state = await page.evaluate(async () => {
    window.__sceneryKitContract = null;
    window.__apex.headless(true);
    await window.__apex.race("silverstone", "day", "dry");
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

for (const [trackId, themeName] of [
  ["singapore", "street"],
  ["bahrain", "desert"],
  ["albert_park", "park"],
  ["silverstone", "permanent"],
  ["qatar", "night-event"],
]) {
  test(`${trackId} emits validated ${themeName} kit facilities`, async ({ page }) => {
    await page.addInitScript((id) => {
      // Capture the RESOLVED theme handed to this track's scenery(api)
      // callback. Unlike the binding test above, the callback is WRAPPED, not
      // replaced, so real kit placement still runs and the facility asserts
      // below stay meaningful.
      const defs = [];
      defs.push = function (...entries) {
        for (const def of entries) {
          if (def.id !== id || typeof def.scenery !== "function") continue;
          const scenery = def.scenery;
          def.scenery = (api) => {
            window.__resolvedSceneryTheme =
              api.sceneryTheme ? api.sceneryTheme.name : null;
            return scenery(api);
          };
        }
        return Array.prototype.push.apply(this, entries);
      };
      window.TrackDefs = defs;
    }, trackId);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race);
    const state = await page.evaluate(async ([id]) => {
      window.__resolvedSceneryTheme = null;
      window.__apex.headless(true);
      await window.__apex.race(id, "day", "dry");
      return {
        theme: window.__resolvedSceneryTheme,
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
    }, [trackId, themeName]);

    // SceneryThemes.resolve falls back to "neutral" for an unknown name and
    // tracks.js falls back per track kind — either silent substitution must
    // fail here, not just produce differently-tinted facilities.
    expect(state.theme, `${trackId} resolves the ${themeName} theme`).toBe(themeName);

    const emitted = state.models.emitted.filter((entry) =>
      entry.id.startsWith(`kit:${trackId}:`));
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    // Every kit emission records a numeric vertex count (models.js modelGroup);
    // a missing field must fail the bound, not pass it vacuously.
    for (const entry of emitted) {
      expect(typeof entry.vertices, `${entry.id} records vertices`).toBe("number");
      expect(entry.vertices, `${entry.id} within vertex budget`).toBeLessThanOrEqual(50000);
    }
    for (const bucket of ["invalid", "suppressed", "unsafe"])
      expect(state.models[bucket].filter((entry) =>
        entry.id.startsWith(`kit:${trackId}:`))).toEqual([]);
    expect(state.geometry.every((entry) => entry.ok)).toBe(true);
  });
}
