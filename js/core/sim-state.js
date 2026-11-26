/* Apex 26 — SimState: ONE definition of "the simulation state" (#6860 phase 1, decision B).
 *
 * WHY. Every determinism break that reached the deploy branch was state a reset
 * or a restore forgot (2026-09-08 per-car scratch, #6560 paceRef, #6862 P1/P2):
 * each consumer kept its own hand list, and the next module-level `let` repeated
 * the bug. Here a module that owns sim state REGISTERS it once, and every
 * consumer — practice rewind, checkpoint retry today; reset(), re-sim replay and
 * a VS FRIEND resync later (#6860 phases 2-5) — goes through the same three calls.
 *
 *   SimState.register(name, { capture(G), restore(data, G, opts), clear?(G), order? })
 *   SimState.capture(G)              → { v, parts: { name: data } }
 *   SimState.restore(snap, G, opts)  → restores every registered part the snapshot holds
 *   SimState.clear(G)                → every part's clear()
 *
 * ORDER IS A CONTRACT: parts run by ascending `order`, then registration order.
 * The reset-only side worlds (IncidentSim, DebrisWorld: order -10) hand their
 * takeovers back BEFORE the cars are written (order 0), so a handback can never
 * overwrite a restored pose, and per-car side tables keyed by car index (Damage:
 * order 10) restore after the cars exist.
 *
 * The parts registered here are the ones whose owners load eagerly (the sim RNG
 * through G.simSeed, the cars, the race clock and sectors, IncidentSim and
 * DebrisWorld) — this file is LAZY_RACE_SESSION, so an eager module cannot call
 * register() at its own eval. A LAZY_RACE_SESSION module registers itself
 * (js/race/damage.js). tests/unit/sim-state.test.mjs is the guard. Never read
 * by the physics step: capture/restore run only on a player's explicit practice
 * action (and in tests), so nothing here can reach the driver (AGENTS.md §Physics).
 */
