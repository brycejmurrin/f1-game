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
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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

test("settings.json turns the merge prompts off for every session, and squash/rebase stay denied (Bryce 2026-10-15)", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  assert.equal(settings.env.APEX_MERGE_DESK, "1", "merging, arming and draft→ready run without a tap");
  const run = (tool_name, tool_input) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/github-mcp-guard.sh")], {
    input: JSON.stringify({ tool_name, tool_input }), encoding: "utf8",
    env: { ...process.env, APEX_MERGE_DESK: settings.env.APEX_MERGE_DESK },
  }).stdout.trim();
  assert.equal(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge" }), "", "a merge-commit merge passes silently");
  assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), "", "draft→ready passes silently");
  for (const m of ["squash", "rebase"])
    assert.match(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m }), /"deny"/, `${m} stays denied`);
});

test("settings.json registers bash-guard once, without unsupported per-step filters", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const hooks = settings.hooks.PreToolUse
    .filter((group) => group.matcher === "Bash")
    .flatMap((group) => group.hooks)
    .filter((entry) => entry.command.includes("bash-guard.sh"));
  assert.equal(hooks.length, 1, "one Bash call must start one imported Claude bash-guard");
  assert.equal(Object.hasOwn(hooks[0], "if"), false, "Cursor does not document Claude hook-step `if` filters");
  assert.equal(hooks[0].timeout, 360);
  assert.equal(hooks[0].onFailure, "block");
});

test("bash-guard fast-exits non-trigger commands within 500 ms", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  const trigger = src.match(/^GUARD_TRIGGER='([^']+)'$/m);
  assert.ok(trigger, "bash-guard declares its fast-path trigger union");
  assert.deepEqual(trigger[1].split("|").sort(),
    ["git", "gh ", "kill", "pgrep", "curl", "node", "npm", "npx", "playwright", "chrom", "python", "sh ", "eval", "xargs"].sort(),
    "the fast path stays in lockstep with the 14 former settings filters");
  const started = Date.now();
  const r = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo ordinary-command" } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const elapsed = Date.now() - started;
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.ok(elapsed < 500, `ordinary Bash guard path took ${elapsed} ms`);
});

test("pkill -f blocks whatever its pattern names: it always matches its own shell (#2125)", () => {
  // `pkill -f "serve -l 3456"` passed the old browser-word filter and killed its
  // own shell (exit 144) in two census siblings on 2026-10-15.
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  for (const cmd of [
    'pkill -f "serve -l 3456"', "pkill -f serve ; sleep 1", "pkill -f 'http.server'",
    "pkill -f zzz-census-nonexistent-pattern", "timeout 5 pkill --full apex-tools-mcp",
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  // killall matches process names, not command lines: unrelated names stay allowed
  for (const cmd of ["killall sleep", "pkill -x serve", 'echo "pkill -f serve"'])
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
    for (const rel of ["js/track/core/def.js", ["js", "game"].join("/") + ".js", "tests/data/landmarks/monza.json", "docs/PHYSICS.md", ["js/circuits/scenery", "sub", "x.js"].join("/"), "AGENTS.md"]) {
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

test("protect-files scopes agent-surface-reviewer to its scratch/**.md report and refuses its Bash writes", () => {
  const repo = scratchRepo("hook-reporter-");
  const who = { agent_id: "r1", agent_type: "agent-surface-reviewer" };
  const run = (payload) => hook("protect-files.sh", { cwd: repo.dir, ...payload, ...who }, { cwd: repo.dir });
  const write = (rel) => run({ tool_name: "Write", tool_input: { file_path: path.join(repo.dir, rel), content: "x" } });
  try {
    assert.equal(write("scratch/survey/x.md").status, 0, "the reviewer may write its report");
    for (const rel of [".claude/skills/x/SKILL.md", "scratch/survey/x.json", "AGENTS.md", "artifacts/x.md"]) {
      const r = write(rel);
      assert.equal(r.status, 2, `reviewer must not write ${rel}`);
      assert.match(r.stderr, /agent-surface-reviewer writes only/);
    }
    const bash = (command) => run({ tool_name: "Bash", tool_input: { command } });
    const game = ["js", "game"].join("/") + ".js";
    for (const c of [`sed -i s/a/b/ ${game}`, "echo x > scratch/survey/x.md", "rm scratch/old.md", "git stash"])
      assert.equal(bash(c).status, 2, `reviewer Bash must not write: ${c}`);
    for (const c of ["git log -n 5", "wc -l AGENTS.md"]) assert.equal(bash(c).status, 0, `reviewer may read: ${c}`);
  } finally { repo.rm(); }
});

test("guards that fail open say so on stderr; the MCP browser guard fails CLOSED (round 2)", () => {
  const r = hook("protect-files.sh", "not json");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING .*did NOT run/, "protect-files must warn when it cannot read the payload");
  // an unreadable payload cannot say whether a subagent sent it: refuse the browser tool
  const m = hook("mcp-browser-guard.sh", "not json");
  assert.equal(m.status, 2);
  assert.match(m.stderr, /BLOCKED: mcp-browser-guard could not read the hook payload/);
  assert.match(fs.readFileSync(path.join(ROOT, ".claude/hooks/protect-files.py"), "utf8"),
    /except Exception as e:\s*\n(\s*#.*\n)*\s*sys\.stderr\.write\(f"protect-files: WARNING shellparse failed/,
    "a shellparse crash must warn before failing open");
});

test("github-mcp-guard: merge commits only, asks before merge/arm and the draft→ready flip, passes other PR edits", () => {
  const run = (tool_name, tool_input = {}, env = { APEX_MERGE_DESK: "" }) => hook("github-mcp-guard.sh", { tool_name, tool_input }, { env });
  const decision = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null; };
  for (const [name, input] of [["mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "SQUASH" }],
    ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "squash" }], ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "rebase" }]]) {
    for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
      const d = decision(run(name, input, env));
      assert.equal(d?.permissionDecision, "deny", `${name} ${JSON.stringify(input)} ${JSON.stringify(env)}`);
      assert.match(d.permissionDecisionReason, /MERGE-COMMIT-ONLY/);
    }
  }
  for (const [name, input] of [["mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE" }],
    ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge" }], ["mcp__github__merge_pull_request", { pullNumber: 1 }],
    ["mcp__github__update_pull_request", { pullNumber: 1, draft: false }], ["mcp__github__update_pull_request", { pullNumber: 1, draft: "false" }]]) {
    const d = decision(run(name, input));
    assert.equal(d?.hookEventName, "PreToolUse");
    assert.equal(d?.permissionDecision, "ask", `${name} ${JSON.stringify(input)}`);
    assert.match(d.permissionDecisionReason, /ready-gate\.mjs/);
    assert.doesNotMatch(d.permissionDecisionReason, /ready-full-cap/, "the ready cap was retired 2026-10-16");
    assert.equal(decision(run(name, input, { APEX_MERGE_DESK: "1" })), null, `Merge Desk passes ${name}`);
  }
  for (const input of [{ pullNumber: 1, body: "x" }, { pullNumber: 1, title: "t" }, { pullNumber: 1, draft: true }])
    assert.equal(decision(run("mcp__github__update_pull_request", input)), null, `silent pass: ${JSON.stringify(input)}`);
  assert.equal(decision(hook("github-mcp-guard.sh", "not json")).permissionDecision, "ask", "an unreadable payload asks");
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  assert.ok(!settings.permissions.deny.includes("mcp__github__merge_pull_request"), "merges are gated by the hook, not denied (Grok Bot may merge)");
  const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  const re = new RegExp(g.matcher);
  for (const n of ["mcp__github__enable_pr_auto_merge", "mcp__github__update_pull_request", "mcp__github__merge_pull_request"]) assert.ok(re.test(n), n);
  for (const n of ["mcp__github__update_pull_request_branch", "mcp__github__disable_pr_auto_merge"])
    assert.ok(!re.test(n), `matcher must not catch ${n}`);
});

