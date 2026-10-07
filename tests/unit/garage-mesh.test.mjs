// The bay's meshes must carry a per-vertex MATERIAL column, and it must be
// exactly one float per vertex.
//
// This is a silent-failure guard, not a style check. GLX wires the material
// attribute ONLY when `data.mat.length === vCount` (js/render/glx/glx.js) — a
// short array, a long one, or a missing one is dropped with no warning, every
// vertex falls back to the generic default `aMat = 0 = MAT.FLAT`, and
// `applyMaterial` early-outs on `mid <= 0` (js/render/glx/shaders/glsl-lit.js). The
// garage shipped that way: the whole room was untextured flat vertex colour
// while the car standing in it sampled the baked PBR arrays, and nothing said
// so. One primitive that forgets to push its ids puts it straight back, and the
// only symptom is that the room looks slightly flatter than it did.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// A recording Gfx: every createMesh call is kept so the columns can be checked.
function harness() {
  const meshes = [], draws = [];
  const gfx = {
    createMesh(data) { meshes.push(data); return { id: meshes.length }; },
    createTexMesh(data) { meshes.push(data); return { id: meshes.length, tex: true }; },
    freeMesh() {}, freeTexture() {}, createTexture() { return { id: 1 }; },
    draw(mesh, matrix) { draws.push({ mesh, matrix: Array.from(matrix) }); }, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  return { GarageScene, meshes, ctx, draws };
}

const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

test("setup turntable spins even when reduced motion is on; Home ambient stays gated", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam,
    /if \(\(home\.active \? home\.moving : setupPreviewSpin\) && !\(arriving && arriving\.active\)\) setupPreviewAz \+= dt/,
    "#carsetup SPIN is an explicit inspection control — OS reduce must not freeze it");
  assert.doesNotMatch(cam,
    /setupPreviewSpin && !reducedMotion\(\)/,
    "the turntable increment must not AND reducedMotion (Playwright + macOS Reduce motion left SPIN lit)");
  assert.match(cam, /home\.active \? home\.moving/,
    "title Home still uses home.moving (ambient && !reduced)");
});

test("garage ambient clock freezes fans and light time without a resume jump", () => {
  const { ctx } = harness();
  const clock = vm.runInContext("GarageExperience.clock(1000)", ctx);
  assert.equal(clock.step(1050, true), 1050);
  assert.equal(clock.step(2050, false), 1050);
  assert.equal(clock.step(3050, false), 1050);
  assert.equal(clock.step(3075, true), 1075);
});

test("home camera owns one reversible session and respects effective reduced motion", () => {
  const { ctx } = harness();
  const Experience = vm.runInContext("GarageExperience", ctx);
  const saved = { az: 2.1, spin: true, aim: [0, 1, 2] };
  const restored = [], views = []; let reducing = false, captures = 0;
  const home = Experience.homeSession({ capture() { captures++; return saved; },
    restore(s) { restored.push(s); }, view(v) { views.push(v); } }, () => reducing);
  assert.equal(home.begin("invalid"), false);
  assert.equal(home.begin("garage", { motion: "ambient" }), true);
  assert.equal(home.moving, true);
  reducing = true; assert.equal(home.moving, false);
  home.begin("studio", { motion: "still" });
  assert.equal(captures, 1, "changing a scene must not replace the original owner snapshot");
  assert.equal(home.moving, false); assert.equal(home.mode, "studio");
  assert.deepEqual(views, ["hero", "side"]);
  assert.equal(home.end(), true); assert.equal(restored[0], saved);
  assert.equal(home.active, false); assert.equal(home.end(), false);
});

