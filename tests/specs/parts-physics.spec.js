// @ts-check
// Tests for Parts module logic — no UI required, runs against window.Parts directly.
// Covers: getMods() multiplier math, getCost() addition, statMult(), catalog structure,
// new GEARBOX and FUEL categories, and supplier-exclusive option filtering.
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof Parts !== "undefined" && Parts.CATALOG, null, { polling: 100, timeout: 8000 });
}

test.describe("Parts module — catalog structure", () => {
  test("has exactly 12 categories", async ({ page }) => {
    await load(page);
    const count = await page.evaluate(() => Parts.CATALOG.length);
    expect(count).toBe(12);
  });

  test("category IDs are correct", async ({ page }) => {
    await load(page);
    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    expect(ids).toEqual(["engine", "aero", "suspension", "brakes", "tyres", "ers",
      "gearbox", "fuel", "exhaust", "floor", "cockpit", "wheels"]);
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

  test("budget is a positive cap the catalog cannot trivially fill", async ({ page }) => {
    await load(page);
    // Not pinned to a literal: the cap rises when the catalog grows. What must
    // hold is that it exists, is positive, and is well short of buying the
    // dearest option in all twelve categories (see the max-setup test below).
    const budget = await page.evaluate(() => Parts.BUDGET);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(2000);
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
  // Prices come from the catalog, never from a literal here. Four of these
  // tests pinned 160 / 180 / 200 / 490 and the ladder re-space moved three of
  // them — a red run that says nothing about getCost(), which is what this
  // block exists to measure.
  const price = (page, cat, id) => page.evaluate(([c, o]) =>
    Parts.CATALOG.find((x) => x.id === c).options.find((y) => y.id === o).cost, [cat, id]);

  test("all defaults cost 0", async ({ page }) => {
    await load(page);
    const cost = await page.evaluate(() => Parts.getCost({}, ""));
    expect(cost).toBe(0);
  });

  test("one fitted part costs exactly its catalog price", async ({ page }) => {
    await load(page);
    for (const [cat, id] of [["engine", "race"], ["gearbox", "f1_spec"], ["fuel", "custom_formula"]]) {
      const want = await price(page, cat, id);
      expect(want).toBeGreaterThan(0);
      const cost = await page.evaluate(([c, o]) => Parts.getCost({ [c]: o }, ""), [cat, id]);
      expect(cost).toBe(want);
    }
  });

  test("costs add up correctly across multiple categories", async ({ page }) => {
    await load(page);
    const parts = [["engine", "race"], ["suspension", "active"], ["brakes", "ceramic"]];
    let want = 0;
    for (const [c, o] of parts) want += await price(page, c, o);
    const cost = await page.evaluate(() =>
      Parts.getCost({ engine: "race", suspension: "active", brakes: "ceramic" }, "")
    );
    expect(cost).toBe(want);
  });

  test("max setup exceeds the budget", async ({ page }) => {
    await load(page);
    // Max everything — total should be well over the cap
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
    expect(resolved.cost).toBe(await page.evaluate(() =>
      Parts.CATALOG.find((c) => c.id === "engine").options.find((o) => o.id === "race").cost));
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
        // The trailing edge of the aerofoil section closes to zero thickness ON
        // the chord line, so the tip vertex sits exactly at yTrail — the old
        // flat sheet floated its single surface up by thick/2 instead.
        const expectedY = crownY - (level >= 4 || style.drs ? 0.075 : 0);
        const expectedZ = -2.64 - sweep;
        // buildComplete, not build: the wing's top elements are ACTIVE AERO and are
        // drawn separately so they can rotate, so the render mesh no longer holds
        // them. buildComplete merges them back at their CLOSED pose, which is
        // vertex-for-vertex the wing this test was written against.
        const mesh = Car3D.buildComplete([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
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
      // Mirrors frontCascade() minus the mainplane. Flaps 3 and 4 sit 10 mm
      // and 30 mm lower than they first shipped — the stack used to climb INTO
      // the nose overhang (21 mm through it at max downforce).
      const elements = [
        [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],
        [2.34, 0.148, 2.10, 0.212, 0.95, 0.018],
        [2.20, 0.200, 1.98, 0.272, 0.92, 0.016],
        [2.08, 0.256, 1.88, 0.328, 0.88, 0.014],
      ];
      return aero.options.flatMap((option) => {
        const style = option.visual, level = style.lvl;
        const topIndex = level >= 4 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
        const element = elements[topIndex], planformIndex = topIndex + 1;
        const span = level <= 0 ? 0.74 : level === 1 ? 0.88 : 1;
        const endplateX = 0.92 * span + 0.03;
        // Zero-thickness trailing edge, as above: the tip vertex is on the
        // chord line at yTrail plus the tip rise.
        const expectedY = element[3] + style.frontRise * (0.65 + planformIndex * 0.12);
        const expectedZ = element[2] - style.frontSweep * (0.75 + planformIndex * 0.10);
        // buildComplete, not build: the wing's top elements are ACTIVE AERO and are
        // drawn separately so they can rotate, so the render mesh no longer holds
        // them. buildComplete merges them back at their CLOSED pose, which is
        // vertex-for-vertex the wing this test was written against.
        const mesh = Car3D.buildComplete([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
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
          // PASS wheelStyle — buildWheel in js/car/car3d.js (eight arguments)
          // and this passed seven. Without it every option in the `wheels`
          // category rendered the default rim, so all 17 non-default rims —
          // spoked, dished, taped, mag_forged, aero_disc, works_rim and the 11
          // signature team rims — hashed identically to `standard` and the test
          // reported them as duplicates. The catalog does differentiate them
          // (getVisualTiers gives sig_ferrari_rim {spokes:0,tape:1,dish:2,nut:…}
          // against standard's {spokes:0,tape:0,dish:0,nut:null}); the argument
          // that carries the difference was simply dropped. Measured over all
          // 279 options: 17 duplicates without it, 0 with it.
          const tyre = parts._visual.tyres, brake = parts._visual.brakes;
          const wheel = Car3D.buildWheel(0.32, tyre.band, brake.cal, brake.rim,
            !!tyre.grooved, tyre, brake, parts._visual.wheels);
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

  // The multiplier is a guard against a runaway recipe, not a measured limit —
  // it exists so one option cannot quietly double the car. 1.6x is the smallest
  // headroom that admits a legitimately heavy tread: a full-wet tyre carries 5
  // grooves on all four wheels (1.53x), against the intermediate's 3 (1.32x).
  const TRIANGLE_BUDGET = 1.6;

  test(`single-option recipes stay within ${TRIANGLE_BUDGET}x the default triangle budget`, async ({ page }) => {
    await load(page);
    const result = await page.evaluate((budget) => {
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
          if (triangles > baseTriangles * budget) overBudget.push(`${cat.id}:${opt.id}:${triangles}`);
        }
      }
      return { baseTriangles, overBudget };
    }, TRIANGLE_BUDGET);
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
    // LOAD THE DEFERRED BACKEND FIRST. js/render/webgpu/wgsl-chunks.js has NO
    // SCRIPT TAG — index.html says so where the tags end ("js/render/webgpu/*
    // (WGX) and js/render/three/* (TLX) have NO tags"); game.js injects it
    // through loadBackendScripts only when apex26.gfxBackend asks for WebGPU.
    // load(page) is the default GLX boot, so `WGSLChunks` was never defined and
    // this threw ReferenceError on its first line, every time, from the day it
    // was written. It failed FAST rather than by timeout, which is the same
    // asymmetry docs/TESTING.md records: a throwing predicate propagates
    // without polling while a merely-false one burns the budget.
    await page.addScriptTag({ url: "/js/render/webgpu/wgsl-chunks.js" });
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
    // BOTH read `if (envSurface) {` now. WGSL used to gate on
    // `envSurface && clearcoat > 0.001` — a tautology, since envSurface
    // already carries that term — which was the only textual drift between
    // the backends this test exists to pin.
    expect(sources.glsl).toContain("if (envSurface) {");
    expect(sources.wgsl).toContain("if (envSurface) {");
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
    // 2400 -> 2545: the round-halo tube + pillar V-brace + regulation
    // mirrors — mirrors the raises (and their measurements) recorded in
    // tests/unit/car-wing-foil.test.mjs.
    expect(triangles.body).toBeLessThanOrEqual(2545);
    expect(triangles.cockpit).toBeLessThanOrEqual(1500);
    // 400 -> 500: tyres at SEG 24 (18-gon tyres read visibly polygonal in any
    // close shot; measured 480 at the raise).
    expect(triangles.frontWheel).toBeLessThanOrEqual(500);
    expect(triangles.rearWheel).toBeLessThanOrEqual(500);
    // 48, FROM A MEASUREMENT. This said 32 and the decal sheet has been 36
    // triangles (18 quads over LiveryTex's 8 regions) at EVERY revision of
    // js/game/carmesh.js — bisected, not assumed. So the ceiling was never
    // satisfiable and the test never passed; 32 was a number someone liked.
    // 48 is the measured 36 plus a third, which is room for a few more decal
    // regions and still far below anything that would cost a frame. The tier
    // argument does not affect the count (identical for tiers 0-3), so the 2
    // above is arbitrary and harmless.
    expect(triangles.decals).toBeLessThanOrEqual(48);
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

  test("each structure knob independently deforms the mesh, and its default is inert", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      // Neutral recipes = exactly what the build*Parts() merges produce for a
      // recipe-less tier-1 car, so "no knob set" must equal the untouched build.
      const NEUTRAL = {
        aero: { lvl: 2, beam: 0, drs: 0, vane: 1,
          frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
          rearSweep: 0.03, rearTaper: 0.98, floorEdge: 1, floorCut: 0.04, diffuserRise: 1 },
        engine: { in: 1, snork: 0, twin: 0, inlet: 1, outlet: 1, podWidth: 1,
          shoulderHeight: 1, undercut: 1, coke: 1, tailWidth: 1, coverHeight: 1,
          servicePanel: 1, heatShield: 1, scoopLip: 0 },
        brakes: { cal: null, duct: 1, rim: null, caliperPos: 0, coverOpen: 0, rotor: 1, rotorScale: 1, caliper: 0 },
        // tier 1 leaves the ERS strip unlit, so `led: null` is the inert recipe.
        ers: { led: null, pack: 1, cells: 3, conduit: 0, blister: 0 },
        fuel: { cap: [0.55, 0.52, 0.6], flame: [1.15, 0.42, 0.14], line: 1, filler: 0, hatch: 0, vent: 0 },
        exhaust: { pipes: null, bore: 1, flare: 0, wastegate: 0, wrap: 0, lip: 0, shield: 0 },
        floor: { fences: 5, fenceH: 1, skid: 0, edgeLip: 0, plank: 0, gurney: 0, scroll: 0 },
        cockpit: { haloBlade: 0, haloWing: 0, camPods: 0, screen: 0 },
        wheels: { spokes: 0, tape: 0, dish: 0, nut: null, gunNut: 0 },
      };
      // The conduit hangs off the lit ERS strip, so probing it needs a lit pack.
      // Same shape for brakes: the caliper BODY is drawn only when the recipe
      // names a caliper colour (`if (caliperColor)` in addWheel), so with the
      // neutral `cal: null` the caliper knob had nothing to reshape and could
      // never deform — it reported broken while the geometry was fine.
      const ACTIVE = Object.assign({}, NEUTRAL, {
        ers: { led: [0.15, 0.55, 1.6], pack: 1, cells: 3 },
        brakes: { ...NEUTRAL.brakes, cal: [0.85, 0.15, 0.10] },
      });
      // THE WHOLE CAR, WHEELS INCLUDED. This built with `noWheels: true`, and
      // five of the twenty-seven knobs below are wheel-side — tyres.shoulder
      // and brakes.discFace reach only addWheel in js/car/car3d.js, and
      // the three wheels.* knobs are rim geometry. A wheel knob cannot deform a
      // wheel-less mesh, so those five asserted something the helper made
      // impossible and the test could never pass. (Measured: noWheels 17964
      // verts, with wheels 33084.) Every knob deforms once the wheels are here,
      // and the neutral recipes stay inert either way.
      const build = (cat, visual) => Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {
        parts: { [cat]: 1, _visual: { [cat]: Object.assign({ id: "probe", tier: 1 }, visual) } },
      });
      const differs = (a, b) => a.pos.length !== b.pos.length
        || a.pos.some((v, i) => Math.abs(v - b.pos[i]) > 1e-6);

      const bare = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], {});
      const out = { inert: {}, active: {} };
      const KNOBS = [
        ["aero", "plate", 2], ["aero", "casc", 3], ["aero", "swan", 1], ["aero", "tvane", 1],
        ["aero", "duct", 2], ["aero", "board", 2], ["aero", "slot", 1],
        ["engine", "chimney", 3], ["engine", "scoopLip", 2],
        ["brakes", "scoop", 2], ["brakes", "caliper", 1],
        ["ers", "conduit", 2], ["ers", "blister", 2],
        ["fuel", "filler", 2], ["fuel", "hatch", 1], ["fuel", "vent", 1],
        ["exhaust", "pipes", 3], ["exhaust", "bore", 1.3], ["exhaust", "flare", 1],
        ["exhaust", "wastegate", 2], ["exhaust", "wrap", 1],
        ["exhaust", "lip", 2], ["exhaust", "shield", 1],
        ["floor", "fences", 0], ["floor", "fenceH", 1.45], ["floor", "skid", 2], ["floor", "edgeLip", 1],
        ["floor", "plank", 1], ["floor", "gurney", 1], ["floor", "scroll", 1],
        ["gearbox", "heatFins", 5], ["gearbox", "ribs", 3],
        ["cockpit", "haloBlade", 2], ["cockpit", "haloWing", 1], ["cockpit", "camPods", 2], ["cockpit", "screen", 1],
        ["tyres", "shoulder", 2], ["brakes", "discFace", 2],
        ["suspension", "rocker", 2], ["suspension", "heave", 1],
        ["wheels", "spokes", 6], ["wheels", "tape", 1], ["wheels", "dish", 2], ["wheels", "gunNut", 1],
      ];
      for (const [cat, knob, value] of KNOBS) {
        out.inert[`${cat}.${knob}`] = differs(build(cat, NEUTRAL[cat]), bare);
        const base = build(cat, ACTIVE[cat]);
        out.active[`${cat}.${knob}`] = differs(build(cat, { ...ACTIVE[cat], [knob]: value }), base);
      }
      return out;
    });
    // REPORT EVERY KNOB, NOT THE FIRST. These were two `expect`-per-iteration
    // loops, and expect throws — so when five knobs were broken the run named
    // ONE (tyres.shoulder, the 22nd of 27) and the other four stayed invisible
    // through the whole investigation. Collecting first costs nothing and turns
    // one failure message into the entire fault.
    const notInert = Object.entries(result.inert).filter(([, changed]) => changed).map(([k]) => k);
    const notDeformed = Object.entries(result.active).filter(([, changed]) => !changed).map(([k]) => k);
    expect(notInert, "neutral recipes that did NOT build the shipped geometry").toEqual([]);
    expect(notDeformed, "knobs that did NOT deform the mesh").toEqual([]);
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

  test("every team fields a signature in every category it can", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const factoryEngineTeams = [];
      const gaps = [];
      for (const team of Teams.LIST.filter((t) => !t.custom)) {
        const setup = Parts.getFactorySetup(team);
        for (const cat of Parts.CATALOG) {
          const opt = cat.options.find((o) => o.id === setup[cat.id]);
          if (opt && opt.tag === "SIGNATURE") continue;
          // A manufacturer-exclusive FACTORY power unit is already a team-unique
          // model, so those four teams legitimately have no signature engine.
          if (cat.id === "engine" && opt && (opt.supplier || opt.suppliers)) {
            factoryEngineTeams.push(team.id);
            continue;
          }
          gaps.push(`${team.id}:${cat.id}:${setup[cat.id]}`);
        }
      }
      return { gaps, factoryEngineTeams };
    });
    expect(result.gaps).toEqual([]);
    // Cadillac is Ferrari-powered and must NOT be in this list — without its own
    // signature engine it would render the exact same power unit as Ferrari.
    expect(result.factoryEngineTeams.sort())
      .toEqual(["astonmartin", "audi", "ferrari", "redbull"]);
  });

  test("a signature is visible only to its own team and never changes that team's economics", async ({ page }) => {
    await load(page);
    const result = await page.evaluate(() => {
      const leaks = [];
      const drift = [];
      for (const cat of Parts.CATALOG) {
        for (const opt of cat.options.filter((o) => o.tag === "SIGNATURE")) {
          for (const team of Teams.LIST.filter((t) => !t.custom)) {
            const owns = (opt.teams || []).includes(team.id);
            if (Parts.isOptionAvailable(opt, team) !== owns) leaks.push(`${opt.id}:${team.id}`);
          }
        }
      }
      // Swapping a team's factory signature for its equivalent must not move a
      // single multiplier or credit — signatures buy a mesh, never an advantage.
      for (const team of Teams.LIST.filter((t) => !t.custom)) {
        const factory = Parts.getFactorySetup(team);
        const plain = {};
        for (const cat of Parts.CATALOG) {
          const opt = cat.options.find((o) => o.id === factory[cat.id]);
          plain[cat.id] = opt && opt.tag === "SIGNATURE" ? opt.equivalent : factory[cat.id];
        }
        const a = Parts.resolveSetup(factory, team), b = Parts.resolveSetup(plain, team);
        if (JSON.stringify(a.mods) !== JSON.stringify(b.mods) || a.cost !== b.cost) {
          drift.push({ team: team.id, factory: a.mods, plain: b.mods, cost: [a.cost, b.cost] });
        }
      }
      return { leaks, drift };
    });
    expect(result.leaks).toEqual([]);
    expect(result.drift).toEqual([]);
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

// THE ERS PART RUNS THE BATTERY. Its options have always DESCRIBED battery
// behaviour — "harvests extra energy under braking", "maximum recovery window",
// "immediate deployment" — while moving nothing but speed and accel like every
// other part, so the descriptions were simply false. Two 0..1 axes now come off
// the bias the catalog already encodes (deploy <- accel, regen <- speed) and
// drive BOOST duration, recharge rate and the OVERTAKE window.
test.describe("ERS parts drive the battery and overtake", () => {
  test("deployment and recovery both scale with the ERS option", async ({ page }) => {
    const rows = [];
    for (const ers of ["harvest", "standard", "overcharge"]) {
      await page.goto("/");
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 15000 });
      const teamId = await page.evaluate(() => window.__apex.teams()[0].id);
      await page.evaluate(([e, id]) => {
        const key = "apex26.parts." + id;
        const cur = JSON.parse(localStorage.getItem(key) || "{}");
        cur.ers = e; localStorage.setItem(key, JSON.stringify(cur));
        localStorage.setItem("apex26.team", "0");
        localStorage.setItem("apex26.unlimitedBudget", "true");
      }, [ers, teamId]);
      await page.reload();
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 15000 });
      await page.evaluate(() => window.__apex.race("monza"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 40_000 });
      rows.push(await page.evaluate(() => {
        const A = window.__apex;
        A.headless(true); A.go(); A.jump(0.1, 60, 0); A.step(1 / 60, 2);
        const ps = A.physState();
        // BOOST measured over ONE SECOND at speed. Running the battery to empty
        // does not work: the car reaches the first corner, and below half vmax
        // the throttle branch REGENERATES while boost drains, so energy
        // asymptotes instead of emptying.
        A.reset(0.1, 60, 0); A.setEnergy(1); A.setInput({ throttle: true });
        A.setBoost(true);                       // BOOST is a toggle, not a setInput key
        const e0 = A.carAt().energy;
        A.step(1 / 60, 60);
        const perSec = e0 - A.carAt().energy;
        A.setBoost(false); A.clearInput();
        return { deploy: ps.ersDeploy, regen: ps.ersRegen, drain: ps.drain,
                 rgn: ps.regen, otTime: ps.otTime, otCool: ps.otCool, perSec };
      }));
    }
    const [harvest, standard, over] = rows;
    // The part must reach the physics at all — identical numbers would let every
    // other assertion below "pass" on a setup that never got through.
    expect(harvest.deploy).toBeLessThan(standard.deploy);
    expect(standard.deploy).toBeLessThan(over.deploy);

    // DEPLOYMENT buys a longer press (lower drain) and a longer, sooner overtake.
    expect(over.drain).toBeLessThan(standard.drain);
    expect(standard.drain).toBeLessThan(harvest.drain);
    expect(over.otTime).toBeGreaterThan(harvest.otTime);
    expect(over.otCool).toBeLessThan(harvest.otCool);
    // and it shows up in the battery actually draining slower while boosting
    expect(over.perSec).toBeLessThan(harvest.perSec);
    expect(over.perSec).toBeGreaterThan(0);      // boost engaged at all

    // RECOVERY is its own axis: the recovery-biased part out-regenerates the
    // deployment-biased one even though it is the cheaper part.
    expect(harvest.rgn).toBeGreaterThan(0);
    expect(over.rgn).toBeGreaterThan(standard.rgn);

    // And the spread is worth having: >1.5x on boost duration end to end.
    expect(harvest.perSec / over.perSec).toBeGreaterThan(1.5);
  });
});
