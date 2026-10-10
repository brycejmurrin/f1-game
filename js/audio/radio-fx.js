/* GameAudioRadioFx: courtesy cues, hiss beds and decoded speech graphs. create(host, signal) reads live context/master/bus/enabled/sfxOk/now services; FX use the SFX bus, recorded voices use master. resetContext stops the bed and disconnects every cached voice chain (M8). */
"use strict";

var GameAudioRadioFx = (function () {
  /** Set when GameAudioRadioFx.create() runs; used by WATCH OpenF1 clips without an engine.js export. */
  let playWatchMediaFn = null;
  function create(host, signal) {
    /* ── TEAM RADIO FX: THE FRAME AROUND THE VOICE ──────────────────────────
     *
     * THE WORDS THEMSELVES ARE OUT OF REACH, and everything below is built
     * around that one fact. speechSynthesis has no node in this graph (the
     * header of js/audio/radio-voice.js says why it lives outside GameAudio at
     * all), and no browser exposes its output as a capturable stream — the Web
     * Speech API has carried an open request for exactly that since 2019 and
     * nothing implements it. So a band-pass ON the voice, which is how every
     * other medium makes a radio sound like a radio, is not available here at
     * any price short of shipping a WASM speech model — and a game with no
     * build step that boots from static files is the wrong shape to pay a
     * 300 MB model for one effect.
     *
     * So the radio character is the FRAME: the key-up click, the band-limited
     * hiss that runs under the line, and the squelch tail when the mic closes.
     * That is also the part the ear actually identifies. The words in a real
     * team radio are what you strain to hear THROUGH those three things.
     *
     * THE BAND IS MEASURED, NOT PICKED. Analogue and digital voice radio alike
     * carry 300 Hz – 3.4 kHz, and that shared band is why every handheld on
     * earth sounds like the same device. The hiss is shaped to it so the bed
     * and the (unshapeable) voice read as one source rather than two.
     *
     * IT FIRES ON THE CARD, NOT ON THE UTTERANCE. showAnnounce is the one place
     * a line reaches the screen, and the SPOKEN radio ships OFF — hanging this
     * on the utterance would have meant almost nobody ever heard it. On the
     * card it inherits the same ANN_PRI queue the voice does, and a player who
     * never turns speech on still gets a race that sounds like team radio.
     */
    const RADIO_LO = 300, RADIO_HI = 3400;
    /* Per channel, because they are not the same source. `control` is a race
       control feed: clean, brief, no tail. `radio` is the engineer talking to a
       car at 300 km/h and gets the full treatment. `coach` gets NOTHING — the
       driving coach is not on a radio, and a squelch on it would be a lie about
       where the line comes from. A channel missing from this table is silent by
       construction, which is the safe direction for a table keyed by a string
       that arrives from js/game.js. */
    const RADIO_CH = Object.freeze({
      // `tune` is [hz, seconds, level] per note, played back to back. See the
      // COURTESY TONE block above for where the engineer's four notes come from.
      control: { click: 0.05, hiss: 0.012, tail: 0,    hi: 4200,    toneAmp: 0.030,
        tune: [[991, 0.10, 1], [1184, 0.12, 0.9]] },
      radio:   { click: 0.09, hiss: 0.030, tail: 0.13, hi: RADIO_HI, toneAmp: 0.038,
        tune: [[1055, 0.105, 0.75], [775, 0.09, 1], [1184, 0.09, 0.85], [991, 0.11, 0.95]] },
    });
    const RADIO_FX_MAX = 1.5;
    let radioFx = 1;        // the player's level; 0 is off
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
    let radioBed = null;    // the live hiss, or null

    /* THE COURTESY TONE — the beep before the message.
     *
     * A beep is NOT only a walkie-talkie convention F1 does not have: F1 team
     * radio has one, it is called a COURTESY TONE, and to anyone who watches the sport it is the
     * most recognisable thing about team radio — you hear the beep, then the
     * driver.
     *
     * GENERIC, NOT A COPY, for two reasons that point the same way. F1's own tone
     * is not published — the one public thread asking for its frequency has no
     * answer — so an "exact" number here would be invented and dressed up as
     * research. And a distinctive broadcast signature is the kind of thing sound
     * trademarks exist for, which an unofficial fan game should not be cloning.
     * So this is a tone in the documented tradition rather than a reproduction.
     *
     * THE TRADITION IS WELL SPECIFIED even where F1's instance is not — but only
     * half of it transfers.
     *
     * NASA's Quindar tones marked the start and end of a transmission at 2525 Hz
     * and 2475 Hz for 250 ms. Those are the numbers everyone quotes, and they are
     * the answer to a problem THIS TONE DOES NOT HAVE: Quindar was IN-BAND
     * SIGNALLING. Its tones rode the same telephone line as live speech and had
     * to key a remote transmitter without ever being mistaken for a voice, which
     * is what pins them just above where speech has its energy. A broadcast
     * courtesy tone plays BEFORE the clip, sharing the channel with nothing, so
     * it is free to sit lower and warmer — and at 2.4-2.6 kHz it lands exactly
     * where the ear is most sensitive and reads thin and piercing instead.
     *
     * WHAT DOES TRANSFER is the shape: a short, near-pure sine, inside the
     * 300 Hz-3.4 kHz voice band. That last part is also why these need no filter
     * of their own — they are already inside the band the hiss is shaped to, so
     * filtering would add three nodes and change nothing you can hear.
     *
     * IT IS FOUR NOTES, NOT ONE. The one CC0 recreation of the F1 beep on
     * Freesound (a synthesiser imitation by its author's own description, never
     * a broadcast rip) FFT'd in its single loudest window reads "a near-pure
     * 786 Hz, 22 dB clear of anything else" — but one window of a melody can
     * only ever see one note of it. A spectrogram across the whole file
     * (2048-point frames, 512 hop) shows a four-note figure:
     *
     *     t≈232 ms  1055 Hz  ~105 ms      C6      +14 cents
     *     t≈348 ms   775 Hz  ~ 90 ms      G5      -20 cents
     *     t≈441 ms  1184 Hz  ~ 90 ms      D6      +14 cents
     *     t≈534 ms   991 Hz  ~110 ms      B5      + 6 cents
     *
     * Down a fourth, up a fifth, down a minor third. Every note lands within a
     * fifth of a semitone of equal temperament and the FFT bin is 21.5 Hz, so the
     * note names are safe and somebody clearly played them on a keyboard. The
     * MEASURED hz are what this table carries even so: the note names are the
     * interpretation, the numbers are the evidence, and 14 cents is inaudible.
     *
     * RACE CONTROL KEEPS ITS OWN, SHORTER CUE — two notes from the same set. The
     * broadcast does not put the team-radio sting over race control either, and
     * two channels that open identically are one channel.
     */
    /** The figure, one oscillator per note, scheduled back to back from `at`.
     *  Returns the seconds it occupies, so the caller can hold the bed over it. */
    function radioTune(seq, peak, at, keep) {
      if (!(peak > 0) || !Array.isArray(seq) || !seq.length) return 0;
      let t = at;
      for (const [hz, secs, lvl] of seq) {
        if (!(hz > 0) || !(secs > 0)) continue;
        const osc = host.context().createOscillator();
        const g = host.context().createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        // A softer attack than the click's 4 ms: a sine snapped on at full level
        // clicks on its own, and five clicks is not what this is. The decay runs
        // just past the note so consecutive notes overlap by a few milliseconds
        // rather than leaving a gap the ear reads as a stutter.
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

    /** One band-limited noise transient — the key click and the squelch tail.
     *  Both ends of the band, unlike the plain noise() one-shots above: a click
     *  with its bottom left in reads as a thud off the car, not a mic. */
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

    /** Cut a transmission short — the card was hidden, the game was paused, or
     *  a higher-priority line preempted this one. */
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
      } catch (e) { /* already stopped, or a ctx torn down under us */ }
      // The figure and the squelch tail are scheduled ahead: stopping only the
      // bed left the squelch to fire seconds later, over the pause menu.
      for (const x of b.extra || []) { try { x.stop(t); } catch (e) { /* already ended */ } }
    }

    /** One transmission: key-up, a hiss bed held for `seconds`, then squelch.
     *
     *  SELF-TERMINATING — the bed carries its own stop time — so a caller that
     *  never closes cannot leak a looping noise source into the race. Re-entrant
     *  for the same reason showAnnounce is: a penalty cutting off the engineer
     *  is a case this game produces on its own. */
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
      // KEY, THEN THE FIGURE, THEN THE LINE — the order the ear expects: the mic
      // opens (a click, which is a noise burst and not an oscillator), and the
      // courtesy figure follows a hair later rather than landing on top of it.
      radioBurst(ch.click * radioFx, 0.045, ch.hi, t0);
      const extra = [];
      const tuneS = 0.03 + radioTune(ch.tune, ch.toneAmp * radioFx, t0 + 0.03, extra);
      // THE BED MUST OUTLAST THE FIGURE. `seconds` is the card's life, and a short
      // card is shorter than four notes — scheduling the squelch tail off that
      // alone closed the mic while the cue was still playing, which is backwards:
      // the tail is the END of a transmission the figure has only just opened.
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
      // The tail is the single most recognisable part of a two-way radio: the
      // burst you hear AFTER the talking stops, when the mic un-keys.
      if (ch.tail > 0) { const tail = radioBurst(ch.tail * radioFx, 0.07, ch.hi, t0 + hold); if (tail) extra.push(tail); }
      return true;
    }

    /* RECORDED RADIO VOICE (js/audio/voice-pack.js). The clips are clean studio
     * renders, so the radio is made here: the same 300 Hz-3.4 kHz band as the
     * hiss bed, a soft-clip for the cheap mic being shouted into, and a
     * compressor so a spliced line of clips from different sentences comes out
     * at one level. Into MASTER, not the effects bus: the SOUND EFFECTS switch
     * does not silence the engineer, the same as speech synthesis, which never
     * went through WebAudio at all. `spotter` keys its own mic (a click in, a
     * squelch out) because it has no card, and so no radioSting, to open it. */
    // `fx` picks the sound, `channel` the transmission slot: the commentator,
    // race control and the coach are all on the card's slot (one line at a time)
    // but do not all sound like a team radio. The commentator is the broadcast —
    // full band, barely driven — and race control a cleaner radio than the pit wall's.
    const VOICE_CH = Object.freeze({
      radio:     { lo: RADIO_LO, hi: RADIO_HI, drive: 2.2, level: 0.95, click: 0 },
      spotter:   { lo: RADIO_LO, hi: RADIO_HI, drive: 2.8, level: 1.0,  click: 0.07 },
      control:   { lo: RADIO_LO, hi: RADIO_HI, drive: 1.6, level: 0.9,  click: 0 },
      coach:     { lo: 90,       hi: 9000,     drive: 1.1, level: 0.9,  click: 0 },
      announcer: { lo: 90,       hi: 9000,     drive: 1.1, level: 0.85, click: 0 },
    });
    /* ONE CHAIN PER SOUND, built once per context and shared by every line: a
     * filter pair, the soft-clip and a compressor were built (and torn down) per
     * LINE, and on a phone a DynamicsCompressor is not a free node. A line now
     * adds only its buffer sources and one gain, its own so that cutting it off
     * fades this line and not the one that replaced it.
     *
     * M8 — BOUNDED + CLEANED. Keys are `fx` (control/coach/announcer) or
     * `fx:preset` (radio/spotter × modern/clean/vintage): at most 9. Before
     * this, a player who skimmed every radio preset left every chain wired into
     * master for the rest of the session; resetContext only cleared the Map, so
     * the nodes kept rendering. Now: disconnect on drop, prune foreign presets
     * in setRadioPreset, and LRU-evict if the Map somehow exceeds VOICE_CHAIN_MAX. */
    const VOICE_CHAIN_MAX = 9;
    const _voiceChains = new Map();   // fx -> { ctx, input, nodes }
    function dropVoiceChain(ent) {
      if (!ent || !ent.nodes) return;
      for (const n of ent.nodes) { try { n.disconnect(); } catch (e) { /* closed or already gone */ } }
    }
    /** Drop radio/spotter chains that belong to a preset other than `id`. */
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
        // Touch for LRU: Map insertion order is the eviction order.
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
    /** Decode one clip's bytes. Rejects without a context. */
    function decodeClip(ab) {
      if (!host.context()) return Promise.reject(new Error("no audio context"));
      return new Promise((res, rej) => host.context().decodeAudioData(ab, res, rej));
    }
    let voicesLive = 0;
    const CLIP_OVERLAP_S = 0.05;
    /** Play decoded clips back to back from `at` (numbers in `parts` are pauses,
     *  in seconds). Returns { end, stop } or null when nothing can play. */
    function radioVoice(parts, at, o) {
      if (!host.context() || !host.master() || !host.enabled() || !Array.isArray(parts)) return null;
      // A suspended context (an iOS interruption, no gesture yet) keeps its
      // clock still: lines scheduled on it all play at once when it resumes.
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
        // Two clips back to back overlap a little: each fragment was rendered
        // alone and decays like the end of a sentence, and running the next one
        // over that tail is what makes a splice sound like one breath.
        if (joined) t = Math.max(t0, t - CLIP_OVERLAP_S);
        const s = host.context().createBufferSource();
        s.buffer = p;
        s.connect(g);
        s.start(t);
        srcs.push(s);
        t += p.duration;
        joined = true;
      }
      const nodes = [g];
      let dead = false;
      /* SPOTTER OWNS ITS OWN MUSIC DUCK. The engineer ducks from radio-voice.js;
       * the spotter never goes through that module, so the hold is latched here
       * for the life of the clip and released once on teardown/stop. Same depth
       * as the engineer (host.setSpotterDuck → 0.35); a separate latch so an
       * engineer setRadioDuck(false) cannot cut it short mid-call. */
      let spotterDuck = false;
      const releaseSpotterDuck = () => {
        if (!spotterDuck) return;
        spotterDuck = false;
        if (host.setSpotterDuck) host.setSpotterDuck(false);
      };
      const teardown = () => {
        if (dead) return;
        dead = true; voicesLive--;
        releaseSpotterDuck();
        for (const s of srcs) { try { s.disconnect(); } catch (e) { /* gone */ } }
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
      };
      if (!srcs.length) { dead = true; for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } return null; }
      voicesLive++;
      if (fx === "spotter" && host.setSpotterDuck) {
        spotterDuck = true;
        host.setSpotterDuck(true);
      }
      srcs[srcs.length - 1].onended = teardown;
      let tail = null;   // the closing squelch: cancelled with the line, or it lands inside whatever cut it
      if (ch.click > 0 && radioFx > 0) {
        radioBurst(ch.click * radioFx, 0.04, ch.hi, Math.max(host.now(), t0 - 0.05));
        tail = radioBurst(ch.click * 1.3 * radioFx, 0.06, ch.hi, t + 0.02);
      }
      return {
        end: t,
        stop() {
          if (dead) return;
          const tt = host.now();
          try { g.gain.setTargetAtTime(0, tt, 0.015); } catch (e) { /* torn down */ }
          for (const s of srcs) { try { s.stop(tt + 0.06); } catch (e) { /* not started, or ended */ } }
          if (tail) { try { tail.stop(tt); } catch (e) { /* already played */ } }
          releaseSpotterDuck();
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

    /* OPENF1 WATCH CLIPS (js/race/real-replay.js): recorded team radio through the
     * same band-pass / soft-clip / compressor chain as voice-pack lines, with music
     * ducking for the clip's lifetime. MediaElementSource when CORS allows; else
     * fetch+decode into radioVoice; else plain HTMLAudio with duck only. */
    const _watchClips = new Set();
    let _watchSeq = 0;
    function radioMediaClip(url, o) {
      if (!url || typeof url !== "string") return null;
      const vol = Math.max(0, Math.min(1, o && o.volume != null ? +o.volume || 0 : 1));
      if (!(vol > 0) || !host.enabled() || !host.sfxOk()) return null;
      let ducked = false;
      // Its own duck source: the engineer's setRadioDuck(false) on a card replace
      // (and another clip ending) must not lift the music under this clip.
      const duckId = "watch:" + (++_watchSeq);
      const duck = () => {
        if (ducked) return;
        if (typeof GameAudio !== "undefined" && GameAudio.setRadioDuck) { GameAudio.setRadioDuck(true, duckId); ducked = true; }
      };
      const releaseDuck = () => {
        if (!ducked) return;
        if (typeof GameAudio !== "undefined" && GameAudio.setRadioDuck) GameAudio.setRadioDuck(false, duckId);
        ducked = false;
      };
      duck();
      let dead = false;
      let el = null;
      let nodes = [];
      let voiceHandle = null;
      let chained = false;
      let ended = false;
      const entry = {};
      const teardown = () => {
        if (dead) return;
        dead = true;
        ended = true;
        _watchClips.delete(entry);
        releaseDuck();
        if (voiceHandle && voiceHandle.stop) { try { voiceHandle.stop(); } catch (e) { /* gone */ } voiceHandle = null; }
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
        nodes = [];
        if (el) {
          el.onended = el.onerror = null;
          try { el.pause(); } catch (e) { /* gone */ }
          el = null;
        }
      };
      entry.teardown = teardown;
      _watchClips.add(entry);
      const handle = {
        get chained() { return chained; },
        get paused() { return dead || ended || (el ? el.paused : !voiceHandle); },
        get ended() { return ended || (el ? el.ended : dead || !voiceHandle); },
        pause() { teardown(); },
        play() {
          if (dead || !el) return Promise.resolve();
          return el.play().catch(() => { teardown(); });
        },
        stop() { teardown(); },
      };
      function plainFallback() {
        chained = false;
        if (typeof Audio === "undefined") { teardown(); return null; }
        el = new Audio(url);
        el.volume = Math.min(1, vol);
        el.onended = el.onerror = () => teardown();
        const p = el.play();
        if (p && p.catch) p.catch(() => teardown());
        return handle;
      }
      const disconnectMedia = () => {
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
        nodes = [];
        if (el) { el.onended = el.onerror = null; el = null; }
        chained = false;
      };
      // ONE FALLBACK PER CLIP. A failing media element fires `error` AND rejects the
      // pending play() promise; both used to run disconnectMedia + tryFetchDecode,
      // so the clip was fetched and put on air twice (the first handle lost).
      let fellBack = false;
      const fallBack = () => {
        if (dead || fellBack) return;
        fellBack = true;
        disconnectMedia();
        tryFetchDecode();
      };
      const tryFetchDecode = () => {
        if (dead || typeof fetch !== "function" || !host.context()) { plainFallback(); return; }
        fetch(url, { mode: "cors", credentials: "omit" }).then((r) => {
          if (!r.ok) throw new Error("fetch " + r.status);
          return r.arrayBuffer();
        }).then((ab) => decodeClip(ab)).then((buf) => {
          if (dead) return;
          const h = radioVoice([buf], host.now(), { fx: "radio", channel: "radio", volume: vol });
          if (!h) { plainFallback(); return; }
          chained = true;
          voiceHandle = h;
          const endAt = (h.end - host.now()) * 1000 + 150;
          setTimeout(() => { if (!dead) teardown(); }, Math.max(50, endAt));
        }).catch(() => { if (!dead) plainFallback(); });
      };
      const ctx = host.context();
      if (!ctx || ctx.state === "closed" || ctx.state !== "running") return plainFallback();
      el = new Audio();
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      try {
        const mediaSrc = ctx.createMediaElementSource(el);
        const preset = RADIO_PRESETS[radioPreset];
        const ch = Object.assign({}, VOICE_CH.radio, {
          lo: preset.lo, hi: preset.hi, drive: preset.drive, click: 0,
        });
        const g = ctx.createGain();
        g.gain.value = ch.level * vol;
        mediaSrc.connect(g);
        g.connect(voiceChain("radio:" + radioPreset, ch));
        nodes = [mediaSrc, g];
        chained = true;
        el.onended = () => teardown();
        el.onerror = fallBack;
        el.src = url;
        const p = el.play();
        if (p && p.catch) p.catch(fallBack);
        return handle;
      } catch (e) {
        fallBack();
        return handle;
      }
    }
    playWatchMediaFn = radioMediaClip;

    return {
      decodeClip, radioVoice, radioSting, radioStingStop, setRadioFx, setRadioPreset, radioMediaClip,
      radioPreset: () => radioPreset,
      radioPresets: () => Object.entries(RADIO_PRESETS).map(([id, p]) => [id, p.name]),
      radioVoicesLive: () => voicesLive,
      voiceChainsLive: () => _voiceChains.size,
      radioFxLevel: () => radioFx,
      /** How long `channel`'s courtesy figure runs, in seconds, at the current
       *  level — 0 when it would not play at all. The VOICE waits this out so the
       *  words land after the cue instead of under it (js/audio/radio-voice.js
       *  plan(), `lead`), and it is derived from the same table that plays it so
       *  the two cannot drift. */
      radioLeadS(channel) {
        const ch = RADIO_CH[channel];
        if (channel === "radio" && !RADIO_PRESETS[radioPreset].cue) return 0;
        if (!ch || radioFx <= 0 || !Array.isArray(ch.tune)) return 0;
        return 0.03 + ch.tune.reduce((a, n) => a + (n && n[1] > 0 ? n[1] : 0), 0);
      },
      radioFxMax: () => RADIO_FX_MAX,
      radioChannels: () => Object.keys(RADIO_CH),
      resetContext() {
        radioStingStop();
        for (const w of _watchClips) w.teardown();
        _watchClips.clear();
        for (const ent of _voiceChains.values()) dropVoiceChain(ent);
        _voiceChains.clear();
        radioBed = null;
      },
    };
  }
  function playWatchMedia(url, o) {
    return playWatchMediaFn ? playWatchMediaFn(url, o) : null;
  }
  return { create, playWatchMedia };
})();
Object.freeze(GameAudioRadioFx);
