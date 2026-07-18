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
  test("every declared recipe field belongs to a known visual consumer registry", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const registry = Parts.VISUAL_FIELD_REGISTRY;
      const knownConsumers = new Set(["geometry", "material", "runtime"]);
      const registered = new Map();
      const declared = new Set();
      const invalidConsumers = [];
      const malformed = [];
      for (const [consumer, categories] of Object.entries(registry || {})) {
        if (!knownConsumers.has(consumer)) invalidConsumers.push(consumer);
        for (const [category, fields] of Object.entries(categories || {})) {
          if (!Array.isArray(fields)) {
            malformed.push(consumer + ":" + category);
            continue;
          }
          for (const field of fields) {
            const key = category + "." + field;
            const owners = registered.get(key) || [];
            owners.push(consumer);
            registered.set(key, owners);
          }
        }
      }
      const missing = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options) {
          for (const field of Object.keys(opt.visual || {})) {
            const key = cat.id + "." + field;
            declared.add(key);
            if (!registered.has(key)) missing.push(cat.id + ":" + opt.id + ":" + field);
          }
        }
      }
      return {
        exists: !!registry,
        invalidConsumers,
        malformed,
        missing,
        stale: [...registered.keys()].filter((key) => !declared.has(key)),
        duplicateOwners: [...registered.entries()]
          .filter(([, owners]) => owners.length !== 1)
          .map(([key, owners]) => key + ":" + owners.join(",")),
      };
    });
    expect(result.exists).toBe(true);
    expect(result.invalidConsumers).toEqual([]);
    expect(result.malformed).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.duplicateOwners).toEqual([]);
  });

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

  test("every engine recipe owns a unique consumed bodywork shape", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const engine = Parts.CATALOG.find((cat) => cat.id === "engine");
      const fields = ["podWidth", "shoulderHeight", "undercut", "coke", "tailWidth", "coverHeight"];
      const missing = [];
      const fingerprints = new Map();
      for (const opt of engine.options) {
        const visual = opt.visual || {};
        const absent = fields.filter((field) => !Number.isFinite(visual[field]));
        if (absent.length) missing.push(opt.id + ":" + absent.join(","));
        const key = fields.map((field) => visual[field]).join("|");
        const owners = fingerprints.get(key) || [];
        owners.push(opt.id);
        fingerprints.set(key, owners);
      }
      return {
        missing,
        duplicates: [...fingerprints.values()].filter((owners) => owners.length > 1),
        registered: fields.filter((field) =>
          Parts.VISUAL_FIELD_REGISTRY.geometry.engine.includes(field)),
      };
    });
    expect(result.missing).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.registered).toHaveLength(6);
  });

  test("each engine bodywork field independently deforms its owned anchor", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const base = {
        in: 1, inlet: 1, outlet: 1,
        podWidth: 1, shoulderHeight: 1, undercut: 1,
        coke: 1, tailWidth: 1, coverHeight: 1,
      };
      const anchors = (engine) => Car3D.bodyAnchors({
        engine: 1, _visual: { engine },
      });
      const low = anchors(base);
      return {
        podWidth: [low.podAt(0.22).x, anchors({ ...base, podWidth: 1.22 }).podAt(0.22).x],
        shoulderHeight: [low.podAt(0.22).top,
          anchors({ ...base, shoulderHeight: 1.22 }).podAt(0.22).top],
        undercut: [low.podAt(0.62).bottom,
          anchors({ ...base, undercut: 1.25 }).podAt(0.62).bottom],
        coke: [low.podAt(-0.62).x, anchors({ ...base, coke: 1.28 }).podAt(-0.62).x],
        tailWidth: [low.podAt(-1.48).x,
          anchors({ ...base, tailWidth: 1.20 }).podAt(-1.48).x],
        coverHeight: [low.coverAt(-0.55).top,
          anchors({ ...base, coverHeight: 1.25 }).coverAt(-0.55).top],
        axles: Car3D.AXLES,
      };
    });
    for (const field of ["podWidth", "shoulderHeight", "undercut", "coke", "tailWidth", "coverHeight"]) {
      expect(result[field][1], field).not.toBeCloseTo(result[field][0], 3);
    }
    expect(result.axles).toEqual({ frontZ: 1.7, rearZ: -1.6, wheelY: 0.34 });
  });

  test("sidepod and nose details stay attached across extreme engine recipes", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const inspect = (engine) => {
        const parts = { engine: 1, ers: 2, _visual: {
          engine,
          ers: { id: "probe", tier: 2, led: [0.31, 1.71, 2.31], pack: 1.2 },
        } };
        const accent = [0.123, 0.456, 0.789];
        const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
          noWheels: true, livery: { accent }, parts,
        });
        const anchors = Car3D.bodyAnchors(parts);
        const decals = CarMesh.carDecalData(2, parts);
        const verticesFor = (color) => {
          const points = [];
          for (let i = 0; i < mesh.pos.length; i += 3) {
            if (mesh.col[i] === color[0] && mesh.col[i + 1] === color[1] && mesh.col[i + 2] === color[2]) {
              points.push([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
            }
          }
          return points;
        };
        const podDecals = [];
        const noseDecals = [];
        for (let i = 0; i < decals.pos.length; i += 3) {
          const p = [decals.pos[i], decals.pos[i + 1], decals.pos[i + 2]];
          if (Math.abs(p[0]) > 0.35 && p[2] > -0.40 && p[2] < 0.50) podDecals.push(p);
          if (Math.abs(p[0]) < 0.30 && p[2] > 1.10 && p[2] < 2.20) noseDecals.push(p);
        }
        const podGap = (p) => Math.abs(Math.abs(p[0]) - anchors.podAt(p[2]).x);
        const noseGap = (p) => Math.abs(p[1] - anchors.noseAt(p[2]).top);
        const accentPod = verticesFor(accent).filter((p) => p[2] < 0.5 && p[2] > -0.5);
        const drls = verticesFor([2.4, 2.4, 2.7]);
        return {
          podDecalZ: [...new Set(podDecals.map((p) => Number(p[2].toFixed(3))))],
          podDecalMaxGap: Math.max(...podDecals.map(podGap)),
          podDecalsInBounds: podDecals.every((p) => {
            const a = anchors.podAt(p[2]);
            return p[1] >= a.bottom - 0.02 && p[1] <= a.top + 0.02;
          }),
          noseDecalMaxGap: Math.max(...noseDecals.map(noseGap)),
          accentPodMaxGap: Math.max(...accentPod.map(podGap)),
          drlNoseMaxGap: Math.max(...drls.map((p) =>
            Math.min(
              Math.abs(p[1] - anchors.noseAt(p[2]).top),
              Math.abs(Math.abs(p[0]) - anchors.noseAt(p[2]).side),
            ))),
        };
      };
      const base = {
        in: 1, inlet: 1, outlet: 1,
        podWidth: 1, shoulderHeight: 1, undercut: 1,
        coke: 1, tailWidth: 1, coverHeight: 1,
      };
      return [
        inspect({ ...base, podWidth: 0.72, shoulderHeight: 0.76, undercut: 1.38,
          coke: 1.38, tailWidth: 0.70, coverHeight: 0.78 }),
        inspect({ ...base, podWidth: 1.28, shoulderHeight: 1.28, undercut: 0.72,
          coke: 0.72, tailWidth: 1.30, coverHeight: 1.28 }),
      ];
    });
    for (const variant of result) {
      expect(variant.podDecalZ).toContain(0.22);
      expect(variant.podDecalsInBounds).toBe(true);
      expect(variant.podDecalMaxGap).toBeLessThan(0.035);
      expect(variant.noseDecalMaxGap).toBeLessThan(0.025);
      expect(variant.accentPodMaxGap).toBeLessThan(0.04);
      expect(variant.drlNoseMaxGap).toBeLessThan(0.04);
    }
  });

  test("sidepod sponsor quads follow every crossed loft interval", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const recipes = [
        { podWidth: 0.72, shoulderHeight: 0.76, undercut: 1.38, coke: 1.38, tailWidth: 0.70, coverHeight: 0.78 },
        { podWidth: 1.28, shoulderHeight: 1.28, undercut: 0.72, coke: 0.72, tailWidth: 1.30, coverHeight: 1.28 },
      ];
      return recipes.map((engine) => {
        const parts = { engine: 1, _visual: { engine: { in: 1, inlet: 1, outlet: 1, ...engine } } };
        const anchors = Car3D.bodyAnchors(parts);
        const data = CarMesh.carDecalData(2, parts);
        const title = LiveryTex.REGIONS.titleA, size = LiveryTex.SIZE;
        const titleU = [title.x / size, (title.x + title.w) / size];
        const titleV = [1 - (title.y + title.h) / size, 1 - title.y / size];
        const titleVerts = [];
        for (let i = 0; i < data.pos.length / 3; i++) {
          const p = [data.pos[i*3], data.pos[i*3+1], data.pos[i*3+2]];
          const uv = [data.uv[i*2], data.uv[i*2+1]];
          if (Math.abs(p[0]) > 0.35 && p[2] >= -0.34 && p[2] <= 0.46 &&
              uv[0] >= titleU[0] - 1e-7 && uv[0] <= titleU[1] + 1e-7 &&
              uv[1] >= titleV[0] - 1e-7 && uv[1] <= titleV[1] + 1e-7) {
            titleVerts.push({ side: Math.sign(p[0]), z: p[2], u: uv[0] });
          }
        }
        const triangles = [];
        for (let i = 0; i < data.idx.length; i += 3) {
          const points = [0, 1, 2].map((j) => {
            const k = data.idx[i + j] * 3;
            return [data.pos[k], data.pos[k + 1], data.pos[k + 2]];
          });
          if (points.every((p) => Math.abs(p[0]) > 0.35 && p[2] >= -0.34 && p[2] <= 0.46)) {
            triangles.push(points);
          }
        }
        const samples = [];
        for (const tri of triangles) {
          for (const weights of [[1,0,0], [0,1,0], [0,0,1], [1/3,1/3,1/3]]) {
            const p = [0, 1, 2].map((axis) =>
              tri.reduce((sum, point, j) => sum + point[axis] * weights[j], 0));
            samples.push({
              z: p[2],
              gap: Math.abs(Math.abs(p[0]) - anchors.podAt(p[2]).x),
            });
          }
        }
        return {
          triangleCount: triangles.length,
          crossesCrease: triangles.some((tri) => {
            const zs = tri.map((p) => p[2]);
            return Math.min(...zs) < 0.22 && Math.max(...zs) > 0.22;
          }),
          hasCreaseVertices: samples.some((p) => Math.abs(p.z - 0.22) < 1e-6),
          maxGap: Math.max(...samples.map((p) => p.gap)),
          uvCoversRegion: Math.abs(Math.min(...titleVerts.map((p) => p.u)) - titleU[0]) < 1e-6 &&
            Math.abs(Math.max(...titleVerts.map((p) => p.u)) - titleU[1]) < 1e-6,
          uvContinuousAtCrease: [-1, 1].every((side) => {
            const values = titleVerts.filter((p) => p.side === side && Math.abs(p.z - 0.22) < 1e-6)
              .map((p) => p.u);
            return values.length >= 4 && Math.max(...values) - Math.min(...values) < 1e-6;
          }),
        };
      });
    });
    for (const variant of result) {
      expect(variant.triangleCount).toBeGreaterThanOrEqual(8);
      expect(variant.crossesCrease).toBe(false);
      expect(variant.hasCreaseVertices).toBe(true);
      expect(variant.maxGap).toBeLessThan(0.035);
      expect(variant.uvCoversRegion).toBe(true);
      expect(variant.uvContinuousAtCrease).toBe(true);
    }
  });

  test("imported bodies keep legacy decal anchors when engine setup changes", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
      const low = { engine: 1, _visual: { engine: {
        in: 1, inlet: 1, outlet: 1, podWidth: 0.72, shoulderHeight: 0.76,
        undercut: 1.38, coke: 1.38, tailWidth: 0.70, coverHeight: 0.78,
      } } };
      const high = { engine: 1, _visual: { engine: {
        in: 1, inlet: 1, outlet: 1, podWidth: 1.28, shoulderHeight: 1.28,
        undercut: 0.72, coke: 0.72, tailWidth: 1.30, coverHeight: 1.28,
      } } };
      const importedLow = CarMesh.carDecalData(2, low, true);
      const importedHigh = CarMesh.carDecalData(2, high, true);
      const proceduralLow = CarMesh.carDecalData(2, low, false);
      const proceduralHigh = CarMesh.carDecalData(2, high, false);
      const importedMesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
      const realFetch = window.fetch;
      window.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      GLTF.toMesh = () => importedMesh;
      const realBodyAnchors = Car3D.bodyAnchors;
      window.__importAnchorInputs = [];
      Car3D.bodyAnchors = (parts) => {
        window.__importAnchorInputs.push(parts);
        return realBodyAnchors(parts);
      };
      const loaded = await __apex.loadCarModel("memory://static-car.glb");
      window.fetch = realFetch;
      CarMesh.getCarDecalMesh(2, low, true);
      CarMesh.getCarDecalMesh(2, high, true);
      return {
        loaded,
        importedPositionsEqual: JSON.stringify(importedLow.pos) === JSON.stringify(importedHigh.pos),
        proceduralPositionsEqual: JSON.stringify(proceduralLow.pos) === JSON.stringify(proceduralHigh.pos),
      };
    });
    await page.waitForTimeout(100);
    const runtimeAnchors = await page.evaluate(() => window.__importAnchorInputs);
    expect(result.loaded).toBe(true);
    expect(result.importedPositionsEqual).toBe(true);
    expect(result.proceduralPositionsEqual).toBe(false);
    expect(runtimeAnchors.length).toBeGreaterThan(0);
    expect(runtimeAnchors.every((parts) => parts == null)).toBe(true);
  });

  test("continuous sidepod loft omits coincident internal station caps", async ({ page }) => {
    await load(page);
    const caps = await page.evaluate(() => {
      const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
      const internalZ = new Set([0.22, -0.62]);
      let count = 0;
      for (let i = 0; i < mesh.idx.length; i += 3) {
        const ia = mesh.idx[i] * 3, ib = mesh.idx[i + 1] * 3, ic = mesh.idx[i + 2] * 3;
        const z = mesh.pos[ia + 2];
        if (!internalZ.has(z) || mesh.pos[ib + 2] !== z || mesh.pos[ic + 2] !== z) continue;
        if (mesh.col[ia] === 0.7 && mesh.col[ia + 1] === 0.05 && mesh.col[ia + 2] === 0.05) count++;
      }
      return count;
    });
    expect(caps).toBe(0);
  });

  test("every aero recipe declares consumed wing, floor, and diffuser geometry", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const fields = ["frontSweep", "frontTaper", "frontRise", "rearSweep",
        "rearTaper", "floorEdge", "floorCut", "diffuserRise"];
      const aero = Parts.CATALOG.find((cat) => cat.id === "aero");
      const missing = aero.options.flatMap((opt) =>
        fields.filter((field) => opt.visual[field] == null)
          .map((field) => `${opt.id}:${field}`));
      const registered = fields.filter((field) =>
        Parts.VISUAL_FIELD_REGISTRY.geometry.aero.includes(field));
      return { missing, registered, fields };
    });
    expect(result.missing).toEqual([]);
    expect(result.registered.sort()).toEqual(result.fields.sort());
  });

  test("each aero shape field independently deforms procedural geometry", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const base = {
        id: "probe", tier: 1, lvl: 2, beam: 0, drs: 0, vane: 1,
        frontSweep: 0, frontTaper: 1, frontRise: 0,
        rearSweep: 0, rearTaper: 1,
        floorEdge: 1, floorCut: 0, diffuserRise: 1,
      };
      const build = (visual) => Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
        noWheels: true,
        parts: { aero: 1, _visual: { aero: visual } },
      });
      const baseline = build(base);
      const variants = {
        frontSweep: build({ ...base, frontSweep: 0.16 }),
        frontTaper: build({ ...base, frontTaper: 0.78 }),
        frontRise: build({ ...base, frontRise: 0.12 }),
        rearSweep: build({ ...base, rearSweep: 0.14 }),
        rearTaper: build({ ...base, rearTaper: 0.76 }),
        floorEdge: build({ ...base, floorEdge: 1.28 }),
        floorCut: build({ ...base, floorCut: 0.18 }),
        diffuserRise: build({ ...base, diffuserRise: 1.32 }),
      };
      const differs = {};
      for (const [field, mesh] of Object.entries(variants)) {
        differs[field] = mesh.pos.length !== baseline.pos.length ||
          mesh.pos.some((value, index) => Math.abs(value - baseline.pos[index]) > 1e-6);
      }
      return differs;
    });
    for (const [field, differs] of Object.entries(result)) {
      expect(differs, field).toBe(true);
    }
  });

  test("rear endplates use a swept tapered profile that still contains the number board", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => [0, 2, 4].map((level) => {
      const plate = Car3D.endplate(level);
      const board = Car3D.numberBoard(level);
      if (!plate.front || !plate.rear) {
        return { tapered: false, swept: false, boardInside: false };
      }
      const midBottom = (plate.front.bottom + plate.rear.bottom) * 0.5;
      const midTop = (plate.front.top + plate.rear.top) * 0.5;
      return {
        tapered: plate.front.sy < plate.rear.sy,
        swept: plate.front.top < plate.rear.top,
        boardInside: board.cy - board.h * 0.5 > midBottom
          && board.cy + board.h * 0.5 < midTop,
      };
    }));
    expect(result).toEqual([
      { tapered: true, swept: true, boardInside: true },
      { tapered: true, swept: true, boardInside: true },
      { tapered: true, swept: true, boardInside: true },
    ]);
  });

  test("every rear-wing top plane reaches both endplates after taper and sweep", async ({ page }) => {
    await load(page);
    const detached = await page.evaluate(() => {
      const aero = Parts.CATALOG.find((category) => category.id === "aero");
      return aero.options.flatMap((option) => {
        const style = option.visual;
        const level = style.lvl;
        const ep = Car3D.endplate(level);
        const sweep = Math.max(-0.06, Math.min(0.20, style.rearSweep));
        const crownY = ep.rear.top - 0.018;
        const expectedY = crownY - (level >= 4 || style.drs ? 0.075 : 0)
          + 0.035 * 0.5;
        const expectedZ = -2.64 - sweep;
        const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
          noWheels: true,
          parts: { aero: 1, _visual: { aero: style } },
        });
        let maxX = 0;
        for (let i = 0; i < mesh.pos.length; i += 3) {
          if (Math.abs(mesh.pos[i + 1] - expectedY) > 1e-5
            || Math.abs(mesh.pos[i + 2] - expectedZ) > 1e-5) continue;
          maxX = Math.max(maxX, Math.abs(mesh.pos[i]));
        }
        return maxX >= 0.495 ? [] : [`${option.id}:${maxX.toFixed(3)}`];
      });
    });
    expect(detached).toEqual([]);
  });

  test("every rear-wing top plane stays vertically inside its endplate crown", async ({ page }) => {
    await load(page);
    const detached = await page.evaluate(() => {
      const aero = Parts.CATALOG.find((category) => category.id === "aero");
      return aero.options.flatMap((option) => {
        const ep = Car3D.endplate(option.visual.lvl);
        const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
          noWheels: true,
          parts: { aero: 1, _visual: { aero: option.visual } },
        });
        let maxY = -Infinity;
        for (let i = 0; i < mesh.mat.length; i++) {
          const x = Math.abs(mesh.pos[i * 3]), y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
          if (mesh.mat[i] === Car3D.SURFACES.paint && x >= 0.495 && z < -2.50) {
            maxY = Math.max(maxY, y);
          }
        }
        const crownTop = ep.rear.top + 0.012;
        return maxY <= crownTop + 1e-6 ? [] : [`${option.id}:${(maxY - crownTop).toFixed(3)}`];
      });
    });
    expect(detached).toEqual([]);
  });

  test("every front-wing top flap reaches its endplates after taper and tip rise", async ({ page }) => {
    await load(page);
    const detached = await page.evaluate(() => {
      const aero = Parts.CATALOG.find((category) => category.id === "aero");
      const elements = [
        [2.50, 0.092, 2.24, 0.146, 0.98, 0.028],
        [2.34, 0.148, 2.10, 0.212, 0.95, 0.026],
        [2.20, 0.210, 1.98, 0.282, 0.92, 0.024],
        [2.08, 0.286, 1.88, 0.358, 0.88, 0.022],
      ];
      return aero.options.flatMap((option) => {
        const style = option.visual, level = style.lvl;
        const topIndex = level >= 4 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
        const element = elements[topIndex], planformIndex = topIndex + 1;
        const span = level <= 0 ? 0.74 : level === 1 ? 0.88 : 1;
        const endplateX = 0.92 * span + 0.03;
        const expectedY = element[3] + style.frontRise * (0.65 + planformIndex * 0.12)
          + element[5] * 0.5;
        const expectedZ = element[2] - style.frontSweep * (0.75 + planformIndex * 0.10);
        const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
          noWheels: true,
          parts: { aero: 1, _visual: { aero: style } },
        });
        let maxX = 0;
        for (let i = 0; i < mesh.pos.length; i += 3) {
          if (Math.abs(mesh.pos[i + 1] - expectedY) > 1e-5
            || Math.abs(mesh.pos[i + 2] - expectedZ) > 1e-5) continue;
          maxX = Math.max(maxX, Math.abs(mesh.pos[i]));
        }
        return maxX >= endplateX - 0.005 ? [] : [`${option.id}:${maxX.toFixed(3)}`];
      });
    });
    expect(detached).toEqual([]);
  });

  test("hidden-system recipes expose serviceable engine, ERS, gearbox, and fuel cues", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const base = Parts.getVisualTiers({}, { id: "mclaren", engine: "Mercedes" });
      const signature = (parts) => {
        const mesh = Car3D.build([0.7,0.05,0.05], [0.95,0.8,0.1], { noWheels: true, parts });
        return JSON.stringify([mesh.pos, mesh.col]);
      };
      const pair = (cat, a, b) => signature({
        ...base, _visual: { ...base._visual, [cat]: { ...base._visual[cat], ...a } },
      }) !== signature({
        ...base, _visual: { ...base._visual, [cat]: { ...base._visual[cat], ...b } },
      });
      return {
        engineService: pair("engine", { servicePanel: 0 }, { servicePanel: 3 }),
        ersCells: pair("ers", { cells: 2 }, { cells: 7 }),
        gearboxCase: pair("gearbox", { caseWidth: 0.8, casing: 3 },
          { caseWidth: 1.3, casing: 3 }),
        fuelLine: pair("fuel", { line: 0 }, { line: 1.35 }),
      };
    });
    expect(result).toEqual({
      engineService: true,
      ersCells: true,
      gearboxCase: true,
      fuelLine: true,
    });
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

  test("every option in a category produces a distinct consumed mesh signature", async ({ page }) => {
    await load(page);
    const duplicates = await page.evaluate(() => {
      const hashMesh = (mesh) => {
        let h = 2166136261 >>> 0;
        const add = (value) => {
          const n = Math.round(value * 10000);
          h ^= n; h = Math.imul(h, 16777619) >>> 0;
        };
        mesh.pos.forEach(add);
        mesh.col.forEach(add);
        (mesh.mat || []).forEach(add);
        return `${mesh.pos.length}:${mesh.idx.length}:${h}`;
      };
      const failures = [];
      for (const cat of Parts.CATALOG) {
        const seen = new Map();
        for (const opt of cat.options) {
          const team = {
            id: opt.teams?.[0] || opt.team || "mclaren",
            engine: opt.suppliers?.[0] || opt.supplier || "Mercedes",
          };
          const parts = Parts.getVisualTiers({ [cat.id]: opt.id }, team);
          const body = Car3D.build([0.7,0.05,0.05], [0.95,0.8,0.1],
            { noWheels: true, parts });
          const tyre = parts._visual.tyres, brake = parts._visual.brakes;
          const wheel = Car3D.buildWheel(0.32, tyre.band, brake.cal, brake.rim,
            !!tyre.grooved, tyre, brake);
          const sig = hashMesh(body) + "|" + hashMesh(wheel);
          if (seen.has(sig)) failures.push(`${cat.id}:${seen.get(sig)}=${opt.id}`);
          else seen.set(sig, opt.id);
        }
      }
      return failures;
    });
    expect(duplicates).toEqual([]);
  });

  test("factory presets retain distinct geometry with a neutral audit livery", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const signatures = {};
      const duplicate = [];
      for (const team of Teams.LIST.filter((entry) => Parts.FACTORY_PRESETS[entry.id])) {
        const setup = Parts.getFactorySetup(team);
        const parts = Parts.getVisualTiers(setup, team);
        const mesh = Car3D.build([0.55,0.55,0.55], [0.15,0.15,0.15],
          { noWheels: true, parts });
        let h = 2166136261 >>> 0;
        for (const value of mesh.pos) {
          h ^= Math.round(value * 10000);
          h = Math.imul(h, 16777619) >>> 0;
        }
        const sig = `${mesh.pos.length}:${mesh.idx.length}:${h}`;
        if (signatures[sig]) duplicate.push(`${signatures[sig]}=${team.id}`);
        else signatures[sig] = team.id;
      }
      return { count: Object.keys(signatures).length, duplicate };
    });
    expect(result.duplicate).toEqual([]);
    expect(result.count).toBe(11);
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

  test("Car3D emits one valid surface id per vertex with core material classes", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1]);
      const surfaces = Car3D.SURFACES;
      return {
        vertexCount: mesh.pos.length / 3,
        mat: mesh.mat,
        surfaces,
        used: mesh.mat ? [...new Set(mesh.mat)] : [],
      };
    });
    expect(result.surfaces).toEqual(expect.objectContaining({
      paint: expect.any(Number),
      carbon: expect.any(Number),
      rubber: expect.any(Number),
      metal: expect.any(Number),
    }));
    const requiredIds = ["paint", "carbon", "rubber", "metal"]
      .map((name) => result.surfaces[name]);
    expect(new Set(requiredIds).size).toBe(4);
    expect(result.mat).toHaveLength(result.vertexCount);
    expect(result.mat.every((id) => Number.isFinite(id) && Number.isInteger(id))).toBe(true);
    const allowed = new Set(Object.values(result.surfaces));
    expect(result.mat.every((id) => allowed.has(id))).toBe(true);
    for (const name of ["paint", "carbon", "rubber", "metal"]) {
      expect(result.used).toContain(result.surfaces[name]);
    }
  });

  test("Car3D keeps matte panels, glass, paint, and functional emissives semantically distinct", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const brightPaint = [2.2, 1.9, 1.7];
      const mesh = Car3D.build(brightPaint, [0.95, 0.8, 0.1]);
      const colorsForMaterial = (material) => {
        const result = [];
        for (let i = 0; i < mesh.col.length; i += 3) {
          if (mesh.mat[i / 3] === material) {
            result.push(mesh.col.slice(i, i + 3));
          }
        }
        return result;
      };
      return {
        surfaces: Car3D.SURFACES,
        used: [...new Set(mesh.mat)],
        paintColors: colorsForMaterial(Car3D.SURFACES.paint),
      };
    });
    const distinct = ["paint", "panel", "glass", "functionalEmissive"]
      .map((name) => result.surfaces[name]);
    expect(new Set(distinct).size).toBe(4);
    expect(result.used).toContain(result.surfaces.panel);
    expect(result.used).toContain(result.surfaces.glass);
    expect(result.paintColors.length).toBeGreaterThan(0);
    expect(Math.max(...result.paintColors.flat())).toBeLessThanOrEqual(1);
  });

  test("wheel sidewalls remain rubber outside a distinct metal aero cover", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const mesh = Car3D.buildWheel(0.34, [0.85, 0.1, 0.08]);
      const outer = new Set(), cover = new Set();
      for (let i = 0; i < mesh.mat.length; i++) {
        const x = Math.abs(mesh.pos[i * 3]);
        const radius = Math.hypot(mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]);
        if (x > 0.165 && radius > 0.30) outer.add(mesh.mat[i]);
        if (x > 0.165 && radius > 0.08 && radius < 0.21) cover.add(mesh.mat[i]);
      }
      return { outer: [...outer], cover: [...cover], surfaces: Car3D.SURFACES };
    });
    expect(result.outer).toContain(result.surfaces.rubber);
    expect(result.outer).not.toContain(result.surfaces.metal);
    expect(result.cover).toContain(result.surfaces.metal);
  });

  test("static car geometry across brake packages reserves emissive surfaces for the FIA rain light", async ({ page }) => {
    await load(page);
    const offenders = await page.evaluate(() => {
      const result = [];
      const brakes = Parts.CATALOG.find((category) => category.id === "brakes");
      for (const option of brakes.options) {
        const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
          noWheels: true,
          parts: { brakes: 1, _visual: { brakes: option.visual } },
        });
        for (let i = 0; i < mesh.mat.length; i++) {
          if (mesh.mat[i] !== Car3D.SURFACES.functionalEmissive) continue;
          const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
          const rainLight = Math.abs(x) <= 0.07 && y >= 0.39 && y <= 0.61 && z <= -2.50;
          if (!rainLight) result.push([option.id, x, y, z]);
        }
      }
      return result;
    });
    expect(offenders).toEqual([]);
  });

  test("every canonical Car3D build mode emits an aligned valid material stream", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const meshes = {
        noWheels: Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true }),
        cockpit: Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1],
          { noWheels: true, noDriver: true, cockpit: true }),
        frontWheel: Car3D.buildWheel(0.32),
        rearWheel: Car3D.buildWheel(0.38),
      };
      const allowed = new Set(Object.values(Car3D.SURFACES));
      return Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => {
        const vertexCount = mesh.pos.length / 3;
        return [name, {
          vertexCount,
          materialCount: mesh.mat && mesh.mat.length,
          valid: !!mesh.mat && mesh.mat.every((id) =>
            Number.isFinite(id) && Number.isInteger(id) && allowed.has(id)),
        }];
      }));
    });
    for (const mode of Object.values(result)) {
      expect(mode.vertexCount).toBeGreaterThan(0);
      expect(mode.materialCount).toBe(mode.vertexCount);
      expect(mode.valid).toBe(true);
    }
  });

  test("WebGL and WebGPU share the same car environment-surface gate", async ({ page }) => {
    await load(page);
    const sources = await page.evaluate(() => ({
      glsl: GLXShaders.LIT_FS,
      wgsl: WGSLChunks.LIT,
    }));
    expect(sources.glsl).toContain(
      "bool envSurface = (carPaint > 0.001 || glassSurface) && clearcoat > 0.001;"
    );
    expect(sources.wgsl).toContain(
      "let envSurface = (carPaint > 0.001 || glassSurface) && clearcoat > 0.001;"
    );
    expect(sources.glsl).toContain("if (envSurface) {");
    expect(sources.wgsl).toContain("&& envSurface) {");
  });

  test("canonical mesh streams remain structurally valid without freezing topology", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const mesh = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
      const vertexCount = mesh.pos.length / 3;
      return {
        vertexCount,
        triangleCount: mesh.idx.length / 3,
        aligned: mesh.pos.length === mesh.nrm.length && mesh.pos.length === mesh.col.length,
        finite: [...mesh.pos, ...mesh.nrm, ...mesh.col].every(Number.isFinite),
        validIndices: mesh.idx.every((index) =>
          Number.isInteger(index) && index >= 0 && index < vertexCount),
        boundedNormals: mesh.nrm.every((_, i) => i % 3 !== 0 || Math.hypot(
          mesh.nrm[i], mesh.nrm[i + 1], mesh.nrm[i + 2]
        ) <= 1.0001),
        nonZeroNormalRatio: mesh.nrm.filter((_, i) => i % 3 === 0 && Math.hypot(
          mesh.nrm[i], mesh.nrm[i + 1], mesh.nrm[i + 2]
        ) > 0.5).length / vertexCount,
        validColours: mesh.col.every((value) => value >= 0 && value <= 4),
      };
    });
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.triangleCount).toBeGreaterThan(0);
    expect(result.aligned).toBe(true);
    expect(result.finite).toBe(true);
    expect(result.validIndices).toBe(true);
    expect(result.boundedNormals).toBe(true);
    expect(result.nonZeroNormalRatio).toBeGreaterThan(0.99);
    expect(result.validColours).toBe(true);
  });

  test("canonical car bounds remain plausible for a modern F1 car", async ({ page }) => {
    await load(page);
    const size = await page.evaluate(() => {
      const pos = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1]).pos;
      const bounds = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
      for (let i = 0; i < pos.length; i++) {
        bounds[i % 3][0] = Math.min(bounds[i % 3][0], pos[i]);
        bounds[i % 3][1] = Math.max(bounds[i % 3][1], pos[i]);
      }
      return bounds.map(([lo, hi]) => hi - lo);
    });
    expect(size[0]).toBeGreaterThan(1.8);
    expect(size[0]).toBeLessThan(2.2);
    expect(size[1]).toBeGreaterThan(0.85);
    expect(size[1]).toBeLessThan(1.2);
    expect(size[2]).toBeGreaterThan(5.2);
    expect(size[2]).toBeLessThan(6.2);
  });

  test("car mesh layers stay below absolute triangle ceilings", async ({ page }) => {
    await load(page);
    const triangles = await page.evaluate(() => ({
      body: Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true }).idx.length / 3,
      cockpit: Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1],
        { noWheels: true, noDriver: true, cockpit: true }).idx.length / 3,
      frontWheel: Car3D.buildWheel(0.32).idx.length / 3,
      rearWheel: Car3D.buildWheel(0.38).idx.length / 3,
      decals: CarMesh.carDecalData(2).idx.length / 3,
    }));
    expect(triangles.body).toBeLessThanOrEqual(2400);
    expect(triangles.cockpit).toBeLessThanOrEqual(1500);
    expect(triangles.frontWheel).toBeLessThanOrEqual(400);
    expect(triangles.rearWheel).toBeLessThanOrEqual(400);
    expect(triangles.decals).toBeLessThanOrEqual(32);
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
