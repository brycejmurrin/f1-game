/* tlx-mem.test.mjs — TLXShaders.memCensus (js/render/three/tlx-mem.js): the byte census GLX.texCensus() gives on
 * the three path. Real vendored three objects in a stub registry: this pins the ARITHMETIC and the shape. It is
 * not evidence about a GPU: nothing here allocates one, and the census itself only reads JS objects. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";

const ctx = vm.createContext({ Math, Set, Object, Array });
ctx.window = ctx;
let liveHandler = null;
ctx.addEventListener = (name, fn) => { if (name === "apex-gfx-live") liveHandler = fn; };
vm.runInContext(fs.readFileSync(new URL("../../js/render/three/tlx-mem.js", import.meta.url), "utf8"), ctx, { filename: absSrc("js/render/three/tlx-mem.js") });
const { memCensus, memInstall } = ctx.TLXShaders;

/** A fake __tlx whose renderer tracks `objs` the way r187's Textures does (WeakRefs; targets and textures). */
function tlx(objs, { backend = null, memory = {}, depthOf = new Map(), canvas = null, lost = false } = {}) {
  const tracked = new Set(objs.map((o) => new WeakRef(o)));
  return { THREE, ctxLost: () => lost,
    renderer: { backend, _textures: { _tracked: tracked, get: (o) => ({ depthTexture: depthOf.get(o) || null }) }, info: { memory }, domElement: canvas } };
}
const chain = (w, h, bpt) => { let t = 0; for (let i = 0; i <= Math.floor(Math.log2(Math.max(w, h))); i++) t += Math.max(1, w >> i) * Math.max(1, h >> i) * bpt; return t; };

test("an empty registry is a measured zero, not an absent census", () => {
  const c = memCensus(tlx([]));
  assert.equal(c.supported, true);
  assert.deepEqual([c.bytes, c.count, c.mb, c.biggest], [0, 0, 0, null]);
  assert.ok(c.excludes.length >= 4 && c.estimated.length >= 2, "the blind spots travel with every answer");
});

test("an unreadable registry says so instead of reporting zero", () => {
  const c = memCensus({ THREE, renderer: {} });
  assert.deepEqual([c.supported, c.bytes, c.count], [false, null, null]);
  assert.equal(typeof c.error, "string");
  assert.equal(memCensus(null).supported, false);
});

test("WebGL fallback estimate: format bytes, exact non-square mip chains, MSAA and depth", () => {
  const hdr = new THREE.RenderTarget(959, 414, { type: THREE.HalfFloatType, depthBuffer: false });               // rgba16float
  const packed = new THREE.RenderTarget(959, 414, { type: THREE.UnsignedInt101111Type, format: THREE.RGBFormat, depthBuffer: false });   // rg11b10ufloat
  const ao = new THREE.RenderTarget(480, 207, { format: THREE.RedFormat, depthBuffer: false });                 // r8unorm
  const mir = new THREE.RenderTarget(138, 39, { generateMipmaps: true, depthBuffer: false });                   // rgba8 + mips
  const msaa = new THREE.RenderTarget(640, 360, { samples: 4, depthBuffer: true });
  const autoDepth = new THREE.DepthTexture(640, 360);
  const c = memCensus(tlx([hdr, packed, ao, mir, msaa], { backend: new THREE.WebGLBackend(), depthOf: new Map([[msaa, autoDepth]]) }), 99);
  const want = {
    hdr: 959 * 414 * 8, packed: 959 * 414 * 4, ao: 480 * 207, mir: chain(138, 39, 4),
    msaaColour: 640 * 360 * 4 * (1 + 4), msaaDepth: 640 * 360 * 4 * (1 + 4),
  };
  assert.equal(c.count, 6);
  assert.equal(c.byKind.renderTarget, want.hdr + want.packed + want.ao + want.mir + want.msaaColour);
  assert.equal(c.byKind.rtDepth, want.msaaDepth);
  assert.equal(c.biggest.bytes, want.msaaColour);
  assert.deepEqual([c.biggest.w, c.biggest.h, c.biggest.samples], [640, 360, 4]);
  assert.notEqual(want.mir, Math.round(138 * 39 * 4 * 4 / 3), "the chain is counted, not the 4/3 rule");
  assert.equal(c.targets.length, 6);
});

test("a resized target is counted at its CURRENT size (three's own figure is recorded once)", () => {
  const rt = new THREE.RenderTarget(959, 414, { type: THREE.HalfFloatType, depthBuffer: false });
  const t = tlx([rt], { memory: { texturesSize: 959 * 414 * 8, textures: 1, renderTargets: 1, total: 959 * 414 * 8 } });
  assert.equal(memCensus(t).bytes, 959 * 414 * 8);
  rt.setSize(831, 359);
  const c = memCensus(t);
  assert.equal(c.byKind.renderTarget, 831 * 359 * 8);
  assert.equal(c.three.texturesSize, 959 * 414 * 8, "three's number is kept beside ours for the comparison");
});

