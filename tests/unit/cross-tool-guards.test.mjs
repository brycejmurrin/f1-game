// cross-tool-guards — the guards every agent host obeys, not just Claude Code.
// Claude runs .claude/hooks/bash-guard.sh as a PreToolUse hook; Cursor
// (.cursor/hooks.json) and Codex (.codex/hooks.json) reach the same script
// through .cursor/hooks/shell-guard.sh (Codex normalizes its answer through
// .codex/hooks/shell-guard.sh), and .githooks/ holds the git-level
// commit and push rules for any host (docs/notes/AGENT-GUARDS-2026-10-14.md).
// The pre-push rules run against real git in a throwaway repo under
// artifacts/; the adapter runs the real guard. A few seconds.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ZERO = "0".repeat(40);

// Run the real adapters against a disposable delegated guard, including failures
// that a live GitHub call must never be used to reproduce.
function adapterFixture(adapter, delegate, script, payload = {}) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "adapter-verdict-"));
  try {
    for (const [file, source] of [[adapter, fs.readFileSync(path.join(ROOT, adapter), "utf8")], [delegate, script]]) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), source);
    }
    return spawnSync("bash", [path.join(dir, adapter)], {
      input: JSON.stringify(payload), encoding: "utf8", cwd: dir, timeout: 5000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("MCP adapters deny delegated failures and malformed decisions", () => {
  const payload = { tool_name: "mcp__github__merge_pull_request", tool_input: {} };
  for (const adapter of [".codex/hooks/mcp-guard.sh", ".cursor/hooks/mcp-guard.sh"]) {
    for (const script of ["exit 1", "exit 2", "printf 'not json'", "printf '{}'", "printf '[]'",
      `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"unexpected"}}'`]) {
      const r = adapterFixture(adapter, ".claude/hooks/github-mcp-guard.sh", script, payload);
      const out = r.stdout.trim() ? JSON.parse(r.stdout) : null;
      const permission = out?.permission || out?.hookSpecificOutput?.permissionDecision;
      assert.equal(permission, "deny", `${adapter}: ${script}\n${r.stderr}`);
    }
    const r = adapterFixture(adapter, ".claude/hooks/github-mcp-guard.sh", "exit 0", payload);
    assert.equal(r.status, 0, `${adapter} preserves a successful silent pass`);
    if (adapter.startsWith(".codex/")) assert.equal(r.stdout.trim(), "");
  }
});

test("Codex shell decisions normalize ask and delegated failures to deny", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8"));
  assert.equal(cfg.hooks.PreToolUse[0].hooks[0].command, "bash .codex/hooks/shell-guard.sh");
  for (const script of ["exit 1", "exit 2", "printf 'not json'", "printf '[]'",
    `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"Confirm this action"}}'`]) {
    const r = adapterFixture(".codex/hooks/shell-guard.sh", ".cursor/hooks/shell-guard.sh", script);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny", script);
  }
  for (const script of ["exit 0", `printf '%s' '{"hookSpecificOutput":{"additionalContext":"advice"}}'`]) {
    const r = adapterFixture(".codex/hooks/shell-guard.sh", ".cursor/hooks/shell-guard.sh", script);
    assert.equal(r.status, 0, r.stderr);
    if (r.stdout.trim()) assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, "advice");
  }
});

