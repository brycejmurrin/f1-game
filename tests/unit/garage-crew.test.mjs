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
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function load() {
  const draws = [], meshes = [], freed = [];
  const gfx = { createMesh: (d) => { const mesh = { n: d.pos.length, d }; meshes.push(mesh); return mesh; }, freeMesh: (mesh) => freed.push(mesh), draw: (mesh, m) => draws.push({ mesh, m: Array.from(m) }) };
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array, Log: { info() {}, warn() {} } });
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/crew-draw.js", "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Crew = vm.runInContext("GarageCrew", ctx), Arrival = vm.runInContext("GarageArrival", ctx);
  Crew.init(gfx);
  return { Crew, Arrival, draws, meshes, freed, Service: vm.runInContext("GarageCrewService", ctx), Motion: vm.runInContext("GarageCrewMotion", ctx) };
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
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/crew-draw.js", "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
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
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/crew-draw.js", "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/scene-crew.js", "js/garage/arrival.js"])
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
  assert.equal(draws.length, 26, "two articulated guides, lollipop marshal and pole");
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
      assert.equal(draws.length, 26, look + ": articulated guiding crew during motion");
      assert.ok(draws.every((d) => d.mesh !== service), look + ": no jack or cockpit worker in the car path");
      assert.equal(meshes.length, count, look + ": handover creates no meshes per frame");
    }
    draws.length = 0;
    Crew.draw(LIV, [-3, 2, -4], Arrival.pose(Arrival.DURATION, Arrival.DEFAULT, true));
    assert.equal(draws[0].mesh, service, look + ": service crew returns when parked");
  }
});

test('Blender motion keeps contact feet planted and returns both feet to rest', () => {
  const { Motion } = load(), a = new Float32Array(7), b = new Float32Array(7);
  assert.equal(Motion.sampleCount, 25);
  Motion.sample(0, a); Motion.sample(1, b);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6);
  let plants = 0, lift = 0;
  const back = u => u * u * (3 - 2 * u);
  for (let k = 0; k < 24; k++) {
    const u = k / 24, v = (k + 1) / 24; Motion.sample(u, a); Motion.sample(v, b);
    for (let f = 0; f < 4; f += 2) {
      lift = Math.max(lift, a[f] - .08);
      if (Math.abs(a[f] - .08) < 1e-5 && Math.abs(b[f] - .08) < 1e-5) {
        assert.ok(Math.abs((a[f + 1] - 1.35 * back(u)) - (b[f + 1] - 1.35 * back(v))) < .001, 'planted foot stays in world space'); plants++;
      }
    }
  }
  assert.ok(plants >= 5); assert.ok(lift > .06);
});

test('articulated guide playback reuses meshes, clears the car and keeps boots on the floor', () => {
  const { Crew, Arrival, draws, meshes, freed } = load(); Crew.setLook('workshop');
  const config = Arrival.settings({ enterCrew: 'guides', leaveCrew: 'guides' });
  Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(0, config, false)); const built = meshes.length;
  let first = null, changed = false;
  for (let t = 0; t < 9; t += .1) {
    draws.length = 0; Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(t, config, false));
    assert.equal(draws.length, 26, 'bounded rigid-part draw count'); assert.equal(meshes.length, built, 'no per-frame mesh generation');
    for (const d of draws) assert.ok(d.m.every(Number.isFinite));
    const leg = draws[2].m; if (!first) first = leg; else changed ||= leg.some((v,i) => Math.abs(v-first[i]) > .01);
    for (const d of draws.slice(0, 24)) for (let i = 0; i < d.mesh.d.pos.length; i += 3) {
      const p = d.mesh.d.pos, m = d.m, x = m[0]*p[i]+m[4]*p[i+1]+m[8]*p[i+2]+m[12];
      assert.ok(Math.abs(x) > 1.1, 'guide mesh stays outside the car corridor');
    }
    for (const d of [draws[4], draws[9], draws[16], draws[21]]) {
      // Flat boot meshes: the lower face touches ground during contact and lifts only during a swing.
      const y = d.m[13] - .08; assert.ok(y > -1e-5 && y < .1);
    }
  }
  assert.ok(changed, 'limb transforms actually move'); assert.equal(Crew.look(), 'workshop');
  Crew.free(); assert.equal(freed.length, built, 'all cached articulated parts released once');
});

