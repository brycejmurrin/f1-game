"use strict";

var GameAudioRadioFx = (function () {
  function create(host, signal) {
    const RADIO_LO = 300, RADIO_HI = 3400;
    const RADIO_CH = Object.freeze({
      control: { click: 0.05, hiss: 0.012, tail: 0,    hi: 4200,    toneAmp: 0.030,
        tune: [[991, 0.10, 1], [1184, 0.12, 0.9]] },
      radio:   { click: 0.09, hiss: 0.030, tail: 0.13, hi: RADIO_HI, toneAmp: 0.038,
        tune: [[1055, 0.105, 0.75], [775, 0.09, 1], [1184, 0.09, 0.85], [991, 0.11, 0.95]] },
    });
    const RADIO_FX_MAX = 1.5;
    let radioFx = 1;
    const RADIO_PRESETS = Object.freeze({
      modern: { name: "MODERN RADIO", lo: 300, hi: 3400, drive: 2.2, noise: 1, cue: true },
      clean: { name: "CLEAN HEADSET", lo: 100, hi: 9000, drive: 1.1, noise: 0, cue: false },
      vintage: { name: "VINTAGE RADIO", lo: 450, hi: 2800, drive: 3.2, noise: 1.5, cue: true },
    });
    let radioPreset = "modern";
    function setRadioPreset(id) {
      if (!Object.prototype.hasOwnProperty.call(RADIO_PRESETS, id)) return radioPreset;
      radioStingStop();
      if (radioPreset === id) return radioPreset;
      radioPreset = id;
      pruneForeignVoiceChains(id);
      return radioPreset;
    }
    let radioBed = null;

    function radioTune(seq, peak, at, keep) {
      if (!(peak > 0) || !Array.isArray(seq) || !seq.length) return 0;
      let t = at;
      for (const [hz, secs, lvl] of seq) {
        if (!(hz > 0) || !(secs > 0)) continue;
        const osc = host.context().createOscillator();
        const g = host.context().createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        signal.env(g, t, peak * (lvl == null ? 1 : lvl), 0.012, secs);
        osc.connect(g).connect(host.bus());
        osc.start(t);
        osc.stop(t + secs + 0.04);
        osc.onended = () => { osc.disconnect(); g.disconnect(); };
        if (keep) keep.push(osc);
        t += secs;
      }
      return t - at;
    }

    function radioBurst(peak, decay, hi, at) {
      if (!(peak > 0)) return null;
      const src = host.context().createBufferSource();
      const off = signal.bindNoise(src, decay + 0.15);
      const hp = host.context().createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = RADIO_LO;
      const lp = host.context().createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = hi;
      const g = host.context().createGain();
      signal.env(g, at, peak, 0.004, decay);
      src.connect(hp).connect(lp).connect(g).connect(host.bus());
      src.start(at, off);
      src.stop(at + decay + 0.1);
      src.onended = () => { src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); };
      return src;
    }

    function radioStingStop() {
      if (!radioBed) return;
      const b = radioBed;
      radioBed = null;
      const t = host.now();
      try {
        b.gain.gain.cancelScheduledValues(t);
        b.gain.gain.setValueAtTime(b.gain.gain.value, t);
        b.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        b.src.stop(t + 0.08);
      } catch (e) {  }
      for (const x of b.extra || []) { try { x.stop(t); } catch (e) {  } }
    }

    function radioSting(channel, seconds) {
      radioStingStop();
      const preset = RADIO_PRESETS[radioPreset];
      const base = RADIO_CH[channel];
      const ch = base && channel === "radio" ? Object.assign({}, base, {
        lo: preset.lo, hi: preset.hi, click: base.click * preset.noise, hiss: base.hiss * preset.noise,
        tail: base.tail * preset.noise, toneAmp: preset.cue ? base.toneAmp : 0,
      }) : base;
      if (channel === "radio" && !preset.cue) return false;
      if (!host.sfxOk() || !ch || radioFx <= 0) return false;
      const t0 = host.now();
      radioBurst(ch.click * radioFx, 0.045, ch.hi, t0);
      const extra = [];
      const tuneS = 0.03 + radioTune(ch.tune, ch.toneAmp * radioFx, t0 + 0.03, extra);
      const hold = Math.max(0.25, tuneS + 0.12, Math.min(8, +seconds || 1.5));
      const src = host.context().createBufferSource();
      src.loop = true;
      src.buffer = signal.noisePool();
      const hp = host.context().createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = ch.lo || RADIO_LO;
      const lp = host.context().createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = ch.hi;
      const g = host.context().createGain();
      const peak = ch.hiss * radioFx;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
      g.gain.setValueAtTime(peak, t0 + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + hold + 0.12);
      src.connect(hp).connect(lp).connect(g).connect(host.bus());
      src.start(t0, Math.random() * (signal.noisePoolSeconds - 0.5));
      src.stop(t0 + hold + 0.2);
      src.onended = () => { src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); };
      radioBed = { src, gain: g, extra };
      if (ch.tail > 0) { const tail = radioBurst(ch.tail * radioFx, 0.07, ch.hi, t0 + hold); if (tail) extra.push(tail); }
      return true;
    }

    const VOICE_CH = Object.freeze({
      radio:     { lo: RADIO_LO, hi: RADIO_HI, drive: 2.2, level: 0.95, click: 0 },
      spotter:   { lo: RADIO_LO, hi: RADIO_HI, drive: 2.8, level: 1.0,  click: 0.07 },
      control:   { lo: RADIO_LO, hi: RADIO_HI, drive: 1.6, level: 0.9,  click: 0 },
      coach:     { lo: 90,       hi: 9000,     drive: 1.1, level: 0.9,  click: 0 },
      announcer: { lo: 90,       hi: 9000,     drive: 1.1, level: 0.85, click: 0 },
    });
    const VOICE_CHAIN_MAX = 9;
    const _voiceChains = new Map();
    function dropVoiceChain(ent) {
      if (!ent || !ent.nodes) return;
      for (const n of ent.nodes) { try { n.disconnect(); } catch (e) {  } }
    }
    function pruneForeignVoiceChains(id) {
      for (const [k, ent] of [..._voiceChains]) {
        if (!(k.startsWith("radio:") || k.startsWith("spotter:"))) continue;
        if (k === "radio:" + id || k === "spotter:" + id) continue;
        dropVoiceChain(ent);
        _voiceChains.delete(k);
      }
    }
    function voiceChain(fx, ch) {
      const have = _voiceChains.get(fx);
      if (have && have.ctx === host.context()) {
        _voiceChains.delete(fx);
        _voiceChains.set(fx, have);
        return have.input;
      }
      if (have) { dropVoiceChain(have); _voiceChains.delete(fx); }
      const hp = host.context().createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = ch.lo;
      const lp = host.context().createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = ch.hi;
      const ws = host.context().createWaveShaper(); ws.curve = softClip(ch.drive);
      const comp = host.context().createDynamicsCompressor();
      comp.threshold.value = -26; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
      hp.connect(lp).connect(ws).connect(comp).connect(host.master());
      _voiceChains.set(fx, { ctx: host.context(), input: hp, nodes: [hp, lp, ws, comp] });
      while (_voiceChains.size > VOICE_CHAIN_MAX) {
        const oldest = _voiceChains.keys().next().value;
        dropVoiceChain(_voiceChains.get(oldest));
        _voiceChains.delete(oldest);
      }
      return hp;
    }
    const _shapes = new Map();
    function softClip(k) {
      let c = _shapes.get(k);
      if (c) return c;
      c = new Float32Array(1024);
      const n = Math.tanh(k);
      for (let i = 0; i < c.length; i++) { const x = i / (c.length - 1) * 2 - 1; c[i] = Math.tanh(k * x) / n; }
      _shapes.set(k, c);
      return c;
    }
    function decodeClip(ab) {
      if (!host.context()) return Promise.reject(new Error("no audio context"));
      return new Promise((res, rej) => host.context().decodeAudioData(ab, res, rej));
    }
    let voicesLive = 0;
    const CLIP_OVERLAP_S = 0.05;
    function radioVoice(parts, at, o) {
      if (!host.context() || !host.master() || !host.enabled() || !Array.isArray(parts)) return null;
      if (host.context().state && host.context().state !== "running") return null;
      const fx = VOICE_CH[o && o.fx] ? o.fx : VOICE_CH[o && o.channel] ? o.channel : "radio";
      const preset = RADIO_PRESETS[radioPreset];
      const isRadio = fx === "radio" || fx === "spotter";
      const ch = isRadio ? Object.assign({}, VOICE_CH[fx], {
        lo: preset.lo, hi: preset.hi, drive: preset.drive * (fx === "spotter" ? 2.8 / 2.2 : 1), click: VOICE_CH[fx].click * preset.noise,
      }) : VOICE_CH[fx];
      const vol = Math.max(0, Math.min(1, o && o.volume != null ? +o.volume || 0 : 1));
      if (!(vol > 0)) return null;
      const t0 = Math.max(host.now(), +at || 0);
      const g = host.context().createGain(); g.gain.value = ch.level * vol;
      g.connect(voiceChain(isRadio ? fx + ":" + radioPreset : fx, ch));
      const srcs = [];
      let t = t0, joined = false;
      for (const p of parts) {
        if (typeof p === "number") { t += Math.max(0, p); joined = false; continue; }
        if (!p || !(p.duration > 0)) continue;
        if (joined) t = Math.max(t0, t - CLIP_OVERLAP_S);
        const s = host.context().createBufferSource();
        s.buffer = p;
        s.connect(g);
        s.start(t);
        srcs.push(s);
        t += p.duration;
        joined = true;
      }
      const nodes = [g], focusOwner = {};
      const focusContext = host.context();
      let dead = false;
      let spotterDuck = false;
      const releaseSpotterDuck = () => {
        if (!spotterDuck) return;
        spotterDuck = false;
        if (host.setSpotterDuck) host.setSpotterDuck(false);
      };
      const teardown = () => {
        if (dead) return;
        dead = true; voicesLive--;
        if (host.setVoiceFocusHold) host.setVoiceFocusHold(false, focusOwner);
        releaseSpotterDuck();
        for (const s of srcs) { try { s.disconnect(); } catch (e) {  } }
        for (const n of nodes) { try { n.disconnect(); } catch (e) {  } }
      };
      if (!srcs.length) { dead = true; for (const n of nodes) { try { n.disconnect(); } catch (e) {  } } return null; }
      voicesLive++;
      if ((!o || o.channel !== "coach") && host.setVoiceFocusSpan) host.setVoiceFocusSpan(focusOwner, t0, t, focusContext);
      if (fx === "spotter" && host.setSpotterDuck) {
        spotterDuck = true;
        host.setSpotterDuck(true);
      }
      srcs[srcs.length - 1].onended = teardown;
      let tail = null;
      if (ch.click > 0 && radioFx > 0) {
        radioBurst(ch.click * radioFx, 0.04, ch.hi, Math.max(host.now(), t0 - 0.05));
        tail = radioBurst(ch.click * 1.3 * radioFx, 0.06, ch.hi, t + 0.02);
      }
      return {
        end: t,
        stop() {
          if (dead) return;
          const tt = host.now();
          try { g.gain.setTargetAtTime(0, tt, 0.015); } catch (e) {  }
          for (const s of srcs) { try { s.stop(tt + 0.06); } catch (e) {  } }
          if (tail) { try { tail.stop(tt); } catch (e) {  } }
          releaseSpotterDuck();
          if (host.setVoiceFocusHold) host.setVoiceFocusHold(false, focusOwner);
          setTimeout(teardown, 120);
        },
      };
    }

    function setRadioFx(v) {
      const n = +v;
      radioFx = Number.isFinite(n) ? Math.max(0, Math.min(RADIO_FX_MAX, n)) : 1;
      if (radioFx <= 0) radioStingStop();
      return radioFx;
    }

    return {
      decodeClip, radioVoice, radioSting, radioStingStop, setRadioFx, setRadioPreset,
      radioPreset: () => radioPreset,
      radioPresets: () => Object.entries(RADIO_PRESETS).map(([id, p]) => [id, p.name]),
      radioVoicesLive: () => voicesLive,
      voiceChainsLive: () => _voiceChains.size,
      radioFxLevel: () => radioFx,
      radioLeadS(channel) {
        const ch = RADIO_CH[channel];
        if (channel === "radio" && !RADIO_PRESETS[radioPreset].cue) return 0;
        if (!ch || radioFx <= 0 || !Array.isArray(ch.tune)) return 0;
        return 0.03 + ch.tune.reduce((a, n) => a + (n && n[1] > 0 ? n[1] : 0), 0);
      },
      radioFxMax: () => RADIO_FX_MAX,
      resetContext() {
        radioStingStop();
        for (const ent of _voiceChains.values()) dropVoiceChain(ent);
        _voiceChains.clear();
        radioBed = null;
      },
    };
  }
  return { create };
})();
Object.freeze(GameAudioRadioFx);
