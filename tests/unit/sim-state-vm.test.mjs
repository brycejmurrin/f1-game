/* sim-state-vm.test.mjs — the SimState registry (js/core/sim-state.js, #6860
 * phase 1) restores the simulation, checked on the real game in the Node VM.
 *
 * WHY. Replaying a seed was already byte-identical (determinism-replay-vm);
 * RESTORING was not. Practice rewind and checkpoint retry kept their own field
 * list, and three holes reached the deploy branch through it:
 *   - #6862 P1: a sample taken during an IncidentSim takeover re-set
 *     `_incidentOwned` after IncidentSim.reset() had cleared it, and the car
 *     froze for the rest of the session (owns() reads only the flag).
 *   - #6862 P2: the Damage record lives in a module WeakMap, so a rewind left
 *     the car damaged from a hit it had not had yet.
 *   - #6860 §2: the per-car AI controller objects (pass plan, look-ahead cache,
 *     body springs) and the AI pace profile were not captured, so a restored
 *     field diverged on the first step.
 * The P1/P2 tests drive the coach's own mark()/retry(), so they fail on a tree
 * without the registry. The guard fails on a car object field nobody classified.
 *
 * Run: node --test tests/unit/sim-state-vm.test.mjs   (~40 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); await g.race("monza"); });
after(() => { if (g) g.close(); });

const run = (s) => g.apex.rollout({ seconds: s, input: { steer: 0.05, throttle: true } });
const glob = (name) => (name === "SimState" ? vm.runInContext("SimState", g.ctx)
  : name === "IncidentSim" ? vm.runInContext("IncidentSim", g.ctx) : vm.runInContext("Damage", g.ctx));   // literal snippets, never a source load

/** Every primitive field of every car, unrounded (the determinism-replay-vm digest). */
function fullSnap() {
  return g.G.cars.map((c, id) => {
    const o = { id };
    for (const k of Object.keys(c)) {
      const v = c[k];
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") o[k] = v;
    }
    return o;
  });
}
function firstDiff(a, b) {
  for (let c = 0; c < a.length; c++) for (const k of new Set([...Object.keys(a[c]), ...Object.keys(b[c])])) {
    if (!Object.is(a[c][k], b[c][k])) return `car ${a[c].code || c} .${k}: ${a[c][k]} vs ${b[c][k]}`;
  }
  return null;
}
function episode(fn) {
  g.apex.headless(true);
  g.apex.reset(0.02, 55, 0, 42);
  try { return fn(); } finally { g.apex.headless(false); }
}

test("restore at t=20 s, run 10 s: byte-identical to the first run, every field of all 22 cars (#6860 phase 1 Done-when)", () => {
  const SS = glob("SimState");
  episode(() => {
    run(20);
    const snap = SS.capture(g.G);
    const t0 = g.G.raceT;
    run(10);
    const a = fullSnap(), tA = g.G.raceT;
    assert.ok(SS.restore(snap, g.G), "restore must accept its own snapshot");
    assert.equal(g.G.raceT, t0, "the race clock must come back");
    run(10);
    const b = fullSnap();
    assert.equal(a.length, 22, "the pin needs the full 22-car field");
    assert.equal(g.G.raceT, tA, "the restored run must reach the same race time");
    assert.equal(firstDiff(a, b), null, "the run after restore differs from the run it replays");
    assert.ok(a.some((x) => x.isPlayer && x.paceF > 0), "the player never sampled the pace profile, so a missing pace part would go unseen");
  });
});

test("the digest sees a missing part: restoring without the pace profile diverges", () => {
  const SS = glob("SimState");
  episode(() => {
    run(20);
    const snap = SS.capture(g.G);
    run(10);
    const a = fullSnap();
    delete snap.parts.pace;
    SS.restore(snap, g.G);
    run(10);
    assert.notEqual(firstDiff(a, fullSnap()), null, "dropping the pace part changed nothing: the Done-when digest would not catch an unregistered state");
  });
});

