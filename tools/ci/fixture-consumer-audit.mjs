#!/usr/bin/env node
// fixture-consumer-audit — how many specs actually use tests/helpers/fixtures.js.
// @doc RATCHET on `tests/helpers/fixtures.js` adoption: `FLOOR` only rises, and fails when it lags adoption by > `FLOOR_SLACK`.
// @section runner
//
// This tool used to hold a hardcoded four-name allow-list and print
// "✓ 4 intended fixture consumers use shared fixtures", which is true and says
// nothing: it measured a list, not a policy. Meanwhile AGENTS.md and
// docs/TESTING.md both tell you to import from ./fixtures.js "unless you have a
// reason not to", and the majority of specs did not — so the convention was
// documented, believed, and unenforced.
//
// It is now a RATCHET. It counts real adoption and fails if that count drops.
// A ratchet rather than a hard rule because plenty of specs legitimately do not
// want the fixture (pure-DOM tests, tests that need a raw context), and a rule
// that would have to exempt half the suite is a rule nobody can read. What must
// not happen is adoption going BACKWARDS while the docs keep claiming it.
//
// Raise FLOOR whenever you migrate specs. Never lower it to make a run green —
// lowering it is the bug this file exists to catch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

// Ratchet: specs importing tests/helpers/fixtures.js must not fall below this.
// 61 -> 67: image-grade-visual, lighting-ab and lighting-tuner-grade now import
// the shared BOOT_MS / TRACK_MS budgets from tests/helpers/fixtures.js rather
// than each carrying its own 8000/15000/20000 ms guess. That is the adoption
// this ratchet is asking for, so the floor follows it up.
export const FLOOR = 110;   // 2026-09-01: every spec with a boot wait imports BOOT_MS from fixtures (was 67)

// The other failure mode: migrate a batch of specs, never raise the floor, and
// the ratchet silently stops ratcheting (it sat at 31 while real adoption was
// 54). A floor more than this far below the measured count has lost its grip.
export const FLOOR_SLACK = 5;

// These four are load-bearing consumers — they rely on the fixture's mocks and
// failure telemetry, not merely on `test`/`expect`. Each must keep importing it.
export const FIXTURE_CONSUMERS = [
  "audio-smoke.spec.js",
  "f1-track-accuracy.spec.js",
  "smoke.spec.js",
  "ui-audit.spec.js",
];

const IMPORTS_FIXTURES = /from\s+["']\.\.\/helpers\/fixtures\.js["']/;

export function fixtureImportViolations(files, consumers = FIXTURE_CONSUMERS) {
  return consumers.filter((file) => {
    const source = files.get(file);
    return source == null || !IMPORTS_FIXTURES.test(source);
  });
}

export function adoption(specSources) {
  let uses = 0;
  for (const src of specSources.values()) if (IMPORTS_FIXTURES.test(src)) uses++;
  return { uses, total: specSources.size };
}

export function readSpecs(dir = path.join(ROOT, "tests", "specs")) {
  return new Map(fs.readdirSync(dir)
    .filter((f) => f.endsWith(".spec.js"))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const specs = readSpecs();
  const violations = fixtureImportViolations(specs);
  const { uses, total } = adoption(specs);
  if (violations.length) {
    console.error(`fixture consumers must import ../helpers/fixtures.js: ${violations.join(", ")}`);
    process.exitCode = 1;
  }
  if (uses < FLOOR) {
    console.error(`fixture adoption fell to ${uses}/${total}; the ratchet floor is ${FLOOR}. ` +
                  `Migrating a spec OFF the shared fixture also drops its failure attachments.`);
    process.exitCode = 1;
  }
  if (uses - FLOOR > FLOOR_SLACK) {
    console.error(`fixture adoption is ${uses} but the floor is ${FLOOR} — raise FLOOR so the ` +
                  `ratchet keeps working (it allows ${FLOOR_SLACK} of slack, no more).`);
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    console.log(`✓ ${uses}/${total} specs use tests/helpers/fixtures.js (floor ${FLOOR}); ` +
                `${FIXTURE_CONSUMERS.length} load-bearing consumers intact`);
  }
}
