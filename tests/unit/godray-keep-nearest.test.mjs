import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The god-ray nearest-k lamp selection is one algorithm cloned into all three
// backends. Its eviction MUST swap, never overwrite: the pool objects are
// reused by index every frame (the fill writes e.d/.o/.i in place), so an
// overwrite leaves one object aliased at two indices and the evicted object
// orphaned — the next fill then uploads one lamp's data at both slots
// (double-bright beam) while another lamp becomes permanently unselectable.
// The shipped lifecycle test drove only 3 lights (below k=6), so the buggy
// second loop never ran; this suite drives 10 lights over 5 moving-eye
// frames, including the measured frame-4 failure pattern.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCES = [
  ["spike/backends/webgpu/wgx.js", "wgx"],
  ["js/render/glx/post.js", "glx"],
  ["spike/backends/three/tlx-post.js", "tlx"],
];

function extract(path) {
  const src = readFileSync(join(ROOT, path), "utf8");
  const at = src.indexOf("function _grKeepNearest(");
  assert.ok(at >= 0, path + " must contain _grKeepNearest");
  // Slice to the function's closing brace by depth-counting.
  let depth = 0, i = src.indexOf("{", at);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(at, i + 1);
}

function instantiate(fnText) {
  // The clones close over _grSel; rebind it as a parameter-scoped array.
  return new Function("_grSel", fnText + "; return _grKeepNearest;");
}

function makePool(count) {
  return Array.from({ length: count }, () => ({ d: 0, o: 0, i: 0 }));
}

test("keep-nearest keeps the pool a permutation and selects the true top-k over moving frames", () => {
  const K = 6, TOTAL = 10, FRAMES = 5;
  for (const [path] of SOURCES) {
    const keep = instantiate(extract(path));
    const pool = makePool(TOTAL);
    const sel = pool.slice();
    const fn = keep(sel);
    for (let f = 0; f < FRAMES; f++) {
      // Fill by index, exactly like the per-frame fill in the backends: each
      // pool slot i takes lamp i's identity and this frame's eye distance.
      // The sliding eye reproduces the measured aliasing pattern.
      for (let i = 0; i < TOTAL; i++) {
        sel[i].o = i * 15;
        sel[i].i = i;
        sel[i].d = Math.abs(i * 10 - f * 17) + (i % 3);
      }
      const n = fn(TOTAL, K);
      assert.equal(n, K, path + " frame " + f + ": n");
      assert.equal(new Set(sel.slice(0, TOTAL)).size, TOTAL,
        path + " frame " + f + ": pool must stay a permutation (no aliased objects)");
      const ref = sel.slice(0, TOTAL).map((e) => e.d).sort((a, b) => a - b).slice(0, K);
      const got = sel.slice(0, K).map((e) => e.d).sort((a, b) => a - b);
      assert.deepEqual(got, ref,
        path + " frame " + f + ": selected set must be the true nearest-" + K);
      const ids = new Set(sel.slice(0, K).map((e) => e.o));
      assert.equal(ids.size, K,
        path + " frame " + f + ": no lamp may appear twice in the selection");
    }
  }
});

test("the three backend clones stay in lockstep", () => {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const [a, b, c] = SOURCES.map(([p]) => norm(extract(p)));
  assert.equal(a, b, "wgx and glx clones must match");
  assert.equal(b, c, "glx and tlx clones must match");
});
