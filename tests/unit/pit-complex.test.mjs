// The pit complex is ONE MODEL, and everything reads it.
//
// WHY THIS EXISTS. The pit lane used to be described five times — the ribbon
// fit in the track engine, the stop row in js/race/pit-lane.js, the painted
// boxes in the mesh builder, the garages in each circuit's scenery and the
// GARAGE screen's own frontage — with three different bay pitches and four
// copies of the team colour table between them, so the car did not stop at its
// painted box and the doors lined up with neither. TrackPit (js/track/core/
// pit.js) is now the only place a width, a pitch or a position is decided, and
// this suite is what keeps the five readers on it: the paint, the stop, the
// door and the row are the SAME numbers, on every circuit, or the build is red.
// docs/research/PIT-LANE-REDESIGN-2026-09.md carries the measurements.
//
// Pure Node: tools/lib/track-build-vm.cjs runs the real track build, no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

const FULL = "silverstone", CORRIDOR = "albert_park", STREET = "monaco", LEFT = "bahrain";

const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();
const tracksOnce = () => ctxOnce().Tracks;
/** Build a def and RELEASE the VM's primitive capture.
 *
 * track-build-vm records every primitive of every build, and each record holds
 * a reference to the whole mesh buffer its emitter wrote into — not a copy of
 * its own slice — so one shared context accumulates every circuit's full
 * geometry with nothing able to reclaim it (the measurement is in that file's
 * `trim` comment: 4157 MB vs 97 MB). Every test here reads the track's own
 * fields; the ONE that wants primitives ("a tree is one object") takes its own
 * build and slices from a mark, so nothing needs the capture to outlive a
 * build. Measured on this tree before this call: the fleet loops peaked at
 * 6173 MB for the file, half again over the 4088 MB that has already
 * OOM-killed a sweep's audit child (ci.yml's prop-clipping note). */
function built(def) {
  const t = tracksOnce().build(def);
  ctxOnce().trim(0);
  return ctxOnce().release(t);
}
const buildOnce = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) {
      const T = tracksOnce();
      seen.set(id, built(T.LIST.find((d) => d.id === id)));
    }
    return seen.get(id);
  };
})();
const wrap = (v, L) => ((v % L) + L) % L;
// Monaco with the PAINTED opt-out (`pit.mode: "narrow"`): the one lane that
// is paint on the road, kept as a def's explicit choice and the model-less path.
const narrowOnce = (() => { let t = null; return () => {
  const T = tracksOnce();
  return t || (t = built(Object.assign({}, T.LIST.find((d) => d.id === STREET), { pit: { mode: "narrow" } })));
}; })();
const keptNodes = (t) => { let n = 0; for (let k = 0; k < t.n; k++) n += t.pit.keep[k] > 0 ? 1 : 0; return n; };

test("every circuit gets a complex; a street circuit gets the STREET one, built between its walls", () => {
  const T = tracksOnce(), full = buildOnce(FULL), street = buildOnce(STREET);
  assert.ok(full.pit, `${FULL} must carry track.pit`);
  assert.equal(full.pit.mode, "full");
  assert.ok(full.pit.hasWall && full.pit.hasBays, "a permanent circuit has the wall and the garages");
  assert.equal(full.pit.limitKph, 80);
  // A street circuit builds the STREET set: a lane beside the road behind a
  // real pit wall, sized for the room between temporary barriers
  // (docs/research/STREET-PIT-LANES-PLAN-2026-09.md).
  assert.ok(street.pit, `${STREET} must carry track.pit too`);
  assert.equal(street.pit.mode, "street", `${STREET} builds the STREET complex`);
  assert.equal(street.pit.painted, false, "a street lane is built beside the road, not painted on it");
  assert.equal(street.pit.hasWall, true, "…behind a real pit wall");
  assert.equal(street.pit.hasBays, true, "…with garages where the window holds them");
  assert.equal(street.pit.limitKph, 60, "Monaco's lane is 60 km/h (authored; the STREET default is 80)");
  const b = street.pit.bands;
  assert.ok(street.pit.off.workOut <= 11 && b.platform >= 1.5 && b.fast <= 3.5 && b.corridor >= 1,
    `the STREET set: ${street.pit.off.workOut} m wall-to-garage, platform ${b.platform}, fast ${b.fast}, corridor ${b.corridor}`);
  assert.ok(keptNodes(street) > 0, "a street complex keeps its ground");
  assert.ok(T.pitLaneAt(street, wrap(street.pit.sIn + 10, street.total)), "a ribbon on the street lane");
  // NARROW stays as the explicit opt-out: painted on the racing surface, and
  // keeping NOTHING out — Monaco's walls stand where they stood.
  const narrow = narrowOnce();
  assert.equal(narrow.pit.mode, "narrow");
  assert.equal(narrow.pit.painted, true, "a narrow lane is painted on the racing surface");
  assert.equal(narrow.pit.hasWall, false, "no platform between street walls");
  assert.equal(narrow.pit.hasBays, false, "no garages on a painted lane");
  assert.equal(narrow.pit.limitKph, 60, "the painted street lane keeps 60");
  assert.equal(keptNodes(narrow), 0, "a painted lane must not cull scenery for a lane that is paint");
  assert.equal(T.pitLaneAt(narrow, wrap(narrow.pit.sIn + 10, narrow.total)), null, "no ribbon on a painted lane");
});

