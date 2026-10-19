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
// face rasterised and cannot fight. tools/track/coplanar-audit.cjs gates on
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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { overlapArea, planeGap } = createRequire(import.meta.url)("../../tools/track/coplanar-audit.cjs");

// SPOTS = distinct 40 m locations carrying at least one same-facing coplanar
// pair (spots, not pairs: a pair count swings when one prop moves, a spot
// appears or disappears). The caps live in tools/track/coplanar-baseline.json;
// what survives is real geometry (stacked city facades, coincident panel
// tops), per-circuit placement defects rather than an engine standoff.
// Every raise and cut since 2026-08 is recorded, with its measurement, in
// git history of that file and of this one (`git log -p -- tools/track/
// coplanar-baseline.json`); `coplanar-audit <id> --why` names a spot's call site.
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "coplanar-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit, so run it ONCE and share it — and run the
// default AND the --overhead analysis on that one build per circuit (`--both`):
// the two used to be separate `--all` runs, rebuilding the fleet twice. Each
// half is exactly what its own `--json` / `--json --overhead` run prints.
let cached = null;
const bothSweeps = () => (cached ||= JSON.parse(execFileSync(
  process.execPath,
  [path.join(ROOT, "tools", "track", "coplanar-audit.cjs"), "--all", "--json", "--both"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)));
const sweep = () => bothSweeps().default;
// The roster the sweep must cover: every circuit, or the APEX_CIRCUITS subset
// ci.yml's circuit lane hands a circuit-only PR (tools/lib/circuit-scope.cjs).
const scopedRoster = () => createRequire(import.meta.url)("../../tools/lib/circuit-scope.cjs")
  .scope(createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS).length;

test("same-facing coplanar faces stay within the per-circuit baseline", () => {
  const results = sweep();
  // The floor is the ROSTER, not a number typed once: `>= 24` kept passing after
  // the roster reached 40, so the sweep could have silently dropped 16 circuits.
  // …and the roster is the SCOPED one: APEX_CIRCUITS (ci.yml's circuit lane, a
  // circuit-only PR) narrows the CLI's --all and this floor together.
  const roster = scopedRoster();
  assert.equal(results.length, roster, `expected ${roster} circuits${process.env.APEX_CIRCUITS ? ` (APEX_CIRCUITS=${process.env.APEX_CIRCUITS})` : ""}, got ${results.length}`);

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
  // Only the SCOPED baseline rows: under APEX_CIRCUITS the sweep measured that subset.
  const { scope } = createRequire(import.meta.url)("../../tools/lib/circuit-scope.cjs");
  for (const [id, cap] of Object.entries(BASELINE).filter(([id]) => scope([id]).length)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], `stale baseline entries:\n  ${slack.join("\n  ")}`);
});

// --- overhead undersides and tops (2026-09-24) ------------------------------
//
// The sweep above skips every face with |n.y| >= 0.5, so no deck underside,
// soffit, gantry bottom or tunnel roof had ever been checked. Two madrid bridges
// drew a thin soffit span at their deck's own clearance: both undersides in one
// plane, 0.0 mm apart, 216 and 203 m2, flickering overhead as a car drove under.
// monaco's tunnel roof, haunch and springing all topped out at exactly 7.80 m
// (124 pairs) and miami's Turnpike pier shafts shared their caps' top plane.
// `--overhead` audits only horizontal faces above road + 3 m within hw + 8 m,
// up- and down-facing, and this holds it at the exception list below — ZERO
// everywhere else, so a new overhead layer drawn in its neighbour's plane fails.
//
// No overhead exception remains (the former madrid lamp-arm pair was cleared
// when the terrain stopped trenching the verge): the cap is zero everywhere.
const OVERHEAD_BASELINE = {};
const overheadSweep = () => bothSweeps().overhead;

test("overhead structures: no horizontal face shares its neighbour's plane", () => {
  const results = overheadSweep();
  const roster = scopedRoster();
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);
  const off = [];
  for (const r of results) {
    const cap = OVERHEAD_BASELINE[r.id] || 0;
    if (r.spots !== cap) off.push(`${r.id}: ${r.spots} overhead spot(s), expected ${cap}`);
  }
  assert.deepEqual(off, [], "overhead coplanar faces changed — run " +
    "`node tools/track/coplanar-audit.cjs <id> --overhead --why` to name the emitters:\n  " +
    off.join("\n  "));
});