test("selected home shots stay composed under reduced motion and restore the original camera", () => {
  const { ctx } = harness(), Experience = vm.runInContext("GarageExperience", ctx);
  const original = { az: 1.2, el: 0.4, dist: 6.8, spin: true, pan: [1, 0, 2] };
  let pose = original, snapshots = 0;
  const home = Experience.homeSession({ capture() { snapshots++; return original; },
    restore(s) { pose = s; }, view(name, shot) { pose = { name, ...shot }; } }, () => true);
  const angles = new Set();
  for (const name of ["hero", "front", "side", "rear"]) {
    assert.equal(home.begin("night", { shot: name, motion: "ambient" }), true);
    assert.equal(home.state().shot, name);
    assert.equal(home.state().motion, "still", "effective reduced motion keeps the selected shot still");
    assert.equal(home.moving, false);
    assert.equal(pose.name, name); angles.add(pose.az);
    assert.ok(pose.dist >= 6.4 && pose.dist <= 10.2, "whole-car shots keep a safe orbit distance");
    const fixed = pose; home.state(); home.state();
    assert.equal(pose, fixed, "reading state never rotates or reselects a shot");
  }
  assert.equal(angles.size, 4, "every selected view has a distinct azimuth");
  assert.equal(snapshots, 1, "changing a shot never replaces the original owner");
  home.end(); assert.equal(pose, original);
  assert.equal(Experience.homeShot("garage", "invalid").name, "hero");
  assert.equal(Experience.homeShot("studio", "invalid").name, "side");
});

test("first home framing fits the real car silhouette into the current visible pane", () => {
  const { ctx, GarageScene } = harness(), Experience = vm.runInContext("GarageExperience", ctx);
  vm.runInContext(read("js/core/mat4.js"), ctx);
  const M4 = vm.runInContext("M4", ctx), M = loadParts(), team = M.Teams.LIST[0];
  const liv = { c1: [0.9, 0.1, 0.1], c2: [1, 1, 1] };
  const mesh = M.Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, num: 1,
    parts: M.Parts.getVisualTiers({}, team) });
  const hull = GarageScene.framingHull(mesh), center = [0, 0.45, 0.245];
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const views = [
    [rect(0, 0, 1440, 900), rect(775, 307, 653, 521)],
    [rect(0, 0, 852, 393), rect(459, 155, 385, 238)],
    [rect(0, 0, 393, 852), rect(8, 440, 377, 404)],
  ];
  for (const [canvas, panel] of views) for (const name of ["hero", "front", "side", "rear"]) {
    const shot = Experience.homeShot("garage", name).pose, pane = Experience.freePane(panel, canvas);
    const fov = canvas.width < canvas.height ? 72 : shot.fov || 36, aspect = canvas.width / canvas.height;
    const fit = Experience.fitHome(hull, { ...shot, center, fov, aspect, minDist: 4.6, maxDist: shot.maxDist || 11 }, pane);
    const eye = [center[0] + Math.sin(shot.az) * fit.dist * Math.cos(shot.el),
      center[1] + fit.dist * Math.sin(shot.el), center[2] + Math.cos(shot.az) * fit.dist * Math.cos(shot.el)];
    const p = new Float32Array(16), v = new Float32Array(16), vp = new Float32Array(16);
    M4.perspectiveTo(p, fov * Math.PI / 180, aspect, 0.1, 60); p[8] = fit.shiftX; p[9] = fit.shiftY;
    M4.lookAtTo(v, eye, center, [0, 1, 0]); M4.mulTo(vp, p, v);
    for (let i = 0; i < hull.length; i += 3) {
      const x = hull[i], y = hull[i + 1], z = hull[i + 2], w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      const px = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w + 1) / 2;
      const py = (1 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w) / 2;
      assert.ok(px > pane.left && px < pane.right, `${name} ${canvas.width}x${canvas.height}: car enters menu or viewport edge`);
      assert.ok(py > pane.top && py < pane.bottom, `${name} ${canvas.width}x${canvas.height}: car enters menu or vertical edge`);
    }
    assert.ok(fit.dist <= 11 && fit.dist >= 4.6, "home fit retains bay orbit bounds");
    if (name === "front") assert.ok(eye[2] < 6.1, "front Home camera stays inside the door reveal instead of filming through a jamb");
  }
});