// ── RED-TEAM ROUND 2 (2026-10-14, docs/notes/AGENT-GUARDS-2026-10-14.md) ─────
// Every shape below walked past a guard in scratch/retest/hooks-redteam.md; the
// must-pass lists are the false-positive half of the same table.
const DEPLOY = "claude/f1-game-project-26h3ng";
const bashCall = (command, extra = {}) => ({ tool_name: "Bash", tool_input: { command }, ...extra });
const decisionOf = (r) => { try { return JSON.parse(r.stdout.trim().split("\n").pop()).hookSpecificOutput.permissionDecision; } catch { return null; } };

test("round 2 push: refspec DWIM, @, globs, --prune, config, abbreviations, aliases and wrappers all block", () => {
  const repo = scratchRepo("hook-push2-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir });
  try {
    repo.g("checkout", "-qb", "cursor/topic-1234");
    for (const c of [
      `git push origin HEAD:heads/${DEPLOY}`, `git push origin heads/${DEPLOY}`, "git push origin 'refs/heads/*:refs/heads/*'",
      "git push --prune origin 'refs/heads/*:refs/heads/*'", "git push --prune origin cursor/x",
      "git -c push.default=matching push origin", "git -c push.default=current push", "git -c remote.origin.push=refs/heads/*:refs/heads/* push",
      "git -c remote.origin.mirror=true push origin", "git -c alias.p=push p -f origin x", "git -c 'alias.p=!git push -f' p origin x",
      "git push --force-w origin x", "git push --forc origin x", "git push --mirr origin", "git push --dele origin cursor/old",
      "git push --al origin", "git push --branches origin", "git push --bran origin",
      "setsid git push -f origin x", "flock /tmp/l git push -f origin x", "flock -w 5 /tmp/l -c 'git push -f origin x'",
      "bash -o pipefail -c 'git push -f origin x'", "bash -c -- 'git push -f origin x'", "sh -ec 'git push -f origin x'",
      "bash <<< 'git push -f origin x'", "echo 'git push -f origin x' | bash", "printf 'git push -f origin x\\n' | sh",
      "env -S 'git push -f origin x'", "ionice -c 3 git push -f origin x", "nice -n 5 timeout -s KILL 30 git push -f origin x",
    ]) {
      const r = run(c);
      assert.equal(r.status, 2, `must block: ${c} (${r.stderr})`);
      assert.match(r.stderr, /BLOCKED/, c);
    }
    for (const c of ["git push -u origin cursor/topic-1234", "git push", "git push origin HEAD", "git push origin @",
      "git push origin cursor/x:cursor/x", "git push --follow-tags origin cursor/x", "git push --no-force-with-lease origin cursor/x",
      "git push --set-upstream origin cursor/x", "git push --tags origin", "git commit --dry-run -F - <<'EOF'\nsubject\n\nnever git push -f\nEOF"])
      assert.equal(run(c).status, 0, `must allow: ${c} (${run(c).stderr})`);
    repo.g("checkout", "-qb", DEPLOY);
    for (const c of ["git push origin @", "git push -u origin @"])
      assert.equal(run(c).status, 2, `on the deploy branch, must block: ${c}`);
    // a configured matching push from a bare `git push` widens it too
    repo.g("checkout", "-qb", "cursor/cfg-1");
    repo.g("config", "push.default", "matching");
    assert.equal(run("git push").status, 2, "push.default=matching in git config");
    assert.equal(run("git push origin cursor/cfg-1").status, 0, "an explicit refspec ignores push.default");
  } finally { repo.rm(); }
});

test("round 2 commit detection: wrapped commits and aliases still run the guards", () => {
  const repo = scratchRepo("hook-commit2-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "1" } });
  try {
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 3\n");
    repo.g("add", "docs/PHYSICS.md");
    for (const c of ["git -c alias.ci=commit ci -m x", "bash <<< 'git commit -m x'", "echo 'git commit -m x' | sh",
      "bash -o pipefail -c 'git commit -m x'", "setsid git commit -m x", "flock /tmp/l git commit -m x", "sh -ec 'git commit -m x'",
      "bash -c -- 'git commit -m x'", "env -S 'git commit -m x'"]) {
      const r = run(c);
      assert.match(r.stderr, /bash-guard probe: commit/, `the guard must SEE this commit: ${c}`);
    }
    for (const c of ["echo 'git commit -m x'", "git commit --dry-run -m x", "echo 'git commit -m x' | cat", "git log -1"])
      assert.doesNotMatch(run(c).stderr, /probe: commit/, `not a guarded commit: ${c}`);
  } finally { repo.rm(); }
});

test("round 2 gh: squash/rebase denied, other merges / ready flips ask, Merge Desk skips the ask", () => {
  const run = (command, env = { APEX_MERGE_DESK: "" }) => hook("bash-guard.sh", bashCall(command), { env });
  const deny = ["gh pr merge 12 --squash", "gh pr merge 12 -s", "gh pr merge 12 --rebase", "gh pr merge 12 -r --auto",
    "bash -c 'gh pr merge 1 --squash'", "gh api -X PUT repos/o/r/pulls/12/merge -f merge_method=squash",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{pullRequestId:\"x\", mergeMethod: SQUASH}) { clientMutationId } }'"];
  const ask = ["gh pr merge 12", "gh pr merge 12 --merge", "gh pr merge 12 --merge --auto", "gh pr merge 12 --squash=false --merge",
    "gh pr ready 12", "gh api -X PUT repos/o/r/pulls/12/merge", "gh api --method=PUT repos/o/r/pulls/12/merge",
    "gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{pullRequestId:\"x\"}) { clientMutationId } }'",
    "gh api -X POST repos/o/r/merges -f base=x -f head=y"];
  const pass = ["gh pr view 12", "gh pr list", "gh pr ready 12 --undo", "gh pr edit 12 --body 'never gh pr merge --squash'",
    "gh api repos/o/r/pulls/12/merge", "gh api repos/o/r/pulls/12", "gh pr create --draft --title t --body-file - <<'EOF'\ngh pr merge 1 --squash\nEOF",
    "git commit --dry-run -m 'gh pr merge 12 --squash'", "echo gh pr merge 12 --squash"];
  for (const c of deny) {
    for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
      const r = run(c, env);
      assert.equal(decisionOf(r), "deny", `${c} ${JSON.stringify(env)}: ${r.stdout}`);
      assert.match(r.stdout, /MERGE-COMMIT-ONLY/);
    }
  }
  for (const c of ask) {
    const r = run(c);
    assert.equal(decisionOf(r), "ask", `${c}: ${r.stdout}`);
    assert.equal(decisionOf(run(c, { APEX_MERGE_DESK: "1" })), null, `Merge Desk passes ${c}`);
  }
  assert.match(run("gh pr merge 12").stdout, /ready-gate\.mjs/, "the reason is github-mcp-guard's");
  for (const c of pass) assert.equal(decisionOf(run(c)), null, `silent pass: ${c}`);
});

test("round 2 subagent ban: decided on the parsed argv, every runner spelling, node-only checks stay open", () => {
  const sub = (command, extra = { agent_id: "a1", agent_type: "general-purpose" }) => hook("bash-guard.sh", bashCall(command, extra));
  const browser = ["node \"tools/ci/test-bg.mjs\" smoke", "npx playwright 'test'", "eval \"npm test\"", "sh -ec 'npm test'",
    "bash -c -- 'npx playwright test'", "npm t", "npm tst", "npm run-script test:smoke", "npm --silent test", "npm exec playwright test",
    "npm exec -- playwright test", "npx --yes playwright test", "npx -y playwright test", "./node_modules/.bin/playwright test",
    "node node_modules/@playwright/test/cli.js test", "cd tools/shot && node shot.mjs monza", "cd tools && node ./ui/layout-audit.mjs",
    "tools/mcp/apex-tools-mcp.sh call apex_shot '{\"track\":\"monza\"}'", "tools/mcp/apex-tools-mcp.sh call apex_hud_mock '{}'",
    "node tools/mcp/apex-tools-mcp.mjs call apex_eval '{}'", "echo 'npm test' | bash", "bash <<< 'npx playwright test'",
    "setsid npm test", "flock /tmp/l npm test", "xargs -I{} npm run test:smoke", "env CI=1 npx playwright test",
    "node tools/ci/verify-change.mjs", "npm run test", "npx -c 'playwright test'"];
  const open = ["npm run test:tooling-fast", "node --test tests/unit/docs-integrity.test.mjs", "node tools/shot/shot.mjs --help",
    "node tools/ui/css-play.mjs --plan", "node tools/ci/test-bg.mjs --status", "node tools/ci/test-bg.mjs --tail smoke",
    "node tools/ci/verify-change.mjs --fast", "node tools/shot/frame-report.mjs monza", "echo 'npm test'", "grep -rn 'playwright test' docs",
    "tools/mcp/apex-tools-mcp.sh call apex_status '{}'", "npx playwright install chromium", "cat <<'EOF'\nnpm test\nEOF",
    "node tools/ci/tooling-fast.mjs --jobs=3", "npm run test:guards"];
  for (const c of browser) assert.equal(sub(c).status, 2, `a subagent must not run: ${c}`);
  for (const c of open) assert.equal(sub(c).status, 0, `a subagent may run: ${c} (${sub(c).stderr})`);
  assert.equal(sub("npm t", { agent_type: "verify-agent" }).status, 2, "agent_type alone marks a subagent");
  for (const c of browser.slice(0, 6)) assert.equal(hook("bash-guard.sh", bashCall(c)).status, 0, `the main session may run: ${c}`);
});

test("round 2 mcp-browser-guard: agent_type counts, the apex browser list matches the MCP catalog and the matcher", () => {
  const run = (payload) => hook("mcp-browser-guard.sh", payload);
  assert.equal(run({ tool_name: "mcp__playwright-official__browser_navigate", agent_type: "general-purpose" }).status, 2);
  assert.equal(run({ tool_name: "mcp__apex-tools__apex_hud_mock", agent_id: "a1" }).status, 2);
  assert.equal(run({ tool_name: "mcp__apex-tools__apex_hud_mock" }).status, 0, "the main session keeps its browser");
  // every catalog entry that boots Chromium (kind "browser", or week 2) is guarded in all three places
  const src = fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs"), "utf8");
  const cat = src.slice(src.indexOf("const CATALOG = ["));
  const blocks = cat.split(/\n\s{4}name: "/).slice(1);
  const browserTools = blocks.filter((b) => /^\s*(kind: "browser"|week: 2),?$/m.test(b.split(/\n\s{2}\},?\n/)[0])).map((b) => b.split('"')[0]);
  assert.ok(browserTools.includes("apex_hud_mock") && browserTools.length >= 10, `catalog parse: ${browserTools}`);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const matcher = new RegExp(settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("mcp-browser-guard.sh"))).matcher);
  const parse = fs.readFileSync(path.join(ROOT, ".claude/hooks/shellparse.py"), "utf8");
  for (const t of [...browserTools, "apex_job_start"]) {
    assert.ok(matcher.test(`mcp__apex-tools__${t}`), `settings matcher must select ${t}`);
    assert.equal(run({ tool_name: `mcp__apex-tools__${t}`, agent_id: "a1" }).status, 2, `hook must block ${t}`);
    assert.match(parse, new RegExp(`"${t}"`), `shellparse APEX_BROWSER must list ${t} (apex-tools-mcp.sh call)`);
  }
});

