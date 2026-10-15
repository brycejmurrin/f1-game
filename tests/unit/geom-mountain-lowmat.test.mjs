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
const build = (opts) => {
  const out = {pos: [], nrm: [], col: [], idx: [], mat: []};
  G.addMountain(out, [0, 0, 0], 100, 60, Object.assign({seg: 10, seed: 3}, opts));
  return out;
};
test("addMountain profile/stretch/crest are opt-in: explicit defaults are byte-identical", () => {
  const a = build({}), b = build({profile: "cone", stretch: 1, crest: 0});
  assert.deepEqual(a.pos, b.pos);
  assert.deepEqual(a.col, b.col);
});
test("addMountain massif profile adds rings; stretch elongates along fwd only", () => {
  const cone = build({}), massif = build({profile: "massif"});
  assert.ok(massif.pos.length > cone.pos.length);
  const ext = (o, axis) => { let lo = 1e9, hi = -1e9; for (let i = axis; i < o.pos.length; i += 3) { lo = Math.min(lo, o.pos[i]); hi = Math.max(hi, o.pos[i]); } return hi - lo; };
  const s = build({stretch: 3});
  assert.ok(ext(s, 2) > ext(cone, 2) * 2.5);          // fwd = +Z
  assert.ok(Math.abs(ext(s, 0) - ext(cone, 0)) < 1e-6);
});
