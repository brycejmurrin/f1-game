// ci-ship-filter-geometry — ship-filter ready-PR rules, PR-into-deploy-only trigger, geometry planning/rollup, draft diagnostics, tools/ci/*.sh citations.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import { parse as parseYAML } from "yaml";
import { ciWorkflow, evalTemplate } from "../helpers/ci-workflow.mjs";

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

// #2179 (2026-10-15) and the trigger reset (2026-11-03, docs/plans/2026-11-03-agent-surface-reset.md §4.2): PRs into
// the deploy branch only, four event types, and no label or body-marker gate left anywhere in the workflow.
test("ci.yml runs on PRs into the deploy branch only, on four event types, with no run-ci gate left anywhere", () => {
  const wf = parseYAML(ciWorkflow);
  // #2179: `branches` on pull_request filters the BASE. Survey PRs into
  // track-survey-assets started the full ready tier seconds before merging.
  assert.deepEqual(wf.on.pull_request.branches, ["claude/f1-game-project-26h3ng"],
    "pull_request must be scoped to PRs whose base is the deploy branch");
  assert.equal(wf.on.pull_request["branches-ignore"], undefined);
  // `labeled` and `edited` existed for the run-ci opt-in (#2184 and its `CI: run` body-line twin); every other
  // label or Plan tick then started a run every job had to skip and rename (~147 noise runs a day, measured
  // 2026-10-30 → 11-03). A draft push runs unconditionally now, so the types are the four that carry a head.
  assert.deepEqual(wf.on.pull_request.types, ["opened", "synchronize", "reopened", "ready_for_review"]);
  assert.equal(wf["run-name"], undefined, "no `CI ignored:` run titles: there is no noise run left to title");
  assert.equal(wf.concurrency.group,
    "ci-${{ inputs.concurrency_key || ((github.event_name == 'workflow_dispatch' || github.event_name == 'schedule') && github.run_id) || (github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number)) || format('ref-{0}', github.ref_name) }}",
    "a Pages call's key, then run_id for dispatch/schedule, then the PR branch — no label-/edit-noise groups");
  assert.equal(wf.jobs["draft-ci-skipped"], undefined, "the opt-out notice job is gone: a draft push runs");
  // Nothing a job evaluates names the label, the marker, the label payload or the edit payload any more.
  for (const [id, job] of Object.entries(wf.jobs)) {
    const evaluated = JSON.stringify([job.if, job.name, job.steps.map((st) => [st.if, st.env, st.run])]);
    for (const relic of ["run-ci", "CI ignored", "opted out", "github.event.label", "github.event.changes"])
      assert.ok(!evaluated.includes(relic), `job ${id} still carries the retired gate vocabulary: ${relic}`);
  }
  // The ready_for_review reuse still refuses a green run whose tooling A shard did not run and pass.
  const reuse = fs.readFileSync(new URL("../../tools/ci/reuse-draft-fast.sh", import.meta.url), "utf8");
  assert.ok(reuse.includes('"Structural guards (tooling A)"') && !/run-ci|CI ignored/.test(reuse),
    "a green run whose tooling A did not run is never reused as the fast tier; the label vocabulary is gone");
  assert.equal(wf.jobs.selected.if, "${{ needs.select.outputs.any == 'true' && needs.select.outputs.selected_reused != 'true' }}",
    "the selected legs run on a draft too (one 5-min shard: the budget test below); a ready flip skips them only on a reused draft verdict (#5426)");
});

