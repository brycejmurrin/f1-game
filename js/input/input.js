"use strict";

const Input = (function () {
  let MAX_TILT = 36;
  let DEADZONE = 2.5;
  const TILT_SLEW = 8;
  let KEY_RAMP_IN = 4;
  let KEY_RAMP_OUT = 8;
  let adaptiveMix = 0;
  let steerSpeedRef = 41.7;
  let speedStdOverride = null;
  let speedProvider = null;

  const heldKeys = new Set();
  let keyLeft = false;
  let keyRight = false;
  let keyBrake = false;
  let keyThrottle = false;
  let keySteerVal = 0;
  let keySteerT = 0;
  let keySeq = 0, keyLeftSeq = 0, keyRightSeq = 0;

  let overtakePressed = false;
  let boostTogglePressed = false;
  let aeroTogglePressed = false;
  let shiftUpPressed = false;
  let shiftDownPressed = false;
  let cameraCyclePressed = false;
  let recoverPressed = false;
  let radioPressed = false;
  let mirrorPressed = false;
  let keyLookBack = false;
  let padLookBack = false;
  let holdMode = InputBindings.holdModeDefaults();
  let keyThrottleToggle = false, keyLookBackToggle = false;
  let padThrottleToggle = false, padLookBackToggle = false;
  let _menuWasOpen = false, _wasInRace = false;
  const throttleIsToggle = () => holdMode.throttle === "toggle";
  const lookBackIsToggle = () => holdMode.lookBack === "toggle";
  function clearDriveToggles() {
    keyThrottleToggle = keyLookBackToggle = false;
    padThrottleToggle = padLookBackToggle = false;
    syncHeldKeys();
  }
  let lookStickX = 0, lookStickY = 0;
  let lookMouseDx = 0, lookMouseDy = 0;
  let lookMouseDown = false;
  const LOOK_STICK_DEAD = 0.18;

  let padConnected = false;
  const PAD_PROBE_FAST_MS = 250;
  const PAD_PROBE_SLOW_MS = 1000;
  let _padLostAt = 0;
  let _padNextProbeMs = 0;
  let padPollWarned = false;
  let padMapWarned = false;
  let padSteer = 0;
  let padSteerAnalog = false;
  let throttleLatch = false, throttleLatched = false;
  let padThrottle = false;
  let padBrake = false;
  let padThrottleVal = 0;
  let padBrakeVal = 0;
  let padPrevButtons = [];
  const padPrevByIndex = new Map();
  let padPrevKey = null;
  let padSnapshotLost = false;
  let padDpadTarget = 0;
  let padDpadVal = 0;
  let padDpadT = 0;
  let padDpadSeq = 0, padDpadLeftSeq = 0, padDpadRightSeq = 0;
  let padDpadLeftHeld = false, padDpadRightHeld = false;
  const PAD_DZ_DEFAULT = 0.05;
  let padDeadzone = PAD_DZ_DEFAULT;
  let padSaturation = 0;
  let padRestOffset = 0;
  const padRestMap = new Map();
  let padRestLegacy = null;
  let padIsWheel = false;
  const touches = new Map();
  let touchSeq = 0;
  let touchSteer = 0;
  let touchActive = false;
  let touchSteerVal = 0;
  let touchSteerT = 0;

  let btnThrottle = false;
  let btnBrake = false;
  let btnThrottleVal = 0;
  let btnBrakeVal = 0;
  let btnSteerLeft = false;
  let btnSteerRight = false;
  let btnSteerLeftVal = 0;
  let btnSteerRightVal = 0;
  let btnSteerVal = 0;
  let btnSteerT = 0;
  let btnSteerSeq = 0, btnSteerLeftSeq = 0, btnSteerRightSeq = 0;

  let tiltRaw = 0;
  let tiltZero = 0;
  let tiltSeen = false, tiltRemote = false;
  let gyroAttached = false;
  let gyroRequestGeneration = 0;
  let gyroDenied = false;
  let gyroHardDenied = false;
  let steerMode = "buttons";
  let tiltSmoothed = 0;
  let lastOrientMs = 0;
  const LOCAL_TILT_STALE_MS = 1000;
  let OE_MIN_CUTOFF = 1.2;
  let OE_BETA = 0.10;
  const OE_DCUTOFF = 1.0;
  let oePrev = 0, oeDPrev = 0, oeInit = false;
  let tiltSteerVal = 0;
  let tiltSteerT = 0;
  const REMOTE_STALE_MS = 700;
  const REMOTE_HELD = Object.freeze({ lookBack: 1 });
  let remoteOwner = null;
  let remoteMs = 0;
  let remThr = 0, remBrk = 0;
  let remHeld = 0;
  let remRoll = false;
  let remStick = false, remSteer = 0;
  let remSeq = null;
  const REMOTE_SAMPLE_GAP_S = 0.015;
  let remoteHaptics = null;

  let onPauseCb = null;
  let onPadLostCb = null;

  let timeScale = 1;
  function setTimeScale(s) {
    timeScale = (typeof s === "number" && isFinite(s) && s > 0) ? Math.min(s, 1) : 1;
  }

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
  }

  const clamp = M4.clamp;

  function oeAlpha(cutoff, dt) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
  function oneEuro(x, dt) {
    if (!oeInit) { oePrev = x; oeDPrev = 0; oeInit = true; return x; }
    if (dt <= 0) return oePrev;
    const dx = (x - oePrev) / dt;
    const dxHat = oeDPrev + oeAlpha(OE_DCUTOFF, dt) * (dx - oeDPrev);
    const cutoff = OE_MIN_CUTOFF + OE_BETA * Math.abs(dxHat);
    const xHat = oePrev + oeAlpha(cutoff, dt) * (x - oePrev);
    oePrev = xHat; oeDPrev = dxHat;
    return xHat;
  }

  function onOrient(e) {
    const roll = TiltRoll.rollDeg(e.beta, e.gamma, TiltRoll.screenAngle());
    if (roll === null || !Number.isFinite(roll) || remoteSteers()) return;
    localTiltFresh();
    tiltRaw = roll;
    const n = nowMs();
    const odt = lastOrientMs ? Math.min(0.1, (n - lastOrientMs) / 1000) : 0.016;
    lastOrientMs = n;
    tiltSmoothed = oneEuro(tiltRaw, odt);
    tiltSeen = true; tiltRemote = false;
    if (calibPending) calibrate();
  }

  function attachGyro() {
    if (gyroAttached) return;
    gyroAttached = true;
    window.addEventListener("deviceorientation", onOrient);
  }
  function detachGyro() {
    if (!gyroAttached) return;
    gyroAttached = false;
    window.removeEventListener("deviceorientation", onOrient);
    tiltSeen = false;
    if (!tiltRemote) { oeInit = false; lastOrientMs = 0; }
  }

  function requestGyro() {
    const generation = ++gyroRequestGeneration;
    if (typeof DeviceOrientationEvent === "undefined") {
      gyroDenied = gyroHardDenied = true;
      return Promise.resolve(false);
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        return DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (generation !== gyroRequestGeneration) return false;
            if (res === "granted") {
              gyroDenied = gyroHardDenied = false;
              attachGyro();
              return true;
            }
            gyroDenied = gyroHardDenied = true;
            return false;
          })
          .catch(() => {
            if (generation !== gyroRequestGeneration) return false;
            gyroDenied = true;
            return false;
          });
      } catch (err) {
        gyroDenied = true;
        return Promise.resolve(false);
      }
    }
    attachGyro();
    return Promise.resolve(true);
  }

  let calibPending = false;
  function calibrate() {
    if (gyroAttached && !localTiltFresh() && !remoteSteers()) { calibPending = true; return; }
    calibPending = false;
    tiltZero = tiltRaw;
    oePrev = tiltRaw; oeDPrev = 0; oeInit = true;
    tiltSmoothed = tiltRaw;
    tiltSteerVal = 0;
    tiltSteerT = 0;
  }

  function tiltActive() {
    return steerMode === "tilt" && localTiltFresh() && (!tiltRemote || remoteSteers());
  }
  function localTiltFresh() {
    if (tiltSeen && !tiltRemote && nowMs() - lastOrientMs >= LOCAL_TILT_STALE_MS) {
      tiltSeen = false;
      tiltFilterClear();
    }
    return tiltSeen;
  }

  function remoteActive() {
    return remoteMs > 0 && (nowMs() - remoteMs) < REMOTE_STALE_MS;
  }
  function remoteSteers() { return remoteActive() && (remRoll || remStick); }
  function remoteDrivingBlocked() {
    return !!axisCaptureCb || !!padCaptureCb || !!(window.UiLayers && window.UiLayers.navOpen());
  }
  function remoteSample(s) {
    if (!s) return false;
    const owner = typeof s.source === "string" ? s.source.slice(0, 32) : "remote";
    if (owner !== remoteOwner) remSeq = null;
    remoteOwner = owner;
    const n = nowMs();
    remStick = typeof s.steer === "number" && isFinite(s.steer);
    remSteer = remStick ? clamp(s.steer, -1, 1) : 0;
    if (remStick && tiltRemote) tiltFilterClear();
    remRoll = !remStick && typeof s.roll === "number" && isFinite(s.roll);
    if (remRoll) {
      tiltRaw = s.roll;
      let odt = lastOrientMs ? Math.min(0.1, (n - lastOrientMs) / 1000) : 0.016;
      const seqOk = Number.isInteger(s.seq);
      if (seqOk && remSeq != null) {
        const gap = s.seq - remSeq;
        if (gap >= 1 && gap < 30) odt = Math.max(odt, Math.min(0.1, gap * REMOTE_SAMPLE_GAP_S));
      }
      remSeq = seqOk ? s.seq : null;
      lastOrientMs = n;
      tiltSmoothed = oneEuro(tiltRaw, odt);
      tiltSeen = tiltRemote = true;
    }
    remThr = clamp(+s.thr || 0, 0, 1);
    remBrk = clamp(+s.brk || 0, 0, 1);
    remHeld = s.held | 0;
    remoteMs = n;
    if (!remoteDrivingBlocked() && (remThr > REMOTE_PEDAL_ON || remBrk > REMOTE_PEDAL_ON || remHeld ||
      (remStick ? Math.abs(remSteer) > 0.05 : remRoll && Math.abs(s.roll - tiltZero) > 2))) {
      noteInputSource(remStick ? "controller" : "phone");
    }
    return true;
  }
  const REMOTE_EDGES = {
    shiftUp: () => { shiftUpPressed = true; },
    shiftDown: () => { shiftDownPressed = true; },
    overtake: () => { overtakePressed = true; },
    boost: () => { boostTogglePressed = true; },
    aero: () => { aeroTogglePressed = true; },
    camera: () => { cameraCyclePressed = true; },
    recover: () => { recoverPressed = true; },
    radio: () => { radioPressed = true; },
    mirror: () => { mirrorPressed = true; },
    calib: () => { calibrate(); },
    pause: () => { if (onPauseCb) onPauseCb(); },
    navUp: () => padMenu.remoteNav("up"), navDown: () => padMenu.remoteNav("down"),
    navLeft: () => padMenu.remoteNav("left"), navRight: () => padMenu.remoteNav("right"),
    navSelect: () => padMenu.activate(remoteOwner === "xr" ? null : remoteGuard),
    navBack: () => { padMenu.escape(); },
  };
  function remoteGuard(el) {
    if (!InputPadMenu.isDestructive(el)) return false;
    if (typeof Log !== "undefined") Log.info("input", "phone SELECT refused on a destructive control: tap it on this screen");
    return true;
  }
  function remoteEvent(kind) {
    const fn = REMOTE_EDGES[kind];
    if (!fn) return false;
    const menuEdge = kind === "pause" || kind.startsWith("nav");
    if (!menuEdge && remoteDrivingBlocked()) return false;
    if (!menuEdge) noteInputSource(remStick ? "controller" : "phone");
    return fn() !== false;
  }
  function clearRemoteControls(clearSequence) {
    remoteMs = 0; remThr = remBrk = 0; remHeld = 0; remRoll = false; remStick = false; remSteer = 0;
    if (clearSequence) remSeq = null;
    if (tiltRemote || !gyroAttached) tiltSeen = false;
    if (tiltRemote) tiltFilterClear();
  }
  function remoteLost(source) {
    if (source != null && source !== remoteOwner) return false;
    remoteOwner = null;
    clearRemoteControls(true);
  }
  function setRemoteHaptics(fn) {
    const had = !!remoteHaptics;
    remoteHaptics = typeof fn === "function" ? fn : null;
    if (had !== !!remoteHaptics && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("apexhapticschange"));
  }

  function simTilt(rawDeg, dt) {
    const step = dt > 0 ? dt : 0.016;
    tiltSeen = true; tiltRemote = false;
    lastOrientMs = nowMs();
    tiltRaw = rawDeg;
    tiltSmoothed = oneEuro(rawDeg, step);
    return tiltSlew(tiltTarget(), step);
  }
  function simTiltReset() {
    oeInit = false; oePrev = 0; oeDPrev = 0; calibPending = false;
    tiltSmoothed = 0; tiltSteerVal = 0; tiltZero = 0; tiltRaw = 0;
  }
  function steerToTilt(cmd) {
    if (Math.abs(cmd) < 1e-4) return 0;
    return clamp(cmd, -1, 1) * (MAX_TILT - DEADZONE) + Math.sign(cmd) * DEADZONE;
  }


  function tiltTarget() {
    let d = tiltSmoothed - tiltZero;
    if (Math.abs(d) < DEADZONE) return 0;
    d -= Math.sign(d) * DEADZONE;
    return clamp(d / (MAX_TILT - DEADZONE), -1, 1);
  }

  function tiltSlew(target, dt) {
    const releasing = Math.abs(target) < Math.abs(tiltSteerVal);
    tiltSteerVal = moveToward(tiltSteerVal, target, (releasing ? 1.6 : 1.0) * TILT_SLEW * dt);
    return tiltSteerVal;
  }

  let rampDt = null;
  function rampDtSince(lastT, t) {
    if (rampDt != null) return rampDt;
    return (lastT ? Math.min(0.1, (t - lastT) / 1000) : 0) * timeScale;
  }
  function tiltSteering() {
    const t = nowMs();
    const dt = rampDtSince(tiltSteerT, t);
    tiltSteerT = t;
    return tiltSlew(tiltTarget(), dt);
  }

  function moveToward(v, target, step) {
    return v + clamp(target - v, -step, step);
  }

  function currentSpeedStd() {
    if (speedStdOverride != null) return speedStdOverride;
    if (typeof speedProvider === "function") {
      const v = speedProvider();
      if (typeof v === "number" && isFinite(v)) return Math.max(0, v);
    }
    return 0;
  }
  function digitalStep(val, target, dt) {
    const v = toShaped(val), t = target;
    if (t === 0) return fromShaped(moveToward(v, 0, KEY_RAMP_OUT * dt));
    if (v * t < 0) {
      const toCentre = Math.abs(v);
      const unwind = KEY_RAMP_OUT * dt;
      if (unwind < toCentre) return fromShaped(moveToward(v, 0, unwind));
      const spare = (unwind - toCentre) / KEY_RAMP_OUT;
      return fromShaped(moveToward(0, t, digitalRateIn() * spare));
    }
    return fromShaped(moveToward(v, t, digitalRateIn() * dt));
  }

  function digitalRateIn() {
    if (adaptiveMix <= 0) return KEY_RAMP_IN;
    const ref = steerSpeedRef > 1 ? steerSpeedRef : 41.7;
    const full = KEY_RAMP_IN / (1 + currentSpeedStd() / ref);
    return KEY_RAMP_IN + (full - KEY_RAMP_IN) * adaptiveMix;
  }

  function keyboardSteer() {
    if (!keyLeft && !keyRight && keySteerVal === 0) { keySteerT = nowMs(); return 0; }
    const t = nowMs();
    const dt = rampDtSince(keySteerT, t);
    keySteerT = t;
    const target = keyLeft && keyRight ? (keyRightSeq > keyLeftSeq ? 1 : -1)
      : (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    keySteerVal = digitalStep(keySteerVal, target, dt);
    return keySteerVal;
  }

  function menuOverlayOpen() {
    return !!(window.UiLayers && window.UiLayers.anyOpen());
  }

  let /** @type {ReturnType<typeof ControllerProfiles.create> | null} */ deviceProfiles = null;
  function profileChanged() { if (deviceProfiles) deviceProfiles.save(); }
  const bindings = InputBindings.create({
    onKeysChanged() { heldKeys.clear(); keyLeft = keyRight = keyThrottle = keyBrake = keyLookBack = false; clearDriveToggles(); },
    onPadBindingChanged() { padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; clearDriveToggles(); profileChanged(); },
    activePad,
  });
  const {
    keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, loadLayoutMap,
    padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad, padsAreDefault, padLabel,
    setPadLabelMode, padLabelMode: padLabelModeOf,
  } = bindings;
  let padCaptureCb = null;
  function padCapture(cb) { padCaptureCb = typeof cb === "function" ? cb : null; }
  function padPresent() { return padConnected || !!activePad(); }
  let kbSeen = false;
  function keyboardSeen() { return kbSeen; }
  let inputSource = null;
  let defaultInputSource = null;
  function noteInputSource(source) {
    if (source === "keyboard" || source === "controller" || source === "touch" || source === "phone") inputSource = source;
  }
  function activeInputSource() {
    if (inputSource) return inputSource;
    if (!defaultInputSource) defaultInputSource = touchControlsNeeded() ? "touch" : "keyboard";
    return defaultInputSource;
  }
  const AXIS_CAPTURE_MOVE = 0.45;
  const AXIS_EXT_MS = 1500;
  let axisExt = null;
  function snapshotRests(pads, into) {
    for (let i = 0; pads && i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.axes && !into.has(padKey(p, i))) into.set(padKey(p, i), Array.prototype.slice.call(p.axes));
    }
    return into;
  }
  function beginAxisCapture(cb, opts) {
    axisCaptureCb = typeof cb === "function" ? cb : null;
    axisCaptureRest = null;
    axisCaptureSkip = new Set((opts && opts.exclude) || []);
    axisCaptureOwner = opts && opts.ownerKey || null;
    if (!axisCaptureCb) return;
    axisCaptureRest = snapshotRests(readPads(), new Map());
  }
  function pollAxisCapture(pads) {
    if (!axisCaptureCb || !pads) return;
    if (!axisCaptureRest) { axisCaptureRest = snapshotRests(pads, new Map()); return; }
    let best = -1, bestI = -1, bestRest = 0, bestV = 0, bestKey = "";
    for (let j = 0; j < pads.length; j++) {
      const p = pads[j];
      if (!p || !p.connected) continue;
      if (axisCaptureOwner && padKey(p, j) !== axisCaptureOwner) continue;
      const rests = axisCaptureRest.get(padKey(p, j));
      if (!rests) { snapshotRests([p], axisCaptureRest); continue; }
      const axes = p.axes || [];
      for (let i = 0; i < axes.length; i++) {
        if (axisCaptureSkip.has(i)) continue;
        const rest = typeof rests[i] === "number" ? rests[i] : 0;
        const d = Math.abs((axes[i] || 0) - rest);
        if (d > best) { best = d; bestI = i; bestRest = rest; bestV = axes[i] || 0; bestKey = padKey(p, j); }
      }
    }
    if (bestI < 0 || best < AXIS_CAPTURE_MOVE) return;
    const cb = axisCaptureCb;
    axisCaptureCb = null; axisCaptureRest = null;
    axisExt = { key: bestKey, axis: bestI, rest: bestRest, far: bestV, until: nowMs() + AXIS_EXT_MS };
    cb(bestI, Math.sign(bestV - bestRest) || 1, axisExt);
  }
  function setPadAxisMap(saved, ownerKey) {
    let owner = null;
    if (ownerKey != null) {
      const pads = readPads();
      owner = Array.prototype.find.call(pads, (p, i) => p && p.connected && padKey(p, i) === ownerKey);
      if (!owner) return null;
      const profiles = ensureDeviceProfiles();
      if (profiles) profiles.activate(owner);
    }
    const previous = getPadAxisMap();
    padAxisMap = Object.assign({}, PAD_AXIS_DEF);
    if (saved && typeof saved === "object") {
      for (const k of ["steer", "throttle", "brake"]) {
        const v = saved[k];
        if (v === null || (Number.isInteger(v) && v >= 0 && v < 32)) padAxisMap[k] = v;
      }
      for (const k of ["steerInvert", "pedalInvert"]) {
        if (saved[k] === -1 || saved[k] === 1) padAxisMap[k] = saved[k];
      }
      for (const k of ["throttleRest", "throttleFar", "brakeRest", "brakeFar"]) {
        if (typeof saved[k] === "number" && Math.abs(saved[k]) <= 1.5) padAxisMap[k] = saved[k];
      }
      if (padAxisMap.brake != null && padAxisMap.brake === padAxisMap.throttle) padAxisMap.brake = padAxisMap.brakeRest = padAxisMap.brakeFar = null;
    }
    padPedalSignature = JSON.stringify(padAxisMap);
    if (owner) invalidateAxisRest(padIdOf(owner), previous);
    profileChanged();
    return getPadAxisMap();
  }
  function getPadAxisMap() { return Object.assign({}, padAxisMap); }
  function ensureDeviceProfiles() {
    if (deviceProfiles || typeof ControllerProfiles === "undefined" || typeof GameStore === "undefined" || !GameStore.store) return deviceProfiles;
    const profileMap = ControllerProfiles.clean(GameStore.store.get(ControllerProfiles.KEY, null));
    if (!profileMap.legacyClaimed) {
      const legacyAxes = GameStore.store.get("padAxes", null), legacyButtons = GameStore.store.get("pad", null);
      if (legacyAxes) setPadAxisMap(legacyAxes);
      if (legacyButtons) setPadMap(legacyButtons);
    }
    const legacyWheel = !padAxesAreDefault();
    deviceProfiles = ControllerProfiles.create({
      legacyMatches: (pad) => !legacyWheel || pad.mapping !== "standard",
      store: GameStore.store,
      snapshot: () => ({ axes: getPadAxisMap(), buttons: getPadMap() }),
      apply: (row) => { setPadAxisMap(row.axes); setPadMap(row.buttons); },
      defaults: () => ({ axes: null, buttons: null }),
      changed: () => { if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("apexcontrollerprofilechange")); },
    });
    return deviceProfiles;
  }

  function invalidateAxisRest(id, previous) {
    if (previous.steer === padAxisMap.steer && previous.steerInvert === padAxisMap.steerInvert) return;
    padRestMap.delete(id);
    padRestLegacy = null; padRestOffset = 0;
    if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("padRest", padRestStore());
  }
  function resetControllerProfile() {
    const current = deviceProfiles && deviceProfiles.current();
    if (!current) return false;
    const previous = getPadAxisMap();
    if (!deviceProfiles.reset()) return false;
    invalidateAxisRest(current.id, previous);
    return true;
  }

  let padAxisDefKeys = null;
  function padAxesAreDefault() {
    if (!padAxisDefKeys) padAxisDefKeys = Object.keys(PAD_AXIS_DEF);
    for (let i = 0; i < padAxisDefKeys.length; i++) {
      const k = padAxisDefKeys[i];
      if (padAxisMap[k] !== PAD_AXIS_DEF[k]) return false;
    }
    return true;
  }
  const padIdOf = (p) => String((p && p.id) || "").slice(0, 120);
  const restOk = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 0.5;
  function restFor(p) {
    if (!p) return 0;
    const id = padIdOf(p);
    if (padRestLegacy !== null) { if (!padRestMap.has(id)) padRestMap.set(id, padRestLegacy); padRestLegacy = null; }
    return padRestMap.get(id) || 0;
  }
  function padCalibrationOwner() {
    const pads = readPads(), pad = pickPad(pads, null, wheelFirst());
    return pad ? padKey(pad, Array.prototype.indexOf.call(pads, pad)) : null;
  }
  function calibratePad(expectedOwner) {
    const pads = readPads(), pad = pickPad(pads, null, wheelFirst());
    if (!pad || !pad.axes || (expectedOwner !== undefined && expectedOwner !== padKey(pad, Array.prototype.indexOf.call(pads, pad)))) return false;
    const v = readPadAxis(pad.axes, padAxisMap.steer) * padAxisMap.steerInvert;
    if (Math.abs(v) > 0.5) return false;
    padRestLegacy = null;
    if (v) padRestMap.set(padIdOf(pad), v); else padRestMap.delete(padIdOf(pad));
    padRestOffset = v;
    try { Log.info("input", `pad calibrated, rest offset ${v.toFixed(3)}`); } catch (_) {  }
    return true;
  }
  function padRest() {
    const p = activePad();
    return p ? restFor(p) : (padRestLegacy !== null ? padRestLegacy : padRestOffset);
  }
  function padRestStore() {
    if (padRestLegacy !== null) return padRestLegacy;
    return padRestMap.size ? Object.fromEntries(padRestMap) : 0;
  }
  function setPadRest(v) {
    padRestMap.clear(); padRestLegacy = null; padRestOffset = 0;
    if (restOk(v)) { if (v) padRestLegacy = v; }
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of Object.keys(v).slice(0, 16)) if (restOk(v[k]) && v[k]) padRestMap.set(k.slice(0, 120), v[k]);
    }
    return padRestLegacy !== null ? padRestLegacy : 0;
  }
  const PAD_AXIS_DEF = { steer: 0, steerInvert: 1, throttle: null, brake: null, pedalInvert: 1,
    throttleRest: null, throttleFar: null, brakeRest: null, brakeFar: null };
  let padAxisMap = Object.assign({}, PAD_AXIS_DEF);
  let padPedalSignature = JSON.stringify(padAxisMap);
  let axisCaptureCb = null;
  let axisCaptureOwner = null;
  let axisCaptureSkip = new Set();
  let axisCaptureRest = null;
  function readPadAxis(axes, i) {
    if (i == null) return 0;
    const v = axes[i];
    return (typeof v === "number" && isFinite(v)) ? v : 0;
  }
  function readLookAxis(axes, i) {
    return i === padAxisMap.steer || i === padAxisMap.throttle || i === padAxisMap.brake ? 0 : readPadAxis(axes, i);
  }
  function padAxisShape(raw, rest = padRestOffset, wheel = padIsWheel) {
    const d = raw - rest;
    const v = clamp(d >= 0 ? d / (1 - rest) : d / (1 + rest), -1, 1);
    const a = Math.abs(v);
    const dz = wheel && padDeadzone === PAD_DZ_DEFAULT ? 0 : padDeadzone;
    if (a <= dz) return 0;
    const span = Math.max(0.05, 1 - dz - padSaturation);
    return clamp(Math.sign(v) * (a - dz) / span, -1, 1);
  }
  let padPedalSeen = { throttle: false, brake: false };
  const padPedalSeenByDevice = new Map();
  function selectPedalState(key) {
    const signature = padPedalSignature;
    let row = padPedalSeenByDevice.get(key);
    if (!row || row.signature !== signature) {
      row = { signature, seen: { throttle: false, brake: false } };
      padPedalSeenByDevice.set(key, row);
    }
    padPedalSeen = row.seen;
  }
  function padPedalAxis(axes, which, seen = padPedalSeen) {
    const i = padAxisMap[which];
    if (i == null) return 0;
    const raw = readPadAxis(axes, i);
    if (raw !== 0) seen[which] = true;
    if (!seen[which]) return 0;
    const rest = padAxisMap[which + "Rest"], far = padAxisMap[which + "Far"];
    if (rest != null && far != null && Math.abs(far - rest) >= 0.3) return clamp((raw - rest) / (far - rest), 0, 1);
    const v = raw * padAxisMap.pedalInvert;
    return clamp((v + 1) / 2, 0, 1);
  }
  const PAD_PEDAL_DZ = 0.12;
  function padPedalLevel(v) { return v > PAD_PEDAL_DZ ? clamp((v - PAD_PEDAL_DZ) / (1 - PAD_PEDAL_DZ), 0, 1) : 0; }
  function padDpadSteer(pad) {
    const dp = padStd(pad);
    const left = dp && btnDown(pad, 14), right = dp && btnDown(pad, 15);
    if (left && !padDpadLeftHeld) padDpadLeftSeq = ++padDpadSeq;
    if (right && !padDpadRightHeld) padDpadRightSeq = ++padDpadSeq;
    padDpadLeftHeld = left; padDpadRightHeld = right;
    padDpadTarget = left && right ? (padDpadRightSeq > padDpadLeftSeq ? 1 : -1)
      : (right ? 1 : 0) - (left ? 1 : 0);
    return padDpadVal;
  }
  function advanceDpad() {
    const t = nowMs();
    if (padDpadTarget === 0 && padDpadVal === 0) { padDpadT = t; }
    else {
      const dt = rampDtSince(padDpadT, t);
      padDpadT = t;
      padDpadVal = digitalStep(padDpadVal, padDpadTarget, dt);
    }
    if (!padSteerAnalog) padSteer = padDpadVal;
  }
  function padActVal(pad, id) {
    let v = 0;
    for (const b of bindings.padButtons(id)) if (b != null) v = Math.max(v, clamp(btnVal(pad, b), 0, 1));
    return v;
  }
  function parkedPadPreview() {
    const pad = activePad();
    if (!pad) return null;
    const axes = pad.axes || [];
    const rest = padRestMap.get(padIdOf(pad)) || (padRestLegacy !== null ? padRestLegacy : 0);
    const wheel = !padStd(pad) && !padAxesAreDefault();
    const stick = padAxisShape(readPadAxis(axes, padAxisMap.steer) * padAxisMap.steerInvert, rest, wheel);
    const seen = Object.assign({}, padPedalSeen);
    return {
      steer: analogShape(stick, wheel ? "wheel" : "pad"),
      throttle: padPedalLevel(Math.max(padActVal(pad, "throttle"), padPedalAxis(axes, "throttle", seen))),
      brake: padPedalLevel(Math.max(padActVal(pad, "brake"), padPedalAxis(axes, "brake", seen))),
    };
  }
  function padActEdge(pad, id) {
    for (const b of bindings.padButtons(id)) if (b != null && btnEdge(pad, b)) return true;
    return false;
  }

  function heldAction(id) {
    for (const code of heldKeys) if (bindings.keyAction(code) === id) return true;
    return false;
  }
  function syncHeldKeys() {
    keyLeft = heldAction("left"); keyRight = heldAction("right");
    keyBrake = heldAction("brake");
    keyThrottle = throttleIsToggle() ? keyThrottleToggle : heldAction("throttle");
    keyLookBack = lookBackIsToggle() ? keyLookBackToggle : heldAction("lookBack");
  }
  function onKey(e, down) {
    const active = document.activeElement;
    const tag = (active && active.tagName) || (e.target && e.target.tagName) || "";
    const interactive = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
      tag === "BUTTON" || tag === "A" || (active && active.isContentEditable);
    const hudControl = active && active.matches &&
      active.matches("#btn-cam, #pausebtn, #hud-restore, #pc-restore, .touchbtn");
    const typing = interactive && !hudControl;
    if (down && e.isTrusted !== false && !(tag === "INPUT" || tag === "TEXTAREA" || (active && active.isContentEditable))) {
      kbSeen = true;
      noteInputSource("keyboard");
    }
    const nativeHudActivation = tag === "BUTTON" && active && active.matches &&
      active.matches("#btn-cam, #pausebtn, #hud-restore, #pc-restore") &&
      (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter");
    if (nativeHudActivation) {
      if (!down) { heldKeys.delete(e.code); syncHeldKeys(); }
      return;
    }
    if (down && (e.code === "MetaLeft" || e.code === "MetaRight" || e.code === "AltLeft" || e.code === "AltRight")) {
      heldKeys.clear();
      keyLeft = keyRight = keyThrottle = keyBrake = keyLookBack = false;
      clearDriveToggles();
    }
      const act = bindings.keyAction(e.code);
      const printable = (e.key && e.key.length === 1) || /^(Key|Digit)/.test(e.code || "");
      const inTextField = tag === "INPUT" || tag === "TEXTAREA" || !!(active && active.isContentEditable) ||
        (tag === "SELECT" && act === "pause" && printable);
      if (down && !e.repeat && (act === "pause" || e.code === "Escape") && !inTextField) {
      if (act === "pause") {
        clearDriveToggles();
        if (onPauseCb) onPauseCb();
        return;
      }
      if (onPauseCb && window.UiLayers && window.UiLayers.inRace() && !window.UiLayers.anyOpen()) {
        onPauseCb();
        e.preventDefault();
      }
      return;
    }
    if (down && (e.metaKey || e.ctrlKey)) return;
    if (menuOverlayOpen() || typing) {
      if (down) return;
      heldKeys.delete(e.code); syncHeldKeys();
      return;
    }
    if (["left", "right", "throttle", "brake", "lookBack"].includes(act)) {
      const toggle = (act === "throttle" && throttleIsToggle()) || (act === "lookBack" && lookBackIsToggle());
      if (toggle) {
        if (down && !e.repeat) {
          if (act === "throttle") keyThrottleToggle = !keyThrottleToggle;
          else keyLookBackToggle = !keyLookBackToggle;
          e.preventDefault();
        }
        syncHeldKeys();
        return;
      }
      if (down) {
        if (!heldKeys.has(e.code)) {
          if (act === "left") keyLeftSeq = ++keySeq;
          if (act === "right") keyRightSeq = ++keySeq;
        }
        heldKeys.add(e.code); e.preventDefault();
      } else heldKeys.delete(e.code);
      syncHeldKeys();
      return;
    }
    const edge = down && !e.repeat;
    switch (act) {
      case "boost": if (edge) boostTogglePressed = true; e.preventDefault(); break;
      case "overtake": if (edge) overtakePressed = true; break;
      case "aero": if (edge) aeroTogglePressed = true; break;
      case "shiftUp": if (edge) shiftUpPressed = true; break;
      case "shiftDown": if (edge) shiftDownPressed = true; break;
      case "camera": if (edge) cameraCyclePressed = true; break;
      case "recover": if (edge) recoverPressed = true; break;
      case "radio": if (edge) radioPressed = true; break;
      case "mirror": if (edge) mirrorPressed = true; break;
    }
  }

  const TOUCH_RANGE_FRAC = 0.12;
  const TOUCH_DEAD_PX = 5;
  let touchRangeFrac = TOUCH_RANGE_FRAC;
  let touchSpeedMix = 0;
  const TOUCH_SPEED_FLOOR = 0.05;

  function touchSpeedScale() {
    if (touchSpeedMix <= 0 || adaptiveMix <= 0) return 1;
    const ratio = digitalRateIn() / KEY_RAMP_IN;
    const scale = 1 - touchSpeedMix * (1 - ratio);
    return scale < TOUCH_SPEED_FLOOR ? TOUCH_SPEED_FLOOR : scale;
  }

  function touchRangePx() {
    return Math.max(40, viewLong() * touchRangeFrac) / touchSpeedScale();
  }
  let _viewLong = 0;
  function viewLong() {
    if (!_viewLong) {
      const win = typeof window !== "undefined" ? window : null;
      _viewLong = Math.max((win && win.innerWidth) || 844, (win && win.innerHeight) || 390);
    }
    return _viewLong;
  }
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("resize", () => { _viewLong = 0; });

  function touchCmd(rec) {
    if (steerMode !== "touch") return 0;
    const dx = rec.x - rec.anchorX;
    const a = Math.abs(dx);
    if (a <= TOUCH_DEAD_PX) return 0;
    return clamp(Math.sign(dx) * (a - TOUCH_DEAD_PX) / touchRangePx(), -1, 1);
  }

  function onCanvasPointerMove(e) {
    if (steerMode !== "touch" || touches.size !== 1) return;
    if (e.pointerType !== "touch" || e.isPrimary === false) return;
    if (!canvasTouchIsDriving()) return;
    if (typeof e.getCoalescedEvents !== "function") return;
    let list;
    try { list = e.getCoalescedEvents(); } catch (_) { return; }
    if (!list || list.length < 2) return;
    const last = list[list.length - 1];
    if (!last || typeof last.clientX !== "number") return;
    for (const rec of touches.values()) { rec.x = last.clientX; rec.seq = ++touchSeq; }
    recomputeTouchSteer();
  }

  const DRAG_OE_DCUTOFF = 1.0;
  let dragMinCutoff = 0;
  let dragOePrev = 0, dragOeDPrev = 0, dragOeInit = false;
  function setDragSmoothing(hz) {
    if (typeof hz !== "number" || !isFinite(hz)) return;
    dragMinCutoff = clamp(hz, 0, 8);
    if (dragMinCutoff <= 0) dragOeInit = false;
  }
  function tiltFilterClear() { oeInit = false; oePrev = 0; oeDPrev = 0; tiltSteerVal = 0; tiltSteerT = 0; lastOrientMs = 0; }
  function dragFilterClear() { dragOeInit = false; dragOePrev = 0; dragOeDPrev = 0; }
  function dragFilter(x, dt) {
    if (dragMinCutoff <= 0) return x;
    if (!dragOeInit) { dragOePrev = x; dragOeDPrev = 0; dragOeInit = true; return x; }
    if (dt <= 0) return dragOePrev;
    const dx = (x - dragOePrev) / dt;
    const dxHat = dragOeDPrev + oeAlpha(DRAG_OE_DCUTOFF, dt) * (dx - dragOeDPrev);
    const cutoff = dragMinCutoff + OE_BETA * Math.abs(dxHat);
    const xHat = dragOePrev + oeAlpha(cutoff, dt) * (x - dragOePrev);
    dragOePrev = xHat; dragOeDPrev = dxHat;
    return xHat;
  }

  function recomputeTouchSteer() {
    let best = -1;
    touchActive = false;
    for (const rec of touches.values()) {
      if (rec.seq > best) { best = rec.seq; touchSteer = touchCmd(rec); touchActive = true; }
    }
    if (!touchActive) touchSteer = 0;
    updateDragAnchor();
  }

  function canvasTouchIsDriving() { return !menuOverlayOpen(); }

  let dragMark = undefined;
  let dragDotEl = null;
  const DRAG_DOT_CSS = "position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;pointer-events:none;background:rgba(255,255,255,0.65);box-shadow:0 0 0 2px rgba(0,0,0,0.5)";
  function dragMarkEl() {
    if (dragMark === undefined) dragMark = document.getElementById("drag-anchor") || null;
    return dragMark;
  }
  function dragDot(mark) {
    if (dragDotEl && dragDotEl.parentNode === mark) return dragDotEl;
    dragDotEl = null;
    if (typeof mark.appendChild === "function" && typeof document.createElement === "function") {
      dragDotEl = document.createElement("span");
      dragDotEl.setAttribute("aria-hidden", "true");
      if (dragDotEl.style) dragDotEl.style.cssText = DRAG_DOT_CSS;
      mark.appendChild(dragDotEl);
    }
    return dragDotEl;
  }
  function steeringTouchRec() {
    let best = -1, pick = null;
    for (const rec of touches.values()) {
      if (rec.seq > best) { best = rec.seq; pick = rec; }
    }
    return pick;
  }
  function hideDragAnchor() {
    const mark = dragMarkEl();
    if (mark) mark.classList.remove("on");
  }
  function updateDragAnchor() {
    if (steerMode !== "touch" || !canvasTouchIsDriving()) { hideDragAnchor(); return; }
    const rec = steeringTouchRec();
    if (!rec) { hideDragAnchor(); return; }
    const mark = dragMarkEl();
    if (!mark) return;
    mark.style.left = rec.anchorX + "px";
    mark.style.top = rec.anchorY + "px";
    const dx = rec.x - rec.anchorX;
    const adx = Math.abs(dx);
    const range = touchRangePx();
    const offPx = adx <= TOUCH_DEAD_PX ? 0 : Math.sign(dx) * Math.min(adx - TOUCH_DEAD_PX, range);
    const dot = dragDot(mark);
    if (dot && dot.style) dot.style.transform = "translateX(" + offPx + "px)";
    mark.classList.add("on");
  }

  function onTouchStart(e) {
    if (!canvasTouchIsDriving()) return;
    noteInputSource("touch");
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.set(t.identifier, {
        anchorX: t.clientX, anchorY: t.clientY, x: t.clientX, seq: ++touchSeq,
      });
    }
    recomputeTouchSteer();
  }

  function onTouchMove(e) {
    if (!canvasTouchIsDriving()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (rec) { rec.x = t.clientX; rec.seq = ++touchSeq; }
    }
    recomputeTouchSteer();
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.delete(t.identifier);
    }
    recomputeTouchSteer();
  }

  function touchSteering() {
    const t = nowMs();
    const dt = rampDtSince(touchSteerT, t);
    touchSteerT = t;
    if (touchActive) { touchSteerVal = dragFilter(touchSteer, dt > 0 ? dt : 0.016); return touchSteerVal; }
    dragOeInit = false;
    touchSteerVal = moveToward(touchSteerVal, 0, KEY_RAMP_OUT * dt);
    return touchSteerVal;
  }

  function buttonSteering() {
    if (!btnSteerLeft && !btnSteerRight && btnSteerVal === 0) { btnSteerT = nowMs(); return 0; }
    const t = nowMs();
    const dt = rampDtSince(btnSteerT, t);
    btnSteerT = t;
    const left = btnSteerLeft ? (1 + (btnSteerLeftVal - 1) * adaptiveMix) : 0;
    const right = btnSteerRight ? (1 + (btnSteerRightVal - 1) * adaptiveMix) : 0;
    const target = btnSteerLeft && btnSteerRight
      ? (btnSteerRightSeq > btnSteerLeftSeq ? right : -left)
      : right - left;
    btnSteerVal = digitalStep(btnSteerVal, target, dt);
    return btnSteerVal;
  }

  function paintLatch() {
    const el = typeof document !== "undefined" && document.getElementById("btn-throttle");
    if (!el) return;
    el.classList.toggle("on", throttleLatch && throttleLatched);
    if (throttleLatch) el.setAttribute("aria-pressed", throttleLatched ? "true" : "false");
    else el.removeAttribute("aria-pressed");
  }
  const holdButtons = InputHoldButtons.create({
    clamp,
    beforeReleaseAll(keepLatch) { if (!keepLatch) { throttleLatched = false; paintLatch(); } },
  });
  const { wireHold, wireTap, holdReleasePointer, holdReleaseAll, holdTargetGone, lostCaptureShouldRelease } = holdButtons;

  function readPads() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    try { return navigator.getGamepads(); } catch (e) {
      if (!padPollWarned) {
        padPollWarned = true;
        Log.warn("input", `gamepad poll failed: ${(e && e.message) || e}`);
      }
      return null;
    }
  }
  function activePad() { return pickPad(readPads(), null, wheelFirst()); }
  function wheelFirst() { return !!axisCaptureCb || !padAxesAreDefault(); }
  const PAD_WAKE = 0.3;
  const padUse = new Map();
  const padUseLive = new Set();
  const padStd = (p) => p.mapping == null || p.mapping === "standard";
  function padKey(p, slot) { return (Number.isInteger(p.index) ? p.index : slot) + ":" + p.id; }
  function notePadUse(pads, t) {
    if (!pads) return;
    padUseLive.clear();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const k = padKey(p, i), axes = p.axes || [], nb = p.buttons ? p.buttons.length : 0;
      padUseLive.add(k);
      let rec = padUse.get(k), used = false;
      if (!rec) { rec = { axes: [], btn: [], usedAt: 0 }; padUse.set(k, rec); }
      else {
        for (let a = 0; a < axes.length; a++) {
          if (typeof rec.axes[a] === "number" && Math.abs(readPadAxis(axes, a) - rec.axes[a]) >= PAD_WAKE) used = true;
        }
        for (let b = 0; b < nb; b++) if (btnDown(p, b) && !rec.btn[b]) used = true;
      }
      if (used || !rec.axes.length) for (let a = 0; a < axes.length; a++) rec.axes[a] = readPadAxis(axes, a);
      for (let b = 0; b < nb; b++) rec.btn[b] = btnDown(p, b);
      if (used) rec.usedAt = t > 0 ? t : 1;
    }
    for (const k of padUse.keys()) if (!padUseLive.has(k)) padUse.delete(k);
    for (const k of padPedalSeenByDevice.keys()) if (!padUseLive.has(k)) padPedalSeenByDevice.delete(k);
  }
  function pickPad(pads, lastUse, preferWheel) {
    if (typeof lastUse === "boolean") { preferWheel = lastUse; lastUse = null; }
    if (!pads) return null;
    const useOf = typeof lastUse === "function" ? lastUse
      : (p, i) => { const r = padUse.get(padKey(p, i)); return r ? r.usedAt : 0; };
    let best = null, bestU = 0, bestStd = false, bestT = -Infinity;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const u = +useOf(p, i) || 0;
      const std = (p.mapping === "standard") !== !!preferWheel;
      const t = Number.isFinite(p.timestamp) ? p.timestamp : 0;
      const better = !best || u > bestU ||
        (u === bestU && ((std && !bestStd) || (std === bestStd && t > bestT)));
      if (better) { best = p; bestU = u; bestStd = std; bestT = t; }
    }
    return best;
  }

  function btnVal(pad, i) {
    const b = pad.buttons && pad.buttons[i];
    if (b == null) return 0;
    return typeof b === "object" ? b.value : b;
  }
  function btnDown(pad, i) {
    const b = pad.buttons && pad.buttons[i];
    if (b == null) return false;
    return typeof b === "object" ? b.pressed : b > 0.5;
  }
  function btnEdge(pad, i) {
    return btnDown(pad, i) && !padPrevButtons[i];
  }
  function padLogId(e) {
    const raw = (e && e.gamepad && e.gamepad.id) || "";
    return String(raw).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80);
  }

  let remoteWas = false;
  function pollGamepad() {
    haptics.flush();
    const rAct = remoteActive();
    if (remoteWas && !rAct && onPadLostCb) { try { onPadLostCb(); } catch (_) {  } }
    remoteWas = rAct;
    if (!padConnected) {
      const t = nowMs();
      if (t < _padNextProbeMs) return;
      if (!_padLostAt) _padLostAt = t;
      if (!activePad()) {
        const age = t - _padLostAt;
        _padNextProbeMs = t + (age < PAD_PROBE_FAST_MS ? 0 : PAD_PROBE_SLOW_MS);
        return;
      }
      padConnected = true;
      _padLostAt = 0;
      _padNextProbeMs = 0;
    }
    const pads = readPads();
    notePadUse(pads, nowMs());
    const pad = pickPad(pads, null, wheelFirst());
    if (pad) {
      if (!padPrevByIndex.has(pad.index)) padPrevByIndex.set(pad.index, []);
      padPrevButtons = padPrevByIndex.get(pad.index);
    }
    if (!pad) {
      const lostNow = nowMs();
      if (padConnected || !_padLostAt) _padLostAt = lostNow;
      padConnected = false;
      _padNextProbeMs = 0;
      padSteer = 0; padThrottle = false; padBrake = false;
      padThrottleVal = 0; padBrakeVal = 0;
      padSteerAnalog = false; padLookBack = false;
      lookStickX = 0; lookStickY = 0;
      padDpadTarget = 0; padDpadVal = 0; padDpadT = 0;
      padDpadLeftHeld = padDpadRightHeld = false;
      padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
      padIsWheel = false;
      if (padPrevKey !== null) padSnapshotLost = true;
      padThrottleToggle = padLookBackToggle = false;
      if (padPrevButtons.length) padPrevButtons.length = 0;
      padPrevKey = null;
      padPrevByIndex.clear();
      padMenu.reset();
      if (inputSource === "controller") inputSource = null;
      return;
    }
    padConnected = true;
    const key = padKey(pad, Array.prototype.indexOf.call(pads, pad));
    if (padSnapshotLost || (padPrevKey !== null && key !== padPrevKey)) {
      const nb = pad.buttons ? pad.buttons.length : 0;
      padPrevButtons.length = nb;
      for (let i = 0; i < nb; i++) padPrevButtons[i] = btnDown(pad, i);
    }
    padSnapshotLost = false;
    padPrevKey = key;
    const profiles = ensureDeviceProfiles();
    if (profiles) profiles.activate(pad);
    selectPedalState(key);
    padRestOffset = restFor(pad);
    padIsWheel = !padStd(pad) && !padAxesAreDefault();
    if (axisExt && key === axisExt.key && nowMs() <= axisExt.until) {
      const ev = readPadAxis(pad.axes || [], axisExt.axis);
      if (Math.abs(ev - axisExt.rest) > Math.abs(axisExt.far - axisExt.rest)) axisExt.far = ev;
    }
    if (!padMapWarned && pad.mapping !== "standard") {
      padMapWarned = true;
      Log.warn("input", `gamepad mapping "${pad.mapping}" is not "standard": button/axis indices may not match`);
    }
    const axes = pad.axes || [];
    const stick = padAxisShape(readPadAxis(axes, padAxisMap.steer) * padAxisMap.steerInvert);
    {
      const std = pad.mapping === "standard";
      const rx = std ? readLookAxis(axes, 2) : 0, ry = std ? readLookAxis(axes, 3) : 0;
      const mag = Math.hypot(rx, ry);
      if (mag < LOOK_STICK_DEAD) { lookStickX = 0; lookStickY = 0; }
      else {
        const t = (mag - LOOK_STICK_DEAD) / (1 - LOOK_STICK_DEAD);
        lookStickX = (rx / mag) * t;
        lookStickY = (ry / mag) * t;
      }
    }
    const dpad = padDpadSteer(pad);
    padSteerAnalog = Math.abs(stick) > 0.001;
    padSteer = padSteerAnalog ? stick : dpad;
    const padOwnsDrive = !axisCaptureCb && !padCaptureCb && !(window.UiLayers && window.UiLayers.navOpen());
    if (throttleIsToggle()) {
      if (padOwnsDrive && padActEdge(pad, "throttle")) padThrottleToggle = !padThrottleToggle;
      padThrottle = padThrottleToggle;
      padThrottleVal = padThrottleToggle ? 1 : 0;
    } else {
      padThrottleVal = padPedalLevel(Math.max(padActVal(pad, "throttle"), padPedalAxis(axes, "throttle")));
      padThrottle = padThrottleVal > 0;
    }
    padBrakeVal = padPedalLevel(Math.max(padActVal(pad, "brake"), padPedalAxis(axes, "brake")));
    padBrake = padBrakeVal > 0;
    let padActive = Math.abs(stick) > 0.05 || Math.abs(dpad) > 0.05 ||
      padThrottleVal > 0 || padBrakeVal > 0;
    if (!padActive && pad.buttons) {
      for (let i = 0; i < pad.buttons.length; i++) {
        if (btnDown(pad, i) && !padPrevButtons[i]) { padActive = true; break; }
      }
    }
    if (padActive) noteInputSource("controller");
    if (axisCaptureCb) {
      padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; padSteer = 0;
      padSteerAnalog = false; padLookBack = false; padDpadTarget = padDpadVal = 0; padMenu.releaseDirection();
      pollAxisCapture(pads);
    } else if (padCaptureCb) {
      padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; padSteer = 0;
      padSteerAnalog = false; padLookBack = false; padDpadTarget = padDpadVal = 0;
      padMenu.releaseDirection();
      const nb = pad.buttons ? pad.buttons.length : 0;
      for (let i = 0; i < nb; i++) if (btnEdge(pad, i)) { padCaptureCb(i); break; }
    } else {
      if (padActEdge(pad, "pause")) { clearDriveToggles(); if (onPauseCb) onPauseCb(); }
      if (window.UiLayers && window.UiLayers.navOpen()) {
        padThrottle = padBrake = false;
        padThrottleVal = padBrakeVal = 0;
        padLookBack = false;
        padSteer = 0; padSteerAnalog = false; padDpadTarget = 0; padDpadVal = 0;
        padMenu.poll(pad);
      } else {
        padMenu.reset();
        if (padActEdge(pad, "boost")) boostTogglePressed = true;
        if (padActEdge(pad, "overtake")) overtakePressed = true;
        if (padActEdge(pad, "aero")) aeroTogglePressed = true;
        if (padActEdge(pad, "shiftUp")) shiftUpPressed = true;
        if (padActEdge(pad, "shiftDown")) shiftDownPressed = true;
        if (padActEdge(pad, "camera")) cameraCyclePressed = true;
        if (padActEdge(pad, "recover")) recoverPressed = true;
        if (padActEdge(pad, "radio")) radioPressed = true;
        if (padActEdge(pad, "mirror")) mirrorPressed = true;
        if (lookBackIsToggle()) {
          if (padOwnsDrive && padActEdge(pad, "lookBack")) padLookBackToggle = !padLookBackToggle;
          padLookBack = padLookBackToggle;
        } else padLookBack = padActVal(pad, "lookBack") > 0.5;
      }
    }
    const n = pad.buttons ? pad.buttons.length : 0;
    padPrevButtons.length = n;
    for (let i = 0; i < n; i++) padPrevButtons[i] = btnDown(pad, i);
  }

  const padMenu = InputPadMenu.create({ btnDown, btnEdge, nowMs, getPadAxisMap: () => padAxisMap, padRest: () => padRestOffset,
    padButtons: (id) => bindings.padButtons(id), padBrand: (p) => bindings.padBrand(p) });

  function padSteerActive() {
    return padConnected && Math.abs(padSteer) > 0.001;
  }

  const haptics = InputHaptics.create({
    clamp, activePad, padConnected: () => padConnected, remoteActive,
    remoteHaptics: () => remoteHaptics, now: nowMs,
  });
  const { setHaptics, setTriggerHaptics, hapticsSupported,
    triggerRumbleSupported, primeHaptics, vibrate, rumble } = haptics;

  const analogTrim = { tilt: 1, touch: 1, pad: 1 };
  const ANALOG_SPEED_FLOOR = 0.40;
  let analogSpeedMix = 0;
  function analogSpeedGain() {
    if (analogSpeedMix <= 0) return 1;
    const ref = steerSpeedRef > 1 ? steerSpeedRef : 41.7;
    const v = currentSpeedStd();
    return 1 - analogSpeedMix * (1 - ANALOG_SPEED_FLOOR) * (v / (v + ref));
  }
  function analogShape(v, src) {
    const t = (analogTrim[src === "wheel" ? "pad" : src] || 1) / (src === "wheel" ? steerExpo : 1);
    const shaped = t === 1 ? v : Math.sign(v) * Math.pow(Math.abs(v), t);
    return clamp(shaped * analogSpeedGain(), -1, 1);
  }

  function steer(stepDt) {
    rampDt = (typeof stepDt === "number" && stepDt > 0 && isFinite(stepDt)) ? Math.min(0.1, stepDt) : null;
    try { return steerNow(); } finally { rampDt = null; }
  }
  function steerNow() {
    if (padConnected) advanceDpad();
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    if (padSteerActive()) return padSteerAnalog ? analogShape(padSteer, padIsWheel ? "wheel" : "pad") : padSteer;
    if (remoteSteers()) return remoteDrivingBlocked() ? 0 : remStick ? analogShape(remSteer, "pad") : analogShape(tiltSteering(), "tilt");
    if (steerMode === "buttons") return navBlocksTouch() ? 0 : buttonSteering();
    if (tiltActive()) return analogShape(tiltSteering(), "tilt");
    return navBlocksTouch() ? 0 : analogShape(touchSteering(), "touch");
  }

  const REMOTE_PEDAL_ON = 0.1;
  function remotePedalLevel(v) { return v > REMOTE_PEDAL_ON ? clamp((v - REMOTE_PEDAL_ON) / (1 - REMOTE_PEDAL_ON), 0, 1) : 0; }
  function remoteThrottle() { return remoteActive() && !remoteDrivingBlocked() && remThr > REMOTE_PEDAL_ON; }
  function remoteBrake() { return remoteActive() && !remoteDrivingBlocked() && remBrk > REMOTE_PEDAL_ON; }
  let _navLatch = -1;
  function navBlocksTouchLive() { return !!(window.UiLayers && window.UiLayers.anyOpen()); }
  function navBlocksTouch() { return _navLatch < 0 ? navBlocksTouchLive() : _navLatch === 1; }
  function poll() {
    const menu = menuOverlayOpen();
    if (menu && !_menuWasOpen) clearDriveToggles();
    _menuWasOpen = menu;
    const inRace = !!(window.UiLayers && typeof window.UiLayers.inRace === "function" && window.UiLayers.inRace());
    if (_wasInRace && !inRace) clearDriveToggles();
    _wasInRace = inRace;
    pollGamepad();
    _navLatch = navBlocksTouchLive() ? 1 : 0;
  }

  function throttle() {
    return keyThrottle || (!navBlocksTouch() && btnThrottle) || padThrottle || remoteThrottle();
  }

  function braking() {
    return keyBrake || (!navBlocksTouch() && btnBrake) || padBrake || remoteBrake();
  }

  function throttleLevel() {
    if (keyThrottle) return 1;
    if (btnThrottle && !navBlocksTouch()) return throttleLatch && throttleLatched ? 1 : btnThrottleVal;
    if (remoteThrottle()) return remotePedalLevel(remThr);
    return padThrottleVal;
  }
  function brakeLevel() {
    if (keyBrake) return 1;
    if (btnBrake && !navBlocksTouch()) return btnBrakeVal;
    if (remoteBrake()) return remotePedalLevel(remBrk);
    return padBrakeVal;
  }

  function consumeBoostToggle() {
    const v = boostTogglePressed;
    boostTogglePressed = false;
    return v;
  }

  function consumeOvertake() {
    const v = overtakePressed;
    overtakePressed = false;
    return v;
  }

  function consumeAeroToggle() {
    const v = aeroTogglePressed;
    aeroTogglePressed = false;
    return v;
  }

  function consumeShiftUp() {
    const v = shiftUpPressed;
    shiftUpPressed = false;
    return v;
  }

  function consumeShiftDown() {
    const v = shiftDownPressed;
    shiftDownPressed = false;
    return v;
  }

  function consumeCameraCycle() {
    const v = cameraCyclePressed;
    cameraCyclePressed = false;
    return v;
  }

  function consumeRecover() {
    const v = recoverPressed;
    recoverPressed = false;
    return v;
  }

  function consumeRadio() {
    const v = radioPressed;
    radioPressed = false;
    return v;
  }
  function consumeMirror() {
    const v = mirrorPressed;
    mirrorPressed = false;
    return v;
  }

  function lookingBack() { return keyLookBack || padLookBack || (remoteActive() && !remoteDrivingBlocked() && !!(remHeld & REMOTE_HELD.lookBack)); }

  const _lookStickOut = { x: 0, y: 0 }, _lookMouseOut = { dx: 0, dy: 0 };
  function lookStick() { _lookStickOut.x = lookStickX; _lookStickOut.y = lookStickY; return _lookStickOut; }
  function lookMouseHeld() { return lookMouseDown; }
  function consumeLookMouse() {
    const o = _lookMouseOut;
    o.dx = lookMouseDx; o.dy = lookMouseDy;
    lookMouseDx = 0; lookMouseDy = 0;
    return o;
  }

  function lockEscape() {
    const kb = typeof navigator !== "undefined" && navigator.keyboard;
    if (!kb || typeof kb.lock !== "function") return Promise.resolve(false);
    return Promise.resolve(kb.lock(["Escape"])).then(() => true).catch(() => false);
  }
  function unlockEscape() {
    const kb = typeof navigator !== "undefined" && navigator.keyboard;
    if (kb && typeof kb.unlock === "function") { try { kb.unlock(); } catch (_) {  } }
  }
  let _landscapeLocked = false, _landscapeWanted = false;
  function landscapeUnlockNow() {
    const o = typeof screen !== "undefined" && screen.orientation;
    if (o && typeof o.unlock === "function") { try { o.unlock(); } catch (_) {  } }
  }
  function lockLandscape() {
    const o = typeof screen !== "undefined" && screen.orientation;
    if (!o || typeof o.lock !== "function" || !touchControlsNeeded()) return Promise.resolve(false);
    _landscapeWanted = true;
    return Promise.resolve(o.lock("landscape")).then(() => {
      if (!_landscapeWanted) { landscapeUnlockNow(); return false; }
      return (_landscapeLocked = true);
    }).catch(() => false);
  }
  function unlockLandscape() {
    _landscapeWanted = false;
    if (!_landscapeLocked) return;
    _landscapeLocked = false;
    landscapeUnlockNow();
  }

  function setSteerMode(m) {
    steerMode = (m === "tilt" || m === "touch") ? m : "buttons";
    try { Log.info("input", `steerMode ${steerMode}`); } catch (_) {  }
    if (steerMode !== "buttons") {
      btnSteerLeft = btnSteerRight = false;
      btnSteerLeftVal = btnSteerRightVal = 0;
      btnSteerVal = 0; btnSteerT = 0;
      btnSteerSeq = btnSteerLeftSeq = btnSteerRightSeq = 0;
    }
    if (steerMode !== "touch") {
      touches.clear();
      touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
      dragFilterClear();
    }
    if (steerMode !== "tilt") { ++gyroRequestGeneration; detachGyro(); }
  }

  function setTouchRange(frac) {
    if (typeof frac === "number" && isFinite(frac)) touchRangeFrac = clamp(frac, 0.06, 0.24);
  }
  function setTouchSpeedMix(v) {
    if (typeof v === "number" && isFinite(v)) touchSpeedMix = clamp(v, 0, 1);
  }
  function setAnalogTrim(src, t) {
    if (!(src in analogTrim)) return;
    if (typeof t === "number" && isFinite(t)) analogTrim[src] = clamp(t, 0.4, 2.2);
  }
  function setAnalogSpeedMix(v) {
    if (typeof v === "number" && isFinite(v)) analogSpeedMix = clamp(v, 0, 1);
  }
  function setPadDeadzone(v) {
    if (typeof v === "number" && isFinite(v)) padDeadzone = clamp(v, 0, 0.30);
  }
  function setPadSaturation(v) {
    if (typeof v === "number" && isFinite(v)) padSaturation = clamp(v, 0, 0.30);
  }
  function setKeyRampIn(rate) {
    if (typeof rate !== "number" || !isFinite(rate)) return;
    KEY_RAMP_IN = clamp(rate, 1.5, 10);
    KEY_RAMP_OUT = KEY_RAMP_IN * 2;
  }
  function setAdaptiveButtons(v) {
    if (typeof v === "boolean") { adaptiveMix = v ? 1 : 0; return; }
    if (typeof v === "number" && isFinite(v)) adaptiveMix = clamp(v, 0, 1);
  }
  let steerExpo = 2.3889;
  function setSteerExpo(e) {
    if (typeof e === "number" && isFinite(e) && e > 0.05) steerExpo = e;
  }
  const toShaped = (v) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), steerExpo);
  const fromShaped = (v) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), 1 / steerExpo);

  function setSteerSpeedRef(ref) {
    if (typeof ref === "number" && isFinite(ref) && ref > 1) steerSpeedRef = ref;
  }
  function setSpeedStd(v) {
    if (v == null) { speedStdOverride = null; return; }
    if (typeof v === "number" && isFinite(v)) speedStdOverride = Math.max(0, v);
  }
  function setSpeedProvider(fn) { speedProvider = typeof fn === "function" ? fn : null; }

  function clampDeadzone() { DEADZONE = Math.max(0, Math.min(Math.min(15, MAX_TILT - 1), DEADZONE)); }
  function setTiltSensitivity(deg) {
    if (typeof deg === "number" && isFinite(deg)) { MAX_TILT = Math.max(8, Math.min(60, deg)); clampDeadzone(); }
  }
  function setTiltSmoothing(cutoff) {
    if (typeof cutoff === "number" && isFinite(cutoff)) OE_MIN_CUTOFF = Math.max(0.3, Math.min(4, cutoff));
  }
  function setTiltDeadzone(deg) {
    if (typeof deg === "number" && isFinite(deg)) { DEADZONE = deg; clampDeadzone(); }
  }

  let _coarseMql = null;
  const _coarseCbs = [];
  function touchControlsNeeded() {
    if (_coarseMql === null && typeof window !== "undefined" && window.matchMedia) {
      try { _coarseMql = window.matchMedia("(pointer: coarse)"); } catch (_) { _coarseMql = false; }
      if (_coarseMql && _coarseMql.addEventListener) {
        _coarseMql.addEventListener("change", () => {
          for (const cb of _coarseCbs) { try { cb(touchControlsNeeded()); } catch (_) {  } }
        });
      }
    }
    return !!(_coarseMql && _coarseMql.matches);
  }
  function onPointerKindChange(cb) {
    touchControlsNeeded();
    if (typeof cb === "function" && !_coarseCbs.includes(cb)) _coarseCbs.push(cb);
    return () => {
      const idx = _coarseCbs.indexOf(cb);
      if (idx >= 0) _coarseCbs.splice(idx, 1);
    };
  }

  function onScreenRotate() {
    oeInit = false; tiltSteerVal = 0;
    touches.clear(); touchSteer = 0; touchActive = false;
    touchSteerVal = 0; touchSteerT = 0;
    dragFilterClear(); hideDragAnchor();
    _viewLong = 0;
    holdReleaseAll(true);
  }

  let ready = false;

  function init(canvas, opts) {
    Log.info("input", "Input.init");
    onPauseCb = (opts && opts.onPause) || null;
    onPadLostCb = (opts && opts.onPadLost) || null;
    if (ready) return;

    loadLayoutMap();
    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
    window.addEventListener("pointerdown", function (e) {
      if (e.isTrusted !== false && (e.pointerType === "touch" || e.pointerType === "pen")) noteInputSource("touch");
    }, true);
    if (canvas && canvas.addEventListener) {
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        if (e.button === 2) {
          lookMouseDown = true;
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {  }
          e.preventDefault();
        }
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!lookMouseDown) return;
        lookMouseDx += e.movementX || 0;
        lookMouseDy += e.movementY || 0;
      });
      const lookUp = function (e) {
        if (e.button === 2 || e.type !== "pointerup") {
          lookMouseDown = false;
          lookMouseDx = 0; lookMouseDy = 0;
        }
      };
      canvas.addEventListener("pointerup", lookUp);
      canvas.addEventListener("pointercancel", function () {
        lookMouseDown = false; lookMouseDx = 0; lookMouseDy = 0;
      });
      canvas.addEventListener("lostpointercapture", function () {
        lookMouseDown = false;
      });
    }
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) reset();
    });
    window.addEventListener("pointerup", function (e) { holdReleasePointer(e.pointerId); }, true);
    window.addEventListener("pointercancel", function (e) { holdReleasePointer(e.pointerId); }, true);
    document.addEventListener("lostpointercapture", function (e) {
      if (e.target && e.target !== document && !lostCaptureShouldRelease(e.target, e.pointerId)) return;
      holdReleasePointer(e.pointerId);
    }, true);
    const noFingers = function (e) {
      if (e.touches.length !== 0) return;
      holdReleaseAll(true);
      if (touches.size) { touches.clear(); recomputeTouchSteer(); }
    };
    window.addEventListener("touchend", noFingers, { capture: true, passive: true });
    window.addEventListener("touchcancel", noFingers, { capture: true, passive: true });

    canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    wireHold("btn-throttle", function (v) {
      if (throttleLatch) { if (v) { throttleLatched = !throttleLatched; paintLatch(); } btnThrottle = throttleLatched; }
      else btnThrottle = v;
    }, function (l) { btnThrottleVal = l; }, { sibling: "btn-brake" });
    wireHold("btn-brake", function (v) { btnBrake = v; }, function (l) { btnBrakeVal = l; }, { sibling: "btn-throttle" });
    wireTap("btn-boost", function () { boostTogglePressed = true; });
    wireTap("btn-ot", function () { overtakePressed = true; });
    wireTap("btn-aero", function () { aeroTogglePressed = true; });
    wireTap("shift-up", function () { shiftUpPressed = true; });
    wireTap("shift-down", function () { shiftDownPressed = true; });
    wireHold("btn-steer-left", function (v) {
      if (v && !btnSteerLeft) btnSteerLeftSeq = ++btnSteerSeq;
      btnSteerLeft = v; if (!v) btnSteerLeftVal = 0;
    }, function (l) { btnSteerLeftVal = l; }, { axis: "x", dir: -1, sibling: "btn-steer-right" });
    wireHold("btn-steer-right", function (v) {
      if (v && !btnSteerRight) btnSteerRightSeq = ++btnSteerSeq;
      btnSteerRight = v; if (!v) btnSteerRightVal = 0;
    }, function (l) { btnSteerRightVal = l; }, { axis: "x", dir: 1, sibling: "btn-steer-left" });

    try {
      const want = typeof DevFlags !== "undefined"
        ? !!DevFlags.get("inputdebug")
        : (/[?&]inputdebug=1/.test(location.search) ||
          localStorage.getItem("apex26.inputDebug") === "1");
      if (want) {
        const d = document.createElement("div");
        d.id = "input-debug";
        d.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9998;" +
          "background:rgba(0,0,0,.65);color:#9f9;padding:4px 8px;border-radius:6px;" +
          "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;" +
          "white-space:pre";
        document.body.appendChild(d);
        setInterval(function () {
          const s = debugState();
          d.textContent =
            `THR ${s.throttle ? "ON " : "off"}` +
            `  key:${+s.key.throttle} btn:${+s.btn.throttle} pad:${+s.pad.throttle} remote:${s.remote.active ? s.remote.thr : 0}` +
            `\nBRK ${s.braking ? "ON " : "off"}` +
            `  key:${+s.key.brake} btn:${+s.btn.brake} pad:${+s.pad.brake} remote:${s.remote.active ? s.remote.brk : 0}` +
            `\nremote:${s.remote.active ? "live" : "stale"} age:${s.remote.ageMs == null ? "none" : s.remote.ageMs + "ms"} steer:${s.remote.steers ? "remote" : "local"}` +
            `\nheld ptrs [${s.holdPointers.join(",")}]` +
            `\nmode:${s.steerMode}` +
            `  auto:${(touchControlsNeeded() && s.steerMode === "touch") ? "ON" : "off"}`;
        }, 250);
      }
    } catch (_) {  }

    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", onScreenRotate);
    } else {
      window.addEventListener("orientationchange", onScreenRotate);
    }

    window.addEventListener("gamepadconnected", function (e) {
      padConnected = true;
      _padLostAt = 0;
      _padNextProbeMs = 0;
      if (e.gamepad) padPedalSeenByDevice.delete(padKey(e.gamepad, e.gamepad.index));
      try { Log.info("input", `gamepad connected ${padLogId(e)}`); }
      catch (_) {  }
    });
    window.addEventListener("gamepaddisconnected", function (e) {
      let still = false;
      try { const gps = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected && gps[i].index !== (e.gamepad && e.gamepad.index)) still = true; } catch (_) {  }
      if (!still) { _padLostAt = nowMs(); _padNextProbeMs = 0; } else { _padLostAt = 0; _padNextProbeMs = 0; }
      padConnected = still; padSteer = 0; padThrottle = padBrake = false;
      padThrottleVal = padBrakeVal = 0;
      padSteerAnalog = false; padLookBack = false;
      lookStickX = 0; lookStickY = 0;
      padDpadTarget = 0; padDpadVal = 0; padDpadT = 0;
      padDpadLeftHeld = padDpadRightHeld = false;
      padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
      if (!still) padIsWheel = false;
      if (e.gamepad && padPrevByIndex.get(e.gamepad.index) === padPrevButtons) padPrevButtons.length = 0;
      if (e.gamepad) padPrevByIndex.delete(e.gamepad.index);
      padMenu.reset();
      try { Log.info("input", `gamepad disconnected ${padLogId(e)}`); }
      catch (_) {  }
      if (!still && onPadLostCb) { try { onPadLostCb(); } catch (_) {  } }
    });
    ready = true;
  }

  function reset() {
    heldKeys.clear();
    touches.clear();
    hideDragAnchor();
    touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    dragFilterClear();
    timeScale = 1;
    holdReleaseAll();
    btnThrottle = btnBrake = false;
    btnThrottleVal = btnBrakeVal = 0;
    btnSteerLeft = btnSteerRight = false;
    btnSteerLeftVal = btnSteerRightVal = 0;
    btnSteerVal = 0; btnSteerT = 0;
    btnSteerSeq = btnSteerLeftSeq = btnSteerRightSeq = 0;
    speedStdOverride = null;
    keyLeft = keyRight = keyBrake = keyThrottle = false;
    keySteerVal = 0;
    keySteerT = 0;
    tiltSteerVal = 0;
    tiltSteerT = 0;
    tiltSeen = false; lastOrientMs = 0;
    oeInit = false; oePrev = 0; oeDPrev = 0;
    overtakePressed = false;
    boostTogglePressed = false;
    aeroTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    cameraCyclePressed = false;
    padSteer = 0;
    padSteerAnalog = false;
    padThrottle = false;
    padBrake = false;
    padThrottleVal = 0;
    padBrakeVal = 0;
    padLookBack = false;
    padDpadTarget = 0; padDpadVal = 0;
    padDpadT = 0;
    padDpadLeftHeld = padDpadRightHeld = false;
    padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
    keyLookBack = false;
    clearDriveToggles();
    lookStickX = 0; lookStickY = 0;
    lookMouseDx = 0; lookMouseDy = 0; lookMouseDown = false;
    clearRemoteControls();
    remoteWas = false;
    recoverPressed = false;
    radioPressed = false;
    mirrorPressed = false;
    padMenu.reset();
  }

  function clearDriveEdges() {
    overtakePressed = false;
    boostTogglePressed = false;
    aeroTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    recoverPressed = false;
    mirrorPressed = false;
  }
  function clearEdges() {
    clearDriveEdges();
    cameraCyclePressed = false;
    radioPressed = false;
    mirrorPressed = false;
  }

  function debugState() {
    const latched = _navLatch;
    _navLatch = -1;
    try { return debugStateNow(); } finally { _navLatch = latched; }
  }
  function debugStateNow() {
    const active = document.activeElement;
    const tag = active && active.tagName || "";
    const interactive = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag) || !!(active && active.isContentEditable);
    const hudControl = !!(active && active.matches && active.matches("#btn-cam, #pausebtn, #hud-restore, #pc-restore, .touchbtn"));
    return {
      steerMode,
      gate: { anyOpen: !!menuOverlayOpen(), typing: interactive && !hudControl, hudControl,
              focus: { id: active && active.id || null, tag, editable: !!(active && active.isContentEditable) } },
      key: { left: keyLeft, right: keyRight, throttle: keyThrottle, brake: keyBrake },
      btn: { throttle: btnThrottle, brake: btnBrake, left: btnSteerLeft, right: btnSteerRight,
             throttleVal: btnThrottleVal, brakeVal: btnBrakeVal, steerVal: btnSteerVal,
             leftVal: btnSteerLeftVal, rightVal: btnSteerRightVal },
      adaptiveButtons: adaptiveMix,
      adaptiveMix,
      speedStd: currentSpeedStd(),
      steerSpeedRef,
      rateIn: digitalRateIn(),
      pad: { connected: padConnected, steer: padSteer, throttle: padThrottle, brake: padBrake },
      touchSteer,
      touchActive,
      touchRangePx: touchRangePx(),
      touchRangeFrac,
      touchSpeedMix,
      touchSpeedScale: touchSpeedScale(),
      dragMinCutoff,
      analogTrim: Object.assign({}, analogTrim),
      analogSpeedMix,
      analogSpeedGain: analogSpeedGain(),
      padDeadzone,
      padSaturation,
      padRestOffset,
      padSteerAnalog,
      padAxisMap: getPadAxisMap(),
      hapticScale: haptics.scale(),
      lookingBack: lookingBack(),
      remote: { owner: remoteOwner, active: remoteActive(), steers: remoteSteers(), roll: tiltRaw, stick: remStick ? remSteer : null,
                thr: remThr, brk: remBrk, held: remHeld,
                ageMs: remoteMs ? Math.round(nowMs() - remoteMs) : null },
      canvasTouches: touches.size,
      holdPointers: holdButtons.pointerCounts(),
      throttle: throttle(),
      braking: braking(),
      throttleLevel: throttleLevel(),
      brakeLevel: brakeLevel(),
    };
  }

  return {
    init,
    reset,
    keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, keyboardSeen, activeInputSource,
    padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad, padsAreDefault, padLabel, padCapture, padPresent,
    debugState,
    poll,
    rumble,
    requestGyro,
    gyroRequestId: () => gyroRequestGeneration,
    calibrate,
    steer,
    throttle,
    braking,
    throttleLevel,
    brakeLevel,
    consumeBoostToggle,
    consumeOvertake,
    consumeAeroToggle,
    consumeShiftUp,
    consumeShiftDown,
    consumeCameraCycle,
    consumeRecover,
    requestRecover: () => { recoverPressed = true; },
    consumeRadio,
    consumeMirror,
    lookingBack,
    lookStick,
    lookMouseHeld,
    consumeLookMouse,
    lockEscape, unlockEscape, lockLandscape, unlockLandscape,
    tiltActive,
    remoteSample, remoteEvent, remoteLost, remoteActive, remoteSteers, setRemoteHaptics,
    simTilt,
    simTiltReset,
    steerToTilt,
    setSteerMode,
    setAdaptiveButtons,
    setSteerSpeedRef,
    setSteerExpo,
    setSpeedStd,
    setSpeedProvider,
    setTimeScale,
    setTiltSensitivity,
    setTiltSmoothing,
    setTiltDeadzone,
    setTouchRange,
    setTouchSpeedMix,
    setDragSmoothing,
    setAnalogTrim,
    setAnalogSpeedMix,
    setPadDeadzone,
    setPadSaturation,
    setKeyRampIn,
    setHaptics,
    setTriggerHaptics,
    triggerRumbleSupported,
    vibrate,
    hapticsSupported,
    setThrottleLatch(on) { throttleLatch = !!on; throttleLatched = false; btnThrottle = false; paintLatch(); },
    setHoldMode(m) { holdMode = InputBindings.parseHoldMode(m); clearDriveToggles(); },
    getHoldMode: () => InputBindings.parseHoldMode(holdMode),
    dropLatch() {
      clearDriveToggles();
      if (throttleLatched) { throttleLatched = false; btnThrottle = false; paintLatch(); }
    },
    throttleLatched: () => throttleLatch && throttleLatched,
    primeHaptics,
    setPadLabelMode, padLabelMode: padLabelModeOf,
    controllerProfile: () => deviceProfiles ? deviceProfiles.current() : null,
    getControllerProfiles: () => ensureDeviceProfiles() ? deviceProfiles.data() : { v: 1, devices: [] },
    setControllerProfiles: (raw) => ensureDeviceProfiles() ? deviceProfiles.replace(raw) : null,
    resetControllerProfile,
    setPadAxisMap, getPadAxisMap, padAxesAreDefault, beginAxisCapture, calibratePad, padCalibrationOwner, parkedPadPreview, padRest, setPadRest, padRestStore,
    touchControlsNeeded,
    pickPad,
    onPointerKindChange,
    clearEdges, clearDriveEdges,
    get padConnected() { return padConnected; },
    get gyroSeen() { return localTiltFresh(); },
    get gyroDenied() { return gyroDenied; },
    get gyroHardDenied() { return gyroHardDenied; },
    ready: () => ready,
    holdTargetGone,
    get maxTilt() { return MAX_TILT; },
    get deadzone() { return DEADZONE; },
    get tiltSlew() { return TILT_SLEW; },
    get minCutoff() { return OE_MIN_CUTOFF; },
  };
})();
