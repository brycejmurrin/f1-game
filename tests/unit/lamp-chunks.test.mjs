import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// LampChunks is the ONE home of per-chunk lamp selection (nearest-K whose
// radius reaches the chunk AABB, capped by the 0..1 knob) shared by GLX and
// WGX. This suite pins the algorithm and the invalidation contract the
// renderers rely on: same (lights identity, knob) -> the SAME table object
// (bake once), new lights array or moved knob -> a fresh bake.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const MAN = require(join(ROOT, "tools/manifest.cjs"));
const SRC_PATH = (MAN.PATHS && MAN.PATHS.LAMP_CHUNKS) || "js/render/shared/lamp-chunks.js";

// LampChunks reads LightBudget.CHUNK at eval and Frustum.aabbDist2 at call time
// (both manifest FULL entries that load before it).
const DEPS = ["js/render/shared/light-budget.js", "js/render/shared/frustum.js"]
  .map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
const LampChunks = new Function(
  DEPS + "\n" + readFileSync(join(ROOT, SRC_PATH), "utf8") + "; return LampChunks;"
)();

// A stride-15 lamp record: [x,y,z, r,g,b, rad, ...8 zeros].
function lampSet(recs) {
  const L = new Float32Array(recs.length * 15);
  recs.forEach(([x, y, z, rad], i) => {
    const o = i * 15;
    L[o] = x; L[o + 1] = y; L[o + 2] = z; L[o + 6] = rad;
  });
  return L;
}
const chunk = (mn, mx) => ({ min: mn, max: mx });

test("selection is nearest-first among lamps whose radius reaches the AABB", () => {
  // Chunk spans x 0..10; lamps along +x at growing distance, one out of reach,
  // one with a dead radius. Distances from the AABB face at x=10.
  const lights = lampSet([
    [40, 0, 0, 50],   // idx 0, d=30
    [12, 0, 0, 50],   // idx 1, d=2  (nearest)
    [25, 0, 0, 50],   // idx 2, d=15
    [200, 0, 0, 5],   // idx 3, out of reach (d=190 > rad 5)
    [11, 0, 0, 0],    // idx 4, rad 0 — never selectable
    [5, 0, 0, 50],    // idx 5, INSIDE the box, d=0 (first)
  ]);
  const t = LampChunks.buildTable(lights, [chunk([0, -1, -1], [10, 1, 1])], 1);
  assert.deepEqual(Array.from(t.lists[0]), [5, 1, 2, 0]);
});

test("the cap formula: full at the ends, proportional between, floored at 8", () => {
  assert.equal(LampChunks.CAP, 24);
  assert.equal(LampChunks.capFor(1), 24);
  assert.equal(LampChunks.capFor(0), 24);      // 0 never reaches the bake (feature off)
  assert.equal(LampChunks.capFor(0.5), 12);
  assert.equal(LampChunks.capFor(0.05), 8);    // floor keeps a chunk's own lamp
  assert.equal(LampChunks.capFor(0.999), 24);
});

test("buildTable truncates each chunk's list at the knob's cap", () => {
  const recs = [];
  for (let i = 0; i < 30; i++) recs.push([i, 0, 0, 100]);
  const lights = lampSet(recs);
  const full = LampChunks.buildTable(lights, [chunk([0, 0, 0], [1, 1, 1])], 1);
  assert.equal(full.lists[0].length, 24);
  const half = LampChunks.buildTable(lights, [chunk([0, 0, 0], [1, 1, 1])], 0.5);
  assert.equal(half.lists[0].length, 12);
});

test("concat/offsets/counts are exactly the per-chunk lists back to back", () => {
  const lights = lampSet([[0, 0, 0, 30], [100, 0, 0, 30], [50, 0, 0, 200]]);
  const chunks = [
    chunk([-5, -1, -1], [5, 1, 1]),      // reaches 0 and 2
    chunk([95, -1, -1], [105, 1, 1]),    // reaches 1 and 2
    chunk([900, -1, -1], [910, 1, 1]),   // reaches nothing
  ];
  const t = LampChunks.buildTable(lights, chunks, 1);
  assert.equal(t.offsets.length, 3);
  assert.equal(t.counts.length, 3);
  let off = 0;
  for (let c = 0; c < chunks.length; c++) {
    assert.equal(t.offsets[c], off);
    assert.equal(t.counts[c], t.lists[c].length);
    assert.deepEqual(Array.from(t.concat.slice(off, off + t.counts[c])),
                     Array.from(t.lists[c]));
    off += t.counts[c];
  }
  assert.equal(t.concat.length, off);
  assert.equal(t.counts[2], 0);          // the unreachable chunk is present, empty
});

