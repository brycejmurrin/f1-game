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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function load() {
  const draws = [], meshes = [], freed = [];
  const gfx = { createMesh: (d) => { const mesh = { n: d.pos.length, d }; meshes.push(mesh); return mesh; }, freeMesh: (mesh) => freed.push(mesh), draw: (mesh, m) => draws.push({ mesh, m: Array.from(m) }) };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Crew = vm.runInContext("GarageCrew", ctx), Arrival = vm.runInContext("GarageArrival", ctx);
  Crew.init(gfx);
  return { Crew, Arrival, draws, meshes, freed };
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
  assert.match(scene, /if \(arrival && typeof GarageCrew !== "undefined"\) GarageCrew\.draw\(liv, eye, arrival, SHELL_OPTS, team && team\.id\);/);
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

test("design-preview crew looks: each builds valid, distinct geometry; classic stays the default", () => {
  const meshes = [];
  const gfx = { createMesh: (d) => { meshes.push(d); return { d }; }, freeMesh() {}, draw() {} };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Crew = vm.runInContext("GarageCrew", ctx), Arrival = vm.runInContext("GarageArrival", ctx);
  Crew.init(gfx);
  assert.equal(Crew.look(), "classic");
  const sizes = {};
  for (const id of Crew.LOOKS) {
    meshes.length = 0;
    assert.equal(Crew.setLook(id), id);
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(2.5, Arrival.settings({}), true));
    let verts = 0;
    for (const d of meshes) {
      const n = d.pos.length / 3;
      assert.equal(d.nrm.length, d.pos.length); assert.equal(d.col.length, d.pos.length);
      assert.ok(d.pos.every(Number.isFinite), id + ": finite positions");
      assert.ok(d.idx.every((i) => i >= 0 && i < n), id + ": indices in range");
      verts += n;
      // FIT: nothing below the bay floor (y 0); the baked looks also stand ON it.
      let minY = Infinity;
      for (let i = 1; i < d.pos.length; i += 3) minY = Math.min(minY, d.pos[i]);
      if (n > 1000) assert.ok(minY >= -1e-3 && minY < 0.03, `${id}: the crew stands on the floor (min y ${minY.toFixed(3)})`);
    }
    sizes[id] = verts;
  }
  assert.equal(new Set(Object.values(sizes)).size, Crew.LOOKS.length, "every look is different geometry: " + JSON.stringify(sizes));
  assert.equal(Crew.setLook("nope"), "welcome", "an unknown id keeps the look");
});

test("pit-stop front jack: saddle seated on each chassis' nose underside, clear of the front wing", () => {
  const meshes = [];
  const gfx = { createMesh: (d) => { meshes.push(d); return { d }; }, freeMesh() {}, draw() {} };
  const STYLES = { base: {}, droop: { noseDroop: -0.03, noseSlim: 0.84 }, long: { noseTipZ: 0.55 }, short: { noseTipZ: -0.32, noseDroop: 0.04 } };
  const Car3D = { CHASSIS: { nose: [{ z: 2.60, y: 0.245, h: 0.072 }, { z: 2.00, y: 0.315, h: 0.235 }] }, teamStyleOf: (id) => STYLES[id] || {}, bodyStyleKey: (t, b) => b || t };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Car3D, Log: { info() {}, warn() {} } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Crew = vm.runInContext("GarageCrew", ctx), Arrival = vm.runInContext("GarageArrival", ctx);
  Crew.init(gfx); Crew.setLook("pitstop");
  for (const id of Object.keys(STYLES)) {
    meshes.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(2.5, Arrival.settings({}), true), null, id);
    const nose = Crew.noseTip(id, LIV), d = meshes.find((m) => m.pos.length > 30000);
    // The cradle's top line follows the nose underside: at every z along it, the highest jack vertex at x≈0 IS the nose.
    let worst = -Infinity, n = 0, inWing = 0;
    for (let i = 0; i < d.pos.length; i += 3) {
      const x = d.pos[i], y = d.pos[i + 1], z = d.pos[i + 2];
      if (Math.abs(x) < 1e-6 && z >= nose.z - 0.1 - 1e-6 && z <= nose.z - 0.015 + 1e-6 && y > 0.12) {
        worst = Math.max(worst, y - nose.at(z)); n++;                                    // > 0 = inside the nose, < 0 = a gap
      }
      if (Math.abs(x) < 0.9 && z > 2.40 && z < 2.72 && y < 0.10) inWing++;              // the main plane's box
    }
    assert.ok(n > 0, id + ": the cradle's top line was sampled");
    assert.ok(worst < 1e-4, `${id}: the cradle never rises into the nose (worst ${worst.toFixed(4)} m)`);
    assert.ok(worst > -1e-3, `${id}: and touches it, no gap (closest ${(-worst * 1000).toFixed(2)} mm below)`);
    assert.equal(inWing, 0, id + ": nothing of the jack (or crew) inside the front wing's main plane");
  }
});


