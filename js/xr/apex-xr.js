/* Apex 26 — ApexXR: thin façade over XRPlan + XrSession for boot / settings.
 *
 * Owns the cached plan, capability probe → apex26.xrCaps latch, bootPick() for
 * game.js backendPreference(), and noteFallback() for the post-boot ladder
 * (task 45). Does NOT own the immersive session — that stays XrSession.
 *
 * Storage (all apex26.-prefixed):
 *   apex26.xr          "0"|"1"     VR mode armed (XROpts)
 *   apex26.xrBackend   webgl2|webgpu
 *   apex26.xrCaps      "0"|"1"     last positive immersive-vr detect (sync boot)
 *   apex26.xrFallback  sessionStorage "webgl2" after a failed WebGPU XR attempt
 */
"use strict";

const ApexXR = (function () {
  const LS_XR = "apex26.xr";
  const LS_BACKEND = "apex26.xrBackend";
  const LS_CAPS = "apex26.xrCaps";
  const SS_FALLBACK = "apex26.xrFallback";

  let _plan = null;
  let _caps = null;
  let _fallbacks = [];
  let _detecting = null;

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (_) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (_) { return false; }
  }
  function ssGet(k) {
    try { return sessionStorage.getItem(k); } catch (_) { return null; }
  }
  function ssSet(k, v) {
    try { sessionStorage.setItem(k, v); return true; } catch (_) { return false; }
  }

  function readPrefs() {
    let xr = "0";
    let xrBackend = "webgl2";
    let gfxBackend = null;
    try {
      if (typeof XROpts !== "undefined") {
        xr = XROpts.xr() ? "1" : "0";
        xrBackend = XROpts.xrBackend();
      } else {
        xr = XRPlan.normXr(lsGet(LS_XR));
        xrBackend = XRPlan.normBackend(lsGet(LS_BACKEND));
      }
      gfxBackend = lsGet("apex26.gfxBackend");
    } catch (_) { /* storage blocked */ }
    return { xr, xrBackend, gfxBackend };
  }

  function questUa(ua) {
    return /OculusBrowser/i.test(ua || "");
  }

  function syncCapsFromCache() {
    const cached = lsGet(LS_CAPS);
    return {
      xr: typeof navigator !== "undefined" && !!navigator.xr,
      vr: cached === "1",
      gpu: typeof navigator !== "undefined" && !!navigator.gpu,
      xrgpu: typeof globalThis !== "undefined" && typeof globalThis.XRGPUBinding !== "undefined",
      layers: false,
      mobileQuest: typeof navigator !== "undefined" && questUa(navigator.userAgent),
    };
  }

  /** Async capability probe. Writes apex26.xrCaps for the next boot's sync pick. */
  async function detect() {
    if (_detecting) return _detecting;
    _detecting = (async () => {
      const caps = syncCapsFromCache();
      caps.xr = typeof navigator !== "undefined" && !!navigator.xr;
      caps.gpu = typeof navigator !== "undefined" && !!navigator.gpu;
      caps.xrgpu = typeof globalThis !== "undefined" && typeof globalThis.XRGPUBinding !== "undefined";
      caps.mobileQuest = typeof navigator !== "undefined" && questUa(navigator.userAgent);
      let vr = false;
      if (caps.xr && navigator.xr && navigator.xr.isSessionSupported) {
        try {
          vr = !!(await navigator.xr.isSessionSupported("immersive-vr"));
        } catch (_) { vr = false; }
      }
      caps.vr = vr;
      lsSet(LS_CAPS, vr ? "1" : "0");
      _caps = caps;
      _plan = null; // invalidate so plan() re-resolves
      if (typeof XROpts !== "undefined" && XROpts.onCaps) {
        try { XROpts.onCaps(caps); } catch (_) { /* UI optional */ }
      }
      return caps;
    })();
    try {
      return await _detecting;
    } finally {
      _detecting = null;
    }
  }

  function caps() {
    if (_caps) return _caps;
    _caps = syncCapsFromCache();
    return _caps;
  }

  function plan(force) {
    if (_plan && !force) return _plan;
    const boot = { xrFallback: ssGet(SS_FALLBACK) };
    const resolved = XRPlan.resolve({ caps: caps(), prefs: readPrefs(), boot });
    _plan = resolved;
    return resolved;
  }

  /** Sync boot override for backendPreference(). null ⇒ leave 2D pick alone. */
  function bootPick() {
    const p = plan(true);
    if (p.xrMode !== "armed") return null;
    return p.backendPref || null;
  }

  function path() {
    return plan().path;
  }

  function fallbacks() {
    return (_fallbacks.length ? _fallbacks : plan().fallbacks).slice();
  }

  function noteFallback(from, to, reason) {
    const entry = { from: String(from || ""), to: String(to || ""), reason: String(reason || "") };
    _fallbacks.push(entry);
    try { Log.warn("xr", entry.from + "→" + entry.to + ": " + entry.reason); } catch (_) { /* */ }
    if (entry.to === "webgl2") ssSet(SS_FALLBACK, "webgl2");
    _plan = null;
    return entry;
  }

  function stats() {
    const p = plan();
    const session = (typeof XrSession !== "undefined") ? XrSession : null;
    return {
      path: p.path,
      xrMode: p.xrMode,
      backendPref: p.backendPref,
      reasons: p.reasons.slice(),
      fallbacks: fallbacks(),
      caps: caps(),
      presenting: !!(session && session.isPresenting && session.isPresenting()),
      sessionBackend: session && session.backend ? session.backend() : null,
      frameCount: session && session.frameCount ? session.frameCount() : 0,
    };
  }

  function invalidate() {
    _plan = null;
  }

  /** True when the live gfx bind matches the armed plan (or VR is off). */
  function rendererMatchesPlan() {
    const p = plan();
    if (p.xrMode !== "armed") return true;
    // Until task 40/45 wire GLX/TLX XR attach for every path, "can attach"
    // is the practical gate for ENTER VR (Phase 0 TLX+forceGL).
    if (typeof XrBoot !== "undefined" && typeof XrBoot.canAttach === "function") {
      try { if (XrBoot.canAttach()) return true; } catch (_) { /* */ }
    }
    let bound = null;
    try { bound = sessionStorage.getItem("apex26.gfxBound"); } catch (_) { bound = null; }
    if (p.path === "webgl2") return bound === "webgl2";
    // webgpu experimental: TLX clears gfxBound on a successful bind.
    return bound == null;
  }

  return {
    LS_XR, LS_BACKEND, LS_CAPS, SS_FALLBACK,
    detect, caps, plan, bootPick, path, fallbacks, noteFallback, stats,
    invalidate, rendererMatchesPlan, readPrefs, questUa,
  };
})();
Object.freeze(ApexXR);
