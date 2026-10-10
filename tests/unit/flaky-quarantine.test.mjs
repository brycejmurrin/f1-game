// The flaky-test policy (AGENTS.md §Verification 9): a pass that needed a retry
// is a red unless its spec is in tests/data/flaky-quarantine.json, and every row
// there is a ledger entry — a spec that exists, an owner, a date, a reason. The
// verdict itself is a pure function (tests/helpers/flaky-policy.mjs), so this
// pins it without a browser; the reporter only reads it. Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQuarantine, flakyVerdict, armed, QUARANTINE } from "../helpers/flaky-policy.mjs";
import { shards, fit } from "../../tools/ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = JSON.parse(fs.readFileSync(QUARANTINE, "utf8"));

test("every quarantine row names a spec that exists and carries since/owner/why", () => {
  assert.ok(Array.isArray(FILE.quarantine), "quarantine must be a list");
  const seen = new Set();
  for (const row of FILE.quarantine) {
    assert.match(row.spec || "", /^tests\/specs\/.+\.spec\.js$/, `${JSON.stringify(row)}: spec must be a repo-relative tests/specs path`);
    assert.ok(fs.existsSync(path.join(ROOT, row.spec)), `${row.spec}: quarantined spec does not exist — delete the row`);
    assert.match(row.since || "", /^\d{4}-\d{2}-\d{2}$/, `${row.spec}: since must be an ISO date`);
    assert.ok((row.owner || "").length >= 8, `${row.spec}: owner names who fixes it`);
    assert.ok((row.why || "").length >= 40, `${row.spec}: why must say what was measured`);
    assert.ok(!seen.has(row.spec), `${row.spec}: listed twice`);
    seen.add(row.spec);
  }
});

test("the loader returns the quarantined spec paths, and an empty set for a missing file", () => {
  const q = loadQuarantine();
  for (const row of FILE.quarantine) assert.ok(q.has(row.spec));
  assert.equal(q.size, FILE.quarantine.length);
  assert.equal(loadQuarantine(path.join(ROOT, "scratch", "no-such-quarantine.json")).size, 0);
});

test("verdict: a quarantined flake is reported, an unlisted one blocks, none means pass", () => {
  // Fixture keys, not repo paths: the verdict is plain set membership on key().spec.
  const q = new Set(["fixture/known.spec.js"]);
  const known = { spec: "fixture/known.spec.js", title: "wobbles" };
  const fresh = { spec: "fixture/new.spec.js", title: "also wobbles" };
  assert.deepEqual(flakyVerdict([], q), { blocking: [], quarantined: [], fail: false });
  const spared = flakyVerdict([known], q);
  assert.equal(spared.fail, false);
  assert.deepEqual(spared.quarantined, [known]);
  const red = flakyVerdict([known, fresh], q);
  assert.equal(red.fail, true, "one unlisted flake is enough to fail the run");
  assert.deepEqual(red.blocking, [fresh]);
  assert.deepEqual(red.quarantined, [known]);
});

test("the switch is APEX_FAIL_ON_FLAKY=1 and nothing else", () => {
  assert.equal(armed({}), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "0" }), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "true" }), false);
  assert.equal(armed({ APEX_FAIL_ON_FLAKY: "1" }), true);
});

test("ci.yml arms the policy on every browser job that retries", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const workers = (yml.match(/^\s*APEX_WORKERS: (?:1|\$\{\{ matrix\.workers \|\| 1 \}\})$/gm) || []).length;
  const armedJobs = (yml.match(/^\s*APEX_FAIL_ON_FLAKY: 1$/gm) || []).length;
  assert.ok(workers > 0, "no browser job env block found");
  assert.equal(armedJobs, workers, "every APEX_WORKERS: 1 env block must also set APEX_FAIL_ON_FLAKY: 1");
});

