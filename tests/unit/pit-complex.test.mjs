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
const wrap = (v, L) => ((v % L) + L) % L;
// Monaco with the PAINTED opt-out (`pit.mode: "narrow"`): the one lane that
// is paint on the road, kept as a def's explicit choice and the model-less path.
const narrowOnce = (() => { let t = null; return () => {
  const T = tracksOnce();
  return t || (t = T.build(Object.assign({}, T.LIST.find((d) => d.id === STREET), { pit: { mode: "narrow" } })));
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
      assert.ok(bar[k] >= t.hw[k] + p.off.outer * p.w[k] + 1.5 - 1e-6, `${id}: node ${k} boundary ${bar[k].toFixed(2)} inside the lane`);
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
  assert.equal(T.build(Object.assign({}, def, { pit: { mode: "street", side: -1 } })).pit.hasBays, false, "the pitch guard alone withholds the bays");
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
  for (let k = 0; k < t.n; k++) {
    if (!(p.keep[k] > 0)) continue;
    assert.ok(bar[k] >= t.hw[k] + p.off.outer * p.w[k] + 1.5 - 1e-6,
      `node ${k}: boundary ${bar[k].toFixed(2)} inside the complex's edge ${(t.hw[k] + p.off.outer * p.w[k] + 1.5).toFixed(2)}`);
  }
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
    // From the line to the end of the exit road, not a node is cornering.
    for (let s = 0; s < p.sB; s += 4)
      assert.ok(Math.abs(T.curvature(t, s)) <= P.PIT_K, `nurburgring: cornering at s=${s | 0} (sB ${p.sB | 0})`);
  }
  // Where the straight cannot hold even the minimum (Mosport 24 m, Jerez 48 m)
  // the exit sits on the floor, not at 130. (The ENTRY is clamped to
  // ENTRY_MIN the same way and may still open in a corner on such a circuit.)
  for (const id of ["mosport", "jerez"]) assert.equal(buildOnce(id).pit.exitM, P.EXIT_MIN, id);
  // A long straight keeps the full exit — the rule only bites where a corner does.
  assert.equal(buildOnce("monza").pit.exitM, P.EXIT_M);
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
  // Portimão's pit-straight cutting (groundedSegments, 9 m wide, 5.5 m tall,
  // 20 m out) ran straight through the garages: RAW emitters never pass the
  // footprint guard. They now ask `inPit` per chord and record the drop as
  // superseded, not as a guard suppression.
  const t = buildOnce("portimao");
  const d = t.modelDiagnostics;
  const cut = d.suppressed.filter((e) => /^portimao-cut-/.test(e.id));
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
  const prims = env.prims.slice(first);
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
    const pit = (t.lampPosts || []).filter((l) => l.pit);
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
  assert.equal((buildOnce(STREET).lampPosts || []).filter((l) => l.pit).length, 6, "the street complex lights its row too");
  assert.equal((narrowOnce().lampPosts || []).filter((l) => l.pit).length, 0, "a painted lane hangs no canopy");
});