test("round 2 protect-files: a symlink resolves before the rules; surveyor removals and whole-tree git verbs block", () => {
  const repo = scratchRepo("hook-pf2-");
  const out = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-pf2-link-"));
  const run = (payload) => hook("protect-files.sh", { cwd: repo.dir, ...payload }, { cwd: repo.dir });
  try {
    fs.writeFileSync(path.join(repo.dir, "version.json"), "{}\n");
    fs.symlinkSync(path.join(repo.dir, "version.json"), path.join(out, "v.json"));
    const w = run({ tool_name: "Write", tool_input: { file_path: path.join(out, "v.json"), content: "x" } });
    assert.equal(w.status, 2, w.stderr);
    assert.match(w.stderr, /version\.json.*GENERATED/);
    const surv = (command) => run({ tool_name: "Bash", tool_input: { command }, agent_id: "s1", agent_type: "track-surveyor" });
    for (const c of ["mv js/game.js scratch/g.js", "rm -rf js/track", "rm docs/PHYSICS.md", "git stash", "git stash pop",
      "git reset --hard", "git clean -fd", "git switch main", "git checkout -b x", "unlink js/game.js "])
      assert.equal(surv(c).status, 2, `surveyor must not: ${c}`);
    for (const c of ["rm scratch/x.txt", "mv scratch/a js/circuits/monza.js", "git stash list", "git clean -n", "rm -rf artifacts/old",
      "git status", "cp scratch/x js/circuits/scenery/monza.js"])
      assert.equal(surv(c).status, 0, `surveyor may: ${c} (${surv(c).stderr})`);
    // a generated file removed or rewritten by the cheap channels is a hand edit too
    for (const c of ["rm version.json", "awk -i inplace '{print}' version.json"])
      assert.equal(run({ tool_name: "Bash", tool_input: { command: c } }).status, 2, c);
    assert.equal(run({ tool_name: "Bash", tool_input: { command: "rm -rf scratch/x" } }).status, 0);
  } finally { repo.rm(); fs.rmSync(out, { recursive: true, force: true }); }
});

