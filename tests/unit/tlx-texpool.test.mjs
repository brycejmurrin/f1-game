/* tlx-texpool.test.mjs — TLXTexPool (js/render/three/tlx-texpool.js, carved from tlx.js in #6821): the retired-texture
 * pool's contract on its own: same-size/same-kind reuse, the count bound, idle ageing, flush, and the load order. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const rel = "js/render/three/tlx-texpool.js";
class FakeBitmap {}
const pool = new Function("ImageBitmap", fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8") + "\nreturn TLXTexPool;")(FakeBitmap);
const mk = (w, h, bmp = false) => ({ t: { __tlxPoolW: w, __tlxPoolH: h, __tlxPoolBmp: bmp, image: { width: w, height: h }, disposed: 0, dispose() { this.disposed++; } }, w, h });
const rig = () => {
  const released = [], stand = { width: 1, height: 1 };
  const p = pool.create({ fx: () => ({ releaseTexture: (t) => released.push(t) }), texStandIn: () => stand });
  return { p, released, stand };
};

test("surface: create(), frozen", () => {
  assert.deepEqual(Object.keys(pool), ["create"]);
  assert.ok(Object.isFrozen(pool));
  assert.deepEqual(Object.keys(rig().p).sort(), ["age", "entries", "flush", "isBitmap", "retire", "size", "stat", "take"]);
});

test("a retired texture is taken by a same-size, same-kind source, and only by that", () => {
  const { p, stand } = rig();
  const a = mk(64, 32);
  p.retire(a.t, 0);
  assert.equal(a.t.image, stand, "canvas source swapped for the stand-in");
  assert.equal(p.size(), 1);
  assert.equal(p.take({ width: 64, height: 33 }), null);
  assert.equal(p.take(new FakeBitmap()), null, "a bitmap never takes a canvas texture");
  assert.equal(p.take({ width: 64, height: 32 }), a.t);
  assert.equal(p.size(), 0);
  assert.equal(p.take(null), null);
  assert.equal(p.take({ width: 0, height: 4 }), null);
});

test("a texture with no pool size is disposed at once, with its decal materials", () => {
  const { p, released } = rig();
  const t = { dispose() { this.d = true; } };
  p.retire(t, 0);
  assert.equal(t.d, true); assert.deepEqual(released, [t]);
  assert.equal(p.stat.disposed, 1); assert.equal(p.size(), 0);
});

test("bounded to 4 (oldest disposed), ages out after 10 s idle, flush empties", () => {
  const { p, released } = rig();
  const xs = [1, 2, 3, 4, 5].map((i) => mk(8 * i, 8));
  xs.forEach((x, i) => p.retire(x.t, i));
  assert.equal(p.size(), 4); assert.equal(xs[0].t.disposed, 1);
  p.age(10002); assert.equal(p.size(), 3, "only entries idle past 10 s go");
  p.age(20000); assert.equal(p.size(), 0);
  p.retire(mk(8, 8).t, 0); p.flush(); assert.equal(p.size(), 0);
  p.flush(); assert.equal(p.stat.disposed, 6);
  assert.equal(released.length, 6);
});

test("load order: lazy (not eager) and before tlx.js", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const three = m.DEFERRED.three;
  assert.ok(three.indexOf(rel) >= 0 && three.indexOf(rel) < three.indexOf("js/render/three/tlx.js"));
  assert.ok(!m.FULL.includes(rel));
});
