// safety-bans-hook — the four shared safety bans (Fleet A + D, Bryce 2026-10-22),
// fed to the real hooks through both doors: Claude Code (.claude/hooks/bash-guard.sh,
// protect-files.sh) and Cursor (.cursor/hooks/shell-guard.sh, edit-guard.sh, in
// Cursor's payload and answer shapes: https://cursor.com/docs/agent/hooks).
//   1. a HAND ratchet raise (ratchets.mjs --update, a raise typed into
//      tests/data/ratchets.json or a fragment); the commit hook's --auto-raise stays
//   2. an edit to another branch's tests/data/ratchets.d fragment
//   3. a push over a foreign pusher (another author's commits on the remote branch)
//   4. pkill -f
// Fixture repos live under artifacts/. A few seconds.
//
// Run: node --test tests/unit/safety-bans-hook.test.mjs
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASH_GUARD = path.join(ROOT, ".claude/hooks/bash-guard.sh");
const PROTECT = path.join(ROOT, ".claude/hooks/protect-files.sh");
const SHELL_GUARD = path.join(ROOT, ".cursor/hooks/shell-guard.sh");
const EDIT_GUARD = path.join(ROOT, ".cursor/hooks/edit-guard.sh");
const ENV = { ...process.env, APEX_LIVE_RUN_CHECK: "/nonexistent", APEX_RATCHET_RAISE_OK: "", APEX_FOREIGN_PUSH_OK: "",
  APEX_SKIP_GUARDS: "", CLAUDECODE: "" };

const run = (hook, payload, cwd = ROOT, env = {}) => {
  const r = spawnSync("bash", [hook], { cwd, input: JSON.stringify(payload), encoding: "utf8", env: { ...ENV, ...env } });
  return { status: r.status, stderr: r.stderr, out: r.stdout.trim() ? JSON.parse(r.stdout) : null };
};
const claudeBash = (command, cwd = ROOT, env) => run(BASH_GUARD, { tool_name: "Bash", tool_input: { command } }, cwd, env);
const cursorShell = (command, cwd = ROOT, env) => run(SHELL_GUARD, { command, cwd }, cwd, env);

function fixture(prefix) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  return fs.mkdtempSync(path.join(ROOT, "artifacts", prefix));
}
const gitAs = (cwd, who) => (...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: `${who}@t`, GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: `${who}@t` } }).trim();

test("ban 1: a ratchets.mjs run that can raise is refused in both doors; the non-raising forms pass", () => {
  for (const cmd of ["node tools/check/ratchets.mjs --update", "node tools/check/ratchets.mjs --update --absolute",
    "node tools/check/ratchets.mjs --update --fragment --reason=headroom", "cd tools && node ./check/ratchets.mjs --update",
    "bash -c 'node tools/check/ratchets.mjs --update'",
    // review of c2589f2a: the cap lifted by hand, and spellings the first parse missed
    "node tools/check/ratchets.mjs --auto-raise=9999", "node --import ./x.mjs tools/check/ratchets.mjs --update",
    "npx node tools/check/ratchets.mjs --update", "node tools/check/ratchets.mjs $(echo --update)",
    "node -e \"import('./tools/check/ratchets.mjs').then((m) => m.autoRaise({ maxRaise: 1e9 }))\""]) {
    assert.equal(claudeBash(cmd).status, 2, `claude: ${cmd}`);
    const c = cursorShell(cmd);
    assert.equal(c.status, 2, `cursor: ${cmd}`);
    assert.equal(c.out.permission, "deny");
    assert.ok(c.out.agent_message.includes("shared safety ban 1"), "the Cursor agent reads why");
  }
  for (const cmd of ["node tools/check/ratchets.mjs", "node tools/check/ratchets.mjs --json", "node tools/check/ratchets.mjs --fold",
    "node tools/check/ratchets.mjs --update --lower-only", "node tools/check/ratchets.mjs --update --preview",
    "node tools/check/ratchets.mjs --base origin/claude/f1-game-project-26h3ng --advisory",
    "node tools/check/ratchets.mjs --auto-raise", "node tools/check/ratchets.mjs --auto-raise=40",
    "echo 'node tools/check/ratchets.mjs --update'", "echo 'echo --update | xargs node tools/check/ratchets.mjs'",
    "APEX_RATCHET_RAISE_OK=1 node tools/check/ratchets.mjs --update --fragment --reason=bryce-typed"]) {
    assert.equal(claudeBash(cmd).status, 0, `claude: ${cmd}`);
    assert.deepEqual(cursorShell(cmd).out, { permission: "allow" }, `cursor: ${cmd}`);
  }
});

