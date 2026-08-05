// @ts-check
import { test, expect } from "./fixtures.js";

const HERO_MODELS = ["qatar-pit-slab", "qatar-t1-vvip-canopy"];

test("Qatar uses the shared track foundation contracts", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { timeout: 15_000 });

  const metadata = await page.evaluate(() => {
    const def = window.TrackDefs.find((track) => track.id === "qatar");
    return {
      sceneryCoordinates: def.sceneryCoordinates,
      flatTerrain: def.flatTerrain,
      terrainOuter: def.terrainOuter,
      dressingExclusions: def.dressingExclusions,
    };
  });
  const collectSession = () => page.evaluate(() => {
    const profile = window.__apex.trackProfile(360);
    const heights = profile.map((point) => point.y);
    const FRACS = [0, 0.05, 0.18, 0.4, 0.62, 0.74, 0.95];
    // ON and JUST OFF the road, where a gap is a hole a driver would see. This
    // is the band every sibling foundation spec samples (Jeddah, Singapore,
    // Madrid, Miami all use +-6 against the same 0.18 m), and Qatar is clean
    // across it.
    const ground = FRACS.flatMap((frac) =>
      [-6, 6].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    // The far terrain EDGE, which is a different question and needs a
    // different number. This used to be sampled at +-18 against 0.18 m, and
    // that bound is not something the engine holds anywhere: a census of all
    // 40 circuits at +-18 puts ELEVEN over it — Monaco at 12.2 m, Zandvoort
    // 1.36, Interlagos 1.18, Kyalami 0.91 — because 18 m out is embankment,
    // wall and run-off, where a step is the terrain doing its job. Qatar's
    // 0.31 is sixth. So the outer band is still checked, for a genuine hole
    // rather than for a seam.
    const groundOuter = FRACS.flatMap((frac) =>
      [-18, 18].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    return {
      elevationRange: Math.max(...heights) - Math.min(...heights),
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
      lights: window.__apex.lightState(),
      walls: window.__apex.wallStats(),
      ground,
      groundOuter,
    };
  });

  await page.evaluate(() => window.__apex.race("qatar", "night", "dry"));
  await page.waitForFunction(() => {
    const lights = window.__apex.lightState();
    return window.__apex.info().track === "qatar" && lights.builtNight;
  }, null, { timeout: 15_000 });
  const night = await collectSession();

  await page.evaluate(() => window.__apex.race("qatar", "day", "dry"));
  await page.waitForFunction(() => !window.__apex.lightState().builtNight, null, { timeout: 15_000 });
  const day = await collectSession();

  expect(metadata.sceneryCoordinates).toBe("racing");
  expect(metadata.flatTerrain).toBe(true);
  expect(metadata.terrainOuter).toBeGreaterThanOrEqual(100);
  expect(metadata.dressingExclusions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "foliage", s0: 0, s1: 1 }),
    ])
  );

  for (const [label, session] of [["night", night], ["day", day]]) {
    // A desert plain, not a billiard table. `< 0.25` was the "dead 0.0 m the
    // trace shipped with" — the exact thing js/circuits/qatar.js says it
    // replaced, with "~6.5 m of long-wavelength undulation, nothing over
    // ~1.5 %". It measures 6.7 m, so the old bound had been failing since the
    // elevations were authored.
    expect(session.elevationRange, `${label} Qatar rolls gently, not steeply`)
      .toBeGreaterThanOrEqual(5);
    expect(session.elevationRange, `${label} Qatar stays a desert plain`)
      .toBeLessThanOrEqual(9);
    expect(session.geometry.every((entry) => entry.ok), `${label} geometry is finite`).toBe(true);
    // Measured ceiling with headroom: Qatar is the second-sparsest circuit on
    // the calendar at ~334k day / ~341k night, well under the ~680k fleet
    // median. The old 265k still predates the massing pass.
    expect(session.geometry.find((entry) => entry.name === "props").vertices).toBeLessThan(430_000);
    const hard = [
      ...session.models.invalid,
      ...session.models.suppressed,
      ...session.models.unsafe,
    ].filter((entry) => entry.required);
    expect(hard, `${label} required models build cleanly`).toEqual([]);
    const emitted = session.models.emitted.map((entry) => entry.id);
    for (const id of HERO_MODELS) expect(emitted, `${label} emits ${id}`).toContain(id);
  }

  expect(night.walls.anyNaN).toBe(false);
  expect(night.walls.minB).toBeGreaterThan(1);
  expect(night.walls.maxB).toBeLessThan(60);
  expect(night.ground.every((gap) => gap === null || gap <= 0.18)).toBe(true);
  expect(night.groundOuter.every((gap) => gap === null || gap <= 0.5)).toBe(true);
  expect(night.lights.builtNight).toBe(true);

  expect(day.lights.builtNight).toBe(false);
  expect(day.lights.skyStars).toBeLessThan(night.lights.skyStars);
  expect(day.lights.floodEmit).toBeLessThan(night.lights.floodEmit);
  expect(day.lights.ambientSky.reduce((sum, value) => sum + value, 0))
    .toBeGreaterThan(night.lights.ambientSky.reduce((sum, value) => sum + value, 0));
});