test("only the home photo owner can orbit the menu scene; panels and staged arrivals keep input", () => {
  const { ctx } = harness(), Experience = vm.runInContext("GarageExperience", ctx);
  assert.equal(Experience.canOrbit(false, true, true, false), true, "photo dock owns the home camera");
  assert.equal(Experience.canOrbit(false, true, false, false), false, "ordinary home background never grabs pointer input");
  assert.equal(Experience.canOrbit(false, false, true, false), false, "race photo mode is not a garage camera");
  assert.equal(Experience.canOrbit(true, false, false, false), true, "garage remains manually inspectable");
  assert.equal(Experience.canOrbit(false, true, true, true), false, "photo dock interaction cannot move the scene");
  assert.equal(Experience.canOrbit(true, false, false, true), false, "staged arrival retains its camera");
});

test("earned career facility levels add material-complete workstations", () => {
  const { ctx } = harness();
  const Experience = vm.runInContext("GarageExperience", ctx);
  const data = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const empty = { back: data() }, base = { back: data() }, advanced = { back: data() };
  Experience.buildFacility(empty, LIV, { achievements: { active: false, facility: 8, wins: 5 } });
  Experience.buildFacility(base, LIV, { achievements: { active: true, facility: 1, wins: 0 } });
  Experience.buildFacility(advanced, LIV, { achievements: { active: true, facility: 8, wins: 5 } });
  assert.equal(empty.back.pos.length, 0);
  assert.ok(advanced.back.pos.length > base.back.pos.length);
  assert.equal(advanced.back.mat.length, advanced.back.pos.length / 3);
  assert.equal(advanced.back.nrm.length, advanced.back.pos.length);
});

test("part comparison reports the fitted-to-candidate tradeoff without fitting it", () => {
  const { ctx } = harness();
  vm.runInContext(read("js/car/parts.js"), ctx);
  const Parts = vm.runInContext("Parts", ctx), Experience = vm.runInContext("GarageExperience", ctx);
  const cat = Parts.CATALOG.find((c) => c.id === "engine");
  const current = cat.options.find((o) => o.id === "performance");
  const candidate = cat.options.find((o) => o.id === "turbo");
  const parts = { engine: current.id };
  const team = { ...TEAM, stats: { speed: 80, accel: 80, cornering: 80, braking: 80 } };
  const result = Experience.compare(team, parts, cat, current, candidate, null, 780);
  assert.equal(result.cost, 20, "comparison quotes replacement difference, not full 80 cr price");
  assert.ok(result.deltas.find((d) => d.key === "speed").value > 0);
  assert.ok(result.deltas.find((d) => d.key === "accel").value < 0);
  assert.equal(parts.engine, "performance", "preview does not buy or fit the hovered option");
});

test("every garage mesh carries exactly one material id per vertex", () => {
  const { GarageScene, meshes } = harness();
  // A draw from inside the bay builds every group: the eye is at the origin, so
  // all four walls are on the inside of the cull test.
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const geo = meshes.filter((m) => m && m.pos && !m.uv);
  assert.ok(geo.length >= 5, `only ${geo.length} geometry meshes were built`);
  const bad = [];
  for (const m of geo) {
    const vCount = m.pos.length / 3;
    if (!m.mat) { bad.push(`a mesh of ${vCount} vertices has no mat column`); continue; }
    if (m.mat.length !== vCount)
      bad.push(`mat ${m.mat.length} != ${vCount} vertices — GLX drops the whole column`);
  }
  assert.deepEqual(bad, []);
});

