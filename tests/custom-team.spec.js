// @ts-check
import { test, expect } from "@playwright/test";

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
  await page.locator("#sel-customize").click();
  await page.locator("#customize").waitFor({ state: "visible" });
  await page.locator("#cz-save").click();

  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__customTeamTextureProbe.createdTextureIds.length > 0);
  const firstTextureId = await page.evaluate(() => window.__customTeamTextureProbe.createdTextureIds[0]);

  await page.locator("#cs-done").click();
  await page.locator("#sel-customize").click();
  await page.locator("#customize").waitFor({ state: "visible" });
  await page.locator("#cz-color").fill("#123456");
  await page.locator("#cz-save").click();

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
