// ci-ship-smoke-renderer — junit/timings, the ship filter job, smoke shards and timeouts, llvmpipe, and the renderer-macos job.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";
import { report, groupSpecs } from "../../tools/ci/ci-coverage.mjs";
import { ciWorkflow, pagesWorkflow, selectJob, selectedJob, selectStep, shipFilter, rendererJob, rendererFilter, SELECTED_TIMEOUT_MS } from "../helpers/ci-workflow.mjs";

test("a GREEN run's junit survives — the timings CI already measures", () => {
  /* tools/ci/spec-timings.mjs was written to build a rolling per-test duration
     record and had nothing to merge: junit.xml was uploaded `if: failure()`
     only, so a PASSING run — the run whose timings you actually want — threw
     them away. 0 of 119 specs carry three samples, and select-budget.mjs bills
     the whole tree from one 2026-08-07 mean, which is what excludes ~66 % of
     the suite from the change-aware gate.

     Pinned on all three browser jobs, because one of them reverting is enough
     to make the record partial in a way nothing else would report. */
  for (const [job, bound] of [["smoke", "\n  driving-model:"], ["driving-model", "\n  renderer-macos:"],
                              ["selected", null]]) {
    const body = bound
      ? ciWorkflow.split(`\n  ${job}:`)[1].split(bound)[0]
      : selectedJob;
    assert.match(body, /- name: Spec timings \(junit/, `${job} no longer uploads its junit`);
    assert.match(body, /name: spec-timings-junit-/, `${job}'s timings artifact must be findable by pattern`);
    assert.match(body, /path: artifacts\/test-results-\*\/junit\.xml/, `${job} must upload junit, not the heavy trace bundle`);
    assert.match(body, /if-no-files-found: ignore/, `${job} must not fail a run for having no timings`);
    // The whole point: NOT failure()-only.
    const step = body.split("- name: Spec timings (junit")[1].split("- name:")[0];
    assert.match(step, /if: always\(\)/, `${job}'s timings upload is conditional on failure again`);
  }
});

test("the timings merge is its own workflow, and never pushes to the deploy branch", () => {
  /* IT CANNOT LIVE IN ci.yml. It needs `contents: write`, and pages.yml calls
     ci.yml as a reusable workflow granting only `contents: read` — GitHub
     validates every declared job's permissions at STARTUP, skipped jobs
     included. Train #2241 died `startup_failure` on exactly that, and a
     `contents: write` job in ci.yml would kill every train the same way. This
     test is the thing standing between a future "just move it into CI" and a
     dead release train. */
  const timings = fs.readFileSync(new URL("../../.github/workflows/spec-timings.yml", import.meta.url), "utf8");
  assert.match(timings, /^permissions:\n  contents: write\n  actions: read$/m,
    "the merge workflow needs write for the side branch and read for the artifacts");
  // ci.yml must NOT gain a write permission, or every Pages call fails at startup.
  assert.doesNotMatch(ciWorkflow, /^\s+contents: write\s*$/m,
    "a contents:write job in ci.yml fails startup validation on every pages.yml call (train #2241)");
  // Same refusal import-models.yml carries: the deploy branch by name.
  assert.match(timings, /claude\/f1-game-project-26h3ng\|""\|\*\[!a-z0-9\._\/-\]\*\)/,
    "the push must refuse the deploy branch by name, as import-models.yml does");
  // The bot's own hooks must not refuse the bot (2026-10-15, #2084): package.json
  // `prepare` activates .githooks on the runner, and pre-push calls every
  // non-fast-forward push "a force push". The rolling record IS a force push.
  assert.match(timings, /git -c core\.hooksPath=\/dev\/null push -f origin "\$TIMINGS_BRANCH"/,
    "the record push bypasses the prepare-installed pre-push hook (it blocked the bot on 18cb8f37 and c23ad312)");
  assert.doesNotMatch(timings, /^\s+git push -f origin/m, "no bare force push left that the hook can refuse");
  // FORCE-PUSHED, so the namespace matters as much as the name: `claude/*` is
  // where sessions branch, and a bot that force-pushes there lands on an open
  // PR's head sooner or later. `bot/` is import-models.yml's convention.
  assert.match(timings, /^  TIMINGS_BRANCH: bot\/[a-z0-9-]+$/m,
    "the force-pushed branch must live under bot/, never in the claude/ namespace sessions use");
  assert.doesNotMatch(timings, /git push[^\n]*claude\/f1-game-project-26h3ng/,
    "the timings bot may never push to the branch that ships");
  // The env bucket must match the stack that produced the numbers, not the
  // runner doing the merge — mixing buckets is what spec-timings.mjs forbids.
  assert.match(timings, /APEX_GL: llvmpipe/,
    "the browser jobs run llvmpipe; merging under another bucket fakes a regression");
  // And it must be serialised: two merges racing drop each other's samples.
  assert.match(timings, /concurrency:\n  group: spec-timings/);
  // IT MUST ACCUMULATE (2026-09-24). Merging into the deploy tip's copy and
  // force-pushing over the side branch dropped every earlier run's samples: 43
  // runs left 1 sample per spec on 5 specs, so no spec ever reached
  // select-budget's MIN_SAMPLES and the gate stayed on a 2026-08 constant.
  const start = timings.indexOf("Start from the accumulated record");
  assert.ok(start > 0 && start < timings.indexOf("Merge into tests/data/spec-timings.json"),
    "the side branch's record must be restored BEFORE the new junit is merged into it");
  assert.match(timings, /git fetch -q origin "\$TIMINGS_BRANCH"/);
  // The train's gate runs ci.yml as a reusable workflow, so its junit lands in
  // the PAGES run; a workflow_run on "CI" alone never sees those samples.
  // THE TRAIN ONLY (2026-09-30): listening to "CI" as well created a run per
  // PR completion that the job's `if:` then skipped — 119 skipped runs in
  // seven hours, queued one at a time, after the `branches:` filter landed.
  assert.match(timings, /workflows: \["Deploy to GitHub Pages"\]/,
    "the Pages train's gate is the one full smoke run on the tip, and the only trigger worth a run");
  assert.doesNotMatch(timings, /workflows: \[[^\]]*"CI"/,
    "a workflow_run on CI fires for every PR completion and skips (2026-09-29: 119 in 7 h)");
});

