/* Apex 26 — ENTER VR button (Phase 0).
 *
 * Shown only after navigator.xr.isSessionSupported('immersive-vr') resolves
 * true. A visible button always either starts VR, switches the renderer to the
 * XR-capable TLX+WebGL2 path (reload once), or shows a clear error — never a
 * silent no-op on GLX / WGX / default TLX-WebGPU.
 */
"use strict";

const XrUi = (function () {
  let _btn = null;
  let _mounted = false;
  let _unsub = null;
  let _msgTimer = 0;

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

  function flashMessage(msg) {
    ensureButton();
    _btn.textContent = msg;
    _btn.disabled = true;
    if (_msgTimer) clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => {
      _msgTimer = 0;
      _btn.disabled = false;
      syncLabel();
    }, 3500);
  }

  async function onClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof XrSession === "undefined") return;
    if (_btn && _btn.disabled) return;
    if (XrSession.isPresenting()) {
      await XrSession.end();
      return;
    }
    // Armed VR plan (task 20): if the bound renderer ≠ the plan, ask for a
    // reload instead of writing apex26.gfxBackend (ensureXrBackend must not
    // clobber the 2D pick while XR is armed).
    if (typeof ApexXR !== "undefined" && ApexXR.plan) {
      const plan = ApexXR.plan();
      if (plan.xrMode === "armed") {
        const label = (plan.path || "webgl2").toUpperCase();
        if (typeof ApexXR.rendererMatchesPlan === "function" && !ApexXR.rendererMatchesPlan()) {
          flashMessage("Reload to enter VR with " + label);
          return;
        }
        if (typeof XrBoot !== "undefined" && !XrBoot.canAttach()) {
          flashMessage("Reload to enter VR with " + label);
          return;
        }
      } else if (typeof XrBoot !== "undefined") {
        // Spontaneous ENTER VR with VR mode off — legacy Phase 0 TLX pin.
        const gate = XrBoot.ensureXrBackend();
        if (gate.reloading) {
          flashMessage("SWITCHING…");
          return;
        }
        if (!gate.ok) {
          flashMessage(gate.message || "VR UNAVAILABLE");
          return;
        }
      }
    } else if (typeof XrBoot !== "undefined") {
      // Cockpit is forced ephemerally in XrBoot.onStart (does not persist camMode).
      const gate = XrBoot.ensureXrBackend();
      if (gate.reloading) {
        flashMessage("SWITCHING…");
        return;
      }
      if (!gate.ok) {
        flashMessage(gate.message || "VR UNAVAILABLE");
        return;
      }
    }
    try {
      const s = await XrSession.start();
      if (!s) {
        const err = XrSession.lastError && XrSession.lastError();
        flashMessage((err && (err.message || String(err))) || "VR FAILED");
      }
    } catch (err) {
      flashMessage((err && err.message) || "VR FAILED");
    }
  }

  function syncLabel() {
    if (!_btn || _btn.disabled) return;
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
      // Visible ⇒ immersive-vr is supported; click path always acts (attach,
      // backend switch+reload, or flashMessage) — never a silent no-op.
      Promise.resolve(XrSession.probe()).then((ok) => show(!!ok));
    }
    return _btn;
  }

  function unmount() {
    if (_unsub) { try { _unsub(); } catch (_) { /* */ } _unsub = null; }
    if (_msgTimer) { clearTimeout(_msgTimer); _msgTimer = 0; }
    if (_btn && _btn.parentNode) _btn.parentNode.removeChild(_btn);
    _mounted = false;
  }

  return { mount, unmount, show, syncLabel, ensureButton, onClick, flashMessage };
})();
Object.freeze(XrUi);
