/* body-attitude.test.mjs — js/physics/body-attitude.js, the cosmetic
 * pitch / roll / heave springs, as pure numbers in a VM.
 *
 * The module had no unit test and no browser spec of its own (2026-09 coverage
 * census: zero references under tests/). What matters about it is small and
 * exact, so it is cheap to pin:
 *
 *   - SIGN PARITY. A human car's roll comes from speed·yawRate, an AI car's
 *     from -speed²·curvature (it has no world heading). The comment says the
 *     negation makes both lean OUTWARD; if a sign flips on either path, the
 *     grid leans the wrong way against the player and nothing else notices.
 *   - CRITICAL DAMPING. `crit()` is a closed-form critically-damped spring:
 *     under a held target it must approach monotonically and never overshoot.
 *   - BOUNDS. Pitch and roll are capped; heave saturates through a tanh knee;
 *     a huge dt is clamped to MAX_DT so a stalled tab does not launch the car.
 *   - OFF IS OFF. Disabled returns zeros and settles state, and the switch
 *     persists under the `apex26.` prefix.
 *   - THE PITCH SIGN. c.baPitch > 0 is a DIVE: game.js's axEstSm is NEGATIVE
 *     under braking (updateCar: `braking ? -brakeDecel`) and the
 *     module negates it, which is what js/camera/vantage.js reads ("baPitch > 0
 *     = nose-down = braking"). game.js's BODY rotation took +pitch as nose-UP
 *     until 2026-10-02 — every car lifted its nose on the brakes — and this
 *     file's own fixture called axEstSm: +5 (power) a "brake dive". AI cars
 *     had no axEstSm and never pitched; they dive off corridorAccel now.
 *   - KERBS, RIDE HEIGHT, THE PLANK (2026-10-02): a kerb strike kicks the body
 *     up and kerb-side up once (the flickering node flag is held), riding it
 *     shivers the body but not the camera's channel, the aero load sits the
 *     car down and rakes it, and the floor never passes the plank's bump stop
 *     — the overshoot is published as c.baScrape for the plank sparks.
 *
 * Run: node --test tests/unit/body-attitude.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DT = 1 / 60;

function load() {
  const raw = new Map();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, isNaN, isFinite, console,
    GameStore: { store: { raw: (k) => (raw.has(k) ? raw.get(k) : null), rawSet: (k, v) => raw.set(k, v) } },
  });
  ctx.window = ctx;   // js/physics/consts.js assigns window.PhysicsConsts
  seedLog(ctx);
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/body-attitude.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const cars = [];
  const G = { cars, player: null };
  const api = vm.runInContext("BodyAttitude", ctx).create(G);
  const consts = vm.runInContext("PhysicsConsts", ctx);
  return { api, G, cars, raw, consts };
}

/** Step `n` frames of a held input and return the last offsets (copied). */
function settle(api, c, n, groundY = 0, ygV = 0, df = 0) {
  let out;
  for (let i = 0; i < n; i++) out = { ...api.update(c, groundY, DT, ygV, df) };
  return out;
}

test("human and AI cars lean the same way through the same corner", () => {
  const { api } = load();
  // +k is a LEFT turn (AGENTS.md); a human car turning left carries a NEGATIVE
  // yawRateCur ("curvature sign is opposite the yaw-rate sign"), so the module
  // negates the AI term. Both must land on one sign, and a mirrored corner on
  // the other.
  for (const [k, yaw] of [[+0.01, -0.5], [-0.01, +0.5]]) {
    const human = settle(api, { human: true, speed: 50, yawRateCur: yaw }, 120);
    const ai = settle(api, { human: false, speed: 50, kCur: k }, 120);
    assert.notEqual(human.roll, 0);
    assert.notEqual(ai.roll, 0);
    assert.equal(Math.sign(human.roll), Math.sign(ai.roll),
      `k=${k}: human roll ${human.roll.toFixed(4)} vs AI ${ai.roll.toFixed(4)} lean opposite ways`);
  }
});

