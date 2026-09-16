/* pit-lane-vm.test.mjs — the pit COMMITMENT against the built complex, in the
 * Node VM (tools/lib/game-vm.cjs), on Bahrain (pit side -1, 14 m road).
 *
 * The bug this pins: the commitment line stayed on the old PAINTED lane edge,
 * 3.2 m inside the road on the pit side, after the complex gave the lane a real
 * entry road. A car holding the pit-side third of the pit straight for half a
 * second armed the limiter on the racing line — from the grid, in traffic, on
 * every circuit (the HUD read KEEP LEFT/RIGHT six seconds into a race). The
 * commitment is now the lane's own tarmac: the car's centre past the lane's
 * inner edge (js/race/pit-lane.js `committing`, COMMIT_IN).
 *
 * Run: node --test tests/unit/pit-lane-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "bahrain";
let g = null, AIM_SIGN = 1;
before(async () => {
  g = await createGame({ track: ID });
  // Does aim(+deg) carry the car toward +x? Calibrated once, like scratch/pit-hunt.cjs.
  await g.race(ID, "day", "dry", { laps: 3 });
  const a = g.apex; a.go(); a.setPhysics({ pace: 1, drift: 0 });
  a.jump(0.5, 30, 0); a.aim(10);
  const x0 = a.physState().x;
  for (let i = 0; i < 10; i++) { a.setInput({ steer: 0, throttle: false }); a.step(1 / 60, 1); }
  AIM_SIGN = a.physState().x > x0 ? 1 : -1;
  a.clearInput();
});
after(() => { if (g) g.close(); });
// Drive toward a lateral by AIMING the car (re-aim along the track cannot
// move it sideways; a steer alone drifts in bends).
function aimTo(a, x, seconds, throttle) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const ps = a.physState();
    a.aim(Math.max(-25, Math.min(25, (x - ps.x) * 8)) * AIM_SIGN);
    a.setInput({ steer: 0, throttle: throttle !== false });
    a.step(1 / 60, 1);
  }
  a.clearInput();
}

async function fresh() {
  await g.race(ID, "day", "dry", { laps: 3 });
  const a = g.apex;
  a.tyres({ level: "real" });
  a.go();
  a.rivals([]);                          // the field away: a player crawling on the pit straight is hit by it (measured: an abort case read 80 km/h after a shunt)
  a.setPhysics({ pace: 1, drift: 0 });   // drift 0: steer 0 holds the lateral
  return a;
}
// Throttle, HOLDING a lateral: the road bends away from a fixed heading (a
// steer-0 car left Bahrain's grid onto the pit lane in five seconds, and the
// window's entry stretch there is the exit of T15), so the car is re-aimed
// along the track every tick and steered proportionally back to `x`.
function drive(a, seconds, x) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const ps = a.physState();
    a.aim(0);
    a.setInput({ steer: Math.max(-1, Math.min(1, (x - ps.x) * 0.5)), throttle: true });
    a.step(1 / 60, 1);
  }
  a.clearInput();
}

test("a car on the racing surface never commits — not from the grid, not on the pit-side third of the road", async () => {
  const a = await fresh();
  // From the grid: five seconds of throttle, holding the slot's own lateral.
  const x0 = a.physState().x;
  drive(a, 5, x0);
  let p = a.pit();
  assert.ok(Math.abs(a.physState().x) < 6, `stayed on the road (${x0.toFixed(2)} → ${a.physState().x.toFixed(2)})`);
  assert.equal(p.armed, false, `armed from the grid (x ${a.physState().x.toFixed(2)})`);
  assert.equal(p.state, "none");
  // On the pit-side third of the road inside the window: the old painted
  // line was at hw - 3.2 = 3.8 m; a car at 5 m off centre on the pit side
  // (2 m from the edge of a 7 m half-road) sat past it.
  const s = a.pit().side;
  a.jump(0.985, 40, 5.0 * s); a.aim(0);
  drive(a, 1.5, 5.0 * s);
  p = a.pit();
  const ps = a.physState();
  assert.ok(Math.abs(ps.x) < 7, `the car stayed on the road (x ${ps.x.toFixed(2)})`);
  assert.equal(p.inWindow, true, "…inside the window");
  assert.equal(p.armed, false, `armed on the racing surface at x ${ps.x.toFixed(2)}`);
  assert.equal(p.state, "none");
  assert.equal(p.commit, 0, "not even counting");
});

// The complex at this car's arc position, straight off the model.
function pitAt(a) {
  const t = g.G.track, p = t.pit, ps = a.physState();
  const k = ((Math.round(ps.s / t.total * t.n) % t.n) + t.n) % t.n;
  return { p, hw: t.hw[k], v: p.v[k], k, ps };
}

test("a commitment is made on the ENTRY ROAD and can be aborted there: back on the road for a second, un-armed", async () => {
  const a = await fresh();
  const t = g.G.track, p = t.pit, L = t.total, s = p.side;
  // 25 m down the entry road, on the lane's tarmac (its inner edge is the
  // road edge here), at a crawl so the road is still 45 m long for the abort.
  const fA = ((p.sA + 25) % L) / L;
  a.jump(fA, 15, 0);
  const hw = pitAt(a).hw;
  a.jump(fA, 15, (hw + 2.0) * s); a.aim(0);
  drive(a, 0.8, (hw + 2.0) * s);
  let q = a.pit();
  assert.equal(q.inWindow, false, "still before the entry line");
  assert.equal(q.armed, true, "committed on the entry road");
  assert.equal(q.state, "none", "…the limiter waits for the line");
  // Changed my mind: back onto the road, held there.
  aimTo(a, 0, 1.6);
  q = a.pit();
  const ps = a.physState();
  assert.ok(Math.abs(ps.x) < hw - 0.5, `on the road (x ${ps.x.toFixed(2)})`);
  assert.equal(q.armed, false, "the entry was aborted");
  assert.equal(q.state, "none");
  // …and the limiter does not meet the car at the line.
  drive(a, 4, 0);
  assert.equal(a.pit().state, "none");
  assert.ok(a.physState().speed * 3.6 > a.pit().limitKph + 10, `free to run (${(a.physState().speed * 3.6).toFixed(0)} km/h)`);
});

test("an armed car already past its own box stays unlimited, and comes in next time round", async () => {
  const a = await fresh();
  // Inside the window, 20 m PAST the box (an AI's plan fires at the lap tick, which sits here).
  a.jump(0.99, 30, 0);
  const p0 = a.pit(), L = g.G.track.total, past = (p0.boxM - p0.atM + 20) / L;
  a.jump(((0.99 + past) % 1 + 1) % 1, 45, 0); a.aim(0);
  a.pit({ arm: true });
  drive(a, 1.5, 0);
  const p = a.pit();
  assert.ok(p.atM > p.boxM, `past the box (at ${p.atM}, box ${p.boxM})`);
  assert.equal(p.armed, true, "still armed for next lap");
  assert.equal(p.state, "none", "not in the lane");
  assert.ok(a.physState().speed * 3.6 > p.limitKph + 10, `no limiter (${(a.physState().speed * 3.6).toFixed(0)} km/h)`);
});

test("a stop is not an auto-rescue: held in the box under throttle, the car stays put and is serviced", async () => {
  const a = await fresh();
  a.jump(0.985, 30, 0);
  const p0 = a.pit(), L = g.G.track.total;
  // 18 m before the box, in the WORKING lane, at a crawl, and creep in under throttle.
  const f = ((0.985 + (p0.boxM - p0.atM - 18) / L) % 1 + 1) % 1;
  a.jump(f, 2.5, 0);
  const lx = a.pit().laneX;
  a.jump(f, 2.5, lx); a.aim(0);
  a.pit({ arm: true });
  let boxed = false, xAtBox = null;
  for (let i = 0; i < 60 * 12; i++) {
    const ps = a.physState(), p = a.pit();
    a.aim(0);
    // Creep to the box (never above 5 m/s), brake at it, then sit on the
    // throttle the whole stop the way touch auto-gas does.
    const near = p.atM >= p.boxM - 3;
    const throttle = p.state === "box" || (!near && ps.speed < 5);
    a.setInput({ steer: Math.max(-1, Math.min(1, (lx - ps.x) * 0.5)), throttle, brake: near && p.state !== "out" && p.state !== "box" && ps.speed > 0.2 });
    a.step(1 / 60, 1);
    if (p.state === "box") { boxed = true; if (xAtBox == null) xAtBox = ps.x; assert.ok(Math.abs(ps.x - xAtBox) < 0.5, `teleported mid-stop (x ${xAtBox.toFixed(2)} → ${ps.x.toFixed(2)})`); }
    if (p.state === "out") break;
  }
  a.clearInput();
  assert.ok(boxed, "reached the box");
  assert.equal(a.pit().state, "out", "serviced");
  assert.equal(a.pit().stops, 1);
});

test("the pit wall stands on both sides: a car on the road cannot run through it, a car in the lane cannot rejoin through it", async () => {
  const a = await fresh();
  const s = a.pit().side;
  // Mid-window (the wall is up), on the road, steering hard at the pit side.
  const L = g.G.track.total, p = g.G.track.pit;
  const fMid = (((p.sIn + p.lenM * 0.5) % L) / L);
  a.jump(fMid, 30, 0); a.aim(0);
  const { hw, v } = pitAt(a);
  assert.ok(v >= 0.98, `the wall stands here (v ${v.toFixed(2)})`);
  aimTo(a, (hw + 6) * s, 2.0);           // aim well past the wall
  const xRoad = a.physState().x * s;
  assert.ok(xRoad <= hw + p.bands.verge - 1.1 + 0.05 && xRoad > hw - 2, `held at the wall's face (x·side ${xRoad.toFixed(2)}, face ${(hw + p.bands.verge).toFixed(2)})`);
  // In the fast lane, aiming hard at the road.
  a.jump(fMid, 20, (hw + p.off.fastIn + 1.6) * s); a.aim(0);
  aimTo(a, 0, 2.0);
  const xLane = a.physState().x * s;
  assert.ok(xLane >= hw + p.off.fastIn + 1.0 - 0.05, `held at the lane's barrier (x·side ${xLane.toFixed(2)}, barrier ${(hw + p.off.fastIn).toFixed(2)})`);
});

test("an armed AI is guided: the pit side of the road on the approach, one line that peels off the road and blends back, and a cap that meets the limit at the line", async () => {
  await fresh();
  const t = g.G.track, p = t.pit, L = t.total, s = p.side, pits = g.G.pits;
  const hwAt = (arc) => t.hw[((Math.round(arc / L * t.n) % t.n) + t.n) % t.n];
  const wrap = (v) => ((v % L) + L) % L;
  // A stub AI car (laneX reads only these fields); `want` is the racing line.
  const ai = (arc, state) => ({ human: false, pitArmed: true, pitState: state || "none", s: wrap(arc), x: 0 });
  const lat = (arc) => pits.laneX(ai(arc), hwAt(wrap(arc)), 0.5) * s;   // toward the pit side
  // Two hundred metres before the entry road: the pit side of the road.
  const hwApp = hwAt(wrap(p.sA - 100));
  assert.ok(lat(p.sA - 100) > hwApp - 2 && lat(p.sA - 100) < hwApp, `approach line inside the road edge (${lat(p.sA - 100).toFixed(2)} of hw ${hwApp.toFixed(2)})`);
  assert.equal(pits.laneX(ai(p.sA - 1500), 7, 0.5), 0.5, "…but not from 1.5 km out: the racing line");
  // The entry road: from inside the road edge to the fast lane's centre at the line, monotone.
  let prev = -Infinity;
  for (let d = 2; d <= p.entryRoadM; d += 4) {
    const x = lat(p.sA + d);
    assert.ok(x >= prev - 0.05, `the peel never turns back (${prev.toFixed(2)} → ${x.toFixed(2)} at +${d} m)`);
    prev = x;
  }
  assert.ok(lat(p.sA + 2) < hwAt(wrap(p.sA + 2)), "the peel starts inside the road");
  const fastC = hwAt(p.sIn) + p.off.fastIn + p.bands.fast / 2;
  const atLine = pits.laneX(ai(p.sIn + 1, "lane"), hwAt(wrap(p.sIn + 1)), 0.5) * s;   // update() has flipped the state by then
  assert.ok(Math.abs(atLine - fastC) < 0.3, `…and reaches the fast lane's centre at the line (${atLine.toFixed(2)} vs ${fastC.toFixed(2)})`);
  assert.ok(Math.abs(lat(p.sIn - 1) - fastC) < 0.6, `…having peeled all the way out on the road (${lat(p.sIn - 1).toFixed(2)} vs ${fastC.toFixed(2)})`);
  // The exit road, for a serviced car: from the fast lane back inside the road edge.
  const out = (arc) => pits.laneX({ human: false, pitArmed: false, pitState: "out", s: wrap(arc), x: 0 }, hwAt(wrap(arc)), 0.5) * s;
  assert.ok(Math.abs(out(p.sOut + 1) - (hwAt(p.sOut) + p.off.fastIn + p.bands.fast / 2)) < 0.3, "leaves on the fast lane's centre");
  assert.ok(out(p.sB - 2) < hwAt(wrap(p.sB - 2)), `…and is inside the road edge where the ribbon ends (${out(p.sB - 2).toFixed(2)})`);
  // The cap: the limit at the line, a braking curve before it, nothing a lap out.
  const lim = pits.limit();
  assert.ok(Math.abs(pits.entryV(ai(p.sIn - 2)) - lim) < 0.5, "at the limit at the line");
  assert.ok(pits.entryV(ai(p.sIn - 100)) > lim + 10 && pits.entryV(ai(p.sIn - 100)) < pits.entryV(ai(p.sIn - 300)), "a rising curve away from it");
  assert.equal(pits.entryV(ai(p.sIn + 50)), Infinity, "and no cap inside the window");
});

test("a car on the lane's own tarmac commits, and the limiter comes on", async () => {
  const a = await fresh();
  a.jump(0.985, 40, 0);
  const drv = a.pit().driveX;            // the fast lane's centre here
  assert.ok(drv != null && Math.abs(drv) > 7, `the lane is beside the road (driveX ${drv})`);
  a.jump(0.985, 40, drv); a.aim(0);
  drive(a, 1.5, drv);
  const p = a.pit();
  assert.equal(p.armed, true, "on the entry road, held: committed");
  assert.equal(p.state, "lane");
  assert.equal(p.inLaneLat, true);
});
