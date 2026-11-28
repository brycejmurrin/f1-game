/* track-hardening-7340.test.mjs — #7340 members 1 and 2: the TrackGeom emitter
 * guards (addBox finite check, emit's zero-normal faces, addMountain's _mat
 * restore) and the TrackLine bake gaps (one hint per corner; a corner-free
 * track still bakes lineK, so pathK is the road's curvature, not 0).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const root = new URL("../../", import.meta.url);
const ctx = { console, Math, Number, Object, Float32Array, Set };
vm.createContext(ctx);
for (const f of ["js/core/log.js", "js/core/mat4.js", "js/track/core/geom.js", "js/track/core/line.js"])
  vm.runInContext(readFileSync(new URL(f, root), "utf8").replace(/^const /mg, "var "), ctx, { filename: absSrc(f) });
const G = ctx.TrackGeom, TL = ctx.TrackLine;
const acc = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [] });

test("addBox: a NaN centre, size or basis emits nothing", () => {
  for (const [c, sz, basis] of [
    [[NaN, 0, 0], [1, 1, 1]],
    [[0, 0, 0], [1, NaN, 1]],
    [[0, 0, 0], [1, 1, 1], [[1, 0, 0], [0, NaN, 0], [0, 0, 1]]],
  ]) {
    const out = acc();
    assert.equal(G.addBox(out, c, sz, [1, 1, 1], basis), false);
    assert.equal(out.pos.length, 0);
    assert.equal(out.idx.length, 0);
  }
  const ok = acc();
  G.addBox(ok, [0, 0, 0], [1, 1, 1], [1, 1, 1]);
  assert.equal(ok.pos.length, 6 * 4 * 3, "a finite box still emits its 24 verts");
});

test("emit: a quad whose first triple is degenerate (a cone tip) still gets a unit normal", () => {
  const out = acc();
  // verts 0 and 1 coincide; the face lies in the y = 0 plane
  G.emit(out, [[0, 0, 0], [0, 0, 0], [1, 0, 1], [1, 0, 0]], [1, 1, 1]);
  assert.equal(out.pos.length, 12);
  const [nx, ny, nz] = out.nrm;
  assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-9, `normal ${nx},${ny},${nz} is not unit`);
  assert.ok(Math.abs(Math.abs(ny) - 1) < 1e-9, "the normal is the plane's");
});

test("emit: a fully degenerate face is dropped, not emitted with a zero normal", () => {
  const out = acc();
  assert.equal(G.emit(out, [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], [1, 1, 1]), false);   // collinear
  assert.equal(G.emit(out, [[1, 2, 3], [1, 2, 3], [1, 2, 3]], [1, 1, 1]), false);               // a point
  assert.equal(out.pos.length, 0);
  assert.equal(out.idx.length, 0);
});

test("addMountain restores the caller's out._mat", () => {
  const out = acc();
  out._mat = G.MAT.CONCRETE != null ? G.MAT.CONCRETE : 7;
  const m0 = out._mat;
  G.addMountain(out, [0, 0, 0], 100, 60, { seg: 10, seed: 3 });
  assert.equal(out._mat, m0);
  const und = acc();
  G.addMountain(und, [0, 0, 0], 100, 60, { seg: 10, seed: 3 });
  assert.equal(und._mat, undefined, "an accumulator with no material keeps none");
});

// A synthetic track: n nodes, `hw` half-width, curvature from a function of s.
function track(total, hwv, kOf) {
  const n = Math.round(total / 4), ds = total / n;
  const curv = new Float32Array(n), hw = new Float32Array(n);
  for (let i = 0; i < n; i++) { curv[i] = kOf(i * ds, total); hw[i] = hwv; }
  return { n, total, curv, hw };
}
const cornerAt = (s0, len, k) => (s) => (s >= s0 && s < s0 + len ? k : 0);

test("lineHints: two hints that snap to one corner shift it once, not twice", () => {
  const one = track(2000, 7, cornerAt(1000, 60, 0.02));
  one.def = { id: "syn1", turns: [1030 / 2000], lineHints: [{ turn: 1, apexShift: 16 }] };
  TL.bake(one);
  const two = track(2000, 7, cornerAt(1000, 60, 0.02));
  two.def = { id: "syn2", turns: [1030 / 2000, 1040 / 2000], lineHints: [{ turn: 1, apexShift: 16 }, { turn: 2, apexShift: 16 }] };
  TL.bake(two);
  assert.equal(two.lineCorners.length, 1);
  assert.ok(Math.abs(two.lineCorners[0].sApex - one.lineCorners[0].sApex) < 1e-6,
    `apex at ${two.lineCorners[0].sApex}, one hint puts it at ${one.lineCorners[0].sApex}`);
});

test("a corner-free track (|k| < K_ON everywhere) still bakes lineK: pathK is the road's curvature", () => {
  const k = TL.K_ON * 0.5;
  const t = TL.bake(track(2000, 7, () => k));
  assert.equal(t.lineCorners.length, 0);
  assert.ok(t.lineK, "lineK baked");
  assert.ok(t.attackQ && t.toTurnIn, "the attack tables are baked too");
  for (const s of [0, 333, 1000, 1999]) assert.ok(Math.abs(TL.pathK(t, s) - k) < 1e-6, `pathK(${s}) = ${TL.pathK(t, s)}, road k = ${k}`);
});
