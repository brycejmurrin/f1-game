/* elevation-probes.cjs — the per-circuit recipes of tests/specs/elevation-tracks
 * .spec.js, in ONE copy that both halves of the twin run.
 *
 * tests/unit/elevation-tracks-vm.test.mjs dispatches a circuit to a
 * tools/lib/game-vm-pool.cjs worker, which compiles the function TEXT below and
 * calls it against its own game-vm handle; with APEX_VM_POOL=0 the same file
 * calls the same functions in-process against the parent's handle. Two copies
 * would be two recipes, and the whole claim of a twin is that it runs the
 * browser spec's launches, step counts and thresholds unchanged.
 *
 * SO: every function here is SELF-CONTAINED. It may read only its arguments —
 * `g` (the game-vm handle), `o` (the job options, including `o.circuit` and the
 * spec's launch constants) and `state` (what INIT returned once per worker).
 * A reference to anything in module scope compiles fine here and throws in the
 * worker, where this file does not exist. Nothing asserts: each returns a plain
 * JSON-serialisable object and the parent test does the asserting, so a failure
 * still names the circuit and the number.
 *
 * The bodies below are verbatim from the browser spec (see it for why the
 * reference run is placed on the straightest stretch and stops off-road); only
 * the closure reads — `g`, FLAT_LAUNCH, CLIMB_LAUNCH, PHYS0 — became arguments.
 */
"use strict";

/** Once per worker, right after the boot: the shipped tuning, so the `fresh()`
 *  of each job can put back knobs a previous circuit left behind (the browser
 *  spec gets a fresh page per test; a worker gets one game for ~8 circuits). */
const INIT = (g) => ({ PHYS0: { ...g.apex.tuning() } });

/** The spec's startRace() + gradientProbe() for one circuit. `relief` is the
 *  spec's "elevation profile never showed relief" guard, asserted by the
 *  parent — a probe that returns `relief:false` read no slope at all. */
const GRADIENT = async function gradient(g, o, state) {
  const A = g.apex;
  A.setPhysics(state.PHYS0); A.headless(false);          // fresh()
  await g.race(o.circuit, "day", "dry");
  const relief = await g.settle(() => {
    const p = A.trackProfile(120);
    if (!p || !p.length) return false;
    const ys = p.map((q) => q.y);
    return Math.max(...ys) - Math.min(...ys) > 0.5;
  }, 200);
  if (!relief) return { relief: false };

  let finite = true;
  const prof = A.trackProfile(300);
  const WIN = 10;                       // ~1/30 of a lap
  let flatAt = 0, bestBend = Infinity;
  for (let i = 0; i < prof.length; i++) {
    let bend = 0;
    for (let j = 0; j < WIN; j++) bend += Math.abs(prof[(i + j) % prof.length].k);
    if (bend < bestBend) { bestBend = bend; flatAt = prof[i].frac; }
  }
  A.jump(flatAt, o.FLAT_LAUNCH, 0);
  A.setInput({ steer: 0, throttle: true });
  let flatMax = 0, flatSteps = 0;
  for (let i = 0; i < 180; i++) {
    A.step(1 / 60, 1);
    const p = A.physState();
    if (Math.abs(p.x) > A.probe().hw) break;   // off the road — stop counting
    flatMax = Math.max(flatMax, p.speed);
    flatSteps++;
  }
  A.clearInput();

  let dnAt = 0, dn = 0, upAt = 0, up = 0;
  for (let i = 0; i < 300; i++) {
    const f = i / 300;
    A.jump(f, 40, 0); A.step(1 / 60, 1);
    const s = A.physState().slope;
    if (s < dn) { dn = s; dnAt = f; }
    if (s > up) { up = s; upAt = f; }
  }

  A.jump(dnAt, flatMax, 0);
  A.setInput({ steer: 0, throttle: true });
  let maxV = 0;
  for (let i = 0; i < 150; i++) {
    A.step(1 / 60, 1);
    const p = A.physState();
    maxV = Math.max(maxV, p.speed);
    if (!Number.isFinite(p.speed) || !Number.isFinite(p.s) || !Number.isFinite(p.x)) finite = false;
  }

  A.jump(upAt, o.CLIMB_LAUNCH, 0);
  const cv0 = A.physState().speed;
  for (let i = 0; i < 150; i++) A.step(1 / 60, 1);
  const cv1 = A.physState().speed;

  A.setPhysics({ roadFollow: 0.6 });
  const corners = A.corners();
  let widest = 0, hw = 7;
  for (const f of corners) {
    A.jump((f - 0.02 + 1) % 1, 30, 0);
    A.setInput({ steer: 0, throttle: false });
    hw = A.probe().hw;
    for (let i = 0; i < 70; i++) {
      A.step(1 / 60, 1);
      const p = A.probe();
      if (!Number.isFinite(p.x)) finite = false;
      widest = Math.max(widest, Math.abs(p.x));
    }
  }
  A.clearInput();
  A.setPhysics({ roadFollow: 0 });   // restore the shipped default
  return { relief: true, dn, up, maxV, flatMax, flatSteps, flatAt: +flatAt.toFixed(3),
           climbGain: cv1 - cv0, climbEnd: cv1, widest, hw, finite };
};

/** The spec's startRace() + bankedProbe() for one banked circuit. */
const BANKED = async function banked(g, o, state) {
  const A = g.apex;
  A.setPhysics(state.PHYS0); A.headless(false);          // fresh()
  await g.race(o.circuit, "day", "dry");
  const relief = await g.settle(() => {
    const p = A.trackProfile(120);
    if (!p || !p.length) return false;
    const ys = p.map((q) => q.y);
    return Math.max(...ys) - Math.min(...ys) > 0.5;
  }, 200);
  if (!relief) return { relief: false };

  A.setPhysics({ roadFollow: 0.6 });
  const corners = A.corners();
  const probe = A.probe.bind(A);
  const scored = corners.map((f) => {
    A.jump(f, 30, 0);
    return { f, k: Math.abs(probe().k) };
  }).sort((a, b) => b.k - a.k).slice(0, 2);

  let finite = true, widest = 0, hw = 7, allProgressed = true;
  for (const { f } of scored) {
    A.jump((f - 0.03 + 1) % 1, 25, 0);
    A.setInput({ steer: 0, throttle: false });   // road-following rides the bank
    const s0 = A.physState().prog;
    hw = probe().hw;
    for (let i = 0; i < 100; i++) {
      A.step(1 / 60, 1);
      const p = probe();
      const ps = A.physState();
      if (!Number.isFinite(p.x) || !Number.isFinite(ps.head) || !Number.isFinite(ps.speed)) finite = false;
      widest = Math.max(widest, Math.abs(p.x));
    }
    if (A.physState().prog <= s0 + 20) allProgressed = false;
  }
  A.clearInput();
  A.setPhysics({ roadFollow: 0 });
  return { relief: true, finite, widest, hw, progressed: allProgressed };
};

module.exports = { INIT, GRADIENT, BANKED };
