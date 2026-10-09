/* yaw-damp-speed.test.mjs — high-speed step-steer overshoot stays in band.
 *
 * YAW_DAMP * brakeYawDamp alone has no speed term, so lock-0.5 overshoot grew
 * with speed (8.2% at 50 m/s → 19.4% at 83.3 m/s). player-forces.js multiplies
 * by a local smoothstep speedYawDamp (1.0 ≤50 m/s → 1+EXTRA by 65 m/s). This
 * pin keeps ≤50 m/s unchanged, caps 61.1 / 83.3 m/s, and leaves COAST_YAW_* /
 * lift-off alone.
 *
 * Run: node --test tests/unit/yaw-damp-speed.test.mjs
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

function stepOvershoot(b, speed, lock = 0.5, n = 120) {
  const { P, reset, step } = b;
  reset(speed);
  const yr = [];
  for (let i = 0; i < n; i++) {
    step({ steer: lock, throttle: P.speed < speed - 0.2, brake: P.speed > speed + 1.5 });
    yr.push(P.yawRateCur);
  }
  const fin = mean(yr.slice(-20));
  const absFin = Math.abs(fin) || 1e-9;
  const pk = Math.max(...yr.map(Math.abs));
  const t10 = yr.findIndex((y) => Math.abs(y) >= 0.1 * absFin);
  const t90 = yr.findIndex((y) => Math.abs(y) >= 0.9 * absFin);
  return {
    overshoot_pct: (pk / absFin - 1) * 100,
    rise_ms: (t10 >= 0 && t90 >= 0) ? (t90 - t10) * DT * 1000 : null,
    final: fin,
  };
}

test("speedYawDamp locals live in player-forces.js, not consts.js", () => {
  const forces = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  const consts = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");
  assert.ok(/SPEED_YAW_LO\s*=\s*50/.test(forces), "SPEED_YAW_LO = 50");
  assert.ok(/SPEED_YAW_HI\s*=\s*65/.test(forces), "SPEED_YAW_HI = 65");
  assert.ok(/SPEED_YAW_EXTRA\s*=\s*5/.test(forces), "SPEED_YAW_EXTRA = 5");
  assert.ok(forces.includes("speedYawDamp"), "speedYawDamp multiplies yaw damp");
  assert.ok(forces.includes("coastYaw"), "COAST_YAW path untouched");
  assert.ok(!/SPEED_YAW_/.test(consts), "no SPEED_YAW_* key in consts.js");
});

test("step-steer lock 0.5: ≤50 m/s unchanged; 61.1 ≤12%; 83.3 ≤14%", () => {
  const b = pinStraight();
  const o30 = stepOvershoot(b, 30);
  const o50 = stepOvershoot(b, 50);
  const o61 = stepOvershoot(b, 61.1);
  const o83 = stepOvershoot(b, 83.3);
  // Front peak slip (CURVE_PEAK_X_F) lowers step overshoot vs pre-#1264 tip (~8%).
  assert.ok(o30.overshoot_pct < 3, `30 m/s overshoot ${o30.overshoot_pct}%`);
  assert.ok(o50.overshoot_pct >= 0 && o50.overshoot_pct <= 3,
    `50 m/s overshoot ${o50.overshoot_pct}% (front peak slip retune)`);
  assert.ok(o61.overshoot_pct <= 12,
    `61.1 m/s overshoot ${o61.overshoot_pct}% ≤ 12 (was 14.0)`);
  assert.ok(o83.overshoot_pct <= 14,
    `83.3 m/s overshoot ${o83.overshoot_pct}% ≤ 14 (was 19.4)`);
  // No lazier turn-in: rise not more than ~1 tick slower than tip's 100 ms.
  assert.ok(o50.rise_ms <= 220, `50 m/s rise ${o50.rise_ms} ms`);
  assert.ok(o61.rise_ms <= 250, `61.1 m/s rise ${o61.rise_ms} ms`);
  assert.ok(o83.rise_ms <= 220, `83.3 m/s rise ${o83.rise_ms} ms`);
});

test("fullLock yawMax and lift-off ratio stay on tip shapes", () => {
  const b = pinStraight();
  const { P, reset, step } = b;
  reset(45);
  let yMax = 0;
  for (let i = 0; i < 120; i++) {
    step({ steer: 1.0, throttle: true });
    yMax = Math.max(yMax, Math.abs(P.yawRateCur));
  }
  // Tip fullLock.yawMax = 1.15; allow ≤5% drop.
  assert.ok(yMax >= 1.15 * 0.95, `fullLock yawMax ${yMax} ≥ 95% of 1.15`);

  reset(45);
  for (let i = 0; i < 90; i++) step({ steer: 0.8, throttle: true });
  const yawOn = P.yawRateCur;
  for (let i = 0; i < 30; i++) step({ steer: 0.8 });
  const yawOff = P.yawRateCur;
  const ratio = Math.abs(yawOff) / Math.max(Math.abs(yawOn), 1e-6);
  assert.ok(ratio > 1.05, `lift-off still rotates (${ratio})`);
  assert.ok(ratio >= 1.12 && ratio <= 1.28, `lift-off ratio ~1.16–1.25 (got ${ratio})`);
});

// PACE scales world speed, never the band: the extra damping must engage at the
// same STANDARD speed (vStd = v * VMAX / vTop), so the world-speed thresholds move
// with PACE (AGENTS.md §Physics). The damp multiplier is read out of one tick:
// the yaw-rate change with YAW_DAMP 0 vs 1 differs by exactly YAW_DAMP * mult * r * dt
// (tyre moments identical for the same state), so the ratio is mult at that speed.
function yawDampMult(b, vWorld) {
  const { P, reset, step } = b;
  const r0 = 0.5;
  const oneTick = (yawDamp) => {
    g.apex.setPhysics({ yawDamp });
    reset(vWorld);
    P.yawRateCur = r0;
    step({ steer: 0, throttle: true });
    return P.yawRateCur;
  };
  const free = oneTick(0);
  const damped = oneTick(1);
  g.apex.setPhysics({ yawDamp: 1 });
  return (free - damped) / (r0 * DT);
}

test("speed-yaw band sits at the same STANDARD speeds at PACE 0.7 / 1 / 1.34", () => {
  const b = pinStraight();
  const stdSpeeds = [40, 50, 57.5, 65, 83.3];
  const at = (pace) => {
    g.apex.setPhysics({ pace });
    return stdSpeeds.map((vs) => yawDampMult(b, vs * pace));
  };
  const ref = at(1);
  // Sanity on the PACE 1 reference itself: identity <= 50, mid-smoothstep, full 6x.
  assert.ok(Math.abs(ref[0] - 1) < 0.02 && Math.abs(ref[1] - 1) < 0.02, `identity below the band ${ref}`);
  assert.ok(Math.abs(ref[2] - 3.5) < 0.1, `mid-band mult ${ref[2]} ~ 3.5`);
  assert.ok(Math.abs(ref[3] - 6) < 0.1 && Math.abs(ref[4] - 6) < 0.1, `full band ${ref}`);
  for (const pace of [0.7, 1.34]) {
    const got = at(pace);
    stdSpeeds.forEach((vs, i) => {
      assert.ok(Math.abs(got[i] - ref[i]) < 0.1,
        `PACE ${pace}, vStd ${vs}: damp mult ${got[i].toFixed(3)} vs PACE 1 ${ref[i].toFixed(3)}`);
    });
  }
  g.apex.setPhysics({ pace: 1 });
});
