/* Apex 26 — WebXR immersive-vr session owner (Phase 0 spike).
 *
 * Owns capability detection, session start/end/visibility, the XR frame
 * loop (window.rAF is unreliable inside an immersive session), seated
 * reference-space recenter, and the per-eye view list the render path
 * consumes. Renderer binding (TLX three.xr / GLX XRWebGLLayer) is injected
 * so this module stays free of a THREE import — the canvas page is still
 * IIFE / no bundler.
 *
 * Default VR path is WebGL2 (forceWebGL / tlxForceGL). Experimental WebGPU
 * XR is opt-in via localStorage apex26.xrBackend=webgpu. Quest Browser can
 * expose `XRGPUBinding` even when WebGPU-in-XR is unsupported (three.js
 * #33497) — decide by requesting the `webgpu` session feature and reading
 * `session.enabledFeatures`, then fall back to WebGL2 when absent.
 */
"use strict";

const XrSession = (function () {
  const MODE = "immersive-vr";
  const LS_XR_BACKEND = "apex26.xrBackend";   // "webgpu" | unset/webgl2

  let _supported = false;
  let _probed = false;
  let _session = null;
  let _refSpace = null;
  let _baseRefSpace = null;
  let _xrFrame = null;
  let _xrTime = 0;
  let _xrFrameCount = 0;
  let _running = false;
  let _visible = true;
  let _backend = "webgl2";          // active session backend after feature negotiation
  let _wantWebgpu = false;
  let _enabledFeatures = [];
  let _bindings = null;             // { getRenderer, onFrame, onStart, onEnd, setCamCockpit, motionLock }
  let _inputLatch = { primary: false, secondary: false };
  let _anchor = { eye: [0, 1.2, 0], fwd: [0, 0, 1], up: [0, 1, 0] };
  let _eyeBags = null;              // reused per-eye compose outputs
  let _lastError = null;
  let _listeners = [];

  function emit(ev, detail) {
    for (let i = 0; i < _listeners.length; i++) {
      try { _listeners[i](ev, detail); } catch (_) { /* UI must not break session */ }
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

  /** True when session.enabledFeatures grants `name` (FrozenArray or Set). */
  function featureGranted(session, name) {
    const f = session && session.enabledFeatures;
    if (!f) return false;
    if (typeof f.has === "function") return !!f.has(name);
    if (typeof f.includes === "function") return f.includes(name);
    try {
      for (let i = 0; i < f.length; i++) if (f[i] === name) return true;
    } catch (_) { /* */ }
    return false;
  }

  function listEnabledFeatures(session) {
    const f = session && session.enabledFeatures;
    if (!f) return [];
    try { return Array.from(f); } catch (_) {
      const out = [];
      try { for (let i = 0; i < f.length; i++) out.push(f[i]); } catch (_) { /* */ }
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
    emit("capability", { supported: _supported });
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
  function getTime() { return _xrTime; }
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
    if (preferWebgpu) optional.push("webgpu");
    return {
      requiredFeatures: [],
      optionalFeatures: optional,
    };
  }

  async function start() {
    if (_session) return _session;
    if (!_probed) await probe();
    if (!_supported) {
      _lastError = new Error("immersive-vr not supported");
      emit("error", { error: _lastError });
      return null;
    }
    // Opt-in preference only — do NOT gate on typeof XRGPUBinding (Quest Browser
    // exposes the interface where WebGPU-in-XR is still unsupported; three.js PR
    // #33497). Request the feature, then trust session.enabledFeatures.
    _wantWebgpu = xrBackendPref() === "webgpu";
    let preferGpu = _wantWebgpu;
    let session = null;
    try {
      session = await navigator.xr.requestSession(MODE, sessionInit(preferGpu));
    } catch (e) {
      if (preferGpu) {
        try {
          Log.info("xr", "WebGPU XR session request failed; falling back to WebGL2", e && e.message);
        } catch (_) { /* Log optional in harness */ }
        try {
          session = await navigator.xr.requestSession(MODE, sessionInit(false));
          preferGpu = false;
        } catch (e2) {
          _lastError = e2;
          emit("error", { error: e2, phase: "requestSession-fallback" });
          return null;
        }
      } else {
        _lastError = e;
        emit("error", { error: e, phase: "requestSession" });
        return null;
      }
    }

    _enabledFeatures = listEnabledFeatures(session);
    const gotWebgpu = preferGpu && featureGranted(session, "webgpu") && webgpuXrAvailable();
    _backend = gotWebgpu ? "webgpu" : "webgl2";
    if (preferGpu && _backend !== "webgpu") {
      try {
        Log.info("xr", "webgpu feature not in enabledFeatures (or XRGPUBinding missing); WebGL2 XR path");
      } catch (_) { /* */ }
    }

    _session = session;
    _running = true;
    _xrFrameCount = 0;
    _visible = session.visibilityState !== "hidden";
    _inputLatch = { primary: false, secondary: false };

    session.addEventListener("end", onSessionEnd);
    session.addEventListener("visibilitychange", onVisibility);

    try {
      _baseRefSpace = await session.requestReferenceSpace("local-floor");
    } catch (_) {
      try { _baseRefSpace = await session.requestReferenceSpace("local"); }
      catch (e) {
        _lastError = e;
        try { session.end(); } catch (_) { /* */ }
        _session = null; _running = false;
        emit("error", { error: e, phase: "referenceSpace" });
        return null;
      }
    }
    _refSpace = _baseRefSpace;

    // Hand the session to the renderer (TLX three.xr.setSession, or GLX layer).
    const b = _bindings;
    if (b && typeof b.attachSession === "function") {
      try {
        await b.attachSession(session, { backend: _backend, preferWebgpu: preferGpu });
      } catch (e) {
        _lastError = e;
        try { session.end(); } catch (_) { /* */ }
        _session = null; _running = false;
        emit("error", { error: e, phase: "attachSession" });
        return null;
      }
    }
    if (b && typeof b.onStart === "function") {
      try { b.onStart({ backend: _backend }); } catch (_) { /* */ }
    }

    // XR frame loop — replaces reliance on window.rAF while presenting.
    const onXRFrame = (time, frame) => {
      if (!_session) return;
      _session.requestAnimationFrame(onXRFrame);
      _xrTime = time;
      _xrFrame = frame;
      _xrFrameCount++;
      pollInput(frame);
      if (b && typeof b.onFrame === "function") {
        try { b.onFrame(time, frame); } catch (e) {
          try { Log.warn("xr", "onFrame", e && e.message); } catch (_) { /* */ }
        }
      }
    };
    session.requestAnimationFrame(onXRFrame);
    emit("start", { backend: _backend, features: _enabledFeatures.slice() });
    try { Log.info("xr", "immersive-vr started backend=" + _backend); } catch (_) { /* */ }
    return session;
  }

  function pollInput(frame) {
    if (!_session || typeof XrInput === "undefined") return;
    const sources = _session.inputSources;
    const mapped = XrInput.mapFrame(sources, _inputLatch);
    _inputLatch = mapped.latch;
    if (mapped.recenter) recenter();
    const input = (typeof Input !== "undefined") ? Input : null;
    if (input) XrInput.inject(input, mapped);
  }

  function recenter() {
    if (!_session || !_baseRefSpace || !_xrFrame) return false;
    let pose = null;
    try { pose = _xrFrame.getViewerPose(_refSpace || _baseRefSpace); } catch (_) { return false; }
    if (!pose || !pose.transform || !pose.transform.matrix) return false;
    const off = XrRig.recenterOffsetFromPose(pose.transform.matrix);
    try {
      const t = new XRRigidTransform(off.position, off.orientation);
      _refSpace = _baseRefSpace.getOffsetReferenceSpace(t);
      emit("recenter", off);
      return true;
    } catch (e) {
      _lastError = e;
      return false;
    }
  }

  /**
   * Build per-eye frame bags from the current XRFrame + seated anchor.
   * Returns an array of { viewport?, view, proj, viewProj, invProj, invViewProj, eye }
   * or null when the pose is unavailable (keep last mono frame).
   */
  function eyeFrames(layer) {
    if (!_xrFrame || !_refSpace) return null;
    let pose = null;
    try { pose = _xrFrame.getViewerPose(_refSpace); } catch (_) { return null; }
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
    const out = [];
    for (let i = 0; i < pose.views.length; i++) {
      const v = pose.views[i];
      const bag = _eyeBags[i];
      // view matrix = inverse of the viewer's transform.matrix
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
      out.push(bag);
    }
    return out;
  }

  async function end() {
    if (!_session) return;
    const s = _session;
    try { await s.end(); } catch (_) { /* already ending */ }
    // onSessionEnd does the rest
  }

  function onSessionEnd() {
    const s = _session;
    if (s) {
      try { s.removeEventListener("end", onSessionEnd); } catch (_) { /* */ }
      try { s.removeEventListener("visibilitychange", onVisibility); } catch (_) { /* */ }
    }
    _session = null;
    _refSpace = null;
    _baseRefSpace = null;
    _xrFrame = null;
    _enabledFeatures = [];
    _running = false;
    if (typeof Input !== "undefined" && Input.remoteLost) {
      try { Input.remoteLost(); } catch (_) { /* */ }
    }
    const b = _bindings;
    if (b && typeof b.detachSession === "function") {
      try { b.detachSession(); } catch (_) { /* */ }
    }
    if (b && typeof b.onEnd === "function") {
      try { b.onEnd(); } catch (_) { /* */ }
    }
    emit("end", {});
    try { Log.info("xr", "immersive-vr ended"); } catch (_) { /* */ }
  }

  function onVisibility() {
    if (!_session) return;
    _visible = _session.visibilityState !== "hidden";
    emit("visibility", { visible: _visible, state: _session.visibilityState });
  }

  return {
    MODE, LS_XR_BACKEND,
    probe, isSupported, isProbed, isPresenting, isVisible,
    start, end, bind, on, recenter, setAnchor, getAnchor, eyeFrames,
    getFrame, getTime, getSession, getRefSpace, backend, lastError,
    frameCount, enabledFeatures, featureGranted, listEnabledFeatures,
    webgpuXrAvailable, xrBackendPref, sessionInit,
  };
})();
Object.freeze(XrSession);
