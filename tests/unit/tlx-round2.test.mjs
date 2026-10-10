/* TLX round-2 fixes (TLX-01..03, 06..11). No browser, no GPU (~0.2 s): the behaviours that can run here run against
 * the real tlx-shadow.js with a permissive three/TSL stand-in over the vendored three core; the rest are source pins
 * on tlx.js / tsl-lit.js. A unit test of a backend is not evidence it runs: the follow-up is gpu-census.yml (macos).
 *   TLX-01 dead post chain retried from begin()      TLX-02 shadowStr 0 when the sun pass died
 *   TLX-03 DPR cap on mobileTier                     TLX-06 caster owns a shallow geometry clone
 *   TLX-07 releaseGeometry warm guard                TLX-08 true-LRU material eviction
 *   TLX-09 pack DataArrayTexture drops its CPU copy  TLX-10 window globals behind ?three-devtools=1
 *   TLX-11 hoisted present() closures, cached update range */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");
const CORE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.0/three.core.min.js")).href);

const mk = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : mk()),
  apply: () => mk(), construct: () => mk(), set: () => true,
});
// Real core classes (Scene, InstancedMesh, BufferGeometry...), a permissive stand-in for everything WebGPU-only.
const THREE = new Proxy(CORE, { get: (t, k) => (k in t ? t[k] : mk()) });

function bootShadow(warming = { on: false }) {
  const rendered = [];
  const renderer = { backend: {}, getRenderTarget: () => null, setRenderTarget() {}, autoClear: true,
    render(scene) { rendered.push(scene); } };
  const ctx = vm.createContext({ window: {}, localStorage: { getItem: () => null }, Log: { warn() {} },
    Float32Array, Math, Array, Object, WeakMap, Map, Set, Number });
  vm.runInContext(read("js/render/three/tlx-shadow.js"), ctx);
  const sys = ctx.window.TLXShaders.shadowSys(THREE, mk(), { renderer, isMobile: false, softwareGL: false,
    isWarming: () => warming.on });
  return { sys, rendered, warming };
}

