"use strict";
// CamModes — the PLAYER camera-mode switch UI: the CAM button (tap to cycle,
// hold/right-click for the picker grid) and the C-key cycle. Extracted from
// game.js. BROADCAST-ONLY: it changes which of the 13 CAM_MODES you look
// through and never touches physics or car state, so it is safe to own its
// own wiring. Created once with the G façade at boot; game.js keeps `camMode`
// and `camCutT` as its own closure state and this module mutates them through
// G (the render loop reads them directly).
//
// CAM_MODES is the player camera list — index IS `camMode` (persisted as
// apex26.camMode, so the order is a save-format contract; append, never
// reorder). js/game/cameras.js resolves each id to a rig; cam-tuner.js,
// apex.js, agentview.js and game.js read it through CamModes.CAM_MODES.
window.CamModes = (function () {
  const CAM_MODES = [
    { id: "chase",     label: "CHASE" },
    { id: "far",       label: "FAR" },
    { id: "drift",     label: "DRIFT" },
    { id: "cockpit",   label: "COCKPIT" },
    { id: "hood",      label: "HOOD" },
    { id: "overhead",  label: "OVERHEAD" },
    { id: "heli",      label: "HELI" },
    { id: "reverse",   label: "REVERSE" },
    { id: "side",      label: "TV SIDE" },
    { id: "cinematic", label: "CINEMATIC" },
    { id: "low",       label: "LOW" },
    { id: "tcam",      label: "T-CAM" },
    { id: "rear",      label: "REAR CAM" },
  ];

  function create(G) {
    Log.info("game", "CamModes.create");
    const $ = G.$;

    function refreshCamBtn() {
      const b = $("btn-cam");
      if (b) b.textContent = CAM_MODES[G.camMode].label;
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

    const camTrigger = $("btn-cam");
    const camPicker = (() => {
      let el = null;
      const build = () => {
        el = document.createElement("div");
        el.id = "campicker";
        el.setAttribute("role", "menu");
        el.setAttribute("aria-label", "Camera view");
        el.className = "balanced-row";
        el.hidden = true;
        for (let i = 0; i < CAM_MODES.length; i++) {
          const b = document.createElement("button");
          b.textContent = CAM_MODES[i].label;
          b.dataset.idx = i;
          b.setAttribute("role", "menuitemradio");
          b.tabIndex = -1;
          b.onclick = (e) => {
            e.stopPropagation(); setCamMode(+b.dataset.idx); hide(); camTrigger?.focus();
          };
          el.appendChild(b);
        }
        el.addEventListener("keydown", (e) => {
          const items = [...el.querySelectorAll('[role="menuitemradio"]')];
          const at = items.indexOf(document.activeElement);
          let next = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % items.length;
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = items.length - 1;
          else if (e.key === "Escape") {
            e.preventDefault(); e.stopPropagation(); hide(); camTrigger?.focus(); return;
          }
          else return;
          e.preventDefault(); e.stopPropagation(); items[next]?.focus();
        });
        document.body.appendChild(el);
      };
      const sync = () => {
        for (const b of el.children) {
          const on = +b.dataset.idx === G.camMode;
          b.classList.toggle("active", on);
          b.setAttribute("aria-checked", on ? "true" : "false");
        }
      };
      const show = () => {
        if (document.body.classList.contains("hud-hidden") ||
            document.body.classList.contains("lt-open")) return;
        if (!el) build();
        sync();
        el.hidden = false;
        camTrigger?.setAttribute("aria-expanded", "true");
        el.querySelector('[aria-checked="true"]')?.focus();
      };
      const hide = () => {
        if (el) el.hidden = true;
        camTrigger?.setAttribute("aria-expanded", "false");
      };
      const visible = () => !!el && !el.hidden;
      return { show, hide, visible };
    })();
    (() => {
      const b = camTrigger;
      if (!b) return;
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
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
      b.onclick = () => {
        if (held) { held = false; return; }
        if (camPicker.visible()) { camPicker.hide(); return; }
        cycleCam();
      };
      // Tap anywhere outside the grid closes it.
      document.addEventListener("pointerdown", (e) => {
        if (camPicker.visible() && e.target !== b && !e.target.closest("#campicker")) camPicker.hide();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) camPicker.hide();
      });
    })();
    refreshCamBtn();

    return { refreshCamBtn, setCamMode, cycleCam, hideCamPicker: camPicker.hide };
  }

  return { CAM_MODES, create };
})();
