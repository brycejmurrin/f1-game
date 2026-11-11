/* collide-yawed-fx.test.mjs — js/physics/collide.js orientedResponse (a yawed
 * contact, where one car is past the 20° blend floor) fires the contact FX
 * (collideFx: shake, hit-stop, rumble, the career `hits` count) ONCE per pair
 * per step, from the FIRST relaxation pass, with the closing speed it carries.
 * It was gated on the LAST pass: the impulse had already taken the closing
 * speed out (impact always the 0.15 floor), and a pair separated on pass 0
 * hit the `!_colTouched` early break and never reached the last pass at all —
 * no shake, no rumble. The rear-end path's firstPairFx gate is the model.
 * Run: node --test tests/unit/collide-yawed-fx.test.mjs
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

function solver() {
  const fx = [];
  const ctx = vm.createContext({ Math, Number, Object, WeakMap,
    Log: { info() {}, enabled: () => false }, Tracks: { wallAt: () => 100 },
    IncidentSim: { owns: () => false, notifyCar() {} },
    DebrisWorld: { active: () => false, carImpact() {} } });
  for (const file of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js", "js/physics/collide.js"])
    vm.runInContext(readFileSync(join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
  const G = { track: { total: 6000 }, player: null, netPlay: { owns: () => false }, PACE: 1, raceT: 0,
    wrapS: (s) => (s % 6000 + 6000) % 6000, worldFromTrack: (s, x) => ({ x, z: s }) };
  return { G, fx, s: vm.runInContext("Collide", ctx).create(G, (a, b, v) => fx.push([a.id, b.id, v])) };
}
// A spun player (yawVis 0.9 rad ≈ 52°) sliding sideways into a car alongside.
const pair = (vLat) => [
  { id: "p", human: true, isPlayer: true, yawVis: 0.9, prog: 100, s: 100, x: 0, speed: 30, vLat, yawRateCur: 0 },
  { id: "o", human: true, yawVis: 0, prog: 100.4, s: 100.4, x: 1.9, speed: 30, vLat: 0, yawRateCur: 0 },
];

test("a yawed contact takes the oriented path (the scenario is the one under test)", () => {
  const { s } = solver();
  const cars = pair(8);
  s.resolveCollisions([], DT);   // binds track / netPlay for pairContact
  const ct = s.pairContact(cars[0], cars[1]);
  assert.ok(ct && ct.oriented, "two overlapping cars, one spun past the blend floor, must be an oriented contact");
});

for (const vLat of [4, 12]) {
  test(`a yawed side strike at ${vLat} m/s fires the FX once, with its closing speed (not the 0.15 floor)`, () => {
    const { s, fx } = solver();
    const cars = pair(vLat);
    s.resolveCollisions(cars, DT);
    assert.equal(fx.length, 1, `collideFx fired ${fx.length} times for one strike`);
    assert.ok(fx[0][2] > 0.15, `impact ${fx[0][2]} — the last-pass floor, the closing speed was lost`);
    s.resolveCollisions(cars, DT);   // the next step: a still-touching pair may notify again, once
    assert.ok(fx.length <= 2, `collideFx fired ${fx.length - 1} times on the next step`);
  });
}
