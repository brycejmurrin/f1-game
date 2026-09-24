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
const Spotter = (() => {
  /** key → the text the voice pack records for it (tools/gen/voicepack.mjs). */
  const KEYS = Object.freeze({
    "car left": "Car left.", "car right": "Car right.", "three wide": "Three wide.",
    "clear": "Clear.", "still there": "Still there.",
  });
  const OVERLAP_ARC = 5.4;     // metres nose to tail: a car length and a bit
  const SIDE_MIN = 0.9;        // closer than this laterally is behind/ahead in line, not beside
  const SIDE_MAX = 4.2;        // wider than this is a lane over, not alongside
  const DEBOUNCE_S = 0.2;      // a side must hold this long before it changes the call
  const STILL_S = 4;           // one "still there" after this long alongside
  const LEFT = 1, RIGHT = 2;

  function fresh() { return { cur: 0, cand: 0, candT: 0, t: 0, lastCallT: 0, called: false, stillSaid: false }; }

  /** Which sides are occupied: bit 1 left, bit 2 right. Lateral x is +right. */
  function occupancy(player, cars, lapLen) {
    let occ = 0;
    if (!player || player.s == null || !cars) return 0;
    const half = lapLen * 0.5;
    for (const c of cars) {
      if (c === player || c.retired || c.s == null || (c.pitState && c.pitState !== "none")) continue;
      let arc = c.s - player.s;
      if (arc > half) arc -= lapLen; else if (arc < -half) arc += lapLen;
      if (Math.abs(arc) > OVERLAP_ARC) continue;
      const lat = (c.x || 0) - (player.x || 0);
      const a = Math.abs(lat);
      if (a < SIDE_MIN || a > SIDE_MAX) continue;
      occ |= lat < 0 ? LEFT : RIGHT;
    }
    return occ;
  }

  /** Advance the state by dt with the current occupancy; returns a KEYS key or "". Pure. */
  function step(st, occ, dt) {
    st.t += dt;
    if (occ !== st.cand) { st.cand = occ; st.candT = 0; } else st.candT += dt;
    if (occ !== st.cur && st.candT >= DEBOUNCE_S) {
      const prev = st.cur;
      st.cur = occ;
      let key = "";
      if (occ === (LEFT | RIGHT) && prev !== occ) key = "three wide";
      else if ((occ & LEFT) && !(prev & LEFT)) key = "car left";
      else if ((occ & RIGHT) && !(prev & RIGHT)) key = "car right";
      else if (occ === 0 && st.called) key = "clear";
      if (key) {
        st.lastCallT = st.t;
        st.called = occ !== 0;
        st.stillSaid = false;
      }
      return key;
    }
    if (st.cur !== 0 && st.called && !st.stillSaid && st.t - st.lastCallT >= STILL_S) {
      st.stillSaid = true;
      st.lastCallT = st.t;
      return "still there";
    }
    return "";
  }

  function create(G) {
    let st = fresh(), lastCars = null, calls = 0, last = "";
    const on = () => G.store.get("spotter", true) !== false;

    function update(dt) {
      const pack = G.radio && G.radio.pack;
      const p = G.player;
      if (!pack || !on() || !G.soundOn || G.state !== "race" || !p || !G.track) { st = fresh(); return ""; }
      if (G.cars !== lastCars) { lastCars = G.cars; st = fresh(); }
      pack.ensure("george");
      if (Math.abs(p.speed || 0) < G.vTop() * 0.12 || (p.pitState && p.pitState !== "none")) { st = fresh(); return ""; }
      const key = step(st, occupancy(p, G.cars, G.track.total), dt);
      if (!key || pack.busy()) return "";
      const synth = typeof window !== "undefined" && window.speechSynthesis;
      if (synth && synth.speaking) return "";            // the engineer has the channel
      if (!pack.speak("george", KEYS[key], { channel: "spotter", volume: G.radio.volume ? G.radio.volume() : 1 })) return "";
      calls++; last = key;
      return key;
    }

    return { update, debug: () => ({ on: on(), calls, last, cur: st.cur }) };
  }

  return Object.freeze({ create, step, occupancy, fresh, KEYS, OVERLAP_ARC, SIDE_MIN, SIDE_MAX, DEBOUNCE_S, STILL_S });
})();
