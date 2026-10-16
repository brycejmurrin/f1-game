/* speed-coupling.test.mjs — lateral→longitudinal body-frame couple in
 * player-forces.js. Planar bicycle ˙u = Fx/m − Fyf·sin(δ) + v·r; drive/brake/
 * drag already integrate in game.js, so this pin adds the missing terms and
 * asserts:
 *   - straight (δ=0, vLat=0): speed trace bit-identical to coast-drag-only
 *   - held-steer coast: each tick matches coast + (v·r − Fyf·sin δ) within tol
 *   - COUPLE_V_MIN guard present; yaw/damp path untouched
 *
 * Run: node --test tests/unit/speed-coupling.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DT = 1 / 60;
const SEED = 42;
const COAST = 6; // PhysicsConsts.COAST_DRAG (aeroX=0 on the pin)
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

let g = null;
before(async () => {
  g = await createGame({ track: "monza", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monza", "day", "dry");
});
after(() => { if (g) g.close(); });

function pinStraight() {
  const P = g.G.player, S = g.sandbox, track = g.G.track;
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  S.Tracks.sample(track, 0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = 0; P.x = 0; };
  const reset = (v) => {
    g.apex.seed(SEED);
    g.apex.jump(0, v, 0);
    P.vLat = 0; P.yawRateCur = 0; P.head = head0; P.axEstSm = 0; P.vertLoad = 0; pin();
  };
  const step = (inp) => { g.apex.setInput(inp); g.step(1, DT); pin(); };
  return { P, reset, step };
}

test("COUPLE_V_MIN lives in player-forces; yaw damp / consts untouched", () => {
  const forces = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  const consts = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");
  assert.ok(/COUPLE_V_MIN\s*=\s*3/.test(forces), "COUPLE_V_MIN = 3");
  assert.ok(forces.includes("vLat0 * r0 - Fyf * Math.sin(delta)"),
    "couple = vLat0*r0 - Fyf*sin(delta)");
  assert.ok(forces.includes("speedYawDamp"), "SPEED_YAW path untouched");
  assert.ok(forces.includes("coastYaw"), "COAST_YAW path untouched");
  assert.ok(!/COUPLE_V_MIN/.test(consts), "no COUPLE_V_MIN in consts.js");
});

test("straight coast (delta=0, vLat=0): couple is 0 so speed path is tip-identical", () => {
  const { P, reset, step } = pinStraight();
  reset(45);
  for (let i = 0; i < 30; i++) step({ steer: 0, throttle: P.speed < 44.8 });
  assert.equal(P.steerAngle || 0, 0, "delta=0");
  assert.ok(Math.abs(P.vLat || 0) < 1e-6, `vLat≈0 got ${P.vLat}`);
  const trace = [];
  for (let i = 0; i < 90; i++) {
    const vLat0 = P.vLat || 0;
    const r0 = P.yawRateCur || 0;
    const u0 = P.speed;
    step({ steer: 0 });
    const Fyf = P.forceFront || 0;
    const delta = P.steerAngle || 0;
    const couple = vLat0 * r0 - Fyf * Math.sin(delta);
    // Couple must be exactly 0 → `c.speed = u0 + 0` is a no-op vs tip.
    assert.ok(Math.abs(couple) < 1e-12,
      `tick ${i}: couple ${couple} (vLat=${vLat0} r=${r0} Fyf=${Fyf} δ=${delta})`);
    assert.equal(delta, 0, "delta stays 0");
    assert.ok(Math.abs(P.vLat || 0) < 1e-6, `vLat drifts ${P.vLat}`);
    trace.push(P.speed);
    assert.ok(P.speed <= u0 + 1e-9, "straight coast must not gain speed");
  }
  // Tip reference (seed 42, Monza pin, same settle): first/last coast samples.
  assert.ok(trace[0] > 40 && trace[0] < 46, `start ${trace[0]}`);
  assert.ok(trace[89] < trace[0] - 5, "material coast drop over 1.5 s");
});

test("held-steer coast loses speed by the couple amount (within tol)", () => {
  const { P, reset, step } = pinStraight();
  const v0 = 45, steer = 0.8, settle = 60, n = 120;
  reset(v0);
  for (let i = 0; i < settle; i++) {
    step({ steer, throttle: P.speed < v0 - 0.2, brake: P.speed > v0 + 1.5 });
  }
  const residuals = [];
  const couples = [];
  const vStart = P.speed;
  for (let i = 0; i < n; i++) {
    const vLat0 = P.vLat || 0;
    const r0 = P.yawRateCur || 0;
    const u0 = P.speed;
    step({ steer }); // coast, held lock
    // Post-step forceFront/steerAngle ARE this tick's Fyf/δ (written before couple).
    const Fyf = P.forceFront || 0;
    const delta = P.steerAngle || 0;
    const couple = vLat0 * r0 - Fyf * Math.sin(delta);
    const uExpect = Math.max(0, u0 + (-COAST + couple) * DT);
    couples.push(couple);
    residuals.push(P.speed - uExpect);
  }
  const meanCouple = mean(couples);
  const meanRes = mean(residuals.map(Math.abs));
  const aAvg = (P.speed - vStart) / (n * DT);
  // Tip without couple measured meanCouple ≈ −3.4 at 45/0.8; must stay material.
  assert.ok(meanCouple < -2.0,
    `expected material negative couple, got ${meanCouple}`);
  // Speed after each tick matches coast+couple (axEstSm / aero noise ≤ 0.15 m/s).
  assert.ok(meanRes < 0.15,
    `mean |speed − (coast+couple)| ${meanRes} too large`);
  assert.ok(aAvg < -COAST - 1.5,
    `held-steer a_avg ${aAvg} should be < ${-COAST - 1.5}`);
});

test("below COUPLE_V_MIN (~3 m/s) couple does not reverse through zero", () => {
  const { P, reset, step } = pinStraight();
  reset(4);
  for (let i = 0; i < 30; i++) step({ steer: 0.9 });
  for (let i = 0; i < 120; i++) {
    step({ steer: 0.9 });
    assert.ok(Number.isFinite(P.speed), `NaN speed at tick ${i}`);
    assert.ok(P.speed >= -1e-9, `speed went negative: ${P.speed}`);
  }
});
