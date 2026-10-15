import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const ctx = vm.createContext({Math, Number, Object});
vm.runInContext(readFileSync(new URL("../../js/track/core/geom.js", import.meta.url), "utf8"), ctx);
const G = vm.runInContext("TrackGeom", ctx);
const mats = (opts) => {
  const out = {pos: [], nrm: [], col: [], idx: [], mat: []};
  G.addMountain(out, [0, 0, 0], 100, 60, Object.assign({seg: 10, seed: 3}, opts));
  return new Set(out.mat);
};
test("addMountain default keeps FOLIAGE on the lower zone", () => {
  assert.ok(mats({}).has(G.MAT.FOLIAGE));
});
test("addMountain lowMat replaces the FOLIAGE zone (desert dunes)", () => {
  const m = mats({lowMat: G.MAT.SAND});
  assert.ok(!m.has(G.MAT.FOLIAGE));
  assert.ok(m.has(G.MAT.SAND));
});