test('reduced motion holds guide gestures while marshal raises smoothly before departure', () => {
  const { Crew, Arrival, draws } = load(), cfg = Arrival.settings({ leaveCrew: 'guides' });
  const frames = [];
  for (const t of [4, 5]) { draws.length = 0; Crew.draw(LIV, [-3,2,-4], Arrival.poseOut(t,cfg,true)); frames.push(draws.slice(0,24).map(d=>d.m)); }
  assert.deepEqual(frames[0], frames[1], 'decorative cue loop and bob are held under reduced motion');
  const angle = t => Crew.layout(Arrival.poseOut(t,cfg,false),-1).lollipop.raise;
  assert.equal(angle(2.5),Crew.LOWERED); assert.ok(angle(2.75)>Crew.LOWERED && angle(2.75)<Crew.RAISED);
  assert.ok(Math.abs(angle(2.9)-Crew.RAISED)<1e-6, 'board clears before the car starts rolling');
});

test('runtime motion export matches the current Blender authoring source', () => {
  const digest = createHash('sha256').update(read('tools/garage/author-crew-motion.py')).digest('hex');
  assert.ok(read('js/garage/crew-motion.js').includes('Source SHA256: ' + digest), 'regenerate Blender curves after authoring edits');
});

test('actual articulated boot transforms plant in both world axes during retreat', () => {
  const { Crew, Arrival, Motion, draws } = load();
  const cfg = Arrival.settings({ leaveCrew: 'guides' }), a = new Float32Array(7); let prev = null, contacts = 0;
  for (let k = 0; k <= 24; k++) {
    const u = k / 24; draws.length = 0;
    Crew.draw(LIV, [-3,2,-4], { ...Arrival.poseOut(u*1.8,cfg,true), door:u });
    Motion.sample(u,a);
    const feet = [draws[4],draws[9],draws[16],draws[21]].map(d=>[d.m[12],d.m[13],d.m[14]]);
    if (prev) for (let i=0;i<4;i++) if (Math.abs(feet[i][1]-.08)<1e-5 && Math.abs(prev[i][1]-.08)<1e-5) {
      assert.ok(Math.hypot(feet[i][0]-prev[i][0],feet[i][2]-prev[i][2])<.001,'ground contact cannot slide sideways or forward');contacts++;
    }
    prev=feet;
  }
  assert.ok(contacts>=10);
});


test('service crew is seven workers with staged equipment and a clear departure lane', () => {
  const { Service, Arrival }=load(), cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  assert.equal(cfg.enterCrew,'service');assert.equal(cfg.leaveCrew,'service');
  assert.equal(Arrival.duration(cfg),Arrival.DURATION+6);assert.equal(Arrival.duration(cfg,'out'),Arrival.OUT_DURATION+3);
  for(let t=0;t<8.4;t+=.2) {
    const p=Arrival.pose(t,cfg,true), q=Arrival.pose(t,Arrival.DEFAULT,true);
    assert.equal(p.x,q.x);assert.equal(p.z,q.z);
    const a=Service.layout(p);assert.equal(a.length,7);assert.ok(a.slice(0,4).every(a=>Math.abs(a.x)>=2.69));assert.equal(a[4].x,4.05);
  }
  const near=Service.layout(Arrival.pose(11.95,cfg,true));
  assert.ok(near.slice(0,4).every(a=>Math.abs(Math.abs(a.x)-1.45)<1e-5));
  assert.ok(near.slice(0,4).every(a=>!a.coverAttached));
  for(let t=0;t<=5.9;t+=.1)assert.equal(Arrival.poseOut(t,cfg,true).z,0,'car waits for equipment');
  const clear=Service.layout(Arrival.poseOut(5.9,cfg,true));
  assert.ok(clear.slice(0,4).every(a=>Math.abs(a.x)>2.69&&a.coverAttached));assert.equal(clear[4].x,4.05);
  assert.ok(Arrival.poseOut(6.2,cfg,true).z>0);
});