test("the spring is critically damped: monotone approach, no overshoot, converged in 2 s", () => {
  const { api } = load();
  const c = { human: true, speed: 0, axEstSm: 5 };   // throttle squat (game.js: axEst > 0 under power → −pitch)
  const trace = [];
  for (let i = 0; i < 120; i++) trace.push(api.update(c, 0, DT, 0, 0).pitch);
  const target = trace[trace.length - 1];
  assert.ok(target < 0, "power squats the nose up (negative — c.baPitch > 0 is a dive)");
  for (let i = 1; i < trace.length; i++) {
    assert.ok(Math.abs(trace[i]) >= Math.abs(trace[i - 1]) - 1e-12, `overshoot or reversal at frame ${i}`);
    assert.ok(Math.abs(trace[i]) <= Math.abs(target) + 1e-12, `passed the target at frame ${i}`);
  }
  // 0.75 s at ω=9 is 6.75 time constants; critically damped remainder
  // (1+ωt)e^-ωt ≈ 0.9 %, so within 2 % of settled (0.5 s would be 6 %).
  assert.ok(Math.abs(trace[45] - target) < Math.abs(target) * 0.02, "not converged at 0.75 s");
});

test("pitch and roll are capped and heave saturates below its ceiling", () => {
  const { api, consts } = load();
  const p = settle(api, { human: true, axEstSm: 1e6 }, 240);
  assert.ok(Math.abs(p.pitch) <= 0.024 + 1e-9, `pitch ${p.pitch} above the ≈1.4° cap`);
  const r = settle(api, { human: true, speed: 100, yawRateCur: -100 }, 240);
  assert.ok(Math.abs(r.roll) <= 0.055 + 1e-9, `roll ${r.roll} above the ≈3.1° cap`);
  assert.ok(Math.abs(r.roll) > 0.05, "full lateral load should reach the cap, not stop short");
  // A step in ground velocity is an impulse on the heave spring; keep kicking.
  const c = { human: true };
  let worst = 0;
  for (let i = 0; i < 120; i++) worst = Math.max(worst, Math.abs(api.update(c, 0, DT, i % 2 ? 50 : -50, 0).heave));
  assert.ok(worst > 0.01, "a ground impulse must move the body");
  assert.ok(worst < 0.05, `heave ${worst} reached the ±5 cm rail — the tanh knee is gone`);
  assert.equal(consts.LAT_MAX > 0, true, "the roll scale is the model's own LAT_MAX");
});

test("a stalled frame is clamped: dt=10 s behaves like dt=MAX_DT and stays finite", () => {
  const { api } = load();
  const a = { human: true, axEstSm: 5 }, b = { human: true, axEstSm: 5 };
  const big = api.update(a, 0, 10, 0, 0).pitch;
  const clamped = api.update(b, 0, 0.05, 0, 0).pitch;
  assert.ok(Number.isFinite(big));
  assert.equal(big, clamped);
});

test("downforce stiffens heave: the same impulse moves the body less at full load", () => {
  const { api } = load();
  const soft = { human: true }, stiff = { human: true };
  // Measured from each car's own settled height (full load sits the body
  // AERO_DROP lower), and an EXTENSION impulse (ground falling away): a
  // compression of this size meets the plank's bump stop, which caps both.
  const s0 = api.update(soft, 0, DT, 0, 0).heave, t0 = api.update(stiff, 0, DT, 0, 1).heave;
  const s = Math.abs(api.update(soft, 0, DT, -30, 0).heave - s0);
  const t = Math.abs(api.update(stiff, 0, DT, -30, 1).heave - t0);
  assert.ok(t < s, `full downforce (${t}) should heave less than none (${s})`);
});

test("the pitch sign: braking dives (+), power squats (−) — player and AI alike", () => {
  const { api } = load();
  // Player: axEstSm (negative under braking). AI: no axEstSm — corridorAccel,
  // every car's signed observed accel, drives its pitch.
  const pBrake = settle(api, { human: true, axEstSm: -30 }, 60).pitch;
  const pPower = settle(api, { human: true, axEstSm: 6 }, 60).pitch;
  const aBrake = settle(api, { human: false, corridorAccel: -30 }, 60).pitch;
  const aPower = settle(api, { human: false, corridorAccel: 6 }, 60).pitch;
  assert.ok(pBrake > 0 && aBrake > 0, `braking must DIVE (c.baPitch > 0, vantage.js's sign): player ${pBrake}, AI ${aBrake}`);
  assert.ok(pPower < 0 && aPower < 0, `power must squat (nose up, < 0): player ${pPower}, AI ${aPower}`);
  assert.ok(Math.abs(pBrake) <= 0.024 + 1e-9, "the dive keeps the ≈1.4° cap");
  // A human car ignores corridorAccel, an AI car ignores axEstSm.
  assert.equal(settle(api, { human: true, corridorAccel: -30 }, 60).pitch, 0);
  assert.equal(settle(api, { human: false, axEstSm: -30 }, 60).pitch, 0);
});

