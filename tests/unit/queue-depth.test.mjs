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
  LINUX_SLOTS, MACOS_SLOTS, QUEUED_HOLD, MAX_RUNS, DEFAULT_OUT,
  isMac, countJobs, evaluate, reportLine, measure,
} from "../../tools/ci/queue-depth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const job = (status, os = "ubuntu-latest") => ({ status, labels: [os] });
const many = (n, status, os) => Array.from({ length: n }, () => job(status, os));

test("thresholds are the measured account slots", () => {
  assert.equal(LINUX_SLOTS, 40);
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
  assert.deepEqual(c, { linux: { running: 1, queued: 3 }, macos: { running: 1, queued: 1 } });
});

test("ok under every threshold; the line names jobs in flight, queued and macOS", () => {
  const v = evaluate(countJobs([...many(30, "in_progress"), ...many(9, "queued"), ...many(4, "in_progress", "macos-latest")]),
    { runsExamined: 7, runsLive: 7 });
  assert.equal(v.verdict, "ok");
  assert.equal(v.hold, false);
  assert.equal(reportLine(v), "= queue ok (39 Linux jobs in flight / 40, 9 queued, 4 macOS / 5)");
});

test("each threshold alone is a hold", () => {
  const linux = evaluate(countJobs(many(40, "in_progress")));
  assert.equal(linux.verdict, "hold");
  assert.match(reportLine(linux), /^= queue hold \(40 Linux jobs in flight \/ 40, 0 queued, 0 macOS \/ 5\) — Linux jobs in flight 40 ≥ 40/);
  const queued = evaluate(countJobs([...many(5, "queued"), ...many(5, "queued", "macos-latest")]));
  assert.equal(queued.verdict, "hold", "macOS queued jobs count toward the queued threshold");
  assert.deepEqual(queued.reasons, ["queued jobs 10 ≥ 10", "macOS jobs in flight 5 ≥ 5"]);
  const mac = evaluate(countJobs(many(5, "in_progress", "macos-latest")));
  assert.deepEqual(mac.reasons, ["macOS jobs in flight 5 ≥ 5"]);
});

test("a run count never drives the verdict: 20 live runs with few jobs is ok", () => {
  const runs = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));
  const v = measure({ request: (q) => q.startsWith("actions/runs?status=queued")
    ? { json: { total_count: 20, workflow_runs: runs } }
    : q.startsWith("actions/runs?") ? { json: { total_count: 0, workflow_runs: [] } }
      : { json: { jobs: [] } }, now: () => 0 });
  assert.equal(v.verdict, "ok");
  assert.equal(v.runsExamined, 20);
  assert.equal(v.at, "1970-01-01T00:00:00.000Z");
});

test("measure: bounded run examination, dedupe across status lists, truncation reported", () => {
  const calls = [];
  const inProgress = Array.from({ length: 35 }, (_, i) => ({ id: 100 + i }));
  const v = measure({
    maxRuns: MAX_RUNS,
    request(q) {
      calls.push(q);
      if (q === "actions/runs?status=in_progress&per_page=100") return { json: { total_count: 35, workflow_runs: inProgress } };
      if (q === "actions/runs?status=queued&per_page=100") return { json: { total_count: 1, workflow_runs: [{ id: 100 }] } };
      const m = q.match(/^actions\/runs\/(\d+)\/jobs\?per_page=100$/);
      assert.ok(m, `unexpected request ${q}`);
      return { json: { jobs: [job("in_progress")] } };
    },
  });
  assert.equal(calls.length, 2 + MAX_RUNS, "two lists plus one jobs call per examined run, never more");
  assert.equal(v.runsExamined, 30);
  assert.equal(v.runsLive, 36);
  assert.equal(v.truncated, true);
  assert.equal(v.linux.inFlight, 30);
  assert.match(v.line, /30 of 36 live runs examined, a lower bound/);
});

test("measure: any API failure is an error, never an ok", () => {
  assert.match(measure({ request: () => ({ error: "HTTP 403" }) }).error, /runs \(in_progress\): HTTP 403/);
  assert.match(measure({ request: (q) => q.startsWith("actions/runs?") ? { json: { workflow_runs: [{ id: 9 }] } } : { error: "HTTP 502" } }).error,
    /run #9 jobs: HTTP 502/);
  assert.match(measure({ request: () => ({ json: {} }) }).error, /no run array/);
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
