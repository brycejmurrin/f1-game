// pick-unit-slices — path → six-slice node matrix (fail-safe → all).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
import {
  SLICES, NODE_SLICES, SLICE_COST_P50_SEC, SLICE_SCRIPTS, pick, costs, testFileOwners, ciOutputs,
} from "../../tools/ci/pick-unit-slices.mjs";

function runJson(...args) {
  return JSON.parse(
  execFileSync("node", ["tools/ci/pick-unit-slices.mjs", "--json", ...args],
    { encoding: "utf8" }));
}

test("SLICES / NODE_SLICES match the six-slice ci.yml matrix", () => {
  assert.deepEqual(SLICES, [
    "guards", "vm-a1", "vm-a2", "vm-b1", "vm-b2", "page-a", "page-b", "slow", "driving-model",
  ]);
  assert.deepEqual(NODE_SLICES, ["vm-a1", "vm-a2", "vm-b1", "vm-b2", "page-a", "page-b", "slow"]);
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.slices\) \}\}/);
});

test("a scenery-only circuit file skips the physics-heavy slices", () => {
  const r = pick(["js/circuits/scenery/monaco.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("guards"));
  assert.ok(sel.has("vm-a1"), "elevation twin shard 1");
  assert.ok(sel.has("vm-a2"), "elevation twin shard 2");
  assert.ok(!sel.has("vm-b1"));
  assert.ok(!sel.has("vm-b2"));
  assert.ok(!sel.has("page-a") && !sel.has("page-b"));
  assert.ok(!sel.has("slow"));
  const c = costs(r.slices);
  assert.ok(c.saved_sec > 0);
});

test("js/game.js keeps vm-b shards, page-a, page-b, slow and driving-model", () => {
  const r = pick(["js/game.js"]);
  const sel = new Set(r.slices.keys());
  assert.ok(sel.has("vm-b1"));
  assert.ok(sel.has("vm-b2"));
  assert.ok(sel.has("page-a") && sel.has("page-b"));
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

test("--costs exposes the per-slice planning estimates", () => {
  const out = execFileSync(process.execPath, ["tools/ci/pick-unit-slices.mjs", "--all", "--costs"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.match(out, /vm-b1\tselected\tp50=455s/);
  assert.match(out, /selected=\d+s all=\d+s saved=0s/);
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
  // Without --needed-only (a deploy push / the train) every NODE_SLICE is
  // listed so the Pages reuse check saw expanded rows (and, until
  // 2026-10-15, so the six then-required names reported); scenery needs
  // only vm-a1/vm-a2 (needed=true), the rest needed=false.
  const slicesLine = text.split("\n").find((l) => l.startsWith("slices="));
  assert.ok(slicesLine, "slices= line");
  const matrix = JSON.parse(slicesLine.slice("slices=".length));
  assert.deepEqual(matrix.map((x) => x.slice), NODE_SLICES);
  assert.deepEqual(
    Object.fromEntries(matrix.map((x) => [x.slice, x.needed])),
    {
      "vm-a1": "true", "vm-a2": "true",
      "vm-b1": "false", "vm-b2": "false",
      "page-a": "false", "page-b": "false", slow: "false",
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
  assert.ok(adapted.has("page-a") && adapted.has("page-b") && adapted.has("guards"), [...adapted].join(","));
  const plain = new Set(pick(["tests/specs/hud-mirror.spec.js"]).slices.keys());
  assert.deepEqual([...plain], ["guards"]);
});

test("L9: the SOURCE an ADAPTED spec asserts schedules the page slice (2026-10-09)", () => {
  // select-specs drops the browser copy as VM-covered; vm-page is the only
  // place it runs. Before this, a cota / pit-lane / space.js diff ran it nowhere.
  const slices = (f) => new Set(pick([f]).slices.keys());
  for (const f of ["js/circuits/cota.js", "js/circuits/imola.js", "js/circuits/albert_park.js",
    "js/circuits/scenery/cota.js", "js/race/pit-lane.js", "js/race/race-control.js", "js/track/core/space.js"])
    assert.ok(slices(f).has("page-a") && slices(f).has("page-b"), `${f} must schedule page: ${[...slices(f)].join(",")}`);
  // Circuits and scenery no ADAPTED spec reads keep the cheap plan.
  assert.ok(!slices("js/circuits/dijon.js").has("page-a") && !slices("js/circuits/dijon.js").has("page-b"));
  assert.ok(!slices("js/circuits/scenery/monaco.js").has("page-a") && !slices("js/circuits/scenery/monaco.js").has("page-b"));
});

test("15-F1: every other source an ADAPTED spec reads schedules the page slice (2026-10-10)", () => {
  // #1288 listed three files; node-plan said "vm-page planned" for these while
  // the page matrix row was needed:"false", so logging / projection / physics-fixes /
  // autopilot / agent-drive-bench / pit-lane ran nowhere on a PR touching only them.
  const slices = (f) => new Set(pick([f]).slices.keys());
  for (const f of ["js/core/log.js", "js/track/core/spline.js", "js/track/core/pit.js", "js/track/core/line.js",
    "js/physics/tyre-model.js", "js/physics/player-forces.js", "js/physics/consts.js", "js/agent/agentview.js"])
    assert.ok(slices(f).has("page-a") && slices(f).has("page-b"), `${f} must schedule page: ${[...slices(f)].join(",")}`);
  // An unrelated engine file keeps the cheap plan.
  assert.ok(!slices("js/track/core/mesh.js").has("page-a") && !slices("js/track/core/mesh.js").has("page-b"));
});

test("--needed-only (a pull request) lists only the needed rows; a deploy push keeps all six names", () => {
  const scenery = pick(["js/circuits/scenery/monaco.js"]);
  const draft = ciOutputs(scenery, { neededOnly: true });
  assert.deepEqual(draft.slices.map((r) => r.slice), ["vm-a1", "vm-a2"], "a scenery diff on a pull request runs the two elevation shards only");
  assert.ok(draft.slices.every((r) => r.needed === "true"));
  assert.equal(ciOutputs(scenery).slices.length, NODE_SLICES.length, "a deploy push / the train still emits every row (the reuse check wants expanded rows)");
  const docs = ciOutputs(pick(["docs/TESTING.md"]), { neededOnly: true });
  assert.deepEqual(docs.slices, [], "nothing needed → an empty matrix; ci.yml's node-suites `if:` skips the job on any_node=false");
  assert.equal(docs.any_node, "false");
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /NEEDED_ONLY: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    "ci.yml asks for needed rows only on every pull request (CI is the one required check since 2026-10-15)");
  assert.match(ci, /needs\.select\.outputs\.any_node == 'true' \|\| github\.event_name != 'pull_request'/,
    "node-suites skips at the job level only on a pull request with nothing needed");
});

test("SLICE_SCRIPTS mirrors ci.yml's case arms script for script (2026-10-15)", () => {
  // Until 2026-10-15 this table listed the ten riders under vm-b2 while ci.yml
  // ran them on vm-b1: a js/audio diff selected a runner that never ran
  // audio-unit, and nothing said so. Parse the step's `<slice>)` … `;;` arms
  // and compare the `npm run test:*` lines with the table, both ways.
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  const at = ci.indexOf("- name: Pure-node unit suites");
  assert.ok(at > 0, "the step exists");
  const step = ci.slice(at).split(/\n      - name: /)[0];
  const arms = {};
  const re = /^\s+(vm-a1|vm-a2|vm-b1|vm-b2|page-a|page-b|slow)\)\n([\s\S]*?)\n\s+;;/gm;
  for (const m of step.matchAll(re)) {
    arms[m[1]] = [...m[2].matchAll(/^\s+npm run (test:[\w-]+)\s*$/gm)].map((x) => x[1]).sort();
  }
  assert.deepEqual(Object.keys(arms).sort(), [...NODE_SLICES].sort(), "one case arm per node slice");
  for (const s of NODE_SLICES) assert.deepEqual(arms[s], [...SLICE_SCRIPTS[s]].sort(), `${s}: ci.yml arm vs SLICE_SCRIPTS`);
  // The ten former `fast`-slice riders ride the three LIGHT rows, never a game-vm-b half.
  for (const script of ["test:net-unit", "test:audio-unit", "test:state-unit", "test:desktop-unit",
    "test:garage-unit", "test:steering-unit", "test:mcp", "test:service-worker", "test:lifecycle-unit", "test:agent-contract"]) {
    const rows = NODE_SLICES.filter((s) => SLICE_SCRIPTS[s].includes(script));
    assert.equal(rows.length, 1, `${script} has one row: ${rows}`);
    assert.ok(["vm-a1", "vm-a2", "slow"].includes(rows[0]), `${script} rides a light row, not ${rows[0]}`);
  }
});

test("a rider's source path selects the row that runs the rider (2026-10-15)", () => {
  const slices = (f) => new Set(pick([f]).slices.keys());
  const owners = testFileOwners();
  // audio-unit rides vm-a1: a js/audio edit must spin vm-a1 and needs no game-vm-b half.
  assert.ok(slices("js/audio/announcer.js").has("vm-a1"));
  assert.ok(!slices("js/audio/announcer.js").has("vm-b1") && !slices("js/audio/announcer.js").has("vm-b2"));
  assert.ok(owners.get("tests/unit/net-roster.test.mjs")?.has("vm-a1"), "net-unit → vm-a1");
  assert.ok(owners.get("tests/unit/helmets.test.mjs")?.has("vm-a2"), "garage-unit → vm-a2");
  assert.ok(owners.get("tests/unit/key-binds.test.mjs")?.has("slow"), "steering-unit → slow");
  assert.ok(owners.get("tests/unit/service-worker.test.mjs")?.has("slow"), "service-worker → slow");
  // Rider rows with VM twins beside them keep both.
  const net = slices("js/net/handshake.js");
  assert.ok(net.has("vm-a1") && net.has("vm-b1") && net.has("vm-b2"), [...net].join(","));
  const input = slices("js/input/bindings.js");
  assert.ok(input.has("slow") && input.has("vm-b1"), [...input].join(","));
  const xr = slices("js/xr/xr-boot.js");
  assert.ok(xr.has("slow") && !xr.has("vm-b1"), [...xr].join(","));
});
