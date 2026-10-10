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
// carve fix raised the terrain beside descents (buried counts moved), and
// after T3 draped groundPatch over the terrain (monza +834 patch triangles),
// and after merging landmark wave 3's Tribuna/podium densify on top.
// Re-measured 2026-09-24 after the scenery ground-audit (nature/city stop
// emitting never-visible palm stubs / underground facade detail) plus the
// tip engine grounding (tyre footings, marshal boards, hoarding legs, cable
// posts, pit exit signal): ship merge had restored the pre-audit STRIP
// numbers; tip then moved both circuits again.
// Re-measured 2026-10-01: venue facilities, supported crowd heads and camera
// guard panels; secondary facade panes reduced to pay for nearby detail.
const STRIP = {
  // ship 293659/258313 → audit 287677/252433 → tip 287821/258089
  // → fix-top-counts 285112/256710 (yachts/pontoons under the quay land no
  // longer moored; buried harbour balconies skipped; ground-audit)
  // → merged follow-ups 286489/257979 (yachts moored in open water, not
  // dropped; engine-helpers plinth sink)
  // → track limits 285994/257518 (two moored hulls over the road hole dropped)
  // → start-gantry lights 285946/257466 (the gantry housing is one bar, not three boxes: −48 indices)
  // → full-track-scenery onto tip aa4197c 263920/241522 (venue facilities +
  //   secondary facade pane reduction; measured 2026-10-02)
  // → white Haas 263920/241530 (2026-10-03: the VF-26 team colour went dark
  //   graphite → white, js/data/teams.js; its garage bay — GarageScene
  //   .buildStatic off the team colour — now carries an HDR-bright box, which
  //   hidden-faces never lets enclose, so 8 indices it used to strip stay.
  //   Bisected: the Haas colour alone moves both circuits by +8.)
  // → start gantry on the real line 263920/241547 (2026-10-04: gantry(0.0)
  //   re-keyed from 624 m past the grid to the line; same emission, 17 fewer
  //   of its triangles buried or enclosed where it stands now)
  // → open sea + city fill + near foothills 282536/260163 (2026-10-04: the
  //   beige out-world fix in scenery/monaco.js — ~340 sea slabs, ~900 city
  //   blocks, four hills inside the 900 m far plane)
  // → elevation on the real corners 280743/258460 (2026-10-04: the crest
  //   moved from arc 0.12 to Massenet/Casino, so props re-seat on new ground
  //   and the scenery's height-gated emitters place fewer prims)
  // → street retail block yields to towers 280119/259033 (2026-10-05:
  //   build-props.js every(34) retail box + skirt no longer emitted where a
  //   neonTower stands — −624 emitted; the tower faces those buried boxes
  //   enclosed now survive the strip, +573 kept)
  // → coplanar z-fight cleanup tip 280119/259008 (2026-10-05): casino box
  //   0.2 m wider + yacht glow band; then landmark re-key on this PR.
  // → post-rekey hairpin cityFront removed + Fairmont thinned (CI sweeps):
  //   273417/254782 (2026-10-05)
  // → city.js day-section early-return: monaco STRIP unchanged on that row.
  // → DETAIL pass (quay/Fairmont rails/paddock/banners) #1062: 279741/258567
  // → marshalPost seat/pole brace (2026-10-07): +96 emitted / +96 survive
  //   (deeper pole + brace arm on every post; roofs reseated, no new strip)
  // → bank zones on Massenet T3 / Mirabeau T7 (2026-10-10; were on Ste Devote
  //   T1 / T4): same emission, the 3° camber re-seats roadside prims, −46 survive
  monaco: { before: 279837, after: 258617 },
  // ship 342395/315326 → tip +156 emitted (tyre footings / LED legs / etc.)
  // → fix-top-counts 342563/315709 (mist wedges lifted off the ditch bank,
  // banking tiers abut, moss band out of the lower tier; ground-audit)
  // → bahrain hollow-stand guard: grandstandEx suppresses when crowdBank
  // places 0 risers, so monza's fold-site shells (no seating) no longer emit
  // → back to ship emission 342395; strip after 315572
  // → start-gantry lights 342347/315520 (one housing bar per gantry: −48 indices)
  // → Racing Kit barriers/pylons 341367/314511 (k_barrierwhite ×1.5 / k_pylon
  //   ×1.3 replace the synthetic construction barrier/cone along the Rettifilo:
  //   fewer indices per stamp; measured on the tip merge, 2026-10-02)
  // → full-track-scenery onto tip aa4197c 340719/313794 (venue + clearance on
  //   the Racing Kit tip; measured 2026-10-02)
  // → white Haas 340719/313802 (the same +8 as monaco: the Haas bay's
  //   HDR-bright box cannot enclose; emission unchanged)
  // → track-realism batch (2026-10-04): 14 terrain-conforming gravel-margin
  //   patches add 264 triangles. All survive; existing strip count is unchanged.
  // → T7 on Lesmo 2 340839/313922 (2026-10-04: turns[6] 0.3827 → 0.4321,
  //   so corner board 7 and its footing stand at Lesmo 2's apex)
  // → towers yield to trees / round footprints 340821/313906 (2026-10-05:
  //   city.js neonTower registers a round kind's true footprint and yields
  //   to a planted tree — one fewer unit emitted, −18 / −16)
  // → signature scenery + Parabolica camp/pines 336984/303329 (2026-10-06:
  //   tribuna/podium/canopy + Rank-C stonePine at Parabolica; camp grounded)
  // → marshalPost seat/pole brace (2026-10-07): +144 emitted / +118 survive
  monza: { before: 337128, after: 303447 },
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
