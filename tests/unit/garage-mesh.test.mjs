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
import { absSrc } from "../helpers/abs-src.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

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
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
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
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
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
  vm.runInContext(read("js/car/parts.js"), ctx, { filename: absSrc("js/car/parts.js") });
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
function liveAtlasHarness(isMobile = true) {
  let now = 10000, tracePaints = 0, failTrace = false;
  const uploads = [], warns = [];
  const c2d = new Proxy(function () {}, {
    get: (_, k) => k === Symbol.toPrimitive ? () => 0 : k === "fillText"
      ? (text) => { if (text === "ERS SOC") { tracePaints++; if (failTrace) throw new Error("trace paint failed"); } } : c2d,
    set: () => true, apply: () => c2d,
  });
  const gfx = {
    isMobile, createMesh: () => ({}), createTexMesh: () => ({}),
    freeMesh() {}, freeTexture() {}, draw() {}, drawGlow() {}, drawDecal() {},
    createTexture(src) { uploads.push({ width: src.width, tracePaints }); return {}; },
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    performance: { now: () => now }, LiveryTex: {},
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) },
    Log: { info() {}, warn: (_t, m) => warns.push(m), error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const scene = vm.runInContext("GarageScene", ctx);
  scene.init(gfx);
  return { scene, uploads, warns, gfx, wall(t) { now = t; }, failTrace(on) { failTrace = on; },
    draw(sceneNow, extra = {}, liv = LIV) { scene.draw(TEAM, liv, [0, 1.6, 0], null, 0, { sceneNow, ambient: true, ...extra }); },
    liveUploads() { return uploads.filter((u) => u.width === 512); }, tracePaints: () => tracePaints };
}

test("garage combines the initial trace with one live upload and keeps phone and desktop scene-clock cadence", () => {
  for (const [mobile, cadence] of [[true, 4000], [false, 1500]]) {
    const h = liveAtlasHarness(mobile);
    h.draw(100);
    assert.deepEqual(h.liveUploads(), [{ width: 512, tracePaints: 1 }], "the first upload must already contain its trace");
    h.wall(90000); h.draw(100);
    h.draw(100 + cadence);
    assert.equal(h.liveUploads().length, 1, `wall time or the exact ${cadence} ms boundary must not trigger a second upload`);
    h.draw(101 + cadence);
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 2]);
    h.draw(102 + 2 * cadence, {}, { ...LIV, c1: [0.8, 0.4, 0.1] });
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 2, 3], "a repaint on an expired trace tick must still upload once");
    h.scene.release(); h.draw(200 + 2 * cadence);
    assert.equal(h.liveUploads().length, 4, "a new garage session must also combine its first upload");
    assert.deepEqual(h.warns, []);
  }
});

test("still and studio garages keep traces inactive until ambient room rendering resumes", () => {
  for (const extra of [{ ambient: false }, { studio: true }]) {
    const h = liveAtlasHarness();
    h.draw(100, extra);
    assert.deepEqual(h.liveUploads(), [{ width: 512, tracePaints: 0 }]);
    h.draw(101);
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [0, 1]);
    h.draw(102);
    assert.equal(h.liveUploads().length, 2);
  }
});

test("a prebuilt trace refreshes once when the visible garage scene clock rewinds", () => {
  for (const [mobile, cadence] of [[true, 4000], [false, 1500]]) {
    const h = liveAtlasHarness(mobile);
    h.scene.prepare(TEAM, LIV, null, 0, { sceneNow: 9000, ambient: true });
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1]);
    h.draw(1000);
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 2], "a held earlier clock must replace the future trace");
    h.draw(1000); h.draw(1000 + cadence);
    assert.equal(h.liveUploads().length, 2, "the rewind refresh restarts the ordinary device cadence");
    h.draw(1001 + cadence);
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 2, 3]);
  }
});

test("three failed trace paints stop retries until a released garage is rebuilt", () => {
  for (const [mobile, cadence] of [[true, 4000], [false, 1500]]) {
    const h = liveAtlasHarness(mobile);
    h.failTrace(true);
    for (let i = 0; i < 3; i++) h.draw(100 + i * (cadence + 1));
    assert.equal(h.tracePaints(), 3, "the initial trace failure counts toward the three-strike cutoff");
    assert.equal(h.warns.length, 3);
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1], "failed trace repaints keep the original atlas");
    h.failTrace(false);
    h.draw(100 + 3 * (cadence + 1)); h.draw(100 + 4 * (cadence + 1));
    assert.equal(h.tracePaints(), 3, "the cutoff holds even when painting could recover");
    assert.equal(h.warns.length, 3);
    h.scene.release(); h.draw(100 + 5 * (cadence + 1));
    assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 4], "a rebuilt garage rearms trace painting and combines its first upload");
    assert.equal(h.warns.length, 3);
  }
});

test("a first trace paint failure preserves the live atlas and retries on its next tick", () => {
  const h = liveAtlasHarness();
  h.failTrace(true); h.draw(100);
  assert.equal(h.liveUploads().length, 1, "the rest of the live atlas must still upload");
  assert.match(h.warns[0], /live trace failed: trace paint failed/);
  assert.equal(h.warns.length, 1, "the failing trace must not be attempted twice in one frame");
  h.failTrace(false); h.draw(4101);
  assert.deepEqual(h.liveUploads().map((u) => u.tracePaints), [1, 2]);
});

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
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
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

// The trace tick (js/garage/scene.js) re-fills its live atlas in place where the backend can (TLX
// refillTexture): one texture for the visit, not a create + free every 1.5 s. A backend without it keeps
// the create path, and a refused refill (size change) falls back to it.
test("the trace tick re-fills the live atlas in place: no texture created after the first", () => {
  const c2d = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : c2d),
    set: () => true, apply: () => c2d,
  });
  let now = 0, refuse = false;
  const made = [], freed = [], refills = [];
  const gfx = {
    createMesh: () => ({}), createTexMesh: () => ({ tex: true }), freeMesh() {},
    createTexture(src) { const h = { tex: made.length + 1, w: src.width }; made.push(h); return h; },
    refillTexture(h, src) { if (refuse) return false; refills.push({ h, src }); return true; },
    freeTexture(t) { freed.push(t); },
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
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const before = made.length;
  assert.ok(before >= 1, "the live atlas was never created — the harness no longer reaches the trace path");
  const freedBefore = freed.length;
  for (let i = 1; i <= 8; i++) { now = i * 1600; GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0); }
  assert.equal(made.length, before, `eight trace ticks created ${made.length - before} textures (they used to create one each)`);
  assert.equal(refills.length, 8, "each tick re-fills the live handle");
  assert.equal(freed.length, freedBefore, "the live handle is kept, not freed");
  refuse = true;   // a refused refill (e.g. a size change) falls back to a fresh upload and retires the old handle
  now = 9 * 1600; GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  assert.equal(made.length, before + 1);
  assert.equal(freed.length, freedBefore + 1);
});

