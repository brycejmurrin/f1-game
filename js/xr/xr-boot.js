/* Apex 26 — WebXR boot wiring (Phase 0).
 *
 * Mounts the ENTER VR button, binds XrSession to the live gfx backend, and
 * exposes a tiny façade game.js reads (comfort lock, eye bags, loop handoff)
 * so the spike does not grow game.js past the ratchet absorb budget.
 */
"use strict";

const XrBoot = (function () {
  const LS_XR_PENDING = "apex26.xrEnterPending";

  let _loopByXr = false;
  let _tickBody = null;
  let _windowRaf = null;       // schedule one window.rAF(tick) — deduped
  let _windowRequest = null;
  let _windowGeneration = 0;
  let _windowPending = false;  // true while a window tick is queued
  let _cockpitIdx = -1;
  let _savedCam = -1;
  let _bound = false;
  let _boundGfx = null;
  let _getCamMode = null;
  let _setCamMode = null;      // (idx, opts?) — opts.persist === false skips store

  function comfort() {
    return typeof XrSession !== "undefined" && XrSession.isPresenting();
  }

  /** Reduce-motion OR immersive presenting — shake / buzz / kerb shiver off. */
  function camComfort(motionReduced) {
    return !!motionReduced || comfort();
  }

  // Frame ownership while presenting: XrSession.requestAnimationFrame →
  // onFrame → tickBody. Do NOT also schedule window.rAF (it stops reliably
  // inside a standalone immersive session). three.setAnimationLoop is unused
  // because we drive XRWebGLLayer ourselves rather than XRManager.
  function loopByXr() { return _loopByXr; }
  /** True after bind() — tests must wait for this before XrSession.start(). */
  function isBound() { return _bound; }

  /**
   * True when the live gfx backend can attach an XRWebGLLayer now
   * (TLX + WebGL2 / tlxForceGL). GLX / WGX / default TLX-WebGPU need a reload
   * switch — see ensureXrBackend().
   */
  function canAttach() {
    const gfx = _boundGfx;
    if (!gfx || typeof gfx.attachXrSession !== "function") return false;
    if (typeof gfx.xrCapable === "function") {
      try { return !!gfx.xrCapable(); } catch (_) { return false; }
    }
    return false;
  }

  /**
   * If the active backend cannot attach, pin TLX + forceWebGL and reload once
   * (design: backend switch via setting; flat players who never click are
   * untouched). Returns { ok, reloading?, message? }.
   */
  function ensureXrBackend() {
    if (canAttach()) return { ok: true };
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem(LS_XR_PENDING, "1");
    } catch (e) {
      return { ok: false, message: "VR needs WebGL2 (allow site storage)" };
    }
    try { location.reload(); } catch (_) { /* */ }
    return { ok: false, reloading: true };
  }

  function consumePendingEnter() {
    try {
      if (localStorage.getItem(LS_XR_PENDING) !== "1") return false;
      localStorage.removeItem(LS_XR_PENDING);
      return true;
    } catch (_) { return false; }
  }

  function findCockpit() {
    if (_cockpitIdx >= 0) return _cockpitIdx;
    try {
      const modes = (typeof CamModes !== "undefined" && CamModes.CAM_MODES) || null;
      if (modes) _cockpitIdx = modes.findIndex((c) => c.id === "cockpit");
    } catch (_) { _cockpitIdx = -1; }
    return _cockpitIdx;
  }

  /** Switch camera without writing apex26.camMode (VR override is ephemeral). */
  function setCamTransient(idx) {
    if (typeof _setCamMode === "function") return _setCamMode(idx, { persist: false });
  }

  function saveAndForceCockpit() {
    const ci = findCockpit();
    if (ci < 0 || typeof _getCamMode !== "function") return;
    _savedCam = _getCamMode();
    if (_savedCam !== ci) setCamTransient(ci);
  }

  function restoreSavedCam() {
    if (_savedCam < 0) return;
    try { setCamTransient(_savedCam); } catch (_) { /* */ }
    _savedCam = -1;
  }

  /**
   * Schedule exactly one window.rAF for the game tick. Dedupes concurrent
   * resumeRaf + tick-chain so EXIT VR cannot spawn a second loop.
   */
  function chainWindowRaf(tickFn) {
    if (_loopByXr) return false;
    if (_windowPending) return false;
    const fn = tickFn || _windowRaf;
    if (typeof fn !== "function") return false;
    _windowPending = true;
    const generation = _windowGeneration;
    _windowRequest = requestAnimationFrame((t) => {
      if (_loopByXr || generation !== _windowGeneration) return;
      _windowRequest = null;
      _windowPending = false;
      fn(t);
    });
    return true;
  }

  /** Call at the end of tick(): chain window rAF unless XR owns the clock. */
  function afterTick(tickFn) {
    return chainWindowRaf(tickFn);
  }

  let _xrLoad = null;
  // Files that evaluated on an earlier (failed) attempt: re-injecting a const-declaring one throws "already declared".
  const _xrLoaded = new Set();
  let _bindApi = null;
  function ensureXr() {
    if (typeof XrSession !== "undefined" && typeof XrUi !== "undefined" && typeof ApexXR !== "undefined") {
      if (_bindApi && !_bound) bindInner(_bindApi);
      return Promise.resolve(true);
    }
    if (_xrLoad) return _xrLoad;
    const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_XR) || [];
    const edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_XR_EDGES) || [];
    if (!files.length || typeof ScriptLoader === "undefined") {
      Log.warn("xr", "XR bundle is not in this build");
      return Promise.resolve(false);
    }
    _xrLoad = ScriptLoader.create().load(files, edges, { strict: true, loaded: _xrLoaded }).then((ok) => {
      if (!ok) {
        _xrLoad = null;
        Log.warn("xr", "the XR bundle did not load");
        return false;
      }
      if (_bindApi && !_bound) bindInner(_bindApi);
      return true;
    });
    return _xrLoad;
  }

  function bindInner(api) {
    if (_bound || typeof XrSession === "undefined") return;
    _tickBody = api && api.tickBody;
    _windowRaf = api && api.windowTick;
    _boundGfx = api && api.gfx;
    _getCamMode = api && api.getCamMode;
    _setCamMode = api && api.setCamMode;
    XrSession.bind({
      attachSession: async (session, info) => {
        if (!canAttach()) {
          throw new Error("Active renderer cannot attach XR (need TLX + WebGL2)");
        }
        if (info && info.backend === "webgpu" && typeof globalThis.XRGPUBinding === "undefined") {
          throw new Error("WebGPU XR unavailable; session should have fallen back");
        }
        return api.gfx.attachXrSession(session);
      },
      detachSession: () => {
        if (api.gfx && typeof api.gfx.detachXrSession === "function") api.gfx.detachXrSession();
      },
      onStart: () => {
        _loopByXr = true;
        // Cancellation saves work; generation also rejects a callback already
        // dispatched (or suspended by the browser until after XR ends).
        _windowGeneration++;
        if (_windowRequest !== null) cancelAnimationFrame(_windowRequest);
        _windowRequest = null;
        _windowPending = false;
        saveAndForceCockpit();
      },
      onEnd: () => {
        _loopByXr = false;
        restoreSavedCam();
        // Resume exactly one window loop (deduped).
        chainWindowRaf(_windowRaf);
      },
      onFrame: (time) => {
        if (_loopByXr && typeof _tickBody === "function") _tickBody(time);
      },
    });
    _bound = true;
  }

  function bind(api) {
    _bindApi = api;
    if (typeof XrSession === "undefined") return;
    bindInner(api);
  }

  // Chrome and Edge on a desktop expose navigator.xr with no headset anywhere, so
  // its mere presence fetched the ~42 KB LAZY_XR bundle (and mounted an ENTER VR
  // button that could only fail) for every one of them. Ask whether an
  // immersive-vr session can start at all. true / false, or null when that cannot
  // be known (no isSessionSupported, a throw, a hang past the cap).
  const PROBE_CAP_MS = 1500;
  function probeVr() {
    return (async () => {
      try {
        const xr = typeof navigator !== "undefined" && navigator.xr;
        if (!xr) return false;
        if (typeof xr.isSessionSupported !== "function") return null;
        let timer = null;
        const cap = new Promise((resolve) => { if (typeof setTimeout === "function") timer = setTimeout(() => resolve(null), PROBE_CAP_MS); });
        try {
          const v = await Promise.race([xr.isSessionSupported("immersive-vr"), cap]);
          return v === null ? null : !!v;
        } finally { if (timer !== null) clearTimeout(timer); }
      } catch (_) { return null; }
    })();
  }

  async function wantXrBundle() {
    try { if (localStorage.getItem("apex26.xr") === "1") return true; } catch (_) { /* blocked */ }
    try { if (localStorage.getItem("apex26.xrEnterPending") === "1") return true; } catch (_) { /* blocked */ }
    if (typeof navigator === "undefined" || !navigator.xr) return false;
    // Only a definite "no headset" skips the fetch; an unknown answer keeps the old one.
    return (await probeVr()) !== false;
  }

  function mountUi() {
    if (typeof window !== "undefined") {
      window.__apexXr = {
        diag: () => diag(),
        setFoveation: (v) => setFoveation(v),
        canAttach: () => canAttach(),
        ensure: ensureXr,
      };
    }
    const finish = () => {
      if (typeof XrUi !== "undefined") XrUi.mount(document.body);
      // After a backend-switch reload, auto-enter once XR is attachable.
      if (consumePendingEnter() && typeof XrSession !== "undefined") {
        Promise.resolve(XrSession.probe()).then((ok) => {
          if (!ok || !canAttach()) return;
          return XrSession.start();
        }).catch(() => { /* auto-enter best-effort */ });
      }
    };
    if (typeof XrUi !== "undefined") { finish(); return; }
    wantXrBundle().then((want) => (want ? ensureXr() : false)).then((ok) => { if (ok) finish(); }, () => { /* the VR button is optional */ });
  }

  /**
   * After camEye/camTgt are known: publish the seated anchor and, when
   * presenting, overwrite frame matrices with the left eye and return the
   * full eye list for presentXR. Returns null when not in XR.
   */
  function applyEyes(frame, camEye, camTgt, camUp) {
    if (!comfort() || typeof XrSession === "undefined" || typeof XrRig === "undefined") return null;
    const fwd = [
      (camTgt[0] - camEye[0]),
      (camTgt[1] - camEye[1]),
      (camTgt[2] - camEye[2]),
    ];
    const up = camUp || [0, 1, 0];
    XrSession.setAnchor(camEye, fwd, up);
    const gfx = _boundGfx;
    const layer = gfx && typeof gfx.xrLayer === "function" ? gfx.xrLayer() : (gfx && gfx._xrLayer) || null;
    const eyes = XrSession.eyeFrames(layer);
    if (!eyes || !eyes.length) return null;
    const e0 = eyes[0];
    if (frame && e0) {
      if (e0.viewProj) frame.viewProj = e0.viewProj;
      if (e0.proj) frame.proj = e0.proj;
      if (e0.invProj) frame.invProj = e0.invProj;
      if (e0.invViewProj) frame.invViewProj = e0.invViewProj;
      if (e0.view) frame.view = e0.view;
      if (e0.eye) frame.eye = e0.eye;
    }
    return eyes;
  }

  function present(gfx, eyes, po) {
    if (eyes && gfx && typeof gfx.presentXR === "function") {
      gfx.presentXR(eyes, po);
      return true;
    }
    return false;
  }

  function diag() {
    const gfx = _boundGfx;
    const presenting = comfort();
    const session = (typeof XrSession !== "undefined") ? XrSession : null;
    const info = (gfx && typeof gfx.xrInfo === "function") ? gfx.xrInfo() : null;
    const fov = (gfx && typeof gfx.getFoveation === "function") ? gfx.getFoveation() : null;
    return {
      presenting: presenting,
      loopByXr: _loopByXr,
      windowPending: _windowPending,
      canAttach: canAttach(),
      backend: session && session.backend ? session.backend() : null,
      features: session && session.enabledFeatures ? session.enabledFeatures() : [],
      frameCount: session && session.frameCount ? session.frameCount() : 0,
      visible: session && session.isVisible ? session.isVisible() : null,
      foveation: fov,
      draw: info,
      layer: !!(gfx && typeof gfx.xrLayer === "function" && gfx.xrLayer()),
      savedCam: _savedCam,
    };
  }

  function setFoveation(v) {
    const gfx = _boundGfx;
    if (gfx && typeof gfx.setFoveation === "function") return gfx.setFoveation(v);
    return false;
  }

  return {
    bind, mountUi, ensureXr, wantXrBundle, comfort, camComfort, loopByXr, isBound, canAttach,
    ensureXrBackend, applyEyes, present, afterTick, chainWindowRaf,
    findCockpit, diag, setFoveation, saveAndForceCockpit, restoreSavedCam,
    // Test / UI helpers
    setCamMode: (...a) => setCamTransient(...a),
    LS_XR_PENDING,
  };
})();
Object.freeze(XrBoot);