test("the ship filter is ONE job whose answer every smoke shard reads", () => {
  /* MEASURED 2026-09-22: the four smoke shards each spent 3m32s-5m02s on
     checkout + `npm ci` BEFORE the filter could say "do not run", and each then
     walked the deployments API for the same live SHA. The filter is a job now,
     `renderer-filter`'s shape, and smoke reads its output.

     The two things that must stay true, and that a careless revert would break:
     the filter job needs NO dependency install, and the smoke job still RUNS on
     a diff that ships nothing — it skips its steps. A skipped smoke job is not a
     passed one to pages.yml's `deploy: needs: ci` aggregate. */
  // 2026-10-15: a STEP of the `select` plan job (one runner already checked out
  // with full history for the slice plan and the spec selection), published as
  // a job output. Smoke still reads one answer; nothing installs twice.
  assert.ok(shipFilter, "the ship filter step is gone");
  assert.doesNotMatch(shipFilter.replace(/^\s*#.*$/gm, ""), /setup-apex|npm ci|playwright-chromium/,
    "the filter needs git, curl and node — it must not install anything of its own");
  assert.match(selectJob, /fetch-depth: 0/, "the plan job diffs against an arbitrarily old live SHA");
  assert.match(selectJob, /ships: \$\{\{ steps\.shipfilter\.outputs\.ships \}\}/, "select must publish the answer");
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, /^    needs: \[select\]$/m, "smoke must read the hoisted answer from the plan job");
  assert.doesNotMatch(smoke.replace(/^\s*#.*$/gm, ""), /deployments\?environment=github-pages/,
    "the filter body is back inside the matrix — that is four copies of one question");
  // EVERY step, checkout and setup-apex included, or the move buys nothing.
  // Exempt: a `failure()` step, which by definition cannot run when every step
  // before it was skipped, and which must stay reachable when one of them fails.
  const steps = smoke.split(/\n      - /).slice(1);
  const ungated = steps.filter((st) => !/needs\.select\.outputs\.ships != 'false'/.test(st)
    && !/^\s*if: failure\(\)(?: \|\| cancelled\(\))?\s*$/m.test(st));
  assert.deepEqual(ungated.map((st) => st.split("\n")[0].trim()), [],
    "a smoke step runs even when nothing ships; the install steps are most of the cost");
  // NOT a job-level `if:` on the filter's output: that would SKIP smoke, and a
  // skipped job is not a passed one to the deploy aggregate.
  assert.doesNotMatch(smoke, /^    if: .*needs\.select\.outputs\.ships/m,
    "smoke must run and skip its steps, never skip as a job");
});

test("the ship filter no longer polices the committed generation — the deploy stamps it", () => {
  // Until 2026-09-01 this step failed CI when deployed bytes changed without a
  // strictly newer committed build. pages.yml now stamps the generation from
  // the commit count at deploy time (deploy-stamp.test.mjs pins that), so the
  // committed number is a placeholder and a check on it would fail every push.
  assert.doesNotMatch(shipFilter, /bump-cache\.mjs --check --since/);
  assert.match(shipFilter, /stamps the generation from the commit count/, "the replacement rule is written where the check stood");
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
  assert.ok(SMOKE_TIMEOUT_MS >= SELECTED_TIMEOUT_MS,
    `smoke's per-test cap is ${SMOKE_TIMEOUT_MS} ms, below the selected gate's ` +
    `${SELECTED_GATE.perTestTimeoutSec} s`);
  assert.doesNotMatch(smokeSpec, /^\s*test\.slow\s*\(/m,
    `test.slow triples the workflow's ${SMOKE_TIMEOUT_MS / 1000} s per-test timeout`);
});

test("the selected gate cannot rerun the fixed-budget smoke spec", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, new RegExp("test:smoke -- --timeout=" + SMOKE_TIMEOUT_MS));
  // The force-the-shards rule lives with the filter, which is its own job now.
  assert.match(shipFilter, /tests\/specs\/smoke\.spec\.js/,
    "test-only smoke edits must force the fixed shards even though they do not ship");
  assert.match(selectedJob, new RegExp(`--timeout=${SELECTED_TIMEOUT_MS}`),
    `ci.yml's selected step must run the timeout select-specs.mjs models ` +
    `(${SELECTED_GATE.perTestTimeoutSec} s)`);
  assert.doesNotMatch(selectedJob, new RegExp(`npm test -- .*smoke\\.spec\\.js.*--timeout=${SELECTED_TIMEOUT_MS}`));
  assert.match(selectStep, /COVERED BY FIXED BLOCKING GATE/,
    "the selection report must make its delegated coverage visible");
  assert.match(selectStep, /COVERED BY MANUAL OPT-IN/,
    "an env-gated spec (material-shimmer) must be named, not scheduled");
});