test("a street complex owns its side: no engine street barrier on the lane, the boundary open, Jeddah's row painted without bays", () => {
  // The lap-long instanced street panel (tracks.js, `def.barrierGap`) is
  // guarded, so it was culled only past 2.5 m: at Baku it stood ON the entry
  // road's tarmac and at Monaco/Singapore/Vegas in the platform band 15-40 cm
  // from the complex's own wall. The pit side now skips every node the
  // keep-out covers, and TrackPit.openBoundary owns the driving limit there.
  const T = tracksOnce(), P = ctxOnce().TrackPit;
  for (const id of ["monaco", "singapore", "vegas", "baku", "jeddah"]) {
    const t = buildOnce(id), p = t.pit;
    assert.equal(p.mode, "street", id);
    assert.equal(p.painted, false, id);
    const nodes = (t.graph && t.graph.nodes) || [];
    let panels = 0, onLane = 0;
    for (const nd of nodes) {
      const m = nd.meta;
      if (!m || m.kind !== "streetBarrier") continue;
      panels++;
      if (m.side === p.side && p.keep[m.k] > 0) onLane++;
    }
    assert.ok(panels > 0, `${id}: the street barrier is still instanced round the lap`);
    assert.equal(onLane, 0, `${id}: ${onLane} street panel(s) stand on the pit lane`);
    const bar = p.side > 0 ? t.barR : t.barL;
    for (let k = 0; k < t.n; k++) {
      if (!(p.keep[k] > 0)) continue;
      // The LANE's edge, not the footprint's: it is the garage line where the
      // bays are and the fast lane's far side elsewhere (TrackPit.outerAt).
      const edge = t.hw[k] + ctxOnce().TrackPit.outerAt(p, k) - 0.9;
      assert.ok(bar[k] >= edge - 1e-6, `${id}: node ${k} boundary ${bar[k].toFixed(2)} inside the lane (${edge.toFixed(2)})`);
    }
  }
  // Jeddah's 190 m window (its trace's corners sit against the line) compresses
  // the row's pitch under a bay's width: the boxes are painted, no bay stands.
  const j = buildOnce("jeddah").pit;
  assert.equal(j.hasBays, false, "no garages on a row a bay cannot fit");
  assert.ok(j.row.pitch < P.PITCH, `pitch ${j.row.pitch.toFixed(2)} < ${P.PITCH}`);
  assert.ok(j.row.painted && j.row.painted.length === 12, "…but its twelve boxes are still painted");
  assert.equal(j.row.placed.length, 0, "…and none placed");
  // The GUARD decides, not the def's `bays: false`: the same def without the key gets none either.
  const def = T.LIST.find((d) => d.id === "jeddah");
  assert.equal(built(Object.assign({}, def, { pit: { mode: "street", side: -1 } })).pit.hasBays, false, "the pitch guard alone withholds the bays");
});

test("the bands are the regulation's: >= 12 m wall-to-garage, a <= 3.5 m fast lane, a >= 1 m corridor", () => {
  const p = buildOnce(FULL).pit, b = p.bands;
  assert.ok(b.fast <= 3.5, `fast lane ${b.fast} m — F1 SR: no more than 3.5 m`);
  assert.ok(b.corridor >= 1.0, `corridor ${b.corridor} m — FIM §9.1: at least 1 m`);
  assert.ok(p.off.workOut - b.verge >= 12, `${(p.off.workOut - b.verge).toFixed(1)} m from the wall to the garages — Appendix O: at least 12 m`);
  assert.ok(b.platform >= 1.5, "FIM §9.2: a signalling platform of at least 1.5 m");
});

test("the road never moves — hw is untouched by the complex", () => {
  const T = tracksOnce();
  for (const id of [FULL, CORRIDOR, STREET]) {
    const raw = T.buildCenterline(T.LIST.find((d) => d.id === id));
    const t = buildOnce(id);
    assert.equal(t.n, raw.n);
    for (let k = 0; k < raw.n; k++) assert.equal(t.hw[k], raw.hw[k], `${id}: hw moved at node ${k}`);
  }
});

test("the entry road eases the lane off the racing surface and the exit road eases it back", () => {
  const t = buildOnce(FULL), p = t.pit, n = t.n, L = t.total, ds = L / n;
  const kOf = (s) => Math.round(wrap(s, L) / ds) % n;
  // Zero outside the complex.
  let outside = 0;
  for (let k = 0; k < n; k++) {
    const s = k * ds;
    const inside = wrap(s - p.sA, L) <= wrap(p.sB - p.sA, L);
    if (!inside) { assert.equal(p.w[k], 0, `node ${k} carries lane outside the complex`); outside++; }
  }
  assert.ok(outside > n / 2, "most of the lap has no pit lane");
  // Monotone up the entry road, full through the window, monotone down the exit road.
  let prev = -1;
  for (let s = p.sA; wrap(s - p.sA, L) <= p.entryRoadM; s += ds) {
    const w = p.w[kOf(s)];
    assert.ok(w >= prev - 1e-6, `entry road: lane narrowed at s=${s.toFixed(0)}`);
    prev = w;
  }
  for (let s = p.sIn; wrap(s - p.sIn, L) <= p.lenM; s += ds) {
    const k = kOf(s);
    assert.equal(p.w[k], 1, `window: node ${k} is not the full lane`);
  }
  prev = 2;
  for (let s = p.sOut; wrap(s - p.sOut, L) <= p.exitRoadM; s += ds) {
    const w = p.w[kOf(s)];
    assert.ok(w <= prev + 1e-6, `exit road: lane widened at s=${s.toFixed(0)}`);
    prev = w;
  }
  // The wall grows AFTER the lane has left the road, and is gone before the
  // lane rejoins it: nowhere is there a wall between a car and a lane it is
  // supposed to be entering.
  for (let k = 0; k < n; k++) assert.ok(p.v[k] <= p.w[k] + 1e-6, `node ${k}: wall ahead of the lane`);
  const kA = kOf(p.sA + 1), kB = kOf(p.sB - 1);
  assert.equal(p.v[kA], 0, "no wall at the peel");
  assert.equal(p.v[kB], 0, "no wall at the blend");
  assert.equal(p.v[kOf(p.sIn + 1)], 1, "the wall stands at the entry line");
});

