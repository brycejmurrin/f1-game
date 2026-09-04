// @ts-check
import { test, expect } from "../helpers/fixtures.js";

// MEASURED COST, DECLARED so tools/ci/select-specs.mjs EXCLUDES this spec
// rather than selecting it into a gate its BOOT alone cannot clear. An
// undeclared budget is UNKNOWN, not safe.
//
// Pages runs 2019/2020/2022/2024 all failed the change-aware gate on this
// file, and the cost is the boot, not the assertions: on CI the page log shows
// `4505ms build mclaren` then `164677ms build mercedes` — a 160-SECOND gap
// while parallel race fixtures share one runner. Same file on an idle box:
// 110.1 s, green. Raising the gate 120 -> 180 s did not help, because the
// fixture's inner `waitForFunction` carries its own BOOT_MS = 45000 and
// expires first (see docs/notes/TESTING-FIELD-NOTES.md, "BOOT_MS is an
// IDLE-box number"). The blocked deploy is the reason this is declared now;
// the real fix is deriving BOOT_MS from test.info().timeout, which is an
// 88-import change wanting its own measurement on a LOADED runner.
// 300 s matches the other over-cap specs on this tree.
test("Albert Park runtime build emits required fountains and safe water geometry", async ({
  racePage,
  pageErrors,
}) => {
  test.setTimeout(300_000);
  await racePage.evaluate(() => window.__apex.race("albert_park", "day", "dry"));
  await racePage.waitForFunction(() => window.__apex.info().track === "albert_park");

  const result = await racePage.evaluate(() => {
    const models = window.__apex.modelDiagnostics();
    const geometry = window.__apex.geometryDiagnostics();
    const requiredFailures = [
      ...models.invalid, ...models.suppressed, ...models.unsafe,
    ].filter((entry) => entry.required);
    return {
      requiredFailures,
      fountains: models.emitted
        .filter((entry) => entry.required && entry.id.startsWith("albert-lake-fountain-"))
        .map((entry) => ({ id: entry.id, vertices: entry.vertices })),
      lakeIds: models.emitted
        .filter((entry) => entry.water && entry.id.startsWith("albert-"))
        .map((entry) => entry.id),
      water: geometry.find((entry) => entry.name === "water"),
      badGeometry: geometry.filter((entry) => !entry.ok),
      spanClearances: models.emitted
        .filter((entry) => entry.overhead)
        .map((entry) => entry.clearance),
      ground: [0.04, 0.30, 0.62, 0.78, 0.97].flatMap((frac) =>
        [-12, 12].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))),
      walls: window.__apex.wallStats(),
    };
  });

  expect(result.requiredFailures).toEqual([]);
  expect(result.fountains).toHaveLength(2);
  expect(result.fountains.every((entry) => entry.vertices > 0)).toBe(true);
  expect(result.lakeIds).toContain("albert-lake-west");
  expect(result.lakeIds).toContain("albert-lake-east");
  expect(result.lakeIds.length).toBeGreaterThanOrEqual(8);
  expect(result.water?.ok).toBe(true);
  expect(result.water?.vertices).toBeGreaterThan(0);
  expect(result.water?.indices).toBeGreaterThan(0);
  expect(result.badGeometry).toEqual([]);
  expect(result.spanClearances.every((clearance) => clearance >= 4.8)).toBe(true);
  expect(result.ground.every(({ gap }) => gap === null || gap <= 0.18)).toBe(true);
  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  expect(pageErrors).toEqual([]);
});