// A paint edit repaints the bay dress (1024²) and live (512²) atlases. Free-then-create leaned on TLX's retire
// pool, and a handle retired before its first draw came back without a GPU texture (garage-livery-churn flake,
// #3505): with refillTexture the same handles are re-filled and nothing is allocated or freed.
test("a paint edit re-fills the bay dress and live atlases in place: no texture created or freed", () => {
  const c2d = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : c2d),
    set: () => true, apply: () => c2d,
  });
  const made = [], freed = [], refills = [];
  const gfx = {
    createMesh: () => ({}), createTexMesh: () => ({ tex: true }), freeMesh() {},
    createTexture(src) { const h = { tex: made.length + 1, w: src.width }; made.push(h); return h; },
    refillTexture(h, src) { refills.push({ h, w: src.width }); return true; },
    freeTexture(t) { freed.push(t); },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    performance: { now: () => 0 },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) },
    LiveryTex: {},
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const garage = vm.runInContext("GarageScene", ctx);
  garage.init(gfx);
  garage.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  assert.deepEqual(made.map((h) => h.w).sort((a, b) => a - b), [512, 1024], "warm-up creates one live and one dress atlas");
  for (let i = 1; i <= 4; i++) garage.draw(TEAM, { ...LIV, c1: [0.1 * i, 0.3, 0.6] }, [0, 1.6, 0], null, 0);
  assert.equal(made.length, 2, "paint edits created textures");
  assert.equal(freed.length, 0, "paint edits freed textures");
  assert.ok(refills.some((r) => r.w === 1024) && refills.some((r) => r.w === 512), "both atlases were re-filled");
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
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
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
  assert.match(scene, /const MIRROR_RESOLVE = \{ alpha: 1/,
    "floor reflection depth-resolves (opaque + depth bias)");
  assert.match(scene, /mirrorSheen\(/, "contact sheen scales with camera distance");
  assert.match(scene, /ensureMirrorFade/, "bay fade quad restores floor sheen");
  assert.doesNotMatch(scene, /MIRROR_OPTS.*noDepthTest/,
    "noDepthTest ghost smeared a duplicate car under the floor slab");
});

test("floor reflection draws after the room so depth clips the mirror", () => {
  const { GarageScene, draws } = harness();
  const car = { car: true };
  GarageScene.draw(TEAM, LIV, [0, 1.4, 3.2], null, 0, null, car);
  const carAt = draws.findIndex((d) => d.mesh === car);
  assert.ok(carAt >= 0, "mirrored car is drawn");
  assert.ok(carAt > 1, `reflection at ${carAt} must follow the room (floor is draw 0)`);
  const scene = read("js/garage/scene.js");
  assert.match(scene, /_gfx\.draw\(carMesh, arrivalMirror, MIRROR_RESOLVE\)/,
    "mirror uses MIRROR_RESOLVE (depth bias, no noDepthTest)");
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
  assert.match(read("js/garage/scene-dress.js"), /_boardInfo && stamp === _boardInfoKey/, "boardInfo is stamped-cached");
  assert.match(src, /const inside = _inside/, "wall culling flags reuse _inside");
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /const lightsRig = GarageScene\.live/, "live() once per garage frame");
  assert.match(cam, /gfx\.drawGlow\(lightsRig,/, "drawGlow reuses the same lightsRig");
  assert.match(cam, /const eye = _spEye/, "orbit eye vector is a scratch");
  assert.match(cam, /Object\.setPrototypeOf\(_presentTune/, "presentOpts avoids Object.create");
  assert.match(cam, /const ctx = _garageCtx/, "garageCtx mutates one object");
});

test("logo, sponsor and number edits repaint atlases and leave the bay meshes", () => {
  const { GarageScene, meshes } = harness();
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const n = meshes.length;
  const g = GarageScene.debug().geomKey;
  assert.ok(n > 0, "the bay built meshes");
  GarageScene.draw(TEAM, { ...LIV, logo: [1, 0, 0], logo2: [0, 0, 1], logo3: [0, 1, 0], sponsors: "clean" }, [0, 1.6, 0], null, 0);
  assert.equal(GarageScene.debug().geomKey, g, "crest and sponsor pixels are not a new shell");
  assert.equal(meshes.length, n, "a logo drag must not rebuild the bay");
  const numbered = { ...TEAM, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] };
  GarageScene.draw(numbered, LIV, [0, 1.6, 0], null, 0);
  assert.equal(GarageScene.debug().geomKey, g, "driver numbers live on the board, not in the shell");
  assert.equal(meshes.length, n);
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, { weather: "wet" });
  assert.notEqual(GarageScene.debug().geomKey, g, "wet equipment is real geometry");
  assert.ok(meshes.length > n, "weather still rebuilds the bay");
  const wetN = meshes.length;
  GarageScene.draw(TEAM, { ...LIV, c1: [0.1, 0.2, 0.9] }, [0, 1.6, 0], null, 0);
  assert.ok(meshes.length > wetN, "body colour is vertex paint and must rebuild");
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

test("equipment props stay grounded, inside their parking envelopes and material-complete", () => {
  const { ctx } = harness();
  const equipment = vm.runInContext("GarageEquipment", ctx);
  for (const [name, build, limit, bounds] of [
    ["cart", out => equipment.starterCart(out, 0, 0, LIV.c1), 650, [[-0.58, 0, -0.28], [0.78, 0.98, 0.45]]],
    ["trolley", out => equipment.tyreTrolley(out, 0, 0, [0, 0, 1, 1], LIV.c1), 1450, [[-0.46, 0, -1.37], [0.46, 0.98, 1.58]]],
  ]) {
    const mesh = { pos: [], nrm: [], col: [], idx: [], mat: [] };
    build(mesh);
    assert.ok(mesh.idx.length / 3 <= limit, `${name} triangle budget`);
    assert.equal(mesh.mat.length, mesh.pos.length / 3);
    assert.equal(mesh.nrm.length, mesh.pos.length);
    assert.equal(mesh.col.length, mesh.pos.length);
    assert.ok([...mesh.pos, ...mesh.nrm, ...mesh.col].every(Number.isFinite));
    assert.ok(mesh.idx.every(i => Number.isInteger(i) && i >= 0 && i < mesh.pos.length / 3));
    for (let axis = 0; axis < 3; axis++) {
      const values = mesh.pos.filter((_, i) => i % 3 === axis);
      assert.ok(Math.min(...values) >= bounds[0][axis] - 1e-6, `${name} min axis ${axis}`);
      assert.ok(Math.max(...values) <= bounds[1][axis] + 1e-6, `${name} max axis ${axis}`);
      if (axis === 1) assert.ok(Math.abs(Math.min(...values)) < 1e-6, `${name} touches floor`);
    }
    // A caster's rubber end caps must face along X, never vertically like a floor puck.
    const capNormals = mesh.nrm.filter((_, i) => i % 3 === 0 && mesh.pos[i + 1] < 0.13 &&
      mesh.col[i] === equipment.RUBBER[0] && Math.abs(mesh.nrm[i]) > 0.99);
    assert.ok(capNormals.length >= 4 * 16, `${name} has four horizontal wheel axles`);
  }
});

test("parked trolley compound labels still follow dry and wet garage context", () => {
  const { ctx } = harness(), equipment = vm.runInContext("GarageEquipment", ctx);
  for (const [weather, expected] of [["dry", [3, 3, 2, 0, 0]], ["rain", [0, 2, 0, 3, 3]], ["wet", [0, 2, 0, 3, 3]]]) {
    const empty = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [] });
    const groups = { mid: empty(), back: empty(), nx: empty(), px: empty() };
    equipment.build(groups, LIV, { weather });
    for (let compound = 0; compound < 5; compound++) {
      const color = equipment.COMPOUND[compound];
      let vertices = 0;
      for (let i = 0; i < groups.back.col.length; i += 3)
        if (color.every((v, axis) => Math.abs(groups.back.col[i + axis] - v) < 1e-9)) vertices++;
      assert.equal(vertices, expected[compound] * 24, `${weather} compound ${compound}`);
    }
  }
});

