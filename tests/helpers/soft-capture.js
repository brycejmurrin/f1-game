/** Headless GLX soft-presents into #game-soft; page.screenshot must wait for it. */
export async function awaitSoftCapture(page, timeoutMs = 20_000) {
  const startGen = await page.evaluate(() => {
    const g = window.GLX;
    if (!g?.softPresent?.()) return -1;
    try { window.__apex?.snapCam?.(); } catch (_) { /* harness */ }
    return g.softPresentState?.()?.gen ?? 0;
  });
  if (startGen < 0) return;
  // Poll from Node — do not awaitSoftPresent inside evaluate or the page main
  // thread stalls long enough to starve the render loop on a slow SwiftShader box.
  await page.waitForFunction((gen) => {
    const g = window.GLX;
    if (!g?.softPresent?.()) return true;
    const st = g.softPresentState?.();
    return !!(st && st.gen > gen);
  }, startGen, { polling: 100, timeout: timeoutMs });
}

export async function pageScreenshot(page, opts = {}) {
  const { softTimeout = 20_000, ...shotOpts } = opts;
  await awaitSoftCapture(page, softTimeout);
  const soft = page.locator("#game-soft");
  if (await soft.count()) return soft.screenshot(shotOpts);
  return page.screenshot(shotOpts);
}
