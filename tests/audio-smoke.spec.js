// @ts-check
const { test, expect } = require('@playwright/test');

test('GameAudio initialises without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
  const defined = await page.evaluate(() => typeof window.GameAudio === 'object' || typeof window.GameAudio === 'function');
  expect(defined).toBe(true);
  const audioErrors = errors.filter(e => e.includes('AudioContext') || e.includes('decodeAudioData') || e.includes('GameAudio'));
  expect(audioErrors).toHaveLength(0);
});
