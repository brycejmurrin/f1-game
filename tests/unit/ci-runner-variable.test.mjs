// ci-runner-variable — the runner label as a repo variable (D-RUNNER): which jobs may read it, the fork fallback,
// and that with no variable set every job still resolves to `ubuntu-latest`. docs/TESTING.md §CI runners.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { parse as parseYAML } from "yaml";
import { absSrc } from "../helpers/abs-src.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const WF_DIR = absSrc(".github/workflows");
const workflows = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: f, doc: parseYAML(fs.readFileSync(path.join(WF_DIR, f), "utf8")) }));

// The ONLY jobs whose runner may come from a repo variable, and the variable each reads. Land, the gate, Pages, the
// deploy and the structural guards are not here: they stay literal `ubuntu-latest`.
const ALLOWED = {
  "browser-group.yml:group": "APEX_BROWSER_RUNNER",
  "ci.yml:node-suites": "APEX_CI_NODE_RUNNER",
  "ci.yml:selected": "APEX_CI_BROWSER_RUNNER",
};

const EXPR = {
  "ci.yml:node-suites": "${{ inputs.concurrency_key == '' && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && (vars.APEX_CI_NODE_RUNNER || 'ubicloud-standard-4') || 'ubuntu-latest' }}",
  "browser-group.yml:group": "${{ github.event_name == 'workflow_dispatch' && vars.APEX_BROWSER_RUNNER || 'ubuntu-latest' }}",
  "ci.yml:selected": "${{ inputs.concurrency_key == '' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)) && vars.APEX_CI_BROWSER_RUNNER || 'ubuntu-latest' }}",
};

function jobs() {
  const out = [];
  for (const { file, doc } of workflows) for (const [id, job] of Object.entries(doc?.jobs || {})) out.push({ key: `${file}:${id}`, job });
  return out;
}

/** Evaluate a runs-on expression of the shape above in JS: GitHub's `&&`/`||` return an operand and '' is falsy,
 *  like JS; `==`/`!=` on strings are case-insensitive in GitHub, which these cases never depend on. */
function resolve(expr, ctx) {
  const body = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    .replace(/\bvars\.(\w+)/g, (_, n) => JSON.stringify(ctx.vars[n] ?? ""))
    .replace(/\bgithub\.event\.pull_request\.head\.repo\.full_name\b/g, JSON.stringify(ctx.headRepo ?? ""))
    .replace(/\binputs\.concurrency_key\b/g, JSON.stringify(ctx.inputs?.concurrency_key ?? ""))
    .replace(/\bgithub\.event\.pull_request\.draft\b/g, JSON.stringify(ctx.draft ?? false))
    .replace(/\bgithub\.event_name\b/g, JSON.stringify(ctx.event))
    .replace(/\bgithub\.repository\b/g, JSON.stringify("brycejmurrin/f1-game"))
    .replace(/[!=]=/g, (op) => (op === "!=" ? "!==" : "==="));
  // A context left unsubstituted is an undeclared name: strict-mode Function throws a ReferenceError on it.
  return Function(`"use strict"; return (${body});`)();
}

test("only the configured browser and Node jobs read their runner variables", () => {
  const readers = {};
  for (const { key, job } of jobs()) {
    const ro = JSON.stringify(job["runs-on"] ?? "");
    const m = ro.match(/vars\.(\w+)/g);
    if (m) readers[key] = m.map((s) => s.slice(5)).join(",");
  }
  assert.deepEqual(readers, ALLOWED, "a new reader needs a row here and a line in docs/TESTING.md §CI runners");
  for (const [key, expr] of Object.entries(EXPR)) {
    const job = jobs().find((j) => j.key === key)?.job;
    assert.equal(job?.["runs-on"], expr, `${key}'s runs-on expression is pinned`);
  }
});

test("land, gate, Pages, deploy and the structural guards stay on literal ubuntu-latest", () => {
  const must = ["ci.yml:guards", "ci.yml:guards-a", "ci.yml:guards-b", "ci.yml:guards-c", "ci.yml:guards-d", "ci.yml:ci-verdict", "ci.yml:selected-verdict", "ci.yml:select"];
  // (No other job reads a variable at all: the first test's reader map is exact.)
  for (const f of ["land.yml", "pages.yml"]) {
    const wf = workflows.find((w) => w.file === f);
    assert.ok(wf, `${f} exists`);
    for (const [id, job] of Object.entries(wf.doc.jobs)) {
      if (job.uses) continue; // a called workflow's jobs are checked in their own file
      assert.equal(job["runs-on"], "ubuntu-latest", `${f}:${id} stays on ubuntu-latest`);
    }
  }
  for (const key of must) assert.equal(jobs().find((j) => j.key === key)?.job["runs-on"], "ubuntu-latest", key);
});

