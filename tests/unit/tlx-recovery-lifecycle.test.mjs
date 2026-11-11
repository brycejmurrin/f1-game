/* Renderer recovery contracts: actual vendored Three/TSL factories and lifecycle
 * ownership. Fake compilation/GL dispatch supplies no pixel or handset evidence. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { vendorModule, bindImports } from "../helpers/vendor-class.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const TSL = THREE.TSL;
const tlx = read("js/render/three/tlx.js");
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `source boundaries: ${from} -> ${to}`);
  return src.slice(a, b);
}
function load(ctx, paths) {
  for (const f of paths) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
}

// Exact vendor ownership code, including the strong RenderObjects Set and
// object/material event cleanup. Only hash/compiler/backend managers are stubs.
// Located by method names (terser renames the classes on every regeneration), with the module-level
// declarations they read (vendor-class.mjs).
const vendor = vendorModule(read("vendor/three-0.187.0/three.webgpu.min.js"));
const roNode = vendor.classWith("getDynamicCacheKey", "getMaterialCacheKey");
const rosNode = vendor.classWith("createRenderObject", "getChainMap");
const { code: roCode, imports: roImports } = vendor.closure([roNode, rosNode]);
const roCtx = bindImports(roImports, THREE, TSL);
const { RO, ROs } = new Function(...Object.keys(roCtx), `${roCode} return {RO:${roNode.id.name},ROs:${rosNode.id.name}};`)(...Object.values(roCtx));
RO.prototype.getDynamicCacheKey = () => 0;
RO.prototype.getCacheKey = () => 0;
function shadowHarness() {
  const originalTarget = {}, nodes = { delete() {} }, bindings = { deleteForRender() {} }, lightsNode = new THREE.EventDispatcher();
  let target = originalTarget, fail = false, material, scene, deletes = 0, geometryDisposals = 0;
  const renderer = { render() {}, backend: { isWebGPUBackend: true, deleteVertexState() {} },
    coordinateSystem: THREE.WebGPUCoordinateSystem, _currentSourceMaterial: null,
    getRenderTarget: () => target, setRenderTarget(t) { target = t; } };
  const pipelines = { backend: renderer.backend, delete() { deletes++; } };
  const geometries = { deleteVertexState() {} }; // r187 releases the vertex state through Geometries
  const ros = new ROs(renderer, nodes, geometries, pipelines, bindings, {});
  ros.getChainMap = () => ({ delete() {} });
  renderer.compileAsync = async (s, camera) => {
    scene = s;
    s.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      material = m.material;
      if (!m.geometry.__counted) {
        m.geometry.__counted = true;
        m.geometry.addEventListener("dispose", () => geometryDisposals++);
      }
      ros.createRenderObject(nodes, geometries, renderer, m, m.material, s, camera, lightsNode, {}, null, "default"); // r187 listens on the lights node
    });
    if (fail) throw Error("injected partial compile failure");
  };
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Float32Array, Uint16Array });
  load(ctx, ["js/render/three/tlx-shadow.js"]);
  const sys = ctx.window.TLXShaders.shadowSys(THREE, TSL, { renderer, isMobile: true, mobileTier: true });
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  return { sys, ros, source, renderer, originalTarget, fail(v) { fail = v; },
    stats: () => ({ deletes, geometryDisposals, listeners: material?._listeners.dispose.length || 0 }),
    detached: () => [...ros._renderObjects].every((ro) => ro.object.parent === null) && !scene.children.some((m) => m.isMesh),
    dispose() { material?.dispose(); source.dispose(); } };
}

test("shadow replacement warm retires old render objects as well as geometry", async (t) => {
  const h = shadowHarness(); t.after(() => h.dispose());
  for (let i = 0; i < 8; i++) {
    await h.sys.warm([h.source]);
    assert.equal(h.ros._renderObjects.size, 2);
    assert.deepEqual(h.stats(), { deletes: i * 2, geometryDisposals: i, listeners: 2 });
    assert.equal(h.detached(), true);
    assert.equal(h.renderer.getRenderTarget(), h.originalTarget);
  }
});

test("partial shadow warm failure retires new probes and retains last successful holders", async (t) => {
  const h = shadowHarness(); t.after(() => h.dispose());
  await h.sys.warm([h.source]);
  const old = [...h.ros._renderObjects];
  h.fail(true);
  await assert.rejects(h.sys.warm([h.source]), /partial compile failure/);
  assert.deepEqual([...h.ros._renderObjects], old);
  assert.deepEqual(h.stats(), { deletes: 2, geometryDisposals: 1, listeners: 2 });
  assert.equal(h.sys.S.probeLayouts, 1);
  assert.equal(h.detached(), true);
  assert.equal(h.renderer.getRenderTarget(), h.originalTarget);
  h.fail(false);
  await h.sys.warm([h.source]);
  assert.equal(h.ros._renderObjects.size, 2);
  assert.ok([...h.ros._renderObjects].every((ro) => !old.includes(ro)));
});

test("first shadow warm failure leaves no retained probe render objects", async (t) => {
  const h = shadowHarness(); t.after(() => h.dispose()); h.fail(true);
  await assert.rejects(h.sys.warm([h.source]), /partial compile failure/);
  assert.equal(h.ros._renderObjects.size, 0);
  assert.deepEqual(h.stats(), { deletes: 2, geometryDisposals: 1, listeners: 0 });
  assert.equal(h.renderer.getRenderTarget(), h.originalTarget);
});

for (const initialFailure of [true, false]) {
  test(`SSR materials retain capability across post recovery (initial failure=${initialFailure})`, () => {
    let builds = 0;
    const target = () => ({ tagOn: () => true, resize() {}, hdrOk: () => true });
    const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {} }, THREE, TSL,
      post: initialFailure ? null : target(), fx: {}, lit: null, renderer: { setMRT() {} },
      shadowSys: null, envRT: null, matMaps: null, lampGrid: null, _sharedUniforms: true, _liteGpu: true,
      _warmPending: null, W: 640, H: 360, presentW: 640, presentH: 360, performance: { now: () => 100 },
      buildPost() { builds++; return target(); } });
    load(ctx, ["js/render/shared/light-budget.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-lit.js"]);
    vm.runInContext("globalThis.TLXShaders = window.TLXShaders; globalThis.chunks = TLXShaders.chunks(THREE, TSL);", ctx);
    vm.runInContext(slice(tlx, "          lit = TLXShaders.lit(THREE, TSL, {", "\n        }"), ctx, { filename: "vm-snippet:tlx-lit-recovery" });
    const existing = ctx.lit.makeMaterial({ carPaint: 1 });
    assert.equal(existing.mrtNode, null, "canvas starts without MRT");
    const key = existing.customProgramCacheKey(), output = existing.outputNode, opacity = existing.opacityNode;
    if (initialFailure) {
      vm.runInContext(slice(tlx, "      let _postStrikes =", "      const ENV_SIZE"), ctx, { filename: "vm-snippet:tlx-post-lifecycle" });
      const manual = slice(tlx, "        retryPost() {", "\n        },") + "\n        }";
      vm.runInContext("globalThis.retry = ({" + manual + "}).retryPost;", ctx, { filename: "vm-snippet:tlx-manual-post-retry" });
      assert.equal(ctx.retry(), true);
      vm.runInContext(slice(tlx, "          if (_postRebuild && !post && !_warmPending", "          _tagSwap();"), ctx, { filename: "vm-snippet:tlx-post-rebuild" });
    }
    assert.equal(builds, initialFailure ? 1 : 0);
    assert.equal(ctx.post.tagOn(), true);
    ctx.lit.setSsrMrt(true);
    assert.ok(existing.mrtNode, "existing car emits its receiver tag after recovery");
    const later = ctx.lit.makeMaterial({ carPaint: 0.8 });
    ctx.lit.setSsrMrt(true);
    assert.ok(later.mrtNode, "new materials also have tag capability");
    ctx.lit.setSsrMrt(false);
    assert.equal(existing.mrtNode, null); assert.equal(later.mrtNode, null);
    assert.equal(existing.customProgramCacheKey(), key);
    assert.equal(existing.outputNode, output); assert.equal(existing.opacityNode, opacity);
    // Post-present failure after successful boot must also rearm the same graphs.
    ctx.lit.setSsrMrt(true); assert.ok(existing.mrtNode);
    existing.dispose(); later.dispose();
  });
}

test("post SSR diagnostics agree with uploaded road/car gates and required camera data", async (t) => {
  installThreeGlobals();
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {}, info() {} }, Float32Array });
  load(ctx, ["js/render/shared/light-budget.js", "js/lighting/knobs.js", "js/render/shared/post-common.js", "js/render/three/tsl-chunks.js", "js/render/three/tsl-post.js", "js/render/three/tlx-post.js"]);
  vm.runInContext("globalThis.TLXShaders = window.TLXShaders", ctx);
  let graph;
  const actualPost = ctx.TLXShaders.post;
  ctx.TLXShaders.post = (...args) => (graph = actualPost(...args));
  const fg = makeFakeGL(844, 390);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init(); t.after(() => renderer.dispose());
  const post = ctx.TLXShaders.postChain(THREE, TSL, { renderer, isMobile: true, chunks: ctx.TLXShaders.chunks(THREE, TSL), shadow: null, wantSpatialUpscale: () => false });
  t.after(() => post.dispose()); post.resize(844, 390);
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.1, 1000);
  const proj = camera.projectionMatrix.toArray(), invProj = camera.projectionMatrixInverse.toArray();
  const F = { proj, invProj, invVP: invProj, viewProj: proj, upVS: [0, 1, 0], sunVS: [0, 0, -1], sunDir: [0, -1, 0], sunColor: [0.05, 0.05, 0.08], time: 0 };
  const base = { ssao: 0, contact: 0, godray: 0, bloom: 0, reflect: 0, flareMul: 0 };
  for (const [extra, frame, expected] of [
    [{}, F, true], // default car .05 with road sheen explicitly disabled
    [{ carReflect: 0 }, F, false],
    [{ carReflect: 0, reflect: 0.1 }, F, true],
    [{ carReflect: 0.1 }, { ...F, upVS: null }, false],
    [{ carReflect: 0.1 }, { ...F, proj: null }, false],
  ]) {
    const opts = { ...base, ...extra }; post.present(opts, frame);
    const C = graph.composite.U;
    assert.equal(post.state().blocks.ssr, expected);
    assert.equal(post.state().blocks.ssr, C.ssrOk.value > 0.5 && (C.reflect.value > 0.001 || C.carReflect.value > 0.001));
    assert.equal(post.needsDepth(opts, frame), expected);
  }
});
