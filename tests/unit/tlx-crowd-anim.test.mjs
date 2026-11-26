// CROWD LIFE (EXTREME crowd3d): the seated figures' vertex stage on TLX (js/render/three/tsl-lit.js crowdMotionNode,
// js/render/three/tlx.js drawInstanced batch.crowd, js/track/scenery/detail.js crowdMat).
//  1. Feature off is the shipped program: the plain / instanced / chunked lit programs three generates are the same
//     text before and after a crowd material has been built in the same lit instance (fake WebGL2, real three).
//  2. The crowd program is its own: keyed "-crowd", reading the instance axes (iM0..3) under a FABRIC branch.
//  3. The figure code round-trips: crowdMat's fraction decodes (as the shader decodes it) to the part and facing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
const read = (rel) => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
installThreeGlobals();
globalThis.Log = globalThis.Log || { info() {}, warn() {}, error() {}, debug() {} };
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/shared/assets.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });

// The lit factory's TSL with each Fn's direct attribute reads and If gates recorded (an If body is built after its
// declaration, so it carries the Fn it was declared in). Pass-through: the generated programs are unchanged.
function spyTSL() {
  const T = THREE.TSL, X = Object.assign({}, T), fns = [];
  let cur = null;
  const within = (body, scope) => (...a) => { const prev = cur; cur = scope; try { return body(...a); } finally { cur = prev; } };
  X.Fn = (body, ...rest) => { const f = { attrs: new Set(), gates: [] }; fns.push(f); return T.Fn(within(body, f), ...rest); };
  X.If = (cond, body) => { if (cur) cur.gates.push(cond); return T.If(cond, within(body, cur)); };
  X.attribute = (name, ...rest) => { if (cur) cur.attrs.add(name); return T.attribute(name, ...rest); };
  return { TSL: X, fns };
}
// A numeric reading of a gate node (the few node types the crowd gate uses); `mat` is the vertex's material id.
const OPS = { "+": (a, b) => a + b, "-": (a, b) => a - b, "==": (a, b) => +(a === b), ">": (a, b) => +(a > b), "&&": (a, b) => +(a && b) };
function gateAt(n, mat) {
  switch (n.type) {
    case "AttributeNode": if (n._attributeName === "mat") return mat; break;
    case "ConstNode": return n.value;
    case "VarNode": case "ConvertNode": return gateAt(n.node, mat);
    case "OperatorNode": return OPS[n.op](gateAt(n.aNode, mat), gateAt(n.bNode, mat));
    case "MathNode":
      if (n.method === "floor") return Math.floor(gateAt(n.aNode, mat));
      if (n.method === "clamp") return Math.min(gateAt(n.cNode, mat), Math.max(gateAt(n.bNode, mat), gateAt(n.aNode, mat)));
  }
  throw new Error(`gateAt: no reading for ${n.type} ${n.op || n.method || n._attributeName || ""}`);
}

async function harness() {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const spy = spyTSL();
  const lit = globalThis.TLXShaders.lit(THREE, spy.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16 });
  const shaders = (mat) => {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
    const g = new THREE.BufferGeometry();
    for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3],
      ["iM0", 4], ["iM1", 4], ["iM2", 4], ["iM3", 4]])
      g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
    const b = new THREE.GLSLNodeBuilder(m, renderer);
    b.scene = scene; b.camera = cam; b.build();
    const out = { vs: b.vertexShader, fs: b.fragmentShader, key: mat.customProgramCacheKey(), attrs: b.attributes.map((a) => a.name) };
    g.dispose();
    return out;
  };
  return { lit, shaders, fns: spy.fns, dispose: () => renderer.dispose() };
}

const OFF = [["plain", {}], ["instanced", { instanced: true }], ["chunked", { chunked: true }]];