function batchOf(n = 4) {
  const geo = new CORE.BufferGeometry();
  geo.setAttribute("position", new CORE.Float32BufferAttribute(new Float32Array(9), 3));
  geo.setAttribute("instanceTint", new CORE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
  const srcMatrices = new Float32Array(n * 16);
  return { geo, instances: n, srcMatrices };
}
const casters = (rendered) => rendered[rendered.length - 1].children.filter((o) => o.isInstancedMesh);
function castOnce(h, batch) {
  h.rendered.length = 0;
  h.sys.shadowBegin(new Float32Array(16));
  h.sys.castInstanced(batch, batch.instances);
  h.sys.shadowEnd();
  return casters(h.rendered);
}

test("TLX-06: the instanced caster draws its own shallow geometry, one InstancedMesh per geometry", () => {
  const h = bootShadow();
  const b = batchOf();
  const [m] = castOnce(h, b);
  assert.ok(m, "a caster was minted");
  assert.notEqual(m.geometry, b.geo, "not the lit batch's geometry");
  assert.equal(m.geometry.getAttribute("position"), b.geo.getAttribute("position"), "vertex data is shared, not copied");
  assert.equal(m.geometry.getAttribute("instanceTint"), undefined, "depth never reads the lit pass's tint");
  assert.equal(castOnce(h, b)[0], m, "the same caster is reused while the geometry is unchanged");
  let disposed = 0;
  m.geometry.addEventListener("dispose", () => disposed++);
  h.sys.freeInstanced(b);
  assert.equal(disposed, 1, "freeing the batch disposes the clone, which releases the caster's instanceMatrix buffer");
});

test("TLX-06: a batch that swapped geometry re-mints a caster and disposes the old clone", () => {
  const h = bootShadow();
  const b = batchOf();
  const [m1] = castOnce(h, b);
  let disposed = 0;
  m1.geometry.addEventListener("dispose", () => disposed++);
  b.geo = batchOf().geo;
  const list = castOnce(h, b);
  assert.equal(list.length, 1, "exactly one caster per batch");
  assert.notEqual(list[0], m1);
  assert.equal(disposed, 1);
});

test("TLX-07: releaseGeometry parks idle slots at once, but queues the park while a warm is in flight", () => {
  const h = bootShadow();
  const geo = batchOf().geo;
  const mesh = { geo, count: 3 };
  const park = () => {
    h.rendered.length = 0;
    h.sys.shadowBegin(new Float32Array(16));
    h.sys.castShadow(mesh, null);
    h.sys.shadowEnd();
    return h.rendered[h.rendered.length - 1].children.filter((o) => o.isMesh && !o.isInstancedMesh && o.geometry === geo);
  };
  let [slot] = park();
  assert.ok(slot, "a pooled slot holds the geometry");
  h.warming.on = true;
  let events = 0; slot.addEventListener("dispose", () => events++);
  h.sys.releaseGeometry(geo);
  assert.equal(slot.geometry, geo, "mid-warm the slot keeps its geometry (the compile still holds it)");
  assert.equal(events, 0);
  h.sys.flushDropped();
  assert.equal(slot.geometry, geo, "flush is a no-op while the warm is still running");
  h.warming.on = false;
  h.sys.flushDropped();
  assert.notEqual(slot.geometry, geo, "after the warm the slot is parked");
  assert.equal(events, 1, "and its render object is dropped");
  // a slot re-used for another geometry before the flush is left alone
  h.warming.on = true;
  const geo2 = batchOf().geo;
  [slot] = park();
  h.sys.releaseGeometry(geo);
  slot.geometry = geo2;
  h.warming.on = false;
  h.sys.flushDropped();
  assert.equal(slot.geometry, geo2, "the flush never parks a slot that has since been re-used");
});

test("TLX-08: eviction picks the least recently DRAWN material, never one used this frame", () => {
  const i = TLX.indexOf("function lruVictim");
  assert.notEqual(i, -1, "lruVictim moved — update this test, do not delete it");
  const lruVictim = new Function(`"use strict";${TLX.slice(i, TLX.indexOf("\n      }\n", i) + 8)};return lruVictim;`)();
  const cache = new Map([["road", { __tlxFrame: 7 }], ["old", { __tlxFrame: 2 }], ["mid", { __tlxFrame: 5 }],
    ["cur", { __tlxFrame: 9 }]]);
  assert.equal(lruVictim(cache, 9), "old", "insertion order would have evicted the hot, long-lived 'road' first");
  assert.equal(lruVictim(new Map([["a", { __tlxFrame: 4 }]]), 4), undefined, "everything in use: nothing is evictable");
  assert.equal(lruVictim(new Map([["n", null], ["a", { __tlxFrame: 1 }]]), 4), "n", "a null entry is the oldest");
  assert.match(TLX, /const k = lruVictim\(matCache, _matFrame\);/, "the miss path uses it");
});

test("TLX-01: begin() retries a dead post chain on a 2 s timer, 3-strike cap kept", () => {
  assert.match(TLX, /_postRebuild = \+\+_postStrikes <= 3;\s*_postRetryAt = [^;]*\+ 2000;/, "the death site arms the timer");
  const bi = TLX.indexOf("        begin(frame) {");
  const b = TLX.slice(bi, TLX.indexOf("scene.background.setRGB", bi));
  assert.match(b, /_postRebuild && !post && !_warmPending[\s\S]*?>= _postRetryAt/, "begin() retries off the timer, not mid-warm");
  assert.match(b, /_postRebuild = false; post = buildPost\(\); if \(post\) post\.resize\(W, H\);/);
});

test("TLX-02: a dead sun pass zeroes the lit shadow strength every frame", () => {
  assert.match(read("js/render/three/tsl-lit.js"), /U\.shadowStr\.value = SHD\.S\.enabled \? k\("shadowStr", 1\.15\) \* _hf : 0;/);
});

test("TLX-03: the DPR cap follows mobileTier, so GRAPHICS: HIGH on a phone gets full DPR", () => {
  assert.match(TLX, /const DPR_CAP = mobileTier \? 1\.5 : 2;/);
});

test("TLX-09: the pack DataArrayTexture drops its CPU copy after the first upload", () => {
  const i = TLX.indexOf("t.onUpdate = (tex) => { tex.onUpdate = null; tex.image = { data: null");
  assert.notEqual(i, -1);
  const t = new CORE.DataArrayTexture(new Uint8Array(2 * 2 * 4 * 3), 2, 2, 3);
  const size = 2, n = 3;
  new Function("t", "size", "n", `"use strict";${TLX.slice(i, TLX.indexOf("\n", i))}`)(t, size, n);
  t.onUpdate(t);
  assert.equal(t.image.data, null);
  assert.deepEqual([t.image.width, t.image.height, t.image.depth], [2, 2, 3], "dimensions survive");
  assert.equal(t.onUpdate, null, "one-shot");
});

test("TLX-10: window.scene/camera/renderer/THREE only behind ?three-devtools=1", () => {
  const i = TLX.indexOf("window.scene = scene;");
  const guard = TLX.slice(TLX.lastIndexOf("try {", i), i);
  assert.match(guard, /three-devtools=1/, "the assignment sits under the flag");
  assert.match(read("tests/specs/track-switch-memory.spec.js"), /goto\("\/\?three-devtools=1"\)/, "the spec that reads window.renderer sets it");
});

test("TLX-11: present()'s failure-ladder closures are hoisted; update ranges reuse one object per attribute", () => {
  const pi = TLX.indexOf("present(opts) {");
  const present = TLX.slice(pi, TLX.indexOf("__tlx: {", pi));
  for (const n of ["persistFail", "paintCanvas", "dropTo"]) {
    assert.ok(!new RegExp("const " + n + " = ").test(present), n + " is no longer re-created per present()");
    assert.ok(new RegExp("const " + n + " = ").test(TLX), n + " exists once, hoisted");
  }
  assert.match(present, /paintCanvas\(this\)/);
  // behaviour of the shared range helper
  const hi = TLX.indexOf("function setRange0");
  const setRange0 = new Function(`"use strict";${TLX.slice(hi, TLX.indexOf("\n  }\n", hi) + 4)};return setRange0;`)();
  const attr = new CORE.InstancedBufferAttribute(new Float32Array(64), 16);
  setRange0(attr, 32); const first = attr.updateRanges[0];
  attr.clearUpdateRanges();                      // what three does after an upload
  setRange0(attr, 48);
  assert.equal(attr.updateRanges.length, 1);
  assert.equal(attr.updateRanges[0], first, "no new {start,count} object per frame");
  assert.deepEqual({ ...attr.updateRanges[0] }, { start: 0, count: 48 });
  assert.ok(!/addUpdateRange\(0, n \* 16\)/.test(read("js/render/three/tlx-shadow.js")));
});
