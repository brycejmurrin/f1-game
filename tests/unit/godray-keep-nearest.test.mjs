import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The god-ray nearest-k lamp selection used to be one algorithm cloned into
// all three backends; it now lives ONCE in js/render/shared/post-common.js
// (PostCommon.keepNearest) and each backend aliases its `_grKeepNearest` to
// it. Its eviction MUST swap, never overwrite: the pool objects are reused by
// index every frame (the fill writes e.d/.o/.i in place), so an overwrite
// leaves one object aliased at two indices and the evicted object orphaned —
// the next fill then uploads one lamp's data at both slots (double-bright
// beam) while another lamp becomes permanently unselectable. The shipped
// lifecycle test drove only 3 lights (below k=6), so the buggy second loop
// never ran; this suite drives 10 lights over 5 moving-eye frames, including
// the measured frame-4 failure pattern.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED = "js/render/shared/post-common.js";
const BACKENDS = [
  "js/render/webgpu/wgx.js",
  "js/render/glx/post.js",
  "js/render/three/tlx-post.js",
];

function extract(path, name) {
  const src = readFileSync(join(ROOT, path), "utf8");
  const at = src.indexOf("function " + name + "(");
  assert.ok(at >= 0, path + " must contain " + name);
  // Slice to the function's closing brace by depth-counting.
  let depth = 0, i = src.indexOf("{", at);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(at, i + 1);
}

function makePool(count) {
  return Array.from({ length: count }, () => ({ d: 0, o: 0, i: 0 }));
}

test("keep-nearest keeps the pool a permutation and selects the true top-k over moving frames", () => {
  const K = 6, TOTAL = 10, FRAMES = 5;
  const keep = new Function(extract(SHARED, "keepNearest") + "; return keepNearest;")();
  const pool = makePool(TOTAL);
  const sel = pool.slice();
  for (let f = 0; f < FRAMES; f++) {
    // Fill by index, exactly like the per-frame fill in the backends: each
    // pool slot i takes lamp i's identity and this frame's eye distance.
    // The sliding eye reproduces the measured aliasing pattern.
    for (let i = 0; i < TOTAL; i++) {
      sel[i].o = i * 15;
      sel[i].i = i;
      sel[i].d = Math.abs(i * 10 - f * 17) + (i % 3);
    }
    const n = keep(sel, TOTAL, K);
    assert.equal(n, K, "frame " + f + ": n");
    assert.equal(new Set(sel.slice(0, TOTAL)).size, TOTAL,
      "frame " + f + ": pool must stay a permutation (no aliased objects)");
    const ref = sel.slice(0, TOTAL).map((e) => e.d).sort((a, b) => a - b).slice(0, K);
    const got = sel.slice(0, K).map((e) => e.d).sort((a, b) => a - b);
    assert.deepEqual(got, ref,
      "frame " + f + ": selected set must be the true nearest-" + K);
    const ids = new Set(sel.slice(0, K).map((e) => e.o));
    assert.equal(ids.size, K,
      "frame " + f + ": no lamp may appear twice in the selection");
  }
});

test("every backend aliases _grKeepNearest to the shared PostCommon.keepNearest (no private clone)", () => {
  for (const p of BACKENDS) {
    const src = readFileSync(join(ROOT, p), "utf8");
    assert.match(src, /const _grKeepNearest = \(total, k\) => PostCommon\.keepNearest\(_grSel, total, k\);/,
      p + " must alias _grKeepNearest to PostCommon.keepNearest over its _grSel pool");
    assert.doesNotMatch(src, /function _grKeepNearest\(/, p + " must not carry a private clone");
    assert.doesNotMatch(src, /_grSel\.sort\(/, p + " must not full-sort the floodlight list");
  }
});

// Edge table for keepNearest(sel, total, k): the pool stays a permutation, the first
// min(k, total) slots hold the nearest, and ties never alias an object.
const edgeCases = [
  { name: "k above total selects everything, sorted", ds: [5, 1, 3], k: 6, want: [1, 3, 5], n: 3 },
  { name: "k equal to total", ds: [4, 2, 9, 1], k: 4, want: [1, 2, 4, 9], n: 4 },
  { name: "all ties keep a permutation", ds: [2, 2, 2, 2, 2], k: 2, want: [2, 2], n: 2 },
  { name: "k of one picks the minimum", ds: [7, 3, 8, 3.5], k: 1, want: [3], n: 1 },
  { name: "empty total", ds: [], k: 3, want: [], n: 0 },
];
for (const c of edgeCases) {
  test(`keepNearest edge: ${c.name}`, () => {
    const keep = new Function(extract(SHARED, "keepNearest") + "; return keepNearest;")();
    const sel = c.ds.map((d, i) => ({ d, o: i * 15, i }));
    const before = new Set(sel);
    const n = keep(sel, c.ds.length, c.k);
    assert.equal(n, c.n);
    assert.deepEqual(sel.slice(0, n).map((e) => e.d).sort((a, b) => a - b), c.want);
    assert.equal(sel.length, c.ds.length);
    assert.deepEqual(new Set(sel), before, "same objects, none aliased or dropped");
  });
}
