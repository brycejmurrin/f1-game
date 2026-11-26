// EXTREME material detail on TLX (features matDetail / envAll, js/perf/quality-preset.js FEATURES;
// docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md Phase 3): the pure weight maths of the hex tiling and the
// biplanar wall blend, and the lit graph compiled to WGSL + GLSL with the features off (no new taps) and on.
// The built graph is read back numerically (tslEval) against the twin. No GPU here: this proves the graph builds,
// computes the twin's maths and carries the intended taps, not how it looks or what it costs.
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
for (const f of ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/shared/assets.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js", "js/render/three/tsl-surface.js"])
  vm.runInThisContext(read(f), { filename: absSrc(f) });
const M = globalThis.TLXShaders.matDetailMath;
const TLX = read("js/render/three/tlx.js");

// A numeric reading of a built TSL graph (three r187 node types): the value the graph computes, `leaf(node)` answering
// its inputs. The tests below assert what the shader's nodes evaluate to, not how its source is spelled.
const KIDS = ["aNode", "bNode", "cNode", "node", "condNode", "ifNode", "elseNode"];
const kids = (n) => [...KIDS.map((k) => n[k]).filter((x) => x && typeof x === "object"), ...(n.nodes || [])];
function nodesIn(root, pred, out = [], seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root.id)) return out;
  seen.add(root.id);
  if (pred(root)) out.push(root);
  for (const k of kids(root)) nodesIn(k, pred, out, seen);
  return out;
}

// The lit factory's TSL with the calls these tests read recorded (arguments and result node); output unchanged.
function spyTSL() {
  const calls = [], TSL = Object.assign({}, THREE.TSL);
  for (const k of ["step", "max", "clamp", "abs", "vec2", "cubeTexture"])
    TSL[k] = (...a) => { const r = THREE.TSL[k](...a); calls.push({ k, a, r }); return r; };
  return { TSL, calls };
}

// Deterministic points (no Math.random: a failure must reproduce).
const pts = [];
for (let i = 0; i < 400; i++) pts.push([((i * 0.6180339887) % 1) * 37 - 11, ((i * 0.7548776662) % 1) * 29 - 7]);

test("hex grid: barycentric and gained weights are non-negative and sum to 1", () => {
  for (const [u, v] of pts) {
    const { bary, w } = M.hexGrid(u, v);
    for (const set of [bary, w]) {
      assert.ok(set.every((x) => x >= -1e-9 && x <= 1 + 1e-9), `weights in [0,1] at ${u},${v}: ${set}`);
      assert.ok(Math.abs(set[0] + set[1] + set[2] - 1) < 1e-9, `sum 1 at ${u},${v}: ${set}`);
    }
  }
});

test("hex grid: the three vertices are a lattice triangle whose barycentric blend is the point", () => {
  const k = 2 * Math.sqrt(3);
  for (const [u, v] of pts) {
    const { bary, verts } = M.hexGrid(u, v);
    const sx = u * k, sy = v * k, kx = sx - sy * 0.57735027, ky = sy * 1.15470054;
    const rx = bary[0] * verts[0][0] + bary[1] * verts[1][0] + bary[2] * verts[2][0];
    const ry = bary[0] * verts[0][1] + bary[1] * verts[1][1] + bary[2] * verts[2][1];
    assert.ok(Math.abs(rx - kx) < 1e-6 && Math.abs(ry - ky) < 1e-6, `reconstructs ${u},${v}`);
    const keys = new Set(verts.map((p) => p.join(",")));
    assert.equal(keys.size, 3, "three distinct vertices");
    for (const p of verts) assert.ok(p.every(Number.isInteger), "integer lattice vertices");
  }
});

