// @ts-check
// Tests for Parts module logic — no UI required, runs against window.Parts directly.
// Covers: getMods() multiplier math, getCost() addition, statMult(), catalog structure,
// new GEARBOX and FUEL categories, and supplier-exclusive option filtering.
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof Parts !== "undefined" && Parts.CATALOG, { timeout: 8000 });
}

test.describe("Parts module — catalog structure", () => {
  test("has exactly 8 categories", async ({ page }) => {
    await load(page);
    const count = await page.evaluate(() => Parts.CATALOG.length);
    expect(count).toBe(8);
  });

  test("category IDs are correct", async ({ page }) => {
    await load(page);
    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    expect(ids).toEqual(["engine", "aero", "suspension", "brakes", "tyres", "ers", "gearbox", "fuel"]);
  });

  test("GEARBOX category exists with F1 Spec option", async ({ page }) => {
    await load(page);
    const found = await page.evaluate(() => {
      const cat = Parts.CATALOG.find((c) => c.id === "gearbox");
      return cat ? cat.options.some((o) => o.id === "f1_spec") : false;
    });
    expect(found).toBe(true);
  });

  test("FUEL category exists with Qualifying Mix option", async ({ page }) => {
    await load(page);
    const found = await page.evaluate(() => {
      const cat = Parts.CATALOG.find((c) => c.id === "fuel");
      return cat ? cat.options.some((o) => o.id === "quali_mix") : false;
    });
    expect(found).toBe(true);
  });

  test("all categories have at least 3 options", async ({ page }) => {
    await load(page);
    const minCounts = await page.evaluate(() =>
      Parts.CATALOG.map((c) => ({ id: c.id, count: c.options.length }))
    );
    for (const { id, count } of minCounts) {
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  test("budget is 600", async ({ page }) => {
    await load(page);
    const budget = await page.evaluate(() => Parts.BUDGET);
    expect(budget).toBe(600);
  });

  test("DEFAULTS includes gearbox and fuel", async ({ page }) => {
    await load(page);
    const defaults = await page.evaluate(() => Parts.DEFAULTS);
    expect(defaults.gearbox).toBe("standard");
    expect(defaults.fuel).toBe("standard");
  });
});

test.describe("Parts module — getMods()", () => {
  test("all defaults return near-1.0 multipliers", async ({ page }) => {
    await load(page);
    const mods = await page.evaluate(() => Parts.getMods({}, ""));
    // Medium aero + medium tyres cancel each other's deviations; combined result near 1.0
    expect(mods.speed).toBeGreaterThan(0.9);
    expect(mods.accel).toBeGreaterThan(0.9);
    expect(mods.cornering).toBeGreaterThan(0.9);
    expect(mods.braking).toBeGreaterThan(0.9);
  });

  test("race engine increases speed and accel", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, ""));
    const withRace = await page.evaluate(() => Parts.getMods({ engine: "race" }, ""));
    expect(withRace.speed).toBeGreaterThan(base.speed);
    expect(withRace.accel).toBeGreaterThan(base.accel);
  });

  test("extreme aero boosts cornering and reduces speed", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, ""));
    const withExtreme = await page.evaluate(() => Parts.getMods({ aero: "extreme" }, ""));
    expect(withExtreme.cornering).toBeGreaterThan(base.cornering);
    expect(withExtreme.speed).toBeLessThan(base.speed);
  });

  test("f1_spec gearbox increases accel and cornering", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, ""));
    const withGearbox = await page.evaluate(() => Parts.getMods({ gearbox: "f1_spec" }, ""));
    expect(withGearbox.accel).toBeGreaterThan(base.accel);
    expect(withGearbox.cornering).toBeGreaterThan(base.cornering);
  });

  test("quali_mix fuel increases speed and accel", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, ""));
    const withFuel = await page.evaluate(() => Parts.getMods({ fuel: "quali_mix" }, ""));
    expect(withFuel.speed).toBeGreaterThan(base.speed);
    expect(withFuel.accel).toBeGreaterThan(base.accel);
  });

  test("combining gearbox + fuel stacks multipliers", async ({ page }) => {
    await load(page);
    const gearboxOnly = await page.evaluate(() => Parts.getMods({ gearbox: "f1_spec" }, ""));
    const combined = await page.evaluate(() => Parts.getMods({ gearbox: "f1_spec", fuel: "quali_mix" }, ""));
    expect(combined.speed).toBeGreaterThan(gearboxOnly.speed);
    expect(combined.accel).toBeGreaterThan(gearboxOnly.accel);
  });

  test("carbon ceramic brakes significantly improve braking", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, ""));
    const withCeramic = await page.evaluate(() => Parts.getMods({ brakes: "ceramic" }, ""));
    expect(withCeramic.braking).toBeGreaterThan(base.braking * 1.1);
  });

  test("supplier option ignored when team engine doesn't match", async ({ page }) => {
    await load(page);
    // Ferrari factory unit selected but team engine is "Mercedes"
    const withMismatch = await page.evaluate(() => Parts.getMods({ engine: "manu_ferrari" }, "Mercedes"));
    const base = await page.evaluate(() => Parts.getMods({}, "Mercedes"));
    // Falls back to default — multipliers should match stock engine baseline
    expect(withMismatch.speed).toBeCloseTo(base.speed, 2);
  });

  test("supplier option applied when team engine matches", async ({ page }) => {
    await load(page);
    const base = await page.evaluate(() => Parts.getMods({}, "Mercedes"));
    const withFactory = await page.evaluate(() => Parts.getMods({ engine: "manu_mercedes" }, "Mercedes"));
    expect(withFactory.speed).toBeGreaterThan(base.speed);
    expect(withFactory.accel).toBeGreaterThan(base.accel);
  });
});