test("the golden-menu check is blocking AND never runs on the Pages call", () => {
  // E3 (2026-09-16): its `if:` was `pull_request || workflow_dispatch` under a
  // comment promising "never the Pages call" — but a called workflow sees the
  // CALLER's event, and "deploy now" is a workflow_dispatch of pages.yml, so
  // the trial ran in train #2348 (run 35066895398). An advisory job that leaks
  // into the deploy gate is one `continue-on-error` deletion away from
  // blocking it, so both halves of the contract are pinned here.
  const trial = (ciWorkflow.split("\n  baseline-trial:")[1] || "").split(/^  [a-z][\w-]*:$/m)[0];
  assert.ok(trial, "baseline-trial job missing");
  assert.doesNotMatch(trial, /^    continue-on-error: true$/m, "the baseline must fail the scheduled verdict");
  assert.match(trial, /inputs\.concurrency_key == ''/,
    "a Pages call carries a concurrency_key whatever its caller's event; that is the only reliable tell");
  assert.match(ciWorkflow, /- baseline-trial/,
    "the required CI aggregator must consume the baseline result");
});

test("every browser gate but the parity anchor runs on Mesa llvmpipe, and `gl: swiftshader` opts out", () => {
  // 2026-09-16, second pass. llvmpipe reached the smoke shards first (run
  // 35062479811: corner approach 17.8 s against a 214 s SwiftShader median,
  // every frame assertion holding) while `selected`'s oversize shards were
  // still 10-40 min of SwiftShader and were the gate's wall clock. A step that
  // sets APEX_GL without the apt+Xvfb step above it launches against a display
  // that is not there, so the two must travel together in every job — that
  // pairing is the thing YAML cannot state and this test can.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const drivingJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  driving-model:\n"), ciWorkflow.indexOf("\n  renderer-macos:\n"));
  // The apt + Xvfb + DISPLAY recipe is one composite action since 2026-09-22;
  // each job keeps the step NAME and the opt-out `if:` and takes the body by `uses:`.
  const mesa = fs.readFileSync(new URL("../../.github/actions/mesa-xvfb/action.yml", import.meta.url), "utf8");
  assert.match(mesa, /Xvfb :99 -screen 0 1280x800x24[^\n]*&\n[\s\S]*?echo "DISPLAY=:99" >> "\$GITHUB_ENV"/,
    "the action's Xvfb must export DISPLAY so the pinned test command line is unchanged");
  // …and WAIT for the server's socket before the first browser launch (2026-10-04).
  assert.match(mesa, /\[ -S \/tmp\/\.X11-unix\/X99 \] && break/, "the action waits for Xvfb's socket");
  for (const [name, job] of [["smoke", smokeJob], ["selected", selectedJob]]) {
    assert.match(job, /- name: Mesa llvmpipe \+ Xvfb\n\s+if: [^\n]*inputs\.gl != 'swiftshader'\n\s+uses: \.\/\.github\/actions\/mesa-xvfb/,
      `${name} must install Mesa + Xvfb through the action, and skip it on the \`gl: swiftshader\` opt-out`);
    assert.match(job, /APEX_GL: (llvmpipe|\$\{\{ \(?inputs\.gl != 'swiftshader'[^\n]*\}\})/,
      `${name} installs llvmpipe but never asks the browser for it`);
  }
  // The one carve-out: menu-baseline's goldens are SwiftShader captures (the
  // spec's own platform note), so a `selected` shard that carries it keeps the
  // ANGLE default: on the deploy tip `selected` still ran SwiftShader, and this
  // branch moves it to llvmpipe, so the carve-out lands with the swap.
  assert.match(selectedJob, /APEX_GL: \$\{\{ \(inputs\.gl != 'swiftshader' && !contains\(matrix\.specs, 'menu-baseline'\)\) && 'llvmpipe' \|\| '' \}\}/,
    "a selected shard carrying menu-baseline must stay on SwiftShader (its goldens are SwiftShader captures)");
  // driving-model is the parity anchor for the VM twins (physics-baseline.json):
  // a rasteriser swap under it is a separate, separately measured change.
  assert.doesNotMatch(drivingJob, /APEX_GL|llvmpipe/,
    "driving-model stays on SwiftShader — swap it deliberately, with its own measurement");
});

// THE RENDERER JOB (2026-09-01): the gfx group on macos-latest, the one runner
// image with a hardware (Metal) adapter. Three things about it are load-bearing
// and none of them is enforced by YAML: it must run on the macOS image, it must
// never carry the one flag that turns that image's GPU into SwiftShader, and it
// runs on the deploy gate when the live diff reaches renderer bytes. Pages
// consumes the aggregate of every job in ci.yml, so the selector and job
// condition must agree on that called-workflow path.
// A step of the `select` plan job since 2026-10-15 (a job of its own before).

test("the renderer specs have their own macOS job that runs test:gfx", () => {
  assert.ok(rendererJob, "renderer-macos job missing from ci.yml");
  assert.ok(rendererFilter, "the renderer filter step is missing from ci.yml");
  assert.match(rendererJob, /^    runs-on: macos-latest$/m, "the renderer job must run on the image with the Metal adapter");
  assert.match(rendererJob, /run: npm run test:gfx -- --config=playwright\.gpu\.config\.js --timeout=\d+/);
  // ONE worker: two Chromium instances on the shared Metal GPU wedged
  // Playwright's "Create context" in two of four runs (3500, 3509), 27 min
  // each on the per-test budget until a hand cancel (docs/notes/DEFECT-LEDGER.md).
  assert.match(rendererJob, /APEX_WORKERS: 1/);
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

test("the renderer job proves the adapter before trusting the run, and uploads its report on every run", () => {
  assert.match(rendererJob, /node tools\/gfx\/gpu-census\.mjs --json census-macos\.json/);
  assert.match(rendererJob, /r\.anyHardware !== true/, "the tri-state census must be compared with === true, never coerced");
  assert.equal(report.rendererGate.censusGated, true);
  // always(), not failure(): a spec that fails its first attempt and passes
  // the retry leaves the job green, and a green job uploaded nothing — the
  // frames image-grade "shadows" attaches were unretrievable on run 3495
  // exactly when they were the next step (docs/notes/DEFECT-LEDGER.md).
  assert.match(rendererJob, /if: always\(\)\s*\n\s*uses: actions\/upload-artifact@/);
  assert.match(rendererJob, /name: playwright-artifacts-renderer-macos/);
  // The full browser, cached at macOS's path; never apt: the composite action
  // with the macOS browser dir and with-deps off (the cache-hit contract itself
  // is pinned on the action by the --with-deps test above).
  assert.match(rendererJob, /uses: \.\/\.github\/actions\/playwright-chromium\n\s+with:\n\s+browsers-path: ~\/Library\/Caches\/ms-playwright\n\s+with-deps: "false"/);
  assert.doesNotMatch(rendererJob.replace(/^\s*#.*$/gm, ""), /--with-deps/, "--with-deps is apt; the comment may name it, the step may not");
});

test("the renderer job is path-filtered on a cheap runner and joins the deploy gate for renderer releases", () => {
  assert.match(selectJob, /^    runs-on: ubuntu-latest$/m, "the filter must not allocate a macOS runner to say no (it is a step of the ubuntu plan job)");
  // 2026-09-02 (Actions minutes): the macOS runner bills at 10x Linux, so
  // drafts and topic-branch pushes stay off it. Ready (non-draft) PRs and Pages
  // calls that touch js/render/ MUST allocate it — otherwise a WGX/GLX rewrite can go
  // "green" with Metal never running. Nightly + `renderer_macos: true`
  // dispatch remain, and Pages calls use the live SHA as their comparison base.
  assert.match(rendererFilter, /if: \$\{\{ inputs\.concurrency_key != '' \|\| github\.event_name == 'schedule'/);
  assert.match(rendererFilter, /inputs\.concurrency_key != '' && inputs\.before_sha/);
  assert.match(rendererJob, /^    needs: select$/m);
  assert.match(rendererJob, /if: \$\{\{ .*needs\.select\.outputs\.renderer == 'true' && \(inputs\.concurrency_key != '' \|\| github\.event_name == 'schedule'/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      renderer_macos:\n(?:.*\n)*?        type: boolean\n(?:.*\n)*?        default: false\n/,
    "the dispatch must declare the renderer_macos opt-in, default off");
  assert.equal(report.rendererGate.deployGate, true,
    "renderer-macos must gate a Pages release when the selector routes renderer changes");
  assert.deepEqual(report.jobs.filter((j) => !j.deployGate).map((j) => j.name).sort(),
    ["xr"],
    "only the path-gated xr suite remains outside the deploy gate");
  // The path filter: every renderer backend plus the lighting modules the
  // gfx specs pin, the spec list DERIVED from package.json, fail-safe to run.
  // js/lighting/ as a DIRECTORY, not the six filenames this listed until
  // 2026-09-18: those still carried their pre-move js/game/ paths, so the
  // alternation could not match a lighting edit at all and this guard was
  // pinning the dead patterns in place. A directory prefix also routes the next
  // lighting module the day it lands.
  for (const p of ["js/render/", "js/lighting/"]) {
    assert.ok(rendererFilter.includes(p), `renderer filter does not route ${p}`);
  }
  assert.match(rendererFilter, /scripts\["test:gfx"\]/);
  assert.match(rendererFilter, /run_all "git diff failed"/);
  assert.match(rendererFilter, /run_all "before-sha \$BEFORE unreachable/);
  assert.doesNotMatch(rendererFilter, /renderer=false"[^\n]*\n[^\n]*exit 0/, "an unresolvable diff must RUN, never skip");
  // Pages calls reach it through ci.yml's selector and renderer condition.
  assert.doesNotMatch(pagesWorkflow, /renderer-macos|renderer-filter/);
});

test("the deploy-gate count includes what the renderer job runs", () => {
  for (const s of report.rendererGate.specs) {
    assert.ok(report.executed.includes(s),
      `${s} is not counted as deploy-gate coverage even though Pages can run renderer-macos`);
  }
  const gfx = report.viaGroup.find((g) => g.group === "test:gfx");
  assert.ok(gfx, "the tool no longer sees test:gfx at all");
  assert.equal(gfx.job, "renderer-macos");
  assert.equal(gfx.deployGate, true);
});

test("the smoke job carries no concurrency group of its own", () => {
  // 2026-10-15 to 10-16 every ready PR's one smoke shard shared a fleet-wide
  // `smoke-lane-1` group: a 2.6-min job that never failed (0 of 452) waited
  // p50 4.7 / p90 17.5 min behind other PRs' smoke and ended the critical
  // path of 40 of 210 green ready runs (the 2026-10-16 CI/CD review note,
  // #2333, finding 6). One job per run needs no lane; the workflow-level per-PR
  // group already replaces a superseded run. The selected legs keep theirs.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  assert.doesNotMatch(smokeJob, /^\s+concurrency:/m, "smoke must not wait in a lane; one job per run, runner queue only");
  assert.doesNotMatch(ciWorkflow, /smoke-lane/, "no fleet-wide smoke group anywhere in ci.yml");
});

test("smoke.spec.js is ONE shard on PRs and the Pages call; the wide nightly/dispatch run keeps four", () => {
  // Pages runs 1873/1876 measured smoke.spec.js at 30-37 min on one shared
  // runner — on SwiftShader. On llvmpipe (2026-09-16) the four shards did
  // 0.3-0.9 min of work each, and every job holds one of the account's 20
  // concurrent slots (docs/notes/CI-CAPACITY-2026-09-29.md). So the matrix is
  // one shard unless the run is the WIDE one (a whole browser group), which is
  // a schedule or dispatch with no Pages caller key.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  assert.match(smokeJob, /^\s+shard: \$\{\{ fromJSON\(\(inputs\.concurrency_key == '' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\)\) && '\[1, 2, 3, 4\]' \|\| '\[1\]'\) \}\}\s*$/m,
    "four shards exactly when the wide run can happen, one otherwise");
  assert.match(smokeJob, /run: npm run test:smoke -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/1/);
  // The one-shard claim rests on a measurement; keep it measured. llvmpipe
  // samples of smoke.spec.js must fit a single runner's cap with room to spare.
  const t = JSON.parse(fs.readFileSync(new URL("../data/spec-timings.json", import.meta.url), "utf8"));
  const walls = (t.specs["tests/specs/smoke.spec.js"]?.s || []).filter((x) => x[1] === "llvmpipe").map((x) => x[2]).sort((a, b) => a - b);
  assert.ok(walls.length >= 3, "smoke.spec.js has no llvmpipe history — the one-shard decision has no evidence");
  const capMin = Number(/timeout-minutes: \$\{\{ [^}]*\|\| (\d+) \}\}/.exec(smokeJob)?.[1]);
  assert.ok(walls.at(-1) * 5 < capMin * 60,
    `slowest llvmpipe smoke.spec.js run ${walls.at(-1)} s x5 must stay under the ${capMin}-min job cap on one runner`);
  // The nightly / dispatch step: a dispatch runs whichever browser group the
  // `group` input names, and a SCHEDULED run takes tonight's ROTATING group —
  // the runner-side verification for specs the SwiftShader dev box cannot time.
  // The rotation is the fix for a real hole: pinned to `tiny`, the nightly gave
  // 4 of 118 browser specs any scheduled coverage, and one sat red on the
  // deploy branch until a benchmarking run found it (DEFECT-LEDGER 2026-09-16).
  // Three things are load-bearing and none is stated by YAML: a dispatch still
  // WINS over the rotation, a scheduled run must actually consult the picker,
  // and `tiny` remains the last-resort fallback so a picker failure cannot
  // leave GROUP empty.
  assert.match(smokeJob, /GROUP: \$\{\{ \(github\.event_name == 'workflow_dispatch' && inputs\.group\) \|\| steps\.rota\.outputs\.GROUP \|\| 'tiny' \}\}/);
  assert.match(smokeJob, /- name: Pick tonight's rotating group\n\s+id: rota\n(?:\s+#.*\n)*\s+if: needs\.select\.outputs\.ships != 'false' && github\.event_name == 'schedule'\n\s+run: node tools\/ci\/nightly-group\.mjs >> "\$GITHUB_OUTPUT"/,
    "a scheduled run must pick its group from tools/ci/nightly-group.mjs, and only when the checkout above ran");
  assert.match(smokeJob, /run: npm run "test:\$\{GROUP:-tiny\}" -- --timeout=\d+ --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(ciWorkflow, /workflow_dispatch:\n    inputs:\n(?:.*\n)*?      group:\n/, "the dispatch declares the group input");
});