test("every crew style wears primary/secondary livery helmets, including former cap roles", () => {
  const { Crew, Arrival, meshes } = load();
  const liv = { c1: [0.83, 0.09, 0.19], c2: [0.04, 0.66, 0.91], accent: [0.18, 0.77, 0.31] };
  const same = (d, i, c) => c.every((v, k) => Math.abs(d.col[i + k] - v) < 1e-8);
  for (const look of Crew.LOOKS) {
    Crew.setLook(look); meshes.length = 0;
    Crew.draw(liv, [-3, 2, -4], Arrival.poseOut(1.8, Arrival.DEFAULT, true));
    const head = meshes[0].d, hits = [0, 0, 0];
    for (let i = 0; i < head.pos.length; i += 3) if (head.pos[i + 1] > 1.50) {
      for (const [k, c] of [liv.c1, liv.c2, [0.05, 0.06, 0.08]].entries()) if (same(head, i, c)) hits[k]++;
    }
    assert.ok(hits.every((n) => n > 0), look + ": shell, contrasting stripe and dark visor");
    for (const { d } of meshes) for (let i = 0; i < d.col.length; i += 3)
      assert.ok(!same(d, i, [0.62, 0.47, 0.38]), look + ": no exposed cap faces or necks");
  }
});

test("crew paint cache detects colliding palettes and in-place edits, but reuses unchanged meshes", () => {
  const { Crew, Arrival, meshes, freed } = load();
  const liv = { c1: [0.5, 0.125, 0.25], c2: [0.25, 0.5, 0.75] };
  const pose = Arrival.poseOut(1.8, Arrival.DEFAULT, true);
  for (const look of ["classic", "workshop"]) {
    Crew.setLook(look); meshes.length = 0; freed.length = 0;
    Crew.draw(liv, [-3, 2, -4], pose);
    const built = meshes.length, old = meshes.slice();
    Crew.draw(liv, [-3, 2, -4], pose);
    assert.equal(meshes.length, built, look + ": no mesh creation on another frame");
    // These two secondary palettes have EXACTLY the same old 7R + 11G + 13B hash.
    liv.c2 = [0.421875, 0.390625, 0.75];
    Crew.draw(liv, [-3, 2, -4], pose);
    assert.equal(meshes.length, built * 2, look + ": distinct paint cannot share cached geometry");
    assert.ok(old.every((m) => freed.includes(m)), look + ": previous meshes are released");
    liv.c1[1] += 0.125;
    Crew.draw(liv, [-3, 2, -4], pose);
    assert.equal(meshes.length, built * 3, look + ": editing an existing colour array refreshes paint");
    Crew.draw(liv, [-3, 2, -4], pose);
    assert.equal(meshes.length, built * 3, look + ": the edited palette is cached");
    liv.c2 = [0.25, 0.5, 0.75];
  }
});

test("helmet visor faces point out of the closed shell with unit normals", () => {
  const { Crew, Arrival, meshes } = load();
  Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(1.8, Arrival.DEFAULT, true));
  const d = meshes[0].d; let faces = 0;
  for (let i = 0; i < d.idx.length; i += 3) {
    const ids = d.idx.slice(i, i + 3).map((v) => v * 3);
    if (!ids.every((v) => d.pos[v + 1] > 1.50 && Math.abs(d.col[v] - 0.05) < 1e-8)) continue;
    const [a, b, c] = ids.map((v) => d.pos.slice(v, v + 3));
    const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const centre = a.map((x, k) => (x + b[k] + c[k]) / 3 - [0, 1.62, 0][k]);
    assert.ok(n.reduce((sum, x, k) => sum + x * centre[k], 0) > 0, "non-degenerate, outward visor triangle");
    for (const at of ids) assert.ok(Math.abs(Math.hypot(...d.nrm.slice(at, at + 3)) - 1) < 1e-8);
    faces++;
  }
  assert.ok(faces >= 4, "the visor wraps across the front of the helmet");
});

test("animation crew overrides do not overwrite the garage crew selection", () => {
  const { Crew, Arrival, draws, meshes } = load();
  Crew.setLook("workshop");
  const pose = Arrival.poseOut(1.8, Arrival.settings({ leaveCrew: "guides" }), true);
  Crew.draw(LIV, [-3, 2, -4], pose);
  assert.equal(draws.length, 4, "two guides, lollipop marshal and pole");
  assert.equal(Crew.look(), "workshop", "Team-tab preference is unchanged");
  draws.length = 0;
  Crew.draw(LIV, [-3, 2, -4], { ...pose, crew: "welcome" });
  assert.equal(draws.length, 3, "welcome group, marshal and pole");
  const count = meshes.length; draws.length = 0;
  Crew.draw(LIV, [-3, 2, -4], { ...pose, crew: "none" });
  assert.equal(draws.length + meshes.length, count, "no crew draws or new meshes when disabled");
  Crew.draw(LIV, [-3, 2, -4], { ...pose, crew: "current" });
  assert.equal(Crew.look(), "workshop");
});

test("service crews hand over to already-built guides while the car moves", () => {
  const { Crew, Arrival, draws, meshes } = load();
  for (const look of ["pitstop", "workshop"]) {
    Crew.setLook(look); draws.length = 0; meshes.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(1.8, Arrival.DEFAULT, true));
    const service = draws[0].mesh, count = meshes.length;
    for (const pose of [Arrival.pose(4, Arrival.DEFAULT, true), Arrival.poseOut(4, Arrival.DEFAULT, true)]) {
      draws.length = 0; Crew.draw(LIV, [-3, 2, -4], pose);
      assert.equal(draws.length, 4, look + ": guiding crew during motion");
      assert.ok(draws.every((d) => d.mesh !== service), look + ": no jack or cockpit worker in the car path");
      assert.equal(meshes.length, count, look + ": handover creates no meshes per frame");
    }
    draws.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.pose(Arrival.DURATION, Arrival.DEFAULT, true));
    assert.equal(draws[0].mesh, service, look + ": service crew returns when parked");
  }
});
