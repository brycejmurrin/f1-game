// cross-tool-guards — the guards every agent host obeys, not just Claude Code.
// Claude runs .claude/hooks/bash-guard.sh and github-mcp-guard.sh as PreToolUse
// hooks; Cursor (.cursor/hooks.json) and Codex (.codex/hooks.json) reach the SAME
// scripts through .cursor/hooks/{shell,mcp}-guard.sh and .codex/hooks/{shell,mcp}-guard.sh,
// and .githooks/pre-push holds the push rules for any host (force, delete, the deploy
// branch, a foreign pusher). The pre-push rules run against real git in a throwaway
// repo under artifacts/; the adapters run the real guards. A few seconds.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
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
  assert.equal(cfg.hooks.PreToolUse[0].hooks[0].command, 'bash "$(git rev-parse --show-toplevel)/.codex/hooks/shell-guard.sh"',
    "Codex runs hooks from the session cwd: resolve the guard from the git root");
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
  for (const f of [".codex/hooks/shell-guard.sh", ".codex/hooks/mcp-guard.sh", ".cursor/hooks/shell-guard.sh", ".cursor/hooks/mcp-guard.sh",
    ".cursor/hooks/edit-guard.sh", ".githooks/pre-commit", ".githooks/pre-push", ".claude/hooks/bash-guard.sh", ".claude/hooks/github-mcp-guard.sh",
    ".claude/hooks/protect-files.sh", ".claude/hooks/mcp-browser-guard.sh"])
    assert.ok(fs.statSync(path.join(ROOT, f)).mode & 0o111, `${f} must be executable`);
  // one script behind every door: the adapters call the Claude hooks, never a copy
  assert.match(fs.readFileSync(path.join(ROOT, ".cursor/hooks/shell-guard.sh"), "utf8"), /\.claude\/hooks\/bash-guard\.sh/);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, ".cursor/hooks/shell-guard.sh"), "utf8"), /protect-files/, "Bash writes are no longer parsed");
  assert.match(fs.readFileSync(path.join(ROOT, ".cursor/hooks/edit-guard.sh"), "utf8"), /\.claude\/hooks\/protect-files\.sh/);
  for (const door of [".cursor/hooks/mcp-guard.sh", ".codex/hooks/mcp-guard.sh"])
    assert.match(fs.readFileSync(path.join(ROOT, door), "utf8"), /\.claude\/hooks\/github-mcp-guard\.sh/, `${door} delegates to the one table`);
});

// The one GitHub-tool table (github-mcp-guard.sh GUARDED) and the two matchers that route to it must be the same set:
// the Codex door was missing issue_write until 2026-11-03 (plan §4.8).
test("the three doors guard the same GitHub tool set", () => {
  const ops = (re) => [...re.matchAll(/[a-z_]+/g)].map((m) => m[0]).filter((w) => w.includes("_")).sort();
  const guard = fs.readFileSync(path.join(ROOT, ".claude/hooks/github-mcp-guard.sh"), "utf8");
  const guarded = ops(guard.match(/GUARDED = re\.compile\(r"__\(([^)]+)\)\$"\)/)[1]);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const claude = settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  assert.ok(claude, "settings.json routes GitHub tools through github-mcp-guard.sh");
  assert.deepEqual(ops(claude.matcher.match(/\(([^)]+)\)\$$/)[1]), guarded, "settings.json matcher");
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse
    .find((g) => g.hooks.some((h) => h.command.includes("mcp-guard.sh")));
  assert.deepEqual(ops(codex.matcher.match(/\(([a-z_|]+)\)\$$/)[1]), guarded, ".codex/hooks.json matcher");
  const codexSh = fs.readFileSync(path.join(ROOT, ".codex/hooks/mcp-guard.sh"), "utf8");
  assert.deepEqual(ops(codexSh.match(/\(([a-z_|]+)\)", data\["tool_name"\]/)[1]), guarded, ".codex/hooks/mcp-guard.sh normaliser");
  assert.ok(guarded.includes("issue_write") && guarded.includes("disable_pr_auto_merge") && guarded.includes("update_pull_request_branch"));
  // Cursor's door has no matcher: every MCP call reaches the table, and the table passes the rest
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8")).hooks.beforeMCPExecution[0].matcher, undefined);
});

const guard = (payload) => spawnSync("bash", [path.join(ROOT, ".cursor/hooks/shell-guard.sh")],
  { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDECODE: "" } });

test("the shell adapter blocks what bash-guard blocks, from Cursor's and Codex's payload shapes", () => {
  const cursor = guard({ command: "pkill -f chrome", cwd: ROOT });
  assert.equal(cursor.status, 2, "Cursor shape: pkill -f");
  const why = "BLOCKED: pkill kills by name or command line: with -f it matches your own shell (its command line contains the pattern), "
    + "and either way it takes Playwright's browsers and the parent's run.";
  assert.equal(JSON.parse(cursor.stdout).agent_message.slice(0, why.length), why, "Cursor reads WHY");
  assert.equal(guard({ tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } }).status, 2, "Codex shape: --no-verify");
  assert.equal(guard({ command: "gh pr merge 1", cwd: ROOT }).status, 2, "gh pr merge");
  assert.equal(guard({ command: "ls -la", cwd: ROOT }).status, 0, "an ordinary command passes");
  assert.equal(guard("not json").status, 2, "an unreadable payload is a deny");
});

