"use strict";

const XrBoot = (function () {
  const LS_XR_PENDING = "apex26.xrEnterPending";
  const LS_XR_PREV = "apex26.xrPrevBackend";
  const PIN_KEYS = ["gfxBackend", "tlxForceGL"];

  let _loopByXr = false;
  let _presentCount = 0;
  let _tickBody = null;
  let _windowRaf = null;
  let _windowRequest = null;
  let _windowGeneration = 0;
  let _windowPending = false;
  let _cockpitIdx = -1;
  let _savedCam = -1;
  let _cameraOwner = null;
  let _bound = false;
  let _boundGfx = null;
  let _getCamMode = null;
  let _setCamMode = null;

  function comfort() {
    return typeof XrSession !== "undefined" && XrSession.isPresenting();
  }

  function camComfort(motionReduced) {
    return !!motionReduced || comfort();
  }

  function loopByXr() { return _loopByXr; }
  function isBound() { return _bound; }

  function canAttach() {
    const gfx = _boundGfx;
    if (!gfx || typeof gfx.attachXrSession !== "function") return false;
    if (typeof gfx.xrCapable === "function") {
      try { return !!gfx.xrCapable(); } catch (_) { return false; }
    }
    return false;
  }

  function ensureXrBackend() {
    if (canAttach()) return { ok: true };
    if (typeof UiLayers !== "undefined" && UiLayers.inRace && UiLayers.inRace()) {
      return { ok: false, message: "VR AFTER THE RACE" };
    }
    try {
      if (localStorage.getItem(LS_XR_PREV) === null) {
        const prev = {};
        for (const k of PIN_KEYS) prev[k] = localStorage.getItem("apex26." + k);
        localStorage.setItem(LS_XR_PREV, JSON.stringify(prev));
      }
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem(LS_XR_PENDING, "1");
    } catch (e) {
      return { ok: false, message: "VR needs WebGL2 (allow site storage)" };
    }
    try { location.reload(); } catch (_) {  }
    return { ok: false, reloading: true };
  }

  function restorePinnedBackend() {
    try {
      const raw = localStorage.getItem(LS_XR_PREV);
      if (raw === null) return false;
      let prev = null;
      try { prev = JSON.parse(raw); } catch (_) {  }
      if (prev && typeof prev === "object") {
        for (const k of PIN_KEYS) {
          const v = prev[k];
          if (typeof v === "string") localStorage.setItem("apex26." + k, v);
          else localStorage.removeItem("apex26." + k);
        }
      }
      localStorage.removeItem(LS_XR_PREV);
      return true;
    } catch (_) { return false; }
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

  function setCamTransient(idx, release) {
    if (typeof _setCamMode === "function") return _setCamMode(idx, { persist: false, owner: _cameraOwner, priority: 100, release: !!release });
  }

  function saveAndForceCockpit() {
    const ci = findCockpit();
    if (ci < 0 || typeof _getCamMode !== "function" || _cameraOwner) return;
    _savedCam = _getCamMode();
    _cameraOwner = {};
    setCamTransient(ci);
  }

  function restoreSavedCam() {
    if (!_cameraOwner) return;
    try { setCamTransient(_savedCam, true); } catch (_) {  }
    _savedCam = -1;
    _cameraOwner = null;
  }

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

  function afterTick(tickFn) {
    return chainWindowRaf(tickFn);
  }

  let _xrLoad = null;
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
        _presentCount = 0;
        _windowGeneration++;
        if (_windowRequest !== null) cancelAnimationFrame(_windowRequest);
        _windowRequest = null;
        _windowPending = false;
        saveAndForceCockpit();
      },
      onEnd: () => {
        _loopByXr = false;
        restoreSavedCam();
        chainWindowRaf();
      },
      onFrame: (time) => {
        if (_loopByXr && typeof _tickBody === "function") _tickBody(time);
      },
    });
    if (typeof XrSession.on === "function") XrSession.on((ev, d) => {
      if (!(ev === "reset" || ev === "end" || (ev === "visibility" && d && d.state !== "visible"))) return;
      if (ev !== "end" && ev !== "reset" && typeof Input !== "undefined" && Input.remoteLost) { try { Input.remoteLost("xr"); } catch (_) {  } }
      if (api && typeof api.pause === "function") { try { api.pause(ev === "reset" ? "xr-reset" : ev === "end" ? "xr-end" : "xr-hidden"); } catch (_) {  } }
    });
    _bound = true;
  }

  function bind(api) {
    _bindApi = api;
    _windowRaf = api && api.windowTick;
    if (typeof XrSession === "undefined") return;
    bindInner(api);
  }

  const PROBE_CAP_MS = 1500, LS_XR_CAPS = "apex26.xrCaps";
  function cachedVr() {
    let v = null;
    try { v = localStorage.getItem(LS_XR_CAPS); } catch (_) {  }
    return v === "1" || (v === "0" ? false : null);
  }
  function storeVrCaps(vr) { try { localStorage.setItem(LS_XR_CAPS, vr ? "1" : "0"); } catch (_) {  } }
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
          if (v !== null) storeVrCaps(!!v);
          return v === null ? null : !!v;
        } finally { if (timer !== null) clearTimeout(timer); }
      } catch (_) { return null; }
    })();
  }

  async function wantXrBundle() {
    try { if (localStorage.getItem("apex26.xr") === "1") return true; } catch (_) {  }
    try { if (localStorage.getItem(LS_XR_PENDING) === "1") return true; } catch (_) {  }
    if (typeof navigator === "undefined" || !navigator.xr) return false;
    if (cachedVr() !== null) return cachedVr();
    return (await probeVr()) !== false;
  }

  function recheck() {
    return probeVr().then((vr) => {
      if (vr) return ensureXr().then((ok) => { if (ok) finish(); return !!ok; });
      if (vr === false && typeof ApexXR !== "undefined") ApexXR.detect();
      return false;
    });
  }

  let finish = () => {};
  function mountUi() {
    restorePinnedBackend();
    if (typeof window !== "undefined") {
      window.__apexXr = {
        diag: () => diag(),
        setFoveation: (v) => setFoveation(v),
        canAttach: () => canAttach(),
        ensure: ensureXr,
      };
    }
    finish = () => {
      if (typeof ApexXR !== "undefined" && typeof ApexXR.detect === "function") {
        Promise.resolve(ApexXR.detect()).catch(() => {  });
      }
      const pendingEnter = consumePendingEnter();
      if (typeof XrUi !== "undefined") XrUi.mount(document.body, pendingEnter);
    };
    if (typeof XrUi !== "undefined") { finish(); return; }
    wantXrBundle().then((want) => (want ? ensureXr() : false)).then((ok) => { if (ok) finish(); }, () => {  });
  }

  const _cullVP = new Float32Array(16), _cullEyes = [];
  const _forward = [0, 0, 1], _up = [0, 1, 0];
  function applyEyes(frame, camEye, camTgt, camUp) {
    if (!comfort() || typeof XrSession === "undefined" || typeof XrRig === "undefined") return null;
    for (let i = 0; i < 3; i++) _forward[i] = camTgt[i] - camEye[i];
    XrSession.setAnchor(camEye, _forward, camUp || _up);
    const gfx = _boundGfx;
    const layer = gfx && typeof gfx.xrLayer === "function" ? gfx.xrLayer() : (gfx && gfx._xrLayer) || null;
    const eyes = XrSession.eyeFrames(layer);
    if (!eyes || !eyes.length) return null;
    const e0 = eyes[0];
    if (frame && e0) {
      let drawn = 0;
      for (let i = 0; i < eyes.length; i++) {
        const vp = eyes[i].viewport;
        if (!vp || (vp.width > 0 && vp.height > 0)) _cullEyes[drawn++] = eyes[i];
      }
      _cullEyes.length = drawn;
      if (drawn > 1 && XrRig.unionViewProjTo && XrRig.unionViewProjTo(_cullVP, _cullEyes)) frame.viewProj = _cullVP;
      else if (e0.viewProj) frame.viewProj = e0.viewProj;
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
      _presentCount++;
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
      presentCount: _presentCount,
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
    bind, mountUi, recheck, storeVrCaps, ensureXr, comfort, camComfort, loopByXr, isBound, canAttach,
    ensureXrBackend, restorePinnedBackend, applyEyes, present, afterTick, chainWindowRaf,
    diag, setFoveation, saveAndForceCockpit, restoreSavedCam,
    setCamMode: (...a) => setCamTransient(...a),
  };
})();
Object.freeze(XrBoot);