test("pitLaneAt reads the model: inner edge on the road at the peel, at the wall in the window", () => {
  const T = tracksOnce(), t = buildOnce(FULL), p = t.pit, L = t.total, sd = p.side;
  const peel = T.pitLaneAt(t, wrap(p.sA + 2, L));
  assert.ok(peel, "the lane exists just past the peel");
  const k0 = Math.round(wrap(p.sA + 2, L) / (L / t.n)) % t.n;
  assert.ok(Math.abs(peel.inner - sd * t.hw[k0]) < 0.05, `at the peel the lane starts at the road edge, got ${peel.inner.toFixed(2)} vs ${(sd * t.hw[k0]).toFixed(2)}`);
  const mid = T.pitLaneAt(t, wrap(p.sIn + p.lenM / 2, L));
  const km = Math.round(wrap(p.sIn + p.lenM / 2, L) / (L / t.n)) % t.n;
  assert.ok(Math.abs(mid.inner - sd * (t.hw[km] + p.off.fastIn)) < 1e-6, "in the window the inner edge is the wall line");
  assert.ok(Math.abs(mid.outer - sd * (t.hw[km] + p.off.workOut)) < 1e-6, "…and the outer edge is the garage line");
  assert.ok(Math.abs(mid.width - (p.off.workOut - p.off.fastIn)) < 1e-6);
  assert.ok(T.inPitLane(t, wrap(p.sIn + p.lenM / 2, L), mid.workCentre), "the working lane is in the lane");
  assert.equal(T.inPitLane(t, wrap(p.sIn + p.lenM / 2, L), 0), false, "the racing line is not");
  assert.equal(T.pitLaneAt(t, wrap(p.sB + 50, L)), null, "nothing past the blend");
});

test("the driving boundary is opened across the complex, on the pit side only", () => {
  const t = buildOnce(FULL), p = t.pit;
  const bar = p.side > 0 ? t.barR : t.barL, other = p.side > 0 ? t.barL : t.barR;
  const T = tracksOnce();
  const raw = T.buildCenterline(T.LIST.find((d) => d.id === FULL));
  const P = ctxOnce().TrackPit;
  for (let k = 0; k < t.n; k++) {
    if (!(p.keep[k] > 0)) continue;
    // …to 0.9 m short of THE LANE'S OWN EDGE for the car's centre: its side
    // reaches the line, where the OUTER WALL stands wherever a bay does not.
    // That edge is the garage line only where the bays are — on the entry
    // road, the exit road and the stretches between, the lane is the fast lane
    // and the wall comes in with it, so the boundary must come in too or a car
    // drives through a wall into the apron behind it.
    const edge = t.hw[k] + P.outerAt(p, k) - 0.9;
    assert.ok(bar[k] >= edge - 1e-6,
      `node ${k}: boundary ${bar[k].toFixed(2)} inside the lane's edge ${edge.toFixed(2)}`);
  }
  // …and NOT out to the old full width where no bay stands: an entrance you
  // can drive 6.5 m of working lane down is the width this change removed.
  let narrowed = 0;
  for (let k = 0; k < t.n; k++) {
    if (p.w[k] > 0.98 && p.b[k] < 0.02) narrowed++;
  }
  assert.ok(narrowed > 10, `the window carries a fast-lane-only stretch (${narrowed} nodes)`);
  void other; void raw;
});

test("paint, stop and door are the SAME positions — one row, from the grid, plus MY TEAM", () => {
  const ctx = ctxOnce();
  const Teams = ctx.Tracks && typeof ctx.TrackPit !== "undefined" ? null : null;
  void Teams;
  const t = buildOnce(FULL), p = t.pit, L = t.total;
  const boxes = p.row.boxes;
  assert.equal(boxes.length, 12, "eleven teams and the MY TEAM bay");
  const ids = boxes.map((b) => b.team);
  assert.equal(new Set(ids).size, 12, "no team appears twice");
  assert.ok(ids.includes("mercedes") && ids.includes("cadillac") && ids.includes("custom"),
    `the row is the grid's: ${ids.join(",")}`);
  // Pitch is the bay's, and the row lies between the entry line and the exit line.
  for (let i = 1; i < boxes.length; i++) {
    assert.ok(Math.abs((boxes[i].through - boxes[i - 1].through) - p.row.pitch) < 1e-6, "boxes are one bay pitch apart");
  }
  assert.ok(boxes[0].through > p.grow, "the first box is past the wall's growth");
  assert.ok(boxes[boxes.length - 1].through < p.lenM, "the last box is short of the exit line");
  // The PAINT (TrackMesh.buildPitBoxes) and the DOORS (SceneryPits) recorded
  // where they went; both must be exactly the row.
  assert.deepEqual(p.row.painted, boxes.map((b) => b.s), "the painted boxes are not on the row");
  assert.deepEqual(p.row.placed, boxes.map((b) => b.s), "the garages are not on the row");
  for (const b of boxes) assert.ok(Math.abs(wrap(b.s - p.sIn, L) - b.through) < 1e-6, "through-metres and arc position disagree");
});

test("the boxes' colours are the grid's, and no source keeps its own copy of the team table", () => {
  const t = buildOnce(FULL), boxes = t.pit.row.boxes;
  const mer = boxes.find((b) => b.team === "mercedes");
  assert.ok(mer && mer.col.length === 3, "a box carries its team's colour");
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full); else if (e.name.endsWith(".js")) files.push(full);
    }
  };
  walk(path.join(ROOT, "js"));
  const offenders = files.filter((f) => /PIT_TEAMS\b|AP_TEAMS\b|PIT_TEAM_COL\b|Teams\.ORDER\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), [], "a second team colour table survives");
});

test("a circuit chooses its side, and the complex follows it", () => {
  const T = tracksOnce();
  const left = buildOnce(LEFT), right = buildOnce(FULL);
  assert.equal(left.pit.side, -1, `${LEFT} authors its pits on the left`);
  assert.equal(right.pit.side, 1);
  const L = left.total;
  const at = T.pitLaneAt(left, wrap(left.pit.sIn + left.pit.lenM / 2, L));
  assert.ok(at.inner < 0 && at.outer < at.inner, "on the left the lane's laterals are negative and grow outward");
});

