// pr-board — the read-only PR board a Claude-run CI Watch acts from.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fullTierPassed, DEPLOY, MAX_LIVE, MAX_ARMED, SUGGESTIONS, hasMergeHold, parseFleetStatus, fleetStatus, ageLabel, ciState, decide, suggest, evaluate, render, measure,
} from "../../tools/ci/pr-board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = (n) => String(n).padStart(40, "a");

const base = {
  draft: false, armed: false, mergeMethod: null, mergeableState: "clean", ci: "success", gate: "passed", fullTier: true,
};
const fullJobs = () => ["CI", "Selected specs (verdict)", "Per-circuit geometry sweeps", "Smoke (page boots, __apex responds)"].map((name) => ({ name, conclusion: "success" }));
const ctx = (count = 0) => ({ cap: { cap: 3, count } });

test("defaults come from ready-full-cap", () => {
  assert.equal(DEPLOY, "claude/f1-game-project-26h3ng");
  assert.equal(MAX_LIVE, 8);
  assert.deepEqual([...SUGGESTIONS].sort(), ["ARM", "FIX", "FOREIGN-ARM", "NONE", "READY", "SYNC", "WAIT"]);
});

test("suggest: ARM — ready, not armed, gate passed, overall CI succeeded", () => {
  assert.equal(suggest({ ...base }, ctx()), "ARM");
});

test("suggest: ready PR waits for overall CI success even after guards pass", () => {
  for (const ci of ["in_progress", "queued", "none", "cancelled"]) {
    const row = { ...base, ci, mergeableState: "blocked" };
    assert.equal(suggest(row, ctx()), "WAIT", ci);
    assert.match(decide(row, ctx()).why, /full tier is not green/);
  }
  assert.equal(suggest({ ...base, ci: "failure" }, ctx()), "FIX");
});

test("suggest: ARM needs the gate; a pending or absent gate waits", () => {
  assert.equal(suggest({ ...base, gate: "pending" }, ctx()), "WAIT");
  assert.equal(suggest({ ...base, gate: "none" }, ctx()), "WAIT");
});

test("suggest: READY — draft, green, gate passed; the cap is reported, never a WAIT (2026-10-16)", () => {
  const d = { ...base, draft: true };
  assert.equal(suggest(d, ctx(0)), "READY");
  assert.equal(suggest(d, ctx(2)), "READY");
  assert.equal(suggest(d, ctx(3)), "READY", "a full cap no longer holds a green draft");
  assert.equal(suggest(d, { room: 0 }), "READY");
  assert.equal(suggest(d, { room: 1 }), "READY");
});

test("suggest: a draft waits while ci runs, without the gate, or when the fast tier is not green", () => {
  const d = { ...base, draft: true };
  assert.equal(suggest({ ...d, ci: "queued" }, ctx()), "WAIT");
  assert.equal(suggest({ ...d, ci: "in_progress" }, ctx()), "WAIT");
  assert.equal(suggest({ ...d, gate: "pending" }, ctx()), "WAIT");
  assert.equal(suggest({ ...d, ci: "cancelled" }, ctx()), "WAIT");
  assert.equal(suggest({ ...d, ci: "none" }, ctx()), "WAIT");
});

test("suggest: SYNC — dirty, and it outranks FIX and ARM", () => {
  assert.equal(suggest({ ...base, mergeableState: "dirty" }, ctx()), "SYNC");
  assert.equal(suggest({ ...base, mergeableState: "dirty", ci: "failure" }, ctx()), "SYNC");
  assert.equal(suggest({ ...base, draft: true, mergeableState: "dirty" }, ctx()), "SYNC");
});

test("suggest: FIX — ci failed on the head, or Structural guards failed", () => {
  assert.equal(suggest({ ...base, ci: "failure" }, ctx()), "FIX");
  assert.equal(suggest({ ...base, ci: "failure", armed: true, mergeMethod: "merge" }, ctx()), "FIX");
  assert.equal(suggest({ ...base, draft: true, ci: "failure", gate: "failed" }, ctx()), "FIX");
  assert.equal(suggest({ ...base, ci: "in_progress", gate: "failed" }, ctx()), "FIX");
});

