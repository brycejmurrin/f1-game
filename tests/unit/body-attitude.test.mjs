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
  const c = { human: true, speed: 0, axEstSm: 5 };   // brake dive (+axEst → -pitch)
  const trace = [];
  for (let i = 0; i < 120; i++) trace.push(api.update(c, 0, DT, 0, 0).pitch);
  const target = trace[trace.length - 1];
  assert.ok(target < 0, "braking pitches the nose down (negative)");
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
  api.update(soft, 0, DT, 0, 0); api.update(stiff, 0, DT, 0, 1);
  const s = Math.abs(api.update(soft, 0, DT, 30, 0).heave);
  const t = Math.abs(api.update(stiff, 0, DT, 30, 1).heave);
  assert.ok(t < s, `full downforce (${t}) should heave less than none (${s})`);
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
