"use strict";

const XrSession = (function () {
  const MODE = "immersive-vr";
  const LS_XR_BACKEND = "apex26.xrBackend";
  const ATTACH_WEBGPU = false;

  let _supported = false;
  let _probed = false;
  let _session = null;
  let _startPromise = null;
  let _generation = 0;
  let _xrRequest = null;
  let _centered = false;
  let _recenterPending = false;
  let _refSpace = null;
  let _baseRefSpace = null;
  let _xrFrame = null;
  let _xrFrameCount = 0;
  let _running = false;
  let _visible = true;
  let _backend = "webgl2";
  let _wantWebgpu = false;
  let _enabledFeatures = [];
  let _bindings = null;
  let _inputLatch = { primary: false, secondary: false };
  let _anchor = { eye: [0, 1.2, 0], fwd: [0, 0, 1], up: [0, 1, 0] };
  const _eyeFrames = [];
  let _resetPending = false;
  let _eyeBags = null;
  let _lastError = null;
  let _listeners = [];

  function emit(ev, detail) {
    for (let i = 0; i < _listeners.length; i++) {
      try { _listeners[i](ev, detail); } catch (_) {  }
    }
  }

  function on(fn) {
    if (typeof fn === "function") _listeners.push(fn);
    return () => { _listeners = _listeners.filter((f) => f !== fn); };
  }

  function xrBackendPref() {
    try {
      return (localStorage.getItem(LS_XR_BACKEND) || "webgl2").toLowerCase();
    } catch (_) { return "webgl2"; }
  }

  function webgpuXrAvailable() {
    return typeof globalThis.XRGPUBinding !== "undefined";
  }

  function featureGranted(session, name) {
    const f = session && session.enabledFeatures;
    if (!f) return false;
    if (typeof f.has === "function") return !!f.has(name);
    if (typeof f.includes === "function") return f.includes(name);
    try {
      for (let i = 0; i < f.length; i++) if (f[i] === name) return true;
    } catch (_) {  }
    return false;
  }

  function listEnabledFeatures(session) {
    const f = session && session.enabledFeatures;
    if (!f) return [];
    try { return Array.from(f); } catch (_) {
      const out = [];
      try { for (let i = 0; i < f.length; i++) out.push(f[i]); } catch (_) {  }
      return out;
    }
  }

  async function probe() {
    _probed = true;
    _supported = false;
    if (typeof navigator === "undefined" || !navigator.xr || !navigator.xr.isSessionSupported) {
      emit("capability", { supported: false, reason: "no-navigator-xr" });
      return false;
    }
    try {
      _supported = !!(await navigator.xr.isSessionSupported(MODE));
    } catch (e) {
      _lastError = e;
      _supported = false;
      emit("capability", { supported: false, reason: "isSessionSupported-threw", error: String(e && e.message || e) });
      return false;
    }
    if (typeof XrBoot !== "undefined" && XrBoot.storeVrCaps) XrBoot.storeVrCaps(_supported);
    emit("capability", { supported: _supported });
    return _supported;
  }

  function seed(supported) {
    _probed = true;
    _supported = !!supported;
    emit("capability", { supported: _supported, cached: true });
    return _supported;
  }

  function isSupported() { return _supported; }
  function isProbed() { return _probed; }
  function isPresenting() { return !!_session && _running; }
  function isVisible() { return _visible; }
  function lastError() { return _lastError; }
  function backend() { return _backend; }
  function enabledFeatures() { return _enabledFeatures.slice(); }
  function frameCount() { return _xrFrameCount; }
  function getFrame() { return _xrFrame; }
  function getSession() { return _session; }
  function getRefSpace() { return _refSpace; }

  function bind(api) {
    _bindings = api || null;
  }

  function setAnchor(eye, fwd, up) {
    if (eye) { _anchor.eye[0] = eye[0]; _anchor.eye[1] = eye[1]; _anchor.eye[2] = eye[2]; }
    if (fwd) { _anchor.fwd[0] = fwd[0]; _anchor.fwd[1] = fwd[1]; _anchor.fwd[2] = fwd[2]; }
    if (up) { _anchor.up[0] = up[0]; _anchor.up[1] = up[1]; _anchor.up[2] = up[2]; }
  }

  function getAnchor() { return _anchor; }

  function sessionInit(preferWebgpu) {
    const optional = ["local-floor", "bounded-floor", "layers"];
    const overlay = typeof document !== "undefined" && document.body;
    if (overlay) optional.push("dom-overlay");
    if (preferWebgpu && ATTACH_WEBGPU) optional.push("webgpu");
    return {
      ...(overlay ? { domOverlay: { root: overlay } } : {}),
      requiredFeatures: [],
      optionalFeatures: optional,
    };
  }

  function latchWebgl2(reason) {
    if (typeof ApexXR !== "undefined" && ApexXR.noteFallback) {
      try { ApexXR.noteFallback("webgpu", "webgl2", reason); } catch (_) {  }
    } else {
      try { sessionStorage.setItem("apex26.xrFallback", "webgl2"); } catch (_) {  }
    }
  }

  function start() {
    if (_startPromise) return _startPromise;
    if (_session) return Promise.resolve(_session);
    const generation = ++_generation;
    const pending = startSession(generation).finally(() => {
      if (_startPromise === pending) _startPromise = null;
    });
    _startPromise = pending;
    return pending;
  }

  async function startSession(generation) {
    if (!_probed) await probe();
    if (generation !== _generation) return null;
    if (!_supported) {
      _lastError = new Error("immersive-vr not supported");
      emit("error", { error: _lastError });
      return null;
    }
    if (!_bindings || typeof _bindings.attachSession !== "function") {
      _lastError = new Error("XR not bound to a renderer (XrBoot.bind pending)");
      emit("error", { error: _lastError, phase: "bind" });
      return null;
    }
    _wantWebgpu = xrBackendPref() === "webgpu";
    let preferGpu = _wantWebgpu && ATTACH_WEBGPU;
    try {
      if (preferGpu && sessionStorage.getItem("apex26.xrFallback") === "webgl2") preferGpu = false;
    } catch (_) {  }
    let session = null;
    try {
      session = await navigator.xr.requestSession(MODE, sessionInit(preferGpu));
    } catch (e) {
      if (generation !== _generation) return null;
      if (preferGpu) {
        try {
          Log.info("xr", "WebGPU XR session request failed; latch WebGL2 for next enter", e && e.message);
        } catch (_) {  }
        latchWebgl2("requestSession rejected");
        _lastError = e;
        emit("error", { error: e, phase: "requestSession-webgpu", retry: "next-gesture-webgl2" });
        return null;
      }
      _lastError = e;
      emit("error", { error: e, phase: "requestSession" });
      return null;
    }

    if (generation !== _generation) {
      try { await session.end(); } catch (_) {  }
      return null;
    }
    _lastError = null;
    _enabledFeatures = listEnabledFeatures(session);
    const gotWebgpu = preferGpu && featureGranted(session, "webgpu") && webgpuXrAvailable();
    _backend = gotWebgpu ? "webgpu" : "webgl2";
    if (preferGpu && _backend !== "webgpu") {
      try {
        Log.info("xr", "webgpu feature not in enabledFeatures (or XRGPUBinding missing); WebGL2 XR path");
      } catch (_) {  }
    }

    _session = session;
    _running = false;
    _centered = false;
    _recenterPending = false;
    _xrFrameCount = 0;
    _visible = session.visibilityState !== "hidden";
    _inputLatch = { primary: false, secondary: false };

    session.addEventListener("end", onSessionEnd);
    session.addEventListener("visibilitychange", onVisibility);

    try {
      const base = await session.requestReferenceSpace("local-floor");
      if (_session !== session || generation !== _generation) return null;
      _baseRefSpace = base;
    } catch (_) {
      if (_session !== session || generation !== _generation) return null;
      try {
        const base = await session.requestReferenceSpace("local");
        if (_session !== session || generation !== _generation) return null;
        _baseRefSpace = base;
      }
      catch (e) {
        if (_session !== session || generation !== _generation) return null;
        _lastError = e;
        await end();
        emit("error", { error: e, phase: "referenceSpace" });
        return null;
      }
    }
    _refSpace = _baseRefSpace;
    _resetPending = false;
    if (_baseRefSpace.addEventListener) _baseRefSpace.addEventListener("reset", onReferenceReset);

    const b = _bindings;
    if (b && typeof b.attachSession === "function") {
      try {
        await b.attachSession(session, { backend: _backend, preferWebgpu: preferGpu });
        if (_session !== session || generation !== _generation) {
          if (!_session && typeof b.detachSession === "function") b.detachSession();
          return null;
        }
      } catch (e) {
        if (_session !== session || generation !== _generation) return null;
        _lastError = e;
        if (_wantWebgpu) latchWebgl2("attachSession failed");
        await end();
        emit("error", { error: e, phase: "attachSession" });
        return null;
      }
    }
    if (_session !== session || generation !== _generation) return null;
    _running = true;
    if (b && typeof b.onStart === "function") {
      try { b.onStart({ backend: _backend }); } catch (_) {  }
    }

    const onXRFrame = (time, frame) => {
      if (_session !== session || generation !== _generation || !_running) return;
      _xrRequest = null;
      _xrFrame = frame;
      _xrFrameCount++;
      if ((!_centered && !_resetPending) || _recenterPending) recenter(frame);
      try { pollInput(frame); } catch (e) {
        if (typeof Input !== "undefined" && Input.remoteLost) {
          try { Input.remoteLost("xr"); } catch (_) {  }
        }
        try { Log.warn("xr", "pollInput", e && e.message); } catch (_) {  }
      }
      if (_session === session && _running && b && typeof b.onFrame === "function") {
        try { b.onFrame(time, frame); } catch (e) {
          try { Log.warn("xr", "onFrame", e && e.message); } catch (_) {  }
        }
      }
      _xrFrame = null;
      scheduleFrame();
    };
    const scheduleFrame = () => {
      if (_session !== session || generation !== _generation || !_running) return false;
      try { _xrRequest = session.requestAnimationFrame(onXRFrame); return true; }
      catch (e) {
        _lastError = e;
        void end();
        emit("error", { error: e, phase: "requestAnimationFrame" });
        return false;
      }
    };
    if (!scheduleFrame()) return null;
    emit("start", { backend: _backend, features: _enabledFeatures.slice() });
    try { Log.info("xr", "immersive-vr started backend=" + _backend); } catch (_) {  }
    return session;
  }

  function pollInput(frame) {
    if (!_session || typeof XrInput === "undefined") return;
    const sources = _session.inputSources;
    const menuOpen = typeof UiLayers !== "undefined" && UiLayers.navOpen && UiLayers.navOpen();
    const mapped = XrInput.mapFrame(sources, _inputLatch, {
      driving: typeof XROpts === "undefined" || !XROpts.xrInput || XROpts.xrInput() !== "existing",
      menuOpen: !!menuOpen, overlay: !!_session.domOverlayState && !_resetPending,
    });
    _inputLatch = mapped.latch;
    if (mapped.recenter) recenter();
    const input = (typeof Input !== "undefined") ? Input : null;
    if (_resetPending || _session.visibilityState !== "visible") mapped.driving = false;
    if (input) XrInput.inject(input, mapped);
  }

  function recenter(frameOpt) {
    if (!_session || !_baseRefSpace) return false;
    const xrFrame = frameOpt || _xrFrame;
    if (!xrFrame) {
      _recenterPending = true;
      return true;
    }
    let pose = null;
    try { pose = xrFrame.getViewerPose(_baseRefSpace); } catch (_) {
      _recenterPending = true;
      return true;
    }
    if (!pose || !pose.transform || !pose.transform.matrix) {
      _recenterPending = true;
      return true;
    }
    const off = XrRig.recenterOffsetFromPose(pose.transform.matrix);
    try {
      const t = new XRRigidTransform(off.position, off.orientation);
      _refSpace = _baseRefSpace.getOffsetReferenceSpace(t);
      _centered = true;
      _recenterPending = false;
      _resetPending = false;
      emit("recenter", off);
      return true;
    } catch (e) {
      _lastError = e;
      _recenterPending = true;
      return true;
    }
  }

  function eyeFrames(layer, frameOpt) {
    const xrFrame = frameOpt || _xrFrame;
    if (!xrFrame || !_refSpace || _resetPending) return null;
    if (!_centered && !recenter(xrFrame)) return null;
    let pose = null;
    try { pose = xrFrame.getViewerPose(_refSpace); } catch (_) { return null; }
    if (!pose || !pose.views || !pose.views.length) return null;
    if (!_eyeBags || _eyeBags.length < pose.views.length) {
      _eyeBags = [];
      for (let i = 0; i < pose.views.length; i++) {
        _eyeBags.push({
          view: M4.ident(), proj: M4.ident(), viewProj: M4.ident(),
          invProj: M4.ident(), invViewProj: M4.ident(), eye: [0, 0, 0],
          viewport: null,
        });
      }
    }
    const out = _eyeFrames;
    out.length = pose.views.length;
    for (let i = 0; i < pose.views.length; i++) {
      const v = pose.views[i];
      const bag = _eyeBags[i];
      const poseMat = v.transform && v.transform.matrix;
      let viewMat = null;
      if (poseMat) {
        viewMat = bag._viewScratch || (bag._viewScratch = M4.ident());
        XrRig.invertRigidTo(viewMat, poseMat);
      }
      XrRig.composeEye(_anchor, viewMat, v.projectionMatrix, bag);
      if (layer && typeof layer.getViewport === "function") {
        try { bag.viewport = layer.getViewport(v); } catch (_) { bag.viewport = null; }
      } else {
        bag.viewport = null;
      }
      out[i] = bag;
    }
    return out;
  }

  async function end() {
    ++_generation;
    _startPromise = null;
    const s = _session;
    if (!s) return;
    onSessionEnd({ target: s });
    try { await s.end(); } catch (_) {  }
  }

  function onSessionEnd(event) {
    const s = _session;
    if (!s || (event && event.target && event.target !== s)) return;
    ++_generation;
    _startPromise = null;
    if (_xrRequest !== null) {
      try { s.cancelAnimationFrame(_xrRequest); } catch (_) {  }
      _xrRequest = null;
    }
    if (s) {
      try { s.removeEventListener("end", onSessionEnd); } catch (_) {  }
      try { s.removeEventListener("visibilitychange", onVisibility); } catch (_) {  }
    }
    if (_baseRefSpace && _baseRefSpace.removeEventListener) {
      try { _baseRefSpace.removeEventListener("reset", onReferenceReset); } catch (_) {  }
    }
    _resetPending = false;
    _eyeFrames.length = 0;
    _session = null;
    _refSpace = null;
    _baseRefSpace = null;
    _xrFrame = null;
    _centered = false;
    _recenterPending = false;
    _enabledFeatures = [];
    _running = false;
    _visible = true;
    if (typeof Input !== "undefined" && Input.remoteLost) {
      try { Input.remoteLost("xr"); } catch (_) {  }
    }
    const b = _bindings;
    if (b && typeof b.detachSession === "function") {
      try { b.detachSession(); } catch (_) {  }
    }
    if (b && typeof b.onEnd === "function") {
      try { b.onEnd(); } catch (_) {  }
    }
    emit("end", {});
    try { Log.info("xr", "immersive-vr ended"); } catch (_) {  }
  }

  function onReferenceReset(event) {
    if (!_session || (event && event.target && event.target !== _baseRefSpace)) return;
    _resetPending = true;
    _recenterPending = false;
    if (typeof Input !== "undefined" && Input.remoteLost) { try { Input.remoteLost("xr"); } catch (_) {  } }
    emit("reset", { recenterRequired: true });
  }

  function onVisibility() {
    if (!_session) return;
    _visible = _session.visibilityState !== "hidden";
    emit("visibility", { visible: _visible, state: _session.visibilityState });
  }

  return {
    probe, seed, isSupported, isProbed, isPresenting, isVisible,
    start, end, bind, on, recenter, setAnchor, getAnchor, eyeFrames,
    getFrame, getSession, getRefSpace, backend, lastError,
    frameCount, enabledFeatures, featureGranted, sessionInit,
  };
})();
Object.freeze(XrSession);