/** Practice on, a checkpoint set: the coach's own mark()/retry() path. */
function practice(fn) {
  return episode(() => {
    run(5);
    g.G.practice = true;
    try { return fn(g.G.coach); } finally { g.G.practice = false; g.G.coach.releasePracticeWorlds(); }
  });
}

test("#6862 P1: a checkpoint taken during an incident takeover does not freeze the car after retry", () => {
  const IS = glob("IncidentSim");
  practice((coach) => {
    const cars = [g.G.player, g.G.cars.find((c) => !c.isPlayer)];
    for (const c of cars) c._incidentOwned = true;   // a live Rapier takeover owns it when the sample is taken
    assert.equal(coach.mark(), true, "the checkpoint must be accepted in practice");
    for (const c of cars) c._incidentOwned = false;   // the takeover handed back while the driver drove on
    run(1);
    assert.equal(coach.retry(), true, "retry must restore the checkpoint");
    for (const c of cars) assert.equal(IS.owns(c), false, `${c.code} is still owned by an incident that no longer exists`);
  });
});

test("#6862 P2: retry restores the Damage record, which lives outside the car", () => {
  const D = glob("Damage");
  practice((coach) => {
    const c = g.G.player;
    D.apply(D.get(c), 2, 0, 0.4);            // a front hit before the checkpoint
    const before = JSON.stringify(D.state(c));
    assert.equal(coach.mark(), true);
    D.apply(D.get(c), -2, 0, 0.9);           // a rear hit after it
    assert.notEqual(JSON.stringify(D.state(c)), before, "the second hit must change the record");
    assert.equal(coach.retry(), true);
    assert.equal(JSON.stringify(D.state(c)), before, "retry left the damage of a hit the car has not had yet");
    D.reset(c);
  });
});

test("guard: every object a car holds is classified, and the STATIC ones never change in a race", () => {
  const SS = glob("SimState");
  episode(() => {
    run(20);
    const cars = g.G.cars;
    const statics = cars.map((c) => Object.fromEntries([...SS.STATIC].map((k) => [k, { ref: c[k], json: JSON.stringify(c[k]) }])));
    run(10);
    const deep = new Set(SS.DEEP), state = new Set(SS.STATE);
    const unknown = new Set();
    cars.forEach((c, i) => {
      for (const k of Object.keys(c)) {
        const v = c[k];
        if (v == null || typeof v !== "object" || cars.includes(v)) continue;
        if (!deep.has(k) && !state.has(k) && !SS.STATIC.has(k)) unknown.add(k);
      }
      for (const k of SS.STATIC) {
        assert.equal(c[k], statics[i][k].ref, `${c.code}.${k} was replaced in a race: it is not STATIC`);
        assert.equal(JSON.stringify(c[k]), statics[i][k].json, `${c.code}.${k} changed in a race: it is not STATIC`);
      }
    });
    assert.deepEqual([...unknown], [], "a car holds an object field SimState does not classify (DEEP, STATE, STATIC or a car): add it to CarFields.SNAPSHOT in js/race/car-fields.js");
  });
});

test("guard: the registry holds the phase-1 parts, side worlds before cars, per-car tables after", () => {
  const names = glob("SimState").names();
  for (const n of ["incidents", "debris", "rng", "cars", "pace", "clock", "damage"])
    assert.ok(names.includes(n), `SimState part ${n} is not registered`);
  const at = (n) => names.indexOf(n);
  assert.ok(at("incidents") < at("cars") && at("debris") < at("cars"), "a takeover handback must run before the cars are written");
  assert.ok(at("damage") > at("cars"), "the index-keyed damage table restores after the cars");
});

test("the RNG part puts the sim stream back where it was", () => {
  const SS = glob("SimState");
  episode(() => {
    const snap = SS.capture(g.G);
    const pos = g.G.simSeed(undefined, true);
    g.G.simSeed(g.G.simSeed(), (pos + 12345) >>> 0);
    SS.restore(snap, g.G);
    assert.equal(g.G.simSeed(undefined, true), pos);
  });
});