test("the terrain is level under the complex and the apron does not float", () => {
  const t = buildOnce(FULL), p = t.pit, s = t.surface;
  const k = p.row.boxes[5].k;
  const road = s.heightAt(k, 0, p.side);
  const apron = s.heightAt(k, p.off.workOut, p.side);
  const garage = s.heightAt(k, p.off.workOut + p.bay.depth, p.side);
  assert.ok(Math.abs(apron - road) < 0.05, `apron ${apron.toFixed(2)} vs road ${road.toFixed(2)}`);
  assert.ok(Math.abs(garage - road) < 0.05, `garage floor ${garage.toFixed(2)} vs road ${road.toFixed(2)}`);
  const other = s.heightAt(k, p.off.workOut + p.bay.depth, -p.side);
  assert.ok(other < road - 0.15, `the other side keeps the normal profile (${other.toFixed(2)} vs road ${road.toFixed(2)})`);
});

test("the garages are the setup screen's bay, and the build says so", () => {
  const t = buildOnce(FULL);
  assert.ok(t.pit.row.placed && t.pit.row.placed.length === 12, "twelve bays placed");
  const G = ctxOnce().GarageScene;
  assert.ok(G && typeof G.buildStatic === "function", "GarageScene.buildStatic is in the VM roster");
  const bay = G.buildStatic({ c1: [0.9, 0.4, 0.1], c2: [0.1, 0.1, 0.1] });
  assert.ok(bay.pos.length / 3 > 1500 && bay.pos.length / 3 < 6000, `a static bay is ${bay.pos.length / 3} verts`);
  assert.equal(bay.mat.length, bay.pos.length / 3, "one material id per vertex, as the garage suite demands");
  // The TRACKSIDE bay (`props: "lite"`, what SceneryPits places): the furniture
  // that reads from the lane, including two tyre stacks OUT on the apron past
  // the door plane. Bounded: twelve of these ride every circuit's static buffer.
  const lite = G.buildStatic({ c1: [0.9, 0.4, 0.1], c2: [0.1, 0.1, 0.1] }, { props: "lite" });
  const nLite = lite.pos.length / 3;
  assert.ok(nLite > bay.pos.length / 3 + 1500 && nLite < 12000, `a lite bay is ${nLite} verts (bare ${bay.pos.length / 3})`);
  assert.equal(lite.mat.length, nLite);
  let zMax = -Infinity;
  for (let i = 2; i < lite.pos.length; i += 3) zMax = Math.max(zMax, lite.pos[i]);
  const Z_DOOR = ctxOnce().TrackPit.BAY.depth / 2;
  assert.ok(zMax > Z_DOOR + 0.5 && zMax < Z_DOOR + 1.2, `the apron stacks stand past the door plane (z max ${zMax.toFixed(2)}, door ${Z_DOOR})`);
});

test("neither end of the complex lies in a corner: the exit closes before the first turn-in", () => {
  // Six circuits turn in within 90 m of the line (Mosport 24 m, Nürburgring
  // 84 m). The first build closed every exit 130 m after the line and blended
  // the exit road back over the 90 m after that, which put the Nürburgring's
  // last garages, its race control and its whole exit road in Turn 1.
  const T = tracksOnce(), P = ctxOnce().TrackPit;
  {
    const t = buildOnce("nurburgring"), p = t.pit;
    assert.ok(p.exitM < P.EXIT_M && p.exitM >= P.EXIT_MIN, `exitM ${p.exitM}`);
    // From the line to the end of the WALL'S FADE, not a node is cornering.
    // The exit road's blend runs on past it (its floor is EXIT_ROAD_MIN — a
    // 30 m blend was undrivable at the limit) and may reach the turn-in.
    for (let s = 0; s < p.sOut + p.grow; s += 4)
      assert.ok(Math.abs(T.curvature(t, s)) <= P.PIT_K, `nurburgring: cornering at s=${s | 0} (sOut ${p.sOut | 0} + grow ${p.grow})`);
    assert.ok(p.exitRoadM >= P.EXIT_ROAD_MIN, `the exit road is at least ${P.EXIT_ROAD_MIN} m (${p.exitRoadM})`);
  }
  // Where the straight cannot hold even the minimum (Mosport 24 m, Jerez 48 m)
  // the exit sits on the floor, not at 130. (The ENTRY is clamped to
  // ENTRY_MIN the same way and may still open in a corner on such a circuit.)
  for (const id of ["mosport", "jerez"]) assert.equal(buildOnce(id).pit.exitM, P.EXIT_MIN, id);
  // A long straight keeps the full exit — the rule only bites where a corner does.
  assert.equal(buildOnce("monza").pit.exitM, P.EXIT_M);
});

test("the entry road's MOUTH stands on the straight wherever the straight allows: the window leaves the road and a run-out after the corner", () => {
  // The window opened as far back as the straight ran, and the 70 m entry
  // road before it then peeled off INSIDE the last corner on 21 of 52
  // circuits (Abu Dhabi's mouth on a 23 m radius, Sochi's on 20 m; surveyed
  // 2026-09-16 — "the pit entrance is right off a turn"). Now the window
  // opens ENTRY_ROAD + MOUTH_RUN short of where the straight ends, so from
  // MOUTH_RUN before the mouth to the entry line not a node is cornering —
  // on every circuit whose straight can hold the floor plus the road.
  const T = tracksOnce(), P = ctxOnce().TrackPit;
  const need = P.ENTRY_MIN + P.ENTRY_ROAD + P.MOUTH_RUN;
  let held = 0;
  for (const def of T.LIST) {
    const t = buildOnce(def.id), p = t.pit, L = t.total;
    if (!p || p.painted) continue;
    let back = 0;
    while (back < 700 && Math.abs(T.curvature(t, ((-back - 2) % L + L) % L)) <= P.PIT_K) back += 4;
    if (back < need) continue;                      // the floor's circuits: not this rule's
    held++;
    assert.equal(p.entryRoadM, P.ENTRY_ROAD, `${def.id}: the road is the full ${P.ENTRY_ROAD} m (${p.entryRoadM})`);
    // From MOUTH_RUN before the mouth (less the model's own 8 m sample step) to the line.
    for (let d = -P.MOUTH_RUN + 8; d < p.entryRoadM; d += 4) {
      const s = ((p.sA + d) % L + L) % L;
      assert.ok(Math.abs(T.curvature(t, s)) <= P.PIT_K, `${def.id}: cornering ${d} m from the mouth (entryM ${p.entryM})`);
    }
  }
  assert.ok(held >= 30, `the rule was exercised on ${held} circuits`);
  // The shapes the survey named: a long straight keeps the full window; a
  // straight that ends just before the old 260 gives the road its room.
  assert.equal(buildOnce("monza").pit.entryM, P.ENTRY_MAX, "Monza's straight holds everything");
  for (const id of ["abudhabi", "sochi", "spa"]) {
    const p = buildOnce(id).pit;
    assert.ok(p.entryM < P.ENTRY_MAX && p.entryM >= P.ENTRY_MIN, `${id}: the window gave the road its straight (entryM ${p.entryM})`);
  }
  // Bahrain's window is on the floor (T15's exit bends inside it): unchanged.
  assert.equal(buildOnce(LEFT).pit.entryM, P.ENTRY_MIN);
});

