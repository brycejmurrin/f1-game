// @ts-check
import { test, expect } from "@playwright/test";

// MY TEAM moved into the GARAGE's TEAM tab — the select screen is about WHERE
// you race, so it no longer carries the team editor. Opens the garage, saves,
// and closes it again, leaving the caller back on the select screen exactly
// where the old one-line #sel-customize click did.
//
// Getting back to #select is now two steps, not one. The garage is a STEP in
// the flow rather than a side door: #select START -> garage -> garage DONE
// goes FORWARD to RACE SETTINGS, which hides #select behind it. So DONE alone
// leaves the caller on a screen where #sel-go has no box at all, and the next
// click waits out the full timeout against a button that is right there in the
// DOM. RACE SETTINGS' own BACK is what returns to the circuit picker.
async function saveMyTeam(page, edit) {
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="team"]').click();
  await page.locator("#cs-customize").click();
  await page.locator("#customize").waitFor({ state: "visible" });
  if (edit) await edit();
  await page.locator("#cz-save").click();
  await page.locator("#customize").waitFor({ state: "hidden" });
  await page.locator("#cs-done").click();
  await page.locator("#carsetup").waitFor({ state: "hidden" });
  await page.locator("#rs-cancel").click();
  await page.locator("#select").waitFor({ state: "visible" });
}

const LANDSCAPE = { width: 844, height: 390 };

test.use({ viewport: LANDSCAPE });

test("custom-team color save frees and rebuilds its decal texture", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });

  // Every atlas is tagged with the team it was built FOR. getCarDecalTexture
  // calls LiveryTex.buildAtlas(teamId, …) as the argument to createTexture, so
  // the id captured here is always the team of the very next texture.
  //
  // This used to just take createdTextureIds[0] and assume it was the custom
  // team's. It is not: the first #sel-go happens BEFORE cz-save selects the
  // custom team, so the preview builds an atlas for whichever team was already
  // fitted (McLaren by default) and that one is id 1. invalidateDecalTextures
  // ("custom") then correctly frees only the custom atlas, and the assertion
  // failed looking for McLaren's. It could only ever pass on a machine fast
  // enough that no frame drew before cz-save ran.
  await page.evaluate(() => {
    const createdTextureIds = [];
    const freedTextureIds = [];
    const teamOfTexture = {};
    const textureIds = new WeakMap();
    let nextTextureId = 1;
    let pendingTeam = null;
    const createTexture = GLX.createTexture;
    const freeTexture = GLX.freeTexture;
    const buildAtlas = LiveryTex.buildAtlas;

    LiveryTex.buildAtlas = function (teamId, ...rest) {
      pendingTeam = teamId;
      return buildAtlas.call(this, teamId, ...rest);
    };
    GLX.createTexture = function (source) {
      const texture = createTexture(source);
      const id = nextTextureId++;
      textureIds.set(texture, id);
      createdTextureIds.push(id);
      teamOfTexture[id] = pendingTeam;
      pendingTeam = null;
      return texture;
    };
    GLX.freeTexture = function (texture) {
      const id = textureIds.get(texture);
      if (id !== undefined) freedTextureIds.push(id);
      return freeTexture(texture);
    };
    window.__customTeamTextureProbe = { createdTextureIds, freedTextureIds, teamOfTexture };
    window.__customAtlases = () =>
      window.__customTeamTextureProbe.createdTextureIds
        .filter((id) => window.__customTeamTextureProbe.teamOfTexture[id] === "custom");
  });

  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });

  // Save the default custom team once so it is selected for the setup preview.
  await saveMyTeam(page);

  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__customAtlases().length > 0);
  const firstTextureId = await page.evaluate(() => window.__customAtlases()[0]);

  await page.locator("#cs-done").click();      // garage DONE goes on to RACE SETTINGS...
  await page.locator("#rs-cancel").click();    // ...and its BACK is the way to #select
  await saveMyTeam(page, () => page.locator("#cz-color").fill("#123456"));

  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__customAtlases().length > 1, null, { polling: 100, timeout: 45_000 });

  const probe = await page.evaluate(() => window.__customTeamTextureProbe);
  const customIds = await page.evaluate(() => window.__customAtlases());
  const secondTextureId = customIds[customIds.length - 1];
  // The custom team's atlas from before the save is released...
  expect(probe.freedTextureIds).toContain(firstTextureId);
  // ...and replaced by a new one, rather than the car keeping stale colours.
  expect(secondTextureId).not.toBe(firstTextureId);
  // Guard the guard: if the tagging ever silently stopped working, every id
  // would drop out of __customAtlases and the two asserts above would be
  // comparing undefined to undefined.
  expect(probe.teamOfTexture[firstTextureId]).toBe("custom");
});

test("custom-team save frees every cached car-body mesh variant", async ({ page }) => {
  // The longest single flow in the suite: two full trips through the garage and
  // the custom-team editor, with a real race and two camera builds in between,
  // all under SwiftShader. It measured 132 s against the 120 s default — and
  // that default expiring mid-click reports as "the TEAM tab is not clickable",
  // which reads like a UI defect and is not one. Give it room to be slow.
  test.setTimeout(240_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });

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
  await page.locator("#cs-done").click();   // START opens the GARAGE; DONE carries on
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.waitForFunction(() => window.__customTeamMeshProbe.customMeshes.length >= 1);
  await page.evaluate(() => window.__apex.camera("cockpit"));
  await page.waitForFunction(() => window.__customTeamMeshProbe.customMeshes.length >= 2);

  await page.locator("#pausebtn").click();
  await page.locator("#pm-quit").click();
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });

  // Freeze the set built for the OLD paint. What the save has to release is
  // exactly this set — not "everything ever created", because saving repaints
  // the car and the garage promptly builds a body for the NEW colour. Counting
  // created-vs-freed at the end therefore always trails by the live mesh
  // (measured: 3 created, 2 freed) and would report a working invalidation as a
  // leak.
  const stale = await page.evaluate(() => window.__customTeamMeshProbe.customMeshes.length);
  expect(stale, "the race never built the chase + cockpit custom bodies").toBeGreaterThanOrEqual(2);

  await saveMyTeam(page, () => page.locator("#cz-color").fill("#123456"));

  const leaked = await page.evaluate((n) => {
    const p = window.__customTeamMeshProbe;
    return p.customMeshes.slice(0, n).filter((m) => !p.freedMeshes.has(m)).length;
  }, stale);
  expect(leaked, "a cached custom-team body mesh outlived the paint it was built for").toBe(0);
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
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  // LIVERY is a TAB since the garage grew its category tablist (adaptive-UI
  // round) — the old button query matched nothing and hung the click forever.
  await page.getByRole("tab", { name: "LIVERY" }).click();

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
  // Delete is arm-then-confirm now (G.armConfirm, the career DELETE? idiom —
  // one tap used to destroy a one-of-a-kind paint with no undo). First press
  // ARMS the button; the row must survive it. Second press confirms.
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Select Test Paint livery" })).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Select Test Paint livery" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.livery.mclaren")))).toBe("default");
});
