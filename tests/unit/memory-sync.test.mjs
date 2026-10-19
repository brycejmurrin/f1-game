// memory-sync — .claude/hooks/memory-sync.sh carries Claude's auto memory
// between the live dir and the tracked .claude/memory/ copy. Until 2026-10-02
// its save copied EVERY differing live file over the repo and deleted repo
// files the session lacked, so a resumed session — whose live dir predated a
// branch checkout that brought other sessions' memories — reverted them (twice
// in one day: two index lines and a topic file's update). The hook is now a
// three-way sync against a baseline (artifacts/.memory-base/), and this drives
// the REAL script in a throwaway repo under artifacts/ (never /tmp) through
// each case: fresh restore, a stale session saving, this session's own edit,
// both sides adding index lines, a topic-file conflict, and deletions.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/memory-sync.sh");
const topic = (name, body) => `---\nname: ${name}\ndescription: d\nmetadata:\n  type: feedback\n---\n\n${body}\n`;

function rig({ cloneFrom, branch } = {}) {
  const dir = path.join(ROOT, "artifacts", `memory-sync-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const main = path.join(dir, "repo"), cfg = path.join(dir, "config");
  if (cloneFrom) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("git", ["clone", "-q", "--depth=1", "--no-single-branch", "--branch", branch, pathToFileURL(cloneFrom).href, main]);
  } else {
    fs.mkdirSync(path.join(main, ".claude/memory"), { recursive: true });
    execFileSync("git", ["init", "-q", main]);
  }
  const real = fs.realpathSync(main);
  const live = path.join(cfg, "projects", real.replace(/[^A-Za-z0-9]/g, "-"), "memory");
  const repo = path.join(main, ".claude/memory");
  const run = (mode, input = "", extraEnv = {}) => {
    const r = spawnSync("bash", [HOOK, mode], { input, encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: main, CLAUDE_CONFIG_DIR: cfg, APEX_MEMORY_SYNC: "1", CLAUDE_CODE_REMOTE: "", ...extraEnv } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const put = (d, f, t) => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  const get = (d, f) => { try { return fs.readFileSync(path.join(d, f), "utf8"); } catch (_) { return null; } };
  return { dir, live, repo, run, put, get, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("a fresh container restores every tracked memory", () => {
  const r = rig();
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.put(r.repo, "a.md", topic("a", "alpha"));
    assert.match(r.run("restore"), /2 in/);
    assert.equal(r.get(r.live, "a.md"), topic("a", "alpha"));
  } finally { r.done(); }
});

test("a stale session never reverts memories other sessions added (the 2026-10-02 bug)", () => {
  const r = rig();
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.put(r.repo, "a.md", topic("a", "v1"));
    r.run("restore");
    // Another session's work arrives through a branch checkout, mid-session.
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n- [B](b.md)\n");
    r.put(r.repo, "a.md", topic("a", "v2 from another session"));
    r.put(r.repo, "b.md", topic("b", "beta"));
    r.run("save");   // this session edited nothing
    assert.equal(r.get(r.repo, "MEMORY.md"), "# idx\n- [A](a.md)\n- [B](b.md)\n", "the index keeps B");
    assert.equal(r.get(r.repo, "a.md"), topic("a", "v2 from another session"), "the newer topic file survives");
    assert.equal(r.get(r.repo, "b.md"), topic("b", "beta"), "a file this session never had is not deleted");
    assert.equal(r.get(r.live, "b.md"), topic("b", "beta"), "and the session picks it up");
  } finally { r.done(); }
});

test("this session's own edit, new memory and index line reach the repo", () => {
  const r = rig();
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.put(r.repo, "a.md", topic("a", "v1"));
    r.run("restore");
    r.put(r.live, "a.md", topic("a", "v1 edited here"));
    r.put(r.live, "c.md", topic("c", "new here"));
    r.put(r.live, "MEMORY.md", "# idx\n- [A](a.md)\n- [C](c.md)\n");
    r.run("save");
    assert.equal(r.get(r.repo, "a.md"), topic("a", "v1 edited here"));
    assert.equal(r.get(r.repo, "c.md"), topic("c", "new here"));
    assert.equal(r.get(r.repo, "MEMORY.md"), "# idx\n- [A](a.md)\n- [C](c.md)\n");
  } finally { r.done(); }
});

test("both sides adding index lines merge; a topic edited on both sides keeps the repo copy and says so", () => {
  const r = rig();
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n- [Old](old.md)\n");
    r.put(r.repo, "a.md", topic("a", "v1"));
    r.put(r.repo, "old.md", topic("old", "o"));
    r.run("restore");
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n- [Old](old.md)\n- [B](b.md)\n");
    r.put(r.repo, "a.md", topic("a", "theirs"));
    r.put(r.live, "MEMORY.md", "# idx\n- [A](a.md)\n- [C](c.md)\n");   // dropped Old, added C
    r.put(r.live, "a.md", topic("a", "mine"));
    const out = r.run("save");
    const want = "# idx\n- [A](a.md)\n- [B](b.md)\n- [C](c.md)\n";
    assert.equal(r.get(r.repo, "MEMORY.md"), want, "their B kept, my removal of Old and my C applied");
    assert.equal(r.get(r.live, "MEMORY.md"), want);
    assert.equal(r.get(r.repo, "a.md"), topic("a", "theirs"), "a conflicted topic file is never overwritten");
    assert.match(out, /CONFLICT kept the repo copy of a\.md/);
  } finally { r.done(); }
});

test("a deletion travels only from the side that made it", () => {
  const r = rig();
  try {
    r.put(r.repo, "a.md", topic("a", "a"));
    r.put(r.repo, "b.md", topic("b", "b"));
    r.run("restore");
    fs.rmSync(path.join(r.live, "a.md"));        // this session forgets a
    fs.rmSync(path.join(r.repo, "b.md"));        // another session dropped b
    r.run("save");
    assert.equal(r.get(r.repo, "a.md"), null, "this session's delete reaches the repo");
    assert.equal(r.get(r.live, "b.md"), null, "theirs reaches the session");
  } finally { r.done(); }
});

// #2901 review: when one side edits a topic and the other deletes it, the
// three-way sync used to treat it as a both-changed conflict and write the
// surviving side back onto the deleted side — resurrecting the file.
test("edit vs delete on a topic file honours the delete (never resurrects)", () => {
  const r = rig();
  try {
    r.put(r.repo, "a.md", topic("a", "v1"));
    r.put(r.repo, "b.md", topic("b", "v1"));
    r.run("restore");
    // Live deletes a; repo edits a (other session).
    fs.rmSync(path.join(r.live, "a.md"));
    r.put(r.repo, "a.md", topic("a", "edited elsewhere"));
    const outA = r.run("save");
    assert.equal(r.get(r.live, "a.md"), null, "live delete must stay deleted");
    assert.equal(r.get(r.repo, "a.md"), null, "repo must not keep the edited copy over a delete");
    assert.match(outA, /CONFLICT|delete/i, "the clash is reported, not silent");
    // Live edits b; repo deletes b.
    r.put(r.live, "b.md", topic("b", "edited here"));
    fs.rmSync(path.join(r.repo, "b.md"));
    const outB = r.run("save");
    assert.equal(r.get(r.repo, "b.md"), null, "repo delete must stay deleted");
    assert.equal(r.get(r.live, "b.md"), null, "live must not resurrect the edited copy");
    assert.match(outB, /CONFLICT|delete/i);
  } finally { r.done(); }
});

test("a branch checkout that lacks a memory is not a deletion; a committed deletion still is (#2128)", () => {
  const r = rig();
  const main = path.dirname(path.dirname(r.repo));
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: main, encoding: "utf8" });
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.put(r.repo, "a.md", topic("a", "alpha"));
    git("add", ".claude"); git("commit", "-qm", "base");
    const baseBranch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
    r.run("restore");
    git("checkout", "-qb", "mem");
    // this session writes a memory; save carries it out; it is committed on `mem`
    r.put(r.live, "c.md", topic("c", "gamma"));
    r.put(r.live, "MEMORY.md", "# idx\n- [A](a.md)\n- [C](c.md)\n");
    r.run("save");
    git("add", ".claude"); git("commit", "-qm", "memory c");
    r.run("save");                               // in step: the baseline learns c
    git("checkout", "-q", baseBranch);           // a branch that never had c
    assert.equal(r.get(r.repo, "c.md"), null, "precondition: the checkout removed the repo copy");
    r.run("save");
    assert.equal(r.get(r.live, "c.md"), topic("c", "gamma"), "the live memory survives the checkout");
    assert.equal(r.get(r.repo, "c.md"), topic("c", "gamma"), "and is written back to ride this branch");
    assert.match(r.get(r.live, "MEMORY.md"), /- \[C\]\(c\.md\)/, "its index line survives too");
    assert.match(r.get(r.repo, "MEMORY.md"), /- \[A\]\(a\.md\)\n- \[C\]\(c\.md\)/);
    // a deletion that a commit made is still honoured after a checkout
    git("add", ".claude"); git("commit", "-qm", "carry c");
    r.run("save");
    git("rm", "-q", ".claude/memory/c.md"); git("commit", "-qm", "drop c");
    git("checkout", "-q", "mem"); r.run("save");  // back on a branch that has c
    git("checkout", "-q", baseBranch);            // HEAD's history deleted c
    r.run("save");
    assert.equal(r.get(r.live, "c.md"), null, "a deletion in HEAD's history reaches the session");
  } finally { r.done(); }
});

test("an index line removed by this branch's own commit stays removed (2026-10-18, #2873)", () => {
  const r = rig();
  const main = path.dirname(path.dirname(r.repo));
  const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: main, encoding: "utf8" });
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n- [A](a.md) stale dup\n");
    r.put(r.repo, "a.md", topic("a", "alpha"));
    git("add", ".claude"); git("commit", "-qm", "base");
    r.run("restore");
    // the session dedupes the TRACKED index and commits it: HEAD moves, the live copy is untouched
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.run("unmark");                             // as bash-guard does before `git add`
    git("add", ".claude"); git("commit", "-qm", "dedupe index");
    r.run("save");
    assert.equal(r.get(r.repo, "MEMORY.md"), "# idx\n- [A](a.md)\n", "the committed removal is not re-added to the repo");
    assert.equal(r.get(r.live, "MEMORY.md"), "# idx\n- [A](a.md)\n", "and reaches the live index");
  } finally { r.done(); }
});

test("save from an unrelated PostToolUse edit does nothing", () => {
  const r = rig();
  try {
    r.put(r.repo, "a.md", topic("a", "a"));
    r.run("restore");
    r.put(r.repo, "a.md", topic("a", "changed elsewhere"));
    r.run("save", JSON.stringify({ tool_input: { file_path: "/somewhere/else.js" } }));
    assert.equal(r.get(r.live, "a.md"), topic("a", "a"), "only an edit inside the live dir triggers a sync");
  } finally { r.done(); }
});

test("H2: synced memory files are hidden from git status after save, and `unmark` shows them again", () => {
  const r = rig();
  try {
    const main = path.join(r.dir, "repo");
    const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-C", main, ...a], { encoding: "utf8" });
    r.put(r.repo, "a.md", topic("a", "v1"));
    git("add", "-A"); git("commit", "-qm", "init");
    r.run("restore");
    r.put(r.live, "a.md", topic("a", "edited by this session"));
    r.run("save");
    assert.equal(r.get(r.repo, "a.md"), topic("a", "edited by this session"), "the edit still reaches the tracked copy");
    assert.equal(git("status", "--porcelain", "--", ".claude").trim(), "", "the Stop hook's `git status`/`git diff` sees a clean tree");
    r.run("unmark");
    assert.match(git("status", "--porcelain", "--", ".claude"), /\.claude\/memory\/a\.md/, "after unmark the edit rides the next commit");
    git("add", "-A"); git("commit", "-qm", "memory rides");
    assert.match(git("show", "--stat", "HEAD"), /a\.md/);
  } finally { r.done(); }
});


// Separate depth-1 roots contain no evidence that the deploy branch retired
// the old memory. Exercise the real hook twice, then restore ancestry and
// prove the same retained baseline can safely complete the retirement.
for (const retireTopic of [true, false]) {
  test(`shallow branch retirement defers without resurrecting ${retireTopic ? "topic and index" : "index-only removal"}`, () => {
    const source = rig();
    const main = path.dirname(path.dirname(source.repo));
    const git = (cwd, ...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" });
    let r;
    try {
      source.put(source.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
      source.put(source.repo, "a.md", topic("a", "alpha"));
      git(main, "add", ".claude"); git(main, "commit", "-qm", "old memory");
      git(main, "branch", "old"); git(main, "checkout", "-qb", "deploy");
      source.put(source.repo, "MEMORY.md", "# idx\n");
      if (retireTopic) git(main, "rm", "-q", ".claude/memory/a.md");
      git(main, "add", ".claude"); git(main, "commit", "-qm", "reviewed retirement");
      r = rig({ cloneFrom: main, branch: "old" });
      const clone = path.dirname(path.dirname(r.repo));
      r.run("restore"); r.run("unmark");
      const base = path.join(clone, "artifacts/.memory-base");
      const before = [r.get(r.live, "MEMORY.md"), r.get(r.live, "a.md"), r.get(base, "MEMORY.md"), r.get(base, ".head")];
      git(clone, "checkout", "-q", "--track", "origin/deploy");
      assert.equal(git(clone, "rev-parse", "--is-shallow-repository").trim(), "true");
      assert.equal(spawnSync("git", ["merge-base", "old", "HEAD"], { cwd: clone }).status, 1, "fixture has genuinely disconnected shallow roots");
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.match(r.run("save"), /WARNING sync deferred.*ancestry/);
        assert.equal(r.get(r.repo, "MEMORY.md"), "# idx\n", "reviewed index never gets rewritten");
        assert.equal(r.get(r.repo, "a.md"), retireTopic ? null : topic("a", "alpha"));
        assert.deepEqual([r.get(r.live, "MEMORY.md"), r.get(r.live, "a.md"), r.get(base, "MEMORY.md"), r.get(base, ".head")], before, "keep recovery copies and old HEAD across retries");
      }
      git(clone, "fetch", "-q", "--unshallow");
      assert.doesNotMatch(r.run("restore"), /WARNING/);
      assert.equal(r.get(r.live, "MEMORY.md"), "# idx\n");
      assert.equal(r.get(r.live, "a.md"), retireTopic ? null : topic("a", "alpha"));
    } finally { r?.done(); source.done(); }
  });
}

for (const failedCommand of ["merge-base", "diff", "log"]) {
  test(`failed git ${failedCommand} defers memory sync before changing any store`, () => {
    const r = rig();
    const main = path.dirname(path.dirname(r.repo));
    const git = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: main, encoding: "utf8" });
    try {
      r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
      r.put(r.repo, "a.md", topic("a", "alpha"));
      git("add", ".claude"); git("commit", "-qm", "memory"); r.run("restore"); r.run("unmark");
      const base = path.join(main, "artifacts/.memory-base");
      const oldHead = r.get(base, ".head");
      r.put(r.repo, "MEMORY.md", "# idx\n"); git("rm", "-q", ".claude/memory/a.md");
      git("add", ".claude"); git("commit", "-qm", "retire");
      const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      const bin = path.join(r.dir, "bin"); fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nif [ "$3" = "${failedCommand}" ]; then exit 128; fi\nexec '${realGit.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
      const output = r.run("save", "", { PATH: `${bin}:${process.env.PATH}` });
      assert.match(output, /WARNING sync deferred/);
      assert.equal(r.get(r.repo, "a.md"), null);
      assert.equal(r.get(r.repo, "MEMORY.md"), "# idx\n");
      assert.equal(r.get(r.live, "a.md"), topic("a", "alpha"));
      assert.equal(r.get(r.live, "MEMORY.md"), "# idx\n- [A](a.md)\n");
      assert.equal(r.get(base, ".head"), oldHead);
      assert.equal(r.get(base, "MEMORY.md"), "# idx\n- [A](a.md)\n");
      assert.doesNotMatch(r.run("save"), /WARNING/);
      assert.equal(r.get(r.live, "a.md"), null, "recovery succeeds after git works again");
    } finally { r.done(); }
  });
}
