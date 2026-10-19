// @ts-check
// Livery sidewallInk (garage slice S5): paint-only tyre sidewall lettering ink; the compound band keeps its colour.
// Unset = today's wheels byte for byte; set = colour arrays only, on all four wheels.
// The wheel-colour contract (unset = byte identical, colour arrays only, four corners) is
// pinned on the real Car3D build by tests/unit/livery-sidewall.test.mjs; this spec keeps only what
// needs the live creator UI.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

// One car area at a time: open the area that holds a control before acting on it.
async function reveal(page, sel) {
  await page.evaluate((s) => {
    const pane = document.querySelector(s)?.closest('[role="tabpanel"]');
    if (pane && pane.hidden) document.getElementById(pane.getAttribute("aria-labelledby")).click();
  }, sel);
  return page.locator(sel);
}

test.describe("Livery sidewall ink", () => {
  test("the creator's WHEELS & BRAKES section offers a SIDEWALL INK colour row", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await ensureLive(page);
    // same entry path as parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR, LIVERY, create
    const key = await page.evaluate(() => "livery.custom." + Teams.LIST[2].id);
    await forgetStored(page, [key]);
    await page.evaluate((k) => GameStore.store.set(k, []), key);
    await toMenu(page);
    await pinFreePlay(page, { team: 2, click: false });
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-car").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
    await page.locator(".cs-liv-create").click();
    await reveal(page, 'input[data-liv-field="sidewallInk"]');
    const sec = page.locator('[data-liv-section="WHEELS & BRAKES"]');
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).toHaveCount(1);
    await sec.locator('input[data-liv-field="sidewallInk"]').fill("#ff00ff");
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).not.toHaveClass(/cs-liv-off/);
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).toHaveValue("#ff00ff");
  });
});
