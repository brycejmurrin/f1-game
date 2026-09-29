// pick-unit-slices — prototype selector contract (NOT wired into ci.yml).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SLICES, pick, costs, testFileOwners, SLICE_COST_P50_SEC,
} from "../../tools/ci/pick-unit-slices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (...args) =>
  execFileSync("node", ["tools/ci/pick-unit-slices.mjs", "--json", ...args],
               { cwd: ROOT, encoding: "utf8" });
const json = (...args) => JSON.parse(run(...args));

test("SLICES matches the ci.yml node matrix + driving-model", () => {
  assert.deepEqual(SLICES, [
    "guards", "vm-a", "vm-b", "vm-page", "slow", "fast", "driving-model",
  ]);
});

test("a scenery-only circuit file skips the physics-heavy slices", () => {
  const r = pick(["js/circuits/scenery/monaco.js"]);
  const sel = new Set(r.slices.keys());
  assert.equal(r.reason, "matched");
  assert.ok(sel.has("guards"));
  assert.ok(sel.has("vm-a"), "elevation twin builds every circuit");
  assert.ok(!sel.has("vm-b"), "scenery must not pay for game-vm-b");
  assert.ok(!sel.has("slow"));
  assert.ok(!sel.has("fast"));
  assert.ok(!sel.has("driving-model"));
  assert.ok(!sel.has("vm-page"));
  const c = costs(r.slices);
  assert.ok(c.saved_min >= 12, `expected ≥12 min saved, got ${c.saved_min}`);
});

test("js/game.js keeps vm-b and driving-model", () => {
  const r = pick(["js/game.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("vm-b"));
  assert.ok(sel.has("driving-model"));
  assert.ok(sel.has("guards"));
});

test("an unknown path fail-safes to every slice", () => {
  const r = pick(["spike/never-heard-of-it.bin"]);
  assert.equal(r.reason, "fail-safe");
  assert.deepEqual([...r.slices.keys()].sort(), [...SLICES].sort());
});

test("editing a vm-b suite selects vm-b even on a scenery PR shape", () => {
  // Real case: run 36536539403 (suzuka scenery) also edited phone-pad-netplay-vm
  // and that is what failed — a scenery-only rule would have missed it without
  // test-file ownership.
  const r = pick([
    "js/circuits/scenery/suzuka.js",
    "tests/unit/phone-pad-netplay-vm.test.mjs",
  ]);
  assert.ok(r.slices.has("vm-b"), "owns phone-pad-netplay-vm → vm-b");
  assert.ok(r.slices.has("vm-a"), "scenery still needs elevation twin");
});

test("testFileOwners places elevation-tracks-vm in vm-a only", () => {
  const owners = testFileOwners();
  assert.ok(owners.get("tests/unit/elevation-tracks-vm.test.mjs")?.has("vm-a"));
  assert.ok(!owners.get("tests/unit/elevation-tracks-vm.test.mjs")?.has("vm-b"));
});

test("--json shape is stable for a future CI consumer", () => {
  const r = json("js/circuits/scenery/spa.js");
  assert.equal(typeof r.reason, "string");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.slices) && Array.isArray(r.skipped));
  for (const s of r.slices) {
    assert.equal(typeof s.slice, "string");
    assert.equal(typeof s.because, "string");
  }
  assert.ok(r.costs && typeof r.costs.saved_min === "number");
});

test("editing a tooling-fast-only unit file does not fail-safe to all slices", () => {
  const r = pick([
    "js/circuits/scenery/monaco.js",
    "tests/unit/scenery-api-contract.test.mjs",
    "tools/track/props-tris-baseline.json",
  ]);
  assert.equal(r.reason, "matched");
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("guards"));
  assert.ok(sel.has("vm-a"));
  assert.ok(!sel.has("vm-b"), "baseline JSON + tooling-fast suite must not pull vm-b");
  assert.ok(!sel.has("driving-model"));
});

test("a brand-new unit file selects guards only, not every slice", () => {
  // Build the probe path at runtime so docs-integrity's literal-path scanner
  // does not treat it as a stale comment reference to a missing file.
  const probe = ["tests", "unit", "_selector_probe_only_.test.mjs"].join("/");
  const r = pick([probe]);
  assert.deepEqual([...r.slices.keys()], ["guards"]);
});

test("SLICE_COST_P50_SEC covers every slice", () => {
  for (const s of SLICES) assert.ok(SLICE_COST_P50_SEC[s] > 0, s);
});