test("suggest: FOREIGN-ARM — armed with squash or rebase (MERGE-COMMIT-ONLY); wins over everything", () => {
  assert.equal(suggest({ ...base, armed: true, mergeMethod: "squash" }, ctx()), "FOREIGN-ARM");
  assert.equal(suggest({ ...base, armed: true, mergeMethod: "REBASE" }, ctx()), "FOREIGN-ARM");
  assert.equal(suggest({ ...base, armed: true, mergeMethod: "squash", mergeableState: "dirty", ci: "failure" }, ctx()), "FOREIGN-ARM");
});

test("suggest: NONE — armed with MERGE and healthy; never ARM again", () => {
  const armed = { ...base, armed: true, mergeMethod: "merge" };
  assert.equal(suggest(armed, ctx()), "NONE");
  assert.equal(suggest({ ...armed, ci: "queued", gate: "pending" }, ctx()), "NONE");
  assert.equal(suggest({ ...armed, mergeMethod: "MERGE" }, ctx()), "NONE");
});

test("suggest: ARM waits on a MERGE-HOLD line and at MAX_ARMED armed repo-wide", () => {
  assert.equal(MAX_ARMED, 2);
  assert.equal(suggest({ ...base, hold: true }, ctx()), "WAIT");
  assert.equal(suggest({ ...base }, { ...ctx(), armed: 1 }), "ARM");
  assert.equal(suggest({ ...base }, { ...ctx(), armed: 2 }), "WAIT");
});

test("hasMergeHold: a line STARTING with MERGE-HOLD:, outside comments, is the only veto", () => {
  assert.equal(hasMergeHold("## Goal\nx\nMERGE-HOLD: waiting on Bryce\n"), true);
  assert.equal(hasMergeHold("please see MERGE-HOLD: mid-sentence"), false);
  assert.equal(hasMergeHold("<!-- MERGE-HOLD: example -->\n## Goal"), false);
  assert.equal(hasMergeHold("do not merge"), false);
  assert.equal(hasMergeHold(null), false);
});

test("suggest: READY waits while the draft's Plan has open items", () => {
  const draft = { ...base, draft: true };
  assert.equal(suggest({ ...draft, plan: { state: "open", items: 3, open: ["a"] } }, ctx()), "WAIT");
  assert.equal(suggest({ ...draft, plan: { state: "done", items: 3, open: [] } }, ctx()), "READY");
  assert.equal(suggest({ ...draft, plan: { state: "none", items: 0, open: [] } }, ctx()), "READY", "no Plan: ready-gate only warns");
});

test("decide returns a reason with every action", () => {
  for (const row of [base, { ...base, draft: true }, { ...base, ci: "failure" }, { ...base, mergeableState: "dirty" }]) {
    const d = decide(row, ctx());
    assert.ok(SUGGESTIONS.includes(d.action));
    assert.ok(d.why.length > 5);
  }
});

test("ciState: none, live beats finished, newest conclusion otherwise", () => {
  assert.deepEqual(ciState([]), { state: "none", runId: null });
  assert.equal(ciState([{ id: 1, status: "completed", conclusion: "failure" }, { id: 2, status: "in_progress" }]).state, "in_progress");
  assert.equal(ciState([{ id: 1, status: "queued" }]).state, "queued");
  assert.equal(ciState([{ id: 1, status: "completed", conclusion: "failure" }, { id: 2, status: "completed", conclusion: "success" }]).state, "success");
  assert.equal(ciState([{ id: 5, status: "completed", conclusion: "timed_out" }]).state, "failure");
  assert.equal(ciState([{ id: 5, status: "completed", conclusion: "cancelled" }]).state, "cancelled");
  assert.equal(ciState([{ id: 5, status: "completed", conclusion: "skipped" }]).state, "none");
  // rule 8: the cancelled draft-run beside a live sibling is dedupe, not a red
  assert.equal(ciState([{ id: 4, status: "completed", conclusion: "cancelled" }, { id: 6, status: "queued" }]).state, "queued");
});

