// pr-board — the read-only PR board a Claude-run CI Watch acts from.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fullTierPassed, DEPLOY, MAX_ARMED, ALARM_HOURS, stalled, alarmLines, busAlarms, SUGGESTIONS, hasMergeHold, parseHolds, parseFleetStatus, fleetStatus, ageLabel, ciState, decide, suggest, evaluate, render, measure,
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

test("hasMergeHold: only the full shape `MERGE-HOLD: <reason> | lift: <who> | until: <t>` a reader can see is a veto (G12)", () => {
  const full = "MERGE-HOLD: waiting on Bryce | lift: Bryce | until: 18:00 PT";
  assert.equal(hasMergeHold(`## Goal\nx\n${full}\n`), true);
  // markdown dress, case and Unicode dashes still read as the hold a human sees (redteam-gates G12: 11 forms missed)
  for (const dressed of [`**MERGE-HOLD:** x | lift: y | until: z`, `**MERGE-HOLD**: x | lift: y | until: z`, `- ${full}`,
    `> ${full}`, `  * ${full}`, `## ${full}`, `1. ${full}`, `merge-hold: x | lift: y | until: z`, "MERGE‑HOLD: x | lift: y | until: z",
    "- [ ] MERGE-HOLD: x | lift: y | until: z"]) {
    assert.equal(hasMergeHold(dressed), true, dressed);
  }
  // examples a reader does not see are no veto: comments (closed or not), fenced code, <details>
  for (const hidden of [`<!-- ${full} -->`, `<!-- unclosed\n${full}`, "```\n" + full + "\n```", "~~~md\n" + full + "\n~~~",
    `<details><summary>old</summary>\n\n${full}\n</details>`]) {
    assert.equal(hasMergeHold(hidden), false, hidden);
  }
  assert.equal(hasMergeHold(`please see ${full}`), false, "a mid-sentence mention");
  assert.equal(hasMergeHold("do not merge"), false);
  assert.equal(hasMergeHold(null), false);
  assert.equal(hasMergeHold("MERGE-HOLD: <reason> | lift: <who> | until: <time|event>"), false, "the template placeholder");
});

