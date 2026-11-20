/* collide-severity-pace.test.mjs — js/physics/collide.js contact SEVERITY (the
 * `impact` handed to collideFx: shake, hit-stop, haptics, damage, the career
 * `hitSev`) reads closing speed on the pace-normalised scale. It read raw m/s,
 * so the same shunt scored 0.35 at OVERALL SPEED min and 1.0 at max; wall
 * strikes moved to the std scale in #4947 and car contacts were missed.
 * The scale is anchored at notch 11, the default when impacts were calibrated,
 * so those hits score bit-for-bit what they scored before (the literals below
 * were captured from the pre-change file).
 * Run: node --test tests/unit/collide-severity-pace.test.mjs
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
// js/input/steer-tuning.js: paceFromSlider(v) = 1.06^(v - 14); slider 1 / 11 (calibration) / 17 (default) / 19.
const PACE_MIN = Math.pow(1.06, -13), PACE_CALIBRATION = Math.pow(1.06, -3), PACE_DEF = Math.pow(1.06, 3), PACE_MAX = Math.pow(1.06, 5);

function impacts(pace, cars) {
  const fx = [];
  const ctx = vm.createContext({ Math, Number, Object, WeakMap,
    Log: { info() {}, enabled: () => false }, Tracks: { wallAt: () => 100 },
    IncidentSim: { owns: () => false, notifyCar() {} },
    DebrisWorld: { active: () => false, carImpact() {} } });
  for (const file of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js", "js/physics/collide.js"])
    vm.runInContext(readFileSync(join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
  const G = { track: { total: 6000 }, player: null, netPlay: { owns: () => false }, PACE: pace, raceT: 0,
    wrapS: (s) => (s % 6000 + 6000) % 6000, worldFromTrack: (s, x) => ({ x, z: s }) };
  vm.runInContext("Collide", ctx).create(G, (a, b, v) => fx.push(v)).resolveCollisions(cars(pace / PACE_CALIBRATION), DT);
  return fx;
}
// Every speed is written at the calibration pace and scaled by its pace ratio:
// the SAME shunt on the std scale at each slider setting.
const yawed = (vLat) => (k) => [
  { id: "p", human: true, isPlayer: true, yawVis: 0.9, prog: 100, s: 100, x: 0, speed: 30 * k, vLat: vLat * k, yawRateCur: 0 },
  { id: "o", human: true, yawVis: 0, prog: 100.4, s: 100.4, x: 1.9, speed: 30 * k, vLat: 0, yawRateCur: 0 },
];
const rearEnd = (dv) => (k) => [
  { id: "a", human: true, isPlayer: true, yawVis: 0, prog: 100, s: 100, x: 0, speed: (20 + dv) * k, vLat: 0, yawRateCur: 0 },
  { id: "b", human: false, yawVis: 0, prog: 104.5, s: 104.5, x: 0.2, speed: 20 * k, vLat: 0, yawRateCur: 0 },
];
const CALIBRATED_IMPACTS = [
  ["a yawed side strike, 4 m/s", yawed(4), 0.7795874148572147],
  ["a yawed side strike, 12 m/s", yawed(12), 0.9287738072421743],
  ["a rear-end tap, 6 m/s closing", rearEnd(6), 0.19499999999999998],
  ["a rear-end shunt, 20 m/s closing", rearEnd(20), 0.615],
];

for (const [name, cars, before] of CALIBRATED_IMPACTS) {
  test(`${name}: calibration pace scores bit-for-bit what it scored before`, () => {
    assert.deepEqual(impacts(PACE_CALIBRATION, cars), [before]);
  });
  test(`${name}: the same std-scale hit scores the same at OVERALL SPEED min, default and max`, () => {
    for (const pace of [PACE_MIN, PACE_DEF, PACE_MAX]) {
      const got = impacts(pace, cars);
      assert.equal(got.length, 1, `collideFx fired ${got.length} times at pace ${pace}`);
      assert.ok(Math.abs(got[0] - before) < 1e-12, `pace ${pace.toFixed(3)}: ${got[0]} vs calibrated ${before}`);
    }
  });
}

test("the collision invariant includes the current shipped slider default", () => {
  const src = readFileSync(join(ROOT, "js/input/steer-tuning.js"), "utf8");
  const k = (name) => Number(new RegExp(`\\b${name} = ([\\d.]+)`).exec(src)[1]);
  assert.equal(Math.pow(k("PACE_STEP"), k("PACE_DEF") - k("PACE_REF")), PACE_DEF);
});
