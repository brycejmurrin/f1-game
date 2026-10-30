// safety-bans-hook — the four shared safety bans (Fleet A + D, Bryce 2026-10-22),
// fed to the real hooks through both doors: Claude Code (.claude/hooks/bash-guard.sh,
// protect-files.sh) and Cursor (.cursor/hooks/shell-guard.sh, edit-guard.sh, in
// Cursor's payload and answer shapes: https://cursor.com/docs/agent/hooks).
//   1. a HAND ratchet raise (ratchets.mjs --update, a raise typed into
//      tests/data/ratchets.json or a fragment); the commit hook's --auto-raise stays
//   2. an edit to another branch's tests/data/ratchets.d fragment
//   3. a push over a foreign pusher (another author's commits on the remote branch)
//   4. pkill -f
// and the Transcript Auditor batch 9 additions (2026-10-24):
//   5. commit signing turned off (-c commit.gpgsign=false, --no-gpg-sign, git config)
//   6. a git ref written through `gh api` (DELETE/PATCH/PUT/POST …/git/refs)
//   advisories: a cursor/* push touching another open PR's paths; a piped ready/merge gate
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
// A live Playwright run in this checkout must not flip these tests: protect-files.py refuses js/css/index.html edits
// while one is live, by scanning /proc. A sitecustomize.py on PYTHONPATH hides /proc from the hook's python, so the
// tests measure the safety bans only (audit Q10, finding 16). Written once, under artifacts/ (regenerable).
const STUB_DIR = path.join(ROOT, "artifacts", "safety-bans-stub");
fs.mkdirSync(STUB_DIR, { recursive: true });
fs.writeFileSync(path.join(STUB_DIR, "sitecustomize.py"),
  "import os\n_ls = os.listdir\nos.listdir = lambda p='.': [] if str(p) == '/proc' else _ls(p)\n");
