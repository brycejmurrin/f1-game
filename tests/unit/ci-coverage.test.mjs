// ci-coverage — the fixed-spec census and dynamic-gate contract both need guards.
//
// Nothing consumes this report automatically. A broken parse could claim zero
// fixed specs or a non-blocking/push-only selector and still look plausible.
// These tests pin the mechanism and event/base semantics, never the count.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { report, ALL_SPECS, expand, groupSpecs } from "../../tools/ci-coverage.mjs";

const ciWorkflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const pagesWorkflow = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");

test("it sees the specs on disk", () => {
  assert.ok(ALL_SPECS.length > 50, `only ${ALL_SPECS.length} specs found — the scan is broken`);
  assert.ok(ALL_SPECS.every((s) => s.startsWith("tests/") && s.endsWith(".spec.js")));
});

test("a single-star glob expands the way package.json means it", () => {
  // test:parts is written as tests/specs/parts-*.spec.js — if this stopped expanding,
  // every group defined by a glob would silently contribute zero.
  const hits = expand("tests/specs/parts-*.spec.js");
  assert.ok(hits.length >= 5, `parts-*.spec.js expanded to ${hits.length}`);
  assert.ok(hits.includes("tests/specs/parts-physics.spec.js"));
  assert.ok(!hits.includes("tests/specs/smoke.spec.js"));
});

test("a literal path resolves, and a bogus one does not", () => {
  assert.deepEqual(expand("tests/specs/smoke.spec.js"), ["tests/specs/smoke.spec.js"]);
  assert.deepEqual(expand("tests/specs/there-is-no-such.spec.js"), []);
  assert.deepEqual(expand("js/game.js"), []);
});

test("group scripts resolve to their spec lists", () => {
  assert.deepEqual(groupSpecs("test:smoke"), ["tests/specs/smoke.spec.js"]);
  assert.equal(groupSpecs("test:there-is-no-such-group"), null);
});

test("the ci.yml parse finds SOMETHING — anti-vacuity", () => {
  // The failure mode this exists for: a workflow edit changes the `run:` shape,
  // the regex stops matching, and the tool reports a gate that runs nothing.
  assert.ok(report.specsInFixedGates > 0,
    "ci-coverage found NO specs executed by CI — the ci.yml parse has broken, " +
    "or the gate really has stopped running browser tests. Check which before " +
    "believing the number.");
  assert.ok(report.specsInFixedGates <= report.specsOnDisk);
  assert.equal(report.specsInFixedGates + report.specsOutsideFixedGates, report.specsOnDisk);
});

test("smoke and the driving-model gate are both seen", () => {
  // These two are what the ci.yml header promises the gate covers. If either
  // stops being detected, the report is wrong in the reassuring direction.
  assert.ok(report.executed.includes("tests/specs/smoke.spec.js"),
    "CI runs test:smoke but ci-coverage did not see it");
  assert.ok(report.executed.includes("tests/specs/physics-characterization.spec.js"),
    "CI runs the driving-model gate by path but ci-coverage did not see it");
});

test("it does not claim to cover what it cannot", () => {
  // test:render / test:headless drive whole PROJECTS and name no spec, so they
  // must resolve to nothing rather than being counted as blanket coverage.
  for (const g of ["test:render", "test:headless"]) {
    const specs = groupSpecs(g);
    if (specs !== null) assert.deepEqual(specs, [],
      `${g} names no spec on its command line, so it must not contribute specs`);
  }
});

test("the selected gate blocks pushes and PRs, but not workflow calls", () => {
  const selected = ciWorkflow.split("\n  selected:")[1];
  assert.ok(selected, "selected job missing");
  assert.deepEqual(report.selectionGate, {
    present: true,
    blocking: true,
    onPush: true,
    onPullRequest: true,
    onWorkflowCall: false,
    usesPullRequestBase: true,
    failsClosedOnInvalidBase: true,
    surfacesBudgetSkips: true,
  });
  assert.match(selected,
    /if: \$\{\{ github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \}\}/);
  assert.doesNotMatch(selected, /^    continue-on-error:/m);
});

