#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// These tests intentionally consume fixture behavior:
// - smoke/audio: page-error collection and failure telemetry
// - track accuracy: __TEST_MODE plus failure telemetry for a full game load
// - UI audit: deterministic API defaults, augmented by scenario-specific mocks
// - the DRIVING SUITE (steering .. collisions-deep, plus touch-steer): these are
//   the specs whose assertions are bare numbers — "expected 43 to be greater than
//   50" — and a number on its own does not say what the car was doing. Importing
//   ./fixtures.js is what attaches apex-state / apex-logs / page-console when one
//   goes red, so a physics failure explains itself instead of being re-run by hand.
//   They are listed here so the habit is ENFORCED: the next driving spec written by
//   copying a neighbour inherits the fixtures, and one quietly reverted to the raw
//   @playwright/test import fails this audit.
export const FIXTURE_CONSUMERS = [
  "active-aero.spec.js",
  "aero-zones.spec.js",
  "audio-smoke.spec.js",
  "autopilot.spec.js",
  "collisions-deep.spec.js",
  "collisions.spec.js",
  "drift.spec.js",
  "elevation-tracks.spec.js",
  "f1-track-accuracy.spec.js",
  "gamepad.spec.js",
  "longitudinal.spec.js",
  "offtrack.spec.js",
  "physics-fixes.spec.js",
  "presets.spec.js",
  "projection.spec.js",
  "sliders.spec.js",
  "smoke.spec.js",
  "steering.spec.js",
  "touch-steer.spec.js",
  "ui-audit.spec.js",
  "world-physics.spec.js",
];

export function fixtureImportViolations(files, consumers = FIXTURE_CONSUMERS) {
  return consumers.filter((file) => {
    const source = files.get(file);
    return source == null || !/from\s+["']\.\/fixtures\.js["']/.test(source);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = new Map(FIXTURE_CONSUMERS.map((file) => [
    file,
    fs.readFileSync(path.join(ROOT, "tests", file), "utf8"),
  ]));
  const violations = fixtureImportViolations(files);
  if (violations.length) {
    console.error(`fixture consumers must import ./fixtures.js: ${violations.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${FIXTURE_CONSUMERS.length} intended fixture consumers use shared fixtures`);
  }
}
