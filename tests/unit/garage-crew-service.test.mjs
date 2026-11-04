/* GarageCrewService (js/garage/crew-service.js): floor jack stays above the
 * bay floor, jack-operator feet plant on the floor during turns, and every
 * service actor is clear of the exit corridor before roll-out.
 *
 * Run: node --test tests/unit/garage-crew-service.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load() {
  const draws = [], meshes = [], freed = [];
  const gfx = {
    createMesh: (d) => { const mesh = { n: d.pos.length, d }; meshes.push(mesh); return mesh; },
    freeMesh: (mesh) => freed.push(mesh),
    draw: (mesh, m) => draws.push({ mesh, m: Array.from(m) }),
  };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of [
    "js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js",
    "js/garage/scene-prims.js", "js/garage/crew-draw.js", "js/garage/crew-motion.js",
    "js/garage/crew-service.js", "js/garage/scene-crew.js", "js/garage/arrival.js",
  ]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Crew = vm.runInContext("GarageCrew", ctx);
  const Arrival = vm.runInContext("GarageArrival", ctx);
  const Service = vm.runInContext("GarageCrewService", ctx);
  Crew.init(gfx);
  return { Crew, Arrival, Service, draws, meshes, freed };
}

const LIV = { c1: [1, 0.5, 0], c2: [0.1, 0.1, 0.1] };
const worldY = (d, k) => {
  const v = d.mesh.d.pos, m = d.m;
  return m[1] * v[k] + m[5] * v[k + 1] + m[9] * v[k + 2] + m[13];
};

test("floor jack and service equipment stay above the bay floor through leave", () => {
  const { Crew, Arrival, Service, draws } = load();
  const cfg = Arrival.settings({ enterCrew: "service", leaveCrew: "service" });
  const floorY = Service.FLOOR_Y;
  assert.ok(floorY > 0 && floorY <= 0.02, "FLOOR_Y is a small positive clearance");
  for (let t = 0; t < Arrival.duration(cfg, "out"); t += 0.1) {
    draws.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(t, cfg, true));
    // Service draws start after the two guide figures (2 × 13 parts).
    for (let i = 26; i < draws.length; i++) {
      const d = draws[i];
      for (let k = 0; k < d.mesh.d.pos.length; k += 3) {
        assert.ok(worldY(d, k) >= -1e-6,
          `t=${t.toFixed(2)} draw ${i}: equipment/crew vertex under the floor`);
      }
    }
    // Jack base (first service prop after 5 bodies × 13 = 65 → index 26+65=91?);
    // find the mesh whose local Y span is the near-floor jack wheels.
    let jackMin = Infinity;
    for (let i = 26; i < draws.length; i++) {
      const d = draws[i], pos = d.mesh.d.pos;
      let localMin = Infinity, localMax = -Infinity;
      for (let k = 1; k < pos.length; k += 3) {
        if (pos[k] < localMin) localMin = pos[k];
        if (pos[k] > localMax) localMax = pos[k];
      }
      if (localMin <= 1e-6 && localMax < 0.35 && Math.abs(d.m[13] - floorY) < 1e-6) {
        for (let k = 0; k < pos.length; k += 3) jackMin = Math.min(jackMin, worldY(d, k));
      }
    }
    assert.ok(jackMin >= floorY - 1e-6,
      `t=${t.toFixed(2)}: jack base minY ${jackMin} must sit on FLOOR_Y ${floorY}`);
  }
});

test("jack operator planted feet stay on the floor during leave turns", () => {
  const { Crew, Arrival, Service, draws } = load();
  const cfg = Arrival.settings({ enterCrew: "service", leaveCrew: "service" });
  const plant = Service.FOOT_PLANT;
  // Leave turn window 1.2–1.8 s. Guides occupy draws 0..23; four cover
  // handlers 24..75; jack operator 76..87 — boots at 80 and 85.
  for (let t = 1.2; t <= 1.8; t += 0.05) {
    draws.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(t, cfg, true));
    const boots = [draws[80], draws[85]];
    assert.ok(boots[0] && boots[1], "jack operator boots drawn");
    let planted = 0;
    for (const boot of boots) {
      const fy = boot.m[13];
      assert.ok(fy >= plant - 1e-6, `foot target ${fy} sank below plant ${plant}`);
      let sole = Infinity;
      for (let k = 0; k < boot.mesh.d.pos.length; k += 3) sole = Math.min(sole, worldY(boot, k));
      assert.ok(sole >= -1e-4, `boot sole ${sole} sank through the floor at t=${t.toFixed(2)}`);
      // A planted foot's sole sits on the floor; the swing foot may lift.
      if (Math.abs(fy - plant) < 1e-5) {
        assert.ok(sole <= 0.02, `planted sole ${sole} floated at t=${t.toFixed(2)}`);
        planted++;
      }
    }
    assert.ok(planted >= 1, `at least one jack foot planted at t=${t.toFixed(2)}`);
  }
});

test("every service actor is clear of the exit corridor before roll-out", () => {
  const { Arrival, Service } = load();
  const cfg = Arrival.settings({ enterCrew: "service", leaveCrew: "service" });
  const half = Service.EXIT_HALF;
  const clearBy = Service.CLEAR_BY;
  // Before the clear gate, the jack may still be sidestepping — but once CLEAR_BY
  // opens (and while the car is moving), nobody occupies |x| < EXIT_HALF.
  for (let t = clearBy; t <= 7; t += 0.1) {
    const p = Arrival.poseOut(t, cfg, true);
    const actors = Service.layout(p);
    for (let i = 0; i < actors.length; i++) {
      assert.ok(Math.abs(actors[i].x) >= half,
        `t=${t.toFixed(2)} actor ${i} still in exit corridor at x=${actors[i].x}`);
    }
  }
  // Car first moves around t≈6.0 with service leave — confirm clearance then.
  let firstMove = null;
  for (let t = 0; t < 8; t += 0.05) {
    const p = Arrival.poseOut(t, cfg, true);
    if (Math.abs(p.z) + Math.abs(p.x) > 0.03) { firstMove = t; break; }
  }
  assert.ok(firstMove != null && firstMove >= clearBy,
    `roll-out at ${firstMove} must not precede CLEAR_BY ${clearBy}`);
  const atMove = Service.layout(Arrival.poseOut(firstMove, cfg, true));
  for (let i = 0; i < atMove.length; i++) {
    assert.ok(Math.abs(atMove[i].x) >= half, `actor ${i} in corridor at first roll-out`);
  }
  // Jack must leave the centerline promptly (sidestep), not linger at x=0 for seconds.
  const early = Service.layout(Arrival.poseOut(1.2, cfg, true));
  assert.ok(Math.abs(early[4].x) >= half,
    `jack still on centerline at t=1.2 (x=${early[4].x}); sidestep must clear EXIT_HALF`);
});

test("leave cover handlers never sit inside the exit half-width", () => {
  const { Arrival, Service } = load();
  const cfg = Arrival.settings({ leaveCrew: "service" });
  const half = Service.EXIT_HALF;
  for (let t = 0; t <= 6; t += 0.05) {
    const actors = Service.layout(Arrival.poseOut(t, cfg, true));
    for (let i = 0; i < 4; i++) {
      assert.ok(Math.abs(actors[i].x) >= half - 1e-6,
        `t=${t.toFixed(2)} cover handler ${i} entered exit corridor (x=${actors[i].x})`);
    }
  }
});
