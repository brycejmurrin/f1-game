// queue-depth — the push hold counts JOBS by OS against the account's slots,
// never runs (docs/notes/ACTIONS-AUDIT-2026-10-14.md finding 6: run-level queue
// wait is 0 for 95 % of runs; the backlog is jobs). Fixture-only, no network.
//
// Run: node --test tests/unit/queue-depth.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINUX_SLOTS, LINUX_HOLD, MACOS_SLOTS, QUEUED_HOLD, MAX_RUNS, DEFAULT_OUT,
  isMac, countJobs, evaluate, reportLine, measure, pushTargets, pushStartsCi, pushVerdict,
} from "../../tools/ci/queue-depth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const job = (status, os = "ubuntu-latest") => ({ status, labels: [os] });
const many = (n, status, os) => Array.from({ length: n }, () => job(status, os));

test("thresholds are the measured account slots", () => {
  assert.equal(LINUX_SLOTS, 40);
  assert.equal(LINUX_HOLD, 60);
  assert.equal(MACOS_SLOTS, 5);
  assert.equal(QUEUED_HOLD, 10);
  assert.equal(MAX_RUNS, 30);
  assert.equal(DEFAULT_OUT, "apex-status/queue-depth.json");
});

test("jobs split by runner label; completed and environment-waiting jobs hold no slot", () => {
  assert.equal(isMac(job("queued", "macos-latest")), true);
  assert.equal(isMac(job("queued", "macos-15-xlarge")), true);
  assert.equal(isMac(job("queued", "ubuntu-24.04")), false);
  assert.equal(isMac({ status: "queued" }), false, "a job with no labels is a standard runner");
  const c = countJobs([
    job("in_progress"), job("queued"), job("pending"), job("requested"), job("completed"), job("waiting"),
    job("in_progress", "macos-latest"), job("queued", "macos-14"), null,
  ]);
  assert.deepEqual(c, { linux: { running: 1, queued: 2, oldestQueuedAt: null }, macos: { running: 1, queued: 1, oldestQueuedAt: null }, laneWaiting: 1 });
});

test("ok under every threshold; the line names jobs in flight, queued and macOS", () => {
  const v = evaluate(countJobs([...many(50, "in_progress"), ...many(9, "queued"), ...many(4, "in_progress", "macos-latest")]),
    { runsExamined: 7, runsLive: 7 });
  assert.equal(v.verdict, "ok");
  assert.equal(v.hold, false);
  assert.equal(reportLine(v), "= queue ok (59 Linux jobs in flight / 40, 9 queued, 4 macOS / 5; 50 Linux running)");
});

test("each threshold alone is a hold", () => {
  const linux = evaluate(countJobs(many(60, "in_progress")));
  assert.equal(linux.verdict, "hold");
  assert.match(reportLine(linux), /^= queue hold \(60 Linux jobs in flight \/ 40, 0 queued, 0 macOS \/ 5; 60 Linux running\) — Linux jobs in flight 60 ≥ 60/);
  const queued = evaluate(countJobs([...many(5, "queued"), ...many(5, "queued", "macos-latest")]));
  assert.equal(queued.verdict, "hold", "macOS queued jobs count toward the queued threshold");
  assert.deepEqual(queued.reasons, ["queued jobs 10 ≥ 10", "macOS jobs in flight 5 ≥ 5"]);
  const mac = evaluate(countJobs(many(5, "in_progress", "macos-latest")));
  assert.deepEqual(mac.reasons, ["macOS jobs in flight 5 ≥ 5"]);
});

test("a run count never drives the verdict: 20 live runs with few jobs is ok", () => {
  const runs = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, status: "queued" }));
  const v = measure({ request: (q) => q.startsWith("actions/runs?status=queued")
    ? { json: { total_count: 20, workflow_runs: runs } }
    : q.startsWith("actions/runs?") ? { json: { total_count: 0, workflow_runs: [] } }
      : { json: { jobs: [] } }, now: () => 0 });
  assert.equal(v.verdict, "ok");
  assert.equal(v.runsExamined, 20);
  assert.equal(v.at, "1970-01-01T00:00:00.000Z");
});

