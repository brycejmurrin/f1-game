// #2204 — tiered stands on a bend must close the outside-of-bend gap.
//
// MEASURED ON WHAT SHIPS (W21 / W30, 2026-11-10). This file used to rebuild
// jerez and re-derive each terrace row's length from a COPY of the emitter's
// arithmetic, so a clamp in the emitter the copy lacked (the 1.85x curve cap)
// went unseen while Jerez's back rows stood 4-12 m apart. It now builds the
// circuit and measures the boxes the stand emitters actually emit
// (tests/helpers/stand-gaps.cjs): adjacent along() stations, same row, the
// along-track gap between their facing end corners.
//
// The contract, restated with its measured bound: on the OUTSIDE of a bend a
// chord-aimed row meets its neighbour (gap <= 0.5 m) unless the bend's wedge
// (tier depth x step turn) is deeper than the JOINT_OVERLAP curveTier allows a
// row to run into its neighbour (clip-audit's 1 m severe gate) — then the joint
// opens by at most wedge - 0.4 m. The fleet check is
// stand-curve-gap-fleet.test.mjs (test:sweeps); this file pins three circuits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
const { measureStandGaps } = require(path.join(ROOT, "tests/helpers/stand-gaps.cjs"));

const OUTSIDE_GAP_MAX = 0.5; // metres — Done when of #2204

// Three circuits whose curved stands sit on moderate bends: every outside joint
// must close to the plain 0.5 m contract (before the fix: jerez 237/300 over,
// max 12.3 m; catalunya 113/200, 2.5 m; silverstone 94/141, 3.8 m).
for (const id of ["jerez", "catalunya", "silverstone"]) {
  test(`${id}: curved-stand rows meet on the outside of a bend (<= ${OUTSIDE_GAP_MAX} m, #2204)`, () => {
    const env = buildContext();
    const pairs = measureStandGaps(env, id).filter((x) => !x.bench);
    const outside = pairs.filter((x) => x.bend === "outside");
    assert.ok(outside.length >= 50, `${id}: expected many outside-of-bend station pairs, got ${outside.length}`);
    const bad = outside.filter((x) => Math.max(x.gOut, x.gIn) > OUTSIDE_GAP_MAX);
    assert.deepEqual(bad.slice(0, 6).map((x) => `${x.helper} k=${x.k} ${x.role} gap=${Math.max(x.gOut, x.gIn).toFixed(2)} turn=${x.turnDeg.toFixed(1)}`), [],
      `${id}: outside-of-bend joints over ${OUTSIDE_GAP_MAX} m`);
    // Straight runs close too (jerez base: 58/1080 over, max 4.7 m, from
    // irregular anchors 40-54 m back).
    for (const x of pairs.filter((x) => x.bend === "straight" && x.helper !== "terrace"))
      assert.ok(Math.max(x.gOut, x.gIn) <= OUTSIDE_GAP_MAX, `${id}: straight ${x.helper} k=${x.k} gap ${Math.max(x.gOut, x.gIn).toFixed(2)}`);
  });
}

test("jerez clip-audit no longer lists tier-emitter self-pairs at severe depth (#2204)", () => {
  const { execFileSync } = require("node:child_process");
  const out = execFileSync(process.execPath, [
    path.join(ROOT, "tools/track/clip-audit.cjs"), "jerez", "--why",
  ], { encoding: "utf8", cwd: ROOT, timeout: 60000 });
  // Severe (≥1 m) self-pairs of terrace / spectatorHill / crowdBand are the
  // defect class. Minor (<1 m) residual pairs and place/bush cross-pairs are
  // out of scope.
  const severeTier = out.split("\n").filter((line) => {
    const m = line.match(/max\s+([\d.]+)m/);
    if (!m || parseFloat(m[1]) < 1.0) return false;
    // stands.js since the SceneryStands split: the old structures.js-only
    // pattern no longer matched any terrace line, so this check was vacuous.
    return /(structures|stands)\.js:\d+.*(structures|stands)\.js:\d+/.test(line) ||
      /nature\.js:\d+.*nature\.js:\d+/.test(line) && /along/.test(line) ||
      /crowdBand.*crowdBand/.test(line);
  });
  assert.deepEqual(severeTier, [], "severe tier-emitter self-pairs still in clip-audit --why:\n" + severeTier.join("\n"));
});
