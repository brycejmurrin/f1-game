// @doc tip-alarm (retro 2026-11-25 item 3): a red deploy-branch pages.yml / scheduled ci.yml run posts ONE tip-red bulletin (+ deploy:red for pages.yml); the next green posts tip-green.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import cp from "node:child_process";
import { parse as parseYAML } from "yaml";
import { decide, failingTests, openBulletins, redBody, greenBody } from "../../tools/ci/tip-alarm.mjs";

const DEPLOY = "claude/f1-game-project-26h3ng";
const SHA = "dc8ebfdc17596d7c2d7fa24fba6fd0a919ae3ce6";
const run = (o = {}) => ({ id: 45521203604, path: ".github/workflows/ci.yml", event: "schedule", head_branch: DEPLOY, head_sha: SHA,
  conclusion: "failure", html_url: "https://github.com/o/r/actions/runs/45521203604", ...o });
const pages = (o = {}) => run({ path: ".github/workflows/pages.yml", event: "push", ...o });
const comment = (id, body, at = `2026-11-25T01:0${id % 10}:00Z`) => ({ id, body, created_at: at, html_url: `u#${id}` });

test("the 2026-11-25 01:00Z red: the scheduled CI run posts a tip-red bulletin (no label: ci.yml)", () => {
  const v = decide({ run: run(), deployBranch: DEPLOY, comments: [comment(1, "some Board chatter")] });
  assert.equal(v.action, "red", v.reason);
  assert.equal(v.label, null, "deploy:red follows pages.yml only");
  assert.equal(v.reason, "ci.yml run 45521203604 on dc8ebfdc concluded failure");
});

test("a red pages.yml run posts and labels; a second red under an open bulletin posts nothing but keeps the label", () => {
  const v = decide({ run: pages({ id: 10 }), deployBranch: DEPLOY });
  assert.deepEqual([v.action, v.label], ["red", "add"]);
  const open = [comment(5, "tip-red: pages.yml run 10 on dc8ebfdc failure\n\n- sha: x")];
  const again = decide({ run: pages({ id: 11 }), deployBranch: DEPLOY, comments: open, labels: [] });
  assert.deepEqual([again.action, again.label], ["none", "add"], again.reason);
  assert.equal(again.reason, "pages.yml already has an open tip-red bulletin (run 10, comment 5); not duplicating");
  assert.equal(decide({ run: pages({ id: 11 }), deployBranch: DEPLOY, comments: open, labels: ["deploy:red"] }).label, null);
  // An orchestrator's hand-posted bulletin counts the same.
  assert.equal(decide({ run: pages({ id: 12 }), deployBranch: DEPLOY, comments: [comment(6, "  tip-red: pages.yml run 9 on abc by hand")] }).action, "none");
});

test("green closes only its own workflow's open red, only from a newer run, and clears the label when no pages red is left", () => {
  const red = comment(5, "tip-red: pages.yml run 10 on dc8ebfdc failure");
  const g = decide({ run: pages({ id: 20, conclusion: "success" }), deployBranch: DEPLOY, comments: [red], labels: ["deploy:red"] });
  assert.deepEqual([g.action, g.label], ["green", "remove"], g.reason);
  assert.equal(decide({ run: pages({ id: 9, conclusion: "success" }), deployBranch: DEPLOY, comments: [red] }).action, "none", "a late green of an older run never closes a newer red");
  assert.equal(decide({ run: pages({ id: 20, conclusion: "success" }), deployBranch: DEPLOY, comments: [red, comment(7, "tip-green: pages.yml run 15 on x passed")] }).action, "none", "already green");
  assert.equal(decide({ run: pages({ id: 20, conclusion: "success" }), deployBranch: DEPLOY, comments: [] }).action, "none", "green with no open red says nothing");
  const ciRed = comment(6, "tip-red: ci.yml run 8 on x failure");
  assert.equal(decide({ run: run({ id: 20, conclusion: "success" }), deployBranch: DEPLOY, comments: [red] }).action, "none", "a green CI run never closes a Pages red");
  const ciGreen = decide({ run: run({ id: 20, conclusion: "success" }), deployBranch: DEPLOY, comments: [red, ciRed], labels: ["deploy:red"] });
  assert.deepEqual([ciGreen.action, ciGreen.label], ["green", null], "CI green: its bulletin closes, the Pages label stays");
});

test("only the tip's verdicts speak: other branches, dispatched CI, cancels and unknown workflows are silent", () => {
  const silent = (q, why) => assert.equal(decide({ deployBranch: DEPLOY, ...q }).action, "none", why);
  silent({ run: pages({ head_branch: "claude/x" }) }, "a PR branch");
  silent({ run: run({ event: "workflow_dispatch" }) }, "a dispatched ci.yml run is a group opt-in");
  silent({ run: run({ event: "pull_request" }) }, "a PR run");
  for (const c of ["cancelled", "skipped", "neutral", null]) silent({ run: pages({ conclusion: c }) }, `${c} is not a verdict`);
  silent({ run: run({ path: ".github/workflows/dispatch.yml" }) }, "not watched");
  silent({ run: null }, "no run");
  assert.equal(decide({ run: pages({ conclusion: "timed_out" }), deployBranch: DEPLOY }).action, "red", "a timeout is a red");
});

test("openBulletins: newest per workflow wins, chatter is ignored", () => {
  const b = openBulletins([comment(2, "tip-green: pages.yml run 30 on x passed", "2026-11-25T03:00:00Z"),
    comment(1, "tip-red: pages.yml run 20 on x failure", "2026-11-25T02:00:00Z"), comment(3, "board: tip-red: pages.yml run 99")]);
  assert.deepEqual(Object.keys(b), ["pages.yml"]);
  assert.equal(b["pages.yml"].kind, "tip-green");
});

