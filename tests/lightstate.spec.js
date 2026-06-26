// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('lightState transitions', () => {
  let page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto('/');
    await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
    await page.evaluate(() => window.__apex.race('monza'));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
  });
  test.afterAll(async () => { await page?.close(); });

  test('day mode has zero floodlights', async () => {
    await page.evaluate(() => window.__apex.setTimeOfDay('day'));
    await page.waitForFunction(() => window.__apex.lightState().numLights === 0, { timeout: 5000 });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBe(0);
  });

  test('night mode activates floodlights', async () => {
    await page.evaluate(() => window.__apex.setTimeOfDay('night'));
    await page.waitForFunction(() => window.__apex.lightState().numLights > 0, { timeout: 8000 });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBeGreaterThan(0);
    expect(ls.ambientSky).toBeDefined();
  });

  test('reset to default mode works', async () => {
    await page.evaluate(() => window.__apex.setTimeOfDay('default'));
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls).toBeDefined();
    expect(ls.sunColor).toBeDefined();
  });
});