// --- the overlap metric itself (2026-09-22) --------------------------------
//
// `spots` above is only as honest as the area that gates them: AREA_MIN drops a
// pair under 2 m2, and until this was fixed the area was the intersection of the
// two faces' in-plane BOUNDING RECTANGLES. A face rotated within its own plane —
// a ferris-wheel spoke, a diagonal brace, a canted panel — has an in-plane AABB
// far larger than itself, so two 0.28 m bars crossing near a hub reported
// 1052 m2 (vegas). The pair was real; the number was fiction, and it sorted a
// lattice above a genuinely flush wall. overlapArea now intersects the two
// convex hulls, which is exact for every face the emitters produce.
const rect = (x0, y0, x1, y1) => ({ u1: [x0, x1], u2: [y0, y1], pts: [x0, y0, x1, y0, x1, y1, x0, y1] });

test("overlapArea is the real overlap, exact on the shapes the emitters emit", () => {
  const near = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-9, `${msg}: got ${got}, want ${want}`);
  near(overlapArea(rect(0, 0, 1, 1), rect(0, 0, 1, 1)), 1, "identical unit squares");
  near(overlapArea(rect(0, 0, 1, 1), rect(0.5, 0, 1.5, 1)), 0.5, "half-offset squares");
  near(overlapArea(rect(0, 0, 1, 1), rect(2, 2, 3, 3)), 0, "disjoint squares");
  // A cross: two 0.1 m bars at right angles meet in one 0.1 x 0.1 square.
  near(overlapArea(rect(0, 0.45, 1, 0.55), rect(0.45, 0, 0.55, 1)), 0.01, "crossed bars");
});

test("planeGap is the point-to-plane separation, not |d_a - d_b| (#2205)", () => {
  // The vegas hoarding x street-barrier pair, reduced: two parallel vertical
  // faces 1.37 m apart, ~800 m from the origin, normals 0.11 deg apart. Each
  // face's own d differs by ~0.7 mm, which the audit used to call the gap.
  const face = (ang, c) => {
    const n = [Math.cos(ang), 0, Math.sin(ang)];
    return { n, c, d: n[0] * c[0] + n[1] * c[1] + n[2] * c[2] };
  };
  const th = -0.4325, a = face(th, [3.07, 0.6, 798.48]);
  const cb = [a.c[0] - 1.37 * a.n[0], 0.6, a.c[2] - 1.37 * a.n[2]];        // 1.37 m behind a
  // The normal tilt that cancels the 1.37 m in d: d(n.c)/dth = -sin th x + cos th z.
  const b = face(th + 1.37 / (-Math.sin(th) * cb[0] + Math.cos(th) * cb[2]), cb);
  assert.ok(Math.abs(a.d - b.d) < 0.02, `the fixture reproduces the false fight: |d_a - d_b| = ${Math.abs(a.d - b.d)}`);
  assert.ok(planeGap(a, b) > 1.3, `the faces are 1.37 m apart, got ${planeGap(a, b)}`);
  const flush = face(th, [a.c[0] - 4 * a.n[2], 0.6, a.c[2] + 4 * a.n[0]]);   // 4 m along the same plane
  assert.ok(planeGap(a, flush) < 1e-9, "a genuinely flush neighbour still reads 0");
});

test("two crossing diagonal bars report their crossing, not their bounding boxes", () => {
  // The vegas ferris-wheel case, reduced: 10 m x 0.28 m members at +-0.4 rad.
  const bar = (ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pts = [];
    for (const [x, y] of [[-5, -0.14], [5, -0.14], [5, 0.14], [-5, 0.14]])
      pts.push(x * c - y * s, x * s + y * c);
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
    return { u1: [Math.min(...xs), Math.max(...xs)], u2: [Math.min(...ys), Math.max(...ys)], pts };
  };
  const a = bar(0.4), b = bar(-0.4);
  const boxProduct = (a.u1[1] - a.u1[0]) * (a.u2[1] - a.u2[0]);
  const real = overlapArea(a, b);
  assert.ok(real > 0.05 && real < 0.2, `a 0.28 m crossing is ~0.1 m2, got ${real}`);
  assert.ok(boxProduct > 30, "the in-plane bounding box really is that much bigger");
  assert.ok(real < boxProduct / 100, "the old metric over-reported this by two orders of magnitude");
});
