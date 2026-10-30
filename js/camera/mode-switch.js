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
    // Temporary lifetimes can end out of order (WATCH under XR). Only live
    // owners participate in restoration; none saves another owner's camera.
    const cameraOwners = new Map();
    let baseCamera = G.camMode;
    function pictureOwner() {
      let top = null;
      for (const entry of cameraOwners.values()) if (!top || entry.priority >= top.priority) top = entry;
      return top;
    }

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
      // COCKPIT. HELMET looks at the same wheel but keeps the floating SPEED:
      // its GEAR pill (HELMET_TOUCH) covers the LCD's digits on a phone.
      // CLASSIC / NONE keep the chip. Helmet wears
      // the visor frame (css/hud.css), keyed on an attribute because the
      // cssClasses ratchet has no room for a class.
      const camId = CAM_MODES[G.camMode].id;
      document.body.classList.toggle("cockpit-cam", camId === "cockpit"
        && (typeof CockpitOpts === "undefined" || CockpitOpts.wheelHasScreen()));
      document.body.toggleAttribute("data-helmet-cam", camId === "helmet");
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
      const n = CAM_MODES.length;
      // NaN / Infinity from a bad store, __apex.camera, or XR hand-off must not
      // land in G.camMode: CAM_MODES[NaN] is undefined and the next refresh /
      // vantage throw, and a NaN cut leaves the damper on a poisoned path.
      let idx = Number(m);
      if (!Number.isFinite(idx)) {
        idx = Number(G.camMode);
        if (!Number.isFinite(idx)) idx = 0;
      }
      idx = ((idx % n) + n) % n;
      const owner = opts && opts.owner;
      if (owner) {
        if (opts.release) {
          if (!cameraOwners.delete(owner)) return CAM_MODES[G.camMode].id;
        } else {
          if (!cameraOwners.size) {
            const base = Number(G.camMode);
            baseCamera = Number.isFinite(base) ? ((base % n) + n) % n : 0;
          }
          const entry = cameraOwners.get(owner);
          if (entry) entry.idx = idx;
          else cameraOwners.set(owner, { idx, priority: Number(opts.priority) || 0 });
        }
        const top = pictureOwner();
        idx = top ? top.idx : baseCamera;
      } else {
        // Explicit controls remain usable during a temporary view. A WATCH
        // selection belongs to that view and never replaces the driving base.
        const top = pictureOwner();
        if (top) top.idx = idx;
      }
      // -1 when the stored index was already poisoned: recovering must cut /
      // resetFollow, not compare equal to the freshly sanitised idx.
      const prevRaw = Number(G.camMode);
      const prev = Number.isFinite(prevRaw) ? ((prevRaw % n) + n) % n : -1;
      G.camMode = idx;
      // opts.persist === false: ephemeral override (WebXR cockpit) — do not
      // write apex26.camMode so EXIT VR restores the player's saved choice.
      const replay = typeof RealRace !== "undefined" && RealRace.replay ? RealRace.replay() : null;
      if (!owner && !(opts && opts.persist === false) && !(replay && replay.isRunning())) {
        baseCamera = G.camMode;
        G.store.set("camMode", G.camMode);
      }
      if (G.camMode !== prev) {
        G.camCutT = (CAM_MODES[G.camMode] || CAM_MODES[0]).cut ?? 0.35;   // cut: 0 is an instant cut, not missing
        const from = (prev >= 0 && CAM_MODES[prev]) ? CAM_MODES[prev].id : "?";
        Log.info("game", `CamModes.setCamMode ${from} -> ${CAM_MODES[G.camMode].id}`);
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

    const camUi = CamPicker.attach({ G, $, CAM_MODES, HOLD_MS, watchReplay, pickCam, toAuto, cycleCam });
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

    return { refreshCamBtn, setCamMode, cycleCam, hideCamPicker: camUi.hide };
  }

  return { CAM_MODES, create };
})();
