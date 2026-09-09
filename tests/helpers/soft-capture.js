/** Headless GLX soft-presents into #game-soft; page.screenshot must wait for it. */
export async function awaitSoftCapture(page, timeoutMs = 20_000) {
  const startGen = await page.evaluate(() => {
    // GLX is a top-level const (js/render/glx/glx.js), not window.GLX — see
    // tests/unit/gfx-debug-overlay.test.mjs and webgl-probes.spec.js.
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g?.softPresent?.()) return -1;
    try { window.__apex?.snapCam?.(); } catch (_) { /* harness */ }
    return g.softPresentState?.()?.gen ?? 0;
  });
  if (startGen < 0) return;
  // Poll from Node — do not awaitSoftPresent inside evaluate or the page main
  // thread stalls long enough to starve the render loop on a slow SwiftShader box.
  await page.waitForFunction((gen) => {
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g?.softPresent?.()) return true;
    const st = g.softPresentState?.();
    return !!(st && st.gen > gen);
  }, startGen, { polling: 100, timeout: timeoutMs });
}

export async function pageScreenshot(page, opts = {}) {
  const { softTimeout = 20_000, type = "png", quality, ...shotOpts } = opts;
  await awaitSoftCapture(page, softTimeout);
  const softBuf = await page.evaluate(({ mime, q }) => {
    const c = document.getElementById("game-soft");
    if (!c) return null;
    const url = c.toDataURL(mime, q);
    return url.slice(url.indexOf(",") + 1);
  }, {
    mime: type === "jpeg" ? "image/jpeg" : "image/png",
    q: quality,
  });
  if (softBuf) return Buffer.from(softBuf, "base64");
  return page.screenshot({ type, quality, ...shotOpts });
}