test("round 2 github-mcp-guard: falsy draft spellings ask; Merge Desk must name MERGE to arm", () => {
  const run = (tool_name, tool_input, env = { APEX_MERGE_DESK: "" }) => decisionOf(hook("github-mcp-guard.sh", { tool_name, tool_input }, { env }));
  for (const draft of [false, 0, "0", "no", "NO", "False", "off"])
    assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), "ask", `draft ${JSON.stringify(draft)}`);
  for (const draft of [true, 1, "true", null]) assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), null);
  const desk = { APEX_MERGE_DESK: "1" };
  assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1 }, desk), "ask", "an omitted method is the repo default");
  assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE" }, desk), null);
  for (const m of ["Squash-merge", ["squash"], "REBASE "]) assert.equal(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m }), "deny", JSON.stringify(m));
});

test("a PASSING commit tells the model which guard path ran: additionalContext + systemMessage JSON, exit 0", () => {
  // stderr is hidden on exit 0, so the docs-only vs full-guards path was invisible after a green commit.
  const repo = scratchRepo("hook-ctx-");
  try {
    fs.mkdirSync(path.join(repo.dir, "tools/check"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tests/unit"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "tools/check/ratchets.mjs"), "process.exit(0);\n");
    fs.writeFileSync(path.join(repo.dir, "package.json"), JSON.stringify({ scripts: { "test:guards": "true" } }));
    fs.writeFileSync(path.join(repo.dir, "tests/unit/docs-integrity.test.mjs"), "import { test } from 'node:test'; test('ok', () => {});\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "stubs");
    const commit = (command = "git commit -m x") => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }),
      { cwd: repo.dir, env: { APEX_GUARD_PROBE: "", APEX_MERGE_DESK: "" } });   // the gh ask below needs a non-desk session
    const out = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note ctx\n");
    repo.g("add", "docs/PHYSICS.md");
    let j = out(commit());
    assert.equal(j.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(j.hookSpecificOutput.permissionDecision, undefined, "context only: the allow is unchanged");
    assert.match(j.hookSpecificOutput.additionalContext, /docs-only commit — ran tests\/unit\/docs-integrity\.test\.mjs only \(green, \d+ s\)/);
    assert.equal(j.systemMessage, j.hookSpecificOutput.additionalContext);
    repo.g("reset", "-q"); repo.g("checkout", "--", "docs/PHYSICS.md");
    fs.writeFileSync(path.join(repo.dir, "a.js"), "1;\n");
    repo.g("add", "a.js");
    j = out(commit());
    assert.match(j.hookSpecificOutput.additionalContext, /code commit — ratchets --auto-raise \(0 raised\/lowered\) then npm run test:guards \(green, \d+ s/);
    // a commit plus a gh ask: still ONE object, carrying both
    j = out(commit("git commit -m x && gh pr ready 12"));
    assert.equal(j.hookSpecificOutput.permissionDecision, "ask");
    assert.match(j.hookSpecificOutput.additionalContext, /code commit/);
    // no commit, no gh: stdout stays empty
    assert.equal(hook("bash-guard.sh", bashCall("git status", { cwd: repo.dir }), { cwd: repo.dir }).stdout, "");
  } finally { repo.rm(); }
});

test("a commit in a linked worktree borrows the main checkout's node_modules instead of blocking (2026-10-15)", () => {
  // EnterWorktree, `isolation: worktree` workers and `git worktree add` make a tree with no
  // node_modules; every worker commit blocked on it (census session_01CgCjzTvy729SeWsHzuv8eh).
  const repo = scratchRepo("hook-wt-");
  const wt = repo.dir + "-wt";
  try {
    fs.mkdirSync(path.join(repo.dir, "tools/check"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tests/unit"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".gitignore"), "node_modules\n");
    fs.writeFileSync(path.join(repo.dir, "tools/check/ratchets.mjs"), "process.exit(0);\n");
    fs.writeFileSync(path.join(repo.dir, "package.json"), JSON.stringify({ scripts: { "test:guards": "true" } }));
    fs.writeFileSync(path.join(repo.dir, "tests/unit/docs-integrity.test.mjs"), "import { test } from 'node:test'; test('ok', () => {});\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "stubs");
    fs.mkdirSync(path.join(repo.dir, "node_modules/.bin"), { recursive: true });
    repo.g("worktree", "add", "-q", wt, "-b", "wt-branch");
    assert.equal(fs.existsSync(path.join(wt, "node_modules")), false, "a fresh worktree has no node_modules");
    fs.writeFileSync(path.join(wt, "docs/PHYSICS.md"), "note from the worktree\n");
    spawnSync("git", ["add", "docs/PHYSICS.md"], { cwd: wt });
    const r = hook("bash-guard.sh", bashCall("git commit -m x", { cwd: wt }), { cwd: wt, env: { APEX_GUARD_PROBE: "" } });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /node_modules is missing/);
    assert.equal(fs.realpathSync(path.join(wt, "node_modules")), fs.realpathSync(path.join(repo.dir, "node_modules")));
    assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: wt, encoding: "utf8" }).stdout.includes("node_modules"), false,
      "the borrowed link is git-ignored");
    // the main checkout itself is never linked to anything
    fs.rmSync(path.join(repo.dir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note main\n");
    repo.g("add", "docs/PHYSICS.md");
    const m = hook("bash-guard.sh", bashCall("git commit -m x", { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "" } });
    assert.equal(m.status, 2, "a main checkout with no install still blocks");
    assert.match(m.stderr, /node_modules is missing/);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: repo.dir });
    fs.rmSync(wt, { recursive: true, force: true });
    repo.rm();
  }
});

// ── THE CLOG OF 2026-10-15 (docs/notes/CI-CLOG-SURVEY-2026-10-15.md) ────────
// 306 of 401 PR runs that day ended cancelled, 142 of them in 17 one-minute
// sweeps under the owner's account, and every sweep was followed by a
// "retrigger" push. A queued run holds no slot, so the sweep bought nothing
// and the retrigger bought a second run. Both doors refuse the cancel; the
// push hold AGENTS.md rule 4 described in prose is enforced.
test("2026-10-15: an Actions run cancel is refused at both doors; a re-run asks", () => {
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command), { env });
  for (const c of ["gh run cancel 38683549544", "gh run cancel 1 --repo o/r", "gh api -X POST repos/o/r/actions/runs/123/cancel",
    "curl -X POST -H 'Authorization: Bearer x' https://api.github.com/repos/o/r/actions/runs/123/cancel",
    "curl -X POST \"https://api.github.com/repos/o/r/actions/runs/123/cancel\"", "bash -c 'gh run cancel 5'",
    "gh api -X POST repos/o/r/actions/runs/123/force-cancel", "gh api -X POST \"repos/o/r/actions/runs/$id/cancel\""]) {
    const r = run(c);
    assert.equal(r.status, 2, `must block: ${c} (${r.stderr})`);
    assert.match(r.stderr, /BLOCKED: cancelling an Actions run/);
  }
  for (const c of ["gh run view 1", "gh run list --limit 5", "echo 'gh run cancel 1'", "gh api repos/o/r/actions/runs/123/jobs",
    "node tools/ci/test-bg.mjs --stop", "cat >> t.mjs <<'EOT'\ncurl https://api.github.com/repos/o/r/actions/runs/123/cancel\nEOT"])
    assert.equal(run(c).status, 0, `must allow: ${c}`);
  assert.equal(run("gh run cancel 1", { APEX_RUN_CANCEL_OK: "1" }).status, 0, "the user asked: env override");
  assert.equal(run("APEX_RUN_CANCEL_OK=1 gh run cancel 1").status, 0, "the user asked: command override");
  const mcp = (tool_input, env = {}) => decisionOf(hook("github-mcp-guard.sh", { tool_name: "mcp__github__actions_run_trigger", tool_input }, { env }));
  assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }), "deny");
  assert.equal(mcp({ method: "force_cancel_workflow_run", run_id: 1 }), "deny");
  assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }, { APEX_RUN_CANCEL_OK: "1" }), null, "the user asked");
  const noDesk = { APEX_MERGE_DESK: "" };
  assert.equal(mcp({ method: "rerun_failed_jobs", run_id: 1 }, noDesk), "ask", "a re-run is at most once, infra only");
  assert.equal(mcp({ method: "rerun_workflow_run", run_id: 1 }, noDesk), "ask");
  // Bryce 2026-10-15 ("all tools and mcps enabled", "Fix for me"): settings.json sets
  // APEX_MERGE_DESK=1 for every session, so a re-run passes silently; cancels stay denied.
  for (const method of ["rerun_failed_jobs", "rerun_workflow_run"])
    assert.equal(mcp({ method, run_id: 1 }, { APEX_MERGE_DESK: "1" }), null, `desk passes ${method}`);
  assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }, { APEX_MERGE_DESK: "1" }), "deny", "the desk never cancels");
  assert.equal(mcp({ method: "run_workflow", workflow_id: "ci.yml", ref: "x" }), null, "a dispatch passes");
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  assert.ok(new RegExp(g.matcher).test("mcp__github__actions_run_trigger"), "the matcher must route actions_run_trigger through the guard");
});