test.describe("Parts module — getCost()", () => {
  test("all defaults cost 0", async ({ page }) => {
    await load(page);
    const cost = await page.evaluate(() => Parts.getCost({}, ""));
    expect(cost).toBe(0);
  });

  test("race engine costs 160", async ({ page }) => {
    await load(page);
    const cost = await page.evaluate(() => Parts.getCost({ engine: "race" }, ""));
    expect(cost).toBe(160);
  });

  test("f1_spec gearbox costs 180", async ({ page }) => {
    await load(page);
    const cost = await page.evaluate(() => Parts.getCost({ gearbox: "f1_spec" }, ""));
    expect(cost).toBe(180);
  });

  test("custom_formula fuel costs 200", async ({ page }) => {
    await load(page);
    const cost = await page.evaluate(() => Parts.getCost({ fuel: "custom_formula" }, ""));
    expect(cost).toBe(200);
  });

  test("costs add up correctly across multiple categories", async ({ page }) => {
    await load(page);
    // race(160) + active suspension(190) + ceramic brakes(140) = 490
    const cost = await page.evaluate(() =>
      Parts.getCost({ engine: "race", suspension: "active", brakes: "ceramic" }, "")
    );
    expect(cost).toBe(490);
  });

  test("max setup exceeds budget of 600", async ({ page }) => {
    await load(page);
    // Max everything — total should be well over 600
    const cost = await page.evaluate(() =>
      Parts.getCost({
        engine: "race",
        aero: "active_aero",
        suspension: "active",
        brakes: "brembo_evo",
        tyres: "hypersoft",
        ers: "overcharge",
        gearbox: "f1_spec",
        fuel: "custom_formula",
      }, "")
    );
    expect(cost).toBeGreaterThan(Parts.BUDGET);
  });
});

test.describe("Parts module — statMult()", () => {
  test("stat 0 → ~0.85 multiplier", async ({ page }) => {
    await load(page);
    const m = await page.evaluate(() => Parts.statMult(0));
    expect(m).toBeCloseTo(0.85, 2);
  });

  test("stat 100 → 1.00 multiplier", async ({ page }) => {
    await load(page);
    const m = await page.evaluate(() => Parts.statMult(100));
    expect(m).toBeCloseTo(1.00, 2);
  });

  test("stat 50 → ~0.925 multiplier", async ({ page }) => {
    await load(page);
    const m = await page.evaluate(() => Parts.statMult(50));
    expect(m).toBeCloseTo(0.925, 2);
  });
});
