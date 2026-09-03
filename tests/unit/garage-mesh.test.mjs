// The bay's meshes must carry a per-vertex MATERIAL column, and it must be
// exactly one float per vertex.
//
// This is a silent-failure guard, not a style check. GLX wires the material
// attribute ONLY when `data.mat.length === vCount` (js/render/glx/glx.js:741) — a
// short array, a long one, or a missing one is dropped with no warning, every
// vertex falls back to the generic default `aMat = 0 = MAT.FLAT`, and
// `applyMaterial` early-outs on `mid <= 0` (js/render/glx/shaders/glsl-lit.js:294). The
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// A recording Gfx: every createMesh call is kept so the columns can be checked.
function harness() {
  const meshes = [];
  const gfx = {
    createMesh(data) { meshes.push(data); return { id: meshes.length }; },
    createTexMesh(data) { meshes.push(data); return { id: meshes.length, tex: true }; },
    freeMesh() {}, freeTexture() {}, createTexture() { return { id: 1 }; },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  vm.runInContext(read("js/track/core/geom.js"), ctx, { filename: "js/track/core/geom.js" });
  vm.runInContext(read("js/garage/scene.js"), ctx, { filename: "js/garage/scene.js" });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  return { GarageScene, meshes, ctx };
}

const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

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
  // (js/render/glx/shaders/glsl-lit.js:287) is true for CONCRETE / BRICK / METAL / WOOD /
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
