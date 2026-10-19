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
import { ciWorkflow } from "../helpers/ci-workflow.mjs";

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
