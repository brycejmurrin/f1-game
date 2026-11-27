/* tlx-mem-scope.test.mjs — TLXShaders.memScope ledger + memCensus byScope (#6958, #6920 U3.4). JS-object arithmetic only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import * as THREE from "../../vendor/three-0.187.0/three.webgpu.min.js";

const ctx = vm.createContext({ Math, Set, Object, Array, WeakRef });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(new URL("../../js/render/three/tlx-mem.js", import.meta.url), "utf8"), ctx, { filename: absSrc("js/render/three/tlx-mem.js") });
const { memCensus, memScope } = ctx.TLXShaders;

function tlx(objs) {
  const tracked = new Set(objs.map((o) => new WeakRef(o)));
  return { THREE, ctxLost: () => false, renderer: { backend: null, _textures: { _tracked: tracked, get: () => ({}) }, info: { memory: {} }, domElement: null } };
}
const tex = (w, scope) => {
  const t = new THREE.DataTexture(new Uint8Array(w * w * 4), w, w);
  t.generateMipmaps = false;
  if (scope) t.__tlxScope = scope;
  return t;
};

test("memScope: set/current, unknown coerces to boot, push/pop nest", () => {
  assert.ok(memScope);
  assert.equal(memScope.current(), "boot");
  memScope.set("race"); assert.equal(memScope.current(), "race");
  memScope.set("nonsense"); assert.equal(memScope.current(), "boot");
  memScope.set("circuit");
  memScope.push("garage"); assert.equal(memScope.current(), "garage");
  memScope.push("garage"); memScope.pop("race"); assert.equal(memScope.current(), "garage", "a pop of another name is ignored");
  memScope.pop("garage"); assert.equal(memScope.current(), "circuit");
  memScope.pop("garage"); assert.equal(memScope.current(), "circuit", "an unmatched pop is a no-op");
  memScope.set("boot");
});

test("byScope: one entry per scope with the right bytes; sums to the texture total", () => {
  const a = tex(8, "circuit"), b = tex(16, "race"), c = tex(32, "garage"), d = tex(4, null);
  const r = memCensus(tlx([a, b, c, d]));
  assert.equal(r.byScope.circuit.bytes, 8 * 8 * 4);
  assert.equal(r.byScope.race.bytes, 16 * 16 * 4);
  assert.equal(r.byScope.garage.bytes, 32 * 32 * 4);
  assert.equal(r.byScope.boot.bytes, 4 * 4 * 4, "an unstamped texture reads boot");
  assert.equal(r.byScope.boot.count, 1);
  const sum = Object.values(r.byScope).reduce((s, x) => s + x.bytes, 0);
  assert.equal(sum, r.bytes - r.byKind.buffers);
});

test("byScope geometry: a shared ArrayBuffer counts once", () => {
  const buf = new ArrayBuffer(400);
  const mk = (s) => ({ __tlxScope: s, attributes: { position: { array: new Float32Array(buf, 0, 50) }, normal: { array: new Float32Array(buf, 200, 50) } }, index: null });
  const g1 = mk("race"), g2 = mk("race"), g3 = { __tlxScope: "circuit", attributes: { position: { array: new Float32Array(10) } }, index: { array: new Uint16Array(6) } };
  const geoReg = [g1, g2, g3].map((g) => new WeakRef(g));
  const r = memCensus(tlx([]), 0, { geoReg });
  assert.equal(r.byScope.race.geoBytes, 400);
  assert.equal(r.byScope.circuit.geoBytes, 40 + 12);
  assert.equal(r.byScope.race.geoCount, 2);
});
