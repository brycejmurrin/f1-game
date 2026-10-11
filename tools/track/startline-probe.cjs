#!/usr/bin/env node
// @doc Checks that can FAIL a `startFrac`: |k| at s=0 (120 m mean, ±40 m max), the 24-slot grid span, first apex hand.
// @skill agent-view
/* Apex 26 — is the start/finish line on a straight, and what does the driver
 * meet first?
 *
 * Two checks that can FAIL, which is the point. Verifying a `startFrac` by
 * re-deriving it the way it was derived proves nothing; these two ask the built
 * geometry questions with a wrong answer available.
 *
 *   1. STRAIGHTNESS — mean |curvature| over the 120 m centred on racing s=0.
 *      A start line sits on a straight. `> 0.004` rad/m mean (a ~250 m radius
 *      held right across the line) means it is in a corner and still wrong.
 *      So does any single `|k| > 0.008` within ±40 m: the mean alone averaged
 *      a chicane away (magny_cours, max 0.0255).
 *   1b. GRID SPAN — max |curvature| from the line back past the 24th slot
 *      (TrackMesh.gridSlot), bar 0.004. The circuits that fail either today
 *      are GRID_CURVE_ALLOW below, each with its reason and a ceiling
 *      (tests/unit/grid-boxes.test.mjs enforces the same list). Exit 1 on any
 *      failure that list does not excuse.
 *   2. FIRST APEX HAND — walk forward from s=0 to the first curvature peak
 *      above 0.008 rad/m and report its sign. `+k = LEFT` (AGENTS.md), but that
 *      label has shipped backwards before, so --calibrate scores the measure
 *      against six circuits whose Turn 1 is not in dispute before any other
 *      number here is worth reading. Montreal is deliberately in that set: its
 *      Turn 1 is a LEFT although the circuit runs clockwise, so a sign error
 *      cannot hide behind "well, it's a clockwise track".
 *
 * Candidate `startFrac` values are probed WITHOUT editing any circuit file: the
 * rotation tracks.js applies is a pure permutation of the control points, so it
 * is inverted to recover the source trace and re-applied with the candidate.
 * `buildCenterline` then bakes the same `track.curv` LUT the game drives on.
 *
 * Usage:
 *   node tools/track/startline-probe.cjs                 # every circuit, as authored
 *   node tools/track/startline-probe.cjs --calibrate     # score the hand measure first
 *   node tools/track/startline-probe.cjs --snap          # as authored vs. snapped
 *   node tools/track/startline-probe.cjs --frac monza=0  # probe explicit candidates
 *   node tools/track/startline-probe.cjs --json
 */
"use strict";

const path = require("path");
const { buildContext } = require("./verify-track.cjs");

const ROOT = path.resolve(__dirname, "../..");

// Half-window for the straightness check, and the bar. 60 m each side is a car
// length either side of the line plus the run-up a start-line straight always
// has; 0.004 rad/m is a 250 m radius, which no straight holds and no corner
// worth the name fails to beat.
const HALF_WINDOW_M = 60;
const STRAIGHT_BAR = 0.004;
// A curvature peak has to clear this to count as a corner rather than a kink.
// 0.008 rad/m is a 125 m radius.
const APEX_BAR = 0.008;
// The MEAN alone let a corner through: 120 m of straight averages a sharp
// chicane away (magny_cours read "straight" with max |k| 0.0255 at -60 m).
// So the line also fails on any single |k| above APEX_BAR within ±40 m — the
// pole box and the first metres off the line. Fleet worst outside the
// allowlist is mosport 0.0060 at +40 m (2026-10-10).
const LINE_HALF_M = 40;
const LINE_MAX_BAR = APEX_BAR;

