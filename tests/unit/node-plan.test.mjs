// node-plan.test.mjs — the per-PR plan for ci.yml's node-suites job.
//
// The plan decides, on a pull request only, which multi-minute node scripts
// run. Two things must never regress: a diff the planner cannot route RUNS
// EVERYTHING (fail safe), and every script it may skip is still an
// `npm run test:<x>` line in the "Pure-node unit suites" step (deploy.mjs and
// twinned-specs.mjs derive the gate from that text, so a script wrapped out of
// that form would silently leave the derived gate).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plan, toShell, SCOPED, RUN_ALL_PATHS, adaptedGroups } from "../../tools/ci/node-plan.mjs";
import { gateNodeSuites } from "../../tools/ci/deploy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8")).groups;
const nodeJob = ci.slice(ci.indexOf("\n  node-suites:\n"), ci.indexOf("\n  sweeps-parts:\n"));

test("every scoped script is a gate script, and every group it names exists", () => {
  const gate = gateNodeSuites();
  for (const [script, needs] of Object.entries(SCOPED)) {
    assert.ok(gate.includes(script), `${script} is not in ci.yml's Pure-node unit suites step`);
    for (const g of needs || []) assert.ok(groups[`test:${g}`], `${script} names group test:${g}, which tests/groups.json lacks`);
  }
  for (const g of adaptedGroups()) assert.equal(groups[`test:${g}`]?.kind, "browser", `adapted group test:${g}`);
  assert.ok(adaptedGroups().length >= 1, "the ADAPTED specs must resolve to at least one browser group");
});

test("a UI-only diff skips the VM slices; the fast scripts are never in the plan's hands", () => {
  const p = plan(["js/ui/hud.js", "css/hud.css"]);
  assert.equal(p.all, false);
  assert.ok(p.skip.includes("test:game-vm-a"), "a HUD edit must not rebuild 40 circuits");
  assert.ok(p.skip.includes("test:game-vm-b"));
  assert.deepEqual(p.circuits, []);
  const sh = toShell(p);
  assert.match(sh, /unset APEX_CIRCUITS/);
  assert.match(sh, /planned\(\) \{/);
});

test("a circuit-only diff runs the elevation twin narrowed to that circuit", () => {
  const p = plan(["js/circuits/imola.js", "js/circuits/scenery/imola.js"]);
  assert.ok(p.run.includes("test:game-vm-a"));
  assert.deepEqual(p.circuits, ["imola"]);
  assert.match(toShell(p), /export APEX_CIRCUITS='imola'/);
});

test("a game.js diff runs every VM slice, unscoped", () => {
  const p = plan(["js/game.js"]);
  for (const s of ["test:game-vm-a", "test:game-vm-b", "test:node-slow"]) assert.ok(p.run.includes(s), s);
  assert.deepEqual(p.circuits, [], "game.js is not a circuit file: the whole fleet");
});

test("fail safe: no diff, an infra path, a unit file, a harness, or an unrouted path runs everything", () => {
  for (const changed of [[], ["package.json"], ["tests/unit/game-vm.test.mjs"], ["tools/lib/game-vm.cjs"],
                         ["tests/data/physics-baseline.json"], ["some/unknown/file.txt"], [".github/workflows/ci.yml"]]) {
    const p = plan(changed);
    assert.equal(p.all, true, `${JSON.stringify(changed)} must run everything (${p.reason})`);
    assert.deepEqual(p.skip, []);
    assert.deepEqual([...p.run].sort(), Object.keys(SCOPED).sort());
  }
  for (const re of RUN_ALL_PATHS) assert.ok(re instanceof RegExp);
});

test("ci.yml: the node-suites job plans on a pull request and guards exactly the scoped scripts", () => {
  assert.match(nodeJob, /fetch-depth: 0/, "the plan diffs against the PR base; a depth-1 clone cannot");
  assert.match(nodeJob, /- name: Plan the slices for this diff/);
  assert.match(nodeJob, /node tools\/ci\/node-plan\.mjs --since "\$PR_BASE" --sh > "\$PLAN"/);
  assert.match(nodeJob, /node tools\/ci\/node-plan\.mjs --all --sh > "\$PLAN"/, "a non-PR event runs everything");
  assert.match(nodeJob, /\. "\$\{RUNNER_TEMP:-\.\}\/node-plan\.sh"/, "the suites step must source the plan");
  const step = nodeJob.slice(nodeJob.indexOf("- name: Pure-node unit suites"));
  for (const script of Object.keys(SCOPED)) {
    const re = new RegExp(`if planned ${script.replace(/[-]/g, "\\-")}; then\\n\\s+npm run ${script}\\n\\s+fi`);
    assert.match(step, re, `${script} must be guarded by planned() and stay an npm run line`);
  }
  // The seconds-long scripts are NOT guarded: a skip there buys nothing.
  for (const script of gateNodeSuites().filter((s) => !(s in SCOPED)))
    assert.doesNotMatch(step, new RegExp(`planned ${script}\\b`), `${script} must always run`);
});