// The push hold (#2182, 2026-10-15) was retired on 2026-10-16 (CI/CD review
// #2333 finding 7): a git push is never refused on the queue gauge.
test("2026-10-16: a git push is not held on the queue gauge", () => {
  const repo = scratchRepo("hook-push-nohold-");
  try {
    repo.g("remote", "add", "origin", "https://github.com/brycejmurrin/f1-game.git");
    repo.g("checkout", "-qb", "cursor/topic-1234");
    fs.mkdirSync(path.join(repo.dir, "tools/ci"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "tools/ci/queue-depth.mjs"), `console.log("= queue hold (99 Linux jobs in flight / 40, 50 queued, 0 macOS / 5)"); process.exit(1);\n`);
    const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "" } });
    for (const c of ["git push -u origin cursor/topic-1234", "git push", "git -C . push origin HEAD"]) {
      const r = run(c);
      assert.equal(r.status, 0, `never held: ${c} (${r.stderr})`);
      assert.doesNotMatch(r.stderr, /queue hold/);
    }
  } finally { repo.rm(); }
});

// ── BLOCKER CENSUS (2026-10-15, docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md §Blocker census) ──
test("protect-files: a git conflict-side or committed-source restore of a generated file passes; any other ref still blocks", () => {
  const repo = scratchRepo("hook-resolve-");
  const run = (command) => hook("protect-files.sh", { tool_name: "Bash", tool_input: { command }, cwd: repo.dir }, { cwd: repo.dir });
  try {
    fs.mkdirSync(path.join(repo.dir, "tests/data"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "js"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "tests/data/ratchets.json"), "{}\n");
    fs.writeFileSync(path.join(repo.dir, "js/roster.js"), "x\n");
    fs.writeFileSync(path.join(repo.dir, "version.json"), "{}\n");
    // Outside a merge --ours/--theirs restore from the INDEX, which can hold a
    // staged hand edit: the side flags are only conflict resolution mid-merge.
    const SIDES = ["git checkout --theirs tests/data/ratchets.json", "git checkout --ours -- js/roster.js",
      "git checkout -m version.json", "git restore --theirs tests/data/ratchets.json"];
    for (const c of SIDES) {
      const r = run(c);
      assert.equal(r.status, 2, `no merge in progress, so not a resolution: ${c}`);
      assert.match(r.stderr, /GENERATED/, c);
    }
    fs.writeFileSync(path.join(repo.dir, ".git/MERGE_HEAD"), repo.g("rev-parse", "HEAD").stdout);
    for (const c of [...SIDES,
      "git checkout --theirs docs/PHYSICS.md tests/data/ratchets.json",
      "git checkout MERGE_HEAD -- tests/data/ratchets.json",
      "git checkout origin/claude/f1-game-project-26h3ng -- js/roster.js",
      "git restore --source=MERGE_HEAD version.json",
      "git restore -s origin/claude/f1-game-project-26h3ng tests/data/ratchets.json",
      "git restore -sMERGE_HEAD js/roster.js"]) {
      const r = run(c);
      assert.equal(r.status, 0, `conflict resolution is not a hand edit: ${c} (${r.stderr})`);
    }
    // R4-SUPPLY-4 holds: content from an arbitrary ref is still a write the generated rule refuses
    for (const c of ["git checkout origin/x -- version.json", "git restore --source=evil tests/data/ratchets.json",
      "git checkout HEAD -- version.json", "git restore --source=HEAD~3 js/roster.js",
      "git restore -sfeature js/roster.js", "cp /tmp/r.json tests/data/ratchets.json"]) {
      const r = run(c);
      assert.equal(r.status, 2, `must still block: ${c}`);
      assert.match(r.stderr, /GENERATED/, c);
    }
  } finally { repo.rm(); }
});

