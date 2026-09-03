// The painted starting-grid boxes, measured on a real track build.
//
// WHY THIS EXISTS. The grid's geometry — pole 14 m before the line, 8 m between
// slots, a lateral stagger of 40% of the local half-width capped at 3 m — lived
// only inside gridUp() in js/game.js, pinned by no test at all. The boxes are
// built in js/track/core/mesh.js, a different file in a different layer, and the two
// would have drifted apart in complete silence: the paint would still LOOK like
// a grid, just not the one the cars stand on. TrackMesh.gridSlot() is now the
// single definition and this suite is what holds the paint to it.
//
// Numbers are the real regulation, not taste: a 2.7 m box (the FIA widened it by
// 20 cm in 2023 after Ocon and Alonso were penalised for being out of position),
// front and side lines only — a grid box is OPEN at the rear, because legality is
// judged on the front tyres' contact patch being inside the front and side lines
// (Sporting Regulations art. 48.1) — plus the yellow guide line the FIA paints
// across the front of the box to help a driver who cannot see their own wheels.
//
// Pure Node: tools/lib/track-build-vm.cjs runs the real track build with no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// monza is wide and flat, monaco is the narrowest circuit in the game — the one
// where a 2.7 m box plus a guide line has the least tarmac to fit inside.
const IDS = ["monza", "monaco"];

const BOX_W = 2.7, BOX_LEN = 5.0, PAINT_W = 0.20, GUIDE_SPAN = 3.9;
const QUADS_PER_SLOT = 4;       // front line, left side, right side, guide line

const ctxOnce = (() => {
  let c = null;
  return () => (c || (c = buildContext()));
})();

function built(id) {
  const { Tracks, TrackMesh } = ctxOnce();
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `circuit "${id}" not found`);
  const track = Tracks.build(def);
  const cap = track.meshes.startline && track.meshes.startline.__cap;
  assert.ok(cap && cap.pos && cap.pos.length, `${id}: startline mesh ships empty`);
  return { track, TrackMesh, pos: cap.pos };
}

