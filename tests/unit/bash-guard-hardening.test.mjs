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

// R4-SUPPLY-4 (2026-10-10): allow-listed "read" commands that WRITE a named file.
// Each is auto-approved by settings.json (git checkout/restore/diff, sed -n, curl
// to loopback), so the edit guard was the only check, and shellparse saw none.
const READ_SHAPED_WRITES = [
  "git checkout HEAD~5 -- js/roster.js", "git checkout -- js/roster.js", "git checkout HEAD js/roster.js",
  "git checkout js/roster.js", "git -C js checkout -- roster.js",
  "git restore --source=HEAD~5 js/roster.js", "git restore js/roster.js", "git restore -s HEAD~1 js/roster.js",
  "git restore --staged --worktree js/roster.js",
  "sed -n 'w js/roster.js' AGENTS.md", "sed -e 's/a/b/w js/roster.js' AGENTS.md", "sed -ne '1p' -e '/a/W js/roster.js' AGENTS.md",
  "git diff --output=js/roster.js HEAD~1", "git log -p --output js/roster.js", "git show --output=js/roster.js HEAD",
  "curl -so js/roster.js http://127.0.0.1:3456/x", "curl --output js/roster.js http://127.0.0.1:3456/x",
  "curl -o js/roster.js http://127.0.0.1:3456/x", "curl -sSLojs/roster.js http://127.0.0.1:3456/x",
  "curl --output-dir js -o roster.js http://127.0.0.1:3456/x",
];
const READ_SHAPED_READS = [
  "git checkout main", "git checkout -b feat origin/main", "git checkout cursor/topic-1234", "git restore --staged js/roster.js",
  "git diff", "git diff HEAD~1 --stat -- js/roster.js", "git show HEAD:js/roster.js", "git log --oneline -- js/roster.js",
  "sed -n '1,20p' js/roster.js", "sed -n '/w x/p;$p' js/roster.js", "sed 's/w/W/g' js/roster.js", "sed -n 'l;w /dev/stdout' js/roster.js",
  "curl http://127.0.0.1:3456/x", "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3456/x", "curl -H 'X: -o js/roster.js' http://127.0.0.1:3456/x",
];

test("the edit guard blocks a generated file written by git checkout/restore/--output, sed w, curl -o (R4-SUPPLY-4)", () => {
  const repo = scratchRepo("hook-readwrite-");
  const run = (command) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/protect-files.sh")], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo.dir }),
    cwd: repo.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir },
  });
  try {
    fs.mkdirSync(path.join(repo.dir, "js"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "js/roster.js"), "var ApexRoster;\n");
    assert.equal(run("cp docs/PHYSICS.md js/roster.js").status, 2, "control: a cp onto the generated file is blocked");
    for (const cmd of READ_SHAPED_WRITES) {
      const r = run(cmd);
      assert.equal(r.status, 2, `must block: ${cmd} (${r.stderr})`);
      assert.match(r.stderr, /js\/roster\.js \(via Bash: (git-|sed-w|curl)/, `the refusal names the write: ${cmd}`);
    }
    for (const cmd of READ_SHAPED_READS) {
      const r = run(cmd);
      assert.equal(r.status, 0, `a read must stay open: ${cmd} (${r.stderr})`);
    }
  } finally { repo.rm(); }
});

// ── AGENT GUARDS (2026-10-14, docs/notes/AGENT-GUARDS-2026-10-14.md) ──────────
const hook = (script, payload, opts = {}) => spawnSync("bash", [path.join(ROOT, ".claude/hooks", script)], {
  input: typeof payload === "string" ? payload : JSON.stringify(payload),
  cwd: opts.cwd, encoding: "utf8",
  // NODE_TEST_CONTEXT would turn the hook's own `node --test` into a child of THIS run
  env: Object.fromEntries(Object.entries({ ...process.env, CLAUDE_PROJECT_DIR: opts.cwd || ROOT, ...(opts.env || {}) })
    .filter(([k]) => k !== "NODE_TEST_CONTEXT")),
});

