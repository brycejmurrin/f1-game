/* GameAudioSignal: sample analysis and SFX primitives. create({ context, bus, sfxOk, now }) uses live service functions; resetContext discards only the context-bound noise cache. */
"use strict";

var GameAudioSignal = (function () {
  // Session-wide blip fire count (all create() hosts). Unit tests that used to
  // count OscillatorNode.start() need this once voices are pooled and started
  // once; the audible path does not read it.
  let blipFireTotal = 0;

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

  function create(host) {
    function env(gainNode, t0, peak, attack, decay) {
      const g = gainNode.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0.0001, t0);
      g.linearRampToValueAtTime(peak, t0 + attack);
      g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }

    /* Fixed-size blip voice pool. OscillatorNode is one-shot after stop(), so
       each voice stays alive: start once, envelope the gain, reuse. Overrun
       crackle used to allocate osc+gain on every pop (~5–15 Hz on a sustained
       lift); UI / brake / shift blips share the same pool. Envelope + frequency
       math is unchanged — only the node lifetime differs. */
    const BLIP_POOL = 8;
    const blipVoices = []; // { osc, g, freeAt }
    let blipFired = 0;

    function acquireBlipVoice(t0) {
      let v = null;
      for (let i = 0; i < blipVoices.length; i++) {
        if (blipVoices[i].freeAt <= t0) { v = blipVoices[i]; break; }
      }
      if (!v && blipVoices.length < BLIP_POOL) {
        const osc = host.context().createOscillator();
        const g = host.context().createGain();
        g.gain.value = 0.0001;
        osc.connect(g).connect(host.bus());
        osc.start(0);
        v = { osc, g, freeAt: 0 };
        blipVoices.push(v);
      }
      if (!v) {
        v = blipVoices[0];
        for (let i = 1; i < blipVoices.length; i++) {
          if (blipVoices[i].freeAt < v.freeAt) v = blipVoices[i];
        }
      }
      return v;
    }

    function blip(freq, type, peak, attack, decay, slideTo, when) {
      if (!host.sfxOk()) return;
      const t0 = host.now() + (when || 0);
      const dur = attack + decay;
      const v = acquireBlipVoice(t0);
      blipFired++;
      blipFireTotal++;
      v.freeAt = t0 + dur + 0.05;
      const osc = v.osc, g = v.g;
      osc.type = type;
      osc.frequency.cancelScheduledValues(t0);
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      env(g, t0, peak, attack, decay);
    }

    function blipStats() {
      return { fired: blipFired, pool: blipVoices.length, poolCap: BLIP_POOL };
    }

    function noiseBuf(seconds) {
      const len = Math.ceil(host.context().sampleRate * seconds);
      const buf = host.context().createBuffer(1, len, host.context().sampleRate);
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
       keep independent buffers; engine loops reuse theirs within this context,
       while rain in particular needs its own seamless 4 s loop.

       Context-bound like engBuf, so rebuildCtx() must clear it. */
    const NOISE_POOL_S = 3;
    let noisePoolBuf = null;
    // Separate layer keys preserve independent noise even at equal durations.
    // Buffers are immutable after generation; sources remain single-use. Cleared
    // with every new context so a resume rebuild never retains the old PCM.
    const _loopNoise = new Map();
    function loopNoise(name, seconds) {
      let buf = _loopNoise.get(name);
      if (!buf) { buf = noiseBuf(seconds); _loopNoise.set(name, buf); }
      return buf;
    }
    function noisePool() {
      if (!noisePoolBuf) noisePoolBuf = noiseBuf(NOISE_POOL_S);
      return noisePoolBuf;
    }
    function bindNoise(src, needS) {
      if (needS >= NOISE_POOL_S) { src.buffer = noiseBuf(needS); return 0; }
      src.buffer = noisePool();
      return Math.random() * (NOISE_POOL_S - needS);
    }

    // White-noise one-shots share the graph, offset selection, envelope and teardown.
    function noiseBurst(peak, decay, filter) {
      const t0 = host.now() + (filter.when || 0);
      const src = host.context().createBufferSource();
      const off = bindNoise(src, decay + 0.15);
      const f = host.context().createBiquadFilter();
      f.type = filter.type;
      if (filter.q != null) f.Q.value = filter.q;
      if (filter.slideTo != null) {
        f.frequency.setValueAtTime(filter.frequency, t0);
        f.frequency.exponentialRampToValueAtTime(filter.slideTo, t0 + decay);
      } else f.frequency.value = filter.frequency;
      const g = host.context().createGain();
      env(g, t0, peak, filter.attack, decay);
      src.connect(f).connect(g).connect(host.bus());
      src.start(t0, off);
      src.stop(t0 + decay + 0.1);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    }
    function noise(peak, decay, filterFreq, when) {
      if (!host.sfxOk()) return;
      noiseBurst(peak, decay, { type: "lowpass", frequency: filterFreq, attack: 0.005, when });
    }
    // A falling band-passed hiss: a wastegate rounds off as its pressure goes.
    function hiss(peak, decay, f0, f1) {
      if (!host.sfxOk() || !(peak > 0)) return;
      noiseBurst(peak, decay, { type: "bandpass", frequency: f0, slideTo: f1, q: 1.4, attack: 0.008 });
    }
    function scrapeNoise(peak, decay) {
      if (!host.sfxOk()) return;
      noiseBurst(peak, decay, { type: "bandpass", frequency: 2600, q: 1.2, attack: 0.02 });
    }

    return { env, blip, blipStats, noiseBuf, loopNoise, noisePool, bindNoise, noise, hiss, scrapeNoise,
      noisePoolSeconds: NOISE_POOL_S,
      resetContext() {
        noisePoolBuf = null;
        _loopNoise.clear();
        for (let i = 0; i < blipVoices.length; i++) {
          const v = blipVoices[i];
          try { v.osc.disconnect(); } catch (e) { /* closed ctx */ }
          try { v.g.disconnect(); } catch (e) { /* closed ctx */ }
        }
        blipVoices.length = 0;
      },
    };
  }
  return {
    create, detectPeriod, findStableLoop,
    blipFireTotal() { return blipFireTotal; },
  };
})();
Object.freeze(GameAudioSignal);