test('service playback reuses every mesh, keeps grounded props and clears the moving car', () => {
  const { Crew,Arrival,draws,meshes,freed }=load(), cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  Crew.draw(LIV,[-3,2,-4],Arrival.pose(0,cfg,true));const built=meshes.length;
  for(const dir of ['in','out'])for(let t=0;t<Arrival.duration(cfg,dir);t+=.12) {
    const p=(dir==='in'?Arrival.pose:Arrival.poseOut)(t,cfg,true);draws.length=0;Crew.draw(LIV,[-3,2,-4],p);
    assert.equal(draws.length,121);assert.equal(meshes.length,built,'no mesh creation during service');
    for(const d of draws)assert.ok(d.m.every(Number.isFinite));
    for(const d of draws.slice(24,119))for(let k=0;k<d.mesh.d.pos.length;k+=3) {
      const v=d.mesh.d.pos,m=d.m,y=m[1]*v[k]+m[5]*v[k+1]+m[9]*v[k+2]+m[13];assert.ok(y>-.001,'worker and equipment stay above the floor');
      if(Math.abs(p.z)+Math.abs(p.x)>.03) {
        const x=m[0]*v[k]+m[4]*v[k+1]+m[8]*v[k+2]+m[12];assert.ok(Math.abs(x)>1.1,'service crew and props clear the moving car');
      }
    }
    for(let person=0;person<5;person++)for(const j of [2,3,5,6,7,8,10,11]) {
      const d=draws[24+person*13+j];
      // Every leg and arm segment retains its authored length.
      assert.ok(Math.abs(Math.hypot(d.m[4],d.m[5],d.m[6])-1)<.001,'limbs do not stretch to reach equipment');
    }
  }
  Crew.free();assert.equal(freed.length,built);assert.equal(new Set(freed).size,built);
});

test('jack operator hands follow the animated T-bar through insertion and withdrawal', () => {
  const { Crew,Arrival,draws }=load(), cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  for(const [dir,t] of [['in',12.5],['in',12.8],['out',.6],['out',2.7],['out',5.3]]) {
    draws.length=0;Crew.draw(LIV,[-3,2,-4],(dir==='in'?Arrival.pose:Arrival.poseOut)(t,cfg,true));
    const bar=draws[89], positions=bar.mesh.d.pos.slice(-72), local=[0,0,0];
    for(let k=0;k<positions.length;k+=3)for(let axis=0;axis<3;axis++)local[axis]+=positions[k+axis]/24;
    const world=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
    const centre=world(bar.m,local);
    for(const hand of [draws[82],draws[87]]) {
      const p=world(hand.m,[0,.30,0]);assert.ok(Math.abs(p[1]-centre[1])<1e-5);
      assert.ok(Math.hypot(p[0]-centre[0],p[2]-centre[2])<.225,'both gloves grip the T-bar');
    }
  }
});

test('service workers keep translation contacts planted across multiple walking cycles', () => {
  const { Crew,Arrival,draws }=load(), cfg=Arrival.settings({enterCrew:'service'});let prev=null,contacts=0;
  for(let k=0;k<=200;k++) {
    const t=8.7+2.2*k/200;draws.length=0;Crew.draw(LIV,[-3,2,-4],Arrival.pose(t,cfg,true));
    const feet=[28,33,41,46,54,59,67,72,80,85].map(i=>[draws[i].m[12],draws[i].m[13],draws[i].m[14]]);
    if(prev)for(let i=0;i<feet.length;i++)if(Math.abs(feet[i][1]-.08)<1e-5&&Math.abs(prev[i][1]-.08)<1e-5){assert.ok(Math.hypot(feet[i][0]-prev[i][0],feet[i][2]-prev[i][2])<.003);contacts++;}
    prev=feet;
  }
  assert.ok(contacts>100);
});


test('jack turning steps lift one foot while the other stays fixed in world space', () => {
  const { Crew,Arrival,draws }=load(), cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  for(const [dir,start,end] of [['in',10.4,11.1],['out',1.2,1.8]]) {
    let prev=null,contact=0,lift=false;
    for(let k=0;k<=100;k++) {
      const t=start+(end-start)*k/100;draws.length=0;Crew.draw(LIV,[-3,2,-4],(dir==='in'?Arrival.pose:Arrival.poseOut)(t,cfg,true));
      const feet=[draws[80],draws[85]].map(d=>d.m);
      for(const f of feet)lift ||= f[13]>.12;
      if(prev)for(let i=0;i<2;i++)if(Math.abs(feet[i][13]-.08)<1e-5&&Math.abs(prev[i][13]-.08)<1e-5) {
        for(const j of [0,2,8,10,12,14])assert.ok(Math.abs(feet[i][j]-prev[i][j])<.0001,'grounded boot holds both its position and orientation');contact++;
      }
      prev=feet;
    }
    assert.ok(lift);assert.ok(contact>90);
  }
});


