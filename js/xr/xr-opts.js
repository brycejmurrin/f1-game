/* Apex 26 — XROpts: SETTINGS › DISPLAY rows for VR MODE + VR RENDERER.
 *
 * Keys (raw lane via GameStore.store / localStorage):
 *   apex26.xr         "0"|"1"            default "0"
 *   apex26.xrBackend  "webgl2"|"webgpu"  default "webgl2"
 *
 * Rows stay hidden unless immersive-vr is capable (ApexXR caps.vr). Changing
 * either shows "Reload to apply" and reloads outside a race — same pattern as
 * RendererPicker, without the in-race two-tap arm (VR arm is menu-only).
 * Never writes apex26.gfxBackend.
 */
"use strict";

const XROpts = (function () {
  const KEY_XR = "apex26.xr";
  const KEY_BACKEND = "apex26.xrBackend";
  const DEF_XR = "0";
  const DEF_BACKEND = "webgl2";

  let _xr = null;
  let _backend = null;
  let _host = null;
  let _reloadHint = null;

  function store() {
    return (typeof GameStore !== "undefined" && GameStore.store) ? GameStore.store : null;
  }

  function rawGet(key) {
    const s = store();
    if (s && typeof s.raw === "function") return s.raw(key);
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function rawSet(key, val) {
    const s = store();
    if (s && typeof s.rawSet === "function") return s.rawSet(key, val);
    try { localStorage.setItem(key, val); return true; } catch (_) { return false; }
  }

  function readXr() {
    const v = rawGet(KEY_XR);
    if (v == null || v === "") return DEF_XR;
    return (typeof XRPlan !== "undefined" ? XRPlan.normXr(v) : (v === "1" ? "1" : "0"));
  }

  function readBackend() {
    const v = rawGet(KEY_BACKEND);
    if (v == null || v === "") return DEF_BACKEND;
    return (typeof XRPlan !== "undefined" ? XRPlan.normBackend(v) : (v === "webgpu" ? "webgpu" : "webgl2"));
  }

  function xr() {
    if (_xr === null) _xr = readXr() === "1";
    return _xr;
  }

  function setXr(on) {
    _xr = !!on;
    rawSet(KEY_XR, _xr ? "1" : "0");
    if (typeof ApexXR !== "undefined" && ApexXR.invalidate) ApexXR.invalidate();
    return _xr;
  }

  function xrBackend() {
    if (_backend === null) _backend = readBackend();
    return _backend;
  }

  function setXrBackend(v) {
    _backend = (typeof XRPlan !== "undefined" ? XRPlan.normBackend(v) : (v === "webgpu" ? "webgpu" : "webgl2"));
    rawSet(KEY_BACKEND, _backend);
    if (typeof ApexXR !== "undefined" && ApexXR.invalidate) ApexXR.invalidate();
    return _backend;
  }

  function inRace() {
    try {
      return typeof document !== "undefined" && document.body && document.body.dataset.race === "1";
    } catch (_) { return false; }
  }

  function requestReload() {
    if (inRace()) {
      showHint("Finish the race, then reload to apply VR settings");
      return;
    }
    showHint("RELOADING…");
    try { location.reload(); } catch (_) { /* */ }
  }

  function showHint(msg) {
    if (!_reloadHint) return;
    _reloadHint.textContent = msg;
    _reloadHint.hidden = false;
  }

  function capsVr() {
    if (typeof ApexXR !== "undefined" && ApexXR.caps) {
      try { return !!ApexXR.caps().vr; } catch (_) { return false; }
    }
    try { return localStorage.getItem("apex26.xrCaps") === "1"; } catch (_) { return false; }
  }

  function setRowsVisible(on) {
    if (!_host) return;
    _host.hidden = !on;
  }

  function onCaps(caps) {
    setRowsVisible(!!(caps && caps.vr));
  }

  function initUI() {
    if (typeof document === "undefined") return;
    if (typeof SettingRow === "undefined") return;
    if (document.getElementById("pm-xr-mode")) return;

    const panel = document.getElementById("pm-panel-display");
    const hostParent = panel || (document.getElementById("pm-res") && document.getElementById("pm-res").parentNode);
    if (!hostParent) return;

    const wrap = document.createElement("div");
    wrap.id = "pm-xr-block";
    wrap.hidden = !capsVr();

    const head = document.createElement("h3");
    head.className = "pm-group-h";
    head.textContent = "VR";
    wrap.appendChild(head);

    const modeRow = SettingRow.build("pm-xr-mode", "VR MODE", [
      ["off", "OFF"],
      ["on", "ON"],
    ]);
    modeRow.row.title = "Arm VR mode. Reload after changing. On an immersive-vr headset the boot picks WebGL2 (GLX) or experimental WebGPU (TLX). Does not change your 2D RENDERER pick.";
    SettingRow.wire(modeRow.row, {
      read: () => (xr() ? "on" : "off"),
      write: (v) => {
        setXr(v === "on");
        requestReload();
      },
    });
    wrap.appendChild(modeRow.row);

    const backendRow = SettingRow.build("pm-xr-backend", "VR RENDERER", [
      ["webgl2", "WEBGL2 (RECOMMENDED)"],
      ["webgpu", "WEBGPU (EXPERIMENTAL)"],
    ]);
    backendRow.row.title = "WebGL2 is the shippable Quest path (GLX). WebGPU is experimental (TLX + three XRManager) and falls back to WebGL2 when navigator.gpu or XRGPUBinding is missing. Reload to apply.";
    SettingRow.wire(backendRow.row, {
      read: () => xrBackend(),
      write: (v) => {
        setXrBackend(v);
        requestReload();
      },
    });
    wrap.appendChild(backendRow.row);

    const hint = document.createElement("p");
    hint.id = "pm-xr-reload";
    hint.className = "tune-label";
    hint.hidden = true;
    hint.textContent = "Reload to apply";
    wrap.appendChild(hint);
    _reloadHint = hint;

    // Place after the RENDERER fold when present, else at end of display panel.
    const adv = document.getElementById("pm-display-adv");
    if (adv && adv.parentNode === hostParent) {
      hostParent.insertBefore(wrap, adv.nextSibling);
    } else {
      hostParent.appendChild(wrap);
    }
    _host = wrap;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return {
    KEY_XR, KEY_BACKEND, DEF_XR, DEF_BACKEND,
    xr, setXr, xrBackend, setXrBackend, initUI, onCaps, capsVr,
  };
})();
Object.freeze(XROpts);
