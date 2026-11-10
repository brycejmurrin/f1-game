// ci-pr-base.test.mjs — a pull request diffs against the test commit's first parent.
//
// `pull_request.base.sha` is one sync behind the base tip that
// refs/pull/N/merge was built on, so the first PR runs after #494 read the
// base's own recent commits as every PR's diff and fail-safed into running
// everything (tools/ci/ci-pr-base.sh). Run for real in a throwaway repo, then
// pin every workflow step that diffs a PR to the helper.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "tools/ci/ci-pr-base.sh");
const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
const resolver = fs.readFileSync(path.join(ROOT, "tools/ci/ci-resolve-before.sh"), "utf8");

test("a merge checkout answers its first parent; anything else echoes the fallback", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-pr-base-"));
  const g = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  const run = (fallback) => cp.spawnSync("bash", [SCRIPT, fallback], { cwd: dir, encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a"), "1\n"); g("add", "-A"); g("commit", "-qm", "one");
    const first = g("rev-parse", "HEAD");
    // A plain head checkout: no second parent, so the event's base stands.
    assert.equal(run("fallback-sha").stdout.trim(), "fallback-sha");
    assert.equal(run("").stdout.trim(), "", "an empty fallback stays empty (the caller's fail-safe reads it)");
    // The PR branch, then the base moves on, then GitHub's merge of the two.
    g("checkout", "-qb", "pr"); fs.writeFileSync(path.join(dir, "b"), "pr\n"); g("add", "-A"); g("commit", "-qm", "pr");
    g("checkout", "-q", "main"); fs.writeFileSync(path.join(dir, "a"), "2\n"); g("add", "-A"); g("commit", "-qm", "base moved");
    const baseTip = g("rev-parse", "HEAD");
    g("merge", "-q", "--no-ff", "-m", "merge", "pr");
    // The stale event base is `first`; the right base is the merge's first parent.
    const r = run(first);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), baseTip, "a merge checkout must diff against its first parent");
    assert.equal(g("diff", "--name-only", baseTip), "b", "against the first parent, only the PR's own file differs");
    assert.equal(g("diff", "--name-only", first), "a\nb", "against the stale base, the base's own move reads as the PR's diff");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("every workflow step that diffs a pull request resolves its base through the helper", () => {
  const job = (from, to) => ci.slice(ci.indexOf(`\n  ${from}:\n`), ci.indexOf(`\n  ${to}:\n`));
  const CALL = /\[ "\$EVENT" = pull_request \] && BEFORE="\$\(bash tools\/ci\/ci-pr-base\.sh "\$\{BEFORE:-\}"\)"/;
  assert.match(job("sweeps-parts", "sweeps"), CALL, "the parts census filter");
  assert.match(job("select", "selected"), CALL, "the shared geometry sweeps filter");
  // The three path filters and the node-slice plan are steps of `select` since 2026-10-15.
  assert.match(job("select", "selected"), CALL, "the renderer / xr filter steps");
  assert.match(job("node-suites", "sweeps-parts"), /BASE="\$\(bash tools\/ci\/ci-pr-base\.sh "\$\{PR_BASE:-\}"\)"/, "the node-suites plan step");
  // 15-F3: the two steps #1292 missed. xr-filter's regex names ci.yml, so a stale base re-ran the VR job.
  assert.match(job("select", "selected"), /BASE="\$\(bash tools\/ci\/ci-pr-base\.sh "\$\{PR_BASE:-\}"\)"/, "the node-slice plan step");
  assert.match(resolver, /\[ "\$EVENT" = pull_request \] && BEFORE="\$\(bash "\$\(dirname "\$0"\)\/ci-pr-base\.sh" "\$BEFORE"\)"/,
    "the selected gate's resolver");
});

test("Structural guards ignores ship ceiling raises but still rejects a PR raise", () => {
  // Run the actual workflow shell and ratchet CLI on a GitHub-shaped merge.
  // A stale event base must not attribute ship's +100 raise to a scenery PR.
  const shell = ci.match(/- name: Ratchet ceilings vs the base[\s\S]*?        run: \|\n((?:          .*\n)+)/)?.[1]
    .replace(/^          /gm, "");
  assert.ok(shell, "the Structural guards ratchet shell is present");
  const scratch = path.join(ROOT, "scratch");
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "ci-ratchet-base-"));
  const g = (...args) => cp.execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  const ceiling = (lines) => fs.writeFileSync(path.join(dir, "tests/data/ratchets.json"),
    JSON.stringify({ files: { "js/game.js": { lines } } }) + "\n");
  const commit = (message) => { g("add", "-A"); g("commit", "-qm", message); };
  const run = (base, event = "pull_request", mode = "") => cp.spawnSync("bash", ["-e", "-c", shell], {
    cwd: dir, encoding: "utf8", env: { ...process.env, RATCHET_BASE: base, RATCHET_MODE: mode, EVENT: event },
  });
  try {
    g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    for (const file of ["tools/ci/ci-pr-base.sh", "tools/check/ratchets.mjs"]) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }
    fs.mkdirSync(path.join(dir, "tests/data"), { recursive: true });
    ceiling(100); commit("original ship ceiling");
    const staleBase = g("rev-parse", "HEAD");
    g("checkout", "-qb", "scenery");
    fs.writeFileSync(path.join(dir, "scenery"), "one circuit change\n"); commit("scenery only");
    g("checkout", "-q", "main"); ceiling(200); commit("ship ceiling moved");
    const baseTip = g("rev-parse", "HEAD");
    g("merge", "-q", "--no-ff", "-m", "synthetic PR merge", "scenery");
    let result = run(staleBase);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`ratchet base: ${baseTip}`));
    assert.match(result.stdout, /0 ceiling\(s\) moved/);
    // Pushes keep their explicit previous SHA and existing advisory behavior.
    result = run(staleBase, "push", "--advisory");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /100 -> 200 \(\+100\)/);
    assert.match(result.stdout, /advisory/);
    // A PR-owned raise remains fatal even though the stale base is normalized.
    ceiling(250);
    result = run(staleBase);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /200 -> 250 \(\+50\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("15-F5: a green draft run is reused only on its first attempt and the same base SHA", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "reuse-draft-"));
  try {
    const BASE = "b".repeat(40);
    // A stub `gh`: one green pull_request ci.yml run, its jobs, and its tooling A record (an annotation).
    fs.writeFileSync(path.join(dir, "gh"), [
      "#!/usr/bin/env bash",
      'case "$2" in',
      '  repos/o/r/check-runs/*/annotations*) printf \'%s\' "$STUB_ANN" ;;',
      '  repos/o/r/actions/runs/*/jobs*) printf \'%s\' "$STUB_JOBS" ;;',
      '  repos/o/r/actions/runs*) printf \'{"workflow_runs":[{"id":77,"run_attempt":%s,"status":"completed","conclusion":"success","path":".github/workflows/ci.yml","event":"pull_request"}]}\' "$STUB_ATTEMPT" ;;',
      '  *) exit 1 ;;',
      "esac",
    ].join("\n"), { mode: 0o755 });
    const script = path.join(ROOT, "tools/ci/reuse-draft-fast.sh");
    const ann = (msg) => JSON.stringify([{ title: "apex-guards", message: msg }]);
    const reuse = (extra = {}) => cp.spawnSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_ACTION: "ready_for_review",
        PR_HEAD_SHA: "a".repeat(40), GITHUB_RUN_ID: "1", CURRENT_BASE: BASE, STUB_ATTEMPT: "1",
        STUB_ANN: ann(`mode=changed base=${BASE}`),
        STUB_JOBS: JSON.stringify({ jobs: [{ id: 5, name: "Structural guards (tooling A)", conclusion: "success" }] }), ...extra },
    });
    const r1 = reuse();
    assert.match(r1.stdout, /reuse=true/, r1.stderr);
    assert.match(r1.stdout, /run=77/);
    assert.match(r1.stdout, /guards_mode=changed/, "the reused draft's scope is carried into this run's record");
    const moved = reuse({ CURRENT_BASE: "c".repeat(40) });
    assert.match(moved.stdout, /reuse=false/, "the base moved since the draft ran: the merge-dependent checks must re-run");
    assert.match(moved.stderr, /tested base/);
    const rerun = reuse({ STUB_ATTEMPT: "2" });
    assert.match(rerun.stdout, /reuse=false/, "a draft that passed only on a re-run is not reused");
    assert.match(rerun.stderr, /attempt 2/);
    // No base, no record, or a malformed record is not "same": fail safe.
    assert.match(reuse({ CURRENT_BASE: "", GITHUB_EVENT_NAME: "workflow_dispatch" }).stdout, /reuse=false/);
    assert.match(reuse({ STUB_ANN: "[]" }).stdout, /reuse=false/);
    assert.match(reuse({ STUB_ANN: ann("mode=full base=xyz") }).stdout, /reuse=false/);
    // #2184: a run that concluded success with tooling A SKIPPED (a cancelled-then-green
    // shape; until 2026-11-03 also an opted-out draft) tested nothing and is never reused.
    const skipOnly = reuse({ STUB_JOBS: JSON.stringify({ jobs: [
      { id: 4, name: "Structural guards (tooling B)", conclusion: "skipped" },
      { id: 5, name: "Structural guards (tooling A)", conclusion: "skipped" }] }) });
    assert.match(skipOnly.stdout, /reuse=false/, "a skip-only green run must not stand in for the fast tier");
    assert.match(skipOnly.stderr, /did not run and pass/);
    assert.match(reuse({ STUB_JOBS: "" }).stdout, /reuse=false/, "an unreadable jobs list fails safe");
    // --record writes the annotation and the step output.
    const out = path.join(dir, "out");
    const rec = cp.spawnSync("bash", [script, "--record"], { encoding: "utf8", cwd: ROOT,
      env: { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: out, SCOPE_MODE: "full", REUSED_MODE: "" } });
    assert.match(rec.stdout, /^::notice title=apex-guards::mode=full base=[0-9a-f]{40}$/m, rec.stderr);
    assert.equal(fs.readFileSync(out, "utf8"), "guards_mode=full\n");
    const odd = cp.spawnSync("bash", [script, "--record"], { encoding: "utf8", cwd: ROOT,
      env: { ...process.env, GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "schedule", GITHUB_OUTPUT: "", SCOPE_MODE: "weird" } });
    assert.match(odd.stdout, /mode=unknown base=none/, "an unexpected scope is recorded as unknown, off a PR there is no base");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.match(ci, /bash tools\/ci\/reuse-draft-fast\.sh --record/, "tooling A records its guards scope");
});