test("the aero load sits the car down and rakes it nose-down, and only the load does", () => {
  const { api } = load();
  const still = settle(api, { human: true }, 120, 0, 0, 0);
  const loaded = settle(api, { human: true }, 120, 0, 0, 1);
  assert.equal(still.heave, 0);
  assert.equal(still.pitch, 0);
  assert.ok(loaded.heave < -0.008 && loaded.heave > -0.02, `full load drops the body ~12 mm: ${loaded.heave}`);
  assert.ok(loaded.pitch > 0 && loaded.pitch < 0.006, `full load rakes the nose down (+) a few mrad: ${loaded.pitch}`);
  const half = settle(api, { human: true }, 120, 0, 0, 0.25);
  assert.ok(Math.abs(half.heave) < Math.abs(loaded.heave), "the drop scales with the load (∝ v²)");
});

/** The floor's lowest point from the published offsets (body-attitude's plank geometry; +pitch dives). */
const plankClear = (c) => 0.04 + c.baHeave + Math.min(-1.3 * c.baPitch, 1.9 * c.baPitch);

test("the plank bottoms out: the floor never passes the bump stop, and the overshoot is the scrape", () => {
  const { api } = load();
  // Cruising at full load: clear of the road, no scrape.
  const cruise = { human: true };
  settle(api, cruise, 120, 0, 0, 1);
  assert.equal(cruise.baScrape, 0, "a settled car at full load does not scrape");
  // Full brake dive at full load plus a compression (the bottom of a dip).
  const c = { human: true, axEstSm: -40 };
  settle(api, c, 60, 0, 0, 1);
  let worst = 1, peak = 0;
  for (let i = 0; i < 30; i++) {
    api.update(c, 0, DT, 20, 1);   // the ground velocity steps 0 → 20 m/s once: one compression impulse
    worst = Math.min(worst, plankClear(c));
    peak = Math.max(peak, c.baScrape);
  }
  assert.ok(worst >= 0.008 - 1e-9, `the floor went ${worst} m from the road — under the 8 mm stop`);
  assert.ok(peak > 0.3, `a dive into a compression at full load must scrape: peak ${peak}`);
  assert.ok(peak <= 1, "scrape is a 0..1 intensity");
  // A gentle dive at no load (slow) never reaches the blocks.
  const slow = { human: true, axEstSm: -8 };
  settle(api, slow, 60, 0, 0, 0);
  assert.equal(slow.baScrape, 0, "a light brake at low speed does not scrape");
});

test("a kerb strike kicks the body up and kerb-side up, once, scaled by speed", () => {
  const { api } = load();
  // Ride 30 frames off, then onto a kerb on the RIGHT (+x) and on the LEFT.
  function strike(x, vF, flicker) {
    const c = { human: false, speed: 60, x, onKerb: false };
    for (let i = 0; i < 30; i++) api.update(c, 0, DT, 0, 0, vF);
    let maxH = 0, roll = 0;
    const heaves = [];
    for (let i = 0; i < 20; i++) {
      c.onKerb = flicker ? i % 2 === 0 : true;   // the node-rate flicker
      api.update(c, 0, DT, 0, 0, vF);
      heaves.push(c.baHeave);
      if (c.baHeave > maxH) { maxH = c.baHeave; roll = c.baRoll; }
    }
    return { maxH, roll, heaves };
  }
  const right = strike(5, 0.8, false), left = strike(-5, 0.8, false);
  assert.ok(right.maxH > 0.008 && right.maxH < 0.05, `a strike at speed jolts the body up 1-2 cm: ${right.maxH}`);
  assert.ok(right.roll > 0.005, `a RIGHT kerb lifts the right side (+roll): ${right.roll}`);
  assert.ok(left.roll < -0.005, `a LEFT kerb lifts the left side (−roll): ${left.roll}`);
  // The flickering flag is held for KERB_HOLD_M of travel: one strike, the same body.
  const fl = strike(5, 0.8, true);
  assert.deepEqual(fl.heaves, right.heaves, "a flag flickering at the node rate must not re-strike");
  // Speed scales it; parked on a kerb is no strike at all.
  const slow = strike(5, 0.2, false);
  assert.ok(slow.maxH < right.maxH * 0.5, `a slow strike is gentler: ${slow.maxH} vs ${right.maxH}`);
  assert.equal(strike(5, 0, false).maxH, 0, "no speed, no strike");
  // Leaving the kerb (after its hold runs out) drops the body back, the other way.
  const c = { human: false, speed: 60, x: 5, onKerb: true };
  for (let i = 0; i < 60; i++) api.update(c, 0, DT, 0, 0, 0.8);
  c.onKerb = false;
  let minH = 0;
  for (let i = 0; i < 30; i++) minH = Math.min(minH, api.update(c, 0, DT, 0, 0, 0.8).heave);
  assert.ok(minH < -0.002, `dropping off the kerb dips the body: ${minH}`);
});

