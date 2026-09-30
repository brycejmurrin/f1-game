// ci-pr-base.test.mjs — a pull request diffs against the test commit's first parent.
//
// `pull_request.base.sha` is one sync behind the base tip that
// refs/pull/N/merge was built on, so the first PR runs after #494 read the
// base's own recent commits as every PR's diff and fail-safed into running
// everything (tools/ci/ci-pr-base.sh). Run for real in a throwaway repo, then
// pin every workflow step that diffs a PR to the helper.
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
const docs = fs.readFileSync(path.join(ROOT, ".github/workflows/docs-guards.yml"), "utf8");
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
  assert.match(job("sweeps", "ship-filter"), CALL, "the geometry sweeps filter");
  assert.match(job("renderer-filter", "renderer-macos"), CALL, "the renderer filter");
  assert.match(job("node-suites", "sweeps-parts"), /BASE="\$\(bash tools\/ci\/ci-pr-base\.sh "\$\{PR_BASE:-\}"\)"/, "the node-suites plan step");
  assert.match(docs, /PR_BASE="\$\(bash tools\/ci\/ci-pr-base\.sh "\$\{PR_BASE:-\}"\)"/, "docs-guards' prose check");
  assert.match(resolver, /\[ "\$EVENT" = pull_request \] && BEFORE="\$\(bash "\$\(dirname "\$0"\)\/ci-pr-base\.sh" "\$BEFORE"\)"/,
    "the selected gate's resolver");
});
