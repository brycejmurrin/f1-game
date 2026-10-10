// pick-unit-slices — path → six-slice node matrix (fail-safe → all).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SLICES, NODE_SLICES, SLICE_COST_P50_SEC, pick, costs, testFileOwners,
} from "../../tools/ci/pick-unit-slices.mjs";

function runJson(...args) {
  return JSON.parse(
  execFileSync("node", ["tools/ci/pick-unit-slices.mjs", "--json", ...args],
    { encoding: "utf8" }));
}

test("SLICES / NODE_SLICES match the six-slice ci.yml matrix", () => {
  assert.deepEqual(SLICES, [
    "guards", "vm-a1", "vm-a2", "vm-b1", "vm-b2", "page", "slow", "driving-model",
  ]);
  assert.deepEqual(NODE_SLICES, ["vm-a1", "vm-a2", "vm-b1", "vm-b2", "page", "slow"]);
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /include: \$\{\{ fromJSON\(needs\.unit-plan\.outputs\.slices\) \}\}/);
});

test("a scenery-only circuit file skips the physics-heavy slices", () => {
  const r = pick(["js/circuits/scenery/monaco.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("guards"));
  assert.ok(sel.has("vm-a1"), "elevation twin shard 1");
  assert.ok(sel.has("vm-a2"), "elevation twin shard 2");
  assert.ok(!sel.has("vm-b1"));
  assert.ok(!sel.has("vm-b2"));
  assert.ok(!sel.has("page"));
  assert.ok(!sel.has("slow"));
  const c = costs(r.slices);
  assert.ok(c.saved_sec > 0);
});

test("js/game.js keeps vm-b shards, page, slow and driving-model", () => {
  const r = pick(["js/game.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("vm-b1"));
  assert.ok(sel.has("vm-b2"));
  assert.ok(sel.has("page"));
  assert.ok(sel.has("slow"));
  assert.ok(sel.has("driving-model"));
});

test("an unknown path fail-safes to every slice", () => {
  const r = pick(["totally/unknown/path.xyz"]);
  assert.equal(r.reason, "fail-safe");
  assert.deepEqual([...r.slices.keys()].sort(), [...SLICES].sort());
});

test("REPLAY: scenery + phone-pad-netplay-vm keeps the historically failing vm-b2 slice", () => {
  // 2026-09-29: scenery-only plan skipped packed vm-b, then a later push edited a
  // test-file ownership. Must not skip the slice that owns the failing file.
  const r = pick([
    "js/circuits/scenery/monaco.js",
    "tests/unit/phone-pad-netplay-vm.test.mjs",
  ]);
  assert.ok(r.slices.has("vm-b2"), "owns phone-pad-netplay-vm → vm-b2 (must not skip)");
  assert.ok(r.slices.has("vm-a1"), "scenery still needs elevation twin");
  assert.ok(r.slices.has("vm-a2"));
  const out = runJson(
    "js/circuits/scenery/monaco.js",
    "tests/unit/phone-pad-netplay-vm.test.mjs",
  );
  assert.ok(out.slices.some((row) => row.slice === "vm-b2"));
});

test("testFileOwners places elevation-tracks-vm in both vm-a shards", () => {
  const owners = testFileOwners();
  const set = owners.get("tests/unit/elevation-tracks-vm.test.mjs");
  assert.ok(set?.has("vm-a1"));
  assert.ok(set?.has("vm-a2"));
});

test("--json shape is stable for the CI consumer", () => {
  const r = runJson("js/circuits/scenery/monaco.js");
  assert.ok(Array.isArray(r.files) && Array.isArray(r.slices) && Array.isArray(r.skipped));
  assert.equal(typeof r.any_node, "string");
  assert.equal(typeof r.driving, "string");
  for (const s of r.slices) {
    assert.equal(typeof s.slice, "string");
    assert.equal(typeof s.because, "string");
  }
});

test("editing a tooling-fast-only unit file does not fail-safe to all slices", () => {
  // pick a file known to be tooling-fast-only if present; otherwise skip-ish assert
  const r = pick(["tests/unit/ci-verdict.test.mjs"]);
  // ci-verdict is typically tooling-fast / guards — not every node slice
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("guards"));
  assert.ok(sel.size < SLICES.length, "must not fail-safe to all");
});

test("a brand-new unit file selects guards only, not every slice", () => {
  // Build the path at runtime so docs-integrity does not treat it as a
  // dangling source comment pointing at a missing file.
  const ghost = ["tests", "unit", "ghost-unlisted-" + "pickonly.test.mjs"].join("/");
  const r = pick([ghost]);
  assert.deepEqual([...r.slices.keys()], ["guards"]);
});

test("SLICE_COST_P50_SEC covers every slice", () => {
  for (const s of SLICES) assert.ok(SLICE_COST_P50_SEC[s] > 0, s);
});

test("--all selects every slice for schedule/dispatch", () => {
  const r = pick([]); // empty via --all path in CLI
  const out = runJson("--all");
  assert.deepEqual(out.matrix.map((x) => x.slice), NODE_SLICES);
  assert.equal(out.any_node, "true");
});

test("--github-output writes any_node / driving / slices", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pick-unit-"));
  const ghOut = path.join(dir, "github_output");
  fs.writeFileSync(ghOut, "");
  execFileSync(
    "node",
    [
      "tools/ci/pick-unit-slices.mjs", "--github-output",
      "js/circuits/scenery/monaco.js",
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: ghOut } },
  );
  const text = fs.readFileSync(ghOut, "utf8");
  assert.match(text, /^any_node=true$/m);
  assert.match(text, /^driving=false$/m);
  // Every NODE_SLICE is listed so branch-protection check names always report;
  // scenery needs only vm-a1/vm-a2 (needed=true), the rest needed=false.
  const slicesLine = text.split("\n").find((l) => l.startsWith("slices="));
  assert.ok(slicesLine, "slices= line");
  const matrix = JSON.parse(slicesLine.slice("slices=".length));
  assert.deepEqual(matrix.map((x) => x.slice), NODE_SLICES);
  assert.deepEqual(
    Object.fromEntries(matrix.map((x) => [x.slice, x.needed])),
    {
      "vm-a1": "true", "vm-a2": "true",
      "vm-b1": "false", "vm-b2": "false",
      page: "false", slow: "false",
    },
  );

  // Unset-env path: stdout carries the same lines.
  const local = execFileSync(
    "node",
    [
    "tools/ci/pick-unit-slices.mjs", "--github-output",
    "js/circuits/scenery/monaco.js",
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "" } },
  );
  const localSlices = local.split("\n").find((l) => l.startsWith("slices="));
  assert.ok(localSlices);
  assert.deepEqual(
    JSON.parse(localSlices.slice("slices=".length)).map((x) => x.slice),
    NODE_SLICES,
  );
});