test("bans 1 and 2: ratchets.json raises and other branches' fragments are refused, even under allow-protected", () => {
  const dir = fixture("safety-ratchets-");
  try {
    const git = gitAs(dir, "a");
    git("init", "-q", "-b", "cursor/t-1");
    fs.mkdirSync(path.join(dir, "tests/data/ratchets.d"), { recursive: true });
    const base = { _doc: "x", files: { "js/agent/apex.js": { lines: 100 }, "js/core/log.js": { lines: { ceiling: 50, slack: 0 } } }, tree: { bareCatches: 3 } };
    fs.writeFileSync(path.join(dir, "tests/data/ratchets.json"), JSON.stringify(base, null, 2));
    const fragDir = path.join(dir, "tests/data/ratchets.d");
    const own = path.join(fragDir, "cursor--t-1" + ".json");          // this branch's (cursor/t-1)
    const other = path.join(fragDir, "cursor--other-2" + ".json");
    fs.writeFileSync(own, JSON.stringify({ files: { "js/agent/apex.js": { lines: 6 } }, tree: { bareCatches: -1 } }));
    fs.writeFileSync(other, JSON.stringify({ files: { "js/agent/apex.js": { lines: 4 } } }));
    git("add", "-A"); git("commit", "-qm", "init");
    const edit = (file, payload) => [run(PROTECT, { tool_name: "Write", tool_input: { file_path: file, ...payload } }, dir),
      run(EDIT_GUARD, { tool_name: "Write", tool_input: { file_path: file, ...payload }, cwd: dir }, dir)];
    const both = (file, payload, want, label) => {
      const [claude, cursor] = edit(file, payload);
      assert.equal(claude.status, want, `claude: ${label}\n${claude.stderr}`);
      assert.equal(cursor.status, want, `cursor: ${label}`);
      assert.equal(cursor.out.permission, want === 2 ? "deny" : "allow", `cursor answer: ${label}`);
    };
    const json = (o) => ({ content: JSON.stringify(o) });
    // Own fragment: lower or revert passes; any raise is refused.
    both(own, json({ files: { "js/agent/apex.js": { lines: 2 } }, tree: { bareCatches: -1 } }), 0, "own fragment lowered");
    both(own, json({ tree: { bareCatches: -1 } }), 0, "own fragment: a headroom raise reverted");
    both(own, json({ files: { "js/agent/apex.js": { lines: 9 } }, tree: { bareCatches: -1 } }), 2, "own fragment raised");
    both(own, json({ files: { "js/agent/apex.js": { lines: 6 } } }), 2, "own fragment: a lowering dropped is a raise");
    both(own, json({ files: { "js/agent/apex.js": { lines: 6 }, "js/roster.js": { lines: 1 } }, tree: { bareCatches: -1 } }), 2, "own fragment: a new positive delta");
    both(own, { old_string: '"lines":6', new_string: '"lines":60' }, 2, "own fragment raised through Edit");
    assert.equal(run(PROTECT, { tool_name: "Edit", tool_input: { file_path: own, old_string: '"lines":6', new_string: '"lines":1' } }, dir).status, 0, "own fragment lowered through Edit");
    assert.equal(run(PROTECT, { tool_name: "Bash", tool_input: { command: `echo '{}' > ${own}` }, cwd: dir }, dir).status, 2, "a blind Bash rewrite of the own fragment");
    // Another branch's fragment: refused outright, lowering included.
    both(other, json({ files: { "js/agent/apex.js": { lines: 1 } } }), 2, "another branch's fragment");
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude/allow-protected"), "");
    both(other, json({}), 2, "another branch's fragment, under allow-protected");
    assert.equal(run(PROTECT, { tool_name: "Bash", tool_input: { command: `sed -i s/4/1/ ${other}` }, cwd: dir }, dir).status, 2, "another branch's fragment via sed");
    // ratchets.json under the hatch: a lowering passes, a raise or a dropped ceiling does not.
    const rj = path.join(dir, "tests/data/ratchets.json");
    const with_ = (f) => { const o = structuredClone(base); f(o); return json(o); };
    both(rj, with_((o) => { o.files["js/agent/apex.js"].lines = 90; }), 0, "ratchets.json lowered under the hatch");
    both(rj, with_((o) => { o.files["js/agent/apex.js"].lines = 140; }), 2, "ratchets.json raised under the hatch");
    both(rj, with_((o) => { o.files["js/core/log.js"].lines.slack = 5; }), 2, "a slack widened");
    both(rj, with_((o) => { delete o.tree.bareCatches; }), 2, "a ceiling dropped");
    both(rj, { content: "{ not json" }, 2, "unparseable");
    fs.rmSync(path.join(dir, ".claude/allow-protected"));
    both(rj, with_((o) => { o.files["js/agent/apex.js"].lines = 90; }), 2, "ratchets.json without the hatch stays tool-written");
    // Removals and moves are writes (review of c2589f2a): a deleted fragment with a negative delta
    // is a raise, and ratchets.json or another branch's fragment is never removed by hand.
    const bash = (command) => { const r = run(PROTECT, { tool_name: "Bash", tool_input: { command }, cwd: dir }, dir); bash.err = r.stderr; return r.status; };
    for (const cmd of [`git rm -q ${other}`, `mv ${other} artifacts/x.json`, "rm -rf tests/data/ratchets.d",
      "find tests/data/ratchets.d -name '*.json' -delete", "git mv tests/data/ratchets.json x.json", `rm ${own}`, `unlink ${own}`])
      assert.equal(bash(cmd), 2, cmd);
    assert.equal(bash("rm -rf artifacts/x && find . -name '*.log' -print"), 0, "ordinary removals pass");
    fs.writeFileSync(own, JSON.stringify({ files: { "js/agent/apex.js": { lines: 6 } } }));
    assert.equal(bash(`rm ${own}`), 0, "removing the own fragment that only raised is a lowering: " + bash.err);
    // On sync-pr.mjs's sync-pr-<branch>, the PR branch's fragment is still this branch's.
    git("checkout", "-q", "-b", "sync-pr-cursor/t-1");
    both(own, json({ files: { "js/agent/apex.js": { lines: 2 } } }), 0, "own fragment lowered from sync-pr-<branch>");
    both(other, json({}), 2, "another branch's fragment from sync-pr-<branch>");
    // A detached HEAD has no own fragment.
    git("checkout", "-q", "--detach");
    both(own, json({ tree: { bareCatches: -1 } }), 2, "no own fragment on a detached HEAD");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ban 3: a push over another author's commits is refused until the owner acknowledges it", () => {
  const dir = fixture("safety-push-");
  try {
    const origin = path.join(dir, "origin.git"), a = path.join(dir, "a"), b = path.join(dir, "b");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    execFileSync("git", ["clone", "-q", origin, a], { stdio: "ignore" });
    const ga = gitAs(a, "alice");
    ga("config", "user.email", "alice@t"); ga("config", "user.name", "alice");
    ga("checkout", "-q", "-b", "cursor/t-1"); ga("commit", "-q", "--allow-empty", "-m", "a1");
    // A first push (no tracking ref yet) passes.
    assert.equal(claudeBash("git push -u origin cursor/t-1", a).status, 0, "first push");
    ga("push", "-q", "-u", "origin", "cursor/t-1");
    ga("commit", "-q", "--allow-empty", "-m", "a2");
    assert.equal(claudeBash("git push origin cursor/t-1", a).status, 0, "same author, nothing new remotely");
    ga("push", "-q", "origin", "cursor/t-1");
    // Bob pushes onto Alice's branch.
    execFileSync("git", ["clone", "-q", "-b", "cursor/t-1", origin, b], { stdio: "ignore" });
    const gb = gitAs(b, "bob");
    gb("commit", "-q", "--allow-empty", "-m", "bob was here"); gb("push", "-q", "origin", "cursor/t-1");
    ga("commit", "-q", "--allow-empty", "-m", "a3");
    for (const cmd of ["git push origin cursor/t-1", "git push", "git push -u origin HEAD", "git push origin HEAD:cursor/t-1"]) {
      const r = claudeBash(cmd, a);
      assert.equal(r.status, 2, `claude: ${cmd}\n${r.stderr}`);
      assert.ok(r.stderr.includes("bob <bob@t> bob was here"), r.stderr);
    }
    const c = cursorShell("git push origin cursor/t-1", a);
    assert.equal(c.status, 2); assert.equal(c.out.permission, "deny"); assert.ok(c.out.agent_message.includes("shared safety ban 3"));
    // A pull (fetch + merge) does not clear it: the commit is still another author's since Alice's last push.
    ga("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1");
    assert.equal(claudeBash("git push origin cursor/t-1", a).status, 2, "after a pull");
    assert.equal(claudeBash("APEX_FOREIGN_PUSH_OK=1 git push origin cursor/t-1", a).status, 0, "acknowledged");
    ga("push", "-q", "origin", "cursor/t-1");
    ga("commit", "-q", "--allow-empty", "-m", "a4");
    assert.equal(claudeBash("git push origin cursor/t-1", a).status, 0, "the acknowledged push moved the baseline");
    assert.deepEqual(cursorShell("git push origin cursor/t-1", a).out, { permission: "allow" });
    // The override is the push's own env prefix, never text elsewhere in the command.
    gb("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1");
    gb("commit", "-q", "--allow-empty", "-m", "bob again"); gb("push", "-q", "origin", "cursor/t-1");
    assert.equal(claudeBash("echo APEX_FOREIGN_PUSH_OK=1; git push origin cursor/t-1", a).status, 2, "override text in an echo");
    // A push by URL or path is the configured remote it names.
    assert.equal(claudeBash(`git push ${origin} HEAD:cursor/t-1`, a).status, 2, "push by path");
    ga("fetch", "-q", "origin"); ga("merge", "-q", "--no-edit", "origin/cursor/t-1");
    assert.equal(claudeBash("APEX_FOREIGN_PUSH_OK=1 git push origin cursor/t-1", a).status, 0);
    ga("push", "-q", "origin", "cursor/t-1");
    // Same email, another session: every Claude session commits as one address, so the
    // Claude-Session trailer decides (this session's id: CLAUDE_CODE_REMOTE_SESSION_ID).
    gb("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1");
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "twin\n\nClaude-Session: https://claude.ai/code/session_01OTHER"],
      { cwd: b, env: { ...process.env, GIT_AUTHOR_EMAIL: "alice@t", GIT_COMMITTER_EMAIL: "alice@t", GIT_AUTHOR_NAME: "alice", GIT_COMMITTER_NAME: "alice" } });
    gb("push", "-q", "origin", "cursor/t-1");
    assert.equal(claudeBash("git push origin cursor/t-1", a, { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01MINE" }).status, 2, "same email, another Claude session");
    assert.equal(claudeBash("git push origin cursor/t-1", a, { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01OTHER" }).status, 0, "same email, same session");
    // An unreadable remote fails open, loudly.
    ga("remote", "set-url", "origin", path.join(dir, "gone.git"));
    const gone = claudeBash("git push origin cursor/t-1", a);
    assert.equal(gone.status, 0);
    assert.ok(gone.stderr.includes("foreign-pusher check could not read"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ban 4: pkill -f is refused in both doors, with the reason in Cursor's answer", () => {
  for (const cmd of ["pkill -f serve", "pkill -9 -f node", "timeout 5 pkill -f chrome"]) {
    assert.equal(claudeBash(cmd).status, 2, `claude: ${cmd}`);
    const c = cursorShell(cmd);
    assert.equal(c.status, 2, `cursor: ${cmd}`);
    assert.equal(c.out.permission, "deny");
    assert.ok(c.out.user_message.includes("pkill -f"));
  }
  assert.deepEqual(cursorShell("pgrep -a node").out, { permission: "allow" });
});

test("Cursor's hooks.json runs the edit guard on every preToolUse, failing closed; the script picks the writes", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
  const pre = cfg.hooks.preToolUse.find((h) => h.command.includes(".cursor/hooks/edit-guard.sh"));
  assert.ok(pre, "preToolUse runs edit-guard.sh");
  // DAD's review of #3575: which tool a Cursor string-replace or multi-edit is named is undocumented,
  // so there is no matcher and edit-guard.sh decides what is a write.
  assert.equal(pre.matcher, undefined, "no matcher: every tool reaches the script");
  assert.equal(pre.failClosed, true);
  // https://cursor.com/docs/agent/hooks: crashes, timeouts and non-zero exits other than 2 fail OPEN
  // for beforeShellExecution / beforeMCPExecution unless failClosed is true.
  for (const ev of ["beforeShellExecution", "beforeMCPExecution"])
    assert.ok(cfg.hooks[ev].every((h) => h.failClosed === true), `${ev} fails closed`);
  assert.ok(fs.statSync(EDIT_GUARD).mode & 0o111, "edit-guard.sh is executable");
  // A write with no readable path is denied (failClosed), not waved through with a warning.
  const noPath = run(EDIT_GUARD, { tool_name: "Write", tool_input: { content: "{}" } });
  assert.equal(noPath.status, 2);
  assert.equal(noPath.out.permission, "deny");
  assert.equal(run(EDIT_GUARD, { tool_name: "StrReplace", tool_input: { old_string: "a", new_string: "b" } }).out.permission, "deny");
  // Read-only tools, Shell and MCP calls pass untouched, path or not.
  for (const [tool_name, tool_input] of [["Read", { file_path: "tests/data/ratchets.json" }], ["Grep", { pattern: "x" }],
    ["Shell", { command: "ls" }], ["MCP:github_get_me", {}], ["Task", { prompt: "x" }], ["SomethingNew", { query: "x" }]])
    assert.deepEqual(run(EDIT_GUARD, { tool_name, tool_input }).out, { permission: "allow" }, tool_name);
  // Any other tool carrying a path is judged as a write, whatever Cursor names it.
  const frag = path.join(ROOT, "tests/data/ratchets.d", "cursor--not-this-branch-0000" + ".json");
  for (const tool_name of ["Write", "StrReplace", "MultiEdit", "search_replace"])
    assert.equal(run(EDIT_GUARD, { tool_name, tool_input: { file_path: frag, old_string: "6", new_string: "1" } }).out.permission, "deny", tool_name);
  // Delete is a removal: another branch's fragment or a generated file is refused, a doc is not.
  assert.equal(run(EDIT_GUARD, { tool_name: "Delete", tool_input: { path: frag } }).out.permission, "deny");
  assert.equal(run(EDIT_GUARD, { tool_name: "Delete", tool_input: { path: "version.json" } }).out.permission, "deny");
  assert.equal(run(EDIT_GUARD, { tool_name: "Delete", tool_input: { path: "artifacts/nothing-here.md" } }).out.permission, "allow");
  // Unreadable payloads are denied (failClosed), in both adapters.
  for (const hook of [EDIT_GUARD, SHELL_GUARD]) {
    const r = spawnSync("bash", [hook], { cwd: ROOT, input: "not json", encoding: "utf8", env: ENV });
    assert.equal(r.status, 2, hook);
    assert.equal(JSON.parse(r.stdout).permission, "deny", hook);
  }
  // Content shapes the adapter cannot read never read as an empty Write (review of c2589f2a):
  // index.html and package.json edits pass, an outright generated file and a ratchet file do not.
  const cursorEdit = (ti) => run(EDIT_GUARD, { tool_name: "Write", tool_input: ti }).out.permission;
  assert.equal(cursorEdit({ target_file: "index.html", code_edit: "<p>x</p>" }), "allow");
  assert.equal(cursorEdit({ target_file: "package.json", code_edit: "{}" }), "allow");
  assert.equal(cursorEdit({ file_path: "index.html", old_str: "<title>", new_str: "<title>" }), "allow");
  assert.equal(cursorEdit({ target_file: "version.json", code_edit: "{}" }), "deny");
  assert.equal(cursorEdit({ target_file: "tests/data/ratchets.json", code_edit: "{}" }), "deny");
});

test("edit-guard judges a path key beyond file_path/path/target_file/filePath, and write shapes with no path", () => {
  const frag = path.join(ROOT, "tests/data/ratchets.d", "cursor--not-this-branch-0000.json");
  const perm = (tool_name, tool_input) => run(EDIT_GUARD, { tool_name, tool_input }).out.permission;
  // The path is read from any key naming a path, file or target; the generated-file rule then applies.
  for (const key of ["targetFile", "target_path", "filepath", "relative_workspace_path", "notebook_path", "filename", "file"]) {
    assert.equal(perm("Whatever", { [key]: "version.json", code_edit: "{}" }), "deny", `${key}: generated file`);
    assert.equal(perm("Whatever", { [key]: frag, old_string: "6", new_string: "1" }), "deny", `${key}: other branch's fragment`);
    assert.equal(perm("Whatever", { [key]: "artifacts/nothing-here.md", old_string: "a", new_string: "b" }), "allow", `${key}: a doc`);
  }
  // A write shape with no readable path is denied, not waved through as read-only.
  for (const shape of [{ diff: "--- a" }, { patch: "x" }, { code_edit: "x" }, { replacement: "x" }, { edits: [{ old_string: "a", new_string: "b" }] }])
    assert.equal(perm("SomethingNew", { description: "x", ...shape }), "deny", Object.keys(shape)[0]);
  // A body key is never mistaken for a path, and read-only tools still pass whatever keys they carry.
  assert.equal(perm("SomethingNew", { file_text: "hi" }), "deny");
  assert.equal(perm("Read", { targetFile: "version.json" }), "allow");
  assert.equal(perm("SomethingNew", { query: "x" }), "allow");
});