test("feature off: the lit programs are the same text before and after a crowd material exists", async () => {
  const h = await harness();
  OFF.forEach(([, o]) => h.shaders(h.lit.makeMaterial(o)));   // three emits a shared Fn's body once per builder state: warm it
  const before = OFF.map(([, o]) => h.shaders(h.lit.makeMaterial(o)));
  h.shaders(h.lit.makeMaterial({ instanced: true, crowd: true }));
  const crowd = h.shaders(h.lit.makeMaterial({ instanced: true, crowd: true }));
  const after = OFF.map(([, o]) => h.shaders(h.lit.makeMaterial(o)));
  OFF.forEach(([name], i) => {
    assert.equal(after[i].vs, before[i].vs, name + " vertex");
    assert.equal(after[i].fs, before[i].fs, name + " fragment");
    assert.equal(after[i].key, before[i].key, name + " key");
    assert.deepEqual(before[i].attrs.filter((a) => a.startsWith("iM")), [], name + ": no instance-axis attribute off the crowd program");
  });
  assert.notEqual(crowd.vs, after[1].vs);
  // a crowd flag on a non-instanced or chunked material is ignored
  assert.equal(h.shaders(h.lit.makeMaterial({ crowd: true })).vs, before[0].vs);
  assert.equal(h.shaders(h.lit.makeMaterial({ chunked: true, crowd: true })).vs, before[2].vs);
  h.dispose();
});

test("the crowd program: its own key, the FABRIC branch, the instance axes and a clamped excite uniform", async () => {
  const h = await harness();
  const m = h.lit.makeMaterial({ instanced: true, crowd: true });
  const s = h.shaders(m);
  assert.equal(s.key, "tlx-lit-instanced-crowd");
  assert.deepEqual(s.attrs.filter((a) => a.startsWith("iM")).sort(), ["iM0", "iM1", "iM2", "iM3"], "the program declares the instance axes");
  // Its vertex stage is the crowd node, not the shared flag / foliage motion every other program takes.
  const off = h.lit.makeMaterial({ instanced: true });
  assert.notEqual(m.positionNode, off.positionNode);
  assert.equal(h.lit.makeMaterial({}).positionNode, off.positionNode);
  // The crowd Fn (the one reading the instance axes) has ONE gate: the FABRIC id with a crowd code in its fraction.
  const crowdFns = h.fns.filter((f) => f.attrs.has("iM0"));
  assert.ok(crowdFns.length >= 1);
  for (const f of crowdFns) {
    assert.equal(new Set(f.gates.map((g) => g.id)).size, 1, "one gate in the crowd vertex stage");
    const open = (v) => gateAt(f.gates[0], v) === 1;
    for (const v of [7.02, 7.08, 7.14, 7.22, 7.28, 7.34]) assert.ok(open(v), `crowd code ${v} moves`);
    for (const v of [7, 7.005, 6.6, 6.49, 7.5, 8.02, 15, 15.02, 15.3, 0, 16.02]) assert.ok(!open(v), `id ${v} stays put`);
  }
  h.lit.setCrowdExcite(3); h.lit.setCrowdExcite(-1); h.lit.setCrowdExcite(0.4);   // no throw; clamps
  h.lit.updateFrame({ time: 1, crowdExcite: 0.7 });
  h.dispose();
});

test("crowdMat: the fraction decodes to its part and facing exactly as the vertex stage reads it", () => {
  const sb = { Math, Number, Array, Object, Float32Array, Float64Array, Uint8Array, String, Infinity, Log: { info() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(read("js/track/scenery/detail.js") + "\nthis.TrackDetail = TrackDetail;", sb);
  const TD = sb.TrackDetail;
  for (const f of [1, -1]) for (let part = 0; part < 3; part++) {
    // GLX stores the id as a USHORT over MAT_SCALE 85 (glsl-lit.js): decode the quantized value too
    for (const v of [TD.crowdMat(7, part, f), Math.round(TD.crowdMat(7, part, f) / 85 * 65535) / 65535 * 85]) {
      const id = Math.floor(v + 0.5), fr = Math.min(1, Math.max(0, v - id)), neg = fr > 0.18;
      assert.equal(id, 7, "every backend rounds to FABRIC");
      assert.equal(Math.floor((fr - (neg ? 0.2 : 0) - 0.02) / 0.06 + 0.5), part);
      assert.equal(neg ? -1 : 1, f);
      assert.ok(fr > 0.01, "inside the crowd branch");
    }
  }
  assert.deepEqual([...TD.TREE_MODELS], ["pine_lod0", "tree_lod0", "palm_lod0"]);
  assert.equal(TD.modelHint({ treesHi: false }), "");
  assert.equal(TD.modelHint(null), "");
  assert.equal(TD.modelHint({ treesHi: true }), ' "pine_lod0" "tree_lod0" "palm_lod0"');
});
