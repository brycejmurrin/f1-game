"use strict";

var GameAudio = (function () {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let focusBus = null;
  let limiter = null;
  let sfxVol = 1;
  let sfxEnabled = true;
  let isEnabled = true;

  let engA = null, engB = null, engC = null;
  let engFilter = null, engGain = null;
  let limOsc = null, limGain = null;
  const LIM_HOLD = 0.5, LIM_FADE = 0.5;
  let limSince = null;
  let limPitch = null;
  let whineOsc = null, whineGain = null;
  let harvSrc = null, harvFilter = null, harvGain = null;
  let lfo = null, lfoG = null;
  let skidSrc = null, skidFilter = null, skidGain = null, skidLfo = null, skidLfoGain = null;
  let voiceFormant = null;
  let windSrc = null, windFilter = null, windGain = null;
  let subOctOsc = null, subOctGain = null;
  let tiltEq = null;
  let gravOsc = null, gravGain = null;
  let brakeSrc = null, brakeFilter = null, brakeGain = null;
  let scrubSrc = null, scrubFilter = null, scrubGain = null;
  let lockFilter = null, lockGain = null;
  let surfSrc = null, surfFilter = null, surfGain = null;
  let kerbSrc = null, kerbFilter = null, kerbGain = null;
  let spraySrc = null, sprayFilter = null, sprayGain = null;
  let kerbLive = false;
  let sprayAhead = 0;
  let pitLimOsc = null, pitLimGain = null;
  let cylCutOsc = null, cylCutGain = null;
  let revFlare = 0, revFlareT = 0;
  let carSfxLast = { scrub: 0, lock: 0, surface: 0, pitLim: 0 };
  let pitGunFired = 0, surfSched = 0;
  let pitLimLvl = 0;

  const CONTACT_VOICES_DESKTOP = 3, CONTACT_VOICES_MOBILE = 2;
  const CONTACT_COOLDOWN = 0.25;
  const CONTACT_RANGE = 120;
  const CONTACT_REF = 8;
  let contactVoices = [];
  const _contactCdKeys = new Int32Array(24);
  const _contactCdUntil = new Float64Array(24);
  let _contactCdN = 0;
  let fieldArmed = false;
  let contactFired = 0, contactDeniedCd = 0, contactDeniedCap = 0, contactDeniedGate = 0;
  let _lastPlayerContactPan = 0;

  const VENUES = Object.freeze({
    street: { decay: 1.9, damp: 3400, level: 0.30 },
    modern: { decay: 1.5, damp: 2600, level: 0.18 },
    green:  { decay: 0.9, damp: 1500, level: 0.10 },
    desert: { decay: 1.1, damp: 2200, level: 0.09 },
  });
  let venue = VENUES.modern, venueName = "modern";
  let convolver = null, revSend = null, revReturn = null;
  const _irCache = new Map();

  function lowPower() {
    try {
      if (typeof GLX === "undefined" || !GLX) return false;
      return !!(GLX.isMobile || GLX.mobileTier);
    } catch (_) { return false; }
  }
  const RIVAL_VOICES_DESKTOP = 4, RIVAL_VOICES_MOBILE = 2;
  let RIVAL_VOICES = RIVAL_VOICES_DESKTOP;
  const RIVAL_RANGE = 150;
  const RIVAL_REF = 6;
  const RIVAL_DETUNE = Object.freeze([-22, -8, 9, 24].map((c) => Math.pow(2, c / 1200)));
  const PAN_MAKEUP = Math.SQRT2;
  let rivalPeak = 0.28;

  const CAM_MIX = Object.freeze({
    onboard: Object.freeze({ engine: 1.08, cut: 1.00, wind: 0.70, rivals: 1.00, reverb: 0.60 }),
    chase:   Object.freeze({ engine: 1.00, cut: 1.00, wind: 1.00, rivals: 1.00, reverb: 1.00 }),
    tv:      Object.freeze({ engine: 0.55, cut: 0.55, wind: 0.30, rivals: 1.25, reverb: 1.80 }),
  });
  const CAM_KIND = Object.freeze({
    cockpit: "onboard", hood: "onboard", tcam: "onboard", rear: "onboard", visor: "onboard", helmet: "onboard",
    chase: "chase", far: "chase", drift: "chase", reverse: "chase",
    overhead: "tv", heli: "tv", side: "tv", cinematic: "tv", low: "tv", trackside: "tv",
    rival: "tv", pitwall: "tv", drone: "tv", tv: "tv",
  });
  let camMix = CAM_MIX.chase, camKind = "chase";
  let rivalVoices = [];
  const RIVAL_EPS_GAIN = 0.03, RIVAL_EPS_RATE = 0.004;

  const { ENGINE_VOICES, TUNE_DEF, TUNE_RANGE, LAYER_DEF, SOUND_PROFILES } = GameAudioToneModel;
  let voice = ENGINE_VOICES["default"];
  let voiceName = "default";
  let tune = Object.assign({}, TUNE_DEF);
  let layers = Object.assign({}, LAYER_DEF);
  let profileName = "team";

  function aimGain(node, target, t, tau) {
    if (!node) return;
    const prev = node._apexAimTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) < 1e-4)) return;
    node.gain.setTargetAtTime(target, t, tau);
    node._apexAimTgt = target;
  }
  function aimGainRel(node, target, t, tau, rel) {
    if (!node) return;
    const prev = node._apexAimTgt;
    if (prev === target || (prev !== undefined && target !== 0 && Math.abs(prev - target) <= Math.max(1e-4, Math.abs(target) * rel))) return;
    node.gain.setTargetAtTime(target, t, tau);
    node._apexAimTgt = target;
  }
  function aimParam(p, target, t, tau, rel) {
    const prev = p._apexAimTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) <= Math.abs(target) * rel)) return;
    p.setTargetAtTime(target, t, tau);
    p._apexAimTgt = target;
  }
  function layerMoving(node, on, t, tau) {
    if (on) { node._apexMuteUntil = undefined; return true; }
    if (node._apexMuteUntil === undefined) node._apexMuteUntil = t + 10 * tau;
    return t < node._apexMuteUntil;
  }
  const LAB_AUDIO_IDLE = (() => {
    try {
      if (typeof location === "undefined" || !location) return true;
      const v = new URLSearchParams(location.search).get("lab");
      return !(v && v.split(",").some((s) => s.trim() === "noAudioIdle"));
    } catch (e) { return true; }
  })();
  let layerIdleTimer = null;
  function idleLayers(on) {
    const mods = [typeof RivalAudio !== "undefined" ? RivalAudio : null,
      typeof CrowdAudio !== "undefined" ? CrowdAudio : null, typeof ErsLayer !== "undefined" ? ErsLayer : null];
    for (const m of mods) {
      try { if (m && typeof m.idle === "function") m.idle(on); } catch (e) {  }
    }
  }
  function scheduleLayerIdle() {
    if (!LAB_AUDIO_IDLE) return;
    if (layerIdleTimer) clearTimeout(layerIdleTimer);
    layerIdleTimer = setTimeout(() => { layerIdleTimer = null; if (!engineOn) idleLayers(true); }, 500);
  }
  function wakeLayers() {
    if (!LAB_AUDIO_IDLE) return;
    if (layerIdleTimer) { clearTimeout(layerIdleTimer); layerIdleTimer = null; }
    idleLayers(false);
  }
  let engineOn = false;
  let engineWanted = false;
  let sfxOffArmed = false;
  let mutedSuspended = false;
  let engineActionGeneration = 0;
  let _dying = [];
  function killNodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      try { const n = nodes[i]; if (n && n.disconnect) n.disconnect(); } catch (e) {  }
    }
  }
  function flushDying() {
    for (let i = 0; i < _dying.length; i++) killNodes(_dying[i]);
    _dying.length = 0;
  }
  function queueDying(nodes) {
    const batch = [];
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n) batch.push(n); }
    if (!batch.length) return;
    _dying.push(batch);
    setTimeout(() => {
      const i = _dying.indexOf(batch);
      if (i < 0) return;
      _dying.splice(i, 1);
      killNodes(batch);
    }, 450);
  }
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0, harvBrakeLevel = 0, harvCoastLevel = 0;
  let shiftDuck = 0, shiftDuckT = 0;
  let overrunT = 0;
  let overrunFired = 0;
  let pullT = 0;
  let wasteFired = 0;
  let shiftFired = 0, shiftPeak = 0;
  let boostFired = 0, boostPeak = 0;
  let idleGainRamped = false;
  let rateFresh = false;
  let lastGearSeen = NaN;
  let cueT = 0, cueFired = 0, cueU = 0;

  let engBuf = null, samplesReady = false;
  let engLoop = null, engWin = null;
  let lastRate = 0;
  let enginePeriod = 0;

  let engSrcIdle = null, engGainIdle = null;
  let usingSamples = false;
  let dbgAnalyser = null;
  const SFX_ENGINE = "assets/sfx/f1_engine.mp3";

  let listenersAttached = false;
  let rebuildTries = 0;
  let lastFailedResume = 0;
  let deviceRebuildTimer = null;
  let deviceRebuildPending = "";
  let deviceRebuildBusy = false;
  let deviceRebuildStamps = [];
  let ctxSampleRate = 0;
  const DEVICE_REBUILD_DEBOUNCE_MS = 280;
  const DEVICE_REBUILD_MAX = 3, DEVICE_REBUILD_WINDOW_MS = 30000;
  let resumeMusic = null;
  let resumeEngine = null;
  let resumeRain = false;

  function clamp01(v) {
    return M4.clamp(Number.isFinite(v) ? v : 0, 0, 1);
  }

  const SQUEAL_THRESH = 0.10;
  function squealFromSlip(lat01, long01, wet) {
    const lat = clamp01(lat01), long = clamp01(long01);
    const raw = Math.min(1, Math.sqrt(lat * lat + long * long));
    const over = raw <= SQUEAL_THRESH ? 0 : (raw - SQUEAL_THRESH) / (1 - SQUEAL_THRESH);
    return {
      gain: over * (wet ? 0.10 : 0.16),
      hz: (wet ? 480 : 760) + over * 320 + (over > 0 ? long * 120 : 0),
      lfo: over > 0 ? 60 : 0
    };
  }
  const WIND_GATE = 0.04;
  const _windScratch = { gain: 0, hz: 0 };
  function windFromSpeed(s01, out) {
    const s = clamp01(s01);
    const u = s <= WIND_GATE ? 0 : (s - WIND_GATE) / (1 - WIND_GATE);
    const r = out || {};
    r.gain = 0.036 * u * u; r.hz = 450 + u * 1450;
    return r;
  }

  let sessionType = "playback";
  function applySessionType() {
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = sessionType;
      }
    } catch (e) {  }
  }
  function setSessionType(t) {
    const v = (t === "ambient" || t === "playback") ? t : "playback";
    if (v === sessionType) return v;
    sessionType = v;
    applySessionType();
    return v;
  }

  const signal = GameAudioSignal.create({ context: () => ctx, bus: () => sfxBus, sfxOk, oneShotOk, now });
  const { env, blip, loopNoise, noisePool, bindNoise, noise, hiss, scrapeNoise } = signal;
  const { detectPeriod, findStableLoop } = GameAudioSignal;
  const soundtrack = GameAudioSoundtrack.create({
    context: () => ctx, master: () => master, enabled, engineRunning: () => engineOn,
    sfxOk, clamp01, now, resumeRejected,
  });
  const { startMusic, stopMusic, setMusicEnabled, skipTrack, prevTrack, trackName, tracks, addTracks, removeTrack, playTrackId, currentTrackId, setMusicBackend, musicBackend, setMusicSource, musicSource, sourceCounts, setMusicVolume, setRadioDuck: soundtrackRadioDuck } = soundtrack;
  const mix = GameAudioMix.create({
    context: () => ctx, sfxBus: () => sfxBus, sfxEnabled: () => sfxEnabled, sfxVol: () => sfxVol,
    soundtrackRadioDuck,
  });
  const {
    setRadioDuck, setSpotterDuck, setVoiceFocusHold, setVoiceFocusSpan, setRadioFocusDb, getRadioFocusDb,
    applySfxDuck, applyMusicDuck, writeSfx, refreshFocus, primeBuses, releaseBuses, dropHolds,
  } = mix;
  const radio = GameAudioRadioFx.create({
    context: () => ctx, master: () => master, bus: () => sfxBus, enabled, sfxOk, now,
    setSpotterDuck, setVoiceFocusHold, setVoiceFocusSpan,
  }, signal);
  const { decodeClip, radioVoice, radioSting, radioStingStop, setRadioFx } = radio;
  let ctxGen = 0;
  let offlinePending = null;

  function wireMasterBuses() {
    master = ctx.createGain();
    master.gain.value = isEnabled ? 0.8 : 0;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    sfxBus = ctx.createGain();
    focusBus = primeBuses(sfxBus);
    sfxBus.connect(master);
    focusBus.connect(master);
    attachRivalPassBy();
    attachErsLayer();
  }

  function createCtx() {
    if (offlinePending && typeof OfflineAudioContext !== "undefined") {
      const o = offlinePending;
      const sr = o.sampleRate || 44100;
      const sec = o.seconds || 1;
      const ch = o.channels || 1;
      const len = Math.max(1, Math.floor(sr * sec));
      applySessionType();
      try {
        ctx = new OfflineAudioContext(ch, len, sr);
      } catch (e) {
        ctx = null;
        Log.warn("audio", "OfflineAudioContext unavailable: " + ((e && e.message) || e));
        return false;
      }
      signal.resetContext();
      ctxGen++;
      ctxSampleRate = ctx.sampleRate;
      wireMasterBuses();
      return true;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    applySessionType();

    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      Log.warn("audio", "AudioContext unavailable: " + ((e && e.message) || e));
      return false;
    }
    signal.resetContext();
    ctxGen++;
    ctxSampleRate = ctx.sampleRate;
    ctx.onstatechange = () => {
      if (deviceRebuildBusy || !ctx) return;
      if (ctx.state === "closed") return;
      if (ctx.state === "running") mutedSuspended = false;
      if (mutedSuspended && !isEnabled) return;
      if (ctx.state === "interrupted" && _onInterrupted) { try { _onInterrupted(); } catch (_) {  } }
      if (ctx.state === "interrupted") {
        applySfxDuck(false);
      }
      if (ctx.state === "running" && ctxSampleRate && ctx.sampleRate !== ctxSampleRate) {
        scheduleOutputDeviceRebuild("sampleRate");
      }
      if (ctx.state === "running") {
        ctxSampleRate = ctx.sampleRate;
        applyMusicDuck(); refreshFocus();
      }
      if (ctx.state !== "running" && ctx.state !== "closed" && !document.hidden) resumeIfNeeded();
    };
    wireMasterBuses();

    if (ctx.state !== "running" && !document.hidden) { const p = ctx.resume(); if (p && p.catch) p.catch(resumeRejected("create")); }
    loadEngineSamples();
    syncMuteSuspend();
    return true;
  }

  function initOffline(opts) {
    if (ctx) {
      try { stopEngine(); } catch (_) {  }
      const dying = ctx;
      ctx = null;
      if (dying && typeof dying.close === "function") {
        try { const p = dying.close(); if (p && p.catch) p.catch(() => {}); } catch (_) {  }
      }
    }
    samplesReady = false;
    usingSamples = false;
    engBuf = null;
    engLoop = null;
    engWin = null;
    enginePeriod = 0;
    lastRate = 0;
    offlinePending = {
      channels: (opts && opts.channels) || 1,
      sampleRate: (opts && opts.sampleRate) || 44100,
      seconds: (opts && opts.seconds) || 1,
    };
    isEnabled = true;
    sfxEnabled = true;
    const ok = createCtx();
    offlinePending = null;
    return ok;
  }

  function renderOffline() {
    if (!ctx || typeof ctx.startRendering !== "function") {
      return Promise.reject(new Error("GameAudio.renderOffline: not an OfflineAudioContext"));
    }
    const offline = ctx;
    return offline.startRendering().then((buf) => {
      engineOn = false;
      if (ctx === offline) ctx = null;
      return buf;
    });
  }

  let resumeWarned = false;
  function resumeRejected(where) {
    return (err) => {
      const why = "AudioContext resume rejected at " + where + " (state=" + (ctx && ctx.state) + "): " + ((err && err.message) || err);
      if (resumeWarned) { Log.debug("audio", why); return; }
      resumeWarned = true;
      Log.warn("audio", why + " — silent until a later gesture resumes it");
    };
  }

  function loadEngineSamples() {
    if (!ctx || samplesReady) return;
    const owner = ctx;
    const grab = (url) => fetch(url)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " for " + url); return r.arrayBuffer(); })
      .then((ab) => ctx === owner ? new Promise((res, rej) => owner.decodeAudioData(ab, res, rej)) : null);
    grab(SFX_ENGINE)
      .then((e) => {
        if (!e || ctx !== owner) return;
        enginePeriod = detectPeriod(e);
        const w = loopWindow(e);
        engBuf = w.buf; engLoop = w.loop; engWin = w.win; samplesReady = true;
        Log.debug("audio", "engine sample decoded, period=" + enginePeriod + ", kept " + engLoop.end.toFixed(2) + " of " + e.duration.toFixed(2) + " s");
      })
      .catch((err) => {
        if (ctx !== owner) return;
        Log.warn("audio", "engine sample load/decode failed, using synth voice: " + ((err && err.message) || err));
      });

  }


  function loopWindow(full) {
    const li = findStableLoop(full), sr = full.sampleRate;
    const a = Math.max(0, Math.round(li.start * sr)), b = Math.min(full.length, Math.round(li.end * sr));
    if (!(b - a > 1) || !ctx || !ctx.createBuffer) return { buf: full, loop: li, win: li };
    const out = ctx.createBuffer(full.numberOfChannels, b - a, sr);
    for (let c = 0; c < full.numberOfChannels; c++) {
      const seg = full.getChannelData(c).subarray(a, b);
      if (out.copyToChannel) out.copyToChannel(seg, c); else out.getChannelData(c).set(seg);
    }
    return { buf: out, loop: { start: 0, end: (b - a) / sr }, win: { start: a / sr, end: b / sr } };
  }

  function stickyUserActivation() {
    try {
      const ua = typeof navigator !== "undefined" && navigator.userActivation;
      return !!(ua && (ua.isActive || ua.hasBeenActive));
    } catch (e) { return false; }
  }

  function scheduleOutputDeviceRebuild(why) {
    if (!ctx || deviceRebuildBusy) return;
    if (document.hidden) { deviceRebuildPending = why; return; }
    if (deviceRebuildTimer) clearTimeout(deviceRebuildTimer);
    deviceRebuildTimer = setTimeout(() => {
      deviceRebuildTimer = null;
      requestOutputDeviceRebuild(why);
    }, DEVICE_REBUILD_DEBOUNCE_MS);
  }

  function requestOutputDeviceRebuild(why) {
    if (!ctx || deviceRebuildBusy) return;
    if (document.hidden) { deviceRebuildPending = why; return; }
    if (!stickyUserActivation()) {
      deviceRebuildPending = why;
      Log.debug("audio", "output-device rebuild deferred (" + why + ") until the next gesture");
      return;
    }
    performOutputDeviceRebuild(why);
  }

  function performOutputDeviceRebuild(why) {
    if (!ctx || document.hidden || deviceRebuildBusy) return;
    deviceRebuildPending = "";
    const t = Date.now();
    deviceRebuildStamps = deviceRebuildStamps.filter((s) => t - s < DEVICE_REBUILD_WINDOW_MS);
    if (deviceRebuildStamps.length >= DEVICE_REBUILD_MAX) {
      deviceRebuildPending = why;
      Log.warn("audio", "output-device rebuild after " + why + " deferred: " + DEVICE_REBUILD_MAX + " rebuilds in " + (DEVICE_REBUILD_WINDOW_MS / 1000) + " s already");
      return false;
    }
    deviceRebuildStamps.push(t);
    deviceRebuildBusy = true;
    Log.info("audio", "rebuilding AudioContext after " + why);
    try { rebuildCtx(); } finally { deviceRebuildBusy = false; }
    return true;
  }

  function onMediaDeviceChange() {
    scheduleOutputDeviceRebuild("devicechange");
  }

  function attachOutputDeviceListeners() {
    try {
      const md = typeof navigator !== "undefined" && navigator.mediaDevices;
      if (!md || typeof md.addEventListener !== "function") return;
      md.addEventListener("devicechange", onMediaDeviceChange);
    } catch (e) {  }
  }

  function reapplyContextState() {
    if (!ctx) return;
    applyTuneNodes();
    applyVenue();
    applyMusicDuck();
    setSfxEnabled(sfxEnabled);
  }

  let rivalPassByCtx = null;
  function attachRivalPassBy() {
    if (!ctx || !sfxBus) return;
    try {
      if (typeof RivalAudio === "undefined") return;
      if (typeof RivalAudio.attach === "function") {
        if (RivalAudio.setMix) RivalAudio.setMix(layers.rivals ? tune.rivals : 0);
        if (rivalPassByCtx === ctx) return;
        RivalAudio.attach(ctx, focusBus);
        rivalPassByCtx = ctx;
      } else {
        RivalAudio._pendingAttach = { ctx, dest: focusBus, mix: layers.rivals ? tune.rivals : 0 };
      }
    } catch (e) {  }
  }

  function attachErsLayer() {
    if (!ctx || !sfxBus) return;
    try {
      if (typeof ErsLayer !== "undefined" && typeof ErsLayer.attach === "function") {
        ErsLayer.attach(ctx, sfxBus);
      }
    } catch (e) {  }
  }

  function init() {
    if (ctx) {
      resumeIfNeeded(true);
      attachRivalPassBy();
      attachErsLayer();
      Log.info("audio", "GameAudio.init state=" + (ctx && ctx.state));
      return;
    }
    if (!createCtx()) return;
    Log.info("audio", "GameAudio.init state=" + (ctx && ctx.state));

    if (!listenersAttached) {
      listenersAttached = true;
      window.addEventListener("touchend", resumeIfNeeded, true);
      window.addEventListener("pointerdown", resumeIfNeeded, true);
      window.addEventListener("keydown", resumeIfNeeded, true);
      document.addEventListener("visibilitychange", onVisibility);
      attachOutputDeviceListeners();
    }
  }

  function isActivationGesture(e) {
    if (!e) return false;
    if (e === true) return true;
    if (e.isTrusted === false) return false;
    if (e.type === "keydown") return e.key !== "Escape";
    if (e.type === "pointerdown") {
      if (e.pointerType === "mouse") return true;
      try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch (_) { return false; }
    }
    if (e.type === "pointerup") return e.pointerType !== "mouse";
    return true;
  }

  function resumeIfNeeded(gestureEv) {
    if (!ctx || document.hidden) return;
    if (mutedSuspended && !isEnabled) return;
    const isGesture = isActivationGesture(gestureEv);
    if (isGesture) soundtrack.retryStreamUnlock();
    if (isGesture && deviceRebuildPending) {
      if (performOutputDeviceRebuild("deferred-gesture")) return;
    }
    if (ctx.state === "running") {
      rebuildTries = 0;
      lastFailedResume = 0;
      return;
    }
    if (isGesture && lastFailedResume &&
        Date.now() - lastFailedResume > 700 && rebuildTries < 3) {
      rebuildTries++;
      lastFailedResume = 0;
      rebuildCtx();
      return;
    }
    if (isGesture) lastFailedResume = Date.now();
    const p = ctx.resume();
    if (p && p.then) {
      p.then(() => {
        if (!ctx || ctx.state !== "running") return;
        rebuildTries = 0;
        lastFailedResume = 0;
        Log.info("audio", "GameAudio.resume state=" + (ctx && ctx.state));
      }).catch(resumeRejected("gesture"));
    }
  }

  function rebuildCtx() {
    const wasMusic = soundtrack.isPlaying();
    const wasTrack = soundtrack.lastTrack();
    const wasEngine = engineOn;
    if (wasMusic) soundtrack.suspendMusic();
    engineOn = false;
    try {
      const dying = ctx;
      if (dying) dying.onstatechange = null;
      const p = dying && dying.close();
      if (p && p.catch) p.catch((e) => { Log.debug("audio", "old context close rejected on rebuild:", e && e.message); });
    } catch (e) {  }
    if (typeof ErsLayer !== "undefined" && ErsLayer.detach) ErsLayer.detach();
    if (typeof CrowdAudio !== "undefined" && CrowdAudio.detach) {
      try { CrowdAudio.detach(); } catch (e) {  }
    }
    ctx = null; mutedSuspended = false;
    master = null;
    sfxBus = null; focusBus = null; releaseBuses();
    limiter = null;
    rainStopping = false;
    rainPending = null;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    soundtrack.resetContext();
    engBuf = engLoop = engWin = null; samplesReady = false;
    _irCache.clear();
    radio.resetContext();
    dropHolds();
    revFlare = 0; revFlareT = 0; limSince = null;
    signal.resetContext();
    dbgAnalyser = null;
    if (!createCtx()) return;
    reapplyContextState();
    if (typeof CrowdAudio !== "undefined" && CrowdAudio.attach) {
      try { CrowdAudio.attach(); } catch (e) {  }
    }
    if (wasMusic) soundtrack.resumeMusic(wasTrack);
    if (wasEngine) startEngineGraph();
    if (rainWanted) startRain();
  }

  function onVisibility() {
    if (document.hidden) {
      resumeMusic = soundtrack.isPlaying() ? soundtrack.musicPlaybackGeneration() : null;
      resumeEngine = engineOn ? engineActionGeneration : null;
      resumeRain = rainWanted;
      soundtrack.suspendMusic();
      if (engineOn) stopEngineGraph();
      if (rainWanted) stopRain(true);
      try {
        if (ctx && ctx.state === "running" && ctx.suspend) {
          const p = ctx.suspend(); if (p && p.catch) p.catch((e) => { Log.debug("audio", "context suspend on hide rejected:", e && e.message); });
        }
      } catch (_) {  }
    } else {
      if (deviceRebuildPending) requestOutputDeviceRebuild(deviceRebuildPending);
      resumeIfNeeded();
      if (resumeMusic !== null && resumeMusic === soundtrack.musicPlaybackGeneration()) soundtrack.resumeMusic(soundtrack.lastTrack());
      if (resumeEngine !== null && resumeEngine === engineActionGeneration) startEngineGraph();
      if (resumeRain) startRain();
      resumeMusic = resumeEngine = null; resumeRain = false;
    }
  }

  const LEVEL_TAU = 0.02;
  function glideLevel(param, v) {
    if (!param || !ctx) return;
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(v, t, LEVEL_TAU);
  }

  const MUTE_SUSPEND_MS = 150;
  let muteSuspendTimer = null;
  function syncMuteSuspend() {
    if (muteSuspendTimer) { clearTimeout(muteSuspendTimer); muteSuspendTimer = null; }
    if (isEnabled || !ctx) return;
    muteSuspendTimer = setTimeout(() => {
      muteSuspendTimer = null;
      if (isEnabled || !ctx || ctx.state !== "running" || !ctx.suspend) return;
      mutedSuspended = true;
      try {
        const p = ctx.suspend(); if (p && p.catch) p.catch((e) => { mutedSuspended = false; Log.debug("audio", "context suspend on mute rejected:", e && e.message); });
      } catch (_) { mutedSuspended = false; }
    }, MUTE_SUSPEND_MS);
  }
  function setEnabled(b) {
    isEnabled = !!b;
    if (master) glideLevel(master.gain, isEnabled ? 0.8 : 0);
    if (isEnabled) {
      mutedSuspended = false;
      if (engineWanted && !engineOn) startEngineGraph();
      resumeIfNeeded();
    }
    syncMuteSuspend();
  }

  function enabled() {
    return isEnabled;
  }

  function sfxOk() {
    return !!ctx && isEnabled && sfxEnabled;
  }
  function oneShotOk() {
    return sfxOk() && (ctx.state === "running" || typeof ctx.startRendering === "function");
  }

  const RATE_IDLE = 0.17, RATE_SPAN = 0.5115;
  const SYNTH_IDLE_HZ = 95, SYNTH_SPAN_HZ = 700;
  function baseRate(revC) { return RATE_IDLE * tune.idle + revC * RATE_SPAN * tune.revRange; }
  const RATE_SNAP_JUMP = 0.08;
  function snapParam(p, target, t) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(target, t);
    p._apexAimTgt = target;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  let keepFade = false;
  function startEngineBody() {
    if (!keepFade) flushDying();
    if (sfxOk()) noisePool();

    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    limOsc = ctx.createOscillator(); limOsc.type = "square";
    limOsc.frequency.value = 13 * (tune.limRate != null ? tune.limRate : 1);
    limGain = ctx.createGain(); limGain.gain.value = 0;
    limOsc.connect(limGain).connect(engGain.gain);
    limPitch = ctx.createGain(); limPitch.gain.value = 0;
    limOsc.connect(limPitch);
    limOsc.start();
    gravOsc = ctx.createOscillator(); gravOsc.type = "sine"; gravOsc.frequency.value = 40;
    gravGain = ctx.createGain(); gravGain.gain.value = 0;
    gravOsc.connect(gravGain).connect(engGain.gain);
    gravOsc.start();
    pitLimOsc = ctx.createOscillator(); pitLimOsc.type = "square"; pitLimOsc.frequency.value = 11;
    pitLimGain = ctx.createGain(); pitLimGain.gain.value = 0;
    pitLimOsc.connect(pitLimGain).connect(engGain.gain);
    pitLimOsc.start();
    cylCutOsc = ctx.createOscillator(); cylCutOsc.type = "square"; cylCutOsc.frequency.value = 24;
    cylCutGain = ctx.createGain(); cylCutGain.gain.value = 0;
    cylCutOsc.connect(cylCutGain).connect(engGain.gain);
    cylCutOsc.start();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;

    tiltEq = ctx.createBiquadFilter();
    tiltEq.type = "highshelf";
    tiltEq.frequency.value = 1400;
    tiltEq.gain.value = 0;

    if (voice.formantGain > 0) {
      voiceFormant = ctx.createBiquadFilter();
      voiceFormant.type = "peaking";
      voiceFormant.frequency.value = voice.formantHz;
      voiceFormant.Q.value = 1.1;
      voiceFormant.gain.value = voice.formantGain;
      engFilter.connect(voiceFormant).connect(tiltEq).connect(engGain).connect(focusBus);
    } else {
      voiceFormant = null;
      engFilter.connect(tiltEq).connect(engGain).connect(focusBus);
    }


    usingSamples = !!(samplesReady && engBuf);
    engA = engB = engC = null;
    engSrcIdle = engGainIdle = null;
    idleGainRamped = false;
    rateFresh = false;
    if (usingSamples) {
      engSrcIdle = ctx.createBufferSource(); engSrcIdle.buffer = engBuf; engSrcIdle.loop = true;
      engSrcIdle.detune.value = sampleDetuneCents();
      const seedRate = lastRate > 0.02
        ? lastRate
        : RATE_IDLE * tune.idle * voice.rateTrim * tune.pitch;
      engSrcIdle.playbackRate.value = seedRate;
      engSrcIdle.playbackRate._apexAimTgt = seedRate;
      engSrcIdle.loopStart = engLoop.start; engSrcIdle.loopEnd = engLoop.end;
      engGainIdle = ctx.createGain();
      if (lastRate > 0.02) { engGainIdle.gain.value = 0.9; idleGainRamped = true; }
      else engGainIdle.gain.value = 0;
      engSrcIdle.connect(engGainIdle).connect(engFilter);
      rateFresh = true;
    } else {
      engA = ctx.createOscillator();
      engB = ctx.createOscillator();
      engC = ctx.createOscillator();
      engA.type = "sawtooth";
      engB.type = "sawtooth";
      engC.type = "square";
      engA.frequency.value = 70;
      engB.frequency.value = 70.7;
      engC.frequency.value = 35;
      engA.connect(engFilter);
      engB.connect(engFilter);
      const sub = ctx.createGain();
      sub.gain.value = voice.subLvl * tune.sub;
      engC.connect(sub).connect(engFilter);
      engC._apexSubGain = sub;
    }

    if (usingSamples) {
      subOctOsc = ctx.createOscillator();
      subOctGain = ctx.createGain();
      subOctOsc.type = "sine";
      subOctOsc.frequency.value = 60;
      subOctGain.gain.value = 0;
      subOctOsc.connect(subOctGain).connect(focusBus);
    }

    if (ctx.createConvolver && !lowPower()) {
      convolver = ctx.createConvolver();
      revSend = ctx.createGain(); revSend.gain.value = 1;
      revReturn = ctx.createGain(); revReturn.gain.value = 0;
      revSend.connect(convolver).connect(revReturn).connect(focusBus);
      engGain.connect(revSend);
      applyVenue();
    }

    rivalPeak = usingSamples ? 0.28 : 0.055;
    RIVAL_VOICES = lowPower() ? RIVAL_VOICES_MOBILE : RIVAL_VOICES_DESKTOP;
    rivalVoices = [];
    _rivalRevSm.length = 0;
    _rivalRevSmT = 0;
    if (ctx.createStereoPanner) {
      for (let i = 0; i < RIVAL_VOICES; i++) {
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass"; filt.frequency.value = 2000;
        const gain = ctx.createGain(); gain.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = 0;
        filt.connect(gain).connect(pan).connect(focusBus);
        if (revSend) pan.connect(revSend);
        const v = { filt, gain, pan, detune: RIVAL_DETUNE[i % RIVAL_DETUNE.length],
                    src: null, oscs: null, start: null, stop: null, setPitch: null };
        if (usingSamples) {
          const src = ctx.createBufferSource();
          src.buffer = engBuf; src.loop = true;
          const li = engLoop;
          src.loopStart = li.start; src.loopEnd = li.end;
          src.playbackRate.value = 0.4;
          src.connect(filt);
          const off = li.start + (li.end - li.start) * (i / RIVAL_VOICES);
          v.src = src;
          v.start = () => src.start(0, off);
          v.stop = (t) => src.stop(t);
          v.setPitch = (t, rev01, mul) => {
            const rate = baseRate(Math.pow(rev01, tune.curve)) * tune.pitch * mul;
            if (Math.abs((src.playbackRate._apexRate ?? -1) - rate) > RIVAL_EPS_RATE) {
              src.playbackRate.setTargetAtTime(rate, t, 0.06);
              src.playbackRate._apexRate = rate;
            }
          };
        } else {
          const a = ctx.createOscillator(), b = ctx.createOscillator();
          a.type = "sawtooth"; b.type = "sawtooth";
          a.frequency.value = 160; b.frequency.value = 160;
          b.detune.value = 14;
          a.connect(filt); b.connect(filt);
          v.oscs = [a, b];
          v.start = () => { a.start(); b.start(); };
          v.stop = (t) => { a.stop(t); b.stop(t); };
          v.setPitch = (t, rev01, mul) => {
            const f = (95 + rev01 * 700) * mul;
            if (Math.abs((a.frequency._apexHz ?? -1) - f) > 0.5) {
              a.frequency.setTargetAtTime(f, t, 0.06);
              b.frequency.setTargetAtTime(f, t, 0.06);
              a.frequency._apexHz = f;
            }
          };
        }
        rivalVoices.push(v);
      }
    }

    whineOsc = ctx.createOscillator();
    whineGain = ctx.createGain();
    whineOsc.type = "sine";
    whineOsc.frequency.value = 1500;
    whineGain.gain.value = 0;
    whineOsc.connect(whineGain).connect(focusBus);

    harvSrc = ctx.createBufferSource();
    harvSrc.buffer = loopNoise("harvest", 0.7);
    harvSrc.loop = true;
    harvFilter = ctx.createBiquadFilter();
    harvFilter.type = "bandpass";
    harvFilter.frequency.value = 900;
    harvFilter.Q.value = 6;
    harvGain = ctx.createGain();
    harvGain.gain.value = 0;
    harvSrc.connect(harvFilter).connect(harvGain).connect(focusBus);

    lfo = ctx.createOscillator();
    lfoG = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 8;
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    if (usingSamples) {
      lfoG.connect(engSrcIdle.detune);
      limPitch.connect(engSrcIdle.detune);
    } else {
      lfoG.connect(engA.detune);
      lfoG.connect(engB.detune);
      lfoG.connect(engC.detune);
      limPitch.connect(engA.detune);
      limPitch.connect(engB.detune);
      limPitch.connect(engC.detune);
    }

    skidSrc = ctx.createBufferSource();
    skidSrc.buffer = loopNoise("skid", 0.5);
    skidSrc.loop = true;
    skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 900;
    skidFilter.Q.value = 1.4;
    skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilter).connect(skidGain).connect(sfxBus);
    skidLfo = ctx.createOscillator();
    skidLfo.type = "sine";
    skidLfo.frequency.value = 30 / (2 * Math.PI);
    skidLfoGain = ctx.createGain();
    skidLfoGain.gain.value = 0;
    skidLfo.connect(skidLfoGain).connect(skidFilter.frequency);

    scrubSrc = ctx.createBufferSource();
    scrubSrc.buffer = loopNoise("scrub", 0.5);
    scrubSrc.loop = true;
    scrubFilter = ctx.createBiquadFilter();
    scrubFilter.type = "bandpass"; scrubFilter.frequency.value = 520; scrubFilter.Q.value = 0.9;
    scrubGain = ctx.createGain(); scrubGain.gain.value = 0;
    lockFilter = ctx.createBiquadFilter();
    lockFilter.type = "bandpass"; lockFilter.frequency.value = 1900; lockFilter.Q.value = 7;
    lockGain = ctx.createGain(); lockGain.gain.value = 0;
    scrubSrc.connect(scrubFilter).connect(scrubGain).connect(sfxBus);
    scrubSrc.connect(lockFilter).connect(lockGain).connect(sfxBus);
    surfSrc = ctx.createBufferSource();
    surfSrc.buffer = loopNoise("surface", 0.5);
    surfSrc.loop = true;
    surfFilter = ctx.createBiquadFilter();
    surfFilter.type = "lowpass"; surfFilter.frequency.value = 180; surfFilter.Q.value = 0.7;
    surfGain = ctx.createGain(); surfGain.gain.value = 0;
    surfSrc.connect(surfFilter).connect(surfGain).connect(sfxBus);

    kerbSrc = ctx.createBufferSource();
    kerbSrc.buffer = loopNoise("kerb", 0.45);
    kerbSrc.loop = true;
    kerbSrc.playbackRate.value = 0.85;
    kerbFilter = ctx.createBiquadFilter();
    kerbFilter.type = "bandpass"; kerbFilter.frequency.value = 320; kerbFilter.Q.value = 0.85;
    kerbGain = ctx.createGain(); kerbGain.gain.value = 0;
    kerbSrc.connect(kerbFilter).connect(kerbGain).connect(sfxBus);

    spraySrc = ctx.createBufferSource();
    spraySrc.buffer = loopNoise("spray", 0.55);
    spraySrc.loop = true;
    sprayFilter = ctx.createBiquadFilter();
    sprayFilter.type = "bandpass"; sprayFilter.frequency.value = 2200; sprayFilter.Q.value = 0.7;
    sprayGain = ctx.createGain(); sprayGain.gain.value = 0;
    spraySrc.connect(sprayFilter).connect(sprayGain).connect(sfxBus);

    windSrc = ctx.createBufferSource();
    windSrc.buffer = loopNoise("wind", 0.5);
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(sfxBus);

    brakeSrc = ctx.createBufferSource();
    brakeSrc.buffer = loopNoise("brakes", 0.6);
    brakeSrc.loop = true;
    brakeFilter = ctx.createBiquadFilter();
    brakeFilter.type = "bandpass";
    brakeFilter.frequency.value = 900;
    brakeFilter.Q.value = 0.9;
    brakeGain = ctx.createGain();
    brakeGain.gain.value = 0;
    brakeSrc.connect(brakeFilter).connect(brakeGain).connect(sfxBus);

    if (usingSamples) engSrcIdle.start(0, engSrcIdle.loopStart);
    else { engA.start(); engB.start(); engC.start(); }
    whineOsc.start();
    if (subOctOsc) subOctOsc.start();
    for (const v of rivalVoices) v.start();
    harvSrc.start();
    lfo.start();
    skidLfo.start();
    skidSrc.start();
    scrubSrc.start();
    surfSrc.start();
    kerbSrc.start();
    spraySrc.start();
    windSrc.start();
    brakeSrc.start();
    contactVoices = [];
    _contactCdN = 0;
    contactFired = contactDeniedCd = contactDeniedCap = contactDeniedGate = 0;
    if (ctx.createStereoPanner && sfxOk()) {
      const nContact = lowPower() ? CONTACT_VOICES_MOBILE : CONTACT_VOICES_DESKTOP;
      for (let ci = 0; ci < nContact; ci++) {
        const cOsc = ctx.createOscillator();
        cOsc.type = "sawtooth"; cOsc.frequency.value = 120;
        const cFilt = ctx.createBiquadFilter();
        cFilt.type = "bandpass"; cFilt.frequency.value = 900; cFilt.Q.value = 1.2;
        const cGain = ctx.createGain(); cGain.gain.value = 0;
        const cPan = ctx.createStereoPanner(); cPan.pan.value = 0;
        cOsc.connect(cFilt).connect(cGain).connect(cPan).connect(sfxBus);
        contactVoices.push({ osc: cOsc, filt: cFilt, gain: cGain, pan: cPan, freeAt: 0 });
        cOsc.start(0);
      }
    }

    lastSpeed = 0;
    lastEngT = 0;
    harvLevel = 0; harvBrakeLevel = 0; harvCoastLevel = 0;
    shiftDuck = 0;
    shiftDuckT = 0;
    pullT = 0;
    overrunT = 0;
  }
  function startEngine() {
    ++engineActionGeneration; resumeEngine = null;
    startEngineGraph();
  }
  function startEngineGraph() {
    if (!ctx || engineOn) return;
    if (!sfxOk()) { engineWanted = true; return; }
    engineWanted = false;
    engineOn = true;
    wakeLayers();
    try { startEngineBody(); }
    catch (e) { try { stopEngine(); } catch (_) {  } engineOn = false; throw e; }
    if (typeof CrowdAudio !== "undefined" && CrowdAudio.attach) {
      try { CrowdAudio.attach(); } catch (e) {  }
    }
  }

  function stopEngine() {
    ++engineActionGeneration; resumeEngine = null; engineWanted = false; sfxOffArmed = false;
    stopEngineGraph();
  }
  function stopEngineGraph() {
    if (!engineOn) return;
    const t0 = now();
    scheduleLayerIdle();
    soundtrack.releaseEngineDuck(t0, true);
    if (engGain) { engGain.gain.cancelScheduledValues(t0); engGain.gain.setTargetAtTime(0, t0, 0.06); }
    if (whineGain) whineGain.gain.setTargetAtTime(0, t0, 0.06);
    if (harvGain) harvGain.gain.setTargetAtTime(0, t0, 0.06);
    if (typeof ErsLayer !== "undefined" && ErsLayer.silence) ErsLayer.silence(t0);
    if (typeof RivalAudio !== "undefined" && RivalAudio.silence) RivalAudio.silence(t0);
    if (windGain) windGain.gain.setTargetAtTime(0, t0, 0.06);
    if (skidGain) skidGain.gain.setTargetAtTime(0, t0, 0.04);
    if (scrubGain) scrubGain.gain.setTargetAtTime(0, t0, 0.04);
    if (lockGain) lockGain.gain.setTargetAtTime(0, t0, 0.04);
    if (surfGain) surfGain.gain.setTargetAtTime(0, t0, 0.06);
    if (kerbGain) kerbGain.gain.setTargetAtTime(0, t0, 0.06);
    if (sprayGain) sprayGain.gain.setTargetAtTime(0, t0, 0.06);
    if (brakeGain) brakeGain.gain.setTargetAtTime(0, t0, 0.06);
    kerbLive = false;
    sprayAhead = 0;
    const stopAt = (n, t) => { try { if (n) n.stop(t); } catch (e) {  } };
    if (usingSamples) {
      if (engGainIdle) engGainIdle.gain.setTargetAtTime(0, t0, 0.06);

      stopAt(engSrcIdle, t0 + 0.35);

    } else {
      stopAt(engA, t0 + 0.35); stopAt(engB, t0 + 0.35); stopAt(engC, t0 + 0.35);
    }
    const deadIdleGain = engGainIdle;
    engSrcIdle = engGainIdle = null;
    if (limGain) limGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadLimGain = limGain;
    if (limPitch) limPitch.gain.setTargetAtTime(0, t0, 0.02);
    const deadLimPitch = limPitch;
    if (limOsc) { stopAt(limOsc, t0 + 0.35); limOsc = null; limGain = null; limPitch = null; }
    if (gravGain) gravGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadGravGain = gravGain;
    if (gravOsc) { stopAt(gravOsc, t0 + 0.35); gravOsc = null; gravGain = null; }
    if (pitLimGain) pitLimGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadPitLim = pitLimGain;
    if (pitLimOsc) { stopAt(pitLimOsc, t0 + 0.35); pitLimOsc = null; pitLimGain = null; }
    if (cylCutGain) cylCutGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadCylCut = cylCutGain;
    if (cylCutOsc) { stopAt(cylCutOsc, t0 + 0.35); cylCutOsc = null; cylCutGain = null; }
    stopAt(scrubSrc, t0 + 0.35);
    stopAt(surfSrc, t0 + 0.35);
    stopAt(kerbSrc, t0 + 0.35);
    stopAt(spraySrc, t0 + 0.35);
    scrubSrc = surfSrc = kerbSrc = spraySrc = null;
    stopAt(brakeSrc, t0 + 0.35);
    stopAt(whineOsc, t0 + 0.35);
    stopAt(subOctOsc, t0 + 0.35);
    for (const v of rivalVoices) { try { v.gain.gain.setTargetAtTime(0, t0, 0.06); v.stop(t0 + 0.35); } catch (e) {  } }
    for (const v of contactVoices) {
      try { v.gain.gain.setTargetAtTime(0, t0, 0.04); stopAt(v.osc, t0 + 0.35); } catch (e) {  }
    }
    stopAt(harvSrc, t0 + 0.35);
    stopAt(windSrc, t0 + 0.35);
    stopAt(lfo, t0 + 0.35);
    stopAt(skidSrc, t0 + 0.35);
    stopAt(skidLfo, t0 + 0.35);
    const deadSub = (engC && engC._apexSubGain) || null;
    engA = engB = engC = null;
    whineOsc = null;
    harvSrc = null;
    windSrc = null;
    brakeSrc = null;
    lfo = null;
    skidSrc = null;
    if (dbgAnalyser) { try { dbgAnalyser.disconnect(); } catch (e) {  } dbgAnalyser = null; }
    const dead = [engFilter, engGain, tiltEq, whineGain, harvFilter, harvGain, skidFilter, skidGain, skidLfo, skidLfoGain, lfoG,
                  voiceFormant, windFilter, windGain, deadSub, subOctGain,
                  deadIdleGain, deadLimGain, deadLimPitch, deadGravGain, brakeFilter, brakeGain,
                  revSend, convolver, revReturn, deadPitLim, deadCylCut, scrubFilter, scrubGain, lockFilter, lockGain,
                  surfFilter, surfGain, kerbFilter, kerbGain, sprayFilter, sprayGain];
    for (const v of rivalVoices) { dead.push(v.filt, v.gain, v.pan); }
    for (const v of contactVoices) { dead.push(v.filt, v.gain, v.pan); }
    queueDying(dead);
    engFilter = engGain = whineGain = harvFilter = harvGain = skidFilter = skidGain = skidLfo = skidLfoGain = lfoG = null;
    voiceFormant = windFilter = windGain = tiltEq = null;
    brakeFilter = brakeGain = null;
    scrubFilter = scrubGain = lockFilter = lockGain = surfFilter = surfGain = null;
    kerbFilter = kerbGain = sprayFilter = sprayGain = null;
    revFlare = 0; pitLimLvl = 0;
    subOctOsc = subOctGain = null;
    convolver = revSend = revReturn = null;
    rivalVoices = [];
    contactVoices = [];
    fieldArmed = false;
    _contactCdN = 0;
    idleGainRamped = false;
    rateFresh = false;
    lastGearSeen = NaN;
    engineOn = false;
  }

  function setEngine(rev01, boost01, offroad, speed01, gear, physics) {
    if (!engineOn || !sfxOk()) {
      if (!sfxOk()) kerbLive = false;
      return;
    }
    if (samplesReady && engBuf && !usingSamples) {
      stopEngineGraph();
      keepFade = true;
      try { startEngineGraph(); } finally { keepFade = false; }
    }
    const rev = clamp01(rev01 || 0);
    const s = clamp01(typeof speed01 === "number" ? speed01 : (rev01 || 0));
    const b = clamp01(typeof boost01 === "number" ? boost01 : (boost01 ? 1 : 0));
    const t = ctx.currentTime;

    const ph = physics || {};
    const slip01 = clamp01(1 - (ph.slip != null ? ph.slip : 1));
    const brakeFull = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.BRAKE) || 22;
    const onBrakes = ph.brake != null ? ph.brake > 0.08 : -(ph.ax || 0) > brakeFull * 0.5;
    const brakeFrac = onBrakes ? clamp01(-(ph.ax || 0) / brakeFull) : 0;
    const pull = Math.max(0, ph.axStd != null ? ph.axStd : (ph.ax || 0));
    const onKerb = !!ph.onKerb;
    const wet = !!ph.wet;
    const thr = clamp01(ph.throttle != null ? ph.throttle : 1);

    let g01 = 0.3;
    if (typeof gear === "number" && isFinite(gear)) g01 = (Math.max(1, Math.min(8, Math.round(gear))) - 1) / 7;

    if (shiftDuck > 0.0001) {
      const sd = shiftDuckT ? Math.max(0, t - shiftDuckT) : 0;
      shiftDuck = shiftDuck * Math.exp(-sd / 0.12);
      shiftDuckT = t;
      if (shiftDuck < 0.0001) shiftDuck = 0;
    }
    if (revFlare > 0.0001) {
      const fd = revFlareT ? Math.max(0, t - revFlareT) : 0;
      revFlare = revFlare * Math.exp(-fd / 0.09);
      revFlareT = t;
      if (revFlare < 0.0001) revFlare = 0;
    }

    const revC = Math.pow(rev, tune.curve);
    let f0 = 0;
    {
      const g = (typeof gear === "number" && isFinite(gear)) ? Math.max(1, Math.min(8, Math.round(gear))) : 8;
      const rate = baseRate(revC) * (1 + 0.04 * b * tune.boostPitch) * voice.rateTrim * tune.pitch * (1 + 0.05 * revFlare);
      const gearChanged = typeof gear === "number" && isFinite(gear) && isFinite(lastGearSeen) && g !== lastGearSeen;
      if (usingSamples) {
        lastRate = rate;
        const cur = engSrcIdle.playbackRate.value;
        if (rateFresh || gearChanged || Math.abs(rate - cur) >= RATE_SNAP_JUMP) {
          snapParam(engSrcIdle.playbackRate, rate, t);
        } else {
          aimParam(engSrcIdle.playbackRate, rate, t, 0.035, 1e-4);
        }
        rateFresh = false;
        f0 = enginePeriod > 1 ? (ctx.sampleRate * rate) / enginePeriod : 0;
        if (!idleGainRamped && engGainIdle) { engGainIdle.gain.setTargetAtTime(0.9, t, 0.05); idleGainRamped = true; }
      } else {
        lastRate = rate;
        const base = (SYNTH_IDLE_HZ * tune.idle + revC * SYNTH_SPAN_HZ * tune.revRange) * (1 + 0.12 * b * tune.boostPitch) * voice.rateTrim * tune.pitch;
        if (gearChanged) {
          snapParam(engA.frequency, base * 0.994, t);
          snapParam(engB.frequency, base * (1 + (voice.synthSpread - 1) * tune.detune), t);
          snapParam(engC.frequency, base * 0.5, t);
        } else {
          aimParam(engA.frequency, base * 0.994, t, 0.025, 1e-4);
          aimParam(engB.frequency, base * (1 + (voice.synthSpread - 1) * tune.detune), t, 0.025, 1e-4);
          aimParam(engC.frequency, base * 0.5, t, 0.025, 1e-4);
        }
        f0 = base;
      }
      if (typeof gear === "number" && isFinite(gear)) lastGearSeen = g;
    }

    const slipLoad  = slip01 * 0.12;
    const brakeLoad = brakeFrac * 0.08;
    const kerbLoad  = onKerb ? 0.04 : 0;
    const loadLift  = clamp01(pull / ((typeof PhysicsConsts !== "undefined" && PhysicsConsts.ACCEL) || 7));
    const lifting = rev > 0.35 && s > 0.12 && (ph.ax || 0) < -0.5 && !onBrakes;
    const overrunAmt = (lifting && layers.overrun)
      ? clamp01(-(ph.ax || 0) / 10) * Math.min(1, tune.overrun)
      : 0;
    const thrOpen = (ph.throttle != null && !lifting && thr > 0.12)
      ? clamp01((thr - 0.12) / 0.88) : 0;

    const ceil = ctx.sampleRate * 0.45;
    const cut = Math.min(ceil, (usingSamples
      ? Math.min(11000, 2600 + s * 5800 + rev * 2400 + b * 1500 + slipLoad * 2000 + brakeLoad * 1200)
      : Math.min(7200,  600  + s * 4200 + rev * 700  + b * 1400 + slipLoad * 1000 + brakeLoad * 600))
      * voice.cutTrim * tune.brightness * (1 + 0.22 * loadLift) * (1 + 0.10 * thrOpen) * (1 - 0.22 * overrunAmt));
    aimParam(engFilter.frequency, cut * camMix.cut, t, 0.05, 1e-4);
    if (tiltEq && lastRate > 0.02) {
      const want = Math.min(12, Math.max(0, -12 * Math.log10(lastRate)) * 0.75 * tune.brightness);
      if (Math.abs((tiltEq.gain._apexTilt ?? -99) - want) > 0.05) {
        tiltEq.gain.setTargetAtTime(want, t, 0.08);
        tiltEq.gain._apexTilt = want;
      }
    }
    const lvl = (usingSamples
      ? (0.3 + s * 0.3 + rev * 0.08 + b * 0.08 + (offroad ? 0.03 : 0) + slipLoad * 0.8 + kerbLoad)
      : (0.05 + s * 0.05 + rev * 0.02 + b * 0.025 + (offroad ? 0.012 : 0) + slipLoad * 0.2 + kerbLoad * 0.3))
      * (1 + 0.08 * loadLift) * (1 - 0.08 * overrunAmt);
    const limOn = layers.limiter && rev > 0.985 && s > 0.05;
    const topGear = gear >= ((typeof PhysicsConsts !== "undefined" && PhysicsConsts.GEARS) || 8);
    if (limOn && topGear) { if (limSince == null) limSince = t; } else limSince = null;
    const limFade = limSince == null ? 1 : clamp01(1 - (t - limSince - LIM_HOLD) / LIM_FADE);
    const limDepth = limOn ? Math.min(lvl * 0.5, lvl * 0.45 * tune.limiter) * limFade : 0;
    const mult = (1 - 0.55 * shiftDuck) * camMix.engine;
    const limSwing = Math.floor(limDepth * mult * 1e4) / 1e4;
    if (limGain && limGain._apexLimTgt !== limSwing) {
      limGain.gain.setTargetAtTime(limSwing, t, 0.02);
      limGain._apexLimTgt = limSwing;
    }
    const limCents = limOn ? 30 * tune.limPitch * limFade : 0;
    if (limPitch && limPitch._apexCents !== limCents) {
      limPitch.gain.setTargetAtTime(limCents, t, 0.02);
      limPitch._apexCents = limCents;
    }
    const pitDepth = Math.round(pitLimLvl * Math.max(0, Math.min(lvl * 0.22, lvl * 0.5 - limDepth)) * mult * 1000) / 1000;
    if (pitLimGain && pitLimGain._apexTgt !== pitDepth) { pitLimGain.gain.setTargetAtTime(pitDepth, t, 0.03); pitLimGain._apexTgt = pitDepth; }
    const engBase = (lvl - limDepth) * mult - pitDepth;
    aimGain(engGain, engBase, t, 0.03);

    if (gravOsc && gravGain) {
      const gravF = Math.max(18, Math.min(140, f0 / 3));
      if (layerMoving(gravGain, layers.gravel, t, 0.05) && Math.abs((gravOsc.frequency._apexHz ?? -1) - gravF) > 0.5) {
        gravOsc.frequency.setTargetAtTime(gravF, t, 0.05);
        gravOsc.frequency._apexHz = gravF;
      }
      const lump = (1 - rev) * (1 - rev);
      const want = layers.gravel ? engBase * 0.55 * lump * tune.gravel : 0;
      aimGain(gravGain, Math.min(want, Math.max(0, engBase - limSwing - pitDepth)), t, 0.05);
    }

    const deploy01 = clamp01(ph.deploy != null ? ph.deploy : b);
    const lowGearFactor = g01 < 0.35 ? 0.85 + g01 * 0.43 : 1;
    if (layerMoving(whineGain, layers.whine, t, 0.08))
      aimParam(whineOsc.frequency, (voice.whineHz + rev * 2000 + deploy01 * 700 + s * deploy01 * 900) * lowGearFactor, t, 0.05, 1e-4);
    aimGain(whineGain,
      layers.whine ? (0.004 + rev * 0.013 + deploy01 * 0.011 + b * 0.008) * (s > 0.04 ? 1 : 0) * (usingSamples ? 0.50 : 1)
        * voice.whineLvl * tune.whine * (1 + 0.55 * deploy01 * (0.3 + 0.7 * s)) : 0, t, 0.08);

    if (subOctGain && subOctOsc) {
      const f0 = enginePeriod > 1 ? (ctx.sampleRate * lastRate) / enginePeriod : 0;
      const subF = Math.max(25, Math.min(240, f0 * 0.5));
      if (layerMoving(subOctGain, layers.sub, t, 0.08) && Math.abs((subOctOsc._apexSubF ?? -1) - subF) > 0.25) { subOctOsc.frequency.setTargetAtTime(subF, t, 0.05); subOctOsc._apexSubF = subF; }
      aimGain(subOctGain, layers.sub
        ? (0.012 + rev * 0.016 + b * 0.006) * (s > 0.04 ? 1 : 0) * voice.subLvl * tune.sub
        : 0, t, 0.08);
    }

    if (lifting && layers.overrun) {
      if (t >= overrunT) {
        const rate = 0.055 + 0.10 * (1 - clamp01(-(ph.ax || 0) / 12)) * (1.3 - rev);
        overrunT = t + rate * (0.55 + Math.random() * 0.9);
        const k = (0.35 + 0.65 * rev) * tune.overrun;
        overrunFired++;
        noise(0.055 * k, 0.045, 2600 + Math.random() * 2200);
        if (Math.random() < 0.28) blip(90 + Math.random() * 50, "square", 0.05 * k, 0.002, 0.05, 55);
      }
    } else if (t > overrunT) {
      overrunT = t;
    }

    const dt = lastEngT ? Math.max(0.001, t - lastEngT) : 0;
    const brkDem = clamp01(ph.brake != null ? ph.brake : 0);
    const deploy = deploy01;
    const energy = ph.energy != null ? clamp01(ph.energy) : 1;
    let decelTarget = 0;
    if (dt >= 0.008) {
      const decel = (lastSpeed - s) / dt;
      decelTarget = clamp01(decel * 5) * Math.min(1, s * 3);
    }
    if (brkDem > 0.08 && s > 0.06) {
      decelTarget = Math.max(decelTarget, clamp01(brkDem * 0.9) * Math.min(1, s * 2.6));
    }
    const coastActive = thr < 0.06 && brkDem < 0.06 && deploy < 0.05 && s > 0.16;
    const regenK = clamp01(ph.regen != null ? ph.regen : 0.55);
    const packFull = energy > 0.97;
    let coastTarget = 0;
    if (coastActive) {
      coastTarget = clamp01((s - 0.14) / 0.86) * regenK;
      if (packFull) coastTarget *= 0.22;
    }
    lastEngT = t;
    lastSpeed = s;
    const harvTau = 0.12;
    harvBrakeLevel += (decelTarget - harvBrakeLevel) * Math.min(1, (dt || 0.016) / harvTau);
    const coastSmooth = coastActive ? harvTau * 1.35 : harvTau * 0.45;
    harvCoastLevel += (coastTarget - harvCoastLevel) * Math.min(1, (dt || 0.016) / coastSmooth);
    const coastW = 0.52;
    harvLevel = harvBrakeLevel + harvCoastLevel * coastW;
    const harvGainScale = usingSamples ? 0.035 : 0.06;
    const coastMix = harvLevel > 1e-6 ? (harvCoastLevel * coastW) / harvLevel : 0;
    if (layerMoving(harvGain, layers.harvest && harvLevel > 1e-3, t, 0.06)) {
      aimParam(harvFilter.frequency, 680 + s * 1500 + coastMix * 420, t, 0.08, 1e-4);
      if (harvFilter._apexQ == null) harvFilter._apexQ = harvFilter.Q.value;
      const harvQ = 6 - coastMix * 2.4;
      if (Math.abs((harvFilter._apexHarvQ ?? -1) - harvQ) > 0.08) {
        aimParam(harvFilter.Q, harvQ, t, 0.12, 0.05);
        harvFilter._apexHarvQ = harvQ;
      }
    }
    aimGain(harvGain, layers.harvest ? harvLevel * harvGainScale * tune.harvest : 0, t, 0.06);

    soundtrack.duckForEngine(rev, t);
    const partBias = ph.ersDeploy != null ? 0.8 + 0.4 * clamp01(ph.ersDeploy) : 1;
    if (typeof ErsLayer !== "undefined" && ErsLayer.update) {
      const e = _ersArg;
      e.t = t; e.deploy = deploy; e.energy = energy; e.brake = brkDem; e.ax = ph.ax || 0; e.speed = s;
      e.layerOn = layers.ers; e.ersOn = ph.ersOn !== false;
      e.boost = deploy > 0 || !!ph.boostOn || !!ph.otOn; e.otOn = !!ph.otOn;
      e.boostTune = tune.boost; e.partBias = partBias;
      ErsLayer.update(e);
    }

    const partThr = thr > 0.1 && thr < 0.72 && deploy < 0.05 && s > 0.08;
    const packClip = packFull && deploy < 0.05 && (coastTarget > 0.04 || decelTarget > 0.08 || brkDem > 0.12);
    const cylOn = layers.ers && (partThr || packClip);
    const cylDepth = cylOn ? Math.min(engBase * 0.07, 0.011) * mult : 0;
    if (cylCutGain && cylCutGain._apexCylTgt !== cylDepth) {
      cylCutGain.gain.setTargetAtTime(cylDepth, t, 0.04);
      cylCutGain._apexCylTgt = cylDepth;
    }

    const wf = windFromSpeed(s, _windScratch);
    const windOpen = s > WIND_GATE ? 1 : 0;
    const gust = harvLevel;
    const rough = (offroad ? 0.5 : 0) + (onKerb ? 0.35 : 0);
    const tow = clamp01(ph.tow || 0);
    if (layerMoving(windGain, layers.wind, t, 0.10))
      aimParam(windFilter.frequency, wf.hz + rough * 260, t, 0.12, 1e-4);
    aimGain(windGain,
      layers.wind ? wf.gain * (1 + 0.45 * rough + 0.30 * gust) * (wet ? 1.25 : 1) * (1 - 0.35 * tow) * windOpen * tune.wind * camMix.wind : 0,
      t, 0.10);

    if (brakeGain) {
      const brk = brakeFrac > 0 ? brakeFrac * Math.min(1, 0.25 + s) : 0;
      aimGain(brakeGain, (layers.brakes && brk > 0) ? brk * (0.020 + 0.050 * s) * (wet ? 0.8 : 1) * tune.brakes : 0, t, 0.06);
      if (brk > 0) {
        const bf = (600 + s * 900 + brakeFrac * 500) * (wet ? 0.85 : 1);
        if (Math.abs((brakeFilter.frequency._apexHz ?? -1) - bf) > 20) {
          brakeFilter.frequency.setTargetAtTime(bf, t, 0.08);
          brakeFilter.frequency._apexHz = bf;
        }
      }
    }

    kerbLive = onKerb;
    if (kerbGain) {
      const kerbLvl = onKerb ? (0.010 + 0.070 * s) : 0;
      aimGain(kerbGain, kerbLvl, t, 0.05);
      if (onKerb && kerbSrc && kerbFilter) {
        aimParam(kerbSrc.playbackRate, 0.80 + 1.10 * s, t, 0.06, 1e-4);
        const khz = 260 + 640 * s;
        if (Math.abs((kerbFilter.frequency._apexHz ?? -1) - khz) > 8) {
          kerbFilter.frequency.setTargetAtTime(khz, t, 0.08);
          kerbFilter.frequency._apexHz = khz;
        }
      }
    }

    if (sprayGain) {
      const own = wet ? Math.min(0.045, 0.055 * s * s) : 0;
      const wake = wet && layers.rivals ? sprayAhead * 0.018 * Math.min(1, 0.35 + s) * tune.rivals : 0;
      aimGain(sprayGain, own + wake, t, 0.08);
      if ((own + wake) > 0 && sprayFilter) {
        const shz = 1600 + 1400 * s;
        if (Math.abs((sprayFilter.frequency._apexHz ?? -1) - shz) > 20) {
          sprayFilter.frequency.setTargetAtTime(shz, t, 0.12);
          sprayFilter.frequency._apexHz = shz;
        }
      }
    }

    if (pull > 5 && rev > 0.45) pullT += dt;
    else if (pull < 0.5) {
      if (pullT > 0.5 && layers.whine && s > 0.1) {
        wasteFired++;
        const k = (0.4 + 0.6 * rev) * voice.whineLvl * tune.whine;
        hiss(0.055 * k, 0.16, 3800, 1300);
      }
      pullT = 0;
    }

    const lfoTgt = offroad ? 45 : 0;
    if (lfoG._apexLfoTgt !== lfoTgt) {
      lfoG.gain.setTargetAtTime(lfoTgt, t, 0.05);
      lfoG._apexLfoTgt = lfoTgt;
    }
  }

  function setGridIdle(player, opts) {
    fieldArmed = false;
    const o = opts || {};
    if (!player || o.soundOn === false || o.step === false) return;
    const idle = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.IDLE_RPM) || 5000;
    const max = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.MAX_RPM) || 15000;
    const rev = clamp01(((player.rpm || idle) - idle) / Math.max(1, max - idle));
    setEngine(rev, 0, false, 0, player.gear, {
      slip: 1, ax: 0, onKerb: false, wet: !!o.wet, tow: 0,
      deploy: 0, energy: player.energy ?? 1, ersDeploy: player.ersDeploy ?? 0.5,
    });
  }

  let _scrubWas = false, _scrubGear = null, _scrubRpm = null;
  const _ersArg = { t: 0, deploy: 0, energy: 1, brake: 0, ax: 0, speed: 0, layerOn: true, ersOn: true,
    boost: false, otOn: false, boostTune: 1, partBias: 1 };
  const _skidQ = { gain: 0, hz: 0, lfo: 0 };
  const _scrubArg = { slip: 1, ax: 0, onKerb: false, wet: false, tow: 0, deploy: 0, energy: 1, ersDeploy: 0, throttle: 0, brake: 0, regen: 0.5 };
  function syncReplayRpms(cars) {
    if (!_scrubGear || !_scrubRpm || !cars) return;
    for (const c of cars) {
      const v = Math.max(0, c.speed || 0);
      c.rpm = _scrubRpm(_scrubGear(v), v);
    }
  }
  function resetReplayScrub() { _scrubWas = false; }
  function feedReplayScrub(player, scrubbing, cars, gearOf, rpmFor, rivalAudio, isWet, vTop) {
    if (!player) return;
    if (!scrubbing) {
      if (_scrubWas) {
        stopEngine(); setRivals([]); _scrubWas = false;
        if (typeof RivalAudio !== "undefined" && RivalAudio.silence) RivalAudio.silence();
      }
      return;
    }
    _scrubWas = true;
    if (typeof gearOf === "function" && typeof rpmFor === "function") { _scrubGear = gearOf; _scrubRpm = rpmFor; }
    syncReplayRpms(cars);
    if (!engineOn) startEngine();
    const idle = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.IDLE_RPM) || 5000;
    const max = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.MAX_RPM) || 15000;
    const revFrac = clamp01((player.rpm - idle) / Math.max(1, max - idle));
    const gear = _scrubGear ? _scrubGear(Math.max(0, player.speed || 0)) : (player.gear || 1);
    _scrubArg.wet = typeof isWet === "function" ? !!isWet() : !!isWet;
    _scrubArg.energy = player.energy ?? 1; _scrubArg.regen = player.ersRegen ?? 0.5;
    const top = typeof vTop === "function" ? vTop() : vTop;
    setEngine(revFrac, 0, player.offroad, clamp01(player.speed / Math.max(1e-6, top || 0)), gear, _scrubArg);
    if (rivalAudio && rivalAudio.collect) setRivals(rivalAudio.collect(player));
  }

  let rainSrc = null, rainGain = null, rainHp = null, rainLp = null, rainStopping = false;
  let rainPending = null;
  let rainWanted = false;
  let rainLastGain = 0.065;

  function startRain(gain) {
    const g = gain == null ? rainLastGain : (rainLastGain = gain);
    rainWanted = true;
    if (rainSrc) { if (rainGain) rainGain.gain.setTargetAtTime(g, now(), 0.8); return; }
    if (!sfxOk()) return;
    if (rainStopping) { rainPending = g; return; }
    rainSrc = ctx.createBufferSource();
    rainSrc.buffer = loopNoise("rain", 4);
    rainSrc.loop = true;
    rainHp = ctx.createBiquadFilter();
    rainHp.type = "highpass";
    rainHp.frequency.value = 2200;
    rainHp.Q.value = 0.4;
    rainLp = ctx.createBiquadFilter();
    rainLp.type = "lowpass";
    rainLp.frequency.value = 8000;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainHp).connect(rainLp).connect(rainGain).connect(sfxBus);
    rainSrc.start();
    rainGain.gain.setTargetAtTime(g, now(), 1.2);
  }

  function stopRain(keepWant) {
    if (!keepWant) { rainWanted = false; resumeRain = false; }
    if (!rainSrc) { if (!keepWant) rainPending = null; return; }
    rainPending = null;
    rainStopping = true;
    const s = rainSrc, g = rainGain, h = rainHp, l = rainLp;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    try {
      g.gain.setTargetAtTime(0, now(), 0.4);
      setTimeout(() => {
        try { s.stop(); } catch (e) {  }
        try { s.disconnect(); g.disconnect(); h.disconnect(); l.disconnect(); } catch (e) {  }
        rainStopping = false;
        if (rainPending != null) { const pg = rainPending; rainPending = null; startRain(pg); }
      }, 1200);
    } catch (e) { rainStopping = false; rainPending = null; }
  }

  function setSkid(x, wet, extra) {
    if (!engineOn || !skidGain) return;
    let lat, long, rawAxes = false;
    if (x && typeof x === "object") {
      wet = x.wet; extra = x;
      lat = x.lat != null ? x.lat : (x.slip || 0);
      long = x.long || 0;
      rawAxes = true;
    } else {
      lat = extra && extra.lat != null ? extra.lat : (x || 0);
      long = extra && extra.long != null ? extra.long : 0;
      rawAxes = !!(extra && (extra.lat != null || extra.long != null));
    }
    let q;
    if (rawAxes) {
      q = squealFromSlip(lat, long, wet);
    } else {
      const over = clamp01(lat);
      const longL = clamp01(long || carSfxLast.lock || 0);
      q = _skidQ;
      q.gain = over * (wet ? 0.10 : 0.16);
      q.hz = (wet ? 480 : 760) + over * 320 + (over > 0 ? longL * 120 : 0);
      q.lfo = over > 0 ? 60 : 0;
    }
    const sv = layers.screech ? q.gain * tune.screech : 0;
    const sp = skidGain._apexSkidV;
    if (sp !== sv && (sv === 0 || sp === undefined || Math.abs(sp - sv) >= 1e-4)) { glideLevel(skidGain.gain, sv); skidGain._apexSkidV = sv; }
    if (q.lfo > 0) {
      if (Math.abs((skidFilter.frequency._apexSkidBase ?? -1) - q.hz) >= 1) {
        skidFilter.frequency.setTargetAtTime(q.hz, now(), LEVEL_TAU);
        skidFilter.frequency._apexSkidBase = q.hz;
      }
      if (skidLfoGain && (skidLfoGain._apexDepth ?? 0) !== q.lfo) {
        skidLfoGain.gain.setTargetAtTime(q.lfo, now(), LEVEL_TAU);
        skidLfoGain._apexDepth = q.lfo;
      }
    } else if (skidLfoGain && (skidLfoGain._apexDepth ?? 0) !== 0) {
      skidLfoGain.gain.setTargetAtTime(0, now(), LEVEL_TAU);
      skidLfoGain._apexDepth = 0;
    }
  }

  function setCarSfx(o) {
    if (!engineOn || !scrubGain) return;
    const t = now();
    const scrub = clamp01(o && o.scrub), lock = clamp01(o && o.lock);
    const surf = clamp01(o && o.surface), pit = clamp01(o && o.pitLim);
    const wet = !!(o && o.wet);
    const on = layers.screech ? tune.screech : 0;
    aimGain(scrubGain, scrub * (wet ? 0.035 : 0.06) * on, t, 0.06);
    aimGain(lockGain, lock * (wet ? 0.05 : 0.09) * on, t, 0.03);
    aimGain(surfGain, surf * 0.22, t, 0.08);
    const surfHz = 120 + 160 * surf;
    if (surf > 0 && Math.abs((surfFilter.frequency._apexHz ?? -99) - surfHz) > 2) {
      surfFilter.frequency.setTargetAtTime(surfHz, t, 0.1); surfFilter.frequency._apexHz = surfHz; surfSched++;
    }
    pitLimLvl = layers.limiter === false ? 0 : pit;
    carSfxLast.scrub = scrub; carSfxLast.lock = lock; carSfxLast.surface = surf; carSfxLast.pitLim = pit;
  }

  function pitGun(tighten) {
    pitGunFired++;
    if (!oneShotOk()) return;
    const lag = [0, 0.05, 0.11, 0.08];
    for (let i = 0; i < 4; i++) {
      const w = lag[i] + Math.random() * 0.03;
      const n = tighten ? 3 : 4;
      for (let k = 0; k < n; k++) noise(0.07, 0.03, (tighten ? 3200 : 2600) + i * 140, w + k * 0.045);
    }
  }

  function setCameraMix(id) {
    camKind = CAM_KIND[id] || "chase";
    camMix = CAM_MIX[camKind];
    applyVenue();
    return camKind;
  }

  function shift(up) {
    if (!oneShotOk()) return;
    const isUp = up !== false;
    const t0 = now();

    if (engineOn) {
      shiftDuck = isUp ? 1 : 0.7;
      shiftDuckT = t0;
      if (!isUp) { revFlare = 1; revFlareT = t0; }
    }

    const osc = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    f.type = "bandpass";
    f.Q.value = 1.2;
    const dur = isUp ? 0.085 : 0.11;
    const f0 = (isUp ? 520 : 300) * voice.rateTrim;
    const f1 = (isUp ? 300 : 360) * voice.rateTrim;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    f.frequency.setValueAtTime((isUp ? 1400 : 900) * voice.cutTrim, t0);
    f.frequency.exponentialRampToValueAtTime((isUp ? 600 : 700) * voice.cutTrim, t0 + dur);
    shiftPeak = (isUp ? 0.12 : 0.1) * tune.shift;
    shiftFired++;
    env(g, t0, Math.max(0.0001, shiftPeak), 0.004, dur);
    osc.connect(f).connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => { osc.disconnect(); f.disconnect(); g.disconnect(); };

    if (tune.shift > 0) noise((isUp ? 0.05 : 0.045) * tune.shift, 0.05, (isUp ? 2600 : 1800) * voice.cutTrim);
  }

  function lightOn(i) {
    const n = Math.max(0, Math.min(4, i | 0));
    blip(440 + n * 80, "square", 0.2, 0.01, 0.14);
  }

  function lightsOut() {
    blip(1245, "square", 0.26, 0.01, 0.12);
    blip(1245, "square", 0.24, 0.01, 0.22, null, 0.13);
  }

  function overtakeReady() {
    blip(880, "square", 0.16, 0.008, 0.08);
    blip(1109, "square", 0.16, 0.008, 0.14, null, 0.09);
  }

  function xMode(on) {
    if (on) {
      blip(740, "triangle", 0.10, 0.006, 0.06);
      blip(988, "triangle", 0.10, 0.006, 0.10, null, 0.07);
    } else {
      blip(988, "triangle", 0.08, 0.006, 0.06);
      blip(740, "triangle", 0.08, 0.006, 0.10, null, 0.07);
    }
  }

  function setVenue(def) {
    const theme = def && typeof def.theme === "string" ? def.theme : "";
    const key = (def && def.street) ? "street"
      : theme.indexOf("green") === 0 ? "green"
      : theme.indexOf("desert") === 0 ? "desert"
      : theme.indexOf("street") === 0 ? "street"
      : "modern";
    venueName = key;
    venue = VENUES[key] || VENUES.modern;
    applyVenue();
    return key;
  }

  function buildIR(v) {
    const cached = _irCache.get(venueName);
    if (cached) return cached;
    const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * v.decay));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const a = Math.exp((-2 * Math.PI * v.damp) / sr);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
        d[i] = lp * Math.pow(1 - i / len, 2.5);
      }
    }
    _irCache.set(venueName, buf);
    return buf;
  }

  function applyVenue() {
    if (!ctx || !convolver || !revReturn) return;
    const ir = buildIR(venue);
    if (convolver.buffer !== ir) convolver.buffer = ir;
    const wet = layers.reverb ? venue.level * tune.reverb * camMix.reverb : 0;
    revReturn.gain.setTargetAtTime(wet, now(), 0.2);
    if (revSend) revSend.gain.setTargetAtTime(wet > 0 ? 1 : 0, now(), 0.05);
  }

  function setVoice(engineName) {
    voice = ENGINE_VOICES[engineName] || ENGINE_VOICES["default"];
    voiceName = ENGINE_VOICES[engineName] ? engineName : "default";
    applyTuneNodes();
  }

  function sampleDetuneCents() {
    return voice.detune + Math.max(0, tune.detune - 1) * 30;
  }

  function applyTuneNodes() {
    if (!ctx) return;
    const t = now();
    if (engSrcIdle && engSrcIdle.detune) engSrcIdle.detune.setTargetAtTime(sampleDetuneCents(), t, 0.05);

    const subGain = engC && engC._apexSubGain;
    if (subGain) subGain.gain.setTargetAtTime(voice.subLvl * tune.sub, t, 0.05);

    if (limOsc) limOsc.frequency.setTargetAtTime(13 * tune.limRate, t, 0.05);
    applyRivalMix();
    applyVenue();
  }

  function setTune(patch) {
    GameAudioToneModel.patchTune(tune, patch);
    profileName = GameAudioToneModel.nameForTune(tune, profileName);
    applyTuneNodes();
    return Object.assign({}, tune);
  }

  function setProfile(name) {
    const key = Object.prototype.hasOwnProperty.call(SOUND_PROFILES, name) ? name : "team";
    profileName = key;
    tune = Object.assign({}, TUNE_DEF, SOUND_PROFILES[key] || {});
    applyTuneNodes();
    return key;
  }

  const _rivalRow = [];
  const RIVAL_REV_NET_TAU = 0.048;
  const _rivalRevSm = [];
  let _rivalRevSmT = 0;
  let _rivalPanExternal = null;
  function rivalPanPlayerFrame(lat, arc) {
    return 0.85 * Math.max(-1, Math.min(1, lat / Math.max(3, Math.abs(arc) + 3)));
  }
  function rivalPanFromCamera(basis, wx, wz) {
    const dx = wx - basis.x, dz = wz - basis.z;
    const lat = dx * basis.rightX + dz * basis.rightZ;
    const arc = dx * basis.fwdX + dz * basis.fwdZ;
    return rivalPanPlayerFrame(lat, arc);
  }
  function rivalSmoothedRev(vi, raw, net, key, dt) {
    let s = _rivalRevSm[vi];
    if (!s) s = _rivalRevSm[vi] = { key: null, a: raw, b: raw };
    const k = key != null ? key : vi;
    if (k !== s.key) { s.key = k; s.a = raw; s.b = raw; return raw; }
    if (!net) return raw;
    const alpha = 1 - Math.exp(-dt / RIVAL_REV_NET_TAU);
    s.a += alpha * (raw - s.a);
    s.b += alpha * (s.a - s.b);
    return s.b;
  }
  function setRivals(list) {
    sprayAhead = (typeof RivalAudio !== "undefined" && RivalAudio.sprayAhead)
      ? RivalAudio.sprayAhead(list) : 0;
    if (!engineOn || !rivalVoices.length) return;
    fieldArmed = true;
    const t = now();
    const dt = _rivalRevSmT > 0 ? Math.min(0.05, t - _rivalRevSmT) : 1 / 60;
    _rivalRevSmT = t;
    const basis = typeof GameCams !== "undefined" && GameCams.getListenerBasis ? GameCams.getListenerBasis() : null;
    const panExternal = !!(basis && basis.external);
    if (_rivalPanExternal !== null && panExternal !== _rivalPanExternal) {
      for (let i = 0; i < rivalVoices.length; i++) {
        if (rivalVoices[i].pan && rivalVoices[i].pan.pan) rivalVoices[i].pan.pan._apexPanTgt = undefined;
      }
    }
    _rivalPanExternal = panExternal;
    const n = layers.rivals && list ? Math.min(list.length, rivalVoices.length) : 0;
    for (let i = 0; i < rivalVoices.length; i++) _rivalRow[i] = -1;
    let unvoiced = 0;
    for (let k = 0; k < n; k++) {
      const sl = list[k].slot;
      if (Number.isInteger(sl) && sl >= 0 && sl < rivalVoices.length && _rivalRow[sl] < 0) {
        _rivalRow[sl] = k;
      } else if (!Number.isInteger(sl) || sl < 0) {
        if (_rivalRow[k] < 0) _rivalRow[k] = k; else unvoiced |= 1 << k;
      } else {
        unvoiced |= 1 << k;
      }
    }
    for (let k = 0, free = 0; unvoiced && k < n; k++) {
      if (!(unvoiced & (1 << k))) continue;
      while (free < rivalVoices.length && _rivalRow[free] >= 0) free++;
      if (free >= rivalVoices.length) break;
      _rivalRow[free] = k;
    }
    for (let i = 0; i < rivalVoices.length; i++) {
      const v = rivalVoices[i];
      if (_rivalRow[i] < 0) { aimGain(v.gain, 0, t, 0.12); continue; }
      const r = list[_rivalRow[i]];
      const lat = +r.lat || 0, arc = +r.arc || 0;
      const dist = Math.hypot(lat, arc);
      if (!(dist < RIVAL_RANGE)) { aimGain(v.gain, 0, t, 0.12); continue; }

      let pan;
      if (panExternal && basis && r.wx != null && r.wz != null) pan = rivalPanFromCamera(basis, r.wx, r.wz);
      else pan = rivalPanPlayerFrame(lat, arc);
      const _pp = v.pan.pan._apexPanTgt;
      if (_pp === undefined || Math.abs(_pp - pan) >= 0.004) {
        v.pan.pan.setTargetAtTime(pan, t, 0.06); v.pan.pan._apexPanTgt = pan;
      }

      const near = RIVAL_REF / (RIVAL_REF + 1.15 * Math.max(0, dist - RIVAL_REF));
      const behind = arc < 0 ? 0.78 : 1;
      const rv = (r.voice && ENGINE_VOICES[r.voice]) || ENGINE_VOICES["default"];
      aimGainRel(v.gain, PAN_MAKEUP * rivalPeak * tune.rivals * camMix.rivals * near * behind * (0.55 + 0.45 * clamp01(r.rev)), t, 0.10, RIVAL_EPS_GAIN);

      const cut = Math.max(700, Math.min(12000,
        12000 * Math.pow(RIVAL_REF / Math.max(dist, RIVAL_REF), 0.35) * rv.cutTrim));
      if (Math.abs((v.filt.frequency._apexCut ?? -1) - cut) > 60) {
        v.filt.frequency.setTargetAtTime(cut, t, 0.12);
        v.filt.frequency._apexCut = cut;
      }

      const closing = Math.max(-90, Math.min(90, +r.approach || 0));
      const dop = Math.max(0.80, Math.min(1.25, 343 / (343 - closing)));
      const rawRev = clamp01(r.rev);
      const rev01 = rivalSmoothedRev(i, rawRev, !!r.net, r.key, dt);
      v.setPitch(t, rev01, dop * v.detune * rv.rateTrim);
    }
  }

  function applyRivalMix() {
    const mix = layers.rivals ? tune.rivals : 0;
    if (typeof RivalAudio !== "undefined") {
      if (RivalAudio.setMix) RivalAudio.setMix(mix);
      else if (RivalAudio._pendingAttach) RivalAudio._pendingAttach.mix = mix;
    }
    if (mix > 0 || !ctx) return;
    const t = now();
    for (const v of rivalVoices) aimGain(v.gain, 0, t, 0.04);
    for (const v of contactVoices) {
      if (v.player) continue;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.04);
    }
  }

  function setLayer(name, on) {
    if (Object.prototype.hasOwnProperty.call(LAYER_DEF, name)) layers[name] = !!on;
    if (name === "reverb") applyVenue();
    if (name === "rivals") applyRivalMix();
    return Object.assign({}, layers);
  }

  function deployBoost() {
    boostPeak = layers.ers ? 0.14 * tune.boost : 0;
    boostFired++;
    if (!oneShotOk() || !(boostPeak > 0)) return;
    const t0 = now();
    if (typeof ErsLayer !== "undefined" && ErsLayer.cueBoost) ErsLayer.cueBoost(t0, tune.boost);
    const src = ctx.createBufferSource();
    const off = bindNoise(src, 0.7);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.5;
    f.frequency.setValueAtTime(240, t0);
    f.frequency.exponentialRampToValueAtTime(1400, t0 + 0.30);
    const g = ctx.createGain();
    env(g, t0, boostPeak, 0.04, 0.28);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, off);
    src.stop(t0 + 0.6);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {  } };
    blip(180, "sine", 0.035 * tune.boost, 0.025, 0.18, 360);
  }

  function collision(impact, scrape, side) {
    const k = clamp01(impact != null ? impact : 0.6);
    const panSide = side == null || side === 0 ? 0 : Math.max(-1, Math.min(1, +side));
    if (panSide !== 0 && scheduleContactVoice(scrape ? "scrape" : "bump", k, panSide, 1, true)) {
      _lastPlayerContactPan = panSide;
      return;
    }
    if (scrape) { scrapeNoise(0.12 + 0.22 * k, 0.22 + 0.18 * k); return; }
    blip(150, "sine", 0.34 * (0.4 + 0.6 * k), 0.005, 0.25, 45);
    noise(0.26 * (0.4 + 0.6 * k), 0.18, 900);
    if (k > 0.6) blip(70, "sine", 0.3 * (k - 0.6) / 0.4, 0.004, 0.3, 40);
  }

  function contactCdHit(key, t) {
    if (key == null || key < 0) return false;
    for (let i = 0; i < _contactCdN; i++) {
      if (_contactCdKeys[i] === key) return _contactCdUntil[i] > t;
    }
    return false;
  }
  function contactCdMark(key, t) {
    if (key == null || key < 0) return;
    const until = t + CONTACT_COOLDOWN;
    for (let i = 0; i < _contactCdN; i++) {
      if (_contactCdKeys[i] === key) { _contactCdUntil[i] = until; return; }
    }
    if (_contactCdN < _contactCdKeys.length) {
      _contactCdKeys[_contactCdN] = key; _contactCdUntil[_contactCdN] = until; _contactCdN++;
      return;
    }
    let oldest = 0;
    for (let i = 1; i < _contactCdN; i++) if (_contactCdUntil[i] < _contactCdUntil[oldest]) oldest = i;
    _contactCdKeys[oldest] = key; _contactCdUntil[oldest] = until;
  }
  function scheduleContactVoice(kind, impact, pan, near, player) {
    if (!sfxOk() || !engineOn || !contactVoices.length) {
      if (!player) contactDeniedGate++;
      return false;
    }
    if (!player && (!fieldArmed || !layers.rivals || !(tune.rivals > 0))) { contactDeniedGate++; return false; }
    const t = now();
    let v = null;
    for (let i = 0; i < contactVoices.length; i++) {
      if (contactVoices[i].freeAt <= t) { v = contactVoices[i]; break; }
    }
    if (!v) { contactDeniedCap++; return false; }
    const k = clamp01(impact != null ? impact : 0.5);
    const kd = kind || "bump";
    let peak, attack, decay, freq, q, fType;
    if (kd === "scrape") {
      peak = 0.10 + 0.16 * k; attack = 0.02; decay = 0.18 + 0.12 * k;
      freq = 2400; q = 1.2; fType = "bandpass";
    } else if (kd === "squeal") {
      peak = 0.08 + 0.14 * k; attack = 0.01; decay = 0.12 + 0.10 * k;
      freq = 1800 + 600 * k; q = 6; fType = "bandpass";
    } else {
      peak = 0.16 + 0.22 * k; attack = 0.005; decay = 0.14 + 0.12 * k;
      freq = 420 + 180 * k; q = 0.9; fType = "lowpass";
    }
    peak *= clamp01(near != null ? near : 1) * 0.9 * (player ? 1 : tune.rivals);
    v.player = !!player;
    if (!(peak > 0.001)) return false;
    v.filt.type = fType;
    v.filt.Q.value = q;
    v.filt.frequency.cancelScheduledValues(t);
    v.filt.frequency.setValueAtTime(freq, t);
    v.osc.type = kd === "squeal" ? "triangle" : kd === "scrape" ? "sawtooth" : "sine";
    v.osc.frequency.cancelScheduledValues(t);
    v.osc.frequency.setValueAtTime(kd === "bump" ? Math.max(55, freq * 0.35) : freq * 0.55, t);
    const panClamped = Math.max(-1, Math.min(1, pan));
    v.pan.pan.cancelScheduledValues(t);
    v.pan.pan.setValueAtTime(panClamped, t);
    env(v.gain, t, peak, attack, decay);
    v.freeAt = t + attack + decay + 0.05;
    contactFired++;
    return true;
  }
  function fieldContact(kind, impact, wx, wz, carKey) {
    if (!sfxOk() || !engineOn || !fieldArmed || !contactVoices.length) {
      contactDeniedGate++; return false;
    }
    const t = now();
    const key = carKey | 0;
    if (contactCdHit(key, t)) { contactDeniedCd++; return false; }
    let pan = 0, dist = CONTACT_REF;
    const basis = typeof GameCams !== "undefined" && GameCams.getListenerBasis
      ? GameCams.getListenerBasis() : null;
    if (basis && wx != null && wz != null && isFinite(+wx) && isFinite(+wz)) {
      const dx = +wx - basis.x, dz = +wz - basis.z;
      dist = Math.hypot(dx, dz);
      const lat = dx * basis.rightX + dz * basis.rightZ;
      const arc = dx * basis.fwdX + dz * basis.fwdZ;
      pan = rivalPanPlayerFrame(lat, arc);
    }
    if (!(dist < CONTACT_RANGE)) { contactDeniedGate++; return false; }
    const near = CONTACT_REF / (CONTACT_REF + 1.15 * Math.max(0, dist - CONTACT_REF));
    if (!scheduleContactVoice(kind, impact, pan, near, false)) return false;
    contactCdMark(key, t);
    return true;
  }
  function fieldContactState() {
    return {
      armed: fieldArmed,
      voices: contactVoices.length,
      live: contactVoices.filter((v) => v.freeAt > now()).length,
      fired: contactFired,
      deniedCd: contactDeniedCd,
      deniedCap: contactDeniedCap,
      deniedGate: contactDeniedGate,
      cooldown: CONTACT_COOLDOWN,
    };
  }
  function offtrack() {
    noise(0.14, 0.14, 480);
    blip(95, "square", 0.14, 0.01, 0.1, 60);
  }

  function rumble() {
    if (kerbLive) return;
    noise(0.09, 0.05, 320);
  }

  function thunder(near) {
    const n = Math.max(0, Math.min(1, near == null ? 0.6 : near));
    noise(0.10 + n * 0.22, 0.9 + n * 0.7, 170 + n * 150);
    noise(0.04 + n * 0.12, 0.25, 650 + n * 700, 0.05);
    noise(0.03 + n * 0.06, 1.7, 85);
  }

  function lap() {
    blip(988, "square", 0.2, 0.01, 0.1);
    blip(1319, "square", 0.2, 0.01, 0.2, null, 0.1);
  }

  function finish() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
      blip(f, "square", 0.2, 0.01, 0.2, null, i * 0.11);
    });
  }

  let uiEnabled = true, uiLast = -1e9;
  const UI_GAP_MS = 60;
  function uiOk() {
    if (!uiEnabled || !oneShotOk()) return false;
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (t - uiLast < UI_GAP_MS) return false;
    uiLast = t;
    return true;
  }
  function setUiEnabled(b) { uiEnabled = !!b; }

  function uiTick() {
    if (!uiOk()) return;
    blip(660, "square", 0.08, 0.004, 0.05);
  }

  function assistPlaybackQuiet() {
    return typeof RealRace !== "undefined" && RealRace.isWatch && RealRace.isWatch();
  }
  function brakeCue(urgency) {
    cueU = urgency > 0 ? Math.min(urgency, 1) : 0;
    if (!cueU || !sfxOk() || assistPlaybackQuiet()) { cueT = now(); return; }
    const t = now();
    if (t < cueT) return;
    blip(520, "square", 0.07, 0.003, 0.045);
    cueFired++;
    cueT = t + (0.4 + (0.07 - 0.4) * cueU);
  }

  let driveCueT = 0, driveCueFired = 0, cornerCallFired = 0;
  function driveBrakeTone(urgency) {
    const u = urgency > 0 ? Math.min(urgency, 1) : 0;
    if (!u || !sfxOk() || assistPlaybackQuiet()) { driveCueT = now(); return; }
    const t = now();
    if (t < driveCueT) return;
    blip(380, "triangle", 0.09, 0.004, 0.06);
    driveCueFired++;
    driveCueT = t + (0.45 + (0.09 - 0.45) * u);
  }
  function cornerCall(side) {
    if (!sfxOk() || assistPlaybackQuiet()) return;
    const left = side === "L" || side === 1 || side === "left";
    blip(left ? 620 : 480, "sine", 0.11, 0.005, 0.10);
    cornerCallFired++;
  }

  function uiSelect() {
    if (!uiOk()) return;
    blip(880, "square", 0.13, 0.005, 0.09);
  }

  function uiReject() {
    if (!uiOk()) return;
    blip(220, "sawtooth", 0.12, 0.006, 0.14);
  }

  function penalty() {
    blip(330, "sawtooth", 0.22, 0.01, 0.45, 116);
    blip(165, "square", 0.14, 0.01, 0.45, 58);
  }

  function setSfxVolume(v) {
    sfxVol = clamp01(typeof v === "number" ? v : 1);
    writeSfx(LEVEL_TAU); refreshFocus(LEVEL_TAU);
    return sfxVol;
  }
  function setSfxEnabled(b) {
    sfxEnabled = !!b;
    writeSfx(LEVEL_TAU); refreshFocus(LEVEL_TAU);
    if (sfxEnabled && rainWanted && !rainSrc) startRain();
    if (sfxEnabled && engineWanted && !engineOn) {
      startEngineGraph();
      if (engineOn && sfxOffArmed && rivalVoices.length) fieldArmed = true;
      sfxOffArmed = false;
    } else if (!sfxEnabled && engineOn) { engineWanted = true; sfxOffArmed = fieldArmed; stopEngineGraph(); }
    if (!sfxEnabled) soundtrack.releaseEngineDuck(now(), true);
    return sfxEnabled;
  }
  function volumes() { return { sfx: sfxVol, music: soundtrack.volume() }; }

  let _onInterrupted = null;
  function onInterrupted(fn) { _onInterrupted = typeof fn === "function" ? fn : null; }
  return {
    onInterrupted,
    init,
    setRadioDuck, setRadioFocusDb, getRadioFocusDb, setVoiceFocusHold,
    decodeClip,
    now,
    radioVoice,
    radioVoicesLive: radio.radioVoicesLive,
    voiceChainsLive: radio.voiceChainsLive,
    ctxGen: () => ctxGen,
    radioSting,
    radioStingStop,
    setRadioFx,
    setRadioPreset: radio.setRadioPreset,
    radioPreset: radio.radioPreset,
    radioPresets: radio.radioPresets,
    radioFxLevel: radio.radioFxLevel,
    radioLeadS: radio.radioLeadS,
    radioFxMax: radio.radioFxMax,
    context: () => ctx,
    sfxBus: () => sfxBus,
    setEnabled,
    enabled,
    initOffline,
    renderOffline,
    startEngine,
    stopEngine,
    enginePlaybackGeneration: () => engineActionGeneration,
    stopEngineIfGeneration(generation) { if (generation !== engineActionGeneration) return false; setSkid(0); stopEngine(); return true; },
    setEngine,
    setGridIdle,
    feedReplayScrub,
    syncReplayRpms,
    resetReplayScrub,
    setSkid,
    squealFromSlip,
    windFromSpeed,
    skidPitch() { return skidFilter ? +(skidFilter.frequency._apexSkidBase ?? skidFilter.frequency.value) : 0; },
    windCutoff() { return windFilter ? +(windFilter.frequency._apexAimTgt ?? windFilter.frequency.value) : 0; },
    setCarSfx,
    pitGun,
    setCameraMix,
    cameraMix: () => ({ kind: camKind, ...camMix }),
    carSfx: () => ({ ...carSfxLast, pitGuns: pitGunFired, revFlare: +revFlare.toFixed(4), pitDepth: pitLimGain ? pitLimGain._apexTgt || 0 : 0 }),
    kerbSpray() {
      return {
        kerb: kerbGain ? +(kerbGain._apexAimTgt ?? kerbGain.gain.value).toFixed(5) : 0,
        kerbRate: kerbSrc ? +(kerbSrc.playbackRate._apexAimTgt ?? kerbSrc.playbackRate.value).toFixed(4) : 0,
        kerbHz: kerbFilter ? Math.round(kerbFilter.frequency._apexHz ?? kerbFilter.frequency.value) : 0,
        spray: sprayGain ? +(sprayGain._apexAimTgt ?? sprayGain.gain.value).toFixed(5) : 0,
        sprayAhead: +sprayAhead.toFixed(4),
        kerbLive: !!kerbLive,
      };
    },
    shift,
    lightOn,
    lightsOut,
    overtakeReady,
    deployBoost,
    xMode,
    setVoice,
    setTune,
    setProfile,
    setLayer,
    setRivals,
    fieldContact,
    fieldContactState,
    lastPlayerContactPan() { return +_lastPlayerContactPan.toFixed(4); },
    contactPoolPans() {
      const t = now();
      return contactVoices.filter((v) => v.freeAt > t).map((v) => +v.pan.pan.value.toFixed(4));
    },
    setVenue,
    venue() { return { name: venueName, level: revReturn ? +revReturn.gain.value.toFixed(4) : 0, decay: venue.decay }; },
    rivalVoiceCount() { return RIVAL_VOICES; },
    rivalState() {
      return rivalVoices.map((v) => ({
        gain: +v.gain.gain.value.toFixed(5),
        pan: +v.pan.pan.value.toFixed(4),
        rate: v.src ? +v.src.playbackRate.value.toFixed(4) : 0,
        hz: v.oscs ? +v.oscs[0].frequency.value.toFixed(2) : 0,
        cut: Math.round(v.filt.frequency.value),
      }));
    },
    tune() { return Object.assign({}, tune); },
    tuneRange() { return JSON.parse(JSON.stringify(TUNE_RANGE)); },
    tuneDefaults() { return Object.assign({}, TUNE_DEF); },
    layers() { return Object.assign({}, layers); },
    layerDefaults() { return Object.assign({}, LAYER_DEF); },
    profile() { return profileName; },
    profiles() { return Object.keys(SOUND_PROFILES); },
    voiceName() { return voiceName; },
    voices() { return Object.keys(ENGINE_VOICES); },
    collision,
    offtrack,
    rumble,
    thunder,
    lap,
    finish,
    uiTick,
    brakeCue,
    driveBrakeTone,
    cornerCall,
    uiSelect,
    uiReject,
    setUiEnabled,
    uiEnabled() { return uiEnabled; },
    penalty,
    startRain,
    stopRain,
    startMusic,
    stopMusic,
    musicPlaybackGeneration: soundtrack.musicPlaybackGeneration,
    stopMusicIfGeneration: soundtrack.stopMusicIfGeneration,
    musicStalled: soundtrack.musicStalled,
    setMusicEnabled,
    skipTrack,
    prevTrack,
    trackName,
    tracks,
    addTracks,
    removeTrack,
    playTrackId,
    currentTrackId,
    setMusicBackend,
    musicBackend,
    setSessionType,
    setMusicSource,
    musicSource,
    sourceCounts,
    setSfxVolume,
    setSfxEnabled,
    mixDuck() { return mix.snapshot(); },
    setMusicVolume,
    volumes,
    windLevel() { return windGain ? +(windGain._apexAimTgt ?? windGain.gain.value) : 0; },
    limiterDepth() { return limGain ? +limGain.gain.value : 0; },
    limiterHeld() { return limSince == null ? null : +(ctx.currentTime - limSince).toFixed(3); },
    limiterHz() { return limOsc ? +limOsc.frequency.value.toFixed(2) : 0; },
    limiterCents() { return limPitch ? +limPitch.gain.value.toFixed(3) : 0; },
    ersLevel() {
      return typeof ErsLayer !== "undefined" && ErsLayer.deployLevel ? +ErsLayer.deployLevel() || 0 : 0;
    },
    ersAudio() { return (typeof ErsLayer !== "undefined" && ErsLayer.inspect) ? ErsLayer.inspect() : null; },
    harvestLevel() { return harvGain ? +harvGain.gain.value : 0; },
    harvestCoastLevel() { return +harvCoastLevel.toFixed(5); },
    harvestBrakeLevel() { return +harvBrakeLevel.toFixed(5); },
    cylCutDepth() { return cylCutGain ? +cylCutGain.gain.value : 0; },
    skidLevel() { return skidGain ? +(skidGain._apexSkidV ?? skidGain.gain.value) : 0; },
    boostState() { return { fired: boostFired, peak: +boostPeak.toFixed(4) }; },
    engineCut() { return engFilter ? Math.round(engFilter.frequency.value) : 0; },
    engineLevel() { return engGain ? +engGain.gain.value : 0; },
    subLevel() { return subOctGain ? +subOctGain.gain.value : 0; },
    overrunState() { return { fired: overrunFired, nextAt: +overrunT.toFixed(3), now: +now().toFixed(3) }; },
    brakeCueState() { return { fired: cueFired, urgency: +cueU.toFixed(3), nextAt: +cueT.toFixed(3), now: +now().toFixed(3) }; },
    driveCueState() {
      return {
        brakeFired: driveCueFired, callFired: cornerCallFired,
        nextAt: +driveCueT.toFixed(3), now: +now().toFixed(3),
      };
    },
    wastegateState() { return { fired: wasteFired, pullT: +pullT.toFixed(3) }; },
    shiftState() { return { fired: shiftFired, peak: +shiftPeak.toFixed(4) }; },
    gravelDepth() { return gravGain ? +gravGain.gain.value : 0; },
    gravelHz() { return gravOsc ? +gravOsc.frequency.value.toFixed(2) : 0; },
    brakeLevel() { return brakeGain ? +brakeGain.gain.value : 0; },
    subHz() { return subOctOsc ? +subOctOsc.frequency.value : 0; },
    detuneCents() { return engSrcIdle && engSrcIdle.detune ? +engSrcIdle.detune.value.toFixed(4) : 0; },
    rate() { return (engSrcIdle && engSrcIdle.playbackRate) ? +engSrcIdle.playbackRate.value : 0; },
    fundamentalHz() {
      if (usingSamples && enginePeriod > 1 && lastRate > 0) return (ctx.sampleRate * lastRate) / enginePeriod;
      if (engA && engA.frequency) return +(engA.frequency._apexAimTgt ?? engA.frequency.value);
      return 0;
    },
    centroidHz() {
      if (!ctx || !engineOn || !engGain) return 0;
      if (!dbgAnalyser) {
        dbgAnalyser = ctx.createAnalyser();
        dbgAnalyser.fftSize = 16384;
        dbgAnalyser.smoothingTimeConstant = 0;
        engGain.connect(dbgAnalyser);
      }
      const n = dbgAnalyser.frequencyBinCount, arr = new Float32Array(n);
      dbgAnalyser.getFloatFrequencyData(arr);
      let num = 0, den = 0;
      for (let i = 1; i < n; i++) { const m = Math.pow(10, arr[i] / 20); num += (i * ctx.sampleRate / dbgAnalyser.fftSize) * m; den += m; }
      return den > 0 ? Math.round(num / den) : 0;
    },
    debug() { return { contextState: ctx ? ctx.state : "uninitialised", samplesReady, usingSamples, engineOn, voice: voiceName,
      limSwing: limGain ? limGain._apexLimTgt ?? 0 : null, surfSched, loop: engSrcIdle ? { s: +engSrcIdle.loopStart.toFixed(2), e: +engSrcIdle.loopEnd.toFixed(2), win: engWin && [+engWin.start.toFixed(2), +engWin.end.toFixed(2)] } : null }; },
  };
})();
