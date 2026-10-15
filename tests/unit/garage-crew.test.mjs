/* THE PIT CREW (js/garage/scene-crew.js) and GARAGE ANGLE's plan of the bay
 * (js/garage/arrival.js angleMap).
 *  - two mechanics beside the nose step back as the shutter lifts and never
 *    stand in the car's path; the lollipop man stands in the working lane on
 *    the CAMERA's side (so he is seen through the door), his board across the
 *    car's path while it is parked and lifted once it rolls;
 *  - the crew is drawn only while a pose plays (a parked preview has none);
 *  - the angle map lights the chosen eye (both for CUT), at the arrival's eyes.
 *
 * Run: node --test tests/unit/garage-crew.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function load() {
  const draws = [];
  const gfx = { createMesh: (d) => ({ n: d.pos.length }), freeMesh() {}, draw: (mesh, m) => draws.push({ mesh, m: Array.from(m) }) };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Crew = vm.runInContext("GarageCrew", ctx), Arrival = vm.runInContext("GarageArrival", ctx);
  Crew.init(gfx);
  return { Crew, Arrival, draws };
}
const LIV = { c1: [1, 0.5, 0], c2: [0.1, 0.1, 0.1] };

test("mechanics step back as the shutter lifts, clear of the car's path", () => {
  const { Crew, Arrival } = load();
  const cfg = Arrival.settings({});
  const shut = Crew.layout(Arrival.poseOut(0, cfg, true), -1), open = Crew.layout(Arrival.poseOut(1.8, cfg, true), -1);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(open.mechanics[i][0]) > Math.abs(shut.mechanics[i][0]) + 1, "stepped back by the time the door is up");
    assert.ok(Math.abs(open.mechanics[i][0]) - 0.3 > 1.0 + 0.3, "and well clear of the car's 1 m half-width");
  }
  assert.ok(shut.mechanics[0][0] < 0 && shut.mechanics[1][0] > 0, "one each side, facing the car");
});

test("the lollipop man stands on the camera's side, board down while parked, up once it rolls", () => {
  const { Crew, Arrival } = load();
  for (const angle of ["cut", "left", "right"]) {
    const cfg = Arrival.settings({ angle });
    const parked = Arrival.poseOut(2.5, cfg, true), rolling = Arrival.poseOut(6, cfg, true);
    const cam = parked.eye[0] > 0 ? 1 : -1;
    const a = Crew.layout(parked, cam).lollipop, b = Crew.layout(rolling, cam).lollipop;
    assert.equal(Math.sign(a.x), cam, angle + ": the camera's side of the door, where the eye can see him");
    assert.ok(a.z > 6.4 && a.z < 6.4 + 5.5, "out in the working lane");
    assert.equal(a.raise, Crew.LOWERED); assert.equal(b.raise, Crew.RAISED);
    // The car never passes through where he stands.
    for (let t = 0; t < Arrival.OUT_SETTLE; t += 0.05) {
      const p = Arrival.poseOut(t, cfg, true);
      assert.ok(Math.hypot(p.x - a.x, p.z - a.z) > 1.3, `${angle} t ${t.toFixed(2)}: the car clears him`);
    }
  }
});

test("drawn only while a pose plays: three figures and one pole", () => {
  const { Crew, Arrival, draws } = load();
  Crew.draw(LIV, [-3.8, 2.1, -4.8], null);
  assert.equal(draws.length, 0, "no pose, no crew");
  Crew.draw(LIV, [-3.8, 2.1, -4.8], Arrival.poseOut(6, Arrival.DEFAULT, true));
  assert.equal(draws.length, 4);
  const scene = read("js/garage/scene.js");
  assert.match(scene, /if \(arrival && typeof GarageCrew !== "undefined"\) GarageCrew\.draw\(liv, eye, arrival, SHELL_OPTS\);/);
});

test("the angle map lights the chosen eye, both for the cut, and draws the bay, door and lane", () => {
  const { Arrival } = load();
  const lit = (svg) => (svg.match(/fill="#e10600"/g) || []).length;
  assert.equal(lit(Arrival.angleMap("cut")), 2);
  assert.equal(lit(Arrival.angleMap("left")), 1);
  assert.equal(lit(Arrival.angleMap("right")), 1);
  const left = Arrival.angleMap("left"), right = Arrival.angleMap("right");
  const litX = (svg) => +svg.match(/<circle cx="([\d.]+)"[^>]*fill="#e10600"/)[1];
  assert.ok(litX(left) < 60 && litX(right) > 60, "LEFT is drawn on the left of the plan, RIGHT on the right");
  assert.match(Arrival.angleMap("cut"), />1<\/text>.*>2<\/text>/s, "the cut numbers its two eyes in order");
});
