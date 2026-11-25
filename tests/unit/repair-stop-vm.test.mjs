/* repair-stop-vm.test.mjs — a REPAIR-ONLY pit stop with tyre wear OFF (#5878, decision A), in the
 * Node VM (tools/lib/game-vm.cjs), on Bahrain.
 *
 * PitLane.enabled() needs wear on, so with wear OFF the lane never opened and a HANDLING damage
 * hit could never be repaired (Damage repairs on the release edge, pitOutT). With DAMAGE HANDLING
 * on, the lane now opens for a stop that repairs and fits no tyres; strategy stays off.
 *
 * Run: node --test tests/unit/repair-stop-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "bahrain";
let g = null;
before(async () => { g = await createGame({ track: ID }); });
after(() => {
  if (g) { g.sandbox.DamageHandling.setEnabled(false); g.close(); }
});

// Creep down the working lane into the box (tt-pit-lane-vm.test.mjs's recipe); the pit states seen.
function creepToBox(a, ticks) {
  const L = g.G.track.total, p0 = a.pit();
  const f = (((a.physState().s + p0.boxM - p0.atM - 18) / L) % 1 + 1) % 1;
  a.jump(f, 2.5, 0);
  const lx = a.pit().laneX;
  a.jump(f, 2.5, lx); a.aim(0);
  a.pit({ arm: true });
  const seen = [];
  for (let i = 0; i < ticks; i++) {
    const ps = a.physState(), p = a.pit();
    const near = p.atM >= p.boxM - 3;
    a.aim(0);
    a.setInput({ steer: Math.max(-1, Math.min(1, (lx - ps.x) * 0.5)), throttle: !near && ps.speed < 5,
      brake: near && p.state !== "out" && p.state !== "box" && ps.speed > 0.2 });
    a.step(1 / 60, 1);
    seen.push(a.pit().state);
    if (seen[seen.length - 1] === "box") break;
  }
  a.clearInput();
  return seen;
}

test("wear OFF + DAMAGE HANDLING: the lane opens for a repair-only stop; no tyres, no strategy", () => {
  const a = g.apex, G = g.G, sb = g.sandbox;
  a.go();
  a.setPhysics({ pace: 1, drift: 0 });
  assert.equal(G.tyres.on(), false, "the VM pins tyre wear off");
  assert.equal(G.timeTrial, false, "a race, not a Time Trial");
  const p = G.player, pits = G.pits;
  sb.DamageHandling.setEnabled(false);
  assert.equal(pits.arm(p, true), false, "DISPLAY damage with wear off: still no lane (unchanged)");
  sb.DamageHandling.setEnabled(true);
  const r = sb.Damage.get(p);
  r.fwL = 0.6; r.floor = 0.3;   // a front hit's worth
  assert.ok(sb.Damage.state(p).shown, "the car is damaged");
  assert.equal(pits.planInfo(p), null, "no stop strategy with wear off");
  assert.equal(pits.twoCompoundApplies(), false, "no compound rule");
  const tyre = p.tyre && p.tyre.id;
  const seen = creepToBox(a, 60 * 12);
  assert.equal(seen[seen.length - 1], "box", "reached the box: " + seen.slice(-3).join(","));
  const zz = pits.zoneOf();
  assert.equal(p.pitT, zz.boxS, "a race stop's hold, not the Time Trial's decision time");
  for (let i = 0; i < Math.ceil(zz.boxS * 60) + 2; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  a.clearInput();
  assert.equal(p.pitState, "out", "released");
  const d = sb.Damage.state(p);
  assert.equal(d.fwL + d.fwR + d.rw + d.floor, 0, "the stop repaired the car: " + JSON.stringify(d));
  assert.equal(p.tyre && p.tyre.id, tyre, "no tyre service on a repair-only stop");
});

// #5775 R12 (Bryce's decision A, 2026-11-24): with the lane SHUT (wear off, damage off, a race)
// its tarmac and wall pin stay, and a car driven onto it was railed along at full speed (Monaco:
// 49.6 m/s against a 14 m/s cap, no hold, no cut). Now the limiter holds it; no stop is offered.
test("wear OFF + damage OFF: a car driven onto the shut lane is held to the limiter, no stop offered", () => {
  const a = g.apex, G = g.G, sb = g.sandbox;
  a.go();
  a.setPhysics({ pace: 1, drift: 0 });
  sb.DamageHandling.setEnabled(false);
  const p = G.player, pits = G.pits, L = G.track.total;
  pits.reset(p);   // the test above leaves the car "out" of its stop: inLane() would hold it, vacuously
  assert.equal(G.tyres.on(), false, "the VM pins tyre wear off");
  a.jump(0.985, 30, 0);
  const p0 = a.pit();
  const f = (((0.985 * L + (p0.boxM - p0.atM) * 0.2) / L) % 1 + 1) % 1;   // inside the window, short of the box
  a.jump(f, 30, a.pit().laneX); a.aim(0);
  assert.equal(pits.arm(p, true), false, "anti-vacuity: the lane is shut, no stop can be armed");
  assert.equal(pits.onClosedLane(p), true, "on the shut lane's tarmac");
  // MERGED-REVIEW 2026-11-25 row 4: held() — the OT/boost gate and the HUD cue — agrees with the cap.
  assert.equal(pits.inLane(p), false, "anti-vacuity: no stop state, only the shut lane's tarmac");
  assert.equal(pits.held(p), true, "held on the shut lane: no OT or boost under the cap");
  for (let i = 0; i < 60; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  a.clearInput();
  assert.ok(p.speed <= pits.limit() + 1e-6, `the limiter holds on the shut lane (${p.speed.toFixed(2)} <= ${pits.limit().toFixed(2)} m/s)`);
  assert.equal(p.pitState || "none", "none", "no stop: the car is not serviced");
  // On the racing line beside it: no limiter.
  a.jump(f, 30, 0); a.aim(0);
  assert.equal(pits.onClosedLane(p), false, "the racing line is not the lane");
  assert.equal(pits.held(p), false, "not held on the racing line");
});
