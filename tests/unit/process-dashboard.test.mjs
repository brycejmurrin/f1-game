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
} from "../../tools/ci/process-dashboard.mjs";

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
          name: "Draft push (CI skipped — add run-ci label)",
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
