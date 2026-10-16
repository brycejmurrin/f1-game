/* steer-feel-lift-off.test.mjs — mid-corner lift-off must rotate, not snap.
 *
 * Before COAST_YAW_* (js/physics/consts.js + player-forces yaw damp), a pinned
 * skidpad at 45 m/s / lock 0.8 grew yaw 1.66× in 0.75 s after throttle lift
 * (rear slip −6.4° → −13°). player-dynamics-vm still requires yaw_off >
 * yaw_on · 1.05 (intentional lift-off oversteer); this pin caps the runaway.
 *
 * Run: node --test tests/unit/steer-feel-lift-off.test.mjs
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
    P.vLat = 0; P.yawRateCur = 0; P.head = head0; pin();
  };
  const step = (inp) => { g.apex.setInput(inp); g.step(1, DT); pin(); };
  return { P, reset, step };
}

test("COAST_YAW_* constants ship and are read by player-forces", () => {
  const consts = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");
  const forces = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  assert.ok(/COAST_YAW_DAMP:\s*1\.5/.test(consts), "COAST_YAW_DAMP in consts");
  assert.ok(/COAST_YAW_LO:\s*0\.65/.test(consts), "COAST_YAW_LO in consts");
  assert.ok(/COAST_YAW_HI:\s*1\.10/.test(consts), "COAST_YAW_HI in consts");
  assert.ok(forces.includes("COAST_YAW_DAMP"), "player-forces reads COAST_YAW_DAMP");
  assert.ok(forces.includes("coastYaw"), "coastYaw term present");
});

test("lift-off at 45 m/s lock 0.8 rotates but does not snap past 1.25× in 0.75 s", () => {
  const { P, reset, step } = pinStraight();
  reset(45);
  for (let i = 0; i < 90; i++) step({ steer: 0.8, throttle: true });
  const yawOn = P.yawRateCur;
  assert.ok(Math.abs(yawOn) > 0.4, `near-limit skidpad (yaw_on=${yawOn})`);
  for (let i = 0; i < 45; i++) step({ steer: 0.8 });
  const yawOff = P.yawRateCur;
  const ratio = Math.abs(yawOff) / Math.max(Math.abs(yawOn), 1e-6);
  assert.ok(ratio > 1.05, `still lifts into oversteer (${yawOn} → ${yawOff}, ratio ${ratio})`);
  assert.ok(ratio <= 1.25, `no snap: ratio ${ratio} ≤ 1.25 (was ~1.66 before COAST_YAW_*)`);
  assert.ok(Math.abs(P.slipRear || 0) * 180 / Math.PI < 12,
    `rear slip stays recoverable (${(P.slipRear || 0) * 180 / Math.PI}°)`);
});

test("coast yaw damp is idle on throttle (no change to planted mid-corner)", () => {
  const { P, reset, step } = pinStraight();
  reset(45);
  for (let i = 0; i < 120; i++) step({ steer: 0.8, throttle: true });
  const yaw = P.yawRateCur;
  // Holding throttle must not trip the coast path into a damped crawl.
  assert.ok(Math.abs(yaw) > 0.5, `planted corner still rotates (yaw=${yaw})`);
});
