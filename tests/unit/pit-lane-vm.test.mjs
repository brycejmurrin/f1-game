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
  // AT THE BOX the guided line IS the box's own centre — not four fifths of the
  // way across it. The diagonal used to finish AT the box while the AI halts
  // BOX_TOL/2 short, so every AI parked wide of its bay and the latch, which
  // only asked that the car had reached the working lane, took it anyway. The
  // move now completes SQUARE_BY_M early, and `boxSquare` — the same test the
  // player's stop has to pass — is satisfied by the line the AI is given.
  const boxArc = wrap(p.sIn + pits.boxThroughFor(ai(p.sIn, "lane")));
  // The latch fires anywhere within BOX_TOL of the box, so the line has to be
  // square EVERYWHERE in that window — and dead on the centre for the last
  // SQUARE_BY_M, where the AI actually halts (BOX_TOL/2 short).
  for (const back of [pits.boxTol, pits.squareByM, 4, 0]) {
    const arc = wrap(boxArc - back), hwB = hwAt(arc);
    const c = { human: false, pitArmed: true, pitState: "lane", s: arc, x: 0, speed: 0 };
    const want = pits.laneCentre(hwB, s, arc), got = pits.laneX(c, hwB, 0.5);
    const tol = back <= pits.squareByM ? 0.35 : pits.squareLat;
    assert.ok(Math.abs(got - want) < tol,
              `the AI's line is its box's own centre ${back} m out (${got.toFixed(2)} vs ${want.toFixed(2)}, tol ${tol})`);
    c.x = got;
    assert.ok(pits.boxSquare(c), `…and a car parked on that line is SQUARE ${back} m out (x ${c.x.toFixed(2)})`);
  }
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

test("the stop is seen: up on the jacks, four wheels off and on, down again — from the hold's own clock", async () => {
  await fresh();
  const pits = g.G.pits, boxS = pits.zoneOf().boxS;
  const at = (u) => pits.stopAnim({ pitState: "box", pitT: boxS * (1 - u) });
  const zero = (v, m) => assert.ok(Math.abs(v) < 1e-6, `${m} (${v})`);
  zero(pits.stopAnim({ pitState: "lane", pitT: 1 }).lift, "nothing moves outside the box");
  zero(at(0).lift, "on the ground at the start"); zero(at(0).off, "wheels on at the start");
  assert.ok(at(0.12).lift > 0.21 && at(0.5).lift > 0.21 && at(0.88).lift > 0.21, "on the jacks through the middle of the stop");
  zero(at(1).lift, "…and down at the end");
  zero(at(0.15).off, "wheels still on when the jacks are up");
  assert.ok(at(0.3).off > 0.5 && at(0.6).off > 0.5, "the wheels are off in the middle");
  zero(at(0.85).off, "…and back on before the car drops");
  assert.ok(boxS > 2 && boxS < 2.5, `the hold is ${boxS} s`);
});

// Step the sim under a controller until `pred` holds, and return the state the
// cue was read in (read BEFORE the step, so what comes back is what was true).
// `ctrl(ps, q, c)` → { x, throttle, brake }: the lateral to hold, and the pedals.
function run(a, pits, ctrl, pred, maxS) {
  for (let i = 0; i < Math.round(maxS * 60); i++) {
    const ps = a.physState(), q = a.pit(), c = pits.cue(g.G.player);
    if (pred(c, q, ps)) { a.clearInput(); return { c, q, ps, t: i / 60 }; }
    const u = ctrl(ps, q, c) || {};
    // Lateral by AIMING (aimTo's method): a steer under a heading re-aimed
    // along the track every tick holds a lateral but cannot MOVE to one —
    // measured, a car asked from the road edge onto the entry road's tarmac
    // sat at the edge for the whole road.
    a.aim(Math.max(-25, Math.min(25, ((u.x != null ? u.x : ps.x) - ps.x) * 8)) * AIM_SIGN);
    a.setInput({ steer: 0, throttle: u.throttle !== false, brake: !!u.brake });
    a.step(1 / 60, 1);
  }
  a.clearInput();
  return null;
}

