// The track build's spatial short-cuts answer EXACTLY what the slow path did.
//
// Perf hunt 2 (docs/notes/PERF-HUNT-2-2026-10-13.md §D) replaced three
// over-wide or wasted passes in the build with narrower ones, each proven
// byte-identical over all 52 circuits × day/night by an md5 of every mesh
// buffer (the hunt's fleet harness). These are the cheap, hand-built
// counterparts that keep each argument true without a fleet build:
//   * TrackMesh.nodeGrid().queryRects (T1) is query()'s candidate list with
//     the nodes outside A ∪ B removed and nothing reordered;
//   * TrackGeom.roundNormals (T2) leaves a non-array accumulator untouched
//     (it used to write NaN under integer keys onto it);
//   * TrackHiddenFaces.strip (T4) gives the same answer when a giant box goes
//     to its own coarse grid instead of every 8 m cell it covers.
//
// Pure Node: the engine prelude of tools/manifest.cjs TRACK_VM in a VM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "tools", "manifest.cjs"));

function engine() {
  const quiet = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  const ctx = vm.createContext({ console: quiet, Math, performance });
  ctx.window = ctx;
  for (const rel of M.TRACK_VM) {
    if (rel === "@circuits") break;
    const src = readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: rel });
    if (rel === "js/track/core/hidden-faces.js") break;
  }
  return ctx;
}
const E = engine();

// Deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("nodeGrid.queryRects = query() minus the nodes outside A ∪ B, order kept", () => {
  const r = rng(7), n = 600;
  const px = new Float64Array(n), pz = new Float64Array(n), hw = new Float64Array(n).fill(6);
  for (let k = 0; k < n; k++) { px[k] = (r() - 0.5) * 900; pz[k] = (r() - 0.5) * 900; }
  const grid = E.TrackMesh.nodeGrid({ n, px, pz, hw });
  const CELL = 10, cellOf = (v) => Math.floor(v / CELL);
  const inRect = (k, q) => q && cellOf(px[k]) >= cellOf(q[0]) && cellOf(px[k]) <= cellOf(q[1]) &&
    cellOf(pz[k]) >= cellOf(q[2]) && cellOf(pz[k]) <= cellOf(q[3]);
  const a = new Array(n), b = new Array(n);
  let nonEmpty = 0, twoRects = 0;
  for (let t = 0; t < 400; t++) {
    const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900, R = 5 + r() * 400;
    const rect = (cx, cz) => { const ex = r() * 300, ez = r() * 300; return [cx - ex, cx + ex, cz - ez, cz + ez]; };
    const A = rect(x + (r() - 0.5) * 200, z + (r() - 0.5) * 200);
    const B = r() < 0.6 ? rect((r() - 0.5) * 900, (r() - 0.5) * 900) : null;
    if (B) twoRects++;
    const cn = grid.query(x, z, R, a, false);
    const want = a.slice(0, cn).filter((k) => inRect(k, A) || inRect(k, B));
    const got = b.slice(0, grid.queryRects(x, z, R, A, B, b));
    assert.deepEqual(got, want, `trial ${t}`);
    if (want.length) nonEmpty++;
  }
  assert.ok(nonEmpty > 100 && twoRects > 100, `the fuzz exercised the union (${nonEmpty} non-empty, ${twoRects} with B)`);
});

test("roundNormals leaves a non-array accumulator alone (no NaN integer keys)", () => {
  const acc = E.TrackModels.scratch();
  const v0 = 0;
  E.TrackGeom.addBox(acc, [0, 1, 0], [2, 2, 2], [0.5, 0.5, 0.5]);
  const keys = Object.keys(acc.nrm).length;
  E.TrackGeom.roundNormals(acc, v0, [0, 0, 0], [0, 1, 0]);
  assert.equal(Object.keys(acc.nrm).length, keys, "no keys were added to the accumulator");
  // a plain array is still rounded
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  E.TrackGeom.addBox(out, [0, 1, 0], [2, 2, 2], [0.5, 0.5, 0.5]);
  const before = out.nrm.slice();
  E.TrackGeom.roundNormals(out, 0, [0, 0, 0], [0, 1, 0]);
  assert.notDeepEqual(out.nrm, before, "an indexable buffer still rounds");
  assert.ok(out.nrm.every(Number.isFinite));
});

test("hidden-face strip: a giant box (coarse grid) hides exactly what a brute-force scan says", () => {
  const r = rng(11);
  const geo = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const boxes = [];
  const add = (c, sz) => { boxes.push({ c, h: sz.map((v) => v / 2) }); E.TrackGeom.addBox(geo, c, sz, [0.5, 0.5, 0.5]); };
  // the giant sheets: 4 km x 20 m and 3 km x 3 km, far past BIG_CELLS 8 m cells
  add([0, -5, 0], [4000, 10, 20]);
  add([2500, 0, 2500], [3000, 40, 3000]);
  // small boxes: inside a giant (hidden), straddling its edge (kept), inside
  // another small box (the fine grid's own answer), and out in the open
  for (let i = 0; i < 120; i++) {
    const kind = i % 4, s = 0.5 + r() * 3;
    if (kind === 0) add([(r() - 0.5) * 3900, -5, (r() - 0.5) * 12], [s, s, s]);
    else if (kind === 1) add([(r() - 0.5) * 3900, 0, 10], [s, s, s]);
    else if (kind === 2) { const c = [1200 + r() * 2600, 0, 1200 + r() * 2600]; add(c, [8, 8, 8]); add(c, [s, s, s]); }
    else add([(r() - 0.5) * 6000, 50, -500 - r() * 500], [s, s, s]);
  }
  const pos = geo.pos.slice(), idx = geo.idx.slice(), T = idx.length / 3;
  const inside = (b, p) => Math.abs(p[0] - b.c[0]) < b.h[0] - 0.01 && Math.abs(p[1] - b.c[1]) < b.h[1] - 0.01 &&
    Math.abs(p[2] - b.c[2]) < b.h[2] - 0.01;
  const want = [];
  let hidden = 0;
  for (let t = 0; t < T; t++) {
    const P = [0, 1, 2].map((q) => pos.slice(idx[t * 3 + q] * 3, idx[t * 3 + q] * 3 + 3));
    if (boxes.some((b) => P.every((p) => inside(b, p)))) hidden++;
    else want.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
  }
  assert.ok(hidden > 12 * 60 && want.length > 0, `the scene exercises both grids (${hidden} hidden)`);
  const st = E.TrackHiddenFaces.strip(geo, {});
  assert.equal(st.boxes, boxes.length);
  assert.equal(st.enclosed, hidden);
  assert.deepEqual(Array.from(geo.idx), want);
});