test("hex grid: the weights are continuous across a cell edge (no seam in the blend)", () => {
  // Walking a fine line, a vertex's weight can only change smoothly; a vertex that enters or leaves does so at 0.
  let prev = null;
  for (let t = 0; t <= 2; t += 0.0005) {
    const g = M.hexGrid(0.37 + t, 0.11 + t * 0.43);
    const map = new Map(g.verts.map((p, i) => [p.join(","), g.w[i]]));
    if (prev) {
      for (const key of new Set([...map.keys(), ...prev.keys()])) {
        const a = prev.get(key) || 0, b = map.get(key) || 0;
        assert.ok(Math.abs(a - b) < 0.02, `weight of ${key} jumps ${a} -> ${b} at t=${t}`);
      }
    }
    prev = map;
  }
});

test("variance-preserving scale: 1 at a vertex, sqrt(3) at a centroid", () => {
  assert.ok(Math.abs(M.varScale([1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(M.varScale([1 / 3, 1 / 3, 1 / 3]) - Math.sqrt(3)) < 1e-9);
});

test("biplanar weights: sum 1, follow the dominant axis, split a flat top face evenly", () => {
  for (let a = 0; a <= Math.PI * 2; a += 0.05) {
    const [wx, wz] = M.biplanar(Math.cos(a), Math.sin(a));
    assert.ok(Math.abs(wx + wz - 1) < 1e-9);
    if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) + 1e-6) assert.ok(wx > wz, `x-major at ${a}`);
  }
  assert.ok(M.biplanar(1, 0)[0] > 0.999999, "a +x face is all (z,y) plane");
  assert.ok(M.biplanar(0, -1)[1] > 0.999999, "a -z face is all (x,y) plane");
  assert.deepEqual(M.biplanar(0, 0), [0.5, 0.5], "a flat top face splits 50/50 instead of 0/0");
  const d = M.biplanar(Math.SQRT1_2, Math.SQRT1_2);
  assert.ok(Math.abs(d[0] - 0.5) < 1e-9, "45 degrees blends evenly");
});

async function build(ctxExtra, language, spy) {
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true });
  await renderer.init();
  const arr = () => {
    const t = new THREE.DataArrayTexture(new Uint8Array(17 * 4), 1, 1, 17);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  };
  const cube = new THREE.CubeRenderTarget(4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const lit = globalThis.TLXShaders.lit(THREE, spy ? spy.TSL : THREE.TSL, Object.assign({
    chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16,
    matMaps: { albedo: arr(), normal: arr() }, envCube: cube.texture }, ctxExtra));
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const g = new THREE.BufferGeometry();
  for (const [n, k] of [["position", 3], ["normal", 3], ["color", 3], ["mat", 1], ["trk", 3], ["instanceTint", 3]])
    g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k * 3), k));
  const m = new THREE.Mesh(g, lit.makeMaterial({})); m.frustumCulled = false; scene.add(m);
  renderer.backend.utils.getTextureSampleData = () => ({ primarySamples: 1 });
  const B = language === "wgsl" ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder;
  const b = new B(m, renderer); b.scene = scene; b.camera = cam; b.build();
  const out = { fs: b.fragmentShader, detail: lit.detail, lit, calls: spy ? spy.calls : null };
  g.dispose(); m.material.dispose(); renderer.dispose();
  return out;
}

// The ramps the built program fades by distance: every clamp(1 - (d - a) / b, 0, 1), read as [a, a + b] metres.
function reaches(calls) {
  const out = new Set();
  for (const c of calls) {
    if (c.k !== "clamp" || c.a[1] !== 0 || c.a[2] !== 1 || !c.a[0].type) continue;
    const d = nodesIn(c.a[0], (n) => n.type === "OperatorNode" && n.op === "-" && n.bNode.type === "ConstNode")[0];
    if (!d) continue;
    let r0, r1;
    try { [r0] = tslEval(c.a[0], (n) => (n.id === d.aNode.id ? 0 : undefined)); [r1] = tslEval(c.a[0], (n) => (n.id === d.aNode.id ? 1 : undefined)); }
    catch (_) { continue; }
    const slope = r1 - r0;   // linear in d: 1 at the start of the ramp, 0 at its end
    if (slope < 0) out.add(`${+((1 - r0) / slope).toFixed(3)}-${+(-r0 / slope).toFixed(3)}`);
  }
  return out;
}

