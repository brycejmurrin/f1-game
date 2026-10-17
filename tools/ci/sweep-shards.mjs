#!/usr/bin/env node
/** @doc Deterministic measured-time packing for the geometry sweep CI matrix.
 *
 * Assign geometry sweep files to balanced CI shards.
 *
 * The old planner split package.json's test:sweeps list by count.  That put
 * several 90–190 second fleet checks on the same shard while other shards
 * finished almost immediately.  This planner uses bounded, measured file
 * weights and deterministic LPT packing.  Unknown files get a conservative
 * fallback so adding a suite cannot silently make one shard enormous.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SWEEP_TIMINGS_SEC = Object.freeze({
  "tests/unit/baked-model-road-guard.test.mjs": 8.121,
  "tests/unit/build-steps.test.mjs": 25.081,
  "tests/unit/build-worker.test.mjs": 27.821,
  "tests/unit/car-front-wing-width.test.mjs": 21.204,
  "tests/unit/coplanar-faces.test.mjs": 162.380,
  "tests/unit/debris-hazard-hint.test.mjs": 13.798,
  "tests/unit/driving-line-opts.test.mjs": 0.184,
  "tests/unit/driving-line.test.mjs": 0.193,
  "tests/unit/grid-boxes.test.mjs": 30.667,
  "tests/unit/kerb-berm-surface.test.mjs": 8.508,
  "tests/unit/kerb-stripes.test.mjs": 4.785,
  "tests/unit/lamp-fixture-anchor.test.mjs": 70.026,
  "tests/unit/pit-complex.test.mjs": 104.110,
  "tests/unit/pit-signs.test.mjs": 97.555,
  "tests/unit/prop-clipping.test.mjs": 98.592,
  "tests/unit/props-over-road.test.mjs": 94.157,
  "tests/unit/props-tri-ratchet.test.mjs": 94.673,
  "tests/unit/road-under-floor.test.mjs": 86.528,
  "tests/unit/scenery-ground-audit.test.mjs": 190.124,
  "tests/unit/scenery-grounding.test.mjs": 107.780,
  "tests/unit/shared-track-foundation-characterization.test.cjs": 88.373,
  "tests/unit/spline-project-height.test.mjs": 2.548,
  "tests/unit/track-build-vm-release.test.mjs": 11.735,
  "tests/unit/track-themes-build.test.mjs": 164.288,
  "tests/unit/track-validate-fleet.test.mjs": 14.123,
});

// Median of the measured suite totals. New suites are intentionally charged
// at this cost until the timing branch has a sample for them.
export const UNKNOWN_SWEEP_SEC = 27.821;

export function planSweepShards(files, { shards = 4, timings = SWEEP_TIMINGS_SEC } = {}) {
  if (!Number.isInteger(shards) || shards < 1) throw new Error(`invalid shard count: ${shards}`);
  const names = [...files].map(String);
  if (!names.length) throw new Error("test:sweeps names ZERO suites");
  if (new Set(names).size !== names.length) throw new Error("test:sweeps contains duplicate suites");
  const bins = Array.from({ length: shards }, () => ({ seconds: 0, files: [] }));
  const weighted = names.map((file, index) => ({ file, index, seconds: Number(timings[file]) || UNKNOWN_SWEEP_SEC }));
  weighted.sort((a, b) => b.seconds - a.seconds || a.index - b.index);
  for (const item of weighted) {
    const bin = bins.reduce((best, candidate) => candidate.seconds < best.seconds ? candidate : best);
    bin.files.push(item.file);
    bin.seconds += item.seconds;
  }
  return bins.map((bin) => ({
    seconds: Math.round(bin.seconds * 1000) / 1000,
    files: bin.files.sort((a, b) => names.indexOf(a) - names.indexOf(b)),
  }));
}

export function sweepFilesFromPackage(pkgPath = "package.json") {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const script = String(pkg.scripts?.["test:sweeps"] || "");
  return script.match(/tests\/unit\/[^\s]+/g) || [];
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const valueAfter = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] || fallback) : fallback;
  };
  const shard = Number(valueAfter("--shard", 0));
  const shards = Number(valueAfter("--shards", 4));
  const files = sweepFilesFromPackage(valueAfter("--package", "package.json"));
  const plan = planSweepShards(files, { shards });
  if (!Number.isInteger(shard) || shard < 1 || shard > plan.length) {
    console.error(`--shard must be between 1 and ${plan.length}`);
    process.exit(2);
  }
  const chosen = plan[shard - 1];
  if (args.includes("--json")) console.log(JSON.stringify({ shard, shards, ...chosen }));
  else {
    console.log(`--- suite shard ${shard}of${shards}: ${chosen.files.length}/${files.length} suites (~${chosen.seconds}s) ---`);
    for (const file of chosen.files) console.log(file);
    console.log("--------------------");
  }
}
