// bash-guard-hardening.test.mjs — the Bash guard (.claude/hooks/bash-guard.sh → bash-guard.py on the shellparse.py
// tokeniser). Every row RUNS the real hook on a sample payload. The guard judges the simple commands a shell would
// run, so each rule is tested in the spellings a shell accepts (leading space, compounds, wrappers, env prefixes,
// global flags, substitutions, `bash -c`, a heredoc a shell reads) and against text that only MENTIONS a rule
// (a commit message, an echo, a heredoc written to a file, a grep pattern), which must pass.
//
// Run: node --test tests/unit/bash-guard-hardening.test.mjs   (< 10 s)
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
const refused = (cmd, re, extra) => { const r = run(cmd, extra); assert.equal(r.status, 2, `must refuse: ${JSON.stringify(cmd)}\n${r.stderr}`); if (re) assert.match(r.stderr, re, cmd); };
const allowed = (cmd, extra) => {
  const r = run(cmd, extra);
  assert.equal(r.status, 0, `must allow: ${JSON.stringify(cmd)}\n${r.stderr}`);
  if (r.stdout.trim()) assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, undefined, `no decision for ${cmd}`);
  return r;
};
const SUB = { agent_id: "a1", agent_type: "worker" };
const HP = "core." + "hooksPath";

test("1. kills by name are refused in every shell spelling; listing processes and killing a pid you hold pass", () => {
  for (const cmd of ["pkill -f chrome", "pkill -9 -f node", "pkill --full playwright", "pkill -9f node", "sudo pkill -f chrome",
    "timeout 5 pkill -f x", "ls; pkill -f chrome", 'pkill -f "serve -l 3456"', " pkill -f x", "if true; then pkill -f x; fi",
    "{ pkill -f x; }", "command pkill -f x", "env FOO=1 pkill -f x", "env -i pkill -f x", "nice -n 5 pkill -f x", "\\pkill -f x",
    "/usr/bin/pkill -f x", "while true; do pkill -f x; done", "! pkill -f x", 'echo "$(pkill -f x)"', "pkill '-f' x",
    "bash -c 'pkill -f x'", "sh -c \"pkill -f x\"", "eval 'pkill -f x'", "bash <<'EOF'\npkill -f chrome\nEOF",
    "case a in a) pkill -f x;; esac", "pkill chrome", "pkill -x chrome", "nohup pkill node &"])
    refused(cmd, /pkill/);
  for (const cmd of ["killall chrome", "killall node", "sudo killall -9 chrome", "x=1; killall chrome"]) refused(cmd, /killall/);
  for (const cmd of ["kill -9 $(pgrep -f chrome)", "pgrep -f chrome | xargs kill -9", "pgrep chrome | xargs kill", "kill $(pidof chrome)",
    "kill -9 `pgrep chrome`", "pidof chrome | xargs -r kill"])
    refused(cmd, /pgrep|pidof/);
  for (const cmd of ["git status", "ps -eo pid,comm", 'echo "pkill -f chrome"', "pgrep -u root bash", "pgrep -fa chrome", "kill 999999",
    "grep -n pkill .claude/hooks/bash-guard.sh", "git commit -m 'stop: never pkill -f'", "cat > notes.md <<'EOF'\npkill -f chrome\nkillall node\nEOF",
    "ps aux | grep Chrome", "kill %1"])
    allowed(cmd);
});

test("1b. a kill of a Chromium pid is refused unless that kill carries APEX_KILL_OK=1", { skip: !fs.existsSync("/proc/self/comm") }, async () => {
  // A process whose /proc/<pid>/comm reads `chrome`: comm is the executable's name, so run a copy of sleep called chrome.
  const bin = fs.mkdtempSync(path.join(ROOT, "artifacts", "chrome-comm-"));
  fs.copyFileSync(spawnSync("bash", ["-c", "command -v sleep"], { encoding: "utf8" }).stdout.trim(), path.join(bin, "chrome"));
  fs.chmodSync(path.join(bin, "chrome"), 0o755);
  const fake = spawn(path.join(bin, "chrome"), ["30"], { stdio: "ignore", detached: true });
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) { try { if (fs.readFileSync(`/proc/${fake.pid}/comm`, "utf8").trim() === "chrome") break; } catch { /* not yet */ } }
  try {
    assert.equal(fs.readFileSync(`/proc/${fake.pid}/comm`, "utf8").trim(), "chrome", "fixture: comm must read chrome");
    refused(`kill ${fake.pid}`, /is a Chromium/);
    refused(`kill -9 ${fake.pid}`, /is a Chromium/);
    refused(`ls && kill -s TERM ${fake.pid}`, /is a Chromium/);
    refused(`kill ${fake.pid} # APEX_KILL_OK=1`, /is a Chromium/);                 // a comment is not an assignment
    allowed(`APEX_KILL_OK=1 kill ${fake.pid}`);
    allowed(`ls; APEX_KILL_OK=1 kill ${fake.pid}`);                                  // the assignment is on the kill itself
  } finally { try { process.kill(-fake.pid, "SIGKILL"); } catch { /* gone */ } fs.rmSync(bin, { recursive: true, force: true }); }
});