// A fake API: lists by status (paged), per-run jobs (full or per_page=1 total).
function fakeApi(byStatus, jobsOf) {
  const calls = [];
  const request = (q) => {
    calls.push(q);
    let m = q.match(/^actions\/runs\?status=(\w+)&per_page=100&page=(\d+)$/);
    if (m) {
      const all = byStatus[m[1]] || [], page = Number(m[2]);
      return { json: { total_count: all.length, workflow_runs: all.slice((page - 1) * 100, page * 100) } };
    }
    m = q.match(/^actions\/runs\/(\d+)\/jobs\?per_page=(\d+)$/);
    assert.ok(m, `unexpected request ${q}`);
    const jobs = jobsOf(Number(m[1]));
    return { json: { total_count: jobs.length, jobs: jobs.slice(0, Number(m[2])) } };
  };
  return { calls, request };
}

test("#2181: queued runs are examined FIRST — 35 in-progress runs no longer hide 5 queued runs' 50 jobs", () => {
  const inProgress = Array.from({ length: 35 }, (_, i) => ({ id: 100 + i, status: "in_progress" }));
  const queued = Array.from({ length: 5 }, (_, i) => ({ id: 200 + i, status: "queued" }));
  const f = fakeApi({ in_progress: inProgress, queued }, (id) => id >= 200 ? many(10, "queued") : [job("in_progress")]);
  const v = measure({ request: f.request });
  assert.ok(v.queued >= 50, `queued ${v.queued}`);
  assert.equal(v.verdict, "hold");
  assert.equal(v.truncated, true, "10 in-progress runs were not examined");
  assert.ok(v.reasons.some((r) => /^queued jobs ≥50 \(a lower bound\) ≥ 10$/.test(r)), v.reasons.join("|"));
  for (const s of ["queued", "pending", "requested", "in_progress"])
    assert.ok(f.calls.includes(`actions/runs?status=${s}&per_page=100&page=1`), `lists ${s} runs (REST status filter)`);
  assert.ok(f.calls.indexOf("actions/runs?status=queued&per_page=100&page=1") < f.calls.indexOf("actions/runs?status=in_progress&per_page=100&page=1"));
});

test("#2181: queued runs past the cap are counted by their jobs total (per_page=1), and lists page past 100", () => {
  const queued = Array.from({ length: 150 }, (_, i) => ({ id: 1000 + i, status: "queued" }));
  const f = fakeApi({ queued }, (id) => id === 1000 + 149 ? [job("queued", "macos-latest"), job("queued", "macos-latest")] : many(4, "queued"));
  const v = measure({ request: f.request, maxRuns: 30, maxCounted: 200 });
  assert.ok(f.calls.includes("actions/runs?status=queued&per_page=100&page=2"), "second page read");
  assert.equal(v.runsExamined, 30);
  assert.equal(v.runsCounted, 120);
  assert.equal(v.runsLive, 150);
  assert.equal(v.truncated, false, "every live run was examined or counted");
  assert.equal(v.linux.queued, 149 * 4);
  assert.equal(v.macos.queued, 2, "a counted run's OS comes from its sampled job");
  assert.equal(f.calls.filter((q) => q.endsWith("jobs?per_page=1")).length, 120);
  assert.match(v.line, /30 of 150 live runs examined, 120 queued runs counted by job total/);
});

test("measure: bounded examination, dedupe across status lists, truncation reported", () => {
  const inProgress = Array.from({ length: 35 }, (_, i) => ({ id: 100 + i, status: "in_progress" }));
  const f = fakeApi({ in_progress: inProgress, queued: [{ id: 100, status: "queued" }] }, () => [job("in_progress")]);
  const v = measure({ maxRuns: MAX_RUNS, request: f.request });
  assert.equal(f.calls.filter((q) => q.includes("/jobs?per_page=100")).length, MAX_RUNS, "one full jobs call per examined run, never more");
  assert.equal(v.runsExamined, 30);
  assert.equal(v.runsLive, 35, "run 100 listed twice is one run");
  assert.equal(v.truncated, true);
  assert.equal(v.linux.inFlight, 30);
  assert.match(v.line, /30 of 35 live runs examined, a lower bound/);
});

