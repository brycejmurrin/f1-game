/* gpu-mem-webgpu.test.mjs — the WebGPU allocation wrapper of gpu-mem-census --webgpu and gpu-game-check (#4783 row 3, #4710).
 *
 * The wrapper is stringified into the page; these cases call the same functions on a fake root holding GPUDevice /
 * GPUTexture / GPUBuffer classes. A fake proves the arithmetic and the bookkeeping, not that a browser runs it: that
 * is the perf-census-webgpu job (and a blank-page run on SwiftShader's WebGPU adapter, 2026-11-11).
 *
 * Run: node --test tests/unit/gpu-mem-webgpu.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gpuMemMath, gpuMemInstall, gpuMemSnapshot, gpuMemInitSource, createAttribution } from "../../tools/gfx/gpu-mem-webgpu.mjs";

function page(opts) {
  class GPUTexture { destroy() { this.dead = true; } }
  class GPUBuffer { destroy() { this.dead = true; } }
  class GPUDevice {
    createTexture() { return new GPUTexture(); }
    createBuffer() { return new GPUBuffer(); }
  }
  const root = { GPUDevice, GPUTexture, GPUBuffer };
  assert.equal(gpuMemInstall(gpuMemMath(), opts, root), true);
  return { dev: new GPUDevice(), st: GPUDevice.prototype.__gmw, snap: (top) => gpuMemSnapshot(top || 40, root) };
}

test("the init-script text is the arithmetic handed to the wrapper, with the options as JSON", () => {
  assert.equal(gpuMemInitSource({ armed: true }), `(${gpuMemInstall})((${gpuMemMath})(), {"armed":true});`);
});

test("texture bytes: mip chains, array layers, 3D depth, samples, block-compressed and unknown formats", () => {
  const M = gpuMemMath();
  const got = [
    M.textureBytes({ format: "rgba8unorm", size: [4, 4] }),
    M.textureBytes({ format: "rgba8unorm", size: { width: 4, height: 4 }, mipLevelCount: 3 }),
    M.textureBytes({ format: "rgba16float", size: [640, 360, 1] }),
    M.textureBytes({ format: "r8unorm", size: [8, 8, 6], mipLevelCount: 2 }),
    M.textureBytes({ format: "r8unorm", size: [8, 8, 8], mipLevelCount: 2, dimension: "3d" }),
    M.textureBytes({ format: "depth32float", size: [1024, 1024], sampleCount: 4 }),
    M.textureBytes({ format: "bc1-rgba-unorm", size: [10, 6] }),
    M.textureBytes({ format: "astc-6x6-unorm", size: [12, 7] }),
    M.textureBytes({ format: "no-such-format", size: [4, 4] }),
  ];
  assert.deepEqual(got, [64, 84, 1843200, 480, 576, 16777216, 48, 64, null]);
});

test("buffer class comes from the usage flags, uniform first", () => {
  const M = gpuMemMath();
  assert.deepEqual([64 | 8, 16 | 8, 32 | 8, 128, 1 | 8, 4 | 8, 0].map(M.bufferClass), ["uniform", "index", "vertex", "storage", "readback", "copy", "copy"]);
});

test("the init script counts creates minus destroys, by format and buffer class, and keeps unknown formats visible", () => {
  const { dev, st, snap } = page({ armed: false });
  const a = dev.createTexture({ format: "rgba8unorm", size: [256, 256], mipLevelCount: 1, label: "albedo" });
  dev.createTexture({ format: "rgba16float", size: [1280, 720] });
  dev.createTexture({ format: "mystery", size: [4, 4] });
  const b = dev.createBuffer({ size: 4096, usage: 64 | 8, label: "object" });
  dev.createBuffer({ size: 59400, usage: 16 | 8 });
  let s = snap();
  assert.deepEqual([s.tex, s.buffers, s.texBytes, s.bufBytes, s.unknownCount], [3, 2, 262144 + 7372800, 63496, 1]);
  assert.deepEqual(s.unknown, [{ call: "createTexture", format: "mystery" }]);
  assert.deepEqual(s.cat.map((c) => [c.k, c.n]), [["2D rgba16float", 1], ["2D rgba8unorm", 1], ["buffer index", 1], ["buffer uniform", 1], ["2D mystery", 1]]);
  a.destroy(); a.destroy(); b.destroy();
  s = snap();
  assert.deepEqual([s.tex, s.buffers, s.texBytes, s.bufBytes], [2, 1, 7372800, 59400]);
  assert.deepEqual(s.life, { Texture: { created: 3, destroyed: 1 }, Buffer: { created: 2, destroyed: 1 } });
  // Unarmed: the create log stays empty, and the destroyed objects really were destroyed (the wrapper calls through).
  assert.deepEqual([st.sites.size, st.armedCreates, a.dead, b.dead], [0, 0, true, true]);
});

test("armed, every create is one row per kind + label + bytes + site; the site cap is counted, not silent", () => {
  const { dev, st, snap } = page({ armed: true, stacks: false, maxSites: 2 });
  for (let i = 0; i < 3; i++) dev.createBuffer({ size: 59400, usage: 16 | 8 });
  dev.createBuffer({ size: 208, usage: 64 | 8, label: "bindingBuffer7_object" });
  dev.createTexture({ format: "r8unorm", size: [2, 2] });
  const s = snap();
  assert.deepEqual(s.sites, [
    { site: "createBuffer :: (none)#59400B :: ", n: 3, bytes: 178200 },
    { site: "createBuffer :: bindingBuffer7_object#208B :: ", n: 1, bytes: 208 },
  ]);
  assert.deepEqual([s.armedCreates, s.armedBuffers, s.armedTextures, s.siteOverflow], [5, 4, 1, 1]);
  st.armed = false;
  dev.createBuffer({ size: 8, usage: 8 });
  assert.equal(snap().armedCreates, 5);
});

test("install is idempotent and reports false where there is no GPUDevice", () => {
  const M = gpuMemMath();
  assert.equal(gpuMemInstall(M, {}, {}), false);
  class GPUDevice { createTexture() { return {}; } createBuffer() { return {}; } }
  const root = { GPUDevice };
  assert.equal(gpuMemInstall(M, {}, root), true);
  const wrapped = GPUDevice.prototype.createBuffer;
  assert.equal(gpuMemInstall(M, {}, root), true);
  assert.equal(GPUDevice.prototype.createBuffer, wrapped);
});

test("createAttribution turns the armed log into per-frame rows and names a missing log", () => {
  const snap = { armedCreates: 5, armedBuffers: 4, armedTextures: 1, siteOverflow: 1, sites: [
    { site: "createBuffer :: (none)#59400B :: createAttribute :: mirrorEnd (tlx.js:5830:28)", n: 3, bytes: 178200 },
    { site: "createTexture :: (none)#16B :: x :: y", n: 1, bytes: 16 },
  ] };
  assert.deepEqual(createAttribution(snap, 10), { frames: 10, creates: 5, buffersPerFrame: 0.4, texturesPerFrame: 0.1, unattributed: 1, rows: [
    { site: "createBuffer :: (none)#59400B :: createAttribute :: mirrorEnd (tlx.js:5830:28)", n: 3, perFrame: 0.3, kb: 174 },
    { site: "createTexture :: (none)#16B :: x :: y", n: 1, perFrame: 0.1, kb: 0 },
  ] });
  assert.deepEqual(createAttribution(null, 10), { note: "no WebGPU create log (no GPUDevice wrapped on this leg)" });
  assert.deepEqual(createAttribution(snap, 0), { note: "no window frames" });
});

test("gpu-mem-census offers --webgpu and wires the wrapper in place of the WebGL one", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const tool = new URL("../../tools/gfx/gpu-mem-census.mjs", import.meta.url);
  const help = spawnSync(process.execPath, [tool.pathname, "--help"], { encoding: "utf8" });
  assert.equal(help.stdout.split("\n")[0], "usage: node tools/gfx/gpu-mem-census.mjs [track=monaco] [--warm 60] [--real-link] [--mobile] [--webgpu] [--visits a,b,...] [--json PATH]");
  const src = readFileSync(tool, "utf8");
  assert.equal(src.includes("if (WEBGPU) await ctx.addInitScript(gpuMemInitSource({ armed: false })); else await ctx.addInitScript(installWrap);"), true);
  assert.equal(src.includes('localStorage.setItem("apex26.tlxForceGL", webgpu ? "0" : "1");'), true);
});

test("the snapshot lists every live texture, largest first, so two boots can be diffed row by row (#5451)", () => {
  const { dev, snap } = page({ armed: false });
  const a = dev.createTexture({ format: "rgba8unorm", size: [256, 320], mipLevelCount: 9, label: "livery" });
  dev.createTexture({ format: "depth24plus", size: [1024, 1024], label: "TLXSunShadow" });
  let s = snap();
  assert.deepEqual(s.textures.map((t) => [t.fmt, t.w, t.h, t.mips, t.label]), [["depth24plus", 1024, 1024, 1, "TLXSunShadow"], ["rgba8unorm", 256, 320, 9, "livery"]]);
  assert.equal(s.textures.reduce((n, t) => n + t.bytes, 0), s.texBytes);
  a.destroy();
  s = snap();
  assert.deepEqual(s.textures.map((t) => t.label), ["TLXSunShadow"]);
});

test("both census tools hold the governor and the render scale before the warm, not after it (#5451)", async () => {
  const fs = await import("node:fs");
  for (const f of ["tools/gfx/gpu-mem-census.mjs", "tools/gfx/pass-census.mjs"]) {
    const src = fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const pin = src.indexOf("A.govHold(true); A.renderScale(1);"), warm = src.indexOf("for (let i = 0; i < warm; i++)");
    assert.ok(pin > 0 && warm > 0 && pin < warm, f + ": the tier/scale pin must come before the first warm loop");
  }
});
