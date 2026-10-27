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
import { ciWorkflow, evalTemplate, LABEL_NOISE, EDIT_NOISE, LABEL_OK, EDIT_OK } from "../helpers/ci-workflow.mjs";
import { hasCiRunMarker } from "../../tools/ci/queue-depth.mjs";

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
  // #2184: the label-noise predicate, written once per place it is used; the BODY MARKER's edit noise (2026-10-26)
  // rides beside it everywhere.
  const NOISE = LABEL_NOISE;
  // 1. Its own group, BEFORE the head-ref term: it can never cancel the PR's live run.
  const group = wf.concurrency.group;
  assert.ok(group.includes(`${NOISE} && format('label-{0}', github.run_id))`), "a label-noise run gets a throwaway group");
  // (The edit-noise group's VALUE is evaluated in the BODY MARKER test below: `ci-edit-<run_id>`.)
  for (const n of [NOISE, EDIT_NOISE]) {
    assert.ok(group.indexOf(n) < group.indexOf("github.event.pull_request.head.ref"), "the throwaway group must win over the head ref");
    assert.ok(group.indexOf("inputs.concurrency_key") < group.indexOf(n), "a Pages call's key still comes first");
  }
  // 2. Every job skips on it (skipped jobs take no runner), so the run ends in seconds.
  for (const [id, job] of Object.entries(wf.jobs)) {
    const cond = String(job.if || "");
    // The skip notice's edit clause is evaluated below (no notice on any edit).
    if (id === "draft-ci-skipped") assert.ok(cond.includes("github.event.action != 'labeled'"), "the skip notice is not re-posted by a label event");
    // ci-verdict RUNS on a label event (P9: a skipped job's check-run is named by
    // the raw expression); its work steps carry LABEL_OK instead, and the test
    // below proves its evaluated name is never the required `CI` there.
    else if (id === "ci-verdict") assert.ok(job.steps.filter((st) => st.run && /ci-verdict\.mjs/.test(st.run)).every((st) => String(st.if).includes(`${LABEL_OK} && ${EDIT_OK}`)));
    else assert.ok(cond.includes(`${LABEL_OK} && ${EDIT_OK}`), `job ${id} must skip a label event other than run-ci on a draft, and a body edit that does not newly add the CI: run line`);
  }
  // 3. A skipped job reports SUCCESS, so the noise run's verdict must not carry the required name.
  assert.ok(wf.jobs["ci-verdict"].name.startsWith(`\${{ ${NOISE} && 'CI label event (ignored)' || ${EDIT_NOISE} && 'CI edit event (ignored)' || `));
  assert.ok(wf.jobs["ci-verdict"].name.endsWith("|| 'CI' }}"));
  // 4. Tools drop it by title (ci-watch.mjs labelNoiseRun, reuse-draft-fast.sh).
  assert.equal(wf["run-name"], `\${{ ${NOISE} && format('CI ignored: label {0}', github.event.label.name) || ${EDIT_NOISE} && 'CI ignored: edit' || '' }}`);
  const reuse = fs.readFileSync(new URL("../../tools/ci/reuse-draft-fast.sh", import.meta.url), "utf8");
  assert.ok(reuse.includes("^CI ignored: /") && reuse.includes('"Structural guards (tooling A)"'),
    "a green run whose tooling A did not run is never reused as the fast tier");
  // run-ci is a documented label, and the docs say what it buys (no selected browser specs on a draft).
  const labels = JSON.parse(fs.readFileSync(new URL("../../.github/labels.json", import.meta.url), "utf8"));
  assert.ok(labels.some((l) => l.name === "run-ci"), ".github/labels.json documents run-ci");
  assert.match(String(wf.jobs.selected.if), /!\(github\.event_name == 'pull_request' && github\.event\.pull_request\.draft\)/,
    "the selected legs skip every draft; the header and docs/TESTING.md say so");
});

