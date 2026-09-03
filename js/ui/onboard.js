/* Apex 26 — first-run COACH MARKS: three one-shot prompts (brake, overtake, active aero) shown through the existing #announce channel the first time each situation actually arises, worded for the control the player is really using. Onboard.create(G). Read-only — it never touches the car. */
"use strict";

const Onboard = (function () {
  const KEY = "onboarded";      // store adds the apex26. prefix
  const MARKS = ["brake", "ot", "aero"];
  const BIT = { brake: 1, ot: 2, aero: 4 };
  const ALL = 7;
  const GAP = 8;                // s between marks — never two at once
  const RACES_MAX = 2;          // after two races the player has seen enough

  // WHAT TO PRESS. The prompt has to name the control this player actually has,
  // or it is worse than silence: the touch build has no keys and the pad's
  // face buttons are not the keyboard's. js/input/input.js is the authority
  // (KeyX overtake, pad button 3, #btn-ot).
  function verb(G, key) {
    const touch = !!(typeof Input !== "undefined" && Input.touchControlsNeeded && Input.touchControlsNeeded());
    if (key === "brake") return touch ? "TAP AND HOLD BRAKE" : "BRAKE — S OR DOWN";
    if (key === "ot") return touch ? "TAP OVERTAKE" : "OVERTAKE — X";
    return touch ? "TAP AERO" : "ACTIVE AERO — A";
  }
  const TAIL = {
    brake: "into the corner",
    ot: "you are close enough to use it",
    aero: "the straight is long enough",
  };

  function create(G) {
    Log.info("ui", "Onboard.create");
    const { store } = G;
    let shown = 0;          // bitmask, loaded lazily so a fresh store is not read at eval
    let loaded = false;
    let races = 0;
    let cool = 0;           // s until the next mark may show
    let lastState = "";

    function load() {
      if (loaded) return;
      loaded = true;
      const v = store.get(KEY, 0);
      shown = Number.isInteger(v) ? v : 0;
      races = 0;
    }
    function done() { load(); return shown >= ALL || races > RACES_MAX; }

    function fire(key) {
      load();
      if (shown & BIT[key]) return false;
      shown |= BIT[key];
      store.set(KEY, shown);
      cool = GAP;
      G.announce(verb(G, key) + " — " + TAIL[key], 2.5);
      Log.info("ui", "Onboard " + key);
      return true;
    }

    // One call per frame from the game loop, before the pause gate. Everything
    // it reads is a REPORT — the brake cue's own urgency, the overtake arm flag
    // the HUD already draws, the distance to the next aero zone — so nothing
    // here can reach the car (docs/PHYSICS.md: broadcast-only).
    function tick(dt) {
      if (G.state !== lastState) {
        // A red-flag standing restart also runs count -> race, and it must not
        // burn one of the two races these marks get. A genuine start has the
        // race clock at zero; a restart resumes the clock the flag stopped.
        if (G.state === "race" && lastState === "count" && !(G.raceT > 1)) races++;
        lastState = G.state;
      }
      if (G.state !== "race" || done()) return false;
      // Spend the gap and keep going in the SAME tick when it runs out — a
      // frame with a 9 s dt (a resumed tab) must not eat the mark as well.
      if (cool > 0) cool = Math.max(0, cool - (dt || 0));
      if (cool > 0) return false;
      const p = G.player;
      if (!p || G.announceBusy) return false;
      if (!(shown & BIT.brake)) {
        const bc = typeof BrakeCue !== "undefined" && BrakeCue.debug ? BrakeCue.debug() : null;
        if (bc && bc.on && bc.urgency > 0.35) return fire("brake");
      }
      if (!(shown & BIT.ot) && p.otArmed && !(p.otT > 0)) return fire("ot");
      if (!(shown & BIT.aero)) {
        const d = G.aeroZoneAhead ? G.aeroZoneAhead(p.s) : -1;
        // aeroX (the flap's travel), never xOn — "the switch is not the wing"
        // is a flat rule in docs/PHYSICS.md, and a prompt that fires while the
        // flaps are still opening is the case it exists for.
        if (d > 0 && d < 250 && !(p.aeroX > 0.02)) return fire("aero");
      }
      return false;
    }

    function reset() { shown = 0; races = 0; cool = 0; loaded = true; store.set(KEY, 0); }
    function state() { load(); return { shown, races, done: done() }; }
    return { tick, reset, state, MARKS };
  }

  return { create, MARKS, BIT, ALL };
})();
