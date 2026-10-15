// cross-tool-guards — the guards every agent host obeys, not just Claude Code.
// Claude runs .claude/hooks/bash-guard.sh as a PreToolUse hook; Cursor
// (.cursor/hooks.json) and Codex (.codex/hooks.json) reach the same script
// through .cursor/hooks/shell-guard.sh, and .githooks/ holds the git-level
// commit and push rules for any host (docs/notes/AGENT-GUARDS-2026-10-14.md).
// The pre-push rules run against real git in a throwaway repo under
// artifacts/; the adapter runs the real guard. A few seconds.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ZERO = "0".repeat(40);

test("each host's hook config points at an executable guard that exists", () => {
  const cursor = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
  assert.equal(cursor.version, 1);
  assert.match(cursor.hooks.beforeShellExecution[0].command, /\.cursor\/hooks\/shell-guard\.sh/);
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8"));
  assert.match(codex.hooks.PreToolUse[0].hooks[0].command, /\.cursor\/hooks\/shell-guard\.sh/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts.prepare || "", /git config core\.hooksPath \.githooks/, "npm install must activate .githooks");
  for (const f of [".cursor/hooks/shell-guard.sh", ".githooks/pre-commit", ".githooks/pre-push", ".claude/hooks/bash-guard.sh"])
    assert.ok(fs.statSync(path.join(ROOT, f)).mode & 0o111, `${f} must be executable`);
});

const guard = (payload) => spawnSync("bash", [path.join(ROOT, ".cursor/hooks/shell-guard.sh")],
  { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDECODE: "" } });

test("the adapter blocks what bash-guard blocks, from Cursor's and Codex's payload shapes", () => {
  assert.equal(guard({ command: "pkill -f chrome", cwd: ROOT }).status, 2, "Cursor shape: pkill -f");
  assert.equal(guard({ tool_name: "Bash", tool_input: { command: "git push --force origin x" } }).status, 2, "Codex shape: force push");
  assert.equal(guard({ command: "git push origin claude/f1-game-project-26h3ng", cwd: ROOT }).status, 2, "deploy-branch push");
  assert.equal(guard({ command: "ls -la", cwd: ROOT }).status, 0, "an ordinary command passes");
});

test("pre-push refuses the deploy branch, deletes and rewrites; passes a fast-forward and a new branch", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "prepush-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "a"); const a = git("rev-parse", "HEAD");
    git("commit", "-q", "--allow-empty", "-m", "b"); const b = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "side", a); git("commit", "-q", "--allow-empty", "-m", "c"); const c = git("rev-parse", "HEAD");
    const push = (line) => spawnSync("bash", [path.join(ROOT, ".githooks/pre-push"), "origin", "x"], { cwd: dir, input: line + "\n", encoding: "utf8" });
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${a}`).status, 0, "fast-forward");
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${ZERO}`).status, 0, "new branch");
    assert.equal(push(`refs/heads/x ${c} refs/heads/cursor/t-1 ${b}`).status, 1, "rewrite (force push)");
    assert.equal(push(`(delete) ${ZERO} refs/heads/cursor/t-1 ${b}`).status, 1, "delete");
    assert.equal(push(`refs/heads/x ${b} refs/heads/claude/f1-game-project-26h3ng ${a}`).status, 1, "deploy branch");
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${"f".repeat(40)}`).status, 1, "remote moved, not fetched");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-commit stands aside for Claude Code (its PreToolUse hook already ran the gate) and on APEX_SKIP_GUARDS=1", () => {
  for (const env of [{ CLAUDECODE: "1" }, { CLAUDECODE: "", APEX_SKIP_GUARDS: "1" }]) {
    const r = spawnSync("bash", [path.join(ROOT, ".githooks/pre-commit")], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status, 0, JSON.stringify(env));
  }
});