test("unset browser variables use ubuntu-latest for every event", () => {
  const events = ["pull_request", "pull_request_target", "push", "schedule", "workflow_dispatch", "workflow_call"];
  for (const expr of [EXPR["browser-group.yml:group"], EXPR["ci.yml:selected"]]) for (const event of events) {
    for (const headRepo of ["brycejmurrin/f1-game", "someone/fork"]) {
      assert.equal(resolve(expr, { event, headRepo, vars: {} }), "ubuntu-latest", `${event} ${headRepo}`);
      assert.equal(resolve(expr, { event, headRepo, vars: { APEX_BROWSER_RUNNER: "", APEX_CI_BROWSER_RUNNER: "" } }), "ubuntu-latest");
    }
  }
});

test("Node suites use Ubicloud on same-repository PRs with an independent rollback", () => {
  const expr = EXPR["ci.yml:node-suites"];
  const own = { event: "pull_request", headRepo: "brycejmurrin/f1-game" };
  for (const [vars, expected] of [
    [{}, "ubicloud-standard-4"], [{ APEX_CI_NODE_RUNNER: "" }, "ubicloud-standard-4"],
    [{ APEX_CI_NODE_RUNNER: "ubuntu-latest" }, "ubuntu-latest"],
    [{ APEX_CI_NODE_RUNNER: "ubicloud-standard-2" }, "ubicloud-standard-2"],
  ]) assert.equal(resolve(expr, { ...own, vars }), expected);
  for (const ctx of [
    { ...own, headRepo: "someone/fork" }, { ...own, inputs: { concurrency_key: "pages-1" } },
    ...["workflow_dispatch", "workflow_call", "push", "pull_request_target", "schedule"].map(event => ({ ...own, event })),
  ]) assert.equal(resolve(expr, { ...ctx, vars: { APEX_CI_NODE_RUNNER: "ubicloud-standard-4" } }), "ubuntu-latest");
});

test("set variable: own code gets the label, fork code falls back", () => {
  const vars = { APEX_BROWSER_RUNNER: "trial-2vcpu", APEX_CI_BROWSER_RUNNER: "trial-ci-2vcpu" };
  const ci = EXPR["ci.yml:selected"];
  assert.equal(resolve(ci, { event: "pull_request", headRepo: "brycejmurrin/f1-game", vars }), "trial-ci-2vcpu");
  assert.equal(resolve(ci, { event: "pull_request", headRepo: "someone/fork", vars }), "ubuntu-latest", "a fork PR never reaches the trial runner");
  assert.equal(resolve(ci, { event: "pull_request_target", headRepo: "brycejmurrin/f1-game", vars }), "ubuntu-latest", "pull_request_target never reads it");
  assert.equal(resolve(ci, { event: "workflow_dispatch", vars }), "trial-ci-2vcpu", "ci.yml's own dispatch reads it");
  assert.equal(resolve(ci, { event: "schedule", vars }), "ubuntu-latest", "the nightly stays GitHub-hosted");
  assert.equal(resolve(ci, { event: "push", vars }), "ubuntu-latest", "push never reads it");
  const bg = EXPR["browser-group.yml:group"];
  assert.equal(resolve(bg, { event: "workflow_dispatch", vars }), "trial-2vcpu");
  assert.equal(resolve(bg, { event: "workflow_dispatch", vars: { APEX_CI_BROWSER_RUNNER: "x" } }), "ubuntu-latest", "the two variables are separate");
  assert.equal(resolve(ci, { event: "push", vars: { APEX_BROWSER_RUNNER: "x" } }), "ubuntu-latest", "the two variables are separate");
});

