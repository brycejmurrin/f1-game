/** Headless GLX soft-presents into #game-soft; page.screenshot must wait for it. */
export async function awaitSoftCapture(page, timeoutMs = 20_000) {
  await page.evaluate(async (timeout) => {
    const g = window.GLX;
    if (!g?.softPresent?.()) return;
    try { window.__apex?.snapCam?.(); } catch (_) { /* harness */ }
    await g.awaitSoftPresent(timeout);
  }, timeoutMs);
}

export async function pageScreenshot(page, opts = {}) {
  const { softTimeout = 20_000, ...shotOpts } = opts;
  await awaitSoftCapture(page, softTimeout);
  return page.screenshot(shotOpts);
}
