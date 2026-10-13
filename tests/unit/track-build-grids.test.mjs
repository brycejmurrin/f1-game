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
