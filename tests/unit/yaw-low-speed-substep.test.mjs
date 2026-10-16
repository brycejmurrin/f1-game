/* yaw-low-speed-substep.test.mjs — no period-2 yaw chatter at 3–4 m/s.
 *
 * At full lock the yaw/vLat explicit Euler in player-forces.js used to lock
 * into a period-2 Δr oscillation (~0.21 rad/s pin / ~0.40 shipped at 3–4 m/s,
 * 56/58 ticks). The fix substeps slip→force→integrate only below LOW_YAW_V=8
 * with a smooth blend; ≥8 m/s stays the original single step (bit-identical).
 *
 * Run: node --test tests/unit/yaw-low-speed-substep.test.mjs
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
const TICKS = 58;

let gPin = null, gShip = null;
before(async () => {
  gPin = await createGame({ track: "monza", seat: "pin", storage: { difficulty: "normal", autoThrottle: false } });
  await gPin.race("monza", "day", "dry");
  gShip = await createGame({ track: "monza", seat: "shipped", storage: { difficulty: "normal", autoThrottle: false } });
  await gShip.race("monza", "day", "dry");
});
after(() => {
  if (gPin) gPin.close();
  if (gShip) gShip.close();
});

/** Steady-state full-lock Δr sign-flip count + median |Δr| over TICKS. */
function chatter(g, speed) {
  const P = g.G.player, S = g.sandbox, track = g.G.track;
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  S.Tracks.sample(track, 0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = 0; P.x = 0; };
  g.apex.seed(SEED);
  g.apex.jump(0, speed, 0);
  P.vLat = 0; P.yawRateCur = 0; P.head = head0; P.axEstSm = 0; pin();
  for (let i = 0; i < 30; i++) {
    P.speed = speed;
    g.apex.setInput({ steer: 0 });
    g.step(1, DT); pin();
  }
  P.vLat = 0; P.yawRateCur = 0;
  for (let i = 0; i < 90; i++) {
    P.speed = speed;
    g.apex.setInput({ steer: 1 });
    g.step(1, DT); pin();
  }
  const yrs = [];
  for (let i = 0; i < TICKS; i++) {
    P.speed = speed;
    g.apex.setInput({ steer: 1 });
    g.step(1, DT); pin();
    yrs.push(P.yawRateCur);
  }
  let flips = 0;
  const steps = [];
  for (let i = 2; i < yrs.length; i++) {
    const d0 = yrs[i - 1] - yrs[i - 2];
    const d1 = yrs[i] - yrs[i - 1];
    if (d0 * d1 < 0) {
      flips++;
      steps.push(Math.abs(d1));
    }
  }
  const median = steps.length
    ? [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)]
    : 0;
  return { flips, step: median, yawLast: yrs[yrs.length - 1], yrs };
}

test("LOW_YAW_* locals live in player-forces.js; fast-path rdot order preserved", () => {
  const forces = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  const consts = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");
  assert.ok(/LOW_YAW_V\s*=\s*8/.test(forces), "LOW_YAW_V = 8");
  assert.ok(/LOW_YAW_SUBS\s*=\s*4/.test(forces), "LOW_YAW_SUBS = 4");
  assert.ok(forces.includes("vAbs >= LOW_YAW_V"), "fast path gated on vAbs >= LOW_YAW_V");
  // Multiplication order on the fast path: ((YAW_DAMP * brake) * speed) * r
  assert.ok(
    /YAW_DAMP\s*\*\s*brakeYawDamp\s*\*\s*speedYawDamp\s*\*\s*\(c\.yawRateCur/.test(forces),
    "fast-path rdot keeps ((YAW_DAMP*brake)*speed)*r order",
  );
  assert.ok(!/LOW_YAW_/.test(consts), "no LOW_YAW_* in consts.js");
});

test("pin seat: no Δr chatter at 3–4 m/s full lock; ≥8 m/s stays calm", () => {
  for (const v of [3, 4]) {
    const { flips, step } = chatter(gPin, v);
    assert.ok(flips <= 4, `pin@${v}: Δr sign-flips ${flips} (want ≤4, was 56)`);
    assert.ok(step < 0.02, `pin@${v}: median |Δr| ${step} (want <0.02, was ~0.21)`);
  }
  const at8 = chatter(gPin, 8);
  assert.ok(at8.flips <= 4, `pin@8: flips ${at8.flips}`);
  assert.ok(at8.step < 0.02, `pin@8: step ${at8.step}`);
});

test("shipped seat: no Δr chatter at 3–4 m/s full lock", () => {
  for (const v of [3, 4]) {
    const { flips, step } = chatter(gShip, v);
    assert.ok(flips <= 4, `shipped@${v}: Δr sign-flips ${flips} (want ≤4, was 56)`);
    assert.ok(step < 0.02, `shipped@${v}: median |Δr| ${step} (want <0.02, was ~0.40)`);
  }
});
