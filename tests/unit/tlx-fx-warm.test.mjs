/* A·W50 (#3673, 2026-10-26): the last two pipelines the first race frame built synchronously on TLX WebGPU (lavapipe
 * census after the pipeline pin, Monza, full menu prep then START) were fx states the warm compiled differently:
 *  - the DRIVING LINE (tlx-fx-line-mrt) draws INDEXED, and three r186 keys a render pipeline on the geometry's index
 *    too (getGeometryCacheKey appends "index,"), so the warm's unindexed probe built a pipeline the race never used;
 *  - the per-record BLOB (tlx-fx-blob-mrt) drawn with a mirrored model (cw): the warm compiled it on neither winding.
 * After the fix the census reads 0 synchronous race-entry pipelines. Real three r186 over the fake WebGL2 context and
 * the real lineIndex source; a unit test is not device evidence (gpu-census.yml, then the Device Farm). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

installThreeGlobals();
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);

const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
const lineIndex = new Function("THREE", `"use strict";
  ${tslice("      function lineIndex(slot) {", "      async function warmFxPrograms() {")}
  return lineIndex;`)(THREE);

async function rig(t) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x33ff66, side: THREE.DoubleSide });
  // A stream geometry shaped like tlx.js's lineStream: an interleaved buffer, capacity 64 vertices.
  const stream = () => {
    const ib = new THREE.InterleavedBuffer(new Float32Array(64 * 7).fill(0.25), 7);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute("lineAlong", new THREE.InterleavedBufferAttribute(ib, 1, 3));
    return { geo, ib, cap: 64 };
  };
  // The geometry part of the render-pipeline key, read from three's own RenderObject (getGeometryCacheKey). WebGPU's
  // backend folds it into the pipeline key (getRenderCacheKey); the fake WebGL2 backend shares one GL program across
  // geometry keys, so a pipeline count here could not show the split the census saw on lavapipe WebGPU.
  const keys = [];
  const getForRender = renderer._pipelines.getForRender;
  renderer._pipelines.getForRender = function (ro, ...rest) { keys.push(ro.getGeometryCacheKey()); return getForRender.call(this, ro, ...rest); };
  const draw = (geo) => {
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.updateMatrixWorld(); scene.add(m);
    keys.length = 0;
    renderer.render(scene, camera);
    scene.remove(m);
    return keys.find((k) => k.includes("lineAlong"));   // this mesh, not three's own output quad
  };
  return { fg, renderer, mat, stream, draw };
}

test("r187: unindexed and indexed share one geometry key (three dropped 'index,' from getGeometryCacheKey)", async (t) => {
  // r186 keyed the index, so the warm's unindexed probe and the race's indexed line built two pipelines (the census's
  // first-frame build). r187's getGeometryCacheKey keys attributes and morphs only; the indexed warm below stays as is.
  const h = await rig(t);
  const probe = h.stream(), race = h.stream();
  const a = h.draw(probe.geo);
  lineIndex(race);
  const b = h.draw(race.geo);
  assert.ok(a && a === b && !b.includes("index,"), `one geometry key for both (${a} vs ${b})`);
});

test("fixed: the warm gives the probe the race's index, so the race's line reuses the warmed pipeline", async (t) => {
  const h = await rig(t);
  const probe = h.stream(), race = h.stream();
  lineIndex(probe);
  const a = h.draw(probe.geo);
  lineIndex(race);
  assert.equal(h.draw(race.geo), a, "the same geometry key: the race's line reuses the warmed pipeline");
});

test("lineIndex: (i, i+1, i+2) at full capacity, built once (no orphaned index buffer per re-upload)", () => {
  const geo = new THREE.BufferGeometry(), slot = { geo, cap: 6 };
  lineIndex(slot);
  assert.deepEqual(Array.from(geo.index.array), [0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5]);
  const first = geo.index;
  lineIndex(slot);
  assert.equal(geo.index, first, "a second call keeps the same BufferAttribute");
  slot.cap = 8; lineIndex(slot);
  assert.notEqual(geo.index, first, "a grown stream gets a bigger index");
  assert.equal(geo.index.count, 18);
});

test("tlx.js wiring: drawDrivingLine and the fx warm share lineIndex; the per-record blob warms both windings", () => {
  const draw = tslice("        drawDrivingLine(verts, vertCount, dirty, opts) {", "          fx.lineSpeed.value = ");
  assert.ok(draw.includes("lineIndex(lineStream);"), "the race's line index comes from the helper");
  const warm = tslice("      async function warmFxPrograms() {", "        await _coWarm();");
  const idx = warm.indexOf("if (stream === lineStream) lineIndex(stream);"), probe = warm.indexOf("await compileWarmProbe(stream.geo, mat);");
  assert.ok(idx > 0 && idx < probe, "the line probe is indexed before it compiles");
  assert.ok(warm.includes("for (const sx of [1, -1]) await compileWarmProbe(getFxQuad(), fx.shadowMat, sx);"), "blob on both signs");
});
