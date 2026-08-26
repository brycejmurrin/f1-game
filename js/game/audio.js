/* GameAudio: WebAudio for Apex 26 — a synthesized/sample-based engine voice and race SFX, plus a streamed-MP3 soundtrack. init() must be called from a user gestur… */
"use strict";

const GameAudio = (function () {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  // 0..1 mixer levels, restored by the caller from storage on boot.
  let sfxVol = 1;
  let sfxEnabled = true;      // the SOUND EFFECTS switch — music is unaffected
  let musicVol = 0.5;
  const MUSIC_FULL = 0.52;
  let isEnabled = true;

  // Engine voice (persistent while racing)
  let engA = null, engB = null, engC = null;     // saw, saw, square (synth fallback)
  let engFilter = null, engGain = null;
  let whineOsc = null, whineGain = null;          // turbo whine
  let harvSrc = null, harvFilter = null, harvGain = null; // MGU-K harvest whirr
  let lfo = null, lfoG = null;                    // offroad pitch wobble (8 Hz)
  let skidSrc = null, skidFilter = null, skidGain = null;
  let engineOn = false;
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0;
  let shiftDuck = 0, shiftDuckT = 0;   // transient engine-gain dip from a gear shift
  let idleGainRamped = false;          // the sample voice's one-time fade-in (see setEngine)

  let engBuf = null, accBuf = null, samplesReady = false;
  let engSrcIdle = null, engSrcAcc = null, engGainIdle = null, engGainAcc = null;
  let usingSamples = false;
  let dbgAnalyser = null;          // taps the engine output so tests can measure pitch
  const SFX_ENGINE = "assets/sfx/f1_engine.mp3";   // sustained F1 drone (primary)
  const SFX_ACCEL = "assets/sfx/f1_rev.mp3";        // high-rev layer

  // Music: streamed CC0 tracks (assets/music/), lazy-loaded + cached
  let musicOn = false;
  let musicEnabled = true;        // separate from the master sound toggle
  let lastTrackIdx = -1;
  let musicGain = null;
  let musicSrc = null;
  let currentUrl = null;
  let musicToken = 0;
  const musicBuffers = {};                 // url -> decoded AudioBuffer (per ctx)
  const _userBufKeys = [];                 // insertion order of non-builtin keys (cap 2)
  const MENU_TRACK = "assets/music/menu.mp3";
  const PLAYLIST = [
    { id: "builtin:menu", name: "menu", url: MENU_TRACK, builtin: true },
    { id: "builtin:song2", name: "song2", url: "assets/music/song2.mp3", builtin: true },
    { id: "builtin:song3", name: "song3", url: "assets/music/song3.mp3", builtin: true },
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
    master.connect(ctx.destination);
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
    Promise.all([grab(SFX_ENGINE), grab(SFX_ACCEL)])
      .then(([e, a]) => { engBuf = e; accBuf = a; samplesReady = true; Log.debug("audio", "engine samples decoded"); })
      .catch((err) => {
        Log.warn("audio", "engine sample load/decode failed, using synth voice: " + ((err && err.message) || err));
      });
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
    musicGain = null;
    currentUrl = null;
    rainStopping = false;
    rainPending = null;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    for (const k in musicBuffers) delete musicBuffers[k];  // buffers are ctx-bound
    _userBufKeys.length = 0;
    engBuf = accBuf = null; samplesReady = false;           // ctx-bound; reload for new ctx
    noisePoolBuf = null;                                    // ctx-bound too — a buffer from the
                                                            // old ctx throws on the new one
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

     Context-bound like engBuf/accBuf, so rebuildCtx() must clear it. */
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

    // shared lowpass + master gain for the engine core (samples or synth)
    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;
    engFilter.connect(engGain).connect(sfxBus);
    // The debug analyser tap is created LAZILY in centroidHz() — a 16384-fft
    // AnalyserNode copying every render quantum was shipping in every race for
    // a hook whose only caller is a test (audio-smoke's expect.poll absorbs
    // the first-read warm-up).

    usingSamples = !!(samplesReady && engBuf && accBuf);
    engA = engB = engC = null;
    engSrcIdle = engSrcAcc = engGainIdle = engGainAcc = null;
    idleGainRamped = false;   // new gain node, so the fade-in must happen again
    if (usingSamples) {
      engSrcIdle = ctx.createBufferSource(); engSrcIdle.buffer = engBuf; engSrcIdle.loop = true;
      engSrcAcc = ctx.createBufferSource(); engSrcAcc.buffer = accBuf; engSrcAcc.loop = true;
      const li = findStableLoop(engBuf), la = findStableLoop(accBuf);
      engSrcIdle.loopStart = li.start; engSrcIdle.loopEnd = li.end;
      engSrcAcc.loopStart = la.start; engSrcAcc.loopEnd = la.end;
      engGainIdle = ctx.createGain(); engGainIdle.gain.value = 0;
      engGainAcc = ctx.createGain(); engGainAcc.gain.value = 0;
      engSrcIdle.connect(engGainIdle).connect(engFilter);
      engSrcAcc.connect(engGainAcc).connect(engFilter);
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
      engC.connect(engFilter);
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

    // offroad wobble: 8 Hz LFO into oscillator detune (cents)
    lfo = ctx.createOscillator();
    lfoG = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 8;
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    if (usingSamples) {
      lfoG.connect(engSrcIdle.detune);
      lfoG.connect(engSrcAcc.detune);
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

    if (usingSamples) { engSrcIdle.start(0, engSrcIdle.loopStart); engSrcAcc.start(0, engSrcAcc.loopStart); }
    else { engA.start(); engB.start(); engC.start(); }
    whineOsc.start();
    harvSrc.start();
    lfo.start();
    skidSrc.start();

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
    engGain.gain.cancelScheduledValues(t0);
    engGain.gain.setTargetAtTime(0, t0, 0.06);
    whineGain.gain.setTargetAtTime(0, t0, 0.06);
    harvGain.gain.setTargetAtTime(0, t0, 0.06);
    skidGain.gain.setTargetAtTime(0, t0, 0.04);
    if (usingSamples) {
      if (engGainIdle) engGainIdle.gain.setTargetAtTime(0, t0, 0.06);
      if (engGainAcc) engGainAcc.gain.setTargetAtTime(0, t0, 0.06);
      if (engSrcIdle) engSrcIdle.stop(t0 + 0.35);
      if (engSrcAcc) engSrcAcc.stop(t0 + 0.35);
    } else {
      engA.stop(t0 + 0.35); engB.stop(t0 + 0.35); engC.stop(t0 + 0.35);
    }
    engSrcIdle = engSrcAcc = engGainIdle = engGainAcc = null;
    whineOsc.stop(t0 + 0.35);
    harvSrc.stop(t0 + 0.35);
    lfo.stop(t0 + 0.35);
    skidSrc.stop(t0 + 0.35);
    engA = engB = engC = null;
    whineOsc = null;
    harvSrc = null;
    lfo = null;
    skidSrc = null;
    // Disconnect the test analyser tap so it doesn't accumulate across restarts.
    if (dbgAnalyser) { try { dbgAnalyser.disconnect(); } catch (e) {} dbgAnalyser = null; }
    // Tear the whole faded chain out of the graph once the 0.35 s source stops
    // complete: stopped sources GC on their own, but Gain/Biquad nodes routed
    // into sfxBus keep RENDERING until disconnect() (Web Audio contract) — a
    // tab-hide/show cycle used to strand ~8 nodes each time, forever.
    const dead = [engFilter, engGain, whineGain, harvFilter, harvGain, skidFilter, skidGain, lfoG];
    setTimeout(() => { for (const n of dead) { try { if (n) n.disconnect(); } catch (e) {} } }, 450);
    engFilter = engGain = whineGain = harvFilter = harvGain = skidFilter = skidGain = lfoG = null;
    idleGainRamped = false;
    engineOn = false;
  }

  function setEngine(rev01, boost01, offroad, speed01, gear, physics) {
    if (!engineOn || !sfxOk()) return;
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
      const gmul = g <= 3 ? [0.6, 0.72, 0.84][g - 1] : 1.0;
      const rate = (0.25 + rev * 0.45) * (1 + 0.04 * b) * gmul;   // idle ~0.25x .. redline ~0.70x, lower in gears 1-3
      engSrcIdle.playbackRate.setTargetAtTime(rate, t, 0.035);
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
      if (!idleGainRamped) { engGainIdle.gain.setTargetAtTime(0.9, t, 0.05); idleGainRamped = true; }
    } else {
      // synth fallback: detuned saws + sub follow the per-gear frequency
      const base = (gIdle + rev * gSpan) * (1 + 0.12 * b);
      engA.frequency.setTargetAtTime(base * 0.994, t, 0.025);
      engB.frequency.setTargetAtTime(base * 1.009, t, 0.025);
      engC.frequency.setTargetAtTime(base * 0.5, t, 0.025);
    }

    // Engine load from traction loss: when wheels are sliding the engine works
    // harder — filter opens and gain rises slightly. Braking at the limit adds
    // a brief intake/turbo suck quality via a subtler filter lift.
    const slipLoad  = slip01 * 0.12;          // up to +12% filter open under slide
    const brakeLoad = brakeFrac * 0.08;        // up to +8% under hard braking
    const kerbLoad  = onKerb ? 0.04 : 0;      // small gain bump over a kerb

    const cut = usingSamples
      ? Math.min(11000, 2600 + s * 5800 + rev * 2400 + b * 1500 + slipLoad * 2000 + brakeLoad * 1200)
      : Math.min(7200,  600  + s * 4200 + rev * 700  + b * 1400 + slipLoad * 1000 + brakeLoad * 600);
    engFilter.frequency.setTargetAtTime(cut, t, 0.05);
    const lvl = usingSamples
      ? (0.3 + s * 0.3 + rev * 0.08 + b * 0.08 + (offroad ? 0.03 : 0) + slipLoad * 0.8 + kerbLoad)
      : (0.05 + s * 0.05 + rev * 0.02 + b * 0.025 + (offroad ? 0.012 : 0) + slipLoad * 0.2 + kerbLoad * 0.3);
    engGain.gain.setTargetAtTime(lvl * (1 - 0.55 * shiftDuck), t, 0.03);

    // Turbo whine: in low gears (1-3) mechanical supercharger character — the
    // frequency climbs faster but levels off earlier than at high speed.
    const lowGearFactor = g01 < 0.35 ? 0.85 + g01 * 0.43 : 1;   // compressed range in low gears
    whineOsc.frequency.setTargetAtTime((1500 + rev * 2000) * lowGearFactor, t, 0.05);
    whineGain.gain.setTargetAtTime(
      (0.004 + rev * 0.013 + b * 0.008) * (s > 0.04 ? 1 : 0) * (usingSamples ? 0.50 : 1), t, 0.08);

    const dt = lastEngT ? Math.max(0.001, t - lastEngT) : 0;
    let target = 0;
    if (dt > 0) {
      const decel = (lastSpeed - s) / dt;   // speed01 units shed per second
      target = clamp01(decel * 5) * Math.min(1, s * 3);
    }
    lastEngT = t;
    lastSpeed = s;
    harvLevel += (target - harvLevel) * Math.min(1, (dt || 0.016) / 0.12);
    if (!usingSamples) {
      harvGain.gain.setTargetAtTime(harvLevel * 0.06, t, 0.06);
      harvFilter.frequency.setTargetAtTime(700 + s * 1600, t, 0.08);
    }

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
    const lfoTgt = offroad ? 45 : 0;
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
    skidGain.gain.value = v * (wet ? 0.10 : 0.16);   // wetter = quieter, sibilant
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
    const f0 = isUp ? 520 : 300;
    const f1 = isUp ? 300 : 360;     // up: cut down; down: small blip up
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    f.frequency.setValueAtTime(isUp ? 1400 : 900, t0);
    f.frequency.exponentialRampToValueAtTime(isUp ? 600 : 700, t0 + dur);
    env(g, t0, isUp ? 0.12 : 0.1, 0.004, dur);
    osc.connect(f).connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => { osc.disconnect(); f.disconnect(); g.disconnect(); };

    // a touch of mechanical click via short filtered noise
    noise(isUp ? 0.05 : 0.045, 0.05, isUp ? 2600 : 1800);
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

  function collision() {
    blip(150, "sine", 0.34, 0.005, 0.25, 45);
    noise(0.26, 0.18, 900);
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
    src.start();
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
        // Cache user tracks too — a single uploaded MP3 used to re-fetch and
        // re-decode on EVERY repeat (loop only engages under 2 playlist
        // entries, and only builtins were cached). Decoded PCM is big, so
        // user-track buffers are bounded to the 2 most recent.
        musicBuffers[url] = buf;
        if (!builtin) {
          _userBufKeys.push(url);
          while (_userBufKeys.length > 2) delete musicBuffers[_userBufKeys.shift()];
        }
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
    if (musicGain) musicGain.gain.value = musicVol * MUSIC_FULL;
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
    rate() { return (engSrcIdle && engSrcIdle.playbackRate) ? +engSrcIdle.playbackRate.value.toFixed(4) : 0; },
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
    debug() { return { contextState: ctx ? ctx.state : "uninitialised", samplesReady, usingSamples, engineOn, loop: engSrcIdle ? { s: +engSrcIdle.loopStart.toFixed(2), e: +engSrcIdle.loopEnd.toFixed(2) } : null }; },
  };
})();