test("selection resolves the event-specific base and fails closed when it cannot", () => {
  const selected = ciWorkflow.split("\n  selected:")[1];
  assert.match(selected, /PUSH_BEFORE: \$\{\{ github\.event\.before \}\}/);
  assert.match(selected, /PR_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(selected, /push\) BEFORE="\$PUSH_BEFORE"/);
  assert.match(selected, /pull_request\) BEFORE="\$PR_BASE"/);
  assert.match(selected, /no valid comparison base/);
  assert.match(selected, /comparison base .* is unreachable/);
  assert.match(selected, /r\.reason === "unmatched"/);
  assert.doesNotMatch(selected, /skip\(\).*exit 0/);
});

test("Pages workflow calls leave the selected gate disabled", () => {
  assert.doesNotMatch(pagesWorkflow, /^\s+advisory:/m);
});

test("Pages workflow calls use a unique CI concurrency key", () => {
  assert.match(ciWorkflow, /group: ci-\$\{\{ inputs\.concurrency_key \|\| github\.ref \}\}/);
  assert.match(pagesWorkflow, /concurrency_key: pages-\$\{\{ github\.run_id \}\}/);
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test("an obsolete Pages run cannot deploy after a newer commit", () => {
  const deploy = pagesWorkflow.split("\n  deploy:")[1];
  assert.match(deploy, /git fetch --no-tags origin/);
  assert.match(deploy, /TIP=\$\(git rev-parse/);
  assert.match(deploy, /\[ "\$TIP" = "\$GITHUB_SHA" \]/);
  assert.match(deploy, /echo "deploy=false" >> "\$GITHUB_OUTPUT"/);
  for (const step of ["actions\/configure-pages@v5", "name: Stage site",
    "actions\/upload-pages-artifact@v3", "actions\/deploy-pages@v4"]) {
    const at = deploy.search(new RegExp(step));
    assert.notEqual(at, -1, `${step} moved or disappeared`);
    assert.match(deploy.slice(Math.max(0, at - 120), at + 220),
      /if: steps\.tip\.outputs\.deploy == 'true'/,
      `${step} must be guarded by the branch-tip verdict`);
  }
});

test("cached browser jobs never enter apt through --with-deps", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const driving = ciWorkflow.split("\n  driving-model:")[1].split("\n  selected:")[0];
  for (const [name, job] of [["smoke", smoke], ["driving-model", driving]]) {
    assert.match(job, /id: pwcache/, `${name} cache must expose cache-hit`);
    assert.match(job,
      /if: .*steps\.pwcache\.outputs\.cache-hit != 'true'[\s\S]*?run: npx playwright install --with-deps chromium/,
      `${name} may use apt only on a cache miss`);
    assert.doesNotMatch(job,
      /if: .*cache-hit == 'true'[\s\S]{0,160}run: npx playwright install --with-deps chromium/,
      `${name} cache-hit path must stay network-free`);
  }
});

test("ship filter chooses a successful active deployment, not merely the newest record", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, /deployments\?environment=github-pages&per_page=20/);
  assert.match(smoke, /d\.statuses_url/);
  assert.match(smoke, /success\) LIVE="\$SHA"; break/);
  assert.match(smoke, /inactive\|failure\|error\|queued\|pending\|in_progress/);
  assert.match(smoke, /no successful active github-pages deployment found/);
  assert.doesNotMatch(smoke, /j\[0\].*\.sha.*process\.stdout\.write/);
});

test("smoke's command-line timeout is not tripled inside the spec", () => {
  const smokeSpec = fs.readFileSync(new URL("../specs/smoke.spec.js", import.meta.url), "utf8");
  assert.match(ciWorkflow, /test:smoke -- --timeout=420000/);
  assert.doesNotMatch(smokeSpec, /^\s*test\.slow\s*\(/m,
    "test.slow triples the workflow's 420 s per-test timeout");
});
