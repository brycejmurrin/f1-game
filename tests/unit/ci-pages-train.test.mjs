// ci-pages-train — concurrency, the Pages release train (publishable/reuse/token/staging), apt use and the ship-filter deployment pick.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import { parse as parseYAML } from "yaml";
import { report } from "../../tools/ci/ci-coverage.mjs";
import { ciWorkflow, pagesWorkflow, selectedJob, shipFilter } from "../helpers/ci-workflow.mjs";

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
  // A push to the DEPLOY branch is the fast tier and joins ONE shared
  // `ship-fast` group with NO cancel (2026-10-03): the running fast tier
  // always finishes (shared `ship-push` + cancel used to kill it mid-way),
  // and GitHub keeps only the newest waiting push, so a merge burst costs one
  // fast tier at a time — keying on github.sha ran one per merge and clogged
  // the queue (docs/notes/CI-MERGE-BURST-2026-10-03.md). Dispatch and schedule still get a
  // unique run_id group (the nightly must not share the tip's group —
  // run 2758). The train is not in this group: pages.yml passes a unique
  // concurrency_key. PR branches keep newest-wins cancel on pull_request.
  assert.match(ciWorkflow, /group: ci-\$\{\{ inputs\.concurrency_key \|\| \(\(github\.event_name == 'pull_request' && github\.event\.action == 'labeled' && \(github\.event\.label\.name != 'run-ci' \|\| !github\.event\.pull_request\.draft\)\) && format\('label-\{0\}', github\.run_id\)\) \|\| \(\(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\) && github\.run_id\) \|\| github\.event\.pull_request\.head\.ref \|\| github\.ref_name \}\}/,
    "PR runs of one branch share a group; dispatched/scheduled runs keep run_id (no ship-fast since 2026-10-16: pages.yml runs on push)");
  assert.match(ciWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    "newest wins on PR only; ship pushes must not cancel each other");
  assert.doesNotMatch(ciWorkflow, /'ship-fast'/, "the deploy-branch fast tier and its group are gone (2026-10-16)");
  assert.doesNotMatch(ciWorkflow, /'ship-push'/,
    "shared ship-push group is retired — it cancelled earlier merges mid-run");
  // The deploy gate is unaffected: its caller supplies a unique key. The train
  // rule lives on pages.yml's own ci job: one gate at a time, never cancelled
  // (a tick waits, a later tick replaces the waiting one), so lag is bounded
  // and no gate is ever killed a spec from green.
  assert.match(pagesWorkflow, /concurrency_key: pages-\$\{\{ github\.run_id \}\}/);
  // The dedupe SAVES ~47 job-minutes and COSTS one `cancelled` row per push,
  // which is the exact shape AGENTS.md rule 8 teaches a session to read as a
  // starved-runner timeout. It cost a real triage on 2026-09-22 (run 4657
  // cancelled by 4658 on one SHA), so both triage surfaces must name the
  // signature — same head_sha, cancelled seconds in, sibling still running.
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /`ready_for_review` run share a group[\s\S]{0,200}head_sha/,
    "AGENTS.md rule 8 must except the designed draft/ready dedupe, or the next session triages it as a timeout");
  const triage = fs.readFileSync(path.join(repo, ".claude/agents/ci-red-triage.md"), "utf8");
  assert.match(triage, /draft\/ready dedupe/, "ci-red-triage must tell the dedupe from a superseded push");
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
  // `!cancelled()` plus an explicit result check: a job's implicit success()
  // looks at every job upstream TRANSITIVELY, so with the gate skipped (nothing
  // new / reused pass) deploy was skipped even though publishable said yes
  // (run 2237). The result check keeps a failed or skipped publishable fatal.
  assert.match(deploy, /if: \$\{\{ !cancelled\(\) && needs\.publishable\.result == 'success' && needs\.publishable\.outputs\.deploy == 'true' \}\}/,
    "a run that cannot publish must skip the environment job entirely; a reused gate must not");
  const verifyLive = pagesWorkflow.split("\n  verify-live:")[1];
  assert.match(verifyLive, /if: \$\{\{ !cancelled\(\) && needs\.deploy\.result == 'success' \}\}/,
    "verify-live must run exactly when deploy succeeded, whatever was skipped upstream");
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
  // Pinned to a commit sha since 2026-09-22 (`@<sha> # v4.x.y`), so match the
  // action name, not the moving tag.
  const publish = deploy.search(/uses: actions\/deploy-pages@/);
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
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'$/m, "the gate runs unless nothing is new or an earlier gate on this tree is reused");
  assert.doesNotMatch(pagesWorkflow, /ship_only|smoke_only/, "the smoke-only ship path is gone (always false since 2026-10-07)");
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

  // A side branch can change a gate input and then revert it before a
  // tree-identical merge. The final tree still matches D, but D's earlier
  // green run did not exercise that changed history and must not be reused.
  git("checkout", "-q", "-b", "sensitive", D);
  const gateInput = ["tools", "ci", "selection.mjs"].join("/");
  fs.mkdirSync(path.dirname(path.join(dir, gateInput)), { recursive: true });
  write(gateInput, "changed"); git("add", "."); git("commit", "-q", "-m", "change gate input");
  fs.rmSync(path.join(dir, gateInput)); git("add", "-u"); git("commit", "-q", "-m", "revert gate input");
  const S = git("rev-parse", "HEAD");
  git("checkout", "-q", "-b", "m3", D); git("merge", "-q", "--no-ff", "-m", "M3", "sensitive"); const M3 = git("rev-parse", "HEAD");
  assert.equal(git("rev-parse", `${M3}^{tree}`), git("rev-parse", `${D}^{tree}`), "fixture: M3 must share D's tree after a reverted gate-input change");
  void A;

  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"),
    '#!/usr/bin/env bash\n[ "${FAKE_GH:-}" = fail ] && exit 1\nurl="$2"\n' +
    'case "$url" in */jobs*) id="${url%/jobs*}"; id="${id##*/}"; node -e \'const m=JSON.parse(process.env.FAKE_JOBS||"{}");console.log(JSON.stringify({jobs:m[process.argv[1]]||[]}))\' "$id"; exit 0;; esac\n' +
    'sha="${url#*head_sha=}"; sha="${sha%%&*}"\n' +
    'node -e \'const m=JSON.parse(process.env.FAKE_RUNS||"{}");console.log(JSON.stringify({workflow_runs:(m[process.argv[1]]||[]).map((r)=>({head_sha:process.argv[1],...r}))}))\' "$sha"\n');
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  const script = new URL("../../tools/ci/pages-reuse-verdict.sh", import.meta.url).pathname;
  // A READY PR's run / a full Pages gate: CI, sweeps, selected verdict and
  // smoke all ran and passed (a draft's sweeps and smoke are skipped).
  // The tree-only rows (guards halves + aggregator, unit plan, node suites,
  // driving model) are what a fast tier must show before it is fast_run.
  const gateJobs = (prefix = "", over = {}) => [
    ["CI", "success"], ["Per-circuit geometry sweeps", "success"], ["Selected specs (verdict)", "success"],
    ["Smoke (page boots, __apex responds) (1)", "success"], ["Structural guards", "success"],
    ["Structural guards (tooling A)", "success"], ["Structural guards (tooling B)", "success"],
    ["Pure-node unit suites (vm-a1)", "success"], ["Pure-node unit suites (page-a)", "success"], ["Pure-node unit suites (page-b)", "success"], ["Driving model (characterization traces)", "skipped"],
  ].map(([name, conclusion]) => ({ name: prefix + name, status: "completed", conclusion: name in over ? over[name] : conclusion }));
  const fullJobs = {
    7: gateJobs(),
    // Pages run 3112 (37689226760): smoke-only, sweeps/selection/guards skipped.
    9: gateJobs("ci / ", { "Per-circuit geometry sweeps": "skipped", "Selected specs (verdict)": "skipped", "Structural guards": "skipped" }),
    // A Pages run that itself reused an earlier pass: no ci jobs at all.
    10: [{ name: "Anything new, and was this exact tree already gated?", conclusion: "success" }, { name: "publishable", conclusion: "success" }, { name: "deploy", conclusion: "success" }],
    // A real Pages gate (jobs prefixed by the reusable-workflow call).
    11: gateJobs("ci / "),
    12: gateJobs("ci / ", { "Smoke (page boots, __apex responds) (1)": "cancelled" }),
    13: gateJobs("", { "Selected specs (verdict)": "skipped" }),
    // T1 (2026-10-14): the run that POKED this train, still in progress — its
    // tree-only jobs are done and green, CI has not run yet.
    20: gateJobs("", { CI: null, "Per-circuit geometry sweeps": "skipped", "Smoke (page boots, __apex responds) (1)": "skipped" })
      .map((j) => (j.name === "CI" ? { ...j, status: "queued" } : j)),
    // A fast tier still running its node suites: not reusable yet.
    21: gateJobs("", { "Pure-node unit suites (page-a)": null, "Pure-node unit suites (page-b)": null }).map((j) => (j.conclusion === null ? { ...j, status: "in_progress" } : j)),
    // A fast tier whose aggregator has not been created yet (its halves still run).
    22: gateJobs("").filter((j) => j.name !== "Structural guards"),
  };
  const run = (over) => ({ id: 7, status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", event: "pull_request", head_branch: "feature", html_url: "https://example.test/run/7", ...over });
  const verdict = (sha, runs, env = {}) => Object.fromEntries(cp.execFileSync("bash", [script, sha], {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", DEPLOY_BRANCH: "deploy", FAKE_RUNS: JSON.stringify(runs), FAKE_JOBS: JSON.stringify(fullJobs), ...env },
  }).trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));

  assert.deepEqual(verdict(M2, { [D]: [run()] }), { reuse: "true", source: D, run: "https://example.test/run/7" },
    "merge with a parent's exact tree + that parent's green PR run: reuse");
  assert.equal(verdict(M3, { [D]: [run()] }).reuse, "false",
    "a tree-identical merge after a workflow/selection change and revert must rerun the gate");
  assert.equal(verdict(M2, { [D]: [run({ event: "push" })] }).reuse, "true", "a branch push run counts too");
  // ci.yml has no merge_group trigger (2026-10-14), so such a run is not one of its gates.
  assert.equal(verdict(M2, { [D]: [run({ event: "merge_group" })] }).reuse, "false", "a merge_group run is not a ci.yml gate any more");
  // A DRAFT PR's run is the fast tier (sweeps and smoke skipped) and concludes
  // success all the same: never a gate, and a real gate after it still counts.
  assert.equal(verdict(M2, { [D]: [run({ id: 8 })] }).reuse, "false", "a draft PR run (sweeps skipped) is not a gate");
  assert.deepEqual(verdict(M2, { [D]: [run({ id: 8 }), run()] }), { reuse: "true", source: D, run: "https://example.test/run/7" },
    "…the ready run beside it is");
  // THE FAST TIER IS NOT A GATE. Run 2237 reused the merge commit's own
  // deploy-branch push run (guards + node suites only) as if it were the full
  // gate; the head_sha candidate is checked first, so this must be rejected
  // before the parent's real run is even looked at.
  assert.deepEqual(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" })], [D]: [run()] }),
    { reuse: "true", source: D, run: "https://example.test/run/7" },
    "a deploy-branch push run (fast tier) must be skipped in favour of the parent's full run");
  // Pages run 3112 (37689226760, 2026-10-07) published 61e0a6442 on its own
  // green ship fast tier as smoke-only, after dispatch 3110 (37687308660) had
  // FAILED the full gate on that tree. The fast tier is never a gate: the
  // full gate runs, reusing only the fast tier's tree-only jobs.
  assert.deepEqual(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" })] }),
    { reuse: "false", source: "", run: "" },
    "an exact-SHA ship fast tier alone runs the gate (no smoke-only shortcut)");
  assert.equal(verdict(M2, { [M2]: [run({ event: "push", head_branch: "deploy" }), run({ id: 99, path: ".github/workflows/pages.yml", event: "workflow_dispatch", conclusion: "failure" })] }).reuse, "false",
    "a failed Pages gate beside a green fast tier on the same sha: the gate runs again");
  // A successful run is not proof the gate RAN: the CI aggregator passes skipped jobs.
  assert.equal(verdict(M2, { [D]: [run({ id: 9, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a smoke-only Pages run (sweeps, selection skipped) concluded success but is not a gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 10, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a Pages run that skipped ci (it reused an earlier pass) is not a gate: no chaining");
  assert.equal(verdict(M2, { [D]: [run({ id: 11, path: ".github/workflows/pages.yml", event: "workflow_dispatch" })] }).reuse, "true",
    "a Pages run whose `ci / ` gate jobs all passed is a gate");
  assert.equal(verdict(M2, { [D]: [run({ id: 12, path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "false",
    "a cancelled smoke shard is not a pass");
  assert.equal(verdict(M2, { [D]: [run({ id: 13 })] }).reuse, "false", "a skipped selected verdict is not a pass");
  assert.equal(verdict(M2, { [D]: [run({ event: "push" })] }, { DEPLOY_BRANCH: "" }).reuse, "false",
    "without DEPLOY_BRANCH no push run can be told from the fast tier: fail safe into the gate");
  assert.equal(verdict(M2, { [D]: [run({ path: ".github/workflows/pages.yml", event: "schedule" })] }).reuse, "true", "a train tick that deployed the same tree counts");
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

test("pages.yml holds its Pages token on deploy only", () => {
  const pages = parseYAML(pagesWorkflow);
  // T6 least privilege: deploy-pages needs pages: write + id-token: write on
  // the deploying job (https://github.com/actions/deploy-pages); nothing else does.
  assert.deepEqual(pages.permissions, { contents: "read" }, "no Pages token at workflow level");
  assert.deepEqual(pages.jobs.deploy.permissions, { contents: "read", pages: "write", "id-token": "write" });
  for (const [id, job] of Object.entries(pages.jobs)) {
    if (id === "deploy") continue;
    assert.ok(job.permissions, `${id} must name its own permissions (it would inherit only contents: read, but say so)`);
    assert.equal(job.permissions.pages, undefined, `${id} holds no pages token`);
    assert.equal(job.permissions["id-token"], undefined, `${id} holds no OIDC token`);
  }
  // spec-timings: npm ci only when there is junit to merge.
  const timings = parseYAML(fs.readFileSync(new URL("../../.github/workflows/spec-timings.yml", import.meta.url), "utf8"));
  const tsteps = timings.jobs.merge.steps;
  const setup = tsteps.findIndex((st) => st.uses === "./.github/actions/setup-apex");
  assert.ok(setup > tsteps.findIndex((st) => st.id === "fetch"), "npm ci comes after the junit fetch");
  assert.equal(tsteps[setup].if, "steps.fetch.outputs.found == 'true'", "no junit (the normal case): no npm ci");
});

test("every ROOT html page is named in the Stage site whitelist", async () => {
  // Staging uses tools/desktop/stage-files.mjs (via stage.mjs). A directory is
  // swept up; a file at the ROOT is not, so a new root page deploys as a 404
  // with a green build. That is exactly what happened to bench.html on build
  // 7377: CI passed, the deploy succeeded, version.json moved, and the page
  // was not there.
  //
  // Derived from the tree, not pinned: add a root page and this fails until
  // stage-files.mjs names it. pages.yml must call the shared stage script.
  const roots = fs.readdirSync(new URL("../..", import.meta.url))
    .filter((f) => f.endsWith(".html") && !f.startsWith("."));
  const from = pagesWorkflow.indexOf("- name: Stage site");
  assert.ok(from >= 0, "the Stage site step is gone — this guard is pinned to a step that moved");
  const rest = pagesWorkflow.slice(from + 1);
  const nextStep = rest.indexOf("- name:");
  const stage = (nextStep >= 0 ? rest.slice(0, nextStep) : rest)
    .split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
  assert.match(stage, /tools\/desktop\/stage\.mjs/,
    "Stage site must call tools/desktop/stage.mjs (shared with Electron)");
  const { STAGE_ROOT_FILES } = await import("../../tools/desktop/stage-files.mjs");
  const missing = roots.filter((f) => !STAGE_ROOT_FILES.includes(f));
  assert.deepEqual(missing, [],
    `a root .html page is not staged by tools/desktop/stage-files.mjs, so it will ` +
    `404 on the live site while the build goes green: ${missing.join(", ")}. ` +
    `Add it to STAGE_ROOT_FILES.`);
});

test("cached browser jobs never enter apt through --with-deps", () => {
  // Since 2026-09-22 the cache-then-install contract lives ONCE, in the
  // composite action; each browser job takes it by `uses:`. The action is
  // pinned here exactly as the inline steps were, and every browser job must
  // go through it rather than carrying its own copy.
  const action = fs.readFileSync(new URL("../../.github/actions/playwright-chromium/action.yml", import.meta.url), "utf8");
  assert.match(action, /id: pwcache/, "the cache must expose cache-hit");
  assert.match(action,
    /if: steps\.pwcache\.outputs\.cache-hit != 'true'[\s\S]*?run: npx playwright install \$\{\{ inputs\.with-deps == 'true' && '--with-deps' \|\| '' \}\} chromium/,
    "apt (--with-deps) only on a cache miss, and only when the caller asks");
  assert.doesNotMatch(action, /if: .*cache-hit == 'true'[\s\S]{0,160}playwright install/, "the cache-hit path must stay network-free");
  assert.match(action, /key: pw-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('package-lock\.json'\) \}\}/,
    "keyed on the lock file so a Playwright bump misses the cache");
  const smoke = ciWorkflow.split("\n  smoke:")[1].split("\n  driving-model:")[0];
  const driving = ciWorkflow.split("\n  driving-model:")[1].split("\n  renderer-macos:")[0];
  const goldens = ciWorkflow.split("\n  baseline-trial:")[1].split("\n  ci-verdict:")[0];
  for (const [name, job] of [["smoke", smoke], ["driving-model", driving], ["selected", selectedJob], ["baseline-trial", goldens]]) {
    assert.match(job, /uses: \.\/\.github\/actions\/playwright-chromium/, `${name} must take Chromium from the composite action`);
    assert.doesNotMatch(job.replace(/^\s*#.*$/gm, ""), /playwright install/, `${name} carries its own install step — use the action`);
  }
  // smoke's copy stays behind the ship filter: a run that ships nothing installs nothing.
  assert.match(smoke, /if: needs\.select\.outputs\.ships != 'false'\n\s+uses: \.\/\.github\/actions\/playwright-chromium/);
});

test("ship filter chooses a successful active deployment, not merely the newest record", () => {
  // IT IS ITS OWN JOB SINCE 2026-09-22 — it used to be the smoke matrix's first
  // step, which meant four shards each did a full checkout and `npm ci` before
  // asking, and each then made up to 21 API round-trips for the same string.
  assert.match(shipFilter, /deployments\?environment=github-pages&per_page=20/);
  assert.match(shipFilter, /d\.statuses_url/);
  assert.match(shipFilter, /success\) LIVE="\$SHA"; break/);
  assert.match(shipFilter, /inactive\|failure\|error\|queued\|pending\|in_progress/);
  assert.match(shipFilter, /no successful active github-pages deployment found/);
  assert.doesNotMatch(shipFilter, /j\[0\].*\.sha.*process\.stdout\.write/);
});