test('cover handlers crouch beside the tyres without putting knees inside them', () => {
  const { Crew,Arrival,draws }=load(), cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  for(const [dir,t] of [['in',11.2],['in',11.75],['in',12],['out',1.7],['out',2],['out',2.5]]) {
    draws.length=0;Crew.draw(LIV,[-3,2,-4],(dir==='in'?Arrival.pose:Arrival.poseOut)(t,cfg,true));
    for(let worker=0;worker<4;worker++) {
      const wx=(worker%2?-1:1)*(worker<2?.79:.76),wz=worker<2?1.7:-1.6;
      for(const part of [2,3,4,7,8,9]) {
        const {mesh,m}=draws[24+worker*13+part],p=mesh.d.pos;
        for(let k=0;k<p.length;k+=3) {
          const x=m[0]*p[k]+m[4]*p[k+1]+m[8]*p[k+2]+m[12],y=m[1]*p[k]+m[5]*p[k+1]+m[9]*p[k+2]+m[13],z=m[2]*p[k]+m[6]*p[k+1]+m[10]*p[k+2]+m[14];
          assert.ok(Math.abs(x-wx)>=.215||Math.hypot(y-.36,z-wz)>=.35,'leg geometry must remain outside tyre rubber');
        }
      }
    }
  }
});


test('covers lower outside the tyre before sliding in and withdraw before lifting', () => {
  const {Crew,Arrival,Service,draws}=load(),cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  for(const dir of ['in','out'])for(let tick=0;tick<=630;tick++) {
    const t=tick/100,p=(dir==='in'?Arrival.pose:Arrival.poseOut)(dir==='in'?t+8.4:t,cfg,true);
    const actors=Service.layout(p);draws.length=0;Crew.draw(LIV,[-3,2,-4],p);
    for(let worker=0;worker<4;worker++) {
      const a=actors[worker],wx=(worker%2?-1:1)*(worker<2?.79:.76),wz=worker<2?1.7:-1.6;
      const {mesh,m}=draws[36+worker*13];
      if(a.coverY<.8799&&a.coverY>.3701)assert.ok(Math.abs(m[12]-wx)>.45,'vertical travel stays axially outside tyre');
      if(Math.abs(m[12]-wx)<.45)assert.ok(Math.abs(m[13]-.37)<1e-6,'overlapping axial travel happens only at wheel height');
      for(let k=0;k<mesh.d.pos.length;k+=3) {
        const v=mesh.d.pos,x=m[0]*v[k]+m[4]*v[k+1]+m[8]*v[k+2]+m[12],y=m[1]*v[k]+m[5]*v[k+1]+m[9]*v[k+2]+m[13],z=m[2]*v[k]+m[6]*v[k+1]+m[10]*v[k+2]+m[14];
        assert.ok(Math.abs(x-wx)>=.215||Math.hypot(y-.36,z-wz)>=.35,'cover shell stays outside tyre rubber through the complete path');
      }
    }
  }
});

