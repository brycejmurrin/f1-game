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
    "bash -c 'node tools/check/ratchets.mjs --update'"]) {
    assert.equal(claudeBash(cmd).status, 2, `claude: ${cmd}`);
    const c = cursorShell(cmd);
    assert.equal(c.status, 2, `cursor: ${cmd}`);
    assert.equal(c.out.permission, "deny");
    assert.ok(c.out.agent_message.includes("shared safety ban 1"), "the Cursor agent reads why");
  }
  for (const cmd of ["node tools/check/ratchets.mjs", "node tools/check/ratchets.mjs --json", "node tools/check/ratchets.mjs --fold",
    "node tools/check/ratchets.mjs --update --lower-only", "node tools/check/ratchets.mjs --update --preview",
    "node tools/check/ratchets.mjs --base origin/claude/f1-game-project-26h3ng --advisory",
    "node tools/check/ratchets.mjs --auto-raise", "echo 'node tools/check/ratchets.mjs --update'",
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
    const base = { _doc: "x", files: { "js/game.js": { lines: 100 }, "js/core/log.js": { lines: { ceiling: 50, slack: 0 } } }, tree: { bareCatches: 3 } };
    fs.writeFileSync(path.join(dir, "tests/data/ratchets.json"), JSON.stringify(base, null, 2));
    const fragDir = path.join(dir, "tests/data/ratchets.d");
    const own = path.join(fragDir, "cursor--t-1" + ".json");          // this branch's (cursor/t-1)
    const other = path.join(fragDir, "cursor--other-2" + ".json");
    fs.writeFileSync(own, JSON.stringify({ files: { "js/game.js": { lines: 6 } }, tree: { bareCatches: -1 } }));
    fs.writeFileSync(other, JSON.stringify({ files: { "js/game.js": { lines: 4 } } }));
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
    both(own, json({ files: { "js/game.js": { lines: 2 } }, tree: { bareCatches: -1 } }), 0, "own fragment lowered");
    both(own, json({ tree: { bareCatches: -1 } }), 0, "own fragment: a headroom raise reverted");
    both(own, json({ files: { "js/game.js": { lines: 9 } }, tree: { bareCatches: -1 } }), 2, "own fragment raised");
    both(own, json({ files: { "js/game.js": { lines: 6 } } }), 2, "own fragment: a lowering dropped is a raise");
    both(own, json({ files: { "js/game.js": { lines: 6 }, "js/roster.js": { lines: 1 } }, tree: { bareCatches: -1 } }), 2, "own fragment: a new positive delta");
    both(own, { old_string: '"lines":6', new_string: '"lines":60' }, 2, "own fragment raised through Edit");
    assert.equal(run(PROTECT, { tool_name: "Edit", tool_input: { file_path: own, old_string: '"lines":6', new_string: '"lines":1' } }, dir).status, 0, "own fragment lowered through Edit");
    assert.equal(run(PROTECT, { tool_name: "Bash", tool_input: { command: `echo '{}' > ${own}` }, cwd: dir }, dir).status, 2, "a blind Bash rewrite of the own fragment");
    // Another branch's fragment: refused outright, lowering included.
    both(other, json({ files: { "js/game.js": { lines: 1 } } }), 2, "another branch's fragment");
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude/allow-protected"), "");
    both(other, json({}), 2, "another branch's fragment, under allow-protected");
    assert.equal(run(PROTECT, { tool_name: "Bash", tool_input: { command: `sed -i s/4/1/ ${other}` }, cwd: dir }, dir).status, 2, "another branch's fragment via sed");
    // ratchets.json under the hatch: a lowering passes, a raise or a dropped ceiling does not.
    const rj = path.join(dir, "tests/data/ratchets.json");
    const with_ = (f) => { const o = structuredClone(base); f(o); return json(o); };
    both(rj, with_((o) => { o.files["js/game.js"].lines = 90; }), 0, "ratchets.json lowered under the hatch");
    both(rj, with_((o) => { o.files["js/game.js"].lines = 140; }), 2, "ratchets.json raised under the hatch");
    both(rj, with_((o) => { o.files["js/core/log.js"].lines.slack = 5; }), 2, "a slack widened");
    both(rj, with_((o) => { delete o.tree.bareCatches; }), 2, "a ceiling dropped");
    both(rj, { content: "{ not json" }, 2, "unparseable");
    fs.rmSync(path.join(dir, ".claude/allow-protected"));
    both(rj, with_((o) => { o.files["js/game.js"].lines = 90; }), 2, "ratchets.json without the hatch stays tool-written");
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

test("Cursor's hooks.json wires the edit guard on preToolUse Write, failing closed", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
  const pre = cfg.hooks.preToolUse.find((h) => h.command.includes(".cursor/hooks/edit-guard.sh"));
  assert.ok(pre, "preToolUse runs edit-guard.sh");
  assert.ok(new RegExp(pre.matcher).test("Write"), "Cursor maps Claude's Write and Edit onto its Write tool");
  assert.equal(pre.failClosed, true);
  assert.ok(fs.statSync(EDIT_GUARD).mode & 0o111, "edit-guard.sh is executable");
  const noPath = run(EDIT_GUARD, { tool_name: "Write", tool_input: {} });
  assert.equal(noPath.out.permission, "allow");
  assert.ok(noPath.out.agent_message.includes("did NOT run"), "an unreadable payload passes loudly, never silently");
});
