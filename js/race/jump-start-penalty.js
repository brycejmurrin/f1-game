/* Apex 26 — FALSE START (FIA 2026 SR B5.11.1; js/race/sporting-regs.js): throttle
   at green or a launch faster than the minimum reaction window. Grid physics stay
   locked until lights-out — detection runs at green and in the first REACT_S of
   the race. One `create(G, deps)`; the module never reaches into game.js. */
"use strict";

var JumpStartPenalty = (function () {
  /** deps: autoThrottle, inputOf, launchT0, soundOn, isQuali, isTimeTrial */
  function create(G, deps) {
    const autoThrottle = deps.autoThrottle;
    const inputOf = deps.inputOf;
    const launchT0 = deps.launchT0;
    const soundOn = deps.soundOn;
    const isQuali = deps.isQuali;
    const isTimeTrial = deps.isTimeTrial;

    function standingRace() {
      return G.session === "race" && !isQuali() && !isTimeTrial();
    }

    function throttleLevel(c) {
      if (!c || !c.human) return 0;
      if (autoThrottle()) return 0;
      const inp = inputOf(c);
      if (inp) return inp.throttle ? (inp.throttleLevel ?? 1) : 0;
      return Math.max(0, Input.throttleLevel());
    }

    function fine(c) {
      if (!c || c.jumpStartFined || c.retired || c.finished || !standingRace()) return;
      c.jumpStartFined = true;
      // SportingRegs.applyCompoundRule / race-control use (penalty || 0); keep the
      // same belt so a stub car without an initialised field cannot NaN the total.
      c.penalty = (c.penalty || 0) + SportingRegs.JUMP_START_PEN_S;
      c.penaltyWhy = c.penaltyWhy ? c.penaltyWhy + "; " + SportingRegs.JUMP_START_WHY : SportingRegs.JUMP_START_WHY;
      Log[c.isPlayer ? "info" : "debug"]("game", "Jump start car=" + c.code + " +5s total=" + c.penalty + "s");
      if (!c.isPlayer) return;
      G.resultT = 0;
      G.announce("+5s FALSE START", 2.5, "penalty-hit");
      if (soundOn()) GameAudio.penalty();
    }

    function tickAtGreen(c) {
      const track = G.track;
      if (!track || !c || c.jumpStartFined || c.retired || c.finished || !standingRace()) return;
      if (c.human && SportingRegs.jumpStartEarlyThrottle(throttleLevel(c), autoThrottle())) fine(c);
    }

    function tickReaction(c) {
      const track = G.track;
      if (!track || !c || c.jumpStartFined || c.retired || c.finished || !standingRace()) return;
      const t = G.raceT - launchT0();
      if (t > SportingRegs.JUMP_START_REACT_S) return;
      const vRef = G.vTop();
      if (c.human) {
        // The assist launches at green itself; a fast build must not fine it.
        if (!autoThrottle() && SportingRegs.jumpStartFastLaunch(t, c.speed || 0, vRef)) fine(c);
        return;
      }
      if (c.launchOn && c.launch && t < c.launch.react
          && SportingRegs.jumpStartFastLaunch(t, c.speed || 0, vRef)) fine(c);
    }

    // THE GRID CUE (#5775 R7). The fine is for throttle held AT lights-out while the
    // car is locked on the grid, and nothing on the grid said so: the player found out
    // from the +5 s. While the lights count and the throttle that WOULD be fined is
    // held, the engineer says lift — once per hold, the card dropped from the queue
    // once it is released. cueUp() reports (and forgets) that it was shown, so the
    // caller can clear it off the screen at lights-out instead of holding LIGHTS OUT!
    // behind the card's 3 s floor.
    const GRID_CUE = "LIFT — WAIT FOR LIGHTS";
    let cueHold = false, cueShown = false;
    function heldOnGrid(c) {
      return !!c && c.human && !c.jumpStartFined && !c.retired && standingRace()
        && SportingRegs.jumpStartEarlyThrottle(throttleLevel(c), autoThrottle());
    }
    function tickGrid(c) {
      if (!heldOnGrid(c)) { cueHold = false; return; }
      if (cueHold || !c.isPlayer) return;
      cueHold = true;
      if (G.announce(GRID_CUE, 1.5, "penalty-warn", () => heldOnGrid(c))) cueShown = true;
    }
    function cueUp() { const u = cueShown; cueShown = false; cueHold = false; return u; }

    function reactWindowOpen() {
      return G.raceT - launchT0() <= SportingRegs.JUMP_START_REACT_S;
    }

    return { tickAtGreen, tickReaction, reactWindowOpen, tickGrid, cueUp, GRID_CUE };
  }

  return { create };
})();
Object.freeze(JumpStartPenalty);
