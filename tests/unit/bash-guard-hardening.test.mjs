// bash-guard-hardening.test.mjs — the slimmed Bash guard (.claude/hooks/bash-guard.sh,
// plan docs/plans/2026-11-03-agent-surface-reset.md §4.7): four refusals, each RUN
// against the real hook with a sample payload, plus the shapes it must leave alone.
// What the old 560-line guard did beyond these (push shapes, receipts, poll loops,
// the commit-reachability check, the shell parser) moved to .githooks/pre-push,
// settings.json deny/ask rules, CI, or was dropped; a `bash -c` / absolute-path
// wrapper is a documented miss (the header says so), not a case here.
//
// Run: node --test tests/unit/bash-guard-hardening.test.mjs   (< 5 s)
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/bash-guard.sh");
const run = (command, extra = {}, env = {}) => spawnSync("bash", [HOOK], {
  input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, ...extra }),
  encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
});
const refused = (cmd, re, extra) => { const r = run(cmd, extra); assert.equal(r.status, 2, `must refuse: ${cmd}\n${r.stderr}`); if (re) assert.match(r.stderr, re, cmd); };
const allowed = (cmd, extra) => { const r = run(cmd, extra); assert.equal(r.status, 0, `must allow: ${cmd}\n${r.stderr}`); assert.equal(r.stdout.trim(), "", cmd); };

test("1. the kill scan: pkill -f however spelled, killall, pgrep -f into kill; prose and other kills pass", () => {
  for (const cmd of ["pkill -f chrome", "pkill -9 -f node", "pkill -TERM -f chrome", "pkill --full playwright", "pkill -9f node",
    "pkill -u root -f chrome", "sudo pkill -f chrome", "timeout 5 pkill -f x", "ls; pkill -f chrome", 'pkill -f "serve -l 3456"'])
    refused(cmd, /pkill -f matches your own shell/);
  refused("killall chrome", /killall/);
  refused("killall node", /killall/);
  for (const cmd of ["kill -9 $(pgrep -f chrome)", "pgrep -f chrome | xargs kill -9", "pgrep -9f chrome | xargs kill"])
    refused(cmd, /pgrep -f piped or substituted/);
  for (const cmd of ["git status", "ps -eo pid,comm", 'echo "pkill -f chrome"', "pkill -x firefox", "pgrep -u root bash", "kill 999999",
    "grep -n pkill .claude/hooks/bash-guard.sh"])
    allowed(cmd);
});

test("1b. a bare kill of a Chromium pid is refused unless the command LEADS with APEX_KILL_OK=1", { skip: !fs.existsSync("/proc/self/comm") }, async () => {
  // A process whose /proc/<pid>/comm reads `chrome`: comm is the executable's name, so run a copy of sleep called chrome.
  const bin = fs.mkdtempSync(path.join(ROOT, "artifacts", "chrome-comm-"));
  fs.copyFileSync(spawnSync("bash", ["-c", "command -v sleep"], { encoding: "utf8" }).stdout.trim(), path.join(bin, "chrome"));
  fs.chmodSync(path.join(bin, "chrome"), 0o755);
  const fake = spawn(path.join(bin, "chrome"), ["30"], { stdio: "ignore", detached: true });
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) { try { if (fs.readFileSync(`/proc/${fake.pid}/comm`, "utf8").trim() === "chrome") break; } catch { /* not yet */ } }
  try {
    const comm = fs.readFileSync(`/proc/${fake.pid}/comm`, "utf8").trim();
    assert.equal(comm, "chrome", "fixture: comm must read chrome");
    refused(`kill ${fake.pid}`, /is a Chromium/);
    refused(`kill -9 ${fake.pid}`, /is a Chromium/);
    allowed(`APEX_KILL_OK=1 kill ${fake.pid}`);
    refused(`kill ${fake.pid} # APEX_KILL_OK=1`, /is a Chromium/, undefined);          // not a LEADING assignment
    refused(`ls; APEX_KILL_OK=1 kill ${fake.pid}`, /is a Chromium/, undefined);       // the assignment must lead the whole command text
  } finally { try { process.kill(-fake.pid, "SIGKILL"); } catch { /* gone */ } fs.rmSync(bin, { recursive: true, force: true }); }
});