test("bash-guard: `git add X && git commit` in one command counts X as staged (census: 7 false blocks)", () => {
  const repo = scratchRepo("hook-addcommit-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "1" } });
  try {
    fs.mkdirSync(path.join(repo.dir, "js/core"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "js/core/log.js"), "1\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "code");
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 2\n");
    let r = run("git add docs/PHYSICS.md && git commit -m x");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /probe: commit docs-only/, "the added doc is the whole commit");
    fs.writeFileSync(path.join(repo.dir, "js/core/log.js"), "2\n");
    r = run("git add js/core/log.js && git commit -m x");
    assert.equal(r.status, 2, "docs/PHYSICS.md is still unstaged");
    assert.match(r.stderr, /unstaged changes[\s\S]*docs\/PHYSICS\.md/);
    assert.doesNotMatch(r.stderr, /^\s+js\/core\/log\.js$/m, "the added file is not reported as unstaged");
    r = run("git add js/core/log.js docs/PHYSICS.md && git commit -m x");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /probe: commit code/, "a code path in the add makes it a code commit");
    for (const c of ["git add -A && git commit -m x", "git add . && git commit -m x", "git add -u; git commit -m x"]) {
      r = run(c);
      assert.equal(r.status, 0, `${c}: ${r.stderr}`);
      assert.match(r.stderr, /probe: commit code/, `${c} stages everything, so it is never docs-only`);
    }
    // no add in the command: the unstaged rule is unchanged
    assert.equal(run("git commit -m x").status, 2);
    assert.equal(run("echo 'git add js/core/log.js' && git commit -m x").status, 2, "a quoted add is prose");
  } finally { repo.rm(); }
});