test("resolve bakes once per lights identity, and re-caps rather than re-baking", () => {
  const lights = lampSet([[0, 0, 0, 50]]);
  const chunks = [chunk([-1, -1, -1], [1, 1, 1])];
  const a = LampChunks.resolve(lights, chunks, 1);
  assert.equal(LampChunks.resolve(lights, chunks, 1), a, "same pair must return the cached table");
  const b = LampChunks.resolve(lights, chunks, 0.5);
  assert.notEqual(b, a, "a knob move that changes the CAP must hand back a re-capped table");
  const relit = lampSet([[0, 0, 0, 50]]);   // equal content, NEW identity
  const c = LampChunks.resolve(relit, chunks, 0.5);
  assert.notEqual(c, b, "a rebuilt lights array must re-bake (rebuild knobs null track._lights)");
});

test("empty inputs stay well-formed", () => {
  const none = LampChunks.buildTable(new Float32Array(0), [chunk([0, 0, 0], [1, 1, 1])], 1);
  assert.equal(none.lists[0].length, 0);
  assert.equal(none.concat.length, 0);
  const noChunks = LampChunks.buildTable(lampSet([[0, 0, 0, 9]]), [], 1);
  assert.equal(noChunks.lists.length, 0);
  assert.equal(noChunks.concat.length, 0);
});

test("the bake is deterministic — two builds of the same triple agree byte for byte", () => {
  const recs = [];
  for (let i = 0; i < 40; i++) recs.push([(i * 37) % 200, 0, (i * 53) % 200, 60]);
  const lights = lampSet(recs);
  const chunks = [chunk([0, -1, 0], [72, 1, 72]), chunk([72, -1, 0], [144, 1, 72])];
  const t1 = LampChunks.buildTable(lights, chunks, 0.7);
  const t2 = LampChunks.buildTable(lights, chunks, 0.7);
  assert.deepEqual(Array.from(t1.concat), Array.from(t2.concat));
  assert.deepEqual(Array.from(t1.offsets), Array.from(t2.offsets));
});

// ── the drag hitch ─────────────────────────────────────────────────────────
// PER-CHUNK LAMPS is `step: 0.001` over 0..1, so a drag walks 1000 distinct
// knob values. The bake depends on the knob ONLY through capFor(), which has
// at most 17 distinct outputs — so re-baking per input event was producing
// byte-identical tables at 26-37 ms each, synchronously, mid-pass.

test("a knob move inside one cap does not re-bake at all", () => {
  const lights = lampSet(Array.from({ length: 40 }, (_, i) => [i * 3, 0, 0, 60]));
  const chunks = Array.from({ length: 12 }, (_, c) => chunk([c * 10, -1, -1], [c * 10 + 9, 1, 1]));
  // capFor(0.5) === capFor(0.52) === 12: every value in this band is one cap.
  assert.equal(LampChunks.capFor(0.5), LampChunks.capFor(0.52));
  const a = LampChunks.resolve(lights, chunks, 0.5);
  for (const k of [0.501, 0.505, 0.51, 0.515, 0.52])
    assert.equal(LampChunks.resolve(lights, chunks, k), a,
      `knob ${k} handed back a different table for the same cap`);
});

test("every cap re-caps to a table byte-identical to a fresh bake", () => {
  // The whole optimisation rests on one claim: a narrower cap is a PREFIX of
  // the full bake, because hits were sorted nearest-first before the cap was
  // applied. If that were ever false the picture would change silently, so it
  // is asserted across the entire knob range rather than at a sample point.
  const lights = lampSet(Array.from({ length: 60 }, (_, i) => [i * 2.5, 0, 0, 70]));
  const chunks = Array.from({ length: 16 }, (_, c) => chunk([c * 8, -1, -1], [c * 8 + 7, 1, 1]));
  const caps = new Set();
  for (let k = 0; k <= 1.0001; k += 0.001) {
    const knob = Math.round(k * 1000) / 1000;
    caps.add(LampChunks.capFor(knob));
    // A FRESH lights identity each time, so `resolve` cannot serve a cache hit
    // and must produce the table through the re-cap path.
    const viaResolve = LampChunks.resolve(lights, chunks, knob);
    const fresh = LampChunks.buildTable(lights, chunks, knob);
    assert.deepEqual(Array.from(viaResolve.concat), Array.from(fresh.concat), `concat differs at knob ${knob}`);
    assert.deepEqual(Array.from(viaResolve.counts), Array.from(fresh.counts), `counts differ at knob ${knob}`);
    assert.deepEqual(Array.from(viaResolve.offsets), Array.from(fresh.offsets), `offsets differ at knob ${knob}`);
    assert.equal(viaResolve.lists.length, fresh.lists.length);
    for (let c = 0; c < fresh.lists.length; c++)
      assert.deepEqual(Array.from(viaResolve.lists[c]), Array.from(fresh.lists[c]),
        `list ${c} differs at knob ${knob}`);
  }
  // Sanity on the premise: 1000 slider positions really do collapse to ~17.
  assert.ok(caps.size <= 17, `expected <=17 distinct caps, got ${caps.size}`);
  assert.ok(caps.size >= 10, `only ${caps.size} caps — the slider range is not being covered`);
});

