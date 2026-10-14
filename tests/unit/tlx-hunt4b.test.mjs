/* TLX perf hunt 4, lane TLX-W (2026-10-14). No browser, no GPU: the REAL tlx-chunked packer, and three r186's REAL
 * WebGPURenderer({ forceWebGL }) over the no-op WebGL2 context (tests/helpers/fake-webgl2.mjs). A unit test of a
 * backend is not evidence it runs: the follow-up is a frozen TLX A/B and gpu-census.yml (macos).
 *   A-W2  4-byte vertex strides on three's WebGL2 backend (apex26.tlxPad4): every packed attribute that missed a
 *         4-byte stride (normal Int16x3n, colour Uint8x3n / Float16x3, mat Float16x1) is widened with the values
 *         the shader reads unchanged; WebGPU (fmt24) and the tools' raw pack are untouched. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CHUNKED = read("js/render/three/tlx-chunked.js");

installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.0/three.webgpu.min.js")).href);
const TSL = THREE.TSL;
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/three/tsl-chunks.js",
  "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: f });

// ── A-W2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The real module, loaded with a given apex26.* store (the knob is read once, at load, like apex26.tlxPack).
function packer(ls = {}) {
  const sb = { window: {}, localStorage: { getItem: (k) => (k in ls ? ls[k] : null) }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Math };
  vm.createContext(sb);
  vm.runInContext(CHUNKED, sb, { filename: "tlx-chunked.js" });
  return sb.window.TLXShaders;
}
function decodeHalf(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * Math.pow(2, -24);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * Math.pow(2, e - 15);
}
// What the GPU's vertex fetch hands the shader: one vertex's components, as floats.
function fetch(attr, v) {
  const a = attr.array, k = attr.itemSize, out = [];
  for (let c = 0; c < k; c++) {
    const x = a[v * k + c];
    out.push(attr.isFloat16BufferAttribute ? decodeHalf(x)
      : a instanceof Int16Array && attr.normalized ? Math.max(x / 32767, -1)
      : a instanceof Uint8Array && attr.normalized ? x / 255 : x);
  }
  return out;
}
const stride = (attr) => attr.itemSize * attr.array.BYTES_PER_ELEMENT;
// A small geometry covering every pack branch: unit normals (snorm16), in-range colours (unorm8), an HDR colour
// (emissive 2.6, half), whole and fractional MAT ids (half; 15.4 is the flag material's wave phase), and trk.
const N = 7;
const SRC = {
  nrm: Float32Array.from({ length: N * 3 }, (_, i) => [0.6, -0.8, 0, 1.00005, 0, -1, 0.267, 0.534, 0.802][i % 9]),
  col: Float32Array.from({ length: N * 3 }, (_, i) => [0, 0.5, 1, 0.25, 0.75, 0.125, 0.9, 0.1, 0.33][i % 9]),
  hdr: Float32Array.from({ length: N * 3 }, (_, i) => [2.6, 1.05, 0.25][i % 3]),
  mat: Float32Array.from({ length: N }, (_, i) => [0, 3, 15.4, 7, 255, 1, 15.4][i]),
  mat300: Float32Array.from({ length: N }, (_, i) => [0, 300, 2.5, 7, 1, 1, 15.4][i]),
  trk: Float32Array.from({ length: N * 3 }, (_, i) => i * 13.7),
};
const CASES = [["normal", "nrm", 3, "unit", 0], ["color", "col", 3, "unorm", 1], ["color (HDR)", "hdr", 3, "unorm", 1],
  ["mat", "mat", 1, "id", null], ["mat (> 255)", "mat300", 1, "id", null], ["trk", "trk", 3, null, null]];

test("A-W2: on WebGL2 every packed attribute has a 4-byte stride and fetches the same values; w is 0 (normal) / 1 (colour)", () => {
  const on = packer(), off = packer({ "apex26.tlxPad4": "0" });
  assert.equal(on.packStats.pad4On, true, "default ON");
  assert.equal(off.packStats.pad4On, false, "apex26.tlxPad4=0 restores the narrow strides");
  let narrowMisses = 0;
  for (const [name, key, k, kind, w] of CASES) {
    const len = N * k;
    const narrow = off.packAttr(THREE, SRC[key], len, k, kind, false);
    const wide = on.packAttr(THREE, SRC[key], len, k, kind, false);
    if (stride(narrow) % 4) narrowMisses++;
    assert.equal(stride(wide) % 4, 0, `${name}: ${wide.array.constructor.name}x${wide.itemSize} is a ${stride(wide)}-byte stride`);
    assert.equal(wide.array.length / wide.itemSize, N, `${name}: same vertex count`);
    for (let v = 0; v < N; v++) {
      const a = fetch(narrow, v), b = fetch(wide, v);
      assert.deepEqual(b.slice(0, k), a, `${name} vertex ${v}: the shader reads the same floats`);
      if (wide.itemSize === 4 && k === 3) assert.equal(b[3], w, `${name} vertex ${v}: w`);
    }
    if (narrow.isFloat16BufferAttribute && k === 1) {
      assert.ok(!wide.isFloat16BufferAttribute && wide.array instanceof Float32Array, `${name}: a 1-wide half becomes Float32`);
      assert.equal(wide.array[2], decodeHalf(narrow.array[2]), "the DECODED half (15.3984375), not the source 15.4");
    }
  }
  assert.equal(narrowMisses, 5, "control: normal, colour, HDR colour and both mats miss 4 bytes without the pad (trk does not)");
  assert.ok(on.packStats.pad4 >= 4 && on.packStats.pad4MB > 0, "packStats counts the widened attributes");
});

test("A-W2: WebGPU (fmt24) and the tools' raw pack (no fmt24) are untouched by the knob", () => {
  const on = packer(), off = packer({ "apex26.tlxPad4": "0" });
  for (const fmt24 of [true, undefined]) {
    for (const [name, key, k, kind] of CASES) {
      const a = off.packAttr(THREE, SRC[key], N * k, k, kind, fmt24), b = on.packAttr(THREE, SRC[key], N * k, k, kind, fmt24);
      assert.equal(b.array.constructor.name, a.array.constructor.name, `${name} fmt24=${fmt24}: type`);
      assert.equal(b.itemSize, a.itemSize, `${name} fmt24=${fmt24}: width`);
      assert.deepEqual(Array.from(b.array), Array.from(a.array), `${name} fmt24=${fmt24}: bytes`);
    }
  }
  assert.equal(on.packStats.pad4, 0, "nothing widened");
  // Both shipping call sites hand the WebGL2 rule over as `false`: the chunked factory's fmt24() and tlx.js buildGeometry.
  assert.match(CHUNKED, /const fmt24 = \(\) => !!\(ctx && ctx\.isWebGPU && ctx\.isWebGPU\(\)\);/);
  assert.match(read("js/render/three/tlx.js"), /const fmt24 = !!\(renderer\.backend && renderer\.backend\.isWebGPUBackend\);/);
  assert.match(CHUNKED, /const pad = fmt24 === false && pad4On && \(itemSize === 3 \|\| itemSize === 1\);/);
});

test("A-W2: the lit program reads a widened colour as vec3 and a Float32 mat as float — the same inputs, one wider fetch", async (t) => {
  const P = packer();
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const lit = globalThis.TLXShaders.lit(THREE, TSL, { chunks: globalThis.TLXShaders.chunks(THREE, TSL), shadow: null,
    ssrTag: false, envCube: null, matMaps: null, lampGrid: null, sharedUniforms: true, maxLights: 16 });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("normal", P.packAttr(THREE, SRC.nrm, N * 3, 3, "unit", false));
  g.setAttribute("color", P.packAttr(THREE, SRC.col, N * 3, 3, "unorm", false));
  g.setAttribute("mat", P.packAttr(THREE, SRC.mat, N, 1, "id", false));
  g.setAttribute("trk", P.packAttr(THREE, SRC.trk, N * 3, 3, null, false));
  assert.equal(g.getAttribute("color").itemSize, 4);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const m = new THREE.Mesh(g, lit.makeMaterial({ roughness: 0.6 })); m.frustumCulled = false; scene.add(m);
  renderer.render(scene, cam);
  const vs = fg.shaders.find((s) => /\bin\s+vec4\s+color\b/.test(s));
  assert.ok(vs, "the vertex stage declares the widened colour as a vec4 input");
  assert.match(vs, /\bcolor\.xyz\b/, "and reads its .xyz (attribute(\"color\", \"vec3\"))");
  assert.match(vs, /\bin\s+float\s+mat\b/, "mat is a float input either way");
});