test("each host's hook config points at an executable guard that exists", () => {
  const cursor = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
  assert.equal(cursor.version, 1);
  assert.match(cursor.hooks.beforeShellExecution[0].command, /\.cursor\/hooks\/shell-guard\.sh/);
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8"));
  assert.match(codex.hooks.PreToolUse[0].hooks[0].command, /\.codex\/hooks\/shell-guard\.sh/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts.prepare || "", /git config core\.hooksPath \.githooks/, "npm install must activate .githooks");
  assert.match(cursor.hooks.beforeMCPExecution[0].command, /\.cursor\/hooks\/mcp-guard\.sh/);
  assert.equal(cursor.hooks.beforeMCPExecution[0].failClosed, true, "a crashed MCP guard must block, not pass");
  for (const f of [".codex/hooks/shell-guard.sh", ".cursor/hooks/shell-guard.sh", ".cursor/hooks/mcp-guard.sh", ".githooks/pre-commit", ".githooks/pre-push", ".claude/hooks/bash-guard.sh"])
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

/** A committed copy of the gate files under `dir` and their sha256s: since 2026-10-26 the hook refuses a receipt
 *  whose gate files are not the committed ones (merge_policy.gate_files_check; the O23 incident). */
function committedGate(dir) {
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  if (!fs.existsSync(path.join(dir, ".git"))) { g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t"); }
  const out = {};
  for (const f of ["tools/ci/merge-gate.mjs", "tools/ci/ready-gate.mjs", "tools/lib/gate-receipt.mjs"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    out[f] = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
  }
  g("add", "tools"); g("commit", "-qm", "gate files");
  return out;
}

// 2026-10-15: run cancels under the owner's account kept landing after both
// Claude doors refused them; Cursor's MCP door had no guard at all.
test("Cursor's MCP door: a run cancel is denied (exit 2), every merge is denied, a read passes", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "cursor-mcp-"));
  const mcp = (tool_name, input, env = {}) => {
    const r = spawnSync("bash", [path.join(ROOT, ".cursor/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name, tool_input: JSON.stringify(input), mcp_server_name: "github" }), encoding: "utf8",
        env: { ...process.env, APEX_RUN_CANCEL_OK: "", APEX_MERGE_DESK: "", CLAUDE_PROJECT_DIR: dir, ...env } });
    return { status: r.status, permission: JSON.parse(r.stdout).permission };
  };
  try {
    for (const method of ["cancel_workflow_run", "force_cancel_workflow_run"])
      assert.deepEqual(mcp("actions_run_trigger", { method, run_id: 1 }), { status: 2, permission: "deny" }, method);
    assert.equal(mcp("actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }, { APEX_RUN_CANCEL_OK: "1" }).permission, "allow");
    assert.equal(mcp("merge_pull_request", { pullNumber: 1, merge_method: "squash" }).permission, "deny");
    const head = "a".repeat(40);
    assert.deepEqual(mcp("merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), { status: 2, permission: "deny" }, "no merge-gate receipt");
    fs.mkdirSync(path.join(dir, "artifacts/merge-gate"), { recursive: true });
    fs.writeFileSync(path.join(dir, "artifacts/merge-gate/1.json"), JSON.stringify({ kind: "merge", pr: 1, head, ok: true, at: new Date().toISOString(), gateRoot: dir, gateFiles: committedGate(dir) }));
    assert.deepEqual(mcp("merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), { status: 2, permission: "deny" }, "a hand-written merge receipt opens nothing (WP-L4)");
    assert.deepEqual(mcp("pull_request_read", { method: "get", pullNumber: 1 }), { status: 0, permission: "allow" });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Codex had only a Bash hook, so an MCP merge skipped the gate (fleet redesign §8; Bryce approved the
// hook 2026-10-19). Codex reads Claude's hookSpecificOutput JSON but cannot "ask" (it fails the hook
// and continues the call: https://learn.chatgpt.com/docs/hooks), so the wrapper turns every ask into a deny.
test("Codex's MCP door guards legacy and hosted GitHub operations: an ask becomes a deny, every merge is denied", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "codex-mcp-"));
  const mcp = (tool_name, input, env = {}) => {
    const r = spawnSync("bash", [path.join(ROOT, ".codex/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name, tool_input: input, hook_event_name: "PreToolUse" }), encoding: "utf8",
        env: { ...process.env, APEX_RUN_CANCEL_OK: "", APEX_MERGE_DESK: "", CLAUDE_PROJECT_DIR: dir, ...env } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
  };
  try {
    const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse;
    const g = hooks.find((x) => x.hooks.some((h) => h.command.includes(".codex/hooks/mcp-guard.sh")));
    assert.ok(g, ".codex/hooks.json wires the MCP guard");
    const re = new RegExp(g.matcher);
    const prefixes = ["mcp__github__", "mcp__gh__", "mcp__custom_github__", "mcp__codex_apps__github_"];
    const writes = ["push_files", "create_or_update_file", "create_branch", "delete_file"];
    for (const prefix of prefixes)
      for (const op of ["merge_pull_request", "enable_pr_auto_merge", "update_pull_request", "actions_run_trigger", ...writes])
        assert.ok(re.test(prefix + op), prefix + op);
    for (const n of ["mcp__github__pull_request_read", "Bash", "mcp__github__update_pull_request_branch",
      "mcp__codex_apps__gitlab_merge_pull_request", "mcp__codex_apps__github_merge_pull_request_extra"])
      assert.ok(!re.test(n), `matcher must not catch ${n}`);
    const head = "a".repeat(40);
    for (const prefix of prefixes) {
      for (const merge_method of ["squash", "rebase"])
        assert.equal(mcp(prefix + "merge_pull_request", { pullNumber: 1, merge_method }), "deny", prefix + merge_method);
      assert.equal(mcp(prefix + "merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), "deny", prefix + "no merge-gate receipt");
      assert.equal(mcp(prefix + "enable_pr_auto_merge", { pullNumber: 1 }), "deny", prefix + "auto-merge ask becomes a deny");
      assert.equal(mcp(prefix + "actions_run_trigger", { method: "rerun_failed_jobs", run_id: 1 }), "deny", prefix + "re-run ask becomes a deny");
      assert.equal(mcp(prefix + "actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }), "deny", prefix + "cancel");
      for (const op of writes) assert.equal(mcp(prefix + op, {}), "deny", prefix + op);
      assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, draft: false }), "deny", prefix + "no ready-gate receipt");
      assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, state: "closed" }), "deny", prefix + "close ask becomes a deny");
      assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, body: "x" }), null, prefix + "body edit passes");
      for (const input of [undefined, null, [], false, 1, "not JSON", "[]"])
        assert.equal(mcp(prefix + "update_pull_request", input), "deny", prefix + "malformed input " + JSON.stringify(input));
    }
    fs.mkdirSync(path.join(dir, "artifacts/merge-gate"), { recursive: true });
    fs.writeFileSync(path.join(dir, "artifacts/merge-gate/1.json"), JSON.stringify({ kind: "merge", pr: 1, head, ok: true, at: new Date().toISOString(), gateRoot: dir, gateFiles: committedGate(dir) }));
    for (const prefix of prefixes) {
      assert.equal(mcp(prefix + "merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), "deny", prefix + "a hand-written merge receipt opens nothing (WP-L4)");
      assert.equal(mcp(prefix + "update_pull_request", JSON.stringify({ pullNumber: 1, body: "x" })), null, prefix + "a JSON-object string body edit passes");
    }
    // the hosted connector names the PR `pr_number`: the ready door must see it as #1, not "no PR number"
    const r = spawnSync("bash", [path.join(ROOT, ".codex/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name: "mcp__codex_apps__github_update_pull_request", tool_input: { pr_number: 1, draft: false } }),
        encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    const why = JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
    assert.match(why, /#1/, why);
    assert.doesNotMatch(why, /no PR number/, why);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Codex MCP adapter leaves unrelated hosted providers and read operations outside the shared GitHub policy", () => {
  for (const tool_name of ["mcp__codex_apps__gitlab_merge_pull_request", "mcp__github__pull_request_read"]) {
    const r = adapterFixture(".codex/hooks/mcp-guard.sh", ".claude/hooks/github-mcp-guard.sh", "exit 1", { tool_name, tool_input: {} });
    assert.equal(r.status, 0, tool_name + ": " + r.stderr);
    assert.equal(r.stdout.trim(), "", tool_name + " must not reach the refusing delegate");
  }
});

test("pre-push refuses the deploy branch, deletes and rewrites; passes a fast-forward and a new branch", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "prepush-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "a"); const a = git("rev-parse", "HEAD");
    git("commit", "-q", "--allow-empty", "-m", "b"); const b = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "side", a); git("commit", "-q", "--allow-empty", "-m", "c"); const c = git("rev-parse", "HEAD");
    const push = (line, extra = {}) => { const env = { ...process.env, ...extra }; if (!("GITHUB_ACTIONS" in extra)) delete env.GITHUB_ACTIONS; return spawnSync("bash", [path.join(ROOT, ".githooks/pre-push"), "origin", "x"], { cwd: dir, input: line + "\n", encoding: "utf8", env }); };
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${a}`).status, 0, "fast-forward");
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${ZERO}`).status, 0, "new branch");
    assert.equal(push(`refs/heads/x ${c} refs/heads/cursor/t-1 ${b}`).status, 1, "rewrite (force push)");
    assert.equal(push(`(delete) ${ZERO} refs/heads/cursor/t-1 ${b}`).status, 1, "delete");
    assert.equal(push(`refs/heads/x ${b} refs/heads/claude/f1-game-project-26h3ng ${a}`).status, 1, "deploy branch");
    assert.equal(push(`refs/heads/x ${b} refs/heads/cursor/t-1 ${"f".repeat(40)}`).status, 1, "remote moved, not fetched");
    // spec-timings.yml's rolling force-push: exact ref, GitHub Actions only.
    const CI = { GITHUB_ACTIONS: "true" };
    assert.equal(push(`refs/heads/x ${c} refs/heads/bot/spec-timings ${b}`, CI).status, 0, "bot/spec-timings rewrite in Actions");
    assert.equal(push(`refs/heads/x ${c} refs/heads/bot/spec-timings ${b}`).status, 1, "bot/spec-timings rewrite outside Actions");
    assert.equal(push(`refs/heads/x ${c} refs/heads/cursor/t-1 ${b}`, CI).status, 1, "other branch rewrite in Actions");
    assert.equal(push(`refs/heads/x ${c} refs/heads/bot/spec-timings-x ${b}`, CI).status, 1, "near-miss ref in Actions");
    assert.equal(push(`(delete) ${ZERO} refs/heads/bot/spec-timings ${b}`, CI).status, 1, "bot/spec-timings delete in Actions");
    assert.equal(push(`refs/heads/x ${b} refs/heads/claude/f1-game-project-26h3ng ${a}`, CI).status, 1, "deploy branch in Actions");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-commit only honours the explicit guards-maintenance bypass", () => {
  const r=spawnSync("bash",[path.join(ROOT,".githooks/pre-commit")],{cwd:ROOT,encoding:"utf8",env:{...process.env,CLAUDECODE:"1",APEX_SKIP_GUARDS:"1"}});
  assert.equal(r.status,0,r.stderr);
  const src=fs.readFileSync(path.join(ROOT,".githooks/pre-commit"),"utf8");
  assert.doesNotMatch(src,/\[ -n "\$\{CLAUDECODE:-\}" \] && exit 0/);
});
test("a real worktree commit isolates guard fixtures while preserving its branch and staged index", () => {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "precommit-context-"));
  const base = path.join(dir, "base"), linked = path.join(dir, "linked"), other = path.join(dir, "other");
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", CLAUDECODE: "", APEX_SKIP_GUARDS: "" };
  // The regression itself must also be safe when a caller runs it from a hook.
  for (const name of execFileSync("git", ["rev-parse", "--local-env-vars"], { cwd: ROOT, encoding: "utf8" }).trim().split(/\s+/)) delete env[name];
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const write = (rel, text) => { const file = path.join(base, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  try {
    fs.mkdirSync(base); fs.mkdirSync(other);
    git(base, "init", "-q"); git(other, "init", "-q");
    write(".githooks/pre-commit", fs.readFileSync(path.join(ROOT, ".githooks/pre-commit"), "utf8"));
    fs.chmodSync(path.join(base, ".githooks/pre-commit"), 0o755);
    write("tools/gen/targets.mjs", "// No generated targets in this fixture.\n");
    write("tools/check/ratchets.mjs", "// Read-only fixture of the ratchet stage.\n");
    const verify = `import assert from 'node:assert/strict';\nimport {execFileSync} from 'node:child_process';\nconst actual=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:process.env.APEX_OTHER_REPO,encoding:'utf8'}).trim();\nassert.equal(actual,process.env.APEX_OTHER_REPO,'fixture Git must use its own repository');\nassert.equal(process.env.GIT_DIR,undefined);\nassert.equal(process.env.GIT_INDEX_FILE,undefined);\n`;
    write("tests/unit/docs-integrity.test.mjs", verify);
    write("guard-fixture.mjs", verify);
    write("bin/npm", '#!/usr/bin/env bash\nexec "' + process.execPath + '" guard-fixture.mjs\n');
    fs.chmodSync(path.join(base, "bin/npm"), 0o755);
    write("code.js", "// initial\n"); write(".gitignore", "artifacts/\nnode_modules/\n");
    git(base, "add", "."); git(base, "commit", "-q", "-m", "fixture base");
    git(base, "worktree", "add", "-q", "-b", "guarded", linked);
    git(base, "config", "core.hooksPath", ".githooks");
    fs.mkdirSync(path.join(linked, "node_modules"));
    const hookEnv = { ...env, PATH: path.join(linked, "bin") + path.delimiter + env.PATH, APEX_OTHER_REPO: other };
    for (const file of ["code.js", "README.md"]) {
      fs.writeFileSync(path.join(linked, file), "// changed " + file + "\n");
      git(linked, "add", file);
      const before = git(linked, "rev-parse", "HEAD");
      const commit = spawnSync("git", ["commit", "-q", "-m", "guarded " + file], { cwd: linked, env: hookEnv, encoding: "utf8" });
      assert.equal(commit.status, 0, commit.stderr + commit.stdout);
      assert.equal(git(linked, "branch", "--show-current"), "guarded");
      assert.notEqual(git(linked, "rev-parse", "HEAD"), before);
      assert.equal(git(linked, "status", "--porcelain"), "");
      assert.equal(git(base, "config", "core.bare"), "false");
      assert.equal(git(linked, "show", "HEAD:" + file), "// changed " + file);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