// Geometry budgets and parking envelopes, in metres. Mounted/handheld models
// need finite, valid geometry; rolling fixtures must also touch the floor.
test("workshop models keep their geometry budgets and parking envelopes", async (t) => {
  const { ctx } = harness();
  const kit = vm.runInContext("GarageEquipment", ctx);
  for (const [name, build, budget, halfX, halfZ, top, floor] of [
    ["noseTrolley", out => kit.noseTrolley(out, 0, 0, LIV.c1), 900, 0.47, 0.64, 0.98, true],
    ["wheelGunDock", out => kit.wheelGunDock(out, 0, 0, LIV.c1), 430, 0.23, 0.29, 1.02, true],
    ["radioRack", out => kit.radioRack(out, 0, 0, LIV.c1, 0), 500, 0.18, 0.39, 0.50, true],
    ["toolChest", out => kit.toolChest(out, 0, 0, LIV.c1), 500, 0.42, 0.85, 1.26, true],
    ["rearJack", out => kit.rearJack(out, 0, 0, LIV.c1), 300, 0.95, 1.08, 0.68, true],
    ["wheelGun", out => kit.wheelGun(out, 0, 0, 1, 1, LIV.c1), 150, 0.14, 0.32, 0.20, false],
    ["hoseReel", out => kit.hoseReel(out, 0, 0.21, 0, LIV.c1), 220, 0.17, 0.23, 0.51, false],
    ["wingRack", out => kit.wingRack(out, 0, 0, 1, LIV.c1), 380, 0.45, 0.99, 1.21, true],
    ["extinguisher", out => kit.extinguisher(out, 0, 0, 1), 230, 0.21, 0.12, 0.85, false],
    ["rollingStool", out => kit.rollingStool(out, 0, 0, LIV.c1), 580, 0.28, 0.27, 0.60, true],
    ["floorFan", out => kit.floorFan(out, 0, 0, LIV.c1), 700, 0.26, 0.31, 0.64, true],
    ["serviceRig", out => kit.serviceRig(out, 0, 0, LIV.c1), 700, 0.50, 0.40, 1.76, true],
    ["wheelDolly", out => kit.wheelDolly(out, 0, 0, LIV.c1), 480, 0.57, 0.31, 0.68, true],
  ]) await t.test(name, () => {
    const mesh = { pos: [], nrm: [], col: [], idx: [], mat: [] };
    build(mesh);
    const count = mesh.pos.length / 3;
    assert.ok(mesh.idx.length > 0 && mesh.idx.length / 3 <= budget);
    assert.equal(mesh.mat.length, count); assert.equal(mesh.nrm.length, mesh.pos.length);
    assert.equal(mesh.col.length, mesh.pos.length);
    assert.ok([...mesh.pos, ...mesh.col, ...mesh.nrm, ...mesh.mat].every(Number.isFinite));
    assert.ok(mesh.idx.every(i => Number.isInteger(i) && i >= 0 && i < count));
    for (let i = 0; i < mesh.nrm.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.nrm.slice(i, i + 3)) - 1) < 1e-6, "unit normal");
    for (let i = 0; i < mesh.pos.length; i += 3) {
      assert.ok(Math.abs(mesh.pos[i]) <= halfX + 1e-6, "lateral envelope");
      assert.ok(Math.abs(mesh.pos[i + 2]) <= halfZ + 1e-6, "depth envelope");
      assert.ok(mesh.pos[i + 1] >= -1e-6 && mesh.pos[i + 1] <= top + 1e-6, "height envelope");
    }
    if (floor) assert.ok(Math.abs(Math.min(...mesh.pos.filter((_, i) => i % 3 === 1))) < 1e-6, "floor contact");
  });
});