test("a full drag costs ONE bake, not one per input event", () => {
  // The hitch, stated as a number. buildTable is the O(chunks x lamps) worker;
  // count how many times a 1000-step drag reaches it.
  const lights = lampSet(Array.from({ length: 50 }, (_, i) => [i * 3, 0, 0, 60]));
  const chunks = Array.from({ length: 20 }, (_, c) => chunk([c * 9, -1, -1], [c * 9 + 8, 1, 1]));
  const real = LampChunks.buildTable;
  let bakes = 0;
  // Count through the module's own export surface: resolve() closes over the
  // inner binding, so wrap by re-running the source with a counting shim.
  const src = readFileSync(join(ROOT, SRC_PATH), "utf8");
  const Counted = new Function(
    DEPS + "\n" + src.replace("function buildTable(lights, chunks, knob) {",
                "function buildTable(lights, chunks, knob) { globalThis.__bakes = (globalThis.__bakes || 0) + 1;")
    + "; return LampChunks;")();
  globalThis.__bakes = 0;
  for (let k = 0; k <= 1.0001; k += 0.001) Counted.resolve(lights, chunks, Math.round(k * 1000) / 1000);
  bakes = globalThis.__bakes;
  delete globalThis.__bakes;
  assert.equal(bakes, 1, `a 1001-step drag ran buildTable ${bakes} times; it must bake once`);
  assert.equal(typeof real, "function");
});

/* ── buildGrid: the form three.js needs ────────────────────────────────────
 *
 * GLX binds a chunk's list per draw and WGX passes (offset, count) in a
 * per-draw uniform. THREE HAS NEITHER — every visible chunk is drawn from one
 * pooled mesh sharing ONE material, so there is nowhere to put a per-chunk
 * value. (Checked in vendor/three-0.185.1 rather than assumed:
 * `nodeUniformDrawId` is declared only when `object.isBatchedMesh` and set only
 * in the BatchedMesh branch of WebGLBackend._draw, so `drawIndex` reads nothing
 * from a plain Mesh.) What three CAN read is positionWorld — and the chunks are
 * a regular XZ grid — so buildGrid flattens the table into a dense
 * (offset, count) image the fragment samples with one fetch.
 */
const gchunk = (gx, gz) => ({ min: [0, 0, 0], max: [1, 1, 1], gx, gz });

test("buildGrid places each chunk's (offset, count) at its own cell", () => {
  const chunks = [gchunk(10, 20), gchunk(12, 20), gchunk(10, 22)];
  const table = { offsets: new Uint32Array([0, 7, 19]), counts: new Uint32Array([7, 12, 5]) };
  const g = LampChunks.buildGrid(table, chunks);
  // Extent is the occupied span, not the 4096-biased key space.
  assert.deepEqual([g.gw, g.gh, g.gx0, g.gz0], [3, 3, 10, 20]);
  const at = (gx, gz) => {
    const o = ((gz - g.gz0) * g.gw + (gx - g.gx0)) * 2;
    return [g.data[o], g.data[o + 1]];
  };
  assert.deepEqual(at(10, 20), [0, 7]);
  assert.deepEqual(at(12, 20), [7, 12]);
  assert.deepEqual(at(10, 22), [19, 5]);
  // Unoccupied cells read count 0 — the shader's signal to fall back to the
  // global lamp set, which is exactly today's behaviour.
  assert.deepEqual(at(11, 21), [0, 0]);
  assert.equal(g.data.length, 3 * 3 * 2);
});

