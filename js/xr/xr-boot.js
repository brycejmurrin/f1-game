/* Apex 26 — WebXR boot wiring (Phase 0).
 *
 * Mounts the ENTER VR button, binds XrSession to the live gfx backend, and
 * exposes a tiny façade game.js reads (comfort lock, eye bags, loop handoff)
 * so the spike does not grow game.js past the ratchet absorb budget.
 */
"use strict";

const XrBoot = (function () {
  let _loopByXr = false;
  let _tickBody = null;
  let _resumeRaf = null;
  let _cockpitIdx = -1;
  let _savedCam = -1;
  let _bound = false;
  let _boundGfx = null;
  let _setCamMode = null;

  function comfort() {
    return typeof XrSession !== "undefined" && XrSession.isPresenting();
  }

  // Frame ownership while presenting: XrSession.requestAnimationFrame →
  // onFrame → tickBody. Do NOT also schedule window.rAF (it stops reliably
  // inside a standalone immersive session). three.setAnimationLoop is unused
  // because we drive XRWebGLLayer ourselves rather than XRManager.
  function loopByXr() { return _loopByXr; }
  /** True after bind() — tests must wait for this before XrSession.start(). */
  function isBound() { return _bound; }

  function findCockpit() {
    if (_cockpitIdx >= 0) return _cockpitIdx;
    try {
      const modes = (typeof CamModes !== "undefined" && CamModes.CAM_MODES) || null;
      if (modes) _cockpitIdx = modes.findIndex((c) => c.id === "cockpit");
    } catch (_) { _cockpitIdx = -1; }
    return _cockpitIdx;
  }

  function bind(api) {
    if (_bound || typeof XrSession === "undefined") return;
    _tickBody = api && api.tickBody;
    _resumeRaf = api && api.resumeRaf;
    _boundGfx = api && api.gfx;
    _setCamMode = api && api.setCamMode;
    XrSession.bind({
      attachSession: async (session, info) => {
        // Prefer TLX WebGL2 XRWebGLLayer. If the live backend has no attach,
        // surface a clear error — GLX attach lands in a follow-up.
        if (!api.gfx || typeof api.gfx.attachXrSession !== "function") {
          throw new Error("Active renderer has no attachXrSession (need TLX + tlxForceGL)");
        }
        // WebGPU experimental: only when the session actually got the feature
        // and XRGPUBinding exists. Otherwise the layer path needs WebGL2.
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
        const ci = findCockpit();
        if (ci >= 0 && api.getCamMode && api.setCamMode) {
          _savedCam = api.getCamMode();
          if (_savedCam !== ci) api.setCamMode(ci);
        }
      },
      onEnd: () => {
        _loopByXr = false;
        if (_savedCam >= 0 && api.setCamMode) {
          try { api.setCamMode(_savedCam); } catch (_) { /* */ }
          _savedCam = -1;
        }
        if (typeof _resumeRaf === "function") _resumeRaf();
      },
      onFrame: (time) => {
        if (typeof _tickBody === "function") _tickBody(time);
      },
    });
    _bound = true;
  }

  function mountUi() {
    if (typeof XrUi !== "undefined") XrUi.mount(document.body);
    // chrome://inspect convenience (Quest remote debug) — same as XrBoot.diag().
    if (typeof window !== "undefined") {
      window.__apexXr = {
        diag: () => diag(),
        setFoveation: (v) => setFoveation(v),
      };
    }
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

  /**
   * On-device / chrome://inspect hook. Read draw calls and foveation while
   * presenting. IWER cannot prove real foveation or frame times — device only.
   */
  function diag() {
    const gfx = _boundGfx;
    const presenting = comfort();
    const session = (typeof XrSession !== "undefined") ? XrSession : null;
    const info = (gfx && typeof gfx.xrInfo === "function") ? gfx.xrInfo() : null;
    const fov = (gfx && typeof gfx.getFoveation === "function") ? gfx.getFoveation() : null;
    return {
      presenting: presenting,
      loopByXr: _loopByXr,
      backend: session && session.backend ? session.backend() : null,
      features: session && session.enabledFeatures ? session.enabledFeatures() : [],
      frameCount: session && session.frameCount ? session.frameCount() : 0,
      visible: session && session.isVisible ? session.isVisible() : null,
      foveation: fov,
      draw: info,
      layer: !!(gfx && typeof gfx.xrLayer === "function" && gfx.xrLayer()),
    };
  }

  function setFoveation(v) {
    const gfx = _boundGfx;
    if (gfx && typeof gfx.setFoveation === "function") return gfx.setFoveation(v);
    return false;
  }

  return { bind, mountUi, comfort, loopByXr, isBound, applyEyes, present, findCockpit, diag, setFoveation,
    // XrUi ENTER click uses this instead of the G façade.
    setCamMode: (...a) => { if (typeof _setCamMode === "function") return _setCamMode(...a); },
  };
})();
Object.freeze(XrBoot);