test("full workshop routes detailed models to the existing wall batches and leaves tyre access clear", () => {
  const { ctx, GarageScene } = harness(), kit = vm.runInContext("GarageEquipment", ctx), calls = [];
  for (const name of ["toolChest", "noseTrolley", "wheelGunDock", "radioRack", "wingRack", "extinguisher", "rollingStool", "floorFan", "serviceRig", "wheelDolly", "wheelGun", "hoseReel"]) {
    const build = kit[name];
    kit[name] = (out, ...args) => {
      const start = out.pos.length; build(out, ...args);
      const pos = out.pos.slice(start);
      calls.push({ name, out, args, min: [0, 1, 2].map(a => Math.min(...pos.filter((_, i) => i % 3 === a))),
        max: [0, 1, 2].map(a => Math.max(...pos.filter((_, i) => i % 3 === a))) });
    };
  }
  const bay = GarageScene.buildStatic(LIV, { props: true, equipment: true });
  assert.ok(bay.idx.length / 3 <= 18000, "full static bay geometry budget");
  assert.equal(calls.filter(c => c.name === "toolChest").length, 1, "repeated storage pays for distinct stations");
  assert.equal(calls.filter(c => c.name === "wheelGun").length, 1, "a mounted spare complements the service dock");
  assert.equal(calls.filter(c => c.name === "hoseReel").length, 2, "mounted reels share the detailed model");
  const chestTop = Math.max(...calls.filter(c => c.name === "toolChest").map(c => c.max[1]));
  assert.ok(calls.filter(c => c.name === "wheelGun").every(c => c.min[1] > chestTop + 0.08), "wall guns clear worktops");
  const dolly = calls.find(c => c.name === "wheelDolly"), rack = calls.find(c => c.name === "wingRack" && c.args[0] > 0);
  const rig = calls.find(c => c.name === "serviceRig"), fan = calls.find(c => c.name === "floorFan");
  assert.equal(dolly.out, rack.out); assert.equal(dolly.out, rig.out, "right-wall batching retained");
  assert.ok(dolly.min[2] - rack.max[2] >= 0.025, "dolly clears the wing-rack feet");
  assert.ok(dolly.max[2] <= 4.24 - 0.025, "dolly clears the spare-tyre envelope");
  assert.ok(fan.max[1] <= 0.64 + 1e-6, "vertical fan stays below the information-board sill");
  assert.ok(fan.min[0] < -3.6 && rig.min[0] > 3.6, "workshop stays outboard of car framing");
  for (const name of ["noseTrolley", "wheelGunDock", "radioRack"])
    assert.equal(calls.filter(c => c.name === name).length, 1, `${name} is present in the actual detailed bay`);
  const nose = calls.find(c => c.name === "noseTrolley"), dock = calls.find(c => c.name === "wheelGunDock");
  const radios = calls.find(c => c.name === "radioRack"), chest = calls.find(c => c.name === "toolChest");
  assert.equal(nose.out, rack.out); assert.equal(dock.out, rack.out);
  assert.ok(nose.min[0] > 4 && dock.min[0] > 4, "new floor stations leave the car corridor clear");
  assert.ok(rack.min[2] - nose.max[2] > 0.5, "nose trolley clears wing-rack feet");
  assert.ok(nose.min[2] - dock.max[2] > 0.5, "service stations do not clip each other");
  assert.equal(radios.out, chest.out, "radio rack shares its supporting chest's wall batch");
  assert.ok(Math.abs(radios.min[1] - 1.19) < 1e-6, "radio rack rests on the chest's worktop");
  for (const axis of [0, 2]) {
    assert.ok(radios.min[axis] > chest.min[axis] && radios.max[axis] < chest.max[axis], "rack remains inside its support footprint");
  }
});

test("workshop budget includes earned trophies and dry/wet equipment", () => {
  const { GarageScene } = harness();
  for (const weather of ["dry", "wet", "rain"]) for (let wins = 0; wins <= 8; wins++) {
    const bay = GarageScene.buildStatic(LIV, { props: true, equipment: true, ctx: { weather, wins } });
    assert.ok(bay.idx.length / 3 <= 18000, `${weather}, ${wins} trophies stay within the detailed bay budget`);
    assert.equal(bay.mat.length, bay.pos.length / 3);
  }
});

test("reflection fade preserves each room's authored floor colours and markings", () => {
  const { GarageScene, ctx, meshes, draws } = harness();
  const Prims = vm.runInContext('GaragePrims', ctx), car = { car: true };
  for (const look of ['porcelain', 'heritage', 'endurance', 'stock']) {
    Prims.setLook(look); draws.length = 0;
    GarageScene.draw(TEAM, LIV, [0, 1.4, 3.2], null, 0, { ambient: false }, car);
    const floor = meshes[draws[0].mesh.id - 1];
    const fade = meshes[draws[draws.findIndex(d => d.mesh === car) + 1].mesh.id - 1];
    const authored = new Set();
    const key = (data, i, lift = 0) => [data.pos[i], +(data.pos[i + 1] - lift).toFixed(6), data.pos[i + 2],
      ...data.col.slice(i, i + 3), ...data.nrm.slice(i, i + 3), data.mat[i / 3]].join('|');
    for (let i = 0; i < floor.pos.length; i += 3) authored.add(key(floor, i));
    assert.ok(fade.pos.length > 36, look + ': retain joints and floor markings, not one recolouring quad');
    for (let i = 0; i < fade.pos.length; i += 3)
      assert.ok(authored.has(key(fade, i, .002)), look + ': every fade vertex matches the authored floor');
    const count = meshes.length;
    GarageScene.draw(TEAM, LIV, [0, 1.4, 3.2], null, 0, { ambient: false }, car);
    assert.equal(meshes.length, count, look + ': stable frames reuse the fade mesh');
  }
});

test("departure exterior has supported lane ground and an open outward doorway", () => {
  const { GarageScene, meshes, draws } = harness();
  GarageScene.draw(TEAM, LIV, [0, 2, 12], null, 0, { ambient: false });
  const floor = meshes[draws[1].mesh.id - 1], p = floor.pos, n = floor.nrm;
  const ground = [], facade = [];
  for (let i = 0; i < p.length; i += 3) {
    if (n[i + 1] > .99 && Math.abs(p[i + 1] + .036) < .001 && p[i + 2] >= 6.45) ground.push(p[i]);
    if (n[i + 2] > .99 && Math.abs(p[i + 2] - 6.425) < .001) facade.push([p[i], p[i + 1]]);
  }
  assert.ok(Math.min(...ground) <= -22 && Math.max(...ground) >= 22, "lane extends under the exterior follow");
  assert.ok(facade.length > 16, "near frontage has outward-facing surfaces");
  assert.ok(facade.every(([x, y]) => Math.abs(x) >= 2.7 - .001 || y >= 4.8 - .001), "central aperture stays clear");
});

function garageWheelHarness() {
  const draws = [], meshes = [], freed = [], recipes = [];
  const ctx = vm.createContext({
    Car3D: { TYRE_BAND: [null, [1, 0, 0]], BRAKE_CALIPER: [null, [1, 1, 0]],
      buildWheelLayers(...args) {
        recipes.push(args);
        return { rotating: { kind: "rotating", axle: recipes.length }, fixed: { kind: "fixed", axle: recipes.length } };
      } },
  });
  for (const file of ["js/core/mat4.js", "js/car/car-wheels.js"])
    vm.runInContext(read(file), ctx, { filename: absSrc(file) });
  const gfx = { createMesh(data) { meshes.push(data); return data; },
    freeMesh(mesh) { freed.push(mesh); },
    draw(mesh, matrix) { draws.push({ mesh, matrix: Array.from(matrix) }); } };
  return { ctx, gfx, draws, meshes, freed, recipes,
    Wheels: vm.runInContext("CarWheels", ctx), M4: vm.runInContext("M4", ctx) };
}