test("a commit guard that outlives its time cap BLOCKS (rc 124 → exit 2), for test:guards and docs-integrity", () => {
  const repo = scratchRepo("hook-timeout-");
  try {
    // A tree whose guard steps are stubs: ratchets passes, test:guards and docs-integrity hang.
    fs.mkdirSync(path.join(repo.dir, "tools/check"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tests/unit"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "tools/check/ratchets.mjs"), "process.exit(0);\n");
    fs.writeFileSync(path.join(repo.dir, "package.json"), JSON.stringify({ scripts: { "test:guards": "sleep 30" } }));
    fs.writeFileSync(path.join(repo.dir, "tests/unit/docs-integrity.test.mjs"), "setTimeout(() => {}, 30000);\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "stubs");
    const commit = () => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command: "git commit -m x" }, cwd: repo.dir },
      { cwd: repo.dir, env: { APEX_GUARD_TIMEOUT: "1", APEX_GUARD_PROBE: "" } });
    fs.writeFileSync(path.join(repo.dir, "a.js"), "1;\n");
    repo.g("add", "a.js");
    let t = Date.now(), r = commit();
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /npm run test:guards did not finish within 1 s/);
    assert.ok(Date.now() - t < 15000, "the cap, not the stub, ended the run");
    repo.g("reset", "-q");
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 3\n");
    repo.g("add", "docs/PHYSICS.md");
    r = commit();
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /docs-integrity did not finish within 1 s/);
  } finally { repo.rm(); }
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const bg = settings.hooks.PreToolUse.flatMap((g) => g.hooks).find((h) => h.command.includes("bash-guard.sh"));
  const inner = Number(fs.readFileSync(HOOK, "utf8").match(/APEX_GUARD_TIMEOUT:-(\d+)/)[1]);
  assert.ok(inner + 15 <= bg.timeout, `inner guard cap ${inner} s must sit below the hook timeout ${bg.timeout} s`);
  for (const h of settings.hooks.PreToolUse.flatMap((g) => g.hooks))
    assert.equal(h.onFailure, "block", `${h.command}: a PreToolUse guard that crashes or times out must block`);
});

test("a subagent cannot boot Chromium through the capture CLIs either (tools/shot, tools/ui audits, gfx-probe)", () => {
  const run = (command, sub = true) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, ...(sub ? { agent_id: "a1", agent_type: "x" } : {}) });
  const browser = [
    "node tools/shot/shot.mjs monza", "node tools/shot/apex-eval.mjs monza 'a.info()'", "node tools/shot/agent.mjs monza info",
    "node ./tools/shot/flyby.mjs spa", "node /home/user/f1-game/tools/shot/hud-survey.mjs", "cd x && node tools/shot/backend-compare.mjs",
    "node tools/ui/layout-audit.mjs --screens=garage", "node tools/ui/menu-mock.mjs", "node tools/ui/css-play.mjs menus",
    "node tools/gfx/gfx-probe.mjs --backend webgpu", "node tools/shot/shot.mjs monza --helper",
  ];
  const open = [
    "node tools/shot/shot.mjs --help", "node tools/ui/layout-audit.mjs --help", "node tools/ui/css-play.mjs --plan",
    "node tools/shot/frame-report.mjs monza", "node tools/shot/cam-motion.mjs", "node tools/shot/cam-corners.mjs",
    "node tools/gfx/wgx-validate.mjs --static", "node tools/ui/menu-fit.mjs", "grep -n launch tools/shot/shot.mjs",
  ];
  for (const c of browser) assert.equal(run(c).status, 2, `a subagent must not run: ${c}`);
  for (const c of open) assert.equal(run(c).status, 0, `a subagent may run: ${c}`);
  for (const c of browser) assert.equal(run(c, false).status, 0, `the main session may run: ${c}`);
});

test("the push guard refuses force / mirror / delete / deploy-branch pushes in every shell shape", () => {
  const repo = scratchRepo("hook-push-");
  const run = (command) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, cwd: repo.dir }, { cwd: repo.dir });
  try {
    repo.g("checkout", "-qb", "cursor/topic-1234");
    for (const c of [
      "git push -f origin x", "git push --force", "git push --force-with-lease origin x", "git push -uf origin x",
      "git push origin +x", "git push origin +HEAD:cursor/topic", "git push --mirror origin", "git push origin --delete x",
      "git push -d origin x", "git push origin :x", "git push --all origin",
      "git -C . push -f origin x", "git --no-pager push --force", "git -c push.default=current push -f",
      "bash -c 'git push --force'", "env X=1 git push -f", "/usr/bin/git push -f", "if true; then git push -f; fi",
      "git push origin claude/f1-game-project-26h3ng", "git push origin HEAD:claude/f1-game-project-26h3ng",
      "git push origin HEAD:refs/heads/claude/f1-game-project-26h3ng", "git push -u origin cursor/x claude/f1-game-project-26h3ng",
      'git push "unbalanced',
    ]) {
      const r = run(c);
      assert.equal(r.status, 2, `must block: ${c} (${r.stderr})`);
      assert.match(r.stderr, /BLOCKED/, c);
    }
    for (const c of ["git push", "git push -u origin cursor/topic-1234", "git push origin HEAD", "git push origin HEAD:cursor/topic-1234",
      "git push -o ci.skip origin cursor/x", "echo 'git push --force'", "git log --oneline origin/claude/f1-game-project-26h3ng",
      "git fetch origin claude/f1-game-project-26h3ng", "git commit --dry-run -m 'never git push -f'"])
      assert.equal(run(c).status, 0, `must allow: ${c} (${run(c).stderr})`);
    // ON the deploy branch, a bare or HEAD push targets it.
    repo.g("checkout", "-qb", "claude/f1-game-project-26h3ng");
    for (const c of ["git push", "git push origin", "git push origin HEAD", "git -C . push -u origin HEAD"])
      assert.equal(run(c).status, 2, `on the deploy branch, must block: ${c}`);
    assert.equal(run("git push origin HEAD:cursor/topic-1234").status, 0, "an explicit topic destination is fine from any branch");
  } finally { repo.rm(); }
});