test("Cursor's MCP door: merges, arms and cancels are denied (exit 2), a close asks, a read passes", () => {
  const mcp = (tool_name, input) => {
    const r = spawnSync("bash", [path.join(ROOT, ".cursor/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name, tool_input: JSON.stringify(input), mcp_server_name: "github" }), encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
    return { status: r.status, permission: JSON.parse(r.stdout).permission };
  };
  for (const method of ["cancel_workflow_run", "force_cancel_workflow_run", "rerun_failed_jobs"])
    assert.deepEqual(mcp("actions_run_trigger", { method, run_id: 1 }), { status: 2, permission: "deny" }, method);
  for (const [tool, input] of [["merge_pull_request", { pullNumber: 1, merge_method: "merge" }], ["merge_pull_request", { pullNumber: 1, merge_method: "squash" }],
    ["enable_pr_auto_merge", { pullNumber: 1 }], ["disable_pr_auto_merge", { pullNumber: 1 }], ["update_pull_request_branch", { pullNumber: 1 }],
    ["push_files", {}], ["create_or_update_file", {}], ["delete_file", {}], ["create_branch", {}]])
    assert.deepEqual(mcp(tool, input), { status: 2, permission: "deny" }, tool);
  assert.deepEqual(mcp("update_pull_request", { pullNumber: 1, state: "closed" }), { status: 0, permission: "ask" });
  assert.deepEqual(mcp("update_pull_request", { pullNumber: 1, draft: false }), { status: 0, permission: "allow" }, "the ready flip is CI's and the Plan gate's to check");
  assert.deepEqual(mcp("pull_request_read", { method: "get", pullNumber: 1 }), { status: 0, permission: "allow" });
});

// Codex reads Claude's hookSpecificOutput JSON but cannot "ask" (it fails the hook and continues the call:
// https://learn.chatgpt.com/docs/hooks), so the wrapper turns every ask into a deny.
test("Codex's MCP door guards legacy and hosted GitHub operations: an ask becomes a deny, every merge is denied", () => {
  const mcp = (tool_name, input) => {
    const r = spawnSync("bash", [path.join(ROOT, ".codex/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name, tool_input: input, hook_event_name: "PreToolUse" }), encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
  };
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse;
  const g = hooks.find((x) => x.hooks.some((h) => h.command.includes(".codex/hooks/mcp-guard.sh")));
  assert.ok(g, ".codex/hooks.json wires the MCP guard");
  const re = new RegExp(g.matcher);
  const prefixes = ["mcp__github__", "mcp__gh__", "mcp__custom_github__", "mcp__codex_apps__github_"];
  const writes = ["push_files", "create_or_update_file", "create_branch", "delete_file"];
  for (const prefix of prefixes)
    for (const op of ["merge_pull_request", "enable_pr_auto_merge", "disable_pr_auto_merge", "update_pull_request", "update_pull_request_branch", "issue_write", "actions_run_trigger", ...writes])
      assert.ok(re.test(prefix + op), prefix + op);
  for (const n of ["mcp__github__pull_request_read", "Bash", "mcp__codex_apps__gitlab_merge_pull_request", "mcp__codex_apps__github_merge_pull_request_extra"])
    assert.ok(!re.test(n), `matcher must not catch ${n}`);
  for (const prefix of prefixes) {
    for (const merge_method of ["squash", "rebase", "merge"])
      assert.equal(mcp(prefix + "merge_pull_request", { pullNumber: 1, merge_method }), "deny", prefix + merge_method);
    assert.equal(mcp(prefix + "enable_pr_auto_merge", { pullNumber: 1 }), "deny", prefix + "arm");
    assert.equal(mcp(prefix + "update_pull_request_branch", { pullNumber: 1 }), "deny", prefix + "update-branch");
    assert.equal(mcp(prefix + "actions_run_trigger", { method: "rerun_failed_jobs", run_id: 1 }), "deny", prefix + "re-run");
    assert.equal(mcp(prefix + "actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }), "deny", prefix + "cancel");
    for (const op of writes) assert.equal(mcp(prefix + op, {}), "deny", prefix + op);
    assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, draft: false }), null, prefix + "the ready flip passes");
    assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, state: "closed" }), "deny", prefix + "close ask becomes a deny");
    assert.equal(mcp(prefix + "update_pull_request", { pullNumber: 1, body: "x" }), null, prefix + "body edit passes");
    assert.equal(mcp(prefix + "issue_write", { method: "update", issue_number: 1, labels: ["hold", "x"] }), null, prefix + "labels that keep hold pass");
    for (const input of [undefined, null, [], false, 1, "not JSON", "[]"])
      assert.equal(mcp(prefix + "update_pull_request", input), "deny", prefix + "malformed input " + JSON.stringify(input));
    assert.equal(mcp(prefix + "update_pull_request", JSON.stringify({ pullNumber: 1, body: "x" })), null, prefix + "a JSON-object string body edit passes");
  }
});

test("Codex MCP adapter leaves unrelated hosted providers and read operations outside the shared GitHub policy", () => {
  for (const tool_name of ["mcp__codex_apps__gitlab_merge_pull_request", "mcp__github__pull_request_read"]) {
    const r = adapterFixture(".codex/hooks/mcp-guard.sh", ".claude/hooks/github-mcp-guard.sh", "exit 1", { tool_name, tool_input: {} });
    assert.equal(r.status, 0, tool_name + ": " + r.stderr);
    assert.equal(r.stdout.trim(), "", tool_name + " must not reach the refusing delegate");
  }
});

const gitEnv = (extra = {}) => ({ ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", ...extra });

test("pre-push refuses the deploy branch, deletes and rewrites; passes a fast-forward and a new branch", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "prepush-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env: gitEnv() }).trim();
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

// Shared safety ban 3 (ported from the retired foreign_push.py bash-guard rule, 2026-11-03): the remote branch gained
// another author's commit since this checkout last pushed it, within the window, and we merged it → the push is refused
// until APEX_FOREIGN_PUSH_OK=1; our own commits, old foreign commits, a first push and an AUTO-SYNC merge pass.
test("pre-push refuses a push over another author's fresh commits; own, old, first-push and auto-sync shapes pass", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "prepush-foreign-"));
  try {
    // No remote needed: the hook reads the tracking ref's reflog (an "update by push" entry is what `git push` writes)
    // and local objects, exactly what a fetched-then-merged branch looks like before the next push.
    const work = path.join(dir, "work");
    fs.mkdirSync(work);
    const git = (...a) => execFileSync("git", a, { cwd: work, encoding: "utf8", env: gitEnv() }).trim();
    const gitAs = (email, extra, ...a) => execFileSync("git", a, { cwd: work, encoding: "utf8", env: gitEnv({ GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email, ...extra }) }).trim();
    git("init", "-q"); git("config", "core.logAllRefUpdates", "always");
    git("config", "user.email", "me@t"); git("config", "user.name", "me");
    git("checkout", "-q", "-b", "cursor/t-1");
    git("commit", "-q", "--allow-empty", "-m", "mine 1");
    const TRACK = "refs/remotes/origin/cursor/t-1";
    git("update-ref", "-m", "update by push", TRACK, "HEAD");             // what this checkout last pushed
    const branch = "refs/heads/cursor/t-1";
    const push = (extra = {}) => spawnSync("bash", [path.join(ROOT, ".githooks/pre-push"), "origin", "file:///nowhere"],
      { cwd: work, input: `${branch} ${git("rev-parse", "HEAD")} ${branch} ${git("rev-parse", TRACK)}\n`, encoding: "utf8", env: gitEnv({ APEX_FOREIGN_PUSH_OK: "", ...extra }) });
    // own commit on top: passes
    git("commit", "-q", "--allow-empty", "-m", "mine 2");
    assert.equal(push().status, 0, "own commits only");
    // another author's commit arrives by FETCH (the tracking ref moves without an "update by push" entry) and is merged
    gitAs("other@t", {}, "commit", "-q", "--allow-empty", "-m", "theirs");
    git("update-ref", "-m", "fetch", TRACK, "HEAD");
    const r = push();
    assert.equal(r.status, 1, "a foreign fresh commit refuses the push: " + r.stderr);
    assert.match(r.stderr, /another author/);
    assert.match(r.stderr, /theirs/);
    assert.equal(push({ APEX_FOREIGN_PUSH_OK: "1" }).status, 0, "the owner's acknowledgement pushes once");
    // (each "pushed" marker below follows an own commit: a no-op ref update writes no reflog entry)
    // outside the window it is history, not news: a foreign commit dated three days ago
    git("commit", "-q", "--allow-empty", "-m", "mine 3"); git("update-ref", "-m", "update by push", TRACK, "HEAD");
    const old = new Date(Date.now() - 3 * 86400e3).toISOString();
    gitAs("other@t", { GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old }, "commit", "-q", "--allow-empty", "-m", "theirs, days ago");
    git("update-ref", "-m", "fetch", TRACK, "HEAD");
    assert.equal(push().status, 0, "a foreign commit outside the window is history");
    assert.equal(push({ APEX_FOREIGN_HOURS: "100" }).status, 1, "…and inside a wider window it is news");
    // the same email but another Claude session (trailer) is foreign; our own session id is not
    // the owner pushed (baseline moves), then the same email but another Claude session (trailer) lands: foreign; our own session id is not
    git("commit", "-q", "--allow-empty", "-m", "mine 4"); git("update-ref", "-m", "update by push", TRACK, "HEAD");
    gitAs("me@t", {}, "commit", "-q", "--allow-empty", "-m", "sibling", "-m", "Claude-Session: https://claude.ai/code/session_01SIBLING");
    git("update-ref", "-m", "fetch", TRACK, "HEAD");
    assert.equal(push({ CLAUDE_CODE_REMOTE_SESSION_ID: "session_01MINE" }).status, 1, "another Claude session's commit is foreign");
    assert.equal(push({ CLAUDE_CODE_REMOTE_SESSION_ID: "session_01SIBLING" }).status, 0, "the same session is not");
    // land.yml's AUTO-SYNC merge of the deploy branch is not foreign
    git("commit", "-q", "--allow-empty", "-m", "mine 5"); git("update-ref", "-m", "update by push", TRACK, "HEAD");
    git("checkout", "-q", "-b", "claude/f1-game-project-26h3ng", "HEAD~3"); git("commit", "-q", "--allow-empty", "-m", "deploy tip");
    git("checkout", "-q", "cursor/t-1");
    gitAs("bryce@t", {}, "merge", "-q", "--no-ff", "-m", "Merge branch 'claude/f1-game-project-26h3ng' into cursor/t-1", "claude/f1-game-project-26h3ng");
    git("update-ref", "-m", "fetch", TRACK, "HEAD");
    assert.equal(push({ APEX_FOREIGN_HOURS: "1" }).status, 0, "a clean auto-sync merge passes");
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

test("Cursor's preToolUse routes MCP:<tool> (the cloud-agent spelling) through the GitHub table; Codex guards apply_patch edits", () => {
  const cur = (payload) => spawnSync("bash", [path.join(ROOT, ".cursor/hooks/edit-guard.sh")], { input: JSON.stringify(payload), encoding: "utf8" });
  const merge = cur({ tool_name: "MCP:merge_pull_request", tool_input: { pullNumber: 1 } });
  assert.equal(merge.status, 2); assert.equal(JSON.parse(merge.stdout).permission, "deny");
  assert.equal(JSON.parse(cur({ tool_name: "MCP:update_pull_request", tool_input: { pullNumber: 1, state: "closed" } }).stdout).permission, "ask");
  assert.equal(cur({ tool_name: "MCP:pull_request_read", tool_input: {} }).status, 0, "a read passes");
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse;
  const edit = codex.find((g) => g.matcher === "apply_patch");
  assert.ok(edit && /\.codex\/hooks\/edit-guard\.sh/.test(edit.hooks[0].command), "Codex wires the edit guard on apply_patch");
  for (const g of codex) assert.match(g.hooks[0].command, /git rev-parse --show-toplevel/, "no cwd-relative hook command");
  const patch = (body) => spawnSync("bash", [path.join(ROOT, ".codex/hooks/edit-guard.sh")],
    { input: JSON.stringify({ tool_name: "apply_patch", tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch\n` } }), encoding: "utf8", cwd: ROOT });
  assert.equal(patch("*** Update File: version.json\n@@\n-a\n+b").status, 2, "a generated file");
  assert.equal(patch("*** Update File: index.html\n@@\n-a\n+b").status, 2, "a generated-block file is refused in this host");
  assert.equal(patch("*** Update File: docs/PHYSICS.md\n@@\n-a\n+b").status, 0, "an authored file");
  assert.equal(patch("*** Add File: scratch/new-note.md\n+x").status, 0, "a new authored file");
  assert.equal(spawnSync("bash", [path.join(ROOT, ".codex/hooks/edit-guard.sh")], { input: "junk", encoding: "utf8" }).status, 2, "fail closed");
});