// Each env cubeTexture tap's level as "world|car" rows over roughness (0.04, 0.25, 1): the select on the car mask and
// the roughness input are the level graph's only free inputs.
function envLods(calls) {
  const rows = new Set();
  for (const c of calls) {
    if (c.k !== "cubeTexture" || !c.a[2] || !c.a[2].type) continue;
    const cond = new Set(nodesIn(c.a[2], (n) => n.type === "ConditionalNode").map((n) => n.condNode.id));
    // The roughness: the first node on each path the graph cannot evaluate by itself (it is a varying of the fragment).
    const rough = new Set(), solo = (n) => { try { tslEval(n, () => undefined); return true; } catch (_) { return false; } };
    const row = (car) => [0.04, 0.25, 1].map((r) => +tslEval(c.a[2], (n) => (cond.has(n.id) ? +car
      : n.type === "VarNode" && !solo(n) ? (rough.add(n.id), r) : undefined))[0].toFixed(6));
    const rowW = row(false), rowC = row(true);
    assert.equal(rough.size, 1, "one roughness input per env tap");
    rows.add(`${rowW}|${rowC}`);
  }
  return [...rows].sort();
}

test("the built matDetail graph computes the twin's hex and biplanar weights, at twice today's reach", async () => {
  const on = await build({ detail: { matDetail: true } }, "glsl", spyTSL());
  const off = await build({}, "glsl", spyTSL());
  const C = on.calls;
  // a. the hex grid: the step that picks the triangle, the gain's normaliser, the barycentric weights and the uv input.
  const steps = C.filter((c) => c.k === "step" && nodesIn(c.a[1], (n) => n.method === "fract").length);
  const sums = C.filter((c) => c.k === "max" && c.a[0].op === "+" && steps.some((s) => has(c.a[0], s.r.id)));
  assert.ok(sums.length >= 2, "the hex grid is built for the normal and the albedo taps");
  for (const sum of sums) {
    const g = nodesIn(sum.a[0], (n) => n.type === "SplitNode")[0].node;
    const w = nodesIn(g, (n) => n.type === "VarNode" && steps.some((s) => has(n, s.r.id)))[0];
    const uv = nodesIn(w, (n) => n.type === "OperatorNode" && n.op === "*" && n.bNode.type === "ConstNode" && n.aNode.type === "VarNode"
      && !steps.some((s) => has(n.aNode, s.r.id))).map((n) => n.aNode);
    assert.equal(new Set(uv.map((n) => n.id)).size, 1, "one uv input feeds the grid");
    for (const [u, v] of pts) {
      const at = (n) => (n.id === uv[0].id ? [u, v] : undefined);
      const twin = M.hexGrid(u, v), gs = tslEval(g, at), norm = tslEval(sum.r, at)[0];
      tslEval(w, at).forEach((x, i) => assert.ok(Math.abs(x - twin.bary[i]) < 1e-9, `barycentric ${i} at ${u},${v}`));
      gs.forEach((x, i) => assert.ok(Math.abs(x / norm - twin.w[i]) < 1e-9, `gained weight ${i} at ${u},${v}`));
    }
  }
  // b. the biplanar wall weights: vec2(|n.x|^4 + eps, |n.z|^4 + eps) over the geometric normal.
  const absIds = new Set(C.filter((c) => c.k === "abs").map((c) => c.r.id));
  const biW = C.filter((c) => c.k === "vec2" && c.a.length === 2 && c.a.every((x) => x && x.type === "OperatorNode" && x.op === "+"
    && nodesIn(x, (n) => absIds.has(n.id)).length));
  assert.ok(biW.length >= 2, "biplanar weights for the wall normal and albedo");
  for (const c of biW) {
    const nIn = nodesIn(c.a[0], (n) => absIds.has(n.id))[0].aNode;
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
      const at = (n) => (n.id === nIn.id ? [Math.cos(a), 0.3, Math.sin(a)] : undefined);
      const [wx, wz] = c.a.map((x) => tslEval(x, at)[0]), twin = M.biplanar(Math.cos(a), Math.sin(a));
      assert.ok(Math.abs(wx / (wx + wz) - twin[0]) < 1e-9 && Math.abs(wz / (wx + wz) - twin[1]) < 1e-9, `biplanar at ${a}`);
    }
  }
  // e. the distance ramps matDetail adds: baked normal 44->160 m and albedo 180->520 m, twice today's 22->80 and
  // 90->260 (both still in the off program), plus the parallax (4->20 m) and detail-normal (6->15 m) fades.
  const rOn = reaches(C), rOff = reaches(off.calls);
  for (const r of ["22-80", "90-260"]) assert.ok(rOff.has(r), `today's ${r} m fade`);
  assert.deepEqual([...rOn].filter((r) => !rOff.has(r)).sort(), ["180-520", "4-20", "44-160", "6-15"]);
});
const has = (root, id) => nodesIn(root, (n) => n.id === id).length > 0;
const zip = (a, b, f) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => f(a[a.length > 1 ? i : 0], b[b.length > 1 ? i : 0]));
const OPS = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b };
const MATH = { negate: (a) => -a, oneMinus: (a) => 1 - a, floor: Math.floor, fract: (a) => a - Math.floor(a), abs: Math.abs,
  sqrt: Math.sqrt, step: (e, x) => (x < e ? 0 : 1), max: Math.max, min: Math.min };