test("riding a kerb shivers the body but not the channel the onboard camera reads", () => {
  const { api } = load();
  const a = { human: false, speed: 60, x: 5, onKerb: true }, b = { human: false, speed: 60, x: 5, onKerb: true };
  let diffs = 0, maxJ = 0;
  for (let i = 0; i < 60; i++) {
    const oa = { ...api.update(a, 0, DT, 0, 0, 0.8) };
    const ob = { ...api.update(b, 0, DT, 0, 0, 0.8) };
    assert.deepEqual(oa, ob, "the shiver is deterministic — keyed on metres ridden, no clock");
    const j = oa.heave - a.baHeave;
    if (Math.abs(j) > 1e-6) diffs++;
    maxJ = Math.max(maxJ, Math.abs(j), Math.abs(oa.roll - a.baRoll));
  }
  assert.ok(diffs > 30, `the returned body offsets must shiver on the kerb (${diffs}/60 frames)`);
  assert.ok(maxJ <= 0.004 + 1e-9, `a shiver, not a bounce: ${maxJ}`);
  // Off the kerb the body and the camera channel agree exactly.
  const off = { human: false, speed: 60, x: 0, onKerb: false };
  for (let i = 0; i < 10; i++) {
    const o = api.update(off, 0, DT, 0, 0, 0.8);
    assert.equal(o.heave, off.baHeave);
    assert.equal(o.roll, off.baRoll);
  }
});

test("off is off: disabled returns zeros, resets state, and the switch persists under apex26.", () => {
  const { api, raw, cars } = load();
  const c = { human: true, axEstSm: 5 };
  cars.push(c);
  settle(api, c, 60);
  assert.notEqual(c.baPitch, 0);
  const st = api.setEnabled(false);
  assert.equal(st.enabled, false);
  assert.equal(raw.get("apex26.bodyAttitude"), "0");
  assert.equal(c.baPitch, 0, "disabling settles every car to rigid at once");
  const off = api.update(c, 0, DT, 0, 0);
  assert.deepEqual({ ...off }, { pitch: 0, roll: 0, heave: 0 });
  assert.equal(api.active(), false);
  api.setEnabled(true);
  assert.equal(raw.get("apex26.bodyAttitude"), "1");
  assert.deepEqual({ ...api.offsets(null) }, { pitch: 0, roll: 0, heave: 0, enabled: true }, "no player yet: zeros, never a throw");
  assert.deepEqual({ ...api.update(null, 0, DT, 0, 0) }, { pitch: 0, roll: 0, heave: 0 });
});

test("one pitch sign end to end: game.js dives the body for +pitch, the convention vantage.js reads", () => {
  // The published c.baPitch is the camera's input AND the body rotation's; a
  // flip on either side alone puts the mesh and the camera at odds again.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const rot = game.match(/if \(_baPitch\) \{[\s\S]*?\n    \}/);
  assert.ok(rot, "game.js's body pitch rotation is present");
  // +p tilts forward toward −up: the nose (car-local +z) goes DOWN.
  assert.match(rot[0], /tmpF\[i\] = f \* cp - u \* sp;/);
  assert.match(rot[0], /tmpU\[i\] = u \* cp \+ f \* sp;/);
  const cam = fs.readFileSync(path.join(ROOT, "js/camera/vantage.js"), "utf8");
  assert.match(cam, /baPitch > 0 = nose-down = braking/, "the chase g-response's documented sign");
});