// THE BODY MARKER (Bryce 2026-10-26): Cursor workers 403 on adding a label, so a PR-body line starting `CI: run`
// buys a draft exactly what run-ci buys. Evaluated, not just pinned: every job's `if`, the run name, the group and
// the verdict name under each event, against the run-ci label as the reference.
test("a `CI: run` body line opts a draft into the fast tier exactly like run-ci, and a body edit starts it only once", () => {
  const wf = parseYAML(ciWorkflow);
  const ctx = ({ action = "synchronize", draft = true, labels = [], body = "", label, changes } = {}) => ({
    github: {
      event_name: "pull_request", run_id: 4242, ref_name: "77/merge",
      event: { action, label: label ? { name: label } : undefined, changes,
        pull_request: { draft, body, labels: labels.map((name) => ({ name })), head: { ref: "cursor/x" } } },
    },
    inputs: { fast_tier_run: "", concurrency_key: "", renderer_macos: false },
    // The plan routes everything, so only the tier gates decide what runs.
    needs: { select: { result: "success", outputs: { any: "true", any_node: "true", driving: "true", renderer: "true", xr: "true",
      geometry: "true", geometry_targeted: "" } } },
  });
  const view = (c) => {
    const jobs = {};
    for (const [id, job] of Object.entries(wf.jobs)) jobs[id] = Boolean(job.if === undefined ? true : evalTemplate(String(job.if), c));
    return { jobs, runName: evalTemplate(wf["run-name"], c), group: evalTemplate(wf.concurrency.group, c),
      verdict: evalTemplate(wf.jobs["ci-verdict"].name, c) };
  };
  const ran = (v) => Object.entries(v.jobs).filter(([, on]) => on).map(([id]) => id).sort();
  const MARK = "## Goal\r\nShip it.\r\nCI: run\r\n\r\n## Plan\r\n- [ ] a";

  // Reference points.
  const bare = view(ctx());
  // ci-verdict runs on every non-cancelled run (audit4 D1 P9) and reports under an evaluated name, never `CI`, where it does no work.
  assert.deepEqual(ran(bare), ["ci-verdict", "draft-ci-skipped"], "a draft with neither runs only the skip notice and the always-on aggregator");
  assert.equal(bare.verdict, "CI draft (opted out)");
  const label = view(ctx({ labels: ["run-ci"] }));
  assert.ok(label.jobs["guards-a"] && label.jobs.select && label.jobs["driving-model"], "run-ci gives the fast tier");
  assert.ok(!label.jobs["node-suites"] && !label.jobs.selected && !label.jobs.smoke, "...and nothing of the full tier");

  // 1. Marker present on a push: the SAME job set as the label, the same name and group.
  for (const body of [MARK, "CI: run", "ci: RUN please\n"]) {
    assert.deepEqual(view(ctx({ body })), label, `body ${JSON.stringify(body)} must equal run-ci exactly`);
    assert.ok(hasCiRunMarker(body), "queue-depth's mirror agrees");
  }
  assert.equal(label.verdict, "CI (draft fast tier)", "a draft never supplies the required `CI` name");
  // 2. Marker absent or only quoted mid-line: the same as a bare draft.
  for (const body of ["Put `CI: run` in the body", "  CI: run", "xCI: run", null, ""]) {
    assert.deepEqual(view(ctx({ body })), bare, `body ${JSON.stringify(body)} is not the marker`);
    assert.ok(!hasCiRunMarker(body), "queue-depth's mirror agrees");
  }
  // 3. A ready PR: the marker changes nothing (full tier either way).
  for (const action of ["synchronize", "ready_for_review"]) {
    const ready = view(ctx({ action, draft: false }));
    assert.deepEqual(view(ctx({ action, draft: false, body: MARK })), ready, `ready ${action}: the marker is inert`);
    assert.equal(ready.verdict, "CI");
    assert.ok(ready.jobs.selected && ready.jobs["node-suites"], "ready is the full tier");
  }

  // 4. `edited`: the ONE edit that gives a draft without run-ci the marker starts the fast tier in the PR's group.
  const gained = view(ctx({ action: "edited", body: MARK, changes: { body: { from: "## Goal\r\nShip it." } } }));
  assert.deepEqual(gained.jobs, label.jobs, "the gaining edit runs exactly run-ci's jobs");
  assert.equal(gained.runName, "");
  assert.equal(gained.group, "ci-cursor/x", "it replaces the PR's live run like a push");
  assert.equal(gained.verdict, "CI (draft fast tier)");
  const fromNull = view(ctx({ action: "edited", body: "CI: run", changes: { body: { from: null } } }));
  assert.deepEqual(fromNull.jobs, label.jobs, "a first body (from null) that carries the marker starts it");

  // 5. Every other edit is noise: nothing runs, a throwaway group (never cancels the live run), a non-`CI` name.
  const noise = [
    ["a Plan tick with the marker already there", { body: MARK + "\r\n- [x] b", changes: { body: { from: MARK } } }],
    ["a title-only edit (no changes.body)", { body: MARK, changes: { title: { from: "old" } } }],
    ["a base change", { body: MARK, changes: { base: { ref: { from: "x" }, sha: { from: "y" } } } }],
    ["a Plan edit on a draft without the marker", { body: "## Plan\r\n- [x] a", changes: { body: { from: "## Plan\r\n- [ ] a" } } }],
    ["the marker removed", { body: "## Plan", changes: { body: { from: MARK } } }],
    ["the marker added on a ready PR", { draft: false, body: MARK, changes: { body: { from: "" } } }],
    ["the marker added while run-ci is already on", { labels: ["run-ci"], body: MARK, changes: { body: { from: "" } } }],
  ];
  for (const [why, o] of noise) {
    const v = view(ctx({ action: "edited", ...o }));
    assert.deepEqual(ran(v), ["ci-verdict"], `${why}: every job but the always-on aggregator skips`);
    assert.equal(v.runName, "CI ignored: edit", `${why}: titled for labelNoiseRun`);
    assert.equal(v.group, "ci-edit-4242", `${why}: its own group`);
    assert.equal(v.verdict, "CI edit event (ignored)", `${why}: never the required name`);
  }
  // The label path is unchanged: run-ci on a draft starts the fast tier, any other label is noise.
  assert.deepEqual(view(ctx({ action: "labeled", label: "run-ci", labels: ["run-ci"] })).jobs, label.jobs);
  const bug = view(ctx({ action: "labeled", label: "bug", labels: ["bug"], body: MARK }));
  assert.deepEqual(ran(bug), ["ci-verdict"], "a non-run-ci label: only the always-on aggregator, named for the noise");
  assert.equal(bug.runName, "CI ignored: label bug");
  assert.equal(bug.group, "ci-label-4242");
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

test("ci-verdict always reports under an evaluated name, and never `CI` where it does no work (P9, #2664)", () => {
  // GitHub names a SKIPPED job's check-run by the raw `name:` text, so the
  // aggregator runs on every non-cancelled run. The invariant that makes that
  // safe: wherever its work steps are off (a label event, a draft without
  // run-ci), the evaluated name is not exactly "CI", so the required check
  // stays pending rather than reporting success. Evaluated, not pattern-matched:
  // both expressions are taken from the YAML and run over every event shape.
  const job = parseYAML(ciWorkflow).jobs["ci-verdict"];
  assert.equal(job.if, "${{ !cancelled() }}", "the aggregator must not skip on a label event or an opted-out draft");
  const work = job.steps.find((st) => st.run && /ci-verdict\.mjs/.test(st.run));
  const noop = job.steps.find((st) => /No verdict for a label event/.test(st.name || ""));
  assert.ok(work && noop, "the aggregate step and the no-op step");
  // The YAML expressions run through the shared evaluator (contains/format/fromJSON for the tip's `CI: run` body routing).
  const js = (expr) => (ev, act, lbl, draft, runCi) => evalTemplate(String(expr), {
    github: { event_name: ev, event: { action: act, label: lbl ? { name: lbl } : undefined, changes: undefined,
      pull_request: ev === "pull_request" ? { draft, body: "", labels: runCi ? [{ name: "run-ci" }] : [] } : undefined } },
    inputs: { fast_tier_run: "" },
  });
  const name = js(job.name), works = js(work.if), idle = js(noop.if);
  let cases = 0;
  for (const ev of ["pull_request", "push", "workflow_dispatch", "schedule"])
    for (const act of ev === "pull_request" ? ["opened", "synchronize", "ready_for_review", "labeled"] : [undefined])
      for (const draft of ev === "pull_request" ? [true, false] : [undefined])
        for (const runCi of ev === "pull_request" ? [true, false] : [false])
          for (const lbl of act === "labeled" ? ["run-ci", "bug"] : [undefined]) {
            if (act === "labeled" && lbl === "run-ci" && !runCi) continue;   // the label just added is on the PR
            cases++;
            const n = name(ev, act, lbl, draft, runCi), w = !!works(ev, act, lbl, draft, runCi);
            assert.equal(!!idle(ev, act, lbl, draft, runCi), !w, `exactly one of the two steps runs (${ev}/${act}/${lbl}/draft=${draft}/run-ci=${runCi})`);
            if (!w) assert.notEqual(n, "CI", `a run that does no verdict work must not be named CI: ${ev}/${act}/${lbl}/draft=${draft}`);
            if (ev === "pull_request" && draft) assert.notEqual(n, "CI", "a draft never reports the required name (#2664)");
            if (w && !(ev === "pull_request" && draft)) assert.equal(n, "CI", `a real non-draft run is named CI: ${ev}/${act}`);
            assert.ok(!/\$\{\{/.test(n), "an evaluated name");
          }
  assert.ok(cases >= 20, `${cases} event shapes`);
});
