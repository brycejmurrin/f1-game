// ci-coverage — the fixed-spec census and dynamic-gate contract both need guards.
//
// Nothing consumes this report automatically. A broken parse could claim zero
// fixed specs or a non-blocking/push-only selector and still look plausible.
// These tests pin the mechanism and event/base semantics, never the count.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { parse as parseYAML } from "yaml";
import { report, ALL_SPECS, expand, groupSpecs } from "../../tools/ci/ci-coverage.mjs";
// DERIVED, never re-typed. This file was the FIFTH place the selected gate's
// per-test timeout appeared as a literal, and raising it 120 -> 180 s reddened
// exactly here — the guard asserted the old number against a workflow that had
// moved on, which is the drift it exists to catch pointing the wrong way. The
// selector owns the value; this file checks ci.yml agrees with the selector.
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";
import { selectedGateVerdict } from "../../tools/ci/selected-gate-verdict.mjs";

const SELECTED_TIMEOUT_MS = SELECTED_GATE.perTestTimeoutSec * 1000;

const ciWorkflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const pagesWorkflow = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");

// soft-present-bench.mjs archived 2026-09-10 → docs/archive/tools/gfx/
// (closed perf note; gfx-probe is the live soft-present path).

test("it sees the specs on disk", () => {
  assert.ok(ALL_SPECS.length > 50, `only ${ALL_SPECS.length} specs found — the scan is broken`);
  assert.ok(ALL_SPECS.every((s) => s.startsWith("tests/") && s.endsWith(".spec.js")));
});

test("a single-star glob expands the way package.json means it", () => {
  // test:car is written with tests/specs/parts-*.spec.js — if this stopped expanding,
  // every group defined by a glob would silently contribute zero.
  const hits = expand("tests/specs/parts-*.spec.js");
  assert.ok(hits.length >= 5, `parts-*.spec.js expanded to ${hits.length}`);
  assert.ok(hits.includes("tests/specs/parts-physics.spec.js"));
  assert.ok(!hits.includes("tests/specs/smoke.spec.js"));
});

test("a literal path resolves, and a bogus one does not", () => {
  assert.deepEqual(expand("tests/specs/smoke.spec.js"), ["tests/specs/smoke.spec.js"]);
  assert.deepEqual(expand("tests/specs/there-is-no-such.spec.js"), []);
  assert.deepEqual(expand("js/game.js"), []);
});

test("group scripts resolve to their spec lists", () => {
  assert.deepEqual(groupSpecs("test:smoke"), ["tests/specs/smoke.spec.js"]);
  assert.equal(groupSpecs("test:there-is-no-such-group"), null);
});

test("the ci.yml parse finds SOMETHING — anti-vacuity", () => {
  // The failure mode this exists for: a workflow edit changes the `run:` shape,
  // the regex stops matching, and the tool reports a gate that runs nothing.
  assert.ok(report.specsInFixedGates > 0,
    "ci-coverage found NO specs executed by CI — the ci.yml parse has broken, " +
    "or the gate really has stopped running browser tests. Check which before " +
    "believing the number.");
  assert.ok(report.specsInFixedGates <= report.specsOnDisk);
  assert.equal(report.specsInFixedGates + report.specsOutsideFixedGates, report.specsOnDisk);
});

test("the fixed blocking floor: 3 specs, named, and it may not drift down", () => {
  /* A REPORT WITH NO FLOOR IS A NUMBER NOBODY DEFENDS. ci-coverage.mjs was
     written to describe the gate, not to constrain it, so "3 of 119 specs in
     fixed gates" could have walked to 0 — one `if:` on the smoke job, one
     deleted `run:` line — and the only thing that would have noticed is a
     person reading a routine report line. The anti-vacuity test above catches
     `> 0`, which the driving-model gate alone satisfies.

     The floor is taken on the BLOCKING count, not on `specsInFixedGates`: the
     RAISE THIS when a spec genuinely joins a fixed blocking gate. Lowering it
     means the deploy gate got weaker, which is the event this exists to make
     loud — not a number to edit until the test is quiet. */
  const FIXED_BLOCKING_FLOOR = 3;
  assert.ok(report.specsInBlockingFixedGates >= FIXED_BLOCKING_FLOOR,
    `only ${report.specsInBlockingFixedGates} spec(s) run in a fixed BLOCKING gate, floor is ` +
    `${FIXED_BLOCKING_FLOOR}. A fixed gate stopped gating: ${report.blocking.join(", ") || "(none)"}`);
  // Named, so "still 2" cannot be satisfied by two different specs after one
  // of these quietly left.
  assert.deepEqual(report.blocking,
    ["tests/specs/hud-mirror.spec.js", "tests/specs/image-grade-visual.spec.js", "tests/specs/instanced-draw.spec.js", "tests/specs/lighting-ab.spec.js", "tests/specs/lighting-tuner-grade.spec.js", "tests/specs/menu-baseline.spec.js", "tests/specs/physics-characterization.spec.js", "tests/specs/render-boot.spec.js", "tests/specs/smoke.spec.js", "tests/specs/tlx-probes.spec.js", "tests/specs/track-switch-memory.spec.js", "tests/specs/webgl-probes.spec.js"]);
  // The golden baseline is now blocking on scheduled/manual runs.
  assert.ok(report.executed.includes("tests/specs/menu-baseline.spec.js"));
  assert.ok(report.blocking.includes("tests/specs/menu-baseline.spec.js"));
  assert.equal(report.specsInFixedGates - report.specsInBlockingFixedGates, 0);
});

test("smoke and the driving-model gate are both seen", () => {
  // These two are what the ci.yml header promises the gate covers. If either
  // stops being detected, the report is wrong in the reassuring direction.
  assert.ok(report.executed.includes("tests/specs/smoke.spec.js"),
    "CI runs test:smoke but ci-coverage did not see it");
  assert.ok(report.executed.includes("tests/specs/physics-characterization.spec.js"),
    "CI runs the driving-model gate by path but ci-coverage did not see it");
});

test("it does not claim to cover what it cannot", () => {
  // test:render / test:headless drive whole PROJECTS and name no spec, so they
  // must resolve to nothing rather than being counted as blanket coverage.
  // NAME ONLY LIVE GROUPS, AND PROVE THEY ARE LIVE. This read
  // `["test:render", "test:headless"]` behind `if (specs !== null)`.
  // test:headless was dropped on 2026-09-10 (docs/TESTING.md), so groupSpecs
  // returned null, the `if` swallowed it, and half this guard was unreachable —
  // green because it checked nothing. A dead name in a list must fail, not skip:
  // that is the same fail-open shape as a regex that matches no path.
  for (const g of ["test:render"]) {
    const specs = groupSpecs(g);
    assert.notEqual(specs, null,
      `${g} is named here but no longer resolves to a group — drop the name or restore the script`);
    assert.deepEqual(specs, [],
      `${g} names no spec on its command line, so it must not contribute specs`);
  }
});

// The change-aware gate (2026-09-10): `select` plans, `selected` runs the plan
// as a matrix. The plan job is the trigger; the step script it delegates to
// carries the fail-closed strings.
// Both bounded at the next job head. An unbounded `split("\n  selected:")[1]`
// reads every job appended after it as part of it, so a later job's
// `continue-on-error: true` (the golden-menu trial) fails the gate assertion
// below against a gate nobody touched — the parser defect first fixed on
// 2026-09-10 for the single `selected` job, re-introduced with the two-job gate.
const selectJob = ciWorkflow.split("\n  select:")[1]?.split("\n  selected:")[0];
const selectedJob = (ciWorkflow.split("\n  selected:")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
const selectStep = fs.readFileSync(new URL("../../tools/ci/ci-select-specs-step.sh", import.meta.url), "utf8");
// The ship filter became its own job on 2026-09-22 (it was the smoke matrix's
// first step, so four shards paid for it). Bounded at the next job, like every
// other slice here.
// The ship filter is a STEP of the `select` plan job since 2026-10-15 (it was a job of its own
// from 2026-09-22): one runner answers it with the slice plan and the two other path filters.
const shipFilter = (ciWorkflow.split("      - name: Does this diff change anything that ships?\n")[1] || "").split("\n      - name: ")[0];
const PR_ACTIVE =
  "(github.event_name != 'pull_request' || !github.event.pull_request.draft || contains(github.event.pull_request.labels.*.name, 'run-ci'))";

test("every path a ci.yml change filter names still exists", () => {
  // The job filters are `grep -qE` alternations over the changed-file list, and
  // a branch of one that names a moved file simply never matches: the job it
  // guards is skipped for exactly the diffs it was written to catch, and the run
  // is green. Two were dead when this was written — the geometry sweeps filtered
  // on a debris world under js/game/ and the renderer job on six js/game/
  // lighting paths, none of which survived the move to js/physics/ and
  // js/lighting/ — so a debris-world edit skipped the sweeps and no lighting
  // edit could ever select the renderer specs.
  //
  // Only LITERAL branches are checked: a prefix like `js/render/` must be a real
  // directory, a `foo/bar.js$` a real file. Branches with character classes or
  // groups are left alone; they are patterns, not citations.
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const dead = [];
  for (const m of ciWorkflow.matchAll(/grep -qE '\^\(([^']+)\)'/g)) {
    for (const branch of m[1].split("|")) {
      const b = branch.replace(/\$$/, "");
      if (/[[\](){}*+?^]/.test(b)) continue;             // a pattern, not a path
      const rel = b.replace(/\\\./g, ".");
      if (!/^[\w.\-/]+$/.test(rel)) continue;
      if (!fs.existsSync(path.join(ROOT, rel))) dead.push(rel);
    }
  }
  assert.deepEqual(dead, [],
    "a ci.yml change filter names a path that does not exist — the job it gates can never be selected by it");
});

test("the change-aware gate blocks pushes, pull requests AND the deploy gate", () => {
  assert.ok(selectJob && selectedJob, "select / selected jobs missing");
  assert.deepEqual(report.selectionGate, {
    present: true,
    blocking: true,
    onPush: true,
    onPullRequest: true,
    onWorkflowCall: true,
    usesPullRequestBase: true,
    failsClosedOnInvalidBase: true,
    surfacesBudgetSkips: true,
  });
  // It used to skip itself on the Pages call (`inputs.concurrency_key == ''`).
  // pages.yml now publishes exactly the commit it tested, which makes "did we
  // test what this commit changed?" a deploy question too — so the one clause
  // that excluded the deploy must stay gone.
  // The third clause is the Pages call: the train's caller event is `schedule`,
  // so an event test alone would skip the plan on every deploy.
  // `schedule` too: the nightly's change-aware lane (every spec the last day
  // of merges routed; tools/ci/ci-resolve-before.sh).
  // 2026-10-15: the job also plans the node slices (was unit-plan), so it runs whenever the node
  // matrix does (`fast_tier_run == ''`); the spec selection keeps its own event test on the step.
  assert.match(selectJob, /if: \$\{\{ \(github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'run-ci'\)\) && \(github\.event\.action != 'labeled' \|\| \(github\.event\.label\.name == 'run-ci' && github\.event\.pull_request\.draft\)\) && \(inputs\.fast_tier_run == '' \|\| github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \|\| github\.event_name == 'schedule' \|\| inputs\.concurrency_key != ''\) \}\}/);
  // The JOB and the selection STEP never exclude the deploy gate; the ship
  // filter step inside the same job legitimately sits out the fast tier.
  const selectJobIf = (selectJob.match(/^    if: (.*)$/m) || [])[1] || "";
  assert.doesNotMatch(selectJobIf, /inputs\.concurrency_key == ''/, "the plan must never exclude the deploy gate");
  const selStepIf = String(parseYAML(ciWorkflow).jobs.select.steps.find((st) => st.id === "sel")?.if || "");
  assert.doesNotMatch(selStepIf, /inputs\.concurrency_key == ''/, "the selection step must never exclude the deploy gate");
  assert.match(selStepIf, /inputs\.concurrency_key != ''/, "the selection step runs on the Pages call");
  assert.doesNotMatch(selectJob + selectedJob, /^    continue-on-error:/m);
  // The runner consumes the plan as a matrix and takes its cap per shard.
  // 2026-10-10 (R3-CI-HEALTH-2): the selected legs start as soon as the plan exists; a guards red
  // still fails selected-verdict / ci-verdict, which keep `guards` in their needs.
  assert.match(selectedJob, /needs: \[select\]$/m);
  assert.match(selectedJob, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.shards\) \}\}/);
  assert.match(selectedJob, /timeout-minutes: \$\{\{ matrix\.timeout \}\}/);
  assert.match(selectedJob, /APEX_WORKERS: \$\{\{ matrix\.workers \|\| 1 \}\}/,
    "career oversize jobs pass workers: 2; others stay 1");
  assert.match(selectedJob, /needs\.select\.outputs\.any == 'true'/);
});

test("selection resolves the event-specific base and fails closed when it cannot", () => {
  // A direct push still resolves against the push's before; a Pages call
  // substitutes the train's live commit (asserted in the Pages-call test).
  // 2026-10-16 (CI/CD review #2333, PR F): a push-triggered train calls ci.yml with the push's
  // `before` populated; an empty before_sha must still mean "run everything", never that commit.
  assert.match(selectJob, /PUSH_BEFORE: \$\{\{ inputs\.concurrency_key != '' && inputs\.before_sha \|\| \(inputs\.concurrency_key == '' && github\.event\.before\) \|\| '' \}\}/);
  assert.match(selectJob, /PR_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  // Base resolution is delegated to ci-select-specs-step.sh -> ci-resolve-before.sh (HEAD~1 fallback).
  assert.match(selectJob, /ci-select-specs-step\.sh/);
  assert.match(selectStep, /ci-resolve-before\.sh/);
  assert.match(selectStep, /no valid comparison base/);
  assert.match(selectStep, /comparison base .* is unreachable/);
  assert.match(selectStep, /r\.reason === "unmatched"/);
  assert.doesNotMatch(selectStep, /skip\(\).*exit 0/);
  // The plan is what the runner reads: a JSON matrix plus a run/skip flag.
  assert.match(selectStep, /shards=\$\{JSON\.stringify\(shards\)\}/);
  assert.match(selectStep, /any=\$\{shards\.length \? "true" : "false"\}/);
});

/* A PAGES CALL WITH NO READABLE LIVE COMMIT SELECTS EVERYTHING (2026-09-25).
 * pages.yml passes before_sha empty when the live apex-sha cannot be read and
 * says "every filter in ci.yml reads empty as run everything" — true of the
 * sweeps, parts and ship filters, false of this resolver, which answered HEAD~1
 * and so planned specs for the tip's LAST COMMIT only. Run for real, in a
 * throwaway repo, for every branch of the resolver. */
test("the base resolver: a Pages call with no usable base selects everything, never HEAD~1", () => {
  const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../tools/ci/ci-resolve-before.sh");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-resolve-"));
  const g = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  const resolve = (env) => cp.spawnSync("bash", [script],
    { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  try {
    g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a"), "1\n"); g("add", "-A"); g("commit", "-qm", "one");
    const first = g("rev-parse", "HEAD");
    fs.writeFileSync(path.join(dir, "a"), "2\n"); g("add", "-A"); g("commit", "-qm", "two");
    const bogus = "1234567890123456789012345678901234567890";

    // The Pages call: empty, all-zero and unreachable bases all mean "everything".
    for (const before of ["", "0000000000000000000000000000000000000000", bogus]) {
      const r = resolve({ EVENT: "push", PUSH_BEFORE: before, CALLED: "true" });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, EMPTY_TREE, `a Pages call with base '${before}' must diff against the empty tree, not HEAD~1`);
      assert.match(r.stderr, /SELECTING EVERYTHING on a Pages call/);
    }
    // A usable live commit is used as-is.
    assert.equal(resolve({ EVENT: "push", PUSH_BEFORE: first, CALLED: "true" }).stdout, first);
    // A branch push keeps its documented HEAD~1 fallback and fails closed on an unreachable base.
    assert.equal(resolve({ EVENT: "push", PUSH_BEFORE: "", CALLED: "false" }).stdout, first);
    assert.equal(resolve({ EVENT: "push", PUSH_BEFORE: "" }).stdout, first, "CALLED unset is not a Pages call");
    assert.notEqual(resolve({ EVENT: "push", PUSH_BEFORE: bogus }).status, 0);
    assert.equal(resolve({ EVENT: "pull_request", PR_BASE: first }).stdout, first);
    // merge_group left with the trigger (2026-10-14): an event the resolver
    // does not know fails CLOSED, never resolves to a guess.
    assert.notEqual(resolve({ EVENT: "merge_group", PR_BASE: first }).status, 0, "an unknown event fails closed");
    // The empty tree is a base the selector can diff against: every tracked file changed.
    assert.equal(g("diff", "--name-only", EMPTY_TREE), "a");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // ...and the workflow actually tells the resolver it is on a Pages call.
  assert.match(selectJob, /CALLED: \$\{\{ inputs\.concurrency_key != '' \}\}/);
  assert.match(selectStep, /CALLED="\$\{CALLED:-false\}" bash tools\/ci\/ci-resolve-before\.sh/);
});

/* THE PROSE-ONLY PR HOLE (2026-09-25). ci.yml's paths-ignore means a PR that
 * touches only docs/**, **\/*.md, .claude/**, .cursor/** or .codex/** starts no
 * ci.yml run, while tooling-fast holds guards over exactly those trees.
 * docs-guards.yml closed it (2026-09-25..2026-10-15) by triggering on the SAME list as `paths:` — so the
 * two lists must stay one list, and the job must run the group that holds them. */
/* THE REQUIRED CHECK REPORTS ON EVERY PR (2026-09-30; one check, `CI`, since
 * 2026-10-15 — before that the fast-tier jobs and docs-guards by name). A
 * required check that never reports blocks the merge for good, so ci.yml may
 * not path-filter its pull_request trigger: it runs the fast tier on a prose
 * PR too (the node plan keeps it to guards plus seconds). docs-guards.yml,
 * which read ci.yml's push paths-ignore to exit early on code PRs, is gone. */
test("docs-guards.yml is retired; ci.yml's pull_request stays unfiltered and test:docs-guards is a local alias inside tooling-fast", () => {
  // RETIRED 2026-10-15 (Actions audit finding 5; CI clog survey 2026-10-15):
  // tooling-fast held every file of the group, so the workflow ran 615 times
  // on 2026-10-14 to test nothing new, one job start per PR event. Its required
  // status context was removed from the deploy branch's protection first (a
  // required check that never reports blocks every merge), then the file.
  // (A directory listing, not a path literal: cross-file-paths.test.mjs reads
  // every `new URL("…")` as a reference that must resolve — tooling B went red
  // on the deploy tip 55bebd22 for exactly that.)
  const workflowsDir = new URL("../../.github/workflows/", import.meta.url);
  assert.ok(!fs.readdirSync(workflowsDir).includes("docs-guards.yml"),
    "docs-guards.yml is back — tooling-fast already runs every file it ran, and a second workflow is a job start per PR event");
  const listAfter = (text, key, from = 0) => {
    const at = text.indexOf(`\n    ${key}:\n`, from);
    assert.ok(at >= 0, `no \`${key}:\` list found`);
    const lines = text.slice(at).split("\n").slice(2);
    const out = [];
    for (const l of lines) { const m = /^      - "([^"]+)"\s*$/.exec(l); if (!m) break; out.push(m[1]); }
    return { list: out, at };
  };
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\njobs:\n"));
  // The prose paths-ignore lives on pages.yml's push since 2026-10-16 (the
  // train runs on push; ci.yml has no push trigger).
  const pagesOn = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  const pushIgnore = listAfter(pagesOn, "paths-ignore");
  assert.ok(pushIgnore.list.length >= 3, `pages.yml push paths-ignore parsed to ${pushIgnore.list.length} entries`);
  assert.ok(pushIgnore.at < pagesOn.indexOf("  schedule:"), "the one paths-ignore list must be the push one");
  assert.doesNotMatch(onBlock, /^\s+paths-ignore:/m, "ci.yml carries no paths-ignore list at all: no push trigger, an unfiltered pull_request");
  const prBlock = onBlock.slice(onBlock.indexOf("  pull_request:"), onBlock.indexOf("  schedule:"));
  assert.ok(prBlock.includes("types: [opened, synchronize, reopened, ready_for_review, labeled]"), "the pull_request block was sliced whole");
  assert.doesNotMatch(prBlock, /paths(-ignore)?:/,
    "ci.yml's pull_request must not be path-filtered: a prose-only PR that starts no run can never satisfy the required check");

  // The group stays as the local alias the docs-only fast path and the
  // agent-config skill call; every file in it is in tooling-fast, so ci.yml's
  // guards job covers a prose PR with no second workflow.
  const groups = JSON.parse(fs.readFileSync(new URL("../groups.json", import.meta.url), "utf8"));
  const files = groups.groups["test:docs-guards"]?.files || [];
  for (const must of ["docs-integrity", "generated-docs", "agent-config", "skill-progressive", "hooks-documented"]) {
    assert.ok(files.includes(`tests/unit/${must}.test.mjs`), `test:docs-guards must run ${must}`);
  }
  const fast = new Set(groups.toolingFast.filter((f) => !f.startsWith("//")));
  const notFast = files.filter((f) => !fast.has(f) && f !== "tests/unit/environment-json.test.mjs");
  assert.deepEqual(notFast, [], "test:docs-guards is an alias over tooling-fast's prose guards, not a new home for files");
  // No other workflow may quietly take its place.
  const dir = new URL("../../.github/workflows/", import.meta.url);
  const others = fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n) && n !== "ci.yml")
    .filter((n) => /npm run test:docs-guards/.test(fs.readFileSync(new URL(n, dir), "utf8")));
  assert.deepEqual(others, [], "no workflow but ci.yml's guards runs the prose group on PRs");
});

