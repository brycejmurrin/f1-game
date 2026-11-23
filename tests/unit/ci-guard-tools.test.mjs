// ci-guard-tools — CI guards born on 2026-10-15 (weather PR #1800, the Actions jam):
//  - tools/ci/ci-rerun.mjs refuses a superseded PR run (re-running one cancelled
//    the live run on the new head), a live run, a green run and a second re-run;
//  - .github/workflows/ci-cancel-on-close.yml cancels only runs eligible for this close event.
// No network or browser.
//
// Run: node --test tests/unit/ci-guard-tools.test.mjs
import test from "node:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import assert from "node:assert/strict";
import { decide, latestPrRunId, prNumberOf } from "../../tools/ci/ci-rerun.mjs";

const run = (o = {}) => ({ id: 1, status: "completed", conclusion: "failure", event: "pull_request", head_sha: "aaaa1111", run_attempt: 1, pull_requests: [{ number: 7 }], ...o });

test("ci-rerun: a superseded PR run is refused (the #1800 trap)", () => {
  const v = decide(run({ conclusion: "cancelled", head_sha: "82e73b048" }), "8fca23f8d");
  assert.equal(v.ok, false);
  assert.match(v.reason, /superseded/);
});

test("ci-rerun: a live run, a green run, an unreadable PR head and a second attempt are refused", () => {
  assert.equal(decide(run({ status: "queued" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ status: "in_progress" }), "aaaa1111").ok, false);
  assert.equal(decide(run({ conclusion: "success" }), "aaaa1111").ok, false);
  assert.equal(decide(run(), null).ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111").ok, false);
  assert.equal(decide(run({ run_attempt: 2 }), "aaaa1111", { again: true, latestRunId: 1 }).ok, true);
});

test("ci-rerun: a completed failed run on the current head is allowed; push/dispatch runs need no PR", () => {
  assert.equal(decide(run(), "aaaa1111", { latestRunId: 1 }).ok, true);
  assert.equal(decide(run({ event: "push", pull_requests: [] }), null).ok, true);
  assert.equal(decide(run({ event: "workflow_dispatch", pull_requests: [] }), null).ok, true);
  assert.equal(prNumberOf(run()), 7);
  assert.equal(prNumberOf(run({ pull_requests: [] })), null);
});

test("ci-rerun: a newer run of the same workflow on the same PR head supersedes the failed run (#6081)", () => {
  const first = run({ id: 44831538329, workflow_id: 42, run_number: 10, head_branch: "topic",
    created_at: "2026-11-20T22:45:30Z", head_repository: { id: 5 }, pull_requests: [{ number: 5296 }] });
  const newer = { ...first, id: 44841724124, run_number: 11 };
  const get = (rows) => (path) => {
    const url = new URL(path, "https://example.test/");
    assert.equal(url.pathname, "/actions/workflows/42/runs");
    assert.deepEqual(Object.fromEntries(url.searchParams), { event: "pull_request", head_sha: first.head_sha,
      branch: "topic", created: `>=${first.created_at}`, per_page: "100", page: "1" });
    return { json: { total_count: rows.length, workflow_runs: rows } };
  };
  const verdict = (target, rows) => decide(target, target.head_sha, {
    latestRunId: latestPrRunId(target, 5296, get(rows)), again: true,
  });
  for (const status of ["queued", "in_progress", "completed"]) {
    assert.match(verdict(first, [first, { ...newer, status }]).reason, /superseded by run 44841724124/);
  }
  assert.equal(verdict(newer, [first, newer]).ok, true);
  assert.equal(verdict(first, [first, { ...newer, pull_requests: [{ number: 22 }] }]).ok, true);
  assert.equal(verdict(first, [first, { ...newer, pull_requests: [] }]).ok, false);
  assert.equal(verdict(first, []).ok, false);
  assert.equal(latestPrRunId(first, 5296, () => ({ error: "HTTP 403" })), null);
});

test("replaying a close leaves reopened CI alone and a current close cleans up older runs", () => {
  const wf = parse(fs.readFileSync(new URL("../../.github/workflows/ci-cancel-on-close.yml", import.meta.url), "utf8"));
  assert.deepEqual(wf.on.pull_request_target.types, ["closed"]);
  const job = wf.jobs["cancel-stragglers"];
  assert.equal(wf.concurrency, undefined, "admitting a replay must not evict CI");
  assert.equal(job.concurrency, undefined);
  const before = "2026-11-21T11:59:59Z", close = "2026-11-21T12:00:00Z", after = "2026-11-21T12:00:01Z";
  const old = run({ created_at: before, head_repository: { full_name: "owner/repo" } });
  const runs = [
    old, { ...old, id: 2, created_at: after }, { ...old, id: 3, created_at: close },
    { ...old, id: 4, pull_requests: [{ number: 8 }] },
    { ...old, id: 5, run_attempt: 2, run_started_at: after },
    { ...old, id: 6, head_repository: { full_name: "other/repo" } },
    { ...old, id: 7, pull_requests: [] }, { ...old, id: 8, pull_requests: [], head_sha: "another" },
  ];
  const mock = `
    gh() {
      case "$*" in
        "api repos/owner/repo/pulls/7") echo "$LIVE" ;;
        *"branch=topic -f event=pull_request -f status=queued "*) echo "$RUNS" ;;
        *"branch=topic -f event=pull_request -f status="*) echo '{"workflow_runs":[]}' ;;
        "api -X POST repos/owner/repo/actions/runs/"*"/cancel") echo "$*" >&3 ;;
        *) return 1 ;;
      esac
    }
    exec 3>&1
  `;
  const cancelled = (state, closed_at) => execFileSync("bash", ["-c", mock + job.steps[0].run], {
    encoding: "utf8", env: { ...process.env, REPO: "owner/repo", BRANCH: "topic", HEAD_REPO: "owner/repo",
      HEAD_SHA: old.head_sha, PR: "7", CLOSED_AT: close, LIVE: JSON.stringify({ state, closed_at }),
      RUNS: JSON.stringify({ workflow_runs: runs }) },
  }).split("\n").filter(line => line.startsWith("api -X POST")).map(line => Number(line.split("/").at(-2)));
  assert.deepEqual(cancelled("open", null), []);
  assert.deepEqual(cancelled("closed", after), []);
  assert.deepEqual(cancelled("closed", close), [1, 7]);
});