test("browser-group: a fork `pr` is refused before checkout on a trial runner", () => {
  const wf = workflows.find((w) => w.file === "browser-group.yml").doc;
  assert.deepEqual(Object.keys(wf.on), ["workflow_dispatch"], "browser-group takes dispatch only; a new trigger needs the fork fallback reviewed");
  assert.equal(wf.permissions["pull-requests"], "read", "the fork check reads the PR's head repository");
  const steps = wf.jobs.group.steps;
  const fork = steps.findIndex((s) => s.name === "Fork code never runs on a trial runner");
  const checkout = steps.findIndex((s) => String(s.uses || "").startsWith("actions/checkout@"));
  assert.ok(fork >= 0 && checkout > fork, "the fork check runs before the checkout");
  const s = steps[fork];
  assert.equal(s.if, "${{ inputs.pr != '' && vars.APEX_BROWSER_RUNNER != '' }}");
  // Behaviour, not text: run the step's own script against a fake `gh` that reports the PR's head repository.
  const dir = mkTmpDir("apex-fork-check-");
  try {
    fs.writeFileSync(path.join(dir, "gh"), '#!/bin/sh\n[ "$FAKE_FAIL" = 1 ] && exit 1\nprintf "%s\\n" "$FAKE_HEAD"\n', { mode: 0o755 });
    const run = (env) => cp.spawnSync("bash", ["-e", "-c", s.run], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_TOKEN: "x", PR: "5", REPO: "brycejmurrin/f1-game", ...env },
      encoding: "utf8",
    });
    assert.equal(run({ FAKE_HEAD: "brycejmurrin/f1-game" }).status, 0, "this repo's own PR runs on the trial runner");
    const fork = run({ FAKE_HEAD: "someone/f1-game" });
    assert.equal(fork.status, 1, "a fork PR stops before checkout");
    assert.equal(fork.stdout.trim(), "::error::PR #5's head is someone/f1-game, not brycejmurrin/f1-game: fork code does not run on APEX_BROWSER_RUNNER; unset the variable to test it on ubuntu-latest");
    assert.equal(run({ FAKE_FAIL: "1" }).status, 1, "an unreadable PR fails closed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// D-LANES: the select step hands vars.APEX_CI_LANES to select-specs only when the legs resolve to the variable runner.
test("APEX_CI_LANES reaches the planner only on the variable runner; fork, pull_request_target, the train, the nightly and unset get 28", async () => {
  const { ciLanes, LANES } = await import("../../tools/ci/select-specs.mjs");
  const sel = jobs().find((j) => j.key === "ci.yml:select").job.steps.find((st) => st.name === "Select specs for this change");
  const expr = sel.env.APEX_CI_LANES;
  assert.equal(expr, "${{ inputs.concurrency_key == '' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)) && vars.APEX_CI_BROWSER_RUNNER != '' && vars.APEX_CI_LANES || '' }}");
  const lanes = (ctx) => ciLanes({ APEX_CI_LANES: resolve(expr, ctx) });
  const both = { APEX_CI_BROWSER_RUNNER: "ubicloud-standard-4", APEX_CI_LANES: "64" };
  const own = "brycejmurrin/f1-game";
  for (const event of ["pull_request", "workflow_dispatch"]) {
    const ctx = { event, headRepo: own, vars: both };
    assert.equal(lanes(ctx), 64, event);
    assert.notEqual(resolve(EXPR["ci.yml:selected"], ctx), "ubuntu-latest", `${event}: raised lanes only where the legs leave ubuntu-latest`);
  }
  const hosted = [
    { event: "pull_request", headRepo: "someone/fork", vars: both },
    { event: "pull_request_target", headRepo: own, vars: both },
    { event: "pull_request", headRepo: own, vars: { APEX_CI_LANES: "64" } },
    { event: "push", vars: { APEX_CI_LANES: "64", APEX_CI_BROWSER_RUNNER: "" } },
    { event: "push", vars: { APEX_CI_LANES: "64", APEX_BROWSER_RUNNER: "x" } },
    { event: "push", vars: both },
    { event: "schedule", vars: both },
    { event: "workflow_dispatch", vars: both, inputs: { concurrency_key: "pages-1" } },
    { event: "pull_request", headRepo: own, vars: {} },
  ];
  for (const ctx of hosted) {
    assert.equal(resolve(EXPR["ci.yml:selected"], ctx), "ubuntu-latest", `${ctx.event} ${ctx.headRepo} runs GitHub-hosted`);
    assert.equal(lanes(ctx), LANES, `${ctx.event} ${ctx.headRepo}: a GitHub-hosted run keeps 28 lanes`);
  }
  assert.equal(lanes({ event: "push", vars: { APEX_CI_BROWSER_RUNNER: "x" } }), LANES, "runner set, lanes unset: 28");
});

// The deploy path never depends on a managed runner (2026-11-20, Pages run 44835564654: a Ubicloud leg's apt mirrors
// were unreachable and the train redded before any test ran). pages.yml reaches ci.yml as a workflow_call, which
// carries the CALLER's event_name (push, schedule or workflow_dispatch), so the train is told apart by the
// concurrency_key input pages.yml always passes.
test("the Pages train calls ci.yml with a concurrency_key, and every train event resolves to ubuntu-latest", () => {
  const pages = workflows.find((w) => w.file === "pages.yml").doc;
  assert.deepEqual(Object.keys(pages.on).sort(), ["push", "schedule", "workflow_dispatch"], "a new train trigger needs this test reviewed");
  const call = Object.values(pages.jobs).filter((j) => j.uses === "./.github/workflows/ci.yml");
  assert.equal(call.length, 1, "pages.yml calls ci.yml once");
  const key = String(call[0].with?.concurrency_key || "");
  assert.notEqual(key, "", "the call passes a non-empty concurrency_key: ci.yml tells the train apart by it");
  const vars = { APEX_CI_BROWSER_RUNNER: "ubicloud-standard-2", APEX_CI_LANES: "64" };
  const sel = jobs().find((j) => j.key === "ci.yml:select").job.steps.find((st) => st.name === "Select specs for this change");
  for (const event of Object.keys(pages.on)) {
    const ctx = { event, headRepo: "brycejmurrin/f1-game", vars, inputs: { concurrency_key: "pages-44835564654" } };
    assert.equal(resolve(EXPR["ci.yml:selected"], ctx), "ubuntu-latest", `pages.yml ${event}: selected legs stay GitHub-hosted`);
    assert.equal(resolve(sel.env.APEX_CI_LANES, ctx), "", `pages.yml ${event}: no raised lane count`);
  }
});