const ENV = { ...process.env, PYTHONPATH: [STUB_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter), APEX_LIVE_RUN_CHECK: "/nonexistent", APEX_RATCHET_RAISE_OK: "", APEX_FOREIGN_PUSH_OK: "",
  APEX_SKIP_GUARDS: "", CLAUDECODE: "", APEX_CLOSED_PR_PUSH_OK: "", APEX_HELD_CHECK: "0",
  APEX_PR_STATE_CMD: `node -e "console.log('[]')"` };

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
    "APEX_RATCHET_RAISE_OK=1 node tools/check/ratchets.mjs --update --fragment --reason=bryce-typed",
    // 2026-10-26 second pass: a READ-ONLY import that measures (pinVerdict / PIN_METRICS) is how an agent pays a
    // ceiling by shrinking; only a script that can raise (autoRaise/update/fold or a file write) is refused
    "node -e \"const m = await import('./tools/check/ratchets.mjs'); console.log((await m.pinVerdict('assertPins')).value)\"",
    "node /tmp/x/pin-now.mjs"]) {
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

test("ban 3: land.yml's AUTO-SYNC merge of the deploy branch is not foreign; a hand-resolved one still is", () => {
  const dir = fixture("safety-autosync-");
  const DEPLOY = "claude/f1-game-project-26h3ng";
  try {
    const origin = path.join(dir, "origin.git"), a = path.join(dir, "a"), b = path.join(dir, "b");
    execFileSync("git", ["init", "-q", "--bare", "-b", DEPLOY, origin]);
    execFileSync("git", ["clone", "-q", origin, a], { stdio: "ignore" });
    const ga = gitAs(a, "alice");
    ga("config", "user.email", "alice@t"); ga("config", "user.name", "alice");
    fs.writeFileSync(path.join(a, "f.txt"), "base\n"); ga("add", "f.txt"); ga("commit", "-qm", "base");
    ga("push", "-q", "origin", DEPLOY);
    ga("checkout", "-q", "-b", "cursor/t-1"); ga("commit", "-q", "--allow-empty", "-m", "a1");
    ga("push", "-q", "-u", "origin", "cursor/t-1");
    // The deploy branch moves; the land bot (as bob, the token owner) merges it in the way update-branch does.
    execFileSync("git", ["clone", "-q", origin, b], { stdio: "ignore" });
    const gb = gitAs(b, "bob");
    gb("checkout", "-q", DEPLOY); fs.writeFileSync(path.join(b, "g.txt"), "tip\n"); gb("add", "g.txt"); gb("commit", "-qm", "tip");
    gb("push", "-q", "origin", DEPLOY);
    gb("checkout", "-q", "cursor/t-1"); gb("merge", "-q", "--no-ff", "-m", `Merge branch '${DEPLOY}' into cursor/t-1`, DEPLOY);
    gb("push", "-q", "origin", "cursor/t-1");
    ga("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1"); ga("commit", "-q", "--allow-empty", "-m", "a2");
    const ok = claudeBash("git push origin cursor/t-1", a);
    assert.equal(ok.status, 0, `a clean AUTO-SYNC merge is not foreign\n${ok.stderr}`);
    ga("push", "-q", "origin", "cursor/t-1");
    // The same subject on a merge whose conflict was resolved by hand carries other work: still foreign.
    // Alice's branch and the deploy branch both change f.txt, so the merge needs a hand resolution.
    fs.writeFileSync(path.join(a, "f.txt"), "branch\n"); ga("commit", "-qam", "a-side"); ga("push", "-q", "origin", "cursor/t-1");
    gb("checkout", "-q", DEPLOY); gb("pull", "-q", "--no-rebase", "--no-edit", "origin", DEPLOY);
    fs.writeFileSync(path.join(b, "f.txt"), "deploy\n"); gb("commit", "-qam", "tip2"); gb("push", "-q", "origin", DEPLOY);
    gb("checkout", "-q", "cursor/t-1"); gb("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1");
    try { gb("merge", "-q", "--no-ff", "-m", `Merge branch '${DEPLOY}' into cursor/t-1`, DEPLOY); } catch { /* the conflict */ }
    fs.writeFileSync(path.join(b, "f.txt"), "resolved by hand\n"); gb("add", "f.txt"); gb("commit", "-q", "--no-edit");
    gb("push", "-q", "origin", "cursor/t-1");
    ga("pull", "-q", "--no-rebase", "--no-edit", "origin", "cursor/t-1"); ga("commit", "-q", "--allow-empty", "-m", "a3");
    const hand = claudeBash("git push origin cursor/t-1", a);
    assert.equal(hand.status, 2, "a hand-resolved merge is someone's work");
    assert.ok(hand.stderr.includes(`bob <bob@t> Merge branch '${DEPLOY}'`), hand.stderr);
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
  // Use explicit fixture roots: the caller may itself be a linked worktree,
  // where shared-contract edits are correctly denied. The adapter changes cwd.
  const dir = fixture("safety-cursor-shapes-");
  try {
    const git = gitAs(dir, "a");
    git("init", "-q", "-b", "cursor/shapes");
    fs.writeFileSync(path.join(dir, "index.html"), "<title>Fixture</title>\n");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { "test:tiny": "node test.mjs" } }));
    git("add", "index.html", "package.json"); git("commit", "-qm", "fixture");
    const linked = path.join(dir, "linked");
    git("worktree", "add", "--quiet", "--detach", linked, "HEAD");
    for (const [root, sharedPermission] of [[dir, "allow"], [linked, "deny"]]) {
      const cursorEdit = (ti) => run(EDIT_GUARD, { tool_name: "Write", tool_input: ti }).out.permission;
      assert.equal(cursorEdit({ target_file: path.join(root, "index.html"), code_edit: "<p>x</p>" }), sharedPermission);
      assert.equal(cursorEdit({ target_file: path.join(root, "package.json"), code_edit: "{}" }), sharedPermission);
      assert.equal(cursorEdit({ file_path: path.join(root, "index.html"), old_str: "<title>", new_str: "<title>" }), sharedPermission);
      assert.equal(cursorEdit({ target_file: path.join(root, "version.json"), code_edit: "{}" }), "deny");
      assert.equal(cursorEdit({ target_file: path.join(root, "tests/data/ratchets.json"), code_edit: "{}" }), "deny");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

test("ban 5: turning commit signing off is refused in both doors; reading it and signed commits pass", () => {
  for (const cmd of ["git -c commit.gpgsign=false commit -m x", "git -c commit.gpgSign=0 commit --allow-empty -m x",
    "git -c commit.gpgsign= commit -m x", "git commit --no-gpg-sign -m x", "git merge --no-gpg-sign origin/x",
    "git tag --no-sign v1", "git -c tag.gpgsign=off tag v1", "git config commit.gpgsign false",
    "git config --global commit.gpgsign no", "git config --unset commit.gpgsign", "git config unset --global commit.gpgsign",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit -m x",
    "bash -c 'git -c commit.gpgsign=false commit -m x'", "cd /tmp && git commit --no-gpg-sign -m y"]) {
    const r = claudeBash(cmd);
    assert.equal(r.status, 2, `claude: ${cmd}`);
    assert.ok(r.stderr.includes("shared safety ban 5"), `claude reason: ${cmd}`);
    const c = cursorShell(cmd);
    assert.equal(c.status, 2, `cursor: ${cmd}`);
    assert.equal(c.out.permission, "deny");
    assert.ok(c.out.agent_message.includes("shared safety ban 5"), "the Cursor agent reads why");
  }
  for (const cmd of ["git config --get commit.gpgsign", "git config commit.gpgsign", "git config commit.gpgsign true",
    "git -c commit.gpgsign=true log -1", "git -c commit.gpgsign log -1", "git log --show-signature -1",
    "echo 'git -c commit.gpgsign=false commit'", "git grep -n no-gpg-sign",
    "git config --get-all commit.gpgsign false", "git config --get-regexp gpgsign", "git config -l"]) {
    assert.equal(claudeBash(cmd).status, 0, `claude: ${cmd}`);
    assert.deepEqual(cursorShell(cmd).out, { permission: "allow" }, `cursor: ${cmd}`);
  }
});

test("ban 6: a git ref written through gh api is refused in both doors, even under APEX_MERGE_DESK; reads pass", () => {
  for (const cmd of ["gh api -X DELETE repos/brycejmurrin/f1-game/git/refs/heads/cursor/x-1",
    "gh api --method=DELETE /repos/o/r/git/refs/heads/x", "gh api -XPATCH repos/o/r/git/refs/heads/x -f sha=abc -F force=true",
    "gh api repos/o/r/git/refs -f ref=refs/heads/x -f sha=abc", "gh api -X PUT repos/o/r/git/refs/heads/x",
    "bash -c 'gh api -X DELETE repos/o/r/git/refs/heads/x'"]) {
    for (const env of [{}, { APEX_MERGE_DESK: "1" }]) {
      const r = claudeBash(cmd, ROOT, env);
      assert.equal(r.status, 2, `claude ${JSON.stringify(env)}: ${cmd}`);
      assert.ok(r.stderr.includes("shared safety ban 6"));
    }
    const c = cursorShell(cmd);
    assert.equal(c.status, 2, `cursor: ${cmd}`);
    assert.equal(c.out.permission, "deny");
    assert.ok(c.out.agent_message.includes("shared safety ban 6"));
  }
  for (const cmd of ["gh api repos/o/r/git/refs/heads/x", "gh api repos/o/r/git/ref/heads/x --jq .object.sha",
    "gh api -X GET repos/o/r/git/refs/heads", "gh api repos/o/r/branches/x", "echo 'gh api -X DELETE repos/o/r/git/refs/heads/x'"]) {
    assert.equal(claudeBash(cmd).status, 0, `claude: ${cmd}`);
    assert.deepEqual(cursorShell(cmd).out, { permission: "allow" }, `cursor: ${cmd}`);
  }
  // A push deletion is still refused at the push rule (unchanged), and a push of your own branch passes.
  assert.equal(claudeBash("git push origin --delete cursor/x-1").status, 2);
  assert.equal(claudeBash("git push origin :cursor/x-1").status, 2);
});

test("advisory: a piped ready-gate/merge-gate without pipefail gets a reminder, never a block", () => {
  for (const cmd of ["node tools/ci/ready-gate.mjs --pr 12 | tee rg.log", "node tools/ci/merge-gate.mjs --pr 12 2>&1 | tail -1"]) {
    const r = claudeBash(cmd);
    assert.equal(r.status, 0, cmd);
    assert.ok(r.out.hookSpecificOutput.additionalContext.includes("is piped, so this command's exit status"));
    assert.equal(r.out.hookSpecificOutput.permissionDecision, undefined, "advice only, the call is not asked or denied");
    const c = cursorShell(cmd);
    assert.equal(c.out.permission, "allow");
    assert.ok(c.out.agent_message.includes("is piped"), "the Cursor agent reads the reminder");
  }
  for (const cmd of ["set -o pipefail; node tools/ci/ready-gate.mjs --pr 12 | tee rg.log", "node tools/ci/ready-gate.mjs --pr 12",
    "node tools/ci/merge-gate.mjs --pr 12 || echo refused", "node tools/ci/ready-gate.mjs --pr 12 > artifacts/logs/rg.log",
    "echo 'node tools/ci/ready-gate.mjs --pr 12 | tail'", "cat > notes.md <<'EOF'\nrun `ready-gate.mjs | tee`\nEOF"]) {
    assert.equal(claudeBash(cmd).out, null, cmd);
  }
  // E3 (efficiency review finding 4): a ready-gate piped into tail/head is refused outright, not advised.
  assert.equal(claudeBash("node tools/ci/ready-gate.mjs --pr 12 | tail -3").status, 2);
});

test("a push to a cursor/* branch whose every PR is merged or closed is refused; an open PR or none passes", () => {
  const dir = fixture("safety-closedpr-");
  try {
    const g = gitAs(dir, "alice");
    g("init", "-q", "-b", "cursor/t-9");
    g("commit", "-q", "--allow-empty", "-m", "x");
    let k = 0;
    const stub = (prs) => {   // a stand-in for the REST call: prints the PR list for the branch it is given
      const f = path.join(dir, `prs-${k++}.mjs`);
      fs.writeFileSync(f, `if (process.argv[2] === "brycejmurrin:cursor/t-9") console.log(${JSON.stringify(JSON.stringify(prs))});`);
      return { APEX_PR_STATE_CMD: `node ${f}` };
    };
    const merged = stub([{ number: 3599, state: "closed", merged_at: "2026-10-23T00:00:00Z" }]);
    const r = claudeBash("git push origin cursor/t-9", dir, merged);
    assert.equal(r.status, 2, r.stderr);
    assert.ok(r.stderr.includes("#3599 merged"), r.stderr);
    const c = cursorShell("git push -u origin HEAD", dir, merged);
    assert.equal(c.status, 2);
    assert.ok(c.out.agent_message.includes("already finished"));
    assert.equal(claudeBash("git push origin cursor/t-9", dir, stub([{ number: 1, state: "closed", merged_at: null },
      { number: 2, state: "open", merged_at: null }])).status, 0, "a reopened / second open PR");
    assert.equal(claudeBash("git push origin cursor/t-9", dir, stub([])).status, 0, "no PR yet: the first push");
    assert.equal(claudeBash("APEX_CLOSED_PR_PUSH_OK=1 git push origin cursor/t-9", dir, merged).status, 0, "the push's own prefix");
    assert.equal(claudeBash("echo APEX_CLOSED_PR_PUSH_OK=1; git push origin cursor/t-9", dir, merged).status, 2, "not text elsewhere");
    assert.equal(claudeBash("git push origin cursor/t-9", dir, { APEX_PR_STATE_CMD: "false" }).status, 0, "an API error fails open");
    assert.equal(claudeBash("git push origin HEAD:claude/fleet-bus", dir, merged).status, 0, "only cursor/* branches");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Q10: the live-run stub hides /proc from the hook's python, so a live browser run cannot flip these tests", () => {
  const r = spawnSync("python3", ["-c", "import os; print(len(os.listdir('/proc')), len(os.listdir('.')) > 0)"], { cwd: ROOT, encoding: "utf8", env: ENV });
  assert.equal(r.stdout.trim(), "0 True");
});
