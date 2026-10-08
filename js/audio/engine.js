/* GameAudio: WebAudio for Apex 26 — a synthesized/sample-based engine voice and race SFX, plus a streamed-MP3 soundtrack. init() must be called from a user gestur… */
"use strict";

var GameAudio = (function () {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let limiter = null;              // DynamicsCompressor between master and the destination
  // 0..1 mixer levels, restored by the caller from storage on boot.
  let sfxVol = 1;
  let sfxEnabled = true;      // the SOUND EFFECTS switch — music is unaffected
  let isEnabled = true;

  // Engine voice (persistent while racing)
  let engA = null, engB = null, engC = null;     // saw, saw, square (synth fallback)
  let engFilter = null, engGain = null;
  let limOsc = null, limGain = null;               // rev-limiter gate (audio-thread)
  // TOP-GEAR LIMITER FADE. The chop is a SHIFT cue — at the top of gears 1-7 it
  // says "shift now", and there it never fades. In top gear there is no gear to
  // shift into: a car pinned at top speed sat on the ignition cut for the whole
  // straight and the only way to stop the hammering was to lift. So in top gear
  // the cut plays LIM_HOLD s at full depth (you still hear that you are at the
  // limit), then fades over LIM_FADE s to a steady note held at the limiter.
  // Any dip below the gate or a downshift re-arms it. Clocked off ctx time.
  const LIM_HOLD = 0.5, LIM_FADE = 0.5;
  let limSince = null;                             // ctx time the top-gear cut began, or null
  let limPitch = null;                             // the same square into the core's detune: the cut's pitch sag
  let whineOsc = null, whineGain = null;          // turbo whine
  let harvSrc = null, harvFilter = null, harvGain = null; // MGU-K harvest whirr
  let lfo = null, lfoG = null;                    // offroad pitch wobble (8 Hz)
  let skidSrc = null, skidFilter = null, skidGain = null, skidLfo = null, skidLfoGain = null;
  let voiceFormant = null;                       // per-manufacturer peaking EQ
  let ersOsc = null, ersHp = null, ersGain = null; // continuous ERS deploy whine
  let windSrc = null, windFilter = null, windGain = null; // airflow over the car
  let subOctOsc = null, subOctGain = null;        // sub-octave weight under the sample core
  let tiltEq = null;                              // rev-compensating high shelf (see setEngine)
  let gravOsc = null, gravGain = null;            // low-rev roughness: crank-rate AM into engGain.gain
  let brakeSrc = null, brakeFilter = null, brakeGain = null; // carbon-brake roar under deceleration
  let scrubSrc = null, scrubFilter = null, scrubGain = null; // front tyres scrubbing past the grip peak
  let lockFilter = null, lockGain = null;                    // locked-wheel squeal (rides scrubSrc)
  let surfSrc = null, surfFilter = null, surfGain = null;    // grass / gravel rumble off the road
  let pitLimOsc = null, pitLimGain = null;                   // pit-limiter chop: square AM into engGain.gain
  let cylCutOsc = null, cylCutGain = null;                   // ERS/part-throttle ignition-cut texture (2026 PU)
  let revFlare = 0, revFlareT = 0;                           // downshift throttle-blip overshoot (see shift)
  let carSfxLast = { scrub: 0, lock: 0, surface: 0, pitLim: 0 };   // test hook
  let pitGunFired = 0, surfSched = 0;
  let pitLimLvl = 0;                                          // 0..1 from setCarSfx; applied in setEngine

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
  // CIRCUIT REVERB. There was no ConvolverNode anywhere: every circuit sounded
  // like an anechoic chamber, so Monaco between the barriers and Spa in the
  // trees were acoustically identical. The impulse responses are GENERATED, not
  // shipped — a synthetic exponential-decay noise burst is what a reverb tail
  // is, and it costs nothing to download.
  //
  // Character comes from data the circuits already carry: `street: true` (five
  // of them — hard walls a couple of metres away) and `theme`. A Monaco tunnel
  // SWELL is not done yet: the measured bore (racing 0.449-0.524) exists only as
  // a scenery-exclusion window in js/circuits/monaco.js, in source coordinates,
  // not as an acoustic field this could read through _sceneryShift.
  const VENUES = Object.freeze({
    street: { decay: 1.9, damp: 3400, level: 0.30 },   // hard walls, close, bright
    modern: { decay: 1.5, damp: 2600, level: 0.18 },   // grandstand bowls, further off
    green:  { decay: 0.9, damp: 1500, level: 0.10 },   // trees absorb; short and dark
    desert: { decay: 1.1, damp: 2200, level: 0.09 },   // open and dry, almost nothing
  });
  let venue = VENUES.modern, venueName = "modern";
  let convolver = null, revSend = null, revReturn = null;
  const _irCache = new Map();     // keyed by venue name; ctx-bound, cleared on rebuild

  /* EVERY other pool in this tree is mobile-tiered — debris 48/16, marbles
   * 16/6, furniture 24/12, the livery atlas 1024/512/256, even MUSIC_CACHE 2/1
   * — and audio must be too: a ~1.5 s stereo ConvolverNode is among the most
   * expensive nodes WebAudio has, and it is fed the engine PLUS four rival
   * voices, each a looping BufferSource + biquad + gain + StereoPanner running
   * whether or not a rival is near enough to hear. On an iPhone already at
   * 27.6 fps the full graph starves the device into a crash that is CPU
   * contention, so it leaves no OOM strike and no context-loss marker to find.
   *
   * READ LAZILY, not at module eval: glx.js is tagged ahead of this file so GLX
   * exists, but `mobileTier` is decided at ITS init, which has not run yet.
   * startEngine() is late enough to get the real answer.
   *
   * Device, not GRAPHICS: HIGH. `mobileTier` is `IS_MOBILE && !gfxHigh`, so
   * following it would rebuild the desktop graph (convolver + 4 rivals) on a
   * phone set to HIGH — the setting people reach for when fps is already
   * bad. Audio follows the device; the renderer keeps its own HIGH path. */
  function lowPower() {
    try {
      if (typeof GLX === "undefined" || !GLX) return false;
      return !!(GLX.isMobile || GLX.mobileTier);
    } catch (_) { return false; }
  }
  // Two voices still give a LEFT and a RIGHT — the pan is what carries "someone
  // is alongside", and the nearest two are the ones a driver reacts to. Four
  // remains the desktop budget.
  const RIVAL_VOICES_DESKTOP = 4, RIVAL_VOICES_MOBILE = 2;
  let RIVAL_VOICES = RIVAL_VOICES_DESKTOP;
  // Audible radius. 70 m was chosen to bound the work, but the inverse-distance
  // law below is already inaudible well before its own edge, so the only thing
  // 70 bought was a POP: a car materialising mid-straight as it crossed the line.
  // 150 m fades in instead, and costs nothing — the four voices exist either way.
  const RIVAL_RANGE = 150;        // metres of arc beyond which a rival is inaudible
  const RIVAL_REF = 6;            // metres inside which a rival is at full level
  // Four sources sharing one buffer at one rate are one source four times as
  // loud: phase-coherent copies SUM instead of thickening. A few cents apart
  // each (and started at different points in the loop, below) is what makes
  // four cars sound like four cars. Cents -> ratio, fixed per slot.
  const RIVAL_DETUNE = Object.freeze([-22, -8, 9, 24].map((c) => Math.pow(2, c / 1200)));
  // A StereoPanner is EQUAL POWER: at pan 0 each channel gets cos(PI/4) = 0.707,
  // so a mono source routed through one is 3 dB under the same source wired
  // straight to the bus — which is exactly how the player's own engine is wired.
  // Rivals were paying that tax and nothing else was. sqrt(2) pays it back, and
  // being pan-independent it does not disturb the pan law itself.
  const PAN_MAKEUP = Math.SQRT2;
  // Peak rival level, set per CORE at startEngine. Sawtooth oscillators are far
  // hotter than the recording, which is why the player's own synth fallback runs
  // at roughly a fifth of the sample core's level (0.145 vs 0.76 at full song);
  // rivals have to pay the same discount or the fallback puts the field louder
  // than the car you are sitting in.
  let rivalPeak = 0.28;

  // CAMERA MIX. Onboard you hear the engine and your own air; from a TV camera
  // you are a spectator, so your car sits back, the field comes forward and the
  // venue's reverb opens up. Multipliers only, all 1 on the chase camera, so
  // every level measured there (tools/check/audio-test.cjs) is unchanged.
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
  let rivalVoices = [];           // { filt, gain, pan, detune, start, stop, setPitch }

  const { ENGINE_VOICES, TUNE_DEF, TUNE_RANGE, LAYER_DEF, SOUND_PROFILES } = GameAudioToneModel;
  let voice = ENGINE_VOICES["default"];
  let voiceName = "default";
  let tune = Object.assign({}, TUNE_DEF);
  let layers = Object.assign({}, LAYER_DEF);
  let profileName = "team";

  // Schedule a gain target only when it has MOVED. A muted layer converges to 0
  // once and is then free; without this, every switch turned off would still
  // cost a main-thread call plus a cross-thread timeline insertion per frame —
  // the defect the lfoG/limGain comments below describe at length. The cache
  // lives ON THE NODE so a stopEngine/startEngine pair cannot leave it stale.
  // A THRESHOLD, NOT AN IDENTITY. `=== target` looks like the same guard and is
  // not: every caller recomputes the target from continuously varying geometry,
  // so two frames essentially never produce the identical float and the guard
  // never hit while anything moved. Measured on a rival holding station beside
  // you over 60 s at 60 Hz: 3600 setTargetAtTime calls before, 1 after. Each is
  // a main-thread call plus a locked cross-thread timeline insertion on the
  // audio render thread. 1e-4 is ~-80 dBFS — inaudible, well under the 0.06-0.12 s
  // time constants, and the same shape the pitch guards beside it already use
  // (0.002 on rate, 0.5 Hz on frequency). An EXACT target still passes, so a
  // hard 0 still mutes exactly.
  function aimGain(node, target, t, tau) {
    if (!node) return;
    const prev = node._apexAimTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) < 1e-4)) return;
    node.gain.setTargetAtTime(target, t, tau);
    node._apexAimTgt = target;
  }
  // The same guard for a PITCH or CUTOFF param, RELATIVE to the target: setEngine
  // re-aimed eight of these on every call (each a cross-thread timeline
  // insertion) though a car at steady revs hands the identical value back.
  // rel 1e-4 is ~0.17 cents on a pitch and 0.01% on a cutoff — far under any
  // audible step — and a param restarts clean (a fresh node carries no cache).
  function aimParam(p, target, t, tau, rel) {
    const prev = p._apexAimTgt;
    if (prev === target || (prev !== undefined && Math.abs(prev - target) <= Math.abs(target) * rel)) return;
    p.setTargetAtTime(target, t, tau);
    p._apexAimTgt = target;
  }
  let engineOn = false;
  // Node batches from stopEngine() that still sit on sfxBus until their
  // 0.35 s fade ends — ONE ENTRY PER STOP. A resume that starts a new graph
  // BEFORE that timeout would leave both graphs rendering (~450 ms of doubled
  // CPU, stacked on every pause/hide), so startEngine() buries them first.
  let _dying = [];
  function killNodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      try { const n = nodes[i]; if (n && n.disconnect) n.disconnect(); } catch (e) { /* torn down */ }
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
    // EACH BATCH OWNS ITS TIMER. One shared 450 ms timeout flushed the whole
    // list, so a second stopEngine() inside that window had its 0.35 s fades
    // disconnected early — an abrupt cut instead of a fade.
    setTimeout(() => {
      const i = _dying.indexOf(batch);
      if (i < 0) return;             // already buried by flushDying()
      _dying.splice(i, 1);
      killNodes(batch);
    }, 450);
  }
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0, harvBrakeLevel = 0, harvCoastLevel = 0;
  let shiftDuck = 0, shiftDuckT = 0;   // transient engine-gain dip from a gear shift
  let overrunT = 0;                    // when the next overrun crackle is due
  let overrunFired = 0;                // crackles emitted this session (test hook)
  let pullT = 0;                       // seconds the engine has been under load (wastegate arming)
  let wasteFired = 0;                  // wastegate dumps emitted this session (test hook)
  let shiftFired = 0, shiftPeak = 0;   // gear-shift cracks emitted, and the last one's level (test hook)
  let boostFired = 0, boostPeak = 0;   // deploy whooshes emitted, and the last one's level (test hook)
  let idleGainRamped = false;          // the sample voice's one-time fade-in (see setEngine)
  let rateFresh = false;               // true until the first setEngine after a sample-voice start
  let lastGearSeen = NaN;              // gear handed to the previous setEngine (skip-shift snap)
  let cueT = 0, cueFired = 0, cueU = 0; // braking-cue: next blip due, blips emitted, live urgency

  let engBuf = null, samplesReady = false;
  // engBuf is ONLY the loop window (loopWindow below); engLoop is its loop in
  // engBuf's own seconds, engWin where that window sat in the recording (debug).
  let engLoop = null, engWin = null;
  let lastRate = 0;               // the ratio setEngine last asked for (see rate())
  // The source recording's dominant period, measured once at decode. It was the
  // grain stride of a granular (PSOLA) pitching core that has since been
  // removed — it shipped sounding like loud noise, and the flatness measurement
  // in docs/DEBUG-HOOKS.md records why the idea does not survive this asset.
  // The SUB-OCTAVE layer still needs it to know the engine's own fundamental.
  let enginePeriod = 0;

  let engSrcIdle = null, engGainIdle = null;
  let usingSamples = false;
  let dbgAnalyser = null;          // taps the engine output so tests can measure pitch
  const SFX_ENGINE = "assets/sfx/f1_engine.mp3";   // sustained F1 drone (primary)

  let listenersAttached = false;
  let rebuildTries = 0;
  let lastFailedResume = 0;
  let deviceRebuildTimer = null;
  let deviceRebuildPending = false;
  let deviceRebuildBusy = false;
  let ctxSampleRate = 0;
  const DEVICE_REBUILD_DEBOUNCE_MS = 280;
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

  // These services are functions so a rebuild never leaves a module holding the old context.
  const signal = GameAudioSignal.create({ context: () => ctx, bus: () => sfxBus, sfxOk, now });
  const { env, blip, noiseBuf, loopNoise, noisePool, bindNoise, noise, hiss, scrapeNoise } = signal;
  const { detectPeriod, findStableLoop } = GameAudioSignal;
  const soundtrack = GameAudioSoundtrack.create({
    context: () => ctx, master: () => master, enabled, engineRunning: () => engineOn,
    sfxOk, clamp01, now, resumeRejected,
  });
  const { startMusic, stopMusic, setMusicEnabled, skipTrack, prevTrack, trackName, tracks, addTracks, removeTrack, playTrackId, currentTrackId, setMusicBackend, musicBackend, setMusicSource, musicSource, sourceCounts, setMusicVolume, setRadioDuck: soundtrackRadioDuck } = soundtrack;
  /* TWO HOLDS, ONE DUCK. The engineer (radio-voice.js) and the spotter
   * (radioVoice clips) each latch independently: say()/stopVoice always pairs
   * setRadioDuck(false) on a card replace, and that must not lift the music
   * under a spotter call still finishing its remaining() lead — nor the reverse
   * when a spotter clip ends while an engineer line is still on air. */
  let radioDuckHold = false;
  let spotterDuckHold = false;
  function applyMusicDuck() {
    return soundtrackRadioDuck(radioDuckHold || spotterDuckHold);
  }
  function setRadioDuck(on) {
    radioDuckHold = !!on;
    return applyMusicDuck();
  }
  function setSpotterDuck(on) {
    spotterDuckHold = !!on;
    return applyMusicDuck();
  }
  const radio = GameAudioRadioFx.create({
    context: () => ctx, master: () => master, bus: () => sfxBus, enabled, sfxOk, now,
    setSpotterDuck,
  }, signal);
  const { decodeClip, radioVoice, radioSting, radioStingStop, setRadioFx } = radio;
  let ctxGen = 0;

  function createCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    applySessionType();

    ctx = new AC();
    signal.resetContext();
    ctxGen++;   // buffers decoded on the old context are stale (js/audio/voice-pack.js)
    // iOS drops a VISIBLE page to "interrupted" for an alarm or Siri; a gamepad
    // player never makes the gesture the listeners below wait for. Our own
    // suspend() only runs while hidden, so a visible stop is never ours.
    ctxSampleRate = ctx.sampleRate;
    ctx.onstatechange = () => {
      if (deviceRebuildBusy || !ctx) return;
      // "interrupted" is iOS taking the audio session — a call answered from the
      // compact banner keeps Safari VISIBLE, so nothing else tells the game
      // (support.apple.com/guide/iphone/answer-or-decline-incoming-calls-iph3c9947bf/ios).
      if (ctx.state === "closed") return;
      if (ctx.state === "interrupted" && _onInterrupted) { try { _onInterrupted(); } catch (_) { /* a listener must not stop the resume below */ } }
      if (ctx.state === "running" && ctxSampleRate && ctx.sampleRate !== ctxSampleRate) {
        scheduleOutputDeviceRebuild("sampleRate");
      }
      if (ctx.state === "running") ctxSampleRate = ctx.sampleRate;
      if (!document.hidden && (ctx.state === "interrupted" || ctx.state === "suspended")) {
        scheduleOutputDeviceRebuild("state-" + ctx.state);
      }
      if (ctx.state !== "running" && ctx.state !== "closed" && !document.hidden) resumeIfNeeded();
    };
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
    if (ctx.state !== "running" && !document.hidden) { const p = ctx.resume(); if (p && p.catch) p.catch(resumeRejected("create")); }
    loadEngineSamples();
    return true;
  }

  // "No sound" is the case a player reports, so the first rejected resume() is a
  // warn with its reason; every gesture retries, so repeats drop to debug.
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
    // A 404 body is an HTML page, and decodeAudioData on it rejects with an
    // opaque EncodingError; throw on !ok so the degrade path below logs WHY.
    const grab = (url) => fetch(url)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " for " + url); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
    // ONE sample. f1_rev.mp3 stays on disk and nothing loads it: the
    // rev-crossfade measures DARKER under load (see the note in the tick), and
    // an inaudible layer fetched inside the Promise.all that gates
    // `usingSamples` would let a 404 or a corrupt byte in it drop every player
    // to the oscillator fallback.
    grab(SFX_ENGINE)
      .then((e) => {
        enginePeriod = detectPeriod(e);   // on the full recording, as before
        const w = loopWindow(e);          // the scan runs here, never on a race frame
        engBuf = w.buf; engLoop = w.loop; engWin = w.win; samplesReady = true;
        Log.debug("audio", "engine sample decoded, period=" + enginePeriod + ", kept " + engLoop.end.toFixed(2) + " of " + e.duration.toFixed(2) + " s");
      })
      .catch((err) => {
        Log.warn("audio", "engine sample load/decode failed, using synth voice: " + ((err && err.message) || err));
      });

  }


  // ONLY THE LOOP WINDOW IS EVER PLAYED (perf-memory M-5a): every engine source
  // (idle voice, rivals) starts inside findStableLoop's ~2 s window and loops
  // over it, so the other ~28 s of the ~30 s decode (11.6 MB of PCM at 48 kHz
  // stereo) was dead weight. Detect on the full buffer, keep a copy of just the
  // window (~0.8 MB): loopStart 0, loopEnd its duration, same samples.
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
    if (!ctx || document.hidden || deviceRebuildBusy) return;
    if (deviceRebuildTimer) clearTimeout(deviceRebuildTimer);
    deviceRebuildTimer = setTimeout(() => {
      deviceRebuildTimer = null;
      requestOutputDeviceRebuild(why);
    }, DEVICE_REBUILD_DEBOUNCE_MS);
  }

  function requestOutputDeviceRebuild(why) {
    if (!ctx || document.hidden || deviceRebuildBusy) return;
    if (!stickyUserActivation()) {
      deviceRebuildPending = true;
      Log.debug("audio", "output-device rebuild deferred (" + why + ") until the next gesture");
      return;
    }
    performOutputDeviceRebuild(why);
  }

  function performOutputDeviceRebuild(why) {
    if (!ctx || document.hidden || deviceRebuildBusy) return;
    deviceRebuildPending = false;
    deviceRebuildBusy = true;
    Log.info("audio", "rebuilding AudioContext after " + why);
    try { rebuildCtx(); } finally { deviceRebuildBusy = false; }
  }

  function onMediaDeviceChange() {
    scheduleOutputDeviceRebuild("devicechange");
  }

  function attachOutputDeviceListeners() {
    try {
      const md = typeof navigator !== "undefined" && navigator.mediaDevices;
      if (!md || typeof md.addEventListener !== "function") return;
      md.addEventListener("devicechange", onMediaDeviceChange);
    } catch (e) { /* absent in game-vm and some WebViews */ }
  }

  function reapplyContextState() {
    if (!ctx) return;
    applyTuneNodes();
    applyVenue();
    applyMusicDuck();
    setSfxEnabled(sfxEnabled);
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
      attachOutputDeviceListeners();
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
    if (isGesture && deviceRebuildPending) {
      deviceRebuildPending = false;
      performOutputDeviceRebuild("deferred-gesture");
      return;
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
        // RESOLVED IS NOT RUNNING. WebKit resolves resume() on a context still
        // "interrupted" (a call, Siri, an alarm — webkit LayoutTests
        // audiocontext-state-interrupted.html; web-audio-api#2585): clearing
        // lastFailedResume here meant the next tap never reached rebuildCtx and
        // the game stayed silent until a reload.
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
    if (soundtrack.isPlaying()) stopMusic();
    engineOn = false;               // old nodes died with the old context
    // A TRY/CATCH CANNOT SWALLOW A REJECTION, and close() returns a Promise.
    // The "already closed" this catch was written for is exactly the case the
    // spec makes REJECT (InvalidStateError), not throw — and index.html's
    // `unhandledrejection` handler paints a full-screen overlay over the race
    // on any rejection that reaches it. Worse, this is the one path where it is
    // LIKELY: rebuildCtx() is only ever reached after a resume already failed,
    // i.e. with the context in exactly the state close() refuses. Same shape as
    // the resume() sites below, which chain .catch.
    try {
      const dying = ctx;
      if (dying) dying.onstatechange = null;
      const p = dying && dying.close();
      if (p && p.catch) p.catch((e) => { Log.debug("audio", "old context close rejected on rebuild:", e && e.message); });
    } catch (e) { /* already closed */ }
    ctx = null;
    master = null;
    sfxBus = null;
    limiter = null;
    rainStopping = false;
    rainPending = null;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    soundtrack.resetContext();
    engBuf = engLoop = engWin = null; samplesReady = false; // ctx-bound; reload for new ctx
    _irCache.clear();                                       // AudioBuffers are ctx-bound too
    radio.resetContext();
    // Old radioVoice onended/stop never fire on a closed context — drop both
    // holds so a mid-clip rebuild cannot leave the music stuck under a ghost.
    radioDuckHold = false;
    spotterDuckHold = false;
    signal.resetContext();
    dbgAnalyser = null;    // ctx-bound; stopEngine() nulls it but this path inlines its own
                            // teardown, so without this a stale analyser on the closed ctx would
                            // survive and centroidHz() would read a dead node (latent: only
                            // tests/tools call centroidHz() today, not the game loop)
    if (!createCtx()) return;
    reapplyContextState();
    if (wasMusic) startMusic(wasTrack);
    if (wasEngine) startEngine();
    if (rainWanted) startRain();
  }

  function onVisibility() {
    if (document.hidden) {
      resumeMusic = soundtrack.isPlaying();
      resumeEngine = engineOn;
      resumeRain = rainWanted;
      soundtrack.suspendMusic();
      if (engineOn) stopEngine();
      if (rainWanted) stopRain(true);
      // SUSPEND THE CONTEXT, not only its sources. Stopping the nodes leaves
      // master, the DynamicsCompressor, sfxBus, tiltEq, the voice formant and
      // the whole rival voice bank wired up, and an AudioContext in `running`
      // keeps its render thread going at 128 frames a quantum with the audio
      // hardware unit powered — on a backgrounded iOS tab that is a battery and
      // eviction trigger, and `grep "\.suspend("` over js/ found NOTHING.
      //
      // The file already knows the platform half of this: it handles iOS
      // suspending the context on lock and never resuming it by itself. It just
      // never did so deliberately. resumeIfNeeded() in the else branch below is
      // already the matching resume, so this needs no new machinery.
      //
      // The stops above are still right: they are what makes the resume a clean
      // restart rather than a graph re-entering mid-note.
      // suspend() returns a Promise, so the catch below sees only a synchronous
      // throw. The `state === "running"` read cannot close the race it looks
      // like it closes — iOS interrupts or closes the context on lock, which is
      // precisely when this branch runs — and a rejection here reaches
      // index.html's unhandledrejection overlay. Swallow both forms.
      try {
        if (ctx && ctx.state === "running" && ctx.suspend) {
          const p = ctx.suspend(); if (p && p.catch) p.catch((e) => { Log.debug("audio", "context suspend on hide rejected:", e && e.message); });
        }
      } catch (_) { /* a context mid-teardown must not break the hide path */ }
    } else {
      resumeIfNeeded();
      if (resumeMusic) startMusic(soundtrack.lastTrack()); // restarts re-synced to the clock
      if (resumeEngine) startEngine();
      if (resumeRain) startRain();
      resumeMusic = resumeEngine = resumeRain = false;
    }
  }

  // A LEVEL CHANGE IS A GLIDE, NOT A STEP. A `.value =` write is a step in the
  // middle of whatever waveform is playing — an audible click on the mute
  // button, a zipper on a dragged volume slider. setTargetAtTime approaches the
  // target exponentially, 63 % per time constant and ~95 % after three
  // (https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime),
  // so tau 0.02 s settles in ~60 ms: instant to a hand, smooth to an ear.
  // cancelScheduledValues first, so a glide still in flight cannot pull the
  // level back toward an older target.
  const LEVEL_TAU = 0.02;
  function glideLevel(param, v) {
    if (!param || !ctx) return;
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(v, t, LEVEL_TAU);
  }

  function setEnabled(b) {
    isEnabled = !!b;
    if (master) glideLevel(master.gain, isEnabled ? 0.8 : 0);
  }

  function enabled() {
    return isEnabled;
  }

  function sfxOk() {
    return !!ctx && isEnabled && sfxEnabled;
  }

  // THE PITCH CURVE IS A FUNCTION OF RPM ALONE. playbackRate = (IDLE + rev*SPAN)
  // x the trims. There was a per-gear multiplier on top (LOW_GEAR_RATE 0.60 /
  // 0.72 / 0.84 for gears 1-3): the same 15 000 rpm limiter sat 884 cents lower
  // in 1st than in 4th, and the 3->4 upshift dropped LESS than 4->5 (-369 vs
  // -603 cents) because the multiplier jumped to 1 there. Without it an upshift
  // drops by the rpm step alone, which shrinks up the box as the ratios close
  // (game.js rpmFor, PhysicsConsts.GEAR_TOP). The base was retuned so the RANGE
  // barely moved: SPAN puts the shipped voice's limiter (pitch 0.85, rev range
  // 1.3) exactly where top gear's was — (0.17 + 0.5115*1.3)*0.85 = 0.7097, as
  // (0.25 + 0.45*1.3)*0.85 was — and IDLE sits between the old 1st-gear idle
  // (0.25*0.6) and the old 4th+ idle (0.25). Not lower: at the tuner's corner
  // (IDLE 0.5 x PITCH 0.6) the rate must stay over 0.05, which the old 1st gear
  // already broke (0.045) where no check looked.
  const RATE_IDLE = 0.17, RATE_SPAN = 0.5115;
  // Absolute playbackRate jump that is a gear discontinuity, not a rev climb.
  // A 1→3 skip at ~16 m/s moves ~0.13 → ~0.54; the 0.035 s setTargetAtTime
  // tau held the idle rate across the shift frame and took 0.10–0.15 s to
  // catch up. Below this, smooth; at or above, snap.
  const RATE_SNAP_JUMP = 0.08;
  function snapParam(p, target, t) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(target, t);
    p._apexAimTgt = target;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function startEngineBody() {
    flushDying();   // kill the fading previous graph before building another
    if (sfxOk()) noisePool();   // existing one-shot buffer, prepared before green

    // shared lowpass + master gain for the engine core (samples or synth).
    // The per-manufacturer voice inserts one peaking EQ (its formant) between
    // the lowpass and the gain when the voice asks for one.
    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    // Rev-limiter gate (see setEngine): a 13 Hz square into engGain.gain.
    // 13 Hz is the stock rate at limRate 1 — FOLD THE TRIM IN HERE, like the
    // detune and sub folds beside it. setVoice() applies limRate "once per tune
    // change, not per frame" (see its setTargetAtTime), and it runs BEFORE this
    // oscillator exists, so a fresh engine chopped at a flat 13 Hz until the
    // next voice change: LIM RATE did nothing, and the V10 profile's 1.30 was
    // inaudible on the car you actually started the race in.
    limOsc = ctx.createOscillator(); limOsc.type = "square";
    limOsc.frequency.value = 13 * (tune.limRate != null ? tune.limRate : 1);
    limGain = ctx.createGain(); limGain.gain.value = 0;
    limOsc.connect(limGain).connect(engGain.gain);
    // The cut's PITCH SAG: the same square, in cents, into the core's detune —
    // wired to the sources further down, where they exist (beside the offroad
    // LFO, which does exactly this with a sine). Depth is limCents in setEngine.
    limPitch = ctx.createGain(); limPitch.gain.value = 0;
    limOsc.connect(limPitch);
    limOsc.start();
    // GRAVEL. The recording is a steady drone, and pitching it down for idle
    // gives a LOWER drone, not a lumpier one — every cycle is the same as the
    // last, which is what the "too clean at idle" complaint is. Real
    // roughness is amplitude modulation at the crank rate: the note wobbles
    // once per revolution as cylinders fire unevenly, and at idle that lands
    // in the 20-100 Hz band the ear reads as grit rather than as a tone. Same
    // wiring as the rev limiter — a sine into engGain.gain on the audio
    // thread, so the modulation costs no per-frame scheduling — with its rate
    // tracking the engine's fundamental (setEngine) and its depth fading with
    // rev, because a screaming F1 top end is smooth.
    gravOsc = ctx.createOscillator(); gravOsc.type = "sine"; gravOsc.frequency.value = 40;
    gravGain = ctx.createGain(); gravGain.gain.value = 0;
    gravOsc.connect(gravGain).connect(engGain.gain);
    gravOsc.start();
    // PIT LIMITER. The same audio-thread trick: an 11 Hz square into
    // engGain.gain is the stutter of a car held at the lane's speed limit, its
    // depth set by setCarSfx({ pitLim }) and 0 everywhere else.
    pitLimOsc = ctx.createOscillator(); pitLimOsc.type = "square"; pitLimOsc.frequency.value = 11;
    pitLimGain = ctx.createGain(); pitLimGain.gain.value = 0;
    pitLimOsc.connect(pitLimGain).connect(engGain.gain);
    pitLimOsc.start();
    // Hybrid harvest clip / part-throttle ICE: a faster, shallower chop than the
    // rev limiter — full pack regen and trailing-throttle harvest, not redline.
    cylCutOsc = ctx.createOscillator(); cylCutOsc.type = "square"; cylCutOsc.frequency.value = 24;
    cylCutGain = ctx.createGain(); cylCutGain.gain.value = 0;
    cylCutOsc.connect(cylCutGain).connect(engGain.gain);
    cylCutOsc.start();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;

    // REV TILT. playbackRate is tape speed: pitching the recording down to 0.25x
    // for idle drags the whole spectrum with it, and the centroid measurably
    // collapses 1526 -> 798 Hz across the rev range. That is the "muffled at low
    // revs" complaint, and it is real.
    //
    // The granular core tried to fix the CAUSE by not moving the formants, and
    // sounded like noise. This fixes the SYMPTOM instead: a high shelf that
    // lifts as the ratio falls, putting back roughly the top end resampling took
    // away. It is not physically honest — the resonances are still sliding — but
    // it moves no phase, so it cannot manufacture the broadband mush that
    // approach did, and the flatness measurement says so.
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
      engFilter.connect(voiceFormant).connect(tiltEq).connect(engGain).connect(sfxBus);
    } else {
      voiceFormant = null;
      engFilter.connect(tiltEq).connect(engGain).connect(sfxBus);
    }

    // The debug analyser tap is created LAZILY in centroidHz() — a 16384-fft
    // AnalyserNode copying every render quantum was shipping in every race for
    // a hook whose only caller is a test (audio-smoke's expect.poll absorbs
    // the first-read warm-up).

    usingSamples = !!(samplesReady && engBuf);
    engA = engB = engC = null;
    engSrcIdle = engGainIdle = null;
    idleGainRamped = false;   // new gain node, so the fade-in must happen again
    rateFresh = false;
    if (usingSamples) {
      engSrcIdle = ctx.createBufferSource(); engSrcIdle.buffer = engBuf; engSrcIdle.loop = true;
      // Voice detune is a base offset in cents; the offroad LFO adds on top.
      // The player's detune trim must be folded in HERE too, not only in
      // applyTuneNodes: game.js calls setVoice() before startEngine(), when
      // these sources do not exist yet, so a start that read voice.detune alone
      // would run on the bare manufacturer value until the next slider move.
      engSrcIdle.detune.value = sampleDetuneCents();
      // BufferSource.playbackRate defaults to 1.0. Starting the loop at that
      // and then aiming toward the real rate (~0.14–0.71) with setTargetAtTime
      // is an audible pitch spike the moment engGainIdle opens — measured at
      // lights-out as rate 0.937 before settling near 0.61. Seed the rate from
      // the last known ask (sample→sample restart / mid-race upgrade) or from
      // the stock idle end so the first audible frame is already in-family.
      const seedRate = lastRate > 0.02
        ? lastRate
        : RATE_IDLE * tune.idle * voice.rateTrim * tune.pitch;
      engSrcIdle.playbackRate.value = seedRate;
      engSrcIdle.playbackRate._apexAimTgt = seedRate;
      engSrcIdle.loopStart = engLoop.start; engSrcIdle.loopEnd = engLoop.end;
      // Mid-race upgrade (synth→samples, or a stop/start while lastRate is
      // live): keep the voice open. A cold start still fades in from 0 so the
      // note does not slam in with the lights.
      engGainIdle = ctx.createGain();
      if (lastRate > 0.02) { engGainIdle.gain.value = 0.9; idleGainRamped = true; }
      else engGainIdle.gain.value = 0;
      engSrcIdle.connect(engGainIdle).connect(engFilter);
      rateFresh = true;   // first setEngine snaps to the live rate (no ramp from seed)
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
    // measured off the recording at decode (detectPeriod).
    // Only built for the sample core — the synth already has engC,
    // and running both would double it.
    if (usingSamples) {
      subOctOsc = ctx.createOscillator();
      subOctGain = ctx.createGain();
      subOctOsc.type = "sine";
      subOctOsc.frequency.value = 60;
      subOctGain.gain.value = 0;
      subOctOsc.connect(subOctGain).connect(sfxBus);
    }

    // REVERB SEND. Fed from the engine output and the rival voices, returned to
    // sfxBus. Deliberately NOT fed FROM sfxBus: that is the same node the return
    // lands on, and the cycle would howl.
    //
    // NOT ON A PHONE. Convolution is the single most expensive thing this file
    // asks for, it runs every frame of every race, and a circuit's acoustics are
    // the most disposable thing in the mix — you lose a sense of the space and
    // keep the car. The SPACE switch still reads and reports OFF (venue() sees a
    // null return), so nothing lies about what is running.
    if (ctx.createConvolver && !lowPower()) {
      convolver = ctx.createConvolver();
      revSend = ctx.createGain(); revSend.gain.value = 1;
      revReturn = ctx.createGain(); revReturn.gain.value = 0;
      revSend.connect(convolver).connect(revReturn).connect(sfxBus);
      engGain.connect(revSend);
      applyVenue();
    }

    // Rival voices. Cheap on purpose — one looping source through a lowpass,
    // a gain and a panner each. They share engBuf with the player's own voice,
    // so they cost no extra fetch, decode or memory.
    // Rival voices, on WHICHEVER core is running, not only `if (usingSamples)`:
    // the one situation where you most need to know a car is beside you — the
    // recording failed to load and the whole mix is the fallback — must not be
    // the one where the field goes silent. Every layer degrades to the synth.
    //
    // The tail (lowpass -> gain -> panner -> bus, plus the reverb send) is the
    // same either way; only the HEAD and how you pitch it differ, so each voice
    // carries its own start/stop/setPitch and setRivals never asks which core
    // it is talking to. The closures are built once here, not per frame.
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
        filt.connect(gain).connect(pan).connect(sfxBus);
        if (revSend) pan.connect(revSend);   // a rival in a tunnel echoes too
        const v = { filt, gain, pan, detune: RIVAL_DETUNE[i % RIVAL_DETUNE.length],
                    src: null, oscs: null, start: null, stop: null, setPitch: null };
        if (usingSamples) {
          const src = ctx.createBufferSource();
          src.buffer = engBuf; src.loop = true;
          const li = engLoop;
          src.loopStart = li.start; src.loopEnd = li.end;
          src.playbackRate.value = 0.4;
          src.connect(filt);
          // Start each voice a different fraction of the way into the loop, so
          // the four are decorrelated from the first sample rather than drifting
          // apart over seconds as their detune ratios do the work alone.
          const off = li.start + (li.end - li.start) * (i / RIVAL_VOICES);
          v.src = src;
          v.start = () => src.start(0, off);
          v.stop = (t) => src.stop(t);
          v.setPitch = (t, rev01, mul) => {
            const rate = (0.25 + rev01 * 0.45) * mul;
            if (Math.abs((src.playbackRate._apexRate ?? -1) - rate) > 0.002) {
              src.playbackRate.setTargetAtTime(rate, t, 0.06);
              src.playbackRate._apexRate = rate;
            }
          };
        } else {
          // Two saws a hair apart — the same shape the player's own fallback
          // uses, and the cheapest thing that is not a buzz.
          const a = ctx.createOscillator(), b = ctx.createOscillator();
          a.type = "sawtooth"; b.type = "sawtooth";
          a.frequency.value = 160; b.frequency.value = 160;
          b.detune.value = 14;                 // ~1.008x, the fallback's spread
          a.connect(filt); b.connect(filt);
          v.oscs = [a, b];
          v.start = () => { a.start(); b.start(); };
          v.stop = (t) => { a.stop(t); b.stop(t); };
          v.setPitch = (t, rev01, mul) => {
            // There is no gear to read for someone else's car, so the module's
            // own unknown-gear defaults stand in (95 Hz idle, 700 Hz span) —
            // which is exactly what they are there for.
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

    // turbo whine: faint high sine riding above the core
    whineOsc = ctx.createOscillator();
    whineGain = ctx.createGain();
    whineOsc.type = "sine";
    whineOsc.frequency.value = 1500;
    whineGain.gain.value = 0;
    whineOsc.connect(whineGain).connect(sfxBus);

    // MGU-K harvest whirr: resonant noise, gated in by deceleration
    harvSrc = ctx.createBufferSource();
    harvSrc.buffer = loopNoise("harvest", 0.7);
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

    // tire screech: looped noise through a bandpass, silent until setSkid
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
    // ~4.8 Hz centre wobble (sin(30*t)) on the audio thread — setSkid used to
    // re-aim the bandpass every frame when |Δf| >= 1 (~60/s while sliding).
    skidLfo = ctx.createOscillator();
    skidLfo.type = "sine";
    skidLfo.frequency.value = 30 / (2 * Math.PI);
    skidLfoGain = ctx.createGain();
    skidLfoGain.gain.value = 0;
    skidLfo.connect(skidLfoGain).connect(skidFilter.frequency);

    // CAR SFX (setCarSfx): scrub and lock-up share one noise loop through two
    // filters — a low, broad scrub for fronts sliding past their peak and a
    // narrow, high squeal for a locked wheel. The surface rumble is its own
    // low-passed loop. All silent until setCarSfx drives them.
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

    // AIRFLOW. The only speed-coupled continuous sounds were the engine and
    // the skid, so a 320 km/h straight sounded like a 120 km/h one with a
    // higher engine note. Broadband noise through a bandpass that opens with
    // speed: own buffer, because a LOOPING source needs one (the shared
    // noisePool is for one-shots — see its comment).
    windSrc = ctx.createBufferSource();
    windSrc.buffer = loopNoise("wind", 0.5);
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.7;                 // wide: air, not a whistle
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(sfxBus);

    // BRAKES. Braking had a load term on the engine (brakeLoad, a filter lift)
    // and a beep for the assist, and no sound of its own — a 5 g stop from
    // 300 km/h was the engine note falling and nothing else. Carbon discs
    // under load roar: broadband, low-mid, rising with how hard the pedal is
    // in. Looped noise through a bandpass that gain-follows deceleration
    // (setEngine's brakeFrac), own buffer because it loops.
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
    ersOsc.start();
    lfo.start();
    skidLfo.start();
    skidSrc.start();
    scrubSrc.start();
    surfSrc.start();
    windSrc.start();
    brakeSrc.start();

    lastSpeed = 0;
    lastEngT = 0;
    harvLevel = 0; harvBrakeLevel = 0; harvCoastLevel = 0;
    shiftDuck = 0;
    shiftDuckT = 0;
    pullT = 0;
    overrunT = 0;   // an AudioContext stamp: a rebuilt ctx restarts near 0, and a
                    // stale future value both silences the crackle and blocks its re-arm
  }
  // THE FLAG GATES ITS OWN TEARDOWN, so it cannot be the LAST thing the build
  // sets. startEngine() creates and start()s ~ten nodes; stopEngine() opens with
  // `if (!engineOn) return;`. A throw partway (createOscillator on a context the
  // browser closed under us — the guard above checks `ctx` exists, not its
  // state) left every node created so far connected and audible with the flag
  // still false: stopEngine() no-opped against them forever, and the NEXT
  // startEngine() saw false and built a second full set over the module-scope
  // references, losing the only handle on the first. The drone compounded once
  // per menu-race cycle. Arming first and tearing down on the way out makes a
  // partial build cost silence instead of a permanent one.
  function startEngine() {
    if (!ctx || engineOn) return;
    engineOn = true;
    try { startEngineBody(); }
    // ...and the flag comes back down even if the teardown ITSELF throws on the
    // half-built graph (stopEngine touches engGain/whineGain, either of which
    // the throw may have pre-empted). Leaving it up would trade a compounding
    // drone for permanent silence, because every later startEngine() would
    // early-return on it; down, the next one is free to retry.
    catch (e) { try { stopEngine(); } catch (_) { /* teardown of a half-graph */ } engineOn = false; throw e; }
  }

  function stopEngine() {
    if (!engineOn) return;
    const t0 = now();
    soundtrack.releaseEngineDuck(t0, true);   // a line still on air keeps its own duck
    // Every node is guarded: startEngine's catch calls this on a HALF-built
    // graph, and one throw here skipped the stopAt()s below, leaking every
    // oscillator already started.
    if (engGain) { engGain.gain.cancelScheduledValues(t0); engGain.gain.setTargetAtTime(0, t0, 0.06); }
    if (whineGain) whineGain.gain.setTargetAtTime(0, t0, 0.06);
    if (harvGain) harvGain.gain.setTargetAtTime(0, t0, 0.06);
    if (ersGain) ersGain.gain.setTargetAtTime(0, t0, 0.04);
    if (windGain) windGain.gain.setTargetAtTime(0, t0, 0.06);
    if (skidGain) skidGain.gain.setTargetAtTime(0, t0, 0.04);
    if (scrubGain) scrubGain.gain.setTargetAtTime(0, t0, 0.04);
    if (lockGain) lockGain.gain.setTargetAtTime(0, t0, 0.04);
    if (surfGain) surfGain.gain.setTargetAtTime(0, t0, 0.06);
    if (brakeGain) brakeGain.gain.setTargetAtTime(0, t0, 0.06);
    const stopAt = (n, t) => { try { if (n) n.stop(t); } catch (e) { /* already stopped */ } };
    if (usingSamples) {
      if (engGainIdle) engGainIdle.gain.setTargetAtTime(0, t0, 0.06);

      stopAt(engSrcIdle, t0 + 0.35);

    } else {
      stopAt(engA, t0 + 0.35); stopAt(engB, t0 + 0.35); stopAt(engC, t0 + 0.35);
    }
    const deadIdleGain = engGainIdle;                  // disconnected with `dead` below
    engSrcIdle = engGainIdle = null;
    if (limGain) limGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadLimGain = limGain;                       // disconnected with `dead` below
    if (limPitch) limPitch.gain.setTargetAtTime(0, t0, 0.02);
    const deadLimPitch = limPitch;                     // feeds a param too: buried by name
    if (limOsc) { stopAt(limOsc, t0 + 0.35); limOsc = null; limGain = null; limPitch = null; }
    // Same shape as limGain: gravGain feeds an AudioParam, so it is invisible
    // to a graph walk and has to be buried by name.
    if (gravGain) gravGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadGravGain = gravGain;
    if (gravOsc) { stopAt(gravOsc, t0 + 0.35); gravOsc = null; gravGain = null; }
    if (pitLimGain) pitLimGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadPitLim = pitLimGain;                     // feeds a param: buried by name
    if (pitLimOsc) { stopAt(pitLimOsc, t0 + 0.35); pitLimOsc = null; pitLimGain = null; }
    if (cylCutGain) cylCutGain.gain.setTargetAtTime(0, t0, 0.02);
    const deadCylCut = cylCutGain;
    if (cylCutOsc) { stopAt(cylCutOsc, t0 + 0.35); cylCutOsc = null; cylCutGain = null; }
    stopAt(scrubSrc, t0 + 0.35);
    stopAt(surfSrc, t0 + 0.35);
    scrubSrc = surfSrc = null;
    stopAt(brakeSrc, t0 + 0.35);
    stopAt(whineOsc, t0 + 0.35);
    stopAt(subOctOsc, t0 + 0.35);
    for (const v of rivalVoices) { try { v.gain.gain.setTargetAtTime(0, t0, 0.06); v.stop(t0 + 0.35); } catch (e) { /* already stopped */ } }
    stopAt(harvSrc, t0 + 0.35);
    stopAt(ersOsc, t0 + 0.35);
    stopAt(windSrc, t0 + 0.35);
    stopAt(lfo, t0 + 0.35);
    stopAt(skidSrc, t0 + 0.35);
    const deadSub = (engC && engC._apexSubGain) || null;   // synth sub-osc gain
    engA = engB = engC = null;
    whineOsc = null;
    harvSrc = null;
    ersOsc = null;
    windSrc = null;
    brakeSrc = null;
    lfo = null;
    skidSrc = null;
    // Disconnect the test analyser tap so it doesn't accumulate across restarts.
    if (dbgAnalyser) { try { dbgAnalyser.disconnect(); } catch (e) { /* torn down already */ } dbgAnalyser = null; }
    // Tear the whole faded chain out of the graph once the 0.35 s source stops
    // complete: stopped sources GC on their own, but Gain/Biquad nodes routed
    // into sfxBus keep RENDERING until disconnect() (Web Audio contract) — a
    // tab-hide/show cycle would strand ~8 nodes each time, forever.
    // engGainIdle and limGain (deadIdleGain / deadLimGain) must be
    // DISCONNECTED, not just NULLED, or every pause/resume cycle strands two
    // GainNodes that keep RENDERING (measured with a fake context that drops a
    // node only on disconnect(): +2 non-source nodes per cycle on the sample
    // core). setPaused() in js/game.js stops the engine on pause and starts it
    // on resume, so a long session would pay it again and again. limGain feeds engGain.gain — an
    // AudioParam, not a node — which is why it is invisible when you read the
    // graph for outputs.
    const dead = [engFilter, engGain, tiltEq, whineGain, harvFilter, harvGain, skidFilter, skidGain, skidLfo, skidLfoGain, lfoG,
                  voiceFormant, ersHp, ersGain, windFilter, windGain, deadSub, subOctGain,
                  deadIdleGain, deadLimGain, deadLimPitch, deadGravGain, brakeFilter, brakeGain,
                  revSend, convolver, revReturn, deadPitLim, deadCylCut, scrubFilter, scrubGain, lockFilter, lockGain,
                  surfFilter, surfGain];
    for (const v of rivalVoices) { dead.push(v.filt, v.gain, v.pan); }
    queueDying(dead);
    engFilter = engGain = whineGain = harvFilter = harvGain = skidFilter = skidGain = skidLfo = skidLfoGain = lfoG = null;
    voiceFormant = ersHp = ersGain = windFilter = windGain = tiltEq = null;
    brakeFilter = brakeGain = null;
    scrubFilter = scrubGain = lockFilter = lockGain = surfFilter = surfGain = null;
    revFlare = 0; pitLimLvl = 0;
    subOctOsc = subOctGain = null;
    convolver = revSend = revReturn = null;
    rivalVoices = [];
    idleGainRamped = false;
    rateFresh = false;
    lastGearSeen = NaN;
    engineOn = false;
  }

  function setEngine(rev01, boost01, offroad, speed01, gear, physics) {
    if (!engineOn || !sfxOk()) return;
    // UPGRADE TO THE SAMPLES WHEN THEY LAND. `usingSamples` is decided once,
    // in startEngine(); a race whose lights went out before f1_engine.mp3 had
    // decoded (cold cache on a phone) ran its whole distance on the synth
    // voice. Restart once: stopEngine() fades the synth chain out over 0.35 s
    // and startEngine() re-reads samplesReady, so the swap is one crossfade
    // at the moment the samples arrive — never a per-frame flip.
    // Upgrade once when the sample (or the worklet behind it) arrives mid-race.
    if (samplesReady && engBuf && !usingSamples) { stopEngine(); startEngine(); }
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
    // Downshift throttle blip (see shift): an overshoot of the note that dies
    // over ~90 ms, on top of the rev the gearbox already asks for.
    if (revFlare > 0.0001) {
      const fd = revFlareT ? Math.max(0, t - revFlareT) : 0;
      revFlare = revFlare * Math.exp(-fd / 0.09);
      revFlareT = t;
      if (revFlare < 0.0001) revFlare = 0;
    }

    // The pitch curve's rev term, bent by CURVE (see TUNE_DEF): an exponent
    // keeps it 0 at idle, 1 at redline and increasing in between whatever the
    // trim, which is the monotonicity the checks pin.
    const revC = Math.pow(rev, tune.curve);
    let f0 = 0;   // the core's live fundamental, Hz — the sub-octave and the gravel rate hang off it
    // Sample-core playbackRate and a parallel lastRate for the synth path
    // (so a mid-race sample upgrade can seed the new BufferSource instead of
    // starting at the Web Audio default of 1.0).
    {
      const g = (typeof gear === "number" && isFinite(gear)) ? Math.max(1, Math.min(8, Math.round(gear))) : 8;
      const rate = (RATE_IDLE * tune.idle + revC * RATE_SPAN * tune.revRange) * (1 + 0.04 * b * tune.boostPitch) * voice.rateTrim * tune.pitch * (1 + 0.05 * revFlare);   // idle ~0.14x .. limiter ~0.71x on the shipped voice, the same in every gear
      const gearChanged = typeof gear === "number" && isFinite(gear) && isFinite(lastGearSeen) && g !== lastGearSeen;
      if (usingSamples) {
        // rateTrim is a CONSTANT per-manufacturer offset: pitch stays monotonic
        // in rev, and with no gear term the same rev is the same note in any gear.
        // IDLE moves only the RATE_IDLE end, REV RANGE only the RATE_SPAN span, PITCH the
        // sum — the decoupling TUNE_DEF explains.
        lastRate = rate;
        const cur = engSrcIdle.playbackRate.value;
        // Snap across discontinuities (first frame after start/upgrade, any
        // gear change including a 1→3 skip, or a jump the 0.035 s tau cannot
        // cover without leaving the idle rate on the shift frame). Steady rev
        // climbs still use aimParam so the note does not staircase.
        if (rateFresh || gearChanged || Math.abs(rate - cur) >= RATE_SNAP_JUMP) {
          snapParam(engSrcIdle.playbackRate, rate, t);
        } else {
          aimParam(engSrcIdle.playbackRate, rate, t, 0.035, 1e-4);
        }
        rateFresh = false;
        f0 = enginePeriod > 1 ? (ctx.sampleRate * rate) / enginePeriod : 0;
        // NOT a crossfade to the second recording: measured 2026-09-03 with
        // tools/check/audio-test.cjs, blending f1_rev.mp3 in under load reads
        // DARKER (centroid 1489 -> 1389 Hz at the same rev) — its brightness
        // FALLS as revs rise. Single coherent voice: run only the steady idle
        // loop, pitched; brightness/"load" comes from the lowpass opening with
        // revs and from loadLift below, which the check pins.
        // engGainIdle.gain -> 0.9 is a constant, so only the FIRST call does
        // anything (this runs EVERY FRAME) — but it must still be a ramp, not a
        // direct .value, or the voice snaps in instead of fading over the 0.05 s tau.
        if (!idleGainRamped && engGainIdle) { engGainIdle.gain.setTargetAtTime(0.9, t, 0.05); idleGainRamped = true; }
      } else {
        // synth fallback: detuned saws + sub follow the per-gear frequency.
        // Mirror lastRate so a later sample upgrade seeds the BufferSource at
        // the note the synth was already singing, not at 1.0.
        lastRate = rate;
        const base = (gIdle * tune.idle + revC * gSpan * tune.revRange) * (1 + 0.12 * b * tune.boostPitch) * voice.rateTrim * tune.pitch;
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

    // The shape caps (11 k / 7.2 k) bound the REV-DRIVEN part; the trims then
    // scale it, and the FINAL value is what has to stay in range. The other way
    // round, BRIGHTNESS past 1 runs the product off past Nyquist, where a
    // BiquadFilter silently pins it — the top of the slider moves a number that
    // no longer moves the sound. Ceiling is just
    // under Nyquist so the pin is ours and audible, not the node's and silent.
    const ceil = ctx.sampleRate * 0.45;
    const cut = Math.min(ceil, (usingSamples
      ? Math.min(11000, 2600 + s * 5800 + rev * 2400 + b * 1500 + slipLoad * 2000 + brakeLoad * 1200)
      : Math.min(7200,  600  + s * 4200 + rev * 700  + b * 1400 + slipLoad * 1000 + brakeLoad * 600))
      * voice.cutTrim * tune.brightness * (1 + 0.22 * loadLift));
    aimParam(engFilter.frequency, cut * camMix.cut, t, 0.05, 1e-4);
    // Compensate the tape-speed tilt. lastRate is the pitch ratio the core was
    // just handed, ~0.14 idle to ~0.71 redline; resampling costs roughly
    // -20*log10(rate) dB of perceived top end, so put a fraction of that back.
    // Scaled by the BRIGHTNESS trim, so a player who wants a muffled idle
    // can still have it, and capped so it cannot turn into a treble boost.
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
      * (1 + 0.08 * loadLift);
    // REV LIMITER. Above 98.5% the ignition cut chops the note at ~13 Hz —
    // the loudest "shift now" cue in F1 and functional feedback, not
    // decoration. limOsc feeds engGain.gain through limDepth on the audio
    // thread, so the gate costs no per-frame scheduling: base drops to
    // lvl·0.55 and the square wave swings it 0.10–1.00 × lvl.
    const limOn = layers.limiter && rev > 0.985 && s > 0.05;
    const topGear = gear >= ((typeof PhysicsConsts !== "undefined" && PhysicsConsts.GEARS) || 8);
    if (limOn && topGear) { if (limSince == null) limSince = t; } else limSince = null;
    const limFade = limSince == null ? 1 : clamp01(1 - (t - limSince - LIM_HOLD) / LIM_FADE);
    // CAPPED AT HALF THE LEVEL. engGain's base is (lvl - limDepth) and the
    // square swings +-limDepth on top, so the trough is lvl - 2*limDepth: past
    // limDepth = lvl/2 the gain goes NEGATIVE and the chop stops getting deeper
    // and starts inverting phase. With the trim widened to [0,3] that began at
    // 1.111, so most of the slider was buying an artefact. A full ignition cut
    // is the physical maximum; there is nothing deeper than all of it.
    const limDepth = limOn ? Math.min(lvl * 0.5, lvl * 0.45 * tune.limiter) * limFade : 0;
    // Guarded on the TARGET, like lfoG below and for the same reason: above
    // 98.5% is a sliver of a race, so an unguarded call scheduled the target 0
    // onto a value already converged to 0, 120x a second for the whole race —
    // the sixth-constant defect that comment describes, re-introduced. The
    // cache lives ON THE NODE so a stopEngine/startEngine pair cannot leave a
    // module variable stale (a fresh GainNode has no _apexLimTgt, which never
    // equals a number, so the first call after any restart re-issues).
    // The swing is scaled with the base it rides on (shift duck, camera mix):
    // on a TV camera the base drops to 0.55 and an unscaled ±limDepth took the
    // trough below zero — the phase inversion the cap above exists to prevent.
    const mult = (1 - 0.55 * shiftDuck) * camMix.engine;
    const limSwing = Math.floor(limDepth * mult * 1e4) / 1e4;   // floor: rounding up would dip the trough below 0
    if (limGain && limGain._apexLimTgt !== limSwing) {
      limGain.gain.setTargetAtTime(limSwing, t, 0.02);
      limGain._apexLimTgt = limSwing;
    }
    // The sag: ±limCents around the note, in step with the cut. 30 cents at
    // the stock trim is the rpm visibly dropping on a dead cylinder bank; the
    // top of the range (120) is a stutter you could not mistake for anything
    // else. Gated with the depth so the note is steady everywhere below 98.5%.
    const limCents = limOn ? 30 * tune.limPitch * limFade : 0;
    if (limPitch && limPitch._apexCents !== limCents) {
      limPitch.gain.setTargetAtTime(limCents, t, 0.02);
      limPitch._apexCents = limCents;
    }
    // PIT LIMITER, the same shape as the rev limiter: the base comes DOWN by
    // the depth and the square swings +-depth on top, so the stutter only ever
    // cuts (trough ~0.56 of the level) — riding the square on the full base
    // made the engine 45% LOUDER half of every cycle. Quantised so a steady
    // lane is not rescheduled every frame.
    const pitDepth = Math.round(pitLimLvl * Math.max(0, Math.min(lvl * 0.22, lvl * 0.5 - limDepth)) * mult * 1000) / 1000;
    if (pitLimGain && pitLimGain._apexTgt !== pitDepth) { pitLimGain.gain.setTargetAtTime(pitDepth, t, 0.03); pitLimGain._apexTgt = pitDepth; }
    const engBase = (lvl - limDepth) * mult - pitDepth;
    aimGain(engGain, engBase, t, 0.03);

    // GRAVEL (see startEngine). Rate is the CRANK rate: the recording's
    // fundamental is its firing rate, and a V6 fires three times a turn, so
    // f0/3 is once per revolution — 45 Hz at the stock idle, sliding up with
    // the note. Clamped into 18-140 Hz: below that it is a flutter, above it
    // a second tone rather than roughness. Depth is a share of the engine's own
    // level that dies as the square of rev (a quarter left at half revs,
    // nothing at redline), then CAPPED so the trough of the swing can never
    // take engGain negative — the same inversion the limiter's cap prevents,
    // and both swings share the one param: base - limDepth is what is left.
    if (gravOsc && gravGain) {
      const gravF = Math.max(18, Math.min(140, f0 / 3));
      if (Math.abs((gravOsc.frequency._apexHz ?? -1) - gravF) > 0.5) {
        gravOsc.frequency.setTargetAtTime(gravF, t, 0.05);
        gravOsc.frequency._apexHz = gravF;
      }
      const lump = (1 - rev) * (1 - rev);
      const want = layers.gravel ? engBase * 0.55 * lump * tune.gravel : 0;
      aimGain(gravGain, Math.min(want, Math.max(0, engBase - limSwing - pitDepth)), t, 0.05);
    }

    // Turbo / MGU-K whine: low gears keep supercharger character; deploy and
    // speed lift the 2026 electric layer so BOOST reads as half the power unit.
    const deploy01 = clamp01(ph.deploy != null ? ph.deploy : b);
    const lowGearFactor = g01 < 0.35 ? 0.85 + g01 * 0.43 : 1;   // compressed range in low gears
    aimParam(whineOsc.frequency, (voice.whineHz + rev * 2000 + deploy01 * 700 + s * deploy01 * 900) * lowGearFactor, t, 0.05, 1e-4);
    aimGain(whineGain,
      layers.whine ? (0.004 + rev * 0.013 + deploy01 * 0.011 + b * 0.008) * (s > 0.04 ? 1 : 0) * (usingSamples ? 0.50 : 1)
        * voice.whineLvl * tune.whine * (1 + 0.55 * deploy01 * (0.3 + 0.7 * s)) : 0, t, 0.08);

    // SUB-OCTAVE, an octave under the engine's own fundamental. That
    // fundamental is sampleRate*rate/period on both sample cores — the same
    // period measured from the recording — so the weight tracks the note
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

    // OVERRUN. Lifting at revs is the one engine state that sounded exactly like
    // coasting: loadLift is clamp01(ax/12), so it is ZERO the moment you come
    // off the throttle and nothing else in the mix noticed. A real engine on a
    // closed throttle at speed pops and crackles as unburnt fuel lights in the
    // hot exhaust, and it is the cue that tells you the car ahead has lifted.
    //
    // Gated away from BRAKING: hard braking is its own sound and already has
    // brakeLoad, and stacking crackle on top of it just makes noise. The window
    // is a gentle-to-moderate lift with the engine still spinning.
    const lifting = rev > 0.35 && s > 0.12 && (ph.ax || 0) < -0.5 && (ph.ax || 0) > -22;
    if (lifting && layers.overrun) {
      if (t >= overrunT) {
        // Irregular ON PURPOSE — evenly spaced pops read as a machine gun, not
        // an exhaust. Denser the harder the lift and the higher the revs.
        const rate = 0.055 + 0.10 * (1 - clamp01(-(ph.ax || 0) / 12)) * (1.3 - rev);
        overrunT = t + rate * (0.55 + Math.random() * 0.9);
        const k = (0.35 + 0.65 * rev) * tune.overrun;
        overrunFired++;
        noise(0.055 * k, 0.045, 2600 + Math.random() * 2200);
        if (Math.random() < 0.28) blip(90 + Math.random() * 50, "square", 0.05 * k, 0.002, 0.05, 55);
      }
    } else if (t > overrunT) {
      overrunT = t;   // do not bank a backlog while on the throttle
    }

    const dt = lastEngT ? Math.max(0.001, t - lastEngT) : 0;
    const thr = clamp01(ph.throttle != null ? ph.throttle : 1);
    const brkDem = clamp01(ph.brake != null ? ph.brake : 0);
    const deploy = deploy01;
    const energy = ph.energy != null ? clamp01(ph.energy) : 1;
    let decelTarget = 0;
    if (dt > 0) {
      const decel = (lastSpeed - s) / dt;   // speed01 units shed per second
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
    // MGU-K harvest: braking decel stays loud; lift-and-coast is softer and brighter.
    aimGain(harvGain, layers.harvest ? harvLevel * harvGainScale * tune.harvest : 0, t, 0.06);
    aimParam(harvFilter.frequency, 680 + s * 1500 + coastMix * 420, t, 0.08, 1e-4);
    if (harvFilter._apexQ == null) harvFilter._apexQ = harvFilter.Q.value;
    const harvQ = 6 - coastMix * 2.4;
    if (Math.abs((harvFilter._apexHarvQ ?? -1) - harvQ) > 0.08) {
      aimParam(harvFilter.Q, harvQ, t, 0.12, 0.05);
      harvFilter._apexHarvQ = harvQ;
    }

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
    soundtrack.duckForEngine(rev, t);
    const low = energy < 0.2 ? energy / 0.2 : 1;
    const partBias = ph.ersDeploy != null ? 0.8 + 0.4 * clamp01(ph.ersDeploy) : 1;
    const ersLvl = (deploy > 0 && layers.ers)
      ? (0.012 + 0.026 * deploy * (0.35 + 0.65 * energy)) * (0.4 + 0.6 * low) * partBias * tune.boost
        * (0.42 + 0.58 * Math.max(s, 0.04))
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
      aimParam(ersOsc.frequency, (2600 + rev * 1100 + s * 1500) * (0.88 + 0.12 * low), t, 0.06, 1e-4);

    // Part-throttle ICE harvest and full-pack regen clip: a shallow ignition cut.
    const partThr = thr > 0.1 && thr < 0.72 && deploy < 0.05 && s > 0.08;
    const packClip = packFull && deploy < 0.05 && (coastTarget > 0.04 || decelTarget > 0.08 || brkDem > 0.12);
    const cylOn = layers.ers && (partThr || packClip);
    const cylDepth = cylOn ? Math.min(engBase * 0.07, 0.011) * mult : 0;
    if (cylCutGain && cylCutGain._apexCylTgt !== cylDepth) {
      cylCutGain.gain.setTargetAtTime(cylDepth, t, 0.04);
      cylCutGain._apexCylTgt = cylDepth;
    }

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
      layers.wind ? (0.006 + 0.030 * s * s) * (1 + 0.45 * rough + 0.30 * gust) * (wet ? 1.25 : 1) * (1 - 0.35 * tow) * windOpen * tune.wind * camMix.wind : 0,
      t, 0.10);
    aimParam(windFilter.frequency, 450 + s * 1450 + rough * 260, t, 0.12, 1e-4);

    // BRAKES (see startEngine). Level follows how hard the car is stopping
    // (brakeFrac: 60 m/s² is the full pedal) and how fast it is going — the
    // same deceleration is a roar at 300 km/h and a scuff at 50. The centre
    // climbs with speed and with pedal, so a stamp from top speed opens up
    // and a trail into the apex settles down; a wet disc is a touch quieter
    // and duller. Off the brakes it is exactly 0 through aimGain, so a
    // straight costs nothing per frame.
    if (brakeGain) {
      // `> 0`, not a bare product: clamp01(-(0)/60) is -0, and a -0 target
      // is a real value to aimGain and a different one to Object.is.
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

    // WASTEGATE. A turbo held on boost and then dumped vents through the
    // wastegate — the "pssh" that follows every upshift-into-lift on a
    // broadcast. It is armed by TIME UNDER LOAD (pullT, the seconds ax has
    // read a real pull at revs) rather than by rev alone, so a blip in the
    // pits cannot fire it, and it fires ONCE per lift: the counter resets the
    // moment the throttle closes, and re-arms only through another pull. It
    // is the turbo's sound, so the TURBO trim and switch own it.
    const ax = ph.ax || 0;
    if (ax > 5 && rev > 0.45) pullT += dt;
    else if (ax < 0.5) {
      if (pullT > 0.5 && layers.whine && s > 0.1) {
        wasteFired++;
        const k = (0.4 + 0.6 * rev) * voice.whineLvl * tune.whine;
        hiss(0.055 * k, 0.16, 3800, 1300);
      }
      pullT = 0;
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

  // THE GRID IDLES. startRaceBody starts the engine with engGain at 0 and only
  // setEngine opens it; update()'s countdown branch returns before the race
  // block, so without this the car was silent through the lamps and slammed in
  // at LIGHTS OUT. Stationary (speed 0) keeps wind and whine gated. game.js
  // calls this on the countdown return; `_audioParamStep` still gates it.
  function setGridIdle(player, opts) {
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

  // INSTANT REPLAY (pause menu). tickBody's paused branch returns before the
  // race block that feeds setEngine/setRivals, so a scrubbed replay played in
  // silence and every car's rpm stayed pinned at the pause frame. game.js calls
  // feedReplayScrub on that return every paused frame and hands over its own
  // pure gear/rpm helpers (naturalGear, rpmFor stay the one source of revs), so
  // the replay note is the live note at the replayed speed. Leaving the scrub
  // (back on the pause menu) silences engine + rivals once; setPaused calls
  // resetReplayScrub so a resume never inherits that one-shot.
  let _scrubWas = false, _scrubGear = null, _scrubRpm = null;
  const _scrubArg = { slip: 1, ax: 0, onKerb: false, wet: false, tow: 0, deploy: 0, energy: 1, ersDeploy: 0, throttle: 0, brake: 0, regen: 0.5 };
  // Every car's rpm from its replayed speed in its natural gear (no ring field
  // for revs). replay-buf's applyPose calls this so a seek re-revs at once.
  function syncReplayRpms(cars) {
    if (!_scrubGear || !_scrubRpm || !cars) return;
    for (const c of cars) {
      const v = Math.max(0, c.speed || 0);
      c.rpm = _scrubRpm(_scrubGear(v), v);
    }
  }
  function resetReplayScrub() { _scrubWas = false; }
  function feedReplayScrub(player, scrubbing, cars, gearOf, rpmFor, rivalAudio, isWet, vTop) {
    if (!player) return;   // SOUND off or no car: leave everything as it is
    if (!scrubbing) {
      if (_scrubWas) { stopEngine(); setRivals([]); _scrubWas = false; }
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
    // A start landing inside stopRain's 1.2 s teardown must not be dropped: the
    // callers only fire on discrete weather FLIPS (race start, setWeatherLive),
    // so a rain→dry→rain inside that window would leave the loop silent for the
    // whole wet session with nothing to retry it. Queue it for the teardown
    // callback instead of returning empty-handed.
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
    // No source: a prior stopRain may still be running its 1.2 s teardown with
    // a startRain queued behind it. A real (dry) stop cancels that queued
    // restart — rain→dry→rain→dry inside the window otherwise restarted rain
    // in a dry session. A keepWant teardown (tab hide / ctx rebuild) keeps it.
    if (!rainSrc) { if (!keepWant) rainPending = null; return; }
    rainPending = null;   // a newer stop cancels a queued restart, wet or dry
    rainStopping = true;
    const s = rainSrc, g = rainGain, h = rainHp, l = rainLp;
    rainSrc = null; rainGain = null; rainHp = null; rainLp = null;
    try {
      g.gain.setTargetAtTime(0, now(), 0.4);
      setTimeout(() => {
        try { s.stop(); } catch (e) { /* already stopped */ }
        try { s.disconnect(); g.disconnect(); h.disconnect(); l.disconnect(); } catch (e) { /* already disconnected */ }
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
    // A GLIDE, not a `.value =` step. This runs once per rendered frame and the
    // slide input is unsmoothed (offroad is a 0 -> 0.5 step), so direct writes
    // stair-stepped the gain of broadband noise at the frame rate: crackle.
    // tau 0.02 s (glideLevel) is fast enough that a slide still bites and the
    // hard 0 still lands within ~60 ms. Scheduled only on a change: a timeline
    // insertion every frame, 0 onto 0 on every frame not sliding, is what the
    // guard was for. An exact value (the hard 0) always lands; a sub-1e-4
    // wobble (~-80 dBFS) does not.
    const sv = layers.screech ? v * (wet ? 0.10 : 0.16) * tune.screech : 0;   // wetter = quieter, sibilant
    const sp = skidGain._apexSkidV;
    if (sp !== sv && (sv === 0 || sp === undefined || Math.abs(sp - sv) >= 1e-4)) { glideLevel(skidGain.gain, sv); skidGain._apexSkidV = sv; }
    if (v > 0) {
      const base = wet ? 480 : 760;                    // wet: lower splash vs dry: screech
      const centre = base + v * 320;
      if (Math.abs((skidFilter.frequency._apexSkidBase ?? -1) - centre) >= 1) {
        skidFilter.frequency.setTargetAtTime(centre, now(), LEVEL_TAU);
        skidFilter.frequency._apexSkidBase = centre;
      }
      if (skidLfoGain && (skidLfoGain._apexDepth ?? 0) !== 60) {
        skidLfoGain.gain.setTargetAtTime(60, now(), LEVEL_TAU);
        skidLfoGain._apexDepth = 60;
      }
    } else if (skidLfoGain && (skidLfoGain._apexDepth ?? 0) !== 0) {
      skidLfoGain.gain.setTargetAtTime(0, now(), LEVEL_TAU);
      skidLfoGain._apexDepth = 0;
    }
  }

  // CAR SFX, fed once a frame by js/audio/car-sfx.js (all 0..1):
  //   scrub   fronts past the grip peak (understeer scrub, a low hiss)
  //   lock    a locked front wheel (narrow high squeal)
  //   surface off the road (low rumble; speed is already folded in)
  //   pitLim  held on the pit limiter (the engine stutters)
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
    const surfHz = 120 + 160 * surf;   // rescheduled only on a real change (the gravOsc pattern)
    if (surf > 0 && Math.abs((surfFilter.frequency._apexHz ?? -99) - surfHz) > 2) {
      surfFilter.frequency.setTargetAtTime(surfHz, t, 0.1); surfFilter.frequency._apexHz = surfHz; surfSched++;
    }
    // The depth is set in setEngine, against the engine's own base (see there).
    pitLimLvl = layers.limiter === false ? 0 : pit;
    carSfxLast.scrub = scrub; carSfxLast.lock = lock; carSfxLast.surface = surf; carSfxLast.pitLim = pit;
  }

  // Wheel guns: four short pneumatic rattles, staggered like a crew that does
  // not quite move as one. `tighten` is the second half of the stop, a touch
  // higher and shorter.
  function pitGun(tighten) {
    pitGunFired++;
    if (!sfxOk()) return;
    const t0 = now();
    const lag = [0, 0.05, 0.11, 0.08];
    for (let i = 0; i < 4; i++) {
      const w = t0 + lag[i] + Math.random() * 0.03;
      const n = tighten ? 3 : 4;
      for (let k = 0; k < n; k++) noise(0.07, 0.03, (tighten ? 3200 : 2600) + i * 140, w + k * 0.045);
    }
  }

  // Which way the view is looking, from the camera id (js/camera/mode-switch.js).
  // Unknown ids read as chase — the neutral mix.
  function setCameraMix(id) {
    camKind = CAM_KIND[id] || "chase";
    camMix = CAM_MIX[camKind];
    applyVenue();
    return camKind;
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
      if (!isUp) { revFlare = 1; revFlareT = t0; }   // heel-and-toe: the note flares, then settles
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
    // The SHIFT trim scales the crack and its click together; the rev-cut
    // (shiftDuck) is left alone, because that is the engine's behaviour and
    // this is how loud the gearbox is over it.
    shiftPeak = (isUp ? 0.12 : 0.1) * tune.shift;
    shiftFired++;
    env(g, t0, Math.max(0.0001, shiftPeak), 0.004, dur);
    osc.connect(f).connect(g).connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => { osc.disconnect(); f.disconnect(); g.disconnect(); };

    // a touch of mechanical click via short filtered noise
    if (tune.shift > 0) noise((isUp ? 0.05 : 0.045) * tune.shift, 0.05, (isUp ? 2600 : 1800) * voice.cutTrim);
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
  /* setVenue(def) — the circuit's acoustics, from the track definition it
   * already carries. Called beside setVoice at race start; safe any time.
   * The mapping lives HERE rather than in game.js because it is an audio
   * decision, not a track one. */
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

  /* An exponentially decaying stereo noise burst — the shape of a real tail.
   * The two channels are INDEPENDENT noise, which is what makes it wide; the
   * same noise in both would just be a mono tail sitting in the middle. */
  function buildIR(v) {
    const cached = _irCache.get(venueName);
    if (cached) return cached;
    const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * v.decay));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // A one-pole lowpass over the noise IS the damping: high frequencies die
      // away faster than low ones in any real space, and baking it into the IR
      // costs nothing at render time.
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
    // ASSIGN ONLY ON A REAL CHANGE. buildIR is memoised so no AudioBuffer is
    // re-allocated, but assigning ConvolverNode.buffer re-runs the whole impulse
    // response preparation regardless — WebKit rebuilds partitioned FFT kernels
    // over ~91k stereo frames. applyTuneNodes() routes here and a slider fires
    // `input` at frame rate, so one drag reconfigured the render thread ~60x/s.
    const ir = buildIR(venue);
    if (convolver.buffer !== ir) convolver.buffer = ir;
    const wet = layers.reverb ? venue.level * tune.reverb * camMix.reverb : 0;
    revReturn.gain.setTargetAtTime(wet, now(), 0.2);
    // Mute the send when SPACE is off — returning at 0 still fed the convolver.
    if (revSend) revSend.gain.setTargetAtTime(wet > 0 ? 1 : 0, now(), 0.05);
  }

  function setVoice(engineName) {
    voice = ENGINE_VOICES[engineName] || ENGINE_VOICES["default"];
    voiceName = ENGINE_VOICES[engineName] ? engineName : "default";
    applyTuneNodes();
  }

  // DETUNE on the SAMPLE core, in cents. Player detune rides ON TOP of the
  // manufacturer's cents, so the voice's character survives the slider. On the
  // synth core detune is chorus WIDTH (engB's spread, 0 = none); the sample core
  // has ONE source, so there it can only transpose. It read (detune - 1) * 30,
  // which made the shipped detune 0 ("chorus off", TUNE_DEF) a 30-cent-flat
  // transposition of every TEAM voice. Now [0,1] is no offset at all — off
  // means off on both cores — and (1,4] adds up to +90 cents, a tenth of what
  // the PITCH slider covers: a character trim, not a second pitch control.
  function sampleDetuneCents() {
    return voice.detune + Math.max(0, tune.detune - 1) * 30;
  }

  // The two tune fields that are NOT per-frame expressions: detune lives on the
  // sample sources and sub-octave weight on the gain engC was built behind, so
  // both are written when the tune (or the voice) changes rather than 60x a
  // second. Safe before the engine exists — every write is guarded on its node.
  function applyTuneNodes() {
    if (!ctx) return;
    const t = now();
    if (engSrcIdle && engSrcIdle.detune) engSrcIdle.detune.setTargetAtTime(sampleDetuneCents(), t, 0.05);

    const subGain = engC && engC._apexSubGain;
    if (subGain) subGain.gain.setTargetAtTime(voice.subLvl * tune.sub, t, 0.05);

    // CHOP RATE. Its own knob now: 5.2 Hz at the bottom, the stock 13 Hz at 1,
    // 39 Hz wide open, which is past a stutter and into a buzz. (Not the top
    // half of the DEPTH trim, even though depth saturates at a full ignition
    // cut and has nothing left to buy above ~1.1: a slow deep cut and a fast
    // shallow one are different limiters, and one slider cannot express
    // either.) Set once per tune change, not per frame.
    if (limOsc) limOsc.frequency.setTargetAtTime(13 * tune.limRate, t, 0.05);
    applyVenue();   // the REVERB trim and its layer switch both land here
  }

  // Clamp into TUNE_RANGE and drop anything not in the table: these values come
  // from a slider and from localStorage, and a NaN reaching playbackRate throws
  // the whole engine graph out for the rest of the session.
  function setTune(patch) {
    GameAudioToneModel.patchTune(tune, patch);
    // A trim that no longer matches the named profile makes the name a LIE —
    // and profile() is what the panel lights and what __apex.audio() reports,
    // so the lie would be visible in two places. Recomputed rather than set
    // unconditionally: restoring a saved tune that happens to equal its profile
    // must stay on that profile, not read as hand-edited.
    profileName = GameAudioToneModel.nameForTune(tune, profileName);
    applyTuneNodes();
    return Object.assign({}, tune);
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

  /* setRivals(list) — the cars around you, in the PLAYER'S track frame.
   * Each entry: { lat, arc, rev, approach, voice, slot, net?, key? }
   *   lat      metres to the RIGHT (negative = your left)
   *   arc      metres AHEAD (negative = behind)
   *   rev      0..1, their engine speed
   *   approach metres/second of LINE-OF-SIGHT closing (positive = coming at
   *            you; 0 when level with you — js/audio/rivals.js)
   *   voice    their power unit (ENGINE_VOICES key)
   *   slot     which of the RIVAL_VOICES plays them, bound to the car
   * Sorted nearest-first by js/audio/rivals.js; anything past RIVAL_VOICES is dropped.
   *
   * Safe to call every frame, and safe to call with [] — an empty list is how
   * the field goes quiet when you drive away from it.
   */
  // Which rival row each voice plays this call (-1 = none). A row's `slot` is
  // the voice RivalAudio bound to that CAR, so a rank swap moves no voice;
  // a row without one (an older caller) falls back to its rank. A row whose
  // slot AND rank voice are both taken gets the first free voice: on a phone's
  // two voices a car bound to slot 3 would otherwise go mute beside an idle one.
  const _rivalRow = [];
  // VS FRIEND net snapshots step speed/gear ~10 Hz; solo AI revs every physics tick.
  // Two cascaded poles (~48 ms each) on net-owned rows only — peak frame jump < 25 Hz
  // on a ~175 Hz pitch step without lagging local AI downshifts.
  const RIVAL_REV_NET_TAU = 0.048;
  const _rivalRevSm = [];
  let _rivalRevSmT = 0;
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
    if (!engineOn || !rivalVoices.length) return;
    const t = now();
    const dt = _rivalRevSmT > 0 ? Math.min(0.05, t - _rivalRevSmT) : 1 / 60;
    _rivalRevSmT = t;
    const n = layers.rivals && list ? Math.min(list.length, rivalVoices.length) : 0;
    for (let i = 0; i < rivalVoices.length; i++) _rivalRow[i] = -1;
    let unvoiced = 0;
    for (let k = 0; k < n; k++) {
      const sl = list[k].slot;
      const vi = Number.isInteger(sl) && sl >= 0 && sl < rivalVoices.length && _rivalRow[sl] < 0 ? sl : k;
      if (_rivalRow[vi] < 0) _rivalRow[vi] = k; else unvoiced |= 1 << k;
    }
    for (let k = 0, free = 0; unvoiced && k < n; k++) {
      if (!(unvoiced & (1 << k))) continue;
      while (_rivalRow[free] >= 0) free++;   // n <= voices, so one is free
      _rivalRow[free] = k;
    }
    for (let i = 0; i < rivalVoices.length; i++) {
      const v = rivalVoices[i];
      if (_rivalRow[i] < 0) { aimGain(v.gain, 0, t, 0.12); continue; }
      const r = list[_rivalRow[i]];
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
      // Same threshold, same reason (see aimGain): exact inequality against a
      // continuously varying angle re-scheduled the pan every physics step.
      // 0.004 of the -1..1 image is inaudible and well under the 0.06 s tau.
      const _pp = v.pan.pan._apexPanTgt;
      if (_pp === undefined || Math.abs(_pp - pan) >= 0.004) {
        v.pan.pan.setTargetAtTime(pan, t, 0.06); v.pan.pan._apexPanTgt = pan;
      }

      // LEVEL. The first cut put a rival 5 m away at gain 0.040 against the
      // player's own engine at ~0.54 — 22 dB down, which is not "present but
      // not distracting", it is inaudible, and the player said so.
      //
      // Inverse-distance now, the model games actually use, rather than a
      // squared linear fade: full level inside REF metres, then falling as
      // ref/(ref + rolloff*(d - ref)), which is loud when a car is on top of
      // you and still there at forty. Peak is ~0.28, about 6 dB under the
      // player's own engine at speed — you should hear a car alongside as a
      // car alongside, not as a rumour.
      const near = RIVAL_REF / (RIVAL_REF + 1.15 * Math.max(0, dist - RIVAL_REF));
      const behind = arc < 0 ? 0.78 : 1;   // your own engine is between you and it
      const rv = (r.voice && ENGINE_VOICES[r.voice]) || ENGINE_VOICES["default"];
      aimGain(v.gain, PAN_MAKEUP * rivalPeak * tune.rivals * camMix.rivals * near * behind * (0.55 + 0.45 * clamp01(r.rev)), t, 0.10);

      // Air absorbs the top end with distance, which is most of why a far car
      // reads as far rather than merely quiet. A POWER LAW, not a scale of the
      // level curve: `near` falls off fast enough that reusing it shut a car at
      // twenty metres down to a muffle it has no business being at. Real air
      // absorption is a few dB per hundred metres at 4 kHz, so the exponent is
      // small and the near field stays open.
      const cut = Math.max(700, Math.min(12000,
        12000 * Math.pow(RIVAL_REF / Math.max(dist, RIVAL_REF), 0.35) * rv.cutTrim));
      if (Math.abs((v.filt.frequency._apexCut ?? -1) - cut) > 60) {
        v.filt.frequency.setTargetAtTime(cut, t, 0.12);
        v.filt.frequency._apexCut = cut;
      }

      // DOPPLER. Their pitch from their own revs, shifted by how fast the gap is
      // closing — the rise as a car comes past you is the cue.
      // The textbook stationary-observer form, 343/(343 - v), not its first-order
      // expansion 1 + v/343: they agree to a few cents at pit speed and diverge
      // where the effect actually matters, which is a car arriving at 300 km/h.
      // The ratio clamp is the real guard — the approach figure comes from two
      // speeds sampled a frame apart and one bad frame must not chirp.
      const closing = Math.max(-90, Math.min(90, +r.approach || 0));
      const dop = Math.max(0.80, Math.min(1.25, 343 / (343 - closing)));
      const rawRev = clamp01(r.rev);
      const rev01 = rivalSmoothedRev(i, rawRev, !!r.net, r.key, dt);
      v.setPitch(t, rev01, dop * v.detune * rv.rateTrim);   // their manufacturer's note, not yours
    }
  }

  function setLayer(name, on) {
    if (Object.prototype.hasOwnProperty.call(LAYER_DEF, name)) layers[name] = !!on;
    // Every other layer is gated inside setEngine, so the next frame picks the
    // switch up on its own. The reverb return is NOT — it is set when the venue
    // or the tune changes, so without this the SPACE switch did nothing at all
    // until something else happened to move the tune.
    if (name === "reverb") applyVenue();
    return Object.assign({}, layers);
  }

  // whoosh: filtered noise sweeping up + a rising saw underneath
  function deployBoost() {
    boostPeak = 0.3 * tune.boost;
    boostFired++;
    if (!sfxOk() || !(boostPeak > 0)) return;   // BOOST at 0 is a silent deploy, not a zero-height envelope
    const t0 = now();
    const src = ctx.createBufferSource();
    const off = bindNoise(src, 0.7);        // start(t0, off) -> stop(t0 + 0.6)
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t0);
    f.frequency.exponentialRampToValueAtTime(4800, t0 + 0.45);
    const g = ctx.createGain();
    env(g, t0, boostPeak, 0.03, 0.45);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, off);
    src.stop(t0 + 0.6);
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* already disconnected */ } };
    blip(220, "sawtooth", 0.12 * tune.boost, 0.03, 0.4, 880);
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

  // MENU SOUNDS (apex26.menuSfx, js/audio/panel.js): the three ui* blips have
  // their own switch, because a player who wants the engine and the tyres can
  // still want silent menus. ONE CLICK, ONE SOUND: a handler that blips and then
  // calls a helper that blips again (the track tile's uiSelect + tickUi) is a
  // double click in the ear, so a second ui blip inside UI_GAP_MS is dropped.
  // performance.now(), not ctx.currentTime: a suspended context's clock stands
  // still and would swallow every blip after the first.
  let uiEnabled = true, uiLast = -1e9;
  const UI_GAP_MS = 60;
  function uiOk() {
    if (!uiEnabled || !sfxOk()) return false;
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

  // BRAKE CUE: same click every time — the SIGNAL is the pulse rate, not pitch
  // (docs/research/DRIVING-CONTROLS-RESEARCH.md, Forza BDA). `urgency` drives
  // the RATE, so every level shares the voice: one 520 Hz click, whatever the
  // urgency.
  //
  // Forza's wording is the spec — "at its fastest speed, players may need to
  // fully engage the brakes, while a slower rate may mean you only need to let
  // up on the throttle a little" — so the interval closes from 0.4 s at the
  // foot of the ramp to 0.07 s at the top, where it stops reading as separate
  // clicks. A pitch ramp is what that research explicitly warns against,
  // because it conflates "a corner is coming" with "how much car you need".
  //
  // Built as a blip train and not a held tone: a sustained node has to be torn
  // down on pause, on rebuildCtx() and on every mode change, and all three
  // failures are silent. A train that simply stops being scheduled cannot leak
  // a stuck tone into a paused game.
  //
  // u <= 0 stands the layer down AND resets the clock, so no backlog is banked
  // while the player is on the pace — the overrun crackle above learned that
  // the hard way (`if (t > overrunT) overrunT = t`).
  function assistPlaybackQuiet() {
    return typeof RealRace !== "undefined" && RealRace.status && !!RealRace.status().watch;
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

  // Assist-gated AUDIO DRIVING CUES (js/audio/driving-cues.js). Distinct from
  // brakeCue's 520 Hz square train — a softer triangle so two assists on at
  // once do not read as one confused beep. Own clock (driveCueT).
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
  // +k = LEFT turn (AGENTS.md). Two pitches, never speech / announce.
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

  // "No" — a rejected purchase must not play the SAME 660 Hz uiTick as a
  // successful tab switch, or an over-budget part sounds exactly like a
  // fitted one. A short low sawtooth (the penalty() family's timbre, UI-
  // sized) is unmistakably not a confirmation.
  function uiReject() {
    if (!uiOk()) return;
    blip(220, "sawtooth", 0.12, 0.006, 0.14);
  }

  function penalty() {
    blip(330, "sawtooth", 0.22, 0.01, 0.45, 116);
    blip(165, "square", 0.14, 0.01, 0.45, 58);
  }

  /*
   * Music is real, downloaded CC0 tracks (see assets/music/CREDITS.txt),
   * streamed and looped through the AudioContext. startMusic(trackIdx) -> a
   * race loop; startMusic(-1) -> menu loop.
   */
  /* ---------------- mixer ----------------
     Two independent levels under the master mute: the SFX bus (engine, skids,
     rain, UI) and the music gain. Both take 0..1 and apply at once (a ~60 ms
     glide, glideLevel), so a slider moves the level while it is being dragged. */
  function setSfxVolume(v) {
    sfxVol = clamp01(typeof v === "number" ? v : 1);
    if (sfxBus) glideLevel(sfxBus.gain, sfxEnabled ? sfxVol : 0);
    return sfxVol;
  }
  function setSfxEnabled(b) {
    sfxEnabled = !!b;
    if (sfxBus) glideLevel(sfxBus.gain, sfxEnabled ? sfxVol : 0);
    // A race that started with SFX off wanted rain but built no nodes
    // (startRain returns on !sfxOk()); turning SFX on must start it.
    if (sfxEnabled && rainWanted && !rainSrc) startRain();
    // setEngine() owns the rev-keyed music duck and stops running the instant
    // SFX go off (sfxOk()), so release it here the way stopEngine() does.
    // musicGain hangs off master, not sfxBus: without this the music stayed up
    // to 25% down for the rest of the race. And the way stopEngine() does it:
    // a radio line still on air keeps ITS duck — `false` here released that too,
    // so SFX OFF during a radio TEST put the music back over the voice.
    if (!sfxEnabled) soundtrack.releaseEngineDuck(now(), true);
    return sfxEnabled;
  }
  function volumes() { return { sfx: sfxVol, music: soundtrack.volume() }; }

  let _onInterrupted = null;
  /** fn() when the platform interrupts the audio session (an iOS call, Siri). */
  function onInterrupted(fn) { _onInterrupted = typeof fn === "function" ? fn : null; }
  return {
    onInterrupted,
    init,
    setRadioDuck,
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
    radioChannels: radio.radioChannels,
    setEnabled,
    enabled,
    startEngine,
    stopEngine,
    setEngine,
    setGridIdle,
    feedReplayScrub,
    syncReplayRpms,
    resetReplayScrub,
    setSkid,
    setCarSfx,
    pitGun,
    setCameraMix,
    cameraMix: () => ({ kind: camKind, ...camMix }),
    carSfx: () => ({ ...carSfxLast, pitGuns: pitGunFired, revFlare: +revFlare.toFixed(4), pitDepth: pitLimGain ? pitLimGain._apexTgt || 0 : 0 }),
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
    setVenue,
    venue() { return { name: venueName, level: revReturn ? +revReturn.gain.value.toFixed(4) : 0, decay: venue.decay }; },
    // Test hooks: each rival voice's live pan/level/pitch. They sit behind their
    // own panners on sfxBus, so nothing downstream of the engine can see them.
    rivalState() {
      return rivalVoices.map((v) => ({
        gain: +v.gain.gain.value.toFixed(5),
        pan: +v.pan.pan.value.toFixed(4),
        // One of the two, by core: `rate` is the sample voice's playbackRate,
        // `hz` the synth voice's fundamental. The other reads 0.
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
    // Seconds the TOP-GEAR cut has been held (null below top gear or off the
    // gate): the fade's clock, so a test can watch the burst end.
    limiterHeld() { return limSince == null ? null : +(ctx.currentTime - limSince).toFixed(3); },
    // The chop RATE, which is where the top half of the LIMITER trim goes once
    // the depth has saturated at a full ignition cut.
    limiterHz() { return limOsc ? +limOsc.frequency.value.toFixed(2) : 0; },
    // The cut's pitch sag, in cents of swing, and the levels behind the trims.
    limiterCents() { return limPitch ? +limPitch.gain.value.toFixed(3) : 0; },
    ersLevel() { return ersGain ? +ersGain.gain.value : 0; },
    harvestLevel() { return harvGain ? +harvGain.gain.value : 0; },
    harvestCoastLevel() { return +harvCoastLevel.toFixed(5); },
    harvestBrakeLevel() { return +harvBrakeLevel.toFixed(5); },
    cylCutDepth() { return cylCutGain ? +cylCutGain.gain.value : 0; },
    skidLevel() { return skidGain ? +skidGain.gain.value : 0; },
    boostState() { return { fired: boostFired, peak: +boostPeak.toFixed(4) }; },
    // The engine core's live lowpass corner, so the BRIGHTNESS trim's ceiling
    // is assertable rather than a thing you can only hear.
    engineCut() { return engFilter ? Math.round(engFilter.frequency.value) : 0; },
    // The core's own gain, which is (level - limiterDepth): the pair is what
    // says whether the rev-limiter gate cuts the note or inverts it.
    engineLevel() { return engGain ? +engGain.gain.value : 0; },
    // Same shape again: the sub-octave sits on its own gain straight into
    // sfxBus, so centroidHz() (which taps engGain) cannot see it either.
    subLevel() { return subOctGain ? +subOctGain.gain.value : 0; },
    // Crackles emitted since boot, and when the next one is due. One-shots have
    // no persistent node to read, so this is the only way to observe the layer.
    overrunState() { return { fired: overrunFired, nextAt: +overrunT.toFixed(3), now: +now().toFixed(3) }; },
    // The braking cue has no persistent node to read (see brakeCue), so this is
    // the only way to assert the layer: blips emitted, the live urgency, and
    // when the next one is due against the clock it is scheduled on.
    brakeCueState() { return { fired: cueFired, urgency: +cueU.toFixed(3), nextAt: +cueT.toFixed(3), now: +now().toFixed(3) }; },
    driveCueState() {
      return {
        brakeFired: driveCueFired, callFired: cornerCallFired,
        nextAt: +driveCueT.toFixed(3), now: +now().toFixed(3),
      };
    },
    // Same shape for the other one-shots the tune reaches: wastegate dumps
    // (and how long the engine has been under load, which arms them) and the
    // gear-shift crack with the level the SHIFT trim gave the last one.
    wastegateState() { return { fired: wasteFired, pullT: +pullT.toFixed(3) }; },
    shiftState() { return { fired: shiftFired, peak: +shiftPeak.toFixed(4) }; },
    // The gravel modulation's live depth (a swing on engGain.gain, invisible
    // downstream) and its crank rate; and the brake roar's live gain.
    gravelDepth() { return gravGain ? +gravGain.gain.value : 0; },
    gravelHz() { return gravOsc ? +gravOsc.frequency.value.toFixed(2) : 0; },
    brakeLevel() { return brakeGain ? +brakeGain.gain.value : 0; },
    subHz() { return subOctOsc ? +subOctOsc.frequency.value : 0; },
    // The DETUNE trim as it lands on the sample source, in cents.
    detuneCents() { return engSrcIdle && engSrcIdle.detune ? +engSrcIdle.detune.value.toFixed(4) : 0; },
    // The rev-compensating shelf, in dB. Rises as the engine pitches down.
    tiltDb() { return tiltEq ? +tiltEq.gain.value.toFixed(2) : 0; },
    rate() { return (engSrcIdle && engSrcIdle.playbackRate) ? +engSrcIdle.playbackRate.value : 0; },   // exact: tools/check/audio-test.cjs and the tune tests take ratios of it
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
    debug() { return { contextState: ctx ? ctx.state : "uninitialised", samplesReady, usingSamples, engineOn, voice: voiceName,
      limSwing: limGain ? limGain._apexLimTgt ?? 0 : null, surfSched, loop: engSrcIdle ? { s: +engSrcIdle.loopStart.toFixed(2), e: +engSrcIdle.loopEnd.toFixed(2), win: engWin && [+engWin.start.toFixed(2), +engWin.end.toFixed(2)] } : null }; },
  };
})();