// THE GRID SPAN. TrackMesh.gridSlot() puts pole 14 m behind the line and each
// next slot 8 m further back; the largest field is 24 (22 + a MY TEAM career's
// two), plus the 3 m of box behind the last slot's point — ~201 m of road that
// only the ±60 m check above ever looked at. The span is read off gridSlot()
// itself, not a copy of its constants. Bar 0.004 rad/m (R 250 m, the same
// "no straight holds it" number as STRAIGHT_BAR) sits in the gap of the
// measured fleet: clean circuits top out at nurburgring 0.0032, the first
// offender is suzuka 0.0056 (2026-10-10, all 52 circuits).
const GRID_MAX_SLOTS = 24;
const GRID_BOX_TAIL_M = 3;
const GRID_K_BAR = 0.004;
// Circuits whose AUTHORED line puts slots (or the line) on a corner today.
// Fixing one means re-deriving its startFrac, which needs a rendered lap — so
// they are named here, with the measured worst |k| as a ceiling: a regression
// that worsens one by > 10 % still fails, and an entry that measures clean is
// stale and fails too (delete it). Shared with tests/unit/grid-boxes.test.mjs.
// `gridK` caps the grid span, `lineK` (only where needed) the ±40 m max.
const GRID_CURVE_ALLOW = {
  magny_cours: { gridK: 0.0627, why: "slots 5-14 sit in the Lycee chicane (T16/T17, 71-97 m behind the line, R≈19 m) and slots 17-23 run into T15 (203 m behind)" },
  jeddah: { gridK: 0.0326, lineK: 0.0326, why: "startFrac 0.9625 is documented known-wrong (docs/tracks/START-LINES.md, no usable source): pole sits 15 m past the T27 apex, slots 0-9 on that bend, R≈31 m at pole" },
  silverstone: { gridK: 0.0248, why: "slots 10-17 sit in Club (T18, 116 m behind the line; R≈40 m at slot 12) and slots 20-23 reach back toward T17 (288 m behind)" },
  vegas: { gridK: 0.0137, why: "slots 4-11 sit on T17 (63 m behind the line), R≈73 m" },
  mexico: { gridK: 0.0083, why: "slots 22-23 only, past the default 22-car field: the tail reaches T17's exit (216 m behind the line)" },
  monaco: { gridK: 0.0059, why: "slot 23 only, past the default 22-car field: the gently curving harbour straight toward Anthony Noghes (T19, 308 m behind), R≈168 m" },
  suzuka: { gridK: 0.0056, why: "slots 10-23 on the R≈180-220 m bend of the main straight out of the last corner (T18, 283 m behind the line)" },
};
const ALLOW_SLACK = 1.10;

// Turn 1's hand where it is NOT in dispute. This calibrates the sign of the
// measurement; it is not evidence about any other circuit.
const KNOWN_T1 = {
  singapore: "L",   // Marina Bay, sharp left off the line
  silverstone: "R", // Abbey
  montreal: "L",    // the trap: a LEFT on a clockwise circuit
  monza: "R",       // Variante del Rettifilo
  spa: "R",         // La Source hairpin
  cota: "L",        // the uphill left
};

/* ---------- rotation, inverted and re-applied ---------- */

const wrap01 = (v) => { const n = Number(v) || 0; return ((n % 1) + 1) % 1; };

function racingNodeToSource(startFrac, reverse, node, count) {
  const n = Math.max(1, Math.round(count) || 1);
  const racing = Math.round(Number(node) || 0);
  const offset = Math.round(wrap01(startFrac) * n) % n;
  const source = reverse ? offset - racing : offset + racing;
  return ((source % n) + n) % n;
}

// tracks.js already rotated def.points by the authored startFrac. Undo it to
// get the trace back in def.path order, so a candidate can be applied to
// the same starting material.
function sourcePoints(def) {
  const P = def.points, N = P.length;
  const phi = def._startFrac || 0;
  if (!def.reverse && !phi) return P.slice();
  const out = new Array(N);
  for (let i = 0; i < N; i++) out[racingNodeToSource(phi, def.reverse, i, N)] = P[i];
  return out;
}

function rotated(source, startFrac, reverse) {
  const N = source.length, out = new Array(N);
  for (let i = 0; i < N; i++) out[i] = source[racingNodeToSource(startFrac, reverse, i, N)];
  return out;
}

/* ---------- the two checks ---------- */

function straightness(Tracks, track) {
  const L = track.total;
  let sum = 0, max = 0, count = 0, lineMax = 0;
  for (let d = -HALF_WINDOW_M; d <= HALF_WINDOW_M; d += 2) {
    const k = Math.abs(Tracks.curvature(track, ((d % L) + L) % L));
    sum += k; if (k > max) max = k; count++;
    if (Math.abs(d) <= LINE_HALF_M && k > lineMax) lineMax = k;
  }
  return { mean: sum / count, max, lineMax, ok: sum / count <= STRAIGHT_BAR && lineMax <= LINE_MAX_BAR };
}

