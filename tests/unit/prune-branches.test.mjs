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
import { selectPrunable, parseRefs, parseHeads, archiveRefs, migrateTagRefs, landedRefs, archiveFallback, DEPLOY } from "../../tools/ci/prune-branches.mjs";

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

test("an ABSORBED verdict prunes; a judgement verdict only when opted in, and the reason is kept", () => {
  const branches = [b("abs", 30), b("sup", 30), b("closed", 30), b("work", 30)];
  const verdicts = new Map([["abs", "absorbed"], ["sup", "superseded"], ["closed", "pr-closed"], ["work", "unmerged"]]);
  const plain = selectPrunable(branches, { now: NOW, isMerged: () => false, verdicts });
  assert.deepEqual(plain.prune, ["abs"]);
  assert.equal(plain.reasons.get("abs"), "absorbed");
  assert.deepEqual(plain.kept.map((k) => [k.name, k.why]), [["sup", "superseded"], ["closed", "pr-closed"], ["work", "unmerged"]]);
  const opted = selectPrunable(branches, { now: NOW, isMerged: () => false, verdicts, allow: new Set(["absorbed", "superseded"]) });
  assert.deepEqual(opted.prune, ["abs", "sup"]);
});

test("a lossy prune is archived to refs/archive (outside any clone) first; merged, absorbed and expired claims are not", () => {
  const reasons = new Map([["m", "merged"], ["a", "absorbed"], ["claude/claims/c", "expired claim"], ["u", "unmerged"], ["n", "no-history"]]);
  assert.deepEqual(archiveRefs([...reasons.keys()], reasons, (n) => "sha-" + n),
    ["sha-u:refs/archive/u", "sha-n:refs/archive/n"]);
});

test("the first run's archive TAGS move to refs/archive, and nothing else is touched", () => {
  const got = migrateTagRefs("s1 refs/tags/archive/cursor/x-1\ns2 refs/tags/v1.0\n\ns3 refs/tags/archive/zz\n");
  assert.deepEqual(got, { push: ["s1:refs/archive/cursor/x-1", "s3:refs/archive/zz"], tags: ["refs/tags/archive/cursor/x-1", "refs/tags/archive/zz"] });
});

test("push results are read per ref: a refused ref falls back to a tag, the rest count as landed", () => {
  // Run 37086262369: GitHub refused 71 of 81 refs/archive pushes (commits that
  // touch .github/workflows/ need a `workflows` permission the Actions token
  // lacks) and landed 10 in the same batch.
  const out = "To https://github.com/o/r\n*\taaa:refs/archive/ok\t[new reference]\n" +
    "!\tbbb:refs/archive/wf\t[remote rejected] (refusing to allow a GitHub App to create or update workflow)\n" +
    "-\t:refs/tags/archive/ok\t[deleted]\nDone\n";
  const landed = landedRefs(out);
  assert.deepEqual([...landed].sort(), ["refs/archive/ok", "refs/tags/archive/ok"]);
  assert.deepEqual(archiveFallback(["aaa:refs/archive/ok", "bbb:refs/archive/wf"], landed), ["bbb:refs/tags/archive/wf"]);
  assert.deepEqual([...landedRefs("")], []);
});

test("the claims board is never pruned, however old or unmerged", () => {
  const { prune, kept } = selectPrunable([b("claude/claims-board", 30)], { now: NOW, isMerged: () => true });
  assert.deepEqual(prune, []);
  assert.equal(kept[0].why, "protected name");
});

test("--also refuses a verdict that is not a judgement call (merged/active)", async () => {
  const { main } = await import("../../tools/ci/prune-branches.mjs");
  const err = console.error; let said = "";
  console.error = (m) => { said += m; };
  try { assert.equal(main(["--also", "active"]), 2); } finally { console.error = err; }
  assert.match(said, /--also takes/);
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
  assert.match(said, /--prs or --open-heads/);
});

test("the workflow is dispatch-only, dry-run by default, and passes --apply only when ticked", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/prune-branches.yml"), "utf8");
  const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\n  (push|pull_request|schedule):/, "nothing may delete branches on its own");
  assert.match(on, /apply:[\s\S]*?default: false/);
  assert.match(yml, /if \[ "\$APPLY" = "true" \]; then args\+=\(--apply\); fi/);
  assert.match(yml, /--prs "\$RUNNER_TEMP\/prs.json" --runs "\$RUNNER_TEMP\/runs.json"/);
  assert.match(yml, /--state all [^\n]*headRefName,headRefOid/);
  assert.match(yml, /--quiet-hours "\$\{QUIET:-48\}"/, "the audit surveys no-PR branches quiet for 48 h");
  assert.match(on, /quiet_hours:[\s\S]*?default: "48"/);
  assert.match(yml, /if \[ -n "\$ALSO" \]; then args\+=\(--also "\$ALSO"\); fi/);
  assert.match(on, /also:[\s\S]*?default: ""/, "no verdict beyond merged/absorbed is deleted unless a person names it");
  assert.match(yml, /contents: write/);
  assert.match(yml, /fetch-depth: 0/);
});
