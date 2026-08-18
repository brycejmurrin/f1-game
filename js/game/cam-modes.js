"use strict";
// CamModes — the PLAYER camera-mode switch UI: the CAM button (tap to cycle,
// hold/right-click for the picker grid) and the C-key cycle. Extracted from
// game.js. BROADCAST-ONLY: it changes which of the 13 CAM_MODES you look
// through and never touches physics or car state, so it is safe to own its
// own wiring. Created once with the G façade at boot; game.js keeps `camMode`
// and `camCutT` as its own closure state and this module mutates them through
// G (the render loop reads them directly).
window.CamModes = (function () {
  // Eval-time dependency on GameTables (HARD_EDGES pins tables.js before this).
  const { CAM_MODES } = GameTables;

  function create(G) {
    Log.info("game", "CamModes.create");
    const $ = G.$;

    function refreshCamBtn() {
      const b = $("btn-cam");
      if (b) b.textContent = CAM_MODES[G.camMode].label;
      // Cockpit view: the gear/speed/rpm live ON the wheel LCD — hide the
      // floating HUD duplicates (CSS keys off this class).
      document.body.classList.toggle("cockpit-cam", CAM_MODES[G.camMode].id === "cockpit");
    }
    function setCamMode(m) {
      const prev = G.camMode;
      G.camMode = ((m % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
      G.store.set("camMode", G.camMode);
      if (G.camMode !== prev) {
        G.camCutT = 0.35;   // brief eased glide into the new angle
        Log.info("game", "CamModes.setCamMode " + CAM_MODES[prev].id + " -> " + CAM_MODES[G.camMode].id);
      }
      refreshCamBtn();   // the CAM button label is the only mode indicator (no big announce)
      // The CAMERA TUNER edits whichever mode you are looking through, so a mode
      // change from anywhere (C key, CAM picker, __apex.camera) must re-point its
      // sliders. Reached through the global, not a create() const — this also
      // runs at boot, before any such const is initialised.
      CamTunerPanel.refresh();
      return CAM_MODES[G.camMode].id;
    }
    function cycleCam() { return setCamMode(G.camMode + 1); }

    // CAM button: quick tap cycles (muscle memory preserved); press-and-hold (or
    // right-click) opens a PICKER GRID of all modes — cycling one-by-one through
    // 13 cameras to reach the one you want was the worst switch in the game.
    const camPicker = (() => {
      let el = null;
      const build = () => {
        el = document.createElement("div");
        el.id = "campicker";
        // 13 modes in a 3-wide grid leaves REAR CAM alone on the last line; the
        // no-orphan rule (css/components.css) widens it across the row instead.
        el.className = "no-orphan-3";
        el.hidden = true;
        for (let i = 0; i < CAM_MODES.length; i++) {
          const b = document.createElement("button");
          b.textContent = CAM_MODES[i].label;
          b.dataset.idx = i;
          b.onclick = (e) => { e.stopPropagation(); setCamMode(+b.dataset.idx); hide(); };
          el.appendChild(b);
        }
        document.body.appendChild(el);
      };
      const sync = () => {
        for (const b of el.children) b.classList.toggle("active", +b.dataset.idx === G.camMode);
      };
      const show = () => { if (!el) build(); sync(); el.hidden = false; };
      const hide = () => { if (el) el.hidden = true; };
      const visible = () => !!el && !el.hidden;
      return { show, hide, visible };
    })();
    (() => {
      const b = $("btn-cam");
      if (!b) return;
      let holdT = 0, held = false;
      const HOLD_MS = 340;
      b.addEventListener("pointerdown", () => {
        held = false;
        holdT = setTimeout(() => { held = true; camPicker.show(); }, HOLD_MS);
      });
      b.addEventListener("pointerup", () => clearTimeout(holdT));
      b.addEventListener("pointerleave", () => clearTimeout(holdT));
      /* A CANCELLED TOUCH IS NOT A LONG PRESS. iOS cancels touches routinely — an
         edge swipe, a notification, its own gesture arbitration — and a touch
         pointer holds implicit capture, so `pointerleave` does not fire for one
         either: neither line above ran, the 340 ms timer went off, and the
         thirteen-mode camera picker opened mid-corner. `held` then stayed true and
         ate the NEXT genuine tap as the hold's trailing click, so the camera button
         appeared to do nothing at all until it was pressed twice. */
      const cancelHold = () => { clearTimeout(holdT); held = false; };
      b.addEventListener("pointercancel", cancelHold);
      b.addEventListener("lostpointercapture", cancelHold);
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); camPicker.show(); });
      // Cycle on CLICK (not pointerup): synthetic .click() from tests/assistive tech
      // works unchanged, and a real tap fires it after pointerup anyway. When the
      // hold already opened the picker, swallow that one trailing click.
      b.onclick = () => {
        if (held) { held = false; return; }
        if (camPicker.visible()) { camPicker.hide(); return; }
        cycleCam();
      };
      // Tap anywhere outside the grid closes it.
      document.addEventListener("pointerdown", (e) => {
        if (camPicker.visible() && e.target !== b && !e.target.closest("#campicker")) camPicker.hide();
      });
    })();
    refreshCamBtn();

    return { refreshCamBtn, setCamMode, cycleCam };
  }

  return { create };
})();
