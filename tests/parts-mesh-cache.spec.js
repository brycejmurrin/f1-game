// @ts-check
// Runtime mesh-cache bounds for player/cockpit body variants and wheel pairs.
// Instruments GLX create/free (same pattern as custom-team.spec.js) — no new
// production debug APIs.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function installMeshProbe(page) {
  await page.evaluate(() => {
    if (window.__partsMeshProbe) return;   // idempotent across soft re-entries
    const bodyMeshes = [];
    const cockpitMeshes = [];
    const wheelMeshes = [];
    const freed = [];
    const bodyData = new WeakSet();
    const cockpitData = new WeakSet();
    const wheelData = new WeakSet();
    const meshIds = new WeakMap();
    let nextId = 1;

    const build = Car3D.build;
    const buildWheel = Car3D.buildWheel;
    const createMesh = GLX.createMesh;
    const freeMesh = GLX.freeMesh;

    Car3D.build = function (c1, c2, opts) {
      const data = build(c1, c2, opts);
      if (opts && opts.noWheels && opts.cockpit) cockpitData.add(data);
      else if (opts && opts.noWheels) bodyData.add(data);
      return data;
    };
    Car3D.buildWheel = function () {
      const data = buildWheel.apply(this, arguments);
      wheelData.add(data);
      return data;
    };
    GLX.createMesh = function (data) {
      const mesh = createMesh(data);
      const id = nextId++;
      meshIds.set(mesh, id);
      if (bodyData.has(data)) bodyMeshes.push({ id, mesh });
      else if (cockpitData.has(data)) cockpitMeshes.push({ id, mesh });
      else if (wheelData.has(data)) wheelMeshes.push({ id, mesh });
      return mesh;
    };
    GLX.freeMesh = function (mesh) {
      const id = meshIds.get(mesh);
      if (id !== undefined) freed.push(id);
      return freeMesh(mesh);
    };

    window.__partsMeshProbe = {
      bodyMeshes, cockpitMeshes, wheelMeshes, freed,
      live(kind) {
        const list = kind === "body" ? bodyMeshes
          : kind === "cockpit" ? cockpitMeshes
          : wheelMeshes;
        const liveIds = new Set(list.map((e) => e.id));
        for (const id of freed) liveIds.delete(id);
        return liveIds.size;
      },
      freedCount(kind) {
        const list = kind === "body" ? bodyMeshes
          : kind === "cockpit" ? cockpitMeshes
          : wheelMeshes;
        const ids = new Set(list.map((e) => e.id));
        return freed.filter((id) => ids.has(id)).length;
      },
    };
  });
}

