import { test } from "@playwright/test";
test.use({ viewport: { width: 844, height: 390 } });
for (const [id, tod] of [["monaco","day"],["madrid","day"],["vegas","night"]]) {
  test(`${id}-${tod}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { timeout: 30000 });
    await page.evaluate(([i,t]) => window.__apex.race(i, t), [id, tod]);
    await page.waitForTimeout(2600);
    await page.evaluate(() => window.__apex.park(0.2));
    await page.waitForTimeout(220);
    await page.evaluate(() => window.__apex.eyeAt(0.2, 0, 2.8));
    await page.waitForTimeout(320);
    await page.screenshot({ path: `tests/street-shots/${id}-${tod}.png` });
  });
}
