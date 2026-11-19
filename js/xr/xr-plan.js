"use strict";

const XRPlan = (function () {

  const PATH_WEBGL2 = "webgl2";
  const PATH_WEBGPU = "webgpu";

  function asBool(v) { return !!v; }

  function normXr(v) {
    if (v === "1" || v === 1 || v === true || v === "on" || v === "true") return "1";
    return "0";
  }

  function normBackend(v) {
    const s = (v == null ? "" : String(v)).toLowerCase();
    if (s === "webgpu") return "webgpu";
    return "webgl2";
  }

  function emptyResult(extra) {
    return Object.assign({
      xrMode: "off",
      path: null,
      backendPref: null,
      reasons: [],
      fallbacks: [],
    }, extra || {});
  }

  function webgl2Armed(reasons, fallbacks) {
    return {
      xrMode: "armed",
      path: PATH_WEBGL2,
      backendPref: "three",
      reasons,
      fallbacks,
    };
  }

  function resolve(input) {
    const caps = (input && input.caps) || {};
    const prefs = (input && input.prefs) || {};
    const boot = (input && input.boot) || {};
    const reasons = [];
    const fallbacks = [];

    const xrPref = normXr(prefs.xr);
    const wantBackend = normBackend(prefs.xrBackend);
    const hasXr = asBool(caps.xr);
    const hasVr = asBool(caps.vr);
    const hasGpu = asBool(caps.gpu);
    const hasXrgpu = asBool(caps.xrgpu);
    const latch = boot.xrFallback != null && String(boot.xrFallback).toLowerCase() === "webgl2";

    if (xrPref !== "1") {
      reasons.push("VR mode off (apex26.xr≠1)");
      return emptyResult({ reasons });
    }
    if (!hasXr) {
      reasons.push("navigator.xr missing");
      return emptyResult({ reasons: reasons.concat(["cannot arm without WebXR"]) });
    }
    if (!hasVr) {
      reasons.push("immersive-vr not supported");
      return emptyResult({ reasons });
    }

    if (latch) {
      reasons.push("session latch apex26.xrFallback=webgl2");
      fallbacks.push({ from: "webgpu", to: "webgl2", reason: "xrFallback latch" });
      return webgl2Armed(reasons, fallbacks);
    }

    if (wantBackend === "webgpu") {
      if (!hasGpu) {
        reasons.push("navigator.gpu missing");
        fallbacks.push({ from: "webgpu", to: "webgl2", reason: "no navigator.gpu" });
        return webgl2Armed(reasons, fallbacks);
      }
      if (!hasXrgpu) {
        reasons.push("XRGPUBinding missing");
        fallbacks.push({ from: "webgpu", to: "webgl2", reason: "no XRGPUBinding" });
        return webgl2Armed(reasons, fallbacks);
      }
      reasons.push("WebGPU XR experimental path selected");
      if (caps.mobileQuest) reasons.push("Quest UA — WebGPU-in-XR unverified on device");
      return {
        xrMode: "armed",
        path: PATH_WEBGPU,
        backendPref: "three",
        reasons,
        fallbacks,
      };
    }

    reasons.push("TLX+forceGL VR path (default shippable)");
    return webgl2Armed(reasons, fallbacks);
  }

  return { resolve, normXr, normBackend };
})();
Object.freeze(XRPlan);
