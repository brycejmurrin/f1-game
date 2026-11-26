/* physics-correctness-6878.test.mjs — #6878 (hunt #6862 P3 + P7).
 * P3: IncidentSim.yawOf must invert a yaw quaternion about +Y (forward +z).
 * P7: cooldownDrive's accelerations and steer reference ride driveTune.PACE.
 * Run: node --test tests/unit/physics-correctness-6878.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { symbolSource, GAME_REL } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => readFileSync(join(ROOT, p), "utf8");

function loadIncident() {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array, isNaN, isFinite, console,
    DebrisWorld: {}, TrackPit: { EXIT_WALL_W: 0.35 }, Tracks: {} });
  seedLog(ctx);
  for (const p of ["js/core/mat4.js", "js/race/race-control.js", "js/physics/contact-geometry.js", "js/physics/incident-sim.js"])
    vm.runInContext(rd(p), ctx, { filename: absSrc(p) });
  return vm.runInContext("IncidentSim", ctx);
}

test("P3: yawOf(quatFromYaw(θ)) ≈ θ over a sweep (heading = atan2(tx, tz))", () => {
  const { yawOf } = loadIncident();
  for (let d = -175; d <= 175; d += 5) {
    const th = d * Math.PI / 180;
    const pose = { qx: 0, qy: Math.sin(th / 2), qz: 0, qw: Math.cos(th / 2) };
    assert.ok(Math.abs(yawOf(pose) - th) < 1e-9, `yaw ${d}°`);
  }
  // A small pitch/roll on top must not flip the heading (the old x-axis term did).
  const th = 1.0, a = 0.2;
  const qy = [0, Math.sin(th / 2), 0, Math.cos(th / 2)], qx = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
  const [x1, y1, z1, w1] = qy, [x2, y2, z2, w2] = qx;
  const q = { qw: w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, qx: w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
              qy: w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, qz: w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2 };
  assert.ok(Math.abs(yawOf(q) - th) < 0.05);
});

function cooldownAt(pace) {
  const body = symbolSource("function cooldownDrive(c, dt)");
  const VMAX = 72;
  const ctx = vm.createContext({ Math, VMAX,
    inputOf: () => ({ throttle: true, brake: false, steer: 1 }),
    Input: {}, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    vTop: () => VMAX * pace, vStd: (v) => v / pace,
    wrapS: (s) => s, Tracks: { sample: (t, s, o) => { o.hw = 100; o.t = [0, 0, 1]; } }, track: {}, smp: {},
    worldFromTrack: () => ({ x: 0, z: 0 }) });
  vm.runInContext(body, ctx, { filename: absSrc(GAME_REL) });
  const c = { speed: 0, s: 0, prog: 0, x: 0 };
  vm.runInContext("cooldownDrive", ctx)(c, 0.1);
  return c;
}

test("P7: cooldownDrive throttle accel and steer rate scale with PACE", () => {
  const a = cooldownAt(1), b = cooldownAt(0.5);
  assert.ok(Math.abs(a.speed - 1.8) < 1e-9);
  assert.ok(Math.abs(b.speed - 0.9) < 1e-9, "accel halves at pace 0.5");
  assert.ok(Math.abs(b.x / a.x - 0.5) < 1e-9 || b.x < a.x, "steer slew scales down");
});
