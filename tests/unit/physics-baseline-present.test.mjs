// physics-baseline-present — the deploy gate's driving-model job runs
// tests/specs/physics-characterization.spec.js, which SKIPS (green) when
// tests/data/physics-baseline.json is absent. A skipped gate is the "absence
// reads as clean" class docs/PERF-FINDINGS.md 2j names; this pins the file
// and its shape in the always-on suite so the skip path cannot pass silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = path.join(ROOT, "tests/data/physics-baseline.json");

test("the physics characterization baseline exists and is a non-empty object", () => {
  assert.ok(fs.existsSync(FILE), "tests/data/physics-baseline.json is missing — physics-characterization.spec.js would skip and the driving-model gate would pass on nothing");
  const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
  assert.equal(typeof j, "object");
  assert.ok(Object.keys(j).length > 0, "baseline has no keys");
});

test("the browser spec really does skip on a missing baseline (so this guard is load-bearing)", () => {
  const spec = fs.readFileSync(path.join(ROOT, "tests/specs/physics-characterization.spec.js"), "utf8");
  assert.match(spec, /physics-baseline\.json/);
  assert.match(spec, /skip/i, "if the spec no longer skips, retire this guard");
});
