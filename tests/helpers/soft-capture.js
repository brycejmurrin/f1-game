/** Headless GLX soft-presents into #game-soft; page.screenshot must wait for it. */
export async function awaitSoftCapture(page, timeoutMs = 20_000) {
  await page.evaluate(async (ms) => {
    const g = window.GLX;
    if (g && g.softPresent && g.softPresent() && g.awaitSoftPresent) {
      try { await g.awaitSoftPresent(ms); } catch (_) { /* best-effort */ }
    }
  }, timeoutMs);
}

export async function pageScreenshot(page, opts = {}) {
  const { softTimeout = 20_000, ...shotOpts } = opts;
  await awaitSoftCapture(page, softTimeout);
  return page.screenshot(shotOpts);
}
