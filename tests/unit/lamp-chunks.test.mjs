import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

// L5: js/lighting/frame-lights.js refills ONE buffer in place (`_allLightsBuf`), so
// a rebuild:true tuner edit (LAMP DENSITY, POOL RADIUS) changes its length and
// radii under the SAME identity. Keying on identity left the per-chunk tables
// baked for the old set: a smaller set indexed past its end -> NaN uniforms.
test("resolve re-bakes when the SAME array is refilled with a different lamp set (L5)", () => {
  const chunks = [chunk([-1, -1, -1], [1, 1, 1]), chunk([100, -1, -1], [101, 1, 1])];
  const buf = [];   // the producer's shape: a plain array, refilled in place
  const fill = (recs) => {
    buf.length = 0;
    for (const [x, y, z, rad] of recs) buf.push(x, y, z, 1, 1, 1, rad, 0, 0, 0, 0, 0, 0, 0, 0);
  };
  fill([[0, 0, 0, 50], [1, 0, 0, 50], [2, 0, 0, 50], [100, 0, 0, 50], [101, 0, 0, 50]]);
  const a = LampChunks.resolve(buf, chunks, 1);
  assert.ok(Math.max(...a.concat) >= 3, "5 lamps: the far chunk lists lamp 3 or 4");
  fill([[0, 0, 0, 50], [1, 0, 0, 50]]);   // same array, 2 lamps
  const b = LampChunks.resolve(buf, chunks, 1);
  assert.notEqual(b, a, "a refilled set must re-bake");
  for (const idx of b.concat) assert.ok(idx < 2, "no table index past the new lamp count (was " + idx + ")");
  // Radii move under the same identity too (POOL RADIUS): the far lamp no longer reaches its chunk.
  fill([[0, 0, 0, 50], [100, 0, 0, 50]]);
  const c = LampChunks.resolve(buf, chunks, 1);
  assert.equal(c.counts[1], 1);
  buf[21] = 0;   // lamp 1 radius goes dead in place (lane 6 of record 1)
  const d = LampChunks.resolve(buf, chunks, 1);
  assert.notEqual(d, c, "a radius change must re-bake");
  assert.equal(d.counts[1], 0);
});