"use strict";
var SimState = (function () {
  const VERSION = 1;
  const parts = [];   // { name, capture, restore, clear, order, seq }
  let seq = 0;

  function register(name, spec) {
    if (typeof name !== "string" || !name) throw new Error("SimState.register: a name is required");
    if (!spec || typeof spec.capture !== "function" || typeof spec.restore !== "function")
      throw new Error("SimState.register(" + name + "): capture and restore are required");
    const at = parts.findIndex((p) => p.name === name);
    const p = { name, capture: spec.capture, restore: spec.restore, clear: spec.clear || null,
      order: Number.isFinite(spec.order) ? spec.order : 0, seq: at >= 0 ? parts[at].seq : seq++ };
    if (at >= 0) parts[at] = p; else parts.push(p);   // re-registering (a lazy bundle re-evaluated) replaces
    parts.sort((a, b) => a.order - b.order || a.seq - b.seq);
    return name;
  }
  const names = () => parts.map((p) => p.name);
  const has = (name) => parts.some((p) => p.name === name);

  function capture(G) {
    const out = {};
    for (const p of parts) out[p.name] = p.capture(G);
    return { v: VERSION, parts: out };
  }
  // A part the snapshot does not hold is LEFT ALONE, not cleared: a snapshot
  // taken before a lazy module registered must not wipe that module's state.
  // A reset-only part (capture → null) still runs its restore, which resets it.
  function restore(snap, G, opts) {
    if (!snap || snap.v !== VERSION || !snap.parts) return false;
    for (const p of parts) if (Object.hasOwn(snap.parts, p.name)) p.restore(snap.parts[p.name], G, opts || {});
    return true;
  }
  function clear(G) { for (const p of parts) if (p.clear) p.clear(G); }

  // ── the car part (moved from js/race/driving-coach.js, #6860) ─────────────
  // The generic sweep is deliberate: a car carries ~60 live primitives and an
  // explicit list would rot silently — see EPISODE_TRANSIENTS in
  // js/agent/apex.js, which had to be built by measurement rather than
  // inspection for exactly that reason. Never a career or a remote car.
  const PRIM = (v) => v == null || ["number", "boolean", "string"].includes(typeof v);
  // WHICH car fields are which kind is car-state definition, declared once in
  // js/race/car-fields.js (CarFields.SNAPSHOT, beside the per-car reset table;
  // #6945 U1.1): DEEP, STATE, STATIC, RUNTIME (never captured nor deleted) and
  // KEEP_FORWARD, each with its why. CarFields is FULL, this file is LAZY, so
  // it is always there when this IIFE runs.
  const CAR = CarFields.SNAPSHOT;
  const DEEP = CAR.DEEP;
  const RUNTIME = new Set(CAR.RUNTIME);
  // A DEEP COPY WITHOUT THE STRING IN THE MIDDLE. The round trip through
  // JSON.stringify/parse built and reparsed a text representation of three
  // objects per car — 20 cars at 2 Hz is 120 serialisations a minute whose
  // only product is a copy. This walks the value directly.
  //
  // JSON-FAITHFUL ON PURPOSE, because restore() reads what capture() wrote
  // and a semantic change here is a silently wrong rewind: a non-finite
  // number becomes null (JSON.stringify writes `null` for NaN and Infinity),
  // an undefined property is dropped from an object but becomes null in an
  // array, and functions go the same way. tests/unit/coach-clone.test.mjs
  // pins every one of those against the round trip it replaces.
  function jsonClone(v) {
    if (v === null) return null;
    const t = typeof v;
    // -0 is the subtle one: JSON.stringify writes "0", so the round trip
    // hands back +0 — and 1/x tells them apart, so a copy that kept -0 is a
    // value the original never round-tripped to. `v === 0` is true for both
    // zeroes, so this normalises exactly the one case.
    if (t === "number") return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
    if (t !== "object") return t === "function" || t === "undefined" ? undefined : v;
    if (Array.isArray(v)) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) {
        const x = jsonClone(v[i]);
        out[i] = x === undefined ? null : x;   // JSON writes null for a hole
      }
      return out;
    }
    // toJSON is what makes a Date serialise as a string; honour it rather
    // than copying the object's own (empty) enumerable properties.
    if (typeof v.toJSON === "function") return jsonClone(v.toJSON());
    const out = {};
    for (const k of Object.keys(v)) {
      const x = jsonClone(v[k]);
      if (x !== undefined) out[k] = x;
    }
    return out;
  }
  // EVERY OBJECT A CAR HOLDS IS ONE OF FOUR KINDS (CarFields.SNAPSHOT says
  // which): DEEP is copied by jsonClone above; STATE by cloneState below
  // (typed arrays sliced, a car or the track kept by identity); a CAR (passOf,
  // _qOf, _trOf ...) is restored by identity; STATIC is never copied.
  const STATE = CAR.STATE;
  const STATIC = new Set(CAR.STATIC);
  const KEEP_BY_IDENTITY = new Set(["track"]);   // _lk.track: the circuit the cache was built on
  function cloneState(v, cars) {
    if (v == null || typeof v !== "object" || cars.includes(v)) return v;
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map((x) => cloneState(x, cars));
    const out = {};
    for (const k of Object.keys(v)) out[k] = KEEP_BY_IDENTITY.has(k) ? v[k] : cloneState(v[k], cars);
    return out;
  }
  function captureCar(c, cars) {
    cars = cars || [];
    const fields = {}, refs = {}, state = {};
    for (const k of Object.keys(c)) {
      const v = c[k];
      if (PRIM(v)) { if (!RUNTIME.has(k)) fields[k] = v; }
      else if (cars.includes(v)) refs[k] = v;
    }
    const objects = {};
    for (const k of DEEP) objects[k] = c[k] == null ? c[k] : jsonClone(c[k]);
    for (const k of STATE) state[k] = cloneState(c[k], cars);
    return { fields, objects, refs, state };
  }
  // PENALTIES, CUTS AND ROLE FLAGS DO NOT REWIND FOR THE PLAYER
  // (`opts.keepForward`, the practice rewind's policy; why: CarFields.SNAPSHOT).
  const KEEP_FORWARD = CAR.KEEP_FORWARD;
  function applyCar(c, snap, keepForward, cars) {
    const keep = {};
    if (keepForward) for (const k of KEEP_FORWARD) if (Object.hasOwn(c, k)) keep[k] = c[k];
    for (const k of Object.keys(c)) if (PRIM(c[k]) && !RUNTIME.has(k) && !Object.hasOwn(snap.fields, k)) delete c[k];
    Object.assign(c, snap.fields, keep);
    for (const [k, v] of Object.entries(snap.objects)) c[k] = v == null ? v : jsonClone(v);
    if (snap.refs) Object.assign(c, snap.refs);
    if (snap.state) for (const [k, v] of Object.entries(snap.state)) c[k] = cloneState(v, cars || []);
    // The interpolator must not tween the car across the gap it just jumped —
    // it would draw a streak from where the car was to where it now is.
    c._prevS = c.s;
    c.rPrevPx = c.px; c.rPrevPz = c.pz;
    c.rPrevHead = c.head; c.rPrevS = c.s; c.rPrevX = c.x;
  }

  // ── core parts: owners that load eagerly ──────────────────────────────────
  // RESET, NOT RESTORED: DebrisWorld is a Rapier (WASM) side-world with
  // reset()/prime() and no snapshot, and IncidentSim's takeovers are keyed to
  // ticks that no longer exist. Restoring clears marbles and live takeovers
  // rather than putting them back — the honest difference from a time machine.
  register("incidents", { order: -10, capture: () => null,
    restore: () => { if (typeof IncidentSim !== "undefined") IncidentSim.reset(); },
    clear: () => { if (typeof IncidentSim !== "undefined") IncidentSim.reset(); } });
  register("debris", { order: -10, capture: () => null,
    restore: () => { if (typeof DebrisWorld !== "undefined") DebrisWorld.reset(); },
    clear: () => { if (typeof DebrisWorld !== "undefined") DebrisWorld.reset(); } });
  // The seeded stream position (game.js simSeed): without it a rewind
  // continues a race the same seed would not have produced (#6860 §2).
  register("rng", {
    capture: (G) => (G && typeof G.simSeed === "function" ? { seed: G.simSeed(), pos: G.simSeed(undefined, true) } : null),
    restore: (d, G) => { if (d && G && typeof G.simSeed === "function") G.simSeed(d.seed, d.pos); },
  });
  // Index-keyed: `cars` is built once by makeCars() and its ORDER never
  // changes (standings are derived from prog, not by sorting this array), so
  // index i is the same car across the window. Length-guarded anyway.
  register("cars", {
    capture: (G) => { const cars = G.cars || []; return cars.map((c) => captureCar(c, cars)); },
    restore: (d, G, opts) => {
      const cars = G.cars || [];
      for (let i = 0; i < cars.length && i < d.length; i++)
        applyCar(cars[i], d[i], !!(opts.keepForward && cars[i].isPlayer), cars);
    },
  });
  // The AI pace profile paceSample learns (js/race/pace-math.js, #6560): the
  // player's paceF is judged against it, so a rewound player read against a
  // profile from the future diverges on the first step (#6860).
  register("pace", {
    capture: (G) => (typeof G.paceRef === "function" ? G.paceRef().slice() : null),
    restore: (d, G) => { const r = d && typeof G.paceRef === "function" ? G.paceRef() : null; if (r && r.length === d.length) r.set(d); },
    clear: (G) => { if (typeof G.paceRef === "function") G.paceRef().fill(0); },
  });
  // THE CLOCK COMES BACK TOO. Without it the cars are 10 s younger and the
  // race is not, so every gap, delta and lap projection reads wrong.
  register("clock", {
    capture: (G) => ({ raceT: G.raceT, sectorIdx: G.sectorIdx, sectorStartT: G.sectorStartT,
      fieldSectorBests: G.fieldSectorBests?.slice(),
      sectorBests: Array.isArray(G.sectorBests) ? G.sectorBests.slice() : null,
      sectorLast: Array.isArray(G.sectorLast) ? G.sectorLast.slice() : null }),
    restore: (w, G) => {
      if (Number.isFinite(w.raceT)) G.raceT = w.raceT;
      G.resultT = 0; // Recompute finish eligibility from the restored field next tick.
      if (Number.isFinite(w.sectorIdx)) G.sectorIdx = w.sectorIdx;
      if (Number.isFinite(w.sectorStartT)) G.sectorStartT = w.sectorStartT;
      if (w.sectorBests) G.sectorBests = w.sectorBests.slice();
      if (w.fieldSectorBests && G.fieldSectorBests) G.fieldSectorBests.splice(0, G.fieldSectorBests.length, ...w.fieldSectorBests);
      // sectorLast has no setter — mutate the live array in place.
      if (w.sectorLast && Array.isArray(G.sectorLast)) {
        G.sectorLast.length = 0;
        for (const v of w.sectorLast) G.sectorLast.push(v);
      }
    },
  });

  return Object.freeze({ register, names, has, capture, restore, clear, VERSION,
    jsonClone, captureCar, applyCar, KEEP_FORWARD, RUNTIME, DEEP, STATE, STATIC });
})();
