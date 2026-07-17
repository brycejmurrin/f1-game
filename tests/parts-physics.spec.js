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
    const { cost, budget } = await page.evaluate(() => ({
      cost: Parts.getCost({
        engine: "race",
        aero: "active_aero",
        suspension: "active",
        brakes: "brembo_evo",
        tyres: "hypersoft",
        ers: "overcharge",
        gearbox: "f1_spec",
        fuel: "custom_formula",
      }, ""),
      budget: Parts.BUDGET,
    }));
    expect(cost).toBeGreaterThan(budget);
  });
});

test.describe("Parts module — resolveSetup()", () => {
  test("resolves ids, setup, cost, modifiers, tiers, and visual recipes in one pass", async ({ page }) => {
    await load(page);
    const resolved = await page.evaluate(() =>
      Parts.resolveSetup({ engine: "race", aero: "minimal" }, { id: "mclaren", engine: "Mercedes" })
    );
    expect(resolved.setup.engine).toBe("race");
    expect(resolved.setup.aero).toBe("minimal");
    expect(resolved.ids.engine).toBe("race");
    expect(resolved.cost).toBe(160);
    expect(resolved.mods.speed).toBeGreaterThan(1);
    expect(resolved.tiers.aero).toBe(0);
    expect(resolved.visual.engine.id).toBe("race");
    expect(resolved.visual.engine.tier).toBe(2);
  });

  test("unknown saved ids fall back to stable category defaults", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => ({
      resolved: Parts.resolveSetup(
        { engine: "removed_part", fuel: "also_removed" },
        { id: "mclaren", engine: "Mercedes" }
      ),
      defaults: Parts.DEFAULTS,
    }));
    expect(result.resolved.setup.engine).toBe(result.defaults.engine);
    expect(result.resolved.setup.fuel).toBe(result.defaults.fuel);
    expect(result.resolved.ids.engine).toBe(result.defaults.engine);
    expect(result.resolved.ids.fuel).toBe(result.defaults.fuel);
  });

  test("supplier locks support both legacy engine strings and team contexts", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => ({
      legacy: Parts.resolveSetup({ engine: "manu_mercedes" }, "Mercedes").ids.engine,
      matching: Parts.resolveSetup(
        { engine: "manu_mercedes" },
        { id: "mclaren", engine: "Mercedes" }
      ).ids.engine,
      mismatch: Parts.resolveSetup(
        { engine: "manu_mercedes" },
        { id: "ferrari", engine: "Ferrari" }
      ).ids.engine,
      defaultEngine: Parts.DEFAULTS.engine,
    }));
    expect(result.legacy).toBe("manu_mercedes");
    expect(result.matching).toBe("manu_mercedes");
    expect(result.mismatch).toBe(result.defaultEngine);
  });

  test("team and supplier access rules must both match when both are present", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const option = { suppliers: ["Mercedes"], teams: ["mclaren"] };
      return {
        matching: Parts.isOptionAvailable(option, { id: "mclaren", engine: "Mercedes" }),
        wrongTeam: Parts.isOptionAvailable(option, { id: "mercedes", engine: "Mercedes" }),
        wrongSupplier: Parts.isOptionAvailable(option, { id: "mclaren", engine: "Ferrari" }),
      };
    });
    expect(result).toEqual({ matching: true, wrongTeam: false, wrongSupplier: false });
  });

  test("legacy helper APIs are wrappers over the unified result", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const setup = { engine: "race", gearbox: "close_ratio" };
      const team = { id: "mclaren", engine: "Mercedes" };
      const resolved = Parts.resolveSetup(setup, team);
      return {
        resolved,
        mods: Parts.getMods(setup, team),
        cost: Parts.getCost(setup, team),
        visual: Parts.getVisualTiers(setup, team),
      };
    });
    expect(result.mods).toEqual(result.resolved.mods);
    expect(result.cost).toBe(result.resolved.cost);
    expect(result.visual._ids).toEqual(result.resolved.ids);
    expect(result.visual._visual).toEqual(result.resolved.visual);
  });
});

