/* Apex 26 — RacePodium: ceremony podium beat + results handoff (#4070 slice 4).
 * After parc fermé, aim ResultsCam at the winner, show PodiumBeat, then on
 * CONTINUE / timer call buildResults (if supplied) and unhide #results.
 * Does not re-score; career/season sheet buttons stay as GameResults wired them.
 * RaceCeremony (slice 1) owns when to start(); this module owns the beat itself. */
const RacePodium = (function () {
  "use strict";

  const PODIUM_S = 6.5;

  function eligible(order, options) {
    return typeof PodiumBeat !== "undefined" && PodiumBeat.eligible(order, options);
  }

  /**
   * @param {object} G
   * @param {{ resultsCam?: { startOrbit?: function, subject?: function, status?: function },
   *           buildResults?: function, els?: { results?: HTMLElement },
   *           getResultsEl?: function }} deps
   */
  function create(G, deps) {
    const d = deps || {};
    let live = false;
    let age = 0;
    let order = null;
    let options = null;
    let doneCb = null;
    let built = false;

    function resultsEl() {
      if (d.els && d.els.results) return d.els.results;
      if (typeof d.getResultsEl === "function") return d.getResultsEl();
      // querySelector: mini-dom getElementById auto-creates empty shells.
      if (typeof document !== "undefined") return document.querySelector("#results");
      return null;
    }

    function aimWinner() {
      const cam = d.resultsCam;
      if (!cam) return false;
      // subject() already prefers lowest finPos (winner); orbit keeps that framing.
      if (typeof cam.startOrbit === "function") return !!cam.startOrbit();
      return false;
    }

    function showResults() {
      if (d.buildResults && order && !built) {
        d.buildResults(order, options || {});
        built = true;
      }
      const sheet = resultsEl();
      if (sheet) sheet.hidden = false;
    }

    function finish(reason) {
      if (!live) return false;
      live = false;
      if (typeof PodiumBeat !== "undefined") PodiumBeat.dismount();
      showResults();
      const cb = doneCb;
      doneCb = null;
      if (cb) cb({ phase: "results", reason: reason || "continue", age });
      return true;
    }

    function start(classification, opts, done) {
      reset();
      order = classification || null;
      options = opts || null;
      doneCb = typeof done === "function" ? done : null;
      built = false;
      if (!eligible(order, options)) {
        // No three-car podium → hand off straight to the results sheet.
        showResults();
        if (doneCb) {
          const cb = doneCb;
          doneCb = null;
          cb({ phase: "results", reason: "skip-no-podium", age: 0 });
        }
        return false;
      }
      aimWinner();
      age = 0;
      live = true;
      PodiumBeat.mount(G, order, options, { onContinue: () => finish("continue") });
      return true;
    }

    function tick(dt) {
      if (!live) return;
      age += dt > 0 ? dt : 0;
      if (age >= PODIUM_S) finish("timer");
    }

    function status() {
      return {
        live,
        age,
        phase: live ? "podium" : "idle",
        eligible: order ? eligible(order, options) : false,
      };
    }

    function reset() {
      live = false;
      age = 0;
      order = null;
      options = null;
      doneCb = null;
      built = false;
      if (typeof PodiumBeat !== "undefined") PodiumBeat.dismount();
    }

    return {
      start, tick, finish, status, reset, aimWinner, showResults,
      get PODIUM_S() { return PODIUM_S; },
    };
  }

  return { create, eligible, PODIUM_S };
})();
Object.freeze(RacePodium);
