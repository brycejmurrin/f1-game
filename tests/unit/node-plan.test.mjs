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
import { plan, toShell, SCOPED, RUN_ALL_PATHS, ALWAYS_ON_TOPICAL, THINNED_VM, topicalTfOverlap, adaptedGroups, circuitsOf, scriptBuilds } from "../../tools/ci/node-plan.mjs";
import { filesFor } from "../../tools/ci/run-group.mjs";
import { TOOLING_FAST_FILES } from "../../tools/ci/tooling-fast.mjs";
import { gateNodeSuites } from "../../tools/ci/deploy.mjs";
import { ADAPTED, ADAPTED_RUNNER } from "../../tools/ci/twinned-specs.mjs";

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
  assert.ok(p.skip.includes("test:game-vm-b1") && p.skip.includes("test:game-vm-b2"));
  assert.deepEqual(p.circuits, []);
  const sh = toShell(p);
  assert.match(sh, /unset APEX_CIRCUITS/);
  assert.match(sh, /planned\(\) \{/);
  assert.equal(p.skipTf, true, "matched PR plans thin tooling-fast overlap on topical riders");
  assert.match(sh, /export NODE_PLAN_SKIP_TF=1/);
});

test("PR matched plans skip only tooling-fast ∩ always-on topical; --all and fail-safe do not", () => {
  const tf = new Set(TOOLING_FAST_FILES);
  const overlap = topicalTfOverlap();
  assert.ok(overlap.length >= 40, `expected ~49–55 double-run files, got ${overlap.length}`);
  for (const f of overlap) {
    assert.ok(tf.has(f), `${f} must be in tooling-fast (anti-vacuity)`);
    assert.ok(ALWAYS_ON_TOPICAL.some((s) => (groups[s]?.files || []).includes(f)),
      `${f} must belong to an always-on topical group`);
  }
  // A file not in tooling-fast is never in the skip set.
  for (const script of ALWAYS_ON_TOPICAL) {
    for (const f of groups[script]?.files || []) {
      if (!tf.has(f)) assert.ok(!overlap.includes(f), `${f} onlyHere must not be planner-skipped`);
    }
  }
  const matched = plan(["js/ui/hud.js"]);
  assert.equal(matched.skipTf, true);
  assert.deepEqual(matched.skipTfFiles, overlap);
  for (const script of ALWAYS_ON_TOPICAL) {
    const kept = filesFor(script, { skipTf: true });
    for (const f of kept) assert.ok(!tf.has(f), `${script} --skip-tf must not keep ${f}`);
    for (const f of groups[script].files) if (!tf.has(f)) assert.ok(kept.includes(f), `${script} must keep onlyHere ${f}`);
  }
  // Deploy / nightly / infra fail-safe: every file.
  const allPlan = plan([]);
  assert.equal(allPlan.skipTf, false);
  assert.deepEqual(allPlan.skipTfFiles, []);
  assert.match(toShell(allPlan), /unset NODE_PLAN_SKIP_TF/);
  assert.match(toShell(plan(["package.json"])), /unset NODE_PLAN_SKIP_TF/);
  for (const script of ALWAYS_ON_TOPICAL)
    assert.deepEqual(filesFor(script, { skipTf: false }), groups[script].files);
});

test("a circuit-only diff runs the elevation twin narrowed to that circuit", () => {
  const p = plan(["js/circuits/imola.js", "js/circuits/scenery/imola.js"]);
  assert.ok(p.run.includes("test:game-vm-a"));
  assert.deepEqual(p.circuits, ["imola"]);
  assert.match(toShell(p), /export APEX_CIRCUITS='imola'/);
});

