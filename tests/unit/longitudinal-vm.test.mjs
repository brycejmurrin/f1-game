/* longitudinal-vm.test.mjs — tests/specs/longitudinal.spec.js replayed in the
 * Node VM (tools/game-vm.cjs): throttle/coast/brake, grass drag, speed-
 * sensitive steering, slope gravity (spa) and the start/finish wrap, with the
 * SAME assertions, thresholds and PACE pin (setPhysics({ pace: 1 })).
 *
 * Ported: all 6 tests.
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/longitudinal-vm.test.mjs   (~8 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

// PACE pinned — see the browser spec: the acceleration bounds are in m/s.
const pinPace = () => g.apex.setPhysics({ pace: 1 });

async function startRace() {
  fresh();
  await g.race("monza", "day", "dry");
  pinPace();
}

// Hold an input from a clean jump and report start/end speed.
function drive(input, ticks) {
  const a = g.apex;
  a.jump(0.0, input.v0 ?? 0, 0);
  a.setInput({ steer: 0, throttle: !!input.throttle, brake: !!input.brake });
  const v0 = a.probe().speed;
  for (let i = 0; i < ticks; i++) a.step(1 / 60, 1);
  const v1 = a.probe().speed;
  a.clearInput();
  return { v0, v1 };
}

test("throttle accelerates from rest toward a high top speed", async () => {
  await startRace();
  const r = drive({ throttle: true, v0: 0 }, 60);   // 1 s
  gt(r.v1, r.v0 + 5);                                // clearly accelerating
  // PEAK speed while still ON the racing line (Monza's first chicane is ~56 m
  // past the line — see the browser spec for why the final speed was wrong).
  const a = g.apex;
  a.jump(0.0, 0, 0);
  a.setInput({ steer: 0, throttle: true });
  let peak = 0;
  for (let i = 0; i < 420; i++) {
    a.step(1 / 60, 1);
    const pr = a.probe();
    if (Math.abs(pr.x) > 8) break;   // left the track at the chicane — stop measuring
    peak = Math.max(peak, pr.speed);
  }
  a.clearInput();
  assert.ok(Number.isFinite(peak));
  gt(peak, 20);     // strong pull off the line
  lt(peak, 150);    // sane physical ceiling, not an exact VMAX pin
});

test("braking slows faster than coasting, both slower than throttle", async () => {
  await startRace();
  const brake = drive({ brake: true, v0: 70 }, 30);
  const coast = drive({ v0: 70 }, 30);
  const gas   = drive({ throttle: true, v0: 70 }, 30);
  const dBrake = brake.v1 - brake.v0;
  const dCoast = coast.v1 - coast.v0;
  const dGas   = gas.v1 - gas.v0;
  lt(dBrake, dCoast);
  lt(dCoast, 0);
  gt(dGas, dCoast);
});

test("driving onto the grass bleeds speed", async () => {
  await startRace();
  const a = g.apex;
  a.jump(0.0, 80, 14);
  a.setInput({ steer: 0, throttle: true });
  const v0 = a.probe().speed;
  for (let i = 0; i < 60; i++) a.step(1 / 60, 1);
  const v1 = a.probe().speed;
  a.clearInput();
  lt(v1, v0);     // grass drag dominates throttle
});

test("steering is speed-sensitive: a tighter line at low speed than high", async () => {
  await startRace();
  const turnPerMetre = (v) => {
    const a = g.apex;
    a.jump(0.0, v, 0);
    a.setInput({ steer: 1, throttle: false });
    const b = a.probe();
    for (let i = 0; i < 20; i++) a.step(1 / 60, 1);
    const p = a.probe();
    a.clearInput();
    const dHead = Math.abs(p.angle - b.angle);
    const ds = Math.max(1e-3, ((p.s - b.s) + 1e6) % 1e6);
    return dHead / ds;     // rad per metre of travel ≈ path curvature
  };
  const slow = turnPerMetre(18);
  const fast = turnPerMetre(75);
  gt(slow, fast * 1.3);   // turns much tighter when slow
});

test("slope gravity: descents don't overspeed past top speed; climbs aren't a barrier", async () => {
  fresh();
  await g.race("spa", "day", "dry");
  pinPace();   // climbGain is in m/s — see pinPace
  const a = g.apex;
  let dnAt = 0, dn = 0, upAt = 0, up = 0;
  for (let i = 0; i < 300; i++) {
    const f = i / 300;
    a.jump(f, 40, 0); a.step(1 / 60, 1);
    const s = a.physState().slope;
    if (s < dn) { dn = s; dnAt = f; }
    if (s > up) { up = s; upAt = f; }
  }
  let flatAt = 0, flatSlope = Infinity;
  for (let i = 0; i < 300; i++) {
    const f = i / 300;
    a.jump(f, 40, 0); a.step(1 / 60, 1);
    const ab = Math.abs(a.physState().slope);
    if (ab < flatSlope) { flatSlope = ab; flatAt = f; }
  }
  a.jump(flatAt, 40, 0);
  a.setInput({ steer: 0, throttle: true });
  let flatMax = 0;
  for (let i = 0; i < 420; i++) { a.step(1 / 60, 1); flatMax = Math.max(flatMax, a.physState().speed); }
  a.jump(dnAt, flatMax, 0);
  let maxV = 0, finite = true;
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60, 1);
    const v = a.physState().speed;
    if (!Number.isFinite(v)) finite = false;
    maxV = Math.max(maxV, v);
  }
  a.jump(upAt, 10, 0);
  const v0 = a.physState().speed;
  for (let i = 0; i < 120; i++) a.step(1 / 60, 1);
  const v1 = a.physState().speed;
  a.clearInput();
  assert.equal(finite, true);
  lt(maxV, flatMax * 1.35);   // no descent runaway
  gt(v1 - v0, 5);             // climbs freely, never an invisible barrier
});

test("crossing the start/finish line advances s (wraps) and increments the lap", async () => {
  await startRace();
  const a = g.apex;
  const total = a.info().total;
  a.setPhysics({ roadFollow: 0.7 });
  a.jump(0.995, 40, 0);
  a.setInput({ steer: 0, throttle: true });
  const startLap = a.cars().find((c) => c.p).lap;
  let prev = a.probe().s, wraps = 0, monotoneBreaks = 0;
  for (let i = 0; i < 240; i++) {        // ~4 s — crosses s=0 then runs the straight
    a.step(1 / 60, 1);
    const s = a.probe().s;
    let d = s - prev;
    if (d < -total / 2) { wraps++; d += total; }   // crossed start/finish
    if (d < -0.5) monotoneBreaks++;                // went backwards (shouldn't)
    prev = s;
  }
  const endLap = a.cars().find((c) => c.p).lap;
  a.clearInput();
  a.setPhysics({ roadFollow: 0 });   // restore the shipped default
  assert.equal(wraps, 1);                 // crossed the line exactly once
  assert.equal(endLap, startLap + 1);     // lap counter advanced by one
  assert.equal(monotoneBreaks, 0);        // always moving forward
});