test("textures: material arrays by layer with mips, float data, a canvas livery; a texture with no size is skipped", () => {
  const arr = new THREE.DataArrayTexture(null, 1024, 1024, 17); arr.generateMipmaps = true;
  const lamps = new THREE.DataTexture(null, 64, 4, THREE.RGBAFormat, THREE.FloatType);
  const livery = new THREE.Texture({ width: 2048, height: 1024 }); livery.generateMipmaps = false;   // three's default is true: a chain
  const empty = new THREE.Texture();
  const c = memCensus(tlx([arr, lamps, livery, empty]));
  assert.equal(c.count, 3);
  assert.equal(c.byKind.materialArray, chain(1024, 1024, 4) * 17);
  assert.equal(c.byKind.data, 64 * 4 * 16);
  assert.equal(c.byKind.content2D, 2048 * 1024 * 4);
  assert.deepEqual([c.biggest.kind, c.biggest.layers, c.biggest.mips], ["materialArray", 17, 11]);
});

test("released canvas sources and closed pooled bitmaps keep the GPU allocation's dimensions", () => {
  const canvas = new THREE.Texture({ width: 1, height: 1 });
  Object.assign(canvas, { __tlxPoolW: 512, __tlxPoolH: 640 });
  const bitmap = new THREE.Texture({ width: 0, height: 0 });
  Object.assign(bitmap, { __tlxPoolW: 2048, __tlxPoolH: 2560 });
  const c = memCensus(tlx([canvas, bitmap]));
  assert.equal(c.count, 2);
  assert.equal(c.byKind.content2D, chain(512, 640, 4) + chain(2048, 2560, 4));
  assert.deepEqual([c.biggest.w, c.biggest.h, c.biggest.mips], [2048, 2560, 12]);
});

test("a texture reached twice (through its target and on its own) is counted once", () => {
  const rt = new THREE.RenderTarget(100, 50, { depthBuffer: false });
  const c = memCensus(tlx([rt, rt.texture]));
  assert.deepEqual([c.count, c.bytes], [1, 100 * 50 * 4]);
});

test("buffers come from three's byte counts and join the total; the swapchain is beside it, never inside", () => {
  const rt = new THREE.RenderTarget(10, 10, { depthBuffer: false });
  const c = memCensus(tlx([rt], { memory: { attributesSize: 3000, indexAttributesSize: 500, uniformBuffersSize: 96 }, canvas: { width: 959, height: 414 } }));
  assert.deepEqual([c.buffers.attrBytes, c.buffers.indexBytes, c.buffers.uniformBytes], [3000, 500, 96]);
  assert.equal(c.byKind.buffers, 3596);
  assert.equal(c.bytes, 400 + 3596);
  assert.deepEqual([c.swapchainEst.w, c.swapchainEst.h, c.swapchainEst.bytes], [959, 414, 959 * 414 * 4]);
});

test("vendored WebGPU target allocations: primary depth, resolved colour, layered MSAA and sample clamping", (t) => {
  // Let the real r187 texture utility select descriptors; the fake GPU device returns their read-only metadata.
  const usage = Object.getOwnPropertyDescriptor(globalThis, "GPUTextureUsage");
  if (!usage) {
    globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
    t.after(() => { delete globalThis.GPUTextureUsage; });
  }
  const backend = new THREE.WebGPUBackend();
  backend.device = { features: new Set(), createTexture: (d) => ({
    sampleCount: d.sampleCount, mipLevelCount: d.mipLevelCount, depthOrArrayLayers: d.size.depthOrArrayLayers,
  }) };
  for (const [layers, requested, colourPlanes, depthPlanes] of [[1, 4, 5, 4], [1, 2, 1, 1], [1, 8, 5, 4], [3, 4, 15, 15]]) {
    const rt = new THREE.RenderTarget(16, 8, { samples: requested, depth: layers });
    const depth = new THREE.DepthTexture(16, 8, THREE.UnsignedIntType);
    depth.image.depth = layers;
    depth.isArrayTexture = layers > 1;
    depth.renderTarget = rt;  // r187 updateRenderTarget links the implicit texture before registering it
    for (const tex of [depth, rt.texture]) backend.createTexture(tex, { width: 16, height: 8, depth: layers });
    const c = memCensus(tlx([rt, rt.texture, depth], { backend, depthOf: new Map([[rt, depth]]) }));
    assert.equal(c.count, 2);
    assert.equal(c.byKind.renderTarget, 16 * 8 * 4 * colourPlanes);
    assert.equal(c.byKind.rtDepth, 16 * 8 * 4 * depthPlanes);
  }
  // The live env probe temporarily disables mip generation while drawing individual faces.
  const cube = new THREE.CubeRenderTarget(8, { generateMipmaps: true });
  backend.createTexture(cube.texture, { width: 8, height: 8, depth: 6, levels: 4 });
  cube.texture.generateMipmaps = false;
  const c = memCensus(tlx([cube], { backend }));
  assert.equal(c.biggest.mips, 4);
  assert.equal(c.bytes, (64 + 16 + 4 + 1) * 6 * 4);
});

