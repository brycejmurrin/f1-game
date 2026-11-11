// corner-frames.test.mjs — corner-anchored circuit data must sit on the corner it names.
//
// Fleet guard for the stale-lap-frame class (audit 2026-11-09, W5): a start-line
// move or a re-traced path leaves turns[], bankZones and corner-labelled scenery
// kits keyed to the OLD centreline, so each lands on a real piece of road — the
// wrong one. tools/track/corner-frames.cjs measures every circuit against its
// BUILT curvature; this test pins today's offenders in a SHRINK-ONLY baseline
// (tests/data/corner-frames-baseline.json: stable key -> measured offset m):
//   - a row that is not in the baseline and offends is red (a new offender);
//   - a baselined row that grew by more than SLACK_M is red;
//   - a baselined row that no longer offends is red until its row is deleted
//     (so a fix always shrinks the list and nothing re-grows into the gap).
// Print the table: node tools/track/corner-frames.cjs [--md]
// Rewrite the baseline after a fix: node tools/track/corner-frames.cjs --baseline
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const CF = require("../../tools/track/corner-frames.cjs");
const BASE = JSON.parse(readFileSync(new URL("../data/corner-frames-baseline.json", import.meta.url), "utf8"));
const SLACK_M = 5;

const rows = CF.audit();

test("corner-frames: no new offender, no baselined offender grew", () => {
  const fresh = [], grew = [];
  for (const r of rows.filter((x) => x.bad)) {
    if (!(r.stable in BASE.rows)) fresh.push(`${r.stable} ${r.offsetM} m — ${r.detail}`);
    else if (r.offsetM > BASE.rows[r.stable] + SLACK_M) grew.push(`${r.stable} ${BASE.rows[r.stable]} -> ${r.offsetM} m — ${r.detail}`);
  }
  assert.deepEqual(fresh, [], "new corner-frame offenders (fix them; the baseline only shrinks)");
  assert.deepEqual(grew, [], "baselined offenders moved further from their corner");
});

test("corner-frames: the baseline only shrinks (a fixed row is deleted)", () => {
  const bad = new Set(rows.filter((x) => x.bad).map((r) => r.stable));
  const stale = Object.keys(BASE.rows).filter((k) => !bad.has(k));
  assert.deepEqual(stale, [], "rows that no longer offend: delete them from tests/data/corner-frames-baseline.json");
});

test("corner-frames: label parsing names the corners a comment means", () => {
  const def = { turns: new Array(20).fill(0) };
  assert.deepEqual(CF.cornersIn("// T2/3 apron", def, {}), [2, 3]);
  assert.deepEqual(CF.cornersIn("// Turns 9-10 chicane", def, {}), [9, 10]);
  assert.deepEqual(CF.cornersIn("// banked final right", def, {}), [20]);
  assert.deepEqual(CF.cornersIn("// Adelaide hairpin", def, { Adelaide: 6 }), [6]);
  assert.deepEqual(CF.cornersIn("// T45 is not a turn here", def, {}), []);
  const lab = CF.lineLabels("// TURN 8 kit\n// (real: footbridge at T7)\nfoo();\nbar(); // T3\n\nbaz();");
  assert.equal(lab[3].head, "// TURN 8 kit");
  assert.equal(lab[4].own, "// T3");
  assert.equal(lab[6].head, null);
});

// Sub-PEAK_K kinks (#5287): a numbered corner gentler than PEAK_K passes only on
// its OWN local curvature extremum within TURN_M — never by being near nothing.
test("corner-frames: the four real sub-threshold kinks count as on their corner", () => {
  const want = ["baku|T9", "redbull|T2", "mosport|T6", "mosport|T7"];
  const got = want.map((k) => rows.find((r) => r.stable === k)).map((r) => r && r.bad);
  assert.deepEqual(got, [false, false, false, false]);
});

function fakeTrack(n, total, kAt) {
  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) curv[i] = kAt(i);
  return { n, total, curv };
}
// 4 m nodes; a gentle 5e-4 rad/m bump (≈ Mosport's T6) centred on node 500.
const N = 1000, LAP = 4000, BUMP = (i) => 5e-4 * Math.exp(-((((i - 500) * 4) / 30) ** 2));

test("corner-frames kinkAt: a turn on a gentle kink is on it", () => {
  const tr = fakeTrack(N, LAP, BUMP);
  const k = CF.kinkAt(tr, 500 / N, tr.curv);
  assert.equal(k && k.m, 0);
});

test("corner-frames kinkAt: a turn 30 m off its kink still fails", () => {
  const tr = fakeTrack(N, LAP, BUMP);
  assert.equal(CF.kinkAt(tr, (500 + 30 / 4) / N, tr.curv), null);
});

test("corner-frames kinkAt: a turn on a featureless straight still fails", () => {
  // deterministic ±1e-5 rad/m ripple: OSM-spline noise, no corner
  const tr = fakeTrack(N, LAP, (i) => 1e-5 * Math.sin(i * 1.7) + 5e-6 * Math.sin(i * 0.37));
  assert.equal(CF.kinkAt(tr, 300 / N, tr.curv), null);
});
