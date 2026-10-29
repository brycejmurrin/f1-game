// @ts-check
/** Probe-only stall watchdog stress (Playwright / oracle). Not shipped in the game bundle. */

/** Pins + rAF busy-wait hook. Call via page.addInitScript before goto. */
export function stallReloadStressInitScript() {
  window.__TEST_MODE = true;
  try {
    sessionStorage.removeItem("apex26.stallReloads");
    sessionStorage.removeItem("apex26.ctxLostNotice");
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "1");
    localStorage.setItem("apex26.swRaceShed", "1");
    localStorage.removeItem("apex26.envProbeOff");
    localStorage.removeItem("apex26.perChunkOff");
  } catch (_) { /* private mode */ }

  window.__stallReloadStress = { armed: false, left: 0, spinMs: 1300 };
  if (window.__stallReloadStressHooked) return;
  window.__stallReloadStressHooked = true;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return orig(function (t) {
      const s = window.__stallReloadStress;
      if (s && s.armed && s.left > 0) {
        const end = performance.now() + s.spinMs;
        while (performance.now() < end) { /* probe-only spin: widens LoopHealth clean() gaps */ }
        s.left--;
      }
      return cb(t);
    });
  };
}

/** In-page snapshot only (serializable). */
export function stallReloadSnap() {
  if (typeof window.__apex === "undefined" || !window.__apex || typeof window.__apex.info !== "function") {
    let reloads = 0;
    try { reloads = parseInt(sessionStorage.getItem("apex26.stallReloads"), 10) || 0; } catch (_) { reloads = 0; }
    return { state: "boot", track: null, loadingHidden: null, reloads, stall: null, backend: null, gridMs: null, booting: true };
  }
  const info = window.__apex.info();
  const stall = typeof LoopHealth !== "undefined" ? LoopHealth.state().stall : null;
  let reloads = 0;
  try { reloads = parseInt(sessionStorage.getItem("apex26.stallReloads"), 10) || 0; } catch (_) { reloads = 0; }
  const ld = document.getElementById("loading");
  let backend = null, api = null, gl = null;
  try {
    if (typeof GLX !== "undefined") {
      backend = GLX.backend || null;
      const st = GLX.backendState ? GLX.backendState() : null;
      api = st && st.api ? st.api : null;
    }
  } catch (_) { /* identity stays null */ }
  // The live #game context only. A fresh canvas per sample (this poll runs for
  // the whole stress window) allocates another WebGL context; Chrome then drops
  // the oldest one, which is the game. On three forced to GL the race-entry
  // ctx-lost recover quits to the menu, the clean() spin is gone, and the
  // handoff cover never reaches its 30 slow frames — stall.act stays "".
  try {
    const canvas = document.getElementById("game");
    const g = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    if (g) {
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      gl = String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER));
    }
  } catch (_) { gl = null; }
  return {
    state: info.state,
    track: info.track,
    loadingHidden: !ld || ld.hidden,
    reloads,
    stall,
    backend: { backend, api, gl },
    gridMs: window.__stallProbeT0 != null ? Math.round(performance.now() - window.__stallProbeT0) : null,
  };
}

export function armStallReloadStress(opts) {
  const spinFrames = opts && opts.spinFrames != null ? opts.spinFrames : 12;
  const spinMs = opts && opts.spinMs != null ? opts.spinMs : 1300;
  const s = window.__stallReloadStress;
  s.armed = true;
  s.left = spinFrames;
  s.spinMs = spinMs;
}

/** Playwright driver: cold Bahrain wet, stress after #loading hidden on grid. */
export async function runStressedStallProbe(page, { bootMs = 120000, gridMs = 240000, stressMs = 180000, spinFrames = 45, spinMs = 1500 } = {}) {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: bootMs });
  await page.waitForFunction(
    () => typeof Tracks !== "undefined" && Tracks.LIST && Tracks.LIST.length > 0,
    null,
    { polling: 100, timeout: bootMs },
  );
  await page.evaluate(() => {
    window.__stallProbeT0 = performance.now();
    try { window.__apex.headless(true); } catch (_) { /* optional */ }
    if (!window.__apex.race("bahrain", "day", "wet")) throw new Error("race() rejected");
  });

  await page.waitForFunction(() => {
    const info = window.__apex.info();
    const ld = document.getElementById("loading");
    return info.track === "bahrain" && (info.state === "count" || info.state === "race") && (!ld || ld.hidden);
  }, null, { polling: 200, timeout: gridMs });

  await page.waitForFunction(
    () => typeof PostCommon !== "undefined" && typeof PostCommon.softwareRaceShed === "function",
    null,
    { polling: 100, timeout: gridMs },
  );

  const pre = await page.evaluate(stallReloadSnap);
  await page.evaluate(({ spinMs }) => {
    window.__stallReloadStress.armed = true;
    window.__stallReloadStress.spinMs = spinMs;
    if (window.__stallReloadStressPatched || typeof LoopHealth === "undefined" || !LoopHealth.clean) return;
    window.__stallReloadStressPatched = true;
    const orig = LoopHealth.clean.bind(LoopHealth);
    LoopHealth.clean = function () {
      const s = window.__stallReloadStress;
      if (s && s.armed) {
        const end = performance.now() + s.spinMs;
        while (performance.now() < end) { /* probe-only: consecutive SLOW_MS frames */ }
      }
      return orig();
    };
  }, { spinFrames, spinMs });

  const t0 = Date.now();
  let last = pre;
  let peak = pre;
  let reloaded = false;
  try {
    while (Date.now() - t0 < stressMs) {
      try {
        last = await page.evaluate(stallReloadSnap);
      } catch (err) {
        if (!String(err).includes("Execution context was destroyed")) throw err;
        await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: bootMs });
        last = await page.evaluate(stallReloadSnap);
        if (last.reloads > 0 || (last.stall && last.stall.act === "reload")) {
          reloaded = true;
          break;
        }
        continue;
      }
      if ((last.stall?.slowFrames || 0) >= (peak.stall?.slowFrames || 0)
        || (last.stall?.act && !peak.stall?.act)) peak = last;
      const act = last.stall && last.stall.act;
      const terminal = act === "reload" || act === "budget" || act === "budget-sw" || last.reloads > 0;
      if (terminal) {
        await page.evaluate(() => { if (window.__stallReloadStress) window.__stallReloadStress.armed = false; }).catch(() => {});
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    /* no framenavigated hook */
  }
  const outcome = (peak.stall && peak.stall.act) ? peak : last;
  const timedOut = !(outcome.stall && (outcome.stall.act === "reload" || outcome.stall.act === "budget" || outcome.stall.act === "budget-sw"))
    && outcome.reloads === 0 && outcome.state !== "menu" && !reloaded && (Date.now() - t0 >= stressMs);
  return { ...outcome, peak, reloaded, timedOut };
}