// Max |k| over every metre of the grid span (the line back to the last box's
// tail), where it peaks, and which slots have |k| > GRID_K_BAR within their
// own ±GRID_BOX_TAIL_M. `TrackMesh` defaults to the probe's VM context.
function gridSpan(Tracks, track, TrackMesh) {
  const TM = TrackMesh || (Tracks._vmContext && Tracks._vmContext.TrackMesh);
  const L = track.total, at = (d) => Math.abs(Tracks.curvature(track, (((L - d) % L) + L) % L));
  const behind = (i) => L - TM.gridSlot(track, i).s;        // metres behind the line
  const spanM = behind(GRID_MAX_SLOTS - 1) + GRID_BOX_TAIL_M;
  let max = 0, atM = 0;
  for (let d = 0; d <= spanM; d += 1) { const k = at(d); if (k > max) { max = k; atM = d; } }
  const slots = [];
  for (let i = 0; i < GRID_MAX_SLOTS; i++) {
    const b = behind(i);
    let m = 0;
    for (let d = b - GRID_BOX_TAIL_M; d <= b + GRID_BOX_TAIL_M; d += 1) m = Math.max(m, at(d));
    if (m > GRID_K_BAR) slots.push(i);
  }
  return { max, atM, spanM, slots, ok: max <= GRID_K_BAR };
}

// The allowlist verdict for one circuit's measured line + grid: the problems
// that are NOT excused (empty = pass). Shared by the CLI and the unit test.
function allowVerdict(id, line, grid) {
  const a = GRID_CURVE_ALLOW[id], bad = [];
  const cap = (v, c, what) => {
    if (c == null) return false;
    if (v > c * ALLOW_SLACK) bad.push(`${id}: ${what} |k| ${v.toFixed(4)} is past its allowlisted ${c} (+10 %) — a regression`);
    return true;
  };
  if (!grid.ok && !cap(grid.max, a && a.gridK, "grid"))
    bad.push(`${id}: grid max |k| ${grid.max.toFixed(4)} (R ${(1 / grid.max).toFixed(0)} m) ${grid.atM} m behind the line, slots ${grid.slots.join(",")} — over ${GRID_K_BAR}`);
  if (!line.ok && !cap(line.lineMax, a && a.lineK, "line"))
    bad.push(`${id}: start line in a corner — mean |k| ${line.mean.toFixed(5)} over ±${HALF_WINDOW_M} m (bar ${STRAIGHT_BAR}), ` +
      `max ${line.lineMax.toFixed(4)} within ±${LINE_HALF_M} m (bar ${LINE_MAX_BAR})`);
  if (a && grid.ok && a.gridK != null) bad.push(`${id}: allowlisted for the grid but measures ${grid.max.toFixed(4)} ≤ ${GRID_K_BAR} — delete the stale entry`);
  if (a && a.lineK != null && line.ok) bad.push(`${id}: allowlisted for the line but measures straight — delete lineK`);
  return bad;
}

// First curvature peak after the line: walk forward, take the first local
// maximum of |k| that clears APEX_BAR. Returns its sign, its distance from the
// line, and its magnitude — the distance is what a reader needs to tell a real
// Turn 1 from a kink the bar happened to let through.
function firstApex(Tracks, track) {
  const L = track.total, STEP = 2;
  let prev = Math.abs(Tracks.curvature(track, 0));
  let rising = false;
  for (let d = STEP; d < L; d += STEP) {
    const k = Tracks.curvature(track, d % L);
    const a = Math.abs(k);
    if (a > prev) rising = true;
    else if (rising && prev >= APEX_BAR) {
      const sK = Tracks.curvature(track, (d - STEP) % L);
      return { hand: sK > 0 ? "L" : "R", distM: Math.round(d - STEP), k: sK };
    } else if (a < prev) rising = false;
    prev = a;
  }
  return { hand: "?", distM: -1, k: 0 };
}

/* ---------- driver ---------- */

function probe(candidates) {
  const Tracks = buildContext();
  const rows = [];
  for (const def of Tracks.LIST) {
    const source = sourcePoints(def);
    const N = source.length;
    const authored = def.startFrac || 0;
    const want = candidates && candidates[def.id] != null ? candidates[def.id] : authored;

    const measure = (frac) => {
      // A shallow copy is enough: buildCenterline reads points/street only, and
      // reusing the def keeps every other authored field identical between the
      // authored and candidate builds, so the only variable is the rotation.
      const d2 = Object.assign(Object.create(Object.getPrototypeOf(def)), def, {
        points: rotated(source, frac, def.reverse),
      });
      const track = Tracks.buildCenterline(d2);
      return { ...straightness(Tracks, track), apex: firstApex(Tracks, track), grid: gridSpan(Tracks, track), total: track.total };
    };

    const now = measure(authored);
    const row = {
      id: def.id, n: N, reverse: !!def.reverse,
      authored, now,
      spacingM: Math.round(now.total / N),
      unexcused: allowVerdict(def.id, now, now.grid),
    };
    if (Math.abs(want - authored) > 1e-9) { row.candidate = want; row.next = measure(want); }
    rows.push(row);
  }
  return rows;
}