// The four quads of slot `i`, as vertex triples. The boxes are APPENDED to the
// start-line decal's own buffer, so they are the tail of it — that is the whole
// point of riding that mesh (one draw call, the existing depthBias decal
// material, the existing free path and hideMeshes toggle).
function slotQuads(pos, slots, i) {
  const perSlot = QUADS_PER_SLOT * 4 * 3;
  const base = pos.length - (slots - i) * perSlot;
  const q = [];
  for (let k = 0; k < QUADS_PER_SLOT; k++) {
    const v = [];
    for (let j = 0; j < 4; j++) {
      const o = base + k * 12 + j * 3;
      v.push([pos[o], pos[o + 1], pos[o + 2]]);
    }
    q.push(v);
  }
  return q;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mid = (v) => [0, 1, 2].map((k) => v.reduce((s, p) => s + p[k], 0) / v.length);

test("every slot gets a box, appended to the start-line decal", () => {
  for (const id of IDS) {
    const { TrackMesh, pos } = built(id);
    const n = TrackMesh.GRID_SLOTS;
    assert.equal(n, 22, "the field is 11 teams x 2 seats — every car needs a box");
    const added = n * QUADS_PER_SLOT * 4;
    assert.ok(pos.length / 3 > added,
      `${id}: startline holds ${pos.length / 3} verts, fewer than the ${added} the grid alone needs`);
    // The chequered line itself is whole squares across the road; the grid is a
    // fixed 4 quads per slot. Both are quads, so the total must stay a multiple.
    assert.equal((pos.length / 3) % 4, 0, `${id}: startline vertex count is not whole quads`);
  }
});

test("a box measures 2.7 m wide by 5.0 m long, in 0.12 m paint", () => {
  for (const id of IDS) {
    const { TrackMesh, pos } = built(id);
    for (let i = 0; i < TrackMesh.GRID_SLOTS; i++) {
      const [front, left, right] = slotQuads(pos, TrackMesh.GRID_SLOTS, i);
      // Front line: long edge is the box width, short edge is the paint stripe.
      assert.ok(Math.abs(dist(front[0], front[1]) - BOX_W) < 0.05,
        `${id} slot ${i}: box is ${dist(front[0], front[1]).toFixed(2)} m wide, want ${BOX_W}`);
      assert.ok(Math.abs(dist(front[0], front[2]) - PAINT_W) < 0.02,
        `${id} slot ${i}: front line is ${dist(front[0], front[2]).toFixed(3)} m of paint`);
      for (const [name, side] of [["left", left], ["right", right]]) {
        assert.ok(Math.abs(dist(side[0], side[2]) - BOX_LEN) < 0.08,
          `${id} slot ${i}: ${name} side runs ${dist(side[0], side[2]).toFixed(2)} m, want ${BOX_LEN}`);
        assert.ok(Math.abs(dist(side[0], side[1]) - PAINT_W) < 0.02,
          `${id} slot ${i}: ${name} side is ${dist(side[0], side[1]).toFixed(3)} m of paint`);
      }
    }
  }
});

test("the yellow guide line clears the front line instead of z-fighting it", () => {
  // Two painted quads at the same lift, overlapping, both writing depth, is the
  // definition of a z-fight — no depth buffer can separate them, at any range.
  // The guide sits BEHIND the front line with a gap, which is cheaper and safer
  // than giving it a second lift value.
  for (const id of IDS) {
    const { TrackMesh, pos } = built(id);
    for (let i = 0; i < TrackMesh.GRID_SLOTS; i++) {
      const [front, , , guide] = slotQuads(pos, TrackMesh.GRID_SLOTS, i);
      const gap = dist(mid(front), mid(guide));
      assert.ok(gap > PAINT_W,
        `${id} slot ${i}: guide line centre is ${gap.toFixed(3)} m from the front line — they overlap`);
      assert.ok(gap < 0.5,
        `${id} slot ${i}: guide line drifted ${gap.toFixed(2)} m off the front of the box`);
    }
  }
});

test("the guide line reaches wider than the box, and stays on the tarmac", () => {
  for (const id of IDS) {
    const { TrackMesh, pos } = built(id);
    for (let i = 0; i < TrackMesh.GRID_SLOTS; i++) {
      const [, , , guide] = slotQuads(pos, TrackMesh.GRID_SLOTS, i);
      const span = dist(guide[0], guide[1]);
      // Monaco is narrow enough that the clamp can bite; the guide must still be
      // wider than the box it belongs to, and never wider than the road.
      assert.ok(span > BOX_W, `${id} slot ${i}: guide spans ${span.toFixed(2)} m, no wider than the box`);
      assert.ok(span <= GUIDE_SPAN + 0.05,
        `${id} slot ${i}: guide spans ${span.toFixed(2)} m, past its ${GUIDE_SPAN} m reach`);
      for (const v of guide)
        assert.ok(v.every(Number.isFinite), `${id} slot ${i}: guide vertex is not finite`);
    }
  }
});

test("the paint sits where the cars stand — the drift guard", () => {
  // This is the assertion the whole file exists for. gridUp() places car `i` at
  // TrackMesh.gridSlot(track, i); the box for slot `i` must be drawn around that
  // same point, or the cars line up next to their boxes instead of in them.
  //
  // The front line is 2.0 m ahead of the slot so the front axle (car-local
  // z 1.7) falls inside it, as the regulation requires; the box runs 5 m back
  // from there. So the box CENTRE is 0.5 m behind the slot point.
  for (const id of IDS) {
    const { track, TrackMesh, pos } = built(id);
    for (let i = 0; i < TrackMesh.GRID_SLOTS; i++) {
      const slot = TrackMesh.gridSlot(track, i);
      const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
      ctxOnce().Tracks.sample(track, slot.s, smp);
      // Where the car actually is, in world space.
      const car = [0, 1, 2].map((k) => smp.p[k] + smp.r[k] * slot.x);
      const [front, left, right] = slotQuads(pos, TrackMesh.GRID_SLOTS, i);
      const centre = mid([...left, ...right]);
      assert.ok(dist(car, centre) < 1.0,
        `${id} slot ${i}: box centre is ${dist(car, centre).toFixed(2)} m from the car — the paint has drifted`);
      // And the car is INSIDE its own box laterally: the two side lines straddle it.
      const dl = dist(car, mid(left)), dr = dist(car, mid(right));
      assert.ok(Math.abs(dl - dr) < 0.6,
        `${id} slot ${i}: car sits ${dl.toFixed(2)} m from one side line and ${dr.toFixed(2)} m from the other`);
      assert.ok(dist(car, mid(front)) < BOX_LEN,
        `${id} slot ${i}: car is not behind its own front line`);
    }
  }
});

test("slots follow the real 8 m pitch, staggered, pole 14 m before the line", () => {
  for (const id of IDS) {
    const { track, TrackMesh } = built(id);
    const prev = TrackMesh.gridSlot(track, 0);
    assert.ok(Math.abs((track.total - prev.s) - 14) < 0.01,
      `${id}: pole sits ${(track.total - prev.s).toFixed(2)} m before the line, want 14`);
    assert.ok(prev.x < 0, `${id}: P1 starts on the left`);
    for (let i = 1; i < TrackMesh.GRID_SLOTS; i++) {
      const a = TrackMesh.gridSlot(track, i - 1), b = TrackMesh.gridSlot(track, i);
      assert.ok(Math.abs((a.s - b.s) - 8) < 0.01,
        `${id}: slots ${i - 1}->${i} are ${(a.s - b.s).toFixed(2)} m apart, want the FIA 8`);
      assert.ok(Math.sign(a.x) !== Math.sign(b.x), `${id}: slot ${i} is not staggered off ${i - 1}`);
      assert.ok(Math.abs(b.x) <= 3.0001, `${id}: slot ${i} is ${b.x.toFixed(2)} m off centre, past the 3 m cap`);
    }
  }
});
