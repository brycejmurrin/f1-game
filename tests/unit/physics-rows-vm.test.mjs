/* physics-rows-vm.test.mjs — five physics rows from the 2026-09-02 bug hunt
 * (round 2 "Not landed" → Physics), each replayed where it lives: four in the
 * Node VM (tools/lib/game-vm.cjs — the real js/game.js, no browser) and one in
 * the incident-gate style harness (js/physics/incident-sim.js whole, DebrisWorld
 * mocked). Every pin was red on the code before its fix (HEAD's file swapped
 * back in) and is green after; none moves physics-characterization-vm.
 *
 * Plus the 2026-09-04 drive-feel rows (turn-in triad, throttle ellipse,
 * downhill overspeed): source pins plus one behavioural probe each.
 *
 * Run: node --test tests/unit/physics-rows-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let g = null, PHYS0 = null;
// steerMode "touch" is inert until a test also makes Input report a coarse
// pointer — the other cases drive through setInput(), which bypasses it.
before(async () => { g = await createGame({ track: "monza", storage: { steerMode: "touch" } }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

async function startRace() {
  g.apex.setPhysics(PHYS0); g.apex.headless(false);
  await g.race("monza", "day", "dry");
}

// ---------------------------------------------------------------------------
// Row 1 — js/physics/incident-sim.js `_lapCross`: a lap counted under a takeover
// mirrors updateCar's crossing for the player's sector clock, and the lap it
// starts stays incident-invalid (the clock froze while Rapier drove).
// ---------------------------------------------------------------------------
test("a lap counted under a takeover resets the player's sector clock and keeps the new lap invalid", () => {
  const SRC = readFileSync(join(ROOT, "js/physics/incident-sim.js"), "utf8");
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 30, vz: 0, sleeping: false };
  const DebrisWorld = {
    active: () => true, rapierReady: () => true, worldGen: () => 1,
    promoteCarDynamic: () => true, demoteCarKinematic: () => {}, carBodyPose: () => pose,
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array, isNaN, isFinite, console,
    DebrisWorld, Tracks: { sample: () => {}, wallAt: () => 8 },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, ctx, { filename: "js/physics/incident-sim.js" });
  const IncidentSim = vm.runInContext("IncidentSim", ctx);
  const mk = (s) => ({ px: 0, pz: 0, head: 0, speed: 40, s, x: 0, vLat: 0, yawRateCur: 0, prog: s,
                       lap: 3, lapTime: 80, finished: false, retired: false, human: true, isPlayer: true, local: true });
  const cars = [mk(4990), { ...mk(4993), human: false, isPlayer: false, local: false }];
  let footS = 4990;   // where trackFrom pins the Rapier body: before the line, then past it
  const G = { cars, player: cars[0], track: { total: 5000 }, PACE: 1, vTop: () => 72, lapsTarget: 10, raceT: 100,
              sectorIdx: 2, sectorStartT: 55,   // the player was in S3, split clock running
              trackFrom: () => ({ s: footS, x: 0 }), worldFromTrack: () => ({ x: 0, z: 0 }),
              rescuePlayer: () => {}, smp: {} };
  const sim = IncidentSim.create(G);
  sim.setFlags({ r2Airborne: true, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2, "both cars under the takeover window");
  assert.equal(cars[0].incidentInvalidLap, true, "promote invalidates the lap in progress");
  footS = 12;   // Rapier carried the player over s = 0
  sim.postStep(1 / 60);
  assert.equal(cars[0].lap, 4, "the crossing counted the lap");
  assert.equal(cars[0].lapTime, 0, "and zeroed the lap clock, as updateCar's crossing does");
  assert.equal(G.sectorIdx, 0, "sector clock re-armed at S1 for the player");
  assert.equal(G.sectorStartT, 0, "sectorStartT reset with the lap clock (was timed from the stale S3 entry)");
  // Decision, pinned: the lap begun under Rapier keeps the flag. updateCar
  // early-outs an owned car before `lapTime += dt`, so its clock is short —
  // clearing at handback would let it become a PB or the stored ghost.
  assert.equal(cars[0].incidentInvalidLap, true, "the lap begun under the takeover stays invalid");
});

// ---------------------------------------------------------------------------
// Row 2 — js/game.js `stoppedOnTrack`: the rescue's throttle gate is the
// DRIVER's pedal. On touch/tilt onThrottle is autoThrottle() (always true), so
// a phone player parked or boxed in a pile-up was teleported to x = 0 after 3 s.
// ---------------------------------------------------------------------------
test("touch auto-throttle never counts as a driver asking for a rescue; a pressed pedal still does", async () => {
  await startRace();
  const a = g.apex, I = g.sandbox.Input, p = g.G.player;
  const keep = { touchControlsNeeded: I.touchControlsNeeded, throttle: I.throttle, braking: I.braking };
  try {
    // A phone: coarse pointer + steerMode "touch" (seeded) → autoThrottle() true.
    I.touchControlsNeeded = () => true; I.throttle = () => false; I.braking = () => false;
    a.clearInput();                       // live Input path, not a scripted input
    // The pace floor keeps the auto-throttled car under the 3 m/s gate for
    // longer than the 3 s rescue window (vmax = 72 * 0.05 = 3.6 m/s), which is
    // the boxed-in/pile-up shape without needing a pack to hold the car.
    a.setPhysics({ pace: 0.05 });
    a.jump(0.0, 0, 0); g.G.raceT = 10;
    let vMax = 0;
    for (let i = 0; i < 300; i++) { a.step(1 / 60, 1); vMax = Math.max(vMax, p.speed); }
    assert.ok(vMax < 3, `the scenario held the car under the rescue gate (peak ${vMax.toFixed(2)} m/s)`);
    assert.equal(p.rescueLastT, null, "auto gas is not a driver asking: no rescue fired in 5 s");
    // Positive control — the wedged-against-a-wall promise: the same car with
    // the driver's pedal DOWN is rescued.
    I.throttle = () => true;
    a.jump(0.0, 0, 0); p.rescueT = 0;
    for (let i = 0; i < 300; i++) a.step(1 / 60, 1);
    assert.ok(p.rescueLastT != null, "a pressed pedal on a car going nowhere still rescues");
  } finally {
    Object.assign(I, keep);
    a.setPhysics(PHYS0);
  }
});

// ---------------------------------------------------------------------------
// Row 2b — and the other half of that gate. In TOUCH steering the GAS button is
// hidden (auto-throttle supplies the pedal), so there is no key, button or pad
// for Input.throttle() to read: gating purely on the driver's pedal made this
// rescue unreachable on exactly the devices whose players cannot press one, and
// it is the ONLY rescue covering a car wedged at |x| < hw where beached,
// wrongWay and wallT all stay false. Auto gas IS the driver asking there.
// ---------------------------------------------------------------------------
test("touch steering has no pedal to release, so auto gas rescues a wedged car — but never a car rubbing in a pack", async () => {
  await startRace();
  const a = g.apex, I = g.sandbox.Input, p = g.G.player;
  const keep = { touchControlsNeeded: I.touchControlsNeeded, throttle: I.throttle, braking: I.braking };
  try {
    I.touchControlsNeeded = () => true; I.throttle = () => false; I.braking = () => false;
    a.clearInput();
    a.setPhysics(PHYS0);                  // full pace: vStd(speed) is speed
    // WEDGED: pinned by geometry the longitudinal model cannot represent, so the
    // car is held at a standstill while auto-throttle asks it to go. wallT stays
    // 0 (the driver is not steering into the barrier) and |x| < hw, which is
    // precisely the hole the other three stuck clauses leave open.
    a.jump(0.0, 0, 0); g.G.raceT = 10; p.rescueT = 0; p.rescueLastT = null;
    p.contactT = 0;
    for (let i = 0; i < 300; i++) { p.speed = 0; a.step(1 / 60, 1); }
    assert.ok(p.rescueLastT != null,
      "a touch-steer player wedged with auto gas on is rescued — there is no pedal for them to press");

    // RUBBING IN A PACK: same standstill, same auto gas, but in contact with
    // another car. That is a pile-up shuffle, not a wedge, and teleporting the
    // player out of it to x = 0 is the behaviour the original row removed.
    a.jump(0.0, 0, 0); p.rescueT = 0; p.rescueLastT = null;
    for (let i = 0; i < 300; i++) { p.speed = 0; p.contactT = 0.22; a.step(1 / 60, 1); }
    assert.equal(p.rescueLastT, null,
      "a car rubbing another car is shuffling in traffic, not wedged: no rescue");
  } finally {
    Object.assign(I, keep);
    p.contactT = 0;
    a.setPhysics(PHYS0);
  }
});

// ---------------------------------------------------------------------------
// Row 4 — js/game.js overtake proximity: the car ahead ON THE ROAD (docs/
// PHYSICS.md "within OT_GAP of the car ahead"), not ranked[rank-2].
// ---------------------------------------------------------------------------
test("overtake arms on the car ahead on the road: a backmarker 0.55 s ahead arms it, a finished car ahead in classification does not", async () => {
  await startRace();
  const a = g.apex, p = g.G.player, L = g.G.track.total;
  a.jump(0.0, 55, 0); a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 5; i++) a.step(1 / 60, 1);
  const [ri] = a.rivals([{ dProg: 30, dx: 0, speed: 55 }]);
  const r = g.G.cars[ri];
  // The player LEADS on lap 3; the rival is a lap down, 30 m ahead on the road.
  p.lap = 3; p.prog = 3 * L + p.s;
  r.lap = 2; r.prog = p.prog + 30 - L;
  p.otCool = 0; p.otT = 0;
  a.step(1 / 60, 1);
  assert.equal(p.rank, 1, "the player leads the classification");
  assert.ok(g.G.otEnabled(), "race-wide overtake gate open (leader past lap 1)");
  assert.ok(p.speed > 40, `at speed (${p.speed.toFixed(1)} m/s)`);
  assert.equal(p.otArmed, true, "a backmarker 30 m (0.55 s) ahead on the road arms OVERTAKE for the leader");
  // Same rival, now the car directly ahead in classification AND on the road —
  // but finished and coasting. Nothing to attack.
  r.prog += L; r.lap = 3; r.finished = true; r.speed = 0;
  p.otCool = 0; p.otT = 0;
  a.step(1 / 60, 1);
  assert.equal(r.rank, 1, "the finished car is one place up");
  assert.equal(p.otArmed, false, "a finished car ahead does not arm OVERTAKE");
  a.clearInput();
});

// ---------------------------------------------------------------------------
// Row 5 — js/game.js slip angles in reverse: slip is measured against |vx|.
// atan2(vLat, -4) put both axles on the tanh plateau with a sign that flipped
// on vLat ≈ 0 — a steady slide on a straight reverse with the wheel centred.
// ---------------------------------------------------------------------------
test("a straight reverse crawl with the wheel centred has no lateral response", async () => {
  await startRace();
  const a = g.apex, p = g.G.player;
  a.jump(0.02, 0, 0);                        // Monza start straight
  a.setInput({ steer: 0, brake: true });     // brake at a stop = reverse crawl
  for (let i = 0; i < 180; i++) a.step(1 / 60, 1);
  a.clearInput();
  assert.ok(p.speed < -4, `crawling in reverse (${p.speed.toFixed(2)} m/s)`);
  // Measured on the old code: vLat 0.149 m/s, yawRate 0.037 rad/s, both steady.
  assert.ok(Math.abs(p.vLat || 0) < 0.02, `no lateral slip with zero steer on a straight (vLat ${(p.vLat || 0).toFixed(3)})`);
  assert.ok(Math.abs(p.yawRateCur || 0) < 0.01, `no yaw with zero steer on a straight (yawRate ${(p.yawRateCur || 0).toFixed(3)})`);
});

// ---------------------------------------------------------------------------
// Row 3 — js/game.js AI brake look-ahead: the bank the AI's brakeTarget sees is
// |bank|, the same rule as the player's bankRoll. AI-only (a legitimate
// curvature column); a signed/adverse bank must not cut the AI while it
// boosts the player.
// ---------------------------------------------------------------------------
test("the AI look-ahead bank is |bank|, like the player's bankRoll", async () => {
  await startRace();
  const a = g.apex, T = g.sandbox.Tracks, AD = g.sandbox.AiDrive;
  const keepBank = T.bankAngle, keepPush = AD.pushLook;
  const seen = [];
  try {
    T.bankAngle = () => -0.35;                     // an adverse (signed) bank everywhere
    AD.pushLook = (d, k, bank) => { seen.push(bank); return keepPush(d, k, bank); };
    a.jump(0.0, 50, 0);
    a.step(1 / 60, 1);
  } finally {
    T.bankAngle = keepBank; AD.pushLook = keepPush;
  }
  assert.ok(seen.length > 0, "the AI look-ahead sampled the bank");
  assert.ok(seen.every((b) => b === 0.35), `every sample is |bank| (min ${Math.min(...seen)})`);
});

// ---------------------------------------------------------------------------
// Drive-feel 2026-09-04 — turn-in triad, throttle ellipse, downhill overspeed.
// Source pins fail closed if someone restores 0.89 / 0.7 / vmax-faded axFrac /
// the confiscating min(vmax*1.06) assign. Behavioural probes fail if the
// shipped numbers do not actually rotate more, spend the circle on power, or
// keep ERS/X leftover on a descent.
// ---------------------------------------------------------------------------
test("shipped turn-in is snappier than the understeer-safe 0.89 / 0.7 pair", async () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /let FRONT_GRIP = 0\.94/, "FRONT_GRIP default must stay 0.94 (was 0.89)");
  assert.match(src, /let YAW_INERTIA = 0\.58/, "YAW_INERTIA default must stay 0.58 (was 0.7)");
  await startRace();
  const a = g.apex;
  const t = a.tuning();
  assert.equal(t.frontGrip, 0.94);
  assert.equal(t.yawInertia, 0.58);
  const yawAt = (frontGrip, yawInertia) => {
    a.setPhysics({ frontGrip, yawInertia, pace: 1, roadFollow: 0 });
    a.jump(0.0, 40, 0);
    a.setInput({ steer: 1, throttle: false });
    const h0 = a.probe().angle;
    for (let i = 0; i < 12; i++) a.step(1 / 60, 1);
    const h1 = a.probe().angle;
    a.clearInput();
    return Math.abs(h1 - h0);
  };
  const old = yawAt(0.89, 0.7);
  const now = yawAt(0.94, 0.58);
  a.setPhysics(PHYS0);
  assert.ok(now > old * 1.04, `new triad must yaw more (now=${now.toFixed(4)} old=${old.toFixed(4)})`);
});

test("power-on spends the friction ellipse even when speed-limited", async () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /THR_ELLIPSE/, "throttle demand must be a named PhysicsConsts scale");
  assert.match(src, /axThrDemand/, "ellipse cost is throttle demand, not only faded axEst");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""),
    /axFrac[\s\S]{0,180}clamp\(1 - c\.speed/,
    "do not restore vmax-faded axEst as the only ellipse cost");
  await startRace();
  const a = g.apex;
  a.setPhysics({ pace: 1, roadFollow: 0 });
  const sample = (throttle) => {
    a.jump(0.28, 70, 0);
    a.setInput({ steer: 0.5, throttle, brake: false });
    let slip = 1;
    for (let i = 0; i < 20; i++) {
      a.step(1 / 60, 1);
      slip = g.G.player.slipFactor ?? 1;
    }
    a.clearInput();
    return slip;
  };
  const coast = sample(false);
  const power = sample(true);
  a.setPhysics(PHYS0);
  assert.ok(coast > 0.97, `coasting must keep the circle (slipFactor=${coast})`);
  assert.ok(power < coast - 0.03, `throttle must spend the circle (power=${power} coast=${coast})`);
});

test("a descent does not confiscate existing overspeed; flat throttle bleeds it", async () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.doesNotMatch(src, /c\.speed = Math\.min\(vmax \* 1\.06, c\.speed \+ a \* dt\)/,
    "do not restore the confiscating downhill clamp");
  assert.match(src, /c\.speed < cap/, "downhill gravity only adds below the 6% margin");
  g.apex.setPhysics(PHYS0); g.apex.headless(false);
  await g.race("spa", "day", "dry");
  g.apex.setPhysics({ ...PHYS0, pace: 1, roadFollow: 0 });
  const a = g.apex;
  let dnAt = 0, dn = 0;
  for (let i = 0; i < 300; i++) {
    const f = i / 300;
    a.jump(f, 40, 0); a.step(1 / 60, 1);
    const s = a.physState().slope;
    if (s < dn) { dn = s; dnAt = f; }
  }
  a.jump(dnAt, 40, 0);
  const vmax = a.physState().vmaxNow || 72;
  const over = vmax * 1.18;
  a.jump(dnAt, over, 0);
  a.setInput({ steer: 0, throttle: true });
  let minDn = over;
  for (let i = 0; i < 45; i++) {
    a.step(1 / 60, 1);
    minDn = Math.min(minDn, a.physState().speed);
  }
  assert.ok(minDn > vmax * 1.10, `descent must keep overspeed (min=${minDn.toFixed(2)} vmax=${vmax.toFixed(2)})`);
  // Bleed probe on Monza's start straight — Spa's flattest LUT node is not a
  // safe 85 m/s line (walls / grass eat the car and look like a teleport).
  await g.race("monza", "day", "dry");
  a.setPhysics({ ...PHYS0, pace: 1, roadFollow: 0 });
  a.jump(0.0, over, 0);
  a.setInput({ steer: 0, throttle: true });
  let flatEnd = over;
  for (let i = 0; i < 180; i++) {
    a.step(1 / 60, 1);
    flatEnd = a.physState().speed;
  }
  a.clearInput();
  a.setPhysics(PHYS0);
  assert.ok(flatEnd < over - 1, `flat throttle must bleed overspeed (end=${flatEnd.toFixed(2)} start=${over.toFixed(2)})`);
  assert.ok(flatEnd > vmax * 0.95, `bleed is a drag, not a teleport (end=${flatEnd.toFixed(2)})`);
});
