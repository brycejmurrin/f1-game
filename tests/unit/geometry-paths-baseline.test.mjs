// geometry-paths-baseline.test.mjs — a baseline-only diff runs the sweep that reads it (ledger M36, 2026-10-09).
//
// tests/data/scenery-audit-baseline.json is the ratchet tests/unit/scenery-ground-audit.test.mjs
// (a test:sweeps suite) loads through tools/track/ground-audit.cjs. Neither the
// fleet pattern nor a TARGETED rule named it, so a PR that only moved a cap ran
// no sweep and the first run of the suite landed on an unrelated later diff.
//
// Run: node --test tests/unit/geometry-paths-baseline.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetedSuites, sweepOrder } from "../../tools/ci/geometry-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = "tests/data/scenery-audit-baseline.json";
const SUITE = "tests/unit/scenery-ground-audit.test.mjs";

test("the scenery audit baseline routes the targeted sweep that reads it", () => {
  assert.deepEqual(targetedSuites([BASELINE]), [SUITE]);
  assert.deepEqual(targetedSuites(["docs/PHYSICS.md", BASELINE]), [SUITE], "alongside other paths");
});

test("the routed suite is a real test:sweeps member and really reads the baseline", () => {
  assert.ok(sweepOrder().includes(SUITE), `${SUITE} must be in test:sweeps`);
  assert.ok(fs.existsSync(path.join(ROOT, BASELINE)));
  assert.match(fs.readFileSync(path.join(ROOT, "tools/track/ground-audit.cjs"), "utf8"), /scenery-audit-baseline\.json/);
});

test("an unrelated data file still routes no sweep", () => {
  assert.deepEqual(targetedSuites(["tests/data/ratchets.json", "tests/data/flaky-quarantine.json"]), []);
});
