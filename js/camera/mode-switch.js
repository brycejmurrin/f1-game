/* CamModes — the PLAYER camera-mode switch UI: the CAM button (tap to cycle, hold/right-click for the picker grid) and the C-key cycle. BROADCAST-ONLY: it changes which CAM_MODES rig you look through and never touches car state; game.js owns `camMode` / `camCutT` and this module writes them through G. */
"use strict";
// CAM_MODES index IS `camMode` (persisted as apex26.camMode), so the order is a
// save-format contract: append, never reorder. js/camera/vantage.js resolves
// each id to a rig; cam-tuner, apex.js, agentview.js and game.js read the list
// through CamModes.CAM_MODES.
window.CamModes = (function () {
  const CAM_MODES = [
    { id: "chase",     label: "CHASE",     cut: 0.35 },
    { id: "far",       label: "FAR",       cut: 0.35 },
    { id: "drift",     label: "DRIFT",     cut: 0.35 },
    { id: "cockpit",   label: "COCKPIT",   cut: 0 },
    { id: "hood",      label: "HOOD",      cut: 0 },
    { id: "overhead",  label: "OVERHEAD",  cut: 0.5 },
    { id: "heli",      label: "HELI",      cut: 0.55 },
    { id: "reverse",   label: "REVERSE",   cut: 0.35 },
    { id: "side",      label: "TV SIDE",   cut: 0.45 },
    { id: "cinematic", label: "CINEMATIC", cut: 0.6 },
    { id: "low",       label: "LOW",       cut: 0.4 },
    { id: "tcam",      label: "T-CAM",     cut: 0 },
    { id: "rear",      label: "REAR CAM",  cut: 0.15 },
    { id: "visor",     label: "VISOR",     cut: 0 },        // the cockpit without its steering wheel (a linked phone is the wheel)
    { id: "trackside", label: "TRACKSIDE", cut: 0.5 },      // fixed corner cams that auto-switch as the car passes (append-only)
    // Append-only: apex26.camMode is an index. New player cams land HERE (after TRACKSIDE).
    { id: "rival",     label: "RIVAL LOCK", cut: 0.4 },     // frames the nearest battle rival (Broadcast.battles)
    { id: "pitwall",   label: "PIT WALL",   cut: 0.45 },    // pit-lane / pit-exit wall cam (optional auto-cut)
    { id: "drone",     label: "DRONE",      cut: 0.5 },     // smoothed tether with corner look-ahead (heli alternative)
    { id: "tv",        label: "TV",        cut: 0.5 },      // live TV director (js/camera/director.js) — append only; index is apex26.camMode
    { id: "helmet",    label: "HELMET",     cut: 0 },       // the cockpit from inside the lid: eye forward, visor frame (css/hud.css)
  ];
  const HOLD_MS = 340;   // CAM button hold before the picker opens

  function create(G) {
    Log.info("game", "CamModes.create");
    const $ = G.$;

    // A REAL RACE WATCH (js/race/real-replay.js): its TV director is one more
    // "camera" — AUTO — in the picker and the C / CAM cycle. Never a CAM_MODES
    // entry: that list is the saved apex26.camMode index and GameCams.vantage's
    // mode ids, and AUTO is neither.
    function watchReplay() {
      const r = typeof RealRace !== "undefined" && RealRace.replay ? RealRace.replay() : null;
      return r && r.isRunning && r.isRunning() && r.setAuto ? r : null;
    }
    function refreshCamBtn() {
      const b = $("btn-cam");
      const r = watchReplay();
      // The NAME starts with the visible word (WCAG 2.5.3 Label in Name): a
      // fixed "Camera" left a voice-control user saying "click CHASE" to a
      // button whose name had no CHASE in it.
      // https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
      // In a WATCH with the director on the picture, the word is AUTO.
      if (b && r && r.autoOn()) {
        b.textContent = "AUTO · " + CAM_MODES[G.camMode].label;
        b.setAttribute("aria-label", `AUTO camera, ${CAM_MODES[G.camMode].label}`);
      } else if (b) { b.textContent = CAM_MODES[G.camMode].label; b.setAttribute("aria-label", `${CAM_MODES[G.camMode].label} camera`); }
      // cockpit-cam hides the HUD readouts the wheel's LCD carries — only while
      // the chosen wheel HAS one (js/camera/cockpit-opts.js WHEEL), and only in
      // COCKPIT. HELMET looks at the same wheel. On a phone the LCD is readable
      // (852×393), so css/track-detail.css also hides the floating speed there
      // while data-wheel-lcd is set. GEAR stays on the visor (HELMET_TOUCH).
      // CLASSIC / NONE keep the chip. Helmet wears
      // the visor frame (css/hud.css), keyed on an attribute because the
      // cssClasses ratchet has no room for a class.
      const camId = CAM_MODES[G.camMode].id;
      const wheelLcd = typeof CockpitOpts === "undefined" || CockpitOpts.wheelHasScreen();
      document.body.classList.toggle("cockpit-cam", camId === "cockpit"
        && (typeof CockpitOpts === "undefined" || CockpitOpts.wheelHasScreen()));
      document.body.toggleAttribute("data-helmet-cam", camId === "helmet");
      document.body.toggleAttribute("data-wheel-lcd", wheelLcd);
      // MOVE & SIZE swaps its cockpit / other layout on the SAME frame: waiting
      // for the HUD's 10 Hz tick (js/ui/hud.js) left one tick of chips at the
      // cockpit offsets over the touch buttons after leaving the cockpit.
      if (typeof HudLayout !== "undefined") HudLayout.setCam(CAM_MODES[G.camMode].id);
      // hud-bcam / hud-prof-* and --hud-top-h live in that same tick. A player
      // (or __apex.camera) cut must not wait for rAF either — software GL can
      // block the thread longer than layout probes budget.
      if ((G.state === "race" || G.state === "count") && typeof G.refreshHud === "function") {
        G.refreshHud(true);
      }
    }
    function setCamMode(m, opts) {
      const prev = G.camMode;
      G.camMode = ((m % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
      // opts.persist === false: ephemeral override (WebXR cockpit) — do not
      // write apex26.camMode so EXIT VR restores the player's saved choice.
      const replay = typeof RealRace !== "undefined" && RealRace.replay ? RealRace.replay() : null;
      if (!(opts && opts.persist === false) && !(replay && replay.isRunning())) G.store.set("camMode", G.camMode);
      if (G.camMode !== prev) {
        G.camCutT = (CAM_MODES[G.camMode] || CAM_MODES[0]).cut || 0.35;
        Log.info("game", `CamModes.setCamMode ${CAM_MODES[prev].id} -> ${CAM_MODES[G.camMode].id}`);
        if (typeof ExtraRigs !== "undefined") ExtraRigs.reset(CAM_MODES[G.camMode].id);
        // A cut: the new rig's eased bend sides start from its own target,
        // not from wherever that rig was the last time it was on air.
        if (typeof CamFeel !== "undefined") CamFeel.resetFollow();
      }
      if (typeof GameAudio !== "undefined") GameAudio.setCameraMix(CAM_MODES[G.camMode].id);   // onboard / chase / TV mix
      refreshCamBtn();   // the CAM button label is the only mode indicator (no big announce)
      // The CAMERA TUNER edits whichever mode you are looking through, so every
      // mode change re-points its sliders. Reached through the global, not a
      // create() const: this also runs at boot, before any such const exists.
      CamTunerPanel.refresh();
      return CAM_MODES[G.camMode].id;
    }
    // The viewer picks a shot: in a WATCH that takes the picture from the director.
    function pickCam(m) {
      const id = setCamMode(m);
      const r = watchReplay();
      if (r) { r.takePicture(); refreshCamBtn(); }
      return id;
    }
    function toAuto() { const r = watchReplay(); if (r) { r.setAuto(true); refreshCamBtn(); } return "auto"; }
    // In a WATCH the cycle runs the shots and then AUTO (where it would wrap);
    // from AUTO the next press is the next shot, the viewer's.
    function cycleCam() {
      const r = watchReplay();
      if (r && !r.autoOn() && G.camMode === CAM_MODES.length - 1) return toAuto();
      return r ? pickCam(G.camMode + 1) : setCamMode(G.camMode + 1);
    }

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
            e.stopPropagation(); pickCam(+b.dataset.idx); hide(); camTrigger?.focus();
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
      // AUTO is an item only while a WATCH runs (added here, not in build(): the
      // picker is built once, and outside a WATCH it keeps its shape exactly).
      let autoBtn = null;
      const syncAuto = (r) => {
        if (r && !autoBtn) {
          autoBtn = document.createElement("button");
          autoBtn.textContent = "AUTO · TV DIRECTOR";
          autoBtn.dataset.idx = "auto";
          autoBtn.setAttribute("role", "menuitemradio");
          autoBtn.tabIndex = -1;
          autoBtn.onclick = (e) => { e.stopPropagation(); toAuto(); hide(); camTrigger?.focus(); };
          el.insertBefore(autoBtn, el.children[0] || null);
        } else if (!r && autoBtn) { autoBtn.remove(); autoBtn = null; }
      };
      const sync = () => {
        const r = watchReplay();
        syncAuto(r);
        const auto = !!(r && r.autoOn());
        for (const b of el.children) {
          const on = b === autoBtn ? auto : !auto && +b.dataset.idx === G.camMode;
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
      let holdT = 0;
      let held = false;
      let released = false;
      b.addEventListener("pointerdown", () => {
        held = false; released = false;
        holdT = setTimeout(() => { held = true; camPicker.show(); }, HOLD_MS);
      });
      b.addEventListener("pointerup", () => { clearTimeout(holdT); released = true; });
      b.addEventListener("pointerleave", () => clearTimeout(holdT));
      // A cancelled touch is not a long press. iOS cancels touches routinely
      // (edge swipe, notification, gesture arbitration) and a touch pointer
      // holds implicit capture, so pointerleave never fires either: the timer
      // opened the picker mid-corner and `held` then ate the next genuine tap.
      const cancelHold = () => { clearTimeout(holdT); held = false; };
      b.addEventListener("pointercancel", cancelHold);
      // Touch implicitly releases capture AFTER pointerup and BEFORE click.
      // Preserve the consumed long press through that normal release.
      b.addEventListener("lostpointercapture", () => { if (!released) cancelHold(); });
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
    // A WHEEL change mid-race flips whether the HUD shows gear and speed.
    if (typeof CockpitOpts !== "undefined") CockpitOpts.onWheel(refreshCamBtn);
    // The SAVED camera's mix, at boot: setCamMode is the only other caller,
    // so a session that starts in the cockpit heard the chase mix until the
    // first camera change.
    if (typeof GameAudio !== "undefined") GameAudio.setCameraMix(CAM_MODES[G.camMode].id);
    // AUTO COMFORT on first touch/XR boot (js/camera/cam-comfort.js) — no-op
    // when the player already chose a preference.
    if (typeof CamComfort !== "undefined" && G.store) CamComfort.boot(G.store);

    return { refreshCamBtn, setCamMode, cycleCam, hideCamPicker: camPicker.hide };
  }

  return { CAM_MODES, create };
})();
