// archive-branches — the archive-then-delete behind .github/workflows/archive-branches.yml.
// Deleting branches that share no history with the deploy branch is what
// shrinks a full clone (1.1 GB -> ~193 MB, 2026-10-01), and 80 of them held
// work nobody merged, so the order is the safety: bundle, verify the bundle
// holds EXACTLY the list at the right shas, release it, confirm the uploaded
// size, and only then delete. The selection and the bundle check are pinned on
// fixtures; a round trip through REAL git proves a deleted branch comes back
// from the bundle (in a throwaway repo under artifacts/, never /tmp). The
// workflow is pinned dispatch-only, dry-run by default, delete after release.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectArchive, parseHeads, checkBundle, ARCHIVE_PREFIX, main } from "../../tools/ci/archive-branches.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = 1_800_000_000, DAY = 86400;
const b = (name, ageDays) => ({ name, sha: "s-" + name, time: NOW - ageDays * DAY });
const post = new Set(["new-work", "claude/f1-game-project-26h3ng"]);

test("only quiet pre-restart branches with no open PR are archived; main is archived but reset, not deleted", () => {
  const branches = [b("main", 40), b("old-a", 30), b("old-pr", 30), b("old-fresh", 0.2), b("new-work", 30),
    b("claude/f1-game-project-26h3ng", 0), b("gh-pages", 90), b("claude/claims/x", 9), b("keep-me", 30)];
  const r = selectArchive(branches, { hasBase: (n) => post.has(n), openHeads: new Set(["old-pr"]), keep: /^keep-/, now: NOW });
  assert.deepEqual(r.archive.map((x) => x.name), ["main", "old-a"]);
  assert.deepEqual(r.del, ["old-a"], "reset (the default) keeps the name main");
  assert.deepEqual(Object.fromEntries(r.kept.map((k) => [k.name, k.why])), {
    "old-pr": "open PR", "old-fresh": "recent", "new-work": "shares history with deploy",
    "claude/f1-game-project-26h3ng": "deploy branch", "gh-pages": "protected name", "claude/claims/x": "protected name", "keep-me": "--keep",
  });
  assert.deepEqual(selectArchive([b("main", 40)], { hasBase: () => false, now: NOW, mainMode: "delete" }).del, ["main"]);
  const kept = selectArchive([b("main", 40)], { hasBase: () => false, now: NOW, mainMode: "keep" });
  assert.deepEqual([kept.archive.length, kept.kept[0].why], [0, "--main keep"]);
});

test("the bundle check wants every listed branch at its sha and nothing else", () => {
  const heads = parseHeads(`aaa ${ARCHIVE_PREFIX}one\nbbb ${ARCHIVE_PREFIX}two\nccc refs/heads/stray\n`);
  assert.deepEqual([...heads], [["one", "aaa"], ["two", "bbb"]]);
  assert.deepEqual(checkBundle([{ name: "one", sha: "aaa" }, { name: "two", sha: "bbb" }], heads), []);
  assert.deepEqual(checkBundle([{ name: "one", sha: "zzz" }, { name: "three", sha: "ccc" }], heads),
    ["wrong sha for one: aaa != zzz", "missing three", "unexpected two"]);
});

test("plan refuses without the open-PR list, and an unknown main mode", () => {
  const err = console.error; let said = "";
  console.error = (m) => { said += m + "\n"; };
  try {
    assert.equal(main(["plan", "--out", "x"]), 2);
    assert.equal(main(["plan", "--out", "x", "--open-heads", "f", "--main", "wipe"]), 2);
  } finally { console.error = err; }
  assert.match(said, /--open-heads is required/);
  assert.match(said, /--main is reset, delete or keep/);
});

test("against real git: a bundled branch survives its deletion and restores at the same sha", () => {
  const dir = path.join(ROOT, "artifacts", `archive-branches-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  try {
    const work = path.join(dir, "work"), back = path.join(dir, "restore");
    fs.mkdirSync(work, { recursive: true });
    g(work, "init", "-q", "-b", "old-a");
    fs.writeFileSync(path.join(work, "f.txt"), "unmerged work\n");
    g(work, "add", "-A"); g(work, "commit", "-q", "-m", "old work");
    const sha = g(work, "rev-parse", "HEAD").trim();
    g(work, "update-ref", ARCHIVE_PREFIX + "old-a", sha);
    const bundle = path.join(dir, "archive.bundle"), list = path.join(dir, "archive.txt");
    execFileSync("git", ["bundle", "create", bundle, "--stdin"], { cwd: work, input: ARCHIVE_PREFIX + "old-a\n", stdio: ["pipe", "ignore", "ignore"] });
    fs.writeFileSync(list, `old-a\t${sha}\n`);
    const log = console.log; console.log = () => {};
    try { assert.equal(main(["verify", "--bundle", bundle, "--list", list]), 0); } finally { console.log = log; }
    fs.writeFileSync(list, `old-a\t${"0".repeat(40)}\n`);
    const err = console.error; console.error = () => {};
    try { assert.equal(main(["verify", "--bundle", bundle, "--list", list]), 1, "a wrong sha fails the check"); } finally { console.error = err; }
    // The branch is gone from its repo; restore it from the bundle alone.
    fs.mkdirSync(back);
    g(back, "init", "-q");
    g(back, "fetch", "-q", bundle, `${ARCHIVE_PREFIX}old-a:refs/heads/old-a`);
    assert.equal(g(back, "rev-parse", "refs/heads/old-a").trim(), sha);
    assert.equal(g(back, "show", "old-a:f.txt"), "unmerged work\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the workflow is dispatch-only, dry-run by default, and deletes only after a size-checked release", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/archive-branches.yml"), "utf8");
  const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\n  (push|pull_request|schedule):/, "nothing may archive or delete on its own");
  assert.match(on, /apply:[\s\S]*?default: false/);
  const at = (name) => yml.indexOf(`- name: ${name}`);
  assert.ok(at("Bundle and verify") < at("Release the archive"), "verify before release");
  assert.ok(at("Release the archive") < at("Delete the archived branches"), "release before delete");
  assert.ok(at("Delete the archived branches") < at("Point main at the deploy tip"), "main is reset last");
  const release = yml.slice(at("Release the archive"), at("Delete the archived branches"));
  assert.match(release, /if: inputs\.apply/);
  assert.match(release, /if \[ "\$got" != "\$want" \]; then[^\n]*exit 1; fi/, "the uploaded size is confirmed before any delete");
  assert.match(yml.slice(at("Delete the archived branches")), /if: inputs\.apply/);
  assert.match(yml, /--force-with-lease="refs\/heads\/main:\$old"/, "main moves only if it is still the archived sha");
  assert.match(yml, /fetch-depth: 0/);
});