test("bash-guard: survey images and reports commit on the docs-only path; a code file or an image elsewhere does not", () => {
  const repo = scratchRepo("hook-survey-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "1" } });
  const put = (rel, body = "x") => { fs.mkdirSync(path.dirname(path.join(repo.dir, rel)), { recursive: true }); fs.writeFileSync(path.join(repo.dir, rel), body); };
  try {
    fs.mkdirSync(path.join(repo.dir, "tools/ci"), { recursive: true });   // a tree WITH tools/: the no-tools skip (#2428) is not under test here
    put("artifacts/shots/tracks/spa/t1.png"); put("artifacts/shots/gallery/index.html");
    put("artifacts/track-survey/spa-report/report.json"); put("docs/PHYSICS.md", "survey prose\n");
    repo.g("add", "-f", "artifacts", "docs");
    let r = run("git commit -m survey");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /probe: commit docs-only/, "survey images, reports and prose are the docs-only path");
    put("js/core/log.js");
    repo.g("add", "js/core/log.js");
    r = run("git commit -m survey");
    assert.match(r.stderr, /probe: commit code/, "a code file in the commit runs the full guards");
    repo.g("reset", "-q", "js/core/log.js"); fs.rmSync(path.join(repo.dir, "js"), { recursive: true });
    for (const rel of ["assets/pack/x.png", "artifacts/shots/other/x.png", "artifacts/track-survey/spa-report/run.js"]) {
      put(rel); repo.g("add", "-f", rel);
      r = run("git commit -m x");
      assert.match(r.stderr, /probe: commit code/, `${rel} is not a survey asset`);
      repo.g("reset", "-q", rel); fs.rmSync(path.join(repo.dir, rel));
    }
  } finally { repo.rm(); }
});

// PostToolUse stdout is debug-log only: "For most events, Claude Code writes stdout to
// the debug log" — UserPromptSubmit/SessionStart are the exceptions
// (https://code.claude.com/docs/en/hooks, Exit code 0). The advice must travel as
// hookSpecificOutput.additionalContext or the model never reads it (#2228 research).
test("post-edit.sh hands its advice to the model as PostToolUse additionalContext JSON, and stays silent with none", () => {
  const repo = scratchRepo("hook-postedit-");
  const run = (rel) => hook("post-edit.sh", { tool_name: "Write", hook_event_name: "PostToolUse",
    tool_input: { file_path: path.join(repo.dir, rel) }, cwd: repo.dir }, { cwd: repo.dir });
  try {
    fs.mkdirSync(path.join(repo.dir, "js/core"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "js/core/log.js"), "function (\n");
    let r = run("js/core/log.js");
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /\[post-edit\] js\/core\/log\.js does not parse/);
    fs.writeFileSync(path.join(repo.dir, "js/core/log.js"), "var ok = 1;\n");
    r = run("js/core/log.js");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "", "no advice, no output");
  } finally { repo.rm(); }
});

