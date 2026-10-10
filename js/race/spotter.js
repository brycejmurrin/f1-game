"use strict";
/* Spotter — "car left", "car right", "clear": the call a driver gets when a
 * car is alongside, which a mirror at 300 km/h does not give you. Crew Chief's
 * spotter is the model: overlap by nose-to-tail distance and side, a short
 * debounce so a car darting in and out does not stutter the call, "clear" only
 * after a call was actually made, and one "still there" if it stays.
 *
 * Audio only, and only from the recorded voice pack (js/audio/voice-pack.js):
 * a spotter call is useless late, and speech synthesis' start-up delay makes
 * it late, so with no pack there is no spotter rather than a slow one.
 *
 * Reads car positions in the TRACK frame (arc s, lateral x) and nothing about
 * the track's curvature — the same frame js/audio/rivals.js uses.
 */
var Spotter = (() => {
  /** key → the text the voice pack records for it (tools/gen/voicepack.mjs). */
  const KEYS = Object.freeze({
    "car left": "Car left.", "car right": "Car right.", "three wide": "Three wide.",
    "clear": "Clear.", "still there": "Still there.",
  });
  const OVERLAP_ARC = 5.4;     // metres nose to tail: a car length and a bit
  const SIDE_MIN = 0.9;        // closer than this laterally is behind/ahead in line, not beside
  const SIDE_MAX = 4.2;        // wider than this is a lane over, not alongside
  const CLEAR_S = 0.4;         // releasing space needs more evidence than detecting a car
  const DEBOUNCE_S = 0.2;      // a side must hold this long before it changes the call
  const STILL_S = 4;           // one "still there" after this long alongside
  const GAP_S = 0.6;           // at least this between two calls: lights-out is a wall of left/right/three-wide
  const LEFT = 1, RIGHT = 2;

  function fresh() { return { cur: 0, cand: 0, candT: 0, t: 0, lastCallT: -1e9, called: false, stillSaid: false }; }

  /** Which sides are occupied: bit 1 left, bit 2 right. Lateral x is +right. */
  function occupancy(player, cars, lapLen, previous = 0) {
    let occ = 0;
    if (!player || !Number.isFinite(player.s) || !Number.isFinite(player.x ?? 0) || !cars || !(lapLen > 0) || !Number.isFinite(lapLen)) return 0;
    const half = lapLen * 0.5;
    for (const c of cars) {
      if (c === player || c.retired || !Number.isFinite(c.s) || !Number.isFinite(c.x ?? 0) || (c.pitState && c.pitState !== "none")) continue;
      const arc = ((c.s - player.s) % lapLen + lapLen + half) % lapLen - half;
      const lat = (c.x || 0) - (player.x || 0), side = lat < 0 ? LEFT : RIGHT;
      // A car already alongside must leave a slightly larger envelope. Sensor
      // jitter at the nose/tail threshold must not mean "clear, car left".
      const held = !!(previous & side), a = Math.abs(lat);
      if (Math.abs(arc) > OVERLAP_ARC + (held ? 0.8 : 0)) continue;
      if (a < (held ? SIDE_MIN * 0.5 : SIDE_MIN) || a > SIDE_MAX + (held ? 0.5 : 0)) continue;
      occ |= side;
    }
    return occ;
  }

  /** Advance the state by dt with the current occupancy; returns a KEYS key or "". Pure.
   *  `canSpeak(key)` is asked BEFORE a call is committed: when the channel is
   *  taken the side change stays pending and is called on a later tick,
   *  instead of being marked as said and lost — "car left" is the one call
   *  that must never go missing. Omitted, every call can be spoken. */
  function step(st, occ, dt, canSpeak) {
    if (!Number.isFinite(dt) || dt <= 0) return "";
    dt = Math.min(dt, 0.1);
    st.t += dt;
    if (occ !== st.cand) { st.cand = occ; st.candT = 0; } else st.candT += dt;
    const may = (key) => st.t - st.lastCallT >= GAP_S && (!canSpeak || canSpeak(key));
    if (occ !== st.cur && st.candT >= (occ === 0 ? CLEAR_S : DEBOUNCE_S)) {
      const prev = st.cur;
      let key = "";
      if (occ === (LEFT | RIGHT) && prev !== occ) key = "three wide";
      else if ((occ & LEFT) && (!(prev & LEFT) || prev === (LEFT | RIGHT))) key = "car left";
      else if ((occ & RIGHT) && (!(prev & RIGHT) || prev === (LEFT | RIGHT))) key = "car right";
      else if (occ === 0 && st.called) key = "clear";
      if (key && !may(key)) return "";                 // not yet: the transition stays pending
      st.cur = occ;
      if (key) {
        st.lastCallT = st.t;
        st.called = occ !== 0;
        st.stillSaid = false;
      }
      return key;
    }
    if (occ === st.cur && st.cur !== 0 && st.called && !st.stillSaid && st.t - st.lastCallT >= STILL_S && may("still there")) {
      st.stillSaid = true;
      st.lastCallT = st.t;
      return "still there";
    }
    return "";
  }

  function create(G) {
    let st = fresh(), lastCars = null, occupied = 0;
    const on = () => G.store.get("spotter", false) !== false;

    // `quiet`: a REAL RACE WATCH (js/race/race-radio.js) — every car is a
    // puppet and nobody is driving, so there is nobody to spot for.
    function update(dt, quiet) {
      if (!Number.isFinite(dt) || dt <= 0) return "";
      const pack = G.radio && G.radio.pack;
      const p = G.player;
      if (quiet || G.state !== "race" || G.paused || !p || p.finished || p.retired || !G.track
          || Math.abs(p.speed || 0) < G.vTop() * 0.12 || (p.pitState && p.pitState !== "none")) {
        st = fresh(); occupied = 0; if (pack && pack.stop) pack.stop("spotter"); return "";
      }
      if (G.cars !== lastCars) { lastCars = G.cars; st = fresh(); occupied = 0; if (pack && pack.stop) pack.stop("spotter"); }
      occupied = occupancy(p, G.cars, G.track.total, occupied);
      // Awareness also gates the coach and routine radio with speech muted.
      if (!pack || !on() || !G.soundOn || (G.radio.volume && G.radio.volume() <= 0)) {
        st = fresh(); if (pack && pack.stop) pack.stop("spotter"); return "";
      }
      // The engineer's chosen voice, from its radio pack (where the spotter's calls are).
      const voice = G.radio.recordedPack ? G.radio.recordedPack("radio") : G.radio.recordedVoice ? G.radio.recordedVoice("radio") : "george";
      pack.ensure(voice);
      const synth = typeof window !== "undefined" && window.speechSynthesis;
      const speak = (key) => {
        if (pack.busy("spotter")) return false;
        // Do not interrupt a useful line for a pack that is still loading.
        if (pack.plan && !pack.plan(voice, KEYS[key])) return false;
        if (key !== "still there" && G.radio.yieldToSpotter) G.radio.yieldToSpotter();
        if (pack.busy() || (synth && synth.speaking) || (G.radio.busy && G.radio.busy())) return false;
        const state = st;
        const expected = key === "clear" ? 0 : key === "three wide" ? 3 : key === "car left" ? LEFT : key === "car right" ? RIGHT : st.cur;
        return pack.speak(voice, KEYS[key], { channel: "spotter", volume: G.radio.volume ? G.radio.volume() : 1,
          // Recheck after decoding: a late "car left" is worse than silence.
          valid: () => { const valid = G.state === "race" && !G.paused && G.player === p && !p.finished && !p.retired && on() && G.soundOn
            && !(p.pitState && p.pitState !== "none") && Math.abs(p.speed || 0) >= G.vTop() * 0.12
            && G.track && occupancy(p, G.cars, G.track.total, occupied) === expected;
            // A discarded warning was never heard: do not follow it with "clear".
            if (!valid && st === state) st = fresh();
            return !!valid; } });
      };
      const key = step(st, occupied, dt, speak);
      return key;
    }

    return { update, occupied: () => occupied !== 0 || st.cur !== 0 };
  }

  return Object.freeze({ create, step, occupancy, fresh, KEYS, OVERLAP_ARC, SIDE_MIN, SIDE_MAX, DEBOUNCE_S, CLEAR_S, STILL_S, GAP_S });
})();
