/* bounded-cache.test.mjs — BoundedCache (js/car/bounded-cache.js, #7516): the one LRU-bounded
 * key→mesh cache car-draw.js's mesh caches use, lifted out of CarDraw.create so other car modules
 * can share it. Insert past max evicts the oldest and disposes it once, a hit promotes, clear()
 * disposes every entry; car-draw.js has ONE wheel-pair free loop.
 *
 * Run: node --test tests/unit/bounded-cache.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

function load() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync("js/car/bounded-cache.js", "utf8") + "\n;this.BoundedCache = BoundedCache;", ctx,
    { filename: absSrc("js/car/bounded-cache.js") });
  return ctx.BoundedCache;
}

test("inserting past max evicts the oldest entry and disposes it exactly once", () => {
  const BC = load();
  const cache = {}, order = [], disposed = [];
  const dispose = (m) => disposed.push(m.id);
  for (const id of ["a", "b", "c"]) BC.put(cache, order, id, () => ({ id }), 3, dispose);
  assert.deepEqual(disposed, []);
  BC.put(cache, order, "d", () => ({ id: "d" }), 3, dispose);
  assert.deepEqual(disposed, ["a"], "the oldest went, once");
  assert.deepEqual(Object.keys(cache).sort(), ["b", "c", "d"]);
  assert.deepEqual(order, ["b", "c", "d"]);
});

test("a hit promotes the entry and creates nothing", () => {
  const BC = load();
  const cache = {}, order = [], disposed = [];
  const dispose = (m) => disposed.push(m.id);
  for (const id of ["a", "b", "c"]) BC.put(cache, order, id, () => ({ id }), 3, dispose);
  const a = cache.a;
  assert.equal(BC.put(cache, order, "a", () => assert.fail("a hit must not create"), 3, dispose), a);
  BC.put(cache, order, "d", () => ({ id: "d" }), 3, dispose);
  assert.deepEqual(disposed, ["b"], "the promoted entry survived; the next oldest went");
  assert.equal(cache.a, a);
});

test("clear() disposes every entry and empties the order and its stamps", () => {
  const BC = load();
  const cache = {}, order = [], disposed = [];
  const dispose = (m) => disposed.push(m.id);
  for (const id of ["a", "b", "c"]) BC.put(cache, order, id, () => ({ id }), 5, dispose);
  BC.clear(cache, order, dispose);
  assert.deepEqual(disposed.sort(), ["a", "b", "c"]);
  assert.deepEqual(Object.keys(cache), []);
  assert.deepEqual(order, []);
  // A stale stamp would let a re-added key outlive a newer one.
  for (const id of ["x", "y"]) BC.put(cache, order, id, () => ({ id }), 2, dispose);
  BC.put(cache, order, "z", () => ({ id: "z" }), 2, dispose);
  assert.deepEqual(disposed.slice(3), ["x"]);
});

test("drop() disposes one key and takes it off the order", () => {
  const BC = load();
  const cache = {}, order = [], disposed = [];
  const dispose = (m) => disposed.push(m.id);
  for (const id of ["a", "b"]) BC.put(cache, order, id, () => ({ id }), 5, dispose);
  BC.drop(cache, order, "a", dispose);
  assert.deepEqual(disposed, ["a"]);
  assert.deepEqual(order, ["b"]);
  assert.ok(!("a" in cache));
});

test("car-draw.js frees the wheel-pair caches in ONE place", () => {
  const src = fs.readFileSync("js/car/car-draw.js", "utf8");
  assert.equal((src.match(/BoundedCache\.clear\(wheelMeshCache, wheelMeshOrder, freeWheelPair\)/g) || []).length, 1);
  assert.equal((src.match(/for \(const k in (wheelMeshCache|fieldWheelCache)\)/g) || []).length, 0, "no copied free loop");
  assert.equal((src.match(/freeWheelCaches\(\);/g) || []).length, 2, "loadCarModel and invalidateFactoryMeshCaches call it");
  assert.match(src, /BoundedCache\.put\(cache, order, key, create, max, freeOne \|\| freeBodyPair\)/, "putBoundedMesh delegates");
});
