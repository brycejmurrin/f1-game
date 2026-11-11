// apex-memory — the cross-host CLI for the shared .claude/memory/ store.
// Run: node --test tests/unit/apex-memory.test.mjs
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = path.join(ROOT, "tools/env/apex-memory.mjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mem-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mem = path.join(root, ".claude/memory");
  const tool = path.join(root, "tools/env/apex-memory.mjs");
  fs.mkdirSync(mem, { recursive: true });
  fs.mkdirSync(path.dirname(tool), { recursive: true });
  // The production tool derives its root from its own location. Copying it
  // exercises that exact contract without adding a mutation-root override.
  fs.copyFileSync(TOOL, tool);
  fs.writeFileSync(path.join(mem, "MEMORY.md"),
    "# idx\n- [A](a.md) — alpha\n- [B](b.md) — beta\n");
  fs.writeFileSync(path.join(mem, "a.md"), "---\ntype: feedback\n---\na\n");
  fs.writeFileSync(path.join(mem, "b.md"), "---\ntype: feedback\n---\nb\n");
  const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", cwd: root });
  const read = (file) => fs.readFileSync(path.join(mem, file), "utf8");
  return { root, mem, run, read };
}

test("apex-memory list/show/retire mutates only a copied throwaway store", (t) => {
  const { mem, run, read } = fixture(t);
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.equal(help.stdout, "usage: node tools/env/apex-memory.mjs <list|show|retire> [file.md]\n  Shared auto-memory store (.claude/memory/). Every host reads the same files.\n  Coordination rules: AGENTS.md §Coordination. Details: docs/notes/AGENT-MEMORY.md.\n");
  const list = run("list");
  assert.equal(list.status, 0);
  assert.equal(list.stdout, "2 memories in .claude/memory/\n- a.md\tA — alpha\n- b.md\tB — beta\n");
  const originalB = read("b.md");
  const show = run("show", "a.md");
  assert.equal(show.status, 0);
  assert.equal(show.stdout, read("a.md"));
  const retired = run("retire", "a.md");
  assert.equal(retired.status, 0, retired.stderr);
  assert.equal(retired.stdout, "retired a.md; index now 1 entries. Commit .claude/memory/ on a memory-change: PR.\n");
  assert.equal(fs.existsSync(path.join(mem, "a.md")), false);
  assert.equal(read("MEMORY.md"), "# idx\n- [B](b.md) — beta\n");
  assert.equal(read("b.md"), originalB);
  assert.equal(run("list").stdout, "1 memories in .claude/memory/\n- b.md\tB — beta\n");
  const missing = run("show", "a.md");
  assert.equal(missing.status, 1);
  assert.equal(missing.stderr, "not found: .claude/memory/a.md\n");
});

test("apex-memory retires orphan and dangling index entries; missing/protected requests preserve the store", (t) => {
  const { root, mem, run, read } = fixture(t);
  fs.writeFileSync(path.join(mem, "orphan.md"), "orphan\n");
  assert.equal(run("list").stdout, "2 memories in .claude/memory/\n- a.md\tA — alpha\n- b.md\tB — beta\norphans (on disk, not in index): orphan.md\n");
  assert.equal(run("retire", "orphan.md").status, 0);
  assert.equal(fs.existsSync(path.join(mem, "orphan.md")), false);
  assert.equal(read("MEMORY.md"), "# idx\n- [A](a.md) — alpha\n- [B](b.md) — beta\n");
  fs.unlinkSync(path.join(mem, "a.md"));
  assert.equal(run("retire", "a.md").status, 0);
  assert.equal(read("MEMORY.md"), "# idx\n- [B](b.md) — beta\n");
  const before = new Map(fs.readdirSync(mem).map((name) => [name, read(name)]));
  for (const [name, code, message] of [
    ["missing.md", 1, /nothing to retire/],
    ["MEMORY.md", 2, /refuse to retire MEMORY\.md/],
  ]) {
    const result = run("retire", name);
    assert.equal(result.status, code);
    assert.match(result.stderr, message);
    assert.deepEqual(new Map(fs.readdirSync(mem).map((file) => [file, read(file)])), before);
  }
  // A path argument is deliberately confined to the store's basename.
  const outside = path.join(root, "outside.md");
  fs.writeFileSync(outside, "outside\n");
  assert.equal(run("retire", "../../outside.md").status, 1);
  assert.equal(fs.readFileSync(outside, "utf8"), "outside\n");
  assert.deepEqual(new Map(fs.readdirSync(mem).map((file) => [file, read(file)])), before);
});
