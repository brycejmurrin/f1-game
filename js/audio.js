/*
 * GameAudio: WebAudio synth for Apex 26 — engine drone, race SFX and a
 * small looping soundtrack. Everything is generated, no audio assets.
 * init() must be called from a user gesture so the context can start.
 *
 * Engine voice models the 2026 hybrid turbo V6: two detuned saws + a
 * square through a speed-tracking lowpass, a faint high sine for the
 * turbo whine, and a filtered-noise layer that fades IN when the car is
 * slowing — the MGU-K harvesting whirr.
 *
 * Music uses a lookahead sequencer: notes are scheduled on the WebAudio
 * clock up to 300 ms ahead, pumped from BOTH a 60 ms timer and a rAF
 * loop — iOS throttles whichever one it feels like, but rarely both at
 * once, and the wide lookahead rides out the gaps.
 */
"use strict";

const GameAudio = (function () {
  let ctx = null;
  let master = null;
  let isEnabled = true;

  // Engine voice (persistent while racing)
  let engA = null, engB = null, engC = null;     // saw, saw, square
  let engFilter = null, engGain = null;
  let whineOsc = null, whineGain = null;          // turbo whine
  let harvSrc = null, harvFilter = null, harvGain = null; // MGU-K harvest whirr
  let lfo = null, lfoG = null;                    // offroad pitch wobble (8 Hz)
  let skidSrc = null, skidFilter = null, skidGain = null;
  let engineOn = false;
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0;

  // Music sequencer
  let musicOn = false;
  let musicTimer = null;
  let step = 0;
  let nextNoteT = 0;
  let songIdx = 0;
  let stepDur = 0.1;
  let lastTrackIdx = -1;

  let listenersAttached = false;
  let rebuildTries = 0;
  let lastFailedResume = 0;
  let resumeMusic = false;
  let resumeEngine = false;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function createCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    // iOS 17+: play through the ring/silent switch like a game should.
    // The Audio Session API must be set BEFORE the context is created.
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = "playback";
      }
    } catch (e) { /* older iOS */ }

    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isEnabled ? 0.8 : 0;
    master.connect(ctx.destination);

    // iOS Safari starts contexts suspended; resume inside the gesture.
    if (ctx.state !== "running") ctx.resume();
    return true;
  }

  function init() {
    // init is only ever called from a user gesture
    if (ctx) {
      resumeIfNeeded(true);
      return;
    }
    if (!createCtx()) return;

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
      p.then(function () {
        rebuildTries = 0;
        lastFailedResume = 0;
      }).catch(function () {});
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
    if (!createCtx()) return;
    if (wasMusic) startMusic(wasTrack);
    if (wasEngine) startEngine();
  }

  function onVisibility() {
    if (document.hidden) {
      resumeMusic = musicOn;
      resumeEngine = engineOn;
      if (musicOn) stopMusic();
      if (engineOn) stopEngine();
    } else {
      resumeIfNeeded();
      if (resumeMusic) startMusic(lastTrackIdx); // restarts re-synced to the clock
      if (resumeEngine) startEngine();
      resumeMusic = resumeEngine = false;
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
    return !!ctx && isEnabled;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------------- one-shot helpers ---------------- */

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
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  function noiseBuf(seconds) {
    const len = Math.ceil(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noise(peak, decay, filterFreq, when) {
    if (!sfxOk()) return;
    const t0 = now() + (when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(decay + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    env(g, t0, peak, 0.005, decay);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + decay + 0.1);
  }

  /* ---------------- engine ---------------- */

  function startEngine() {
    if (!ctx || engineOn) return;

    // core: two detuned saws + a square through a speed-tracked lowpass
    engA = ctx.createOscillator();
    engB = ctx.createOscillator();
    engC = ctx.createOscillator();
    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    engA.type = "sawtooth";
    engB.type = "sawtooth";
    engC.type = "square";
    engA.frequency.value = 70;
    engB.frequency.value = 70.7;
    engC.frequency.value = 35;
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;
    engA.connect(engFilter);
    engB.connect(engFilter);
    engC.connect(engFilter);
    engFilter.connect(engGain).connect(master);

    // turbo whine: faint high sine riding above the core
    whineOsc = ctx.createOscillator();
    whineGain = ctx.createGain();
    whineOsc.type = "sine";
    whineOsc.frequency.value = 1500;
    whineGain.gain.value = 0;
    whineOsc.connect(whineGain).connect(master);

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
    harvSrc.connect(harvFilter).connect(harvGain).connect(master);

    // offroad wobble: 8 Hz LFO into oscillator detune (cents)
    lfo = ctx.createOscillator();
    lfoG = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 8;
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    lfoG.connect(engA.detune);
    lfoG.connect(engB.detune);
    lfoG.connect(engC.detune);

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
    skidSrc.connect(skidFilter).connect(skidGain).connect(master);

    engA.start(); engB.start(); engC.start();
    whineOsc.start();
    harvSrc.start();
    lfo.start();
    skidSrc.start();

    lastSpeed = 0;
    lastEngT = 0;
    harvLevel = 0;
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
    engA.stop(t0 + 0.35); engB.stop(t0 + 0.35); engC.stop(t0 + 0.35);
    whineOsc.stop(t0 + 0.35);
    harvSrc.stop(t0 + 0.35);
    lfo.stop(t0 + 0.35);
    skidSrc.stop(t0 + 0.35);
    engA = engB = engC = null;
    whineOsc = null;
    harvSrc = null;
    lfo = null;
    skidSrc = null;
    engineOn = false;
  }

  // speed01 0..1, boost01 0..1 (truthy ok), offroad bool
  function setEngine(speed01, boost01, offroad) {
    if (!engineOn || !ctx) return;
    const s = clamp01(speed01 || 0);
    const b = clamp01(typeof boost01 === "number" ? boost01 : (boost01 ? 1 : 0));
    const t = ctx.currentTime;

    // 70 Hz idle to ~620 Hz flat out; boost adds +12% pitch
    const base = (70 + s * 550) * (1 + 0.12 * b);
    engA.frequency.setTargetAtTime(base * 0.994, t, 0.03);
    engB.frequency.setTargetAtTime(base * 1.009, t, 0.03);
    engC.frequency.setTargetAtTime(base * 0.5, t, 0.03);

    // lowpass 600 -> 5200 Hz with speed; boost opens it further
    const cut = Math.min(7200, 600 + s * 4600 + b * 1400);
    engFilter.frequency.setTargetAtTime(cut, t, 0.05);
    engGain.gain.setTargetAtTime(
      0.05 + s * 0.06 + b * 0.025 + (offroad ? 0.012 : 0), t, 0.05);

    // turbo whine 1.5–3.5 kHz tracking speed
    whineOsc.frequency.setTargetAtTime(1500 + s * 2000, t, 0.05);
    whineGain.gain.setTargetAtTime(
      (0.004 + s * 0.013 + b * 0.008) * (s > 0.04 ? 1 : 0), t, 0.08);

    // harvesting whirr fades IN under braking/lift: infer deceleration
    // from the speed trajectory between calls
    const dt = lastEngT ? Math.max(0.001, t - lastEngT) : 0;
    let target = 0;
    if (dt > 0) {
      const decel = (lastSpeed - s) / dt;   // speed01 units shed per second
      target = clamp01(decel * 5) * Math.min(1, s * 3);
    }
    lastEngT = t;
    lastSpeed = s;
    harvLevel += (target - harvLevel) * Math.min(1, (dt || 0.016) / 0.12);
    harvGain.gain.setTargetAtTime(harvLevel * 0.06, t, 0.06);
    harvFilter.frequency.setTargetAtTime(700 + s * 1600, t, 0.08);

    // offroad: ~8 Hz pitch wobble via the LFO (gain is cents of detune)
    lfoG.gain.setTargetAtTime(offroad ? 45 : 0, t, 0.05);
  }

  // x 0..1; looped bandpass noise follows it
  function setSkid(x) {
    if (!engineOn || !skidGain) return;
    const v = clamp01(x || 0);
    skidGain.gain.value = v * 0.16;
    if (v > 0) {
      skidFilter.frequency.value = 760 + v * 420 + Math.sin(now() * 30) * 80;
    }
  }

  /* ---------------- sfx ---------------- */

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
    src.buffer = noiseBuf(0.55);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t0);
    f.frequency.exponentialRampToValueAtTime(4800, t0 + 0.45);
    const g = ctx.createGain();
    env(g, t0, 0.3, 0.03, 0.45);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + 0.6);
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

  function lap() {
    blip(988, "square", 0.2, 0.01, 0.1);
    blip(1319, "square", 0.2, 0.01, 0.2, null, 0.1);
  }

  function finish() {
    [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) {
      blip(f, "square", 0.2, 0.01, 0.2, null, i * 0.11);
    });
  }

  function uiTick() {
    blip(660, "square", 0.08, 0.004, 0.05);
  }

  function uiSelect() {
    blip(880, "square", 0.13, 0.005, 0.09);
  }

  function penalty() {
    blip(330, "sawtooth", 0.22, 0.01, 0.45, 116);
    blip(165, "square", 0.14, 0.01, 0.45, 58);
  }

  /* ---------------- music ---------------- */

  /*
   * Three original 64-step (4 bars of 16ths) race loops at ~158 BPM and
   * a calmer menu loop. The mix leans on mid/high harmonics (saws,
   * octave doubles) because phone speakers reproduce almost nothing
   * below ~300 Hz. startMusic(trackIdx) -> loop trackIdx % 3;
   * startMusic(-1) -> menu loop.
   */
  const PATTERN_LEN = 64;
  const LOOKAHEAD = 0.3;
  const RACE_LOOPS = 3;
  const MENU_SONG = 3;

  const SONGS = [
    { // GRID ATTACK — Em C D Bm, hammering out of the first corner
      tempo: 158,
      roots: [82.41, 130.81, 146.83, 123.47],
      lead: [
        659, 0, 587, 659, 784, 0, 659, 587,   659, 0, 494, 0, 392, 440, 494, 0,
        523, 0, 659, 523, 784, 0, 659, 523,   523, 659, 784, 0, 988, 0, 784, 659,
        587, 0, 740, 587, 880, 0, 740, 587,   587, 740, 880, 0, 1175, 880, 740, 0,
        494, 0, 587, 740, 988, 0, 740, 587,   494, 587, 740, 988, 1175, 0, 988, 0,
      ],
    },
    { // SLIPSTREAM — Am Em F G, long straights and a late lift
      tempo: 158,
      roots: [110, 82.41, 87.31, 98],
      lead: [
        440, 0, 523, 587, 659, 0, 523, 440,   440, 523, 659, 0, 880, 0, 659, 523,
        494, 0, 587, 659, 784, 0, 659, 587,   659, 0, 494, 392, 659, 0, 587, 0,
        698, 0, 880, 698, 1047, 0, 880, 698,  698, 880, 1047, 0, 880, 0, 698, 659,
        784, 0, 988, 784, 1175, 0, 988, 784,  587, 659, 784, 988, 1175, 988, 784, 0,
      ],
    },
    { // RED LIGHTS — Dm C Bb A, tense and minor with a sharp turn home
      tempo: 158,
      roots: [146.83, 130.81, 116.54, 110],
      lead: [
        587, 0, 698, 0, 880, 698, 587, 0,     587, 698, 880, 0, 1175, 0, 880, 698,
        523, 0, 659, 0, 784, 659, 523, 0,     523, 659, 784, 1047, 784, 0, 659, 0,
        466, 0, 587, 0, 698, 587, 466, 0,     932, 0, 880, 698, 587, 0, 698, 0,
        440, 0, 554, 659, 880, 0, 659, 554,   440, 554, 659, 880, 1109, 880, 659, 0,
      ],
    },
    { // PADDOCK — Am F C G, calm menu loop
      tempo: 100,
      menu: true,
      roots: [110, 87.31, 130.81, 98],
      lead: [
        440, 0, 0, 0, 523, 0, 0, 0,           659, 0, 0, 587, 523, 0, 440, 0,
        698, 0, 0, 0, 659, 0, 0, 0,           523, 0, 0, 440, 523, 0, 0, 0,
        523, 0, 0, 0, 659, 0, 0, 0,           784, 0, 0, 659, 587, 0, 523, 0,
        494, 0, 0, 0, 587, 0, 0, 0,           494, 0, 0, 440, 392, 0, 0, 0,
      ],
    },
  ];

  function musicNote(freq, type, peak, dur, t0) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function kick(t0, soft) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.1);
    g.gain.setValueAtTime(soft ? 0.3 : 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.2);
    if (soft) return;
    // click transient so the beat reads on small speakers
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(0.02);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.18, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
    src.connect(cg).connect(master);
    src.start(t0);
  }

  function hat(t0, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(0.06);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.16 : 0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (open ? 0.06 : 0.03));
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  function snare(t0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(0.1);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    // body thump
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t0);
    og.gain.setValueAtTime(0.15, t0);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(og).connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  function playStep(i, t0) {
    const song = SONGS[songIdx];
    const bar = (i / 16) | 0;
    const root = song.roots[bar];
    const lead = song.lead[i];

    if (song.menu) {
      // calm: sparse triangle lead, soft kick, light off-beat hats, pads
      if (i % 8 === 0) {
        musicNote(root * 2, "triangle", 0.14, stepDur * 7, t0);
      }
      if (i % 16 === 0) kick(t0, true);
      if (i % 8 === 4) hat(t0, false);
      if (lead) musicNote(lead, "triangle", 0.11, stepDur * 3.5, t0);
      if (i % 16 === 0) {
        musicNote(root * 4, "sine", 0.05, stepDur * 15, t0);
        musicNote(root * 6, "sine", 0.04, stepDur * 15, t0);  // fifth
      }
      return;
    }

    // race loops: driving bass on eighths with an octave bounce
    if (i % 2 === 0) {
      const f = (i % 8 === 6) ? root * 2 : root;
      // saws + octave double: harmonics survive a phone speaker
      musicNote(f, "sawtooth", 0.2, stepDur * 1.8, t0);
      musicNote(f * 2, "square", 0.1, stepDur * 1.6, t0);
    }
    if (i % 4 === 0) kick(t0, false);
    if (i % 8 === 4) snare(t0);                 // backbeat
    if (i % 2 === 1) hat(t0, i % 16 === 15);    // 16th drive, open at bar end
    if (lead) {
      musicNote(lead, "sawtooth", 0.15, stepDur * 2.4, t0);
      musicNote(lead * 1.005, "sawtooth", 0.09, stepDur * 2.4, t0); // detune shimmer
    }
    if (i % 16 === 0) {                          // pad chord on bar starts
      musicNote(root * 4, "triangle", 0.06, stepDur * 14, t0);
      musicNote(root * 6, "triangle", 0.05, stepDur * 14, t0);     // fifth
    }
  }

  function scheduler() {
    if (!musicOn || !ctx) return;
    const t = ctx.currentTime;
    if (nextNoteT < t - 0.25) {
      // fell badly behind (frozen tab, long GC): jump ahead, stay on beat
      const missed = Math.ceil((t + 0.05 - nextNoteT) / stepDur);
      nextNoteT += missed * stepDur;
      step += missed;
    }
    while (nextNoteT < t + LOOKAHEAD) {
      playStep(step % PATTERN_LEN, nextNoteT);
      nextNoteT += stepDur;
      step++;
    }
  }

  function rafPump() {
    if (!musicOn) return;
    scheduler();
    window.requestAnimationFrame(rafPump);
  }

  // trackIdx >= 0 -> race loop trackIdx % 3; trackIdx -1 (or any
  // negative) -> menu loop. Safe no-op before init().
  function startMusic(trackIdx) {
    const idx = (typeof trackIdx === "number") ? trackIdx : 0;
    const next = idx < 0 ? MENU_SONG : ((idx % RACE_LOOPS) + RACE_LOOPS) % RACE_LOOPS;
    if (!ctx) {
      lastTrackIdx = idx;
      return;
    }
    if (musicOn) {
      if (next === songIdx) return;             // already playing this loop
      stopMusic();
    }
    lastTrackIdx = idx;
    songIdx = next;
    stepDur = 60 / SONGS[songIdx].tempo / 4;    // one 16th note
    if (ctx.state !== "running") ctx.resume();
    musicOn = true;
    step = 0;
    nextNoteT = ctx.currentTime + 0.06;
    musicTimer = setInterval(scheduler, 60);
    if (window.requestAnimationFrame) window.requestAnimationFrame(rafPump);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    init,
    setEnabled,
    enabled,
    startEngine,
    stopEngine,
    setEngine,
    setSkid,
    lightOn,
    lightsOut,
    overtakeReady,
    deployBoost,
    collision,
    offtrack,
    lap,
    finish,
    uiTick,
    uiSelect,
    penalty,
    startMusic,
    stopMusic,
  };
})();