test("garage wheels are available before the legacy race-session shim and retain fitted layers", () => {
  const h = garageWheelHarness();
  assert.equal(vm.runInContext("typeof GarageDepartureWheels", h.ctx), "undefined", "first garage visit has not loaded the race-session shim");
  assert.equal(typeof h.Wheels.createGarage, "function");
  const wheels = h.Wheels.createGarage(h.gfx), tiers = { tyres: 1, brakes: 1 };
  wheels.prepare("first", { rimTint: "#334455", caliperTint: "#ff3300" }, tiers);
  wheels.prepare("first", {}, tiers);
  assert.equal(h.recipes.length, 2, "one fitted front and rear pair");
  assert.equal(h.meshes.length, 4, "rotating and fixed geometry share the cache");
  assert.deepEqual(Array.from(h.recipes[0][2]), [1, .2, 0], "fitted wheel keeps livery caliper tint");
  const base = h.M4.ident();
  for (const distance of [0, .34, -.34, .34, .34]) wheels.draw(base, distance, .2, {});
  assert.equal(h.recipes.length, 2, "stepping, reversing and holding only transform meshes");
  assert.equal(h.draws.length, 40, "all four wheels retain rotating and fixed passes");
  wheels.release(); wheels.release();
  assert.equal(h.freed.length, 4, "release is idempotent");
  wheels.prepare("second", {}, tiers);
  assert.equal(h.recipes.length, 4, "re-entry restores released layers");
  wheels.prepare("changed", {}, tiers);
  assert.equal(h.freed.length, 8, "parts changes release the superseded fitted set");
});

test("garage wheel transforms reverse and seek exactly while calipers stay fixed", () => {
  const h = garageWheelHarness(), wheels = h.Wheels.createGarage(h.gfx), base = h.M4.ident();
  wheels.prepare("moving", {}, { tyres: 1, brakes: 1 });
  const frame = (distance) => {
    h.draws.length = 0;
    wheels.draw(base, distance, .2, {});
    return h.draws.map(d => ({ mesh: d.mesh, matrix: d.matrix }));
  };
  const zero = frame(0), forward = frame(.34 * Math.PI / 2), reverse = frame(-.34 * Math.PI / 2);
  assert.notDeepEqual(forward[0].matrix, zero[0].matrix, "a quarter turn changes the rendered rotating transform");
  assert.ok(Math.abs(forward[0].matrix[5]) < 1e-6);
  assert.ok(Math.abs(forward[0].matrix[6] + reverse[0].matrix[6]) < 1e-6, "reverse changes the spin sign");
  for (let i = 1; i < 8; i += 2) {
    assert.deepEqual(forward[i].matrix, zero[i].matrix, "fixed caliper does not follow the rim");
    assert.deepEqual(reverse[i].matrix, zero[i].matrix, "reverse leaves fixed hardware planted");
  }
  assert.deepEqual(frame(.34 * Math.PI / 2), forward, "scrubbing back restores the exact same draw matrices");
  assert.deepEqual(frame(.34 * Math.PI / 2), forward, "a paused frame does not advance phase");
  assert.equal(h.recipes.length, 2, "no per-frame geometry rebuild");
});

test("legacy departure wheel entry delegates to the common first-visit implementation", () => {
  const h = garageWheelHarness(), calls = [], sentinel = {};
  const shim = vm.createContext({ CarWheels: { createGarage(gfx) { calls.push(gfx); return sentinel; } } });
  vm.runInContext(read("js/garage/departure-wheels.js"), shim, { filename: absSrc("js/garage/departure-wheels.js") });
  const legacy = vm.runInContext("GarageDepartureWheels", shim);
  assert.equal(legacy.create(h.gfx), sentinel);
  assert.deepEqual(calls, [h.gfx], "compatibility entry has one implementation owner");
});


test("garage wheel upload failure frees partial layers and the same preparation can retry", () => {
  for (let failAt = 0; failAt < 4; failAt++) {
    const h = garageWheelHarness(), create = h.gfx.createMesh;
    let uploads = 0;
    h.gfx.createMesh = (data) => {
      if (uploads++ === failAt) throw new Error("wheel upload failed");
      return create(data);
    };
    const wheels = h.Wheels.createGarage(h.gfx), tiers = { tyres: 1, brakes: 1 };
    assert.throws(() => wheels.prepare("retry", {}, tiers), /wheel upload failed/);
    assert.equal(h.meshes.length, failAt, "only completed uploads own a handle");
    assert.deepEqual(h.freed, h.meshes, "every partially uploaded layer is released");
    wheels.draw(h.M4.ident(), 1, 0, {});
    assert.equal(h.draws.length, 0, "a failed set cannot render partial wheels");
    h.gfx.createMesh = create;
    wheels.prepare("retry", {}, tiers);
    assert.equal(h.recipes.length, 4, "same key builds again after failure");
    wheels.draw(h.M4.ident(), 1, 0, {});
    assert.equal(h.draws.length, 8, "retry restores all four wheel pairs");
    wheels.release(); wheels.release();
    assert.equal(h.freed.length, failAt + 4, "retry and release retain no handles");
    assert.equal(new Set(h.freed).size, failAt + 4, "no layer is freed twice");
  }
});

