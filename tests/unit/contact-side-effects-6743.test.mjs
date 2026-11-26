/* contact-side-effects-6743.test.mjs — #6743 (#6546 P5, P7, P8): what a car-car contact does
 * BESIDE the separation.
 * P5 — js/physics/collide.js side-rub branch: AiDrive.sideYieldsA can pick a STATIC car (a parked
 *      retirement, invMass 0) as the yielder; it took the scrub and the flag while the moving car
 *      rubbed along the wreck at full speed. The moving car must pay (the rear branch's if (iA)/if (iB)).
 * P7 — js/physics/debris-world.js CAR_SEV_MIN / WALL_SEV_MIN gated on a RAW m/s closing speed, so the
 *      same shunt spawned debris or not by OVERALL SPEED. One std closing → one decision at any PACE,
 *      and the shipped default pace decides exactly as before.
 * P8 — collide.js orientedResponse fired DebrisWorld.carImpact and incidentSim.notifyCar on every
 *      relaxation pass; they take the once-per-pair-per-step firstPairFx gate, as the unoriented path.
 * Run: node --test tests/unit/contact-side-effects-6743.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DT = 1 / 60;

function solver() {
  const calls = { carImpact: {}, notifyCar: {} };   // per pair key "ab"
  const bump = (m, a, b) => { const k = a.id + b.id; m[k] = (m[k] || 0) + 1; };
  const ctx = vm.createContext({ Math, Number, Object, WeakMap,
    Log: { info() {}, enabled: () => false }, Tracks: { wallAt: () => 100 },
    IncidentSim: { owns: () => false, notifyCar(a, b) { bump(calls.notifyCar, a, b); } },
    DebrisWorld: { active: () => true, carImpact(a, b) { bump(calls.carImpact, a, b); } } });
  for (const file of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js", "js/physics/collide.js"])
    vm.runInContext(readFileSync(join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
  const G = { track: { total: 6000 }, player: null, netPlay: { owns: () => false }, PACE: 1, raceT: 0,
    wrapS: (s) => (s % 6000 + 6000) % 6000, worldFromTrack: (s, x) => ({ x, z: s }) };
  const CG = vm.runInContext("ContactGeometry", ctx);
  return { calls, CG, s: vm.runInContext("Collide", ctx).create(G, () => {}) };
}

// ── P5 ──────────────────────────────────────────────────────────────────────
for (const order of ["wreck first", "mover first"]) {
  test(`P5: a moving AI rubbing a parked retirement alongside is scrubbed and flagged (${order})`, () => {
    const { s } = solver();
    // Level on arc (|dProg| < SIDE_LEVEL) with the wreck OUTSIDE, so sideYieldsA names it the yielder.
    const wreck = { id: "w", human: false, retired: true, yawVis: 0, prog: 99.8, s: 99.8, x: 1.2, speed: 0, vLat: 0, kTurn: 0 };
    const mover = { id: "m", human: false, yawVis: 0, prog: 100, s: 100, x: 0, speed: 40, vLat: 0, kTurn: 0 };
    const cars = order === "wreck first" ? [wreck, mover] : [mover, wreck];
    s.resolveCollisions([], DT);
    const ct = s.pairContact(cars[0], cars[1]);
    assert.ok(ct && !ct.oriented && ct.sideContact, "the scenario must be an unoriented side rub");
    s.resolveCollisions(cars, DT);
    assert.ok(mover.speed < 40, `the moving car kept ${mover.speed} m/s rubbing along a wreck (no scrub)`);
    assert.ok(mover.contactT > 0, "the moving car must carry the contact flag");
    assert.equal(wreck.speed, 0);
  });
}

// ── P8 ──────────────────────────────────────────────────────────────────────
test("P8: a yawed (oriented) strike in a squeeze queues debris and an incident candidate at most once per pair per step", () => {
  const { s, calls } = solver();
  // A spun player (yawVis 0.5 rad) sliding left into one AI while another presses from the right:
  // the third car re-injects closing on every relaxation pass (the base queued the pair 4 times).
  const cars = [
    { id: "p", human: true, isPlayer: true, yawVis: 0.5, prog: 100, s: 100, x: 0, speed: 50, vLat: -30, yawRateCur: 0, kTurn: 0 },
    { id: "o", human: false, yawVis: 0, prog: 100.3, s: 100.3, x: 1.4, speed: 20, vLat: 0, kTurn: 0 },
    { id: "q", human: false, yawVis: 0, prog: 100, s: 100, x: -1.4, speed: 40, vLat: 0, kTurn: 0 },
  ];
  s.resolveCollisions([], DT);
  const ct = s.pairContact(cars[0], cars[2]);
  assert.ok(ct && ct.oriented, "the player-vs-q contact must take the oriented path");
  s.resolveCollisions(cars, DT);
  const worst = (m) => Math.max(0, ...Object.values(m));
  assert.ok(worst(calls.carImpact) <= 1, `DebrisWorld.carImpact per pair in one step: ${JSON.stringify(calls.carImpact)}`);
  assert.ok(worst(calls.notifyCar) <= 1, `incidentSim.notifyCar per pair in one step: ${JSON.stringify(calls.notifyCar)}`);
  assert.ok(worst(calls.carImpact) === 1, "the strike must still queue its debris once");
});

// ── P7 ──────────────────────────────────────────────────────────────────────
function debris(PACE) {
  const ctx = vm.createContext({
    URL, document: {}, location: { href: "http://localhost/index.html" },
    GameStore: { store: { raw: () => "0" } }, localStorage: { getItem: () => null }, requestIdleCallback() {},
    setTimeout: () => 0, clearTimeout() {}, Log: { warn() {}, info() {} },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/debris-world.js"), "utf8"), ctx, { filename: absSrc("js/physics/debris-world.js") });
  const M = vm.runInContext("DebrisWorld", ctx);
  const G = { cars: [], PACE };
  M.create(G);
  return M;
}
const DEF_PACE = Math.pow(1.06, -3);   // the shipped OVERALL SPEED notch (collide.js sevRef)
const car = (speed) => ({ s: 10, x: 0, speed, num: 1 });
const carQueued = (pace, stdClosing) => { const M = debris(pace); M.carImpact(car(0), car(0), stdClosing * pace / DEF_PACE); return M.status().queued; };
const wallQueued = (pace, stdSpeed) => { const M = debris(pace); M.wallImpact(car(stdSpeed * pace / DEF_PACE), 1, 0); return M.status().queued; };

for (const std of [2.5, 4]) {
  test(`P7: a car-car closing of ${std} m/s (default-pace scale) makes the same debris call at any OVERALL SPEED`, () => {
    const at = [0.5, DEF_PACE, 1.34].map((p) => carQueued(p, std));
    assert.deepEqual(at, [at[1], at[1], at[1]], `queued at PACE 0.5 / default / 1.34: ${at.join(" / ")}`);
    assert.equal(at[1], std >= 3 ? 1 : 0, "the default pace keeps the shipped CAR_SEV_MIN = 3 decision");
  });
}
for (const std of [15, 25]) {
  test(`P7: a wall scrape at ${std} m/s (default-pace scale) makes the same debris call at any OVERALL SPEED`, () => {
    const at = [0.5, DEF_PACE, 1.34].map((p) => wallQueued(p, std));
    assert.deepEqual(at, [at[1], at[1], at[1]], `queued at PACE 0.5 / default / 1.34: ${at.join(" / ")}`);
    assert.equal(at[1], std * 0.15 >= 3 ? 1 : 0, "the default pace keeps the shipped WALL_SEV_MIN = 3 decision");
  });
}
