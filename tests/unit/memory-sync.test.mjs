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
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/memory-sync.sh");
const topic = (name, body) => `---\nname: ${name}\ndescription: d\nmetadata:\n  type: feedback\n---\n\n${body}\n`;

function rig() {
  const dir = path.join(ROOT, "artifacts", `memory-sync-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const main = path.join(dir, "repo"), cfg = path.join(dir, "config");
  fs.mkdirSync(path.join(main, ".claude/memory"), { recursive: true });
  execFileSync("git", ["init", "-q", main]);
  const real = fs.realpathSync(main);
  const live = path.join(cfg, "projects", real.replace(/[^A-Za-z0-9]/g, "-"), "memory");
  const repo = path.join(main, ".claude/memory");
  const run = (mode, input = "") => {
    const r = spawnSync("bash", [HOOK, mode], { input, encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: main, CLAUDE_CONFIG_DIR: cfg, APEX_MEMORY_SYNC: "1", CLAUDE_CODE_REMOTE: "" } });
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