test("no horizontal surface carries a wall-keyed material", () => {
  // The trap that cost this file its first bug. matWallLike()
  // (js/render/glx/shaders/glsl-lit.js) is true for CONCRETE / BRICK / METAL / WOOD /
  // FABRIC / ROOF / STONE / RUST, and for those the triplanar UV is
  // `(an.x > an.z ? worldZ : worldX, worldY)`. On a floor the normal is (0,1,0)
  // and worldY is constant, so the UV collapses to a 1-D function of x and the
  // material renders as streaks smeared down one axis. It LOOKS like a texture
  // bug, not like a material-id bug, which is why it needs a test rather than a
  // comment. The bay floor shipped as CONCRETE in the first draft of this very
  // change.
  // Measured as the LARGEST SINGLE horizontal triangle, not a vertex count and
  // not a sum. Every `block()` has a top and a bottom face, so a metal truss
  // member or a bollard cap trips a naive count and always will — those are
  // centimetres across and edge-on to every camera. Summing them conflates
  // "one enormous face" with "two hundred tiny ones", which is the distinction
  // that matters: streaking is only visible when the surface is big enough to
  // show the streak. 0.5 m2 lets a 0.12 m truss chord through and stops a floor
  // tile (69 m2 a triangle) dead.
  const WALL_LIKE = new Set([1, 2, 4, 5, 7, 12, 13, 14]);
  const CAP_M2 = 0.5;
  const { GarageScene, meshes } = harness();
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  let worst = 0, worstMid = 0, total = 0;
  for (const m of meshes) {
    if (!m || !m.mat || !m.nrm || !m.idx) continue;
    const byMid = new Map();
    for (let t = 0; t < m.idx.length; t += 3) {
      const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
      if (!WALL_LIKE.has(m.mat[a])) continue;
      if (Math.abs(m.nrm[a * 3 + 1]) < 0.98) continue;          // not a horizontal face
      const P = (i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
      const p = P(a), q = P(b), r = P(c);
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const area = 0.5 * Math.hypot(n[0], n[1], n[2]);
      if (area > (byMid.get(m.mat[a]) || 0)) byMid.set(m.mat[a], area);
      total += area;
    }
    for (const [mid, area] of byMid) if (area > worst) { worst = area; worstMid = mid; }
  }
  assert.ok(worst <= CAP_M2,
    `a single ${worst.toFixed(2)} m2 horizontal face carries wall-keyed MAT ${worstMid} ` +
    `(${total.toFixed(2)} m2 of such faces across the bay). A wall-like id on a floor keys its UV off ` +
    `world Y, which is constant there — it renders as streaks, not as the material.`);
});

test("the big surfaces are not left on MAT.FLAT", () => {
  // The point of the column is the FLOOR, the WALLS and the PIT LANE — 138 + 143
  // + 114 m2 of the room. A mesh that carries a correctly sized column of all
  // zeroes passes the test above and changes nothing on screen, which is the
  // failure this second assertion exists to catch.
  const { GarageScene, meshes } = harness();
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const geo = meshes.filter((m) => m && m.pos && !m.uv && m.mat);
  const painted = geo.filter((m) => m.mat.some((v) => v > 0));
  assert.ok(painted.length >= 2,
    `${painted.length} of ${geo.length} garage meshes set any material id — the ` +
    `column is present but every vertex still reads FLAT`);
  const ids = new Set();
  for (const m of geo) for (const v of m.mat) if (v > 0) ids.add(v);
  const MAT = vm.runInContext("TrackGeom.MAT", harness().ctx);
  for (const want of ["CONCRETE", "ASPHALT", "METAL"])
    assert.ok(ids.has(MAT[want]), `no garage surface is MAT.${want}`);
});

test("preview hulls are dropped when their mesh LRU slot is evicted", () => {
  const scene = read("js/garage/scene.js");
  assert.match(scene, /hullKey/);
  assert.match(scene, /previewHulls\.delete\(victim\.hullKey\)/);
  // dropPreviewMeshes keeps the hulls: a cap, sparing live meshes' hulls, bounds them.
  assert.match(scene, /if \(previewHulls\.size > HULL_SLOTS\)/);
  assert.match(scene, /if \(!live\.has\(k\)\) previewHulls\.delete\(k\);/);
});

// The engineers' traces re-upload the live atlas every 1.5 s. The catch around
// that used to set a module-level
// latch 31 years out, log nothing, and keep the freed handle — so one throw from
// createTexture froze the traces for the page load and stayed invisible to Log.
// Keep the old handle while trying the replacement so a later tick can retry.
test("a failed trace upload preserves its decal and retries after recovery", () => {
  // Any 2D-context call returns the context itself; any numeric read is 0.
  const c2d = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : c2d),
    set: () => true, apply: () => c2d,
  });
  let now = 0, failNext = false, nTex = 0;
  const freed = new Set(), drawnFreed = [], warns = [];
  const gfx = {
    createMesh: () => ({}), createTexMesh: () => ({ tex: true }), freeMesh() {},
    createTexture() { if (failNext) throw new Error("context lost"); return { tex: ++nTex }; },
    freeTexture(t) { freed.add(t); },
    draw() {}, drawGlow() {},
    drawDecal(_m, _x, t) { if (freed.has(t)) drawnFreed.push(t); },
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    performance: { now: () => now },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) },
    LiveryTex: {},
    Log: { info() {}, warn: (_t, m) => warns.push(m), error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);

  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  assert.ok(nTex >= 1, "the live atlas was never created — the harness no longer reaches the trace path");
  assert.equal(warns.filter((m) => /live trace/.test(m)).length, 0);
  const freedBeforeFailure = freed.size;

  failNext = true;
  now = 2000;
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  assert.equal(warns.filter((m) => /live trace failed: context lost/.test(m)).length, 1,
    `the failure must reach Log; warned: ${JSON.stringify(warns)}`);
  assert.equal(freed.size, freedBeforeFailure, "a failed replacement should preserve the old atlas");
  assert.deepEqual(drawnFreed, [], "a decal drew a texture handle that had been freed");
  failNext = false;
  now = 4000;
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  assert.ok(freed.size > freedBeforeFailure, "a successful replacement should retire the old atlas");
  assert.deepEqual(drawnFreed, [], "a decal drew a texture handle that had been freed");
});

