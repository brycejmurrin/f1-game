/* tlx-debug.test.mjs — TLXDebug (js/render/three/tlx-debug.js, carved from tlx.js in #6821): pins the __tlx surface
 * (Object.keys, in order) and that it reads the TLX.create closure LIVE through the scope bag tlx.js builds. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const rd = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const DBG = "js/render/three/tlx-debug.js";
const TD = new Function("localStorage", `${rd(DBG)}\nreturn TLXDebug;`)({ store: {}, setItem(k, v) { this.store[k] = v; }, removeItem(k) { delete this.store[k]; } });

const KEYS = ["renderer", "THREE", "TSL", "lit", "shadow", "sky", "fx", "post", "postState", "fxState", "clearFxState", "skyState",
  "chunkState", "postSubmit", "roadSplit", "geoCensus", "meshState", "coState", "lumaDbg", "envState", "envFailStack", "viz",
  "ctxLost", "swRaceShed", "backendState", "materialCacheSize", "matKeyOf", "memState", "shader"];

/** A scope where every name tlx.js hands over exists; `vals` overrides, reads are live (a getter per name). */
function scope(vals = {}) {
  const names = [...new Set(rd(DBG).match(/\bS\.([A-Za-z_$][\w$]*)/g).map((s) => s.slice(2)))];
  const S = {};
  for (const n of names) Object.defineProperty(S, n, { get: () => (n in vals ? vals[n] : undefined), set: (v) => { vals[n] = v; }, enumerable: true });
  return { S, vals };
}

test("the __tlx surface keeps its keys and their order", () => {
  assert.deepEqual(Object.keys(TD.create(scope().S)), KEYS);
  assert.deepEqual(Object.keys(TD), ["create"]);
  assert.ok(Object.isFrozen(TD));
});

test("every scope name tlx-debug reads is provided by tlx.js's _dbgScope", () => {
  const used = new Set(rd(DBG).match(/\bS\.([A-Za-z_$][\w$]*)/g).map((s) => s.slice(2)));
  const bag = rd("js/render/three/tlx.js").split("const _dbgScope = Object.defineProperties({}, {")[1].split("\n      });")[0];
  const given = new Set([...bag.matchAll(/(?:^|[ ,])([A-Za-z_$][\w$]*): \{ get:/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((n) => !given.has(n)), [], "names used but not handed over");
  assert.deepEqual([...given].filter((n) => !used.has(n)), [], "names handed over but unused");
});

test("getters are live: the surface follows the closure variable, not a snapshot", () => {
  const { S, vals } = scope({ lit: "A", fx: null, _chunkLast: { total: 3, visible: 2 }, chunkedSys: {} });
  const t = TD.create(S);
  assert.equal(t.lit, "A");
  vals.lit = "B"; assert.equal(t.lit, "B");
  assert.equal(t.fx, null); vals.fx = {}; assert.equal(t.fx, vals.fx);
  assert.deepEqual(t.chunkState(), { on: true, total: 3, visible: 2 });
});

test("postSubmit / roadSplit write through to the closure; roadSplit persists the arm", () => {
  const store = {};
  const TDs = new Function("localStorage", `${rd(DBG)}\nreturn TLXDebug;`)({ setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } });
  const { S, vals } = scope({ _postSubmitOn: false, _roadSplitOn: true });
  const t = TDs.create(S);
  assert.equal(t.postSubmit(), false); assert.equal(t.postSubmit(true), true); assert.equal(vals._postSubmitOn, true);
  assert.equal(t.roadSplit(false), false); assert.equal(vals._roadSplitOn, false); assert.equal(store["apex26.tlxRoadSplit"], "0");
  t.roadSplit(true); assert.equal(vals._roadSplitOn, true); assert.equal("apex26.tlxRoadSplit" in store, false);
});

test("state probes read their counters", () => {
  const { S } = scope({ fx: {}, _fxLast: { shadows: 1, marks: 2, skidVerts: 3, glow: 4, particles: 5, decals: 6 }, _meshMade: { mesh: 7, chunked: 8, tex: 9 },
    _texStat: { made: 1, reused: 2, retired: 3, disposed: 4 }, _texPoolM: { size: () => 5 }, matCache: new Map([["k", "m"]]) });
  const t = TD.create(S);
  assert.deepEqual(t.fxState(), { on: true, shadows: 1, marks: 2, skidVerts: 3, glow: 4, particles: 5, decals: 6 });
  assert.deepEqual(t.meshState(), { mesh: 7, chunked: 8, tex: 9, texMade: 1, texReused: 2, texRetired: 3, texDisposed: 4, texPooled: 5 });
  assert.equal(t.materialCacheSize(), 1); assert.equal(t.matKeyOf("m"), "k"); assert.equal(t.matKeyOf("x"), null);
  assert.deepEqual(t.postState(), { on: false, hdr: false, blocks: {}, targets: [0, 0] });
});

test("load order: lazy (not eager) and before tlx.js", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const three = m.DEFERRED.three;
  assert.ok(three.indexOf(DBG) >= 0 && three.indexOf(DBG) < three.indexOf("js/render/three/tlx.js"));
  assert.ok(!m.FULL.includes(DBG));
});
