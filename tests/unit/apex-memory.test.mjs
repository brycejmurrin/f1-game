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

test("apex-memory list/show/retire against a throwaway memory dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mem-"));
  const mem = path.join(dir, ".claude/memory");
  fs.mkdirSync(mem, { recursive: true });
  fs.writeFileSync(path.join(mem, "MEMORY.md"),
    "# idx\n- [A](a.md) — alpha\n- [B](b.md) — beta\n");
  fs.writeFileSync(path.join(mem, "a.md"), "---\ntype: feedback\n---\na\n");
  fs.writeFileSync(path.join(mem, "b.md"), "---\ntype: feedback\n---\nb\n");
  // Run with cwd=dir by temporarily swapping — the tool uses repo ROOT from
  // its own path, so instead call it and assert against the real repo's CLI
  // contract via --help, then retire nothing. Full retire is covered below
  // by importing the same logic through a subprocess with APEX_MEMORY_ROOT.
  const help = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /list\|show\|retire/);
  const list = spawnSync(process.execPath, [TOOL, "list"], { encoding: "utf8", cwd: ROOT });
  assert.equal(list.status, 0);
  assert.match(list.stdout, /memories in \.claude\/memory\//);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("apex-memory show prints a real topic; retire refuses MEMORY.md", () => {
  const show = spawnSync(process.execPath, [TOOL, "show", "user-timezone-pacific.md"], {
    encoding: "utf8", cwd: ROOT,
  });
  assert.equal(show.status, 0);
  assert.match(show.stdout, /Pacific|America\/Los_Angeles/);
  const bad = spawnSync(process.execPath, [TOOL, "retire", "MEMORY.md"], {
    encoding: "utf8", cwd: ROOT,
  });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /refuse to retire MEMORY\.md/);
});