test("2. a subagent never starts a browser run; the main session may; node-only checks stay open", () => {
  const sub = { transcript_path: "/root/.claude/projects/p/s/subagents/agent-abc.jsonl" };
  const browser = [
    "node tools/ci/test-bg.mjs smoke", "node ./tools/ci/test-bg.mjs smoke", "node /home/user/f1-game/tools/ci/test-bg.mjs smoke",
    "npx playwright test tests/specs/autopilot.spec.js", "playwright test", "npm exec playwright test", "npm test -- tests/specs/autopilot.spec.js", "npm t",
    "node tools/ci/verify-change.mjs --wait", "node tools/ci/verify-change.mjs", "node tools/ci/run-playwright.mjs --group smoke",
    "npm run test:smoke", "npm run --silent test:smoke -- --workers=1",
    "node tools/shot/shot.mjs monza", "node tools/ui/layout-audit.mjs", "node tools/gfx/gfx-probe.mjs monza",
    "node tools/mcp/debug-chrome.mjs start", "python3 tools/mcp/probe-mcp.py chrome-start",
  ];
  const nodeOnly = [
    "node tools/ci/test-bg.mjs --status", "node tools/ci/test-bg.mjs --tail smoke", "node tools/ci/verify-change.mjs --fast --json",
    "node tools/ci/verify-change.mjs --plan", "npm run test:guards", "npm run test:tooling-fast -- --changed",
    "node --test tests/unit/ratchets.test.mjs", "node tools/track/verify-track.cjs monza", "node tools/shot/frame-report.mjs --track monza",
    "node tools/mcp/debug-chrome.mjs status", "node tools/ci/pick-tests.mjs",
  ];
  for (const cmd of browser) refused(cmd, /subagent never starts a browser run/, sub);
  for (const cmd of browser) refused(cmd, /subagent never starts a browser run/, { agent_id: "a1" });
  for (const cmd of browser) refused(cmd, /subagent never starts a browser run/, { agent_type: "code-hunter" });
  for (const cmd of nodeOnly) allowed(cmd, sub);
  for (const cmd of browser) allowed(cmd);
});

test("3. the commit gate stays reachable: --no-verify / -n and core.hooksPath writes are refused; plain commits pass", () => {
  for (const cmd of ["git commit --no-verify -m x", "git commit -n -m x", "git commit -anm x", "git -c user.name=x commit --no-verify -m x",
    "cd js && git commit -m x --no-verify", "git config core.hooksPath /tmp/none", "git -c core.hooksPath=/x commit -m x",
    "GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit -m y", "git config --unset core.hooksPath"])
    refused(cmd, /pre-commit|hooksPath/);
  for (const cmd of ["git commit -m x", "git commit -am x", "git commit -m 'no -n here'", "git commit --amend --no-edit", "git commit -F msg.txt",
    "git -c user.name=x commit -m x", "git log -n 3", "git diff --name-only"])
    allowed(cmd);
  // the SessionStart hook is the one sanctioned setter
  assert.equal(run("git config core.hooksPath .githooks", {}, { APEX_HOOKSPATH_SETTER: "1" }).status, 0);
});

test("4. gh run cancel, the REST cancel, gh pr merge and gh pr ready are refused outright; reads pass", () => {
  for (const cmd of ["gh run cancel 123", "gh run cancel 123 --repo a/b", "curl -X POST https://api.github.com/repos/a/b/actions/runs/1/cancel",
    "gh api -X POST repos/a/b/actions/runs/1/force-cancel", "gh pr merge 1 --merge", "gh pr merge 1 --squash", "gh pr ready 1"])
    refused(cmd, /cancel|merges or arms|ready/);
  for (const cmd of ["gh run view 123", "gh run list", "gh pr view 1", "gh pr checks 1", "gh api repos/a/b/pulls/1", "gh pr edit 1 --add-label land"])
    allowed(cmd);
  // no env hatch for a cancel any more
  assert.equal(run("gh run cancel 1", {}, { APEX_RUN_CANCEL_OK: "1" }).status, 2);
});

test("fail closed on a payload it cannot read; an empty command passes; the header states the limits", () => {
  for (const input of ["not json", "[]", '{"tool_input":[]}', '{"tool_input":{"command":5}}']) {
    const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
    assert.equal(r.status, 2, input); assert.match(r.stderr, /fail closed/);
  }
  assert.equal(spawnSync("bash", [HOOK], { input: '{"tool_name":"Bash","tool_input":{}}', encoding: "utf8" }).status, 0);
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /bash -c/, "the header names the bash -c evasion");
  assert.match(src, /\.githooks\/pre-push/, "the header names the push backstop");
  assert.ok(src.split("\n").length <= 140, `bash-guard.sh is ${src.split("\n").length} lines (cap 140: it is the four rules, not a parser)`);
  for (const gone of ["shellparse", "merge_policy", "foreign_push", "APEX_SKIP_GUARDS", "GUARD_TRIGGER", "APEX_RUN_CANCEL_OK", "memory-sync"])
    assert.ok(!src.includes(gone), `bash-guard.sh still names ${gone}`);
});

