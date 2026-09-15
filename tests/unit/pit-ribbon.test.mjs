// The pit lane as an ACTUAL SECOND ROAD, measured on real track builds.
//
// WHY THIS EXISTS. Three times now this codebase has tried to put a lane beside
// the racing surface and concluded there is no room. The first cut forced the
// pit-side boundary open and put Monaco's through the buildings. The second
// fitted the lane to the worst node on the lap, found 2.4 m at Monza, and read
// that as "no lane anywhere". The third widened `hw` itself and pushed the ROAD
// through the scenery on a dozen circuits — that one shipped, and failed the
// Pages publish four times before it was reverted.
//
// What is different here is the shape of the answer, and it is what this suite
// holds: `hw` never moves, the lane is a separate ribbon fitted to the room the
// circuit measurably has, and a circuit that has no room gets NO RIBBON rather
// than a pinched one. The three ways to get this wrong again all fail below:
// a lane that moves the road, a lane that snakes, and a lane on a circuit whose
// walls are at the road edge.
//
// Pure Node: tools/lib/track-build-vm.cjs runs the real track build, no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// silverstone has the room and takes the full lane; spa is tight and takes a
// narrowed one; monaco has none at all and must be refused.
const WIDE = "silverstone", TIGHT = "spa", NONE = "monaco";
// monza is pinched only over its LAST 34 m of 530 and used to be refused a lane
// for it; magny_cours is pinched in the MIDDLE and keeps the longer of the two
// runs either side.
const TRIMMED = "monza";

const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();
const tracksOnce = () => ctxOnce().Tracks;
const buildOnce = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) {
      const T = tracksOnce();
      seen.set(id, T.build(T.LIST.find((d) => d.id === id)));
    }
    return seen.get(id);
  };
})();

test("a circuit with room gets a lane; one whose walls are at the road edge does not", () => {
  const wide = buildOnce(WIDE), none = buildOnce(NONE);
  assert.ok(wide.pitLane, `${WIDE} has metres of room and must get a ribbon`);
  assert.equal(none.pitLane, null,
    `${NONE}'s walls sit at the road edge for the whole window — a lane there is the mistake this refuses`);
});

test("the lane never moves the road — hw and both boundaries are untouched", () => {
  // The invariant the reverted widening broke. Everything downstream of `hw`
  // (racing line, road mesh, kerbs, banking, every sampler) must see exactly the
  // road it saw before, which is only true if the fit reads and writes nothing.
  const T = tracksOnce();
  const def = T.LIST.find((d) => d.id === WIDE);
  const a = T.buildCenterline(def);
  const b = buildOnce(WIDE);
  assert.equal(a.n, b.n);
  for (let k = 0; k < a.n; k++) {
    assert.equal(b.hw[k], a.hw[k], `hw moved at node ${k} — the lane widened the ROAD`);
  }
});

test("the lane is a constant offset from the road, not a strip that snakes", () => {
  // Per-node fitting gave a lane that widened and narrowed along its length. A
  // road runs parallel to the road it is beside; a driver at the limiter cannot
  // see a wall creeping inward.
  for (const id of [WIDE, TIGHT]) {
    const t = buildOnce(id), l = t.pitLane;
    assert.ok(l, `${id} should have a lane`);
    let full = 0;
    for (let k = 0; k < t.n; k++) {
      const w = l.w[k];
      if (w <= 0.01) continue;
      assert.ok(w <= l.laneW + 1e-4, `${id}: node ${k} is wider than the fitted lane`);
      if (Math.abs(w - l.laneW) < 1e-4) full++;
    }
    assert.ok(full > 20, `${id}: only ${full} nodes carry the full width — the taper ate the lane`);
  }
});

test("the lane fits inside the room the circuit actually has", () => {
  // The whole point of the fit. Its far edge must stay inside the driving
  // boundary at EVERY node it exists on — that boundary is where the scenery
  // stands, and crossing it is how the last three attempts put a lane through
  // a building.
  for (const id of [WIDE, TIGHT]) {
    const t = buildOnce(id), l = t.pitLane;
    const bar = l.side > 0 ? t.barR : t.barL;
    for (let k = 0; k < t.n; k++) {
      if (!(l.w[k] > 0.01)) continue;
      const far = t.hw[k] + l.gap + l.w[k];
      assert.ok(far <= bar[k] + 1e-4,
        `${id}: the lane reaches ${far.toFixed(2)} at node ${k}, past the boundary at ${bar[k].toFixed(2)}`);
      assert.ok(t.hw[k] + l.gap > t.hw[k],
        `${id}: the lane must start OUTSIDE the racing surface`);
    }
  }
});