function tslEval(node, leaf) {
  const ev = (n) => {
    const v = leaf(n);
    if (v !== undefined) return [].concat(v);
    switch (n.type) {
      case "ConstNode": return typeof n.value === "number" ? [n.value] : n.value.toArray();
      case "VarNode": case "ConvertNode": return ev(n.node);
      case "SplitNode": { const a = ev(n.node); return [...n.components].map((c) => a["xyzw".indexOf(c)]); }
      case "JoinNode": return n.nodes.flatMap(ev);
      case "ConditionalNode": return ev(n.condNode)[0] ? ev(n.ifNode) : ev(n.elseNode);
      case "OperatorNode": return zip(ev(n.aNode), ev(n.bNode), OPS[n.op]);
      case "MathNode":
        if (n.method === "clamp") return zip(zip(ev(n.aNode), ev(n.bNode), Math.max), ev(n.cNode), Math.min);
        if (MATH[n.method]) return n.bNode ? zip(ev(n.aNode), ev(n.bNode), MATH[n.method]) : ev(n.aNode).map(MATH[n.method]);
    }
    throw new Error(`tslEval: no reading for ${n.type} ${n.op || n.method || ""}`);
  };
  return ev(node);
}
for (const language of ["wgsl", "glsl"]) {
  test(`${language}: features off build today's program; on adds the explicit-gradient taps`, async () => {
    await build({}, language);   // warm-up: three orders the shared render-struct members by first registration
    const none = await build({}, language, spyTSL());
    const off = await build({ detail: { matDetail: false, envAll: false, envLods: 7 } }, language);
    assert.equal(off.fs, none.fs, "detail flags false = no detail ctx, byte for byte");
    assert.deepEqual(none.detail, { matDetail: false, envAll: false });
    const grad = language === "wgsl" ? /textureSampleGrad\(/g : /textureGrad\(/g;
    assert.equal((none.fs.match(grad) || []).length, 0, "no gradient taps below EXTREME");
    const on = await build({ detail: { matDetail: true, envAll: true, envLods: 7 } }, language, spyTSL());
    assert.deepEqual(on.detail, { matDetail: true, envAll: true });
    // normal: 2 biplanar + 3 hex + 1 plain + 1 detail; albedo: 2 + 3 + 1; parallax: MD_POM_STEPS (6).
    assert.equal((on.fs.match(grad) || []).length, 19, "every matDetail tap takes explicit gradients");
    // The env cube taps' mip level, read off the graph at roughness 0.04 / 0.25 / 1 on a world and on a car pixel.
    const today = ["0.1,0.625,2.5|0.1,0.625,2.5"];
    assert.deepEqual(envLods(none.calls), today, "today: rough x 2.5 everywhere");
    assert.deepEqual(envLods(on.calls), [today[0], "1.4,3.5,7|0.1,0.625,2.5", "1.4,3.5,7|1.4,3.5,7"],
      "envAll: the probe tap's world pixels and the world-metal tap take sqrt(rough) x ENV_LODS; car pixels and the other taps keep today's");
    const matOnly = await build({ detail: { matDetail: true, envAll: false } }, language, spyTSL());
    assert.deepEqual(envLods(matOnly.calls), today, "envAll off keeps today's env LOD");
  });
}

test("Silverstone surface pilot builds in both shader languages and resets when the circuit changes", async () => {
  for (const lang of ["wgsl", "glsl"]) {
    const off = await build({}, lang);
    assert.equal(off.lit.uniforms.silverstoneSurface, undefined);
    const enabled = await build({ circuitSurfaces: true }, lang);
    assert.notEqual(enabled.fs, off.fs);
    const { uniforms, updateFrame } = enabled.lit;
    for (const wetness of [0, 1]) {
      for (const trackId of ["silverstone", "spa", undefined]) {
        updateFrame({ trackId, wetness });
        assert.equal(uniforms.silverstoneSurface.value, Number(trackId === "silverstone"));
      }
    }
  }
});

test("#6509 closeLayers / wearMask: off = today's program; on = one branch lit only by setTrackWear", async () => {
  for (const lang of ["wgsl", "glsl"]) {
    await build({}, lang);   // warm-up: three orders the shared render-struct members by first registration
    const off = await build({}, lang);
    const none = await build({ closeLayers: false, wearMask: false }, lang);
    assert.equal(none.fs, off.fs, "both flags false = today's program, byte for byte");
    assert.equal(off.lit.surface, null);
    assert.equal(off.lit.setTrackWear({ def: { surfaceDetail: true } }), false, "no branch compiled in");
    for (const flags of [{ closeLayers: true }, { wearMask: true }, { closeLayers: true, wearMask: true }]) {
      const on = await build(flags, lang);
      assert.notEqual(on.fs, off.fs, JSON.stringify(flags));
      const { surface, setTrackWear } = on.lit;
      assert.equal(surface.surfOn.value, 0, "starts off until a circuit opts in");
      const data = new Uint8Array(2048 * 4).fill(128);
      assert.equal(setTrackWear({ data, width: 2048, length: 5793 }), true);
      assert.equal(surface.surfOn.value, 1);
      assert.equal(surface.surfLen.value, 5793);
      assert.equal(setTrackWear(null), false, "a circuit without surfaceDetail");
      assert.equal(surface.surfOn.value, 0);
      assert.equal(setTrackWear({ data: new Uint8Array(4), width: 1, length: 1 }), false, "wrong size is refused");
      assert.equal(setTrackWear({ def: {}, n: 4, total: 40, line: new Float32Array(4) }), false, "a track without the flag");
      assert.equal(surface.surfOn.value, 0);
    }
    const both = await build({ closeLayers: true, wearMask: true }, lang);
    const kerbOnly = await build({ closeLayers: true }, lang);
    assert.notEqual(both.fs, kerbOnly.fs, "wearMask adds its own terms");
  }
});

test("garage box projection builds on WebGPU using the existing cube taps", async () => {
  const ordinary = await build({}, "wgsl");
  const garage = await build({ garageProbeRequested: true }, "wgsl");
  const taps = (program) => (program.match(/textureSampleLevel\(/g) || []).length;
  assert.ok(taps(ordinary.fs) > 0);
  assert.equal(taps(garage.fs), taps(ordinary.fs));
  assert.equal(ordinary.lit.uniforms.garageBox, undefined);
  assert.equal(garage.lit.uniforms.garageBoxOn.value, 0, "the race starts with ordinary reflections");
  assert.notEqual(garage.fs, ordinary.fs);
});

test("envAll needs a live cube: without one it compiles out, and setEnvStr's live bit drives envWorld", async () => {
  const lit = globalThis.TLXShaders.lit(THREE, THREE.TSL, { chunks: globalThis.TLXShaders.chunks(THREE, THREE.TSL), maxLights: 16,
    detail: { envAll: true, envLods: 7 } });
  assert.deepEqual(lit.detail, { matDetail: false, envAll: false }, "no cube, no pack: both features compile out");
  assert.equal(lit.uniforms.envWorld, undefined);
  const on = await build({ detail: { envAll: true, envLods: 7 } }, "wgsl");
  on.lit.setEnvStr(0.3, true);
  assert.equal(on.lit.uniforms.envWorld.value, 1);
  on.lit.setEnvStr(0.3, false);
  assert.equal(on.lit.uniforms.envWorld.value, 0);
  assert.equal(on.lit.uniforms.envStr.value, 0.3);
});

// tlx.js create() cannot boot in node, so its two decisions run here as they are written there: the litDetail block
// (feature request + the retry) and present()'s setEnvStr call, each lifted out by its code structure and executed.
function tlxBlock(head, tail) {
  const i = TLX.indexOf(head), ls = TLX.lastIndexOf("\n", i) + 1, indent = TLX.slice(ls, i);
  const j = TLX.indexOf(tail, i);
  if (i < 0 || j < 0) throw new Error(`tlx.js no longer holds ${head} … ${tail}: re-anchor this test`);
  return TLX.slice(i, TLX.indexOf("\n" + indent + "}", j) + indent.length + 2);
}
const LIT_DETAIL = new Function("isMobile", "GfxQuality", "renderer", "TLXShaders", "THREE", "TSL", "litCtx", "ENV_SIZE", "Log",
  "let lit;\n" + tlxBlock("let litDetail = null;", "lit = TLXShaders.lit(THREE, TSL, litCtx);") + "\nreturn lit;");
test("garage capture refreshes discrete room lighting once, and discards it at exit", () => {
  const start = TLX.indexOf("let garageProbeRoom =");
  const end = TLX.indexOf("function _restoreEnvFrame()", start);
  const run = new Function("record", `
    let envReady = true, _envGaveUp = false, _warmPending = false, _envActive = false;
    const scene = {}, hideSkyMesh = () => {}, resetRecs = () => {}, lit = { setEnvStr() {} };
    const backend = {
      envProbeReset() { envReady = false; _envGaveUp = false; garageProbeFace = 0; record.push("reset"); },
      envFaceBegin(face) { record.push(face); return true; },
      envFaceEnd(face) { if (face === 5) envReady = true; },
    };
    ${TLX.slice(start, end)}
    return { frame: probe => captureGarageFace(probe, {}), leave: leaveGarageProbe, ready: () => envReady };
  `);
  const record = [], capture = run(record);
  const probe = { room: {}, mood: "day", centre: [0, 2, 0], draw() {} };
  for (let i = 0; i < 10; i++) capture.frame(probe);
  assert.deepEqual(record, ["reset", 0, 1, 2, 3, 4, 5]);
  assert.equal(capture.ready(), true);
  for (const update of [{ inspection: "side" }, { inspection: "front" }, { inspection: "" }, { night: true }]) {
    Object.assign(probe, update);
    const at = record.length;
    for (let i = 0; i < 12; i++) capture.frame(probe);
    assert.deepEqual(record.slice(at), ["reset", 0, 1, 2, 3, 4, 5], "one completed cycle per discrete light change");
  }
  const at = record.length;
  probe.mood = "night";
  capture.frame(probe);
  capture.frame(probe);
  probe.room = {};
  capture.frame(probe);
  capture.leave();
  capture.leave();
  assert.deepEqual(record.slice(at), ["reset", 0, 1, "reset", 0, "reset"]);
  assert.equal(capture.ready(), false);
});
const ENV_STR = new Function("lit", "frame", "envRT", "envReady", "_envBlank", "_envActive", tlxBlock("if (lit.setEnvStr) {", "lit.setEnvStr("));

test("tlx.js asks for the features on desktop WebGPU only, and retries today's program if the detail factory throws", () => {
  const run = ({ mobile = false, webgpu = true, on = ["matDetail", "envAll"], throws = () => false } = {}) => {
    const asked = [], warned = [];
    const T = { lit: (_3, _t, ctx) => { asked.push(ctx.detail || null); if (throws(ctx)) throw new Error("factory"); return { ctx }; } };
    const lit = LIT_DETAIL(mobile, { feature: (n) => on.includes(n) }, { backend: { isWebGPUBackend: webgpu } }, T, {}, {},
      { chunks: 1 }, 256, { warn: (...a) => warned.push(a[0]) });
    return { asked, warned, lit };
  };
  assert.deepEqual(run().asked, [{ matDetail: true, envAll: true, envLods: 8 }], "desktop WebGPU: both features, envLods = log2(ENV_SIZE)");
  assert.equal(run().lit.ctx.chunks, 1, "the detail ctx rides on the shared lit ctx");
  assert.deepEqual(run({ on: ["envAll"] }).asked, [{ matDetail: false, envAll: true, envLods: 8 }]);
  assert.deepEqual(run({ on: [] }).asked, [null], "neither feature on: today's ctx, no detail");
  assert.deepEqual(run({ mobile: true }).asked, [null], "phones never ask");
  assert.deepEqual(run({ webgpu: false }).asked, [null], "three's WebGL2 backend never asks");
  const retry = run({ throws: (ctx) => !!ctx.detail });
  assert.deepEqual(retry.asked, [{ matDetail: true, envAll: true, envLods: 8 }, null], "a throwing detail factory retries without detail");
  assert.deepEqual(retry.warned, ["gfx"]);
  assert.equal(retry.lit.ctx.detail, undefined);
  assert.throws(() => run({ on: [], throws: () => true }), /factory/, "today's factory throwing still throws (the unlit fallback)");
});

test("present() feeds setEnvStr the CAR knob and the live-probe bit", () => {
  const call = (frame, live = {}) => {
    const got = [];
    ENV_STR({ setEnvStr: (v, live) => got.push([v, !!live]) }, frame, "envRT" in live ? live.envRT : {}, live.envReady ?? true,
      live.blank ?? false, live.active ?? false);
    return got;
  };
  assert.deepEqual(call({ tune: { carEnvCube: 0.4 } }), [[0.4, true]]);
  assert.deepEqual(call({ tune: {} }), [[0, true]], "no CAR knob: 0, the probe still live for envAll");
  assert.deepEqual(call({ tune: { carEnvCube: 0.4 }, noEnv: true }), [[0, false]]);
  for (const live of [{ envRT: null }, { envReady: false }, { blank: true }, { active: true }])
    assert.deepEqual(call({ tune: { carEnvCube: 0.4 } }, live), [[0, false]], JSON.stringify(live));
});

test("hot brake spill compiles with the static cell grid and resets the moving suffix as the discs cool", async () => {
  for (const language of ["wgsl", "glsl"]) {
    const tex = () => new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    const lampGrid = { gridTex: tex(), idxTex: tex(), lampTex: tex(), G: 1, IDXW: 1, LAMPS: 1 };
    const off = await build({ lampGrid }, language);
    assert.equal(off.lit.uniforms.brakeSpillCount, undefined);
    const on = await build({ lampGrid, brakeSpill: true }, language);
    assert.notEqual(off.fs, on.fs);
    const { uniforms, updateFrame } = on.lit;
    const lights = new Float32Array(16 * 15);
    for (const count of [2, 0]) {
      updateFrame({ lights, brakeSpillCount: count });
      assert.equal(uniforms.numLights.value, 16);
      assert.equal(uniforms.brakeSpillCount.value, count);
      assert.equal(uniforms.lampCap.value, 16);
    }
  }
});
