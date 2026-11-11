/* A·H12 GPU-memory hunt (docs/notes/GPUMEM-HUNT-2026-10-24.md). No browser, no GPU: three r186's REAL
 * WebGPURenderer({ forceWebGL }) over a no-op WebGL2 context (tests/helpers/fake-webgl2.mjs) and the REAL
 * tlx-shadow.js shadowSys. A unit test of a backend is not evidence it runs: the live number is the GPU-object
 * census in the note (TLX on SwiftShader WebGPU, race→quit cycles).
 *   G1  shadowSys.warm() builds probe caster meshes per race and, one warm later, disposed only their GEOMETRY.
 *       three's RenderObject frees itself on the OBJECT's or the MATERIAL's "dispose" — a geometry dispose only
 *       nulls its attribute cache (RenderObject.onGeometryDispose) — so every warm left its probes' render objects
 *       (uniform buffers, bind groups) in Renderer._objects._renderObjects for the session: measured live as 4–6
 *       render objects per race that never went away. The budget below: render objects flat after the first warm. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
vm.runInThisContext(read("js/render/three/tlx-shadow.js"), { filename: absSrc("js/render/three/tlx-shadow.js") });

function srcGeometry(withColor) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  if (withColor) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  return g;
}

test("G1: shadowSys.warm() releases the previous warm's probe render objects (budget: flat across races)", async (t) => {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const sys = globalThis.TLXShaders.shadowSys(THREE, TSL, { renderer, isMobile: false, softwareGL: false, isWarming: () => false });
  assert.ok(sys.S.enabled, "sun map on (desktop)");
  const live = () => renderer._objects._renderObjects.size;
  const counts = [];
  // One warm per race, each with that race's layouts (fresh source geometries, as a new circuit's meshes are).
  for (let race = 0; race < 6; race++) {
    await sys.warm([srcGeometry(false), srcGeometry(true)]);
    counts.push(live());
  }
  t.diagnostic(`render objects after each warm: ${counts.join(" ")}`);
  assert.ok(counts[0] > 0, "the warm compiled probe casters (the rig drives three's real render-object cache)");
  // The current warm's probes stay (they hold the pipelines until the next warm has compiled); older ones go.
  assert.deepEqual(counts.slice(2), counts.slice(1, -1), "render objects grow with every race: an earlier warm's probes were never released");
});
