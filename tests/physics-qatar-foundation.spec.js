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
    const ground = [0, 0.05, 0.18, 0.4, 0.62, 0.74, 0.95].flatMap((frac) =>
      [-18, 18].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    return {
      elevationRange: Math.max(...heights) - Math.min(...heights),
      // trackProfile's `slope` is the centreline tangent's y component, i.e.
      // the road gradient at that point — the flatness measure that survives
      // an authored elevation profile.
      slopes: profile.map((point) => point.slope),
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
      lights: window.__apex.lightState(),
      walls: window.__apex.wallStats(),
      ground,
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
    // Qatar is flat by GRADIENT, not by total relief — 6.7 m, measured.
    //
    // This asserted < 0.25 m, which was written against a Lusail trace that was
    // dead flat: the OSM centreline ships y = 0 at every node and no
    // circuit-elevations.js is loaded, so the road really did measure 0.000 m.
    // Two later changes both raise it, and neither is a defect:
    //   • js/circuits/qatar.js authored an `elevations` profile on purpose
    //     ("not the dead 0.0 m the trace shipped with") — three cosine bumps,
    //     +3.5 / +5.5 / -1.0 m, giving exactly 6.500 m of long-wavelength relief.
    //   • buildCenterline's shared `undulate` ripple adds ~0.199 m on top of
    //     that, and runs on every circuit that does not opt out. It alone puts a
    //     genuinely flat Qatar at 0.266 m, i.e. already over the old threshold.
    // Measured headlessly (tools/verify-track.cjs harness): 6.699 m, and
    // identical across two consecutive Tracks.build() calls — the day<->night
    // rebuild adds nothing, so day and night are the same number.
    //
    // The old number's INTENT — "you are not driving Spa" — is the gradient, so
    // assert that too rather than leave relief as the only proxy. Qatar's max
    // |dy/ds| measures 2.19 %, against 15.30 % for Monaco and 22.30 % for Spa
    // through the same probe, so 3.5 % separates a flat desert circuit from
    // every circuit with real relief while leaving the ripple room to move.
    expect(session.elevationRange, `${label} Qatar keeps its authored desert relief`)
      .toBeLessThan(7.5);
    const maxGrade = Math.max(...session.slopes.map(Math.abs));
    expect(maxGrade, `${label} Qatar remains effectively flat underfoot`).toBeLessThan(0.035);
    expect(session.geometry.every((entry) => entry.ok), `${label} geometry is finite`).toBe(true);
    expect(session.geometry.find((entry) => entry.name === "props").vertices).toBeLessThan(265_000);
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
  expect(night.lights.builtNight).toBe(true);

  expect(day.lights.builtNight).toBe(false);
  expect(day.lights.skyStars).toBeLessThan(night.lights.skyStars);
  expect(day.lights.floodEmit).toBeLessThan(night.lights.floodEmit);
  expect(day.lights.ambientSky.reduce((sum, value) => sum + value, 0))
    .toBeGreaterThan(night.lights.ambientSky.reduce((sum, value) => sum + value, 0));
});
