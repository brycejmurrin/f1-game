// @ts-check
// CLOSE GARAGE must dismiss on one real mouse click even when #loading is up
// in the busy phase (z-index above #carsetup). Regression for live acb6a7a.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

async function mouseClickCenter(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error("missing box for " + selector);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
}

test.describe("garage close — one click with loading plate", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("busy #loading does not block cs-done after Tyres tab", async ({ page }) => {
    test.setTimeout(BOOT_MS + 120_000);
    await toMenu(page);
    await page.locator("#mb-garage").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await page.waitForFunction(
      () => !document.getElementById("carsetup")?.hasAttribute("aria-busy"),
      null,
      { timeout: BOOT_MS, polling: 100 },
    );
    await page.locator('#cs-tabs [data-cs-cat="tyres"]').click();
    await page.waitForFunction(
      () => !document.getElementById("carsetup")?.hasAttribute("aria-busy"),
      null,
      { timeout: BOOT_MS, polling: 100 },
    );

    await page.evaluate(() => {
      const loading = document.getElementById("loading");
      if (!loading) throw new Error("no #loading");
      loading.hidden = false;
      loading.dataset.phase = "busy";
    });
    const top = await page.evaluate(() => {
      const done = document.getElementById("cs-done");
      const r = done.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && el.id;
    });
    expect(top, "busy plate must not be the hit target on CLOSE GARAGE").toBe("cs-done");

    await mouseClickCenter(page, "#cs-done");
    await expect(page.locator("#carsetup")).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#overlay")).toBeVisible();
  });
});
