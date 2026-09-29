// pick-unit-slices — path → packed node matrix slices (fail-safe → all).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SLICES, NODE_SLICES, pick, pickAll, costs, ciOutputs, testFileOwners,
  SLICE_COST_P50_SEC,
} from "../../tools/ci/pick-unit-slices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (...args) =>
  execFileSync("node", ["tools/ci/pick-unit-slices.mjs", "--json", ...args],
               { cwd: ROOT, encoding: "utf8" });
const json = (...args) => JSON.parse(run(...args));

test("SLICES matches the packed ci.yml node matrix + driving-model", () => {
  assert.deepEqual(SLICES, [
    "guards", "vm-a", "vm-b", "page-slow", "driving-model",
  ]);
  assert.deepEqual(NODE_SLICES, ["vm-a", "vm-b", "page-slow"]);
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /include: \$\{\{ fromJSON\(needs\.unit-plan\.outputs\.slices\) \}\}/);
  for (const s of NODE_SLICES) {
    assert.match(ci, new RegExp(`${s}\\)\\s*$`, "m"), `case arm for ${s}`);
  }
});

test("a scenery-only circuit file skips the physics-heavy slices", () => {
  const r = pick(["js/circuits/scenery/monaco.js"]);
  const sel = new Set(r.slices.keys());
  assert.equal(r.reason, "matched");
  assert.ok(sel.has("guards"));
  assert.ok(sel.has("vm-a"), "elevation twin builds every circuit");
  assert.ok(!sel.has("vm-b"), "scenery must not pay for game-vm-b + fast");
  assert.ok(!sel.has("page-slow"));
  assert.ok(!sel.has("driving-model"));
  const c = costs(r.slices);
  assert.ok(c.saved_min >= 10, `expected ≥10 min saved on packed matrix, got ${c.saved_min}`);
});

test("js/game.js keeps vm-b, page-slow and driving-model", () => {
  const r = pick(["js/game.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("vm-b"));
  assert.ok(sel.has("page-slow"));
  assert.ok(sel.has("driving-model"));
  assert.ok(sel.has("guards"));
});

test("an unknown path fail-safes to every slice", () => {
  const r = pick(["spike/never-heard-of-it.bin"]);
  assert.equal(r.reason, "fail-safe");
  assert.deepEqual([...r.slices.keys()].sort(), [...SLICES].sort());
});

test("REPLAY: scenery + phone-pad-netplay-vm keeps the historically failing vm-b slice", () => {
  // Real case: run 36536539403 (suzuka scenery) also edited phone-pad-netplay-vm
  // and that is what failed — a scenery-only rule would have missed it without
  // test-file ownership. Must not skip the slice that owns the failing file.
  const r = pick([
    "js/circuits/scenery/suzuka.js",
    "tests/unit/phone-pad-netplay-vm.test.mjs",
  ]);
  assert.ok(r.slices.has("vm-b"), "owns phone-pad-netplay-vm → vm-b (must not skip)");
  assert.ok(r.slices.has("vm-a"), "scenery still needs elevation twin");
  const out = ciOutputs(r);
  assert.equal(out.any_node, "true");
  assert.ok(out.slices.some((row) => row.slice === "vm-b"));
});

test("testFileOwners places elevation-tracks-vm in vm-a only", () => {
  const owners = testFileOwners();
  assert.ok(owners.get("tests/unit/elevation-tracks-vm.test.mjs")?.has("vm-a"));
  assert.ok(!owners.get("tests/unit/elevation-tracks-vm.test.mjs")?.has("vm-b"));
});

test("--json shape is stable for the CI consumer", () => {
  const r = json("js/circuits/scenery/spa.js");
  assert.equal(typeof r.reason, "string");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.slices) && Array.isArray(r.skipped));
  assert.equal(r.any_node, "true");
  assert.equal(r.driving, "false");
  assert.ok(Array.isArray(r.matrix));
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
  const probe = ["tests", "unit", "_selector_probe_only_.test.mjs"].join("/");
  const r = pick([probe]);
  assert.deepEqual([...r.slices.keys()], ["guards"]);
  assert.equal(ciOutputs(r).any_node, "false");
});

test("SLICE_COST_P50_SEC covers every slice", () => {
  for (const s of SLICES) assert.ok(SLICE_COST_P50_SEC[s] > 0, s);
});

test("--all selects every slice for schedule/dispatch", () => {
  const r = pickAll();
  assert.equal(r.reason, "all");
  assert.deepEqual([...r.slices.keys()].sort(), [...SLICES].sort());
  const out = ciOutputs(r);
  assert.equal(out.any_node, "true");
  assert.equal(out.driving, "true");
  assert.deepEqual(out.slices.map((x) => x.slice), NODE_SLICES);
});

test("--github-output writes any_node / driving / slices", () => {
  const text = execFileSync("node", [
    "tools/ci/pick-unit-slices.mjs", "--github-output",
    "js/circuits/scenery/monaco.js",
  ], { cwd: ROOT, encoding: "utf8" });
  assert.match(text, /^any_node=true$/m);
  assert.match(text, /^driving=false$/m);
  assert.match(text, /^slices=\[\{"slice":"vm-a"\}\]$/m);
});
