#!/usr/bin/env node
// @doc Pairs each geometry-detected straight with the `def.turns[]` indices bounding it, so an aero-zone claim can be checked.
// @skill agent-view
/* Apex 26 — pair each geometry-detected straight run with the turns[] indices
 * that bound it, so a real (fromTurn, toTurn) zone description can be checked
 * against what the engine will actually select — the missing step the first
 * turn-keyed attempt skipped (see js/physics/aero-zones.js's ZONE_COUNT comment:
 * that attempt hard-coded s0/s1 directly and never verified against the
 * geometry, so 35 of 68 spans came out short or curved).
 *
 * turns[] is now reliably Turn 1 = first apex after the corrected start line
 * (docs/tracks/START-LINES.md), so "turn index" here means exactly that: 0 is
 * Turn 1, 1 is Turn 2, etc., in physical driving order.
 *
 *   node tools/track/aero-zone-turns.cjs <id>          # all qualifying + near-miss runs
 *   node tools/track/aero-zone-turns.cjs --all
 */
"use strict";
const path = require("path");
const { buildContext } = require("./verify-track.cjs");

const X_ZONE_K = 0.0014;
const X_ZONE_STEP = 8;
const X_ZONE_MIN = 210;

function runsFor(Tracks, def) {
  const track = Tracks.buildCenterline(def);
  const total = track.total, n = Math.max(8, Math.round(total / X_ZONE_STEP));
  const straight = new Array(n);
  for (let i = 0; i < n; i++) {
    straight[i] = Math.abs(Tracks.curvature(track, (i + 0.5) * total / n)) <= X_ZONE_K;
  }
  let i0 = 0;
  while (i0 < n && straight[i0]) i0++;
  const runs = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n;
    if (straight[i]) {
      if (!cur) cur = { start: i * total / n, len: 0 };
      cur.len += total / n;
    } else if (cur) { cur.end = cur.start + cur.len; runs.push(cur); cur = null; }
  }
  if (cur) { cur.end = cur.start + cur.len; runs.push(cur); }
  return { runs, total };
}

function turnIndexBefore(turns, frac) {
  // turns[] is sorted ascending; find the last apex at or before `frac`
  // (wrapping — the run just after the line is bounded by the FINAL turn).
  let idx = -1;
  for (let i = 0; i < turns.length; i++) if (turns[i] <= frac) idx = i; else break;
  return idx; // -1 means "before turn 1", i.e. bounded by the last turn (wrap)
}

function report(Tracks, id) {
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) { console.log(`${id}: not found`); return; }
  const { runs, total } = runsFor(Tracks, def);
  const turns = def.turns || [];
  console.log(`\n${id}  (${turns.length} turns, lap ${total.toFixed(0)} m)`);
  const sorted = runs.slice().sort((a, b) => b.len - a.len);
  for (const r of sorted) {
    const f0 = r.start / total, f1 = (r.end / total) % 1;
    const iBefore = turnIndexBefore(turns, f0);
    const iAfter = turns.findIndex((t) => t >= f1);
    const fromT = iBefore < 0 ? turns.length : iBefore + 1;     // 1-based, wraps to last
    const toT = iAfter < 0 ? 1 : iAfter + 1;                     // 1-based, wraps to first
    const qual = r.len >= X_ZONE_MIN ? " " : "*";
    console.log(`  ${qual}${r.len.toFixed(0).padStart(5)} m   frac ${f0.toFixed(3)}-${f1.toFixed(3)}` +
      `   T${fromT} -> T${toT}`);
  }
  if (sorted.some((r) => r.len < X_ZONE_MIN)) console.log(`  * below the ${X_ZONE_MIN} m length filter`);
}

const Tracks = buildContext();
const args = process.argv.slice(2);
if (args.includes("--all")) {
  for (const def of Tracks.LIST) report(Tracks, def.id);
} else if (args[0]) {
  report(Tracks, args[0]);
} else {
  console.log("usage: aero-zone-turns.cjs <id> | --all");
}
