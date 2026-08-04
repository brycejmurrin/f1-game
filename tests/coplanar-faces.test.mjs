// Regression ratchet: SAME-FACING coplanar faces must not grow.
//
// Sibling to prop-clipping.test.mjs, and deliberately a separate gate. That one
// measures interpenetration DEPTH and discards everything shallower than 0.5 m
// as noise — but z-fighting lives at penetration ~= 0, exactly the bucket it
// throws away. Two faces at the same depth, both pointing the same way, both
// drawn, both writing depth: they flicker at EVERY distance, because no depth
// buffer can separate two identical depths.
//
// Only same-facing pairs count. Back-face culling is on and addBox winds the
// outward face, so an anti-parallel coplanar pair — a window pane's inner face
// against its wall, a stacked mass section, a kerb on terrain — has exactly one
// face rasterised and cannot fight. tools/coplanar-audit.cjs gates on
// dot(nA,nB) >= 0.999 so that entire legitimate population is excluded by
// construction rather than by heuristic.
//
// Semantics match prop-clipping deliberately:
//   * a circuit NOT in BASELINE must read 0 — that is what makes a NEW defect,
//     or a newly added circuit, fail,
//   * a circuit IN BASELINE fails when its count GROWS,
//   * no ALLOW escape hatch.
//
// Pure Node — coplanar-audit runs the real track build in a VM with no browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// SPOTS = distinct 40 m locations carrying at least one same-facing coplanar
// pair. Spots, not pairs, for the same reason prop-clipping uses them: a pair
// count swings by several when one prop moves, whereas a spot appears or
// disappears.
//
// What remains is dominated by the street circuits' city generator, which
// places building rows by centreline arc length; on the inside of a corner that
// compresses until adjacent footprints share volume and their facades — panes,
// rails, mullions — end up on one plane. That needs a PLACEMENT fix, not a
// standoff constant, so the caps carry it until then.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "coplanar-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit, so run it ONCE and share it.
let cached = null;
const sweep = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "coplanar-audit.cjs"), "--all", "--json"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));

test("same-facing coplanar faces stay within the per-circuit baseline", () => {
  const results = sweep();
  assert.ok(results.length >= 24, `expected >= 24 circuits, got ${results.length}`);

  const grown = [];
  for (const r of results) {
    const cap = Object.prototype.hasOwnProperty.call(BASELINE, r.id) ? BASELINE[r.id] : 0;
    if (r.spots > cap) grown.push(`${r.id}: ${r.spots} spots > baseline ${cap}`);
  }
  assert.deepEqual(grown, [], `coplanar faces grew:\n  ${grown.join("\n  ")}`);
});

test("baseline has no stale entries — a cap above the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.spots]));
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});
