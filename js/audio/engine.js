/* GameAudio: WebAudio for Apex 26 — a synthesized/sample-based engine voice and race SFX, plus a streamed-MP3 soundtrack. init() must be called from a user gestur… */
"use strict";

const GameAudio = (function () {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let limiter = null;              // DynamicsCompressor between master and the destination
  // 0..1 mixer levels, restored by the caller from storage on boot.
  let sfxVol = 1;
  let sfxEnabled = true;      // the SOUND EFFECTS switch — music is unaffected
  let musicVol = 0.5;
  const MUSIC_FULL = 0.52;
  let isEnabled = true;

  // Engine voice (persistent while racing)
  let engA = null, engB = null, engC = null;     // saw, saw, square (synth fallback)
  let engFilter = null, engGain = null;
  let limOsc = null, limGain = null;               // rev-limiter gate (audio-thread)
  let whineOsc = null, whineGain = null;          // turbo whine
  let harvSrc = null, harvFilter = null, harvGain = null; // MGU-K harvest whirr
  let lfo = null, lfoG = null;                    // offroad pitch wobble (8 Hz)
  let skidSrc = null, skidFilter = null, skidGain = null;
  let voiceFormant = null;                       // per-manufacturer peaking EQ
  let ersOsc = null, ersHp = null, ersGain = null; // continuous ERS deploy whine
  let windSrc = null, windFilter = null, windGain = null; // airflow over the car
  let subOctOsc = null, subOctGain = null;        // sub-octave weight under the sample/granular core

  // RIVAL ENGINES. The game had no opponent audio at all and no panner anywhere
  // in the graph, so a car alongside was silent and the only cue you had for it
  // was the mirror. This is the one audio layer that changes how the game PLAYS
  // rather than how it sounds.
  //
  // A small fixed POOL, not a voice per car: 21 rivals cannot each have an
  // engine, and the ones that matter are the handful you can nearly touch.
  // game.js hands over the nearest few already reduced to track-frame numbers
  // (lateral metres, arc metres, rev, closing speed) — the audio module does no
  // track maths, which is also why this needs no heading convention to be right.
  const RIVAL_VOICES = 4;
  const RIVAL_RANGE = 70;         // metres of arc beyond which a rival is inaudible
  let rivalVoices = [];           // { src, filt, gain, pan } while the engine runs

  // Per-manufacturer engine character, keyed by team.engine (js/data/teams.js).
  // Every field is CONSTANT TIMBRE — a fixed multiplier or filter, never a
  // function of rev — so tools/check/audio-test.cjs's invariants (pitch monotonic in
  // rev per gear, gear1 < gear4 at redline) hold for every voice by
  // construction. rateTrim ±3% pitch offset · detune cents on the sample ·
  // formantHz/Gain a peaking EQ between engFilter and engGain (0 gain = no
  // node) · cutTrim scales the lowpass (bright vs muffled) · whineHz/Lvl the
  // turbo/MGU character · synthSpread/subLvl shape the oscillator fallback.
  const ENGINE_VOICES = {
    "default":       { rateTrim: 1.00, detune: 0,   formantHz: 0,    formantGain: 0, cutTrim: 1.00, whineHz: 1500, whineLvl: 1.0, synthSpread: 1.009, subLvl: 1.0 },
    "Mercedes":      { rateTrim: 1.00, detune: 0,   formantHz: 1250, formantGain: 3, cutTrim: 1.05, whineHz: 1600, whineLvl: 0.9, synthSpread: 1.007, subLvl: 0.9 },
    "Ferrari":       { rateTrim: 1.03, detune: 25,  formantHz: 1900, formantGain: 5, cutTrim: 1.12, whineHz: 1500, whineLvl: 0.8, synthSpread: 1.013, subLvl: 0.8 },
    "Red Bull Ford": { rateTrim: 0.99, detune: -15, formantHz: 800,  formantGain: 4, cutTrim: 0.96, whineHz: 1350, whineLvl: 0.7, synthSpread: 1.018, subLvl: 1.2 },
    "Honda":         { rateTrim: 1.01, detune: 10,  formantHz: 1500, formantGain: 2, cutTrim: 1.04, whineHz: 1750, whineLvl: 1.1, synthSpread: 1.005, subLvl: 0.95 },
    "Audi":          { rateTrim: 0.98, detune: -20, formantHz: 950,  formantGain: 3, cutTrim: 0.92, whineHz: 2100, whineLvl: 1.5, synthSpread: 1.010, subLvl: 1.1 },
  };
  let voice = ENGINE_VOICES["default"];
  let voiceName = "default";

  // PLAYER TUNE — a second trim layered OVER the manufacturer voice, owned by
  // the player instead of the team. It keeps the SAME constant-timbre contract
  // ENGINE_VOICES states above: every field is a fixed multiplier, never a
  // function of rev, so tools/check/audio-test.cjs's invariants (pitch
  // monotonic in rev per gear, gear1 < gear4 at redline) hold by construction.
  //
  // revRange is the one field that scales the rev->pitch SPAN rather than
  // offsetting it, so it is the only one that changes the curve's shape. It is
  // clamped strictly positive, which is exactly what monotonicity needs: the
  // rev coefficient keeps its sign, and both gears take the same factor, so the
  // ordering is untouched. `sub` weights the synth fallback's sub-octave only
  // (the sample core has no such layer) and is set by profiles rather than a
  // slider, which is why the UI carries six knobs and this table seven.
  const TUNE_DEF = Object.freeze({ pitch: 1, detune: 1, revRange: 1, brightness: 1, whine: 1, sub: 1, limiter: 1 });
  const TUNE_RANGE = Object.freeze({
    pitch:      [0.80, 1.25], detune: [0, 3],    revRange: [0.40, 1.60],
    brightness: [0.50, 1.60], whine:  [0, 2.5],  sub:      [0, 2.5], limiter: [0, 2],
  });
  let tune = Object.assign({}, TUNE_DEF);

  // Layer switches. Each names a node that already exists, so muting one is a
  // gain target of 0 — and because every muted layer goes through aimGain, its
  // steady state costs no per-frame scheduling at all (the _apexAimTgt guard,
  // the same idiom limGain/lfoG use further down).
  const LAYER_DEF = Object.freeze({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true, sub: true, rivals: true });
  let layers = Object.assign({}, LAYER_DEF);

  // Named tune presets the player picks INSTEAD of inheriting the team's
  // engine. "team" is the shipped behaviour: identity trims, and ENGINE_VOICES
  // still keys off team.engine. The rest layer over whatever voice the team
  // gave, so a Ferrari on COCKPIT is still recognisably a Ferrari.
  const SOUND_PROFILES = Object.freeze({
    team:      null,
    broadcast: { pitch: 1.02, detune: 0.9, revRange: 1.05, brightness: 1.18, whine: 1.30, sub: 0.80, limiter: 1.00 },
    trackside: { pitch: 0.99, detune: 1.3, revRange: 1.00, brightness: 0.82, whine: 0.65, sub: 1.15, limiter: 0.85 },
    cockpit:   { pitch: 1.00, detune: 1.0, revRange: 0.92, brightness: 0.68, whine: 0.85, sub: 1.60, limiter: 1.35 },
    v10:       { pitch: 1.07, detune: 2.2, revRange: 1.28, brightness: 1.28, whine: 0.10, sub: 0.70, limiter: 1.15 },
  });
  let profileName = "team";

  // Schedule a gain target only when it has MOVED. A muted layer converges to 0
  // once and is then free; without this, every switch turned off would still
  // cost a main-thread call plus a cross-thread timeline insertion per frame —
  // the defect the lfoG/limGain comments below describe at length. The cache
  // lives ON THE NODE so a stopEngine/startEngine pair cannot leave it stale.
  function aimGain(node, target, t, tau) {
    if (!node || node._apexAimTgt === target) return;
    node.gain.setTargetAtTime(target, t, tau);
    node._apexAimTgt = target;
  }
  let engineOn = false;
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0;
  let shiftDuck = 0, shiftDuckT = 0;   // transient engine-gain dip from a gear shift
  let idleGainRamped = false;          // the sample voice's one-time fade-in (see setEngine)

  let engBuf = null, samplesReady = false;
  let lastRate = 0;               // the ratio setEngine last asked for (see rate())
  // DETUNE as a frequency multiplier. On the sample core it is cents on a
  // BufferSource; the granular core has no detune param — its pitch IS the
  // ratio — so the same cents are folded into the ratio there. Cached because
  // it only moves when the tune or the voice does, not per frame.
  let detuneMul = 1;
  // GRANULAR (PSOLA) CORE — js/audio/granular-worklet.js. It replaces the PITCHING
  // MECHANISM only: the ratio it is handed is the same number playbackRate got,
  // so the pitch curve, the gear ordering and rate() are untouched. What changes
  // is that the engine's fixed resonances stop sliding down with the revs.
  // Measured on f1_engine.mp3 through Chromium's own decoder: across ratio
  // 1.0 -> 0.25 the spectral centroid goes 1526 -> 798 Hz on playbackRate and
  // 1522 -> 1525 Hz here. tests/unit/granular-psola.test.mjs holds it.
  const GRANULAR_WORKLET = "js/audio/granular-worklet.js";
  let granularReady = false;        // the worklet module has loaded into this ctx
  let granularNode = null;          // live AudioWorkletNode while the engine runs
  let granularOn = true;            // player switch — the A/B against the old core
  let usingGranular = false;        // what this engine actually started on
  let enginePeriod = 0;          // source period in samples, measured once at decode

  // Dominant period of the loop region, by autocorrelation. Bounded on BOTH
  // axes so this stays a ~10 ms main-thread cost paid once: an 8192-sample
  // window (the loop is steady, so more buys nothing) and lags spanning
  // 50 Hz-800 Hz, which covers any engine recording worth looping.
  function detectPeriod(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const from = Math.floor(d.length * 0.3);
    const n = Math.min(8192, d.length - from);
    if (n < 2048) return 0;
    const x = d.subarray(from, from + n);
    const loLag = Math.max(2, Math.floor(sr / 800)), hiLag = Math.min(n >> 1, Math.ceil(sr / 50));
    // NORMALISED, and then the SHORTEST lag that is nearly as good as the best.
    // Raw autocorrelation octave-errors: a signal periodic at P is also
    // periodic at 2P and 4P, and the longer lags win on plain sum-of-products.
    // Measured on f1_engine.mp3 this picked 335 samples where the true period
    // is ~82 — a 4th subharmonic. PSOLA fed a period 4x too long cuts grains
    // covering eight real cycles, so each grain carries the RECORDING's pitch
    // and the output sings at that instead of the rev it was asked for, which
    // is the exact failure this whole rewrite exists to avoid.
    const score = new Float32Array(hiLag);
    let best = 0;
    for (let lag = loLag; lag < hiLag; lag++) {
      let acc = 0, e1 = 0, e2 = 0;
      for (let i = 0; i + lag < n; i++) { const a1 = x[i], b1 = x[i + lag]; acc += a1 * b1; e1 += a1 * a1; e2 += b1 * b1; }
      const d = Math.sqrt(e1 * e2);
      const v = d > 0 ? acc / d : 0;
      score[lag] = v;
      if (v > best) best = v;
    }
    if (!(best > 0)) return 0;
    const floor = best * 0.9;
    for (let lag = loLag; lag < hiLag; lag++) if (score[lag] >= floor) return lag;
    return 0;
  }
  let engSrcIdle = null, engGainIdle = null;
  let usingSamples = false;
  let dbgAnalyser = null;          // taps the engine output so tests can measure pitch
  const SFX_ENGINE = "assets/sfx/f1_engine.mp3";   // sustained F1 drone (primary)

  // Music: streamed CC0 tracks (assets/music/), lazy-loaded + cached
  let musicOn = false;
  let musicEnabled = true;        // separate from the master sound toggle
  let lastTrackIdx = -1;
  let musicGain = null;
  let musicSrc = null;
  let currentUrl = null;
  let musicToken = 0;
  const musicBuffers = {};                 // url -> decoded AudioBuffer (per ctx)
  const _bufKeys = [];                     // insertion order of cached urls (bound: MUSIC_CACHE)
  // Decoded PCM is ~90 MB per four-minute track at a 48 kHz context. Desktop
  // keeps the 2 most recent so a two-track playlist alternates without a
  // re-decode; a PHONE keeps only the playing track — the second buffer was
  // the largest single item in a phone's heap, and on a rotating playlist it
  // is hit once per full rotation. GLX loads before this file (manifest order);
  // the typeof guard is the standalone harness.
  const MUSIC_CACHE = (typeof GLX !== "undefined" && GLX && GLX.isMobile) ? 1 : 2;
  const MENU_TRACK = "assets/music/menu.mp3";
  const PLAYLIST = [
    { id: "builtin:menu", name: "menu", url: MENU_TRACK, builtin: true },
    { id: "builtin:song2", name: "song2", url: "assets/music/song2.mp3", builtin: true },
    { id: "builtin:song3", name: "song3", url: "assets/music/song3.mp3", builtin: true },
    { id: "builtin:song4", name: "song4", url: "assets/music/song4.mp3", builtin: true },
    { id: "builtin:song5", name: "song5", url: "assets/music/song5.mp3", builtin: true },
  ];
  let musicIndex = 0;
  let source = "all";
  let backend = null;
  let listenersAttached = false;
  let rebuildTries = 0;
  let lastFailedResume = 0;
  let resumeMusic = false;
  let resumeEngine = false;
  let resumeRain = false;

  function clamp01(v) {
    return M4.clamp(Number.isFinite(v) ? v : 0, 0, 1);
  }

  /* ---------------- iOS audio session ----------------
     "playback" plays through the ring/silent switch like a game should — but on
     iOS it is EXCLUSIVE: the first sound this game makes interrupts whatever
     else is playing. That is correct when we own the soundtrack and wrong when
     something else does: with Spotify driving the music from another device,
     switching to the game paused it.
     "ambient" MIXES with other apps (at the cost of obeying the silent switch),
     which is the right trade exactly when another app owns the music. The Audio
     Session API wants this set before the context exists, so it is applied at
     creation and, best-effort, live — a mode change mid-session should not need
     a reload. */
  let sessionType = "playback";
  function applySessionType() {
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = sessionType;
      }
    } catch (e) { /* older iOS */ }
  }
  function setSessionType(t) {
    const v = (t === "ambient" || t === "playback") ? t : "playback";
    if (v === sessionType) return v;
    sessionType = v;
    applySessionType();
    return v;
  }

  const _loopMemo = new WeakMap();
  function findStableLoop(buf) {
    const memo = _loopMemo.get(buf);
    if (memo) return memo;
    const r = _findStableLoopUncached(buf);
    _loopMemo.set(buf, r);
    return r;
  }
  function _findStableLoopUncached(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, N = d.length;
    const hopN = Math.max(1, Math.floor(sr * 0.1));
    const zc = [];
    for (let a = 0; a + hopN < N; a += hopN) {
      let c = 0, prev = d[a];
      for (let j = a + 1; j < a + hopN; j++) { const v = d[j]; if ((v >= 0) !== (prev >= 0)) c++; prev = v; }
      zc.push(c);
    }
    const w = Math.round(2.0 / 0.1);                 // ~2s window
    if (zc.length < w + 2) return { start: buf.duration * 0.1, end: buf.duration * 0.9 };
    let bestCV = Infinity, bi = 0;
    for (let i = 0; i + w < zc.length; i++) {
      let m = 0; for (let k = i; k < i + w; k++) m += zc[k]; m /= w;
      if (m <= 0) continue;
      let v = 0; for (let k = i; k < i + w; k++) { const dv = zc[k] - m; v += dv * dv; } v /= w;
      const cv = Math.sqrt(v) / m;
      if (cv < bestCV) { bestCV = cv; bi = i; }
    }
    return { start: bi * 0.1, end: (bi + w) * 0.1 };
  }

  function createCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    applySessionType();

    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isEnabled ? 0.8 : 0;
    // MASTER LIMITER. Engine + wind + skid + rain + thunder + music summed
    // straight into the destination and clipped a phone speaker whenever
    // thunder landed over a full-throttle straight. A brick-wall-ish
    // compressor (fast attack, high ratio) keeps the peaks legal so the
    // whole mix can sit higher; the WIDE/NIGHT presets below only move it.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxEnabled ? sfxVol : 0;
    sfxBus.connect(master);

    // iOS Safari starts contexts suspended; resume inside the gesture.
    // Guard the promise: resume() rejects (NotAllowed/InvalidState) on mobile at
    // the edge of a gesture — an unhandled rejection would surface as a crash.
    if (ctx.state !== "running") { var _p = ctx.resume(); if (_p && _p.catch) _p.catch(() => {}); }
    loadEngineSamples();
    return true;
  }

  function loadEngineSamples() {
    if (!ctx || samplesReady) return;
    const grab = (url) => fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
    // ONE sample. f1_rev.mp3 used to be fetched, decoded, loop-scanned and given
    // a running BufferSourceNode beside this one — all behind a gain written to
    // 0 at creation and never to anything else, ever since the rev-crossfade was
    // removed for measuring DARKER under load. Dead weight is the small half:
    // the fetch was inside a Promise.all and `usingSamples` gated on it, so a
    // 404 or a corrupt byte in the layer nobody could hear dropped every player
    // to the oscillator fallback while the file the voice actually uses sat
    // decoded beside it. The asset stays on disk; nothing loads it.
    grab(SFX_ENGINE)
      .then((e) => {
        engBuf = e; samplesReady = true;
        enginePeriod = detectPeriod(e);
        Log.debug("audio", "engine sample decoded, period=" + enginePeriod);
        loadGranularModule();
      })
      .catch((err) => {
        Log.warn("audio", "engine sample load/decode failed, using synth voice: " + ((err && err.message) || err));
      });

  }

  // Load the PSOLA processor into this context. Failure is not an error worth
  // shouting about: no audioWorklet (older Safari), a blocked fetch or an
  // insecure context all just mean the engine keeps the playbackRate core.
  function loadGranularModule() {
    if (!ctx || !ctx.audioWorklet || granularReady || !(enginePeriod > 1)) return;
    ctx.audioWorklet.addModule(GRANULAR_WORKLET)
      .then(() => { granularReady = true; Log.debug("audio", "granular worklet ready"); })
      .catch((err) => { Log.debug("audio", "granular worklet unavailable: " + ((err && err.message) || err)); });
  }

  function init() {
    // init is only ever called from a user gesture
    if (ctx) {
      resumeIfNeeded(true);
      Log.info("audio", "GameAudio.init state=" + (ctx && ctx.state));
      return;
    }
    if (!createCtx()) return;
    Log.info("audio", "GameAudio.init state=" + (ctx && ctx.state));

    if (!listenersAttached) {
      listenersAttached = true;
      // iOS suspends the context on lock/app-switch and never resumes it
      // by itself; recover on the next gesture or on returning to the tab.
      window.addEventListener("touchend", resumeIfNeeded, true);
      window.addEventListener("pointerdown", resumeIfNeeded, true);
      window.addEventListener("keydown", resumeIfNeeded, true);
      document.addEventListener("visibilitychange", onVisibility);
    }
  }

  /*
   * Resume the context if it isn't running. ctx.resume() is async and
   * slow on iOS, so never tear the context down on a timer — a context
   * that's about to start would be destroyed, and one created outside a
   * user gesture can never be unlocked. Instead: if a PREVIOUS gesture
   * tried to resume and the context still isn't running by the time a
   * later gesture arrives, rebuild inside that gesture.
   */
  function resumeIfNeeded(gestureEv) {
    if (!ctx) return;
    const isGesture = !!gestureEv;
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
        rebuildTries = 0;
        lastFailedResume = 0;
        Log.info("audio", "GameAudio.resume state=" + (ctx && ctx.state));
      }).catch((err) => {
        Log.warn("audio", "context resume rejected (state=" + (ctx && ctx.state) + "): " + ((err && err.message) || err));
      });
    }
  }

  function rebuildCtx() {
    const wasMusic = musicOn;
    const wasTrack = lastTrackIdx;
    const wasEngine = engineOn;
    if (musicOn) stopMusic();
    engineOn = false;               // old nodes died with the old context
    try { ctx.close(); } catch (e) { /* already closed */ }
    ctx = null;
    master = null;
    sfxBus = null;
    limiter = null;
    musicGain = null;
    currentUrl = null;
    rainStopping = false;
    rainPending = null;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    for (const k in musicBuffers) delete musicBuffers[k];  // buffers are ctx-bound
    _bufKeys.length = 0;
    engBuf = null; samplesReady = false;                    // ctx-bound; reload for new ctx
    granularReady = false; granularNode = null; usingGranular = false;   // worklet modules are ctx-bound too
    noisePoolBuf = null;                                    // ctx-bound too — a buffer from the
                                                            // old ctx throws on the new one
    dbgAnalyser = null;    // ctx-bound; stopEngine() nulls it but this path inlines its own
                            // teardown, so without this a stale analyser on the closed ctx would
                            // survive and centroidHz() would read a dead node (latent: only
                            // tests/tools call centroidHz() today, not the game loop)
    if (!createCtx()) return;
    if (wasMusic) startMusic(wasTrack);
    if (wasEngine) startEngine();
    if (rainWanted) startRain();
  }

  function onVisibility() {
    if (document.hidden) {
      resumeMusic = musicOn;
      resumeEngine = engineOn;
      resumeRain = rainWanted;
      if (musicOn) stopMusic();
      if (engineOn) stopEngine();
      if (rainWanted) stopRain(true);
    } else {
      resumeIfNeeded();
      if (resumeMusic) startMusic(lastTrackIdx); // restarts re-synced to the clock
      if (resumeEngine) startEngine();
      if (resumeRain) startRain();
      resumeMusic = resumeEngine = resumeRain = false;
    }
  }

  function setEnabled(b) {
    isEnabled = !!b;
    if (master) master.gain.value = isEnabled ? 0.8 : 0;
  }

  function enabled() {
    return isEnabled;
  }

  function sfxOk() {
    return !!ctx && isEnabled && sfxEnabled;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function blip(freq, type, peak, attack, decay, slideTo, when) {
    if (!sfxOk()) return;
    const t0 = now() + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + attack + decay);
    env(g, t0, peak, attack, decay);
    osc.connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }

  function noiseBuf(seconds) {
    const len = Math.ceil(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ONE shared white-noise buffer for the one-shots, instead of a fresh
     allocation per hit. noiseBuf() fills every sample with Math.random() on the
     MAIN THREAD, and the one-shots fire while driving: rumble() is
     noise(0.09, 0.05, 320) throttled to every 0.07 s over a kerb, so a kerb
     strike was ~14 allocations a second at ~4,800 floats each. thunder() was
     worse — three calls totalling ~2.9 s, about 140k Math.random() calls in one
     synchronous burst, mid-race, at an unpredictable moment.

     White noise is stationary, so one buffer played from a RANDOM OFFSET is
     indistinguishable from a freshly-generated one — and two hits in a row
     still differ, which a fixed offset would not give. The looping sources
     (harv, skid, rain) keep their own buffers: those allocate once per start,
     and rain in particular needs a seamless 4 s loop.

     Context-bound like engBuf, so rebuildCtx() must clear it. */
  const NOISE_POOL_S = 3;
  let noisePoolBuf = null;
  function noisePool() {
    if (!noisePoolBuf) noisePoolBuf = noiseBuf(NOISE_POOL_S);
    return noisePoolBuf;
  }
  function bindNoise(src, needS) {
    if (needS >= NOISE_POOL_S) { src.buffer = noiseBuf(needS); return 0; }
    src.buffer = noisePool();
    return Math.random() * (NOISE_POOL_S - needS);
  }

  function noise(peak, decay, filterFreq, when) {
    if (!sfxOk()) return;
    const t0 = now() + (when || 0);
    const src = ctx.createBufferSource();
    const off = bindNoise(src, decay + 0.15);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    env(g, t0, peak, 0.005, decay);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, off);
    src.stop(t0 + decay + 0.1);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  function startEngine() {
    if (!ctx || engineOn) return;

    // shared lowpass + master gain for the engine core (samples or synth).
    // The per-manufacturer voice inserts one peaking EQ (its formant) between
    // the lowpass and the gain when the voice asks for one.
    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    // Rev-limiter gate (see setEngine): a 13 Hz square into engGain.gain.
    limOsc = ctx.createOscillator(); limOsc.type = "square"; limOsc.frequency.value = 13;
    limGain = ctx.createGain(); limGain.gain.value = 0;
    limOsc.connect(limGain).connect(engGain.gain);
    limOsc.start();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;
    if (voice.formantGain > 0) {
      voiceFormant = ctx.createBiquadFilter();
      voiceFormant.type = "peaking";
      voiceFormant.frequency.value = voice.formantHz;
      voiceFormant.Q.value = 1.1;
      voiceFormant.gain.value = voice.formantGain;
      engFilter.connect(voiceFormant).connect(engGain).connect(sfxBus);
    } else {
      voiceFormant = null;
      engFilter.connect(engGain).connect(sfxBus);
    }
    // The debug analyser tap is created LAZILY in centroidHz() — a 16384-fft
    // AnalyserNode copying every render quantum was shipping in every race for
    // a hook whose only caller is a test (audio-smoke's expect.poll absorbs
    // the first-read warm-up).

    usingSamples = !!(samplesReady && engBuf);
    usingGranular = !!(usingSamples && granularOn && granularReady && enginePeriod > 1);
    engA = engB = engC = null;
    engSrcIdle = engGainIdle = null;
    idleGainRamped = false;   // new gain node, so the fade-in must happen again
    if (usingGranular) {
      // The PSOLA core. One node, one AudioParam; the PCM crosses to the audio
      // thread once at construction rather than per frame. If construction
      // throws (a context that reports audioWorklet but refuses the node) fall
      // straight through to the playbackRate core rather than to silence.
      try {
        granularNode = new AudioWorkletNode(ctx, "apex-granular", { numberOfInputs: 0, outputChannelCount: [1] });
        const loop = findStableLoop(engBuf);
        const ch = engBuf.getChannelData(0);
        granularNode.port.postMessage({
          pcm: ch.slice(), p0: enginePeriod,
          loopStart: Math.floor(loop.start * engBuf.sampleRate),
          loopEnd: Math.floor(loop.end * engBuf.sampleRate),
        });
        granularNode.connect(engFilter);
      } catch (err) {
        Log.warn("audio", "granular node refused, using the sample core: " + ((err && err.message) || err));
        granularNode = null; usingGranular = false;
      }
    }
    if (usingSamples && !usingGranular) {
      engSrcIdle = ctx.createBufferSource(); engSrcIdle.buffer = engBuf; engSrcIdle.loop = true;
      // Voice detune is a base offset in cents; the offroad LFO adds on top.
      // The player's detune trim must be folded in HERE too, not only in
      // applyTuneNodes: game.js calls setVoice() before startEngine(), when
      // these sources do not exist yet, so a start that read voice.detune alone
      // would run on the bare manufacturer value until the next slider move.
      engSrcIdle.detune.value = voice.detune + (tune.detune - 1) * 30;
      const li = findStableLoop(engBuf);
      engSrcIdle.loopStart = li.start; engSrcIdle.loopEnd = li.end;
      engGainIdle = ctx.createGain(); engGainIdle.gain.value = 0;
      engSrcIdle.connect(engGainIdle).connect(engFilter);
    } else {
      // synth fallback: two detuned saws + a square
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
      // Sub-octave square rides through its own gain so a voice can weight it
      // (Red Bull Ford gravel vs Ferrari shriek). Torn down with engFilter.
      const sub = ctx.createGain();
      sub.gain.value = voice.subLvl * tune.sub;   // same restart reason as detune above
      engC.connect(sub).connect(engFilter);
      engC._apexSubGain = sub;
    }

    // SUB-OCTAVE. The oscillator fallback has had one since the first voice
    // (engC, a square an octave down, weighted by voice.subLvl) but the SAMPLE
    // core never did — so `sub` was a tune field that four of the five profiles
    // set and nothing on the shipped path read. COCKPIT asking for 1.60 got
    // exactly what TEAM got. This gives the recording the same body the synth
    // already had: a sine an octave under the engine's own fundamental, which
    // the granular core hands us for free (the period it is laying grains at).
    // Only built for the sample/granular cores — the synth already has engC,
    // and running both would double it.
    if (usingSamples) {
      subOctOsc = ctx.createOscillator();
      subOctGain = ctx.createGain();
      subOctOsc.type = "sine";
      subOctOsc.frequency.value = 60;
      subOctGain.gain.value = 0;
      subOctOsc.connect(subOctGain).connect(sfxBus);
    }

    // Rival voices. Cheap on purpose — one looping source through a lowpass,
    // a gain and a panner each. They share engBuf with the player's own voice,
    // so they cost no extra fetch, decode or memory.
    rivalVoices = [];
    if (usingSamples && ctx.createStereoPanner) {
      for (let i = 0; i < RIVAL_VOICES; i++) {
        const src = ctx.createBufferSource();
        src.buffer = engBuf; src.loop = true;
        const li = findStableLoop(engBuf);
        src.loopStart = li.start; src.loopEnd = li.end;
        src.playbackRate.value = 0.4;
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass"; filt.frequency.value = 2000;
        const gain = ctx.createGain(); gain.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = 0;
        src.connect(filt).connect(gain).connect(pan).connect(sfxBus);
        rivalVoices.push({ src, filt, gain, pan });
      }
    }

    // turbo whine: faint high sine riding above the core
    whineOsc = ctx.createOscillator();
    whineGain = ctx.createGain();
    whineOsc.type = "sine";
    whineOsc.frequency.value = 1500;
    whineGain.gain.value = 0;
    whineOsc.connect(whineGain).connect(sfxBus);

    // MGU-K harvest whirr: resonant noise, gated in by deceleration
    harvSrc = ctx.createBufferSource();
    harvSrc.buffer = noiseBuf(0.7);
    harvSrc.loop = true;
    harvFilter = ctx.createBiquadFilter();
    harvFilter.type = "bandpass";
    harvFilter.frequency.value = 900;
    harvFilter.Q.value = 6;
    harvGain = ctx.createGain();
    harvGain.gain.value = 0;
    harvSrc.connect(harvFilter).connect(harvGain).connect(sfxBus);

    // ERS deploy whine: electric-motor rise while the battery is actually
    // deploying. Triangle through a highpass — a different waveform and a
    // higher register than the turbo sine, so the two never read as one layer.
    ersOsc = ctx.createOscillator();
    ersHp = ctx.createBiquadFilter();
    ersGain = ctx.createGain();
    ersOsc.type = "triangle";
    ersOsc.frequency.value = 2400;
    ersHp.type = "highpass";
    ersHp.frequency.value = 1600;
    ersGain.gain.value = 0;
    ersOsc.connect(ersHp).connect(ersGain).connect(sfxBus);

    // offroad wobble: 8 Hz LFO into oscillator detune (cents)
    lfo = ctx.createOscillator();
    lfoG = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 8;
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    if (usingGranular) {
      // The granular core has no `detune`: its pitch IS the ratio param, and an
      // AudioParam sums its inputs with the value setEngine schedules, so the
      // wobble rides on top for free. Units differ though — detune is cents,
      // ratio is a multiplier — which is why LFO_DEPTH below is per-core.
      lfoG.connect(granularNode.parameters.get("ratio"));
    } else if (usingSamples) {
      lfoG.connect(engSrcIdle.detune);
    } else {
      lfoG.connect(engA.detune);
      lfoG.connect(engB.detune);
      lfoG.connect(engC.detune);
    }

    // tire screech: looped noise through a bandpass, silent until setSkid
    skidSrc = ctx.createBufferSource();
    skidSrc.buffer = noiseBuf(0.5);
    skidSrc.loop = true;
    skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 900;
    skidFilter.Q.value = 1.4;
    skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilter).connect(skidGain).connect(sfxBus);

    // AIRFLOW. The only speed-coupled continuous sounds were the engine and
    // the skid, so a 320 km/h straight sounded like a 120 km/h one with a
    // higher engine note. Broadband noise through a bandpass that opens with
    // speed: own buffer, because a LOOPING source needs one (the shared
    // noisePool is for one-shots — see its comment).
    windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf(0.5);
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.7;                 // wide: air, not a whistle
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(sfxBus);

    if (usingSamples && !usingGranular) engSrcIdle.start(0, engSrcIdle.loopStart);
    else { engA.start(); engB.start(); engC.start(); }
    whineOsc.start();
    if (subOctOsc) subOctOsc.start();
    for (const v of rivalVoices) v.src.start(0, v.src.loopStart);
    harvSrc.start();
    ersOsc.start();
    lfo.start();
    skidSrc.start();
    windSrc.start();

    lastSpeed = 0;
    lastEngT = 0;
    harvLevel = 0;
    shiftDuck = 0;
    shiftDuckT = 0;
    engineOn = true;
  }

  function stopEngine() {
    if (!engineOn) return;
    const t0 = now();
    if (musicGain) { musicGain.gain.setTargetAtTime(musicVol * MUSIC_FULL, t0, 0.3); musicGain._apexDuckTgt = null; }   // release the engine duck
    engGain.gain.cancelScheduledValues(t0);
    engGain.gain.setTargetAtTime(0, t0, 0.06);
    whineGain.gain.setTargetAtTime(0, t0, 0.06);
    harvGain.gain.setTargetAtTime(0, t0, 0.06);
    ersGain.gain.setTargetAtTime(0, t0, 0.04);
    windGain.gain.setTargetAtTime(0, t0, 0.06);
    skidGain.gain.setTargetAtTime(0, t0, 0.04);
    if (usingSamples) {
      if (engGainIdle) engGainIdle.gain.setTargetAtTime(0, t0, 0.06);

      if (engSrcIdle) engSrcIdle.stop(t0 + 0.35);

    } else {
      engA.stop(t0 + 0.35); engB.stop(t0 + 0.35); engC.stop(t0 + 0.35);
    }
    engSrcIdle = engGainIdle = null;
    if (granularNode) {
      // disconnect() throws if the node was never connected (the construction
      // path below can fail after `new` but before connect). Dropping the
      // reference is the teardown that matters; the graph edge goes with the
      // context either way.
      try { granularNode.disconnect(); } catch (e) { /* never connected */ }
      granularNode = null;
    }
    usingGranular = false;
    if (limGain) limGain.gain.setTargetAtTime(0, t0, 0.02);
    if (limOsc) { limOsc.stop(t0 + 0.35); limOsc = null; limGain = null; }
    whineOsc.stop(t0 + 0.35);
    if (subOctOsc) subOctOsc.stop(t0 + 0.35);
    for (const v of rivalVoices) { try { v.gain.gain.setTargetAtTime(0, t0, 0.06); v.src.stop(t0 + 0.35); } catch (e) { /* already stopped */ } }
    harvSrc.stop(t0 + 0.35);
    ersOsc.stop(t0 + 0.35);
    windSrc.stop(t0 + 0.35);
    lfo.stop(t0 + 0.35);
    skidSrc.stop(t0 + 0.35);
    const deadSub = (engC && engC._apexSubGain) || null;   // synth sub-osc gain
    engA = engB = engC = null;
    whineOsc = null;
    harvSrc = null;
    ersOsc = null;
    windSrc = null;
    lfo = null;
    skidSrc = null;
    // Disconnect the test analyser tap so it doesn't accumulate across restarts.
    if (dbgAnalyser) { try { dbgAnalyser.disconnect(); } catch (e) {} dbgAnalyser = null; }
    // Tear the whole faded chain out of the graph once the 0.35 s source stops
    // complete: stopped sources GC on their own, but Gain/Biquad nodes routed
    // into sfxBus keep RENDERING until disconnect() (Web Audio contract) — a
    // tab-hide/show cycle used to strand ~8 nodes each time, forever.
    const dead = [engFilter, engGain, whineGain, harvFilter, harvGain, skidFilter, skidGain, lfoG,
                  voiceFormant, ersHp, ersGain, windFilter, windGain, deadSub, subOctGain];
    setTimeout(() => { for (const n of dead) { try { if (n) n.disconnect(); } catch (e) {} } }, 450);
    engFilter = engGain = whineGain = harvFilter = harvGain = skidFilter = skidGain = lfoG = null;
    voiceFormant = ersHp = ersGain = windFilter = windGain = null;
    subOctOsc = subOctGain = null;
    // Same disconnect-or-they-keep-rendering rule as the block above.
    const deadRivals = rivalVoices.slice();
    setTimeout(() => { for (const v of deadRivals) { try { v.filt.disconnect(); v.gain.disconnect(); v.pan.disconnect(); } catch (e) { /* torn down */ } } }, 450);
    rivalVoices = [];
    idleGainRamped = false;
    engineOn = false;
  }

  const LOW_GEAR_RATE = [0.6, 0.72, 0.84];
  function setEngine(rev01, boost01, offroad, speed01, gear, physics) {
    if (!engineOn || !sfxOk()) return;
    // UPGRADE TO THE SAMPLES WHEN THEY LAND. `usingSamples` is decided once,
    // in startEngine(); a race whose lights went out before f1_engine.mp3 had
    // decoded (cold cache on a phone) ran its whole distance on the synth
    // voice. Restart once: stopEngine() fades the synth chain out over 0.35 s
    // and startEngine() re-reads samplesReady, so the swap is one crossfade
    // at the moment the samples arrive — never a per-frame flip.
    // Upgrade once when the sample (or the worklet behind it) arrives mid-race.
    if (samplesReady && engBuf && (!usingSamples || (granularOn && granularReady && !usingGranular))) { stopEngine(); startEngine(); }
    const rev = clamp01(rev01 || 0);
    const s = clamp01(typeof speed01 === "number" ? speed01 : (rev01 || 0));
    const b = clamp01(typeof boost01 === "number" ? boost01 : (boost01 ? 1 : 0));
    const t = ctx.currentTime;

    // Physics extras: traction slip, longitudinal accel, kerb, wet road.
    // Defaults to neutral (full grip, no braking, on tarmac, dry) when absent.
    const ph = physics || {};
    const slip01 = clamp01(1 - (ph.slip != null ? ph.slip : 1)); // 0=grip 1=full slide
    const brakeFrac = clamp01(-(ph.ax || 0) / 60);              // 60 m/s² ≈ full BRAKE
    const onKerb = !!ph.onKerb;
    const wet = !!ph.wet;

    let g01 = 0.3, gIdle = 95, gSpan = 700;
    if (typeof gear === "number" && isFinite(gear)) {
      const gi = Math.max(1, Math.min(8, Math.round(gear)));
      g01 = (gi - 1) / 7;
      gIdle = 130 - g01 * 70;             // 130 Hz (1st) -> 60 Hz (8th)
      gSpan = 900 - g01 * 460;            // span 900 (1st) -> 440 (8th)
    }

    // transient gain dip from a recent gear shift (rev-cut), decays ~120 ms
    if (shiftDuck > 0.0001) {
      const sd = shiftDuckT ? Math.max(0, t - shiftDuckT) : 0;
      shiftDuck = shiftDuck * Math.exp(-sd / 0.12);
      shiftDuckT = t;
      if (shiftDuck < 0.0001) shiftDuck = 0;
    }

    if (usingSamples) {
      const g = (typeof gear === "number" && isFinite(gear)) ? Math.max(1, Math.min(8, Math.round(gear))) : 8;
      const gmul = g <= 3 ? LOW_GEAR_RATE[g - 1] : 1.0;
      // rateTrim is a CONSTANT per-manufacturer offset: pitch stays monotonic
      // in rev and the gear ordering is unchanged (same trim on both sides).
      const rate = (0.25 + rev * 0.45 * tune.revRange) * (1 + 0.04 * b) * gmul * voice.rateTrim * tune.pitch;   // idle ~0.25x .. redline ~0.70x, lower in gears 1-3
      lastRate = rate;
      // ONE number, TWO cores. The granular core is handed exactly the ratio
      // playbackRate would have received, which is why swapping them cannot
      // move the pitch curve, the gear ordering, or what rate() reports — the
      // difference is only whether the engine's fixed resonances travel with
      // the revs (playbackRate) or stay put (granular).
      if (usingGranular) granularNode.parameters.get("ratio").setTargetAtTime(rate * detuneMul, t, 0.035);
      else engSrcIdle.playbackRate.setTargetAtTime(rate, t, 0.035);
      // NOT a crossfade to the second recording: measured 2026-09-03 with
      // tools/check/audio-test.cjs, blending f1_rev.mp3 in under load read
      // DARKER (centroid 1489 -> 1389 Hz at the same rev), the same defect
      // that got the rev-driven fade removed. Load is expressed on the one
      // voice instead — see loadLift below, which the check pins.
      // Single coherent voice: run only the steady idle loop, pitched. Crossfading
      // in the second (different) recording made the output incoherent — its
      // brightness FELL as revs rose (measured via the audio test) instead of
      // rising. Brightness/"load" now comes from the lowpass opening with revs.
      //
      // Which makes three of the calls that used to live here provably dead, on
      // a function the game loop runs EVERY FRAME:
      //   engGainAcc.gain -> 0   was already 0 from createGain (startEngine) and
      //                          is set nowhere else, so it scheduled 0 onto 0;
      //   engSrcAcc.playbackRate pitched a source sitting behind that zero gain;
      //   engGainIdle.gain -> 0.9 is a constant, so only the FIRST call does
      //                          anything — but it must still be a ramp, not a
      //                          direct .value, or the voice snaps in instead of
      //                          fading over the 0.05 s tau.
      // Each was a main-thread call plus a cross-thread timeline insertion, 60
      // times a second, for the whole race.
      if (!idleGainRamped && engGainIdle) { engGainIdle.gain.setTargetAtTime(0.9, t, 0.05); idleGainRamped = true; }
    } else {
      // synth fallback: detuned saws + sub follow the per-gear frequency
      const base = (gIdle + rev * gSpan * tune.revRange) * (1 + 0.12 * b) * voice.rateTrim * tune.pitch;
      engA.frequency.setTargetAtTime(base * 0.994, t, 0.025);
      engB.frequency.setTargetAtTime(base * (1 + (voice.synthSpread - 1) * tune.detune), t, 0.025);
      engC.frequency.setTargetAtTime(base * 0.5, t, 0.025);
    }

    // Engine load from traction loss: when wheels are sliding the engine works
    // harder — filter opens and gain rises slightly. Braking at the limit adds
    // a brief intake/turbo suck quality via a subtler filter lift.
    const slipLoad  = slip01 * 0.12;          // up to +12% filter open under slide
    const brakeLoad = brakeFrac * 0.08;        // up to +8% under hard braking
    const kerbLoad  = onKerb ? 0.04 : 0;      // small gain bump over a kerb
    // LOAD: longitudinal acceleration (ph.ax; ~12 m/s² is a full-throttle
    // launch) opens the lowpass and lifts the level, so a car PULLING reads
    // brighter and fuller than one coasting at the same rev. Zero at ax <= 0,
    // which is every rev sweep the audio check runs, so the pitch and
    // centroid-vs-rev pins are untouched; the check's coast-vs-pull pair
    // asserts the brightening.
    const loadLift  = clamp01((ph.ax || 0) / 12);

    const cut = (usingSamples
      ? Math.min(11000, 2600 + s * 5800 + rev * 2400 + b * 1500 + slipLoad * 2000 + brakeLoad * 1200)
      : Math.min(7200,  600  + s * 4200 + rev * 700  + b * 1400 + slipLoad * 1000 + brakeLoad * 600))
      * voice.cutTrim * tune.brightness * (1 + 0.22 * loadLift);
    engFilter.frequency.setTargetAtTime(cut, t, 0.05);
    const lvl = (usingSamples
      ? (0.3 + s * 0.3 + rev * 0.08 + b * 0.08 + (offroad ? 0.03 : 0) + slipLoad * 0.8 + kerbLoad)
      : (0.05 + s * 0.05 + rev * 0.02 + b * 0.025 + (offroad ? 0.012 : 0) + slipLoad * 0.2 + kerbLoad * 0.3))
      * (1 + 0.08 * loadLift);
    // REV LIMITER. Above 98.5% the ignition cut chops the note at ~13 Hz —
    // the loudest "shift now" cue in F1 and functional feedback, not
    // decoration. limOsc feeds engGain.gain through limDepth on the audio
    // thread, so the gate costs no per-frame scheduling: base drops to
    // lvl·0.55 and the square wave swings it 0.10–1.00 × lvl.
    const limOn = layers.limiter && rev > 0.985 && s > 0.05;
    const limDepth = limOn ? lvl * 0.45 * tune.limiter : 0;
    // Guarded on the TARGET, like lfoG below and for the same reason: above
    // 98.5% is a sliver of a race, so an unguarded call scheduled the target 0
    // onto a value already converged to 0, 120x a second for the whole race —
    // the sixth-constant defect that comment describes, re-introduced. The
    // cache lives ON THE NODE so a stopEngine/startEngine pair cannot leave a
    // module variable stale (a fresh GainNode has no _apexLimTgt, which never
    // equals a number, so the first call after any restart re-issues).
    if (limGain && limGain._apexLimTgt !== limDepth) {
      limGain.gain.setTargetAtTime(limDepth, t, 0.02);
      limGain._apexLimTgt = limDepth;
    }
    engGain.gain.setTargetAtTime((lvl - limDepth) * (1 - 0.55 * shiftDuck), t, 0.03);

    // Turbo whine: in low gears (1-3) mechanical supercharger character — the
    // frequency climbs faster but levels off earlier than at high speed.
    const lowGearFactor = g01 < 0.35 ? 0.85 + g01 * 0.43 : 1;   // compressed range in low gears
    whineOsc.frequency.setTargetAtTime((voice.whineHz + rev * 2000) * lowGearFactor, t, 0.05);
    aimGain(whineGain,
      layers.whine ? (0.004 + rev * 0.013 + b * 0.008) * (s > 0.04 ? 1 : 0) * (usingSamples ? 0.50 : 1)
        * voice.whineLvl * tune.whine : 0, t, 0.08);

    // SUB-OCTAVE, an octave under the engine's own fundamental. That
    // fundamental is sampleRate*rate/period on both sample cores — the same
    // period the granular core lays grains at — so the weight tracks the note
    // instead of sitting at a fixed drone. Clamped into 25-240 Hz: below 25 it
    // is inaudible on a phone and just eats headroom. The ceiling was 160 and
    // that was WRONG — measured live, it pinned from about rev 0.8 upward, so
    // the layer stopped tracking exactly where the engine is loudest and became
    // the fixed drone this clamp exists to avoid. 240 clears an octave under
    // redline (f0 ~386 Hz there) and only bites under extreme PITCH/REV RANGE.
    if (subOctGain && subOctOsc) {
      const f0 = enginePeriod > 1 ? (ctx.sampleRate * lastRate) / enginePeriod : 0;
      const subF = Math.max(25, Math.min(240, f0 * 0.5));
      if (subOctOsc._apexSubF !== subF) { subOctOsc.frequency.setTargetAtTime(subF, t, 0.05); subOctOsc._apexSubF = subF; }
      aimGain(subOctGain, layers.sub
        ? (0.012 + rev * 0.016 + b * 0.006) * (s > 0.04 ? 1 : 0) * voice.subLvl * tune.sub
        : 0, t, 0.08);
    }

    const dt = lastEngT ? Math.max(0.001, t - lastEngT) : 0;
    let target = 0;
    if (dt > 0) {
      const decel = (lastSpeed - s) / dt;   // speed01 units shed per second
      target = clamp01(decel * 5) * Math.min(1, s * 3);
    }
    lastEngT = t;
    lastSpeed = s;
    harvLevel += (target - harvLevel) * Math.min(1, (dt || 0.016) / 0.12);
    // MGU-K harvest is audible on BOTH cores now. It was created and started on
    // the sample path too but gated silent here — quieter over the recording,
    // which already carries some off-throttle character of its own.
    aimGain(harvGain, layers.harvest ? harvLevel * (usingSamples ? 0.035 : 0.06) : 0, t, 0.06);
    harvFilter.frequency.setTargetAtTime(700 + s * 1600, t, 0.08);

    // ERS deploy whine: only while the battery is actually deploying (game.js
    // passes deploy/energy through the physics arg). Level scales with charge —
    // a full pack screams, a sagging one fades — and below 20% the pitch drops
    // ~12% so the driver HEARS the pack die before the HUD bar empties. The
    // fitted ERS part's deploy bias (ersDeploy 0..1) adds ±20% character.
    // Music sits under the ENGINE, not the reverse: a flat musicVol·MUSIC_FULL
    // competed with the note at redline. A gentle rev-keyed duck (−25% at
    // full revs, 250 ms tau) lets the engine win exactly when it should.
    // The duck target moves with `rev`, so an exact-equality guard would never
    // hit; threshold it instead. Below 0.5% of full scale the 250 ms ramp is
    // inaudible, so re-scheduling buys nothing and costs a cross-thread
    // timeline insertion per physics step.
    const duckTgt = musicVol * MUSIC_FULL * (1 - 0.25 * rev);
    if (musicGain && !(Math.abs((musicGain._apexDuckTgt ?? -1) - duckTgt) < 0.005)) {
      musicGain.gain.setTargetAtTime(duckTgt, t, 0.25);
      musicGain._apexDuckTgt = duckTgt;
    }
    const deploy = clamp01(ph.deploy || 0);
    const energy = ph.energy != null ? clamp01(ph.energy) : 1;
    const low = energy < 0.2 ? energy / 0.2 : 1;
    const partBias = ph.ersDeploy != null ? 0.8 + 0.4 * clamp01(ph.ersDeploy) : 1;
    const ersLvl = (deploy > 0 && layers.ers)
      ? (0.010 + 0.018 * deploy * (0.35 + 0.65 * energy)) * (0.4 + 0.6 * low) * partBias
      : 0;
    // Cached on the node, same idiom as lfoG/limGain above: ersLvl is 0 whenever
    // the car isn't deploying. The time constant varies with deploy>0, but a
    // 0->0 call is a no-op regardless of time constant, so gating on the
    // cached TARGET alone (not the tau) is still correct.
    if (ersGain._apexErsTgt !== ersLvl) {
      ersGain.gain.setTargetAtTime(ersLvl, t, deploy > 0 ? 0.05 : 0.10);
      ersGain._apexErsTgt = ersLvl;
    }
    if (deploy > 0)
      ersOsc.frequency.setTargetAtTime((2400 + rev * 900) * (0.88 + 0.12 * low), t, 0.06);

    // AIRFLOW. Quadratic in speed (drag goes with v^2, and it keeps the layer
    // out of the way at pit-lane pace while it swells down a straight), gated
    // like the turbo whine so a stationary car is silent. Kerbs and grass add
    // buffeting, rain adds spray hiss, and a hard lift/brake gusts briefly as
    // the air unloads — that decel term IS harvLevel, the smoothed derivative
    // the harvest layer just computed (lastSpeed is overwritten above, so
    // recomputing it here would read a difference of exactly zero). Peak stays ~0.04, an order under the
    // engine core, per the level budget the other bus layers keep to.
    const windOpen = s > 0.04 ? 1 : 0;
    const gust = harvLevel;   // already the smoothed decel signal, computed above
    const rough = (offroad ? 0.5 : 0) + (onKerb ? 0.35 : 0);
    const tow = clamp01(ph.tow || 0);   // in a slipstream the air is already moving: less wind
    aimGain(windGain,
      layers.wind ? (0.006 + 0.030 * s * s) * (1 + 0.45 * rough + 0.30 * gust) * (wet ? 1.25 : 1) * (1 - 0.35 * tow) * windOpen : 0,
      t, 0.10);
    windFilter.frequency.setTargetAtTime(450 + s * 1450 + rough * 260, t, 0.12);

    // offroad: ~8 Hz pitch wobble via the LFO (gain is cents of detune)
    // THE SIXTH CONSTANT setTargetAtTime, missed by the pass that removed five
    // from this same function. lfoG.gain has exactly two writers — `.value = 0`
    // where the node is created, and this line — so while the car is on-track
    // (the overwhelming majority of frames) this scheduled target 0 onto a value
    // already converged to 0: one main-thread call plus a cross-thread timeline
    // insertion, 60x a second for the whole race. Guarded on the TARGET, not on
    // usingSamples, because `offroad` really does flip.
    // The cache lives ON THE NODE deliberately: stopEngine() nulls lfo/lfoG and
    // startEngine() builds a fresh GainNode at `.value = 0`, so a module-level
    // variable would go stale across a restart and silence the wobble. A new
    // node has no _apexLfoTgt, which never equals a number, so the first call
    // after any restart always re-issues — matching the node's own initial 0.
    // 45 cents on a detune param; ~2.6% of the ratio is the same wobble in the
    // granular core's units (2^(45/1200) - 1), applied additively to a ratio that
    // spans 0.25-0.70, so it lands between 4% and 10% — close enough for a
    // "you are off the road" cue, and it cannot drive the ratio negative.
    const lfoTgt = offroad ? (usingGranular ? 0.015 : 45) : 0;
    if (lfoG._apexLfoTgt !== lfoTgt) {
      lfoG.gain.setTargetAtTime(lfoTgt, t, 0.05);
      lfoG._apexLfoTgt = lfoTgt;
    }
  }

  let rainSrc = null, rainGain = null, rainHp = null, rainLp = null, rainStopping = false;
  let rainPending = null;   // gain a start asked for while stopRain's teardown was running
  let rainWanted = false;   // wanted even when nodes are torn down (rebuildCtx / tab hide)
  let rainLastGain = 0.065; // last requested level, survives teardown/restore

  function startRain(gain) {
    // Remember the last requested level: the tab-return and ctx-rebuild paths
    // call startRain() with no argument, and the bare 0.065 default reset a
    // heavy-rain session to drizzle until the next weather flip.
    const g = gain == null ? rainLastGain : (rainLastGain = gain);
    rainWanted = true;
    if (rainSrc) { if (rainGain) rainGain.gain.setTargetAtTime(g, now(), 0.8); return; }
    if (!sfxOk()) return;
    // A start landing inside stopRain's 1.2 s teardown used to be dropped on the
    // floor — and the callers only fire on discrete weather FLIPS (race start,
    // setWeatherLive), so a rain→dry→rain inside that window left the loop silent
    // for the whole wet session with nothing to retry it. Queue it for the
    // teardown callback instead of returning empty-handed.
    if (rainStopping) { rainPending = g; return; }
    const dur = 4;
    const buf = noiseBuf(dur);
    rainSrc = ctx.createBufferSource();
    rainSrc.buffer = buf;
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
    if (!keepWant) rainWanted = false;
    // Only clear rainPending when there is an active source to tear down.
    // If rainStopping is already true and rainSrc is null, a prior stopRain is
    // already running its 1.2 s teardown — clearing rainPending here would drop
    // a startRain that queued itself during that window (rapid stop→start→stop).
    if (!rainSrc) return;
    rainPending = null;   // a newer stop cancels a queued restart, wet or dry
    rainStopping = true;
    const s = rainSrc, g = rainGain, h = rainHp, l = rainLp;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    try {
      g.gain.setTargetAtTime(0, now(), 0.4);
      setTimeout(() => {
        try { s.stop(); } catch (e) {}
        try { s.disconnect(); g.disconnect(); h.disconnect(); l.disconnect(); } catch (e) {}
        rainStopping = false;
        if (rainPending != null) { const pg = rainPending; rainPending = null; startRain(pg); }
      }, 1200);
    } catch (e) { rainStopping = false; rainPending = null; }
  }

  // x 0..1; looped bandpass noise follows it.
  // wet=true shifts the centre frequency down — water spray has a lower
  // spectral character than hot dry-rubber screech.
  function setSkid(x, wet) {
    if (!engineOn || !skidGain) return;
    const v = clamp01(x || 0);
    skidGain.gain.value = layers.screech ? v * (wet ? 0.10 : 0.16) : 0;   // wetter = quieter, sibilant
    if (v > 0) {
      const base = wet ? 480 : 760;                    // wet: lower splash vs dry: screech
      skidFilter.frequency.value = base + v * 320 + Math.sin(now() * 30) * 60;
    }
  }

  // Gear-shift cue: a quick rev-cut/blip layered over the running engine.
  // up=true -> upshift (clean clutch-kick blip up); up=false -> downshift
  // (lower heel-and-toe throttle blip). Safe to call rapidly; never restarts
  // the engine. Triggers a brief gain dip in the live engine via shiftDuck.
  function shift(up) {
    if (!sfxOk()) return;
    const isUp = up !== false;
    const t0 = now();

    // engine rev-cut: dip the running engine's gain, recovered in setEngine
    if (engineOn) {
      shiftDuck = isUp ? 1 : 0.7;     // downshift dips a little less (blip)
      shiftDuckT = t0;
    }

    const osc = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    f.type = "bandpass";
    f.Q.value = 1.2;
    const dur = isUp ? 0.085 : 0.11;
    // The shift crack carries the manufacturer's voice too: pitch rides
    // rateTrim (Ferrari's blip sits ~3% up, Audi's ~2% down, matching the
    // engine core) and the click's bandpass brightness rides cutTrim.
    const f0 = (isUp ? 520 : 300) * voice.rateTrim;
    const f1 = (isUp ? 300 : 360) * voice.rateTrim;     // up: cut down; down: small blip up
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    f.frequency.setValueAtTime((isUp ? 1400 : 900) * voice.cutTrim, t0);
    f.frequency.exponentialRampToValueAtTime((isUp ? 600 : 700) * voice.cutTrim, t0 + dur);
    env(g, t0, isUp ? 0.12 : 0.1, 0.004, dur);
    osc.connect(f).connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => { osc.disconnect(); f.disconnect(); g.disconnect(); };

    // a touch of mechanical click via short filtered noise
    noise(isUp ? 0.05 : 0.045, 0.05, (isUp ? 2600 : 1800) * voice.cutTrim);
  }

  // i 0..4 — each start light a touch higher than the last
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

  // Active-aero X-mode latch: rising pair when the wing sheds load, falling
  // pair when it re-arms. Softer than overtakeReady — a mechanical latch, not
  // an alert.
  function xMode(on) {
    if (on) {
      blip(740, "triangle", 0.10, 0.006, 0.06);
      blip(988, "triangle", 0.10, 0.006, 0.10, null, 0.07);
    } else {
      blip(988, "triangle", 0.08, 0.006, 0.06);
      blip(740, "triangle", 0.08, 0.006, 0.10, null, 0.07);
    }
  }

  // Per-manufacturer engine voice. Safe to call any time — the constant trims
  // (rateTrim/cutTrim/whine) apply on the next setEngine frame; the graph-shape
  // fields (formant, detune, subLvl) apply at the next startEngine. game.js
  // calls this right before startEngine, so in practice both land together.
  function setVoice(engineName) {
    voice = ENGINE_VOICES[engineName] || ENGINE_VOICES["default"];
    voiceName = ENGINE_VOICES[engineName] ? engineName : "default";
    applyTuneNodes();
  }

  // The two tune fields that are NOT per-frame expressions: detune lives on the
  // sample sources and sub-octave weight on the gain engC was built behind, so
  // both are written when the tune (or the voice) changes rather than 60x a
  // second. Safe before the engine exists — every write is guarded on its node.
  function applyTuneNodes() {
    if (!ctx) return;
    const t = now();
    // Player detune rides ON TOP of the manufacturer's cents, so the voice's
    // character survives the slider: 1.0 is exactly voice.detune, and the range
    // [0,3] spans -30..+60 cents around it. That is a tenth of what the PITCH
    // slider covers, which is the point — this is chorus/character width, not
    // a second pitch control.
    const cents = voice.detune + (tune.detune - 1) * 30;
    detuneMul = Math.pow(2, cents / 1200);
    if (engSrcIdle && engSrcIdle.detune) engSrcIdle.detune.setTargetAtTime(cents, t, 0.05);

    const subGain = engC && engC._apexSubGain;
    if (subGain) subGain.gain.setTargetAtTime(voice.subLvl * tune.sub, t, 0.05);
  }

  // Clamp into TUNE_RANGE and drop anything not in the table: these values come
  // from a slider and from localStorage, and a NaN reaching playbackRate throws
  // the whole engine graph out for the rest of the session.
  function setTune(patch) {
    if (patch) for (const k of Object.keys(TUNE_DEF)) {
      const v = patch[k];
      if (typeof v !== "number" || !isFinite(v)) continue;
      const [lo, hi] = TUNE_RANGE[k];
      tune[k] = Math.max(lo, Math.min(hi, v));
    }
    // A trim that no longer matches the named profile makes the name a LIE —
    // and profile() is what the panel lights and what __apex.audio() reports,
    // so the lie would be visible in two places. Recomputed rather than set
    // unconditionally: restoring a saved tune that happens to equal its profile
    // must stay on that profile, not read as hand-edited.
    profileName = nameForTune();
    applyTuneNodes();
    return Object.assign({}, tune);
  }

  // The profile the live tune actually IS, or "custom". Derived rather than
  // latched: dragging a slider away and back again should relight the preset it
  // matches, and a one-way flip to "custom" would leave the row dark until the
  // player pressed RESET. The current name wins any tie so identical presets
  // could never make the row jump between two equally-true labels.
  function nameForTune() {
    const fits = (name) => {
      if (!Object.prototype.hasOwnProperty.call(SOUND_PROFILES, name)) return false;
      const want = Object.assign({}, TUNE_DEF, SOUND_PROFILES[name] || {});
      return Object.keys(TUNE_DEF).every((k) => Math.abs(tune[k] - want[k]) < 1e-9);
    };
    if (fits(profileName)) return profileName;
    return Object.keys(SOUND_PROFILES).find(fits) || "custom";
  }

  // A profile is a named tune. Picking one REPLACES the trims (any field it
  // omits falls back to the default rather than lingering from the last
  // profile); "team" restores identity, which is the shipped sound.
  function setProfile(name) {
    const key = Object.prototype.hasOwnProperty.call(SOUND_PROFILES, name) ? name : "team";
    profileName = key;
    tune = Object.assign({}, TUNE_DEF, SOUND_PROFILES[key] || {});
    applyTuneNodes();
    return key;
  }

  // The A/B against the old core. Restarts the engine because which core runs
  // is decided once, in startEngine — the same reason the sample upgrade
  // restarts rather than swapping a node under a live voice.
  function setGranular(on) {
    const want = !!on;
    if (want === granularOn) return granularOn;
    granularOn = want;
    if (engineOn) { stopEngine(); startEngine(); }
    return granularOn;
  }

  /* setRivals(list) — the cars around you, in the PLAYER'S track frame.
   * Each entry: { lat, arc, rev, approach }
   *   lat      metres to the RIGHT (negative = your left)
   *   arc      metres AHEAD (negative = behind)
   *   rev      0..1, their engine speed
   *   approach metres/second of closing (positive = coming at you)
   * Sorted nearest-first by game.js; anything past RIVAL_VOICES is dropped.
   *
   * Safe to call every frame, and safe to call with [] — an empty list is how
   * the field goes quiet when you drive away from it.
   */
  function setRivals(list) {
    if (!engineOn || !rivalVoices.length) return;
    const t = now();
    const n = layers.rivals && list ? Math.min(list.length, rivalVoices.length) : 0;
    for (let i = 0; i < rivalVoices.length; i++) {
      const v = rivalVoices[i];
      if (i >= n) { aimGain(v.gain, 0, t, 0.12); continue; }
      const r = list[i];
      const lat = +r.lat || 0, arc = +r.arc || 0;
      const dist = Math.hypot(lat, arc);
      if (!(dist < RIVAL_RANGE)) { aimGain(v.gain, 0, t, 0.12); continue; }

      // PAN by the angle, not by the lateral offset alone: a car two metres to
      // your right is hard right when it is alongside and dead ahead when it is
      // fifty metres up the road. Dividing by the arc distance is that angle,
      // near enough, and it keeps the image from flicking side to side as a
      // distant car weaves.
      // ...and never FULLY hard: at ±1 a car alongside disappears from one ear
      // entirely, which on headphones reads as detached from the scene rather
      // than beside you. 0.85 keeps a little of it in the far ear, which is
      // what having two of them is for.
      const pan = 0.85 * Math.max(-1, Math.min(1, lat / Math.max(3, Math.abs(arc) + 3)));
      if (v.pan.pan._apexPanTgt !== pan) { v.pan.pan.setTargetAtTime(pan, t, 0.06); v.pan.pan._apexPanTgt = pan; }

      // Level falls off with distance and is quieter behind you than ahead —
      // your own engine is between you and it.
      const near = 1 - dist / RIVAL_RANGE;
      const behind = arc < 0 ? 0.7 : 1;
      aimGain(v.gain, 0.055 * near * near * behind * (0.45 + 0.55 * clamp01(r.rev)), t, 0.10);

      // Air absorbs the top end with distance, which is most of why a far car
      // reads as far rather than merely quiet.
      const cut = 1200 + 5200 * near * near;
      if (Math.abs((v.filt.frequency._apexCut ?? -1) - cut) > 60) {
        v.filt.frequency.setTargetAtTime(cut, t, 0.12);
        v.filt.frequency._apexCut = cut;
      }

      // DOPPLER. Their pitch from their own revs, shifted by how fast the gap is
      // closing — the rise as a car comes past you is the cue, and it falls out
      // of one multiply. Clamped: a 340 m/s closing speed is not a race, it is
      // a divide-by-zero waiting to happen.
      const dop = 1 + Math.max(-60, Math.min(60, +r.approach || 0)) / 343;
      const rate = (0.25 + clamp01(r.rev) * 0.45) * dop;
      if (Math.abs((v.src.playbackRate._apexRate ?? -1) - rate) > 0.002) {
        v.src.playbackRate.setTargetAtTime(rate, t, 0.06);
        v.src.playbackRate._apexRate = rate;
      }
    }
  }

  function setLayer(name, on) {
    if (Object.prototype.hasOwnProperty.call(LAYER_DEF, name)) layers[name] = !!on;
    return Object.assign({}, layers);
  }

  // whoosh: filtered noise sweeping up + a rising saw underneath
  function deployBoost() {
    if (!sfxOk()) return;
    const t0 = now();
    const src = ctx.createBufferSource();
    const off = bindNoise(src, 0.7);        // start(t0, off) -> stop(t0 + 0.6)
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t0);
    f.frequency.exponentialRampToValueAtTime(4800, t0 + 0.45);
    const g = ctx.createGain();
    env(g, t0, 0.3, 0.03, 0.45);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, off);
    src.stop(t0 + 0.6);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
    blip(220, "sawtooth", 0.12, 0.03, 0.4, 880);
  }

  // Contact. `impact` 0..1 is what collideFx already computes (and used to
  // throw away): a graze and a T1 shunt were byte-identical. `scrape` is the
  // wall-follow case — a sustained band-passed grind instead of a thump.
  function collision(impact, scrape) {
    const k = clamp01(impact != null ? impact : 0.6);
    if (scrape) { scrapeNoise(0.12 + 0.22 * k, 0.22 + 0.18 * k); return; }
    blip(150, "sine", 0.34 * (0.4 + 0.6 * k), 0.005, 0.25, 45);
    noise(0.26 * (0.4 + 0.6 * k), 0.18, 900);
    if (k > 0.6) blip(70, "sine", 0.3 * (k - 0.6) / 0.4, 0.004, 0.3, 40);   // the bang under a real hit
  }
  // Band-passed noise burst — metal on barrier. Shares the noise pool.
  function scrapeNoise(peak, decay) {
    if (!sfxOk()) return;
    const t0 = now();
    const src = ctx.createBufferSource();
    const off = bindNoise(src, decay + 0.15);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 1.2;
    const g = ctx.createGain();
    env(g, t0, peak, 0.02, decay);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, off);
    src.stop(t0 + decay + 0.1);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  function offtrack() {
    noise(0.14, 0.14, 480);
    blip(95, "square", 0.14, 0.01, 0.1, 60);
  }

  // short low rattle for riding a kerb; call repeatedly (throttled) for a rumble
  function rumble() {
    noise(0.09, 0.05, 320);
  }

  function thunder(near) {
    const n = Math.max(0, Math.min(1, near == null ? 0.6 : near));
    noise(0.10 + n * 0.22, 0.9 + n * 0.7, 170 + n * 150);      // rolling body
    noise(0.04 + n * 0.12, 0.25, 650 + n * 700, 0.05);          // closer crack
    noise(0.03 + n * 0.06, 1.7, 85);                            // long low tail
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

  function uiTick() {
    blip(660, "square", 0.08, 0.004, 0.05);
  }

  // BRAKE CUE: same click every time — the SIGNAL is the pulse rate, not pitch
  // (docs/research/DRIVING-CONTROLS-RESEARCH.md, Forza BDA). `urgency` is unused
  // on purpose so a future LIGHT/FULL level can share the voice.
  function brakeCue(_urgency) {
    blip(520, "square", 0.07, 0.003, 0.045);
  }

  function uiSelect() {
    blip(880, "square", 0.13, 0.005, 0.09);
  }

  // "No" — a rejected purchase used to play the SAME 660 Hz uiTick as a
  // successful tab switch, so an over-budget part sounded exactly like a
  // fitted one. A short low sawtooth (the penalty() family's timbre, UI-
  // sized) is unmistakably not a confirmation.
  function uiReject() {
    blip(220, "sawtooth", 0.12, 0.006, 0.14);
  }

  function penalty() {
    blip(330, "sawtooth", 0.22, 0.01, 0.45, 116);
    blip(165, "square", 0.14, 0.01, 0.45, 58);
  }

  /*
   * Music is now real, downloaded CC0 tracks (see assets/music/CREDITS.txt),
   * streamed and looped through the AudioContext. The old synth sequencer was
   * removed. startMusic(trackIdx) -> a race loop; startMusic(-1) -> menu loop.
   */
  function ensureMusicGain() {
    if (!musicGain && ctx && master) {
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVol * MUSIC_FULL;   // music sits under the engine
      musicGain.connect(master);
    }
  }

  let musicResumeBuf = null, musicResumeAt = NaN, musicResumeOff = 0;
  function playMusicBuffer(buf, token) {
    if (!ctx || !musicOn || token !== musicToken) return;  // superseded
    ensureMusicGain();
    try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {}
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // A PLAYLIST, so no per-source loop: each track hands over to the next when
    // it ends, and the list wraps. (A single looping source could never reach
    // the second song.)
    src.loop = PLAYLIST.length < 2;
    src.connect(musicGain);
    src.onended = function () {
      if (src !== musicSrc || token !== musicToken || !musicOn) return;
      nextTrack(1);
    };
    // Resume where the same song left off: a tab-hide stops the source and
    // the return restarted it from 0:00 — every lock or app switch rewound
    // the track. The offset is kept per BUFFER so a different song starts clean.
    let off = 0;
    if (musicResumeBuf === buf && Number.isFinite(musicResumeAt) && buf.duration > 0) {
      off = Math.max(0, (ctx.currentTime - musicResumeAt) + musicResumeOff) % buf.duration;
    }
    src.start(0, off);
    musicResumeBuf = buf; musicResumeAt = ctx.currentTime; musicResumeOff = off;
    musicSrc = src;
  }

  function eligible(i) {
    const e = PLAYLIST[i];
    if (!e) return false;
    return source === "all" || (source === "builtin" ? !!e.builtin : !e.builtin);
  }
  function anyEligible() {
    for (let i = 0; i < PLAYLIST.length; i++) if (eligible(i)) return true;
    return false;
  }
  function seekEligible(from, step) {
    const n = PLAYLIST.length;
    if (!n) return -1;
    const d = step < 0 ? -1 : 1;
    for (let k = 1; k <= n; k++) {
      const i = ((from + d * k) % n + n) % n;
      if (eligible(i)) return i;
    }
    return eligible(from) ? from : -1;
  }

  function nextTrack(step) {
    if (!PLAYLIST.length) return;
    const i = seekEligible(musicIndex, step || 1);
    if (i < 0) { stopInternal(); return; }
    musicIndex = i;
    playIndex(musicIndex);
  }

  /* Pick which part of the library plays. Returns the source actually applied —
     a selection with nothing in it (MY TRACKS before anything is uploaded)
     is refused rather than leaving the game silent with no explanation. */
  function setMusicSource(s) {
    const want = (s === "builtin" || s === "user") ? s : "all";
    const prev = source;
    source = want;
    if (!anyEligible()) { source = prev; return prev; }
    if (backend) return source;
    if (!eligible(musicIndex)) {
      const i = seekEligible(musicIndex, 1);
      if (i >= 0) { musicIndex = i; if (musicOn) playIndex(i); }
    }
    return source;
  }
  function musicSource() { return source; }
  function sourceCounts() {
    let builtin = 0, user = 0;
    for (const e of PLAYLIST) { if (e.builtin) builtin++; else user++; }
    return { builtin, user, total: PLAYLIST.length };
  }

  // Start (or restart) at a given playlist slot, regardless of what is playing.
  function playIndex(i) {
    if (!ctx || !musicEnabled || backend || !PLAYLIST.length) return;
    musicIndex = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const url = PLAYLIST[musicIndex].url;
    try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {}
    musicSrc = null;
    musicOn = true;
    currentUrl = url;
    const token = ++musicToken;
    const builtin = !!PLAYLIST[musicIndex].builtin;
    if (ctx.state !== "running") { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    if (musicBuffers[url]) { playMusicBuffer(musicBuffers[url], token); return; }
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => new Promise((res, rej) => { ctx.decodeAudioData(ab, res, rej); }))
      .then(buf => {
        // Every track, builtin or uploaded, is cached under the same bound
        // (MUSIC_CACHE): builtins used to be held for the life of the context
        // — five decoded songs — and a single uploaded MP3 used to re-fetch
        // and re-decode on EVERY repeat.
        musicBuffers[url] = buf;
        _bufKeys.push(url);
        while (_bufKeys.length > MUSIC_CACHE) delete musicBuffers[_bufKeys.shift()];
        playMusicBuffer(buf, token);
      })
      .catch((err) => {
        // Music is optional and the game plays on without it. Retained rather
        // than printed: a soundtrack that never starts is otherwise invisible.
        Log.warn("audio", "music load/decode failed for " + url + ": " + ((err && err.message) || err));
      });
  }

  /* ---------------- mixer ----------------
     Two independent levels under the master mute: the SFX bus (engine, skids,
     rain, UI) and the music gain. Both take 0..1 and apply immediately, so a
     slider moves the level while it is being dragged. */
  function setSfxVolume(v) {
    sfxVol = clamp01(typeof v === "number" ? v : 1);
    if (sfxBus) sfxBus.gain.value = sfxEnabled ? sfxVol : 0;
    return sfxVol;
  }
  function setSfxEnabled(b) {
    sfxEnabled = !!b;
    if (sfxBus) sfxBus.gain.value = sfxEnabled ? sfxVol : 0;
    return sfxEnabled;
  }
  function setMusicVolume(v) {
    musicVol = clamp01(typeof v === "number" ? v : 0.5);
    if (musicGain) { musicGain.gain.value = musicVol * MUSIC_FULL; musicGain._apexDuckTgt = null; }   // a direct write invalidates the duck cache
    if (backend) { try { backend.setVolume(musicVol); } catch (e) {} }
    return musicVol;
  }
  function volumes() { return { sfx: sfxVol, music: musicVol }; }

  function skipTrack() {
    if (!musicEnabled) return null;
    if (backend) { try { return backend.skip(); } catch (e) { return null; } }
    if (!ctx) return null;
    nextTrack(1);
    return trackName();
  }
  function prevTrack() {
    if (!musicEnabled) return null;
    if (backend) {
      try { return backend.prev ? backend.prev() : backend.name(); } catch (e) { return null; }
    }
    if (!ctx) return null;
    nextTrack(-1);
    return trackName();
  }
  function trackName() {
    if (backend) { try { return backend.name(); } catch (e) { return null; } }
    const e = PLAYLIST[musicIndex];
    return e ? e.name : "";
  }

  /* ------- playlist management (used by MusicLib for uploaded files) -------
     Uploaded tracks arrive as { id, name, url } with url an object URL owned by
     the caller — WE NEVER REVOKE IT, because the same blob may be re-added and
     the owner needs to decide when it dies. */
  function tracks() {
    return PLAYLIST.map(e => ({ id: e.id, name: e.name, builtin: !!e.builtin }));
  }
  function indexOfId(id) {
    for (let i = 0; i < PLAYLIST.length; i++) if (PLAYLIST[i].id === id) return i;
    return -1;
  }
  function addTracks(list) {
    if (!list || !list.length) return 0;
    let n = 0;
    for (const t of list) {
      if (!t || !t.id || !t.url || indexOfId(t.id) >= 0) continue;
      PLAYLIST.push({ id: t.id, name: t.name || "track", url: t.url, builtin: false });
      n++;
    }
    return n;
  }
  function removeTrack(id) {
    const i = indexOfId(id);
    if (i < 0) return false;
    const wasPlaying = musicOn && i === musicIndex;
    delete musicBuffers[PLAYLIST[i].url];
    PLAYLIST.splice(i, 1);
    if (i < musicIndex) musicIndex--;
    if (!PLAYLIST.length) { stopInternal(); musicIndex = 0; return true; }
    musicIndex = ((musicIndex % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    if (wasPlaying) playIndex(musicIndex);
    return true;
  }
  function playTrackId(id) {
    const i = indexOfId(id);
    if (i < 0 || backend || !musicEnabled) return false;
    playIndex(i);
    return musicOn;
  }
  function currentTrackId() {
    if (!musicOn || backend) return null;
    const e = PLAYLIST[musicIndex];
    return e ? e.id : null;
  }

  /* ------- external music backend (Spotify) -------
     Installing one silences the built-in playlist and routes every music call
     to the backend; removing it hands the soundtrack back, resuming where the
     built-in playlist left off rather than restarting from track one. */
  function setMusicBackend(b) {
    if (b === backend) return;
    backend = b || null;
    if (backend) {
      stopInternal();
      try {
        backend.setVolume(musicVol);
        if (musicEnabled && isEnabled) backend.start();
      } catch (e) { /* a broken backend must not take the audio down */ }
    } else if (musicEnabled && isEnabled && ctx) {
      playIndex(musicIndex);
    }
  }
  function musicBackend() { return backend; }

  function setMusicEnabled(b) {
    musicEnabled = !!b;
    if (!musicEnabled) stopMusic();
    else if (ctx || backend) startMusic(lastTrackIdx);
  }

  function startMusic(trackIdx) {
    const idx = (typeof trackIdx === "number") ? trackIdx : 0;
    lastTrackIdx = idx;
    if (!musicEnabled) return;
    // Delegated: the backend owns play/pause, and needs no AudioContext.
    if (backend) { try { backend.start(); } catch (e) {} return; }
    if (!ctx) return;                    // remember the track but stay silent if music is off
    // The menu and the race share one playlist, so a state change must NOT
    // interrupt it — going to the grid used to restart the track from zero.
    // Whatever is playing keeps playing; we only start something if silent.
    if (musicOn && musicSrc) return;
    playIndex(musicIndex);
  }

  function stopInternal() {
    musicOn = false;
    currentUrl = null;
    musicToken++;                                // cancel any in-flight load
    try { if (musicSrc) { musicSrc.onended = null; musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {}
    musicSrc = null;
  }

  function stopMusic() {
    stopInternal();
    if (backend) { try { backend.stop(); } catch (e) {} }
  }

  return {
    init,
    setEnabled,
    enabled,
    startEngine,
    stopEngine,
    setEngine,
    setSkid,
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
    setGranular,
    setRivals,
    // Test hooks: each rival voice's live pan/level/pitch. They sit behind their
    // own panners on sfxBus, so nothing downstream of the engine can see them.
    rivalState() {
      return rivalVoices.map((v) => ({
        gain: +v.gain.gain.value.toFixed(5),
        pan: +v.pan.pan.value.toFixed(4),
        rate: +v.src.playbackRate.value.toFixed(4),
        cut: Math.round(v.filt.frequency.value),
      }));
    },
    granular() { return { on: granularOn, ready: granularReady, active: usingGranular, period: enginePeriod }; },
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
    uiSelect,
    uiReject,
    penalty,
    startRain,
    stopRain,
    startMusic,
    stopMusic,
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
    sessionType() { return sessionType; },
    setMusicSource,
    musicSource,
    sourceCounts,
    setSfxVolume,
    setSfxEnabled,
    setMusicVolume,
    volumes,
    // Test hook: the airflow layer's live gain. It sits on sfxBus, so
    // centroidHz() (which taps engGain, upstream of the bus) cannot see it —
    // this is the only way to assert the layer actually tracks speed.
    windLevel() { return windGain ? +windGain.gain.value : 0; },
    // Same shape as windLevel: the rev-limiter chop lives on limGain, which
    // feeds engGain.gain on the audio thread, so nothing downstream of the
    // engine output can observe its depth.
    limiterDepth() { return limGain ? +limGain.gain.value : 0; },
    // Same shape again: the sub-octave sits on its own gain straight into
    // sfxBus, so centroidHz() (which taps engGain) cannot see it either.
    subLevel() { return subOctGain ? +subOctGain.gain.value : 0; },
    subHz() { return subOctOsc ? +subOctOsc.frequency.value : 0; },
    // Ground-truth pitch multiplier, whichever core is running. The granular node's
    // AudioParam only converges to the target over its own tau, so the value
    // this reports is the one setEngine last ASKED for — the same thing
    // playbackRate.value settled to, and what every pitch test compares.
    rate() {
      if (usingGranular) return +lastRate.toFixed(4);
      return (engSrcIdle && engSrcIdle.playbackRate) ? +engSrcIdle.playbackRate.value.toFixed(4) : 0;
    },
    centroidHz() {
      if (!ctx || !engineOn || !engGain) return 0;
      if (!dbgAnalyser) {
        // Lazy debug tap (test-only caller): created on first read, torn down
        // with the engine in stopEngine like before.
        dbgAnalyser = ctx.createAnalyser();
        dbgAnalyser.fftSize = 16384;
        dbgAnalyser.smoothingTimeConstant = 0;   // instantaneous spectrum for clean test reads
        engGain.connect(dbgAnalyser);
      }
      const n = dbgAnalyser.frequencyBinCount, arr = new Float32Array(n);
      dbgAnalyser.getFloatFrequencyData(arr);
      let num = 0, den = 0;
      for (let i = 1; i < n; i++) { const m = Math.pow(10, arr[i] / 20); num += (i * ctx.sampleRate / dbgAnalyser.fftSize) * m; den += m; }
      return den > 0 ? Math.round(num / den) : 0;
    },
    // debug/telemetry: lets tests confirm the recorded engine samples loaded
    debug() { return { contextState: ctx ? ctx.state : "uninitialised", samplesReady, usingSamples, engineOn, voice: voiceName, loop: engSrcIdle ? { s: +engSrcIdle.loopStart.toFixed(2), e: +engSrcIdle.loopEnd.toFixed(2) } : null }; },
  };
})();
