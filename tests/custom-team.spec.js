// @ts-check
import { test, expect } from "@playwright/test";

// MY TEAM moved into the GARAGE's TEAM tab — the select screen is about WHERE
// you race, so it no longer carries the team editor. Opens the garage, saves,
// and closes it again, leaving the caller back on the select screen exactly
// where the old one-line #sel-customize click did.
async function saveMyTeam(page, edit) {
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="team"]').click();
  await page.locator("#cs-customize").click();
  await page.locator("#customize").waitFor({ state: "visible" });
  if (edit) await edit();
  await page.locator("#cz-save").click();
  await page.locator("#customize").waitFor({ state: "hidden" });
  await page.locator("#cs-done").click();
  await page.locator("#carsetup").waitFor({ state: "hidden" });
}

const LANDSCAPE = { width: 844, height: 390 };

test.use({ viewport: LANDSCAPE });

test("custom-team color save frees and rebuilds its decal texture", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });

  await page.evaluate(() => {
    const createdTextureIds = [];
    const freedTextureIds = [];
    const textureIds = new WeakMap();
    let nextTextureId = 1;
    const createTexture = GLX.createTexture;
    const freeTexture = GLX.freeTexture;

    GLX.createTexture = function (source) {
      const texture = createTexture(source);
      const id = nextTextureId++;
      textureIds.set(texture, id);
      createdTextureIds.push(id);
      return texture;
    };
    GLX.freeTexture = function (texture) {
      const id = textureIds.get(texture);
      if (id !== undefined) freedTextureIds.push(id);
      return freeTexture(texture);
    };
    window.__customTeamTextureProbe = { createdTextureIds, freedTextureIds };
  });

  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });

  // Save the default custom team once so it is selected for the setup preview.
  await saveMyTeam(page);

  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__customTeamTextureProbe.createdTextureIds.length > 0);
  const firstTextureId = await page.evaluate(() => window.__customTeamTextureProbe.createdTextureIds[0]);

  await page.locator("#cs-done").click();
  await saveMyTeam(page, () => page.locator("#cz-color").fill("#123456"));

  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => window.__customTeamTextureProbe.createdTextureIds.length > 1,
    { timeout: 45_000 }
  );

  const probe = await page.evaluate(() => window.__customTeamTextureProbe);
  const secondTextureId = probe.createdTextureIds[probe.createdTextureIds.length - 1];
  expect(probe.freedTextureIds).toContain(firstTextureId);
  expect(secondTextureId).not.toBe(firstTextureId);
});

test("custom-team save frees every cached car-body mesh variant", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });

  await page.evaluate(() => {
    const customData = new WeakSet();
    const customMeshes = [];
    const freedMeshes = new Set();
    const build = Car3D.build;
    const createMesh = GLX.createMesh;
    const freeMesh = GLX.freeMesh;

    Car3D.build = function (c1, c2, opts) {
      const data = build(c1, c2, opts);
      const team = Teams.LIST.find((candidate) => candidate.id === "custom");
      const same = (a, b) => a && b && a.length === b.length &&
        a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
      // Setup preview meshes have opts.parts but do not live in the three
      // team-keyed caches under test. Player/cockpit bodies use noWheels.
      if (team && same(c1, team.color) && same(c2, team.color2) &&
          (opts.noWheels || !opts.parts)) customData.add(data);
      return data;
    };
    GLX.createMesh = function (data) {
      const mesh = createMesh(data);
      if (customData.has(data)) customMeshes.push(mesh);
      return mesh;
    };
    GLX.freeMesh = function (mesh) {
      if (customMeshes.includes(mesh)) freedMeshes.add(mesh);
      return freeMesh(mesh);
    };
    window.__customTeamMeshProbe = { customMeshes, freedMeshes };
  });

  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await saveMyTeam(page);

  // Chase and cockpit cameras build the two player-only body cache variants.
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.waitForFunction(() => window.__customTeamMeshProbe.customMeshes.length >= 1);
  await page.evaluate(() => window.__apex.camera("cockpit"));
  await page.waitForFunction(() => window.__customTeamMeshProbe.customMeshes.length >= 2);

  await page.locator("#pausebtn").click();
  await page.locator("#pm-quit").click();
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await saveMyTeam(page, () => page.locator("#cz-color").fill("#123456"));

  const counts = await page.evaluate(() => ({
    created: window.__customTeamMeshProbe.customMeshes.length,
    freed: window.__customTeamMeshProbe.freedMeshes.size,
  }));
  expect(counts.created).toBeGreaterThanOrEqual(2);
  expect(counts.freed).toBe(counts.created);
});

test("custom livery actions are independent keyboard buttons", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apex26.livery.custom.mclaren", JSON.stringify([{
      id: "test-paint",
      name: "Test Paint",
      c1: [0.1, 0.2, 0.3],
      c2: [0.8, 0.7, 0.6]
    }]));
    localStorage.setItem("apex26.livery.mclaren", JSON.stringify("default"));
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
  await page.locator("#mb-race").click();
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /LIVERY/ }).click();

  const select = page.getByRole("button", { name: "Select Test Paint livery" });
  const edit = page.getByRole("button", { name: "Edit Test Paint livery" });
  const remove = page.getByRole("button", { name: "Delete Test Paint livery" });
  await expect(select).toBeVisible();
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  expect(await select.evaluate((row, action) => row.parentElement === action.parentElement, await edit.elementHandle())).toBe(true);
  expect(await select.evaluate((row, action) => row.parentElement === action.parentElement, await remove.elementHandle())).toBe(true);

  await select.focus();
  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cs-liv-editor")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.livery.mclaren")))).toBe("default");

  await page.locator(".cs-liv-ed-cancel").click();
  await page.getByRole("button", { name: "Delete Test Paint livery" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Select Test Paint livery" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.livery.mclaren")))).toBe("default");
});