test("2. a subagent never starts a browser run, by any entry point; browser-free modes and the main session pass", () => {
  const browser = [
    "node tools/ci/test-bg.mjs smoke", "node ./tools/ci/test-bg.mjs smoke", "node /home/user/f1-game/tools/ci/test-bg.mjs smoke",
    "npx playwright test tests/specs/autopilot.spec.js", "playwright test", "npm exec playwright test", "npm test -- tests/specs/autopilot.spec.js", "npm t",
    "npm run test", "npm run test --silent", "npm run-script test", "npm run -s test -- x", " npm test", "command npm test", "time npm test",
    "if true; then npm test; fi", "node_modules/.bin/playwright test", "./node_modules/.bin/playwright test x", "node node_modules/playwright/cli.js test",
    "npx --yes playwright test", "node tools/ci/verify-change.mjs --wait", "node tools/ci/verify-change.mjs", "node tools/ci/run-playwright.mjs --group smoke",
    "npm run test:smoke", "npm run --silent test:smoke -- --workers=1", "node tools/mcp/debug-chrome.mjs start", "python3 tools/mcp/probe-mcp.py chrome-start",
    "node tools/mcp/browser-http-up.mjs", "node tools/mcp/apex-tools-mcp.mjs call apex_shot '{\"track\":\"monza\"}'",
    "node tools/mcp/apex-tools-mcp.mjs call apex_eval '{\"expr\":\"1\"}'", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome --headless",
    "chromium --headless about:blank", "APEX_X=1 npx playwright test", "bash -c 'npm test'",
  ];
  const nodeOnly = [
    "node tools/ci/test-bg.mjs --status", "node tools/ci/test-bg.mjs --tail smoke", "node tools/ci/test-bg.mjs --stop", "node tools/ci/verify-change.mjs --fast --json",
    "node tools/ci/verify-change.mjs --plan", "npm run test:guards", "npm run test:tooling-fast -- --changed",
    "node --test tests/unit/ratchets.test.mjs", "node tools/track/verify-track.cjs monza", "node tools/shot/frame-report.mjs --track monza",
    "node tools/mcp/debug-chrome.mjs status", "node tools/ci/pick-tests.mjs", "node tools/shot/agent.mjs monza info --vm", "node tools/shot/agent.mjs --help",
    "node tools/shot/shot.mjs --help", "node tools/ui/layout-audit.mjs --plan", "node tools/shot/shot-survey.mjs --list-locations --track monza",
    "node tools/mcp/apex-tools-mcp.mjs call apex_eval '{\"expr\":\"1\",\"vm\":true}'", "node tools/mcp/apex-tools-mcp.mjs call apex_status '{}'",
    "npx playwright --version", "npx playwright install chromium", "npx playwright test --list", "node tools/mcp/browser-http-up.mjs --stop",
    "cat > scratch/x.md <<'EOF'\nnpm test\nnpx playwright test\nEOF", "cat > scratch/n.md <<'EOF'\nnode tools/ci/test-bg.mjs smoke\nremote-group garage-angles career-economy\nEOF",
    "echo 'run test-bg and garage-angles'", "node tools/shot/garage-angles.mjs --help", "node tools/net/rtc-e2e.mjs --help", "grep -rn 'playwright test' tools/ci", "echo 'npm test'", "npm run gen",
  ];
  for (const cmd of browser) refused(cmd, /subagent never starts a browser run/, SUB);
  for (const cmd of nodeOnly) allowed(cmd, SUB);
  for (const cmd of browser.slice(0, 8)) allowed(cmd);                                   // the main session decides for itself
  // agent_type alone is the session's --agent, not a subagent: only agent_id marks one
  allowed("npm test", { agent_type: "worker" });
  allowed("npm test", { transcript_path: "/root/.claude/projects/p/s/subagents/agent-abc.jsonl" });
  // the payload is read as JSON: an agent_id inside the command text marks nothing
  allowed('echo \'"agent_id": "x"\' && npm test');
});

