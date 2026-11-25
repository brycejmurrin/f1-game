// corner-frames-roster.test.mjs — the whole-roster half of corner-frames.test.mjs (#6569 rank 3, option B).
//
// tools/track/corner-frames.cjs measures every circuit's corner-anchored data (turns[], bankZones,
// corner-labelled kits) against its BUILT curvature; tests/data/corner-frames-baseline.json pins
// today's offenders, SHRINK-ONLY (stable key -> measured offset m):
//   - a row that is not in the baseline and offends is red (a new offender);
//   - a baselined row that grew by more than SLACK_M is red;
//   - a baselined row that no longer offends is red until its row is deleted.
// It lives in test:sweeps: the fleet trigger runs it on js/track/, js/circuits/ and tools/track/
// diffs, and tools/ci/geometry-paths.mjs HAND_TARGETED runs it on a baseline-only diff.
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
