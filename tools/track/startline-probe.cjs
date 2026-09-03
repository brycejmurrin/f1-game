#!/usr/bin/env node
// @doc The two checks that can FAIL a `startFrac`: mean curvature 120 m around s=0, and the first apex hand; `--calibrate`.
// @skill debug-tracks
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
  let sum = 0, max = 0, count = 0;
  for (let d = -HALF_WINDOW_M; d <= HALF_WINDOW_M; d += 2) {
    const k = Math.abs(Tracks.curvature(track, ((d % L) + L) % L));
    sum += k; if (k > max) max = k; count++;
  }
  return { mean: sum / count, max, ok: sum / count <= STRAIGHT_BAR };
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
      return { ...straightness(Tracks, track), apex: firstApex(Tracks, track), total: track.total };
    };

    const now = measure(authored);
    const row = {
      id: def.id, n: N, reverse: !!def.reverse,
      authored, now,
      spacingM: Math.round(now.total / N),
    };
    if (Math.abs(want - authored) > 1e-9) { row.candidate = want; row.next = measure(want); }
    rows.push(row);
  }
  return rows;
}

/* ---------- CLI ---------- */

function fmt(id, frac, m, spacing) {
  const verdict = m.ok ? "straight" : "IN A CORNER";
  return `${id.padEnd(13)} frac=${frac.toFixed(4)}  mean|k|=${m.mean.toFixed(5)}  ` +
    `max=${m.max.toFixed(5)}  ${verdict.padEnd(11)}  ` +
    `first apex ${m.apex.hand} at ${String(m.apex.distM).padStart(4)} m` +
    (spacing != null ? `  (node ${spacing} m)` : "");
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

  let bad = 0, badAfter = 0;
  for (const r of rows) {
    console.log(fmt(r.id, r.authored, r.now, r.spacingM));
    if (!r.now.ok) bad++;
    if (r.next) {
      const better = r.next.mean < r.now.mean;
      console.log(`  ->          ${fmt("", r.candidate, r.next).trim()}   ${better ? "improved" : "no better"}`);
      if (!r.next.ok) badAfter++;
    } else if (!r.now.ok) badAfter++;
  }
  console.log(`\n${bad}/${rows.length} start lines in a corner as authored` +
    (rows.some((r) => r.next) ? `; ${badAfter}/${rows.length} after the candidate values` : ""));
}

module.exports = { probe, STRAIGHT_BAR, HALF_WINDOW_M, KNOWN_T1 };