// EVERY PUSH RUNS (2026-11-03). Evaluated, not pattern-matched: every job's `if`, the group, the verdict name and
// the selected budget, for a draft push, a ready push and the ready flip.
test("a draft push runs the fast tier plus the selected legs on a 5-min budget; ready adds the full tier under the name `CI`", () => {
  const wf = parseYAML(ciWorkflow);
  const ctx = ({ action = "synchronize", draft = true } = {}) => ({
    github: {
      event_name: "pull_request", run_id: 4242, ref_name: "77/merge",
      event: { action, pull_request: { number: 77, draft, body: "", labels: [], head: { ref: "cursor/x" } } },
    },
    inputs: { concurrency_key: "", renderer_macos: false },
    // The plan routes everything, so only the tier gates decide what runs; the renderer and xr path
    // questions are steps that sit out a draft (ci-gate-selection pins their `if`), so their outputs are
    // empty there, and empty reads as "do not run" in both jobs.
    needs: { select: { result: "success", outputs: { any: "true", any_node: "true", driving: "true", renderer: draft ? "" : "true",
      xr: draft ? "" : "true", geometry: "true", geometry_targeted: "" } } },
  });
  const budgetEnv = wf.jobs.select.steps.find((st) => st.id === "sel").env.BUDGET_MIN;
  const view = (c) => {
    const jobs = {};
    for (const [id, job] of Object.entries(wf.jobs)) jobs[id] = Boolean(job.if === undefined ? true : evalTemplate(String(job.if), c));
    return { jobs, group: evalTemplate(wf.concurrency.group, c), verdict: evalTemplate(wf.jobs["ci-verdict"].name, c),
      budget: evalTemplate(budgetEnv, c) };
  };
  const on = (v) => Object.entries(v.jobs).filter(([, x]) => x).map(([id]) => id).sort();
  const draft = view(ctx());
  for (const id of ["guards-a", "guards-b", "guards-c", "guards-d", "guards", "lints", "sweeps-parts", "select", "selected", "selected-verdict", "driving-model", "ci-verdict"])
    assert.ok(draft.jobs[id], `a draft push runs ${id}`);
  for (const id of ["node-suites", "smoke", "staged-boot", "sweeps", "renderer-macos", "xr", "train-twins", "baseline-trial"])
    assert.ok(!draft.jobs[id], `a draft push does not run ${id} (ready_for_review does)`);
  assert.equal(draft.verdict, "CI (draft fast tier)", "a draft never supplies the required `CI` name (#2664)");
  assert.equal(draft.group, "ci-pr-77", "a draft push replaces the PR's live run (keyed on the PR number)");
  assert.equal(draft.budget, "5", "one ~5-min selected shard on a draft");
  for (const action of ["opened", "synchronize", "reopened"]) assert.deepEqual(view(ctx({ action })), draft, `${action}: the same draft tier`);
  for (const action of ["synchronize", "ready_for_review"]) {
    const ready = view(ctx({ action, draft: false }));
    assert.equal(ready.verdict, "CI");
    assert.equal(ready.budget, "", "ready keeps select-specs' default budget");
    for (const id of on(draft)) assert.ok(ready.jobs[id], `ready still runs ${id}`);
    for (const id of ["node-suites", "smoke", "staged-boot", "sweeps", "renderer-macos", "xr"]) assert.ok(ready.jobs[id], `ready runs ${id}`);
    assert.equal(ready.group, "ci-pr-77");
  }
  // The nightly keeps its 60-min budget; a dispatch and the train keep select-specs' default.
  assert.equal(evalTemplate(budgetEnv, { github: { event_name: "schedule", event: {} }, inputs: { concurrency_key: "" } }), "60");
  assert.equal(evalTemplate(budgetEnv, { github: { event_name: "workflow_dispatch", event: {} }, inputs: { concurrency_key: "" } }), "");
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

test("cancellation diagnostics preserve truthful checks and evidence", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  assert.equal(jobs["sweeps-parts"].if, undefined, "the census runs on every event, a draft push included (2026-11-03)");
  assert.match(jobs["ci-verdict"].name, /CI \(draft fast tier\)/);
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

test("ci-verdict always reports under an evaluated name: `CI (draft fast tier)` on a draft, `CI` everywhere else (P9, #2664)", () => {
  // GitHub names a SKIPPED job's check-run by the raw `name:` text, so the aggregator runs on every non-cancelled
  // run and its one work step carries no gate of its own; a draft's success must never satisfy the required
  // check, so only the evaluated name separates the tiers. Evaluated over every event shape.
  const job = parseYAML(ciWorkflow).jobs["ci-verdict"];
  assert.equal(job.if, "${{ !cancelled() }}", "the aggregator must not skip");
  const work = job.steps.find((st) => st.run && /ci-verdict\.mjs/.test(st.run));
  assert.ok(work && work.if === undefined, "the aggregate step runs on every run it is part of");
  assert.ok(!job.steps.some((st) => /No verdict for a label event/.test(st.name || "")), "no label-event no-op step is left");
  const name = (ev, act, draft) => evalTemplate(String(job.name),
    { github: { event_name: ev, event: { action: act, pull_request: ev === "pull_request" ? { draft } : undefined } } });
  let cases = 0;
  for (const ev of ["pull_request", "push", "workflow_dispatch", "schedule"])
    for (const act of ev === "pull_request" ? ["opened", "synchronize", "reopened", "ready_for_review"] : [undefined])
      for (const draft of ev === "pull_request" ? [true, false] : [undefined]) {
        cases++;
        const n = name(ev, act, draft);
        assert.equal(n, ev === "pull_request" && draft ? "CI (draft fast tier)" : "CI", `${ev}/${act}/draft=${draft}`);
        assert.ok(!/\$\{\{/.test(n), "an evaluated name");
      }
  assert.equal(cases, 11, "every event shape");
});
