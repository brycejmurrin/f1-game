"use strict";

var FlyingStart = (function () {
  const HANDOVER_S = 3;
  const MARGIN_S = 2.5;
  const MIN_RUN_M = 150;
  const MAX_RUN_FRAC = 0.3;
  const GO_HOLD_S = 0.8;

  function runUpMetres(vDrop, total) {
    const want = Math.max(MIN_RUN_M, (vDrop > 0 ? vDrop : 0) * (HANDOVER_S + MARGIN_S));
    return total > 0 ? Math.min(want, total * MAX_RUN_FRAC) : want;
  }

  function create(G, deps) {
    const realRace = (deps && deps.realRace) || (() => false);
    let lastState = null;
    let handover = null;
    let goHold = 0;

    function count(v) { if (G.handoverCount) G.handoverCount(v); }

    function wanted() {
      return (G.timeTrial || (G.session === "quali" && !G.practice)) && !realRace()
        && G.player && G.track && G.track.total > 0;
    }

    function place(c) {
      const track = G.track, total = track.total, vTop = G.vTop();
      const speedAt = (s) => RealRace.dropSpeed(track, s, vTop, G.wrapS);
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
      G.setCarRole(c, false, true);
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
      RealRace.seatOnRoad(G.track, c);
      c.launch = null; c.launchOn = false;
      if (typeof Input !== "undefined" && Input.calibrate) Input.calibrate();
      count("GO"); goHold = GO_HOLD_S;
      if (G.announce) G.announce("YOU HAVE CONTROL", 1.5, "race");
      handover = null;
    }

    function release() {
      if (handover && handover.c) { G.setCarRole(handover.c, true, true); RealRace.seatOnRoad(G.track, handover.c); }
      if (handover || goHold > 0) count(null);
      handover = null; goHold = 0;
    }
    function stop() { release(); lastState = null; }

    function update(dt) {
      const st = G.state, entered = st !== lastState;
      lastState = st;
      if (st === "menu" || st === "results") { if (handover || goHold > 0) release(); return; }
      if (st === "count" && entered) { release(); if (wanted()) arm(); return; }
      if (st === "race") tick(dt);
    }

    return { update, stop, owns: (c) => !!(handover && handover.c === c), active: () => !!handover };
  }

  return { create };
})();
Object.freeze(FlyingStart);