test("measure: any API failure is an error, never an ok", () => {
  assert.match(measure({ request: () => ({ error: "HTTP 403" }) }).error, /runs \(queued\): HTTP 403/);
  assert.match(measure({ request: (q) => q.startsWith("actions/runs?status=queued&") ? { json: { total_count: 1, workflow_runs: [{ id: 9 }] } }
    : q.startsWith("actions/runs?") ? { json: { total_count: 0, workflow_runs: [] } } : { error: "HTTP 502" } }).error,
    /run #9 jobs: HTTP 502/);
  assert.match(measure({ request: () => ({ json: {} }) }).error, /no run array/);
});

// #2182: the hold applies only to a push that starts CI.
test("#2182: pushTargets reads the destination branch of every git push in a command", () => {
  const cur = "cursor/here-1";
  assert.deepEqual(pushTargets("git push", cur), [cur]);
  assert.deepEqual(pushTargets("git push -u origin cursor/topic-1234", cur), ["cursor/topic-1234"]);
  assert.deepEqual(pushTargets("git push origin HEAD", cur), [cur]);
  assert.deepEqual(pushTargets("git push origin @", cur), [cur]);
  assert.deepEqual(pushTargets("git push origin HEAD:refs/heads/cursor/x", cur), ["cursor/x"]);
  assert.deepEqual(pushTargets("git push origin sync-pr-a:cursor/a", cur), ["cursor/a"]);
  assert.deepEqual(pushTargets("git -C . push -o ci.skip origin cursor/x", cur), ["cursor/x"]);
  assert.deepEqual(pushTargets("git fetch && git push origin HEAD", cur), [cur]);
  assert.deepEqual(pushTargets("bash -c 'git push origin cursor/q'", cur), ["cursor/q"]);
  assert.deepEqual(pushTargets("git push origin cursor/a cursor/b", cur), ["cursor/a", "cursor/b"]);
  assert.equal(pushTargets("git push --tags origin", cur), null, "not a branch push: unknown");
  assert.equal(pushTargets("git push --all origin", cur), null);
  assert.equal(pushTargets("git push", ""), null, "detached HEAD: unknown");
  assert.equal(pushTargets("git status", cur), null, "no push at all");
});

test("#2182: pushStartsCi — only a ready PR or a draft labelled run-ci starts CI; unknown answers never skip", () => {
  const pulls = (list) => (q) => { assert.match(q, /^pulls\?head=brycejmurrin:[^&]+&state=open&per_page=10$/); return { json: list }; };
  assert.equal(pushStartsCi("cursor/x", pulls([])).ci, false);
  assert.match(pushStartsCi("cursor/x", pulls([])).why, /no open PR/);
  assert.equal(pushStartsCi("cursor/x", pulls([{ number: 7, draft: true, labels: [] }])).ci, false);
  assert.match(pushStartsCi("cursor/x", pulls([{ number: 7, draft: true, labels: [] }])).why, /#7 is a draft without run-ci/);
  assert.equal(pushStartsCi("cursor/x", pulls([{ number: 7, draft: true, labels: [{ name: "run-ci" }] }])).ci, true);
  assert.equal(pushStartsCi("cursor/x", pulls([{ number: 8, draft: false, labels: [] }])).ci, true);
  assert.equal(pushStartsCi("claude/f1-game-project-26h3ng", () => assert.fail("no lookup")).ci, true, "the deploy branch always starts a run (pages.yml, the train)");
  assert.equal(pushStartsCi("cursor/x", () => ({ error: "HTTP 502" })).ci, null, "a failed lookup is unknown");
  // the CLI's decision over every target
  const noPr = pulls([]);
  assert.equal(pushVerdict("git push -u origin cursor/x", "cursor/x", noPr).skip, true);
  assert.match(pushVerdict("git push -u origin cursor/x", "cursor/x", noPr).line, /^= queue skip — push starts no CI \(cursor\/x: no open PR\)/);
  assert.equal(pushVerdict("git push --tags origin", "cursor/x", noPr).skip, false, "unknown target: measure");
  assert.equal(pushVerdict("git push origin cursor/a cursor/b", "", (q) => decodeURIComponent(q).includes("cursor/b")
    ? { json: [{ number: 9, draft: false, labels: [] }] } : { json: [] }).skip, false, "any target that starts CI measures");
});

test("the written status file is gitignored and the docs cite the tool and JOBS", () => {
  assert.match(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^apex-status\/$/m);
  const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  assert.match(agents, /tools\/ci\/queue-depth\.mjs/);
  assert.doesNotMatch(agents, />15 runs/);
  for (const f of [".claude/skills/steward/references/ownership.md",
    "cursor-plugins/apex-f1-game/skills/apex-ci-and-pages-watch/SKILL.md",
    "cursor-plugins/apex-f1-game/skills/apex-cloud-agent-launch/SKILL.md"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.match(s, /queue-depth\.mjs/, f);
    assert.doesNotMatch(s, />15 runs/, f);
  }
});

// #2266: on 2026-10-15 ~17:30Z only 7–12 Linux jobs ran while 25–36 sat queued
// with no runner — the 40-slot model said "room". Report what is observed:
// running vs queued, and the oldest queued job's age; a stale queue holds.
test("#2266: running, queued and the oldest-queued age are reported; a starved queue holds", async () => {
  const { STARVED_AGE_MIN } = await import("../../tools/ci/queue-depth.mjs");
  assert.equal(STARVED_AGE_MIN, 10);
  const NOW = Date.parse("2026-10-15T17:45:00Z");
  const at = (minAgo) => new Date(NOW - minAgo * 60e3).toISOString();
  const q = (minAgo, os) => ({ ...job("queued", os), created_at: at(minAgo) });
  // 10 running / 30 queued, oldest 15 min: hold, and the age names the starvation.
  const starved = evaluate(countJobs([...many(10, "in_progress"), q(15), ...Array.from({ length: 29 }, () => q(2))]), { now: NOW });
  assert.equal(starved.verdict, "hold");
  assert.equal(starved.linux.oldestQueuedMin, 15);
  assert.ok(starved.reasons.includes("oldest queued Linux job 15 min ≥ 10 (10 running: runners starved)"), starved.reasons.join("|"));
  assert.match(reportLine(starved), /^= queue hold \(40 Linux jobs in flight \/ 40, 30 queued, 0 macOS \/ 5; 10 Linux running, oldest queued 15m\)/);
  // 38 running / 2 queued, fresh: ok.
  const busy = evaluate(countJobs([...many(38, "in_progress"), q(1), q(0)]), { now: NOW });
  assert.equal(busy.verdict, "ok");
  assert.equal(reportLine(busy), "= queue ok (40 Linux jobs in flight / 40, 2 queued, 0 macOS / 5; 38 Linux running, oldest queued 1m)");
  // Starvation with few queued: 3 running, 4 queued, oldest 12 min — under every count threshold, still a hold.
  const few = evaluate(countJobs([...many(3, "in_progress"), q(12), q(1), q(1), q(1)]), { now: NOW });
  assert.equal(few.verdict, "hold");
  // A macOS queue never drives the Linux age; no queued job, no age.
  const mac = evaluate(countJobs([q(30, "macos-latest"), ...many(5, "in_progress")]), { now: NOW });
  assert.equal(mac.linux.oldestQueuedMin, null);
  assert.ok(!mac.reasons.some((r) => /oldest queued/.test(r)));
  assert.match(reportLine(mac), /; 5 Linux running\)$/);
});

test("#2266: a run in status `waiting` is listed too (its queued jobs count)", () => {
  const f = fakeApi({ waiting: [{ id: 77, status: "waiting" }] }, () => many(3, "queued"));
  const v = measure({ request: f.request });
  assert.ok(f.calls.includes("actions/runs?status=waiting&per_page=100&page=1"));
  assert.equal(v.queued, 3);
});

test("an old queued job with half the slots running is a released lane leg, not starvation", () => {
  // 2026-10-15 23:27Z: one leg queued for seconds after 113 min `pending` read as 115 min starved, 36 running.
  const now = Date.parse("2026-10-15T23:27:00Z");
  const leg = { ...job("queued"), created_at: new Date(now - 115 * 60e3).toISOString() };
  const v = evaluate(countJobs([...many(36, "in_progress"), leg]), { now });
  assert.equal(v.verdict, "ok", v.reasons.join("|"));
  assert.equal(v.linux.oldestQueuedMin, 115, "the age is still reported");
});

test("a `pending` job waits in a CI lane, not for a runner: counted apart, never a hold", () => {
  // 2026-10-15 22:23Z: 30 lane-waiting legs since 20:42 read as starved runners while 7 of 40 ran.
  const old = Date.parse("2026-10-15T20:42:00Z"), now = Date.parse("2026-10-15T22:23:00Z");
  const lane = Array.from({ length: 30 }, () => ({ status: "pending", labels: ["ubuntu-latest"], created_at: new Date(old).toISOString() }));
  const v = evaluate(countJobs([...lane, ...many(7, "in_progress")]), { now });
  assert.equal(v.verdict, "ok");
  assert.equal(v.queued, 0);
  assert.equal(v.laneWaiting, 30);
  assert.equal(v.linux.oldestQueuedMin, null, "a lane wait is not a runner wait");
  assert.equal(reportLine(v), "= queue ok (7 Linux jobs in flight / 40, 0 queued, 0 macOS / 5; 7 Linux running, 30 waiting in CI lanes)");
});
