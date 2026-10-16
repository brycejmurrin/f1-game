/* retired-car-obstacle-vm.test.mjs — a car parked ON the road is a body (#2162).
 *
 * retireCar parks a DNF past the verge when there is room. On a street circuit
 * the wall is ~0.1 m beyond the road edge, so the car stays about 2 m on the
 * racing surface (singapore s≈50: hw 6.0, parked x 5.1). Retirements are not in
 * `ranked`, which feeds collisions and traffic, so the player and the AI drove
 * straight through a car that was drawn on track: 0 contact frames, 29.9 m/s at
 * the pass, |dx| 0.07 m. Now an on-road retirement (c.parkedOnRoad) joins the
 * collision list as a static body (no momentum or positional share), and the
 * AI holds its aim a lane clear of it (Collide.parkedAhead). Off-road
 * retirements stay ghosts, as before.
 *
 * Run: node --test tests/unit/retired-car-obstacle-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const DT = 1 / 60;
let g = null;
before(async () => { g = await createGame({ track: "singapore" }); });
after(() => { if (g) g.close(); });

// A rival retired `ahead` m up the road from the player (lap fraction `frac`,
// rival on the `xR` side), the rest of the field half a lap away.
async function parkAhead(frac = 0, ahead = 50, xR = 4) {
  const A = g.apex, G = g.G;
  await g.race("singapore");
  A.reset(frac, 30, 0); A.headless(true); A.go();
  const p = G.player, L = G.track.total;
  const r = G.cars.find((c) => !c.human && !c.isPlayer);
  r.s = (p.s + ahead) % L; r.prog = p.prog + ahead; r.x = xR;
  A.retire(G.cars.indexOf(r));
  for (const o of G.cars) if (o !== p && o !== r) { o.s = (p.s + L / 2) % L; o.prog = p.prog + L / 2; }
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  g.sandbox.Tracks.sample(G.track, r.s, smp);
  return { A, G, p, r, L, hw: smp.hw };
}
function laneSteer(A, xT) {
  const pr = A.probe();
  const Lk = Math.max(8, Math.min(38, pr.speed * 0.6));
  return Math.max(-1, Math.min(1, 2.2 * (Math.atan2(xT - pr.x, Lk) - pr.angle)));
}

test("singapore: a car retired with no runoff is parked on the road and flagged so", async () => {
  const { r, hw } = await parkAhead();
  assert.ok(r.retired, "retired");
  assert.ok(Math.abs(r.x) - 1.0 < hw - 0.3, `the street wall leaves no room: x ${r.x.toFixed(2)}, hw ${hw}`);
  assert.equal(r.parkedOnRoad, true);
});

test("the player driven at a car parked on the road hits it instead of passing through", async () => {
  const { A, p, r, L } = await parkAhead();
  const xPark = r.x, sPark = r.s;
  let contact = 0, minV = Infinity, through = false;
  for (let i = 0; i < 240; i++) {
    A.setInput({ throttle: p.speed < 30, steer: laneSteer(A, xPark) });
    A.step(DT, 1);
    if (p.contactT > 0) contact++;
    const d = ((r.s - p.s) % L + L) % L;
    if (d < 6 || d > L - 6) minV = Math.min(minV, p.speed);
    if (d > L / 2 && d < L - 3 && Math.abs(p.x - xPark) < 1.5) through = true;   // came out the far side in its lane
  }
  A.clearInput();
  assert.ok(contact > 0, "no contact frames against the parked car");
  assert.ok(minV < 15, `kept ${minV.toFixed(1)} m/s through a parked car`);
  assert.ok(!through, "drove out the far side of the parked car in its lane");
  assert.equal(r.x, xPark, "the parked car is static: not shoved sideways");
  assert.equal(r.s, sPark, "nor along the road");
});

// Where the AI's own line runs through the parking spot: singapore s≈2717,
// left side (x −4.5 against a parked −5.5, scanned from a lone AI lap). The
// GHOST run (parkedOnRoad cleared — what every retirement was before) is the
// control: there the AI drives through the car, so the pass below is earned.
async function aiPast(ghost) {
  const { A, G, p, r, L } = await parkAhead(2600 / g.G.track.total, 120, -4);
  if (ghost) r.parkedOnRoad = false;
  const pIdx = G.cars.indexOf(p);
  A.carRole(pIdx, { human: false });
  try {
    let contact = 0, passed = false, minDx = Infinity, vPass = 0;
    for (let i = 0; i < 900 && !passed; i++) {
      A.step(DT, 1);
      if (p.contactT > 0) contact++;
      const d = ((r.s - p.s + L / 2) % L + L) % L - L / 2;
      if (Math.abs(d) < 4.8) { minDx = Math.min(minDx, Math.abs(p.x - r.x)); vPass = p.speed; }
      if (d < -10) passed = true;
    }
    return { passed, contact, minDx, vPass };
  } finally {
    A.carRole(pIdx, { human: true });
  }
}

test("an AI whose line runs through a car parked on the road steers round it at speed", async () => {
  const ghost = await aiPast(true);
  assert.ok(ghost.passed && ghost.minDx < 2.0,
    `control: the ghost run should drive through the parked car (minDx ${ghost.minDx.toFixed(2)}) — else this test proves nothing`);
  const live = await aiPast(false);
  assert.ok(live.passed, "the AI never got past the parked car (stuck behind it?)");
  assert.equal(live.contact, 0, "the AI ran into the parked car");
  assert.ok(live.minDx >= 2.0, `the AI passed ${live.minDx.toFixed(2)} m from the parked car's centre (bodies overlap under 2.0)`);
  assert.ok(live.vPass > 15, `the AI slowed to ${live.vPass.toFixed(1)} m/s to get by`);
});
