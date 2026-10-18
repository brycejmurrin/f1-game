/* Apex 26 — first-run COACH MARKS: four one-shot prompts (brake, overtake, active aero,
   energy harvest clip) shown through the existing #announce channel the first time each
   situation actually arises, worded for the control the player is really using.
   Onboard.create(G). Read-only — it never touches the car. */
"use strict";

const Onboard = (function () {
  const KEY = "onboarded";      // store adds the apex26. prefix
  // The races the marks have had, persisted beside the bitmask: it was session
  // memory, so RACES_MAX "two races and the player has seen enough" restarted
  // at every page load and an unseen mark could still appear a month in.
  const RACES_KEY = "onboardRaces";
  const MARKS = ["brake", "ot", "aero", "harvest"];
  const BIT = { brake: 1, ot: 2, aero: 4, harvest: 8 };
  const ALL = 15;
  const PACK_FULL = 0.97;
  const GAP = 8;                // s between marks — never two at once
  const RETRY = 1;              // s before a mark the banner refused is offered again
  const RACES_MAX = 2;          // after two races the player has seen enough
  const TAIL = {
    brake: "into the corner",
    ot: "you are close enough to use it",
    aero: "you can open it now",
    harvest: "full battery can clip the engine on straights",
  };

  /** Broadcast-only: mirrors the 2026 PU harvest clip gate in js/audio/engine.js
   * (pack full + part throttle or lift-and-coast at pace). Reads player reports. */
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

  /* THE PROMPT MUST NAME THE CONTROL THIS PLAYER ACTUALLY HAS, and until now
     it named the control the game shipped with — which is not the same thing,
     and was not even accurate: the aero mark read "ACTIVE AERO — A" for a
     control bound to Z, so the one prompt whose whole job is to teach a button
     taught the wrong one. Rebinding made all three wrong at once, because the
     strings were literals.
     Read the live map instead. HOW TO PLAY has been rewritten from
     Input.keyBindings() since the rebinding UI shipped (js/ui/key-binds.js);
     this is the same source, so the two can no longer disagree.
     A PAD is asked for by name too: its face buttons are not the keyboard's,
     and a player holding one is not looking for a letter. */
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
    if (key === "harvest") return "ENERGY FULL — LIFT OR DEPLOY ON STRAIGHTS";
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
      // SEEN ONLY ONCE THE BANNER TOOK IT. announce() drops "coach" lines on
      // the TV cameras and on a full queue and says so (false); the bit used to
      // be saved first, so a first race watched on a TV camera spent the marks
      // unseen, for good. A refusal leaves the mark armed and retries after a
      // beat (not every frame).
      if (G.announce(`${verb(key)} — ${TAIL[key]}`, 2.5, "coach") === false) { cool = RETRY; return false; }
      shown |= BIT[key];
      store.set(KEY, shown);
      cool = GAP;
      Log.info("ui", `Onboard ${key}`);
      return true;
    }

    // One call per frame from the game loop, before the pause gate. Everything
    // it reads is a REPORT — the brake cue's own urgency, the overtake arm flag
    // the HUD already draws, the car's own active-aero arm state — so nothing
    // here can reach the car (docs/PHYSICS.md: broadcast-only).
    function tick(dt) {
      if (G.state !== lastState) {
        // A red-flag standing restart also runs count -> race, and it must not
        // burn one of the two races these marks get. A genuine start has the
        // race clock at zero; a restart resumes the clock the flag stopped.
        if (G.state === "race" && lastState === "count" && !(G.raceT > 1) && !done()) { races++; store.set(RACES_KEY, races); }
        lastState = G.state;
      }
      // PAUSED is not racing: a mark fired under the pause card is consumed unseen.
      if (G.state !== "race" || G.paused || done()) return false;
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
      // Wait for the ARM, not the distance: up to 250 m before the zone xArmed
      // is still false and game.js discards the toggle in the same frame (`if
      // (!c.xArmed) c.xOn = false`), so a distance trigger taught a press that
      // does nothing. Read aeroX, the flap's travel, never the xOn switch (the
      // flat rule in docs/PHYSICS.md), so a prompt cannot land while the flaps
      // are opening. In auto mode the game opens the wing itself and the
      // button is hidden, so naming a control there is worse than silence.
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
