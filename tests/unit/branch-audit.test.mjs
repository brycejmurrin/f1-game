// branch-audit — "is this branch's code already in the deploy branch?", the
// verdicts prune-branches.mjs deletes by (absorbed) and a person reads
// (superseded, post-merge, pr-closed). The pure parts are pinned on fixtures;
// the git evidence — ancestry, the merge-tree dry merge, line presence, an
// unrelated history — is pinned against REAL git in a throwaway repo under
// artifacts/ (never /tmp, AGENTS.md), because a verdict built on a misread
// merge-tree would delete work. Importing the module runs nothing. ~1 s.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addedLines, presence, indexPrs, indexRuns, verdictFor, renderMarkdown, audit, parseRefs, SUPERSEDED_PCT } from "../../tools/ci/branch-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("addedLines keeps added lines worth matching, per file, and skips deletions and short lines", () => {
  const diff = "diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1,3 @@\n-const gone = 1;\n+const kept = 2;\n+});\n+\n" +
    "--- a/old.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-const removed = 3;\n";
  assert.deepEqual(addedLines(diff), [{ file: "a.js", text: "const kept = 2;" }]);
});

test("presence counts same-file and anywhere separately — moved code is found anywhere", () => {
  const added = [{ file: "a.js", text: "alpha();" }, { file: "a.js", text: "beta();;" }, { file: "b.js", text: "gamma();" }];
  const files = new Map([["a.js", new Set(["alpha();"])], ["c.js", new Set(["beta();;"])]]);
  const all = new Set(["alpha();", "beta();;"]);
  assert.deepEqual(presence(added, (f) => files.get(f), all), { lines: 3, samePct: 33, anyPct: 67 });
  assert.deepEqual(presence([], () => null, all), { lines: 0, samePct: 100, anyPct: 100 }, "an empty diff adds nothing");
});

test("indexPrs keeps the newest PR per branch, and an open one always wins", () => {
  const m = indexPrs([
    { number: 5, state: "CLOSED", headRefName: "x", headRefOid: "a", mergedAt: "2026-09-01" },
    { number: 9, state: "CLOSED", headRefName: "x", headRefOid: "b", mergedAt: null, closedAt: "2026-09-03" },
    { number: 3, state: "OPEN", headRefName: "y", headRefOid: "c" },
    { number: 8, state: "CLOSED", headRefName: "y", headRefOid: "d", mergedAt: "2026-09-02" },
  ]);
  assert.deepEqual([m.get("x").number, m.get("x").state], [9, "closed"]);
  assert.deepEqual([m.get("y").number, m.get("y").state], [3, "open"]);
});

test("indexRuns keeps the newest run per head sha", () => {
  const m = indexRuns([{ headSha: "s", workflowName: "CI", conclusion: "failure", createdAt: "2026-09-01T00:00:00Z" },
    { headSha: "s", workflowName: "CI", conclusion: "success", createdAt: "2026-09-02T00:00:00Z" }]);
  assert.equal(m.get("s").conclusion, "success");
});

test("verdict precedence: open PR, merged, too recent, absorbed, no history, superseded, post-merge, pr-closed, unmerged", () => {
  const old = { ageDays: 9, sha: "h", lines: 10, anyPct: 10 };
  const v = (o) => verdictFor({ ...old, ...o });
  assert.equal(v({ pr: { state: "open" }, ancestor: true }), "active");
  assert.equal(v({ ancestor: true }), "merged");
  assert.equal(v({ pr: { state: "merged", headSha: "h" } }), "merged");
  assert.equal(v({ ageDays: 0.2, absorbed: true }), "active");
  assert.equal(v({ absorbed: true, anyPct: 0 }), "absorbed");
  assert.equal(v({ noHistory: true }), "no-history");
  assert.equal(v({ anyPct: SUPERSEDED_PCT, pr: { state: "closed" } }), "superseded");
  assert.equal(v({ anyPct: SUPERSEDED_PCT, lines: 0 }), "unmerged", "nothing measured is not evidence");
  assert.equal(v({ pr: { state: "merged", headSha: "other" } }), "post-merge");
  assert.equal(v({ pr: { state: "closed" } }), "pr-closed");
  assert.equal(v({}), "unmerged");
  assert.equal(v({ ageDays: NaN }), "active", "an unreadable age is never old");
});

test("renderMarkdown tallies the verdicts and lists every branch with its evidence", () => {
  const md = renderMarkdown([
    { name: "a", verdict: "absorbed", ageDays: 3, ahead: 2, absorbed: true, from: "dep", pr: null, ci: null },
    { name: "b", verdict: "unmerged", ageDays: 4, ahead: 5, samePct: 10, anyPct: 40, lines: 50, from: "dep", pr: { number: 7, state: "closed" }, ci: { workflow: "CI", conclusion: "failure" } },
  ], "dep");
  assert.match(md, /\| \*\*absorbed\*\* \| 1 \|/);
  assert.match(md, /\| `b` \| 4 \| 5 \| 10% \/ 40% of 50 \| #7 closed \| CI: failure \|/);
});

test("against real git: ancestor, absorbed, unmerged and an unrelated branch are told apart", () => {
  const dir = path.join(ROOT, "artifacts", `branch-audit-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const origin = path.join(dir, "origin.git"), work = path.join(dir, "work");
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  try {
    fs.mkdirSync(work, { recursive: true });
    g(dir, "init", "-q", "--bare", origin);
    g(work, "init", "-q", "-b", "deploy");
    const write = (f, body) => fs.writeFileSync(path.join(work, f), body);
    const commit = (msg) => { g(work, "add", "-A"); g(work, "commit", "-q", "-m", msg); };
    write("game.js", "function drive() { return 2; }\n"); commit("base");
    g(work, "checkout", "-q", "-b", "merged-one");
    write("a.txt", "a merged change line\n"); commit("m");
    g(work, "checkout", "-q", "deploy"); g(work, "merge", "-q", "--no-ff", "-m", "merge", "merged-one");
    g(work, "checkout", "-q", "-b", "absorbed-one", "deploy~1");
    write("a.txt", "a merged change line\n"); commit("same change, own commit");   // deploy already has it
    g(work, "checkout", "-q", "-b", "real-work", "deploy");
    write("b.txt", "work nobody merged yet\n"); commit("w");
    g(work, "checkout", "-q", "--orphan", "unrelated");
    write("c.txt", "a history of its own\n"); commit("orphan");
    g(work, "remote", "add", "origin", origin);
    g(work, "push", "-q", "origin", "deploy", "merged-one", "absorbed-one", "real-work", "unrelated");
    g(work, "fetch", "-q", "origin");
    const cwd = process.cwd();
    process.chdir(work);
    let rows;
    try {
      const branches = parseRefs(g(work, "for-each-ref", "--format=%(refname)\t%(objectname)\t%(committerdate:unix)", "refs/remotes/origin"));
      rows = audit(branches, { base: "deploy", now: Math.floor(Date.now() / 1000) + 30 * 86400 });
    } finally { process.chdir(cwd); }
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    assert.equal(by["merged-one"].verdict, "merged");
    assert.equal(by["absorbed-one"].verdict, "absorbed", "merging it changes nothing: deploy already has the line");
    assert.equal(by["real-work"].verdict, "unmerged");
    assert.equal(by["real-work"].anyPct, 0);
    assert.equal(by["unrelated"].verdict, "no-history");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