test("garage dress upload retries after a transient failure, and a new team clears its cutoff", () => {
  const c2d = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : c2d),
    set: () => true, apply: () => c2d,
  });
  let now = 0, failures = 1, attempts = 0;
  const gfx = {
    createMesh: () => ({}), createTexMesh: () => ({}), freeMesh() {}, freeTexture() {},
    createTexture(src) {
      if (src.width === 1024) {
        attempts++;
        if (failures-- > 0) throw new Error("injected dress upload failure");
      }
      return { tex: attempts };
    },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    performance: { now: () => now },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) },
    LiveryTex: {},
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const garage = vm.runInContext("GarageScene", ctx);
  garage.init(gfx);
  const draw = (team = TEAM) => garage.draw(team, LIV, [0, 1.6, 0], null, 0);
  draw();
  assert.equal(attempts, 1);
  now = 500; draw();
  assert.equal(attempts, 1, "retry must be bounded in a per-frame draw loop");
  now = 1100; draw();
  assert.equal(attempts, 2, "a transient upload failure should recover on the same team");
  failures = 4;
  const broken = { ...TEAM, id: "broken" };
  for (let i = 0; i < 3; i++) {
    now += 1100;
    draw(broken);
  }
  const before = attempts;
  now += 1100;
  draw(broken);
  assert.equal(attempts, before, "three failures stop retries for the same team");
  draw({ ...TEAM, id: "recovered" });
  assert.equal(attempts, before + 1, "a new team clears the previous upload cutoff");
});

test("arrival moves the reflected car and shutter without rebuilding geometry", () => {
  const { GarageScene, meshes, draws } = harness();
  const car = { car: true }, mat = new Float32Array([-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,9,1]);
  GarageScene.draw(TEAM, LIV, [-3.8,2,-4.8], null, 0, null, car, { door: 0 }, mat);
  const count = meshes.length;
  assert.equal(draws.find(d => d.mesh === car).matrix[14], 9);
  const closed = draws.find(d => d.matrix[5] > 1.5);
  assert.ok(closed, "closed shutter spans the opening");
  draws.length = 0; mat[14] = 0;
  GarageScene.draw(TEAM, LIV, [4.1,2.25,-4.9], null, 0, null, car, { door: 1 }, mat);
  assert.equal(meshes.length, count, "animation reuses meshes");
  assert.equal(draws.find(d => d.mesh === car).matrix[14], 0);
  assert.ok(draws.find(d => d.mesh === closed.mesh).matrix[5] < 0.03);
  draws.length = 0;
  GarageScene.draw(TEAM, LIV, [0,2,0], null, 0, null, car);
  assert.equal(draws.find(d => d.mesh === closed.mesh).matrix[5], 1, "normal garage resets shutter");
});