test.describe("Parts module — visual recipes", () => {
  test("every catalog option owns a non-empty category recipe", async ({ page }) => {
    await load(page);
    const missing = await page.evaluate(() => {
      const result = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options) {
          if (!opt.visual || Object.keys(opt.visual).length === 0) result.push(cat.id + ":" + opt.id);
        }
      }
      return result;
    });
    expect(missing).toEqual([]);
  });

  test("resolved recipe data is consumed ahead of legacy option ids", async ({ page }) => {
    await load(page);
    const level = await page.evaluate(() => Car3D.aeroLevelOf({
      aero: 1,
      _ids: { aero: "not_a_catalog_option" },
      _visual: { aero: { id: "test", tier: 1, lvl: 4, vane: 3 } },
    }));
    expect(level).toBe(4);
  });

  test("every fuel recipe owns baked and runtime flame colours", async ({ page }) => {
    await load(page);
    const invalid = await page.evaluate(() => {
      const fuel = Parts.CATALOG.find((cat) => cat.id === "fuel");
      return fuel.options
        .filter((opt) => !Array.isArray(opt.visual?.flame) || !Array.isArray(opt.visual?.fxFlame))
        .map((opt) => opt.id);
    });
    expect(invalid).toEqual([]);
  });

  test("every option recipe builds valid procedural geometry", async ({ page }) => {
    await load(page);
    const failures = await page.evaluate(() => {
      const result = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options) {
          try {
            const team = {
              id: opt.teams?.[0] || opt.team || "mclaren",
              engine: opt.suppliers?.[0] || opt.supplier || "Mercedes",
            };
            const parts = Parts.getVisualTiers({ [cat.id]: opt.id }, team);
            const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { parts });
            if (!mesh.pos.length || !mesh.idx.length || mesh.pos.some((n) => !Number.isFinite(n))) {
              result.push(cat.id + ":" + opt.id + ":invalid");
            }
          } catch (error) {
            result.push(cat.id + ":" + opt.id + ":" + error.message);
          }
        }
      }
      return result;
    });
    expect(failures).toEqual([]);
  });

  test("single-option recipes stay within 1.5x the default triangle budget", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const teamFor = (opt) => ({
        id: opt.teams?.[0] || opt.team || "mclaren",
        engine: opt.suppliers?.[0] || opt.supplier || "Mercedes",
      });
      const baseParts = Parts.getVisualTiers({}, { id: "mclaren", engine: "Mercedes" });
      const baseTriangles = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { parts: baseParts }).idx.length / 3;
      const overBudget = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options) {
          const team = teamFor(opt);
          const parts = Parts.getVisualTiers({ [cat.id]: opt.id }, team);
          const triangles = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { parts }).idx.length / 3;
          if (triangles > baseTriangles * 1.5) overBudget.push(`${cat.id}:${opt.id}:${triangles}`);
        }
      }
      return { baseTriangles, overBudget };
    });
    expect(result.baseTriangles).toBeGreaterThan(0);
    expect(result.overBudget).toEqual([]);
  });

  test("every recipe has primary and secondary visual parameters", async ({ page }) => {
    await load(page);
    const underspecified = await page.evaluate(() => {
      const result = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options) {
          if (Object.keys(opt.visual || {}).length < 2) result.push(cat.id + ":" + opt.id);
        }
      }
      return result;
    });
    expect(underspecified).toEqual([]);
  });

  test("recipe fingerprints are unique within every category", async ({ page }) => {
    await load(page);
    const duplicates = await page.evaluate(() => {
      const stable = (value) => JSON.stringify(
        Object.fromEntries(Object.keys(value || {}).sort().map((key) => [key, value[key]]))
      );
      const result = [];
      for (const cat of Parts.CATALOG) {
        const seen = new Map();
        for (const opt of cat.options) {
          const fingerprint = stable(opt.visual);
          if (seen.has(fingerprint)) result.push(cat.id + ":" + seen.get(fingerprint) + "=" + opt.id);
          else seen.set(fingerprint, opt.id);
        }
      }
      return result;
    });
    expect(duplicates).toEqual([]);
  });
});

test.describe("Parts module — team signatures and factory presets", () => {
  test("every team has a valid deterministic factory preset with its signature", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => Teams.LIST.filter((team) => !team.custom).map((team) => {
      const first = Parts.getFactorySetup(team);
      const second = Parts.getFactorySetup(team);
      const invalid = Parts.CATALOG.flatMap((cat) => {
        const opt = cat.options.find((item) => item.id === first[cat.id]);
        return !opt || !Parts.isOptionAvailable(opt, team) ? [cat.id + ":" + first[cat.id]] : [];
      });
      const signatures = Parts.CATALOG.flatMap((cat) =>
        cat.options.filter((opt) => opt.tag === "SIGNATURE" && opt.id === first[cat.id]).map((opt) => opt.id)
      );
      return {
        id: team.id,
        deterministic: JSON.stringify(first) === JSON.stringify(second),
        key: Parts.factoryKey(team),
        invalid,
        signatures,
      };
    }));
    for (const team of result) {
      expect(team.deterministic, team.id).toBe(true);
      expect(team.key, team.id).toBeTruthy();
      expect(team.invalid, team.id).toEqual([]);
      expect(team.signatures.length, team.id).toBeGreaterThanOrEqual(1);
    }
  });

  test("signature options match a universal equivalent's price and physics", async ({ page }) => {
    await load(page);
    const mismatches = await page.evaluate(() => {
      const stats = ["speed", "accel", "cornering", "braking"];
      const result = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options.filter((item) => item.tag === "SIGNATURE")) {
          const equivalent = cat.options.find((item) => item.id === opt.equivalent);
          if (!equivalent || equivalent.teams || equivalent.team || equivalent.tag === "SIGNATURE") {
            result.push(cat.id + ":" + opt.id + ":missing-equivalent");
            continue;
          }
          if (opt.cost !== equivalent.cost || stats.some((key) => (opt[key] || 1) !== (equivalent[key] || 1))) {
            result.push(cat.id + ":" + opt.id + ":unbalanced");
          }
        }
      }
      return result;
    });
    expect(mismatches).toEqual([]);
  });

  test("a signature selected by the wrong team falls back to the category default", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const signature = Parts.CATALOG.flatMap((cat) =>
        cat.options.filter((opt) => opt.tag === "SIGNATURE").map((opt) => ({ cat, opt }))
      )[0];
      const wrongTeam = Teams.LIST.find((team) => !signature.opt.teams.includes(team.id));
      const resolved = Parts.resolveSetup({ [signature.cat.id]: signature.opt.id }, wrongTeam);
      return {
        category: signature.cat.id,
        selected: resolved.ids[signature.cat.id],
        fallback: Parts.DEFAULTS[signature.cat.id],
      };
    });
    expect(result.selected).toBe(result.fallback);
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