/* ---------- CLI ---------- */

// [5,6,7,9] -> "5-7,9"
const ranges = (xs) => xs.reduce((out, x, i) => {
  if (i && x === xs[i - 1] + 1) out[out.length - 1][1] = x; else out.push([x, x]);
  return out;
}, []).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");

function fmt(id, frac, m, spacing) {
  const verdict = m.ok ? "straight" : "IN A CORNER";
  const g = m.grid;
  return `${id.padEnd(13)} frac=${frac.toFixed(4)}  mean|k|=${m.mean.toFixed(5)}  ` +
    `max=${m.max.toFixed(5)}  ${verdict.padEnd(11)}  ` +
    `first apex ${m.apex.hand} at ${String(m.apex.distM).padStart(4)} m` +
    (spacing != null ? `  (node ${spacing} m)` : "") +
    `  grid max|k|=${g.max.toFixed(4)} ${g.ok ? "ok" : `slots ${ranges(g.slots)} IN A CORNER` + (GRID_CURVE_ALLOW[id] ? " (allowlisted)" : "")}`;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const wantSnap = argv.includes("--snap");
  const calibrate = argv.includes("--calibrate");

  let candidates = null;
  const fracIdx = argv.indexOf("--frac");
  if (fracIdx >= 0) {
    candidates = {};
    for (const a of argv.slice(fracIdx + 1)) {
      if (a.startsWith("--")) break;
      const [id, v] = a.split("=");
      candidates[id] = Number(v);
    }
  }
  if (wantSnap) {
    const { snap, START } = require("./startline-snap.cjs");
    candidates = candidates || {};
    for (const r of snap(Object.keys(START))) if (!r.error) candidates[r.id] = r.startFrac;
  }

  const rows = probe(candidates);
  if (asJson) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

  if (calibrate) {
    console.log("CALIBRATION — first-apex hand against six undisputed Turn 1s.");
    console.log("Scored on the SNAPPED line, since the authored one is what is in doubt.\n");
    let hit = 0, seen = 0;
    for (const r of rows) {
      const want = KNOWN_T1[r.id];
      if (!want) continue;
      const m = r.next || r.now;
      const got = m.apex.hand;
      seen++; if (got === want) hit++;
      console.log(`  ${r.id.padEnd(13)} expected ${want}   measured ${got}   ` +
        `${got === want ? "ok" : "MISMATCH"}   (|k|=${Math.abs(m.apex.k).toFixed(4)} at ${m.apex.distM} m)`);
    }
    console.log(`\n  ${hit}/${seen} — ${hit === seen ? "sign convention calibrated (+k = LEFT)" : "DO NOT TRUST ANY HAND BELOW"}\n`);
  }

  let bad = 0, badAfter = 0, badGrid = 0;
  for (const r of rows) {
    console.log(fmt(r.id, r.authored, r.now, r.spacingM));
    if (!r.now.ok) bad++;
    if (!r.now.grid.ok) badGrid++;
    if (r.next) {
      const better = r.next.mean < r.now.mean;
      console.log(`  ->          ${fmt("", r.candidate, r.next).trim()}   ${better ? "improved" : "no better"}`);
      if (!r.next.ok) badAfter++;
    } else if (!r.now.ok) badAfter++;
  }
  console.log(`\n${bad}/${rows.length} start lines in a corner as authored` +
    (rows.some((r) => r.next) ? `; ${badAfter}/${rows.length} after the candidate values` : ""));
  // The verdict that can fail: the AUTHORED line and grid against the allowlist.
  const unexcused = rows.flatMap((r) => r.unexcused);
  console.log(`${badGrid}/${rows.length} grids (${GRID_MAX_SLOTS} slots) reach a corner over ${GRID_K_BAR} rad/m; ` +
    `${Object.keys(GRID_CURVE_ALLOW).length} allowlisted`);
  for (const u of unexcused) console.log(`  FAIL ${u}`);
  if (unexcused.length) process.exitCode = 1;
}

module.exports = {
  probe, gridSpan, allowVerdict, straightness,
  STRAIGHT_BAR, HALF_WINDOW_M, LINE_HALF_M, LINE_MAX_BAR,
  GRID_MAX_SLOTS, GRID_BOX_TAIL_M, GRID_K_BAR, GRID_CURVE_ALLOW, KNOWN_T1,
};