test("settings.json wires the guard on Bash with onFailure block, and the deny/ask rules carry what left the hook", () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const bash = s.hooks.PreToolUse.filter((g) => g.matcher === "Bash");
  assert.equal(bash.length, 1);
  assert.deepEqual(bash[0].hooks.map((h) => [path.basename(h.command.replace(/"/g, "")), h.onFailure]), [["bash-guard.sh", "block"]]);
  for (const rule of ["Bash(git push *--no-verify*)", "Bash(git push --no-verify *)", "Bash(git commit *--no-verify*)", "Bash(git commit -n *)",
    "Bash(gh run cancel *)", "Bash(gh pr merge *)", "Bash(gh pr ready *)", "Bash(pkill -f *)", "Bash(killall *)", "Bash(git config * core.hooksPath*)",
    "mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge", "mcp__github__disable_pr_auto_merge", "mcp__github__update_pull_request_branch",
    "mcp__apex-tools__apex_codex_control"])
    assert.ok(s.permissions.deny.includes(rule), `deny must hold ${rule}`);
  for (const rule of ["Bash(gh api * -X DELETE *)", "Bash(gh api * --method DELETE *)", "Bash(gh workflow run *)", "mcp__github__actions_run_trigger"])
    assert.ok(s.permissions.ask.includes(rule), `ask must hold ${rule}`);
  assert.ok(s.permissions.allow.includes("Bash"), "bare Bash stays allowed");
  assert.equal(s.permissions.allow.filter((p) => p.startsWith("Bash(")).length, 0, "no Bash(...) allow entries: bare Bash makes them dead");
  for (const dead of ["mcp__MDN", "mcp__mcp_browserstack_com"]) assert.ok(!s.permissions.allow.includes(dead), `${dead} names no server`);
  assert.equal(s.enabledPlugins, undefined, "the ten false enabledPlugins entries did nothing");
  for (const t of [...s.permissions.deny, ...s.permissions.ask]) assert.ok(!s.permissions.allow.includes(t), `${t} is both allowed and gated`);
});
test("B8 #4561: H1 npm run test, H2 gh global flags, H3 wrapper options, H5 hatches, H6 --stop, H4 prose passes", () => {
  const sub = { agent_id: "a1" };
  for (const cmd of ["npm run test", "npm run test --silent", "npm run-script test", "npm run -s test -- x"]) refused(cmd, /subagent never starts a browser run/, sub);
  allowed("node tools/ci/test-bg.mjs --stop", sub);                                         // H6
  for (const cmd of ["touch .claude/allow-protected", ": > .claude/allow-context-cap", "touch '.claude/allow-protected'"])
    refused(cmd, /cannot lift a guard/, sub);                                                 // H5
  allowed("touch .claude/allow-protected");                                                 // the main session keeps its hatch
  for (const cmd of ["gh -R a/b pr merge 5", "gh --repo a/b pr merge 5 --merge", "gh --repo=a/b pr merge 5", "gh api -X PUT repos/a/b/pulls/5/merge",
    "gh api graphql -f query='mutation { mergePullRequest(input:{}) { clientMutationId } }'"]) refused(cmd, /merges or arms/);   // H2
  for (const cmd of ["gh -R a/b pr ready 5", "gh --repo a/b pr ready"]) refused(cmd, /ready/);
  refused("gh -R a/b run cancel 1", /cancel/);
  for (const cmd of ["env -i pkill -f x", "env FOO=1 pkill -f x", "sudo -E pkill -f x", "sudo -u root pkill -f x", "timeout -s KILL 5 pkill -f x",
    "nice pkill -f x", "nice -n 5 pkill -f x", "command pkill -f x", "time pkill -f x", "if true; then pkill -f x; fi", "{ pkill -f x; }",
    "! pkill -f x", 'echo "$(pkill -f x)"', "pkill '-f' x", "while true; do pkill -f x; done"]) refused(cmd, /pkill -f/);          // H3
  for (const cmd of ["command npm test", "time npm test", "if true; then npm test; fi"]) refused(cmd, /subagent never starts/, sub);
  for (const cmd of ["command git commit -n -m x", "time git commit --no-verify -m x"]) refused(cmd, /pre-commit/);
  const HP = "core." + "hooksPath";
  for (const cmd of [`git commit -m "docs: explain ${HP} setup"`, `git config --get ${HP}`, "echo 'see actions/runs/12/cancel'",
    "git commit -m \"$(cat <<'X'\nfix\n\ngh pr merge is banned\nX\n)\"", 'git commit -m "x\n\ngh run cancel mention"',
    "cat > notes.md <<'EOF'\ngh pr merge 5\npkill -f chrome\nEOF", "gh api repos/a/b/pulls/5/merge", "gh pr view 5 -R a/b"]) allowed(cmd);   // H4
  refused("bash <<'EOF'\npkill -f chrome\nEOF", /pkill -f/);                                 // a heredoc a shell reads still runs
  refused(`git config ${HP} /x`, /hooksPath/);
});