test("THE DIRECTIONS, FOLLOWED, MAKE THE STOP: every cue fires at the model's own distance, and a car that does what each one says is serviced", async () => {
  // Not a message test. The cue is a driving instruction, so the check is a
  // car that OBEYS it — the line, then the pit road, then the lane, then the
  // working lane, then the gate — with every phase measured against the
  // complex's own geometry (TrackPit sA/sIn/sOut/sB, this car's own box) and
  // the module's own constants (cueM, BOX_CUE_M, BOX_TOL, servedS), and the
  // stop actually served at the end of it.
  const a = await fresh();
  const G = g.G, t = G.track, p = t.pit, L = t.total, s = p.side, pits = G.pits;
  const car = G.player;
  const wrap = (v) => ((v % L) + L) % L;
  const toIn = () => wrap(p.sIn - a.physState().s);
  const inside = (arc, from, to) => wrap(arc - from) < wrap(to - from);
  const hwAt = (arc) => t.hw[((Math.round(arc / L * t.n) % t.n) + t.n) % t.n];
  // The peel, driven: the lane's own tarmac at the peel-off, the fast lane's
  // centre by the line — the same line the AI's laneX draws, because a car
  // still on the verge at the line is not IN the lane and races on.
  const peelX = () => {
    const ps = a.physState(), hw = hwAt(ps.s), u = Math.max(0, Math.min(1, wrap(ps.s - p.sA) / p.entryRoadM));
    return (hw + 2.0 + (p.off.fastIn + p.bands.fast / 2 - 2.0) * u) * s;
  };
  // A used set, 700 m before the entry line, on the racing line: nothing yet.
  a.jump(wrap(p.sIn - 700) / L, 45, 0); a.aim(0);
  car.tyreWear = 0.9;
  assert.equal(pits.cue(car), null, "700 m out is beyond the countdown");
  assert.equal(pits.info(car).side, s, "the arrow's side is the model's pit side");

  // 1. THE COUNTDOWN opens at cueM, in metres to the entry line, to the metre.
  const first = run(a, pits, () => ({ x: 0 }), (c) => c != null, 20);
  assert.ok(first, "no cue ever spoke on the approach");
  assert.equal(first.c.phase, "near");
  assert.match(first.c.text, /^PIT \d+m$/);
  assert.ok(first.c.dist <= pits.cueM && first.c.dist > pits.cueM - 15, `the countdown must open at ${pits.cueM} m, opened at ${first.c.dist}`);
  assert.ok(Math.abs(first.c.dist - wrap(p.sIn - first.ps.s)) < 1.5, `the metres are the metres to the line (${first.c.dist} vs ${wrap(p.sIn - first.ps.s).toFixed(1)})`);
  assert.ok(first.c.frac >= 0 && first.c.frac < 0.1, `the bar starts empty (${first.c.frac})`);

  // 2. …and counts DOWN on the line. From the boards a driver slows and moves
  //    to the pit side of the road, so the peel is taken at pit-entry speed.
  const boards = run(a, pits, () => ({ x: 0 }), (c, q, ps) => wrap(p.sA - ps.s) < 120, 20);
  assert.ok(boards, "never reached the boards");
  const edge = () => (hwAt(a.physState().s) - 1.5) * s;
  const peel = run(a, pits, (ps) => ({ x: edge(), throttle: ps.speed < 18, brake: ps.speed > 22 }),
                   (c, q, ps) => inside(ps.s, p.sA, p.sIn), 20);
  assert.ok(peel, "never reached the entry road");
  assert.ok(peel.c && peel.c.dist < first.c.dist - 100, `the countdown ran down (${first.c.dist} → ${peel.c && peel.c.dist})`);

  // 3. THE ENTRY ROAD: the cue says HOLD THE LANE from the peel-off, before any commitment.
  assert.equal(peel.c.phase, "enter", `on the entry road the instruction is the lane, got ${peel.c.phase} "${peel.c.text}"`);
  assert.match(peel.c.text, /LANE/);
  assert.equal(a.pit().armed, false, "nothing is armed by merely arriving");

  // 4. HOLD IT: the lane's own tarmac for COMMIT_S arms the stop — and the cue names the compound.
  const armed = run(a, pits, (ps) => ({ x: peelX(), throttle: ps.speed < 18 }), (c, q) => q.armed, 6);
  assert.ok(armed, "holding the lane's tarmac on the entry road did not call the stop");
  assert.ok(inside(armed.ps.s, p.sA, p.sIn), `armed ON the entry road (s ${armed.ps.s.toFixed(0)}, road ${p.sA.toFixed(0)}..${p.sIn.toFixed(0)})`);
  assert.equal(armed.c.phase, "armed");
  assert.match(armed.c.text, /^STAY IN LANE · BOX BOX — [A-Z]$/, `the booked compound is named: "${armed.c.text}"`);
  assert.equal(armed.q.state, "none", "the limiter waits for the line");

  // 5. THE LINE: the state turns to LANE there, the cue says STAY IN LANE with the limit, and the limiter holds.
  const lane = run(a, pits, (ps, q) => ({ x: q.driveX != null ? q.driveX : peelX(), throttle: ps.speed < 18 }), (c, q) => q.state === "lane", 10);
  assert.ok(lane, "never reached the lane");
  assert.ok(wrap(lane.ps.s - p.sIn) < 12, `the lane begins at the line (${wrap(lane.ps.s - p.sIn).toFixed(1)} m past it)`);
  assert.equal(lane.c.phase, "lane");
  assert.equal(lane.c.text, "STAY IN LANE · " + Math.round(lane.q.limitKph) + " LIMIT");
  // (checked early in the lane: past atM 37 the box is inside BOX_CUE_M on Bahrain, and step 6 must see that edge)
  const held = run(a, pits, (ps, q) => ({ x: q.driveX }), (c, q, ps) => ps.speed * 3.6 <= q.limitKph * 1.1 && q.atM > 8, 8);
  assert.ok(held, "the limiter never brought the car to the limit");

  // 6. THE COUNTDOWN IS NOT AN INSTRUCTION. Inside BOX_CUE_M the cue counts
  //    this car's box down, but while the move is not yet due it keeps saying
  //    STAY IN LANE — the fast lane is where a driver SHOULD be, and a stop is
  //    driven by turning in late. Reported, with a screenshot: "it's wrongly
  //    telling me to stay right before it's my time to pull over."
  const togo = () => a.pit().boxM - a.pit().atM;
  const counting = run(a, pits, (ps, q) => ({ x: q.driveX }),
                       (c, q) => c && q.boxM - q.atM <= pits.boxCueM - 8, 30);
  assert.ok(counting, "the box countdown never opened");
  const cAt = counting.q.boxM - counting.q.atM;
  assert.ok(cAt > pits.moveM + 10, `this sample must be well before the move (${cAt.toFixed(1)} m)`);
  assert.equal(counting.c.phase, "lane", `in the fast lane ${cAt.toFixed(0)} m out the cue is the lane, got "${counting.c.text}"`);
  assert.ok(!/KEEP/.test(counting.c.text), `no KEEP sign ${cAt.toFixed(0)} m out: "${counting.c.text}"`);
  assert.match(counting.c.text, /BOX \d+m/, `…but the metres are counted: "${counting.c.text}"`);

  // 6b. …and KEEP <side> the moment the move IS due, because the crew is not
  //     standing in the fast lane.
  const close = run(a, pits, (ps, q) => ({ x: q.driveX }), (c) => c && c.phase !== "lane", 30);
  assert.ok(close, "the lane phase never ended");
  assert.equal(close.c.phase, "keep", `in the fast lane at the box the cue must say which way, got ${close.c.phase}`);
  assert.equal(close.c.text, s > 0 ? "KEEP RIGHT" : "KEEP LEFT");
  const at = close.q.boxM - close.q.atM;
  assert.ok(at <= pits.moveM && at > pits.moveM - 2.5, `it opens ${at.toFixed(1)} m from the box; MOVE_M is ${pits.moveM}`);
  const pull = run(a, pits, (ps, q) => ({ x: q.laneX, throttle: ps.speed < 8 }), (c) => c && c.phase === "near-box", 6);
  assert.ok(pull, "moving into the working lane did not turn KEEP into PULL IN");
  assert.match(pull.c.text, /^PULL IN · \d+m$/);
  assert.ok(Math.abs(pull.c.dist - (pull.q.boxM - pull.q.atM)) < 1, `PULL IN's metres are the metres to the box (${pull.c.dist} vs ${(pull.q.boxM - pull.q.atM).toFixed(1)})`);
  assert.ok(pull.c.frac > 0 && pull.c.frac < 1, `the bar is filling (${pull.c.frac})`);

  // 7. STOP HERE inside BOX_TOL of the box; stopped there, the stop latches and is served.
  const gate = run(a, pits, (ps, q) => ({ x: q.laneX, throttle: ps.speed < 5 && togo() > 6, brake: togo() <= 6 && ps.speed > 0.3 }),
                   (c) => c && c.phase === "stop", 20);
  assert.ok(gate, "STOP HERE never came");
  assert.equal(gate.c.text, "STOP HERE");
  assert.ok(Math.abs(gate.q.boxM - gate.q.atM) <= 8, `STOP HERE is said within BOX_TOL of the box (${(gate.q.boxM - gate.q.atM).toFixed(1)} m)`);
  const box = run(a, pits, (ps) => ({ x: a.pit().laneX, throttle: false, brake: ps.speed > 0.2 }), (c, q) => q.state === "box", 6);
  assert.ok(box, "stopped on the gate, the stop did not latch");
  assert.equal(box.c.phase, "box"); assert.equal(box.c.text, "STOP");
  assert.equal(box.q.stops, 1);

  // 8. THE RELEASE: GO for servedS, then the exit road's metres, counting down to its end — and then silence.
  const go = run(a, pits, () => ({ x: a.pit().laneX, throttle: true }), (c, q) => q.state === "out", 6);
  assert.ok(go, "the hold never released");
  assert.equal(go.c.phase, "served"); assert.equal(go.c.text, "GO GO GO");
  const out = run(a, pits, (ps, q) => ({ x: q.driveX != null ? q.driveX : ps.x }), (c) => c && c.phase !== "served", 4);
  assert.ok(out, "GO GO GO never ended");
  assert.ok(out.t >= pits.servedS - 0.1 && out.t <= pits.servedS + 0.3, `GO lasts servedS (${out.t.toFixed(2)} s vs ${pits.servedS})`);
  assert.equal(out.c.phase, "out", `with the field away nothing is closing: ${out.c.phase}`);
  assert.match(out.c.text, /^EXIT \d+m$/);
  assert.ok(Math.abs(out.c.dist - wrap(p.sB - out.ps.s)) < 1.5, `EXIT's metres run to the end of the exit road (${out.c.dist} vs ${wrap(p.sB - out.ps.s).toFixed(1)})`);
  const done = run(a, pits, (ps, q) => ({ x: q.driveX != null ? q.driveX : 0 }), (c, q) => q.state === "none", 40);
  assert.ok(done, "never left the complex");
  assert.ok(wrap(done.ps.s - p.sB) < 15, `the state clears where the exit road ends (${wrap(done.ps.s - p.sB).toFixed(1)} m past sB)`);
  assert.equal(done.c, null, "a fresh set, off the road: nothing left to say");
  assert.ok(a.tyres().wear < 0.05, `fresh tyres were fitted (${a.tyres().wear})`);
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
