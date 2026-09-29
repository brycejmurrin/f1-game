/* Apex 26 — ENTER VR button (Phase 0).
 *
 * Shown only after navigator.xr.isSessionSupported('immersive-vr') resolves
 * true. Styled to match the HUD chrome; clicks call XrSession.start/end.
 * The vendored three.js XRButton/VRButton addons remain available for the
 * three.xr path — this UI is the Apex-owned affordance so we can gate on
 * race state and hide when unsupported without importing ESM into the IIFE
 * shell.
 */
"use strict";

const XrUi = (function () {
  let _btn = null;
  let _mounted = false;
  let _unsub = null;

  function ensureButton() {
    if (_btn) return _btn;
    const b = document.createElement("button");
    b.id = "xr-enter";
    b.type = "button";
    b.hidden = true;
    b.setAttribute("aria-label", "Enter VR");
    b.setAttribute("aria-pressed", "false");
    b.textContent = "ENTER VR";
    b.addEventListener("click", onClick);
    _btn = b;
    return b;
  }

  async function onClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof XrSession === "undefined") return;
    if (XrSession.isPresenting()) {
      await XrSession.end();
      return;
    }
    // Prefer cockpit before the session starts so the seated origin is right.
    try {
      const modes = (typeof CamModes !== "undefined" && CamModes.CAM_MODES) || null;
      const setCam = (typeof XrBoot !== "undefined" && XrBoot._setCamMode) || null;
      if (modes && typeof setCam === "function") {
        const i = modes.findIndex((c) => c.id === "cockpit");
        if (i >= 0) setCam(i);
      }
    } catch (_) { /* cam switch best-effort */ }
    await XrSession.start();
  }

  function syncLabel() {
    if (!_btn) return;
    const on = typeof XrSession !== "undefined" && XrSession.isPresenting();
    _btn.textContent = on ? "EXIT VR" : "ENTER VR";
    _btn.setAttribute("aria-label", on ? "Exit VR" : "Enter VR");
    _btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function show(on) {
    ensureButton();
    _btn.hidden = !on;
    if (on) syncLabel();
  }

  function mount(parent) {
    if (_mounted) return _btn;
    const host = parent || document.body;
    ensureButton();
    host.appendChild(_btn);
    _mounted = true;
    if (typeof XrSession !== "undefined") {
      _unsub = XrSession.on((ev) => {
        if (ev === "capability") {
          show(!!XrSession.isSupported());
        } else if (ev === "start" || ev === "end") {
          syncLabel();
          show(!!XrSession.isSupported());
        }
      });
      // Kick the probe; button stays hidden until capability fires true.
      Promise.resolve(XrSession.probe()).then((ok) => show(!!ok));
    }
    return _btn;
  }

  function unmount() {
    if (_unsub) { try { _unsub(); } catch (_) { /* */ } _unsub = null; }
    if (_btn && _btn.parentNode) _btn.parentNode.removeChild(_btn);
    _mounted = false;
  }

  return { mount, unmount, show, syncLabel, ensureButton, onClick };
})();
