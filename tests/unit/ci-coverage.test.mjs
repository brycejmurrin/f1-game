// ci-coverage — the fixed-spec census and dynamic-gate contract both need guards.
//
// Nothing consumes this report automatically. A broken parse could claim zero
// fixed specs or a non-blocking/push-only selector and still look plausible.
// These tests pin the mechanism and event/base semantics, never the count.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { report, ALL_SPECS, expand, groupSpecs } from "../../tools/ci/ci-coverage.mjs";
// DERIVED, never re-typed. This file was the FIFTH place the selected gate's
// per-test timeout appeared as a literal, and raising it 120 -> 180 s reddened
// exactly here — the guard asserted the old number against a workflow that had
// moved on, which is the drift it exists to catch pointing the wrong way. The
// selector owns the value; this file checks ci.yml agrees with the selector.
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";

const SELECTED_TIMEOUT_MS = SELECTED_GATE.perTestTimeoutSec * 1000;

const ciWorkflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const pagesWorkflow = fs.readFileSync(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");

// soft-present-bench.mjs archived 2026-09-10 → docs/archive/tools/gfx/
// (closed perf note; gfx-probe is the live soft-present path).

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

// The change-aware gate (2026-09-10): `select` plans, `selected` runs the plan
// as a matrix. The plan job is the trigger; the step script it delegates to
// carries the fail-closed strings.
const selectJob = ciWorkflow.split("\n  select:")[1]?.split("\n  selected:")[0];
const selectedJob = ciWorkflow.split("\n  selected:")[1];
const selectStep = fs.readFileSync(new URL("../../tools/ci/ci-select-specs-step.sh", import.meta.url), "utf8");

test("the change-aware gate blocks pushes, pull requests AND the deploy gate", () => {
  assert.ok(selectJob && selectedJob, "select / selected jobs missing");
  assert.deepEqual(report.selectionGate, {
    present: true,
    blocking: true,
    onPush: true,
    onPullRequest: true,
    onWorkflowCall: true,
    usesPullRequestBase: true,
    failsClosedOnInvalidBase: true,
    surfacesBudgetSkips: true,
  });
  // It used to skip itself on the Pages call (`inputs.concurrency_key == ''`).
  // pages.yml now publishes exactly the commit it tested, which makes "did we
  // test what this commit changed?" a deploy question too — so the one clause
  // that excluded the deploy must stay gone.
  // The third clause is the Pages call: the train's caller event is `schedule`,
  // so an event test alone would skip the plan on every deploy.
  assert.match(selectJob, /if: \$\{\{ github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \|\| inputs\.concurrency_key != '' \}\}/);
  assert.doesNotMatch(selectJob, /inputs\.concurrency_key == ''/, "the plan must never exclude the deploy gate");
  assert.doesNotMatch(selectJob + selectedJob, /^    continue-on-error:/m);
  // The runner consumes the plan as a matrix and takes its cap per shard.
  assert.match(selectedJob, /needs: select/);
  assert.match(selectedJob, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.shards\) \}\}/);
  assert.match(selectedJob, /timeout-minutes: \$\{\{ matrix\.timeout \}\}/);
  assert.match(selectedJob, /if: \$\{\{ needs\.select\.outputs\.any == 'true' \}\}/,
    "a plan with nothing to run must skip the runner, not fail it");
});

