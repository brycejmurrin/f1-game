/* car-cache-hygiene — three latent cache faults in js/car/ (#7365, ledger #7343):
 *   C4  getCarDecalTexture frees a texture it made (or took from the draft
 *       spares) when a later step throws, and never caches it half-built;
 *   C2  putBoundedMesh does not cache a null create(): its key used to re-push
 *       onto `order` per miss, and the duplicates could evict a live entry;
 *   C1  getForearm keeps its per-frame fast path for a livery with no c2.
 * Run: node --test tests/unit/car-cache-hygiene.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("C4: a decal texture made before a throw is freed and never cached", () => {
  const v = carDrawVm();
  const made = [], freed = [];
  v.G.gfx.createTexture = () => {
    // crispPlayerDecal reads t.tex outside its own try: a throw there used to orphan t.
    const t = { get tex() { throw new Error("tex lost"); } };
    made.push(t);
    return t;
  };
  v.G.gfx.freeTexture = (t) => freed.push(t);
  v.G.gfx.drawDecal = () => {};
  v.ctx.LiveryTex = {
    IS_MOBILE: false,
    playerHiResDeferred: () => true,
    buildAtlas: () => ({ width: 1024, height: 1024 }),
  };
  v.ctx.requestIdleCallback = () => {};
  v.ctx.setTimeout = () => {};
  const team = { id: "me", drivers: [{ num: 1 }] };
  const out = [];
  for (let i = 0; i < 4; i++) out.push(v.carDraw.getCarDecalTexture(team, 1, true, false));
  assert.deepEqual(out, [null, null, null, null], "a failed build hands the draw nothing");
  assert.equal(made.length, 3, "three tries, then the null is cached");
  assert.deepEqual(freed, made, "every texture made before the throw is freed");
});

// The real LRU (js/car/bounded-cache.js, #7516) under car-draw.js's putBoundedMesh default disposer.
function loadPutBoundedMesh() {
  const freed = [];
  const ctx = vm.createContext({ WeakMap, Map, Infinity, Object });
  vm.runInContext(fs.readFileSync("js/car/bounded-cache.js", "utf8") + "\n;this.BoundedCache = BoundedCache;", ctx, { filename: absSrc("js/car/bounded-cache.js") });
  const freeBodyPair = (m) => { if (m) freed.push(m); };
  return { put: (c, o, k, cr, max, f) => ctx.BoundedCache.put(c, o, k, cr, max, f || freeBodyPair), freed };
}

test("C2: putBoundedMesh never caches a null create() nor lets it evict a live entry", () => {
  const { put, freed } = loadPutBoundedMesh();
  const cache = {}, order = [];
  const live = { id: "live" };
  assert.equal(put(cache, order, "a", () => live, 2), live);
  for (let i = 0; i < 3; i++) assert.equal(put(cache, order, "lost", () => null, 2), null);
  assert.deepEqual(order, ["a"], "a null result leaves no key on the LRU");
  assert.equal(cache.a, live, "the live entry survives the misses");
  assert.ok(!("lost" in cache), "a null is not cached");
  assert.deepEqual(freed, [], "nothing was evicted");
  const later = { id: "later" };
  assert.equal(put(cache, order, "lost", () => later, 2), later, "a later good create still fills the slot");
  assert.deepEqual(order, ["a", "lost"]);
});

test("C1: getForearm keeps its fast path for a livery with no c2", () => {
  const ctx = vm.createContext({ Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} } });
  vm.runInContext(fs.readFileSync("js/car/cockpit-rig.js", "utf8"), ctx, { filename: absSrc("js/car/cockpit-rig.js") });
  vm.runInContext(fs.readFileSync("js/car/car-mesh.js", "utf8") + "\n;this.CarMesh = CarMesh;", ctx, { filename: absSrc("js/car/car-mesh.js") });
  let built = 0;
  ctx.CarMesh.init({ createMesh: (d) => ({ d, n: ++built }), freeMesh() {} });
  let reads = 0;
  const liv = new Proxy({ c1: [0.1, 0.2, 0.3] }, { get(o, k) { if (k === "c2") reads++; return o[k]; } });
  const first = ctx.CarMesh.getForearm(liv);
  reads = 0;
  const again = ctx.CarMesh.getForearm(liv);
  assert.equal(again, first, "the cached sleeve is reused");
  assert.equal(built, 1);
  assert.equal(reads, 1, "the second frame reads c2 once (the fast-path check), no suitColour rebuild");
  // A c2 arriving later still rebuilds the sleeve in that colour.
  const dressed = ctx.CarMesh.getForearm({ c1: [0.1, 0.2, 0.3], c2: [0.1, 0.1, 0.5] });
  assert.notEqual(dressed, first);
  assert.equal(ctx.CarMesh.getForearm({ c1: [0, 0, 0] }) !== dressed, true, "losing c2 again rebuilds to the default suit");
});
