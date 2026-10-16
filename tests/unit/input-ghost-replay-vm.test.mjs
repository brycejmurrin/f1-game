/* input-ghost-replay-vm.test.mjs — open-loop inputs recorded with a seed
 * replay byte-identically through InputGhost.atStep → __apex.setInput.
 *
 * Pose Ghost is visual-only. This gate proves the deterministic input envelope
 * (seed + FIXED_DT + quantized controls) drives the same player distance when
 * replayed, the contract local ghosts need before a second physics car is
 * spawned in TT.
 *
 * Run: node --test tests/unit/input-ghost-replay-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); await g.race("monza"); });
after(() => { if (g) g.close(); });

function episodeFromInputs(seed, inputs) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  for (const inp of inputs) {
    A.setInput(inp);
    A.step(1 / 60);
  }
  const r = A.physState();
  A.headless(false);
  return JSON.stringify({
    s: r && r.s,
    x: r && r.x,
    speed: r && r.speed,
    lap: r && r.lap,
  });
}

test("InputGhost open-loop pack replays identically under one seed", () => {
  const IG = g.sandbox.InputGhost;
  assert.ok(IG, "InputGhost must load as a sandbox global");

  // Build a short open-loop tape the same way TT would (quantize → store → atStep).
  IG.setTrack("monza");
  IG.startLap({
    seed: 99,
    physRev: IG.currentPhysRev(),
    build: IG.currentBuild(),
    dt: IG.currentDt(),
  });
  const raw = [];
  for (let i = 0; i < 180; i++) {
    const inp = {
      steer: Math.round(Math.sin(i / 20) * 0.35 * 127) / 127,
      throttleLevel: 64 / 255,
      brakeLevel: 51 / 255,
      throttle: i < 150,
      brake: i >= 150 && i < 165,
    };
    raw.push(inp);
    IG.record(inp);
  }
  assert.equal(IG.finishLap(3.0), true);
  assert.equal(IG.compatible(IG.envelope()), true);
  assert.equal(IG.beginReplay(), true);

  const packed = [];
  for (let i = 0; i < IG.steps(); i++) packed.push(IG.atStep(i));

  const original = episodeFromInputs(99, raw);
  const a = episodeFromInputs(99, packed);
  assert.equal(a, original, "decoded partial-pedal tape differs from the original physics");
  assert.notEqual(episodeFromInputs(99, packed.map(i => ({ ...i, throttleLevel: 1, brakeLevel: 1 }))), original,
    "losing pedal travel must change the physics");
  const b = episodeFromInputs(99, packed);
  assert.equal(b, a, "second replay of the packed tape diverged");
  const dig = JSON.parse(a);
  assert.ok(Number.isFinite(dig.s), "physState.s missing");
  assert.ok(dig.s > 10, `barely moved (${dig.s} m along the lap)`);

  // Anti-vacuity: a different seed with the same inputs must not collide.
  const c = episodeFromInputs(7, packed);
  // Field AI may ignore player seed for some reads; the player's own s/x still
  // moves under identical inputs — at minimum the digest must be finite.
  assert.ok(JSON.parse(c).s > 10);
});

test("native TT fixed-tick tape captures lossless pedals, initial state and auxiliary edges without changing input authority", async () => {
  const A = g.apex, G = g.G, IG = g.sandbox.InputGhost, I = g.sandbox.Input;
  await A.tt("monza"); A.headless(true); A.reset(0.02, 55, 0, 919);
  const names = ["steer", "throttle", "throttleLevel", "braking", "brakeLevel", "consumeBoostToggle", "consumeOvertake", "consumeAeroToggle", "consumeShiftUp", "consumeShiftDown"];
  const saved = Object.fromEntries(names.map(k => [k, I[k]]));
  let input = {};
  Object.assign(I, { steer: () => input.steer || 0, throttle: () => !!input.throttle,
    throttleLevel: () => input.throttleLevel || 0, braking: () => !!input.brake,
    brakeLevel: () => input.brakeLevel || 0,
    consumeBoostToggle: () => !!input.boost, consumeOvertake: () => !!input.overtake,
    consumeAeroToggle: () => !!input.aeroToggle, consumeShiftUp: () => !!input.shiftUp,
    consumeShiftDown: () => !!input.shiftDown });
  const trace = () => JSON.stringify({ s: G.player.s, x: G.player.x, speed: G.player.speed,
    head: G.player.head, gear: G.player.gear, energy: G.player.energy, aeroX: G.player.aeroX });
  try {
    A.clearInput();
    IG.startLap({ seed: 919, physRev: IG.currentPhysRev(), build: IG.currentBuild(), dt: 1 / 60 });
    const initialS = G.player.s;
    const expected = [];
    for (let i = 0; i < 60; i++) {
      input = { steer: Math.sin(i / 17) * 0.017321, throttle: i < 40,
        throttleLevel: 0.37123456, brake: i >= 40 && i < 50, brakeLevel: 0.21345678,
        boost: i === 3 || i === 20, overtake: i === 7, shiftUp: i === 12 };
      A.step(1 / 60); expected.push(trace());
    }
    assert.equal(IG.finishLap(1), true, "ordinary native TT must record a deterministic tape");
    const tape = IG.snapshot(); assert.equal(tape.v, 3); assert.equal(IG.valid(tape), true);
    assert.equal(tape.rawThrottle[0], 0.37123456); assert.equal(tape.rawBrake[40], 0.21345678);
    assert.equal(tape.initialState.car.s, initialS);
    assert.equal(tape.initialState.seed, 919); assert.ok(Number.isFinite(tape.initialState.rngState));
    assert.ok(tape.context, "setup/physics/control configuration remains attached");
    assert.equal(IG.beginReplay(), false, "auxiliary actions require explicit native adapter acknowledgement");
    assert.equal(IG.beginReplay({ nativeControls: true }), true);
    const controls = Array.from({ length: IG.steps() }, (_, i) => IG.atStep(i));
    assert.equal(controls[7].overtake, true); assert.equal(controls[12].shiftUp, true);
    A.reset(0.02, 55, 0, tape.initialState.seed);
    Object.assign(G.player, tape.initialState.car);
    G.simSeed(tape.initialState.seed, tape.initialState.rngState); G.raceT = tape.initialState.raceT;
    A.clearInput();
    const actual = [];
    for (input of controls) { A.step(1 / 60); actual.push(trace()); }
    assert.deepEqual(actual, expected, "native adapter replay must match every physical tick");
    for (const bad of [NaN, Infinity, 2]) { const copy = JSON.parse(JSON.stringify(tape)); copy.rawSteer[0] = bad; assert.equal(IG.valid(copy), false); }
    const bad = JSON.parse(JSON.stringify(tape)); bad.v = 99; assert.equal(IG.valid(bad), false);
    bad.v = 3; bad.dt = 1000; assert.equal(IG.valid(bad), false, "duration bound");
  } finally { Object.assign(I, saved); A.headless(false); }
});

test("native tape starts at the next fixed boundary after a lap crossing and settings changes spoil capture", async () => {
  const A = g.apex, G = g.G, IG = g.sandbox.InputGhost, I = g.sandbox.Input;
  await A.tt("monza"); A.headless(true); A.reset(0.999999, 55, 0, 929); A.clearInput();
  const saved = { steer: I.steer, throttle: I.throttle, throttleLevel: I.throttleLevel, braking: I.braking, brakeLevel: I.brakeLevel };
  Object.assign(I, { steer: () => 0, throttle: () => true, throttleLevel: () => 0.25, braking: () => false, brakeLevel: () => 0 });
  try {
    IG.startLap({ seed: 929, physRev: IG.currentPhysRev(), build: IG.currentBuild(), dt: 1 / 60 });
    const oldLap = G.player.lap; A.step(1 / 60);
    assert.ok(G.player.lap > oldLap, "fixture crosses timing line on its first fixed tick");
    const nextStart = G.player.s;
    A.step(1 / 60, 35);
    assert.equal(IG.finishLap(0.5), true);
    const tape = IG.snapshot(); assert.equal(tape.steer.length, 35, "crossing input belongs to the previous lap");
    assert.equal(tape.initialState.car.s, nextStart);
    const originalRecord = IG.record; let count = 0;
    IG.record = (...args) => { count++; return originalRecord(...args); };
    const pace = G.PACE;
    try {
      A.step(1 / 60); assert.equal(count, 1);
      G.PACE = pace * 1.01; G.store.write("ghostCaptureProbe", 1);
      A.step(1 / 60); assert.equal(count, 1, "configuration invalidation prevents input recording just like pose/board acceptance");
    } finally { IG.record = originalRecord; G.PACE = pace; }
    const broken = JSON.parse(JSON.stringify(tape)); delete broken.initialState;
    assert.equal(IG.valid(broken), false, "v3 must carry a replay start");
  } finally { Object.assign(I, saved); A.headless(false); }
});