test("selection resolves the event-specific base and fails closed when it cannot", () => {
  // A direct push still resolves against the push's before; a Pages call
  // substitutes the train's live commit (asserted in the Pages-call test).
  assert.match(selectJob, /PUSH_BEFORE: \$\{\{ inputs\.concurrency_key != '' && inputs\.before_sha \|\| github\.event\.before \}\}/);
  assert.match(selectJob, /PR_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  // Base resolution is delegated to ci-select-specs-step.sh -> ci-resolve-before.sh (HEAD~1 fallback).
  assert.match(selectJob, /ci-select-specs-step\.sh/);
  assert.match(selectStep, /ci-resolve-before\.sh/);
  assert.match(selectStep, /no valid comparison base/);
  assert.match(selectStep, /comparison base .* is unreachable/);
  assert.match(selectStep, /r\.reason === "unmatched"/);
  assert.doesNotMatch(selectStep, /skip\(\).*exit 0/);
  // The plan is what the runner reads: a JSON matrix plus a run/skip flag.
  assert.match(selectStep, /shards=\$\{JSON\.stringify\(shards\)\}/);
  assert.match(selectStep, /any=\$\{shards\.length \? "true" : "false"\}/);
});

test("no workflow demotes the change-aware gate to advisory", () => {
  assert.doesNotMatch(pagesWorkflow, /^\s+advisory:/m);
  assert.doesNotMatch(ciWorkflow, /^\s+advisory:/m);
});

test("one CI run per branch head: push and pull_request share a group, manual runs keep their own", () => {
  // A push to a branch with an open PR used to start TWO full runs (push on
  // refs/heads/<b>, pull_request on refs/pull/N/merge) that never cancelled
  // each other — 58.5 + 47.4 job-minutes for one commit, measured 2026-09-10.
  // Keying on the branch NAME for both events collapses the pair; the PR run
  // (seconds later, on the merge commit) cancels the push run.
  //
  // BOTH manual events keep their own group. `schedule` used to fall through
  // to github.ref, which put the nightly in the same group as every push to
  // the deploy branch — and GitHub keeps only ONE pending run per group, so
  // the next push silently discarded the queued nightly (run 2758).
  // A push to the DEPLOY branch is the fast tier and gets its own group too:
  // sessions push there minutes apart, and a cancelled fast run would hand a
  // session `cancelled` for someone else's commit.
  assert.match(ciWorkflow, /group: ci-\$\{\{ inputs\.concurrency_key \|\| \(\(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule' \|\| \(github\.event_name == 'push' && github\.ref_name == 'claude\/f1-game-project-26h3ng'\)\) && github\.run_id\) \|\| github\.event\.pull_request\.head\.ref \|\| github\.ref_name \}\}/,
    "push and PR runs of one branch must share a group; dispatched/scheduled runs and deploy-branch pushes must not");
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'push' \}\}/,
    "newest wins on both events");
  // The deploy gate is unaffected: its caller supplies a unique key. The train
  // rule lives on pages.yml's own ci job: one gate at a time, never cancelled
  // (a tick waits, a later tick replaces the waiting one), so lag is bounded
  // and no gate is ever killed a spec from green.
  assert.match(pagesWorkflow, /concurrency_key: pages-\$\{\{ github\.run_id \}\}/);
  const pagesCi = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  assert.match(pagesCi, /group: pages-gate-\$\{\{ github\.ref \}\}/);
  assert.match(pagesCi, /cancel-in-progress: false/,
    "the train never cancels a running gate; the next tick queues behind it");
});

test("a Pages run publishes EXACTLY the commit it tested, and never moves the site backwards", () => {
  // THE CONTRACT (2026-09-10). The previous design gated GITHUB_SHA and then
  // published the branch TIP from any green ancestor run, which let a commit
  // ship while its own gate was unfinished or failing (justified by "every push
  // goes through deploy.mjs" — PRs merged through GitHub do not). Now: test one
  // commit, stage it, publish that artifact. Starvation is handled by
  // newest-wins cancellation on the gate (asserted in the concurrency test),
  // and the hazard the old tip check guarded — moving the site backwards — by
  // an ancestry check against the LIVE shell's apex-sha, before the environment
  // and again under the Pages lock.
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  const deploy = pagesWorkflow.split("\n  deploy:")[1];
  assert.doesNotMatch(preflight, /^\s+environment:/m,
    "the cheap publishability check must not create a github-pages deployment record");
  assert.match(preflight, /deploy: \$\{\{ steps\.pub\.outputs\.publish \}\}/);
  assert.match(preflight, /fetch-depth: 0/,
    "merge-base needs history — a shallow checkout makes every ancestor test a false negative");
  assert.match(preflight, /tools\/ci\/pages-publishable\.sh "\$GITHUB_SHA"/,
    "the pre-environment check asks the one question that matters: may THIS commit still be published?");

  assert.match(deploy, /needs: publishable/);
  assert.match(deploy, /if: needs\.publishable\.outputs\.deploy == 'true'/,
    "a run that cannot publish must skip the environment job entirely");
  assert.match(deploy, /environment:\s*\n\s+name: github-pages/);
  assert.match(deploy, /tools\/ci\/pages-publishable\.sh "\$GITHUB_SHA"[\s\S]*?REFUSING DEPLOY:[\s\S]*?exit 1/,
    "the in-lock recheck must fail the run, never become a successful no-op deployment");
  // No branch-tip substitution anywhere in the deploy job.
  assert.doesNotMatch(deploy, /git checkout --detach/);
  assert.doesNotMatch(deploy, /TIP=\$\(git rev-parse/);
  assert.doesNotMatch(deploy, /refs\/remotes\/origin/);

  // Order: confirm publishable under the lock, then stage, then publish.
  // Anchor on the STEP DECLARATIONS, not bare phrases (a comment names "Stage
  // site" in prose, and a loose indexOf once reported the steps out of order).
  const recheck = deploy.indexOf("- name: Confirm this commit may still be published (under the Pages lock)");
  const stage = deploy.indexOf("- name: Stage site");
  const publish = deploy.indexOf("uses: actions/deploy-pages@v4");
  assert.ok(recheck >= 0 && stage > recheck, "the in-lock check must precede staging");
  assert.ok(publish > stage, "staging must precede publication");

  // apex-sha is the provenance record AND the input to the next run's
  // monotonic check, so it must name the commit actually published: GITHUB_SHA.
  assert.match(deploy, /PUBLISH_SHA="\$GITHUB_SHA"/);
  assert.match(deploy, /name=\\"apex-sha\\" content=\\"\$PUBLISH_SHA\\"/,
    "apex-sha must name the commit actually published");
  assert.doesNotMatch(deploy, /echo "deploy=false"/,
    "once the environment job starts, unpublishable must fail rather than report success");
});

test("pages-publishable.sh: forward-only, and a CDN hiccup cannot wedge deploys", () => {
  // Drive the script against a throwaway repo (A -> B -> C) and a fake `curl`
  // on PATH that serves whatever apex-sha the case names. The verdict is the
  // ONLY thing on stdout, by design: the workflow writes it straight into
  // $GITHUB_OUTPUT.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-pub-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  const shas = [];
  for (const n of ["A", "B", "C"]) {
    fs.writeFileSync(path.join(dir, "f.txt"), n);
    git("add", "f.txt"); git("commit", "-q", "-m", n); shas.push(git("rev-parse", "HEAD"));
  }
  const [A, B, C] = shas;
  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"),
    '#!/usr/bin/env bash\ncase "${FAKE_LIVE_SHA:-}" in\n  fail) exit 22 ;;\n  "") echo "<html></html>" ;;\n  *) echo "<meta name=\\"apex-build\\" content=\\"1\\">\n<meta name=\\"apex-sha\\" content=\\"${FAKE_LIVE_SHA}\\">" ;;\nesac\n');
  fs.chmodSync(path.join(bin, "curl"), 0o755);
  const script = new URL("../../tools/ci/pages-publishable.sh", import.meta.url).pathname;
  const verdict = (sha, live) => cp.execFileSync("bash", [script, sha, "https://example.test/site/"], {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LIVE_SHA: live },
  }).trim();
  assert.equal(verdict(C, B), "true", "live is an ancestor: publishing moves the site forward");
  assert.equal(verdict(B, B), "false", "already live");
  assert.equal(verdict(A, B), "false", "a NEWER build is live: publishing would move the site backwards");
  assert.equal(verdict(C, "0123456789abcdef0123456789abcdef01234567"), "false", "an unrelated live sha means diverged history: refuse");
  assert.equal(verdict(C, "fail"), "true", "the live site unreadable: publish (warned), the lock recheck runs again");
  assert.equal(verdict(C, ""), "true", "no apex-sha in the live shell yet: publish");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a Pages run reuses a gate that already passed on the SAME tree, and only then", () => {
  // Rule 3 (2026-09-10). A GitHub merge is a new commit, so every PR merge
  // re-ran the ~15-minute gate on files a PR run had just tested. The verdict
  // job compares TREE hashes and skips the ci call when a tree-identical
  // parent has a completed successful run; publishable then has to accept a
  // skipped gate in exactly that one case and no other.
  const verdict = pagesWorkflow.split("\n  verdict:")[1].split("\n  ci:")[0];
  const ciJob = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  assert.ok(pagesWorkflow.indexOf("\n  verdict:") < pagesWorkflow.indexOf("\n  ci:"), "verdict is declared before the gate it can skip");
  assert.match(verdict, /actions: read/, "listing workflow runs needs actions:read on the job token");
  assert.doesNotMatch(verdict, /^\s+environment:/m, "the verdict must not create a deployment record");
  assert.doesNotMatch(verdict, /^\s+concurrency:/m, "the verdict must never be cancelled by newest-wins");
  assert.match(verdict, /fetch-depth: 0/, "the parents' trees are the question; a shallow clone has no parents");
  assert.match(verdict, /tools\/ci\/pages-reuse-verdict\.sh "\$GITHUB_SHA" >> "\$GITHUB_OUTPUT"/);
  assert.match(ciJob, /needs: verdict/);
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'/, "the gate runs unless nothing is new or the verdict found the same tree already gated");
  assert.match(preflight, /needs: \[verdict, ci\]/);
  assert.match(preflight, /needs\.ci\.result == 'success' \|\| \(needs\.ci\.result == 'skipped' && needs\.verdict\.outputs\.reuse == 'true'\)/,
    "a skipped gate is acceptable only when the verdict reused an earlier pass; failed or cancelled must still stop the run");
  assert.match(preflight, /!cancelled\(\)/, "a skipped `needs` job skips its dependents unless the condition opts in");
});

test("pages-reuse-verdict.sh: same tree + a successful gate run, nothing else", () => {
  // A throwaway repo: A -> C on the deploy line; B branches from A; D is B with
  // C merged in. M1 = merge(C, B) has a tree neither parent has (both sides
  // changed). M2 = merge(C, D) has D's tree exactly. A fake `gh` on PATH serves
  // whatever runs FAKE_RUNS names for the head_sha in the URL.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-reuse-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  git("init", "-q", "-b", "deploy"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  write("f.txt", "A"); write("g.txt", "A"); git("add", "."); git("commit", "-q", "-m", "A"); const A = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "feature");
  write("f.txt", "B"); git("commit", "-q", "-am", "B"); const B = git("rev-parse", "HEAD");
  git("checkout", "-q", "deploy");
  write("g.txt", "C"); git("commit", "-q", "-am", "C"); const C = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "m1", "deploy"); git("merge", "-q", "--no-ff", "-m", "M1", "feature"); const M1 = git("rev-parse", "HEAD");
  git("checkout", "-q", "feature"); git("merge", "-q", "--no-ff", "-m", "D", "deploy"); const D = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "m2", "deploy"); git("merge", "-q", "--no-ff", "-m", "M2", "feature"); const M2 = git("rev-parse", "HEAD");
  assert.equal(git("rev-parse", `${M2}^{tree}`), git("rev-parse", `${D}^{tree}`), "fixture: M2 must share D's tree");
  assert.notEqual(git("rev-parse", `${M1}^{tree}`), git("rev-parse", `${B}^{tree}`), "fixture: M1 must not share B's tree");
  void A;

  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"),
    '#!/usr/bin/env bash\n[ "${FAKE_GH:-}" = fail ] && exit 1\nurl="$2"; sha="${url#*head_sha=}"; sha="${sha%%&*}"\n' +
    'node -e \'const m=JSON.parse(process.env.FAKE_RUNS||"{}");console.log(JSON.stringify({workflow_runs:m[process.argv[1]]||[]}))\' "$sha"\n');
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  const script = new URL("../../tools/ci/pages-reuse-verdict.sh", import.meta.url).pathname;
  const run = (over) => ({ id: 7, status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", event: "pull_request", html_url: "https://example.test/run/7", ...over });
  const verdict = (sha, runs, env = {}) => Object.fromEntries(cp.execFileSync("bash", [script, sha], {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", FAKE_RUNS: JSON.stringify(runs), ...env },
  }).trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));

  assert.deepEqual(verdict(M2, { [D]: [run()] }), { reuse: "true", source: D, run: "https://example.test/run/7" },
    "merge with a parent's exact tree + that parent's green PR run: reuse");
  assert.equal(verdict(M2, { [D]: [run({ event: "push" })] }).reuse, "true", "a branch push run counts too");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/pages.yml", event: "push" })] }).reuse, "true", "an earlier deploy of the same tree counts");
  assert.equal(verdict(M2, { [D]: [run({ conclusion: "failure" })] }).reuse, "false", "a failed run is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ conclusion: "cancelled" })] }).reuse, "false", "a cancelled run is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/gpu-census.yml", event: "workflow_dispatch" })] }).reuse, "false", "another workflow's green is not this gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 99 })] }, { GITHUB_RUN_ID: "99" }).reuse, "false", "a run never reuses itself");
  assert.equal(verdict(M1, { [B]: [run()], [C]: [run({ path: ".github/workflows/pages.yml", event: "push" })] }).reuse, "false",
    "both parents green but the merge tree is new: the gate runs");
  assert.deepEqual(verdict(B, { [B]: [run({ event: "push" })] }), { reuse: "true", source: B, run: "https://example.test/run/7" },
    "a fast-forwarded commit with its own green push run: reuse");
  assert.equal(verdict(M2, { [D]: [run()] }, { FAKE_GH: "fail" }).reuse, "false", "an API failure runs the gate rather than guessing");
  assert.equal(verdict(M2, {}).reuse, "false", "no run on record: the gate runs");
  fs.rmSync(dir, { recursive: true, force: true });
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
  assert.ok(SMOKE_TIMEOUT_MS >= SELECTED_TIMEOUT_MS,
    `smoke's per-test cap is ${SMOKE_TIMEOUT_MS} ms, below the selected gate's ` +
    `${SELECTED_GATE.perTestTimeoutSec} s`);
  assert.doesNotMatch(smokeSpec, /^\s*test\.slow\s*\(/m,
    `test.slow triples the workflow's ${SMOKE_TIMEOUT_MS / 1000} s per-test timeout`);
});

test("the selected gate cannot rerun the fixed-budget smoke spec", () => {
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  assert.match(smoke, new RegExp("test:smoke -- --timeout=" + SMOKE_TIMEOUT_MS));
  assert.match(smoke, /tests\/specs\/smoke\.spec\.js/,
    "test-only smoke edits must force the fixed shards even though they do not ship");
  assert.match(selectedJob, new RegExp(`--timeout=${SELECTED_TIMEOUT_MS}`),
    `ci.yml's selected step must run the timeout select-specs.mjs models ` +
    `(${SELECTED_GATE.perTestTimeoutSec} s)`);
  assert.doesNotMatch(selectedJob, new RegExp(`npm test -- .*smoke\\.spec\\.js.*--timeout=${SELECTED_TIMEOUT_MS}`));
  assert.match(selectStep, /COVERED BY FIXED BLOCKING GATE/,
    "the selection report must make its delegated coverage visible");
});

// THE RENDERER JOB (2026-09-01): the gfx group on macos-latest, the one runner
// image with a hardware (Metal) adapter. Three things about it are load-bearing
// and none of them is enforced by YAML: it must run on the macOS image, it must
// never carry the one flag that turns that image's GPU into SwiftShader, and it
// must stay OUT of the deploy gate until it has a measured history (pages.yml
// consumes the aggregate of every job in ci.yml, so "out" means "skipped on the
// Pages call", which the tool derives from the `!inputs.concurrency_key` if).
const gpuWorkflow = fs.readFileSync(new URL("../../.github/workflows/gpu-census.yml", import.meta.url), "utf8");
const rendererJob = ciWorkflow.split("\n  renderer-macos:")[1]?.split("\n  select:")[0];
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
  // Plan job resolves inputs → outputs; census gates on those (agents also
  // trigger via push of .github/gpu-census-request.json — same outputs).
  assert.match(gpuWorkflow, /if: \$\{\{ needs\.plan\.outputs\.census_only != 'true' \}\}/);
  assert.match(gpuWorkflow, /if: \$\{\{ always\(\) && needs\.plan\.outputs\.census_only != 'true' \}\}/,
    "the Verdict must still gate a scheduled run");
  assert.match(gpuWorkflow, /INPUT_IMAGES: \$\{\{ inputs\.images \|\| 'ubuntu-latest,macos-latest,windows-latest' \}\}/);
  assert.match(gpuWorkflow, /inputs\.images \|\| '[^']*macos-latest[^']*'/, "the nightly must include the one image with a real GPU");
  const trackUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"/g) || [];
  assert.equal(trackUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must use the plan-resolved track");
  assert.match(gpuWorkflow, /paths: \["\.github\/gpu-census-request\.json"\]/,
    "agents without workflow_dispatch may push a request file on cursor/*");
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
  // The deploy branch is NOT ignored any more: a push there gets the FAST tier
  // (pages.yml is a train and no longer runs on push), so the push must reach
  // this workflow, and the two heavy browser jobs must opt out of that tier by
  // the one shared expression.
  assert.doesNotMatch(pushBlock, /branches-ignore/, "deploy-branch pushes must reach ci.yml for the fast tier");
  const fastTier = "!(github.event_name == 'push' && github.ref_name == 'claude/f1-game-project-26h3ng' && inputs.concurrency_key == '')";
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  sweeps:\n"), ciWorkflow.indexOf("\n  smoke:\n"));
  for (const [name, job] of [["smoke", smokeJob], ["sweeps", sweepsJob]]) {
    assert.ok(job.includes(`    if: \${{ ${fastTier} }}`), `${name} must sit out the deploy branch's fast tier with the shared expression`);
  }
  for (const name of ["guards", "node-suites", "sweeps-parts", "driving-model", "select"]) {
    const job = ciWorkflow.slice(ciWorkflow.indexOf(`\n  ${name}:\n`));
    const head = job.slice(0, job.indexOf("\n    steps:"));
    assert.ok(!head.includes(fastTier), `${name} is part of the fast tier and must not opt out`);
  }
});

