"use strict";
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
    { id: "visor",     label: "VISOR",     cut: 0 },
    { id: "trackside", label: "TRACKSIDE", cut: 0.5 },
    { id: "rival",     label: "RIVAL LOCK", cut: 0.4 },
    { id: "pitwall",   label: "PIT WALL",   cut: 0.45 },
    { id: "drone",     label: "DRONE",      cut: 0.5 },
    { id: "tv",        label: "TV",        cut: 0.5 },
    { id: "helmet",    label: "HELMET",     cut: 0 },
  ];
  const HOLD_MS = 340;

  function create(G) {
    Log.info("game", "CamModes.create");
    const $ = G.$;
    const cameraOwners = new Map();
    let baseCamera = G.camMode;
    function pictureOwner() {
      let top = null;
      for (const entry of cameraOwners.values()) if (!top || entry.priority >= top.priority) top = entry;
      return top;
    }
    function endShots() {
      let n = 0;
      for (const [key, entry] of cameraOwners) if (entry.transient) { cameraOwners.delete(key); n++; }
      return n;
    }

    function watchReplay() {
      const r = typeof RealRace !== "undefined" && RealRace.replay ? RealRace.replay() : null;
      return r && r.isRunning && r.isRunning() && r.setAuto ? r : null;
    }
    function refreshCamBtn() {
      const b = $("btn-cam");
      const r = watchReplay();
      if (b && r && r.autoOn()) {
        b.textContent = "AUTO · " + CAM_MODES[G.camMode].label;
        b.setAttribute("aria-label", `AUTO camera, ${CAM_MODES[G.camMode].label}`);
      } else if (b) { b.textContent = CAM_MODES[G.camMode].label; b.setAttribute("aria-label", `${CAM_MODES[G.camMode].label} camera`); }
      const camId = CAM_MODES[G.camMode].id;
      document.body.classList.toggle("cockpit-cam", camId === "cockpit"
        && (typeof CockpitOpts === "undefined" || CockpitOpts.wheelHasScreen()));
      document.body.toggleAttribute("data-helmet-cam", camId === "helmet");
      if (typeof HudLayout !== "undefined") HudLayout.setCam(CAM_MODES[G.camMode].id);
      if ((G.state === "race" || G.state === "count") && typeof G.refreshHud === "function") {
        G.refreshHud(true);
      }
    }
    function setCamMode(m, opts) {
      const n = CAM_MODES.length;
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
          else cameraOwners.set(owner, { idx, priority: Number(opts.priority) || 0, transient: !!opts.transient });
        }
        const top = pictureOwner();
        idx = top ? top.idx : baseCamera;
      } else {
        endShots();
        const top = pictureOwner();
        if (top) top.idx = idx;
      }
      const prevRaw = Number(G.camMode);
      const prev = Number.isFinite(prevRaw) ? ((prevRaw % n) + n) % n : -1;
      G.camMode = idx;
      const replay = typeof RealRace !== "undefined" && RealRace.replay ? RealRace.replay() : null;
      if (!owner && !(opts && opts.persist === false) && !(replay && replay.isRunning())) {
        baseCamera = G.camMode;
        G.store.set("camMode", G.camMode);
      }
      if (G.camMode !== prev) {
        G.camCutT = (CAM_MODES[G.camMode] || CAM_MODES[0]).cut ?? 0.35;
        const from = (prev >= 0 && CAM_MODES[prev]) ? CAM_MODES[prev].id : "?";
        Log.info("game", `CamModes.setCamMode ${from} -> ${CAM_MODES[G.camMode].id}`);
        if (typeof ExtraRigs !== "undefined") ExtraRigs.reset(CAM_MODES[G.camMode].id);
        if (typeof CamFeel !== "undefined") CamFeel.resetFollow();
      }
      if (typeof GameAudio !== "undefined") GameAudio.setCameraMix(CAM_MODES[G.camMode].id);
      refreshCamBtn();
      CamTunerPanel.refresh();
      return CAM_MODES[G.camMode].id;
    }
    function pickCam(m) {
      const id = setCamMode(m);
      const r = watchReplay();
      if (r) { r.takePicture(); refreshCamBtn(); }
      return id;
    }
    function toAuto() { const r = watchReplay(); if (r) { r.setAuto(true); refreshCamBtn(); } return "auto"; }
    function cycleCam() {
      if (endShots()) { const top = pictureOwner(); return setCamMode(top ? top.idx : baseCamera, { persist: false }); }
      const r = watchReplay();
      if (r && !r.autoOn() && G.camMode === CAM_MODES.length - 1) return toAuto();
      return r ? pickCam(G.camMode + 1) : setCamMode(G.camMode + 1);
    }

    const camUi = CamPicker.attach({ G, $, CAM_MODES, HOLD_MS, watchReplay, pickCam, toAuto, cycleCam });
    refreshCamBtn();
    if (typeof CockpitOpts !== "undefined") CockpitOpts.onWheel(refreshCamBtn);
    if (typeof GameAudio !== "undefined") GameAudio.setCameraMix(CAM_MODES[G.camMode].id);
    if (typeof CamComfort !== "undefined" && G.store) CamComfort.boot(G.store);

    return { refreshCamBtn, setCamMode, cycleCam, hideCamPicker: camUi.hide };
  }

  return { CAM_MODES, create };
})();
