/** Headless GLX soft-presents into #game-soft; page.screenshot must wait for it. */
export async function awaitSoftCapture(page, timeoutMs = 20_000) {
  const startGen = await page.evaluate(() => {
    // GLX is a top-level const (js/render/glx/glx.js), not window.GLX — see
    // tests/unit/gfx-debug-overlay.test.mjs and webgl-probes.spec.js.
    const g = typeof GLX !== "undefined" ? GLX : null;
    if (!g?.softPresent?.()) return -1;
    // snapCam() does TWO things, and this helper only ever wanted one of them.
    // It arms an explicit soft blit (GLX captures ON DEMAND — see
    // invalidateSoftPresent in js/render/glx/glx.js), which is what a capture
    // needs; and it does `G.dbgCam = null`, documented in js/agent/apex.js as
    // clearing any free-cam override, which is what park()/jump() callers need
    // so the chase camera stops framing the place the car teleported FROM.
    // Calling it unconditionally silently destroyed the FIXED camera a spec had
    // set with eyeAt()/view()/orbit() and handed every capture to the live,
    // DAMPED chase camera, whose pose depends on frame timing — so two captures
    // of one frozen scene were two viewpoints. MEASURED on the Metal runner (CI
    // 3623, image-grade "blacks"): the third capture was the same scene yawed
    // ~34 px, one baseline luma landing anywhere in 0-166 (sd 22-48, against
    // 0.9-3 for a real grade), which the tonal maths read as "crushing blacks
    // made the image 9.7 BRIGHTER". SwiftShader never showed it because at ~1 fps
    // the camera settles before every capture. So: a spec that owns the camera
    // gets the blit arming ALONE — dbgCam already overrides eye/target/fov/far
    // every frame, so there is nothing to snap — and everyone else is unchanged.
    try {
      if (window.__apex?.camState?.().debug === true) g.invalidateSoftPresent?.();
      else window.__apex?.snapCam?.();
    } catch (_) { /* harness */ }
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
