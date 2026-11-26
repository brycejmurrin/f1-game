/* Apex 26 — LAP RETRY: a solo Time Trial (the Daily included) goes back to the
 * flying-start drop-in AT ONCE (#6965, #6920 U4.5, #6884 A1). No loading card, no
 * track rebuild, no startRace, no countdown: the pause menu's RETRY LAP restores
 * the world captured the moment FlyingStart dropped the car in (arm() calls
 * capture()), then FlyingStart.rearm() runs the same HANDOVER_S run-up and "YOU
 * HAVE CONTROL". FlyingStart.create() creates this module's instance (one per
 * flying start), so game.js — eager, at its byte budget — holds none of it.
 *
 * WHAT COMES BACK is SimState's (js/core/sim-state.js): the player car (a TT grid
 * is the player alone), the sim RNG stream position, the race clock and sectors,
 * and the incident, debris and damage RESETS. So a retried lap is the same lap a
 * fresh flying start on that seed drives. WHAT STAYS is the session: the TT lap
 * list (game.js lapRec.ttLaps), the player's best and the session sector bests —
 * the retried lap is real and scored (records.begin, never records.invalidate).
 *
 * This is the session-start drop-in, not a mid-lap world checkpoint: practice
 * checkpoints stay the coach's (js/race/driving-coach.js TRY AGAIN), which calls
 * LapRetry.invalidate() when it moves the world. The weather arc needs no re-arm:
 * WeatherArc.startChangeable() returns null in a time trial.
 *
 * Read only on the player's explicit pause-menu press: nothing here reaches the
 * physics step, and nothing derived from curvature or the racing line (AGENTS.md
 * §Physics). One `create(G, deps)`; the module never reaches into game.js.
 *
 * deps: flyingStart (the instance that created this one), setPaused(p, why).
 * G.records is read live (re-created when the race-session bundle lands). A real
 * race and a setup trial never get a flying start (FlyingStart's realRace dep),
 * so they never hold a drop-in to retry.
 * KNOWN GAP: game.js lapRec.sectorValid has no SimState part; after a retry it
 * keeps its pre-retry value until the next forward sector line sets it.
 */
"use strict";

var LapRetry = (function () {
  let live = null;   // the newest instance: LapRetry.invalidate() is called from modules that hold no reference

  function create(G, deps) {
    deps = deps || {};
    let snap = null;   // { world, cars, track }: the drop-in, tied to THIS session's grid and circuit
    const call = (f, ...a) => (typeof f === "function" ? f(...a) : undefined);

    /** FlyingStart's onDrop: the car is placed, the clock is green, the AI holds the run-up. */
    function capture() {
      snap = null;
      if (!G.timeTrial || !G.player || typeof SimState === "undefined") return false;
      snap = { world: SimState.capture(G), cars: G.cars, track: G.track };
      return true;
    }
    function invalidate() { snap = null; sync(); }

    function canRetry() {
      return !!(snap && G.timeTrial && G.state === "race" && G.player
        && snap.cars === G.cars && snap.track === G.track   // makeCars() replaced the grid: a new session
        && !(G.netPlay && G.netPlay.active()) && !(G.realRace && G.realRace.isActive()));
    }

    function retry() {
      if (!canRetry()) return false;
      const fs = deps.flyingStart;
      if (!fs || typeof fs.rearm !== "function") return false;
      const p = G.player;
      // The session's bests and last lap/splits are kept forward (the HUD's LAST): the drop-in held none yet.
      const keep = { best: p.best, lastLap: p.lastLap, sectorBests: G.sectorBests && G.sectorBests.slice(),
        fieldSectorBests: G.fieldSectorBests && G.fieldSectorBests.slice(), sectorLast: Array.isArray(G.sectorLast) ? G.sectorLast.slice() : null };
      SimState.restore(snap.world, G);
      p.best = keep.best; p.lastLap = keep.lastLap;
      if (keep.sectorLast) { G.sectorLast.length = 0; G.sectorLast.push(...keep.sectorLast); }   // no setter: in place, as SimState's clock part does
      if (keep.sectorBests) G.sectorBests = keep.sectorBests;
      if (keep.fieldSectorBests && G.fieldSectorBests) G.fieldSectorBests.splice(0, G.fieldSectorBests.length, ...keep.fieldSectorBests);
      fs.rearm();
      // startRace's TT arm: records.begin() restarts InputGhost, Ghost.startLap() the pose ghost.
      if (G.records && G.records.begin) G.records.begin();
      if (typeof Ghost !== "undefined" && Ghost.startLap) Ghost.startLap();
      if (G.snapGameCam) G.snapGameCam();
      Log.info("game", "LapRetry.retry raceT=" + (+G.raceT || 0).toFixed(2));
      return true;
    }

    // RETRY LAP is a RACE TOOLS tile, built in JS like REPLAY and RECOVER CAR (a
    // static shell button would raise the shellNodes ratchet). A TILE, not a door
    // beside RESTART: the phone card is a grid of named areas, and a full-width row
    // outside them gets an auto row of its own: 89 px of scroll at 852x283
    // (ui-resize.spec.js pause cells). HIDDEN outside a time trial, so a race's
    // card is exactly what it was; disabled in a TT with no drop-in to go back
    // to (only after a coach rewind: setting-deps' why-practice row links the
    // coach's practice line, never a reason line of its own, which would be a
    // tile in the tray).
    // NOT in pause-opts GUARDED: a retry is cheap and loses at most one lap.
    let btn = null;
    if (typeof document !== "undefined" && document.getElementById) {
      btn = document.getElementById("pm-retry-lap");
      const tray = document.getElementById("pm-quick-doors");
      if (!btn && tray) {
        btn = document.createElement("button");
        btn.id = "pm-retry-lap"; btn.type = "button"; btn.textContent = "RETRY LAP"; btn.hidden = true;
        tray.insertBefore(btn, tray.firstChild);
      }
      // "restart": setPaused's no-3-2-1 resume (the run-up is the countdown)
      if (btn) btn.onclick = () => { if (retry()) call(deps.setPaused, false, "restart"); };
    }
    // Disabled ONLY inside a TT: setting-deps explains a disabled control whether or
    // not it is hidden, and a hidden-but-disabled tile would grow a reason line in a
    // race's tray (ui-resize 852x283: a door outgrew RESUME).
    function sync() { if (btn) { btn.hidden = !G.timeTrial; btn.disabled = !!G.timeTrial && !canRetry(); } }

    live = { canRetry, capture, retry, invalidate, sync, hasSnapshot: () => !!snap };
    watchPause();
    return live;
  }
  // The button paints itself when the pause card opens: one observer for the
  // module (instances are re-created per bundle landing), always the newest.
  let watching = false;
  function watchPause() {
    if (watching || typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.getElementById) return;
    const card = document.getElementById("pausemenu");
    if (!card) return;
    watching = true;
    new MutationObserver(() => { if (live && !card.hidden) live.sync(); }).observe(card, { attributes: true, attributeFilter: ["hidden"] });
  }

  // current(): the live instance (game.js holds it privately; the VM test reads it here).
  return { create, invalidate: () => { if (live) live.invalidate(); }, current: () => live };
})();
Object.freeze(LapRetry);