test("a circuit-only diff skips the scripts whose files never build that circuit (read, not listed)", () => {
  // imola: raced by no game-vm-b twin (they sit on monza and a handful of
  // others), but it has a foundation spec, which foundation-core-vm (node-slow)
  // globs — so node-slow stays, the two vm-b halves go.
  const imola = plan(["js/circuits/imola.js"]);
  assert.deepEqual(imola.circuits, ["imola"]);
  assert.ok(imola.run.includes("test:game-vm-a") && imola.run.includes("test:node-slow"), JSON.stringify(imola));
  assert.ok(imola.skip.includes("test:game-vm-b1") && imola.skip.includes("test:game-vm-b2"), JSON.stringify(imola));
  assert.match(imola.why["test:game-vm-b1"], /no file builds imola/);
  // portimao: in the elevation roster only — vm-a alone, scoped.
  const portimao = plan(["js/circuits/portimao.js"]);
  assert.deepEqual(portimao.run, ["test:game-vm-a"], JSON.stringify(portimao));
  // monza: raced by nearly every twin — every VM script runs, scoped to monza.
  const monza = plan(["js/circuits/monza.js"]);
  for (const s of ["test:game-vm-a", "test:game-vm-b1", "test:game-vm-b2", "test:node-slow"]) assert.ok(monza.run.includes(s), s);
  assert.deepEqual(monza.circuits, ["monza"]);
  // circuitsOf: literals, helper imports one hop, the foundation glob, and null for a roster walk.
  assert.ok(circuitsOf("tests/unit/flyby-fleet.test.mjs").has("sochi"), "FLEET comes through the helper import");
  assert.ok(circuitsOf("tests/unit/foundation-core-vm.test.mjs").has("imola") && circuitsOf("tests/unit/foundation-core-vm.test.mjs").has("albert_park"));
  assert.equal(circuitsOf("tests/unit/prop-clipping.test.mjs"), null, "a fleet sweep walks the roster");
  assert.equal(circuitsOf("tests/unit/" + "nowhere-" + Date.now() + ".mjs"), null, "unreadable reads as everything");
  assert.equal(scriptBuilds("test:no-such-script", ["imola"]), true, "an unknown script runs");
});