// #2429: taking one whole side of a multi-hunk conflict warns (advisory, exit 0).
test("git checkout --theirs/--ours warns when the file has several conflict hunks", () => {
  const repo = scratchRepo("hook-theirs-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir });
  const hunk = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\n";
  try {
    fs.writeFileSync(path.join(repo.dir, "one.txt"), hunk);
    fs.writeFileSync(path.join(repo.dir, "three.txt"), hunk.repeat(3));
    let r = run("git checkout --theirs one.txt");
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /conflict hunks/, "one hunk is silent");
    for (const c of ["git checkout --theirs three.txt", "git checkout --ours -- three.txt", "git checkout --conflict=diff3 three.txt"]) {
      r = run(c);
      assert.equal(r.status, 0, `advisory, not a block: ${c}`);
      assert.match(r.stderr, /three\.txt has 3 conflict hunks; this keeps one side for all of them/, c);
    }
    assert.doesNotMatch(run("git checkout three.txt").stderr, /conflict hunks/, "no side flag, no warning");
  } finally { repo.rm(); }
});

// #2428: a tree with no tools/ (track-survey-assets image branches) skips the guards with a note.
test("a commit in a tree with no tools/ skips the guards unless it stages code", () => {
  const repo = scratchRepo("hook-notools-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "1" } });
  try {
    fs.mkdirSync(path.join(repo.dir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "assets/a.png"), "x");
    repo.g("add", "assets/a.png");
    let r = run("git commit -m img");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /guards skipped: no tools\/ in this tree/);
    fs.mkdirSync(path.join(repo.dir, "js"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "js/a-fixture.txt"), "var a;\n");
    repo.g("add", "js/a-fixture.txt");
    r = run("git commit -m code");
    assert.doesNotMatch(r.stderr, /guards skipped/, "staged js/ is still guarded");
    assert.match(r.stderr, /probe: commit code/);
  } finally { repo.rm(); }
});

// H4/H5 and the H2 unmark (retro 2026-10-17, hooks H2-H5)
test("H4: a push over a red tooling-fast run is refused; && chains, green logs and the override pass", () => {
  const repo = scratchRepo("hook-pushred-");
  try {
    const push = (command, env = {}) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, cwd: repo.dir }, { cwd: repo.dir, env });
    const log = path.join(repo.dir, "artifacts/logs/tooling-fast-suite.log");
    fs.mkdirSync(path.dirname(log), { recursive: true });
    // chained with ';' the push runs on a red result: refused before the run starts
    let r = push("node tools/ci/tooling-fast.mjs; git push -u origin x");
    assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /tooling-fast \.\.\.; git push/);
    r = push("npm run test:tooling-fast\ngit push -u origin x");
    assert.equal(r.status, 2, r.stderr);
    assert.notEqual(push("node tools/ci/tooling-fast.mjs && git push -u origin x").status, 2, "&& is the safe join");
    // newest log red, written after HEAD
    fs.writeFileSync(log, "x\n= run failed (39 passed, 1 failed)\n");
    r = push("git push -u origin x");
    assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /= run failed \(39 passed, 1 failed\)/);
    assert.notEqual(push("git push -u origin x", { APEX_PUSH_FAILED_OK: "1" }).status, 2, "override");
    assert.notEqual(push("APEX_PUSH_FAILED_OK=1 git push -u origin x").status, 2, "inline override");
    assert.notEqual(push("git status").status, 2, "only a push is held");
    fs.writeFileSync(log, "x\n= run passed (40 passed, 0 failed)\n");
    assert.notEqual(push("git push -u origin x").status, 2, "green log");
    // a red log from before HEAD is stale
    fs.writeFileSync(log, "= run failed (1 passed, 1 failed)\n");
    const old = new Date(Date.now() - 86400e3); fs.utimesSync(log, old, old);
    assert.notEqual(push("git push -u origin x").status, 2, "stale log");
  } finally { repo.rm(); }
});

test("H5: a loaded box gets the longer guard cap, above it sits the hook timeout; H2 unmark runs before git verbs", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /\/proc\/loadavg[^\n]*GUARD_T=300/);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  for (const h of settings.hooks.PreToolUse.flatMap((g) => g.hooks).filter((h) => h.command.includes("bash-guard.sh")))
    assert.ok(h.timeout >= 300 + 15, `bash-guard hook timeout ${h.timeout} must clear the loaded cap`);
  const repo = scratchRepo("hook-unmark-");
  try {
    fs.mkdirSync(path.join(repo.dir, ".claude/memory"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude/memory/a.md"), "a\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "mem");
    repo.g("update-index", "--assume-unchanged", ".claude/memory/a.md");
    assert.match(repo.g("ls-files", "-v").stdout, /^h \.claude\/memory\/a\.md/m);
    const r = hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command: "git add -A && git commit -m x" }, cwd: repo.dir },
      { cwd: repo.dir, env: { APEX_MEMORY_SYNC: "1", APEX_GUARD_PROBE: "1" } });
    assert.notEqual(r.status, null);
    assert.match(repo.g("ls-files", "-v").stdout, /^H \.claude\/memory\/a\.md/m, "unmarked before the git verb");
  } finally { repo.rm(); }
});