test("pages.yml is a release train: schedule + dispatch, one deploy branch, nothing-new short-circuit", () => {
  // THE TRAIN (2026-09-10). A deploy per push at 140-300 pushes a day meant a
  // 14-job gate per commit and gates cancelling each other in bursts. The
  // train ticks three times an hour off the hour, refuses any other branch,
  // stops in one slot when the live site already serves the tip, and hands
  // the gate the live commit as its diff base.
  const onBlock = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  assert.doesNotMatch(onBlock, /^\s+push:/m, "the train must not run on push");
  assert.match(onBlock, /schedule:\s*\n\s+- cron: "7,27,47 \* \* \* \*"/, "three ticks an hour, off the hour");
  assert.match(onBlock, /workflow_dispatch:/, "a dispatch is 'deploy now'");
  assert.match(onBlock, /^\s+DEPLOY_BRANCH: claude\/f1-game-project-26h3ng\s*$/m, "the one declaration of the deploy branch");

  const verdict = pagesWorkflow.split("\n  verdict:")[1].split("\n  ci:")[0];
  assert.match(verdict, /"\$GITHUB_REF_NAME" != "\$DEPLOY_BRANCH"[\s\S]*?exit 1/, "a run off the deploy branch must fail before anything else");
  assert.match(verdict, /tools\/ci\/pages-live-sha\.sh "\$SITE_URL"/);
  assert.match(verdict, /nothing_new: \$\{\{ steps\.live\.outputs\.nothing_new \}\}/);
  assert.match(verdict, /since: \$\{\{ steps\.live\.outputs\.since \}\}/);
  assert.match(verdict, /git merge-base --is-ancestor "\$LIVE" "\$GITHUB_SHA"/, "the live commit is the diff base only when it is an ancestor");
  // The refusal to run off-branch must come BEFORE the network and the reuse lookup.
  assert.ok(verdict.indexOf("Refuse to run off the deploy branch") < verdict.indexOf("What is live"));

  const ciJob = pagesWorkflow.split("\n  ci:")[1].split("\n  publishable:")[0];
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'/);
  assert.match(ciJob, /before_sha: \$\{\{ needs\.verdict\.outputs\.since \}\}/, "the gate diffs against what is live, never against a push's before");
  assert.doesNotMatch(pagesWorkflow, /github\.event\.before/, "there is no push event to read a before from");
  const preflight = pagesWorkflow.split("\n  publishable:")[1].split("\n  deploy:")[0];
  assert.match(preflight, /needs\.verdict\.outputs\.nothing_new != 'true'/, "nothing new must never reach the environment");
});

