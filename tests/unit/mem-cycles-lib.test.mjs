/* tools/gfx/mem-cycles-lib.mjs: the --mem-cycles plateau verdict (pure) and the in-page GPU object counter
 * (driven against a stub GPUDevice: create/destroy bookkeeping, sizes, idempotent install). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memCyclesVerdict, gpuObjectCounter } from "../../tools/gfx/mem-cycles-lib.mjs";

const row = (buffers, bufMB, rObj) => ({ buffers, bufMB, textures: 56, texMB: 85.7, rObj });

test("warm-up then flat (A·H12's SwiftShader series) reads plateau", () => {
  const rows = [row(852, 29, 259), row(1007, 26.7, 327), row(1199, 39.3, 369), row(1182, 38.9, 347),
    row(1289, 36.4, 426), row(1357, 43.6, 460), row(1362, 44.1, 460), row(1339, 38.7, 449), row(1350, 40, 455), row(1360, 41, 458)];
  const v = memCyclesVerdict(rows);
  assert.equal(v.verdict, "plateau", JSON.stringify(v));
  assert.equal(v.judgedFrom, 5);
});

test("a steady per-cycle climb in the second half reads growing and names the field", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(800 + 60 * i, 30 + 2 * i, 300 + 20 * i));
  const v = memCyclesVerdict(rows);
  assert.equal(v.verdict, "growing");
  assert.deepEqual(v.growing.sort(), ["bufMB", "buffers", "rObj"]);
  assert.equal(v.perCycle.buffers, 60);
});

test("fewer than six cycles cannot separate warm-up from growth", () => {
  assert.equal(memCyclesVerdict([row(1, 1, 1), row(2, 2, 2)]).verdict, "too-few-cycles");
  assert.equal(memCyclesVerdict(null).verdict, "too-few-cycles");
});

test("the counter tracks create minus destroy, sizes buffers and textures, and installs once", () => {
  class GPUBuffer { destroy() {} }
  class GPUTexture { destroy() {} }
  class GPUDevice { createBuffer() { return new GPUBuffer(); } createTexture() { return new GPUTexture(); } }
  const saved = { GPUDevice: globalThis.GPUDevice, GPUBuffer: globalThis.GPUBuffer, GPUTexture: globalThis.GPUTexture, window: globalThis.window };
  Object.assign(globalThis, { GPUDevice, GPUBuffer, GPUTexture, window: {} });
  try {
    gpuObjectCounter();
    const first = GPUDevice.prototype.createBuffer;
    gpuObjectCounter();   // a second init (reload hook) must not double-wrap
    assert.equal(GPUDevice.prototype.createBuffer, first);
    const dev = new GPUDevice();
    const b1 = dev.createBuffer({ size: 1048576 }), b2 = dev.createBuffer({ size: 1048576 });
    dev.createTexture({ size: { width: 512, height: 512 }, mipLevelCount: 1 });
    b1.destroy();
    const o = globalThis.window.__apexGpuObjects();
    assert.equal(o.buffers, 1);
    assert.equal(o.bufMB, 1);
    assert.equal(o.textures, 1);
    assert.equal(o.texMB, 1);
    b2.destroy(); b2.destroy();   // double destroy is harmless
    assert.equal(globalThis.window.__apexGpuObjects().buffers, 0);
  } finally {
    Object.assign(globalThis, saved);
  }
});
