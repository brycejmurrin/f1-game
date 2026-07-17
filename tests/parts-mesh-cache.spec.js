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
    }));

    expect(stats.created).toBeGreaterThanOrEqual(4);
    expect(stats.live).toBeLessThanOrEqual(3);
    expect(stats.freed).toBeGreaterThanOrEqual(stats.created - 3);
    expect(stats.cockpitCreated).toBeGreaterThanOrEqual(4);
    expect(stats.cockpitLive).toBeLessThanOrEqual(3);
    expect(stats.cockpitFreed).toBeGreaterThanOrEqual(stats.cockpitCreated - 3);
    expect(new Set(stats.freedIds).size).toBe(stats.freedIds.length);
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
    }));

    expect(stats.created).toBeGreaterThanOrEqual(18);
    expect(stats.live).toBeLessThanOrEqual(16); // 8 pairs × F+R
    expect(stats.freed).toBeGreaterThanOrEqual(2);
    expect(new Set(stats.freedIds).size).toBe(stats.freedIds.length);
  });
});
