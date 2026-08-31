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
  // Base resolution may be inline OR delegated to ci-resolve-before.sh (HEAD~1 fallback).
  const hasInline = /push\) BEFORE="\$PUSH_BEFORE"/.test(selected);
  const hasDelegate = /ci-resolve-before\.sh/.test(selected);
  assert.ok(hasInline || hasDelegate, "selected must resolve push/PR base inline or via ci-resolve-before.sh");
  if (!hasDelegate) {
    assert.match(selected, /pull_request\) BEFORE="\$PR_BASE"/);
  }
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
  const preflight = pagesWorkflow.split("\n  current-tip:")[1].split("\n  deploy:")[0];
  const deploy = pagesWorkflow.split("\n  deploy:")[1];
  assert.doesNotMatch(preflight, /^\s+environment:/m,
    "the cheap tip check must not create a github-pages deployment record");
  assert.match(preflight, /deploy: \$\{\{ steps\.tip\.outputs\.deploy \}\}/);
  assert.match(deploy, /needs: current-tip/);
  assert.match(deploy, /if: needs\.current-tip\.outputs\.deploy == 'true'/,
    "an already-obsolete run must skip the environment job entirely");
  assert.match(deploy, /environment:\s*\n\s+name: github-pages/);
  assert.match(deploy, /git fetch --no-tags origin/);
  assert.match(deploy, /TIP=\$\(git rev-parse/);
  assert.match(deploy, /\[ "\$TIP" != "\$GITHUB_SHA" \]/);
  assert.match(deploy, /REFUSING DEPLOY:[\s\S]*?exit 1/,
    "a run obsoleted while queued must fail, never become a successful no-op deployment");
  const recheck = deploy.indexOf("Recheck branch tip inside the Pages lock");
  const publish = deploy.indexOf("actions/deploy-pages@v4");
  assert.ok(recheck >= 0 && publish > recheck, "the final tip check must precede publication");
  assert.doesNotMatch(deploy, /echo "deploy=false"/,
    "once the environment job starts, obsolete must fail rather than report success");
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

test("ship filter enforces cache generation against the active deployment", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, /bump-cache\.mjs --check --since "\$LIVE"/);
  assert.match(smoke, /if ! node tools\/bump-cache\.mjs[\s\S]*?exit 1/,
    "generation failures must fail CI, not merely fall through to the smoke gate");
});

// The smoke per-test cap READ from the workflow, not restated here. It was
// pinned as the literal 420000 in two assertions, so every re-measurement of a
// runner budget — which the ci.yml header explicitly demands when the pool
// changes — also had to edit this file, and a guard you must edit to tell the
// truth is one people edit without reading. What matters is that the cap is
// EXPLICIT and that it is bigger than the `selected` gate; the value is ci.yml's
// to measure. Raised 420000 -> 900000 on 2026-08-30 after six straight deploys
// timed out (Pages #1848-#1854).
const SMOKE_TIMEOUT_MS = (() => {
  const m = ciWorkflow.match(/test:smoke -- --timeout=(\d+)/);
  assert.ok(m, "the smoke shards must pass an EXPLICIT --timeout; none found");
  return Number(m[1]);
})();

test("smoke's command-line timeout is not tripled inside the spec", () => {
  const smokeSpec = fs.readFileSync(new URL("../specs/smoke.spec.js", import.meta.url), "utf8");
  assert.ok(SMOKE_TIMEOUT_MS >= 120000,
    `smoke's per-test cap is ${SMOKE_TIMEOUT_MS} ms, below the selected gate's 120 s`);
  assert.doesNotMatch(smokeSpec, /^\s*test\.slow\s*\(/m,
    `test.slow triples the workflow's ${SMOKE_TIMEOUT_MS / 1000} s per-test timeout`);
});

test("selected's 120 s gate cannot rerun the fixed-budget smoke spec", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const selected = ciWorkflow.split("\n  selected:")[1];
  assert.match(smoke, new RegExp("test:smoke -- --timeout=" + SMOKE_TIMEOUT_MS));
  assert.match(smoke, /tests\/specs\/smoke\.spec\.js/,
    "test-only smoke edits must force the fixed shards even though they do not ship");
  assert.match(selected, /--timeout=120000/);
  assert.doesNotMatch(selected, /npm test -- .*smoke\.spec\.js.*--timeout=120000/);
  assert.match(selected, /COVERED BY FIXED BLOCKING GATE/,
    "the selected report must make its delegated coverage visible");
});
