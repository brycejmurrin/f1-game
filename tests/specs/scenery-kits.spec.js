import { test, expect } from "@playwright/test";

// These tests build a real circuit, and until 2026-09-02 they did not.
//
// The boot split left them reading a null theme and finishing in ~8 s without
// ever completing a build; fixing that (hook the lazy TrackScenery registry,
// then await info().track) made them do the work they always claimed to do.
// That work is 10-33 s per circuit locally and slower on a shared runner, so
// three of them then died at exactly 120.0 s "while setting up context" -
// Playwright counts fixture setup against the test budget, and the previous
// test's now-heavy page is still tearing down. The budget was sized for a test
// that did nothing.
//
// This is NOT widening a tolerance to make a failing assertion pass: no
// assertion fails now (bahrain, silverstone and the kit-binding test all pass
// in ~10 s on the same run). It is sizing the budget to the work.
test.describe.configure({ timeout: 300000 });

// TWO things the boot split (456af0f3) broke here, both silent.
//
// Hook the circuit's bespoke scenery closure WHEREVER it lives.
//
// The boot split (456af0f3) moved every shipped closure out of the def and into
// a lazy registry: js/circuits/scenery/<id>.js does
// `(window.TrackScenery = window.TrackScenery || {})["<id>"] = fn`, fetched by
// game.js for the one circuit being built, and tracks.js:1818 resolves
// `def.scenery || window.TrackScenery[def.id]`. These tests used to wrap
// TrackDefs.push and skip any def whose `.scenery` was not ALREADY a function —
// which, after the split, is every def. The wrapper silently never installed,
// __resolvedSceneryTheme stayed null, and all six theme tests failed
// identically (Expected "street"/"desert"/"park"/... Received null) while the
// product resolved themes correctly. Uniform failure across unrelated circuits
// was the tell. It took pages.yml runs 1895/1897/1898 red.
//
// Hook BOTH seams: the def (a circuit not yet split, and the node harnesses,
// which tracks.js honours FIRST) and the registry, intercepting the lazy
// assignment with a setter so the wrap survives whenever that script lands.
//
// AND WAIT FOR THE BUILD. __apex.race() calls startRace() WITHOUT awaiting it
// (js/agent/apex.js:926), and the same split made startRace async precisely so
// it could `await ensureScenery(trackIdx)` (js/game.js:2659). So race() now
// returns before the circuit is built, and a spec that races and reads in ONE
// page.evaluate() reads before the scenery callback has run. Every such spec
// silently measures a half-built track. Await info().track instead.
const installSceneryHook = ({ id, replace }) => {
  const wrap = (orig) => (api) => {
    if (replace) {
      window.__sceneryKitContract = {
        theme: api.sceneryTheme && {
          name: api.sceneryTheme.name,
          palette: api.sceneryTheme.palette,
          budgets: api.sceneryTheme.budgets,
        },
        landmarkMethods: api.landmarkKit ? Object.keys(api.landmarkKit).sort() : [],
        circuitMethods: api.circuitKit ? Object.keys(api.circuitKit).sort() : [],
      };
      return undefined;   // binding contract only — real placement not wanted here
    }
    window.__resolvedSceneryTheme = api.sceneryTheme ? api.sceneryTheme.name : null;
    return orig(api);
  };
  const defs = [];
  defs.push = function (...entries) {
    for (const def of entries) {
      if (def.id === id && typeof def.scenery === "function") def.scenery = wrap(def.scenery);
    }
    return Array.prototype.push.apply(this, entries);
  };
  window.TrackDefs = defs;
  window.TrackScenery = window.TrackScenery || {};
  let real = null;
  Object.defineProperty(window.TrackScenery, id, {
    configurable: true,
    get() { return real ? wrap(real) : undefined; },
    set(fn) { real = fn; },
  });
};

test("shared scenery kits are bound and Silverstone diagnostics stay finite", async ({ page }) => {
  await page.addInitScript(installSceneryHook, { id: "silverstone", replace: true });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race);

  await page.evaluate(() => {
    window.__sceneryKitContract = null;
    window.__apex.headless(true);
    window.__apex.race("silverstone", "day", "dry");
  });
  await page.waitForFunction(() => window.__apex.info().track != null,
    null, { polling: 100, timeout: 100000 });
  const state = await page.evaluate(() => ({
    contract: window.__sceneryKitContract,
    geometry: window.__apex.geometryDiagnostics(),
    models: window.__apex.modelDiagnostics(),
  }));

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
    await page.addInitScript(installSceneryHook, { id: trackId, replace: false });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race);
    await page.evaluate(([id]) => {
      window.__resolvedSceneryTheme = null;
      window.__apex.headless(true);
      window.__apex.race(id, "day", "dry");
    }, [trackId]);
    await page.waitForFunction(() => window.__apex.info().track != null,
      null, { polling: 100, timeout: 100000 });
    const state = await page.evaluate(() => ({
      theme: window.__resolvedSceneryTheme,
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    }));

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
