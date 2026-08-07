// Regression ratchet: prop-vs-prop interpenetration must not grow.
//
// The engine guards scenery horizontally against the ROAD (onTrack/rejBox) and
// vertically against the GROUND (float-audit). This is the third axis — models
// passing through each other. tools/clip-audit.cjs finds them; this locks the
// count in.
//
// Semantics are copied from tests/specs/props-over-road.spec.js deliberately:
//   * a circuit NOT in BASELINE must read 0 — that is what makes a NEW defect,
//     or a newly added circuit, fail,
//   * a circuit IN BASELINE fails when its count GROWS,
//   * no ALLOW escape hatch.
// A hard fleet-wide zero is not reachable in one pass, so the caps ratchet down
// as circuits are cleaned rather than gating on an unreachable ideal.
//
// Pure Node — clip-audit runs the real track build in a VM with no browser, so
// this belongs in `npm run test:tooling`, not the Playwright projects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// SEVERE spots = distinct 40 m locations where two DIFFERENT models penetrate
// each other by >= 1 m. Spots, not pairs: a pair count swings by several when a
// single tree moves, whereas a spot appears or disappears.
//
// Street circuits dominate what remains — their city generators place building
// rows by centreline arc length, which compresses on the inside of a corner
// until adjacent footprints share volume.
// Kept in tools/clip-baseline.json so the tool's own --gate and this test can
// never disagree about what the caps are.
//
// KNOWN LIMITATION behind silverstone's cap. The emission-adjacency filter
// (|q_a - q_b| <= 8) is how the detector recognises "these primitives are one
// assembly", and it is what makes same-model overlap — accepted as blending —
// invisible to the report. It fails for a helper that emits MANY primitives per
// along() step: crowdMound emits 3 earth steps plus ~10 spectators per node, so
// consecutive steps of the same run land >8 apart in emission order and read as
// cross-model. They are the same colour and material and the shared volume is
// interior, so nothing is visible on screen (verified by eye at frac 0.021).
// Widening the window would blind the detector to real defects, so the cap
// carries the cost instead. Tightening this properly needs a real model token
// rather than an emission-order proxy.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "clip-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit (~90 s), so run it ONCE and share it.
let cached = null;
const sweep = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "clip-audit.cjs"), "--all", "--json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));

test("prop interpenetration stays within the per-circuit baseline", () => {
  const results = sweep();
  // The floor is the ROSTER, not a number typed once: `>= 24` kept passing after
  // the roster reached 40, so the sweep could have silently dropped 16 circuits.
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);

  const grown = [];
  for (const r of results) {
    const cap = Object.prototype.hasOwnProperty.call(BASELINE, r.id) ? BASELINE[r.id] : 0;
    if (r.severe > cap) grown.push(`${r.id}: ${r.severe} severe spots > baseline ${cap}`);
  }
  assert.deepEqual(grown, [], `prop interpenetration grew:\n  ${grown.join("\n  ")}`);
});

test("baseline has no stale entries — a cap below the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.severe]));
  // A cap far above the real number silently permits regressions up to it.
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});