test("ci.yml treats a Pages call as the gate it is, whatever the caller's event", () => {
  // A called workflow sees the CALLER's event: `schedule` for a train tick,
  // `workflow_dispatch` for "deploy now". Before the train, every filter keyed
  // on `push` and every wide-run switch keyed on schedule/dispatch — so the
  // train would have fail-safed into full sweeps AND run the 120-minute boot
  // group instead of smoke. concurrency_key is the one signal a Pages call
  // always carries, and it must decide all four places.
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  sweeps:\n"), ciWorkflow.indexOf("\n  smoke:\n"));
  assert.match(smokeJob, /timeout-minutes: \$\{\{ \(inputs\.concurrency_key == '' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\)\) && 120 \|\| 50 \}\}/,
    "a Pages call takes the smoke cap, never the wide run's 120");
  assert.match(smokeJob, /- name: Smoke\n(?:\s+#.*\n)*\s+if: steps\.shipfilter\.outputs\.ships != 'false' && \(inputs\.concurrency_key != '' \|\| \(github\.event_name != 'schedule' && github\.event_name != 'workflow_dispatch'\)\)/,
    "a Pages call always runs smoke.spec.js");
  assert.match(smokeJob, /- name: Boot group \(nightly\) \/ dispatched group\n\s+if: steps\.shipfilter\.outputs\.ships != 'false' && inputs\.concurrency_key == '' && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)/,
    "a Pages call never runs the wide group");
  for (const [name, job] of [["smoke ship filter", smokeJob], ["sweeps filter", sweepsJob]]) {
    assert.match(job, /CALLED: \$\{\{ inputs\.concurrency_key != '' \}\}/, `${name} must know it is a Pages call`);
    assert.match(job, /\*\) \[ "\$CALLED" = "true" \] \|\| run_all "event is '\$EVENT', not a push or a Pages call" ;;/,
      `${name} must accept a Pages call and still fail safe on every other non-push event`);
  }
  assert.match(selectJob, /EVENT: \$\{\{ inputs\.concurrency_key != '' && 'push' \|\| github\.event_name \}\}/);
  assert.match(selectJob, /PUSH_BEFORE: \$\{\{ inputs\.concurrency_key != '' && inputs\.before_sha \|\| github\.event\.before \}\}/,
    "on a Pages call the plan's base is the train's live commit");
});

test("pages-live-sha.sh: the live apex-sha or nothing, and never a failure", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-live-"));
  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"),
    '#!/usr/bin/env bash\ncase "${FAKE_LIVE_SHA:-}" in\n  fail) exit 22 ;;\n  "") echo "<html></html>" ;;\n  *) echo "<meta name=\\"apex-build\\" content=\\"1\\">\n<meta name=\\"apex-sha\\" content=\\"${FAKE_LIVE_SHA}\\">" ;;\nesac\n');
  fs.chmodSync(path.join(bin, "curl"), 0o755);
  const script = new URL("../../tools/ci/pages-live-sha.sh", import.meta.url).pathname;
  const live = (fake) => cp.spawnSync("bash", [script, "https://example.test/site/"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LIVE_SHA: fake },
  });
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(live(sha).stdout.trim(), sha);
  assert.equal(live(sha).status, 0);
  assert.equal(live("").stdout.trim(), "", "no apex-sha in the shell: nothing");
  assert.equal(live("fail").stdout.trim(), "", "site unreadable: nothing");
  assert.equal(live("fail").status, 0, "unreadable must not fail the verdict job; the caller treats empty as unknown");
  fs.rmSync(dir, { recursive: true, force: true });
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