test("GPU byte counters retain their values above two and four GiB", () => {
  const attributesSize = 2 ** 31 + 1024;
  const texturesSize = 2 ** 32 + 512;
  const total = attributesSize + texturesSize;
  const c = memCensus(tlx([], { memory: { attributesSize, texturesSize, total } }));
  assert.equal(c.bytes, attributesSize);
  assert.equal(c.three.texturesSize, texturesSize);
  assert.equal(c.three.total, total);
});

test("3D mips shrink the volume depth while array layers stay fixed", () => {
  const volume = new THREE.Data3DTexture(null, 8, 4, 4);
  const array = new THREE.DataArrayTexture(null, 8, 4, 4);
  for (const tex of [volume, array]) {
    tex.generateMipmaps = true;
    tex.format = THREE.RedFormat;
  }
  const c = memCensus(tlx([volume, array]));
  assert.equal(c.byKind.volume, 128 + 16 + 2 + 1);
  assert.equal(c.byKind.materialArray, (32 + 8 + 2 + 1) * 4);
});

test("r187 manual cube mips follow the base faces, while ordinary mips include the base", () => {
  const face = new THREE.DataTexture(null, 8, 8);
  const cube = new THREE.CubeTexture(Array(6).fill(face));
  cube.mipmaps = Array(2).fill(new THREE.CubeTexture());
  const planar = new THREE.DataTexture(null, 8, 8);
  planar.generateMipmaps = true;
  planar.mipmaps = [{ width: 8, height: 8, data: null }];
  const c = memCensus(tlx([cube, planar]));
  assert.equal(c.byKind.cube, 6 * (64 + 16 + 4) * 4);
  assert.equal(c.byKind.data, 64 * 4);
});

test("sixteen-bit depth uses two bytes per texel on both Three backends", () => {
  for (const backend of [new THREE.WebGLBackend(), new THREE.WebGPUBackend()]) {
    const depth = new THREE.DepthTexture(16, 8, THREE.UnsignedShortType);
    assert.equal(memCensus(tlx([depth], { backend })).byKind.rtDepth, 16 * 8 * 2);
  }
});

test("WebGL separate MSAA depth renderbuffers use a 32-bit estimate beside resolved depth16", () => {
  const rt = new THREE.RenderTarget(16, 8, { samples: 4, depthTexture: new THREE.DepthTexture(16, 8, THREE.UnsignedShortType) });
  const c = memCensus(tlx([rt], { backend: new THREE.WebGLBackend() }));
  assert.equal(c.byKind.rtDepth, 16 * 8 * (2 + 4 * 4));
});

test("a lost device returns zero resident bytes even with stale textures, buffers and swapchain", () => {
  const rt = new THREE.RenderTarget(16, 8);
  const c = memCensus(tlx([rt], { lost: true, memory: { attributesSize: 1024 }, canvas: { width: 64, height: 64 } }));
  assert.deepEqual([c.contextLost, c.supported, c.bytes, c.count, c.biggest, c.swapchainEst, c.buffers.attrBytes],
    [true, true, 0, 0, null, null, 0]);
  assert.equal("contextLost" in memCensus(tlx([])), false);
});

test("install fills an ABSENT façade slot on a three backend only, once the backend is live", () => {
  const rt = new THREE.RenderTarget(8, 8, { depthBuffer: false });
  const G = { __tlx: tlx([rt]), texCensus: undefined };
  assert.equal(memInstall(G), true);
  assert.equal(G.texCensus().bytes, 256);
  const own = () => "glx"; const glx = { texCensus: own };
  assert.equal(memInstall(glx), false, "a backend with its own census keeps it");
  assert.equal(glx.texCensus, own);
  assert.equal(memInstall({ texCensus: undefined }), false, "no __tlx: not a three backend");
  ctx.GLX = { __tlx: tlx([rt]), texCensus: undefined };
  assert.equal(typeof liveHandler, "function", "the module listens for apex-gfx-live");
  liveHandler();
  assert.equal(ctx.GLX.texCensus().count, 1);
});
