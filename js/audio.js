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
  let engA = null, engB = null, engC = null;     // saw, saw, square (synth fallback)
  let engFilter = null, engGain = null;
  let whineOsc = null, whineGain = null;          // turbo whine
  let harvSrc = null, harvFilter = null, harvGain = null; // MGU-K harvest whirr
  let lfo = null, lfoG = null;                    // offroad pitch wobble (8 Hz)
  let skidSrc = null, skidFilter = null, skidGain = null;
  let engineOn = false;
  let lastSpeed = 0, lastEngT = 0, harvLevel = 0;
  let shiftDuck = 0, shiftDuckT = 0;   // transient engine-gain dip from a gear shift

  // Sample-based engine core: real CC0 recordings (assets/sfx/, from
  // pmndrs/racing-game, CC0). engine = idle/low-rev loop, accel = high-rev loop;
  // we pitch both by playbackRate (so revs rise through a gear and DROP on an
  // upshift) and crossfade idle->accel with load. Falls back to the synth core
  // below if the samples aren't decoded yet (offline / not loaded).
  let engBuf = null, accBuf = null, samplesReady = false;
  let engSrcIdle = null, engSrcAcc = null, engGainIdle = null, engGainAcc = null;
  let usingSamples = false;
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
  const MENU_TRACK = "assets/music/menu.mp3";
  const RACE_TRACKS = [
    "assets/music/menu.mp3",
    "assets/music/menu.mp3",
    "assets/music/menu.mp3",
  ];

  let listenersAttached = false;
  let rebuildTries = 0;
  let lastFailedResume = 0;
  let resumeMusic = false;
  let resumeEngine = false;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Find the most pitch-STABLE ~2s window of a decoded clip, so the engine loop
  // sits on a steady-RPM stretch instead of a dynamic (revving/shifting) part.
  // Uses zero-crossing rate per 0.1s as a cheap pitch proxy and picks the window
  // with the lowest coefficient of variation. Returns { start, end } in seconds.
  function findStableLoop(buf) {
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
    loadEngineSamples();
    return true;
  }

  // Fetch + decode the engine recordings into ctx-bound buffers. Best-effort:
  // if it fails (offline, decode error), samplesReady stays false and the engine
  // falls back to the synth core. Buffers are cleared on a context rebuild.
  function loadEngineSamples() {
    if (!ctx || samplesReady) return;
    const grab = (url) => fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
    Promise.all([grab(SFX_ENGINE), grab(SFX_ACCEL)])
      .then(([e, a]) => { engBuf = e; accBuf = a; samplesReady = true; })
      .catch(() => { /* keep synth fallback */ });
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
    musicGain = null;
    currentUrl = null;
    for (const k in musicBuffers) delete musicBuffers[k];  // buffers are ctx-bound
    engBuf = accBuf = null; samplesReady = false;           // ctx-bound; reload for new ctx
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

    // shared lowpass + master gain for the engine core (samples or synth)
    engFilter = ctx.createBiquadFilter();
    engGain = ctx.createGain();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0;
    engFilter.connect(engGain).connect(master);

    usingSamples = !!(samplesReady && engBuf && accBuf);
    engA = engB = engC = null;
    engSrcIdle = engSrcAcc = engGainIdle = engGainAcc = null;
    if (usingSamples) {
      // real engine recordings: idle loop + acceleration loop, crossfaded and
      // pitched (playbackRate) by rev/gear in setEngine.
      engSrcIdle = ctx.createBufferSource(); engSrcIdle.buffer = engBuf; engSrcIdle.loop = true;
      engSrcAcc = ctx.createBufferSource(); engSrcAcc.buffer = accBuf; engSrcAcc.loop = true;
      // loop the most pitch-stable ~2s stretch of each clip (steady RPM), not the
      // whole dynamic recording, so a held throttle sustains a constant note;
      // start playback in-region.
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
    skidSrc.connect(skidFilter).connect(skidGain).connect(master);

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
    engineOn = false;
  }

  // rev01 0..1 drives engine PITCH (so it revs within a gear and drops on an
  // upshift); speed01 (optional) drives loudness/brightness/harvest so they
  // stay steady across shifts. boost01 0..1 (truthy ok), offroad bool.
  // gear (optional 1..8) gives each gear a distinct base/ceiling so an
  // upshift is clearly heard and 2nd vs 6th differ even at equal rev01.
  function setEngine(rev01, boost01, offroad, speed01, gear) {
    if (!engineOn || !ctx) return;
    const rev = clamp01(rev01 || 0);
    const s = clamp01(typeof speed01 === "number" ? speed01 : (rev01 || 0));
    const b = clamp01(typeof boost01 === "number" ? boost01 : (boost01 ? 1 : 0));
    const t = ctx.currentTime;

    // Per-gear character. g01 = 0 in 1st .. 1 in 8th. Lower gears reach a higher
    // ceiling (short ratios scream); higher gears top out lower (long ratios
    // drone). Used by both the sample (playbackRate) and synth (freq) cores.
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
      // F1-style pitch: every gear starts LOW and screams up to a high redline.
      // A big, near-uniform low->high sweep makes the rev climb obvious; tall
      // gears top out a touch lower so an upshift still drops the pitch. On an
      // upshift rev resets low, so the note snaps back down and climbs again.
      // Pitch is proportional to RPM, and rev01 IS normalized RPM, so a straight
      // linear map is physically correct: every gear reaches the SAME redline
      // note, and an upshift drops the pitch only partially (rpmFor lowers the
      // RPM by the gear ratio — more in low gears, less in high gears). Pitched
      // down overall per feedback; redline kept near where gear 7 sat ("about
      // right"), idle brought lower for a deeper low end.
      const rate = (0.3 + rev * 0.5) * (1 + 0.04 * b);     // idle ~0.30x .. redline ~0.80x (lower, wider sweep)
      engSrcIdle.playbackRate.setTargetAtTime(rate, t, 0.035);
      engSrcAcc.playbackRate.setTargetAtTime(rate, t, 0.035);
      // both loops are pitched together (so the sweep is carried either way);
      // crossfade timbre from the calmer idle loop to the raspier rev loop as the
      // revs rise, for an aggressive top end.
      const acc = clamp01((rev - 0.15) * 1.4);
      engGainAcc.gain.setTargetAtTime(0.7 * acc, t, 0.05);
      engGainIdle.gain.setTargetAtTime(0.6 * (1 - 0.65 * acc), t, 0.05);
    } else {
      // synth fallback: detuned saws + sub follow the per-gear frequency
      const base = (gIdle + rev * gSpan) * (1 + 0.12 * b);
      engA.frequency.setTargetAtTime(base * 0.994, t, 0.025);
      engB.frequency.setTargetAtTime(base * 1.009, t, 0.025);
      engC.frequency.setTargetAtTime(base * 0.5, t, 0.025);
    }

    // lowpass + loudness follow SPEED (steady across shifts); revs add bite.
    // Samples need a higher cutoff floor (they're full recordings) and their own
    // master level since the idle/accel sub-gains already mix them.
    const cut = usingSamples
      ? Math.min(9000, 1400 + s * 5200 + rev * 1600 + b * 1500)
      : Math.min(7200, 600 + s * 4200 + rev * 700 + b * 1400);
    engFilter.frequency.setTargetAtTime(cut, t, 0.05);
    const lvl = usingSamples
      ? (0.3 + s * 0.3 + rev * 0.08 + b * 0.08 + (offroad ? 0.03 : 0))
      : (0.05 + s * 0.05 + rev * 0.02 + b * 0.025 + (offroad ? 0.012 : 0));
    engGain.gain.setTargetAtTime(lvl * (1 - 0.55 * shiftDuck), t, 0.03);

    // turbo whine tracks revs
    whineOsc.frequency.setTargetAtTime(1500 + rev * 2000, t, 0.05);
    whineGain.gain.setTargetAtTime(
      (0.004 + rev * 0.013 + b * 0.008) * (s > 0.04 ? 1 : 0), t, 0.08);

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

    // short synth blip — a filtered saw "chirp". Upshift snaps up and fades;
    // downshift sits lower and blips slightly up (heel-and-toe).
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
    osc.connect(f).connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);

    // a touch of mechanical click via short filtered noise
    noise(isUp ? 0.05 : 0.045, 0.05, isUp ? 2600 : 1800);
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
   * Music is now real, downloaded CC0 tracks (see assets/music/CREDITS.txt),
   * streamed and looped through the AudioContext. The old synth sequencer was
   * removed. startMusic(trackIdx) -> a race loop; startMusic(-1) -> menu loop.
   */
  function ensureMusicGain() {
    if (!musicGain && ctx && master) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.26;            // music sits well under the engine
      musicGain.connect(master);
    }
  }

  function playMusicBuffer(buf, token) {
    if (!ctx || !musicOn || token !== musicToken) return;  // superseded
    ensureMusicGain();
    try { if (musicSrc) { musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {}
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(musicGain);
    src.start();
    musicSrc = src;
  }

  // trackIdx >= 0 -> one of the race loops; trackIdx < 0 -> menu loop.
  // Streams a real CC0 track (lazy-loaded, then cached). No-op before init().
  // Toggle just the music, independent of the master sound toggle. Engine + SFX
  // keep playing when music is off.
  function setMusicEnabled(b) {
    musicEnabled = !!b;
    if (!musicEnabled) stopMusic();
    else if (ctx) startMusic(lastTrackIdx);
  }

  function startMusic(trackIdx) {
    const idx = (typeof trackIdx === "number") ? trackIdx : 0;
    const url = idx < 0 ? MENU_TRACK
      : RACE_TRACKS[((idx % RACE_TRACKS.length) + RACE_TRACKS.length) % RACE_TRACKS.length];
    lastTrackIdx = idx;
    if (!ctx || !musicEnabled) return;   // remember the track but stay silent if music is off
    if (musicOn && currentUrl === url) return;   // already playing this track
    stopMusic();
    musicOn = true;
    currentUrl = url;
    const token = ++musicToken;
    if (ctx.state !== "running") ctx.resume();
    if (musicBuffers[url]) { playMusicBuffer(musicBuffers[url], token); return; }
    fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) {
        return new Promise(function (res, rej) {
          ctx.decodeAudioData(ab, res, rej);     // callback form: older Safari
        });
      })
      .then(function (buf) { musicBuffers[url] = buf; playMusicBuffer(buf, token); })
      .catch(function () { /* music is optional — ignore load/decode errors */ });
  }

  function stopMusic() {
    musicOn = false;
    currentUrl = null;
    musicToken++;                                // cancel any in-flight load
    try { if (musicSrc) { musicSrc.stop(); musicSrc.disconnect(); } } catch (e) {}
    musicSrc = null;
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
    lap,
    finish,
    uiTick,
    uiSelect,
    penalty,
    startMusic,
    stopMusic,
    setMusicEnabled,
    // debug/telemetry: lets tests confirm the recorded engine samples loaded
    debug: function () { return { samplesReady: samplesReady, usingSamples: usingSamples, engineOn: engineOn, loop: engSrcIdle ? { s: +engSrcIdle.loopStart.toFixed(2), e: +engSrcIdle.loopEnd.toFixed(2) } : null }; },
  };
})();