test("a game.js diff runs every VM slice, unscoped", () => {
  const p = plan(["js/game.js"]);
  for (const s of ["test:game-vm-a", "test:game-vm-b1", "test:game-vm-b2", "test:node-slow"]) assert.ok(p.run.includes(s), s);
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
  // `$BASE`, resolved by tools/ci/ci-pr-base.sh — never the event's base.sha directly.
  assert.match(nodeJob, /node tools\/ci\/node-plan\.mjs --since "\$BASE" --sh > "\$PLAN"/);
  assert.doesNotMatch(nodeJob, /node-plan\.mjs --since "\$PR_BASE"/, "the event's base.sha lags one sync behind the test commit's base");
  assert.match(nodeJob, /node tools\/ci\/node-plan\.mjs --all --sh > "\$PLAN"/, "a non-PR event runs everything");
  assert.match(nodeJob, /\. "\$\{RUNNER_TEMP:-\.\}\/node-plan\.sh"/, "the suites step must source the plan");
  const step = nodeJob.slice(nodeJob.indexOf("- name: Pure-node unit suites"));
  for (const script of Object.keys(SCOPED)) {
    if (THINNED_VM.includes(script)) continue;   // the thinned form, pinned below
    const re = new RegExp(`if planned ${script.replace(/[-]/g, "\\-")}; then\\n\\s+npm run ${script}\\n\\s+fi`);
    assert.match(step, re, `${script} must be guarded by planned() and stay an npm run line`);
  }
  // SIX SLICES (2026-09-30): the elevation twin is sharded across two runners
  // (APEX_CIRCUIT_SHARD, tools/lib/circuit-scope.cjs), game-vm-b is two
  // groups.json partitions, vm-page and node-slow stand alone.
  // Matrix rows come from unit-plan / pick-unit-slices (path-gated runners),
  // not a static `slice:` list — same contract as ci-coverage + pick-unit-slices tests.
  assert.match(nodeJob, /include: \$\{\{ fromJSON\(needs\.unit-plan\.outputs\.slices\) \}\}/);
  for (const id of ["vm-a1", "vm-a2", "vm-b1", "vm-b2", "page", "slow"])
    assert.match(step, new RegExp(`${id}\\)`), `case arm for ${id}`);
  assert.match(step, /vm-a1\)\n(?:\s+#.*\n)*\s+export APEX_CIRCUIT_SHARD=1\/2\n\s+if planned test:game-vm-a; then/, "vm-a1 is the first half of the roster");
  assert.match(step, /vm-a2\)\n(?:\s+#.*\n)*\s+export APEX_CIRCUIT_SHARD=2\/2\n\s+if planned test:game-vm-a; then/, "vm-a2 is the second half");
  assert.equal((step.match(/npm run test:game-vm-a\n/g) || []).length, 2, "both halves run the one script");
  const b1 = groups["test:game-vm-b1"].files, b2 = groups["test:game-vm-b2"].files;
  assert.deepEqual([...b1, ...b2].sort(), [...groups["test:game-vm-b"].files].sort(), "b1 + b2 is exactly game-vm-b");
  assert.equal(new Set([...b1, ...b2]).size, b1.length + b2.length, "b1 and b2 are disjoint");
  // The seconds-long scripts are NOT guarded by planned(): a script skip there
  // buys nothing. On a matched PR they thin tooling-fast overlap via
  // run-group --skip-tf; the npm run else-branch stays for gateNodeSuites.
  for (const script of gateNodeSuites().filter((s) => !(s in SCOPED)))
    assert.doesNotMatch(step, new RegExp(`planned ${script}\\b`), `${script} must always run`);
  for (const script of ALWAYS_ON_TOPICAL) {
    const esc = script.replace(/[-]/g, "\\-");
    assert.match(step, new RegExp(
      `if \\[ -n "\\$\\{NODE_PLAN_SKIP_TF:-\\}" \\]; then node tools/ci/run-group\\.mjs ${esc} --skip-tf; else\\n\\s+npm run ${esc}\\n\\s+fi`),
      `${script} must thin TF on PR and keep npm run for the deploy gate`);
  }
  // The planned VM slices thin the same way, INSIDE planned(): the five VM
  // files tooling-fast already runs (Structural guards shares this job's `if:`)
  // are dropped on a matched plan, every onlyHere file stays (T5, 2026-10-05).
  const tf = new Set(TOOLING_FAST_FILES);
  for (const script of THINNED_VM) {
    const esc = script.replace(/[-]/g, "\\-");
    assert.match(step, new RegExp(
      `if planned ${esc}; then\\n\\s+if \\[ -n "\\$\\{NODE_PLAN_SKIP_TF:-\\}" \\]; then node tools/ci/run-group\\.mjs ${esc} --skip-tf; else\\n\\s+npm run ${esc}\\n\\s+fi\\n\\s+fi`),
      `${script} must thin TF on a matched plan and keep npm run for the deploy gate`);
    assert.ok(gateNodeSuites().includes(script), `${script} must still parse from the npm run else-branch`);
    const kept = filesFor(script, { skipTf: true });
    assert.ok(kept.length > 0, `${script} --skip-tf must leave its onlyHere files`);
    for (const f of groups[script].files) assert.equal(kept.includes(f), !tf.has(f), `${script}: ${f}`);
  }
  assert.ok(THINNED_VM.flatMap((s) => groups[s].files).some((f) => tf.has(f)),
    "anti-vacuity: at least one game-vm-b file is in tooling-fast, or THINNED_VM is dead weight");
  assert.ok(gateNodeSuites().filter((s) => ALWAYS_ON_TOPICAL.includes(s)).length === ALWAYS_ON_TOPICAL.length,
    "every always-on topical script must still parse from the npm run else-branch");
});

test("a spec edit: an ADAPTED spec runs vm-page; a twinned spec's group runs no VM script (2026-10-05)", () => {
  // select-specs counts an ADAPTED spec as VM-covered, so vm-page is the only
  // place its edit can run on a pull request; pick-tests' spec-owner route is
  // stripped here, so a plain browser-spec edit stays the rules' answer.
  const adapted = plan(["tests/specs/logging.spec.js"]);
  assert.equal(adapted.all, false);
  assert.deepEqual(adapted.run, ["test:vm-page"]);
  const twinned = plan(["tests/specs/collisions-deep.spec.js"]);
  assert.deepEqual(twinned.groups, ["audit"], "the owner route must not reach the VM planner");
  assert.deepEqual(twinned.run, []);
});

test("L9: a circuit an ADAPTED spec builds keeps test:vm-page in the plan (2026-10-09)", () => {
  // The runner names no circuit — it spawns one child per ADAPTED spec — so
  // circuitsOf() used to return an empty Set, scriptBuilds("test:vm-page",
  // ["cota"]) was false, and cota-foundation.spec.js (VM-covered, so dropped
  // from the browser gate) ran nowhere on a cota-only PR.
  const runner = circuitsOf(ADAPTED_RUNNER);
  for (const id of ["cota", "imola", "albert_park", "bahrain", "monza"]) assert.ok(runner.has(id), `${id} missing from the runner's circuits`);
  for (const spec of Object.keys(ADAPTED)) for (const id of circuitsOf(spec) || []) assert.ok(runner.has(id), `${spec} -> ${id}`);
  assert.equal(scriptBuilds("test:vm-page", ["cota"]), true);
  assert.equal(scriptBuilds("test:vm-page", ["dijon"]), false, "a circuit no ADAPTED spec builds still skips");
  const cota = plan(["js/circuits/cota.js"]);
  assert.ok(cota.run.includes("test:vm-page"), JSON.stringify(cota.skip));
  assert.ok(!plan(["js/circuits/dijon.js"]).run.includes("test:vm-page"));
});
