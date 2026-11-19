"use strict";

const XrUi = (function () {
  let _btn = null;
  let _mounted = false;
  let _unsub = null;
  let _msgTimer = 0;
  let _enterPrompt = false;

  function ensureButton() {
    if (_btn) return _btn;
    const b = document.createElement("button");
    b.id = "xr-enter";
    b.type = "button";
    b.title = "VR: A/X recenter, B/Y pause. Supported overlay menus: stick navigate, A/X select, B/Y back.";
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
    if (typeof XrBoot !== "undefined") {
      const gate = XrBoot.ensureXrBackend();
      if (gate.reloading) { flashMessage("SWITCHING…"); return; }
      if (!gate.ok) { flashMessage(gate.message || "VR UNAVAILABLE"); return; }
    }
    _enterPrompt = false;
    syncLabel();
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
    _btn.textContent = on ? "EXIT VR" : _enterPrompt ? "TAP TO ENTER VR" : "ENTER VR";
    _btn.setAttribute("aria-label", on ? "Exit VR" : _enterPrompt ? "Tap to enter VR" : "Enter VR");
    _btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function handheld() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const ua = (nav && nav.userAgent) || "";
    if (/OculusBrowser|Quest|Pico|Wolvic|VR\b/i.test(ua)) return false;
    if (nav && nav.userAgentData && nav.userAgentData.mobile === true) return true;
    return /Android|Mobi|iPhone|iPad/i.test(ua);
  }
  function vrModeOn() {
    if (typeof XROpts !== "undefined" && typeof XROpts.xr === "function") {
      try { return !!XROpts.xr(); } catch (_) {  }
    }
    try { return localStorage.getItem("apex26.xr") === "1"; } catch (_) { return false; }
  }
  function allowed(supported) {
    if (!supported) return false;
    if (typeof XrSession !== "undefined" && XrSession.isPresenting && XrSession.isPresenting()) return true;
    return !handheld() || vrModeOn();
  }

  function show(on) {
    ensureButton();
    on = allowed(!!on);
    _btn.hidden = !on;
    if (on) syncLabel();
  }

  function mount(parent, pendingEnter) {
    if (pendingEnter) _enterPrompt = true;
    if (_mounted) { syncLabel(); return _btn; }
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
      if (typeof XrSession.isProbed === "function" && XrSession.isProbed()) show(!!XrSession.isSupported());
      else Promise.resolve(XrSession.probe()).then((ok) => show(!!ok));
    }
    return _btn;
  }

  function unmount() {
    if (_unsub) { try { _unsub(); } catch (_) {  } _unsub = null; }
    if (_msgTimer) { clearTimeout(_msgTimer); _msgTimer = 0; }
    if (_btn && _btn.parentNode) _btn.parentNode.removeChild(_btn);
    _mounted = false;
    _enterPrompt = false;
  }

  return { mount, unmount, show, syncLabel, ensureButton, onClick, flashMessage, allowed };
})();
Object.freeze(XrUi);