test("resolve does NOT re-bake for a colour-only refill (flicker moves every frame)", () => {
  const chunks = [chunk([-1, -1, -1], [1, 1, 1])];
  const buf = [0, 0, 0, 1, 1, 1, 50, 0, 0, 0, 0, 0, 0, 0, 0];
  const a = LampChunks.resolve(buf, chunks, 1);
  buf[3] = 0.4; buf[4] = 0.3; buf[5] = 0.2;
  assert.equal(LampChunks.resolve(buf, chunks, 1), a, "rgb is not in the bake");
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
 * value. (Checked in vendor/three-0.186.0 rather than assumed:
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

/* ── buildGrid: shared cells ──────────────────────────────────────────────────
 *
 * TLX feeds road, terrain AND props chunks into ONE grid, and all three bin
 * onto the same world cells. The grid has one slot per cell; the last writer
 * used to win, so every prop in a cell shared with terrain lit from the
 * terrain chunk's lamp list and lost the lamps that reach only its own box.
 * A shared cell must carry the UNION of its chunks' lists, capped. */
test("buildGrid merges the lamp lists of chunks that share a cell", () => {
  // Lamp 0 reaches only the road box, lamp 1 only the prop box (a mast lamp
  // 30 m up), lamp 2 both. Same cell (7, 7) for both chunks.
  const lights = lampSet([[0, 0, 0, 8], [40, 30, 40, 8], [20, 5, 20, 40]]);
  const road = { min: [-2, -1, -2], max: [4, 1, 4], gx: 7, gz: 7 };
  const prop = { min: [38, 20, 38], max: [42, 28, 42], gx: 7, gz: 7 };
  const lone = { min: [100, 0, 0], max: [101, 1, 1], gx: 8, gz: 7 };
  for (const order of [[road, prop, lone], [prop, road, lone]]) {
    const t = LampChunks.buildTable(lights, order, 1);
    const g = LampChunks.buildGrid(t, order);
    const cat = g.concat || t.concat;
    const at = (gx, gz) => {
      const o = ((gz - g.gz0) * g.gw + (gx - g.gx0)) * 2;
      return Array.from(cat.slice(g.data[o], g.data[o] + g.data[o + 1])).sort();
    };
    assert.deepEqual(at(7, 7), [0, 1, 2], "shared cell carries every lamp that reaches either chunk");
    assert.deepEqual(at(8, 7), [], "an unshared cell keeps its own (empty) list");
    // The table's own ranges are untouched: per-chunk (GLX/WGX-style) reads agree.
    for (let c = 0; c < order.length; c++) {
      assert.deepEqual(Array.from(cat.slice(t.offsets[c], t.offsets[c] + t.counts[c])),
        Array.from(t.lists[c]));
    }
  }
});

test("a merged cell respects the table's cap", () => {
  // Two chunks in one cell, each reached by its own 20 lamps: the union (40)
  // must be cut to the knob's cap, with both chunks' nearest lamps in it.
  const recs = [];
  for (let i = 0; i < 20; i++) recs.push([i * 0.1, 0, 0, 5]);
  for (let i = 0; i < 20; i++) recs.push([200 + i * 0.1, 0, 0, 5]);
  const lights = lampSet(recs);
  const a = { min: [-1, -1, -1], max: [3, 1, 1], gx: 3, gz: 3 };
  const b = { min: [199, -1, -1], max: [203, 1, 1], gx: 3, gz: 3 };
  const t = LampChunks.buildTable(lights, [a, b], 0.5);
  const cap = LampChunks.capFor(0.5);
  const g = LampChunks.buildGrid(t, [a, b]);
  const cat = g.concat || t.concat;
  assert.equal(g.data[1], cap, "union capped at the knob's cap");   // 1x1 grid
  const got = Array.from(cat.slice(g.data[0], g.data[0] + g.data[1]));
  assert.ok(got.some((i) => i < 20) && got.some((i) => i >= 20), "both chunks contribute");
  assert.equal(new Set(got).size, got.length, "no duplicates");
});

/* ── TLX's caller: the bake-once promise must survive tlx.js ──────────────
 *
 * resolve() caches on the chunks ARRAY (WeakMap). TLX flattens its chunked
 * records into that array inside present(), and used to mint a fresh [] on
 * every rebake — and it rebaked whenever the RAW knob float moved (the slider
 * is step 0.001). So a PER-CHUNK LAMPS drag re-ran the full O(chunks x lamps)
 * bake plus buildGrid per input event, exactly the hitch resolve()'s cache was
 * built to remove. This lifts the REAL lamp-grid block out of
 * js/render/three/tlx.js (a re-implementation would test the test), runs it
 * against a counting LampChunks and a stub lit, and pins:
 *   - a drag inside one cap never re-uploads the grid (key = capFor(knob));
 *   - a full 0..1 drag bakes the table ONCE (the chs array is kept);
 *   - a changed chunk set still rebuilds the array and rebakes. */
function liftBlock(src, head) {
  const start = src.indexOf(head);
  assert.notEqual(start, -1, "tlx.js lamp-grid block moved — update this test, do not delete it");
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}
/** A `let <name> ...` state line tlx.js declares for the block ("" if absent:
 *  the behavioural assertions below, not a missing name, are the verdict). */
function liftDecl(src, name) {
  const m = src.match(new RegExp(`^\\s*let ${name}\\b[^\\n]*$`, "m"));
  return m ? m[0] : "";
}
function tlxLampGrid() {
  const TLX = readFileSync(join(ROOT, "js/render/three/tlx.js"), "utf8");
  const block = liftBlock(TLX, "if (lit && lit.setLampGrid) {");
  const src = readFileSync(join(ROOT, SRC_PATH), "utf8");
  const LC = new Function(
    DEPS + "\n" + src.replace("function buildTable(lights, chunks, knob) {",
                "function buildTable(lights, chunks, knob) { __n.bakes++;")
    + "; return LampChunks;")
  ;
  const n = { bakes: 0, grids: 0 };
  globalThis.__n = n;
  const LampChunksC = LC();
  const lit = { setLampGrid: (g) => { if (g) n.grids++; return true; }, setLampGridColors: () => {} };
  const decls = [liftDecl(TLX, "_lgKey"), liftDecl(TLX, "_lgChs")].join("\n");
  const run = new Function("LampChunks", "Log", "lit", `
    ${decls}
    let frameAllLightsGen = 0, _lgGen = -1, _lampGridState = null;
    let frameAllLights = null, framePerChunk = 0, drawList = null;
    return function (dl, AL, knob) {
      drawList = dl; frameAllLights = AL; framePerChunk = knob;
      ${block}
      return _lampGridState;
    };`)(LampChunksC, { info() {} }, lit);
  return { run, n };
}

test("TLX lamp grid: a PER-CHUNK LAMPS drag bakes once and re-grids only per cap", () => {
  const lights = lampSet(Array.from({ length: 40 }, (_, i) => [i * 4, 0, 0, 50]));
  const cells = Array.from({ length: 12 }, (_, c) =>
    ({ min: [c * 9, -1, -1], max: [c * 9 + 8, 1, 1], gx: c, gz: 0 }));
  const drawList = [{ chunked: { chunks: cells, cellSize: 72 } }, { geo: {} }];
  const { run, n } = tlxLampGrid();
  try {
    const st = run(drawList, lights, 0.3);
    assert.equal(st.on, true, `grid refused: ${st.why}`);
    assert.equal(n.bakes, 1);
    assert.equal(n.grids, 1);
    // Same cap: 0.300 .. 0.310 all map onto one capFor() value.
    const cap = LampChunks.capFor(0.3);
    for (let k = 0.301; k <= 0.3101; k += 0.001) {
      const knob = Math.round(k * 1000) / 1000;
      if (LampChunks.capFor(knob) !== cap) continue;
      run(drawList, lights, knob);
    }
    assert.equal(n.grids, 1, "a drag inside one cap must not rebuild the grid (key on capFor(knob), not the raw float)");
    // A full drag crosses every cap: re-grids per cap, but ONE bake.
    for (let k = 0.001; k <= 1.0001; k += 0.001) run(drawList, lights, Math.round(k * 1000) / 1000);
    assert.equal(n.bakes, 1, `a full drag baked ${n.bakes} times — tlx.js must keep its chs array across rebakes`);
    assert.ok(n.grids > 1, "crossing caps must still re-grid");
    // A new chunk set is a new array and a genuine rebake.
    const cells2 = cells.slice(0, 6);
    run([{ chunked: { chunks: cells2, cellSize: 72 } }], lights, 1);
    assert.equal(n.bakes, 2, "a changed chunk set must rebake");
  } finally {
    delete globalThis.__n;
  }
});

/* ── ChunkBins: the chunk key the lamp grid decodes ──────────────────────────
 *
 * R3-ARCHITECTURE-5 (2026-10-10). buildGrid above trusts each chunk's gx/gz,
 * and those come from the binning loop every backend's chunked builder ran —
 * four copies (GLX, TLX, WGX ×2) of `floor(centroid / cell) + 1024`, keyed
 * `gx * 4096 + gz`. One shared helper now; these pin its key and that the
 * GLX and TLX builders bin through it. WGX still carries its two copies (the
 * WGX lane migrates them); the allow-list below may only shrink. */
const ChunkBins = new Function(readFileSync(join(ROOT, "js/render/shared/chunk-bins.js"), "utf8") + "; return ChunkBins;")();

test("ChunkBins key: gx * 4096 + gz over 72 m cells biased by 1024, and it round-trips", () => {
  assert.deepEqual([ChunkBins.CELL, ChunkBins.BIAS, ChunkBins.STRIDE], [72, 1024, 4096]);
  assert.equal(ChunkBins.cellSize(0), 72);
  assert.equal(ChunkBins.cellSize(50), 50);
  assert.equal(ChunkBins.cellOf(-0.5, 72), 1023, "floor, not truncation: -0.5 m is the cell west of the origin");
  assert.equal(ChunkBins.cellOf(71.9, 72), 1024);
  for (const [gx, gz] of [[1024, 1024], [0, 4095], [2047, 3], [1500, 600]]) {
    const k = ChunkBins.key(gx, gz);
    assert.equal(k, gx * 4096 + gz);
    assert.deepEqual([ChunkBins.gxOf(k), ChunkBins.gzOf(k)], [gx, gz]);
  }
});

test("ChunkBins.bin: centroid cells, vertex AABBs, emission order, absolute indices", () => {
  // Three triangles: two in the origin cell, one whose centroid sits in the
  // +x neighbour but whose vertex reaches back across the boundary.
  const pos = new Float32Array([
    0, 0, 0,   10, 0, 0,   0, 0, 10,      // tri 0: cell (1024, 1024)
    100, 2, 0, 110, 0, 0,  60, -1, 5,     // tri 1: centroid x 90 -> cell (1025, 1024); vertex x 60 is in 1024
    5, 1, 5,   6, 0, 5,    5, 0, 6,       // tri 2: cell (1024, 1024) again
  ]);
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const b = ChunkBins.bin(pos, idx, 72);
  assert.deepEqual([...b.keys()], [ChunkBins.key(1024, 1024), ChunkBins.key(1025, 1024)], "first-seen order");
  const o = b.get(ChunkBins.key(1024, 1024)), e = b.get(ChunkBins.key(1025, 1024));
  assert.deepEqual(o.idx, [0, 1, 2, 6, 7, 8]);
  assert.deepEqual([o.mn, o.mx], [[0, 0, 0], [10, 1, 10]]);
  assert.deepEqual(e.idx, [3, 4, 5]);
  assert.deepEqual([e.mn, e.mx], [[60, -1, 0], [110, 2, 5]], "the AABB is the vertices', so it may leave its own cell");
});

test("the GLX and TLX chunked builders bin through ChunkBins (no private copy of the key)", () => {
  const COPY = /\*\s*4096\s*\+\s*gz|\)\s*\/\s*cell\)\s*\+\s*1024/;
  const allowed = new Set(["js/render/webgpu/wgx-chunked.js"]);   // WGX lane: migrate, then delete this entry
  const walk = (rel) => readdirSync(join(ROOT, rel), { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(rel + "/" + e.name) : e.name.endsWith(".js") ? [rel + "/" + e.name] : []);
  const copies = walk("js/render").filter((f) => f !== "js/render/shared/chunk-bins.js" && !f.includes("/vendor/"))
    .filter((f) => readFileSync(join(ROOT, f), "utf8").split("\n").some((l) => !/^\s*(\/\/|\*)/.test(l) && COPY.test(l)));
  assert.deepEqual(copies.filter((f) => !allowed.has(f)), [], "bin through ChunkBins.bin / ChunkBins.key instead");
  for (const f of ["js/render/glx/chunked.js", "js/render/three/tlx-chunked.js"]) {
    assert.match(readFileSync(join(ROOT, f), "utf8"), /ChunkBins\.bin\(pos, srcIdx, cell\)/, f);
  }
});
