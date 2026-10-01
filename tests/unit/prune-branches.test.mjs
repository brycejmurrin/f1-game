// prune-branches — the deletion rule behind .github/workflows/prune-branches.yml.
// A branch is pruned only when it is MERGED (an ancestor of the deploy branch,
// or exactly a merged PR's head), no open PR has it as its head, and it is
// quiet for min-age days; claude/claims/* markers go on age alone (a day); the
// deploy branch, the default branch, gh-pages and --keep matches never go.
// Pure: git and the clock come in as fixtures. The workflow is pinned to
// dispatch-only and dry-run by default, so nothing deletes on a push.
// Importing the module runs nothing (argv-guarded). Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectPrunable, parseRefs, parseHeads, DEPLOY } from "../../tools/ci/prune-branches.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = 1_800_000_000, DAY = 86400;
const b = (name, ageDays, sha = name) => ({ name, sha, time: NOW - ageDays * DAY });
const merged = new Set(["m-old", "m-new", "m-pr", DEPLOY, "main", "gh-pages", "keep-me"]);
const isMerged = (sha) => merged.has(sha);

test("only merged, quiet branches with no open PR are pruned; everything else says why it stayed", () => {
  const branches = [b("m-old", 30), b("m-new", 1), b("m-pr", 30), b("unmerged", 30), b(DEPLOY, 30), b("main", 30),
    b("gh-pages", 30), b("keep-me", 30)];
  const { prune, kept } = selectPrunable(branches, {
    defaultBranch: "main", openHeads: new Set(["m-pr"]), keep: /^keep-/, minAgeDays: 7, now: NOW, isMerged,
  });
  assert.deepEqual(prune, ["m-old"]);
  assert.deepEqual(Object.fromEntries(kept.map((k) => [k.name, k.why])), {
    "m-new": "recent", "m-pr": "open PR", unmerged: "not merged", [DEPLOY]: "deploy branch", main: "default branch",
    "gh-pages": "protected name", "keep-me": "--keep",
  });
});

test("a squash-merged branch goes only while its tip IS the merged PR's head", () => {
  const heads = parseHeads("sq\tS1\nsq-pushed-after\tP1\n\nbad-line\n");
  const { prune, kept } = selectPrunable([b("sq", 30, "S1"), b("sq-pushed-after", 30, "P2"), b("other", 30, "S1")],
    { now: NOW, isMerged: () => false, mergedHeads: heads });
  assert.deepEqual(prune, ["sq"]);
  assert.deepEqual(kept.map((k) => k.why), ["not merged", "not merged"], "a later push, or the same sha under another name, is not proof");
});

test("claims markers are pruned on age alone, a day at least, and an open PR still wins", () => {
  const { prune, kept } = selectPrunable([b("claude/claims/old", 2), b("claude/claims/live", 0.5), b("claude/claims/pr", 9)],
    { now: NOW, minAgeDays: 0, isMerged: () => false, openHeads: new Set(["claude/claims/pr"]) });
  assert.deepEqual(prune, ["claude/claims/old"]);
  assert.deepEqual(kept.map((k) => k.why), ["live claim", "open PR"]);
});

test("a branch with no readable commit time is kept, never read as old", () => {
  const { prune, kept } = selectPrunable([{ name: "m-old", sha: "m-old", time: NaN }], { now: NOW, isMerged });
  assert.deepEqual(prune, []);
  assert.equal(kept[0].why, "recent");
});

test("parseRefs reads for-each-ref lines and drops origin/HEAD", () => {
  const text = `refs/remotes/origin/HEAD\taaa\t1\nrefs/remotes/origin/claude/x\tbbb\t${NOW}\n\nrefs/remotes/origin/cursor/y-1\tccc\t5\n`;
  assert.deepEqual(parseRefs(text), [{ name: "claude/x", sha: "bbb", time: NOW }, { name: "cursor/y-1", sha: "ccc", time: 5 }]);
});

test("--apply without the open-PR list refuses (an unknown PR set is not an empty one)", async () => {
  const { main } = await import("../../tools/ci/prune-branches.mjs");
  const err = console.error; let said = "";
  console.error = (m) => { said += m; };
  try { assert.equal(main(["--apply"]), 2); } finally { console.error = err; }
  assert.match(said, /--open-heads/);
});

test("the workflow is dispatch-only, dry-run by default, and passes --apply only when ticked", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/prune-branches.yml"), "utf8");
  const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\n  (push|pull_request|schedule):/, "nothing may delete branches on its own");
  assert.match(on, /apply:[\s\S]*?default: false/);
  assert.match(yml, /if \[ "\$APPLY" = "true" \]; then args\+=\(--apply\); fi/);
  assert.match(yml, /--open-heads "\$RUNNER_TEMP\/open-heads.txt" --merged-heads "\$RUNNER_TEMP\/merged-heads.txt"/);
  assert.match(yml, /--state merged [^\n]*headRefName,headRefOid/);
  assert.match(yml, /contents: write/);
  assert.match(yml, /fetch-depth: 0/);
});
