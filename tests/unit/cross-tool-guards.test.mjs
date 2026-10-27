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
  for (const adapter of [".codex/hooks/mcp-guard.sh", ".cursor/hooks/mcp-guard.sh"]) {
    for (const script of ["exit 1", "exit 2", "printf 'not json'", "printf '{}'", "printf '[]'",
      `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"unexpected"}}'`]) {
      const r = adapterFixture(adapter, ".claude/hooks/github-mcp-guard.sh", script);
      const out = r.stdout.trim() ? JSON.parse(r.stdout) : null;
      const permission = out?.permission || out?.hookSpecificOutput?.permissionDecision;
      assert.equal(permission, "deny", `${adapter}: ${script}\n${r.stderr}`);
    }
    const r = adapterFixture(adapter, ".claude/hooks/github-mcp-guard.sh", "exit 0");
    assert.equal(r.status, 0, `${adapter} preserves a successful silent pass`);
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
test("Cursor's MCP door: a run cancel is denied (exit 2), a merge needs the gate receipt, a read passes", () => {
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
    assert.deepEqual(mcp("merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), { status: 0, permission: "allow" }, "gated merge passes");
    assert.deepEqual(mcp("pull_request_read", { method: "get", pullNumber: 1 }), { status: 0, permission: "allow" });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Codex had only a Bash hook, so an MCP merge skipped the gate (fleet redesign §8; Bryce approved the
// hook 2026-10-19). Codex reads Claude's hookSpecificOutput JSON but cannot "ask" (it fails the hook
// and continues the call: https://learn.chatgpt.com/docs/hooks), so the wrapper turns every ask into a deny.
test("Codex's MCP door: the GitHub guard runs, an ask becomes a deny, a gated merge passes", () => {
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
    for (const n of ["mcp__github__merge_pull_request", "mcp__gh__enable_pr_auto_merge", "mcp__github__update_pull_request", "mcp__github__actions_run_trigger"]) assert.ok(re.test(n), n);
    for (const n of ["mcp__github__pull_request_read", "Bash", "mcp__github__update_pull_request_branch"]) assert.ok(!re.test(n), `matcher must not catch ${n}`);
    const head = "a".repeat(40);
    assert.equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "squash" }), "deny");
    assert.equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), "deny", "no merge-gate receipt");
    assert.equal(mcp("mcp__github__enable_pr_auto_merge", { pullNumber: 1 }), "deny", "the guard's ask (no MERGE method) becomes a deny");
    assert.equal(mcp("mcp__github__actions_run_trigger", { method: "rerun_failed_jobs", run_id: 1 }), "deny", "a re-run ask becomes a deny");
    assert.equal(mcp("mcp__github__actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }), "deny");
    fs.mkdirSync(path.join(dir, "artifacts/merge-gate"), { recursive: true });
    fs.writeFileSync(path.join(dir, "artifacts/merge-gate/1.json"), JSON.stringify({ kind: "merge", pr: 1, head, ok: true, at: new Date().toISOString(), gateRoot: dir, gateFiles: committedGate(dir) }));
    assert.equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), null, "gated merge passes");
    assert.equal(mcp("mcp__github__update_pull_request", { pullNumber: 1, body: "x" }), null, "a body edit passes");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// W0 of the 2026-10-26 Codex parity plan (archive-mining finding R2-2): Codex's GitHub
// connector reaches hooks as mcp__codex_apps__github_<tool> (session-contracts.test.mjs fixture shape) and sends
// pr_number / expected_head_sha; the old matcher needed "__" before the tool, so merges, ready flips, forced
// update_ref and Git Data pushes ran unguarded. No live Codex connector payload is captured yet: the matcher also
// accepts "." between github and the tool.
test("Codex connector shape: merge/ready need receipts, forced or deploy-branch refs and Git Data pushes are denied", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "codex-connector-"));
  const mcp = (tool, input) => {
    const r = spawnSync("bash", [path.join(ROOT, ".codex/hooks/mcp-guard.sh")],
      { input: JSON.stringify({ tool_name: tool, tool_input: input, hook_event_name: "PreToolUse" }), encoding: "utf8",
        env: { ...process.env, APEX_RUN_CANCEL_OK: "", APEX_MERGE_DESK: "", CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  };
  const C = "mcp__codex_apps__github_";
  try {
    const g = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse
      .find((x) => x.hooks.some((h) => h.command.includes(".codex/hooks/mcp-guard.sh")));
    const re = new RegExp(g.matcher);
    for (const t of ["merge_pull_request", "mark_pull_request_ready_for_review", "update_ref", "create_blob", "create_tree",
      "create_commit", "update_file", "create_branch", "push_files", "create_or_update_file", "update_pull_request"])
      assert.ok(re.test(C + t), C + t);
    for (const n of ["mcp__codex_apps__github.merge_pull_request", "github.update_ref", "mcp__github__merge_pull_request"]) assert.ok(re.test(n), n);
    for (const n of [C + "get_pull_request", C + "update_pull_request_branch", "mcp__codex_apps__browser_use_automate_browser", "apply_patch"])
      assert.ok(!re.test(n), `matcher must not catch ${n}`);
    const head = "b".repeat(40);
    assert.equal(mcp(C + "merge_pull_request", { pr_number: 7, merge_method: "merge", expected_head_sha: head })?.permissionDecision, "deny", "merge without a receipt");
    assert.equal(mcp(C + "mark_pull_request_ready_for_review", { pr_number: 7 })?.permissionDecision, "deny", "ready without a receipt");
    const gateFiles = committedGate(dir), at = new Date().toISOString();
    for (const kind of ["merge", "ready"]) {
      fs.mkdirSync(path.join(dir, `artifacts/${kind}-gate`), { recursive: true });
      fs.writeFileSync(path.join(dir, `artifacts/${kind}-gate/7.json`), JSON.stringify({ kind, pr: 7, head, ok: true, at, gateRoot: dir, gateFiles }));
    }
    assert.equal(mcp(C + "merge_pull_request", { pr_number: 7, merge_method: "merge", expected_head_sha: head }), null, "gated merge with pr_number passes");
    assert.equal(mcp(C + "merge_pull_request", { pr_number: 7, merge_method: "squash", expected_head_sha: head })?.permissionDecision, "deny", "squash");
    assert.equal(mcp(C + "mark_pull_request_ready_for_review", { pr_number: 7 }), null, "ready with a fresh ready-gate receipt passes");
    assert.equal(mcp(C + "update_ref", { ref: "heads/cursor/x-1", sha: head, force: true })?.permissionDecision, "deny", "forced update_ref");
    assert.equal(mcp(C + "update_ref", { ref: "refs/heads/claude/f1-game-project-26h3ng", sha: head })?.permissionDecision, "deny", "deploy-branch ref");
    assert.equal(mcp(C + "update_ref", { ref: "heads/cursor/x-1", sha: head, force: false }), null, "a fast-forward of a work branch passes");
    for (const t of ["create_blob", "create_tree", "create_commit", "update_file"]) {
      const out = mcp(C + t, { content: "x" });
      assert.equal(out?.permissionDecision, "deny", t);
      assert.ok(/git push.*R2-2/s.test(out.permissionDecisionReason), `${t}: ${out.permissionDecisionReason}`);
    }
    assert.equal(mcp("github.push_files", { branch: "cursor/x-1" })?.permissionDecision, "deny", "dotted name, push_files");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Codex edits files only through apply_patch (tool_input.command; https://learn.chatgpt.com/docs/hooks).
test("Codex edit door: apply_patch reaches protect-files (generated files, ratchet bans), fails closed", () => {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8")).hooks.PreToolUse
    .find((x) => x.hooks.some((h) => h.command === "bash .codex/hooks/edit-guard.sh"));
  assert.ok(g && new RegExp(g.matcher).test("apply_patch") && !new RegExp(g.matcher).test("Bash"), "apply_patch is wired");
  assert.ok(fs.statSync(path.join(ROOT, ".codex/hooks/edit-guard.sh")).mode & 0o111, "edit-guard.sh must be executable");
  const edit = (patch) => {
    const r = spawnSync("bash", [path.join(ROOT, ".codex/hooks/edit-guard.sh")],
      { input: JSON.stringify({ tool_name: "apply_patch", tool_input: { command: patch }, cwd: ROOT, hook_event_name: "PreToolUse" }),
        encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
  };
  const P = (body) => `*** Begin Patch\n${body}\n*** End Patch\n`;
  assert.equal(edit(P("*** Add File: version.json\n+{}")), "deny", "a generated file");
  assert.equal(edit(P("*** Update File: version.json\n@@\n-{\n+{ ")), "deny", "an update of a generated file");
  assert.equal(edit(P("*** Update File: tests/data/ratchets.json\n@@\n+  \"x\": 1,")), "deny", "a context-free ratchet insert");
  assert.equal(edit(P("*** Delete File: tests/data/ratchets.json")), "deny", "a ratchet removal");
  assert.equal(edit("not a patch"), "deny", "an unreadable payload");
  assert.equal(edit(P("*** Add File: scratch/codex-edit-guard-probe.txt\n+hello")), null, "an ordinary new file passes");
  assert.equal(edit(P("*** Update File: scratch/codex-edit-guard-probe.txt\n@@\n-hello\n+bye")), null, "an ordinary update passes");
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

test("pre-commit stands aside for Claude Code (its PreToolUse hook already ran the gate) and on APEX_SKIP_GUARDS=1", () => {
  for (const env of [{ CLAUDECODE: "1" }, { CLAUDECODE: "", APEX_SKIP_GUARDS: "1" }]) {
    const r = spawnSync("bash", [path.join(ROOT, ".githooks/pre-commit")], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status, 0, JSON.stringify(env));
  }
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