test("garage glare and fixture energy stay under the bloom knee at default knobs", () => {
  const scene = read("js/garage/scene.js");
  const glare = /const GLARE_STR = ([0-9.]+);/.exec(scene);
  assert.ok(glare, "GLARE_STR must stay a named constant");
  assert.ok(Number(glare[1]) <= 0.10,
    `GLARE_STR ${glare[1]} is a showroom halo, not the old 0.18 wash`);
  const keys = [...scene.matchAll(/KEY_TINT, 15\.0, 11, 0, -1, 0,\s+0\.72, 0\.28, 0\.10, ([0-9.]+), 1\]/g)];
  assert.equal(keys.length, 2, "both key fixtures must still be in the table");
  for (const m of keys) {
    assert.ok(Number(m[1]) <= 0.55, `key glareW ${m[1]} must not sit at the old 1.1`);
  }
  assert.match(scene, /-s \* 0\.26, 0\.97, 0, 0\.90, 0\.55, 0\.05, 0, 0\.1[0-5]\);/,
    "floor uplights keep a small glareW, not the old 0.5");
  assert.match(scene, /const LED_OPTS = \{ emissive: 0\.[4567]/,
    "LED faces stay lit without an HDR 1.0 push over the bloom threshold");
  assert.match(scene, /const MIRROR_OPTS = \{ alpha: 0\.26/,
    "floor reflection is the accepted planar ghost (alpha 0.26)");
  assert.match(scene, /noDepthTest:\s*true/,
    "ghost draws after the floor with no depth test so the slab cannot hide it");
  assert.doesNotMatch(scene, /MIRROR_RESOLVE|mirrorSheen|ensureMirrorFade/,
    "#1025 opaque+fade path hid the contact reflection on the live bay");
});

test("floor reflection draws after the floor and before the room", () => {
  const { GarageScene, draws } = harness();
  const car = { car: true };
  GarageScene.draw(TEAM, LIV, [0, 1.4, 3.2], null, 0, null, car);
  const carAt = draws.findIndex((d) => d.mesh === car);
  assert.ok(carAt >= 0, "mirrored car is drawn");
  // Floor is draw 0; the ghost must precede shell/props so they paint over it.
  assert.equal(carAt, 1, `reflection at draw ${carAt} should be immediately after the floor`);
  const scene = read("js/garage/scene.js");
  assert.match(scene, /_gfx\.draw\(carMesh, arrivalMirror, MIRROR_OPTS\)/,
    "ghost uses MIRROR_OPTS (noDepthTest + alpha)");
});

test("TOP hides the roof truss and ceiling LED housings; other presets restore them", () => {
  const { GarageScene, draws } = harness();
  const eye = [0, 11, 0];
  const countAt = (name) => {
    draws.length = 0;
    GarageScene.spot(name);
    GarageScene.draw(TEAM, LIV, eye, null, 0);
    return draws.length;
  };
  const hero = countAt("hero");
  const top = countAt("top");
  const rear = countAt("rear");
  assert.equal(top, hero - 2, `TOP should skip truss + ceiling LEDs (hero ${hero}, top ${top})`);
  assert.equal(rear, hero, "leaving TOP must restore the roof meshes");
  GarageScene.spot("top");
  const rig = GarageScene.live(LIV, 0, { spin: false });
  assert.equal(rig[14], 0, "TOP must drop the first fixture's glare with its housing");
  GarageScene.spot("hero");
  const restored = GarageScene.live(LIV, 0, { spin: false });
  assert.ok(restored[14] > 0, "leaving TOP must restore fixture glare");
});

test("buildStatic still emits the roof truss for the trackside pit row", () => {
  // SceneryPits places GarageScene.buildStatic({props:"lite"}) once per team.
  // Extracting buildTruss from buildShell for the TOP hide must not drop those
  // beams from the baked bay — 84 tris × 12 teams = the 1008 monaco/monza
  // STRIP shortfall on tip 63f209fc4.
  const { GarageScene } = harness();
  const bay = GarageScene.buildStatic(LIV, { props: "lite" });
  assert.equal(bay.idx.length, 12318,
    "lite bay keeps the 7-block roof truss (252 idx) that buildShell used to carry");
});