test("buildGrid survives a chunk with no cell, and an empty set", () => {
  // A chunk built before the grid coords existed (or by a non-grid path) has no
  // gx/gz. It must not place, must not throw, and must not drag the extent to 0.
  const chunks = [gchunk(5, 5), { min: [0, 0, 0], max: [1, 1, 1] }];
  const table = { offsets: new Uint32Array([0, 3]), counts: new Uint32Array([3, 4]) };
  const g = LampChunks.buildGrid(table, chunks);
  assert.deepEqual([g.gw, g.gh, g.gx0, g.gz0], [1, 1, 5, 5]);
  assert.deepEqual(Array.from(g.data), [0, 3]);

  // Empty input still yields a bindable 1x1 texture rather than a zero-sized
  // one — a backend always has something to bind.
  const e = LampChunks.buildGrid({ offsets: new Uint32Array(0), counts: new Uint32Array(0) }, []);
  assert.deepEqual([e.gw, e.gh], [1, 1]);
  assert.equal(e.data.length, 2);
});

test("buildGrid round-trips a real bake through the cell mapping", () => {
  // End to end: bake a table for two chunks, flatten it, and read back the
  // slice each cell names. The indices must be the chunk's own list.
  const lights = lampSet([[0, 0, 0, 50], [100, 0, 0, 50]]);
  const chunks = [
    { min: [-5, -1, -1], max: [5, 1, 1], gx: 1024, gz: 1024 },
    { min: [95, -1, -1], max: [105, 1, 1], gx: 1025, gz: 1024 },
  ];
  const t = LampChunks.buildTable(lights, chunks, 1);
  const g = LampChunks.buildGrid(t, chunks);
  for (let c = 0; c < chunks.length; c++) {
    const o = ((chunks[c].gz - g.gz0) * g.gw + (chunks[c].gx - g.gx0)) * 2;
    const off = g.data[o], n = g.data[o + 1];
    assert.deepEqual(Array.from(t.concat.slice(off, off + n)), Array.from(t.lists[c]),
      `cell ${chunks[c].gx},${chunks[c].gz} must name chunk ${c}'s own lamps`);
  }
});

/* ── blitGrid: the two strides ────────────────────────────────────────────────
 *
 * Found by survey, 2026-09-18, in js/render/three/tsl-lit.js — the DEFAULT
 * renderer. It copied buildGrid()'s data into the 256-wide gridTex linearly,
 * with a comment asserting the strides matched. They do not: the bake's row
 * stride is `gw` (the occupied extent — a few dozen cells for a real circuit),
 * the texture's is 256. The shader reads textureLoad(grid, ivec2(cx, cz)), so
 * every row but the first landed on a zero pair; count 0 makes `use` false and
 * the per-chunk lamp path fell back to the global lamp set over almost the whole
 * grid, with no error, no log and no visible failure mode beyond "night lighting
 * doesn't look like the knob does anything".
 *
 * The copy now lives in LampChunks next to the layout that defines the stride,
 * so this is testable in node and any future backend gets it right for free.
 */
test("blitGrid lands cell (x, z) on texture row z, not on a linear offset", () => {
  const G = 8;                       // stand-in for the texture width
  const gw = 3, gh = 3;
  const data = new Uint32Array(gw * gh * 2);
  for (let z = 0; z < gh; z++) {
    for (let x = 0; x < gw; x++) {
      const o = (z * gw + x) * 2;
      data[o] = 100 + z * 10 + x;    // "offset"
      data[o + 1] = z * 10 + x;      // "count"
    }
  }
  const dst = new Float32Array(G * G * 2);
  assert.equal(LampChunks.blitGrid({ gw, gh, gx0: 0, gz0: 0, data }, dst, G), true);
  for (let z = 0; z < gh; z++) {
    for (let x = 0; x < gw; x++) {
      // Exactly the shader's fetch: texel (x, z) of a G-wide RG texture.
      assert.equal(dst[(z * G + x) * 2], 100 + z * 10 + x,
        `cell (${x}, ${z}) must be readable at texel (${x}, ${z}) — a linear copy puts it at column ${z * gw + x}`);
      assert.equal(dst[(z * G + x) * 2 + 1], z * 10 + x, `count for cell (${x}, ${z})`);
    }
  }
});

test("blitGrid refuses a grid the texture cannot hold, and leaves it untouched", () => {
  const dst = new Float32Array(4 * 4 * 2).fill(7);
  // Refusing is the documented fallback: the caller turns the path off and every
  // fragment keeps the global lamp set, which is a picture rather than a mess.
  assert.equal(LampChunks.blitGrid({ gw: 5, gh: 1, gx0: 0, gz0: 0, data: new Uint32Array(10) }, dst, 4), false);
  assert.equal(LampChunks.blitGrid({ gw: 1, gh: 5, gx0: 0, gz0: 0, data: new Uint32Array(10) }, dst, 4), false);
  assert.equal(LampChunks.blitGrid(null, dst, 4), false);
  assert.ok(dst.every((v) => v === 7), "a refused blit must not have written anything");
});
