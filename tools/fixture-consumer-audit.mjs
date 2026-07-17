#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// These tests intentionally consume fixture behavior:
// - smoke/audio: page-error collection and failure telemetry
// - track accuracy: __TEST_MODE plus failure telemetry for a full game load
// - UI audit: deterministic API defaults, augmented by scenario-specific mocks
export const FIXTURE_CONSUMERS = [
  "audio-smoke.spec.js",
  "f1-track-accuracy.spec.js",
  "smoke.spec.js",
  "ui-audit.spec.js",
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
