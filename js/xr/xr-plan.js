/* Apex 26 — XRPlan: pure boot-time VR renderer path selection.
 *
 * Decides { path, backendPref, … } from capability + preference bags only —
 * no DOM / navigator reads. WebGL2 (GLX) is the default shippable VR path;
 * WebGPU (TLX + three XRManager) is experimental and opt-in. The override
 * never writes apex26.gfxBackend — disarming restores the 2D pick exactly.
 *
 * Spec: task 20 / master plan D1. Consumed by ApexXR (js/xr/apex-xr.js) and
 * the thin backendPreference() hook in js/game.js.
 */
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
      forceGL: false,
      reasons: [],
      fallbacks: [],
    }, extra || {});
  }

  /**
   * @param {{ caps?: object, prefs?: object, boot?: object }} input
   * caps: { xr, vr, gpu, xrgpu, layers?, mobileQuest? }
   * prefs: { xr: "0"|"1", xrBackend: "webgl2"|"webgpu", gfxBackend? }
   * boot: { strikeLatch?, claimFail?, xrFallback? } — xrFallback forces webgl2
   */
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

    // Armed + VR capable from here.
    if (latch) {
      reasons.push("session latch apex26.xrFallback=webgl2");
      fallbacks.push({ from: "webgpu", to: "webgl2", reason: "xrFallback latch" });
      return {
        xrMode: "armed",
        path: PATH_WEBGL2,
        backendPref: "webgl2",
        forceGL: false,
        reasons,
        fallbacks,
      };
    }

    if (wantBackend === "webgpu") {
      if (!hasGpu) {
        reasons.push("navigator.gpu missing");
        fallbacks.push({ from: "webgpu", to: "webgl2", reason: "no navigator.gpu" });
        return {
          xrMode: "armed",
          path: PATH_WEBGL2,
          backendPref: "webgl2",
          forceGL: false,
          reasons,
          fallbacks,
        };
      }
      if (!hasXrgpu) {
        reasons.push("XRGPUBinding missing");
        fallbacks.push({ from: "webgpu", to: "webgl2", reason: "no XRGPUBinding" });
        return {
          xrMode: "armed",
          path: PATH_WEBGL2,
          backendPref: "webgl2",
          forceGL: false,
          reasons,
          fallbacks,
        };
      }
      reasons.push("WebGPU XR experimental path selected");
      if (caps.mobileQuest) reasons.push("Quest UA — WebGPU-in-XR unverified on device");
      return {
        xrMode: "armed",
        path: PATH_WEBGPU,
        backendPref: "three",
        forceGL: false,
        reasons,
        fallbacks,
      };
    }

    reasons.push("WebGL2 VR path (default)");
    return {
      xrMode: "armed",
      path: PATH_WEBGL2,
      backendPref: "webgl2",
      forceGL: false,
      reasons,
      fallbacks,
    };
  }

  return { resolve, normXr, normBackend, PATH_WEBGL2, PATH_WEBGPU };
})();
Object.freeze(XRPlan);