test("pit kit stays off the FRONT and REAR sight lines", () => {
  const eq = read("js/garage/scene-equipment.js");
  assert.doesNotMatch(eq, /\[-0\.18, 0\.40, -2\.72\]/,
    "starter umbilical must not run into the gearbox across the REAR preset");
  assert.doesNotMatch(eq, /block\(g\.mid, 1\.45, 0\.13, -3\.35/,
    "rear jack must leave the REAR corridor");
  const guns = /const gx = sd \* ([0-9.]+);/.exec(eq);
  assert.ok(guns, "wheel guns still have a shared lateral");
  assert.ok(Number(guns[1]) >= 2.45, `guns at |x|=${guns[1]} still sit in the FRONT/REAR corridor`);
  const props = read("js/garage/scene.js");
  assert.match(props, /block\(g\.mid, 2\.85, 0\.12, 4\.55/,
    "full-bay front jack sits outboard of the FRONT corridor");
  assert.match(props, /block\(g\.mid, 1\.55, 0\.12, 4\.35, 0\.55, 0\.05, 0\.12, scale\(STEEL, 0\.8\)\);   \/\/ the front jack, beside the nose/,
    "trackside lite bay keeps its own front jack (pit-complex vertex pin)");
});

test("garage orbit path reuses lampAim, chase buffer, and boardInfo cache", () => {
  // Per-frame alloc cuts for title↔garage / orbit (perf(garage)): live() must
  // not mint a new lampAim array, pulse must not rig.slice(), and boardInfo
  // must short-circuit on an unchanged stamp so draw()'s early-return rebuild
  // does not re-run Parts.resolveSetup every frame.
  const src = read("js/garage/scene.js");
  assert.match(src, /const lampAim = \[/, "lampAim is a module scratch, not let");
  assert.match(src, /lampAim\[0\] = lx/, "live() writes lampAim in place");
  assert.doesNotMatch(src, /lampAim = \[lx/, "live() must not allocate a new lampAim");
  assert.match(src, /const _chase = \[\]/, "pulse chase buffer is reused");
  assert.match(src, /const chase = _chase/, "pulse copies into _chase");
  assert.doesNotMatch(src, /chase = rig\.slice/, "no per-pulse chase = rig.slice");
  assert.match(src, /_boardInfo && stamp === _boardInfoKey/, "boardInfo is stamped-cached");
  assert.match(src, /const inside = _inside/, "wall culling flags reuse _inside");
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /const lightsRig = GarageScene\.live/, "live() once per garage frame");
  assert.match(cam, /gfx\.drawGlow\(lightsRig,/, "drawGlow reuses the same lightsRig");
  assert.match(cam, /const eye = _spEye/, "orbit eye vector is a scratch");
  assert.match(cam, /Object\.setPrototypeOf\(_presentTune/, "presentOpts avoids Object.create");
  assert.match(cam, /const ctx = _garageCtx/, "garageCtx mutates one object");
});

test("the LEGENDS bay rebuilds when the legend changes, even on the same paint", () => {
  // The Legends row keeps team id "legends" across all twelve legends, and two
  // tribute liveries can share every colour (Schumacher's and Senna's reds):
  // keyed on id + paint, the wall kept the previous legend's crest — a Ferrari
  // horse over Senna (garage-angles, 2026-10-01).
  const { GarageScene } = harness();
  const row = (legend) => ({ id: "legends", legends: true, legend, name: "Legends", short: "LGD", drivers: TEAM.drivers });
  GarageScene.draw(row("schumacher"), LIV, [0, 1.6, 0], null, 0);
  const a = GarageScene.debug().geomKey;
  GarageScene.draw(row("senna"), LIV, [0, 1.6, 0], null, 0);
  assert.notEqual(GarageScene.debug().geomKey, a, "a new legend is a new bay");
});