test('service cable follows both gloves and disconnects before moving; engineer types at side desk', () => {
  const {Crew,Arrival,Service,draws,meshes}=load(),cfg=Arrival.settings({enterCrew:'service',leaveCrew:'service'});
  const world=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  for(const dir of ['in','out'])for(let k=0;k<=60;k++) {
    const t=k/10,p=(dir==='in'?Arrival.pose:Arrival.poseOut)(dir==='in'?t+8.4:t,cfg,true);
    draws.length=0;Crew.draw(LIV,[-3,2,-4],p);
    const a=Service.layout(p),plug=draws[102],centre=world(plug.m,[0,0,0]);
    for(const i of [96,101]){const h=world(draws[i].m,[0,.3,0]);assert.ok(Math.abs(h[1]-centre[1])<1e-5);assert.ok(Math.abs(Math.hypot(h[0]-centre[0],h[2]-centre[2])-.22)<1e-5);}
    const end=world(draws[105].m,[0,1,0]),socket=world(plug.m,[0,0,-.08]);
    assert.ok(Math.hypot(...end.map((x,i)=>x-socket[i]))<1e-5,'hose end stays attached to connector');
    for(const i of [112,117]){const h=world(draws[i].m,[0,.3,0]);assert.ok(h[0]<-4.7&&h[0]>-5.02);assert.ok(Math.abs(h[1]-.95)<1e-5);}
    if(dir==='out'&&t>=2.5){assert.equal(a[5].connected,0);assert.equal(a[5].x,3);}
    for(const start of [90,106])for(const offset of [2,3,5,6,7,8,10,11])assert.ok(Math.abs(Math.hypot(...draws[start+offset].m.slice(4,7))-1)<.001,'support crew limb lengths remain fixed');
  }
  const station=draws[118].mesh.d.pos;assert.equal(Math.min(...station.filter((_,i)=>i%3===1)),0,'service unit has visible supports touching the floor');
  const count=meshes.length;draws.length=0;Crew.draw(LIV,[-3,2,-4],Arrival.pose(12,cfg,false));assert.equal(meshes.length,count);
  const calm=Service.layout(Arrival.pose(12,cfg,true))[6].handY;assert.equal(calm,Service.layout(Arrival.pose(13,cfg,true))[6].handY,'reduced motion holds decorative typing');
});

test('crew body export matches its Blender source; every part closed outward, sole flat, inside the triangle budget', () => {
  const digest = createHash('sha256').update(read('tools/gen/blender/crew-body.py')).digest('hex');
  assert.ok(read('js/garage/crew-draw.js').includes('Source SHA256: ' + digest),
    'regenerate: blender -b --factory-startup --python tools/gen/blender/crew-body.py -- --output-dir artifacts/crew-body --write-runtime');
  const ctx = vm.createContext({ Math, Object, Array, Number, Float32Array });
  for (const f of ['js/garage/crew-draw.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const B = vm.runInContext('GarageCrewDraw.body', ctx), c1 = [0.8, 0.1, 0.05], c2 = [0.95, 0.85, 0.1];
  let tris = 0;
  for (const name of Object.keys(B.PARTS)) {
    const d = B.build({ pos: [], nrm: [], col: [], mat: [], idx: [] }, name, c1, c2), n = d.pos.length / 3;
    const spec = B.PARTS[name], per = name === 'torso' || name === 'head' ? 1 : 2;
    tris += per * d.idx.length / 3;
    assert.ok(d.idx.every((i) => i >= 0 && i < n) && d.pos.every(Number.isFinite), name + ': valid mesh');
    for (let i = 0; i < d.nrm.length; i += 3) assert.ok(Math.abs(Math.hypot(d.nrm[i], d.nrm[i + 1], d.nrm[i + 2]) - 1) < 1e-9, name + ': unit normals');
    // Outward: every face's normal points away from its ring's axis point.
    for (let i = 0; i < d.idx.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => d.pos.slice(d.idx[i + k] * 3, d.idx[i + k] * 3 + 3));
      const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3), t = spec.axis === 'z' ? m[2] : m[1];
      const r = spec.rings.reduce((best, q) => Math.abs(q[0] - t) < Math.abs(best[0] - t) ? q : best);
      const o = spec.axis === 'z' ? [r[3], r[4], t] : [r[3], t, r[4]];
      assert.ok(nn.reduce((s, x, k) => s + x * (m[k] - o[k]), 0) > 0, `${name}: face ${i / 3} winds outward`);
    }
  }
  assert.ok(tris <= 2200, 'one figure stays inside 2200 triangles: ' + tris);
  const boot = B.build({ pos: [], nrm: [], col: [], mat: [], idx: [] }, 'boot', c1, c2);
  let minY = Infinity; for (let i = 1; i < boot.pos.length; i += 3) minY = Math.min(minY, boot.pos[i]);
  assert.ok(Math.abs(minY + 0.08) < 1e-9, 'the sole sits 0.08 m under the foot target, as the planted-boot tests assume');
});
