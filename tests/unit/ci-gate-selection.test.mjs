// ci-gate-selection — the change-aware gate: change filters, event/base resolution, verdict jobs, node-suite planning and the XR filter.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import { parse as parseYAML } from "yaml";
import { report } from "../../tools/ci/ci-coverage.mjs";
import { ciWorkflow, pagesWorkflow, selectJob, selectedJob, selectStep } from "../helpers/ci-workflow.mjs";

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
  assert.match(body, /^    name: \$\{\{ \(github\.event_name == 'pull_request' && github\.event\.action == 'labeled' && [^\n]* && 'CI label event \(ignored\)' \|\| [^\n]*'CI draft \(opted out\)' \|\| \(github\.event_name == 'pull_request' && github\.event\.pull_request\.draft\) && 'CI \(draft fast tier\)' \|\| 'CI' \}\}$/m,
    "the required-check display name must be the stable `CI` on a non-draft run; a draft fast tier is named apart (#2664)");
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
  // Decisions D1/D2 (the CI selection plan, PR #2560 §6): no draft
  // (run-ci or not) and no Pages call runs the node slices; ready PRs, the
  // nightly and dispatch do.
  assert.ok(nodeIf.includes("&& !(github.event_name == 'pull_request' && github.event.pull_request.draft) &&"),
    "node-suites skips every draft, run-ci included");
  assert.match(nodeIf, /inputs\.concurrency_key == ''/, "node-suites skips on the Pages call");
  const steps = node.split(/\n      - /).slice(1);
  const setup = steps.filter((st) => /^uses: actions\/checkout@|^uses: \.\/\.github\/actions\/setup-apex|^name: Plan the slices for this diff/.test(st));
  assert.equal(setup.length, 3, "checkout, setup-apex and the plan step");
  assert.doesNotMatch(node, /reuse-draft-fast\.sh|steps\.reuse\./, "no draft run exists to reuse, so node-suites asks no reuse question");
  for (const st of setup) assert.match(st, /\n        if: matrix\.needed != 'false'/, "an unneeded row skips: " + st.split("\n")[0]);
  assert.match(node, /if \[ "\$\{\{ matrix\.needed \}\}" = "false" \]; then[\s\S]*?exit 0/, "the suites step exits 0 for an unneeded row");
  assert.match(node, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.slices\) \}\}/);
  const driving = (ciWorkflow.split("\n  driving-model:\n")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.match(driving, /^    needs: \[select\]$/m);
  assert.match(driving, /needs\.select\.outputs\.driving == 'true'/);
  assert.match(driving, /^    if: .*inputs\.concurrency_key == ''/m, "driving-model skips on the Pages call (decision D2)");
  // No plumbing job is left in front of the fast tier: every job that used to
  // wait on `reuse-draft` asks the question itself, as a step.
  const jobs = parseYAML(ciWorkflow).jobs;
  for (const id of ["reuse-draft", "unit-plan", "ship-filter", "renderer-filter", "xr-filter"]) assert.ok(!jobs[id], `${id} is a step now, not a job`);
  for (const id of ["guards-a", "guards-b", "sweeps-parts", "driving-model"]) {
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

test("XR filter executes renderer, lazy-roster and emulated-spec changes while skipping unrelated paths", () => {
  const step = parseYAML(ciWorkflow).jobs.select.steps.find((st) => st.id === "xrfilter");
  const root = new URL("../../artifacts/", import.meta.url);
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root.pathname, "xr-filter-"));
  try {
    const git = (...args) => cp.execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const write = (file, body) => {
      const dest = path.join(dir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
    };
    git("init", "-q", "-b", "fixture");
    git("config", "user.name", "XR fixture");
    git("config", "user.email", "xr@example.test");
    write("tools/ci/ci-pr-base.sh", fs.readFileSync(new URL("../../tools/ci/ci-pr-base.sh", import.meta.url), "utf8"));
    git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const xrSpecs = JSON.parse(fs.readFileSync(new URL("../groups.json", import.meta.url), "utf8")).groups["test:xr"].files;
    const cases = [
      ["js/render/renderer-boot.js", true],
      ["js/render/glx/glx.js", true],
      ["js/render/three/tlx.js", true],
      ["tools/manifest.cjs", true],
      ...xrSpecs.map((file) => [file, true]),
      ["js/xr/xr-session.js", true],
      ["tests/helpers/iwer-install.mjs", true],
      ["tests/vendor/iwer-2.5.0.min.js", true],
      ["playwright.config.js", true],
      [".github/workflows/ci.yml", true],
      ["docs/TESTING.md", false],
      ["js/render/three/tlx-post.js", false],
      ["js/race/race-control.js", false],
    ];
    write("step.sh", step.run);
    for (const [file, expected] of cases) {
      git("checkout", "-q", "--detach", base);
      write(file, "// changed XR boundary fixture\n");
      git("add", file); git("commit", "-qm", file);
      const sha = git("rev-parse", "HEAD");
      // A real two-parent test merge exercises ci-pr-base.sh, rather than
      // replacing git diff or testing a second copy of the filter's regex.
      const merge = git("commit-tree", `${sha}^{tree}`, "-p", base, "-p", sha, "-m", "test merge");
      git("checkout", "-q", "--detach", merge);
      const output = path.join(dir, "output");
      fs.rmSync(output, { force: true });
      const result = cp.spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "step.sh"], {
        cwd: dir, encoding: "utf8",
        env: { ...process.env, EVENT: "pull_request", BEFORE: "stale-unreachable-base", GITHUB_SHA: merge, GITHUB_OUTPUT: output },
      });
      assert.equal(result.status, 0, `${file}: ${result.stderr}\n${result.stdout}`);
      assert.equal(fs.readFileSync(output, "utf8").trim(), `xr=${expected}`, `${file}: ${result.stdout}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
