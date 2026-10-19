// ci-workflow-triggers — what starts CI (docs-only, desktop pack-smoke), base-verdict, inline node -e syntax, job caps, guard shards.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { parse as parseYAML } from "yaml";
import { selectedGateVerdict } from "../../tools/ci/selected-gate-verdict.mjs";
import { report } from "../../tools/ci/ci-coverage.mjs";
import { ciWorkflow, pagesWorkflow, selectJob, shipFilter, PR_ACTIVE } from "../helpers/ci-workflow.mjs";

test("docs-only pushes do not start CI (Actions minutes, 2026-09-02)", () => {
  // A commit that touches only docs / markdown / agent config ships nothing;
  // the guard suite that covers those trees runs locally on every edit. The
  // deploy branch is exempt by construction: it reaches this workflow through
  // pages.yml's `uses:` call, which no path filter touches.
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\npermissions:"));
  // NO push trigger since 2026-10-16 (CI/CD review #2333 finding 3): the deploy branch's
  // push starts pages.yml, which calls this workflow; the prose paths-ignore moved there.
  assert.doesNotMatch(onBlock, /^  push:/m, "ci.yml runs on pull_request, schedule, dispatch and workflow_call only");
  const pagesOn = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  const pushBlock = pagesOn.slice(pagesOn.indexOf("  push:"), pagesOn.indexOf("  schedule:"));
  const prBlock = onBlock.slice(onBlock.indexOf("  pull_request:"), onBlock.indexOf("  schedule:"));
  assert.match(pushBlock, /paths-ignore:\n(?:\s+- "[^"]+"\n)+/, "the train's push must carry a paths-ignore list");
  for (const p of ['"docs/**"', '"**/*.md"', '".claude/**"', '".cursor/**"']) assert.ok(pushBlock.includes(`- ${p}`), `${p} missing from paths-ignore`);
  // pull_request is NOT filtered (2026-09-30): every required check must report on every PR.
  assert.doesNotMatch(prBlock, /paths-ignore:/, "a path-filtered pull_request trigger leaves prose-only PRs unmergeable under branch protection");
  // The deploy branch's push must reach the train; the heavy browser jobs still
  // opt out of a draft PR's fast tier by the one shared expression.
  assert.doesNotMatch(pushBlock, /branches-ignore/, "deploy-branch pushes must reach pages.yml");
  // Draft synchronize is CI-free unless label run-ci (2026-10-15 fast-track); heavy
  // jobs still wait for `ready_for_review`, which must therefore be a trigger type.
  const fastTier = "!(inputs.concurrency_key == '' && ((github.event_name == 'push' && github.ref_name == 'claude/f1-game-project-26h3ng') || (github.event_name == 'pull_request' && github.event.pull_request.draft)))";
  assert.match(prBlock, /types: \[opened, synchronize, reopened, ready_for_review, labeled\]/,
    "labeled run-ci must be able to opt draft PRs into CI");
  assert.match(ciWorkflow, /draft-ci-skipped:/, "draft pushes without run-ci report a skip job");
  // Only the deploy branch's push starts a train; a topic branch runs through its PR.
  assert.match(pushBlock, /branches:\n\s+- claude\/f1-game-project-26h3ng\n/, "the train's push must be scoped to the deploy branch");
  const smokeJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  smoke:\n"), ciWorkflow.indexOf("\n  driving-model:\n"));
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  sweeps:\n"), ciWorkflow.indexOf("\n  sweeps-roll-up:\n"));
  assert.ok(smokeJob.includes(fastTier), "smoke must sit out the deploy branch's fast tier with the shared expression");
  assert.ok(shipFilter.includes(fastTier), "the ship filter step sits out the fast tier with the same expression");
  assert.ok(sweepsJob.includes(fastTier), "sweeps sit out the fast tier");
  assert.doesNotMatch(ciWorkflow, /smoke_only/, "the always-false smoke_only input and its guards are gone (2026-10-14)");
  // node-suites left the draft fast tier on 2026-10-16 (decision D1): it keeps
  // the shared draft/label predicate and adds its own draft skip (pinned above).
  for (const name of ["guards-a", "guards-b", "guards", "driving-model", "select"]) {
    const job = ciWorkflow.slice(ciWorkflow.indexOf(`\n  ${name}:\n`));
    const head = job.slice(0, job.indexOf("\n    steps:"));
    assert.ok(head.includes(PR_ACTIVE), `${name} must skip draft synchronize unless run-ci`);
    assert.ok(!head.includes(fastTier), `${name} is part of the fast tier and must not opt out of ship/draft heavy skip`);
  }
});

test("desktop pack-smoke is full-tier only (ready PRs, not drafts)", () => {
  const desktop = fs.readFileSync(new URL("../../.github/workflows/desktop.yml", import.meta.url), "utf8");
  assert.match(desktop, /types: \[opened, synchronize, reopened, ready_for_review\]/,
    "marking a draft ready must start pack-smoke when paths match");
  const pack = desktop.slice(desktop.indexOf("\n  pack-smoke:\n"), desktop.indexOf("\n  release-build:\n"));
  assert.match(pack, /github\.event\.pull_request\.draft == false/,
    "pack-smoke must skip draft PRs so Electron work stays on the full tier");
});

test("pages.yml is a release train: schedule + dispatch, one deploy branch, nothing-new short-circuit", () => {
  // THE TRAIN (2026-09-10). A deploy per push at 140-300 pushes a day (3-131 in 2026-10) meant a
  // 14-job gate per commit and gates cancelling each other in bursts. The
  // train ticks three times an hour off the hour, refuses any other branch,
  // stops in one slot when the live site already serves the tip, and hands
  // the gate the live commit as its diff base.
  const onBlock = pagesWorkflow.slice(pagesWorkflow.indexOf("\non:\n"), pagesWorkflow.indexOf("\npermissions:"));
  // 2026-10-16 (CI/CD review #2333 finding 3): the train runs ON push to the deploy branch,
  // with ci.yml's prose paths-ignore; one running + one pending run per the workflow group.
  assert.match(onBlock, /^\s+push:\n\s+branches:\n\s+- claude\/f1-game-project-26h3ng\n\s+paths-ignore:/m, "the train runs on push to the deploy branch");
  assert.match(onBlock, /paths-ignore:\n(\s+- "[^"]+"\n){5}/, "the same five prose globs ci.yml ignored");
  // Hourly since 2026-10-14: three ticks an hour were delivered ~4.5 times a
  // day, and the train now re-arms itself (`rearm`), so the cron is a backstop.
  assert.match(onBlock, /schedule:\s*\n\s+- cron: "41 \* \* \* \*"/, "one tick an hour, off the hour");
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
  assert.match(ciJob, /if: needs\.verdict\.outputs\.nothing_new != 'true' && needs\.verdict\.outputs\.reuse != 'true'$/m);
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
  const sweepsJob = ciWorkflow.slice(ciWorkflow.indexOf("      - name: Does this diff touch the geometry?"), ciWorkflow.indexOf("      # WHICH NODE SLICES DOES THIS DIFF NEED?"));
  assert.match(smokeJob, /timeout-minutes: \$\{\{ \(inputs\.concurrency_key == '' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'schedule'\)\) && 120 \|\| 20 \}\}/,
    "a Pages call takes the smoke cap, never the wide run's 120");
  assert.match(smokeJob, /- name: Smoke\n(?:\s+#.*\n)*\s+if: needs\.select\.outputs\.ships != 'false' && \(inputs\.concurrency_key != '' \|\| \(github\.event_name != 'schedule' && github\.event_name != 'workflow_dispatch'\)\)/,
    "a Pages call always runs smoke.spec.js");
  assert.match(smokeJob, /- name: Boot group \(nightly\) \/ dispatched group\n\s+if: needs\.select\.outputs\.ships != 'false' && inputs\.concurrency_key == '' && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)/,
    "a Pages call never runs the wide group");
  // The ship filter is its own job since 2026-09-22; read it there, not in smoke.
  for (const [name, job] of [["ship filter", shipFilter], ["sweeps filter", sweepsJob]]) {
    assert.match(job, /CALLED: \$\{\{ inputs\.concurrency_key != '' \}\}/, `${name} must know it is a Pages call`);
    // The Pages-call branch is what this test is about, and it is identical in
    // both filters: $CALLED is consulted BEFORE any verdict on the caller's
    // event, so a train tick is never mistaken for the nightly.
    assert.match(job, /\*\) \[ "\$CALLED" = "true" \] \|\| run_all "event is '\$EVENT', not a push/,
      `${name} must accept a Pages call and still fail safe on the events it cannot resolve`);
  }
  // Which events each filter can resolve is NOT identical, and the difference is
  // the point. The smoke filter asks "does this commit ship?"; since
  // 2026-10-14 a pull request answers it from its own base AND the live
  // deployment (see the ship-filter behaviour test). The sweeps filter asks
  // "could this diff have moved a vertex?", and a pull request answers that
  // perfectly well from its own base — it used to fail-safe anyway and ran the
  // whole fleet on every PR (2026-09-22).
  assert.match(sweepsJob, /case "\$EVENT" in\n\s+push\|pull_request\) ;;/,
    "the sweeps filter resolves a pull request instead of running the fleet blind");
  // Read from the ship-filter JOB, which is where that filter lives since
  // 2026-09-22 — smokeJob no longer contains it.
  assert.match(shipFilter, /case "\$EVENT" in\n\s+push\) ;;\n\s+pull_request\) \[ "\$CALLED" = "true" \] \|\| IS_PR=true ;;/,
    "the ship filter resolves a ready pull request instead of fail-safing it into smoke");
  assert.match(selectJob, /EVENT: \$\{\{ inputs\.concurrency_key != '' && 'push' \|\| github\.event_name \}\}/);
  assert.match(selectJob, /PUSH_BEFORE: \$\{\{ inputs\.concurrency_key != '' && inputs\.before_sha \|\| \(inputs\.concurrency_key == '' && github\.event\.before\) \|\| '' \}\}/,
    "on a Pages call the plan's base is the train's live commit");
});

