// track-build-vm-release.test.mjs — the sweeps harness's two memory contracts.
//
// tools/lib/track-build-vm.cjs shares ONE VM context across every circuit a
// sweep builds, deliberately: a fresh context per circuit was measured far more
// expensive. The cost of sharing is that nothing is reclaimed unless the caller
// says so, and the harness offers exactly two ways to say it:
//
//   trim(from)       drops the PRIMITIVE records this context accumulated (each
//                    one pins the whole mesh buffer its emitter wrote into).
//   release(track)   drops a finished build's own VERTEX BUFFERS — `propsGeo`
//                    and friends, plus this harness's per-mesh `__cap` capture
//                    — which trim() cannot reach, because they hang off the
//                    returned track rather than off the context.
//
// Both were being skipped. `pit-complex.test.mjs` and `pit-signs.test.mjs`
// build all 52 circuits and cache them to avoid rebuilding, and measured on
// this tree they peaked at 6173 MB and 5563 MB — half again over the 4088 MB
// that has already OOM-killed a sweep's audit child on CI (the note on ci.yml's
// prop-clipping step). With both calls they peak at 1342 MB and 799 MB.
//
// This file is the guard on the mechanism, not the symptom: a release() that
// quietly stopped releasing would put those suites straight back over the
// limit, and the suites themselves would still pass. So the assertions are on
// SLOTS REACHABLE from a track — a deterministic count, no timing, no RSS.
//
// Run: node --test tests/unit/track-build-vm-release.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// Monza: the heaviest props buffer in the fleet, and the circuit the harness's
// own retention note is measured on.
const ID = "monza";

const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();
const build = (id) => { const T = ctxOnce().Tracks; return T.build(T.LIST.find((d) => d.id === id)); };

/** Every array slot reachable from `o`, counting each object once. The measure
 *  that decides whether a release freed anything: bytes move with the
 *  allocator, slots do not. */
function slots(o, seen = new WeakSet(), depth = 0) {
  if (!o || typeof o !== "object" || depth > 8) return 0;
  if (seen.has(o)) return 0;
  seen.add(o);
  if (ArrayBuffer.isView(o)) return o.length;
  let n = 0;
  if (Array.isArray(o)) {
    n += o.length;
    for (const v of o) if (v && typeof v === "object") n += slots(v, seen, depth + 1);
    return n;
  }
  for (const k of Object.keys(o)) n += slots(o[k], seen, depth + 1);
  return n;
}

test("an unreleased build really does pin millions of slots — the problem is real", () => {
  const t = build(ID);
  ctxOnce().trim(0);
  const held = slots(t);
  // Measured 9.22 M on this tree (propsGeo 7.82 M of it). Asserted as a FLOOR
  // so this test cannot pass by the fleet getting smaller: if a build ever
  // holds little enough that the floor fails, the release below is pointless
  // and this whole file should go.
  assert.ok(held > 3e6,
    `a built track pinned only ${(held / 1e6).toFixed(2)} M slots. If a build no ` +
    `longer holds the geometry, release() is obsolete — delete it and this file.`);
});

test("release() empties the geometry buffers and the mesh capture", () => {
  const t = build(ID);
  ctxOnce().trim(0);
  const before = slots(t);
  assert.equal(ctxOnce().release(t), t, "release returns the track it was given");
  const after = slots(t);
  assert.ok(after < before / 10,
    `release() freed ${(before / 1e6).toFixed(2)} M -> ${(after / 1e6).toFixed(2)} M slots; ` +
    "it must drop at least nine tenths of what a build pins");
  for (const k of Object.keys(t)) {
    if (!/Geo$/.test(k) || !t[k] || typeof t[k] !== "object") continue;
    for (const f of Object.keys(t[k])) {
      const v = t[k][f];
      if (Array.isArray(v) || (v && ArrayBuffer.isView(v))) {
        assert.equal(v.length, 0, `track.${k}.${f} still holds ${v.length} slots`);
      }
    }
  }
  for (const [name, m] of Object.entries(t.meshes || {})) {
    if (!m || !m.__cap) continue;
    assert.equal(m.__cap.pos.length, 0, `meshes.${name}.__cap.pos still holds vertices`);
  }
});