test("an ADAPTED spec edit schedules the page slice; a plain spec edit does not (2026-10-05)", () => {
  // vm-page runs the ADAPTED specs as themselves and select-specs counts them
  // VM-covered, so without `page` an edit to one ran nowhere on the PR.
  const adapted = new Set(pick(["tests/specs/logging.spec.js"]).slices.keys());
  assert.ok(adapted.has("page") && adapted.has("guards"), [...adapted].join(","));
  const plain = new Set(pick(["tests/specs/hud-mirror.spec.js"]).slices.keys());
  assert.deepEqual([...plain], ["guards"]);
});

test("L9: the SOURCE an ADAPTED spec asserts schedules the page slice (2026-10-09)", () => {
  // select-specs drops the browser copy as VM-covered; vm-page is the only
  // place it runs. Before this, a cota / pit-lane / space.js diff ran it nowhere.
  const slices = (f) => new Set(pick([f]).slices.keys());
  for (const f of ["js/circuits/cota.js", "js/circuits/imola.js", "js/circuits/albert_park.js",
    "js/circuits/scenery/cota.js", "js/race/pit-lane.js", "js/race/race-control.js", "js/track/core/space.js"])
    assert.ok(slices(f).has("page"), `${f} must schedule page: ${[...slices(f)].join(",")}`);
  // Circuits and scenery no ADAPTED spec reads keep the cheap plan.
  assert.ok(!slices("js/circuits/dijon.js").has("page"));
  assert.ok(!slices("js/circuits/scenery/monaco.js").has("page"));
});

test("15-F1: every other source an ADAPTED spec reads schedules the page slice (2026-10-10)", () => {
  // #1288 listed three files; node-plan said "vm-page planned" for these while
  // the page matrix row was needed:"false", so logging / projection / physics-fixes /
  // autopilot / agent-drive-bench / pit-lane ran nowhere on a PR touching only them.
  const slices = (f) => new Set(pick([f]).slices.keys());
  for (const f of ["js/core/log.js", "js/track/core/spline.js", "js/track/core/pit.js", "js/track/core/line.js",
    "js/physics/tyre-model.js", "js/physics/player-forces.js", "js/physics/consts.js", "js/agent/agentview.js"])
    assert.ok(slices(f).has("page"), `${f} must schedule page: ${[...slices(f)].join(",")}`);
  // An unrelated engine file keeps the cheap plan.
  assert.ok(!slices("js/track/core/mesh.js").has("page"));
});