async function openSetup(page) {
  // Prefer select screen if already there; otherwise go menu → race → select.
  const onSelect = await page.locator("#select").isVisible().catch(() => false);
  if (!onSelect) {
    const onMenu = await page.locator("#overlay").isVisible().catch(() => false);
    if (onMenu) await page.locator("#mb-race").click();
    else {
      // Mid-race: quit first
      await page.locator("#pausebtn").click();
      await page.locator("#pm-quit").click();
      await page.locator("#mb-race").click();
    }
    await page.locator("#select").waitFor({ state: "visible" });
  }
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

async function ensureUnlimited(page) {
  const on = await page.locator("#cs-unlimited").evaluate((el) => el.classList.contains("on"));
  if (!on) await page.locator("#cs-unlimited").click();
}

async function pickOpt(page, catId, optId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
  await page.locator(`#cs-options [data-cs-opt="${optId}"]`).click();
}

async function applyPartsAndPark(page) {
  await page.locator("#cs-done").click();
  await page.locator("#select").waitFor({ state: "visible" });
  // Skip race-settings UI — startRace via the public hook (recomputes mods).
  await page.evaluate(() => {
    window.__apex.race("monza");
    window.__apex.park(0.1);
    window.__apex.camera("chase");
  });
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
}

async function quitRace(page) {
  await page.locator("#pausebtn").click();
  await page.locator("#pm-quit").click();
  await page.locator("#overlay").waitFor({ state: "visible", timeout: 15_000 });
}

test.describe("Parts mesh caches — eviction bounds", () => {
  test.use({ viewport: LANDSCAPE });

  test("body-aware decal cache keys engine geometry and remains bounded", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    const result = await page.evaluate(() => {
      const created = [], freed = [];
      CarMesh.init({
        createTexMesh(data) {
          const mesh = { id: created.length + 1, data };
          created.push(mesh);
          return mesh;
        },
        freeMesh(mesh) { freed.push(mesh.id); },
      });
      const base = {
        in: 1, inlet: 1, outlet: 1,
        shoulderHeight: 1, undercut: 1, coke: 1,
        tailWidth: 1, coverHeight: 1,
      };
      const meshes = [];
      for (let i = 0; i < 30; i++) {
        const engine = { ...base, podWidth: 0.72 + i * 0.018 };
        meshes.push(CarMesh.getCarDecalMesh(2, {
          engine: 1, _visual: { engine },
        }));
      }
      const repeat = CarMesh.getCarDecalMesh(2, {
        engine: 1, _visual: { engine: { ...base, podWidth: 0.72 + 29 * 0.018 } },
      });
      const fractionalAeroA = CarMesh.getCarDecalMesh(3.55, {
        engine: 1, _visual: { engine: { ...base, podWidth: 1 } },
      });
      const fractionalAeroB = CarMesh.getCarDecalMesh(3.60, {
        engine: 1, _visual: { engine: { ...base, podWidth: 1 } },
      });
      const live = created.filter((mesh) => !freed.includes(mesh.id));
      return {
        created: created.length,
        freed: freed.length,
        live: live.length,
        firstFreed: freed.includes(meshes[0].id),
        newestLive: !freed.includes(meshes.at(-1).id),
        repeatReused: repeat === meshes.at(-1),
        firstAndLastDiffer: meshes[0] !== meshes.at(-1),
        fractionalAeroDiffer: fractionalAeroA !== fractionalAeroB,
      };
    });
    expect(result.created).toBe(32);
    expect(result.live).toBeLessThanOrEqual(24);
    expect(result.freed).toBeGreaterThanOrEqual(8);
    expect(result.firstFreed).toBe(true);
    expect(result.newestLive).toBe(true);
    expect(result.repeatReused).toBe(true);
    expect(result.firstAndLastDiffer).toBe(true);
    expect(result.fractionalAeroDiffer).toBe(true);
  });

  test("rotating wheels are axle-local layers while fixed wheels remain in the whole-car mesh", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    const layers = await page.evaluate(() => {
      const body = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
      const fixed = Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1]);
      const rotating = [Car3D.buildWheel(0.32), Car3D.buildWheel(0.38)];
      const surfaces = Car3D.SURFACES || {};
      const materialCount = (mesh, id) => (mesh.mat || []).filter((value) => value === id).length;
      const bounds = (mesh) => {
        const result = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
        for (let i = 0; i < mesh.pos.length; i++) {
          result[i % 3][0] = Math.min(result[i % 3][0], mesh.pos[i]);
          result[i % 3][1] = Math.max(result[i % 3][1], mesh.pos[i]);
        }
        return result;
      };
      return {
        hasSurfaceRegistry: Number.isInteger(surfaces.rubber),
        fixedExtraTriangles: (fixed.idx.length - body.idx.length) / 3,
        fixedRubberVertices: materialCount(fixed, surfaces.rubber),
        bodyRubberVertices: materialCount(body, surfaces.rubber),
        rotating: rotating.map((mesh) => ({
          triangles: mesh.idx.length / 3,
          bounds: bounds(mesh),
          rubberVertices: materialCount(mesh, surfaces.rubber),
        })),
      };
    });
    expect(layers.hasSurfaceRegistry).toBe(true);
    expect(layers.fixedExtraTriangles).toBeGreaterThan(0);
    expect(layers.fixedRubberVertices).toBeGreaterThan(layers.bodyRubberVertices);
    for (const wheel of layers.rotating) {
      expect(wheel.triangles).toBeGreaterThan(0);
      expect(wheel.rubberVertices).toBeGreaterThan(0);
      for (const axis of [wheel.bounds[1], wheel.bounds[2]]) {
        expect(axis[0] + axis[1]).toBeCloseTo(0, 6);
        expect(axis[1] - axis[0]).toBeGreaterThan(0.65);
        expect(axis[1] - axis[0]).toBeLessThanOrEqual(0.68);
      }
    }
    const [front, rear] = layers.rotating.map((wheel) => wheel.bounds[0][1] - wheel.bounds[0][0]);
    expect(front).toBeGreaterThan(0);
    expect(rear).toBeGreaterThan(front);
  });

  test("player body and cockpit caches keep at most 3 visual keys and free evicted meshes", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await waitReady(page);
    await installMeshProbe(page);

    await page.evaluate(() => {
      const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
      if (team) localStorage.removeItem("apex26.parts." + team.id);
    });

    const engines = ["stock", "lean_burn", "performance", "turbo"];
    for (let i = 0; i < engines.length; i++) {
      await openSetup(page);
      await ensureUnlimited(page);
      await pickOpt(page, "engine", engines[i]);
      await applyPartsAndPark(page);
      await page.waitForFunction(
        (min) => window.__partsMeshProbe.bodyMeshes.length >= min,
        i + 1,
        { timeout: 20_000 }
      );
      await page.evaluate(() => window.__apex.camera("cockpit"));
      await page.waitForFunction(
        (min) => window.__partsMeshProbe.cockpitMeshes.length >= min,
        i + 1,
        { timeout: 20_000 }
      );
      await quitRace(page);
    }

    const stats = await page.evaluate(() => ({
      created: window.__partsMeshProbe.bodyMeshes.length,
      live: window.__partsMeshProbe.live("body"),
      freed: window.__partsMeshProbe.freedCount("body"),
      cockpitCreated: window.__partsMeshProbe.cockpitMeshes.length,
      cockpitLive: window.__partsMeshProbe.live("cockpit"),
      cockpitFreed: window.__partsMeshProbe.freedCount("cockpit"),
      freedIds: window.__partsMeshProbe.freed.filter((id) =>
        window.__partsMeshProbe.bodyMeshes.some((e) => e.id === id)
        || window.__partsMeshProbe.cockpitMeshes.some((e) => e.id === id)),
      oldestBodyEvicted: window.__partsMeshProbe.freed.includes(window.__partsMeshProbe.bodyMeshes[0]?.id),
      newestBodyLive: !window.__partsMeshProbe.freed.includes(window.__partsMeshProbe.bodyMeshes.at(-1)?.id),
      oldestCockpitEvicted: window.__partsMeshProbe.freed.includes(window.__partsMeshProbe.cockpitMeshes[0]?.id),
      newestCockpitLive: !window.__partsMeshProbe.freed.includes(window.__partsMeshProbe.cockpitMeshes.at(-1)?.id),
    }));

    expect(stats.created).toBeGreaterThanOrEqual(4);
    expect(stats.live).toBeLessThanOrEqual(3);
    expect(stats.freed).toBeGreaterThanOrEqual(stats.created - 3);
    expect(stats.cockpitCreated).toBeGreaterThanOrEqual(4);
    expect(stats.cockpitLive).toBeLessThanOrEqual(3);
    expect(stats.cockpitFreed).toBeGreaterThanOrEqual(stats.cockpitCreated - 3);
    expect(new Set(stats.freedIds).size).toBe(stats.freedIds.length);
    expect(stats.oldestBodyEvicted).toBe(true);
    expect(stats.newestBodyLive).toBe(true);
    expect(stats.oldestCockpitEvicted).toBe(true);
    expect(stats.newestCockpitLive).toBe(true);
  });

  test("wheel mesh cache keeps at most 8 tyre/brake pairs and frees evicted pairs", async ({ page }) => {
    test.setTimeout(360_000);
    await page.goto("/");
    await waitReady(page);
    await installMeshProbe(page);

    await page.evaluate(() => {
      const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
      if (team) localStorage.removeItem("apex26.parts." + team.id);
    });

    // 9 distinct tyre×brake keys — one more than the bound of 8
    const combos = [
      ["medium", "standard"],
      ["hard", "sport"],
      ["soft", "carbon"],
      ["supersoft", "ceramic"],
      ["intermediate", "drilled"],
      ["compound_c4", "titanium"],
      ["compound_c5", "ventilated"],
      ["hypersoft", "brembo_evo"],
      ["qualigum", "regen_brakes"],
    ];

    for (let i = 0; i < combos.length; i++) {
      const [tyre, brake] = combos[i];
      await openSetup(page);
      await ensureUnlimited(page);
      await pickOpt(page, "tyres", tyre);
      await pickOpt(page, "brakes", brake);
      await applyPartsAndPark(page);
      await page.waitForFunction(
        (min) => window.__partsMeshProbe.wheelMeshes.length >= min,
        (i + 1) * 2,
        { timeout: 20_000 }
      );
      await quitRace(page);
    }

    const stats = await page.evaluate(() => ({
      created: window.__partsMeshProbe.wheelMeshes.length,
      live: window.__partsMeshProbe.live("wheel"),
      freed: window.__partsMeshProbe.freedCount("wheel"),
      freedIds: window.__partsMeshProbe.freed.filter((id) =>
        window.__partsMeshProbe.wheelMeshes.some((e) => e.id === id)),
      oldestPairEvicted: window.__partsMeshProbe.wheelMeshes.slice(0, 2)
        .every((entry) => window.__partsMeshProbe.freed.includes(entry.id)),
      newestPairLive: window.__partsMeshProbe.wheelMeshes.slice(-2)
        .every((entry) => !window.__partsMeshProbe.freed.includes(entry.id)),
    }));

    expect(stats.created).toBeGreaterThanOrEqual(18);
    expect(stats.live).toBeLessThanOrEqual(16); // 8 pairs × F+R
    expect(stats.freed).toBeGreaterThanOrEqual(2);
    expect(new Set(stats.freedIds).size).toBe(stats.freedIds.length);
    expect(stats.oldestPairEvicted).toBe(true);
    expect(stats.newestPairLive).toBe(true);
  });
});