// Exercise the detached CPU builder with bounded geometry, never a race build/GPU.
function exteriorFixture(points, { yaw = .4, hasBays = true, row = 0, repeats = 1, dress = false, cachedDef = null } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), origin = [10, 2, -8];
  const raw = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  for (const p of points) {
    raw.pos.push(origin[0] + p[0] * c + p[2] * s, origin[1] + p[1], origin[2] - p[0] * s + p[2] * c);
    raw.nrm.push(s, 0, c); raw.col.push(.2, .4, .6); raw.mat.push(16);
  }
  for (let n = 0; n < repeats; n++) for (let i = 0; i < points.length; i++) raw.idx.push(i);
  const blank = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const right = [-s, 0, -c], tangent = [-c, 0, s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
  let builds = 0;
  const ctx = vm.createContext({ GaragePrims: { Z_DOOR: 6.4, HALF_W: 5.4, Z_BACK: -6.4 },
    Tracks: { buildCenterline(_def, opts) { assert.equal(opts.line, false); builds++; return { def: cachedDef || _def }; },
      build() { throw Error('full build forbidden'); }, buildPaced() { throw Error('race build forbidden'); } },
    TrackPit: { build: () => ({ hasBays, side: 1, off: { workOut: 0 }, bay: { depth: 12.8, doorW: 5.4, doorH: 4.8 },
      row: { boxes: [{ s: 20, k: 0 }] }, bands: { fast: 3.5 } }), rowOf: () => row },
    TrackSpline: { curvature: () => 0, sample(_track, _arc, out) {
      out.r = right; out.t = tangent; out.hw = 0;
      out.p = origin.map((v, i) => v - right[i] * 6.4 - (i === 1 ? .02 : 0));
    } }, TrackGeom: { norm, cross, addBox() {}, emit() {} },
    TrackMesh: { bankOffsetAt: () => 0, buildRoad: () => raw, buildPitLane() {}, buildPitBoxes() {}, buildFloor: blank,
      *buildTerrainSteps() { yield; return dress ? raw : blank(); } },
    TrackModels: { sealGeometry: geo => geo }, TrackBuildProps: { *buildSteps(track, opts) {
      assert.equal(opts.skipPits, true); assert.ok(track.terrainGeo, 'real terrain precedes scenery anchoring');
      assert.ok(opts.region.maxVertices > 0); assert.equal(opts.region.intersects(origin, 20), true);
      assert.equal(opts.region.intersects([origin[0] + 10000, 0, origin[2]], 1), false);
      if (track.def.palette) track.def.palette.grass[0] = .99;
      yield; return { out: dress ? raw : blank(), glass: dress ? raw : blank(), water: dress ? raw : blank() };
    } },
    TrackSurface: { profile: () => ({}) }, SceneryPits: { build(opts) { assert.equal(opts.exteriorOnly, true); return {}; } } });
  vm.runInContext(read('js/garage/exterior-geometry.js'), ctx, {filename:absSrc('js/garage/exterior-geometry.js')});
  const builder = vm.runInContext('GarageExteriorGeometry', ctx);
  return { builder, builds: () => builds, origin, yaw, raw };
}
function finishExterior(builder, def = { id: 'fixture' }) {
  const it = builder.buildSteps(def, { teamId: 'ferrari', night: true });
  let r, yields = 0; do { r = it.next(); if (!r.done) yields++; } while (!r.done);
  return { result: r.value, yields };
}
test('circuit exterior clips triangles at all six bounds, rotates normals and preserves material columns', () => {
  const points = [
    [-660, 0, 20], [-640, 0, 18], [-640, 2, 22], [660, 0, 20], [640, 0, 18], [640, 2, 22],
    [0, -122, 20], [2, -118, 18], [-2, -118, 22], [0, 305, 20], [2, 295, 18], [-2, 295, 22],
    [0, 0, 4], [2, 0, 10], [-2, 2, 10], [0, 0, 1005], [2, 0, 995], [-2, 2, 995],
  ];
  const h = exteriorFixture(points), { result: r, yields } = finishExterior(h.builder);
  assert.equal(r.supported, true); assert.ok(yields > 5);
  assert.ok(Math.abs(r.anchor.yaw - h.yaw) < 1e-10);
  r.anchor.position.forEach((v, i) => assert.ok(Math.abs(v - h.origin[i]) < 1e-10));
  const b = [-650, 650, -120, 300, 6.4, 1000], seen = new Set(), geo = r.road;
  assert.ok(geo.idx.length > 18, 'crossing triangles survive as clipped polygons');
  assert.equal(geo.nrm.length, geo.pos.length); assert.equal(geo.col.length, geo.pos.length);
  assert.equal(geo.mat.length, geo.pos.length / 3);
  for (let i = 0; i < geo.pos.length; i++) {
    const a = i % 3, v = geo.pos[i]; assert.ok(Number.isFinite(v));
    assert.ok(v >= b[a * 2] - 1e-8 && v <= b[a * 2 + 1] + 1e-8);
    for (const k of [a * 2, a * 2 + 1]) if (Math.abs(v - b[k]) < 1e-8) seen.add(k);
    if (i < geo.pos.length - 12) {
      assert.ok(Math.abs(geo.nrm[i] - (a === 2 ? 1 : 0)) < 1e-8);
      assert.ok(Math.abs(geo.col[i] - [.2, .4, .6][a]) < 1e-8);
    }
  }
  const ramp = geo.pos.slice(-12);
  assert.deepEqual(Array.from(ramp), [-2.7, 0, 6.4, 2.7, 0, 6.4, -2.7, .03, 6.7, 2.7, .03, 6.7]);
  assert.ok(Math.abs(Math.hypot(...geo.nrm.slice(-3)) - 1) < 1e-8);
  assert.deepEqual(Array.from(r.stats.groundBounds), [-900, 900, -10000, 10000, 6.4, 1300]);
  assert.equal(seen.size, 6); assert.ok(geo.mat.every(m => m === 16));
  assert.ok(geo.idx.every(i => i >= 0 && i < geo.pos.length / 3));
});
test('circuit exterior refuses unavailable bay and invalid/budget-breaking geometry', () => {
  const tri = [[0, 0, 20], [2, 0, 20], [0, 2, 20]];
  for (const [opts, reason] of [[{ hasBays: false }, 'circuit-has-no-bays'], [{ row: -1 }, 'team-has-no-bay']]) {
    const { builder } = exteriorFixture(tri, opts), r = finishExterior(builder).result;
    assert.equal(r.supported, false); assert.equal(r.reason, reason); assert.equal(r.road, null); assert.equal(r.anchor, null);
  }
  const missing = exteriorFixture(tri);
  assert.equal(finishExterior(missing.builder, null).result.reason, 'missing-circuit'); assert.equal(missing.builds(), 0);
  assert.throws(() => finishExterior(exteriorFixture([[NaN, 0, 20], ...tri.slice(1)]).builder), /Non-finite/);
  assert.throws(() => finishExterior(exteriorFixture(tri, { repeats: 240001 }).builder), /budget exceeded/);
});

test('detached exterior retains real terrain and separate scenery/glass/water without palette mutation', () => {
  const def = { id: 'fixture', palette: { grass: [.2, .3, .4] } };
  const cachedDef = { palette: { grass: [.1, .2, .3] } };
  const h = exteriorFixture([[0, 0, 20], [2, 0, 20], [0, 2, 20]], { dress: true, cachedDef });
  const r = finishExterior(h.builder, def).result;
  assert.deepEqual(def.palette.grass, [.2, .3, .4], 'scenery palette adjustments are detached from the selected race');
  assert.deepEqual(cachedDef.palette.grass, [.1, .2, .3], 'a cached centreline cannot lend its mutable definition to scenery');
  for (const name of ['terrain', 'scenery', 'glass', 'water']) {
    assert.equal(r[name].idx.length, 3, name + ' survives the world-to-garage transform');
    assert.equal(r[name].pos.length, 9);
  }
  assert.equal(r.stats.sceneryVertices, 3); assert.equal(r.stats.terrainVertices, 3);
  assert.equal(r.stats.glassVertices, 3); assert.equal(r.stats.waterVertices, 3);
});

test('night light-source separation preserves the complete scenery while leaving ordinary walls non-emissive', () => {
  const h = exteriorFixture([[0,0,20],[2,0,20],[0,2,20], [4,0,20],[6,0,20],[4,2,20]], { dress: true });
  for (let i = 9; i < 18; i += 3) h.raw.col.splice(i, 3, 1.3, 1.1, .75);
  const r = finishExterior(h.builder).result;
  assert.equal(r.scenery.idx.length, 3); assert.equal(r.sceneryLights.idx.length, 3);
  assert.ok(r.scenery.col.every(v => v <= 1)); assert.ok(r.sceneryLights.col.some(v => v > 1));
  assert.equal(r.stats.sceneryVertices, 6); assert.equal(r.stats.sceneryLightVertices, 3);
  assert.ok(r.scenery.pos.every(Number.isFinite) && r.sceneryLights.pos.every(Number.isFinite));
});


