/* process-dashboard.test.mjs — the nightly process dashboard reducer.
 *
 * No network. The fixture is two finished ci.yml runs, one cancelled re-gate
 * of the same SHA, and four pages.yml runs. Every derived number below is
 * hand-checked against that file.
 *
 * Run: node --test tests/unit/process-dashboard.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  familyOf,
  isFullJob,
  percentile,
  reduceDashboard,
  checkTimeRatchets,
  formatMarkdown,
  METRICS_BRANCH,
  DEPLOY_BRANCH,
  TIME_RATCHETS,
  JOBS_PAGE,
  attachJobs,
  ghJson,
  setProcessDashboardTestHooks,
  reduceMergePath,
  redTipIntervals,
  formatMergePath,
  fetchMergePath,
  fetchDashboard,
} from "../../tools/ci/process-dashboard.mjs";
import { buildMergePath6913 } from "./fixtures/process-dashboard/merge-path-6913.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/unit/fixtures/process-dashboard/runs.json"), "utf8"));

test("familyOf strips a matrix cell and keeps the job's own parentheses", () => {
  assert.equal(familyOf("Pure-node unit suites (vm-a1)"), "Pure-node unit suites");
  assert.equal(familyOf("Smoke (page boots, __apex responds) (1)"), "Smoke (page boots, __apex responds)");
  assert.equal(familyOf("Per-circuit geometry sweeps (2of4)"), "Per-circuit geometry sweeps");
  assert.equal(familyOf("Structural guards (tooling A)"), "Structural guards");
  assert.equal(
    familyOf("Selected specs (change-aware gate) (selected, 1)"),
    "Selected specs (change-aware gate)",
  );
  assert.equal(
    familyOf("Selected specs (change-aware gate) (selected-1, tests/specs/dev-tools.spec.js, 1)"),
    "Selected specs (change-aware gate)",
  );
  assert.equal(
    familyOf("Selected specs (change-aware gate) (oversize-hud-layout-1of3, tests/specs/hud-layout.spec.js, 1/3..."),
    "Selected specs (change-aware gate)",
  );
  assert.equal(familyOf("Selected specs (verdict)"), "Selected specs (verdict)");
  assert.equal(isFullJob("Selected specs (verdict)"), false);
  assert.equal(isFullJob("Selected specs (change-aware gate) (selected, 1)"), true);
  assert.equal(isFullJob("Smoke (page boots, __apex responds) (2)"), true);
});

test("percentile is nearest-rank", () => {
  assert.equal(percentile([60, 120], 0.5), 60);
  assert.equal(percentile([60, 120], 0.9), 120);
  assert.equal(percentile([240], 0.9), 240);
  assert.equal(percentile([], 0.5), null);
});

test("reducer derives every number from the checked-in fixture", () => {
  const dash = reduceDashboard(fixture);
  assert.equal(dash.generated, "2026-10-17T12:00Z");
  assert.equal(dash.window.runs, 3);
  assert.equal(dash.window.from, "2026-10-01T00:00Z");
  assert.equal(dash.window.to, "2026-10-02T00:06Z");

  const guards = dash.jobs["Structural guards (tooling A)"];
  assert.equal(guards.n, 2);
  assert.equal(guards.p50_s, 120);
  assert.equal(guards.p90_s, 120);
  assert.equal(guards.cancelled, 1);
  assert.equal(guards.fail, 0);
  assert.equal(guards.steps["npm ci"], 1);

  const vm = dash.jobs["Pure-node unit suites (vm-a1)"];
  assert.deepEqual({ n: vm.n, p50_s: vm.p50_s, p90_s: vm.p90_s, max_s: vm.max_s }, { n: 2, p50_s: 360, p90_s: 480, max_s: 480 });

  const fastSlice = dash.jobs["Pure-node unit suites (fast)"];
  assert.equal(fastSlice.n, 2);
  assert.equal(fastSlice.p50_s, 60);
  assert.equal(fastSlice.p90_s, 120);
  assert.equal(fastSlice.fail, 1);

  const node = dash.families["Pure-node unit suites"];
  assert.deepEqual({ n: node.n, p50_s: node.p50_s, p90_s: node.p90_s }, { n: 2, p50_s: 360, p90_s: 480 });
  const smoke = dash.families["Smoke (page boots, __apex responds)"];
  assert.equal(smoke.n, 1);
  assert.equal(smoke.p50_s, 240);
  assert.equal(dash.families["Selected specs (verdict)"].n, 2);
  assert.equal(dash.families["Selected specs (verdict)"].p50_s, 4);

  assert.equal(dash.runs.n, 3);
  assert.equal(dash.runs.cancelled_pct, 33.3);
  assert.equal(dash.runs.regated_shas, 1);
  assert.equal(dash.runs.regated_runs, 1);
  assert.equal(dash.runs.fast_tier_n, 1);
  assert.equal(dash.runs.fast_tier_p50_s, 360);
  assert.equal(dash.runs.full_tier_n, 1);
  assert.equal(dash.runs.full_tier_p50_s, 840);
  assert.equal(dash.runs.full_tier_p90_s, 840);

  assert.equal(dash.deploy.n, 2);
  assert.equal(dash.deploy.push_to_live_p50_s, 600);
  assert.equal(dash.deploy.p90_s, 840);
  assert.equal(dash.deploy.superseded, 1);

  assert.deepEqual(dash.flake["wake-lock.spec.js › late release"], { attempts: 2, red: 1 });
  assert.equal(dash.dora.lead_time_p50_s, 600);
  assert.equal(dash.dora.change_fail_pct, 33.3);
  assert.equal(dash.dora.mttr_p50_s, 4080);
  assert.equal(dash.dora.deploy_freq_per_day, 2);
});

test("a run that only finished the selected verdict is neither tier", () => {
  const dash = reduceDashboard({
    generated: "2026-10-17T12:00Z",
    ciRuns: [{
      id: 9,
      head_sha: "ccc",
      conclusion: "success",
      run_started_at: "2026-10-03T00:00:00Z",
      updated_at: "2026-10-03T00:02:00Z",
      jobs: [{
        name: "Selected specs (verdict)",
        conclusion: "success",
        started_at: "2026-10-03T00:01:00Z",
        completed_at: "2026-10-03T00:01:05Z",
      }],
    }],
    pagesRuns: [],
  });
  assert.equal(dash.runs.fast_tier_n, 0);
  assert.equal(dash.runs.full_tier_n, 0);
});

test("a draft-skip run and a sweeps rollup do not move the tier or the family", () => {
  const dash = reduceDashboard({
    generated: "2026-10-17T12:00Z",
    ciRuns: [
      {
        id: 1,
        head_sha: "s1",
        conclusion: "success",
        run_started_at: "2026-10-04T00:00:00Z",
        updated_at: "2026-10-04T00:00:04Z",
        jobs: [{
          name: "Draft push (CI skipped — add run-ci label)",   // a pre-2026-11-03 run name; the dashboard reads history
          conclusion: "success",
          started_at: "2026-10-04T00:00:00Z",
          completed_at: "2026-10-04T00:00:03Z",
        }],
      },
      {
        id: 2,
        head_sha: "s2",
        conclusion: "success",
        run_started_at: "2026-10-04T01:00:00Z",
        updated_at: "2026-10-04T01:09:00Z",
        jobs: [
          {
            name: "Per-circuit geometry sweeps",
            conclusion: "success",
            started_at: "2026-10-04T01:08:00Z",
            completed_at: "2026-10-04T01:08:03Z",
          },
          {
            name: "Per-circuit geometry sweeps (1of4)",
            conclusion: "success",
            started_at: "2026-10-04T01:00:00Z",
            completed_at: "2026-10-04T01:08:20Z",
          },
        ],
      },
      {
        id: 3,
        head_sha: "s3",
        conclusion: "success",
        run_started_at: "2026-10-04T02:00:00Z",
        updated_at: "2026-10-04T02:00:05Z",
        jobs: [{
          name: "Per-circuit geometry sweeps",
          conclusion: "success",
          started_at: "2026-10-04T02:00:00Z",
          completed_at: "2026-10-04T02:00:03Z",
        }],
      },
    ],
    pagesRuns: [],
  });
  assert.equal(dash.runs.fast_tier_n, 0);
  assert.equal(dash.runs.full_tier_n, 1);
  assert.equal(dash.runs.full_tier_p50_s, 540);
  const sweeps = dash.families["Per-circuit geometry sweeps"];
  assert.equal(sweeps.n, 1);
  assert.equal(sweeps.p50_s, 500);
});

test("time ratchets fail only over the ceiling, and a thin sample is skipped", () => {
  const over = {
    families: { "Pure-node unit suites": { n: 20, p50_s: 50 } },
    runs: { fast_tier_n: 20, fast_tier_p50_s: 10 },
    deploy: { n: 20, push_to_live_p50_s: 10 },
  };
  const bad = checkTimeRatchets(over, [
    { id: "ci:Pure-node unit suites", family: "Pure-node unit suites", ceilingSec: 40, n_min: 20 },
  ]);
  assert.equal(bad.ok, false);
  assert.equal(bad.violations[0].value, 50);
  const thin = checkTimeRatchets(reduceDashboard(fixture));
  assert.equal(thin.ok, true);
  assert.ok(thin.skipped.length >= 1);
  for (const r of TIME_RATCHETS) assert.ok(r.n_min >= 10);
});

test("the comparison markdown names the 2026-09-16 column and this window", () => {
  const md = formatMarkdown(reduceDashboard(fixture), { baseline: true });
  assert.match(md, /11\.3 min median/);
  assert.match(md, /p50 10\.0 min/);
  assert.match(md, /≈ 8 min/);
  assert.match(md, /33\.3%/);
});

test("the scheduled workflow publishes to metrics and checks ratchets only there", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/process-dashboard.yml"), "utf8");
  assert.match(yml, /cron:\s*"47 4 \* \* \*"/);
  assert.match(yml, /contents:\s*write/);
  assert.match(yml, /actions:\s*read/);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /process-dashboard\.mjs/);
  assert.match(yml, /--check/);
  assert.match(yml, new RegExp(METRICS_BRANCH));
  assert.doesNotMatch(yml, /git push[^\n]*claude\/f1-game-project-26h3ng/);
  assert.match(yml, new RegExp(DEPLOY_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(yml, /unsafe metrics branch/);
});

test("#2233 / W18f: attachJobs pages 30 at a time (per_page=100 502'd the nightly)", async () => {
  const calls = [];
  const job = (id) => ({
    id, name: `j${id}`, started_at: "t0", completed_at: "t1", conclusion: "success",
    steps: [{ name: "s", started_at: "t0", completed_at: "t1", conclusion: "success" }],
  });
  const serve = async (url) => {
    calls.push(url);
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1]);
    const all = Array.from({ length: 70 }, (_, i) => job(i + 1));
    const slice = all.slice((page - 1) * JOBS_PAGE, page * JOBS_PAGE);
    return {
      ok: true,
      status: 200,
      json: async () => ({ total_count: 70, jobs: slice }),
      text: async () => "",
    };
  };
  try {
    setProcessDashboardTestHooks({ fetch: serve, delay: async () => {} });
    const runs = [{ id: 99 }];
    await attachJobs("t", runs);
    assert.equal(runs[0].jobs.length, 70);
    assert.equal(calls.length, 3, "30 + 30 + 10");
    assert.ok(calls.every((u) => /jobs\?per_page=30&page=\d+/.test(u)), calls.join("\n"));
    assert.ok(!calls.some((u) => /per_page=100/.test(u)));
    assert.equal(JOBS_PAGE, 30);
  } finally {
    setProcessDashboardTestHooks();
  }
});

test("ghJson retries a transient 502 then returns JSON (process-dashboard run 39578940130)", async () => {
  let n = 0;
  const fetch = async () => {
    n += 1;
    if (n === 1) {
      return { ok: false, status: 502, text: async () => "Server Error", json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => "", json: async () => ({ ok: true, n }) };
  };
  try {
    setProcessDashboardTestHooks({ fetch, delay: async () => {} });
    const body = await ghJson("https://api.github.com/repos/x/actions/runs/1/jobs?per_page=30&page=1", "t");
    assert.deepEqual(body, { ok: true, n: 2 });
    assert.equal(n, 2);
  } finally {
    setProcessDashboardTestHooks();
  }
});

test("ghJson does not retry a permanent 404", async () => {
  let n = 0;
  const fetch = async () => {
    n += 1;
    return { ok: false, status: 404, text: async () => "missing", json: async () => ({}) };
  };
  try {
    setProcessDashboardTestHooks({ fetch, delay: async () => {} });
    await assert.rejects(() => ghJson("https://example.test/missing", "t"), /404/);
    assert.equal(n, 1, "a 404 is not a GitHub hiccup");
  } finally {
    setProcessDashboardTestHooks();
  }
});

// ---- merge path (#7046, #6913 phase 1; #7517 phase 0) ----------------------------------------------------

const near = (actual, want, tol = 1) => assert.ok(Math.abs(actual - want) <= tol, `${actual} not within ±${tol} of ${want}`);

test("#7046: the reducer reproduces #6913's merge-path numbers (each ±1)", () => {
  const mp = reduceMergePath(buildMergePath6913());
  near(mp.land_to_merge.direct.p50_min, 30.6);
  near(mp.land_to_merge.car.p50_min, 120);
  near(mp.merges_per_hour, 4.33);
  near(mp.land.runs_per_merge, 8.3);
  near(mp.trains.red, 7);
  near(mp.trains.closed, 46);
  // The rest of #6913's table, exactly: the fixture is built to it.
  assert.deepEqual(mp.land_to_merge.direct, { n: 211, p50_min: 30.6, p90_min: 138, max_min: 718 });
  assert.deepEqual(mp.land_to_merge.car, { n: 103, p50_min: 120, p90_min: 343, max_min: 774 });
  assert.deepEqual(mp.land_to_merge.train, { n: 29, p50_min: 24, p90_min: 42, max_min: 63 });
  assert.equal(mp.prs_merged, 314);
  assert.equal(mp.merges, 343, "a merge is a merged PR of any route (2833 / 343 ≈ 8.3)");
  assert.equal(mp.merge_commits, 240);
  assert.deepEqual(mp.land, { started: 4654, skipped: 1821, ran: 2833, cancelled: 516, retry_dispatches: 572, runs_per_merge: 8.3, retries_per_merge: 1.7 });
  assert.deepEqual(mp.trains, { closed: 46, merged: 29, red: 7, stale: 9, unknown: 1, red_pct: 15.2, red_prs: [6229, 6241, 6346, 6473, 6510, 6669, 6801] });
  // The five red windows of #6913's table (29 + 40 + 57 + 212 + 84); a platform publish failure, extra reds and a
  // cancelled train inside a window add nothing.
  assert.deepEqual(mp.red_tip.intervals.map((r) => r.min), [29, 40, 57, 212, 84]);
  assert.equal(mp.red_tip.minutes, 422);
  assert.equal(mp.red_tip.pct, 9.7);
});

test("#7046: --check passes on the generated JSON with the merge path in it", () => {
  const dash = reduceDashboard({ ...fixture, mergePath: buildMergePath6913(), generated: "2026-11-28T08:00Z" });
  assert.ok(dash.merge_path.land_to_merge);
  assert.equal(checkTimeRatchets(dash).ok, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-7046-"));
  try {
    const file = path.join(dir, "process-dashboard.json");
    fs.writeFileSync(file, JSON.stringify(dash, null, 2) + "\n");
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/process-dashboard.mjs"), "--check", file], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const lines = formatMarkdown(dash).split("\n");
  const start = lines.indexOf("## Merge path");
  assert.ok(start > 0, "the merge-path section is in the markdown twin");
  assert.deepEqual(lines.slice(start + 4, start + 12), [
    "| Route | n | p50 | p90 | max |",
    "|---|---:|---:|---:|---:|",
    "| Direct PR | 211 | 30.6 min | 138 min | 718 min |",
    "| Train car | 103 | 120 min | 343 min | 774 min |",
    "| Train PR | 29 | 24 min | 42 min | 63 min |",
    "",
    "- Merges: 314 PRs (4.33/h) plus 29 train PRs, in 240 merge commits; 0 clock-hours with none; longest gap 19 min (2026-11-23T07:03Z → 2026-11-23T07:22Z).",
    "- Red tip (newest pages.yml run code-red; publish-platform failures and cancelled runs excluded, as the `base` row): 422 min, 9.7% of the window, 5 interval(s): 2026-11-23T08:43Z→2026-11-23T09:12Z 2036b208, 2026-11-24T23:59Z→2026-11-25T00:39Z 4036b208, 2026-11-25T02:10Z→2026-11-25T03:07Z 6036b208, 2026-11-25T13:33Z→2026-11-25T17:05Z 8036b208, 2026-11-26T04:51Z→2026-11-26T06:15Z d036b208.",
  ]);
  assert.equal(lines[start + 12], "- land.yml: 4654 started, 1821 skipped, 2833 ran (8.3 per merge), 516 cancelled, 572 `Land retry` dispatches (1.7 per merge).");
  assert.equal(lines[start + 13], "- Trains closed: 46: 29 merged, 7 red and halved (15.2%), 9 stale, 1 unknown (red: #6229, #6241, #6346, #6473, #6510, #6669, #6801).");
});

test("#7517 phase 0: tonight's 03Z gate runs reduce to wall 58.6, work 4.5, 4 queue entries", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/unit/fixtures/process-dashboard/land-chain-03z.json"), "utf8"));
  const mp = reduceMergePath(raw);
  const h = mp.hourly["2026-11-28T03Z"];
  assert.equal(h.gate_n, 3, "the run that stopped at resolve (land-gate skipped) is not a gate run");
  assert.equal(h.gate_wall_p50_min, 58.6);
  assert.equal(h.gate_work_p50_min, 4.5);
  assert.equal(h.queue_entries_p50, 4, "resolve, trusted-rows, land-gate, post; the skipped arm is no entry");
  assert.equal(h.land_runs, 4, "the skipped run had no runner");
  assert.equal(h.merges, 3, "train #7418 and its two cars");
  assert.deepEqual(mp.longest_no_merge, { min: 45, from: "2026-11-28T03:00Z", to: "2026-11-28T03:45Z" });
  assert.equal(formatMergePath(mp).find((l) => l.startsWith("| 2026-11-28T03Z")), "| 2026-11-28T03Z | 3 | 4 | 1.3 | 3 | 58.6 min / 70 min | 4.5 min | 4 | 13.5 min / 16.3 min |");
});

test("#7046: a no-merge stall shows as the longest gap and empty clock-hours", () => {
  // 2026-11-28: no merge 09:08–13:10Z while a gate sat parked on "train in flight" (#1780).
  const pr = (number, at) => ({ number, head_ref: `claude/p${number}`, created_at: "2026-11-28T00:00:00Z", merged_at: at, closed_at: at, land_at: "2026-11-28T08:00:00Z" });
  const mp = reduceMergePath({ window: { from: "2026-11-28T08:00:00Z", to: "2026-11-28T14:00:00Z" }, prs: [pr(1, "2026-11-28T08:30:00Z"), pr(2, "2026-11-28T09:08:00Z"), pr(3, "2026-11-28T13:10:00Z"), pr(4, "2026-11-28T13:40:00Z")] });
  assert.deepEqual(mp.longest_no_merge, { min: 242, from: "2026-11-28T09:08Z", to: "2026-11-28T13:10Z" });
  assert.equal(mp.zero_merge_hours, 3, "10Z, 11Z and 12Z");
});

test("#7046: red-tip intervals clip to the window and carry a red in from before it", () => {
  const jobs = [{ name: "ci / Smoke", conclusion: "failure", steps: [] }];
  const runs = [
    { id: 1, head_sha: "aaaaaaaa", updated_at: "2026-11-28T05:30:00Z", conclusion: "failure", jobs },
    { id: 2, head_sha: "bbbbbbbb", updated_at: "2026-11-28T06:05:00Z", conclusion: "cancelled" },
    { id: 3, head_sha: "cccccccc", updated_at: "2026-11-28T06:10:00Z", conclusion: "success" },
    { id: 4, head_sha: "dddddddd", updated_at: "2026-11-28T06:50:00Z", conclusion: "startup_failure" },
  ];
  const out = redTipIntervals(runs, Date.parse("2026-11-28T06:00:00Z"), Date.parse("2026-11-28T07:00:00Z"));
  assert.deepEqual(out.map((r) => [r.from, r.to, r.min, r.sha]), [
    ["2026-11-28T06:00Z", "2026-11-28T06:10Z", 10, "aaaaaaaa"],
    ["2026-11-28T06:50Z", "2026-11-28T07:00Z", 10, "dddddddd"],
  ], "a jobless startup_failure is code red, as deploy-tip's tipState fails closed");
});

test("#7046: a merge-path read failure leaves the CI rows and names itself", async () => {
  setProcessDashboardTestHooks({
    fetch: async (url) => {
      if (/\/pulls\?/.test(url)) return { ok: false, status: 403, text: async () => "Resource not accessible by integration" };
      if (/\/jobs\?/.test(url)) return { ok: true, json: async () => ({ jobs: [], total_count: 0 }) };
      return { ok: true, json: async () => ({ workflow_runs: [] }) };
    },
    delay: async () => {},
  });
  try {
    const dash = await fetchDashboard({ runs: 1, token: "t", generated: "g" });
    assert.equal(dash.merge_path.error.slice(0, 24), "merge path not read: 403");
    assert.equal(dash.runs.n, 0, "the CI rows still stand");
    assert.deepEqual(formatMergePath(dash.merge_path), ["## Merge path", "", `Not measured: ${dash.merge_path.error}`, ""]);
  } finally {
    setProcessDashboardTestHooks();
  }
});

test("#7046: fetchMergePath reads the last land label, the train manifest and the result mark", async () => {
  const now = Date.parse("2026-11-28T12:00:00Z");
  const sha = (c) => c.repeat(40);
  const body = `<!-- merge-train {"base":"${sha("a")}","cars":[{"pr":11,"head":"${sha("b")}","ref":"claude/x"}]} -->\n<!-- merge-train-result {"outcome":"red","why":"CI failure"} -->`;
  const calls = [];
  setProcessDashboardTestHooks({
    fetch: async (url) => {
      calls.push(url);
      const json = (j) => ({ ok: true, json: async () => j });
      if (/\/pulls\?/.test(url)) return json([
        { number: 11, head: { ref: "claude/x" }, created_at: "2026-11-28T08:00:00Z", merged_at: "2026-11-28T11:00:00Z", closed_at: "2026-11-28T11:00:00Z", updated_at: "2026-11-28T11:00:00Z" },
        { number: 20, head: { ref: "train/20" }, body, created_at: "2026-11-28T09:00:00Z", merged_at: null, closed_at: "2026-11-28T10:00:00Z", updated_at: "2026-11-28T10:00:00Z" },
      ]);
      if (/\/issues\/11\/events/.test(url)) return json([
        { event: "labeled", label: { name: "land" }, created_at: "2026-11-28T09:00:00Z" },
        { event: "unlabeled", label: { name: "land" }, created_at: "2026-11-28T09:30:00Z" },
        { event: "labeled", label: { name: "land" }, created_at: "2026-11-28T10:00:00Z" },
      ]);
      if (/land\.yml\/runs/.test(url)) return json({ workflow_runs: [{ id: 5, created_at: "2026-11-28T10:00:00Z", updated_at: "2026-11-28T10:20:00Z", conclusion: "success", display_title: "Land retry pr=11 head=- attempt=1", event: "workflow_dispatch" }] });
      if (/runs\/5\/jobs/.test(url)) return json({ jobs: [{ name: "land-gate (#11)", created_at: "2026-11-28T10:00:00Z", started_at: "2026-11-28T10:05:00Z", completed_at: "2026-11-28T10:09:00Z", conclusion: "success" }] });
      return json({ workflow_runs: [] });
    },
    delay: async () => {},
  });
  try {
    const raw = await fetchMergePath("t", { hours: 6, now });
    assert.deepEqual(raw.prs.find((p) => p.number === 11).land_at, "2026-11-28T10:00:00Z", "the LAST land label");
    assert.deepEqual(raw.prs.find((p) => p.number === 20), { number: 20, head_ref: "train/20", created_at: "2026-11-28T09:00:00Z", merged_at: null, closed_at: "2026-11-28T10:00:00Z", land_at: null, cars: [11], outcome: "red" });
    assert.ok(calls.some((u) => /land\.yml\/runs\?.*created=%3E%3D2026-11-28T06%3A00%3A00Z/.test(u)), calls.join("\n"));
    const mp = reduceMergePath(raw);
    assert.deepEqual(mp.land_to_merge.direct, { n: 1, p50_min: 60, p90_min: 60, max_min: 60 });
    assert.equal(mp.land.retry_dispatches, 1);
    assert.equal(mp.trains.red, 1);
    assert.equal(mp.hourly["2026-11-28T10Z"].gate_work_p50_min, 4);
  } finally {
    setProcessDashboardTestHooks();
  }
});