test("base-verdict.sh: the newest deploy-branch run strictly below this head, named jobs and all", () => {
  // The base-red line (docs/plans/research-2026-09-16/ci.md §5). Three ways to
  // get it wrong, all of them silent: take the newest run on the branch
  // (a tip that was never merged says nothing about this tree), take THIS
  // commit's own run (that is the push, not its base), or report a conclusion
  // without the job names (which is the whole reason a session opens the run).
  // A -> B -> C on the deploy line; X branches from A and is never merged.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "base-verdict-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q", "-b", "deploy"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  const commit = (msg) => { fs.writeFileSync(path.join(dir, "f.txt"), msg); git("add", "."); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD"); };
  const A = commit("A"), B = commit("B"), C = commit("C");
  git("checkout", "-q", "-b", "feature", A); const X = commit("X"); git("checkout", "-q", "deploy");

  const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"),
    '#!/usr/bin/env bash\n[ "${FAKE_GH:-}" = fail ] && exit 1\n' +
    'case "$2" in\n' +
    '  */jobs*) node -e \'console.log(JSON.stringify({jobs:JSON.parse(process.env.FAKE_JOBS||"[]")}))\' ;;\n' +
    '  *) node -e \'console.log(JSON.stringify({workflow_runs:JSON.parse(process.env.FAKE_RUNS||"[]")}))\' ;;\n' +
    'esac\n');
  fs.chmodSync(path.join(bin, "gh"), 0o755);
  const script = new URL("../../tools/ci/base-verdict.sh", import.meta.url).pathname;
  const ci = (sha, over = {}) => ({ id: 11, status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", head_sha: sha, ...over });
  const verdict = (runs, jobs = [], env = {}) => {
    const summary = path.join(dir, `summary-${Math.random().toString(36).slice(2)}.md`);
    const r = cp.spawnSync("bash", [script, C], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", DEPLOY_BRANCH: "deploy",
        GITHUB_STEP_SUMMARY: summary, FAKE_RUNS: JSON.stringify(runs), FAKE_JOBS: JSON.stringify(jobs), ...env },
    });
    return { status: r.status, out: r.stdout.trim(), summary: fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "" };
  };
  const failed = [{ name: "Per-circuit geometry sweeps", conclusion: "failure" },
    { name: "Selected specs (change-aware gate)", conclusion: "failure" },
    { name: "Structural guards", conclusion: "success" },
    { name: "Golden menus on a runner (trial, non-blocking)", conclusion: "skipped" }];

  const green = verdict([ci(B)]);
  assert.equal(green.out, `::notice::base ${B.slice(0, 7)} was green — run 11`);
  assert.match(green.summary, /### Base verdict/);
  assert.match(green.summary, new RegExp(`base \`${B.slice(0, 7)}\` was \\*\\*green\\*\\*`));

  const red = verdict([ci(B, { conclusion: "failure" })], failed);
  assert.equal(red.out, `::notice::base ${B.slice(0, 7)} was red on: Per-circuit geometry sweeps, Selected specs (change-aware gate) — run 11`);
  assert.doesNotMatch(red.out, /Structural guards|Golden menus/, "a green or skipped job is not a failure");
  assert.match(red.summary, /red on: Per-circuit geometry sweeps/);

  // THIS commit's own run is not a base, and neither is an unmerged branch tip.
  assert.match(verdict([ci(C, { id: 99, conclusion: "failure" }), ci(X, { id: 98, conclusion: "failure" }), ci(B)]).out,
    new RegExp(`base ${B.slice(0, 7)} was green`),
    "a run of this head, and a run on a commit that is not an ancestor, are both skipped");
  assert.match(verdict([ci(B, { id: 7 })], [], { GITHUB_RUN_ID: "7" }).out, /no completed ci\.yml \/ pages\.yml run/,
    "a run never reads itself as its own base");
  // 2026-10-16: the deploy branch's push starts pages.yml (the train calls ci.yml), so a
  // pages.yml run on the base IS the base verdict; any other workflow still is not.
  assert.match(verdict([ci(B, { path: ".github/workflows/pages.yml" })]).out, new RegExp(`base ${B.slice(0, 7)} was green`),
    "a pages.yml train on the base is the base verdict");
  assert.match(verdict([ci(B, { path: ".github/workflows/fleet.yml" })]).out, /no completed ci\.yml \/ pages\.yml run/,
    "another workflow's verdict is not this gate's base");
  assert.match(verdict([ci(B, { status: "in_progress", conclusion: null })]).out, /no completed ci\.yml \/ pages\.yml run/,
    "a run still going has no verdict to report");
  assert.match(verdict([ci(B, { conclusion: "cancelled" })], failed).out, /was red \(cancelled\) on: Per-circuit/,
    "a cancelled base is red, and says which kind");
  assert.match(verdict([ci(B, { conclusion: "failure" })], []).out, /no failing job named/,
    "a red with no job list still reports something");
  // Advisory: every failure path is one line and an exit 0.
  const broken = verdict([ci(B)], [], { FAKE_GH: "fail" });
  assert.match(broken.out, /^::notice::base verdict unavailable/);
  for (const r of [green, red, broken]) assert.equal(r.status, 0, "base-verdict must never fail the job it reports in");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ci.yml runs the base verdict where the checkout can answer it, and never lets it decide", () => {
  assert.match(selectJob, /fetch-depth: 0/, "ancestry is a git question; a shallow checkout answers it wrong");
  assert.match(selectJob, /- name: Was the base already red\?\n\s+if: always\(\)\n\s+continue-on-error: true/,
    "the base verdict reports on red runs too, and may never turn one red");
  assert.match(selectJob, /run: bash tools\/ci\/base-verdict\.sh "\$GITHUB_SHA"/);
  assert.match(selectJob, /actions: read/, "listing the deploy branch's runs needs actions:read on the job token");
  assert.doesNotMatch(selectJob, /needs\.[\w-]*base/, "nothing may depend on the report");
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

/* ONE CHECK THAT ALWAYS REPORTS FOR THE CHANGE-AWARE GATE (2026-09-30).
 * Branch protection requires checks by name, and `selected`'s names carry
 * its matrix, so it could not be required: #491 merged with a red selected
 * gate on the merged tree and the tip sat red. `selected-verdict` has one
 * fixed name, runs whatever `selected` did, and reads the pair the way
 * poke-train did. Pinned so it cannot quietly stop covering a case. */
test("the two CI guard shards stop starting files after their first failure (--bail)", () => {
  const parsed = parseYAML(ciWorkflow).jobs;
  for (const [id, shard] of [["guards-a", "1/2"], ["guards-b", "2/2"]]) {
    const step = parsed[id].steps.find((st) => /tooling-fast\.mjs/.test(st.run || ""));
    assert.ok(step, `${id} runs tooling-fast`);
    assert.match(step.run, new RegExp(`--shard=${shard.replace("/", "\\/")} --bail$`),
      `${id} must pass --bail (2026-10-16 CI jobs review: red shards ran a mean 5.9 min past the first failure)`);
  }
  // The local edit loop keeps every failure visible.
  assert.doesNotMatch(JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts["test:tooling-fast"], /--bail/);
});

test("selected-verdict: one fixed-name check that always judges the change-aware gate", () => {
  const job = ciWorkflow.slice(ciWorkflow.indexOf("\n  selected-verdict:\n"), ciWorkflow.indexOf("\n  baseline-trial:\n"));
  assert.ok(job.length > 0, "the selected-verdict job is gone");
  assert.match(job, /^    name: Selected specs \(verdict\)$/m, "the required-check name; branch protection names it");
  assert.match(job, /^    needs: \[select, selected, guards\]$/m);
  // Every event that runs `select` — push, pull_request, the Pages call — gets
  // the verdict (no merge_group since 2026-10-14; no smoke_only either).
  assert.match(job, /^    if: \$\{\{ .*!cancelled\(\) && \(github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \|\| inputs\.concurrency_key != ''\).*\}\}$/m,
    "the required name reports on every push, PR and Pages call");
  assert.doesNotMatch(job, /^    if: \$\{\{ always\(\)/m, "always() turned a superseded run's cancelled `selected` into a red verdict");
  // The reading: select must pass; selected passes or is skipped; and (since
  // 2026-10-04) ANY dropped routed spec is a red off the train, whether or not
  // `selected` ran — the dropped-count used to be read only on a skip.
  assert.match(job, /GUARDS: \$\{\{ needs\.guards\.result \}\}/);
  assert.match(job, /selected-gate-verdict\.mjs/, "verdict logic is the shared script");
  // Execute the policy rather than requiring a comment that blesses a failure.
  for (const result of ["cancelled", "failure"]) {
    assert.equal(selectedGateVerdict({ select: "success", selected: result, guards: "success",
      evidence: { started: [], junit: [], downloadFailed: false } }).ok, false,
    "a selected leg with no execution evidence must remain red");
  }
  assert.match(job, /Every shard's junit[\s\S]*One answer for the change-aware gate/,
    "junit is downloaded before the decision step");
  // It joins the Pages aggregate like every other job (no needs on the renderer chain).
  const verdict = report.jobs.find((j) => j.name === "selected-verdict");
  assert.ok(verdict && verdict.deployGate, "selected-verdict must be in the deploy gate");
  // The matrix job's name still varies, which is the whole reason this exists.
  assert.match(ciWorkflow, /^    name: Selected specs \(change-aware gate\)$/m);
  assert.match(ciWorkflow, /include: \$\{\{ fromJSON\(needs\.select\.outputs\.shards\) \}\}/);
});

test("every workflow job carries a cap, and the Pages publishable check holds no Pages token", () => {
  /* 2026-10-04: five jobs ran under the 360-minute default — pages.yml's
     `deploy` among them, inside the never-cancelled `pages` lock, so one hang
     could wedge every later deploy for six hours. `publishable` inherited the
     workflow's pages: write + id-token: write to run one read-only script. */
  const dir = new URL("../../.github/workflows/", import.meta.url);
  const missing = [];
  for (const f of fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const wf = parseYAML(fs.readFileSync(new URL(f, dir), "utf8"));
    for (const [id, job] of Object.entries(wf.jobs || {})) {
      if (job.uses) continue;   // a reusable-workflow call: its own jobs carry caps
      if (job["timeout-minutes"] == null) missing.push(`${f}:${id}`);
    }
  }
  assert.deepEqual(missing, [], "a job with no timeout-minutes runs for up to 360 minutes on a hang");
  const pages = parseYAML(pagesWorkflow);
  assert.deepEqual(pages.jobs.publishable.permissions, { contents: "read" });
  assert.ok(pages.jobs.deploy["timeout-minutes"] <= 30, "the deploy job holds the Pages lock: keep its cap tight");
});

/* ACTIONS AUDIT 2026-10-14 (ci.yml lane): the five full-history checkouts that
 * still fetched every blob (C6), the dead merge-queue trigger (finding 7), and
 * the ready-PR ship filter (C2a). */
test("every fetch-depth: 0 checkout in ci.yml is blob-less (C6), and merge_group is gone (finding 7)", () => {
  const jobs = parseYAML(ciWorkflow).jobs;
  const full = [];
  for (const [id, job] of Object.entries(jobs)) {
    for (const st of job.steps || []) {
      if (!/^actions\/checkout@/.test(st.uses || "") || st.with?.["fetch-depth"] !== 0) continue;
      full.push(id);
      assert.equal(st.with.filter, "blob:none", `${id}: a full-history checkout fetches every blob unless filtered (25 s vs 9 s measured)`);
    }
  }
  for (const id of ["guards-a", "guards-b", "select", "sweeps-parts"]) assert.ok(full.includes(id), `${id} still needs its full history`);
  assert.ok(!full.includes("guards"), "the guards aggregator checks out nothing since 2026-10-15 (ratchets/audit run in tooling B)");
  const onBlock = ciWorkflow.slice(ciWorkflow.indexOf("\non:\n"), ciWorkflow.indexOf("\njobs:\n"));
  assert.doesNotMatch(onBlock, /^  merge_group:/m, "merge queues need an organisation-owned repo; the trigger never fired");
  assert.doesNotMatch(ciWorkflow.replace(/^\s*#.*$/gm, ""), /merge_group/, "no expression still branches on merge_group");
});
