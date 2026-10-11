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

// The real tsl-lit factory over the permissive stand-in, with uniform()/uniformArray() kept as plain
// { value } holders so updateFrame's uploads can be read back. The shadow subsystem is a lamp-armed stub.
function bootLit({ lampIdx = 2 } = {}) {
  const ctx = vm.createContext({ window: {}, Log: { warn() {} }, Float32Array, Math, Array, Object, Number });
  vm.runInContext(read("js/render/three/tsl-lit.js"), ctx);
  const holder = (value) => ({ value, setGroup() { return this; } });
  const TSL = new Proxy({}, { get: (t, k) => (k === "uniform" || k === "uniformArray" ? holder : mk()) });
  const S = { enabled: true, carEnabled: false, lampEnabled: true, lampArmed: true, lampIdx, pcssEnabled: false,
    lightVP: new Float32Array(16), carLightVP: new Float32Array(16), lampLightVP: new Float32Array(16) };
  const shadow = { S, sunTex: {}, lampTex: {}, sunSize: 2048, lampSize: 512 };
  const lit = ctx.window.TLXShaders.lit(THREE, TSL, { chunks: { hash21: mk(), vnoise: mk(), ignoise: mk() }, shadow, maxLights: 16 });
  return { lit, U: lit.uniforms, S };
}
const litFrame = () => ({ sunDir: [0, 1, 0], sunColor: [1, 1, 1], lights: new Array(15 * 3).fill(0), tune: null });

// 1b-F3 (hunt 3): SHD.S.lampIdx is a slot of the FORWARD frame.lights; the mirror re-ranks its own list
// (FrameLights.viewLights), so it names another lamp there. GLX gated it in #1281 (glx.js _lampOn); TLX did not.
test("1b-F3: the TLX mirror pass uploads the lamp shadow OFF; the main pass after it re-arms", () => {
  const { lit, U } = bootLit({ lampIdx: 2 });
  lit.updateFrame(litFrame(), true);   // tlx.js mirrorBegin
  assert.equal(U.lampShadowOn.value, 0, "no forward-slot lamp shadow in the mirror's re-ranked list");
  lit.updateFrame(litFrame());         // tlx.js begin (the main pass)
  assert.equal(U.lampShadowOn.value, 1);
  assert.equal(U.lampShadowIdx.value, 2);
  const mb = TLX.slice(TLX.indexOf("mirrorBegin(frame, w, h) {"), TLX.indexOf("mirrorEnd() {"));
  assert.match(mb, /lit\.updateFrame\(frame, true\)/, "mirrorBegin passes the mirror flag");
});

// 5-F5 (hunt 3): game.js calls gfx.resize() every rendered frame and begin()'s resizeNow() then cancels the
// rAF it scheduled — one requestAnimationFrame + cancelAnimationFrame per frame for nothing.
test("5-F5: while begin() drives the frame, resize() schedules no rAF; with no begin() it still does", () => {
  const fnBody = (name) => {
    const m = TLX.match(new RegExp(`function\\s+${name}\\s*\\(\\)\\s*\\{`));
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    for (; depth; i++) { if (TLX[i] === "{") depth++; else if (TLX[i] === "}") depth--; }
    return TLX.slice(start, i - 1);
  };
  const decl = TLX.match(/let _resizeRaf = 0, _resizeNow = false[^;]*;/);
  assert.ok(decl, "resize state moved");
  const bi = TLX.indexOf("        begin(frame) {");
  const beginHead = TLX.slice(bi, TLX.indexOf("\n", TLX.indexOf("resizeNow();", bi) + 13));
  assert.match(beginHead, /resizeNow\(\);/);
  const tail = beginHead.slice(beginHead.indexOf("resizeNow();"));
  const sim = new Function("requestAnimationFrame", "cancelAnimationFrame", `"use strict";
    ${decl[0]}
    let _warmPending = null, applied = 0;
    const cssSizeCache = { markDirty() {} };
    function applyResize() { applied++; }
    function resize() {${fnBody("resize")}}
    function resizeNow() {${fnBody("resizeNow")}}
    const begin = () => { ${tail.replace(/\/\/.*$/gm, "")} };
    return { resize, begin, applied: () => applied };`);
  const rafs = new Map(); let next = 0, scheduled = 0, cancelled = 0;
  const t = sim((fn) => { scheduled++; rafs.set(++next, fn); return next; }, (id) => { cancelled++; rafs.delete(id); });
  for (let f = 0; f < 10; f++) { t.resize(); t.begin(); }   // game.js render(): gfx.resize(), then gfx.begin()
  assert.ok(scheduled <= 1, `rAFs scheduled over 10 drawn frames: ${scheduled}`);
  assert.equal(t.applied(), 10, "begin() still applies the size every frame");
  t.resize(); t.resize();                                     // a menu: no begin() any more
  assert.equal(scheduled - cancelled, 1, "a resize with no begin() to own it still schedules one rAF");
  for (const fn of rafs.values()) fn();
  assert.equal(t.applied(), 11);
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
