// Garage room LOOKS (design preview, GaragePrims.LOOKS): every look must build
// a valid bay — one material id per vertex, in-range indices, finite
// positions inside the room — and must actually change the room's colours.
// A look that silently falls back to the shipped room is the failure this
// guards: the switch would "work" and every capture would look the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

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
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  const GaragePrims = vm.runInContext("GaragePrims", ctx);
  GarageScene.init(gfx);
  return { GarageScene, GaragePrims, meshes };
}

const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

function build(id) {
  const h = harness();
  assert.ok(h.GaragePrims.setLook(id), `setLook(${id})`);
  h.GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const plain = h.meshes.filter((m) => !m.uv);
  return { ...h, plain };
}
// Mean vertex colour of the first (shell) mesh: the walls and ceiling.
const shellMean = (m) => {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < m.col.length; i += 3) { r += m.col[i]; g += m.col[i + 1]; b += m.col[i + 2]; }
  const n = m.col.length / 3;
  return [r / n, g / n, b / n];
};

test("every look builds valid bay meshes", () => {
  const { GaragePrims } = harness();
  assert.ok(GaragePrims.LOOK_IDS.length >= 5, "stock plus at least four looks");
  assert.equal(GaragePrims.setLook("no-such-look"), false);
  for (const id of GaragePrims.LOOK_IDS) {
    const { plain } = build(id);
    assert.ok(plain.length > 5, `${id}: meshes built`);
    for (const m of plain) {
      const v = m.pos.length / 3;
      assert.equal(m.mat.length, v, `${id}: one material id per vertex`);
      assert.equal(m.col.length, v * 3, `${id}: one colour per vertex`);
      for (const p of m.pos) assert.ok(Number.isFinite(p), `${id}: finite positions`);
      for (const c of m.col) assert.ok(Number.isFinite(c) && c >= 0, `${id}: finite colours`);
      for (const i of m.idx) assert.ok(i >= 0 && i < v, `${id}: index in range`);
    }
  }
});

test("each look changes the room (no silent fallback to stock)", () => {
  const means = {};
  const { GaragePrims } = harness();
  for (const id of GaragePrims.LOOK_IDS) means[id] = shellMean(build(id).plain[0]);
  const ids = Object.keys(means);
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++) {
      const d = Math.hypot(...means[ids[a]].map((v, k) => v - means[ids[b]][k]));
      assert.ok(d > 0.02, `${ids[a]} vs ${ids[b]}: shell colour differs (Δ ${d.toFixed(3)})`);
    }
});

test("trackside bays (buildStatic) ignore the look", () => {
  const a = harness(), b = harness();
  b.GaragePrims.setLook("flood");
  const sa = a.GarageScene.buildStatic ? a.GarageScene.buildStatic(LIV) : null;
  const sb = b.GarageScene.buildStatic ? b.GarageScene.buildStatic(LIV) : null;
  if (!sa) return;   // buildStatic not exported in this tree
  assert.deepEqual(Array.from(sb.col), Array.from(sa.col), "pit rows keep the shipped room");
});

test("a look's upper wall takes its panel colour, not the accent stripe", () => {
  const { plain } = build("flood");
  const shell = plain[0];
  // flood's panel is the team c1 (papaya here): find a vertex high on the back wall.
  let hit = null;
  for (let i = 0; i < shell.pos.length; i += 3)
    if (shell.pos[i + 1] > 3 && shell.pos[i + 1] < 4.9 && shell.pos[i + 2] < -6.3) { hit = i; break; }
  assert.ok(hit != null, "a back-wall vertex above 3 m");
  const c = shell.col.slice(hit, hit + 3);
  assert.ok(c[0] > 0.6 && c[2] < 0.2, `upper wall is team colour, got ${Array.from(c).map((v) => v.toFixed(2))}`);
});