const guard = (conclusion = "success", status = "completed") => [{ id: 1, name: "Structural guards", status, conclusion, completed_at: "2026-10-10T00:00:00Z" }];
const prObj = (n, extra = {}) => ({
  number: n, title: `pr ${n}`, draft: false, html_url: `https://example.test/pull/${n}`,
  head: { ref: `cursor/b${n}`, sha: SHA(n) }, auto_merge: null, mergeable_state: "clean", state: "open",
  base: { ref: DEPLOY }, ...extra,
});

test("evaluate: sorts, derives ci/gate/failing jobs, and READY flips consume the cap", () => {
  const items = [
    { pr: prObj(9, { draft: true }), runs: [{ id: 9, status: "completed", conclusion: "success" }], checkRuns: guard() },
    { pr: prObj(3, { draft: true }), runs: [{ id: 3, status: "completed", conclusion: "success" }], checkRuns: guard() },
    { pr: prObj(5, { auto_merge: { merge_method: "merge" } }), runs: [{ id: 5, status: "completed", conclusion: "failure" }],
      jobs: [{ name: "Smoke (2)", conclusion: "failure" }, { name: "lint", conclusion: "success" }, { name: "Smoke (2)", conclusion: "failure" }],
      checkRuns: guard("failure") },
    { pr: prObj(7), runs: [], checkRuns: guard() },
  ];
  const r = evaluate(items, { cap: { cap: 3, count: 2, ok: true } });
  assert.deepEqual(r.rows.map((x) => x.number), [3, 5, 7, 9]);
  assert.deepEqual(r.rows.map((x) => x.suggest), ["READY", "FIX", "WAIT", "READY"], "every green draft is READY; the cap is only reported");
  assert.deepEqual(r.rows[1].failing, ["Smoke (2)"]);
  assert.equal(r.rows[1].gate, "failed");
  assert.equal(r.rows[1].mergeMethod, "merge");
  assert.equal(r.cap.room, 1, "the cap is still measured and reported");
});

