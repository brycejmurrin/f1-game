/* mirror-glass-night — sky-tint fallback tracks the night env, not a day card.
 *
 * Lighting measured Monaco night cockpit glass at luma 0.39–0.58 against sky
 * 0.006 / road 0.054 (7–10×). Cause: getMirrorFallback baked day-sky vertex
 * colours and car-draw.js drew them with roughness 0.08 / specular 0.7, so lamp
 * specular + a stale day look blew the lens out. Night now uses dim env bands
 * and a matte material.
 *
 * Run: node --test tests/unit/mirror-glass-night.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadMesh() {
  const made = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, window: null };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/core/mat4.js"), ctx);
  vm.runInContext(read("js/physics/consts.js"), ctx);
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx);
  ctx.CarMesh.init({
    createMesh(d) { const m = { d }; made.push(m); return m; },
    freeMesh() {},
    draw() {},
  });
  return { CarMesh: ctx.CarMesh, made };
}

const QUADS = [[[-0.5, 0.75, 0.9], [-0.7, 0.75, 0.9], [-0.7, 0.8, 0.9], [-0.5, 0.8, 0.9]]];

function maxChannel(mesh) {
  let m = 0;
  for (let i = 0; i < mesh.d.col.length; i++) if (mesh.d.col[i] > m) m = mesh.d.col[i];
  return m;
}
function meanLuma(mesh) {
  const c = mesh.d.col;
  let s = 0, n = c.length / 3;
  for (let i = 0; i < c.length; i += 3) s += 0.2126 * c[i] + 0.7152 * c[i + 1] + 0.0722 * c[i + 2];
  return s / n;
}

test("night fallback mesh is dim vs day (tracks night env, not a day sky card)", () => {
  const { CarMesh } = loadMesh();
  const day = CarMesh.getMirrorFallback(QUADS, false);
  const night = CarMesh.getMirrorFallback(QUADS, true);
  assert.notEqual(day, night, "day and night meshes are distinct caches");
  assert.ok(maxChannel(day) > 0.5, `day top stays a pale sky (max ${maxChannel(day)})`);
  assert.ok(maxChannel(night) < 0.08, `night top stays under a night road (~0.05×1.5): max ${maxChannel(night)}`);
  assert.ok(meanLuma(night) < meanLuma(day) * 0.2,
    `night mean luma ${meanLuma(night).toFixed(3)} << day ${meanLuma(day).toFixed(3)}`);
});

test("drawMirrorLens uses matte opts and the night mesh at night", () => {
  const src = read("js/car/car-draw.js");
  const fn = fnSource(src, "function drawMirrorLens(");
  assert.match(fn, /roughness:\s*0\.92|roughness = 0\.92/);
  assert.match(fn, /specular:\s*0\.06|specular = 0\.06/);
  assert.match(fn, /getMirrorFallback\(quads,\s*!!nite\)/);
  assert.match(fn, /nite \? 0\.85 : 0\.55/);
  // No glossy dielectric defaults left on the fallback card.
  assert.doesNotMatch(fn, /roughness:\s*0\.08/);
  assert.doesNotMatch(fn, /specular:\s*0\.7/);
});
