/* Apex 26 — FLYING START: qualifying and time trial begin at speed, the way a
   Data Hub JUMP IN does (js/race/real-race.js). No gantry over a standing car:
   on the first countdown frame the player's car is dropped in on the road
   BEFORE the line at the speed the AI would carry there (RealRace.dropSpeed),
   driven for the player for HANDOVER_S — counted down big on the lights plate
   (G.handoverCount) — and handed over with road to spare. The run-up is never
   timed: the lap clock, the ghost and the records all start at the line
   crossing (js/game.js line-crossing block), so every timed lap is a flying lap,
   and js/race/quali-model.js no longer charges the simulated field a standing
   start either. One `create(G)`; the module never reaches into game.js. */
"use strict";

var FlyingStart = (function () {
  const HANDOVER_S = 3;      // s the AI drives the run-up before the wheel is yours
  const MARGIN_S = 2.5;      // s of road left to the line after GO, at drop speed
  const MIN_RUN_M = 150;     // m: never dropped in closer to the line than this
  const MAX_RUN_FRAC = 0.3;  // …nor more than this share of a lap back (a short circuit)
  const GO_HOLD_S = 0.8;     // s the GO plate stays up after the hand-over

  /** Metres before the line the run-up starts: the hand-over and the margin,
   *  at the speed the car is dropped in at. Pure. */
  function runUpMetres(vDrop, total) {
    const want = Math.max(MIN_RUN_M, (vDrop > 0 ? vDrop : 0) * (HANDOVER_S + MARGIN_S));
    return total > 0 ? Math.min(want, total * MAX_RUN_FRAC) : want;
  }

  /** deps.realRace(): true while a Data Hub real race owns the session (it has its own start). */
  function create(G, deps) {
    const realRace = (deps && deps.realRace) || (() => false);
    let lastState = null;  // a countdown ENTERED this frame is a new start (RESTART / RACE AGAIN re-enter it)
    let handover = null;   // { c, t, said } while the AI holds the wheel
    let goHold = 0;

    function count(v) { if (G.handoverCount) G.handoverCount(v); }

    // G.practice is DERIVED (game.js isPractice): every time trial reads true,
    // so it only excludes a qualifying session with practice tools armed.
    function wanted() {
      return (G.timeTrial || (G.session === "quali" && !G.practice)) && !realRace()
        && G.player && G.track && G.track.total > 0;
    }

    function place(c) {
      const track = G.track, total = track.total, vTop = G.vTop();
      const speedAt = (s) => RealRace.dropSpeed(track, s, vTop, G.wrapS);
      // Two passes: the run-up depends on the speed, the speed on where the run-up starts.
      let run = runUpMetres(speedAt(G.wrapS(-MIN_RUN_M)), total);
      const v = speedAt(G.wrapS(-run));
      run = runUpMetres(v, total);
      const s = G.wrapS(-run);
      c.s = s; c._prevS = s; c.prog = -run; c.lap = 0;
      c.x = 0; c.xVis = 0; c.speed = speedAt(s);
      const w = G.worldFromTrack(s, 0);
      c.px = w.x; c.pz = w.z;
      const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
      Tracks.sample(track, s, smp);
      c.head = Math.atan2(smp.t[0], smp.t[2]);
      c.vLat = 0; c.yawRateCur = 0; c.yawVis = 0; c.steerVis = 0;
      c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head; c.rPrevYawVis = 0;
      c.gear = 5;
      c.launch = null; c.launchOn = false;
      return run;
    }

    function arm() {
      const c = G.player;
      if (!G.goRolling || !G.setCarRole) return;
      G.setCarRole(c, false, true);   // the AI drives the run-up; the camera, HUD and audio stay on it
      const run = place(c);
      if (!G.goRolling()) { G.setCarRole(c, true, true); return; }
      handover = { c, t: HANDOVER_S, said: HANDOVER_S };
      count(HANDOVER_S);
      if (G.snapGameCam) G.snapGameCam();
      if (G.announce) G.announce(G.session === "quali" ? "QUALIFYING · FLYING LAP" : "TIME TRIAL · FLYING LAP", 2, "info");
      Log.info("game", "FlyingStart.arm run=" + run.toFixed(0) + "m speed=" + (c.speed || 0).toFixed(1));
    }

    function tick(dt) {
      if (goHold > 0 && (goHold -= dt) <= 0) count(null);
      if (!handover) return;
      handover.t -= dt;
      const left = Math.ceil(handover.t);
      if (left < handover.said && left > 0) { handover.said = left; count(left); }
      if (handover.t > 0) return;
      const c = handover.c;
      G.setCarRole(c, true, true);
      RealRace.seatOnRoad(G.track, c);   // c.head is still the DROP heading: the AI never advances it
      c.launch = null; c.launchOn = false;
      if (typeof Input !== "undefined" && Input.calibrate) Input.calibrate();   // the gantry's first lamp did this; there is no gantry now
      count("GO"); goHold = GO_HOLD_S;
      if (G.announce) G.announce("YOU HAVE CONTROL", 1.5, "race");
      handover = null;
    }

    function release() {
      if (handover && handover.c) { G.setCarRole(handover.c, true, true); RealRace.seatOnRoad(G.track, handover.c); }
      if (handover || goHold > 0) count(null);
      handover = null; goHold = 0;
    }
    /** The session is over (quitToMenu) or the wheel is wanted now (__apex.go): hand it back and forget the
     *  last state, so the NEXT session's first countdown frame is a new start (update() never runs in the menu). */
    function stop() { release(); lastState = null; }

    /** Every frame, every state (next to realRace.update in js/game.js). */
    function update(dt) {
      const st = G.state, entered = st !== lastState;
      lastState = st;
      if (st === "menu" || st === "results") { if (handover || goHold > 0) release(); return; }
      // Entering the countdown is a new start, whatever came before it (RESTART goes race -> count).
      if (st === "count" && entered) { release(); if (wanted()) arm(); return; }
      if (st === "race") tick(dt);
    }

    return { update, stop, owns: (c) => !!(handover && handover.c === c), active: () => !!handover };
  }

  return { create, runUpMetres, HANDOVER_S, MARGIN_S, MIN_RUN_M, MAX_RUN_FRAC };
})();
Object.freeze(FlyingStart);