test("render: header, one line per PR, a footer; empty board says so", () => {
  const r = evaluate([{ pr: prObj(1, { title: "x".repeat(80) }), runs: [], checkRuns: guard() }], { cap: { cap: 3, count: 0 } });
  const out = render(r, { capLine: "ready-full-cap: 0/3" });
  const lines = out.split("\n");
  assert.match(lines[0], /^PR\s+TITLE\s+STATE\s+HEAD\s+MERGEABLE\s+AUTO-MERGE\s+CI\s+FAILING JOBS\s+GATE\s+PLAN\s+FLEET\s+SUGGEST$/);
  assert.match(lines[1], /^#1\s+x{39}…\s+ready\s+a{39}1\s+clean\s+-\s+none\s+-\s+passed\s+-\s+-\s+WAIT$/);
  assert.match(lines.at(-1), /^pr-board: 1 open PR\(s\); ready-full-cap: 0\/3$/);
  const empty = render(evaluate([], { cap: { cap: 3, count: 0 } }));
  assert.match(empty, /no open PRs into claude\/f1-game-project-26h3ng/);
});

/** A fake API over the injected `request`: pr list, details, runs, check-runs, jobs. */
function fakeApi({ prs, runsBySha = {}, checksBySha = {}, jobsByRun = {}, fail = null }) {
  const calls = [];
  const request = (qs) => {
    calls.push(qs);
    if (fail && qs.includes(fail)) return { error: "HTTP 500" };
    let m;
    if (qs.startsWith("pulls?")) {
      const page = Number(/&page=(\d+)/.exec(qs)[1]);
      return { json: prs.slice((page - 1) * 100, page * 100) };
    }
    if ((m = /^pulls\/(\d+)$/.exec(qs))) {
      const p = prs.find((x) => x.number === Number(m[1]));
      return p ? { json: p } : { error: "HTTP 404" };
    }
    if (qs.startsWith("actions/workflows/ci.yml/runs?event=pull_request")) return { json: { workflow_runs: [] } };
    if ((m = /^actions\/workflows\/ci\.yml\/runs\?head_sha=([0-9a-f]+)/.exec(qs))) return { json: { workflow_runs: runsBySha[m[1]] || [] } };
    if ((m = /^commits\/([0-9a-f]+)\/check-runs/.exec(qs))) return { json: { check_runs: checksBySha[m[1]] || [] } };
    if ((m = /^actions\/runs\/(\d+)\/jobs/.exec(qs))) return { json: { jobs: (jobsByRun[m[1]] || []).slice((Number(/&page=(\d+)/.exec(qs)?.[1] || 1) - 1) * 100, Number(/&page=(\d+)/.exec(qs)?.[1] || 1) * 100) } };
    return { error: `unexpected ${qs}` };
  };
  return { request, calls };
}

test("measure pages the open PR list (101 PRs) and reads every PR", () => {
  const prs = Array.from({ length: 101 }, (_, i) => prObj(i + 1));
  const { request, calls } = fakeApi({ prs });
  const v = measure({ request });
  assert.equal(v.ok, true);
  assert.equal(v.rows.length, 101);
  assert.ok(calls.filter((c) => c.startsWith("pulls?")).some((c) => c.includes("page=2")), "second page requested");
  assert.ok(calls.includes("pulls/101"));
});

test("measure: failing jobs come from the failed run; --pr reads one PR but still measures the cap", () => {
  const prs = [prObj(1, { auto_merge: { merge_method: "squash" } }), prObj(2)];
  const { request, calls } = fakeApi({
    prs,
    runsBySha: { [SHA(1)]: [{ id: 77, status: "completed", conclusion: "failure" }] },
    jobsByRun: { 77: [{ name: "page", conclusion: "timed_out" }] },
    checksBySha: { [SHA(1)]: guard("failure"), [SHA(2)]: guard() },
  });
  const all = measure({ request });
  assert.deepEqual(all.rows.map((r) => [r.number, r.suggest]), [[1, "FOREIGN-ARM"], [2, "WAIT"]]);
  assert.deepEqual(all.rows[0].failing, ["page"]);
  assert.match(all.capLine, /ready-full-cap:/);
  calls.length = 0;
  const one = measure({ request, only: 2 });
  assert.deepEqual(one.rows.map((r) => r.number), [2]);
  assert.ok(calls.some((c) => c.startsWith("actions/workflows/ci.yml/runs?event=pull_request")), "cap still measured");
  assert.ok(!calls.includes("pulls/1"));
});

test("measure --pr counts armed siblings across every PR page, without reading their CI details", () => {
  for (const methods of [["merge", "merge"], ["squash", "rebase"], ["merge", null]]) {
    const prs = Array.from({ length: 101 }, (_, i) => prObj(i + 1, { draft: true }));
    prs[0] = prObj(1, { auto_merge: { merge_method: methods[0] } });
    prs[2] = prObj(3);
    if (methods[1]) prs[100] = prObj(101, { auto_merge: { merge_method: methods[1] } });
    const { request, calls } = fakeApi({
      prs,
      runsBySha: { [SHA(3)]: [{ id: 77, status: "completed", conclusion: "success" }] },
      jobsByRun: { 77: fullJobs() }, checksBySha: { [SHA(3)]: guard() },
    });
    const all = measure({ request });
    const expected = methods[1] ? "WAIT" : "ARM";
    assert.equal(all.rows.find((r) => r.number === 3).suggest, expected);
    calls.length = 0;
    const one = measure({ request, only: 3 });
    assert.equal(one.ok, true);
    assert.deepEqual(one.rows.map((r) => [r.number, r.suggest]), [[3, expected]], methods.join("/"));
    assert.ok(calls.some((q) => q.startsWith("pulls?") && q.includes("page=2")));
    assert.deepEqual(calls.filter((q) => /^pulls\/\d+$/.test(q)), ["pulls/3"]);
    assert.ok(!calls.some((q) => q.includes(`head_sha=${SHA(1)}`) || q.startsWith(`commits/${SHA(101)}/`)),
      "siblings need metadata, not per-PR CI inspection");
  }
});

test("measure --pr refreshes the selected PR's armed state after listing siblings", () => {
  const prs = [prObj(1, { auto_merge: { merge_method: "merge" } }), prObj(3, { auto_merge: { merge_method: "merge" } })];
  const { request } = fakeApi({ prs,
    runsBySha: { [SHA(3)]: [{ id: 77, status: "completed", conclusion: "success" }] },
    jobsByRun: { 77: fullJobs() }, checksBySha: { [SHA(3)]: guard() },
  });
  const v = measure({ only: 3, request: (q) => q === "pulls/3" ? { json: prObj(3) } : request(q) });
  assert.equal(v.rows[0].suggest, "ARM", "the newly disarmed target leaves only one sibling armed");
});

test("measure --pr on a PR that is closed or targets another base is a bad-args error", () => {
  const { request } = fakeApi({ prs: [prObj(4, { state: "closed" }), prObj(6, { base: { ref: "main" } })] });
  for (const n of [4, 6]) {
    const v = measure({ request, only: n });
    assert.equal(v.ok, false);
    assert.equal(v.badArgs, true);
    assert.match(v.error, new RegExp(`PR #${n} is not open into`));
  }
});

test("measure: any API error fails the whole board with the error text", () => {
  const prs = [prObj(1)];
  for (const where of ["pulls?", "pulls/1", "head_sha=", "check-runs", "event=pull_request"]) {
    const v = measure({ request: fakeApi({ prs, fail: where }).request });
    assert.equal(v.ok, false, where);
    assert.match(v.error, /HTTP 500/);
    assert.deepEqual(v.rows, []);
  }
  const jobsFail = fakeApi({ prs, runsBySha: { [SHA(1)]: [{ id: 9, status: "completed", conclusion: "failure" }] }, fail: "/jobs" });
  assert.match(measure({ request: jobsFail.request }).error, /jobs: HTTP 500/);
});

test("measure without a token reports the hint (no request leaves the box)", () => {
  const spawned = [];
  const v = measure({ run: (...a) => { spawned.push(a); return { status: 1 }; }, env: {}, gh: () => null });
  assert.equal(v.ok, false);
  assert.match(v.error, /GH_TOKEN/);
  assert.equal(spawned.length, 0);
});

test("only GET requests are ever issued: every curl the default transport spawns is a bare GET", () => {
  const prs = [prObj(1), prObj(2, { draft: true })];
  const spawned = [];
  const run = (cmd, args, opts) => {
    spawned.push({ cmd, args, opts });
    const url = args.find((a) => a.startsWith("https://api.github.com/repos/"));
    const qs = url.split("/repos/brycejmurrin/f1-game/")[1];
    const f = fakeApi({ prs, checksBySha: { [SHA(1)]: guard(), [SHA(2)]: guard() } }).request(qs);
    return { status: 0, stdout: `${JSON.stringify(f.json)}\n${f.error ? 500 : 200}`, stderr: "" };
  };
  const v = measure({ run, env: { GH_TOKEN: "t0k3n" } });
  assert.equal(v.ok, true);
  assert.ok(spawned.length > 8);
  for (const { cmd, args, opts } of spawned) {
    assert.equal(cmd, "curl");
    for (const bad of ["-X", "--request", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "-F", "--form", "-T", "--upload-file", "--json", "-G"]) {
      assert.ok(!args.includes(bad), `curl got ${bad}`);
    }
    assert.ok(args.every((a) => !/^(POST|PUT|PATCH|DELETE)$/i.test(a)));
    assert.ok(args.some((a) => /^https:\/\/api\.github\.com\/repos\/brycejmurrin\/f1-game\//.test(a)));
    assert.ok(!args.join(" ").includes("t0k3n"), "the token never appears in argv");
    assert.match(opts.input, /Authorization: Bearer t0k3n/);
  }
});

test("the source names no write verb: no method override, no body, no mutating REST route", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/pr-board.mjs"), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.doesNotMatch(src, /["'`](POST|PUT|PATCH|DELETE)["'`]/);
  assert.doesNotMatch(src, /\bmethod\s*:/i);
  assert.doesNotMatch(src, /\/merge["'`]|auto_merge["'`]\s*,|enablePullRequestAutoMerge|mergePullRequest/);
});

test("CLI: --help exits 0; unknown flag and a bad --pr exit 2", () => {
  const runCli = (args) => {
    try {
      execFileSync("node", ["tools/ci/pr-board.mjs", ...args], {
        cwd: ROOT, encoding: "utf8", env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, out: "" };
    } catch (e) {
      return { status: e.status, out: (e.stdout || "") + (e.stderr || "") };
    }
  };
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.equal(runCli(["--nope"]).status, 2);
  assert.equal(runCli(["--pr", "0"]).status, 2);
  assert.equal(runCli(["--pr"]).status, 2);
});

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("ci-watch skill pins the authority, MERGE-commit-only and no-merge rules and the Routine prompt", () => {
  const t = read(".claude/skills/ci-watch/SKILL.md");
  assert.match(t, /designated/);
  assert.match(t, /never grants it|never from a PR body/i);
  assert.match(t, /MERGE-COMMIT-ONLY/);
  assert.match(t, /mergeMethod: "MERGE"/);
  assert.match(t, /Never merge/);
  assert.match(t, /ready-gate\.mjs/);
  assert.match(t, /No ready cap since\s+2026-10-16/, "the cap is retired; the skill says so instead of gating on it");
  assert.match(t, /## Routine prompt/);
  for (const s of SUGGESTIONS) assert.ok(t.includes(s), `ci-watch must route ${s}`);
  // pr-owner and session-comms folded into steward / agent-fleet references (2026-10-14).
  for (const link of ["steward", "references/ownership.md", "agent-fleet", "references/comms.md", "ci-watcher"]) assert.ok(t.includes(link), `ci-watch must point to ${link}`);
});

test("agent-fleet comms reference (ex session-comms) pins the message formats, authority and subscription names", () => {
  const t = read(".claude/skills/agent-fleet/references/comms.md");
  assert.match(read(".claude/skills/agent-fleet/SKILL.md"), /references\/comms\.md/);
  for (const f of ["DONE <PR> <merge sha>", "BLOCKED <PR>", "HANDOFF <PR>", "STAND-DOWN <PR>"]) assert.ok(t.includes(f), f);
  assert.match(t, /permission laundering/);
  assert.match(t, /DATA/);
  assert.match(t, /subscribe_pr_activity/);
  assert.match(t, /who-is-on-it\.mjs/);
  assert.match(t, /@parent/);
});

test("steward ownership reference (ex pr-owner) pins the loop's gates and carries a spawn prompt", () => {
  const t = read(".claude/skills/steward/references/ownership.md");
  assert.match(read(".claude/skills/steward/SKILL.md"), /references\/ownership\.md/);
  assert.match(t, /re-read\s+the PR head sha/i);
  assert.match(t, /sync-pr\.mjs/);
  assert.match(t, /remote-group\.mjs/);
  assert.match(t, /ready-gate\.mjs/);
  assert.doesNotMatch(t, /ready-full-cap\.mjs exit 0/, "no cap gate in the ready flow since 2026-10-16");
  assert.match(t, /Do not enable auto-merge or merge/);
  assert.match(t, /\.github\/pull_request_template\.md/);
});

test("ci-watcher agent is read-only (no write or MCP tools) and listed in the agents README", () => {
  const t = read(".claude/agents/ci-watcher.md");
  assert.match(t, /^tools: Bash, Read, Grep, Glob$/m);
  assert.match(t, /^readonly: true$/m);
  assert.match(t, /pr-board\.mjs --json/);
  assert.match(t, /informational/, "the cap is reported, never a hold");
  assert.match(read(".claude/agents/README.md"), /\*\*ci-watcher\*\*/);
});

test("evaluate + render: PLAN is done/items from the body, HOLD is flagged, a sweep never arms past MAX_ARMED", () => {
  const body = "## Plan\n- [x] a — sha\n- [ ] **now:** b\n- [ ] ~~c~~ — dropped\n";
  const items = [
    { pr: prObj(1, { auto_merge: { merge_method: "merge" } }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(2, { body }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(3, { body: "MERGE-HOLD: Bryce\n" }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(4), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
  ];
  const r = evaluate(items, { cap: { cap: 3, count: 0 } });
  assert.deepEqual(r.rows.map((x) => x.suggest), ["NONE", "ARM", "WAIT", "WAIT"], "1 armed + 1 ARM = MAX_ARMED; the hold waits");
  assert.match(r.rows[3].why, /2 PRs are already armed/);
  const lines = render(r).split("\n");
  assert.match(lines[2], /\s2\/3\s+-\s+ARM$/, "two of three items closed (one ticked, one struck)");
  assert.match(lines[3], /WAIT \(HOLD\)$/);
});

test("#2184: a newer label-noise run (all jobs skipped, success) does not turn a red head green", () => {
  const real = { id: 1, path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", display_title: "Fix" };
  const noise = { id: 2, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", display_title: "CI ignored: label bug" };
  assert.deepEqual(ciState([noise, real]), { state: "failure", runId: 1 });
  assert.deepEqual(ciState([noise]), { state: "none", runId: null });
});


test("full-tier evidence rejects missing, skipped and fast-only jobs", () => {
  assert.equal(fullTierPassed(fullJobs()), true);
  assert.equal(fullTierPassed(), false);
  assert.equal(fullTierPassed([{}]), false);
  assert.equal(fullTierPassed([...fullJobs(), { name: "CI", conclusion: "failure" }]), false);
  for (const name of fullJobs().map((j) => j.name)) {
    assert.equal(fullTierPassed(fullJobs().filter((j) => j.name !== name)), false);
    assert.equal(fullTierPassed(fullJobs().map((j) => j.name === name ? { ...j, conclusion: "skipped" } : j)), false);
  }
  assert.equal(suggest({ ...base, fullTier: false }, ctx()), "WAIT");
  assert.equal(suggest({ ...base, fullTier: undefined }, ctx()), "WAIT");
  assert.equal(suggest({ ...base, draft: true, fullTier: false }, ctx()), "READY");
});

test("measure paginates successful ready run jobs and ties evidence to that exact run", () => {
  const jobs = [...Array.from({ length: 100 }, (_, i) => ({ name: `extra-${i}`, conclusion: "success" })), ...fullJobs()];
  const { request, calls } = fakeApi({ prs: [prObj(1)], runsBySha: { [SHA(1)]: [{ id: 77, status: "completed", conclusion: "success" }] }, checksBySha: { [SHA(1)]: guard() }, jobsByRun: { 77: jobs } });
  const v = measure({ request });
  assert.equal(v.rows[0].fullTier, true);
  assert.equal(v.rows[0].suggest, "ARM");
  assert.ok(calls.includes("actions/runs/77/jobs?per_page=100&page=2"));
  const item = { pr: prObj(1), runs: [{ id: 77, status: "completed", conclusion: "success" }], checkRuns: guard(), jobs: fullJobs() };
  assert.equal(evaluate([{ ...item, jobsRunId: 76 }]).rows[0].fullTier, false);
  assert.equal(evaluate([{ ...item, jobsRunId: 77 }]).rows[0].fullTier, true);
});

test("fleet-status: body line parsed; template placeholder and HTML comments ignored", () => {
  assert.equal(parseFleetStatus("no block"), null);
  assert.equal(parseFleetStatus("fleet-status: <working|blocked|needs-decision|ready|red|done> | <reason> | <UTC time>"), null);
  assert.equal(parseFleetStatus("<!-- fleet-status: red | x | 2026-10-17T19:00:00Z -->"), null);
  assert.deepEqual(parseFleetStatus("```fleet\nstate: fixing\nfleet-status: red | Selected specs failed | 2026-10-17T19:00:00Z\n```"),
    { state: "red", reason: "Selected specs failed", at: "2026-10-17T19:00:00.000Z" });
  assert.deepEqual(parseFleetStatus("fleet-status: working"), { state: "working", reason: "", at: null });
});

test("fleet-status: a newer fleet-status or NEEDS-DECISION comment wins; an older one does not", () => {
  const body = "fleet-status: working | fixing red | 2026-10-17T19:00:00Z";
  const older = { body: "fleet-status: ready | green | 2026-10-17T18:00:00Z", created_at: "2026-10-17T18:00:00Z" };
  const ask = { body: "@orchestrator NEEDS-DECISION: re-baseline ratchets?\nmore text", created_at: "2026-10-17T19:30:00Z" };
  const chatter = { body: "looks good", created_at: "2026-10-17T20:00:00Z" };
  assert.equal(fleetStatus(body, [older, chatter]).source, "body");
  assert.deepEqual(fleetStatus(body, [older, ask, chatter]),
    { state: "needs-decision", reason: "re-baseline ratchets?", at: "2026-10-17T19:30:00.000Z", source: "comment" });
  assert.equal(fleetStatus("", [older]).state, "ready");
  assert.equal(fleetStatus("", []), null);
});

test("fleet-status: ageLabel and the FLEET column", () => {
  const now = Date.parse("2026-10-17T20:00:00Z");
  assert.equal(ageLabel("2026-10-17T19:15:00Z", now), "45m");
  assert.equal(ageLabel("2026-10-17T15:00:00Z", now), "5h");
  assert.equal(ageLabel("2026-10-14T20:00:00Z", now), "3d");
  assert.equal(ageLabel(null, now), "?");
  const pr = prObj(1, { body: "fleet-status: blocked | quota until 21:00Z | 2026-10-17T19:00:00Z" });
  const out = render(evaluate([{ pr, runs: [] }], { cap: { cap: 3, count: 0 } }), { now });
  assert.match(out.split("\n")[1], /\sblocked 1h: quota until 21:00Z\s/);
});

test("measure reads the newest comment page for FLEET, and a failed read is not fatal", () => {
  const prs = [prObj(1, { comments: 150, body: "" })];
  const { request, calls } = fakeApi({ prs });
  const withComments = (qs) => (qs === "issues/1/comments?per_page=100&page=2"
    ? { json: [{ body: "fleet-status: red | guards | 2026-10-17T19:00:00Z", created_at: "2026-10-17T19:00:00Z" }] } : request(qs));
  const v = measure({ request: withComments });
  assert.equal(v.ok, true);
  assert.equal(v.rows[0].fleet.state, "red");
  const bare = measure({ request });
  assert.equal(bare.ok, true, "comments 'unexpected' error is advisory");
  assert.equal(bare.rows[0].fleet, null);
  assert.ok(calls.includes("issues/1/comments?per_page=100&page=2"));
  const none = fakeApi({ prs: [prObj(2)] });
  measure({ request: none.request });
  assert.ok(!none.calls.some((c) => c.startsWith("issues/")), "no comment read when the PR has none");
});