test("two entrance lamps stand on the wall corners either side of the entry line, the lane's middle between them", () => {
  // Asked: one lamp on each WALL CORNER either side of the entrance, with the
  // middle of the lane between them. That pair of corners exists at exactly
  // one arc — the ENTRY LINE. Down the entry road the peel is a wedge off the
  // road edge with tarmac on its track side and only the OUTER wall beside it
  // (scratch/pit-mouth-walls.cjs: Abu Dhabi's outer wall opens at sA+6 and the
  // platform wall's nose is 70 m later), so a gate cannot stand at the mouth.
  // At `sIn` the platform wall's nose is at 10.0 m and the outer wall at 22.0,
  // the fast lane's middle between them at 13.8. Each carries the exit
  // signal's head with a RED aspect and a light record AT it (a halo needs a
  // fixture within 1 m — lamp-fixture-anchor). Tagged `entry`, so the canopy's
  // count of six stays its own. docs/research/PIT-ENTRY-LAMPS-PLAN-2026-09.md.
  //
  // TWO RULES HERE ARE THE BUG THAT SHIPPED IN THE FIRST CUT, and both are
  // measured, not described. (1) The aim must land on the LANE: it pointed at
  // the lane's full width 15 m past the mouth, where the road has opened to
  // `w` 0.26 and nothing is paved yet, so it lit 4.8 m of bare verge.
  // (2) The radius must be the throw and no more: the pool window is a sphere
  // around the lens, so a 24 m radius on a post 8.5 m off the centreline
  // washed 16 m of racing line (abudhabi, bahrain, monza — a night shot).
  const P = ctxOnce().TrackPit;
  for (const id of [FULL, LEFT, "abudhabi"]) {
    const t = buildOnce(id), p = t.pit, sd = p.side, L = t.total;
    const lamps = (t.lampPosts || []).filter((l) => l.entry);
    assert.equal(lamps.length, 2, `${id}: two entrance lamps`);
    const latOf = (l) => ((l.x - t.px[l.k]) * t.rx[l.k] + (l.z - t.pz[l.k]) * t.rz[l.k]) * sd - t.hw[l.k];
    const arcOf = (l) => ((l.k * L / t.n - p.sA) % L + L) % L;
    const lats = lamps.map(latOf).sort((a, b) => a - b), arcs = lamps.map(arcOf);
    // ONE AT EACH WALL: beside the platform wall (which spans verge →
    // verge + 0.25) and beside the outer wall on the garage line (workOut +
    // 0.02 → + 0.32). BESIDE, not on top: a post standing on a wall's top has
    // only swept geometry under it and reads as a floating cluster
    // (scenery-grounding caught exactly that on five circuits), so each stands
    // on its own floor — the platform for one, the lane for the other.
    assert.ok(Math.abs(lats[0] - (p.bands.verge + 0.55)) < 0.2,
              `${id}: the track-side lamp is at the platform wall (${lats[0].toFixed(2)} vs ${(p.bands.verge + 0.55).toFixed(2)} m out)`);
    assert.ok(Math.abs(lats[1] - (p.off.workOut - 0.45)) < 0.2,
              `${id}: the far lamp is at the outer wall (${lats[1].toFixed(2)} vs ${(p.off.workOut - 0.45).toFixed(2)} m out)`);
    assert.ok(lats[0] > p.bands.verge + 0.25 && lats[1] < p.off.workOut + 0.02,
              `${id}: neither post stands inside its wall`);
    // THE LANE'S MIDDLE IS BETWEEN THEM, and both stand at the same arc, so
    // the pair reads as one gate rather than two posts down the road.
    assert.equal(lamps[0].k, lamps[1].k, `${id}: the pair stands at one arc`);
    const mid = (lats[0] + lats[1]) / 2, fastMid = (p.off.fastIn + p.off.fastOut) / 2;
    assert.ok(mid > p.off.fastIn && mid < p.off.workOut,
              `${id}: the lane runs between the lamps (midpoint ${mid.toFixed(1)} m out)`);
    assert.ok(mid > fastMid, `${id}: …and the fast lane's middle is inside the gate`);
    const nodeAt = (pt) => {                       // the centreline node the aim stands next to
      let best = 0, bd = Infinity;
      for (let i = 0; i < t.n; i++) {
        const d = Math.hypot(t.px[i] - pt[0], t.pz[i] - pt[2]);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    for (const l of lamps) {
      assert.equal(l.kind, "signal"); assert.equal(l.side, sd); assert.equal(l.pit, true);
      // Head height is measured from the LANE floor, and each post is only as
      // long as its own wall is short — the two heads finish level.
      const h = l.y - t.py[l.k];
      assert.ok(h > 2.1 && h < 3.1, `${id}: the aspect is head-high over the wall (${h.toFixed(2)} m)`);
      assert.ok(l.aimAt && l.aimAt[1] < l.y - 1.5, `${id}: the lamp throws at the ground`);
      // (1) ON THE LANE, between the two posts: at the aim's own node the
      // complex is open, so the surface runs from fastIn out to workOut.
      const kA = nodeAt(l.aimAt);
      const aimLat = ((l.aimAt[0] - t.px[kA]) * t.rx[kA] + (l.aimAt[2] - t.pz[kA]) * t.rz[kA]) * sd - t.hw[kA];
      assert.ok(p.w[kA] > 0.98 && p.v[kA] > 0.98, `${id}: the aim is inside the lane (w ${p.w[kA].toFixed(2)})`);
      assert.ok(aimLat > p.off.fastIn - 0.2 && aimLat < p.off.fastOut + 0.2,
                `${id}: the aim is the fast lane's middle (${aimLat.toFixed(2)} m out)`);
      // (2) THE POOL IS THE THROW: r ≥ |lens→aim| or it lights nothing, and no
      // more than a couple of metres over or it spills where it is not aimed.
      const throwM = Math.hypot(l.x - l.aimAt[0], l.y - l.aimAt[1], l.z - l.aimAt[2]);
      assert.ok(throwM < 22, `${id}: the lamp throws at the lane beside it (${throwM.toFixed(1)} m)`);
      assert.ok(l.radius >= throwM && l.radius <= throwM + 2.5,
                `${id}: the radius is the throw (r ${l.radius} vs ${throwM.toFixed(1)} m)`);
    }
    // THE GATE IS AT THE ENTRY LINE — where the lane legally begins, the limit
    // starts and the "PIT LANE <limit>" board already stands on the platform.
    const fromSA = arcs.map((a) => (a > L / 2 ? a - L : a));
    for (const a of fromSA) {
      assert.ok(Math.abs(a - p.entryRoadM) < 8,
                `${id}: the gate stands at the entry line (${a.toFixed(0)} vs ${p.entryRoadM.toFixed(0)} m from sA)`);
    }
    // The GREEN aspect's decal: one quad per lamp, in its own buffer, on the
    // atlas's GREEN signal cell, facing the oncoming driver. Red is what the
    // props mesh paints; green is laid over it only while this car is called in.
    const sig = t.pitSignal;
    assert.ok(sig && sig.quads.length === 2, `${id}: two green aspects`);
    assert.equal(sig.idx.length, 12); assert.equal(sig.pos.length, 24);
    const S = P.SIGN, u0 = sig.uv[0], v0 = sig.uv[1];
    assert.ok(u0 >= -1e-6 && u0 <= S.signalPx / S.w + 1e-6, `${id}: the GREEN cell (u ${u0.toFixed(3)})`);
    assert.ok(v0 <= 1 - S.signalY / S.h + 1e-6, `${id}: …in the signal row (v ${v0.toFixed(3)})`);
    const k0 = sig.quads[0].k;
    assert.ok(sig.nrm[0] * t.tx[k0] + sig.nrm[2] * t.tz[k0] < -0.9, `${id}: the aspect faces the oncoming driver`);
  }
  // A WALLED lane has the gate wherever its entry line is — a street circuit's
  // compressed complex included (Jeddah, Monaco). A PAINTED lane has neither
  // wall, so it has neither lamp.
  for (const id of ["jeddah", "monaco"]) {
    const t = buildOnce(id), walled = !t.pit.painted && t.pit.hasWall;
    assert.equal((t.lampPosts || []).filter((l) => l.entry).length, walled ? 2 : 0, `${id}: the gate follows the wall`);
    assert.equal(t.pitSignal ? t.pitSignal.quads.length : 0, walled ? 2 : 0, `${id}: …and so does its green aspect`);
  }
});

test("race control stands past the last bay, inside the row's keep-out, on a bending straight too", () => {
  // Placed 14.5 m of arc past the last bay at the garage line, the Nürburgring's
  // race control (whose row ran into T1) stood 7 m inside the last bay: on a
  // bend, arc at the garage line is a shorter step in the world. It is now
  // offset along the last bay's own tangent, and the keep-out's ROW_TAIL keeps
  // trees out of it (Mugello and Portimão grew canopies through it).
  const P = ctxOnce().TrackPit;
  for (const id of ["nurburgring", FULL, "mugello"]) {
    const t = buildOnce(id), p = t.pit, L = t.total, ds = L / t.n;
    const kEnd = Math.round(((p.row.s1 + P.ROW_TAIL - 1 + L) % L) / ds) % t.n;
    const kPast = Math.round(((p.row.s1 + P.ROW_TAIL + 8) % L) / ds) % t.n;
    assert.ok(p.keep[kEnd] > p.off.outer + P.BAY.depth, `${id}: the tail is kept out (${p.keep[kEnd].toFixed(1)})`);
    assert.ok(p.keep[kPast] < p.off.outer + 1, `${id}: past the tail only the lane is (${p.keep[kPast].toFixed(1)})`);
  }
});

test("a RAW landform yields to the complex chord by chord, and says so", () => {
  // RAW emitters never pass the footprint guard, so a landform laid through the
  // garages used to stand in them. They now ask `inPit` per chord and record the
  // drop as superseded, not as a guard suppression. The fixture was Portimão's
  // T3 cutting, which only reached the pits under its bogus sceneryStartFrac
  // (DEFECT-LEDGER, "sceneryStartFrac audit"); Hungaroring's hand-placed pit
  // wall runs down the lane itself, 21 chords each, with or without its shift.
  const t = buildOnce("hungaroring");
  const d = t.modelDiagnostics;
  const cut = d.suppressed.filter((e) => /^hungaroring-pit-wall/.test(e.id));
  assert.ok(cut.length >= 1, "a cut is recorded");
  for (const e of cut) {
    assert.equal(e.required, false);
    assert.match(e.reason, /superseded by the pit complex/);
  }
  assert.ok((d.supersededByPit.groundedSegments || 0) > 0, "counted on the pit's own counter");
  assert.equal(d.suppressedCounts.groundedSegments, undefined, "not on the guard's");
});

test("a tree is one object: a crown that would reach the complex takes its trunk with it", () => {
  // The keep-out tested every primitive of a tree on its own: the wide middle
  // tier of a crown standing just outside the complex reached in and was
  // dropped, the narrower top tier cleared, and the float sweep reported the
  // top tier on thirty circuits; then the crown exemption let Monza's poplars
  // behind the garages grow through the bay roofs. Now a tree is decided
  // WHOLE at its base — the crown's radius from the complex — and a footing
  // the complex keeps out ends the object. The worked example is the poplar
  // 45 m out at the end of Monza's row (frac ~0.002): trunk 16 m, four tiers
  // to 42 m, the lowest 16 m wide. Its crown reached the service road, so
  // none of it stands; and no tier anywhere reaches over the bays.
  const env = ctxOnce();
  // env.prims is the VM's whole capture — every circuit this file has built
  // so far — so take only what THIS build emits.
  const first = env.prims.length;
  const T = env.Tracks, t = T.build(T.LIST.find((d) => d.id === "monza"));
  const prims = env.prims.slice(first);          // NOT built(): this one wants the capture
  env.trim(first);                               // …and is the only reader of it
  const p = t.pit, L = t.total, n = t.n, ds = L / n;
  const x = 536.5, z = -217.5;
  const there = prims.filter((q) => q.minX - 3 <= x && q.maxX + 3 >= x && q.minZ - 3 <= z && q.maxZ + 3 >= z && q.maxY - q.minY > 3);
  assert.equal(there.filter((q) => q.name === "addCone").length, 0, "the poplar's crown is gone");
  assert.equal(there.filter((q) => q.name === "addCyl").length, 0, "…and so is its trunk: no orphan either way");
  const inArc = (s, a, b) => (a <= b ? (s >= a && s <= b) : (s >= a || s <= b));
  let over = 0, tiers = 0;
  for (const q of prims) {
    if ((q.name !== "addCone" && q.name !== "addFrustum") || q.minY > 10) continue;
    const cx = (q.minX + q.maxX) / 2, cz = (q.minZ + q.maxZ) / 2;
    let k = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = (t.px[i] - cx) ** 2 + (t.pz[i] - cz) ** 2; if (d < bd) { bd = d; k = i; } }
    if (!inArc(k * ds, p.row.s0, p.row.s1)) continue;
    tiers++;
    const lat = ((cx - t.px[k]) * t.rx[k] + (cz - t.pz[k]) * t.rz[k]) * p.side - t.hw[k], r = (q.maxX - q.minX) / 2;
    if (lat - r < p.off.outer + p.bay.depth && lat + r > p.off.outer) over++;
  }
  assert.ok(tiers > 0, "there are crown tiers along the row to test");
  assert.equal(over, 0, `${over} crown tier(s) reach over the bays`);
});

test("the complex lights its row: six canopy luminaires over the working lane, registered as lamps", () => {
  // The row of twelve bays was the darkest thing on a night pit straight: the
  // generic verge masts are kept out of the complex, the circuits' own pit
  // lighting is decoration without a light record, and the far side's masts
  // are 14-28 m away. SceneryPits now hangs an LED luminaire under the
  // canopy at every second party line — one per 22 m, the engine's own pool
  // stride — and registers it at the lens (`pit: true` on track.lampPosts),
  // throwing at the working lane's centre. docs/research/PIT-LIGHTING-PLAN-2026-09.md.
  const inArc = (s, a, b) => (a <= b ? (s >= a && s <= b) : (s >= a || s <= b));
  for (const id of [FULL, LEFT]) {
    const t = buildOnce(id), p = t.pit, sd = p.side, L = t.total, ds = L / t.n;
    const pit = (t.lampPosts || []).filter((l) => l.pit && !l.entry);   // the canopy's; the entrance pair is its own test
    assert.equal(pit.length, 6, `${id}: six luminaires, one per 22 m of row`);
    for (const l of pit) {
      assert.equal(l.kind, "led", `${id}: a canopy batten is an LED`);
      assert.equal(l.side, sd, `${id}: on the pit side`);
      const k = l.k;
      const lat = ((l.x - t.px[k]) * t.rx[k] + (l.z - t.pz[k]) * t.rz[k]) * sd - t.hw[k];
      assert.ok(lat >= p.off.workOut - 3 && lat <= p.off.workOut,
        `${id}: lens ${lat.toFixed(2)} m beyond the edge; the canopy spans [${p.off.workOut - 3}, ${p.off.workOut}]`);
      const h = l.y - t.py[k];
      assert.ok(h >= 5.0 && h <= 6.0, `${id}: lens ${h.toFixed(2)} m up, the soffit is at 5.3`);
      assert.ok(inArc(k * ds, p.row.s0, p.row.s1), `${id}: lamp at node ${k} is off the row`);
      assert.ok(l.aimAt && Math.hypot(l.aimAt[0] - l.x, l.aimAt[2] - l.z) < 3 && l.aimAt[1] < l.y - 4,
        `${id}: the luminaire throws at the lane under it`);
    }
  }
  assert.equal((buildOnce(STREET).lampPosts || []).filter((l) => l.pit && !l.entry).length, 6, "the street complex lights its row too");
  assert.equal((narrowOnce().lampPosts || []).filter((l) => l.pit).length, 0, "a painted lane hangs no canopy, and no entrance lamps");
});

/* THE SAME DEFECT, SECOND TIME, BY A DIFFERENT DOOR. The test below was written
 * when MY TEAM got seated twice and built a 13-bay row 11 m long. On 2026-09-18
 * js/career/custom-team.js began appending a SECOND runtime entry — `legends` —
 * beside `custom`, and TrackPit.row seated that too: 13 bays again, the whole
 * complex moved, and a car entering Monza's lane wedged against the wall with
 * the throttle open (tests/specs/pit-lane.spec.js, bisected to 7b2d56b).
 *
 * LEGENDS IS NOT A THIRTEENTH GARAGE. It is the player's own entry wearing a
 * historic livery — gridTeams() lets only one of {custom, legends} race — so a
 * bay for it is a bay for a car that cannot be on the grid. The defect was in
 * the geometry and invisible to every node suite, because the only thing that
 * measures it is a browser spec no local gate runs. This is the node-side
 * guard that should have existed the first time. */
test("a LEGENDS entry beside custom seats no thirteenth bay, and the row does not move", () => {
  const env = ctxOnce(), T = env.Tracks;
  const def = T.LIST.find((d) => d.id === FULL);
  const bare = buildOnce(FULL);
  const eleven = ["mercedes", "ferrari", "mclaren", "redbull", "alpine", "racingbulls", "haas", "williams", "audi", "astonmartin", "cadillac"]
    .map((id) => ({ id, name: id, color: [0.5, 0.5, 0.5] }));
  const custom = { id: "custom", name: "MY TEAM", short: "MY", color: [0.55, 0.55, 0.6] };
  const legends = { id: "legends", legends: true, name: "LEGENDS", short: "LGD", color: [0.7, 0.6, 0.2] };
  try {
    env.sandbox.Teams = { LIST: eleven.concat([custom, legends]), DEFAULT_CUSTOM: custom };
    const t = built(def);
    const teams = t.pit.row.boxes.map((b) => b.team);
    assert.ok(!teams.includes("legends"), `LEGENDS must get no bay of its own (${teams.join(",")})`);
    assert.equal(teams.length, 12, `twelve bays, not ${teams.length} (${teams.join(",")})`);
    assert.equal(t.pit.row.count, 12);
    assert.equal(teams[11], "custom", "MY TEAM's bay is still the last");
    // THE ONE THAT MATTERS: an extra bay lengthens the row and drags the whole
    // complex with it. Same anchor as the VM's twelve, or the lane has moved.
    assert.equal(t.pit.row.s0, bare.pit.row.s0, "the row stands where the VM's twelve unnamed bays stand");
  } finally {
    delete env.sandbox.Teams;
  }
});

test("the row seats the custom team ONCE when the roster already carries it, as the game's does", () => {
  // js/career/custom-team.js pushes the custom team INTO Teams.LIST, so in the
  // game the list TrackPit.row reads already ends with it; appending MY TEAM
  // again built a 13-bay row with "custom" twice — 11 m longer than the twelve
  // every VM-side test measures — and its head superseded Yas Marina's
  // hotel leg (abudhabi-foundation.spec, 2026-09-16). The VM has no Teams at
  // all, so this is the one place the game's roster reaches the geometry.
  const env = ctxOnce(), T = env.Tracks;
  const def = T.LIST.find((d) => d.id === FULL);
  const bare = buildOnce(FULL);                     // no Teams: twelve unnamed bays
  const eleven = ["mercedes", "ferrari", "mclaren", "redbull", "alpine", "racingbulls", "haas", "williams", "audi", "astonmartin", "cadillac"]
    .map((id) => ({ id, name: id, color: [0.5, 0.5, 0.5] }));
  const custom = { id: "custom", name: "MY TEAM", short: "MY", color: [0.55, 0.55, 0.6] };
  try {
    env.sandbox.Teams = { LIST: eleven.concat([custom]), DEFAULT_CUSTOM: custom };   // as the career module leaves it
    const inList = T.build(def);
    env.sandbox.Teams = { LIST: eleven, DEFAULT_CUSTOM: custom };                    // a bare roster: appended once
    const appended = T.build(def);
    for (const [name, t] of [["custom in LIST", inList], ["custom appended", appended]]) {
      const teams = t.pit.row.boxes.map((b) => b.team);
      assert.equal(teams.length, 12, `${name}: twelve bays, not ${teams.length} (${teams.join(",")})`);
      assert.equal(new Set(teams).size, 12, `${name}: no team seated twice (${teams.join(",")})`);
      assert.equal(teams[11], "custom", `${name}: MY TEAM's bay is the last`);
      assert.equal(t.pit.row.count, 12);
      assert.equal(t.pit.row.s0, bare.pit.row.s0, `${name}: the row stands where the VM's twelve unnamed bays stand`);
    }
  } finally {
    delete env.sandbox.Teams;
  }
});

test("the entry hatch is paint inside the road edge, from the road's start to where the wall grows", () => {
  // TrackMesh.pitHatch: the FIA no-go fill on the road side of the peel line,
  // one stripe every 2 m, 1.2 m in from the edge, ending where the wall's
  // fade begins (v reaching 0.5). Pure numbers, because the painted buffer
  // cannot tell a stripe from a chevron.
  const ctx = ctxOnce(), TM = ctx.TrackMesh;
  assert.equal(typeof TM.pitHatch, "function");
  for (const id of [FULL, LEFT, CORRIDOR]) {
    const t = buildOnce(id), p = t.pit, L = t.total, n = t.n;
    const hatch = TM.pitHatch(t);
    assert.ok(hatch.length >= 5, `${id}: ${hatch.length} stripes on a ${p.entryRoadM} m entry road`);
    let prev = null;
    for (const h of hatch) {
      const k = Math.round(h.s / L * n) % n;
      assert.ok(h.x1 <= t.hw[k] && h.x0 >= t.hw[k] - 1.25, `${id}: a stripe at ${h.x0.toFixed(2)}..${h.x1.toFixed(2)} on a ${t.hw[k].toFixed(2)} m half-width`);
      assert.ok(p.v[k] < 0.5, `${id}: a stripe where the wall has grown (v ${p.v[k].toFixed(2)})`);
      const d = ((h.s - p.sA) % L + L) % L;
      assert.ok(d > 0 && d < p.entryRoadM, `${id}: a stripe ${d.toFixed(0)} m into a ${p.entryRoadM} m road`);
      if (prev != null) assert.ok(Math.abs((((h.s - prev) % L) + L) % L - 2) < 1e-6, `${id}: stripes are 2 m apart`);
      prev = h.s;
    }
  }
  assert.equal(TM.pitHatch(narrowOnce()).length, 0, "a painted lane has no entry road to hatch");   // .length: the array is the VM realm's
});
