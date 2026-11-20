"use strict";

const Onboard = (function () {
  const KEY = "onboarded";
  const RACES_KEY = "onboardRaces";
  const MARKS = ["brake", "ot", "aero", "harvest"];
  const BIT = { brake: 1, ot: 2, aero: 4, harvest: 8 };
  const ALL = 15;
  const PACK_FULL = 0.97;
  const GAP = 8;
  const RETRY = 1;
  const RACES_MAX = 2;
  const TAIL = {
    brake: "into the corner",
    ot: "you are close enough to use it",
    aero: "you can open it now",
    harvest: "a full battery stops harvesting, so spend some",
  };

  function harvestClipCue(p, vTopFn) {
    if (!p || p.deploying || (p.otT > 0)) return false;
    const e = p.energy;
    if (!(e > PACK_FULL)) return false;
    const vT = vTopFn ? vTopFn() : 80;
    const v = p.speed || 0;
    if (v < vT * 0.35) return false;
    const thr = p.throttleDemand != null ? p.throttleDemand : 0;
    const brk = p.brakeDemand != null ? p.brakeDemand : 0;
    if (thr > 0.1 && thr < 0.72 && brk < 0.12) return true;
    if (thr <= 0.05 && brk < 0.12 && v > vT * 0.25) return true;
    return false;
  }

  const ACTION_OF = { brake: "brake", ot: "overtake", aero: "aero" };
  function codeFor(action) {
    if (typeof Input === "undefined" || !Input.keyBindings) return null;
    const row = Input.keyBindings().find((a) => a.id === action);
    if (!row) return null;
    const codes = row.codes.filter(Boolean).map((c) => Input.keyLabel(c));
    return codes.length ? codes.join(" OR ") : null;
  }
  function padFor(action) {
    if (typeof Input === "undefined" || !Input.padBindings) return null;
    const row = Input.padBindings().find((a) => a.id === action);
    if (!row) return null;
    const first = row.codes.find((c) => c != null);
    return first == null ? null : Input.padLabel(first);
  }
  function inputKind() {
    if (typeof Input !== "undefined" && Input.activeInputSource) return Input.activeInputSource();
    return typeof Input !== "undefined" && Input.touchControlsNeeded && Input.touchControlsNeeded() ? "touch" : "keyboard";
  }
  function verb(key) {
    if (key === "harvest") return "ENERGY FULL — DEPLOY ON STRAIGHTS";
    const action = ACTION_OF[key];
    const touch = !!(typeof Input !== "undefined" && Input.touchControlsNeeded && Input.touchControlsNeeded());
    const NOUN = { brake: "BRAKE", ot: "OVERTAKE", aero: "ACTIVE AERO" }[key];
    const source = inputKind();
    if (source === "controller") {
      const b = padFor(action);
      if (b) return `${NOUN} — ${b}`;
    }
    if (source === "phone" || source === "touch" || (source !== "keyboard" && touch)) {
      return key === "brake" ? "TAP AND HOLD BRAKE" : (key === "ot" ? "TAP OVERTAKE" : "TAP AERO");
    }
    const k = codeFor(action);
    return k ? `${NOUN} — ${k}` : NOUN;
  }

  let refresher = null;
  function resetControlsRefresher() {
    if (!refresher) return false;
    refresher();
    return true;
  }

  function create(G) {
    Log.info("ui", "Onboard.create");
    const { store } = G;
    let shown = 0;
    let loaded = false;
    let races = 0;
    let cool = 0;
    let lastState = "";

    function load() {
      if (loaded) return;
      loaded = true;
      const v = store.get(KEY, 0);
      shown = Number.isInteger(v) ? v : 0;
      const r = store.get(RACES_KEY, 0);
      races = Number.isInteger(r) && r > 0 ? r : 0;
    }
    function done() {
      load();
      return shown >= ALL || races > RACES_MAX;
    }

    function fire(key) {
      load();
      if (shown & BIT[key]) return false;
      if (G.announce(`${verb(key)} — ${TAIL[key]}`, 2.5, "coach") === false) { cool = RETRY; return false; }
      shown |= BIT[key];
      store.set(KEY, shown);
      cool = GAP;
      Log.info("ui", `Onboard ${key}`);
      return true;
    }

    function tick(dt) {
      if (G.state !== lastState) {
        if (G.state === "race" && lastState === "count" && !(G.raceT > 1) && !done()) { races++; store.set(RACES_KEY, races); }
        lastState = G.state;
      }
      if (G.state !== "race" || G.paused || done()) return false;
      if (cool > 0) cool = Math.max(0, cool - (dt || 0));
      if (cool > 0) return false;
      const p = G.player;
      if (!p || p.finished || p.retired || G.announceBusy) return false;
      if (!(shown & BIT.brake)) {
        const bc = typeof BrakeCue !== "undefined" && BrakeCue.debug ? BrakeCue.debug() : null;
        if (bc && bc.on && bc.urgency > 0.35) return fire("brake");
      }
      if (!(shown & BIT.ot) && p.otArmed && !(p.otT > 0)) return fire("ot");
      if (!(shown & BIT.aero) && G.raceAeroMode !== "auto") {
        if (p.xArmed && !(p.aeroX > 0.02)) return fire("aero");
      }
      if (!(shown & BIT.harvest) && harvestClipCue(p, G.vTop)) return fire("harvest");
      return false;
    }

    function reset() {
      shown = 0;
      races = 0;
      cool = 0;
      loaded = true;
      store.set(KEY, 0);
      store.set(RACES_KEY, 0);
    }
    function state() {
      load();
      return { shown, races, done: done() };
    }
    refresher = reset;
    return { tick, reset, state, MARKS };
  }

  return { create, resetControlsRefresher, harvestClipCue, MARKS, BIT, ALL };
})();
Object.freeze(Onboard);