test("ci-verdict is the always-run aggregator every other job feeds", () => {
  const body = (ciWorkflow.split("\n  ci-verdict:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.ok(body, "ci-verdict job missing");
  // The required-check display name stays the stable `CI` on every real run;
  // only a label-noise run (all jobs skipped, #2184) is named otherwise.
  assert.match(body, /^    name: \$\{\{ \(github\.event_name == 'pull_request' && github\.event\.action == 'labeled' && [^\n]* && 'CI label event \(ignored\)' \|\| [^\n]*'CI draft \(opted out\)' \|\| 'CI' \}\}$/m,
    "the required-check display name must be the stable `CI`");
  assert.match(body, /if: \$\{\{ .*!cancelled\(\).*\}\}/);
  assert.match(body, /run: node tools\/ci\/ci-verdict\.mjs/);
  assert.match(body, /NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
  for (const j of ["guards", "node-suites", "smoke", "selected", "baseline-trial"]) {
    assert.match(body, new RegExp(`- ${j}\\b`), `ci-verdict must need ${j}`);
  }
  // 2026-10-04: CI needed `selected` and not `selected-verdict`, so a plan
  // that dropped every routed spec (selected skipped) passed CI while the
  // verdict failed. Requiring only `CI` would have lost that rule.
  assert.match(body, /^      - selected-verdict$/m, "ci-verdict must need selected-verdict");
  // Every job a required check names must feed CI, so requiring CI alone
  // loses no rule (the API showed 12 fast-tier names on 2026-10-04).
  const parsed = parseYAML(ciWorkflow);
  const needs = new Set(parsed.jobs["ci-verdict"].needs);
  // ONE exemption, by name: draft-ci-skipped is the opt-out notice, not a
  // verdict. (poke-train, the train's dispatcher, was the other until
  // 2026-10-16: pages.yml runs on push now, CI/CD review #2333 finding 3.)
  const NOT_A_VERDICT = new Set(["draft-ci-skipped"]);
  for (const [id, job] of Object.entries(parsed.jobs)) {
    if (id === "ci-verdict") continue;
    if (NOT_A_VERDICT.has(id)) {
      assert.ok(!needs.has(id), `${id} is exempt because CI must not wait on it`);
      continue;
    }
    assert.ok(needs.has(id), `job ${id} (${job.name || id}) does not feed CI — a red there would pass the required check`);
  }
});

test("selected-verdict reds on ANY dropped spec, and owns the carry-forward once per run", () => {
  const job = parseYAML(ciWorkflow).jobs["selected-verdict"];
  const script = job.steps.map((st) => st.run || "").join("\n");
  // Verdict logic lives in selected-gate-verdict.mjs (failed/cancelled legs
  // remain red; dropped > 0 is red off the train). Workflow stages junit
  // BEFORE that script runs.
  assert.match(script, /selected-gate-verdict\.mjs/);
  assert.match(script, /junit-failed\.mjs/);
  const stepNames = job.steps.map((st) => st.name || "");
  const decide = stepNames.indexOf("One answer for the change-aware gate");
  const junit = stepNames.indexOf("Every shard's junit");
  assert.ok(decide > junit && junit >= 0, "junit must land before the verdict decides");
  const uses = job.steps.map((st) => st.uses || "").join("\n");
  assert.match(uses, /actions\/download-artifact@[0-9a-f]{40}/, "pinned by SHA like every other action");
  assert.match(uses, /actions\/cache\/save@/);
  // download / stage / carry stay continue-on-error so a missing artifact
  // never blocks a clean cancel; the decision step itself must NOT soft-fail.
  const soft = job.steps.filter((st) =>
    /download-artifact|cache\/save|Stage junit|Record failing/.test(`${st.uses || ""}\n${st.name || ""}`));
  assert.ok(soft.length >= 3);
  assert.ok(soft.every((st) => st["continue-on-error"] === true),
    "junit download/stage/carry may never decide the verdict by throwing");
  const decideStep = job.steps.find((st) => st.name === "One answer for the change-aware gate");
  assert.ok(decideStep && decideStep["continue-on-error"] !== true, "the verdict step decides");
  // …and no `selected` shard saves it any more (one key per run, one writer).
  const selected = parseYAML(ciWorkflow).jobs.selected;
  assert.ok(!selected.steps.some((st) => /cache\/save/.test(st.uses || "")), "a shard must not race for the carry-forward key");
  const names = selected.steps.map((st) => st.with?.name || "").filter(Boolean);
  assert.ok(names.length >= 2 && names.every((n) => n.includes("${{ strategy.job-index }}")),
    `every selected artifact name carries the job index: ${names.join(", ")}`);
});

test("select plans the node-suites matrix and can skip unused slices (unit-plan folded in, 2026-10-15)", () => {
  const plan = parseYAML(ciWorkflow).jobs.select.steps.find((st) => st.id === "plan");
  assert.ok(plan, "the node-slice plan step is gone from select");
  assert.match(plan.run, /node tools\/ci\/pick-unit-slices\.mjs/);
  assert.match(plan.run, /--github-output/);
  assert.equal(plan.if, "${{ inputs.fast_tier_run == '' }}", "the plan runs exactly when the node matrix does");
  // A draft asks for the needed rows only; every other event keeps all six.
  assert.match(String(plan.env.NEEDED_ONLY), /github\.event_name == 'pull_request'/);
  assert.match(plan.run, /FLAG="--needed-only"/);
  assert.match(plan.run, /pick-unit-slices\.mjs --since "\$BASE" \$FLAG --github-output/);
  assert.match(selectJob, /^      any_node: \$\{\{ steps\.plan\.outputs\.any_node \}\}$/m);
  assert.match(selectJob, /^      driving: \$\{\{ steps\.plan\.outputs\.driving \}\}$/m);
  assert.match(selectJob, /^      slices: \$\{\{ steps\.plan\.outputs\.slices \}\}$/m);
  const node = (ciWorkflow.split("\n  node-suites:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.match(node, /^    needs: \[select\]$/m);
  // The six "Pure-node unit suites (<slice>)" names are REQUIRED checks: a
  // job-level skip on any_node=false never expands the matrix, so they never
  // report and the PR sits BLOCKED green (#522). The job always runs on every
  // event but a pull request — its plan lists only the needed rows and the job
  // skips when there are none (2026-10-15).
  const nodeIf = (node.match(/^    if: (.*)$/m) || [])[1] || "";
  assert.match(nodeIf, /needs\.select\.outputs\.any_node == 'true' \|\| github\.event_name != 'pull_request'/,
    "node-suites may skip at the job level only on a pull request with no needed slice");
  const steps = node.split(/\n      - /).slice(1);
  const setup = steps.filter((st) => /^uses: actions\/checkout@|^uses: \.\/\.github\/actions\/setup-apex|^name: Plan the slices for this diff|^name: Was this head already green as a draft\?/.test(st));
  assert.equal(setup.length, 4, "checkout, the reuse question, setup-apex and the plan step");
  for (const st of setup) assert.match(st, /\n        if: matrix\.needed != 'false'/, "an unneeded row skips: " + st.split("\n")[0]);
  assert.match(node, /if \[ "\$\{\{ matrix\.needed \}\}" = "false" \]; then[\s\S]*?exit 0/, "the suites step exits 0 for an unneeded row");
  assert.match(node, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.slices\) \}\}/);
  const driving = (ciWorkflow.split("\n  driving-model:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.match(driving, /^    needs: \[select\]$/m);
  assert.match(driving, /needs\.select\.outputs\.driving == 'true'/);
  // No plumbing job is left in front of the fast tier: every job that used to
  // wait on `reuse-draft` asks the question itself, as a step.
  const jobs = parseYAML(ciWorkflow).jobs;
  for (const id of ["reuse-draft", "unit-plan", "ship-filter", "renderer-filter", "xr-filter"]) assert.ok(!jobs[id], `${id} is a step now, not a job`);
  for (const id of ["guards-a", "guards-b", "node-suites", "sweeps-parts", "driving-model"]) {
    const st = jobs[id].steps.find((x) => x.id === "reuse");
    assert.ok(st && /reuse-draft-fast\.sh/.test(st.run), `${id} asks the reuse question itself`);
    assert.deepEqual(jobs[id].permissions, { contents: "read", actions: "read" }, `${id} needs actions:read for the runs lookup`);
  }
  assert.equal(jobs.guards.steps.length, 1, "the aggregator only joins the halves (no checkout, no npm ci)");
  assert.deepEqual(jobs.guards.needs, ["guards-a", "guards-b"]);
  const b = jobs["guards-b"].steps.map((x) => x.name || "");
  for (const n of ["Ratchet ceilings vs the base", "Every test file belongs to a topical group", "What does this gate cover?", "How far behind ship?"])
    assert.ok(b.includes(n), `${n} runs at the end of tooling B`);
});

test("test:xr is path-gated (a filter step of select → xr) and feeds ci-verdict", () => {
  const filter = parseYAML(ciWorkflow).jobs.select.steps.find((st) => st.id === "xrfilter");
  assert.ok(filter, "the WebXR filter step is gone from select");
  assert.match(filter.run, /js\/xr\//);
  assert.match(filter.run, /vr-emulated/);
  assert.match(selectJob, /^      xr: \$\{\{ steps\.xrfilter\.outputs\.xr \}\}$/m);
  assert.match(String(filter.if), /pull_request' && !github\.event\.pull_request\.draft/,
    "the xr filter must skip draft PRs (heavy Chromium suite; fast tier)");
  const xr = (ciWorkflow.split("\n  xr:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.ok(xr, "xr job missing");
  assert.match(xr, /^    needs: select$/m);
  assert.match(xr, /if: \$\{\{ .*!inputs\.concurrency_key && needs\.select\.outputs\.xr == 'true'.*\}\}/,
    "the deploy-gate opt-out sits on the job now that the filter is a step");
  assert.match(xr, /npm run test:xr/);
  const body = (ciWorkflow.split("\n  ci-verdict:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.match(body, /- xr\b/);
});

test("no workflow demotes the change-aware gate to advisory", () => {
  assert.doesNotMatch(pagesWorkflow, /^\s+advisory:/m);
  assert.doesNotMatch(ciWorkflow, /^\s+advisory:/m);
});

test("one CI run per branch head: push and pull_request share a group, manual runs keep their own", () => {
  // A push to a branch with an open PR used to start TWO full runs (push on
  // refs/heads/<b>, pull_request on refs/pull/N/merge) that never cancelled
  // each other — 58.5 + 47.4 job-minutes for one commit, measured 2026-09-10.
  // Keying on the branch NAME for both events collapses the pair; the PR run
  // (seconds later, on the merge commit) cancels the push run.
  //
  // BOTH manual events keep their own group. `schedule` used to fall through
  // to github.ref, which put the nightly in the same group as every push to
  // the deploy branch — and GitHub keeps only ONE pending run per group, so
  // the next push silently discarded the queued nightly (run 2758).
  // A push to the DEPLOY branch is the fast tier and joins ONE shared
  // `ship-fast` group with NO cancel (2026-10-03): the running fast tier
  // always finishes (shared `ship-push` + cancel used to kill it mid-way),
  // and GitHub keeps only the newest waiting push, so a merge burst costs one
  // fast tier at a time — keying on github.sha ran one per merge and clogged
  // the queue (docs/notes/CI-MERGE-BURST-2026-10-03.md). Dispatch and schedule still get a
  // unique run_id group (the nightly must not share the tip's group —
  // run 2758). The train is not in this group: pages.yml passes a unique
  // concurrency_key. PR branches keep newest-wins cancel on pull_request.
  assert.match(ciWorkflow, /group: ci-\$\{\{ inputs\.concurrency_key \|\| \(\(github\.event_name == 'pull_request' && github\.event\.action == 'labeled' && \(github\.event\.label\.name != 'run-ci' \|\| !github\.event\.pull_request\.draft\)\) && format\('label-\{0\}', github\.run_id\)\) \|\| \(\(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\) && github\.run_id\) \|\| github\.event\.pull_request\.head\.ref \|\| github\.ref_name \}\}/,
    "PR runs of one branch share a group; dispatched/scheduled runs keep run_id (no ship-fast since 2026-10-16: pages.yml runs on push)");
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    "newest wins on PR only; ship pushes must not cancel each other");
  assert.doesNotMatch(ciWorkflow, /'ship-fast'/, "the deploy-branch fast tier and its group are gone (2026-10-16)");
  assert.doesNotMatch(ciWorkflow, /'ship-push'/,
    "shared ship-push group is retired — it cancelled earlier merges mid-run");
  // The deploy gate is unaffected: its caller supplies a unique key. The train
  // rule lives on pages.yml's own ci job: one gate at a time, never cancelled
  // (a tick waits, a later tick replaces the waiting one), so lag is bounded
  // and no gate is ever killed a spec from green.
  assert.match(pagesWorkflow, /concurrency_key: pages-\$\{\{ github\.run_id \}\}/);
  // The dedupe SAVES ~47 job-minutes and COSTS one `cancelled` row per push,
  // which is the exact shape AGENTS.md rule 8 teaches a session to read as a
  // starved-runner timeout. It cost a real triage on 2026-09-22 (run 4657
  // cancelled by 4658 on one SHA), so both triage surfaces must name the
  // signature — same head_sha, cancelled seconds in, sibling still running.
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /`ready_for_review` run share a group[\s\S]{0,200}head_sha/,
    "AGENTS.md rule 8 must except the designed draft/ready dedupe, or the next session triages it as a timeout");
  const triage = fs.readFileSync(path.join(repo, ".claude/agents/ci-red-triage.md"), "utf8");
  assert.match(triage, /draft\/ready dedupe/, "ci-red-triage must tell the dedupe from a superseded push");
  const pagesCi = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  assert.match(pagesCi, /group: pages-gate-\$\{\{ github\.ref \}\}/);
  assert.match(pagesCi, /cancel-in-progress: false/,
    "the train never cancels a running gate; the next tick queues behind it");
});

test("a Pages run publishes EXACTLY the commit it tested, and never moves the site backwards", () => {
  // THE CONTRACT (2026-09-10). The previous design gated GITHUB_SHA and then
  // published the branch TIP from any green ancestor run, which let a commit
  // ship while its own gate was unfinished or failing (justified by "every push
  // goes through deploy.mjs" — PRs merged through GitHub do not). Now: test one
  // commit, stage it, publish that artifact. Starvation is handled by
  // newest-wins cancellation on the gate (asserted in the concurrency test),
  // and the hazard the old tip check guarded — moving the site backwards — by
  // an ancestry check against the LIVE shell's apex-sha, before the environment
  // and again under the Pages lock.
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  const deploy = pagesWorkflow.split("\n  deploy:")[1];
  assert.doesNotMatch(preflight, /^\s+environment:/m,
    "the cheap publishability check must not create a github-pages deployment record");
  assert.match(preflight, /deploy: \$\{\{ steps\.pub\.outputs\.publish \}\}/);
  assert.match(preflight, /fetch-depth: 0/,
    "merge-base needs history — a shallow checkout makes every ancestor test a false negative");
  assert.match(preflight, /tools\/ci\/pages-publishable\.sh "\$GITHUB_SHA"/,
    "the pre-environment check asks the one question that matters: may THIS commit still be published?");

  assert.match(deploy, /needs: publishable/);
  // `!cancelled()` plus an explicit result check: a job's implicit success()
  // looks at every job upstream TRANSITIVELY, so with the gate skipped (nothing
  // new / reused pass) deploy was skipped even though publishable said yes
  // (run 2237). The result check keeps a failed or skipped publishable fatal.
  assert.match(deploy, /if: \$\{\{ !cancelled\(\) && needs\.publishable\.result == 'success' && needs\.publishable\.outputs\.deploy == 'true' \}\}/,
    "a run that cannot publish must skip the environment job entirely; a reused gate must not");
  const verifyLive = pagesWorkflow.split("\n  verify-live:")[1];
  assert.match(verifyLive, /if: \$\{\{ !cancelled\(\) && needs\.deploy\.result == 'success' \}\}/,
    "verify-live must run exactly when deploy succeeded, whatever was skipped upstream");
  assert.match(deploy, /environment:\s*\n\s+name: github-pages/);
  assert.match(deploy, /tools\/ci\/pages-publishable\.sh "\$GITHUB_SHA"[\s\S]*?REFUSING DEPLOY:[\s\S]*?exit 1/,
    "the in-lock recheck must fail the run, never become a successful no-op deployment");
  // No branch-tip substitution anywhere in the deploy job.
  assert.doesNotMatch(deploy, /git checkout --detach/);
  assert.doesNotMatch(deploy, /TIP=\$\(git rev-parse/);
  assert.doesNotMatch(deploy, /refs\/remotes\/origin/);

  // Order: confirm publishable under the lock, then stage, then publish.
  // Anchor on the STEP DECLARATIONS, not bare phrases (a comment names "Stage
  // site" in prose, and a loose indexOf once reported the steps out of order).
  const recheck = deploy.indexOf("- name: Confirm this commit may still be published (under the Pages lock)");
  const stage = deploy.indexOf("- name: Stage site");
  // Pinned to a commit sha since 2026-09-22 (`@<sha> # v4.x.y`), so match the
  // action name, not the moving tag.
  const publish = deploy.search(/uses: actions\/deploy-pages@/);
  assert.ok(recheck >= 0 && stage > recheck, "the in-lock check must precede staging");
  assert.ok(publish > stage, "staging must precede publication");

  // apex-sha is the provenance record AND the input to the next run's
  // monotonic check, so it must name the commit actually published: GITHUB_SHA.
  assert.match(deploy, /PUBLISH_SHA="\$GITHUB_SHA"/);
  assert.match(deploy, /name=\\"apex-sha\\" content=\\"\$PUBLISH_SHA\\"/,
    "apex-sha must name the commit actually published");
  assert.doesNotMatch(deploy, /echo "deploy=false"/,
    "once the environment job starts, unpublishable must fail rather than report success");
});

test("pages-publishable.sh: forward-only, and a CDN hiccup cannot wedge deploys", () => {
  // Drive the script against a throwaway repo (A -> B -> C) and a fake `curl`
  // on PATH that serves whatever apex-sha the case names. The verdict is the
  // ONLY thing on stdout, by design: the workflow writes it straight into
  // $GITHUB_OUTPUT.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-pub-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  const shas = [];
  for (const n of ["A", "B", "C"]) {
    fs.writeFileSync(path.join(dir, "f.txt"), n);
    git("add", "f.txt"); git("commit", "-q", "-m", n); shas.push(git("rev-parse", "HEAD"));
  }
  const [A, B, C] = shas;
  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"),
    '#!/usr/bin/env bash\ncase "${FAKE_LIVE_SHA:-}" in\n  fail) exit 22 ;;\n  "") echo "<html></html>" ;;\n  *) echo "<meta name=\\"apex-build\\" content=\\"1\\">\n<meta name=\\"apex-sha\\" content=\\"${FAKE_LIVE_SHA}\\">" ;;\nesac\n');
  fs.chmodSync(path.join(bin, "curl"), 0o755);
  const script = new URL("../../tools/ci/pages-publishable.sh", import.meta.url).pathname;
  const verdict = (sha, live) => cp.execFileSync("bash", [script, sha, "https://example.test/site/"], {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LIVE_SHA: live },
  }).trim();
  assert.equal(verdict(C, B), "true", "live is an ancestor: publishing moves the site forward");
  assert.equal(verdict(B, B), "false", "already live");
  assert.equal(verdict(A, B), "false", "a NEWER build is live: publishing would move the site backwards");
  assert.equal(verdict(C, "0123456789abcdef0123456789abcdef01234567"), "false", "an unrelated live sha means diverged history: refuse");
  assert.equal(verdict(C, "fail"), "true", "the live site unreadable: publish (warned), the lock recheck runs again");
  assert.equal(verdict(C, ""), "true", "no apex-sha in the live shell yet: publish");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a Pages run reuses a gate that already passed on the SAME tree, and only then", () => {
  // Rule 3 (2026-09-10). A GitHub merge is a new commit, so every PR merge
  // re-ran the ~15-minute gate on files a PR run had just tested. The verdict
  // job compares TREE hashes and skips the ci call when a tree-identical
  // parent has a completed successful run; publishable then has to accept a
  // skipped gate in exactly that one case and no other.
  const verdict = pagesWorkflow.split("\n  verdict:")[1].split("\n  ci:")[0];
  const ciJob = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  assert.ok(pagesWorkflow.indexOf("\n  verdict:") < pagesWorkflow.indexOf("\n  ci:"), "verdict is declared before the gate it can skip");
  assert.match(verdict, /actions: read/, "listing workflow runs needs actions:read on the job token");
  assert.doesNotMatch(verdict, /^\s+environment:/m, "the verdict must not create a deployment record");
  assert.doesNotMatch(verdict, /^\s+concurrency:/m, "the verdict must never be cancelled by newest-wins");
  assert.match(verdict, /fetch-depth: 0/, "the parents' trees are the question; a shallow clone has no parents");
  assert.match(verdict, /tools\/ci\/pages-reuse-verdict\.sh "\$GITHUB_SHA" >> "\$GITHUB_OUTPUT"/);
  assert.match(ciJob, /needs: verdict/);
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'$/m, "the gate runs unless nothing is new or an earlier gate on this tree is reused");
  assert.doesNotMatch(pagesWorkflow, /ship_only|smoke_only/, "the smoke-only ship path is gone (always false since 2026-10-07)");
  assert.match(preflight, /needs: \[verdict, ci\]/);
  assert.match(preflight, /needs\.ci\.result == 'success' \|\| \(needs\.ci\.result == 'skipped' && needs\.verdict\.outputs\.reuse == 'true'\)/,
    "a skipped gate is acceptable only when the verdict reused an earlier pass; failed or cancelled must still stop the run");
  assert.match(preflight, /!cancelled\(\)/, "a skipped `needs` job skips its dependents unless the condition opts in");
});

test("pages-reuse-verdict.sh: same tree + a successful gate run, nothing else", () => {
  // A throwaway repo: A -> C on the deploy line; B branches from A; D is B with
  // C merged in. M1 = merge(C, B) has a tree neither parent has (both sides
  // changed). M2 = merge(C, D) has D's tree exactly. A fake `gh` on PATH serves
  // whatever runs FAKE_RUNS names for the head_sha in the URL.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-reuse-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  git("init", "-q", "-b", "deploy"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  write("f.txt", "A"); write("g.txt", "A"); git("add", "."); git("commit", "-q", "-m", "A"); const A = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "feature");
  write("f.txt", "B"); git("commit", "-q", "-am", "B"); const B = git("rev-parse", "HEAD");
  git("checkout", "-q", "deploy");
  write("g.txt", "C"); git("commit", "-q", "-am", "C"); const C = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "m1", "deploy"); git("merge", "-q", "--no-ff", "-m", "M1", "feature"); const M1 = git("rev-parse", "HEAD");
  git("checkout", "-q", "feature"); git("merge", "-q", "--no-ff", "-m", "D", "deploy"); const D = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "m2", "deploy"); git("merge", "-q", "--no-ff", "-m", "M2", "feature"); const M2 = git("rev-parse", "HEAD");
  assert.equal(git("rev-parse", `${M2}^{tree}`), git("rev-parse", `${D}^{tree}`), "fixture: M2 must share D's tree");
  assert.notEqual(git("rev-parse", `${M1}^{tree}`), git("rev-parse", `${B}^{tree}`), "fixture: M1 must not share B's tree");
  void A;

  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"),
    '#!/usr/bin/env bash\n[ "${FAKE_GH:-}" = fail ] && exit 1\nurl="$2"\n' +
    'case "$url" in */jobs*) id="${url%/jobs*}"; id="${id##*/}"; node -e \'const m=JSON.parse(process.env.FAKE_JOBS||"{}");console.log(JSON.stringify({jobs:m[process.argv[1]]||[]}))\' "$id"; exit 0;; esac\n' +
    'sha="${url#*head_sha=}"; sha="${sha%%&*}"\n' +
    'node -e \'const m=JSON.parse(process.env.FAKE_RUNS||"{}");console.log(JSON.stringify({workflow_runs:(m[process.argv[1]]||[]).map((r)=>({head_sha:process.argv[1],...r}))}))\' "$sha"\n');
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  const script = new URL("../../tools/ci/pages-reuse-verdict.sh", import.meta.url).pathname;
  // A READY PR's run / a full Pages gate: CI, sweeps, selected verdict and
  // smoke all ran and passed (a draft's sweeps and smoke are skipped).
  // The tree-only rows (guards halves + aggregator, unit plan, node suites,
  // driving model) are what a fast tier must show before it is fast_run.
  const gateJobs = (prefix = "", over = {}) => [
    ["CI", "success"], ["Per-circuit geometry sweeps", "success"], ["Selected specs (verdict)", "success"],
    ["Smoke (page boots, __apex responds) (1)", "success"], ["Structural guards", "success"],
    ["Structural guards (tooling A)", "success"], ["Structural guards (tooling B)", "success"],
    ["Pure-node unit suites (vm-a1)", "success"], ["Pure-node unit suites (page)", "success"], ["Driving model (characterization traces)", "skipped"],
  ].map(([name, conclusion]) => ({ name: prefix + name, status: "completed", conclusion: name in over ? over[name] : conclusion }));
  const fullJobs = {
    7: gateJobs(),
    // Pages run 3112 (37689226760): smoke-only, sweeps/selection/guards skipped.
    9: gateJobs("ci / ", { "Per-circuit geometry sweeps": "skipped", "Selected specs (verdict)": "skipped", "Structural guards": "skipped" }),
    // A Pages run that itself reused an earlier pass: no ci jobs at all.
    10: [{ name: "Anything new, and was this exact tree already gated?", conclusion: "success" }, { name: "publishable", conclusion: "success" }, { name: "deploy", conclusion: "success" }],
    // A real Pages gate (jobs prefixed by the reusable-workflow call).
    11: gateJobs("ci / "),
    12: gateJobs("ci / ", { "Smoke (page boots, __apex responds) (1)": "cancelled" }),
    13: gateJobs("", { "Selected specs (verdict)": "skipped" }),
    // T1 (2026-10-14): the run that POKED this train, still in progress — its
    // tree-only jobs are done and green, CI has not run yet.
    20: gateJobs("", { CI: null, "Per-circuit geometry sweeps": "skipped", "Smoke (page boots, __apex responds) (1)": "skipped" })
      .map((j) => (j.name === "CI" ? { ...j, status: "queued" } : j)),
    // A fast tier still running its node suites: not reusable yet.
    21: gateJobs("", { "Pure-node unit suites (page)": null }).map((j) => (j.conclusion === null ? { ...j, status: "in_progress" } : j)),
    // A fast tier whose aggregator has not been created yet (its halves still run).
    22: gateJobs("").filter((j) => j.name !== "Structural guards"),
  };
  const run = (over) => ({ id: 7, status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", event: "pull_request", head_branch: "feature", html_url: "https://example.test/run/7", ...over });
  const verdict = (sha, runs, env = {}) => Object.fromEntries(cp.execFileSync("bash", [script, sha], {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", DEPLOY_BRANCH: "deploy", FAKE_RUNS: JSON.stringify(runs), FAKE_JOBS: JSON.stringify(fullJobs), ...env },
  }).trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));

  assert.deepEqual(verdict(M2, { [D]: [run()] }), { reuse: "true", source: D, run: "https://example.test/run/7" },
    "merge with a parent's exact tree + that parent's green PR run: reuse");
  assert.equal(verdict(M2, { [D]: [run({ event: "push" })] }).reuse, "true", "a branch push run counts too");
  // ci.yml has no merge_group trigger (2026-10-14), so such a run is not one of its gates.
  assert.equal(verdict(M2, { [D]: [run({ event: "merge_group" })] }).reuse, "false", "a merge_group run is not a ci.yml gate any more");
  // A DRAFT PR's run is the fast tier (sweeps and smoke skipped) and concludes
  // success all the same: never a gate, and a real gate after it still counts.
  assert.equal(verdict(M2, { [D]: [run({ id: 8 })] }).reuse, "false", "a draft PR run (sweeps skipped) is not a gate");
  assert.deepEqual(verdict(M2, { [D]: [run({ id: 8 }), run()] }), { reuse: "true", source: D, run: "https://example.test/run/7" },
    "…the ready run beside it is");
  // THE FAST TIER IS NOT A GATE. Run 2237 reused the merge commit's own
  // deploy-branch push run (guards + node suites only) as if it were the full
  // gate; the head_sha candidate is checked first, so this must be rejected
  // before the parent's real run is even looked at.
  assert.deepEqual(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" })], [D]: [run()] }),
    { reuse: "true", source: D, run: "https://example.test/run/7" },
    "a deploy-branch push run (fast tier) must be skipped in favour of the parent's full run");
  // Pages run 3112 (37689226760, 2026-10-07) published 61e0a6442 on its own
  // green ship fast tier as smoke-only, after dispatch 3110 (37687308660) had
  // FAILED the full gate on that tree. The fast tier is never a gate: the
  // full gate runs, reusing only the fast tier's tree-only jobs.
  assert.deepEqual(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" })] }),
    { reuse: "false", source: "", run: "" },
    "an exact-SHA ship fast tier alone runs the gate (no smoke-only shortcut)");
  assert.equal(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" }), run({ id: 99, path: ".github/workflows/pages.yml", event: "workflow_dispatch", conclusion: "failure" })] }).reuse, "false",
    "a failed Pages gate beside a green fast tier on the same sha: the gate runs again");
  // A successful run is not proof the gate RAN: the CI aggregator passes skipped jobs.
  assert.equal(verdict(M2, { [D]: [run({ id: 9, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a smoke-only Pages run (sweeps, selection skipped) concluded success but is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 10, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a Pages run that skipped ci (it reused an earlier pass) is not a gate: no chaining");
  assert.equal(verdict(M2, { [D]: [run({ id: 11, path: ".github/workflows/pages.yml", event: "workflow_dispatch" })] }).reuse, "true",
    "a Pages run whose `ci / ` gate jobs all passed is a gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 12, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a cancelled smoke shard is not a pass");
  assert.equal(verdict(M2, { [D]: [run({ id: 13 })] }).reuse, "false", "a skipped selected verdict is not a pass");
  assert.equal(verdict(M2, { [D]: [run({ event: "push" })] }, { DEPLOY_BRANCH: "" }).reuse, "false",
    "without DEPLOY_BRANCH no push run can be told from the fast tier: fail safe into the gate");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "true", "a train tick that deployed the same tree counts");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/pages.yml", event: "push" })] }).reuse, "true", "an earlier deploy of the same tree counts");
  assert.equal(verdict(M2, { [D]: [run({ conclusion: "failure" })] }).reuse, "false", "a failed run is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ conclusion: "cancelled" })] }).reuse, "false", "a cancelled run is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/gpu-census.yml", event: "workflow_dispatch" })] }).reuse, "false", "another workflow's green is not this gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 99 })] }, { GITHUB_RUN_ID: "99" }).reuse, "false", "a run never reuses itself");
  assert.equal(verdict(M1, { [B]: [run()], [C]: [run({ path: ".github/workflows/pages.yml", event: "push" })] }).reuse, "false",
    "both parents green but the merge tree is new: the gate runs");
  assert.deepEqual(verdict(B, { [B]: [run({ event: "push" })] }), { reuse: "true", source: B, run: "https://example.test/run/7" },
    "a fast-forwarded commit with its own green push run: reuse");
  assert.equal(verdict(M2, { [D]: [run()] }, { FAKE_GH: "fail" }).reuse, "false", "an API failure runs the gate rather than guessing");
  assert.equal(verdict(M2, {}).reuse, "false", "no run on record: the gate runs");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("pages.yml holds its Pages token on deploy only", () => {
  const pages = parseYAML(pagesWorkflow);
  // T6 least privilege: deploy-pages needs pages: write + id-token: write on
  // the deploying job (https://github.com/actions/deploy-pages); nothing else does.
  assert.deepEqual(pages.permissions, { contents: "read" }, "no Pages token at workflow level");
  assert.deepEqual(pages.jobs.deploy.permissions, { contents: "read", pages: "write", "id-token": "write" });
  for (const [id, job] of Object.entries(pages.jobs)) {
    if (id === "deploy") continue;
    assert.ok(job.permissions, `${id} must name its own permissions (it would inherit only contents: read, but say so)`);
    assert.equal(job.permissions.pages, undefined, `${id} holds no pages token`);
    assert.equal(job.permissions["id-token"], undefined, `${id} holds no OIDC token`);
  }
  // spec-timings: npm ci only when there is junit to merge.
  const timings = parseYAML(fs.readFileSync(new URL("../../.github/workflows/spec-timings.yml", import.meta.url), "utf8"));
  const tsteps = timings.jobs.merge.steps;
  const setup = tsteps.findIndex((st) => st.uses === "./.github/actions/setup-apex");
  assert.ok(setup > tsteps.findIndex((st) => st.id === "fetch"), "npm ci comes after the junit fetch");
  assert.equal(tsteps[setup].if, "steps.fetch.outputs.found == 'true'", "no junit (the normal case): no npm ci");
});

test("every ROOT html page is named in the Stage site whitelist", async () => {
  // Staging uses tools/desktop/stage-files.mjs (via stage.mjs). A directory is
  // swept up; a file at the ROOT is not, so a new root page deploys as a 404
  // with a green build. That is exactly what happened to bench.html on build
  // 7377: CI passed, the deploy succeeded, version.json moved, and the page
  // was not there.
  //
  // Derived from the tree, not pinned: add a root page and this fails until
  // stage-files.mjs names it. pages.yml must call the shared stage script.
  const roots = fs.readdirSync(new URL("../..", import.meta.url))
    .filter((f) => f.endsWith(".html") && !f.startsWith("."));
  const from = pagesWorkflow.indexOf("- name: Stage site");
  assert.ok(from >= 0, "the Stage site step is gone — this guard is pinned to a step that moved");
  const rest = pagesWorkflow.slice(from + 1);
  const nextStep = rest.indexOf("- name:");
  const stage = (nextStep >= 0 ? rest.slice(0, nextStep) : rest)
    .split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  assert.match(stage, /tools\/desktop\/stage\.mjs/,
    "Stage site must call tools/desktop/stage.mjs (shared with Electron)");
  const { STAGE_ROOT_FILES } = await import("../../tools/desktop/stage-files.mjs");
  const missing = roots.filter((f) => !STAGE_ROOT_FILES.includes(f));
  assert.deepEqual(missing, [],
    `a root .html page is not staged by tools/desktop/stage-files.mjs, so it will ` +
    `404 on the live site while the build goes green: ${missing.join(", ")}. ` +
    `Add it to STAGE_ROOT_FILES.`);
});

test("cached browser jobs never enter apt through --with-deps", () => {
  // Since 2026-09-22 the cache-then-install contract lives ONCE, in the
  // composite action; each browser job takes it by `uses:`. The action is
  // pinned here exactly as the inline steps were, and every browser job must
  // go through it rather than carrying its own copy.
  const action = fs.readFileSync(new URL("../../.github/actions/playwright-chromium/action.yml", import.meta.url), "utf8");
  assert.match(action, /id: pwcache/, "the cache must expose cache-hit");
  assert.match(action,
    /if: steps\.pwcache\.outputs\.cache-hit != 'true'[\s\S]*?run: npx playwright install \$\{\{ inputs\.with-deps == 'true' && '--with-deps' \|\| '' \}\} chromium/,
    "apt (--with-deps) only on a cache miss, and only when the caller asks");
  assert.doesNotMatch(action, /if: .*cache-hit == 'true'[\s\S]{0,160}playwright install/, "the cache-hit path must stay network-free");
  assert.match(action, /key: pw-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('package-lock\.json'\) \}\}/,
    "keyed on the lock file so a Playwright bump misses the cache");
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const driving = ciWorkflow.split("\n  driving-model:")[1].split("\n  renderer-macos:")[0];
  const goldens = ciWorkflow.split("\n  baseline-trial:")[1].split("\n  ci-verdict:")[0];
  for (const [name, job] of [["smoke", smoke], ["driving-model", driving], ["selected", selectedJob], ["baseline-trial", goldens]]) {
    assert.match(job, /uses: \.\/\.github\/actions\/playwright-chromium/, `${name} must take Chromium from the composite action`);
    assert.doesNotMatch(job.replace(/^\s*#.*$/gm, ""), /playwright install/, `${name} carries its own install step — use the action`);
  }
  // smoke's copy stays behind the ship filter: a run that ships nothing installs nothing.
  assert.match(smoke, /if: needs\.select\.outputs\.ships != 'false'\n\s+uses: \.\/\.github\/actions\/playwright-chromium/);
});

test("ship filter chooses a successful active deployment, not merely the newest record", () => {
  // IT IS ITS OWN JOB SINCE 2026-09-22 — it used to be the smoke matrix's first
  // step, which meant four shards each did a full checkout and `npm ci` before
  // asking, and each then made up to 21 API round-trips for the same string.
  assert.match(shipFilter, /deployments\?environment=github-pages&per_page=20/);
  assert.match(shipFilter, /d\.statuses_url/);
  assert.match(shipFilter, /success\) LIVE="\$SHA"; break/);
  assert.match(shipFilter, /inactive\|failure\|error\|queued\|pending\|in_progress/);
  assert.match(shipFilter, /no successful active github-pages deployment found/);
  assert.doesNotMatch(shipFilter, /j\[0\].*\.sha.*process\.stdout\.write/);
});

test("a GREEN run's junit survives — the timings CI already measures", () => {
  /* tools/ci/spec-timings.mjs was written to build a rolling per-test duration
     record and had nothing to merge: junit.xml was uploaded `if: failure()`
     only, so a PASSING run — the run whose timings you actually want — threw
     them away. 0 of 119 specs carry three samples, and select-budget.mjs bills
     the whole tree from one 2026-08-07 mean, which is what excludes ~66 % of
     the suite from the change-aware gate.

     Pinned on all three browser jobs, because one of them reverting is enough
     to make the record partial in a way nothing else would report. */
  for (const [job, bound] of [["smoke", "\n  driving-model:"], ["driving-model", "\n  renderer-macos:"],
                              ["selected", null]]) {
    const body = bound
      ? ciWorkflow.split(`\n  ${job}:`)[1].split(bound)[0]
      : selectedJob;
    assert.match(body, /- name: Spec timings \(junit/, `${job} no longer uploads its junit`);
    assert.match(body, /name: spec-timings-junit-/, `${job}'s timings artifact must be findable by pattern`);
    assert.match(body, /path: artifacts\/test-results-\*\/junit\.xml/, `${job} must upload junit, not the heavy trace bundle`);
    assert.match(body, /if-no-files-found: ignore/, `${job} must not fail a run for having no timings`);
    // The whole point: NOT failure()-only.
    const step = body.split("- name: Spec timings (junit")[1].split("- name:")[0];
    assert.match(step, /if: always\(\)/, `${job}'s timings upload is conditional on failure again`);
  }
});

test("the timings merge is its own workflow, and never pushes to the deploy branch", () => {
  /* IT CANNOT LIVE IN ci.yml. It needs `contents: write`, and pages.yml calls
     ci.yml as a reusable workflow granting only `contents: read` — GitHub
     validates every declared job's permissions at STARTUP, skipped jobs
     included. Train #2241 died `startup_failure` on exactly that, and a
     `contents: write` job in ci.yml would kill every train the same way. This
     test is the thing standing between a future "just move it into CI" and a
     dead release train. */
  const timings = fs.readFileSync(new URL("../../.github/workflows/spec-timings.yml", import.meta.url), "utf8");
  assert.match(timings, /^permissions:\n  contents: write\n  actions: read$/m,
    "the merge workflow needs write for the side branch and read for the artifacts");
  // ci.yml must NOT gain a write permission, or every Pages call fails at startup.
  assert.doesNotMatch(ciWorkflow, /^\s+contents: write\s*$/m,
    "a contents:write job in ci.yml fails startup validation on every pages.yml call (train #2241)");
  // Same refusal import-models.yml carries: the deploy branch by name.
  assert.match(timings, /claude\/f1-game-project-26h3ng\|""\|\*\[!a-z0-9\._\/-\]\*\)/,
    "the push must refuse the deploy branch by name, as import-models.yml does");
  // The bot's own hooks must not refuse the bot (2026-10-15, #2084): package.json
  // `prepare` activates .githooks on the runner, and pre-push calls every
  // non-fast-forward push "a force push". The rolling record IS a force push.
  assert.match(timings, /git -c core\.hooksPath=\/dev\/null push -f origin "\$TIMINGS_BRANCH"/,
    "the record push bypasses the prepare-installed pre-push hook (it blocked the bot on 18cb8f37 and c23ad312)");
  assert.doesNotMatch(timings, /^\s+git push -f origin/m, "no bare force push left that the hook can refuse");
  // FORCE-PUSHED, so the namespace matters as much as the name: `claude/*` is
  // where sessions branch, and a bot that force-pushes there lands on an open
  // PR's head sooner or later. `bot/` is import-models.yml's convention.
  assert.match(timings, /^  TIMINGS_BRANCH: bot\/[a-z0-9-]+$/m,
    "the force-pushed branch must live under bot/, never in the claude/ namespace sessions use");
  assert.doesNotMatch(timings, /git push[^\n]*claude\/f1-game-project-26h3ng/,
    "the timings bot may never push to the branch that ships");
  // The env bucket must match the stack that produced the numbers, not the
  // runner doing the merge — mixing buckets is what spec-timings.mjs forbids.
  assert.match(timings, /APEX_GL: llvmpipe/,
    "the browser jobs run llvmpipe; merging under another bucket fakes a regression");
  // And it must be serialised: two merges racing drop each other's samples.
  assert.match(timings, /concurrency:\n  group: spec-timings/);
  // IT MUST ACCUMULATE (2026-09-24). Merging into the deploy tip's copy and
  // force-pushing over the side branch dropped every earlier run's samples: 43
  // runs left 1 sample per spec on 5 specs, so no spec ever reached
  // select-budget's MIN_SAMPLES and the gate stayed on a 2026-08 constant.
  const start = timings.indexOf("Start from the accumulated record");
  assert.ok(start > 0 && start < timings.indexOf("Merge into tests/data/spec-timings.json"),
    "the side branch's record must be restored BEFORE the new junit is merged into it");
  assert.match(timings, /git fetch -q origin "\$TIMINGS_BRANCH"/);
  // The train's gate runs ci.yml as a reusable workflow, so its junit lands in
  // the PAGES run; a workflow_run on "CI" alone never sees those samples.
  // THE TRAIN ONLY (2026-09-30): listening to "CI" as well created a run per
  // PR completion that the job's `if:` then skipped — 119 skipped runs in
  // seven hours, queued one at a time, after the `branches:` filter landed.
  assert.match(timings, /workflows: \["Deploy to GitHub Pages"\]/,
    "the Pages train's gate is the one full smoke run on the tip, and the only trigger worth a run");
  assert.doesNotMatch(timings, /workflows: \[[^\]]*"CI"/,
    "a workflow_run on CI fires for every PR completion and skips (2026-09-29: 119 in 7 h)");
});

test("the ship filter is ONE job whose answer every smoke shard reads", () => {
  /* MEASURED 2026-09-22: the four smoke shards each spent 3m32s-5m02s on
     checkout + `npm ci` BEFORE the filter could say "do not run", and each then
     walked the deployments API for the same live SHA. The filter is a job now,
     `renderer-filter`'s shape, and smoke reads its output.

     The two things that must stay true, and that a careless revert would break:
     the filter job needs NO dependency install, and the smoke job still RUNS on
     a diff that ships nothing — it skips its steps. A skipped smoke job is not a
     passed one to pages.yml's `deploy: needs: ci` aggregate. */
  // 2026-10-15: a STEP of the `select` plan job (one runner already checked out
  // with full history for the slice plan and the spec selection), published as
  // a job output. Smoke still reads one answer; nothing installs twice.
  assert.ok(shipFilter, "the ship filter step is gone");
  assert.doesNotMatch(shipFilter.replace(/^\s*#.*$/gm, ""), /setup-apex|npm ci|playwright-chromium/,
    "the filter needs git, curl and node — it must not install anything of its own");
  assert.match(selectJob, /fetch-depth: 0/, "the plan job diffs against an arbitrarily old live SHA");
  assert.match(selectJob, /ships: \$\{\{ steps\.shipfilter\.outputs\.ships \}\}/, "select must publish the answer");
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, /^    needs: \[select\]$/m, "smoke must read the hoisted answer from the plan job");
  assert.doesNotMatch(smoke.replace(/^\s*#.*$/gm, ""), /deployments\?environment=github-pages/,
    "the filter body is back inside the matrix — that is four copies of one question");
  // EVERY step, checkout and setup-apex included, or the move buys nothing.
  // Exempt: a `failure()` step, which by definition cannot run when every step
  // before it was skipped, and which must stay reachable when one of them fails.
  const steps = smoke.split(/\n      - /).slice(1);
  const ungated = steps.filter((st) => !/needs\.select\.outputs\.ships != 'false'/.test(st)
    && !/^\s*if: failure\(\)(?: \|\| cancelled\(\))?\s*$/m.test(st));
  assert.deepEqual(ungated.map((st) => st.split("\n")[0].trim()), [],
    "a smoke step runs even when nothing ships; the install steps are most of the cost");
  // NOT a job-level `if:` on the filter's output: that would SKIP smoke, and a
  // skipped job is not a passed one to the deploy aggregate.
  assert.doesNotMatch(smoke, /^    if: .*needs\.select\.outputs\.ships/m,
    "smoke must run and skip its steps, never skip as a job");
});

test("the ship filter no longer polices the committed generation — the deploy stamps it", () => {
  // Until 2026-09-01 this step failed CI when deployed bytes changed without a
  // strictly newer committed build. pages.yml now stamps the generation from
  // the commit count at deploy time (deploy-stamp.test.mjs pins that), so the
  // committed number is a placeholder and a check on it would fail every push.
  assert.doesNotMatch(shipFilter, /bump-cache\.mjs --check --since/);
  assert.match(shipFilter, /stamps the generation from the commit count/, "the replacement rule is written where the check stood");
});

// The smoke per-test cap READ from the workflow, not restated here. It was
// pinned as the literal 420000 in two assertions, so every re-measurement of a
// runner budget — which the ci.yml header explicitly demands when the pool
// changes — also had to edit this file, and a guard you must edit to tell the
// truth is one people edit without reading. What matters is that the cap is
// EXPLICIT and that it is bigger than the `selected` gate; the value is ci.yml's
// to measure. Raised 420000 -> 900000 on 2026-08-30 after six straight deploys
// timed out (Pages #1848-#1854).
const SMOKE_TIMEOUT_MS = (() => {
  const m = ciWorkflow.match(/test:smoke -- --timeout=(\d+)/);
  assert.ok(m, "the smoke shards must pass an EXPLICIT --timeout; none found");
  return Number(m[1]);
})();

test("smoke's command-line timeout is not tripled inside the spec", () => {
  const smokeSpec = fs.readFileSync(new URL("../specs/smoke.spec.js", import.meta.url), "utf8");
  assert.ok(SMOKE_TIMEOUT_MS >= SELECTED_TIMEOUT_MS,
    `smoke's per-test cap is ${SMOKE_TIMEOUT_MS} ms, below the selected gate's ` +
    `${SELECTED_GATE.perTestTimeoutSec} s`);
  assert.doesNotMatch(smokeSpec, /^\s*test\.slow\s*\(/m,
    `test.slow triples the workflow's ${SMOKE_TIMEOUT_MS / 1000} s per-test timeout`);
});

test("the selected gate cannot rerun the fixed-budget smoke spec", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, new RegExp("test:smoke -- --timeout=" + SMOKE_TIMEOUT_MS));
  // The force-the-shards rule lives with the filter, which is its own job now.
  assert.match(shipFilter, /tests\/specs\/smoke\.spec\.js/,
    "test-only smoke edits must force the fixed shards even though they do not ship");
  assert.match(selectedJob, new RegExp(`--timeout=${SELECTED_TIMEOUT_MS}`),
    `ci.yml's selected step must run the timeout select-specs.mjs models ` +
    `(${SELECTED_GATE.perTestTimeoutSec} s)`);
  assert.doesNotMatch(selectedJob, new RegExp(`npm test -- .*smoke\\.spec\\.js.*--timeout=${SELECTED_TIMEOUT_MS}`));
  assert.match(selectStep, /COVERED BY FIXED BLOCKING GATE/,
    "the selection report must make its delegated coverage visible");
  assert.match(selectStep, /COVERED BY MANUAL OPT-IN/,
    "an env-gated spec (material-shimmer) must be named, not scheduled");
});

test("the golden-menu check is blocking AND never runs on the Pages call", () => {
  // E3 (2026-09-16): its `if:` was `pull_request || workflow_dispatch` under a
  // comment promising "never the Pages call" — but a called workflow sees the
  // CALLER's event, and "deploy now" is a workflow_dispatch of pages.yml, so
  // the trial ran in train #2348 (run 35066895398). An advisory job that leaks
  // into the deploy gate is one `continue-on-error` deletion away from
  // blocking it, so both halves of the contract are pinned here.
  const trial = (ciWorkflow.split("\n  baseline-trial:")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.ok(trial, "baseline-trial job missing");
  assert.doesNotMatch(trial, /^    continue-on-error: true$/m, "the baseline must fail the scheduled verdict");
  assert.match(trial, /inputs\.concurrency_key == ''/,
    "a Pages call carries a concurrency_key whatever its caller's event; that is the only reliable tell");
  assert.match(ciWorkflow, /- baseline-trial/,
    "the required CI aggregator must consume the baseline result");
});

test("every browser gate but the parity anchor runs on Mesa llvmpipe, and `gl: swiftshader` opts out", () => {
  // 2026-09-16, second pass. llvmpipe reached the smoke shards first (run
  // 35062479811: corner approach 17.8 s against a 214 s SwiftShader median,
  // every frame assertion holding) while `selected`'s oversize shards were
  // still 10-40 min of SwiftShader and were the gate's wall clock. A step that
  // sets APEX_GL without the apt+Xvfb step above it launches against a display
  // that is not there, so the two must travel together in every job — that
  // pairing is the thing YAML cannot state and this test can.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const drivingJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  driving-model:\n"), ciWorkflow.indexOf("\n  renderer-macos:\n"));
  // The apt + Xvfb + DISPLAY recipe is one composite action since 2026-09-22;
  // each job keeps the step NAME and the opt-out `if:` and takes the body by `uses:`.
  const mesa = fs.readFileSync(new URL("../../.github/actions/mesa-xvfb/action.yml", import.meta.url), "utf8");
  assert.match(mesa, /Xvfb :99 -screen 0 1280x800x24[^\n]*&\n[\s\S]*?echo "DISPLAY=:99" >> "\$GITHUB_ENV"/,
    "the action's Xvfb must export DISPLAY so the pinned test command line is unchanged");
  // …and WAIT for the server's socket before the first browser launch (2026-10-04).
  assert.match(mesa, /\[ -S \/tmp\/\.X11-unix\/X99 \] && break/, "the action waits for Xvfb's socket");
  for (const [name, job] of [["smoke", smokeJob], ["selected", selectedJob]]) {
    assert.match(job, /- name: Mesa llvmpipe \+ Xvfb\n\s+if: [^\n]*inputs\.gl != 'swiftshader'\n\s+uses: \.\/\.github\/actions\/mesa-xvfb/,
      `${name} must install Mesa + Xvfb through the action, and skip it on the \`gl: swiftshader\` opt-out`);
    assert.match(job, /APEX_GL: (llvmpipe|\$\{\{ \(?inputs\.gl != 'swiftshader'[^\n]*\}\})/,
      `${name} installs llvmpipe but never asks the browser for it`);
  }
  // The one carve-out: menu-baseline's goldens are SwiftShader captures (the
  // spec's own platform note), so a `selected` shard that carries it keeps the
  // ANGLE default: on the deploy tip `selected` still ran SwiftShader, and this
  // branch moves it to llvmpipe, so the carve-out lands with the swap.
  assert.match(selectedJob, /APEX_GL: \$\{\{ \(inputs\.gl != 'swiftshader' && !contains\(matrix\.specs, 'menu-baseline'\)\) && 'llvmpipe' \|\| '' \}\}/,
    "a selected shard carrying menu-baseline must stay on SwiftShader (its goldens are SwiftShader captures)");
  // driving-model is the parity anchor for the VM twins (physics-baseline.json):
  // a rasteriser swap under it is a separate, separately measured change.
  assert.doesNotMatch(drivingJob, /APEX_GL|llvmpipe/,
    "driving-model stays on SwiftShader — swap it deliberately, with its own measurement");
});

// THE RENDERER JOB (2026-09-01): the gfx group on macos-latest, the one runner
// image with a hardware (Metal) adapter. Three things about it are load-bearing
// and none of them is enforced by YAML: it must run on the macOS image, it must
// never carry the one flag that turns that image's GPU into SwiftShader, and it
// runs on the deploy gate when the live diff reaches renderer bytes. Pages
// consumes the aggregate of every job in ci.yml, so the selector and job
// condition must agree on that called-workflow path.
const gpuWorkflow = fs.readFileSync(new URL("../../.github/workflows/gpu-census.yml", import.meta.url), "utf8");
const rendererJob = ciWorkflow.split("\n  renderer-macos:")[1]?.split("\n  xr:")[0];
// A step of the `select` plan job since 2026-10-15 (a job of its own before).
const rendererFilter = ciWorkflow.split("      - name: Does this diff touch the renderer?\n")[1]?.split("\n      - name: ")[0];

test("the renderer specs have their own macOS job that runs test:gfx", () => {
  assert.ok(rendererJob, "renderer-macos job missing from ci.yml");
  assert.ok(rendererFilter, "the renderer filter step is missing from ci.yml");
  assert.match(rendererJob, /^    runs-on: macos-latest$/m, "the renderer job must run on the image with the Metal adapter");
  assert.match(rendererJob, /run: npm run test:gfx -- --config=playwright\.gpu\.config\.js --timeout=\d+/);
  // ONE worker: two Chromium instances on the shared Metal GPU wedged
  // Playwright's "Create context" in two of four runs (3500, 3509), 27 min
  // each on the per-test budget until a hand cancel (docs/notes/DEFECT-LEDGER.md).
  assert.match(rendererJob, /APEX_WORKERS: 1/);
  assert.match(rendererJob, /^    timeout-minutes: 30$/m);
  assert.deepEqual(report.rendererGate.specs, groupSpecs("test:gfx"));
  // >= 5, not 6: tlx-probes.spec.js left test:gfx with the 2026-09-03 WGX/TLX
  // spike-out. The five that remain are the GLX renderer specs this macOS job
  // exists for — an anti-vacuity floor, so it tracks the list.
  assert.ok(report.rendererGate.specs.length >= 5, `test:gfx resolved to ${report.rendererGate.specs.length} specs`);
  assert.equal(report.rendererGate.runsOn, "macos-latest");
  assert.equal(report.rendererGate.config, "playwright.gpu.config.js");
});

test("the renderer job never passes --use-angle=vulkan (it drops macOS to SwiftShader)", () => {
  // CI-RENDERING-PERFORMANCE.md §There IS a real GPU, trap 1: measured, not
  // a style preference. Checked on the UNCOMMENTED job text, because the
  // comment is allowed to name the flag in order to forbid it.
  const code = rendererJob.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /--use-angle=vulkan/);
  assert.doesNotMatch(code, /--use-angle=swiftshader/, "the whole point of the job is the hardware adapter");
  assert.equal(report.rendererGate.vulkanAngle, false);
  // The launch config it uses must remove the base pin and refuse any other
  // --use-angle — the base config stays untouched (protected contract file).
  const gpuCfg = fs.readFileSync(new URL("../../playwright.gpu.config.js", import.meta.url), "utf8");
  assert.match(gpuCfg, /import base from "\.\/playwright\.config\.js"/);
  assert.match(gpuCfg, /filter\(\(a\) => a !== SOFTWARE_ANGLE\)/);
  assert.match(gpuCfg, /channel: "chromium"/, "the headless shell has no navigator.gpu");
  assert.doesNotMatch(gpuCfg.replace(/^\s*\/\/.*$/gm, ""), /--use-angle=vulkan/);
  const baseCfg = fs.readFileSync(new URL("../../playwright.config.js", import.meta.url), "utf8");
  assert.match(baseCfg, /"--use-angle=swiftshader",/, "the base config still pins SwiftShader for every other run");
});

test("the renderer job proves the adapter before trusting the run, and uploads its report on every run", () => {
  assert.match(rendererJob, /node tools\/gfx\/gpu-census\.mjs --json census-macos\.json/);
  assert.match(rendererJob, /r\.anyHardware !== true/, "the tri-state census must be compared with === true, never coerced");
  assert.equal(report.rendererGate.censusGated, true);
  // always(), not failure(): a spec that fails its first attempt and passes
  // the retry leaves the job green, and a green job uploaded nothing — the
  // frames image-grade "shadows" attaches were unretrievable on run 3495
  // exactly when they were the next step (docs/notes/DEFECT-LEDGER.md).
  assert.match(rendererJob, /if: always\(\)\s*\n\s*uses: actions\/upload-artifact@/);
  assert.match(rendererJob, /name: playwright-artifacts-renderer-macos/);
  // The full browser, cached at macOS's path; never apt: the composite action
  // with the macOS browser dir and with-deps off (the cache-hit contract itself
  // is pinned on the action by the --with-deps test above).
  assert.match(rendererJob, /uses: \.\/\.github\/actions\/playwright-chromium\n\s+with:\n\s+browsers-path: ~\/Library\/Caches\/ms-playwright\n\s+with-deps: "false"/);
  assert.doesNotMatch(rendererJob.replace(/^\s*#.*$/gm, ""), /--with-deps/, "--with-deps is apt; the comment may name it, the step may not");
});

test("the renderer job is path-filtered on a cheap runner and joins the deploy gate for renderer releases", () => {
  assert.match(selectJob, /^    runs-on: ubuntu-latest$/m, "the filter must not allocate a macOS runner to say no (it is a step of the ubuntu plan job)");
  // 2026-09-02 (Actions minutes): the macOS runner bills at 10x Linux, so
  // drafts and topic-branch pushes stay off it. Ready (non-draft) PRs and Pages
  // calls that touch js/render/ MUST allocate it — otherwise a WGX/GLX rewrite can go
  // "green" with Metal never running. Nightly + `renderer_macos: true`
  // dispatch remain, and Pages calls use the live SHA as their comparison base.
  assert.match(rendererFilter, /if: \$\{\{ inputs\.concurrency_key != '' \|\| github\.event_name == 'schedule'/);
  assert.match(rendererFilter, /inputs\.concurrency_key != '' && inputs\.before_sha/);
  assert.match(rendererJob, /^    needs: select$/m);
  assert.match(rendererJob, /if: \$\{\{ .*needs\.select\.outputs\.renderer == 'true' && \(inputs\.concurrency_key != '' \|\| github\.event_name == 'schedule'/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      renderer_macos:\n(?:.*\n)*?        type: boolean\n(?:.*\n)*?        default: false\n/,
    "the dispatch must declare the renderer_macos opt-in, default off");
  assert.equal(report.rendererGate.deployGate, true,
    "renderer-macos must gate a Pages release when the selector routes renderer changes");
  assert.deepEqual(report.jobs.filter((j) => !j.deployGate).map((j) => j.name).sort(),
    ["xr"],
    "only the path-gated xr suite remains outside the deploy gate");
  // The path filter: every renderer backend plus the lighting modules the
  // gfx specs pin, the spec list DERIVED from package.json, fail-safe to run.
  // js/lighting/ as a DIRECTORY, not the six filenames this listed until
  // 2026-09-18: those still carried their pre-move js/game/ paths, so the
  // alternation could not match a lighting edit at all and this guard was
  // pinning the dead patterns in place. A directory prefix also routes the next
  // lighting module the day it lands.
  for (const p of ["js/render/", "js/lighting/"]) {
    assert.ok(rendererFilter.includes(p), `renderer filter does not route ${p}`);
  }
  assert.match(rendererFilter, /scripts\["test:gfx"\]/);
  assert.match(rendererFilter, /run_all "git diff failed"/);
  assert.match(rendererFilter, /run_all "before-sha \$BEFORE unreachable/);
  assert.doesNotMatch(rendererFilter, /renderer=false"[^\n]*\n[^\n]*exit 0/, "an unresolvable diff must RUN, never skip");
  // Pages calls reach it through ci.yml's selector and renderer condition.
  assert.doesNotMatch(pagesWorkflow, /renderer-macos|renderer-filter/);
});

test("the deploy-gate count includes what the renderer job runs", () => {
  for (const s of report.rendererGate.specs) {
    assert.ok(report.executed.includes(s),
      `${s} is not counted as deploy-gate coverage even though Pages can run renderer-macos`);
  }
  const gfx = report.viaGroup.find((g) => g.group === "test:gfx");
  assert.ok(gfx, "the tool no longer sees test:gfx at all");
  assert.equal(gfx.job, "renderer-macos");
  assert.equal(gfx.deployGate, true);
});

test("the smoke job carries no concurrency group of its own", () => {
  // 2026-10-15 to 10-16 every ready PR's one smoke shard shared a fleet-wide
  // `smoke-lane-1` group: a 2.6-min job that never failed (0 of 452) waited
  // p50 4.7 / p90 17.5 min behind other PRs' smoke and ended the critical
  // path of 40 of 210 green ready runs (the 2026-10-16 CI/CD review note,
  // #2333, finding 6). One job per run needs no lane; the workflow-level per-PR
  // group already replaces a superseded run. The selected legs keep theirs.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  assert.doesNotMatch(smokeJob, /^\s+concurrency:/m, "smoke must not wait in a lane; one job per run, runner queue only");
  assert.doesNotMatch(ciWorkflow, /smoke-lane/, "no fleet-wide smoke group anywhere in ci.yml");
});

test("smoke.spec.js is ONE shard on PRs and the Pages call; the wide nightly/dispatch run keeps four", () => {
  // Pages runs 1873/1876 measured smoke.spec.js at 30-37 min on one shared
  // runner — on SwiftShader. On llvmpipe (2026-09-16) the four shards did
  // 0.3-0.9 min of work each, and every job holds one of the account's 20
  // concurrent slots (docs/notes/CI-CAPACITY-2026-09-29.md). So the matrix is
  // one shard unless the run is the WIDE one (a whole browser group), which is
  // a schedule or dispatch with no Pages caller key.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  assert.match(smokeJob, /^\s+shard: \$\{\{ fromJSON\(\(inputs\.concurrency_key == '' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\)\) && '\[1, 2, 3, 4\]' \|\| '\[1\]'\) \}\}\s*$/m,
    "four shards exactly when the wide run can happen, one otherwise");
  assert.match(smokeJob, /run: npm run test:smoke -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/1/);
  // The one-shard claim rests on a measurement; keep it measured. llvmpipe
  // samples of smoke.spec.js must fit a single runner's cap with room to spare.
  const t = JSON.parse(fs.readFileSync(new URL("../data/spec-timings.json", import.meta.url), "utf8"));
  const walls = (t.specs["tests/specs/smoke.spec.js"]?.s || []).filter((x) => x[1] === "llvmpipe").map((x) => x[2]).sort((a, b) => a - b);
  assert.ok(walls.length >= 3, "smoke.spec.js has no llvmpipe history — the one-shard decision has no evidence");
  const capMin = Number(/timeout-minutes: \$\{\{ [^}]*\|\| (\d+) \}\}/.exec(smokeJob)?.[1]);
  assert.ok(walls.at(-1) * 5 < capMin * 60,
    `slowest llvmpipe smoke.spec.js run ${walls.at(-1)} s x5 must stay under the ${capMin}-min job cap on one runner`);
  // The nightly / dispatch step: a dispatch runs whichever browser group the
  // `group` input names, and a SCHEDULED run takes tonight's ROTATING group —
  // the runner-side verification for specs the SwiftShader dev box cannot time.
  // The rotation is the fix for a real hole: pinned to `tiny`, the nightly gave
  // 4 of 118 browser specs any scheduled coverage, and one sat red on the
  // deploy branch until a benchmarking run found it (DEFECT-LEDGER 2026-09-16).
  // Three things are load-bearing and none is stated by YAML: a dispatch still
  // WINS over the rotation, a scheduled run must actually consult the picker,
  // and `tiny` remains the last-resort fallback so a picker failure cannot
  // leave GROUP empty.
  assert.match(smokeJob, /GROUP: \$\{\{ \(github\.event_name == 'workflow_dispatch' && inputs\.group\) \|\| steps\.rota\.outputs\.GROUP \|\| 'tiny' \}\}/);
  assert.match(smokeJob, /- name: Pick tonight's rotating group\n\s+id: rota\n(?:\s+#.*\n)*\s+if: needs\.select\.outputs\.ships != 'false' && github\.event_name == 'schedule'\n\s+run: node tools\/ci\/nightly-group\.mjs >> "\$GITHUB_OUTPUT"/,
    "a scheduled run must pick its group from tools/ci/nightly-group.mjs, and only when the checkout above ran");
  assert.match(smokeJob, /run: npm run "test:\$\{GROUP:-tiny\}" -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      group:\n/, "the dispatch declares the group input");
});

test("gpu-census runs nightly staggered from the boot group, with the full check and its dispatch defaults", () => {
  // 2026-09-29: both were `17 3 * * *` and stacked on the same ~20 slots with
  // the boot-group nightly. Stagger them (ci.yml 04:17, gpu-census 05:47) and
  // keep neither on the old 03:17 pin.
  assert.match(ciWorkflow, /- cron: "17 4 \* \* \*"/,
    "ci.yml nightly must leave 03:17 (staggered to 04:17 UTC)");
  assert.match(gpuWorkflow, /^on:\s*\n  schedule:\s*\n    - cron: "47 5 \* \* \*"\s*\n  workflow_dispatch:/m,
    "gpu-census.yml nightly must be staggered (05:47 UTC), not shared with ci.yml");
  assert.doesNotMatch(ciWorkflow, /- cron: "17 3 \* \* \*"/);
  assert.doesNotMatch(gpuWorkflow, /- cron: "17 3 \* \* \*"/);
  // The inputs survive (a dispatch is still the way to ask a question)…
  for (const input of ["track:", "images:", "census_only:", "force:", "ls:"]) assert.match(gpuWorkflow, new RegExp(`^      ${input}`, "m"));
  // …and a scheduled run, where every input is empty, still gets the FULL
  // check on the default images and track — not census_only.
  // Plan job resolves inputs → outputs; census gates on those.
  assert.match(gpuWorkflow, /if: \$\{\{ needs\.plan\.outputs\.census_only != 'true' \}\}/);
  assert.match(gpuWorkflow, /if: \$\{\{ !cancelled\(\) && needs\.plan\.outputs\.census_only != 'true' \}\}/,
    "the Verdict must still gate a scheduled run");
  // macos-latest is the default for the nightly (2026-09-29) AND a dispatch
  // (2026-10-14): ubuntu/windows have no hardware adapter and their software
  // game checks were cancelled at the 30-min cap on every run measured.
  const wf = parseYAML(gpuWorkflow);
  assert.equal(wf.on.workflow_dispatch.inputs.images.default, "macos-latest", "a default dispatch must be the one image with a real GPU");
  const split = wf.jobs.plan.steps.find((s) => s.id === "split");
  assert.equal(split.env.INPUT_IMAGES, "${{ inputs.images || 'macos-latest' }}", "a scheduled run (no inputs) must get the real-GPU image");
  assert.match(split.run, /picked or \["macos-latest"\]/, "an images list with nothing valid falls back to the real GPU, not a software image");
  const trackUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"/g) || [];
  assert.equal(trackUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must use the plan-resolved track");
});

test("gpu-census: agents may still request by push; dispatches queue, push requests never cancel each other", () => {
  // The push-request path (2026-09-09) is how sessions WITHOUT dispatch rights
  // reach the real GPU (a GH App token gets 403 on workflow_dispatch), and it
  // is in daily use (2026-10-14: runs 38603534048, 38610120171, 38611116514).
  const wf = parseYAML(gpuWorkflow);
  assert.deepEqual(Object.keys(wf.on).sort(), ["push", "schedule", "workflow_dispatch"]);
  assert.match(gpuWorkflow, /paths: \["\.github\/gpu-census-request\.json"\]/,
    "agents without workflow_dispatch may push a request file on cursor/*");
  assert.deepEqual(wf.on.push.branches, ["cursor/**", "claude/**"]);
  const req = JSON.parse(fs.readFileSync(new URL("../../.github/gpu-census-request.json", import.meta.url), "utf8"));
  assert.ok(req && typeof req === "object", "the request file must stay valid JSON — the plan job json.load()s it");
  const split = wf.jobs.plan.steps.find((s) => s.id === "split");
  assert.match(split.run, /if os\.environ\.get\("EVENT"\) == "push":\n\s+with open\("\.github\/gpu-census-request\.json"/, "a push request reads ITS commit's file");
  assert.equal(split.env.EVENT, "${{ github.event_name }}");
  // DISPATCH: one run per ref, and a second dispatch QUEUES instead of
  // cancelling a census in flight (A/B arms used to cancel each other).
  // PUSH: one group per run_id, so two request legs never cancel or queue.
  // NIGHTLY: its own group, the only one that cancels.
  assert.equal(wf.concurrency.group, "gpu-census-${{ (github.event_name == 'push' && format('{0}-{1}', github.ref, github.run_id)) || (github.event_name == 'schedule' && 'nightly') || github.ref }}");
  assert.equal(wf.concurrency["cancel-in-progress"], "${{ github.event_name == 'schedule' }}");
  assert.equal(wf.concurrency.queue, undefined, "queue: max cannot combine with a cancel-in-progress that may be true");
  // INHERITED REQUESTS DO NOT RUN (2026-09-24): only the branch's own
  // first-parent, non-merge commits that edited the file. Executed against a
  // scratch repo in tests/unit/census-verdict.test.mjs.
  const gate = wf.jobs.plan.steps.find((s) => s.id === "gate");
  assert.match(gate.run, /git log --first-parent --no-merges --format=%h "\$BASE\.\.\$GITHUB_SHA" -- "\$F"/);
  assert.match(gate.run, /if \[ "\$EVENT" = "push" \] && \[ "\$BRANCH" != "claude\/f1-game-project-26h3ng" \]; then/, "the deploy branch always runs");
});

test("gpu-census: the nightly skips an unchanged renderer, fail-safe; legs time out inside the job cap", () => {
  const wf = parseYAML(gpuWorkflow);
  // G1: skip ONLY on a known, empty diff from the last GREEN nightly over the
  // renderer paths. Unknown base, API error or failed diff → run. Executed
  // against a scratch repo in tests/unit/census-verdict.test.mjs.
  const gate = wf.jobs.plan.steps.find((s) => s.id === "gate");
  assert.ok(gate, "the nightly gate step is gone");
  assert.equal(gate.if, undefined, "the gate runs on every event and decides by EVENT");
  assert.match(gate.run, /if \[ "\$EVENT" != "schedule" \]; then echo "run=true" >> "\$GITHUB_OUTPUT"; exit 0; fi/, "a dispatch always runs");
  assert.match(gate.run, /PATHS="js\/render js\/lighting tools\/gfx vendor \.github\/workflows\/gpu-census\.yml"/);
  assert.match(gate.run, /event=schedule&status=success&branch=\$BRANCH&per_page=1/, "the base is the last GREEN nightly");
  assert.equal((gate.run.match(/echo "run=false"/g) || []).length, 2, "exactly two paths skip: an inherited push request, an unchanged nightly");
  assert.equal(wf.jobs.plan.permissions.actions, "read");
  assert.equal(wf.jobs.census.if, "${{ needs.plan.outputs.run != 'false' }}", "an empty gate output (dispatch) must run");
  // G3: each leg ends red inside the job's 30-min cap, so a hang names its leg
  // instead of the whole job reading `cancelled`.
  const legs = wf.jobs.census.steps.filter((s) => /^Game check — /.test(s.name || ""));
  assert.equal(legs.length, 4);
  for (const s of legs) {
    assert.equal(s["timeout-minutes"], 6, `${s.name}: 6 min per leg (max measured 3.2)`);
    assert.equal(s["continue-on-error"], true, `${s.name}: a red leg must still reach the Verdict`);
  }
  assert.ok(legs.length * 6 < wf.jobs.census["timeout-minutes"], "four capped legs must fit inside the job cap");
  const up = wf.jobs.census.steps.find((s) => String(s.uses || "").startsWith("actions/upload-artifact@"));
  assert.equal(up.with["retention-days"], 7);
});

test("gpu-census threads a cam input (helmet default, chase for the mirror-mip cap) to every game check (hunt 4 H5)", () => {
  const wf = parseYAML(gpuWorkflow);
  const inputs = wf.on.workflow_dispatch.inputs;
  // Appended last: every earlier input keeps its name, position and default.
  assert.deepEqual(Object.keys(inputs), ["track", "images", "census_only", "force", "ls", "clock", "tod", "cam", "entry"]);
  assert.equal(inputs.track.default, "montreal"); assert.equal(inputs.clock.default, "12"); assert.equal(inputs.tod.default, "");
  assert.equal(inputs.cam.type, "choice");
  assert.deepEqual(inputs.cam.options, ["helmet", "chase", "chase>cockpit"]);
  assert.equal(inputs.cam.default, "helmet", "the default is the game's own camera, so a default dispatch measures what it did before");
  assert.ok(Object.keys(inputs).length <= 25, "GitHub caps workflow_dispatch at 25 inputs");
  const plan = wf.jobs.plan;
  assert.equal(plan.outputs.cam, "${{ steps.split.outputs.cam }}");
  const split = plan.steps.find((s) => s.id === "split");
  assert.equal(split.env.INPUT_CAM, "${{ inputs.cam || 'helmet' }}", "a scheduled run (no inputs) gets the default");
  assert.equal(wf.jobs.census.env.CENSUS_CAM, "${{ needs.plan.outputs.cam }}");
  const camUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"[^\n]*--cam "\$\{CENSUS_CAM:-helmet\}"/g) || [];
  assert.equal(camUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must drive the plan-resolved camera");
  // The plan's own allowlist, executed: a push request bypasses the choice list.
  const py = split.run.slice(split.run.indexOf("\n", split.run.indexOf("<<'PY'")) + 1).split("\nPY")[0];
  const camOf = (env) => {
    const r = cp.spawnSync("python3", ["-c", py], { encoding: "utf8", env: { PATH: process.env.PATH, EVENT: "workflow_dispatch", ...env } });
    if (r.error) return null;   // no python3 on this box: the static checks above still hold
    assert.equal(r.status, 0, r.stderr);
    return (r.stdout.match(/^cam=(.*)$/m) || [])[1];
  };
  const chase = camOf({ INPUT_CAM: "chase" });
  if (chase !== null) {
    assert.equal(chase, "chase");
    assert.equal(camOf({ INPUT_CAM: "chase>cockpit" }), "chase>cockpit");
    assert.equal(camOf({ INPUT_CAM: "chase>drone" }), "helmet", "only the listed switch is allowed");
    assert.equal(camOf({}), "helmet");
    assert.equal(camOf({ INPUT_CAM: "drone\nimages=[\"x\"]" }), "helmet", "anything off the allowlist falls back, newline and all");
  }
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /--cam ID {2,}player camera/, "gpu-game-check --help documents --cam");
  assert.match(ggc, /out\.cam = await bounded\(\(\) => page\.evaluate\(/);
  assert.ok(ggc.indexOf("out.cam = await bounded") < ggc.indexOf("out.raceCall = await bounded"), "the camera is set BEFORE race(), so race entry never draws through another one");
  assert.ok(ggc.indexOf("out.cam = await bounded") < ggc.indexOf("out.menu = await enterViaMenu("), "…and before the menu entry, whose car prep reads the camera");
});

test("gpu-census threads an entry input (api default; menu / menu-full = the player's RACE!) to every game check (hunt 5 E)", () => {
  const wf = parseYAML(gpuWorkflow);
  const inputs = wf.on.workflow_dispatch.inputs;
  assert.equal(Object.keys(inputs).at(-1), "entry", "appended LAST: every earlier input keeps its position");
  assert.equal(inputs.entry.type, "choice");
  assert.deepEqual(inputs.entry.options, ["api", "menu", "menu-full"]);
  assert.equal(inputs.entry.default, "api", "a default dispatch and the nightly enter as every earlier census did");
  assert.ok(Object.keys(inputs).length <= 25, "GitHub caps workflow_dispatch at 25 inputs");
  const plan = wf.jobs.plan, split = plan.steps.find((s) => s.id === "split");
  assert.equal(plan.outputs.entry, "${{ steps.split.outputs.entry }}");
  assert.equal(split.env.INPUT_ENTRY, "${{ inputs.entry || 'api' }}", "a scheduled run (no inputs) gets the default");
  assert.equal(wf.jobs.census.env.CENSUS_ENTRY, "${{ needs.plan.outputs.entry }}");
  const uses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"[^\n]*--entry "\$\{CENSUS_ENTRY:-api\}"/g) || [];
  assert.equal(uses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must enter the plan-resolved way");
  // The plan's allowlist, executed, for a PUSH request too (the request JSON bypasses the choice list).
  const py = split.run.slice(split.run.indexOf("\n", split.run.indexOf("<<'PY'")) + 1).split("\nPY")[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-plan-"));
  const outOf = (env, req) => {
    if (req) { fs.mkdirSync(path.join(dir, ".github"), { recursive: true }); fs.writeFileSync(path.join(dir, ".github/gpu-census-request.json"), JSON.stringify(req)); }
    const r = cp.spawnSync("python3", ["-c", py], { cwd: dir, encoding: "utf8",
      env: { PATH: process.env.PATH, EVENT: req ? "push" : "workflow_dispatch", ...env } });
    if (r.error) return null;   // no python3: the static checks above still hold
    assert.equal(r.status, 0, r.stderr);
    return Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  };
  try {
    const d = outOf({ INPUT_ENTRY: "menu" });
    if (d !== null) {
      assert.equal(d.entry, "menu");
      assert.equal(outOf({}).entry, "api");
      assert.equal(outOf({ INPUT_ENTRY: "menu-full" }).entry, "menu-full");
      assert.equal(outOf({ INPUT_ENTRY: "garage\nimages=[\"x\"]" }).entry, "api", "anything off the allowlist falls back, newline and all");
      const pushed = outOf({}, { images: "macos-latest", entry: "menu", cam: "chase>cockpit", ls: "apex26.tlxMirWarmLazy=1" });
      assert.equal(pushed.entry, "menu"); assert.equal(pushed.cam, "chase>cockpit"); assert.equal(pushed.ls, "apex26.tlxMirWarmLazy=1");
      assert.equal(pushed.images, '["macos-latest"]');
      assert.equal(outOf({}, { entry: "teleport" }).entry, "api", "a pushed request is allowlisted too");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // The tool records the entry and threads it.
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /--entry api\|menu\|menu-full {2,}how the race starts/, "--help documents --entry");
  assert.match(ggc, /glErrDrain: glErrDrainEveryPresent \? "present" : "beat", entry \}/, "the game JSON records which entry ran");
  assert.match(ggc, /if \(entry === "api"\) \{\n\s+out\.raceCall = await bounded/, "api keeps race() exactly as before");
  assert.match(ggc, /page\.waitForFunction\(menuPrepReady, null, \{ polling: 100, timeout: menuTimeout \}\)/, "the menu entry waits on the game's own prep signal");
  assert.ok(ggc.indexOf('locator("#rs-go").click') > ggc.indexOf("waitForFunction(menuPrepReady"), "START RACE only after the prep wait");
  assert.match(ggc, /out\.warmEnd = await bounded\(/, "memState().warm is read again after the window (the lazy mirror warm lands there)");
  // LoAF script attribution beside the longtask window, and the gap rows' callback count.
  assert.match(ggc, /\.observe\(\{ type: "long-animation-frame", buffered: true \}\)/);
  assert.match(ggc, /loaf: window\.__apexLoaf \|\| \[\], loafObserver: window\.__apexLoafObserver/, "the dump carries the LoAF series");
  assert.match(ggc, /out\.raceEntry\.loaf = _loaf;/, "written as raceEntry.loaf in the game JSON");
  assert.match(ggc, /prevFrameMs: _gFrameDur, prevCallbacks: _gFrameCb,/);
});

test("census-entry parses --entry / --cam A>B and gates START RACE on the menu prep (hunt 5 E)", async () => {
  const E = await import("../../tools/lib/census-entry.mjs");
  assert.deepEqual(E.ENTRIES, ["api", "menu", "menu-full"]);
  assert.equal(E.parseEntry(undefined), "api"); assert.equal(E.parseEntry(""), "api");
  assert.equal(E.parseEntry("menu"), "menu"); assert.equal(E.parseEntry(" menu-full "), "menu-full");
  assert.equal(E.parseEntry("garage"), null, "an unknown entry is refused, never silently api");
  assert.deepEqual(E.parseCam(null), { start: null, switchTo: null }, "no --cam = the game's default camera");
  assert.deepEqual(E.parseCam("chase"), { start: "chase", switchTo: null });
  assert.deepEqual(E.parseCam("chase>cockpit"), { start: "chase", switchTo: "cockpit" });
  for (const bad of ["chase>", ">cockpit", "a>b>c"]) assert.equal(E.parseCam(bad), null, bad);
  assert.equal(E.switchBeat(20), 10); assert.equal(E.switchBeat(15), 7);
  assert.equal(E.switchBeat(1), 1, "never the first beat: the switch lands inside the window");
  // menuPrepReady reads window.__apex.menuPrep() — run it against stand-in pages.
  const ready = { state: "menu", world: true, done: true, warmFrames: 0, warming: false };
  const at = (p) => { globalThis.window = { __apex: p === undefined ? undefined : { menuPrep: () => p } }; try { return E.menuPrepReady(); } finally { delete globalThis.window; } };
  assert.equal(at(ready), true);
  assert.equal(at(undefined), false, "a build with no __apex is not ready");
  assert.equal(at(null), false, "a build with no menuPrep hook is not ready");
  for (const [k, v] of [["state", "count"], ["world", false], ["done", false], ["warmFrames", 2], ["warming", true]])
    assert.equal(at({ ...ready, [k]: v }), false, `${k}=${v} is not ready`);
  assert.equal(at({ ...ready, warmable: false, warmed: false }), true, "GLX/WGX have no program warm: done is enough");
  // Serializable: Playwright ships the function's source, so it must not close over module scope.
  assert.doesNotMatch(String(E.menuPrepReady), /\bE\.|import|require/);
});

test("the census race gate passes an entry that requested NO warm instead of waiting for warm.done (hunt 5 E)", async () => {
  // Runs 491/492/502/503/505/507 read RACE NOT REACHED: the pack gate skipped
  // requestWarm, so no warm:* mark, no entry warm, and memState().warm.done never came.
  const { raceGate } = await import("../../tools/lib/census-entry.mjs");
  const run = ({ state = "race", warming = false, warm = { done: false }, tlx = true, marks = [{ n: "begin:startRace", t: 0 }], hook = true }, gate) => {
    globalThis.window = { __apex: { info: () => ({ state }), ...(hook ? { raceEntryProfile: () => ({ marks }) } : {}) } };
    if (gate) globalThis.window.__raceGate = gate;
    globalThis.GLX = tlx ? { __tlx: { memState: () => ({ warm }), warming: () => warming } } : {};
    try { return { ok: raceGate(), g: globalThis.window.__raceGate }; } finally { delete globalThis.window; delete globalThis.GLX; }
  };
  const begin = { n: "begin:startRace", t: 0 };
  // No warm mark at all (pack gate): passes once racing and not compiling, and records it.
  let r = run({ marks: [begin, { n: "debrisPrime:end", t: 900 }] });
  assert.equal(r.ok, true, "no warm requested: warm.done is not awaited");
  assert.equal(r.g.warmRequested, false); assert.equal(r.g.warmMark, null);
  // skipped-menu / noop: same, with the mark named.
  r = run({ marks: [begin, { n: "warm:skipped-menu", t: 900 }] });
  assert.equal(r.ok, true); assert.equal(r.g.warmMark, "warm:skipped-menu");
  r = run({ marks: [begin, { n: "warm:noop", t: 900 }], tlx: false, warm: null });
  assert.equal(r.ok, true); assert.equal(r.g.warmMark, "warm:noop");
  // ...but never while something compiles, nor before the race state.
  assert.equal(run({ marks: [begin], warming: true }).ok, false);
  assert.equal(run({ marks: [begin], state: "count" }).ok, false);
  // warm:request: the entry's warm must FINISH, exactly as before.
  const req = [begin, { n: "warm:request", t: 900 }];
  r = run({ marks: req, warm: { done: false } });
  assert.equal(r.ok, false, "a requested warm that has not finished holds the gate");
  assert.equal(r.g.warmRequested, true); assert.equal(r.g.warmMark, "warm:request");
  assert.equal(run({ marks: req, warm: { done: true } }).ok, true);
  // A build with no raceEntryProfile hook keeps the older rule: timeline done, or 5 s of race.
  assert.equal(run({ hook: false, warm: { done: false } }).ok, false);
  assert.equal(run({ hook: false, warm: { done: true } }).ok, true);
  // An unprofiled window (no begin: mark) does not count as "no warm requested".
  assert.equal(run({ marks: [], warm: { done: false } }).ok, false);
  assert.equal(run({ hook: false, warm: null }, { t0: performance.now() - 6000, saw: false }).ok, true, "no timeline: 5 s of race with none");
  assert.doesNotMatch(String(raceGate), /\bimport\b|require\(/, "serializable for page.waitForFunction");
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /await page\.waitForFunction\(raceGate, null, \{ polling: 100, timeout:/);
  assert.match(ggc, /out\.raceEntry\.warmRequested = out\.race \? out\.race\.warmRequested : null;/, "raceEntry.warmRequested in the game JSON");
  assert.match(ggc, /out\.raceEntry\.warmMark = out\.race \? out\.race\.warmMark : null;/);
});

test("gpu-census has a NATIVE WGX leg with hardware gates (bound, swapchain, gpuErrors)", () => {
  // Until 2026-09-02 the "webgpu" leg was three.js on WebGPU, so js/render/webgpu/
  // had no real-GPU evidence at all. The leg must run WGX itself and the
  // Verdict must fail a hardware run where WGX fell back or soft-presents.
  assert.match(gpuWorkflow, /- name: Game check — WGX \/ WebGPU \(native, opt-in\)/);
  assert.match(gpuWorkflow, /--backend webgpu \$LS \\\n\s+--json "game-wgx-\$\{\{ matrix\.image \}\}\.json"/);
  // The Verdict is tools/gfx/census-verdict.mjs since 2026-10-14 (audit G4);
  // its gates are EXECUTED against fixtures in census-verdict.test.mjs and
  // gfx-backend-canary.test.mjs. Here: the step runs it, and its source keeps
  // every leg and every hardware clause.
  const verdictStep = parseYAML(gpuWorkflow).jobs.census.steps.find((s) => /^Verdict — /.test(s.name || ""));
  assert.equal(verdictStep.run, "node tools/gfx/census-verdict.mjs", "the Verdict step runs the tool, not an inline script");
  assert.equal(verdictStep.env.IMAGE, "${{ matrix.image }}");
  const verdictSrc = fs.readFileSync(new URL("../../tools/gfx/census-verdict.mjs", import.meta.url), "utf8");
  assert.match(verdictSrc, /export const LEGS = \["webgpu", "webgl2", "glx", "wgx"\];/);
  assert.match(verdictSrc, /const tlxLeg = path3 === "webgpu" \|\| path3 === "webgl2";/,
    "the WGX leg must not be held to the TLX env-probe expectations");
  assert.match(verdictSrc, /if \(hardware && gfx\.wgx !== true\) bad\.push\(`wgx: WGX did not bind/);
  // The swapchain gate is conditioned on the PIN, not the UA: gpu-game-check
  // always launches headless (headlessUa=true in 65/65 runs), so the old
  // `headlessUa !== true` exemption could never let the clause fire.
  assert.match(verdictSrc, /else if \(hardware && cap == null && gfx\.wgxSoftPresent !== false\) \{/,
    "WGX off the swapchain with the native pin in force must fail a hardware run");
  assert.doesNotMatch(verdictSrc, /headlessUa !== true/, "the clause that could never fire stays deleted");
  assert.match(verdictSrc, /if \(hardware && tlxLeg && cap == null && be\.softBlit !== false\) \{/,
    "a TLX leg off the direct present path with the native pin in force must fail a hardware run");
  assert.match(verdictSrc, /process\.env|env\.CENSUS_LS/, "the tool reads the dispatch ls so an override is never gated");
  const check = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(check, /r\.wgx = typeof g\.softPresent === "function";/);
  assert.match(check, /r\.wgxSoftPresent = !!g\.softPresent\(\)/);
  // GLX exports softPresent too, so "has softPresent" alone read WGX-bound on a
  // WGX leg that fell back to GLX (hunt 4 I3): the bound api must say webgpu.
  assert.match(check, /if \(r\.wgx && r\.api === "webgl2" && !g\.__tlx\) r\.wgx = false;/);
  // THE PLAYER'S PRESENT PATH on every leg (hunt 4 I1/I3): the WGX and GLX
  // legs pin SCREENSHOTS = NATIVE like the two three.js legs, BEFORE $LS so a
  // dispatcher can still override it. Without it WGX soft-presented every
  // frame (20.8 vs 36.7 fps pinned, spa dusk) and GLX shot one stale blit.
  const pinned = gpuWorkflow.match(/^\s+--[^\n]*--ls apex26\.wgxCapture=0 [^\n]*$/gm) || [];
  assert.equal(pinned.length, 4, `every game-check leg pins apex26.wgxCapture=0 on its command line, found ${pinned.length}`);
  for (const line of pinned) {
    if (line.includes("$LS")) assert.ok(line.indexOf("wgxCapture=0") < line.indexOf("$LS"), "the pin must precede $LS so a dispatch can override it");
  }
});

test("docs-only pushes do not start CI (Actions minutes, 2026-09-02)", () => {
  // A commit that touches only docs / markdown / agent config ships nothing;
  // the guard suite that covers those trees runs locally on every edit. The
  // deploy branch is exempt by construction: it reaches this workflow through
  // pages.yml's `uses:` call, which no path filter touches.
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\npermissions:"));
  // NO push trigger since 2026-10-16 (CI/CD review #2333 finding 3): the deploy branch's
  // push starts pages.yml, which calls this workflow; the prose paths-ignore moved there.
  assert.doesNotMatch(onBlock, /^  push:/m, "ci.yml runs on pull_request, schedule, dispatch and workflow_call only");
  const pagesOn = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  const pushBlock = pagesOn.slice(pagesOn.indexOf("  push:"), pagesOn.indexOf("  schedule:"));
  const prBlock = onBlock.slice(onBlock.indexOf("  pull_request:"), onBlock.indexOf("  schedule:"));
  assert.match(pushBlock, /paths-ignore:\n(?:\s+- "[^"]+"\n)+/, "the train's push must carry a paths-ignore list");
  for (const p of ['"docs/**"', '"**/*.md"', '".claude/**"', '".cursor/**"']) assert.ok(pushBlock.includes(`- ${p}`), `${p} missing from paths-ignore`);
  // pull_request is NOT filtered (2026-09-30): every required check must report on every PR.
  assert.doesNotMatch(prBlock, /paths-ignore:/, "a path-filtered pull_request trigger leaves prose-only PRs unmergeable under branch protection");
  // The deploy branch's push must reach the train; the heavy browser jobs still
  // opt out of a draft PR's fast tier by the one shared expression.
  assert.doesNotMatch(pushBlock, /branches-ignore/, "deploy-branch pushes must reach pages.yml");
  // Draft synchronize is CI-free unless label run-ci (2026-10-15 fast-track); heavy
  // jobs still wait for `ready_for_review`, which must therefore be a trigger type.
  const fastTier = "!(inputs.concurrency_key == '' && ((github.event_name == 'push' && github.ref_name == 'claude/f1-game-project-26h3ng') || (github.event_name == 'pull_request' && github.event.pull_request.draft)))";
  assert.match(prBlock, /types: \[opened, synchronize, reopened, ready_for_review, labeled\]/,
    "labeled run-ci must be able to opt draft PRs into CI");
  assert.match(ciWorkflow, /draft-ci-skipped:/, "draft pushes without run-ci report a skip job");
  // Only the deploy branch's push starts a train; a topic branch runs through its PR.
  assert.match(pushBlock, /branches:\n\s+- claude\/f1-game-project-26h3ng\n/, "the train's push must be scoped to the deploy branch");
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  sweeps:\n"), ciWorkflow.indexOf("\n  sweeps-roll-up:\n"));
  assert.ok(smokeJob.includes(fastTier), "smoke must sit out the deploy branch's fast tier with the shared expression");
  assert.ok(shipFilter.includes(fastTier), "the ship filter step sits out the fast tier with the same expression");
  assert.ok(sweepsJob.includes(fastTier), "sweeps sit out the fast tier");
  assert.doesNotMatch(ciWorkflow, /smoke_only/, "the always-false smoke_only input and its guards are gone (2026-10-14)");
  for (const name of ["guards-a", "guards-b", "guards", "node-suites", "driving-model", "select"]) {
    const job = ciWorkflow.slice(ciWorkflow.indexOf(`\n  ${name}:\n`));
    const head = job.slice(0, job.indexOf("\n    steps:"));
    assert.ok(head.includes(PR_ACTIVE), `${name} must skip draft synchronize unless run-ci`);
    assert.ok(!head.includes(fastTier), `${name} is part of the fast tier and must not opt out of ship/draft heavy skip`);
  }
});

test("desktop pack-smoke is full-tier only (ready PRs, not drafts)", () => {
  const desktop = fs.readFileSync(new URL("../../.github/workflows/desktop.yml", import.meta.url), "utf8");
  assert.match(desktop, /types: \[opened, synchronize, reopened, ready_for_review\]/,
    "marking a draft ready must start pack-smoke when paths match");
  const pack = desktop.slice(desktop.indexOf("\n  pack-smoke:\n"), desktop.indexOf("\n  release-build:\n"));
  assert.match(pack, /github\.event\.pull_request\.draft == false/,
    "pack-smoke must skip draft PRs so Electron work stays on the full tier");
});

test("pages.yml is a release train: schedule + dispatch, one deploy branch, nothing-new short-circuit", () => {
  // THE TRAIN (2026-09-10). A deploy per push at 140-300 pushes a day (3-131 in 2026-10) meant a
  // 14-job gate per commit and gates cancelling each other in bursts. The
  // train ticks three times an hour off the hour, refuses any other branch,
  // stops in one slot when the live site already serves the tip, and hands
  // the gate the live commit as its diff base.
  const onBlock = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  // 2026-10-16 (CI/CD review #2333 finding 3): the train runs ON push to the deploy branch,
  // with ci.yml's prose paths-ignore; one running + one pending run per the workflow group.
  assert.match(onBlock, /^\s+push:\n\s+branches:\n\s+- claude\/f1-game-project-26h3ng\n\s+paths-ignore:/m, "the train runs on push to the deploy branch");
  assert.match(onBlock, /paths-ignore:\n(\s+- "[^"]+"\n){5}/, "the same five prose globs ci.yml ignored");
  // Hourly since 2026-10-14: three ticks an hour were delivered ~4.5 times a
  // day, and the train now re-arms itself (`rearm`), so the cron is a backstop.
  assert.match(onBlock, /schedule:\s*\n\s+- cron: "41 \* \* \* \*"/, "one tick an hour, off the hour");
  assert.match(onBlock, /workflow_dispatch:/, "a dispatch is 'deploy now'");
  assert.match(onBlock, /^\s+DEPLOY_BRANCH: claude\/f1-game-project-26h3ng\s*$/m, "the one declaration of the deploy branch");

  const verdict = pagesWorkflow.split("\n  verdict:")[1].split("\n  ci:")[0];
  assert.match(verdict, /"\$GITHUB_REF_NAME" != "\$DEPLOY_BRANCH"[\s\S]*?exit 1/, "a run off the deploy branch must fail before anything else");
  assert.match(verdict, /tools\/ci\/pages-live-sha\.sh "\$SITE_URL"/);
  assert.match(verdict, /nothing_new: \$\{\{ steps\.live\.outputs\.nothing_new \}\}/);
  assert.match(verdict, /since: \$\{\{ steps\.live\.outputs\.since \}\}/);
  assert.match(verdict, /git merge-base --is-ancestor "\$LIVE" "\$GITHUB_SHA"/, "the live commit is the diff base only when it is an ancestor");
  // The refusal to run off-branch must come BEFORE the network and the reuse lookup.
  assert.ok(verdict.indexOf("Refuse to run off the deploy branch") < verdict.indexOf("What is live"));

  const ciJob = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'$/m);
  assert.match(ciJob, /before_sha: \$\{\{ needs\.verdict\.outputs\.since \}\}/, "the gate diffs against what is live, never against a push's before");
  assert.doesNotMatch(pagesWorkflow, /github\.event\.before/, "there is no push event to read a before from");
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  assert.match(preflight, /needs\.verdict\.outputs\.nothing_new != 'true'/, "nothing new must never reach the environment");
});

test("ci.yml treats a Pages call as the gate it is, whatever the caller's event", () => {
  // A called workflow sees the CALLER's event: `schedule` for a train tick,
  // `workflow_dispatch` for "deploy now". Before the train, every filter keyed
  // on `push` and every wide-run switch keyed on schedule/dispatch — so the
  // train would have fail-safed into full sweeps AND run the 120-minute boot
  // group instead of smoke. concurrency_key is the one signal a Pages call
  // always carries, and it must decide all four places.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("      - name: Does this diff touch the geometry?"), ciWorkflow.indexOf("      # WHICH NODE SLICES DOES THIS DIFF NEED?"));
  assert.match(smokeJob, /timeout-minutes: \$\{\{ \(inputs\.concurrency_key == '' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\)\) && 120 \|\| 20 \}\}/,
    "a Pages call takes the smoke cap, never the wide run's 120");
  assert.match(smokeJob, /- name: Smoke\n(?:\s+#.*\n)*\s+if: needs\.select\.outputs\.ships != 'false' && \(inputs\.concurrency_key != '' \|\| \(github\.event_name != 'schedule' && github\.event_name != 'workflow_dispatch'\)\)/,
    "a Pages call always runs smoke.spec.js");
  assert.match(smokeJob, /- name: Boot group \(nightly\) \/ dispatched group\n\s+if: needs\.select\.outputs\.ships != 'false' && inputs\.concurrency_key == '' && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)/,
    "a Pages call never runs the wide group");
  // The ship filter is its own job since 2026-09-22; read it there, not in smoke.
  for (const [name, job] of [["ship filter", shipFilter], ["sweeps filter", sweepsJob]]) {
    assert.match(job, /CALLED: \$\{\{ inputs\.concurrency_key != '' \}\}/, `${name} must know it is a Pages call`);
    // The Pages-call branch is what this test is about, and it is identical in
    // both filters: $CALLED is consulted BEFORE any verdict on the caller's
    // event, so a train tick is never mistaken for the nightly.
    assert.match(job, /\*\) \[ "\$CALLED" = "true" \] \|\| run_all "event is '\$EVENT', not a push/,
      `${name} must accept a Pages call and still fail safe on the events it cannot resolve`);
  }
  // Which events each filter can resolve is NOT identical, and the difference is
  // the point. The smoke filter asks "does this commit ship?"; since
  // 2026-10-14 a pull request answers it from its own base AND the live
  // deployment (see the ship-filter behaviour test). The sweeps filter asks
  // "could this diff have moved a vertex?", and a pull request answers that
  // perfectly well from its own base — it used to fail-safe anyway and ran the
  // whole fleet on every PR (2026-09-22).
  assert.match(sweepsJob, /case "\$EVENT" in\n\s+push\|pull_request\) ;;/,
    "the sweeps filter resolves a pull request instead of running the fleet blind");
  // Read from the ship-filter JOB, which is where that filter lives since
  // 2026-09-22 — smokeJob no longer contains it.
  assert.match(shipFilter, /case "\$EVENT" in\n\s+push\) ;;\n\s+pull_request\) \[ "\$CALLED" = "true" \] \|\| IS_PR=true ;;/,
    "the ship filter resolves a ready pull request instead of fail-safing it into smoke");
  assert.match(selectJob, /EVENT: \$\{\{ inputs\.concurrency_key != '' && 'push' \|\| github\.event_name \}\}/);
  assert.match(selectJob, /PUSH_BEFORE: \$\{\{ inputs\.concurrency_key != '' && inputs\.before_sha \|\| \(inputs\.concurrency_key == '' && github\.event\.before\) \|\| '' \}\}/,
    "on a Pages call the plan's base is the train's live commit");
});

test("base-verdict.sh: the newest deploy-branch run strictly below this head, named jobs and all", () => {
  // The base-red line (docs/plans/research-2026-09-16/ci.md §5). Three ways to
  // get it wrong, all of them silent: take the newest run on the branch
  // (a tip that was never merged says nothing about this tree), take THIS
  // commit's own run (that is the push, not its base), or report a conclusion
  // without the job names (which is the whole reason a session opens the run).
  // A -> B -> C on the deploy line; X branches from A and is never merged.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "base-verdict-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q", "-b", "deploy"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  const commit = (msg) => { fs.writeFileSync(path.join(dir, "f.txt"), msg); git("add", "."); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD"); };
  const A = commit("A"), B = commit("B"), C = commit("C");
  git("checkout", "-q", "-b", "feature", A); const X = commit("X"); git("checkout", "-q", "deploy");

  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"),
    '#!/usr/bin/env bash\n[ "${FAKE_GH:-}" = fail ] && exit 1\n' +
    'case "$2" in\n' +
    '  */jobs*) node -e \'console.log(JSON.stringify({jobs:JSON.parse(process.env.FAKE_JOBS||"[]")}))\' ;;\n' +
    '  *) node -e \'console.log(JSON.stringify({workflow_runs:JSON.parse(process.env.FAKE_RUNS||"[]")}))\' ;;\n' +
    'esac\n');
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  const script = new URL("../../tools/ci/base-verdict.sh", import.meta.url).pathname;
  const ci = (sha, over = {}) => ({ id: 11, status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", head_sha: sha, ...over });
  const verdict = (runs, jobs = [], env = {}) => {
    const summary = path.join(dir, `summary-${Math.random().toString(36).slice(2)}.md`);
    const r = cp.spawnSync("bash", [script, C], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", DEPLOY_BRANCH: "deploy",
        GITHUB_STEP_SUMMARY: summary, FAKE_RUNS: JSON.stringify(runs), FAKE_JOBS: JSON.stringify(jobs), ...env },
    });
    return { status: r.status, out: r.stdout.trim(), summary: fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "" };
  };
  const failed = [{ name: "Per-circuit geometry sweeps", conclusion: "failure" },
    { name: "Selected specs (change-aware gate)", conclusion: "failure" },
    { name: "Structural guards", conclusion: "success" },
    { name: "Golden menus on a runner (trial, non-blocking)", conclusion: "skipped" }];

  const green = verdict([ci(B)]);
  assert.equal(green.out, `::notice::base ${B.slice(0, 7)} was green — run 11`);
  assert.match(green.summary, /### Base verdict/);
  assert.match(green.summary, new RegExp(`base \`${B.slice(0, 7)}\` was \\*\\*green\\*\\*`));

  const red = verdict([ci(B, { conclusion: "failure" })], failed);
  assert.equal(red.out, `::notice::base ${B.slice(0, 7)} was red on: Per-circuit geometry sweeps, Selected specs (change-aware gate) — run 11`);
  assert.doesNotMatch(red.out, /Structural guards|Golden menus/, "a green or skipped job is not a failure");
  assert.match(red.summary, /red on: Per-circuit geometry sweeps/);

  // THIS commit's own run is not a base, and neither is an unmerged branch tip.
  assert.match(verdict([ci(C, { id: 99, conclusion: "failure" }), ci(X, { id: 98, conclusion: "failure" }), ci(B)]).out,
    new RegExp(`base ${B.slice(0, 7)} was green`),
    "a run of this head, and a run on a commit that is not an ancestor, are both skipped");
  assert.match(verdict([ci(B, { id: 7 })], [], { GITHUB_RUN_ID: "7" }).out, /no completed ci\.yml \/ pages\.yml run/,
    "a run never reads itself as its own base");
  // 2026-10-16: the deploy branch's push starts pages.yml (the train calls ci.yml), so a
  // pages.yml run on the base IS the base verdict; any other workflow still is not.
  assert.match(verdict([ci(B, { path: ".github/workflows/pages.yml" })]).out, new RegExp(`base ${B.slice(0, 7)} was green`),
    "a pages.yml train on the base is the base verdict");
  assert.match(verdict([ci(B, { path: ".github/workflows/fleet.yml" })]).out, /no completed ci\.yml \/ pages\.yml run/,
    "another workflow's verdict is not this gate's base");
  assert.match(verdict([ci(B, { status: "in_progress", conclusion: null })]).out, /no completed ci\.yml \/ pages\.yml run/,
    "a run still going has no verdict to report");
  assert.match(verdict([ci(B, { conclusion: "cancelled" })], failed).out, /was red \(cancelled\) on: Per-circuit/,
    "a cancelled base is red, and says which kind");
  assert.match(verdict([ci(B, { conclusion: "failure" })], []).out, /no failing job named/,
    "a red with no job list still reports something");
  // Advisory: every failure path is one line and an exit 0.
  const broken = verdict([ci(B)], [], { FAKE_GH: "fail" });
  assert.match(broken.out, /^::notice::base verdict unavailable/);
  for (const r of [green, red, broken]) assert.equal(r.status, 0, "base-verdict must never fail the job it reports in");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ci.yml runs the base verdict where the checkout can answer it, and never lets it decide", () => {
  assert.match(selectJob, /fetch-depth: 0/, "ancestry is a git question; a shallow checkout answers it wrong");
  assert.match(selectJob, /- name: Was the base already red\?\n\s+if: always\(\)\n\s+continue-on-error: true/,
    "the base verdict reports on red runs too, and may never turn one red");
  assert.match(selectJob, /run: bash tools\/ci\/base-verdict\.sh "\$GITHUB_SHA"/);
  assert.match(selectJob, /actions: read/, "listing the deploy branch's runs needs actions:read on the job token");
  assert.doesNotMatch(selectJob, /needs\.[\w-]*base/, "nothing may depend on the report");
});

test("pages-live-sha.sh: the live apex-sha or nothing, and never a failure", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-live-"));
  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"),
    '#!/usr/bin/env bash\ncase "${FAKE_LIVE_SHA:-}" in\n  fail) exit 22 ;;\n  "") echo "<html></html>" ;;\n  *) echo "<meta name=\\"apex-build\\" content=\\"1\\">\n<meta name=\\"apex-sha\\" content=\\"${FAKE_LIVE_SHA}\\">" ;;\nesac\n');
  fs.chmodSync(path.join(bin, "curl"), 0o755);
  const script = new URL("../../tools/ci/pages-live-sha.sh", import.meta.url).pathname;
  const live = (fake) => cp.spawnSync("bash", [script, "https://example.test/site/"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LIVE_SHA: fake },
  });
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(live(sha).stdout.trim(), sha);
  assert.equal(live(sha).status, 0);
  assert.equal(live("").stdout.trim(), "", "no apex-sha in the shell: nothing");
  assert.equal(live("fail").stdout.trim(), "", "site unreadable: nothing");
  assert.equal(live("fail").status, 0, "unreadable must not fail the verdict job; the caller treats empty as unknown");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("every inline `node -e '…'` script in the workflows is syntactically complete (no apostrophe can close the quote early)", () => {
  // Run 33757119814 (2026-09-03): all four macOS game checks passed and the
  // Verdict step FAILED with "SyntaxError: Unexpected end of input" — a
  // comment inside the single-quoted script said "three's", the apostrophe
  // ended the bash string, and node received half a program. The gate
  // failed CLOSED that time; the same slip inside an `if (...)` could just as
  // easily drop a clause and pass. Extract every `node -e '` block as bash
  // would see it and compile it: a body that contains an apostrophe is
  // truncated by construction, and one that does not must still parse.
  const files = ["ci.yml", "pages.yml", "gpu-census.yml"];
  let blocks = 0;
  for (const f of files) {
    const text = fs.readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*node -e '$/.test(lines[i])) continue;
      const indent = lines[i].match(/^\s*/)[0];
      let j = i + 1;
      // The closing quote may carry a redirect / fallback on the same line
      // (`' > "$FILE" || run_all …` in ci.yml).
      while (j < lines.length && !(lines[j].startsWith(indent + "'") && /^'(\s|$)/.test(lines[j].slice(indent.length)))) j++;
      assert.ok(j < lines.length, `${f}:${i + 1}: node -e block never closes`);
      const body = lines.slice(i + 1, j).join("\n");
      const apos = body.split("\n").findIndex((l) => l.includes("'"));
      assert.equal(apos, -1,
        `${f}:${i + 1 + apos + 1}: an apostrophe inside a single-quoted node -e script ends the script there`);
      assert.doesNotThrow(() => new vm.Script(body, { filename: `${f}:${i + 1}` }),
        `${f}:${i + 1}: the inline node script does not parse`);
      blocks++;
      i = j;
    }
  }
  assert.ok(blocks >= 2, `found only ${blocks} node -e blocks — the extraction regex has stopped matching`);
});

/* ONE CHECK THAT ALWAYS REPORTS FOR THE CHANGE-AWARE GATE (2026-09-30).
 * Branch protection requires checks by name, and `selected`'s names carry
 * its matrix, so it could not be required: #491 merged with a red selected
 * gate on the merged tree and the tip sat red. `selected-verdict` has one
 * fixed name, runs whatever `selected` did, and reads the pair the way
 * poke-train did. Pinned so it cannot quietly stop covering a case. */
test("the two CI guard shards stop starting files after their first failure (--bail)", () => {
  const parsed = parseYAML(ciWorkflow).jobs;
  for (const [id, shard] of [["guards-a", "1/2"], ["guards-b", "2/2"]]) {
    const step = parsed[id].steps.find((st) => /tooling-fast\.mjs/.test(st.run || ""));
    assert.ok(step, `${id} runs tooling-fast`);
    assert.match(step.run, new RegExp(`--shard=${shard.replace("/", "\\/")} --bail$`),
      `${id} must pass --bail (2026-10-16 CI jobs review: red shards ran a mean 5.9 min past the first failure)`);
  }
  // The local edit loop keeps every failure visible.
  assert.doesNotMatch(JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts["test:tooling-fast"], /--bail/);
});

test("selected-verdict: one fixed-name check that always judges the change-aware gate", () => {
  const job = ciWorkflow.slice(ciWorkflow.indexOf("\n  selected-verdict:\n"), ciWorkflow.indexOf("\n  baseline-trial:\n"));
  assert.ok(job.length > 0, "the selected-verdict job is gone");
  assert.match(job, /^    name: Selected specs \(verdict\)$/m, "the required-check name; branch protection names it");
  assert.match(job, /^    needs: \[select, selected, guards\]$/m);
  // Every event that runs `select` — push, pull_request, the Pages call — gets
  // the verdict (no merge_group since 2026-10-14; no smoke_only either).
  assert.match(job, /^    if: \$\{\{ .*!cancelled\(\) && \(github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \|\| inputs\.concurrency_key != ''\).*\}\}$/m,
    "the required name reports on every push, PR and Pages call");
  assert.doesNotMatch(job, /^    if: \$\{\{ always\(\)/m, "always() turned a superseded run's cancelled `selected` into a red verdict");
  // The reading: select must pass; selected passes or is skipped; and (since
  // 2026-10-04) ANY dropped routed spec is a red off the train, whether or not
  // `selected` ran — the dropped-count used to be read only on a skip.
  assert.match(job, /GUARDS: \$\{\{ needs\.guards\.result \}\}/);
  assert.match(job, /selected-gate-verdict\.mjs/, "verdict logic is the shared script");
  // Execute the policy rather than requiring a comment that blesses a failure.
  for (const result of ["cancelled", "failure"]) {
    assert.equal(selectedGateVerdict({ select: "success", selected: result, guards: "success",
      evidence: { started: [], junit: [], downloadFailed: false } }).ok, false,
    "a selected leg with no execution evidence must remain red");
  }
  assert.match(job, /Every shard's junit[\s\S]*One answer for the change-aware gate/,
    "junit is downloaded before the decision step");
  // It joins the Pages aggregate like every other job (no needs on the renderer chain).
  const verdict = report.jobs.find((j) => j.name === "selected-verdict");
  assert.ok(verdict && verdict.deployGate, "selected-verdict must be in the deploy gate");
  // The matrix job's name still varies, which is the whole reason this exists.
  assert.match(ciWorkflow, /^    name: Selected specs \(change-aware gate\)$/m);
  assert.match(ciWorkflow, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.shards\) \}\}/);
});

test("every workflow job carries a cap, and the Pages publishable check holds no Pages token", () => {
  /* 2026-10-04: five jobs ran under the 360-minute default — pages.yml's
     `deploy` among them, inside the never-cancelled `pages` lock, so one hang
     could wedge every later deploy for six hours. `publishable` inherited the
     workflow's pages: write + id-token: write to run one read-only script. */
  const dir = new URL("../../.github/workflows/", import.meta.url);
  const missing = [];
  for (const f of fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const wf = parseYAML(fs.readFileSync(new URL(f, dir), "utf8"));
    for (const [id, job] of Object.entries(wf.jobs || {})) {
      if (job.uses) continue;   // a reusable-workflow call: its own jobs carry caps
      if (job["timeout-minutes"] == null) missing.push(`${f}:${id}`);
    }
  }
  assert.deepEqual(missing, [], "a job with no timeout-minutes runs for up to 360 minutes on a hang");
  const pages = parseYAML(pagesWorkflow);
  assert.deepEqual(pages.jobs.publishable.permissions, { contents: "read" });
  assert.ok(pages.jobs.deploy["timeout-minutes"] <= 30, "the deploy job holds the Pages lock: keep its cap tight");
});

/* ACTIONS AUDIT 2026-10-14 (ci.yml lane): the five full-history checkouts that
 * still fetched every blob (C6), the dead merge-queue trigger (finding 7), and
 * the ready-PR ship filter (C2a). */
test("every fetch-depth: 0 checkout in ci.yml is blob-less (C6), and merge_group is gone (finding 7)", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  const full = [];
  for (const [id, job] of Object.entries(jobs)) {
    for (const st of job.steps || []) {
      if (!/^actions\/checkout@/.test(st.uses || "") || st.with?.["fetch-depth"] !== 0) continue;
      full.push(id);
      assert.equal(st.with.filter, "blob:none", `${id}: a full-history checkout fetches every blob unless filtered (25 s vs 9 s measured)`);
    }
  }
  for (const id of ["guards-a", "guards-b", "select", "sweeps-parts"]) assert.ok(full.includes(id), `${id} still needs its full history`);
  assert.ok(!full.includes("guards"), "the guards aggregator checks out nothing since 2026-10-15 (ratchets/audit run in tooling B)");
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\njobs:\n"));
  assert.doesNotMatch(onBlock, /^  merge_group:/m, "merge queues need an organisation-owned repo; the trigger never fired");
  assert.doesNotMatch(ciWorkflow.replace(/^\s*#.*$/gm, ""), /merge_group/, "no expression still branches on merge_group");
});

test("ship-filter: a ready PR skips smoke only when neither its own diff nor its base ships anything new (C2a)", () => {
  const step = parseYAML(ciWorkflow).jobs.select.steps.find((st) => st.id === "shipfilter");
  assert.ok(step && step.run, "the ship filter step is gone");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ship-filter-"));
  try {
    const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
    git("init", "-q", "-b", "deploy"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
    // The filter's two repo inputs: the staged allow-list (stubbed: a file and
    // a directory, like index.html and js/) and the real ci-pr-base.sh.
    write("tools/desktop/stage-files.mjs", 'export function stagedNames() { return ["index.html", "app"]; }\n');
    write("tools/ci/ci-pr-base.sh", fs.readFileSync(new URL("../../tools/ci/ci-pr-base.sh", import.meta.url), "utf8"));
    write("index.html", "<!doctype html>\n"); write("app/a.js", "1\n"); write("notes/x.txt", "x\n"); write("tests/specs/smoke.spec.js", "//\n");
    git("add", "-A"); git("commit", "-q", "-m", "live"); const LIVE = git("rev-parse", "HEAD");
    // A PR branch for each shape, all forked from the live commit.
    const branch = (name, file, body) => { git("checkout", "-q", "-b", name, LIVE); write(file, body); git("add", "-A"); git("commit", "-q", "-m", name); };
    branch("docs", "notes/x.txt", "y\n");
    branch("code", "app/b.js", "2\n");
    branch("smoke", "tests/specs/smoke.spec.js", "// edited\n");
    // The deploy branch moves past live with an unpublished app/ (js/) change.
    git("checkout", "-q", "deploy"); write("app/a.js", "unpublished\n"); git("commit", "-q", "-am", "ahead"); const AHEAD = git("rev-parse", "HEAD");
    // refs/pull/N/merge: first parent = the base tip the merge was built on.
    const merge = (base, head) => { git("checkout", "-q", "--detach", base); git("merge", "-q", "--no-ff", "-m", `m ${head}`, head); return git("rev-parse", "HEAD"); };

    const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
    const calls = path.join(dir, "curl-calls.log");
    fs.writeFileSync(path.join(bin, "curl"), "#!/usr/bin/env bash\n" +
      `url="\${@: -1}"; echo "$url" >> "${calls}"\n` +
      '[ -n "${FAKE_LIVE:-}" ] || exit 7\n' +
      'case "$url" in\n' +
      '  *deployments\\?environment=*) printf \'[{"sha":"%s","statuses_url":"https://api.test/statuses/1"}]\' "$FAKE_LIVE" ;;\n' +
      '  *statuses*) printf \'[{"state":"success"}]\' ;;\n' +
      '  *) exit 7 ;;\n' +
      'esac\n');
    fs.chmodSync(path.join(bin, "curl"), 0o755);
    const scriptFile = path.join(dir, "step.sh");
    fs.writeFileSync(scriptFile, step.run);
    const run = (sha, env) => {
      git("checkout", "-q", "--detach", sha);
      fs.rmSync(calls, { force: true });
      const out = path.join(dir, `out-${Math.random().toString(36).slice(2)}`);
      const r = cp.spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", scriptFile], { cwd: dir, encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: out, GITHUB_SHA: sha, GITHUB_REPOSITORY: "o/r",
          RUNNER_TEMP: dir, GH_TOKEN: "t", CALLED: "false", FAKE_LIVE: LIVE, PR_BASE: "", ...env } });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const ships = /ships=(true|false)/.exec(fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "")?.[1];
      return { ships, log: r.stdout, api: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).length : 0 };
    };
    const pr = (base, head) => run(merge(base, head), { EVENT: "pull_request", PR_BASE: base });

    const docsOnLive = pr(LIVE, "docs");
    assert.equal(docsOnLive.ships, "false", docsOnLive.log);
    assert.match(docsOnLive.log, /SKIPPING SMOKE/);
    const docsOnAhead = pr(AHEAD, "docs");
    assert.equal(docsOnAhead.ships, "true", "a docs PR on a base with an unpublished app/ (js/) change still boots it: pages.yml may reuse this run as the gate");
    assert.match(docsOnAhead.log, /the diff touches a shipped path \(app\)/);
    const code = pr(LIVE, "code");
    assert.equal(code.ships, "true");
    assert.match(code.log, /the PR touches a shipped path \(app\)/);
    assert.equal(code.api, 0, "a PR that ships something decides without the deployments API");
    const smoke = pr(LIVE, "smoke");
    assert.equal(smoke.ships, "true");
    assert.match(smoke.log, /fixed smoke spec/);
    // Fail safe: no merge commit and no usable event base -> run smoke.
    const lost = run(git("rev-parse", "docs"), { EVENT: "pull_request", PR_BASE: "1234567890123456789012345678901234567890" });
    assert.equal(lost.ships, "true");
    assert.match(lost.log, /unreachable/);
    assert.equal(run(git("rev-parse", "docs"), { EVENT: "pull_request", PR_BASE: "" }).ships, "true", "no base at all runs smoke");
    // An unreadable live deployment on the PR path still runs smoke.
    assert.equal(run(merge(LIVE, "docs"), { EVENT: "pull_request", PR_BASE: LIVE, FAKE_LIVE: "" }).ships, "true");
    // The push and Pages paths are unchanged: diff against live.
    assert.equal(run(merge(LIVE, "docs"), { EVENT: "push" }).ships, "false");
    assert.equal(run(AHEAD, { EVENT: "schedule", CALLED: "true" }).ships, "true");
    assert.equal(run(AHEAD, { EVENT: "schedule" }).ships, "true", "an uncalled nightly is not a ship question: run smoke");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// #2179 / #2184 (2026-10-15): the two triggers that queued CI for nothing.
test("ci.yml runs on PRs into the deploy branch only, and a label event other than run-ci on a draft runs nothing", () => {
  const wf = parseYAML(ciWorkflow);
  // #2179: `branches` on pull_request filters the BASE. Survey PRs into
  // track-survey-assets started the full ready tier seconds before merging.
  assert.deepEqual(wf.on.pull_request.branches, ["claude/f1-game-project-26h3ng"],
    "pull_request must be scoped to PRs whose base is the deploy branch");
  assert.equal(wf.on.pull_request["branches-ignore"], undefined);
  assert.ok(wf.on.pull_request.types.includes("labeled"), "run-ci on a draft still needs the labeled trigger");
  // #2184: the label-noise predicate, written once per place it is used.
  const NOISE = "(github.event_name == 'pull_request' && github.event.action == 'labeled' && (github.event.label.name != 'run-ci' || !github.event.pull_request.draft))";
  const LABEL_OK = "(github.event.action != 'labeled' || (github.event.label.name == 'run-ci' && github.event.pull_request.draft))";
  // 1. Its own group, BEFORE the head-ref term: it can never cancel the PR's live run.
  const group = wf.concurrency.group;
  assert.ok(group.includes(`${NOISE} && format('label-{0}', github.run_id))`), "a label-noise run gets a throwaway group");
  assert.ok(group.indexOf(NOISE) < group.indexOf("github.event.pull_request.head.ref"), "the throwaway group must win over the head ref");
  assert.ok(group.indexOf("inputs.concurrency_key") < group.indexOf(NOISE), "a Pages call's key still comes first");
  // 2. Every job skips on it (skipped jobs take no runner), so the run ends in seconds.
  for (const [id, job] of Object.entries(wf.jobs)) {
    const cond = String(job.if || "");
    if (id === "draft-ci-skipped") assert.ok(cond.includes("github.event.action != 'labeled'"), "the skip notice is not re-posted by a label event");
    else assert.ok(cond.includes(LABEL_OK), `job ${id} must skip a label event other than run-ci on a draft`);
  }
  // 3. A skipped job reports SUCCESS, so the noise run's verdict must not carry the required name.
  assert.ok(wf.jobs["ci-verdict"].name.startsWith(`\${{ ${NOISE} && 'CI label event (ignored)' || `));
  assert.ok(wf.jobs["ci-verdict"].name.endsWith("|| 'CI' }}"));
  // 4. Tools drop it by title (ci-watch.mjs labelNoiseRun, reuse-draft-fast.sh).
  assert.equal(wf["run-name"], `\${{ ${NOISE} && format('CI ignored: label {0}', github.event.label.name) || '' }}`);
  const reuse = fs.readFileSync(new URL("../../tools/ci/reuse-draft-fast.sh", import.meta.url), "utf8");
  assert.ok(reuse.includes("^CI ignored: label ") && reuse.includes('"Structural guards (tooling A)"'),
    "a green run whose tooling A did not run is never reused as the fast tier");
  // run-ci is a documented label, and the docs say what it buys (no selected browser specs on a draft).
  const labels = JSON.parse(fs.readFileSync(new URL("../../.github/labels.json", import.meta.url), "utf8"));
  assert.ok(labels.some((l) => l.name === "run-ci"), ".github/labels.json documents run-ci");
  assert.match(String(wf.jobs.selected.if), /!\(github\.event_name == 'pull_request' && github\.event\.pull_request\.draft\)/,
    "the selected legs skip every draft; the header and docs/TESTING.md say so");
});

test("geometry planning avoids empty fanout without guessing an unknown diff is empty", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  const filter = jobs.select.steps.find((s) => s.id === "geometry");
  assert.ok(filter, "the shared planner must compute geometry even when fast-tier work is reused");
  assert.equal(filter.if, undefined, "geometry planning cannot sit behind fast_tier_run reuse");
  assert.deepEqual(jobs.sweeps.needs, ["select"]);
  assert.match(jobs.sweeps.if, /needs\.select\.outputs\.geometry != 'false' \|\| needs\.select\.outputs\.geometry_targeted != ''/);
  assert.ok(!jobs.sweeps.steps.some((s) => s.name === filter.name), "shards must consume the shared decision");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geometry-workflow-"));
  try {
    // Run the workflow's actual shell with a controlled changed-path list,
    // retaining the real package suite list and real geometry routing module.
    fs.writeFileSync(path.join(dir, "git"), '#!/bin/sh\ncase "$1" in\ncat-file) exit 0;;\ndiff) printf "%s\\n" "$FIXTURE_CHANGED";;\n*) exit 1;;\nesac\n', { mode: 0o755 });
    const run = (changed, before = "known-base", event = "push", called = "false") => {
      const output = path.join(dir, "outputs");
      fs.writeFileSync(output, "");
      const result = cp.spawnSync("bash", ["-e", "-c", filter.run], {
        cwd: new URL("../..", import.meta.url), encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_CHANGED: changed,
          BEFORE: before, GITHUB_SHA: "head", EVENT: event, CALLED: called,
          RUNNER_TEMP: dir, GITHUB_OUTPUT: output }
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return Object.fromEntries(fs.readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((l) => {
        const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)];
      }));
    };
    assert.deepEqual(run("README.md"), { geometry: "false", targeted: "" });
    assert.equal(run("js/track/tracks.js").geometry, "true");
    const targeted = run("js/lighting/lighting.js");
    assert.equal(targeted.geometry, "false");
    assert.match(targeted.targeted, /tests\/unit\//, "a targeted change still runs its sweep suites");
    assert.equal(run("README.md", "").geometry, "true", "missing base must run the full fleet");
    assert.equal(run("README.md", "live", "schedule", "true").geometry, "false", "a Pages call uses its live base rather than becoming the nightly");
    assert.equal(run("README.md", "base", "workflow_dispatch").geometry, "true", "direct dispatch stays fail-safe full");
    assert.equal(run("README.md", "base", "schedule").geometry, "true", "direct nightly stays fail-safe full");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("geometry rollup accepts only successful shards or a proven empty plan", () => {
  const job = parseYAML(ciWorkflow).jobs["sweeps-roll-up"];
  const run = job.steps[0].run;
  for (const [result, geometry, targeted, ok] of [
    ["success", "true", "", true], ["skipped", "false", "", true],
    ["skipped", "", "", false], ["skipped", "true", "", false],
    ["skipped", "false", "tests/unit/car-front-wing-width.test.mjs", false],
    ["failure", "false", "", false], ["cancelled", "false", "", false]
  ]) {
    const r = cp.spawnSync("bash", ["-e", "-c", run], { env: { ...process.env,
      SWEEPS_RESULT: result, GEOMETRY: geometry, TARGETED: targeted } });
    assert.equal(r.status === 0, ok, `${result}/${geometry}/${targeted}`);
  }
  assert.match(job.if, /needs\.select\.result == 'success'/, "a broken planner must not bless skipped shards");
});

test("draft opt-out and cancellation diagnostics preserve truthful checks and evidence", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  assert.match(jobs["sweeps-parts"].if, /!github\.event\.pull_request\.draft \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'run-ci'\)/);
  assert.match(jobs["ci-verdict"].name, /CI draft \(opted out\)/);
  for (const id of ["smoke", "driving-model", "xr"]) {
    const upload = jobs[id].steps.find((s) => s.name === "Failure artifacts");
    assert.equal(upload.if, "failure() || cancelled()", `${id} must keep cancellation diagnostics`);
    assert.equal(upload.with["if-no-files-found"], "ignore");
  }
  const browser = parseYAML(fs.readFileSync(new URL("../../.github/workflows/browser-group.yml", import.meta.url), "utf8"));
  assert.ok(browser.jobs.group.steps.some((s) => s.if === "failure() || cancelled()" && s.uses?.startsWith("actions/upload-artifact@")));
  const marker = jobs.selected.steps.find((s) => s.name === "Upload the run-step marker");
  assert.equal(marker.with["retention-days"], 7, "verdict evidence must last as long as junit");
  const gpu = parseYAML(fs.readFileSync(new URL("../../.github/workflows/gpu-census.yml", import.meta.url), "utf8"));
  const verdict = Object.values(gpu.jobs).flatMap((j) => j.steps || []).find((s) => s.name?.startsWith("Verdict —"));
  assert.match(verdict.if, /!cancelled\(\)/);
});

// #2169: five tools/ci/*.sh copies of inline ci.yml steps sat unused (one had
// drifted from its step) until someone noticed. A step script lives only while
// a workflow, another tool or a test cites it; delete it or wire it in.
test("every tools/ci/*.sh is cited by a workflow, another tool or a test", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const self = path.relative(root, new URL(import.meta.url).pathname);
  const scripts = fs.readdirSync(path.join(root, "tools/ci")).filter((f) => f.endsWith(".sh"));
  assert.ok(scripts.length > 0, "no tools/ci/*.sh found — the scan is broken");
  const orphans = scripts.filter((f) => {
    const out = cp.spawnSync("git", ["grep", "-l", "-F", f, "--", ".github/workflows", "tools", "tests",
      `:!tools/ci/${f}`, ":!tools/README.md", `:!${self}`], { cwd: root, encoding: "utf8" });
    return !out.stdout.trim();
  });
  assert.deepEqual(orphans, [], `orphan step scripts (nothing runs them): ${orphans.join(", ")}`);
});
