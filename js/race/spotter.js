"use strict";
var Spotter = (() => {
  const KEYS = Object.freeze({
    "car left": "Car left.", "car right": "Car right.", "three wide": "Three wide.",
    "clear": "Clear.", "still there": "Still there.",
  });
  const OVERLAP_ARC = 5.4;
  const SIDE_MIN = 0.9;
  const SIDE_MAX = 4.2;
  const CLEAR_S = 0.4;
  const DEBOUNCE_S = 0.2;
  const STILL_S = 4;
  const GAP_S = 0.6;
  const LEFT = 1, RIGHT = 2;

  function fresh() { return { cur: 0, cand: 0, candT: 0, t: 0, lastCallT: -1e9, called: false, stillSaid: false }; }

  function occupancy(player, cars, lapLen, previous = 0) {
    let occ = 0;
    if (!player || !Number.isFinite(player.s) || !Number.isFinite(player.x ?? 0) || !cars || !(lapLen > 0) || !Number.isFinite(lapLen)) return 0;
    const half = lapLen * 0.5;
    for (const c of cars) {
      if (c === player || c.retired || !Number.isFinite(c.s) || !Number.isFinite(c.x ?? 0) || (c.pitState && c.pitState !== "none")) continue;
      const arc = ((c.s - player.s) % lapLen + lapLen + half) % lapLen - half;
      const lat = (c.x || 0) - (player.x || 0), side = lat < 0 ? LEFT : RIGHT;
      const held = !!(previous & side), a = Math.abs(lat);
      if (Math.abs(arc) > OVERLAP_ARC + (held ? 0.8 : 0)) continue;
      if (a < (held ? SIDE_MIN * 0.5 : SIDE_MIN) || a > SIDE_MAX + (held ? 0.5 : 0)) continue;
      occ |= side;
    }
    return occ;
  }

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
      if (key && !may(key)) return "";
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
    let st = fresh(), lastCars = null, occupied = 0, spoke = false;
    const on = () => G.store.get("spotter", false) !== false;

    function update(dt, quiet) {
      if (!Number.isFinite(dt) || dt <= 0) return "";
      const pack = G.radio && G.radio.pack;
      const p = G.player;
      const dirty = () => spoke || !!(st.cur || st.cand || st.called || st.stillSaid);
      const reset = () => { st = fresh(); spoke = false; if (pack && pack.stop) pack.stop("spotter"); };
      if (quiet || G.state !== "race" || G.paused || !p || p.finished || p.retired || !G.track
          || Math.abs(p.speed || 0) < G.vTop() * 0.12 || (p.pitState && p.pitState !== "none")) {
        if (dirty()) reset();
        occupied = 0; return "";
      }
      if (G.cars !== lastCars) { lastCars = G.cars; occupied = 0; if (dirty()) reset(); }
      occupied = occupancy(p, G.cars, G.track.total, occupied);
      if (!pack || !on() || !G.soundOn || (G.radio.volume && G.radio.volume() <= 0)) {
        if (dirty()) reset();
        return "";
      }
      const voice = G.radio.recordedPack ? G.radio.recordedPack("radio") : G.radio.recordedVoice ? G.radio.recordedVoice("radio") : "george";
      pack.ensure(voice);
      const synth = typeof window !== "undefined" && window.speechSynthesis;
      const speak = (key) => {
        if (pack.busy("spotter")) return false;
        if (pack.plan && !pack.plan(voice, KEYS[key])) return false;
        if (key !== "still there" && G.radio.yieldToSpotter) G.radio.yieldToSpotter();
        if (pack.busy() || (synth && synth.speaking) || (G.radio.busy && G.radio.busy())) return false;
        const state = st, before = { ...st };
        let validated = false;
        const rollback = () => { if (st === state) st = { ...before, t: st.t, lastCallT: st.lastCallT }; };
        const expected = key === "clear" ? 0 : key === "three wide" ? 3 : key === "car left" ? LEFT : key === "car right" ? RIGHT : st.cur;
        spoke = true;
        const spokeOk = pack.speak(voice, KEYS[key], { channel: "spotter", volume: G.radio.volume ? G.radio.volume() : 1,
          onEnd: () => { if (!validated) rollback(); },
          valid: () => { const valid = G.state === "race" && !G.paused && G.player === p && !p.finished && !p.retired && on() && G.soundOn
            && !(p.pitState && p.pitState !== "none") && Math.abs(p.speed || 0) >= G.vTop() * 0.12
            && G.track && occupancy(p, G.cars, G.track.total, occupied) === expected;
            if (!valid) rollback();
            validated = !!valid;
            return validated; } });
        if (spokeOk && typeof Captions !== "undefined" && Captions.onSpotter) Captions.onSpotter(KEYS[key], key);
        return spokeOk;
      };
      const key = step(st, occupied, dt, speak);
      return key;
    }

    return { update, occupied: () => occupied !== 0 || st.cur !== 0, side: () => occupied };
  }

  return Object.freeze({ create, step, occupancy, fresh, KEYS, GAP_S });
})();