test("parseHolds: owner tags are never vetoes; any other short MERGE-HOLD line is malformed (DECISIONS #6)", () => {
  assert.deepEqual(parseHolds("MERGE-HOLD: DAD merges (do not remove)"), { holds: [], owners: ["DAD"], malformed: [] });
  assert.deepEqual(parseHolds("MERGE-HOLD: DAD merges (do not remove) | lift: D orchestrator | until: READY+merge-gate").owners, ["DAD"],
    "#3835's well-shaped owner tag is still an owner tag");
  assert.deepEqual(parseHolds("**owner:** D  # lent").owners, ["D"]);
  assert.deepEqual(parseHolds("MERGE-HOLD: deploy gate remains pending"), { holds: [], owners: [], malformed: ["deploy gate remains pending"] });
  assert.deepEqual(parseHolds("MERGE-HOLD: x | lift: Bryce").malformed, ["x | lift: Bryce"], "no until: is not the shape");
  assert.deepEqual(parseHolds("MERGE-HOLD: x | lift: Bryce | until: 9pm").holds, [{ reason: "x", lift: "Bryce", until: "9pm" }]);
  const row = evaluate([{ pr: prObj(7, { body: "MERGE-HOLD: DAD merges\n\n```fleet\nfleet: A\nmerger: D\n```\nMERGE-HOLD: pending" }),
    runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() }]).rows[0];
  assert.equal(row.hold, false);
  assert.equal(row.owner, "D,DAD");
  assert.equal(row.merger, "D");
  assert.equal(row.suggest, "ARM", "an owner tag and a malformed line hold nothing");
  assert.match(render({ rows: [row] }).split("\n")[1], /^#7\s+A\s+-\s+D,DAD\s.*ARM \(HOLD\? malformed, not a veto\)$/);
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
  assert.equal(lines[0].split(/\s+/).join(" "), "PR FL SLOT OWNER TITLE STATE HEAD MERGEABLE AUTO-MERGE CI FAILING JOBS GATE PLAN FLEET SUGGEST");
  assert.match(lines[1], /^#1\s+-\s+-\s+-\s+x{39}…\s+ready\s+a{39}1\s+clean\s+-\s+none\s+-\s+passed\s+-\s+-\s+WAIT$/);
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
  const pooled = [];
  const run = (cmd, args, opts) => {
    // A pr-snapshot pool round: the URLs ride the stdin config. Answer nothing, so every URL falls back to the
    // serial GET below (the fallback path is what this test pins); the config itself must carry no write verb.
    if (args.includes("--parallel")) {
      pooled.push(opts.input);
      assert.equal(cmd, "curl");
      assert.ok(!args.join(" ").includes("t0k3n"), "the token never appears in argv");
      assert.doesNotMatch(opts.input, /^\s*(request|data[\w-]*|form|upload-file|json)\s*=/m, "a pool round is GETs only");
      return { status: 0, stdout: "", stderr: "" };
    }
    spawned.push({ cmd, args, opts });
    const url = args.find((a) => a.startsWith("https://api.github.com/repos/"));
    const qs = url.split("/repos/brycejmurrin/f1-game/")[1];
    const f = fakeApi({ prs, checksBySha: { [SHA(1)]: guard(), [SHA(2)]: guard() } }).request(qs);
    return { status: 0, stdout: `${JSON.stringify(f.json)}\n${f.error ? 500 : 200}`, stderr: "" };
  };
  const v = measure({ snapshot: createSnapshot({ run, env: { GH_TOKEN: "t0k3n" }, cacheFile: null }) });   // never the real ETag store
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
  assert.ok(pooled.length >= 2 && pooled.every((cfg) => /^url = "https:\/\/api\.github\.com\/repos\/brycejmurrin\/f1-game\//m.test(cfg)));
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

// Messaging and ownership moved again in the 2026-10-26 one-home-per-rule rewrite:
// formats in comms.md, authority (permission laundering) in authority.md, the
// claim board in agent-fleet SKILL.md, the PR-owner loop in role-pr-owner.md.
test("agent-fleet comms + authority references pin the message formats, authority and subscription names", () => {
  const dir = ".claude/skills/agent-fleet/";
  const t = read(dir + "references/comms.md");
  const skill = read(dir + "SKILL.md");
  assert.match(skill, /references\/comms\.md/);
  for (const f of ["DONE <PR> <merge sha>", "BLOCKED <PR>", "HANDOFF <PR>", "STAND-DOWN <PR>"]) assert.ok(t.includes(f), f);
  assert.match(read(dir + "references/authority.md"), /permission laundering/);
  assert.match(t, /DATA/);
  assert.match(t, /subscribe_pr_activity/);
  assert.match(skill, /who-is-on-it\.mjs/);
  assert.match(t, /@parent/);
});

test("agent-fleet role-pr-owner (ex steward ownership, ex pr-owner) pins the loop's gates", () => {
  const t = read(".claude/skills/agent-fleet/references/role-pr-owner.md");
  assert.match(t, /head sha/i);
  assert.match(t, /sync-pr\.mjs/);
  assert.match(t, /remote-group\.mjs/);
  assert.match(t, /ready-gate\.mjs/);
  assert.match(t, /Do not enable auto-merge or merge/);
  assert.match(read(".claude/skills/agent-fleet/SKILL.md"), /\.github\/pull_request_template\.md/);
});

test("evaluate + render: PLAN is done/items from the body, HOLD is flagged, a sweep never arms past MAX_ARMED", () => {
  const body = "## Plan\n- [x] a — sha\n- [ ] **now:** b\n- [ ] ~~c~~ — dropped\n";
  const items = [
    { pr: prObj(1, { auto_merge: { merge_method: "merge" } }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(2, { body }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(3, { body: "MERGE-HOLD: Bryce reviews | lift: Bryce | until: his word\n" }), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(4), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
    { pr: prObj(5), runs: [{ id: 1, status: "completed", conclusion: "success" }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() },
  ];
  const r = evaluate(items);
  assert.deepEqual(r.rows.map((x) => x.suggest), ["NONE", "WAIT", "WAIT", "ARM", "WAIT"],
    "an open Plan and the hold wait; 1 armed + 1 ARM = MAX_ARMED");
  assert.match(r.rows[1].why, /1 Plan item\(s\) are open/);
  assert.match(r.rows[4].why, /2 PRs are already armed/);
  const lines = render(r).split("\n");
  assert.match(lines[2], /\s2\/3\s+-\s+WAIT$/, "two of three items closed (one ticked, one struck)");
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
  const out = render(evaluate([{ pr, runs: [] }]), { now });
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
  const body = "## Goal\nx\nMERGE-HOLD: waiting on Bryce | lift: Bryce | until: 18:00 PT\n";
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

test("suggest: ci.yml pending on the head never yields ARM or READY, even with full-tier jobs and the gate", () => {
  for (const status of ["queued", "in_progress", "pending", "waiting", "requested"]) {
    const runs = [{ id: 1, status: "completed", conclusion: "success" }, { id: 2, status }];
    for (const draft of [false, true]) {
      const r = evaluate([{ pr: prObj(1, { draft }), runs, jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() }]);
      assert.equal(r.rows[0].suggest, "WAIT", `${status} ${draft ? "draft" : "ready"}`);
      assert.notEqual(r.rows[0].ci, "success");
    }
  }
  assert.equal(evaluate([{ pr: prObj(1), runs: [{ id: 1, status: "completed", conclusion: null }], jobs: fullJobs(), jobsRunId: 1, checkRuns: guard() }]).rows[0].suggest, "WAIT");
});

test("fleet letter and slot: JSON fleetLetter/slot and the FL/SLOT columns come from the body's fleet block", () => {
  const block = (lines) => "## Goal\nx\n\n```fleet\n" + lines.join("\n") + "\n```\n";
  const items = [
    { pr: prObj(1, { body: block(["worker: claude:session_01W", "fleet: B", "slot: B·W3", "orchestrator: B"]) }), runs: [] },
    { pr: prObj(2, { body: block(["orchestrator: A", "title: [Worker] A·W7 · tools · Opus"]) }), runs: [] },
    { pr: prObj(3, { body: block(["orchestrator: claude:session_01ORCH"]) }), runs: [] },
    { pr: prObj(4, { body: "no block\nfleet-status: ready | green | 2026-10-17T19:00:00Z" }), runs: [] },
  ];
  const r = evaluate(items);
  assert.deepEqual(r.rows.map((x) => [x.fleetLetter, x.slot]), [["B", "B·W3"], ["A", "A·W7"], ["-", "-"], ["-", "-"]]);
  assert.equal(r.rows[3].fleet.state, "ready", "`fleet` stays the fleet-status report fleet-tick.mjs reads");
  const lines = render(r).split("\n");
  assert.deepEqual(lines[1].split(/\s+/).slice(0, 3), ["#1", "B", "B·W3"]);
  assert.deepEqual(lines[2].split(/\s+/).slice(0, 3), ["#2", "A", "A·W7"]);
  assert.deepEqual(lines[3].split(/\s+/).slice(0, 3), ["#3", "-", "-"]);
});

// The ci-watch skill and the ci-watcher / merge-desk agents were deleted with the
// retired Merge Desk (system audit 2026-10-26); their pins went with them.

test("--alarm: ready + green + no hold + no ci run for 2 h is a stall; drafts, holds, reds and fresh pushes are not", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const old = "2026-10-26T09:00:00Z", fresh = "2026-10-26T11:00:00Z";
  const item = (n, over = {}, at = old, conclusion = "success") => ({ pr: prObj(n, over),
    runs: [{ id: n, status: "completed", conclusion, created_at: at }], jobs: fullJobs(), jobsRunId: n, checkRuns: guard() });
  const r = evaluate([item(1), item(2, { draft: true }), item(3, { body: "MERGE-HOLD: Bryce | lift: Bryce | until: his word\n" }),
    item(4, {}, old, "failure"), item(5, {}, fresh), item(6, { auto_merge: { merge_method: "merge" } }), item(8, { body: "MERGE-HOLD: DAD merges\n" })]);
  assert.equal(r.rows[0].ciAt, old, "the row carries the head run's created_at");
  assert.deepEqual(stalled(r.rows, { now }).map((x) => x.number), [1, 6, 8], "an owner tag is no hold: #8 stalls");
  const lines = alarmLines(r.rows, { now });
  assert.match(lines[0], /^#1 STALLED 3h ready\+green, no hold, no push/);
  assert.match(lines[1], /armed merge/);
  assert.equal(lines[2].split(": ")[0], "#8 STALLED 3h ready+green, no hold, no push (fleet -, owner DAD)");
  assert.equal(lines.at(-1), "= alarm 3 stalled, 0 fleet (ready > 2 h, green, no hold, no push; bus not read)");
  assert.equal(alarmLines([], { now, bus: [] }).at(-1),
    "= alarm none (ready > 2 h, green, no hold, no push; lends without merger:, fleets without a live orchestrator)");
  assert.equal(ALARM_HOURS, 2);
});

test("busAlarms: a lend on the bus with no merger: in the block, and a fleet with no live orchestrator (BH5, audit3 #12)", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const t = (iso) => Date.parse(iso) / 1000;
  const rows = [
    { number: 3725, fleetLetter: "A", merger: "" }, { number: 3731, fleetLetter: "A", merger: "D" },
    { number: 3700, fleetLetter: "D", merger: "" }, { number: 3800, fleetLetter: "B", merger: "" },
  ];
  const bus = [
    { sha: "a".repeat(40), at: t("2026-10-26T11:00:00Z"), type: "HANDOFF", from: "claude:session_01A", to: "*", text: "ORCH A LIVE claude:session_01A" },
    { sha: "b".repeat(40), at: t("2026-10-24T11:00:00Z"), type: "HANDOFF", from: "claude:session_01B", to: "*", text: "ORCH B LIVE claude:session_01B" },
    { sha: "c".repeat(40), at: t("2026-10-26T04:00:00Z"), type: "INFO", from: "grok:DAD", to: "A", text: "#3725 #3731 lent to A for the scenery train merger:B" },
    { sha: "d".repeat(40), at: t("2026-10-26T05:00:00Z"), type: "LEASE", from: "claude:session_01A", to: "*", text: "LEND-EXTEND #3800 30m" },
  ];
  // #3800's LEND-EXTEND is a lease word, not a lend: no row for it
  assert.deepEqual(busAlarms(rows, bus, { now }), [
    "#3725 LEND on the bus (ccccccc, merger B) but the fleet block has no merger: — pr-body --fleet merger=B",
    "#3731 LEND names merger B (ccccccc) but the fleet block says merger: D",
    "fleet B NO ORCHESTRATOR: newest ORCH B LIVE claude:session_01B is 2d old (> 24 h; #3800)",
    "fleet D NO ORCHESTRATOR: no ORCH D LIVE line in the last 4 bus entries (#3700)",
  ]);
  assert.equal(alarmLines(rows, { now, bus }).at(-1),
    "= alarm 0 stalled, 4 fleet (ready > 2 h, green, no hold, no push; lends without merger:, fleets without a live orchestrator)");
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
import { createSnapshot, loadStore, saveStore, capStore, batchGet, parseBatchOut, POOL, runsByHead } from "../../tools/lib/pr-snapshot.mjs";

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

test("pr-snapshot store: gzipped on disk, legacy plain JSON still read, capped by bytes oldest-first (tools T12)", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", `pr-snapshot-gz-${process.pid}`);
  const file = path.join(dir, "etags.json");
  try {
    const big = { etag: 'W/"b"', json: { blob: "x".repeat(5000) } };
    saveStore(new Map([["u1", big], ["u2", big], ["u3", { etag: 'W/"c"', json: 1 }]]), file, { maxBytes: 6000 });
    const raw = fs.readFileSync(file);
    assert.deepEqual([raw[0], raw[1]], [0x1f, 0x8b], "gzip magic");
    assert.deepEqual([...loadStore(file).keys()], ["u2", "u3"], "the oldest entry went first to fit the byte cap");
    fs.writeFileSync(file, JSON.stringify({ u9: { etag: "e", json: 2 } }));
    assert.deepEqual(loadStore(file).get("u9"), { etag: "e", json: 2 }, "a pre-gzip store still loads");
    assert.equal(capStore(new Map([["a", big]]), 10).size, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pr-snapshot pool: one curl --parallel round, ETag per URL, 200 stored, 304 reused, anything else left to the serial GET (tools T1)", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", `pr-snapshot-pool-${process.pid}`);
  const U = (q) => `https://api.github.com/repos/brycejmurrin/f1-game/${q}`;
  const store = new Map([[U("pulls/2"), { etag: 'W/"two"', json: { number: 2, old: true } }]]);
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts.input });
    const outs = [...opts.input.matchAll(/^output = "(.+)"$/gm)].map((m) => m[1]);
    fs.writeFileSync(outs[0], JSON.stringify({ number: 1 }));
    return { status: 0, stdout: `=1 304 W/"two"\n=0 200 W/"one"\n=2 502 \n` };
  };
  try {
    const got = batchGet([U("pulls/1"), U("pulls/2"), U("pulls/3")], { store, run, env: { GH_TOKEN: "t0k" }, dir });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(0, 4), ["-sS", "--parallel", "--parallel-max", String(POOL)]);
    assert.ok(!calls[0].args.join(" ").includes("t0k"), "the token rides stdin, never argv");
    assert.deepEqual(calls[0].input.split("\nnext\n").map((b) => b.split("\n").filter((l) => l.startsWith('header = "If-None-Match'))),
      [[], ['header = "If-None-Match: W/\\"two\\""'], []], "pulls/2's stored ETag rides its own block, and only that one");
    assert.equal(calls[0].input.split("\nnext\n").length, 3, "one config block per URL");
    assert.doesNotMatch(calls[0].input, /^write-out = "@/m, "curl reads a write-out starting with @ from a FILE: no status would come back");
    assert.deepEqual(got.get(U("pulls/1")), { json: { number: 1 } });
    assert.deepEqual(got.get(U("pulls/2")), { json: { number: 2, old: true }, cached: true });
    assert.equal(got.has(U("pulls/3")), false, "a 502 is not answered here: the serial GET retries it");
    assert.equal(store.get(U("pulls/1")).etag, 'W/"one"');
    assert.equal(batchGet([U("x")], { store, run, env: {}, gh: () => null, dir }), null, "no token: no round");
    assert.deepEqual(parseBatchOut('=3 200 W/"e"\r\nnoise\n=4 000 '), new Map([[3, { status: 200, etag: 'W/"e"' }], [4, { status: 0, etag: "" }]]));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // prefetch fills the memo the serial reads hit; a miss falls through to `request`
  const asked = [];
  const snap = createSnapshot({ request: (q) => { asked.push(q); return { json: { q } }; },
    batch: (urls) => new Map(urls.filter((u) => !u.endsWith("/3")).map((u) => [u, { json: { pooled: u } }])) });
  assert.equal(snap.prefetch(["pulls/1", "pulls/3", "pulls/1"]), 1);
  assert.deepEqual(snap.pr(1).json, { pooled: U("pulls/1") });
  assert.deepEqual(snap.pr(3).json, { q: "pulls/3" });
  assert.deepEqual(asked, ["pulls/3"]);
});