test("protect-files scopes track-surveyor writes to circuit pairs, scratch/ and artifacts/", () => {
  const repo = scratchRepo("hook-surveyor-");
  const run = (payload) => hook("protect-files.sh", { cwd: repo.dir, ...payload }, { cwd: repo.dir });
  const write = (rel, agent_type) => run({ tool_name: "Write", tool_input: { file_path: path.join(repo.dir, rel), content: "x" },
    ...(agent_type ? { agent_id: "a1", agent_type } : {}) });
  try {
    for (const rel of ["js/circuits/monza.js", "js/circuits/scenery/monza.js", "js/circuits/scenery/spa.js", "scratch/survey/a.md", "artifacts/x.json"])
      assert.equal(write(rel, "track-surveyor").status, 0, `surveyor may write ${rel}`);
    for (const rel of ["js/track/core/def.js", "js/game.js", "tests/data/landmarks/monza.json", "docs/PHYSICS.md", ["js/circuits/scenery", "sub", "x.js"].join("/"), "AGENTS.md"]) {
      const r = write(rel, "track-surveyor");
      assert.equal(r.status, 2, `surveyor must not write ${rel}`);
      assert.match(r.stderr, /track-surveyor writes only/);
    }
    assert.equal(write("js/track/core/def.js", "verify-agent").status, 0, "the scope is the surveyor's alone");
    assert.equal(write("js/track/core/def.js").status, 0, "the main session is unaffected");
    const bash = (command) => run({ tool_name: "Bash", tool_input: { command }, agent_id: "a1", agent_type: "track-surveyor" });
    assert.equal(bash("sed -i s/a/b/ js/track/core/def.js").status, 2);
    assert.equal(bash("echo x > js/circuits/scenery/monza.js").status, 0);
  } finally { repo.rm(); }
});

test("guards that fail open say so on stderr", () => {
  for (const script of ["protect-files.sh", "mcp-browser-guard.sh"]) {
    const r = hook(script, "not json");
    assert.equal(r.status, 0, script);
    assert.match(r.stderr, /WARNING .*did NOT run/, `${script} must warn when it cannot read the payload`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, ".claude/hooks/protect-files.py"), "utf8"),
    /except Exception as e:\s*\n(\s*#.*\n)*\s*sys\.stderr\.write\(f"protect-files: WARNING shellparse failed/,
    "a shellparse crash must warn before failing open");
});

test("github-mcp-guard asks before auto-merge and the draft→ready flip, and passes other PR edits", () => {
  const run = (tool_name, tool_input = {}) => hook("github-mcp-guard.sh", { tool_name, tool_input });
  const decision = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null; };
  for (const [name, input] of [["mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "SQUASH" }],
    ["mcp__github__update_pull_request", { pullNumber: 1, draft: false }], ["mcp__github__update_pull_request", { pullNumber: 1, draft: "false" }]]) {
    const d = decision(run(name, input));
    assert.equal(d?.hookEventName, "PreToolUse");
    assert.equal(d?.permissionDecision, "ask", `${name} ${JSON.stringify(input)}`);
    assert.match(d.permissionDecisionReason, /ready-gate\.mjs[\s\S]*ready-full-cap\.mjs/);
    assert.match(d.permissionDecisionReason, /CI Watch/);
  }
  for (const input of [{ pullNumber: 1, body: "x" }, { pullNumber: 1, title: "t" }, { pullNumber: 1, draft: true }])
    assert.equal(decision(run("mcp__github__update_pull_request", input)), null, `silent pass: ${JSON.stringify(input)}`);
  assert.equal(decision(hook("github-mcp-guard.sh", "not json")).permissionDecision, "ask", "an unreadable payload asks");
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  const re = new RegExp(g.matcher);
  for (const n of ["mcp__github__enable_pr_auto_merge", "mcp__github__update_pull_request"]) assert.ok(re.test(n), n);
  for (const n of ["mcp__github__update_pull_request_branch", "mcp__github__disable_pr_auto_merge", "mcp__github__merge_pull_request"])
    assert.ok(!re.test(n), `matcher must not catch ${n}`);
});