test("pitLaneAt and inPitLane agree with the ribbon that was built", () => {
  // The physics exemption, PitLane's box and the mesh all read these, so a
  // disagreement here is a lane you can see and cannot drive on, or the reverse.
  const T = tracksOnce();
  const t = buildOnce(WIDE), l = t.pitLane;
  let k = -1;
  for (let i = 0; i < t.n; i++) if (Math.abs(l.w[i] - l.laneW) < 1e-4) { k = i; break; }
  assert.ok(k >= 0, "expected at least one full-width node");
  const s = (k / t.n) * t.total;
  const at = T.pitLaneAt(t, s);
  assert.ok(at, "pitLaneAt found nothing where the ribbon is full width");
  assert.ok(Math.abs(at.w - l.laneW) < 1e-3);
  assert.ok(T.inPitLane(t, s, at.centre), "the lane's own centre must read as being in the lane");
  assert.equal(T.inPitLane(t, s, 0), false, "the racing line must never read as the pit lane");
  // …and outside the window there is no lane at any lateral position.
  const off = ((s + t.total / 2) % t.total);
  assert.equal(T.pitLaneAt(t, off), null, "the lane must not exist half a lap away");
  assert.equal(T.inPitLane(t, off, at.centre), false);
});

test("the ribbon is drawn where it is fitted, and nowhere else", () => {
  // buildPitLane rides the start-line decal. Two failures it has to rule out:
  // paint on a circuit that was refused a lane, and a ribbon whose vertices sit
  // somewhere other than the fit says.
  const TM = ctxOnce().TrackMesh;
  const decal = (id) => {
    const t = buildOnce(id);
    const out = { pos: [], nrm: [], col: [], idx: [] };
    TM.buildPitLane(t, out);
    return { t, out };
  };
  const none = decal(NONE);
  assert.equal(none.out.pos.length, 0, `${NONE} has no lane and must get no ribbon geometry`);
  const wide = decal(WIDE);
  assert.ok(wide.out.pos.length > 0, `${WIDE} has a lane and must get geometry for it`);
  assert.equal(wide.out.pos.length % 3, 0);
  assert.equal(wide.out.nrm.length, wide.out.pos.length);
  assert.equal(wide.out.col.length, wide.out.pos.length);
  for (const v of wide.out.pos) assert.ok(Number.isFinite(v), "the ribbon emitted a non-finite vertex");
  for (const i of wide.out.idx) {
    assert.ok(Number.isInteger(i) && i >= 0 && i < wide.out.pos.length / 3,
      "the ribbon emitted an out-of-range index");
  }
});

test("a pinch at one end costs the lane those metres, not the whole circuit", () => {
  // Refusing on the worst node in the window threw away four circuits pinched
  // only at one END of it while 90%+ of their window carried metres of room.
  const t = buildOnce(TRIMMED), l = t.pitLane;
  assert.ok(l, `${TRIMMED} is pinched only at the end of its window and must still get a lane`);
  const T = tracksOnce();
  const win = T.pitWindow(t);
  assert.ok(l.lenM < win.entryM + win.exitM,
    "the lane should be SHORTER than the window here — that is what the trim is");
  assert.ok(l.lenM >= 150, `a lane shorter than 150 m is a lay-by, got ${l.lenM}`);
  // …and the trimmed part is genuinely the part with no room.
  const bar = l.side > 0 ? t.barR : t.barL;
  for (let k = 0; k < t.n; k++) {
    if (!(l.w[k] > 0.01)) continue;
    assert.ok(bar[k] - t.hw[k] >= l.gap + l.laneW - 1e-4,
      `${TRIMMED}: the lane kept node ${k}, which has no room for it`);
  }
});

test("the box row is laid out inside the LANE, not inside the window", () => {
  // Once the ribbon could be trimmed short of a pinch, a row laid out against
  // the window put the last teams' boxes past the end of the tarmac on five
  // circuits — their drivers would have stopped on grass.
  const T = tracksOnce();
  const BOX_PITCH = 14, TEAMS = 12, span = (TEAMS - 1) * BOX_PITCH;
  for (const def of T.LIST) {
    let t;
    try { t = T.build(def); } catch { continue; }
    const l = t.pitLane;
    if (!l) continue;
    const sp = T.pitLaneSpan(t);
    assert.ok(sp && sp.lenM === l.lenM, `${def.id}: pitLaneSpan disagrees with the ribbon`);
    // The same arithmetic PitLane.boxThroughFor does, in lane-relative metres.
    const lo = 20, hi = Math.max(lo, l.lenM - 30 - span);
    assert.ok(hi + span <= l.lenM,
      `${def.id}: the last box sits at ${(hi + span).toFixed(0)} m of a ${l.lenM.toFixed(0)} m lane`);
  }
});