// The failing job's log, as GitHub serves it (timestamps, ANSI), excerpted from run 45521203604 job 138893491210.
const LOG = [
  "2026-11-25T00:59:37.6490535Z [00:59:37] > start   w0 tests/specs/perf-idle-pipeline-churn.spec.js › specs/perf-idle-pipeline-churn.spec.js › TLX WebGPU: steady driving builds no render pipelines after warm-up",
  "2026-11-25T01:00:17.4408757Z [01:00:17] x FAIL   1/1 tests/specs/perf-idle-pipeline-churn.spec.js › specs/perf-idle-pipeline-churn.spec.js › TLX WebGPU: steady driving builds no render pipelines after warm-up (36.0s)",
  "2026-11-25T01:00:17.4409939Z            Error: idle windows that created bind groups or non-first-draw buffers after warm-up",
  "2026-11-25T01:00:17.4410754Z            \u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m",
  "2026-11-25T01:00:17.4513017Z [01:00:17] = run failed  (1/1 done, 1 failed, 0 skipped)",
].join("\n");

test("failingTests reads the test and its assertion from the run-playwright log, and the node reporters", () => {
  assert.deepEqual(failingTests(LOG), [{ test: "tests/specs/perf-idle-pipeline-churn.spec.js › specs/perf-idle-pipeline-churn.spec.js › TLX WebGPU: steady driving builds no render pipelines after warm-up",
    error: "Error: idle windows that created bind groups or non-first-draw buffers after warm-up" }]);
  assert.deepEqual(failingTests("not ok 3 - pages train rearms\n  ---\n  error: 'expected true'"), [{ test: "pages train rearms", error: "error: 'expected true'" }]);
  assert.deepEqual(failingTests("✖ decide refuses (1.2ms)\n  AssertionError [ERR_ASSERTION]: x"), [{ test: "decide refuses", error: "AssertionError [ERR_ASSERTION]: x" }]);
  assert.deepEqual(failingTests("  1) [chromium] › tests/specs/active-aero.spec.js:3:1 › boots ───\n    Error: timeout"), [{ test: "[chromium] › tests/specs/active-aero.spec.js:3:1 › boots", error: "Error: timeout" }]);
  assert.deepEqual(failingTests("all good\nok 1 - fine"), []);
  assert.equal(failingTests(Array.from({ length: 9 }, (_, i) => `not ok ${i} - t${i}`).join("\n")).length, 3, "capped");
});

test("the bulletins carry sha, job, step, test and run link, and parse back as bulletins", () => {
  const body = redBody({ run: run(), workflow: "ci.yml", jobs: [{ name: "Selected specs", step: "Run the selection", tests: [{ test: "T", error: "Error: E" }] }] });
  assert.deepEqual(body.split("\n"), ["tip-red: ci.yml run 45521203604 on dc8ebfdc failure", "", `- sha: \`${SHA}\``,
    '- job: Selected specs (step "Run the selection")', "  - test: `T` — Error: E", "- run: https://github.com/o/r/actions/runs/45521203604", "",
    "Posted by tip-alarm.yml (tools/ci/tip-alarm.mjs). Fix through a PR labelled `deploy:red` (skill steward §Red 3); the next green ci.yml run on the deploy branch posts `tip-green:`."]);
  assert.equal(openBulletins([comment(1, body)])["ci.yml"].runId, 45521203604);
  assert.deepEqual(redBody({ run: run(), workflow: "ci.yml", jobs: [{ name: "j", step: "", tests: [] }] }).split("\n").slice(3, 5),
    ["- job: j", "  - test: (none found in the log tail; read the job log)"]);
  const green = greenBody({ run: run({ id: 45521999999, conclusion: "success" }), workflow: "ci.yml", redRunId: 45521203604 });
  assert.equal(openBulletins([comment(1, body, "2026-11-25T01:00:00Z"), comment(2, green, "2026-11-25T02:00:00Z")])["ci.yml"].kind, "tip-green");
});

test("tip-alarm.yml: workflow_run on CI + Pages, the deploy branch only, least privilege, one tool, never red", () => {
  const wf = parseYAML(fs.readFileSync(new URL("../../.github/workflows/tip-alarm.yml", import.meta.url), "utf8"));
  assert.deepEqual(wf.on.workflow_run.workflows, ["CI", "Deploy to GitHub Pages"]);
  assert.deepEqual(wf.on.workflow_run.branches, [DEPLOY]);
  assert.deepEqual(wf.permissions, {});
  assert.equal(wf.concurrency["cancel-in-progress"], false);
  const job = wf.jobs.alarm;
  assert.deepEqual(job.permissions, { contents: "read", issues: "write", actions: "read" });
  assert.deepEqual(job.steps.map((s) => s.run || s.uses.split("@")[0]), ["actions/checkout", "node tools/ci/tip-alarm.mjs --apply"]);
  assert.equal(job.steps[0].with["sparse-checkout"], "tools/ci/tip-alarm.mjs");
  assert.equal(job.steps[0].with.ref, DEPLOY);
  assert.equal(job.steps[1].env.BOARD_ISSUE, "1780");
  const dead = cp.spawnSync(process.execPath, ["tools/ci/tip-alarm.mjs", "--apply"], { encoding: "utf8", cwd: new URL("../../", import.meta.url),
    env: { PATH: "/nonexistent", GITHUB_REPOSITORY: "o/r", RUN_ID: "1", DEPLOY_BRANCH: DEPLOY, BOARD_ISSUE: "1780" } });
  assert.equal(dead.status, 0, "no gh at all: a warning, never a red job");
  assert.equal(dead.stdout.slice(0, 37), "::warning::tip-alarm: lookup failed (", "and it says so");
});