test('circuit exterior surface samples an inclined raised road, excludes paint and has bounded finite lookup data', () => {
  const plane = [[-2, 1.8, 10], [-2, 2.6, 14], [2, 2.2, 10], [2, 2.2, 10], [-2, 2.6, 14], [2, 3, 14]];
  const points = plane.map(p => [p[0], p[1] - .03, p[2]]).concat(plane, plane.map(p => [p[0], p[1] + .015, p[2]]));
  const h = exteriorFixture(points);
  for (let i = 12; i < 18; i++) h.raw.mat[i] = 0; // real pit paint and ribbon can both be FLAT
  const { result: r } = finishExterior(h.builder), sample = h.builder.sampleHeight, surface = r.surface;
  assert.ok(Math.abs(sample(surface, 0, 12) - 2.4) < 1e-8, 'raised pavement wins over lower road; paint does not lift the car');
  assert.ok(Math.abs(sample(surface, 1, 13) - 2.7) < 1e-8, 'barycentric lookup follows the inclined plane');
  assert.equal(sample(surface, 0, 0), 0, 'service box is flat');
  assert.equal(sample(surface, 0, 6.4), null, 'decorative bridge is excluded from contact index');
  assert.equal(sample(surface, 0, 6.55), null, 'fixture has no actual road at the bridge');
  assert.equal(sample(surface, NaN, 12), null); assert.equal(sample(surface, 56, 12), null);
  assert.equal(sample(surface, 0, 111), null); assert.equal(sample(surface, 0, 30), null);
  assert.ok(surface.triangles.every(Number.isFinite));
  assert.ok(surface.maxFaces <= 256 && surface.refs <= 400000);
  assert.ok(Object.values(surface.cells).every(v => v.length <= 256 && v.every(i => i >= 0 && i * 9 < surface.triangles.length)));
});

test('circuit exterior surface retains actual Bahrain and Monaco departure wheel contact heights', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), h = require('../../tools/lib/track-build-vm.cjs').buildContext({ assets: false });
  const ctx = vm.createContext(h.sandbox);
  for (const f of ['js/garage/exterior-geometry.js', 'js/garage/exterior.js', 'js/data/garage-departure-motion.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Builder = vm.runInContext('GarageExteriorGeometry', ctx), Motion = vm.runInContext('GarageDepartureMotion', ctx), Exterior = vm.runInContext('GarageExterior', ctx);
  for (const [id, expected] of [['bahrain', [.1229, .1484, .1229, .1484]], ['monaco', [-.0121, .0012, -.0120, .0014]]]) {
    const it = Builder.buildSteps(h.Tracks.LIST.find(d => d.id === id), { teamId: 'ferrari' });
    let next; do { next = it.next(); } while (!next.done);
    const data = next.value; assert.equal(data.supported, true);
    const pose = { side: 1, eye: [], aim: [] }; Motion.sample(1, 1, pose); Exterior.fitPose(pose, data.anchor, true);
    let wheel = 0;
    for (const x of [-.79, .79]) for (const z of [-1.6, 1.7]) {
      const wx = pose.x + x * Math.cos(pose.yaw) + z * Math.sin(pose.yaw);
      const wz = pose.z - x * Math.sin(pose.yaw) + z * Math.cos(pose.yaw);
      const y = Builder.sampleHeight(data.surface, wx, wz);
      assert.ok(Number.isFinite(y), id + ' tyre has a supported surface');
      assert.ok(Math.abs(y - expected[wheel++]) < .003, id + ' exact generated ribbon height survives indexing');
    }
    if (id === 'bahrain') {
      assert.ok(data.stats.sceneryVertices > 10000, 'actual authored venue scenery is present beyond the pit structures');
      assert.ok(data.stats.terrainVertices > 1000, 'the exterior includes real circuit terrain, not only a floor plane');
      assert.ok(data.stats.sceneryLightVertices > 0, 'authored light-source faces survive in their own pass');
      const xs = data.road.pos.filter((_v, i) => i % 3 === 0);
      assert.ok(Math.max(...xs) >= 150, 'actual Bahrain road continues into the extended follow-view graphics region');
    }
    const ramp = data.road.pos.slice(-12);
    for (const at of [6, 9]) {
      const y = Builder.sampleHeight(data.surface, ramp[at], ramp[at + 2]);
      assert.ok(Number.isFinite(y), id + ' outer sill edge has actual road support');
      assert.ok(Math.abs(ramp[at + 1] - y) < 1e-6, id + ' sill endpoint meets actual banked road');
    }
    assert.equal(ramp[1], 0); assert.equal(ramp[4], 0);
    assert.ok(data.surface.maxFaces <= 256);
  }
});


test("the ordinary garage selects articulated wheels before any departure or race-session load", () => {
  const builds = [], prepared = [], renderer = { prepare: (...args) => prepared.push(args) };
  const team = { id: "test" }, tiers = { tyres: 1, brakes: 1 }, liv = { c1: [1, 0, 0], c2: [0, 0, 0] };
  const env = {
    Teams: { LIST: [team] }, G: { teamIdx: 0 }, gfx: {},
    garageSeat: () => ({ num: 1 }), previewKey: () => "car", resolveLivery: () => liv,
    partsVisualKey: () => "parts", seatTag: () => "1", hullKeyOf: () => "hull", getTeamParts: () => ({}),
    Parts: { getVisualTiers: () => tiers }, CarWheels: { createGarage: () => renderer },
    Car3D: { FINISH_FIELDS: [], build: (_a, _b, opts) => { builds.push(opts); return { data: true }; } },
    GarageScene: { previewMesh: (_key, _hull, make) => ({ mesh: make(), hull: [] }) },
  };
  const make = new Function("env", `const {${Object.keys(env).join(",")}} = env;
    let _spMesh, _spMeshKey = "", _spHull, _spBase, departureWheels, driveOut = null;
    ${fnSource(read("js/garage/setup-camera.js"), "function getSetupPreviewMesh()")}
    return getSetupPreviewMesh;`);
  const get = make(env), first = get();
  assert.equal(builds[0].noWheels, true, "an ordinary garage body must not bake stationary wheels");
  assert.equal(prepared.length, 1, "first visit prepares common wheel layers without the legacy shim");
  assert.equal(get(), first);
  assert.equal(builds.length, 1, "successive preview frames reuse body geometry");
  assert.equal(prepared.length, 1, "successive preview frames reuse wheel geometry");
});

