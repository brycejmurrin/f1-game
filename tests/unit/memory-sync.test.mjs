// memory-sync — .claude/hooks/memory-sync.sh is a one-way SessionStart restore
// (2026-11-03, plan §4.9): the tracked .claude/memory/ copy is put where the CLI
// reads auto memory, the repo wins, and nothing is saved back (the three-way
// sync, its baseline dir and the assume-unchanged mark are gone: a memory that
// should outlive the session is edited in .claude/memory/ and committed).
// Drives the REAL script in a throwaway repo under artifacts/ (never /tmp).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
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
  const run = (mode, extraEnv = {}) => {
    const r = spawnSync("bash", [HOOK, mode], { input: "", encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: main, CLAUDE_CONFIG_DIR: cfg, APEX_MEMORY_SYNC: "1", CLAUDE_CODE_REMOTE: "", ...extraEnv } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const put = (d, f, t) => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  const get = (d, f) => { try { return fs.readFileSync(path.join(d, f), "utf8"); } catch (_) { return null; } };
  return { dir, main, live, repo, run, put, get, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("a fresh container restores every tracked memory into the live dir keyed on the main checkout", () => {
  const r = rig();
  try {
    r.put(r.repo, "MEMORY.md", "# idx\n- [A](a.md)\n");
    r.put(r.repo, "a.md", topic("a", "alpha"));
    assert.match(r.run("restore"), /memory: 2 in from \.claude\/memory\//);
    assert.equal(r.get(r.live, "a.md"), topic("a", "alpha"));
    assert.equal(r.get(r.live, "MEMORY.md"), "# idx\n- [A](a.md)\n");
    assert.match(r.run("restore"), /memory: 0 in/, "a second restore copies nothing (in step)");
  } finally { r.done(); }
});

test("the repo wins: a live edit is overwritten on restore and never written back", () => {
  const r = rig();
  try {
    r.put(r.repo, "a.md", topic("a", "repo"));
    r.run("restore");
    r.put(r.live, "a.md", topic("a", "live edit"));
    r.put(r.live, "new.md", topic("new", "session-only"));
    assert.match(r.run("restore"), /memory: 1 in/);
    assert.equal(r.get(r.live, "a.md"), topic("a", "repo"), "the repo copy replaces the live edit");
    assert.equal(r.get(r.repo, "new.md"), null, "nothing flows live → repo");
    assert.equal(r.get(r.live, "new.md"), topic("new", "session-only"), "a live-only file is left alone (not deleted)");
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: r.main, encoding: "utf8" }).includes("new.md"), false);
  } finally { r.done(); }
});

test("save and unmark are no-ops that exit 0; off a cloud session nothing runs", () => {
  const r = rig();
  try {
    r.put(r.repo, "a.md", topic("a", "x"));
    assert.equal(r.run("save"), "", "save does nothing");
    assert.equal(r.run("unmark"), "", "unmark does nothing");
    assert.equal(r.get(r.live, "a.md"), null, "no copy happened");
    assert.equal(r.run("restore", { APEX_MEMORY_SYNC: "", CLAUDE_CODE_REMOTE: "" }), "", "a laptop keeps its own live dir");
    assert.equal(r.get(r.live, "a.md"), null);
    assert.ok(!fs.existsSync(path.join(r.main, "artifacts/.memory-base")), "no baseline dir");
    const idx = execFileSync("git", ["ls-files", "-v"], { cwd: r.main, encoding: "utf8" });
    assert.doesNotMatch(idx, /^h /m, "no assume-unchanged mark");
  } finally { r.done(); }
});

test("settings.json runs restore once on SessionStart and never a save; session-start.sh no longer calls it", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const cmds = (ev) => (settings.hooks?.[ev] || []).flatMap((g) => (g.hooks || []).map((h) => h.command));
  assert.equal(cmds("SessionStart").filter((c) => /memory-sync\.sh" restore$/.test(c)).length, 1);
  for (const ev of ["PostToolUse", "Stop", "PreToolUse", "UserPromptSubmit"])
    assert.ok(!cmds(ev).some((c) => c.includes("memory-sync")), `${ev} must not run memory-sync`);
  assert.equal(settings.hooks.Stop, undefined, "no Stop hooks remain");
  assert.equal(settings.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "0", "auto memory stays forced on in remote sessions");
  const start = fs.readFileSync(path.join(ROOT, ".claude/hooks/session-start.sh"), "utf8");
  assert.doesNotMatch(start, /memory-sync\.sh" restore/);
  assert.doesNotMatch(start, /live-run\.py/);
  const src = fs.readFileSync(HOOK, "utf8");
  for (const gone of ["assume-unchanged", "memory-base", "merge_index", "unmark"]) assert.ok(!src.includes(gone), `memory-sync.sh still has ${gone}`);
  assert.match(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^!\.claude\/memory\/$/m, ".claude/memory/ stays tracked");
});