test("the live reporter reads the verdict from the policy module, not from a CLI flag", () => {
  const rep = fs.readFileSync(path.join(ROOT, "tests/helpers/live-reporter.js"), "utf8");
  assert.match(rep, /from "\.\/flaky-policy\.mjs"/);
  assert.match(rep, /flakyVerdict\(/);
  const runner = fs.readFileSync(path.join(ROOT, "tools/ci/run-playwright.mjs"), "utf8");
  assert.ok(!/args\.push\("--fail-on-flaky-tests"\)/.test(runner), "the all-or-nothing Playwright flag must stay out of the argv");
});

test("the reporter keys a test on its SPEC, not on the file that declared it", async () => {
  // Playwright reads test.location from the CALLER's stack frame, so a spec
  // that factors its cases into a helper (tests/helpers/track-helpers.js does)
  // reported spec: "tests/helpers/…" while title came from the spec — two
  // halves of one key naming different files. The quarantine holds SPEC paths,
  // so such a test was unquarantinable and would block forever under
  // APEX_FAIL_ON_FLAKY=1. testDir is "./tests", so titlePath()'s file entry is
  // the spec's path relative to it.
  const { default: LiveReporter } = await import("../helpers/live-reporter.js");
  const r = new LiveReporter();
  const at = (titlePath, file) => r.key({ titlePath: () => titlePath, location: { file } });

  const own = at(["chromium", "smoke.spec.js", "boots"], "/repo/tests/specs/smoke.spec.js");
  assert.equal(own.spec, "tests/specs/smoke.spec.js");
  assert.equal(own.title, "boots");

  const viaHelper = at(["chromium", "manual/tracks-visual.spec.js", "monza", "renders"],
                       "/repo/tests/helpers/track-helpers.js");
  assert.equal(viaHelper.spec, "tests/manual/tracks-visual.spec.js",
    "the SPEC owns the test, not the helper that declared it");
  assert.equal(viaHelper.title, "monza › renders");

  // No spec in the title path at all: fall back to the call site rather than
  // invent one.
  assert.equal(at(["chromium", "odd"], "/repo/tests/helpers/track-helpers.js").spec,
    "tests/helpers/track-helpers.js");
});

test("the verdict line counts skips apart, and a run that executed nothing is RED", async () => {
  // `= run passed (N/N done, 0 failed)` counted skips as done, so an all-skip
  // run — a file-level test.skip on a missing baseline, a null hook routed to
  // test.skip — read exactly like a pass (2026-10-04).
  const { default: LiveReporter } = await import("../helpers/live-reporter.js");
  const run = (statuses) => {
    const r = new LiveReporter();
    const lines = [];
    r.write = (l) => lines.push(l);
    r.startHeartbeat = () => {};
    const tests = statuses.map((st, i) => ({ retries: 0, results: [{}], titlePath: () => ["headless", "x.spec.js", `t${i}`],
      location: { file: "/repo/tests/specs/x.spec.js" }, outcome: () => (st === "skipped" ? "skipped" : "expected") }));
    r.onBegin({ workers: 1 }, { allTests: () => tests });
    tests.forEach((t, i) => r.onTestEnd(t, { status: statuses[i], duration: 10 }));
    const override = r.onEnd({ status: "passed" });
    return { lines, override, verdict: lines.find((l) => /= run (passed|failed)/.test(l)) };
  };
  const allSkip = run(["skipped", "skipped", "skipped"]);
  assert.match(allSkip.verdict, /= run failed {2}\(3\/3 done, 0 failed, 3 skipped\)/);
  assert.deepEqual(allSkip.override, { status: "failed" }, "the exit code follows the verdict");
  assert.ok(allSkip.lines.some((l) => /ALL 3 TEST\(S\) SKIPPED/.test(l)));
  const mixed = run(["passed", "skipped"]);
  assert.match(mixed.verdict, /= run passed {2}\(2\/2 done, 0 failed, 1 skipped\)/);
  assert.equal(mixed.override, undefined);
});

test("the selected gate honours the quarantine: its specs get a leg of their own with one retry, nothing else is retried", () => {
  /* R3-CI-HEALTH-4 (2026-10-10). The change-aware gate ran --retries=0, so no
     test there could ever be "flaky": hud-mirror (quarantined) was routed into
     it (log-select-38042136314: `OVERFLOW (routed; …): tests/specs/hud-mirror.spec.js`)
     and its known flake red a PR exactly as an un-quarantined one would, while
     APEX_FAIL_ON_FLAKY=1 on that step was dead configuration. Pure node: the
     plan select-specs hands ci.yml, for a fixture quarantine. */
  const flaky = "tests/specs/hud-mirror.spec.js", plain = "tests/specs/boot-guard.spec.js";
  const q = new Set([flaky]);
  const r = fit([flaky, plain], 30, { rank: () => 0, db: { specs: {} } });
  const plan = shards(r, { specs: {} }, q);
  const legsOf = (f) => plan.filter((j) => j.specs.split(" ").includes(f));
  assert.ok(legsOf(flaky).length >= 1, "a quarantined spec still RUNS");
  for (const j of legsOf(flaky)) {
    assert.equal(j.retries, 1, `${j.name}: a quarantined spec's leg retries once`);
    assert.equal(j.specs, flaky, `${j.name}: nothing shares the retry`);
  }
  for (const j of plan.filter((x) => !x.specs.split(" ").includes(flaky))) assert.equal(j.retries, 0, `${j.name}: un-quarantined legs never retry`);
  // Without the quarantine row, the same spec is an ordinary leg again.
  assert.ok(shards(r, { specs: {} }, new Set()).every((j) => j.retries === 0));
  // The REAL ledger: every row the planner can route lands on a retrying leg of its own.
  for (const spec of loadQuarantine()) {
    const real = shards(fit([spec, plain], 30, { rank: () => 0, db: { specs: {} } }), { specs: {} });
    const legs = real.filter((j) => j.specs.split(" ").includes(spec));
    assert.ok(legs.length >= 1 && legs.every((j) => j.retries >= 1 && j.specs === spec), `${spec}: ${JSON.stringify(legs)}`);
  }
  // ci.yml reads the plan's retries; APEX_FAIL_ON_FLAKY stays armed on the step,
  // so a pass-on-retry outside the quarantine is still a red.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const from = yml.indexOf("- name: Run the selection (");
  const run = yml.slice(from, yml.indexOf("- name: Spec timings (junit", from));
  assert.ok(from > 0 && run.length > 0, "the selected job's run step is gone");
  assert.match(run, /APEX_FAIL_ON_FLAKY: 1/);
  assert.match(run, /--retries=\$\{\{ matrix\.retries \|\| 0 \}\}/);
});