test("garage reflection and normal wheel draws share the signed current-pose phase without driveOut", () => {
  const drawSource = fnSource(read("js/garage/setup-camera.js"), "function drawDepartureReflection(");
  for (const distance of [-2, 0, 2]) {
    const draws = [], wheels = { draw: (...args) => draws.push(args) };
    const draw = new Function("departureWheels", "_spWheelDistance", "_spWheelSteer", `let driveOut = null; ${drawSource}; return drawDepartureReflection;`)(wheels, distance, .15);
    const normal = {}, reflection = {}, material = {};
    draw(normal, material); draw(reflection, material);
    assert.equal(draws.length, 2, "arrival/return wheel layers also reach the reflection pass");
    assert.deepEqual(draws[0], [normal, distance, .15, material]);
    assert.deepEqual(draws[1], [reflection, distance, .15, material]);
  }
});


test("same-ID garage wheel edits and Undo invalidate fitted layers on the real mesh-bust path", () => {
  const h = garageWheelHarness(), wheels = h.Wheels.createGarage(h.gfx), tiers = { tyres: 1, brakes: 1 };
  const bust = new Function("departureWheels", "GarageScene", `let _spMeshKey = "car", _flapBustAt; const _pk = { val: null };
    ${fnSource(read("js/garage/setup-camera.js"), "function spMeshBust()")}
    return spMeshBust;`)(wheels, { dropPreviewMeshes() {} });
  h.ctx.CarMaterials = { SURFACES: { paint: 101 }, FINISH_SURFACE: { matte: 102 } };
  const original = { rimTint: "#ff0000", caliperTint: "#00ff00", sidewallInk: "#0000ff", rimFinish: "gloss" };
  wheels.prepare("same-id", original, tiers);
  for (const liv of [{ rimTint: "#334455", caliperTint: "#ff3300", sidewallInk: "#ffffff", rimFinish: "matte" }, original]) {
    const before = h.recipes.length;
    bust(); wheels.prepare("same-id", liv, tiers);
    assert.equal(h.recipes.length, before + 2, "a new draft or Undo rebuilds front/rear layers under the same livery ID");
    const tint = h.Wheels.tints(liv), front = h.recipes[before];
    assert.deepEqual(Array.from(front[2]), Array.from(tint.cal), "caliper tint follows the current draft");
    assert.deepEqual(Array.from(front[3]), Array.from(tint.rim), "rim tint follows the current draft");
    assert.deepEqual(Array.from(front[8]), Array.from(tint.ink), "sidewall ink follows the current draft");
    assert.equal(front[9], tint.surf, "rim finish follows the current draft");
  }
  assert.equal(h.freed.length, 8, "each superseded wheel set releases its four GPU layers");
});

test("SetupCamera public release frees common wheels off-screen and preserves a visible garage", () => {
  const h = garageWheelHarness(), wheels = h.Wheels.createGarage(h.gfx), G = { setupPreviewOn: true };
  wheels.prepare("car", {}, { tyres: 1, brakes: 1 });
  let roomReleases = 0;
  const release = new Function("departureWheels", "G", "GarageScene", `let _spMesh, _spMeshKey = "car", _spBase;
    return ({${fnSource(read("js/garage/setup-camera.js"), "release() {")}}).release;`)(wheels, G, { release() { roomReleases++; } });
  assert.equal(release(), false);
  assert.equal(h.freed.length, 0, "the visible garage retains all four wheel layers");
  assert.equal(roomReleases, 0);
  G.setupPreviewOn = false;
  assert.equal(release(), true);
  assert.equal(h.freed.length, 4, "phone/prewarm release drops all common wheel GPU handles");
  assert.equal(roomReleases, 1);
  release();
  assert.equal(h.freed.length, 4, "public release does not double-free wheel layers");
  wheels.prepare("car", {}, { tyres: 1, brakes: 1 });
  assert.equal(h.recipes.length, 4, "the next garage visit restores its wheel layers");
});
test('circuit exterior sill normals follow actual cross slope and contact data excludes the bridge', () => {
  const points = [[-4, .016, 6.4], [-4, .032, 8], [4, .024, 6.4],
    [4, .024, 6.4], [-4, .032, 8], [4, .040, 8]];
  const h = exteriorFixture(points), { result: r } = finishExterior(h.builder);
  const ramp = r.road.pos.slice(-12), normal = r.road.nrm.slice(-3);
  for (const at of [6, 9]) assert.ok(Math.abs(ramp[at + 1] - h.builder.sampleHeight(r.surface, ramp[at], ramp[at + 2])) < 1e-8);
  assert.ok(Math.abs(ramp[7] - .0203) < 1e-8); assert.ok(Math.abs(ramp[10] - .0257) < 1e-8);
  const f = (ramp[7] + ramp[10]) / .6, x = (ramp[10] - ramp[7]) / 5.4, n = Math.hypot(x, 1, f);
  assert.ok(Math.abs(normal[0] + x / n) < 1e-8); assert.ok(Math.abs(normal[1] - 1 / n) < 1e-8);
  assert.ok(Math.abs(normal[2] + f / n) < 1e-8);
  assert.ok(Math.abs(h.builder.sampleHeight(r.surface, 0, 6.4) - .02) < 1e-8, 'index samples actual road, not the zero-height sill edge');
  assert.equal(r.surface.triangles.length / 9, 2, 'bridge triangles were never indexed');
});


test('circuit exterior retains distant rendered road while tyre lookup remains a bounded local index', () => {
  const near = [[0, 0, 20], [0, 0, 24], [2, 0, 20]];
  const far = [[140, 1, 20], [140, 1, 24], [155, 1, 20], [0, 2, 140], [0, 2, 145], [2, 2, 140]];
  const h = exteriorFixture(near.concat(far)), r = finishExterior(h.builder).result;
  assert.ok(r.road.pos.some((v, i) => i % 3 === 0 && v >= 150), 'real rendered continuation survives past 55 m');
  assert.ok(r.road.pos.some((v, i) => i % 3 === 2 && v >= 140), 'forward graphics extent is independent of contact extent');
  assert.equal(r.surface.triangles.length / 9, 1, 'remote rendered faces and decorative sill are not indexed');
  assert.equal(h.builder.sampleHeight(r.surface, 150, 21), null); assert.equal(h.builder.sampleHeight(r.surface, 0, 140), null);
  assert.equal(h.builder.sampleHeight(r.surface, .5, 21), 0);
  assert.deepEqual(Array.from(r.surface.bounds), [-55, 55, 6.4, 110]);
  for (const key of Object.keys(r.surface.cells)) {
    const [x, z] = key.split(',').map(Number);
    assert.ok(x >= -28 && x <= 27 && z >= 3 && z <= 55, 'all cell references remain in contact bounds');
  }
});
