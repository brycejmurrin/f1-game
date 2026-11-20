// EXTREME garage detail (GfxQuality features garageHi / crewHi). Off — no
// GfxQuality global (node default), or the features answering false — must
// upload byte-for-byte the buffers HEAD dce9a300 uploaded (the pinned sha256s
// in tests/data/garage-hi-detail.json were taken from that tree with
// tests/helpers/garage-hi-harness.mjs). On, every build succeeds, every vertex
// is finite, no triangle is degenerate or wound against its normals, and the
// triangle totals are the pinned ones (a change here is a deliberate re-pin).
// No GPU here: this proves the buffers, not how the room looks.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, badTriangle, load } from "../helpers/garage-hi-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const PIN = JSON.parse(read("tests/data/garage-hi-detail.json"));

// Triangles whose winding disagrees with their own vertex normals.
function backWound(list) {
  let n = 0;
  for (const { pos, nrm, idx } of list) for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let d = 0;
    for (const i of [a, b, c]) d += f[0] * nrm[i] + f[1] * nrm[i + 1] + f[2] * nrm[i + 2];
    if (d < 0) n++;
  }
  return n;
}

test("feature off: the room and every crew look are HEAD's buffers, hash for hash", () => {
  assert.deepEqual(buildAll(read).summary, PIN.off, "no GfxQuality (node default)");
  assert.deepEqual(buildAll(read, { features: { garageHi: false, crewHi: false }, hi: true }).summary, PIN.off,
    "GfxQuality answering false with the lazy dense primitives resident");
  assert.deepEqual(buildAll(read, { features: { garageHi: true, crewHi: true }, hi: false }).summary, PIN.off,
    "features on but GarageHiPrims not landed yet: today's room, never half-dense");
});

test("feature on: dense room and crew build clean, and pin their triangle totals", () => {
  const on = buildAll(read, { features: { garageHi: true, crewHi: true }, hi: true });
  assert.deepEqual(on.H.warns, [], "no dense build fell back");
  assert.equal(badTriangle(on.room), null);
  for (const [id, list] of Object.entries(on.crew)) assert.equal(badTriangle(list), null, id);
  const off = buildAll(read);
  // The crew bodies (the first two meshes of every look: mechanics, lollipop man) are outward-wound lofts, dense too.
  for (const id of Object.keys(on.crew)) assert.equal(backWound(on.crew[id].slice(0, 2)), 0, id + ": dense bodies outward-wound");
  const tris = (s) => ({ room: s.room.tris, crew: Object.fromEntries(Object.entries(s.crew).map(([k, v]) => [k, v.tris])) });
  assert.deepEqual(tris(on.summary), PIN.on.tris, "EXTREME triangle totals (re-pin deliberately)");
  assert.deepEqual(tris(off.summary), PIN.off_tris, "HIGH triangle totals");
  assert.ok(on.summary.room.tris > off.summary.room.tris * 2 && on.summary.crew.classic.tris > off.summary.crew.classic.tris * 2);
});

test("one feature at a time: garageHi leaves the crew alone, crewHi leaves the room alone", () => {
  const room = buildAll(read, { features: { garageHi: true }, hi: true }).summary;
  assert.notEqual(room.room.sha256, PIN.off.room.sha256);
  assert.deepEqual(room.crew, PIN.off.crew);
  const crew = buildAll(read, { features: { crewHi: true }, hi: true }).summary;
  assert.deepEqual(crew.room, PIN.off.room);
  assert.notEqual(crew.crew.classic.sha256, PIN.off.crew.classic.sha256);
});

test("dense crew parts keep the authored silhouette, frames and paint slots", () => {
  const H = load(read, { hi: true });
  const B = H.get("GarageCrewDraw").body;
  for (const name of Object.keys(B.PARTS)) {
    const box = (dense) => {
      const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
      if (dense) B.detail(true, () => B.build(out, name, [1, 0, 0], [0, 1, 0])); else B.build(out, name, [1, 0, 0], [0, 1, 0]);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], cols = new Set();
      for (let i = 0; i < out.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], out.pos[i + k]); hi[k] = Math.max(hi[k], out.pos[i + k]); }
      for (let i = 0; i < out.col.length; i += 3) cols.add(out.col.slice(i, i + 3).join(","));
      return { lo, hi, cols, tris: out.idx.length / 3 };
    };
    const a = box(false), b = box(true);
    for (let k = 0; k < 3; k++) {
      const span = a.hi[k] - a.lo[k];
      assert.ok(Math.abs(b.lo[k] - a.lo[k]) <= span * 0.06 && Math.abs(b.hi[k] - a.hi[k]) <= span * 0.06, `${name} axis ${k}: bounds held`);
    }
    assert.deepEqual([...b.cols].sort(), [...a.cols].sort(), `${name}: same paint slots`);
    assert.ok(b.tris >= a.tris * 3.5, `${name}: denser (${a.tris} -> ${b.tris})`);
    assert.equal(B.isDense(), false, "detail() restores the scope");
  }
});

test("GarageHiPrims: bevelled box, swept hose and lathed tyre are clean and outward-wound", () => {
  const H = load(read, { hi: true });
  const P = H.get("GarageHiPrims"), GP = H.get("GaragePrims");
  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const box = acc();
  P.bevelBox(box, [1, 2, 3], [0.4, 0.2, 0.1], 0.014, [1, 1, 1], 4, (mid, ny) => (ny ? 0 : mid));
  assert.equal(box.idx.length / 3, 44);
  assert.equal(box.mat.length, box.pos.length / 3, "one material id per vertex");
  const hose = acc();
  P.sweep(hose, P.spline([[0, 0, 0], [0.5, 0.2, 0], [0.6, 0.2, 0.8], [1.2, 0, 1]], 6), 0.02, [1, 1, 1], 12, 0);
  const tyre = acc();
  P.tyre(tyre, [0, 0.4, 0], [0.34, 0.4, 0], 0.34, [0, 0, 0], 28, 0);
  for (const [name, m] of [["box", box], ["hose", hose], ["tyre", tyre]]) {
    assert.equal(badTriangle([m]), null, name);
    assert.equal(backWound([m]), 0, name + ": wound with its normals");
  }
  // Outside a dense() scope GaragePrims is today's block; inside, the bevelled one; a throw restores the scope.
  const a = acc(), b = acc();
  GP.block(a, 0, 0, 0, 0.5, 0.5, 0.5, [1, 1, 1]);
  GP.dense(true, () => GP.block(b, 0, 0, 0, 0.5, 0.5, 0.5, [1, 1, 1]));
  assert.equal(a.idx.length / 3, 12);
  assert.equal(b.idx.length / 3, 44);
  assert.equal(GP.isDense(), false);
  assert.throws(() => GP.dense(true, () => { throw new Error("boom"); }), /boom/);
  assert.equal(GP.isDense(), false);
});