test("2b. a subagent's node/npm/shell command carries APEX_SUBAGENT=1 (updatedInput) so the shared launcher refuses", () => {
  const r = run("node tools/shot/agent.mjs monza info --vm", { ...SUB, tool_input: { command: "node tools/shot/agent.mjs monza info --vm", description: "d", timeout: 5000 } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, undefined, "no decision: the normal permission flow still decides");
  assert.deepEqual(out.updatedInput, { command: "export APEX_SUBAGENT=1\nnode tools/shot/agent.mjs monza info --vm", description: "d", timeout: 5000 });
  assert.equal(run("git status", SUB).stdout.trim(), "", "a command that runs no interpreter is left as written");
  const rtc = JSON.parse(run("node tools/net/rtc-e2e.mjs", SUB).stdout).hookSpecificOutput.updatedInput.command;
  assert.match(rtc, /^export APEX_SUBAGENT=1\n/, "a direct launcher script gets the marker; launchChromium refuses it");
  assert.equal(run("node -v").stdout.trim(), "", "the main session's command is left as written");
  const again = run("export APEX_SUBAGENT=1\nnode x.mjs", SUB);
  assert.equal(again.stdout.trim(), "", "never prefixed twice");
  // the launcher side: launchChromium refuses with the marker set, before it touches Playwright
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { launchChromium } from ${JSON.stringify(path.join(ROOT, "tools/lib/harness.mjs"))};
     try { await launchChromium(); console.log("launched"); } catch (e) { console.log(String(e.message)); }
     process.exit(0);`], { encoding: "utf8", env: { ...process.env, APEX_SUBAGENT: "1" }, timeout: 20000 });
  assert.match(probe.stdout, /subagent never starts a browser/, probe.stderr);
});

test("2c. a subagent cannot write the guard hatches or the guard files from Bash; reads pass", () => {
  for (const cmd of ["touch .claude/allow-protected", ": > .claude/allow-context-cap", "touch '.claude/allow-protected'", "echo x > .claude/settings.json",
    "cp /tmp/x .claude/hooks/bash-guard.sh", "sed -i s/a/b/ .githooks/pre-commit", "tee tools/hooks/readonly-bash.sh < x", "echo '{}' > .mcp.json"])
    refused(cmd, /cannot write/, SUB);
  for (const cmd of ["ls .claude/allow-protected", "cat .claude/settings.json", "test -e .claude/allow-protected && echo on", "git diff -- .claude/hooks"])
    allowed(cmd, SUB);
  allowed("touch .claude/allow-protected");                                                  // the main session keeps its hatch
});

test("3. the commit gate stays reachable: --no-verify / -n and hooks-path writes are refused; plain commits and reads pass", () => {
  for (const cmd of ["git commit --no-verify -m x", "git commit -n -m x", "git commit -anm x", "git -c user.name=x commit --no-verify -m x",
    "cd js && git commit -m x --no-verify", `git config ${HP} /tmp/none`, `git -c ${HP}=/x commit -m x`, "git commit --no-ver -m x",
    `GIT_CONFIG_KEY_0=${HP} GIT_CONFIG_VALUE_0=/x git commit -m y`, `git config --unset ${HP}`, " git commit -n -m x",
    "APEX_SKIP_GUARDS=1 git commit -n -m x", "command git commit --no-verify -m x", "time git commit --no-verify -m x", "command git commit -n -m x",
    "git -C . commit -nm x", `git config --local ${HP} .x`, `git config set ${HP} x`, "if true; then git commit -n -m x; fi", "bash -c 'git commit -n -m x'"])
    refused(cmd, /pre-commit|hooksPath|hooks path|commit gate/i);
  for (const cmd of ["git commit -m x", "git commit -am x", "git commit -m 'no -n here'", "git commit --amend --no-edit", "git commit -F msg.txt",
    "git -c user.name=x commit -m x", "git log -n 3", "git diff --name-only", "git commit -m x && git log -n 3", "git commit -m -n",
    `git config --get ${HP}`, `git config ${HP}`, `git config --get-all ${HP}`, `git commit -m "docs: explain ${HP} setup"`,
    "git commit -m \"$(cat <<'X'\nfix (a\n\ngh pr merge is banned; git commit -n too\nX\n)\"", "git commit --help", "git log --no-walk -n 1",
    "git commit -F - <<'EOF'\nfix\n\nnever use -n or --no-verify here\nEOF"])
    allowed(cmd);
});

test("4. gh run cancel, pr merge, pr ready and their REST / GraphQL forms are refused in any spelling; reads and prose pass", () => {
  for (const cmd of ["gh run cancel 123", "gh run cancel 123 --repo a/b", "gh -R a/b run cancel 1", "curl -X POST https://api.github.com/repos/a/b/actions/runs/1/cancel",
    "gh api -X POST repos/a/b/actions/runs/1/force-cancel", "gh api repos/a/b/actions/runs/1/cancel", "gh pr merge 1 --merge", "gh pr merge 1 --squash",
    "gh pr ready 1", "gh -R o/r pr merge 1", "gh --repo a/b pr merge 5 --merge", "gh --repo=a/b pr merge 5", "gh -R a/b pr ready 5", "gh --repo a/b pr ready",
    "gh api -X PUT repos/a/b/pulls/5/merge", "gh api --method PUT repos/a/b/pulls/5/merge", "gh api --method=PUT repos/a/b/pulls/5/merge",
    "gh api graphql -f query='mutation { mergePullRequest(input:{}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{}) { clientMutationId } }'",
    " gh pr merge 1", "command gh pr merge 1", "env GH_TOKEN=x gh pr merge 1", "{ gh pr ready 2; }", "if true; then gh run cancel 1; fi"])
    refused(cmd, /cancel|merges|ready/);
  for (const cmd of ["gh run view 123", "gh run list", "gh pr view 1", "gh pr checks 1", "gh api repos/a/b/pulls/1", "gh pr edit 1 --add-label land",
    "gh pr ready --help", "gh pr merge --help", "gh api repos/a/b/pulls/5/merge", "gh pr view 5 -R a/b", "echo 'see actions/runs/12/cancel'",
    'git commit -m "x\n\ngh run cancel mention"', "cat > notes.md <<'EOF'\ngh pr merge 5\nEOF", "gh pr ready 1 --undo"])
    allowed(cmd);
  assert.equal(run("gh run cancel 1", {}, { APEX_RUN_CANCEL_OK: "1" }).status, 2, "no env hatch for a cancel");
});

test("fail closed on a payload or a command it cannot read; an empty command passes; the header names the limits", () => {
  for (const input of ["not json", "[]", '{"tool_input":[]}', '{"tool_input":{"command":5}}']) {
    const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } });
    assert.equal(r.status, 2, input); assert.match(r.stderr, /fail closed/);
  }
  for (const cmd of ["echo 'unterminated", 'echo "x', "echo $(ls"]) refused(cmd, /could not tokenise/);
  assert.equal(spawnSync("bash", [HOOK], { input: '{"tool_name":"Bash","tool_input":{}}', encoding: "utf8" }).status, 0);
  const src = fs.readFileSync(HOOK, "utf8") + fs.readFileSync(path.join(ROOT, ".claude/hooks/bash-guard.py"), "utf8");
  assert.match(src, /not a security\s+boundary/, "the header says what the hook is");
  assert.match(src, /\.githooks\/pre-push/, "the header names the push backstop");
  for (const gone of ["merge_policy", "foreign_push", "APEX_SKIP_GUARDS", "GUARD_TRIGGER", "APEX_RUN_CANCEL_OK", "APEX_HOOKSPATH_SETTER", "grep -P"])
    assert.ok(!src.includes(gone), `bash-guard still names ${gone}`);
});

test("settings.json wires the guard on Bash with onFailure block, and the deny/ask rules back the hook", () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const bash = s.hooks.PreToolUse.filter((g) => g.matcher === "Bash");
  assert.equal(bash.length, 1);
  assert.deepEqual(bash[0].hooks.map((h) => [path.basename(h.command.replace(/"/g, "")), h.onFailure]), [["bash-guard.sh", "block"]]);
  for (const rule of ["Bash(git push *--no-verify*)", "Bash(git push --no-verify *)", "Bash(git commit *--no-verify*)", "Bash(git commit -n *)",
    "Bash(gh run cancel *)", "Bash(gh pr merge *)", "Bash(gh pr ready *)", "Bash(pkill -f *)", "Bash(killall *)", "Bash(git config * core.hooksPath*)",
    "mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge", "mcp__github__disable_pr_auto_merge", "mcp__github__update_pull_request_branch"])
    assert.ok(s.permissions.deny.includes(rule), `deny must hold ${rule}`);
  for (const rule of ["Bash(gh api * -X DELETE *)", "Bash(gh api * --method DELETE *)", "Bash(gh workflow run *)", "mcp__github__actions_run_trigger"])
    assert.ok(s.permissions.ask.includes(rule), `ask must hold ${rule}`);
  assert.ok(s.permissions.allow.includes("Bash"), "bare Bash stays allowed");
  assert.equal(s.permissions.allow.filter((p) => p.startsWith("Bash(")).length, 0, "no Bash(...) allow entries: bare Bash makes them dead");
  assert.equal(s.enabledPlugins, undefined, "the ten false enabledPlugins entries did nothing");
  for (const t of [...s.permissions.deny, ...s.permissions.ask]) assert.ok(!s.permissions.allow.includes(t), `${t} is both allowed and gated`);
});
