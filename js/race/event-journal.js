/* Apex 26 — EVENT JOURNAL: read-only per-race log for highlight reels.
 *
 * Records { t, kind, car, pos, gain, sev } from RaceFacts (one instance, via
 * RaceRadio's onEvents opt) plus edge detectors for penalties, lock-ups,
 * contact severity and pile-ups. Never writes a car field and never draws sim RNG.
 */
var EventJournal = (function () {
  "use strict";

  const CAP = 256;
  const LOCK_THRESH = 0.3;
  const CONTACT_SEV = 0.5;

  function create(G, opts) {
    const o = opts || {};
    const incidentOwns = o.incidentOwns || ((c) => !!(c && c._incidentOwned));
    let log = [];
    let lastCars = null;
    let pileActive = false;
    const pen = new Map();
    const locked = new Map();
    const hit = new Map();

    function reset() {
      log = [];
      lastCars = null;
      pileActive = false;
      pen.clear();
      locked.clear();
      hit.clear();
    }

    function posOf(car) {
      if (!car || !G.cars) return 0;
      const i = G.cars.indexOf(car);
      return i >= 0 ? i + 1 : 0;
    }

    function push(row) {
      if (log.length >= CAP) log.shift();
      log.push(row);
    }

    function onFacts(ev, f) {
      if (!ev || !ev.length) return;
      const ft = f && Number.isFinite(f.t) ? f.t : (G.raceT || 0);
      for (const e of ev) {
        const row = rowFromFacts(e, f, ft);
        if (row) push(row);
      }
    }

    function rowFromFacts(e, f, ft) {
      switch (e.type) {
        case "pass":
          return { t: ft, kind: "pass", car: e.a, pos: e.pos || 0, gain: 1, sev: 0, meta: { b: e.b } };
        case "retire":
          return { t: ft, kind: "retire", car: e.car, pos: e.pos || posOf(e.car), gain: 0, sev: 0, meta: { why: e.why } };
        case "fastest":
          return { t: ft, kind: "fastest", car: e.car, pos: posOf(e.car), gain: 0, sev: 0, meta: { time: e.time } };
        case "caution":
          return { t: ft, kind: "caution", car: null, pos: 0, gain: 0, sev: e.level | 0, meta: { prev: e.prev } };
        case "finish":
          return { t: ft, kind: "finish", car: e.car, pos: e.pos || posOf(e.car), gain: 0, sev: 0 };
        case "hit":
          return { t: ft, kind: "hit", car: G.player, pos: (f && f.pos) || 0, gain: 0, sev: e.sev || 0 };
        case "mistake":
          return { t: ft, kind: "mistake", car: e.car, pos: e.pos || posOf(e.car), gain: 0, sev: 0 };
        case "start":
          return { t: ft, kind: "start", car: e.leader, pos: 1, gain: 0, sev: 0 };
        default:
          return null;
      }
    }

    function sampleEdges() {
      if (G.state !== "race" || !G.cars || G.cars.length < 2) return;
      if (G.timeTrial || G.practice) return;
      const now = G.raceT || 0;
      if (G.cars !== lastCars) {
        reset();
        lastCars = G.cars;
      }
      for (const c of G.cars) {
        if (!c) continue;
        const pPen = pen.get(c) || 0;
        const nPen = c.penalty || 0;
        if (nPen > pPen && !c.isPlayer) {
          push({ t: now, kind: "penalty", car: c, pos: posOf(c), gain: nPen - pPen, sev: 0 });
        }
        pen.set(c, nPen);

        const isLock = !c.offroad && (c.wheelLock || 0) > LOCK_THRESH;
        if (isLock && !locked.get(c)) {
          push({ t: now, kind: "wheelLock", car: c, pos: posOf(c), gain: 0, sev: c.wheelLock || 0 });
        }
        locked.set(c, isLock);

        const sev = c.hitSev || 0;
        const prevSev = hit.get(c) || 0;
        if (sev > prevSev && sev >= CONTACT_SEV) {
          push({ t: now, kind: "contact", car: c, pos: posOf(c), gain: 0, sev });
        }
        hit.set(c, sev);
      }
      let owned = 0;
      for (const c of G.cars) if (c && incidentOwns(c)) owned++;
      const pile = owned >= 2;
      if (pile && !pileActive) {
        push({ t: now, kind: "pileUp", car: null, pos: 0, gain: owned, sev: 0 });
      }
      pileActive = pile;
    }

    function update(_dt) {
      sampleEdges();
    }

    return {
      reset,
      update,
      onFacts,
      events: () => log.slice(),
      count: () => log.length,
      CAP,
    };
  }

  function radioHooks(journal) {
    return { onEvents: (ev, f) => journal.onFacts(ev, f) };
  }

  return { create, radioHooks, CAP };
}());
Object.freeze(EventJournal);
