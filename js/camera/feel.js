/* Apex 26 — CamFeel: in-race camera feel that must not grow game.js.
   FREE-LOOK (mouse / right-stick yaw+pitch on bolted-on cams, smooth recenter),
   mode-aware LOOK BACK (skip reverse/rear; optional latch), one shared SPEED FOV
   curve scaled per mode, documented shake/buzz scope, and an optional SPEED
   VIGNETTE (CSS tunnel, off by default). CockpitOpts pattern: SETTINGS rows are
   injected, never static shell DOM. */
const CamFeel = (function () {
  "use strict";

  const clamp = M4.clamp;
  const DEG = Math.PI / 180;
  const store = typeof GameStore !== "undefined" ? GameStore.store : null;

  // ── Scope tables (shake / buzz / free-look) ───────────────────────────────
  // TRAUMA SHAKE (js/game.js `shake`): every live race camera. camComfort()
  // zeroes the OFFSET only; the trauma still decays so cues stay timed.
  //
  // SPEED BUZZ: high-frequency vibration on cams bolted to the chassis. Same
  // set as free-look + kerb rib shiver (vantage onboardAttitude includes tcam).
  // Off under camComfort() and on a wet road (SSR flicker).
  //
  // KERB RIB SHIVER: spatial, driven off arc `s` in vantage.js onboardAttitude
  // for the same bolted set (cockpit/hood/visor/tcam).
  const BUZZ_MODES = Object.freeze(["cockpit", "hood", "visor", "tcam"]);
  const FREELOOK_MODES = BUZZ_MODES;
  // LOOK BACK already faces aft in these — flipping again is a double reverse.
  const LOOKBACK_SKIP = Object.freeze(["reverse", "rear"]);

  const K_LATCH = "lookBackLatch";       // json lane via store.get/set
  const K_VIGNETTE = "speedVignette";    // "0"/"1" raw-style via json on/off

  let latchOn = false;
  let vignetteOn = false;
  let latchHeld = false;                 // latched look-back state
  let prevLookDown = false;              // edge detect for latch toggle

  // Free-look offsets in degrees (additive on top of CamTune yaw/pitch).
  let lookYaw = 0, lookPitch = 0;
  const YAW_MAX = 75, PITCH_MAX = 35;
  const STICK_RATE = 90;                 // deg/s at full deflection
  const MOUSE_SENS = 0.08;               // deg per pixel
  const RECENTER = 6;                    // λ toward 0 when input released

  let _vigEl = null;

  function readBool(key, def) {
    if (!store) return def;
    const v = store.get(key, null);
    if (v === null || v === undefined) return def;
    if (v === true || v === "1" || v === "on") return true;
    if (v === false || v === "0" || v === "off") return false;
    return def;
  }
  function loadSettings() {
    latchOn = readBool(K_LATCH, false);
    vignetteOn = readBool(K_VIGNETTE, false);
  }
  loadSettings();

  function lookBackLatch() { return latchOn; }
  function setLookBackLatch(on) {
    latchOn = !!on;
    if (store) store.set(K_LATCH, latchOn);
    if (!latchOn) latchHeld = false;
    return latchOn;
  }
  function speedVignette() { return vignetteOn; }
  function setSpeedVignette(on) {
    vignetteOn = !!on;
    if (store) store.set(K_VIGNETTE, vignetteOn);
    if (!vignetteOn) paintVignette(0);
    return vignetteOn;
  }

  function isBuzzMode(mode) { return BUZZ_MODES.indexOf(mode) >= 0; }
  function isFreeLookMode(mode) { return FREELOOK_MODES.indexOf(mode) >= 0; }
  function looksAftAlready(mode) { return LOOKBACK_SKIP.indexOf(mode) >= 0; }

  /* Shared speed FOV: FOV = base + widen * spN * scale + depBoost.
     Modes that used to ignore speed (tcam / side / heli) pass scale < 1 so they
     share the curve without jumping to chase-like widen. */
  function speedFov(base, widen, spN, scale, depBoost) {
    const s = scale == null ? 1 : scale;
    const n = clamp(spN, 0, 1);
    return base + widen * n * s + (depBoost || 0);
  }

  // Per-mode FOV recipe used by vantage.js — one table, one function.
  // scale defaults to 1; mild scales restore a curve where FOV was fixed.
  const FOV_BY_MODE = Object.freeze({
    cockpit:    { base: 64, widen: 14, scale: 1,   dep: 3 },
    hood:       { base: 64, widen: 14, scale: 1,   dep: 3 },
    visor:      { base: 64, widen: 14, scale: 1,   dep: 3 },
    overhead:   { base: 46, widen: 0,  scale: 1,   dep: 0 },
    heli:       { base: 36, widen: 8,  scale: 0.5, dep: 2 },
    reverse:    { base: 60, widen: 12, scale: 1,   dep: 0 },
    side:       { base: 44, widen: 6,  scale: 0.5, dep: 0 },
    cinematic:  { base: 50, widen: 10, scale: 1,   dep: 0 },
    low:        { base: 55, widen: 13, scale: 1,   dep: 0 },
    tcam:       { base: 46, widen: 8,  scale: 0.5, dep: 2 },
    rear:       { base: 58, widen: 12, scale: 1,   dep: 2 },
    drift:      { base: 55, widen: 15, scale: 1,   dep: 3 },
    chase:      { base: 57, widen: 6,  scale: 1,   dep: 3 },
    far:        { base: 61, widen: 6,  scale: 1,   dep: 3 },
  });

  // `sp` is the FOV speed blend (0..1). vantage.js passes CamTune-scaled
  // `spFov` so COMFORT › SPEED FOV still lands; look-ahead keeps full spN.
  function modeFov(mode, sp, deploy) {
    const r = FOV_BY_MODE[mode] || FOV_BY_MODE.chase;
    return speedFov(r.base, r.widen, sp, r.scale, (deploy ? 1 : 0) * r.dep);
  }

  function shouldLookBack(mode, held) {
    if (looksAftAlready(mode)) return false;
    if (latchOn) return latchHeld;
    return !!held;
  }

  function applyAim(eye, tgt, yawDeg, pitchDeg) {
    if (!yawDeg && !pitchDeg) return;
    let dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2];
    if (yawDeg) {
      const c = Math.cos(yawDeg * DEG), s = Math.sin(yawDeg * DEG);
      const nx = dx * c - dz * s, nz = dz * c + dx * s;
      dx = nx; dz = nz;
    }
    if (pitchDeg) {
      const L = Math.hypot(dx, dz), len = Math.hypot(L, dy) || 1;
      const el = clamp(Math.atan2(dy, L) + pitchDeg * DEG, -1.45, 1.45);
      const nl = Math.cos(el) * len;
      dy = Math.sin(el) * len;
      if (L > 1e-6) { const k = nl / L; dx *= k; dz *= k; }
      else { dx = 0; dz = nl; }
    }
    tgt[0] = eye[0] + dx; tgt[1] = eye[1] + dy; tgt[2] = eye[2] + dz;
  }

  function applyFreeLook(eye, tgt) {
    if (lookYaw || lookPitch) applyAim(eye, tgt, lookYaw, lookPitch);
  }

  function dampToward(cur, target, lambda, dt) {
    if (dt <= 0) return cur;
    return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  }

  // Live framing offsets (corner side, drift swing, chase yaw). A one-shot
  // solve (dt 0, the unit tests and snapCam) returns `target` unchanged so
  // shipped framing stays exact. A racing frame eases toward it, so a bend
  // that flips side pans instead of teleporting the eye across the circuit.
  const _fol = Object.create(null);
  function follow(key, target, lambda, dt) {
    if (!(dt > 0)) { _fol[key] = target; return target; }
    const cur = _fol[key];
    const next = cur == null || cur !== cur ? target : dampToward(cur, target, lambda, dt);
    _fol[key] = next;
    return next;
  }
  function resetFollow(key) {
    if (key) delete _fol[key];
    else for (const k in _fol) delete _fol[k];
  }

  // How fast the LENS catches the car. The rig owns the pose. These rates
  // must not move the eye: a second dolly on top of vantage was the double
  // image. One-shot solves (no dt) and Reduce Motion return the fov untouched.
  const DRIVE_RESPONSE = Object.freeze({
    chase:     { sp: 4.2, yaw: 2.2, brake: 9, slip: 3.2 },
    far:       { sp: 1.3, yaw: 1.0, brake: 1.6, slip: 1.0 },
    drift:     { sp: 6.0, yaw: 6.5, brake: 7.5, slip: 12 },
    low:       { sp: 5.5, yaw: 4.0, brake: 9, slip: 4.0 },
    reverse:   { sp: 2.4, yaw: 2.0, brake: 8, slip: 2.0 },
    heli:      { sp: 1.8, yaw: 0.75, brake: 1.2, slip: 1.0 },
    side:      { sp: 6.5, yaw: 3.5, brake: 4, slip: 3 },
    cinematic: { sp: 1.05, yaw: 0.9, brake: 1.0, slip: 0.9 },
    overhead:  { sp: 2.2, yaw: 2.2, brake: 1.4, slip: 2 },
    drone:     { sp: 1.2, yaw: 0.65, brake: 1.0, slip: 0.8 },
    rival:     { sp: 3.2, yaw: 2.4, brake: 6, slip: 2.5 },
    pitwall:   { sp: 2.2, yaw: 2.2, brake: 7, slip: 2 },
    trackside: { sp: 2.0, yaw: 1.6, brake: 2, slip: 2 },
    cockpit:   { sp: 3.5, yaw: 3, brake: 8, slip: 3 },
    hood:      { sp: 4.5, yaw: 4, brake: 9, slip: 4 },
    visor:     { sp: 3.0, yaw: 3, brake: 3, slip: 3 },
    tcam:      { sp: 5.0, yaw: 4, brake: 8, slip: 4 },
    rear:      { sp: 5.5, yaw: 7, brake: 8, slip: 4 },
  });
  function drive(mode, eye, tgt, fov, extra, spN) {
    if (!extra || !(extra.dt > 0) || extra.reduceMotion) return fov;
    const dt = extra.dt;
    const att = extra.att || {};
    const rate = DRIVE_RESPONSE[mode] || { sp: 3, yaw: 3, brake: 5, slip: 3 };
    let delta = null;
    const ctx = {
      sp: follow("sp:" + mode, clamp(spN || 0, 0, 1), rate.sp, dt),
      yaw: follow("yaw:" + mode, clamp((att.yawRateCur || 0) / 1.1, -1, 1), rate.yaw, dt),
      brake: follow("brk:" + mode, clamp((att.baPitch || 0) / 0.025, 0, 1), rate.brake, dt),
      slip: follow("slp:" + mode, clamp((extra.slipLat || 0) / 6, -1, 1), rate.slip, dt),
    };
    if (typeof DriveChase !== "undefined") delta = DriveChase.apply(mode, eye, tgt, ctx);
    if (delta == null && typeof DriveBroadcast !== "undefined") delta = DriveBroadcast.apply(mode, eye, tgt, ctx);
    if (delta == null && typeof DriveOnboard !== "undefined") delta = DriveOnboard.apply(mode, eye, tgt, ctx);
    return delta == null ? fov : fov + delta;
  }

  /* opts: { mode, dt, comfort, racing, lookHeld, stickX, stickY, mouseDx, mouseDy, spN }
     Call once per rendered race frame from game.js BEFORE vantage so look-back
     and free-look offsets are current for that solve. */
  function tick(opts) {
    opts = opts || {};
    const mode = opts.mode || "chase";
    const dt = opts.dt || 0;
    const comfort = !!opts.comfort;
    const racing = !!opts.racing;
    const held = !!opts.lookHeld;

    // LOOK BACK latch: rising edge toggles; leaving a skip mode clears.
    if (looksAftAlready(mode)) {
      latchHeld = false;
      prevLookDown = held;
    } else if (latchOn && racing) {
      if (held && !prevLookDown) latchHeld = !latchHeld;
      prevLookDown = held;
    } else {
      prevLookDown = held;
      if (!latchOn) latchHeld = false;
    }

    // FREE-LOOK — onboard only, never under camComfort / menus / non-race.
    if (!racing || comfort || !isFreeLookMode(mode)) {
      lookYaw = dampToward(lookYaw, 0, RECENTER * 1.5, dt);
      lookPitch = dampToward(lookPitch, 0, RECENTER * 1.5, dt);
    } else {
      const sx = clamp(opts.stickX || 0, -1, 1);
      const sy = clamp(opts.stickY || 0, -1, 1);
      const mx = opts.mouseDx || 0, my = opts.mouseDy || 0;
      const active = Math.abs(sx) > 0.02 || Math.abs(sy) > 0.02 || mx || my;
      if (active) {
        lookYaw = clamp(lookYaw + sx * STICK_RATE * dt + mx * MOUSE_SENS, -YAW_MAX, YAW_MAX);
        lookPitch = clamp(lookPitch - sy * STICK_RATE * dt - my * MOUSE_SENS, -PITCH_MAX, PITCH_MAX);
      } else {
        lookYaw = dampToward(lookYaw, 0, RECENTER, dt);
        lookPitch = dampToward(lookPitch, 0, RECENTER, dt);
      }
    }

    // SPEED VIGNETTE — tunnel darkening with speed; off by default / comfort.
    if (!vignetteOn || comfort || !racing) paintVignette(0);
    else {
      const n = clamp(opts.spN || 0, 0, 1);
      paintVignette(n * n * 0.55);
    }
  }

  // Thin game.js entry: pull look axes from Input, then tick().
  function tickRace(mode, dt, comfort, racing, spN) {
    const ls = (typeof Input !== "undefined" && Input.lookStick) ? Input.lookStick() : { x: 0, y: 0 };
    const lm = (typeof Input !== "undefined" && Input.consumeLookMouse) ? Input.consumeLookMouse() : { dx: 0, dy: 0 };
    const held = !!(typeof Input !== "undefined" && Input.lookingBack && Input.lookingBack());
    tick({
      mode, dt, comfort, racing, lookHeld: held,
      stickX: ls.x, stickY: ls.y, mouseDx: lm.dx, mouseDy: lm.dy, spN,
    });
  }

  function paintVignette(amt) {
    if (typeof document === "undefined") return;
    if (!(amt > 0.01)) {
      if (_vigEl) _vigEl.style.opacity = "0";
      return;
    }
    if (!_vigEl) {
      _vigEl = document.createElement("div");
      _vigEl.id = "speed-vignette";
      _vigEl.setAttribute("aria-hidden", "true");
      // Radial tunnel — no new CSS class token (cssClasses ratchet is saturated).
      _vigEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:4;" +
        "opacity:0;transition:opacity .12s linear;" +
        "background:radial-gradient(ellipse at center," +
        "rgba(0,0,0,0) 42%,rgba(0,0,0,.55) 100%)";
      (document.getElementById("overlay") || document.body).appendChild(_vigEl);
    }
    _vigEl.style.opacity = String(clamp(amt, 0, 0.7));
  }

  function freeLookState() {
    return { yaw: lookYaw, pitch: lookPitch };
  }
  function resetFreeLook() { lookYaw = 0; lookPitch = 0; }
  function resetLatch() { latchHeld = false; prevLookDown = false; }

  function initUI() {
    if (typeof SettingRow === "undefined" || !SettingRow.build) return;
    if (document.getElementById("pm-looklatch")) return;
    const panel = document.getElementById("pm-panel-display");
    const host = panel || (document.getElementById("pm-res") && document.getElementById("pm-res").parentNode);
    if (!host) return;
    const fold = document.createElement("details");
    fold.id = "pm-camfeel";
    fold.className = "pm-renderer-sub";
    const sum = document.createElement("summary");
    sum.className = "adv-more-btn";
    sum.id = "pm-camfeel-sum";
    sum.textContent = "CAMERA FEEL";
    const body = document.createElement("div");
    body.id = "pm-camfeel-body";
    body.setAttribute("role", "group");
    body.setAttribute("aria-label", "Camera feel");
    fold.appendChild(sum);
    fold.appendChild(body);
    // Sit with COCKPIT, ahead of ADVANCED VISUALS when that fold exists.
    const tools = document.getElementById("pm-visual-tuners");
    const cock = document.getElementById("pm-cockpit");
    if (cock && cock.parentNode === host) host.insertBefore(fold, cock.nextSibling);
    else if (tools && tools.parentNode === host) host.insertBefore(fold, tools);
    else host.appendChild(fold);

    const help = (text) => {
      const p = document.createElement("p");
      p.className = "adv-help";
      p.textContent = text;
      body.appendChild(p);
    };
    const row = (id, label, title, read, write) => {
      const r = SettingRow.build(id, label, SettingRow.labels(["off", "on"]));
      r.row.title = title;
      SettingRow.wire(r.row, { read, write });
      body.appendChild(r.row);
      help(title);
    };
    row("pm-looklatch", "LOOK BACK LATCH",
      "OFF = hold B / the pad button to glance behind. ON = press once to latch the rear view, press again to release. Never flips reverse or rear cams.",
      () => (latchOn ? "on" : "off"),
      (v) => setLookBackLatch(v === "on"));
    row("pm-speedvig", "SPEED VIGNETTE",
      "Soft tunnel darkening that grows with speed (motion comfort). Off by default; also forced off when Reduce Motion is on.",
      () => (vignetteOn ? "on" : "off"),
      (v) => setSpeedVignette(v === "on"));
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return {
    BUZZ_MODES, FREELOOK_MODES, LOOKBACK_SKIP, FOV_BY_MODE,
    K_LATCH, K_VIGNETTE,
    speedFov, modeFov,
    isBuzzMode, isFreeLookMode, looksAftAlready,
    shouldLookBack, lookBackLatch, setLookBackLatch,
    speedVignette, setSpeedVignette,
    applyFreeLook, applyAim, tick, tickRace, freeLookState, resetFreeLook, resetLatch,
    follow, resetFollow, drive,
    initUI, loadSettings,
  };
})();
Object.freeze(CamFeel);
