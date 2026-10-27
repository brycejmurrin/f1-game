// pr-board — the read-only PR board a Claude-run CI Watch acts from.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fullTierPassed, DEPLOY, MAX_ARMED, ALARM_HOURS, stalled, alarmLines, SUGGESTIONS, hasMergeHold, laneOf, handoffOwner, ageLabel, ciState, decide, suggest, evaluate, render, measure,
} from "../../tools/ci/pr-board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = (n) => String(n).padStart(40, "a");

const base = {
  draft: false, armed: false, mergeMethod: null, mergeableState: "clean", ci: "success", gate: "passed", fullTier: true,
};
const fullJobs = () => ["CI", "Selected specs (verdict)", "Per-circuit geometry sweeps", "Smoke (page boots, __apex responds)"].map((name) => ({ name, conclusion: "success" }));
const ctx = () => ({});

test("defaults come from github-api", () => {
  assert.equal(DEPLOY, "claude/f1-game-project-26h3ng");
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

test("suggest: READY — draft, green, gate passed; there is no ready cap (2026-10-16)", () => {
  const d = { ...base, draft: true };
  assert.equal(suggest(d, ctx(0)), "READY");
  assert.equal(suggest(d, ctx(2)), "READY");
  assert.equal(suggest(d, ctx()), "READY", "no cap holds a green draft");
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

test("evaluate: sorts, derives ci/gate/failing jobs, and every green draft is READY", () => {
  const items = [
    { pr: prObj(9, { draft: true }), runs: [{ id: 9, status: "completed", conclusion: "success" }], checkRuns: guard() },
    { pr: prObj(3, { draft: true }), runs: [{ id: 3, status: "completed", conclusion: "success" }], checkRuns: guard() },
    { pr: prObj(5, { auto_merge: { merge_method: "merge" } }), runs: [{ id: 5, status: "completed", conclusion: "failure" }],
      jobs: [{ name: "Smoke (2)", conclusion: "failure" }, { name: "lint", conclusion: "success" }, { name: "Smoke (2)", conclusion: "failure" }],
      checkRuns: guard("failure") },
    { pr: prObj(7), runs: [], checkRuns: guard() },
  ];
  const r = evaluate(items);
  assert.deepEqual(r.rows.map((x) => x.number), [3, 5, 7, 9]);
  assert.deepEqual(r.rows.map((x) => x.suggest), ["READY", "FIX", "WAIT", "READY"], "every green draft is READY");
  assert.deepEqual(r.rows[1].failing, ["Smoke (2)"]);
  assert.equal(r.rows[1].gate, "failed");
  assert.equal(r.rows[1].mergeMethod, "merge");
});

test("render: header, one line per PR, a footer; empty board says so", () => {
  const r = evaluate([{ pr: prObj(1, { title: "x".repeat(80) }), runs: [], checkRuns: guard() }]);
  const out = render(r);
  const lines = out.split("\n");
  assert.match(lines[0], /^PR\s+LANE\s+OWNER\s+TITLE\s+STATE\s+HEAD\s+MERGEABLE\s+AUTO-MERGE\s+CI\s+FAILING JOBS\s+GATE\s+PLAN\s+SUGGEST$/);
  assert.match(lines[1], /^#1\s+-\s+-\s+x{39}…\s+ready\s+a{39}1\s+clean\s+-\s+none\s+-\s+passed\s+-\s+WAIT$/);
  assert.match(lines.at(-1), /^pr-board: 1 open PR\(s\)$/);
  const empty = render(evaluate([]));
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

test("measure: failing jobs come from the failed run; --pr reads one PR", () => {
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
  calls.length = 0;
  const one = measure({ request, only: 2 });
  assert.deepEqual(one.rows.map((r) => r.number), [2]);
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
  for (const where of ["pulls?", "pulls/1", "head_sha=", "check-runs"]) {
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
  assert.ok(spawned.length > 4);
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


test("evaluate + render: PLAN is done/items from the body, HOLD is flagged, a sweep never arms past MAX_ARMED", () => {
  const body = "## Plan\n- [x] a — sha\n- [ ] **now:** b\n- [ ] ~~c~~ — dropped\n";
  const items = [
    { pr: prObj(1, { auto_merge: { merge_method: "merge" } }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(2, { body }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(3, { body: "MERGE-HOLD: Bryce\n" }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(4), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(5), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
  ];
  const r = evaluate(items);
  assert.deepEqual(r.rows.map((x) => x.suggest), ["NONE", "WAIT", "WAIT", "ARM", "WAIT"],
    "an open Plan and the hold wait; 1 armed + 1 ARM = MAX_ARMED");
  assert.match(r.rows[1].why, /1 Plan item\(s\) are open/);
  assert.match(r.rows[4].why, /2 PRs are already armed/);
  const lines = render(r).split("\n");
  assert.match(lines[2], /\s2\/3\s+WAIT$/, "two of three items closed (one ticked, one struck)");
  assert.match(lines[3], /WAIT \(HOLD\)$/);
});



// 2026-10-18 dry runs: the board said ARM for #2737 (ready-gate exit 1, plan-open)
// and READY for #2789 (a MERGE-HOLD: line). Neither may fire on such a row.
test("suggest: a MERGE-HOLD: body never yields ARM or READY, at any gate/ci state", () => {
  for (const draft of [false, true]) {
    for (const ci of ["success", "in_progress", "queued", "none"]) {
      const row = { ...base, draft, ci, hold: true };
      const d = decide(row, ctx());
      assert.ok(!["ARM", "READY"].includes(d.action), `${draft ? "draft" : "ready"} ci=${ci}: ${d.action}`);
    }
    const green = decide({ ...base, draft, hold: true }, ctx());
    assert.equal(green.action, "WAIT");
    assert.match(green.why, /MERGE-HOLD:/);
  }
  const body = "## Goal\nx\nMERGE-HOLD: waiting on Bryce\n";
  const item = (draft) => ({ pr: prObj(1, { draft, body }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() });
  assert.equal(evaluate([item(true)]).rows[0].suggest, "WAIT", "#2789: no READY under a hold");
  assert.equal(evaluate([item(false)]).rows[0].suggest, "WAIT");
});

test("suggest: an open Plan item (ready-gate plan-open) never yields ARM", () => {
  const open = { state: "open", items: 3, open: ["**now:** b"] };
  const d = decide({ ...base, plan: open }, ctx());
  assert.equal(d.action, "WAIT");
  assert.match(d.why, /Plan item\(s\) are open/);
  assert.equal(suggest({ ...base, plan: { state: "done", items: 3, open: [] } }, ctx()), "ARM");
  assert.equal(suggest({ ...base, plan: { state: "none", items: 0, open: [] } }, ctx()), "ARM", "no Plan: ready-gate only warns");
  // #2737 end to end: the body is parsed by ready-gate's own planVerdict.
  const body = "## Plan\n- [x] a — sha\n- [ ] **now:** b\n";
  const r = evaluate([{ pr: prObj(2737, { body }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() }]);
  assert.equal(r.rows[0].plan.state, "open");
  assert.equal(r.rows[0].suggest, "WAIT");
});


// The ci-watch skill and the ci-watcher / merge-desk agents were deleted with the
// retired Merge Desk (system audit 2026-10-26); their pins went with them.

test("--alarm: ready + green + no hold + no ci run for 12 h is a stall; drafts, holds, reds and fresh pushes are not", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const old = "2026-10-25T20:00:00Z", fresh = "2026-10-26T10:00:00Z";
  const item = (n, over = {}, at = old, conclusion = "success") => ({ pr: prObj(n, over),
    runs: [{ id: n, status: "completed", conclusion, created_at: at }], jobs: fullJobs(), jobsRunId: n, checkRuns: guard() });
  const r = evaluate([item(1), item(2, { draft: true }), item(3, { body: "MERGE-HOLD: Bryce\n" }), item(4, {}, old, "failure"), item(5, {}, fresh),
    item(6, { auto_merge: { merge_method: "merge" } })]);
  assert.equal(r.rows[0].ciAt, old, "the row carries the head run's created_at");
  assert.deepEqual(stalled(r.rows, { now }).map((x) => x.number), [1, 6]);
  const lines = alarmLines(r.rows, { now });
  assert.match(lines[0], /^#1 STALLED 16h ready\+green, no hold, no push/);
  assert.match(lines[1], /armed merge/);
  assert.equal(lines.at(-1), "= alarm 2 stalled (ready > 12 h, green, no hold, no push)");
  assert.equal(alarmLines([], { now }).at(-1), "= alarm none (ready > 12 h, green, no hold, no push)");
  assert.equal(ALARM_HOURS, 12);
});

test("measure: one recent ci.yml page answers covered heads; only uncovered heads get their own runs read", () => {
  const prs = [prObj(1), prObj(2), prObj(3)];
  const { request, calls } = fakeApi({ prs, checksBySha: { [SHA(1)]: guard(), [SHA(2)]: guard(), [SHA(3)]: guard() },
    runsBySha: { [SHA(3)]: [{ id: 30, status: "completed", conclusion: "success" }] } });
  const recent = [{ id: 10, head_sha: SHA(1), status: "completed", conclusion: "failure" }, { id: 20, head_sha: SHA(2), status: "in_progress" }];
  const v = measure({ request: (q) => q === "actions/workflows/ci.yml/runs?per_page=100" ? (calls.push(q), { json: { workflow_runs: recent } }) : request(q) });
  assert.deepEqual(v.rows.map((r) => r.ci), ["failure", "in_progress", "success"]);
  assert.deepEqual(calls.filter((q) => q.includes("head_sha=")), [`actions/workflows/ci.yml/runs?head_sha=${SHA(3)}&per_page=20`]);
  assert.equal(calls.filter((q) => q === "actions/workflows/ci.yml/runs?per_page=100").length, 1);
  assert.ok(v.requests.requests >= 1, "the snapshot's request count rides on the result");
  const failed = measure({ request: (q) => q === "actions/workflows/ci.yml/runs?per_page=100" ? { error: "HTTP 502" } : request(q) });
  assert.equal(failed.ok, true, `the recent page is advisory: a failure falls back to per-head reads (${failed.error})`);
});

// tools/lib/pr-snapshot.mjs — the shared per-PR reads behind pr-board, needs-sync,
// session-status --pr and queue-depth (pinned here: pr-board is its main reader).
import { createSnapshot, loadStore, saveStore, runsByHead } from "../../tools/lib/pr-snapshot.mjs";

test("pr-snapshot: one process never asks the same URL twice; errors are not memoised; stats count requests", () => {
  const calls = [];
  let fail = true;
  const snap = createSnapshot({ request: (q) => { calls.push(q); if (q === "pulls/9" && fail) { fail = false; return { error: "HTTP 502" }; } return { json: { q } }; } });
  assert.ok(snap.pr(9).error);
  assert.deepEqual(snap.pr(9).json, { q: "pulls/9" }, "a failed read is retried on the next ask");
  snap.pr(9); snap.checkRuns("abc"); snap.checkRuns("abc");
  assert.deepEqual(calls, ["pulls/9", "pulls/9", "commits/abc/check-runs?per_page=100"]);
  assert.deepEqual(snap.stats(), { requests: 3, cached: 0 });
  assert.equal(snap.prsForBranch("cursor/x").json.q, "pulls?head=brycejmurrin:cursor%2Fx&state=open&per_page=10");
});

test("pr-snapshot: the ETag store round-trips through artifacts/ and a 304 reuse is counted", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", `pr-snapshot-${process.pid}`);
  const file = path.join(dir, "etags.json");
  try {
    const url = "https://api.github.com/repos/brycejmurrin/f1-game/pulls/1";
    saveStore(new Map([[url, { etag: 'W/"a"', json: { number: 1 } }]]), file);
    assert.deepEqual(loadStore(file).get(url), { etag: 'W/"a"', json: { number: 1 } });
    fs.writeFileSync(file, "not json");
    assert.equal(loadStore(file).size, 0, "a corrupt cache is an empty cache, never a crash");
    saveStore(new Map([[url, { etag: 'W/"a"', json: { number: 1 } }]]), file);
    const seen = [];
    const run = (_c, args) => { seen.push(args); return { status: 0, stdout: '\n304 W/"a"' }; };
    const snap = createSnapshot({ cacheFile: file, run, env: { GH_TOKEN: "t" } });
    assert.deepEqual(snap.pr(1), { json: { number: 1 }, cached: true });
    assert.ok(seen[0].includes('If-None-Match: W/"a"'), "the stored ETag rides the next process's GET");
    assert.deepEqual(snap.stats(), { requests: 1, cached: 1 });
    snap.save();
    assert.ok(loadStore(file).has(url));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual([...runsByHead([{ head_sha: "a", id: 1 }, { head_sha: "a", id: 2 }, { id: 3 }]).get("a")].map((r) => r.id), [1, 2]);
});
