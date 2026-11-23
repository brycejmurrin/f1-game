/* Code hunt 2026-11-18 (2), issue #5699 — TLX rows on the iPhone's WebGPU path, exact-value VM tests over the REAL
 * function source (tests/helpers/fn-source.mjs). No browser, no GPU: a stub device / stub 2d canvas. The heap cost these
 * save on a real phone is not measured here (phone-bridge A/B owed; see the PR body).
 *   row 1  installMappedShim: eager only on a software adapter or a headless run; a real GPU keeps three's native
 *          mappedAtCreation path until a native mapped create throws, then latches the writeBuffer shim on.
 *   row 3  readbackTextureLayers: no 2d context for a layer the WebGL2 readback left undone returns 0 (Assets retries),
 *          never the partial count. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as espree from "espree";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

function load(decls, globals = {}) {
  const ctx = vm.createContext(Object.assign({ Uint8Array, ArrayBuffer, Set }, globals));
  const src = decls.map((d) => fnSource(TLX, d)).join("\n");
  vm.runInContext(src + "\n;globalThis.__fns = { " + decls.map((d) => /function\s+(\w+)/.exec(d)[1]).join(", ") + " };", ctx,
    { filename: absSrc("js/render/three/tlx.js") });
  return ctx.__fns;
}

// A device whose native createBuffer records every descriptor; `throwMapped` makes a mapped create throw
// (Dawn's exhausted mapping pool).
function stubDevice({ throwMapped = false } = {}) {
  const calls = [], writes = [];
  const dev = {
    calls, writes, throwMapped,
    createBuffer(desc) {
      calls.push(Object.assign({}, desc));
      if (desc.mappedAtCreation && dev.throwMapped) throw new RangeError("mapping pool exhausted");
      return { native: true, size: desc.size, getMappedRange: () => new ArrayBuffer(desc.size), unmap() {} };
    },
    queue: { writeBuffer(buf, off, data) { writes.push({ buf, off, bytes: new Uint8Array(data).slice() }); } },
  };
  return dev;
}

const shim = () => load(["function installMappedShim(dev, eager) {"]).installMappedShim;

test("row 1: a real GPU (not soft, not headless) keeps the native mappedAtCreation path", () => {
  const install = shim(), dev = stubDevice();
  assert.equal(install(dev, false), "native");
  const buf = dev.createBuffer({ size: 64, usage: 0x20, mappedAtCreation: true, label: "pos" });
  assert.equal(buf.native, true);
  assert.deepEqual(dev.calls, [{ size: 64, usage: 0x20, mappedAtCreation: true, label: "pos" }], "descriptor passed unchanged");
  buf.unmap();
  assert.equal(dev.writes.length, 0, "no JS staging copy, no queue.writeBuffer");
});

test("row 1: a software adapter or headless run gets the eager shim (unmapped + writeBuffer)", () => {
  const install = shim(), dev = stubDevice();
  assert.equal(install(dev, true), "shim");
  const buf = dev.createBuffer({ size: 8, usage: 0x20, mappedAtCreation: true, label: "idx" });
  assert.deepEqual(dev.calls, [{ size: 8, usage: 0x20 | 0x0008, label: "idx" }], "created unmapped with COPY_DST");
  new Uint8Array(buf.getMappedRange()).set([1, 2, 3, 4, 5, 6, 7, 8]);
  buf.unmap();
  assert.equal(dev.writes.length, 1);
  assert.deepEqual(Array.from(dev.writes[0].bytes), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(dev.writes[0].off, 0);
  assert.equal(install(dev, false), "shim", "a second install keeps the device's mode");
});

test("the upload shim releases its handlers and restores native mapping after the first unmap", () => {
  const dev = stubDevice();
  const nativeBytes = new ArrayBuffer(16);
  let nativeUnmaps = 0;
  const nativeRange = () => nativeBytes;
  const nativeUnmap = () => { nativeUnmaps++; };
  dev.createBuffer = () => ({ getMappedRange: nativeRange, unmap: nativeUnmap });
  shim()(dev, true);
  const buf = dev.createBuffer({ size: 16, usage: 0x20, mappedAtCreation: true });
  new Uint8Array(buf.getMappedRange(8, 4)).fill(17);
  buf.unmap();
  assert.deepEqual(Array.from(dev.writes[0].bytes), [0,0,0,0,0,0,0,0,17,17,17,17,0,0,0,0]);
  assert.equal(buf.getMappedRange, nativeRange);
  assert.equal(buf.unmap, nativeUnmap);
  assert.equal(buf.getMappedRange(), nativeBytes);
  buf.unmap();
  assert.equal(nativeUnmaps, 1);
  assert.equal(dev.writes.length, 1);
});

test("row 1: a native mapped create that throws latches the shim on for the device", () => {
  const install = shim(), dev = stubDevice();
  install(dev, false);
  dev.createBuffer({ size: 16, usage: 0x20, mappedAtCreation: true });
  dev.throwMapped = true;
  const buf = dev.createBuffer({ size: 4, usage: 0x20, mappedAtCreation: true });
  assert.equal(dev.__apexWriteBuf, "latched");
  assert.equal(buf.native, true, "the retry is the unmapped create");
  assert.equal(dev.calls.at(-1).mappedAtCreation, undefined);
  new Uint8Array(buf.getMappedRange()).set([9, 8, 7, 6]);
  buf.unmap();
  assert.deepEqual(Array.from(dev.writes[0].bytes), [9, 8, 7, 6]);
  const before = dev.calls.length;
  dev.createBuffer({ size: 4, usage: 0x20, mappedAtCreation: true });
  assert.equal(dev.calls.length, before + 1, "latched: later mapped creates go straight to the shim, no native try");
  dev.createBuffer({ size: 4, usage: 0x40 });
  assert.deepEqual(dev.calls.at(-1), { size: 4, usage: 0x40 }, "unmapped creates are untouched");
});

// The create site, read as a parsed call (not source text): every installMappedShim(...) call in tlx.js passes the
// device and `_softAdapter || _headless` as `eager`, so a real GPU (both false) keeps the native path above.
function shimCalls(src) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "installMappedShim") {
      const [dev, eager] = n.arguments;
      out.push([dev && dev.name, eager && eager.type === "LogicalExpression" ? [eager.left.name, eager.operator, eager.right.name] : null]);
    }
    for (const k in n) { const v = n[k]; if (k !== "parent" && v && typeof v === "object") (Array.isArray(v) ? v : [v]).forEach(walk); }
  };
  walk(espree.parse(src, { ecmaVersion: "latest", sourceType: "script" }));
  return out;
}
test("row 1: the create site gates the eager shim on a software adapter or a headless run", () => {
  assert.deepEqual(shimCalls(TLX), [["_dev", ["_softAdapter", "||", "_headless"]]]);
});

test("row 3: no 2d context for an undone layer returns 0, not the partial count", () => {
  const size = 2;
  const fns = load(["function readbackTextureLayers(size, images, n, data) {", "function fill2dLayer(c2d, size, img, i, data) {"], {
    Assets: { readLayerBytes: () => [0] },          // the WebGL2 readback wrote layer 0 only
    OffscreenCanvas: class { getContext() { return null; } },
  });
  const data = new Uint8Array(size * size * 4 * 3);
  assert.equal(fns.readbackTextureLayers(size, [{}, {}, {}], 3, data), 0);
});

test("row 3: every layer written still returns the full count", () => {
  const size = 2;
  const fns = load(["function readbackTextureLayers(size, images, n, data) {", "function fill2dLayer(c2d, size, img, i, data) {"], {
    Assets: { readLayerBytes: () => [0] },
    OffscreenCanvas: class {
      getContext() {
        return { clearRect() {}, drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8Array(w * h * 4).fill(7) }) };
      }
    },
  });
  const data = new Uint8Array(size * size * 4 * 3);
  assert.equal(fns.readbackTextureLayers(size, [{}, {}, {}], 3, data), 3);
  assert.equal(data[size * size * 4], 7, "layer 1 came through the 2d round-trip");
});

// ── rows 6 and 7 ─────────────────────────────────────────────────────────────────────────────────────────────────
const SHADOW = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-shadow.js"), "utf8");
const CHUNKED = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-chunked.js"), "utf8");

test("row 6: copyRows16 copies exactly n mat4 rows (typed and plain sources), nothing past them", () => {
  const ctx = vm.createContext({ ArrayBuffer });
  vm.runInContext(fnSource(SHADOW, "function copyRows16(dst, src, n) {") + ";globalThis.f = copyRows16;", ctx,
    { filename: absSrc("js/render/three/tlx-shadow.js") });
  const src = Float32Array.from({ length: 48 }, (_, i) => i + 1);
  const dst = new Float32Array(48).fill(-1);
  ctx.f(dst, src, 2);
  assert.deepEqual(Array.from(dst.subarray(0, 32)), Array.from(src.subarray(0, 32)));
  assert.ok(dst.subarray(32).every((v) => v === -1), "row 3 untouched");
  const dst2 = new Float32Array(32).fill(-1);
  ctx.f(dst2, Array.from(src), 1);
  assert.deepEqual(Array.from(dst2.subarray(0, 16)), Array.from(src.subarray(0, 16)));
  assert.equal(dst2[16], -1);
  ctx.f(dst2, src, 0);
  assert.equal(dst2[16], -1, "n = 0 copies nothing");
});

test("row 7: a kind-less wide channel (fmt24, 3-wide) skips the wideMax scan; a typed refusal still records it", () => {
  const packStats = { on: true, small: 0, wide: 0, zero: 0, savedMB: 0, half: 0, wideBy: {}, wideMax: {}, wideLen: {} };
  class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } }
  const ctx = vm.createContext({ Float32Array, Uint16Array, Uint8Array, Int16Array, Uint32Array, Math, Infinity,
    packStats, packOn: true, pad4On: true, THREE: { BufferAttribute } });
  const fns = ["function packAttr(THREE, src, len, itemSize, kind, fmt24) {", "function* packAttrSteps(",
    "function* f32Steps(", "function* pad4Steps(", "function _zeros("];
  vm.runInContext(fns.map((d) => fnSource(CHUNKED, d)).join("\n") + ";globalThis.packAttr = packAttr;", ctx,
    { filename: absSrc("js/render/three/tlx-chunked.js") });
  const col = new Float32Array([0.2, 3.4, 0.1, 0.5, 0.5, 0.5]);
  const a = ctx.packAttr(ctx.THREE, col, 6, 3, "unorm", true);
  assert.deepEqual(Array.from(a.array), Array.from(col));
  assert.equal(packStats.wideBy.raw, 1);
  assert.equal(packStats.wideLen.raw, 6);
  assert.equal("raw" in packStats.wideMax, false, "no full-length max scan for a channel that refused nothing");
  ctx.packAttr(ctx.THREE, new Float32Array([0.2, 2.5, 0.1, 0.4]), 4, 4, "unorm", true);
  assert.equal(packStats.wideMax.unorm, 2.5, "a typed refusal keeps its diagnostic max");
});

test("row 11: an acquireMesh throw in envFaceEnd clears _envActive and restores the frame", () => {
  const body = fnSource(TLX, "envFaceEnd(face) {");
  const ctx = vm.createContext({});
  vm.runInContext(`
    var envRT = {}, envCubeCam = { children: [{}, {}, {}, {}, {}, {}] }, _envActive = true, restored = 0;
    var _poolBatch = 0, _instStamp = 0, _kidsEnv = {}, drawList = { n: 1, 0: { geo: {}, m: {}, mat: {} } };
    function softContent() { return false; }
    function _kidsBegin() {}
    function _restoreEnvFrame() { restored++; }
    function acquireMesh() { throw new Error("pool exhausted"); }
    var api = { ${body} };
    globalThis.run = () => { try { api.envFaceEnd(0); return "returned"; } catch (e) { return e.message; } };
    globalThis.state = () => ({ active: _envActive, restored });`, ctx, { filename: absSrc("js/render/three/tlx.js") });
  assert.equal(ctx.run(), "pool exhausted", "the error still propagates to the caller");
  assert.deepEqual({ ...ctx.state() }, { active: false, restored: 1 });
});