test("release() keeps every measurement a sweep reads off the track", () => {
  // The whole point of caching a build is the numbers on it. Releasing the
  // buffers must not touch the centreline, the pit model, the graph, the
  // surface, the lamp registry or a mesh's identity — the fields
  // pit-complex.test.mjs and pit-signs.test.mjs actually assert on.
  const t = build(ID);
  ctxOnce().trim(0);
  const keep = {
    n: t.n, total: t.total, px: t.px.length, py: t.py.length, pz: t.pz.length,
    hw: t.hw.length, graph: t.graph.nodes.length, boxes: t.pit.row.boxes.length,
    rowS0: t.pit.row.s0, side: t.pit.side, mode: t.pit.mode,
    lamps: (t.lampPosts || []).length, roadVerts: t.meshes.road.verts,
    surface: typeof t.surface, uv: t.propsGeo.uv,
  };
  ctxOnce().release(t);
  assert.deepEqual({
    n: t.n, total: t.total, px: t.px.length, py: t.py.length, pz: t.pz.length,
    hw: t.hw.length, graph: t.graph.nodes.length, boxes: t.pit.row.boxes.length,
    rowS0: t.pit.row.s0, side: t.pit.side, mode: t.pit.mode,
    lamps: (t.lampPosts || []).length, roadVerts: t.meshes.road.verts,
    surface: typeof t.surface, uv: t.propsGeo.uv,
  }, keep, "release() changed something a sweep reads");
  assert.ok(keep.n > 100 && keep.boxes === 12 && keep.graph > 100,
    "the kept fields were non-trivial to begin with");
});

test("trim(from) drops the primitive records and the live-buffer set", () => {
  const ctx = ctxOnce();
  const mark = ctx.mark();
  build(ID);
  assert.ok(ctx.prims.length > mark, "a build records primitives");
  assert.ok(ctx.liveBufs.size > 0, "…and the meshes they reached");
  ctx.trim(mark);
  assert.equal(ctx.prims.length, mark, "trim truncates to the mark");
  assert.equal(ctx.liveBufs.size, 0, "trim clears the live-buffer set");
});

// P1 (docs/notes/SCENERY-QA-PLAN.md §2b): the build strips never-visible prop
// triangles from the INDEX buffer only (js/track/core/hidden-faces.js). Pinned
// per circuit at the measured share, deterministic across rebuilds, vertex
// buffer untouched, every surviving index in range. Measured 2026-09-24,
// re-measured after P2 moved the grandstand shell out from behind the crowd
// (fewer rows are enclosed, so fewer are stripped), and again after the verge
// carve fix raised the terrain beside descents (buried counts moved).
const STRIP = {
  monaco: { before: 293515, after: 252651 },
  monza: { before: 341148, after: 300843 },
};
for (const [id, want] of Object.entries(STRIP)) {
  test(`${id}: props index strip is at the measured share and deterministic`, () => {
    const a = build(id);
    const s = a.propsGeo._hidden;
    const V = a.propsGeo.pos.length / 3;
    const idxA = Array.from(a.propsGeo.idx);
    assert.equal(s.trisBefore, want.before, "props emission moved: re-measure STRIP");
    assert.equal(s.trisAfter, want.after,
      `stripped ${s.trisBefore - s.trisAfter} (enclosed ${s.enclosed}, buried ${s.buried}, bottom ${s.bottom})`);
    assert.equal(idxA.length, s.trisAfter * 3);
    assert.equal(s.enclosed + s.buried + s.bottom, s.trisBefore - s.trisAfter);
    assert.ok(idxA.every((i) => i >= 0 && i < V), "surviving indices in range");
    ctxOnce().release(a);
    const b = build(id);
    assert.equal(b.propsGeo.pos.length / 3, V, "vertex buffer untouched");
    assert.deepEqual(Array.from(b.propsGeo.idx), idxA, "deterministic across rebuilds");
    ctxOnce().release(b);
  });
}
