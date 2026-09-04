// ci-coverage — the fixed-spec census and dynamic-gate contract both need guards.
//
// Nothing consumes this report automatically. A broken parse could claim zero
// fixed specs or a non-blocking/push-only selector and still look plausible.
// These tests pin the mechanism and event/base semantics, never the count.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { report, ALL_SPECS, expand, groupSpecs } from "../../tools/ci/ci-coverage.mjs";
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";

const ciWorkflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const pagesWorkflow = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");

test("it sees the specs on disk", () => {
  assert.ok(ALL_SPECS.length > 50, `only ${ALL_SPECS.length} specs found — the scan is broken`);
  assert.ok(ALL_SPECS.every((s) => s.startsWith("tests/") && s.endsWith(".spec.js")));
});

test("a single-star glob expands the way package.json means it", () => {
  // test:car is written with tests/specs/parts-*.spec.js — if this stopped expanding,
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
  assert.match(ciWorkflow, /group: ci-\$\{\{ inputs\.concurrency_key \|\| \(github\.event_name == 'workflow_dispatch' && github\.run_id\) \|\| github\.ref \}\}/,
    "a dispatched run keeps its own concurrency group so a push to the same ref cannot cancel it");
  assert.match(pagesWorkflow, /concurrency_key: pages-\$\{\{ github\.run_id \}\}/);
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test("a Pages run publishes the branch tip, and a rewritten history cannot deploy", () => {
  // The gate used to demand TIP == GITHUB_SHA and drop every superseded run,
  // which starved the site: ci is ~13 min, pushes land every ~6, so runs 1892,
  // 1893, 1894 and 1896 all went green and all skipped deploy while the live
  // build sat an hour behind. Superseded is EARLY, not stale — the tip contains
  // what the run gated plus more — so the run now publishes the TIP. The hazard
  // the old check really guarded (moving the site BACKWARDS) is still refused,
  // but on the honest condition: not an ancestor at all.
  const preflight = pagesWorkflow.split("\n  current-tip:")[1].split("\n  deploy:")[0];
  const deploy = pagesWorkflow.split("\n  deploy:")[1];
  assert.doesNotMatch(preflight, /^\s+environment:/m,
    "the cheap tip check must not create a github-pages deployment record");
  assert.match(preflight, /deploy: \$\{\{ steps\.tip\.outputs\.deploy \}\}/);
  assert.match(preflight, /fetch-depth: 0/,
    "merge-base needs history — a shallow checkout makes every ancestor test a false negative");
  assert.match(preflight, /git merge-base --is-ancestor "\$GITHUB_SHA" "\$TIP"/,
    "a superseded-but-ancestor run must still be allowed to publish");
  assert.match(preflight, /echo "deploy=false"[\s\S]*?history was rewritten/,
    "and only a non-ancestor may be dropped");

  assert.match(deploy, /needs: current-tip/);
  assert.match(deploy, /if: needs\.current-tip\.outputs\.deploy == 'true'/,
    "a run that cannot publish must skip the environment job entirely");
  assert.match(deploy, /environment:\s*\n\s+name: github-pages/);
  assert.match(deploy, /git fetch --no-tags origin/);
  assert.match(deploy, /TIP=\$\(git rev-parse/);
  assert.match(deploy, /if ! git merge-base --is-ancestor "\$GITHUB_SHA" "\$TIP"/,
    "the in-lock recheck must test ancestry, not equality");
  assert.match(deploy, /REFUSING DEPLOY:[\s\S]*?exit 1/,
    "a run that cannot publish while queued must fail, never become a successful no-op deployment");
  assert.match(deploy, /git checkout --detach "\$TIP"/,
    "the bytes published must be the TIP's, or the site can still go backwards");

  // Order matters three ways: resolve the tip, then stage from it, then publish.
  // Anchor on the STEP DECLARATIONS, not the bare phrases: the comment above
  // the tip checkout names "Stage site" in prose, so a loose indexOf finds the
  // comment and reports the steps in the wrong order (it did).
  const recheck = deploy.indexOf("- name: Resolve and check out the branch tip inside the Pages lock");
  const stage = deploy.indexOf("- name: Stage site");
  const publish = deploy.indexOf("uses: actions/deploy-pages@v4");
  assert.ok(recheck >= 0 && stage > recheck, "the tip must be checked out BEFORE the site is staged");
  assert.ok(publish > stage, "the final tip check must precede publication");

  // apex-sha is the provenance record. Stamping GITHUB_SHA while publishing the
  // tip would make the deployed shell name a commit that is not what shipped.
  assert.match(deploy, /PUBLISH_SHA="\$\{\{ steps\.tipsha\.outputs\.sha \}\}"/);
  assert.match(deploy, /name=\\"apex-sha\\" content=\\"\$PUBLISH_SHA\\"/,
    "apex-sha must name the commit actually published");
  assert.doesNotMatch(deploy, /echo "deploy=false"/,
    "once the environment job starts, unpublishable must fail rather than report success");
});

test("every ROOT html page is named in the Stage site whitelist", () => {
  // "Stage site" copies a WHITELIST — `cp index.html bench.html version.json …`
  // plus `cp -r js css icons assets vendor` — because uploading the repo root
  // shipped a 174 MB artifact for a 14 MB site. A directory is swept up; a file
  // at the ROOT is not, so a new root page deploys as a 404 with a green build.
  // That is exactly what happened to bench.html on build 7377: CI passed, the
  // deploy succeeded, version.json moved, and the page was not there.
  //
  // Derived from the tree, not pinned: add a root page and this fails until the
  // workflow names it.
  const roots = fs.readdirSync(new URL("../..", import.meta.url))
    .filter((f) => f.endsWith(".html") && !f.startsWith("."));
  // Bound the slice to the STEP (stop at the next `- name:`) and strip YAML
  // comments before matching. Both matter: the first version of this guard
  // sliced to end-of-file and matched its own explanatory comment, which names
  // bench.html — so removing bench.html from the `cp` line left it GREEN. That
  // is the fifth comment-vs-code false pass in this repo; the rule is now
  // reflexive. Strip first, then match.
  const from = pagesWorkflow.indexOf("- name: Stage site");
  assert.ok(from >= 0, "the Stage site step is gone — this guard is pinned to a step that moved");
  const rest = pagesWorkflow.slice(from + 1);
  const nextStep = rest.indexOf("- name:");
  const stage = (nextStep >= 0 ? rest.slice(0, nextStep) : rest)
    .split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  const missing = roots.filter((f) => !stage.includes(f));
  assert.deepEqual(missing, [],
    `a root .html page is not staged by .github/workflows/pages.yml, so it will ` +
    `404 on the live site while the build goes green: ${missing.join(", ")}. ` +
    `Add it to the \`cp\` line in "Stage site".`);
});

test("cached browser jobs never enter apt through --with-deps", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const driving = ciWorkflow.split("\n  driving-model:")[1].split("\n  renderer-filter:")[0];
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

test("the ship filter no longer polices the committed generation — the deploy stamps it", () => {
  // Until 2026-09-01 this step failed CI when deployed bytes changed without a
  // strictly newer committed build. pages.yml now stamps the generation from
  // the commit count at deploy time (deploy-stamp.test.mjs pins that), so the
  // committed number is a placeholder and a check on it would fail every push.
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.doesNotMatch(smoke, /bump-cache\.mjs --check --since/);
  assert.match(smoke, /stamps the generation from the commit count/, "the replacement rule is written where the check stood");
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

test("selected's gate matches the selector, and cannot rerun the fixed-budget smoke spec", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const selected = ciWorkflow.split("\n  selected:")[1];
  assert.match(smoke, new RegExp("test:smoke -- --timeout=" + SMOKE_TIMEOUT_MS));
  assert.match(smoke, /tests\/specs\/smoke\.spec\.js/,
    "test-only smoke edits must force the fixed shards even though they do not ship");
  // THE WORKFLOW AND THE SELECTOR MUST AGREE, which is the actual invariant —
  // the budget maths in tools/ci/select-budget.mjs only describes the job that
  // runs if the yaml passes the timeout the selector priced. This used to pin
  // the literal 120000 on both lines, and that number was the defect: it sat
  // below the cost of a circuit build, killed healthy specs, and skipped the
  // deploy job on Pages runs 2015 and 2020. Pinning it protected the bug.
  const gateMs = SELECTED_GATE.perTestTimeoutSec * 1000;
  // Anchored on the RUN COMMAND, not on any occurrence in the job's text. A
  // bare /--timeout=N/ was satisfied by the explanatory COMMENT a few lines
  // above the command — so the guard passed while the command itself carried a
  // different number, which is a guard that cannot fail. Caught by falsifying
  // it: the workflow was edited back to 120000 and the test still went green.
  assert.match(selected, new RegExp("run: npm test -- \\$\\{\\{ steps\\.sel\\.outputs\\.specs \\}\\}" +
    " --retries=0 --timeout=" + gateMs + "\\b"),
    `the selected job must pass the selector's own ${gateMs} ms, or the budget maths ` +
    "describes a job that does not exist");
  assert.doesNotMatch(selected, new RegExp("npm test -- .*smoke\\.spec\\.js.*--timeout=" + gateMs));
  assert.match(selected, /COVERED BY FIXED BLOCKING GATE/,
    "the selected report must make its delegated coverage visible");
});

// THE RENDERER JOB (2026-09-01): the gfx group on macos-latest, the one runner
// image with a hardware (Metal) adapter. Three things about it are load-bearing
// and none of them is enforced by YAML: it must run on the macOS image, it must
// never carry the one flag that turns that image's GPU into SwiftShader, and it
// must stay OUT of the deploy gate until it has a measured history (pages.yml
// consumes the aggregate of every job in ci.yml, so "out" means "skipped on the
// Pages call", which the tool derives from the `!inputs.concurrency_key` if).
const gpuWorkflow = fs.readFileSync(new URL("../../.github/workflows/gpu-census.yml", import.meta.url), "utf8");
const rendererJob = ciWorkflow.split("\n  renderer-macos:")[1]?.split("\n  selected:")[0];
const rendererFilter = ciWorkflow.split("\n  renderer-filter:")[1]?.split("\n  renderer-macos:")[0];

test("the renderer specs have their own macOS job that runs test:gfx", () => {
  assert.ok(rendererJob, "renderer-macos job missing from ci.yml");
  assert.ok(rendererFilter, "renderer-filter job missing from ci.yml");
  assert.match(rendererJob, /^    runs-on: macos-latest$/m, "the renderer job must run on the image with the Metal adapter");
  assert.match(rendererJob, /run: npm run test:gfx -- --config=playwright\.gpu\.config\.js --timeout=\d+/);
  assert.match(rendererJob, /APEX_WORKERS: 2/);
  assert.match(rendererJob, /^    timeout-minutes: 30$/m);
  assert.deepEqual(report.rendererGate.specs, groupSpecs("test:gfx"));
  // >= 5, not 6: tlx-probes.spec.js left test:gfx with the 2026-09-03 WGX/TLX
  // spike-out. The five that remain are the GLX renderer specs this macOS job
  // exists for — an anti-vacuity floor, so it tracks the list.
  assert.ok(report.rendererGate.specs.length >= 5, `test:gfx resolved to ${report.rendererGate.specs.length} specs`);
  assert.equal(report.rendererGate.runsOn, "macos-latest");
  assert.equal(report.rendererGate.config, "playwright.gpu.config.js");
});

test("the renderer job never passes --use-angle=vulkan (it drops macOS to SwiftShader)", () => {
  // CI-RENDERING-PERFORMANCE.md §There IS a real GPU, trap 1: measured, not
  // a style preference. Checked on the UNCOMMENTED job text, because the
  // comment is allowed to name the flag in order to forbid it.
  const code = rendererJob.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /--use-angle=vulkan/);
  assert.doesNotMatch(code, /--use-angle=swiftshader/, "the whole point of the job is the hardware adapter");
  assert.equal(report.rendererGate.vulkanAngle, false);
  // The launch config it uses must remove the base pin and refuse any other
  // --use-angle — the base config stays untouched (protected contract file).
  const gpuCfg = fs.readFileSync(new URL("../../playwright.gpu.config.js", import.meta.url), "utf8");
  assert.match(gpuCfg, /import base from "\.\/playwright\.config\.js"/);
  assert.match(gpuCfg, /filter\(\(a\) => a !== SOFTWARE_ANGLE\)/);
  assert.match(gpuCfg, /channel: "chromium"/, "the headless shell has no navigator.gpu");
  assert.doesNotMatch(gpuCfg.replace(/^\s*\/\/.*$/gm, ""), /--use-angle=vulkan/);
  const baseCfg = fs.readFileSync(new URL("../../playwright.config.js", import.meta.url), "utf8");
  assert.match(baseCfg, /"--use-angle=swiftshader",/, "the base config still pins SwiftShader for every other run");
});

test("the renderer job proves the adapter before trusting the run, and uploads on failure", () => {
  assert.match(rendererJob, /node tools\/gfx\/gpu-census\.mjs --json census-macos\.json/);
  assert.match(rendererJob, /r\.anyHardware !== true/, "the tri-state census must be compared with === true, never coerced");
  assert.equal(report.rendererGate.censusGated, true);
  assert.match(rendererJob, /if: failure\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
  assert.match(rendererJob, /name: playwright-artifacts-renderer-macos/);
  // The full browser, cached at macOS's path; never apt.
  assert.match(rendererJob, /id: pwcache/);
  assert.match(rendererJob, /path: ~\/Library\/Caches\/ms-playwright/);
  assert.match(rendererJob, /if: steps\.pwcache\.outputs\.cache-hit != 'true'\s*\n\s*run: npx playwright install chromium$/m);
  assert.doesNotMatch(rendererJob.replace(/^\s*#.*$/gm, ""), /--with-deps/, "--with-deps is apt; the comment may name it, the step may not");
});

test("the renderer job is path-filtered on a cheap runner and stays out of the deploy gate", () => {
  assert.match(rendererFilter, /^    runs-on: ubuntu-latest$/m, "the filter must not allocate a macOS runner to say no");
  // 2026-09-02 (Actions minutes): the macOS runner bills at 10x Linux and
  // gpu-census.yml already gives every renderer commit its real-GPU verdict,
  // so the gfx specs on Metal are nightly or opt-in (`renderer_macos: true`)
  // — a push must never allocate that runner. The `!inputs.concurrency_key`
  // term is what tools/ci/ci-coverage.mjs reads to keep both jobs out of the
  // deploy gate; it has to stay first.
  assert.match(rendererFilter, /if: \$\{\{ !inputs\.concurrency_key && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\) \}\}/);
  assert.match(rendererJob, /^    needs: renderer-filter$/m);
  assert.match(rendererJob, /if: needs\.renderer-filter\.outputs\.renderer == 'true' && \(github\.event_name == 'schedule' \|\| inputs\.renderer_macos == true\)/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      renderer_macos:\n(?:.*\n)*?        type: boolean\n(?:.*\n)*?        default: false\n/,
    "the dispatch must declare the renderer_macos opt-in, default off");
  assert.equal(report.rendererGate.deployGate, false,
    "renderer-macos joined the deploy gate — pages.yml aggregates every job in ci.yml, so this must be deliberate");
  assert.deepEqual(report.jobs.filter((j) => !j.deployGate).map((j) => j.name).sort(), ["renderer-filter", "renderer-macos"]);
  // The path filter: every renderer backend plus the lighting modules the
  // gfx specs pin, the spec list DERIVED from package.json, fail-safe to run.
  for (const p of ["js/render/", "js/game/lighting[^/]*\\.js$", "js/game/track-lights\\.js$", "js/game/frame-lights\\.js$", "js/game/light-presets\\.js$", "js/game/atmosphere\\.js$", "js/game/tuner\\.js$"]) {
    assert.ok(rendererFilter.includes(p), `renderer filter does not route ${p}`);
  }
  assert.match(rendererFilter, /scripts\["test:gfx"\]/);
  assert.match(rendererFilter, /run_all "git diff failed"/);
  assert.match(rendererFilter, /run_all "before-sha \$BEFORE unreachable/);
  assert.doesNotMatch(rendererFilter, /renderer=false"[^\n]*\n[^\n]*exit 0/, "an unresolvable diff must RUN, never skip");
  // Nothing in pages.yml names it — it reaches the Pages run only as a skip.
  assert.doesNotMatch(pagesWorkflow, /renderer-macos|renderer-filter/);
});

test("the deploy-gate count excludes what the renderer job runs", () => {
  for (const s of report.rendererGate.specs) {
    assert.ok(!report.executed.includes(s),
      `${s} is counted as deploy-gate coverage, but only renderer-macos runs it and that job is skipped on the Pages call`);
  }
  const gfx = report.viaGroup.find((g) => g.group === "test:gfx");
  assert.ok(gfx, "the tool no longer sees test:gfx at all");
  assert.equal(gfx.job, "renderer-macos");
  assert.equal(gfx.deployGate, false);
});

test("the push-gate smoke spec is sharded four ways on separate runners (unsharded it hits the 30-minute cap)", () => {
  // Pages runs 1873/1876 measured smoke.spec.js at 30-37 min on one shared
  // runner — the job's own cap. The matrix must be a constant four (never a
  // one-shard fallback on push) and the Smoke step must pass --shard.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  assert.match(smokeJob, /^\s+shard: \[1, 2, 3, 4\]\s*$/m, "the smoke matrix must be a constant four shards");
  assert.doesNotMatch(smokeJob, /fromJSON\([^)]*'\[1\]'/, "no one-shard fallback on push");
  assert.match(smokeJob, /run: npm run test:smoke -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/4/);
  // The nightly / dispatch step runs the boot group by default and, on
  // dispatch, whichever browser group the `group` input names — the
  // runner-side verification for specs the SwiftShader dev box cannot time.
  assert.match(smokeJob, /GROUP: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.group \|\| 'tiny' \}\}/);
  assert.match(smokeJob, /run: npm run "test:\$\{GROUP:-tiny\}" -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      group:\n/, "the dispatch declares the group input");
});

test("gpu-census runs nightly beside the boot group, with the full check and its dispatch defaults", () => {
  assert.match(gpuWorkflow, /^on:\s*\n  schedule:\s*\n    - cron: "17 3 \* \* \*"\s*\n  workflow_dispatch:/m,
    "gpu-census.yml must carry the same nightly cron as ci.yml");
  assert.match(ciWorkflow, /- cron: "17 3 \* \* \*"/);
  // The inputs survive (a dispatch is still the way to ask a question)…
  for (const input of ["track:", "images:", "census_only:", "force:", "ls:"]) assert.match(gpuWorkflow, new RegExp(`^      ${input}`, "m"));
  // …and a scheduled run, where every input is empty, still gets the FULL
  // check on the default images and track — not census_only, not a fallback
  // to ubuntu-only via the plan job's empty-string branch.
  assert.match(gpuWorkflow, /if: \$\{\{ !inputs\.census_only \}\}/);
  assert.match(gpuWorkflow, /if: \$\{\{ always\(\) && !inputs\.census_only \}\}/, "the Verdict must still gate a scheduled run");
  assert.match(gpuWorkflow, /IMAGES: \$\{\{ inputs\.images \|\| 'ubuntu-latest,macos-latest,windows-latest' \}\}/);
  assert.match(gpuWorkflow, /inputs\.images \|\| '[^']*macos-latest[^']*'/, "the nightly must include the one image with a real GPU");
  const trackUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{\{ inputs\.track \|\| 'montreal' \}\}"/g) || [];
  assert.equal(trackUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must default the track for the schedule");
  assert.doesNotMatch(gpuWorkflow, /gpu-game-check\.mjs "\$\{\{ inputs\.track \}\}"/);
});

test("gpu-census has a NATIVE WGX leg with hardware gates (bound, swapchain, gpuErrors)", () => {
  // Until 2026-09-02 the "webgpu" leg was three.js on WebGPU, so js/render/webgpu/
  // had no real-GPU evidence at all. The leg must run WGX itself and the
  // Verdict must fail a hardware run where WGX fell back or soft-presents.
  assert.match(gpuWorkflow, /- name: Game check — WGX \/ WebGPU \(native, opt-in\)/);
  assert.match(gpuWorkflow, /--backend webgpu \$LS \\\n\s+--json "game-wgx-\$\{\{ matrix\.image \}\}\.json"/);
  assert.match(gpuWorkflow, /for \(const path3 of \["webgpu", "webgl2", "glx", "wgx"\]\)/);
  assert.match(gpuWorkflow, /const tlxLeg = path3 === "webgpu" \|\| path3 === "webgl2";/,
    "the WGX leg must not be held to the TLX env-probe expectations");
  assert.match(gpuWorkflow, /if \(hardware && gfx\.wgx !== true\) bad\.push\(`wgx: WGX did not bind/);
  assert.match(gpuWorkflow, /else if \(hardware && gfx\.wgxSoftPresent === true && gfx\.headlessUa !== true\) bad\.push\(`wgx: WGX is soft-presenting/,
    "a headless UA blits by design (run 19); only a headed hardware run proves the swapchain path");
  const check = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(check, /r\.wgx = typeof g\.softPresent === "function";/);
  assert.match(check, /r\.wgxSoftPresent = !!g\.softPresent\(\)/);
});

test("docs-only pushes do not start CI (Actions minutes, 2026-09-02)", () => {
  // A commit that touches only docs / markdown / agent config ships nothing;
  // the guard suite that covers those trees runs locally on every edit. The
  // deploy branch is exempt by construction: it reaches this workflow through
  // pages.yml's `uses:` call, which no path filter touches.
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\npermissions:"));
  const pushBlock = onBlock.slice(onBlock.indexOf("  push:"), onBlock.indexOf("  pull_request:"));
  const prBlock = onBlock.slice(onBlock.indexOf("  pull_request:"), onBlock.indexOf("  schedule:"));
  for (const b of [pushBlock, prBlock]) {
    assert.match(b, /paths-ignore:\n(?:\s+- "[^"]+"\n)+/, "push and pull_request must carry a paths-ignore list");
    for (const p of ['"docs/**"', '"**/*.md"', '".claude/**"', '".cursor/**"']) assert.ok(b.includes(`- ${p}`), `${p} missing from paths-ignore`);
  }
  assert.match(pushBlock, /branches-ignore: \[claude\/f1-game-project-26h3ng\]/, "the deploy branch stays routed through pages.yml");
});

test("every inline `node -e '…'` script in the workflows is syntactically complete (no apostrophe can close the quote early)", () => {
  // Run 33757119814 (2026-09-03): all four macOS game checks passed and the
  // Verdict step FAILED with "SyntaxError: Unexpected end of input" — a
  // comment inside the single-quoted script said "three's", the apostrophe
  // ended the bash string, and node received half a program. The gate
  // failed CLOSED that time; the same slip inside an `if (...)` could just as
  // easily drop a clause and pass. Extract every `node -e '` block as bash
  // would see it and compile it: a body that contains an apostrophe is
  // truncated by construction, and one that does not must still parse.
  const files = ["ci.yml", "pages.yml", "gpu-census.yml"];
  let blocks = 0;
  for (const f of files) {
    const text = fs.readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*node -e '$/.test(lines[i])) continue;
      const indent = lines[i].match(/^\s*/)[0];
      let j = i + 1;
      // The closing quote may carry a redirect / fallback on the same line
      // (`' > "$FILE" || run_all …` in ci.yml).
      while (j < lines.length && !(lines[j].startsWith(indent + "'") && /^'(\s|$)/.test(lines[j].slice(indent.length)))) j++;
      assert.ok(j < lines.length, `${f}:${i + 1}: node -e block never closes`);
      const body = lines.slice(i + 1, j).join("\n");
      const apos = body.split("\n").findIndex((l) => l.includes("'"));
      assert.equal(apos, -1,
        `${f}:${i + 1 + apos + 1}: an apostrophe inside a single-quoted node -e script ends the script there`);
      assert.doesNotThrow(() => new vm.Script(body, { filename: `${f}:${i + 1}` }),
        `${f}:${i + 1}: the inline node script does not parse`);
      blocks++;
      i = j;
    }
  }
  assert.ok(blocks >= 2, `found only ${blocks} node -e blocks — the extraction regex has stopped matching`);
});
