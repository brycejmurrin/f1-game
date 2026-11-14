// agent-scope-hooks — the per-agent scope hooks under tools/hooks/ (wired from the
// `hooks:` frontmatter of the agent cards, plan §4.6) and the two Write/Edit and
// MCP guards they sit beside: readonly-bash.sh, surveyor-scope.sh,
// scratch-md-only.sh, protect-files.py, mcp-browser-guard.sh, github-mcp-guard.sh.
// Every row RUNS the hook on a sample payload and pins the exit code; the
// frontmatter of each card is checked to wire the hook it claims.
//
// Run: node --test tests/unit/agent-scope-hooks.test.mjs   (< 5 s)
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS = path.join(ROOT, ".claude/agents");
const sh = (rel, payload, env = {}, args = []) => spawnSync("bash", [path.join(ROOT, rel), ...args], {
  input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env } });
const bashCmd = (command) => ({ tool_name: "Bash", tool_input: { command } });
const edit = (file) => ({ tool_name: "Edit", tool_input: { file_path: path.join(ROOT, file), old_string: "a", new_string: "b" } });
const frontmatter = (text) => /^---\n([\s\S]*?)\n---/.exec(text)?.[1] || "";

test("readonly-bash.sh is an allowlist of reads: write shapes, unknown programs and writes outside scratch/artifacts are refused", () => {
  const refuse = ["echo x > js/core/log.js", "echo x >> docs/PHYSICS.md", "cat a | tee b", "sed -i s/a/b/ js/core/log.js", "perl -pi -e s/a/b/ x", "mv a b", "cp a b",
    "rm -rf scratch/x", "git add .", "git commit -m x", "git push", "git checkout -- x", "git worktree add x", "git stash", "git reset --hard",
    "node -e \"require('fs').writeFileSync('a','b')\"", "python3 -c \"open('a','w').write('x')\"", "npm run gen", "node tools/gen/gen-shell.mjs", "npm install",
    "ls && echo x > y", "git -C . commit -m x",
    // spellings the old denylist let through
    "touch js/core/log.js", "mkdir js/newdir", "git branch feature", "git branch -D x", "dd if=/dev/zero of=js/x bs=1 count=1", "find . -name x -delete",
    "find . -exec rm {} ;", "curl -o js/core/log.js https://example.com", "curl -X POST https://api.github.com/x", "gh pr edit 1 --add-label land", "gh pr merge 1",
    "gh api -X PATCH repos/a/b/pulls/1", "gh api repos/a/b/issues/1/labels -f labels[]=x", "wget https://example.com/x", "git tag v1", "git config user.name x",
    "ln -s a b", "chmod +x a", "install a b", "sort -o js/x a", "bash -c 'echo x > js/a'", "awk 'BEGIN{system(\"rm x\")}'", "git diff --output=js/x",
    "node tools/check/ratchets.mjs --update", "unknowncmd x", "echo 'unterminated"];
  const allow = ["ls -la", "git log --oneline -5 -- js/", "git show HEAD:js/core/log.js", "grep -rn foo js/", "node --test tests/unit/ratchets.test.mjs", "cat a 2>&1",
    "ls >/dev/null 2>&1", "git log --format='%H -> %s'", "git diff HEAD~1", "wc -l js/core/log.js", "node tools/ci/verify-change.mjs --fast --json",
    "echo x 2>/dev/null", "git worktree list", "git blame js/core/log.js", "node tools/check/bloat-scan.mjs --json js/track/",
    "echo x > scratch/review/notes.md", "mkdir -p artifacts/report", "grep -n x js/core/log.js | tee artifacts/hits.txt", "git branch -a", "git branch --show-current",
    "gh pr view 5 --json title", "gh run list --limit 5", "gh api repos/a/b/pulls/1", "curl -sS https://example.com", "find . -name '*.js' | head",
    "export APEX_SUBAGENT=1\nnode tools/ci/pick-tests.mjs", "cd js && grep -rn Tracks .", "git fetch origin main", "git config --get remote.origin.url",
    "echo 'git commit -m x > y' | wc -c", "cat <<'EOF' | wc -l\nrm -rf /\nEOF", "jq . package.json", "for f in a b; do cat $f; done"];
  for (const c of refuse) { const r = sh("tools/hooks/readonly-bash.sh", bashCmd(c)); assert.equal(r.status, 2, `must refuse: ${c}\n${r.stderr}`); assert.match(r.stderr, /read-only reporter|fail closed/); }
  for (const c of allow) { const r = sh("tools/hooks/readonly-bash.sh", bashCmd(c)); assert.equal(r.status, 0, `must allow: ${c}\n${r.stderr}`); }
  assert.equal(sh("tools/hooks/readonly-bash.sh", "junk").status, 2, "fail closed");
  assert.equal(sh("tools/hooks/readonly-bash.sh", { tool_input: {} }).status, 0, "empty command");
  // ONE exception per agent: verify-agent's ephemeral worktree, by env or by argument, matched in full
  const EXC = String.raw`git worktree (add --detach|remove) scratch/verify-base-[\w.-]+( \S+)?`;
  assert.equal(sh("tools/hooks/readonly-bash.sh", bashCmd("git worktree add --detach scratch/verify-base-abc1234-7 origin/x"), { READONLY_BASH_ALLOW: EXC }).status, 0);
  assert.equal(sh("tools/hooks/readonly-bash.sh", bashCmd("git worktree remove scratch/verify-base-abc1234-7"), {}, [EXC]).status, 0);
  assert.equal(sh("tools/hooks/readonly-bash.sh", bashCmd("git worktree add --detach scratch/other x"), {}, [EXC]).status, 2, "outside the exception");
  assert.equal(sh("tools/hooks/readonly-bash.sh", bashCmd("git worktree remove scratch/verify-base-x; git push"), {}, [EXC]).status, 2, "the exception matches the whole command");
});

test("surveyor-scope.sh: the circuit pair, scratch/ and artifacts/ only; scratch-md-only.sh: scratch/**.md only", () => {
  for (const f of ["js/circuits/monza.js", "js/circuits/scenery/monza.js", "scratch/x/notes.md", "artifacts/x.json"])
    assert.equal(sh("tools/hooks/surveyor-scope.sh", edit(f)).status, 0, `surveyor may write ${f}`);
  for (const f of ["js/track/tracks.js", "js/core/log.js", "tests/data/ratchets.json", "index.html", "docs/tracks/monza.md", "version.json"]) {
    const r = sh("tools/hooks/surveyor-scope.sh", edit(f)); assert.equal(r.status, 2, `surveyor must not write ${f}`); assert.match(r.stderr, /track-surveyor writes only/);
  }
  assert.equal(sh("tools/hooks/surveyor-scope.sh", { tool_name: "Write", tool_input: { file_path: "/tmp/outside.js", content: "" } }).status, 2, "outside any repo");
  assert.equal(sh("tools/hooks/surveyor-scope.sh", "junk").status, 2, "fail closed");
  assert.equal(sh("tools/hooks/scratch-md-only.sh", edit("scratch/review/x.md")).status, 0);
  for (const f of ["scratch/x.json", "js/core/log.js", "docs/PHYSICS.md", "artifacts/a.md", ".claude/agents/README.md"]) {
    const r = sh("tools/hooks/scratch-md-only.sh", edit(f)); assert.equal(r.status, 2, `reviewer must not write ${f}`); assert.match(r.stderr, /surface-reviewer writes only its report/);
  }
  assert.equal(sh("tools/hooks/scratch-md-only.sh", "junk").status, 2, "fail closed");
});

test("every reporter card wires readonly-bash.sh on Bash; the two writers wire their scope hook on Write|Edit", () => {
  const readers = ["Explore", "deploy-research", "verify-agent", "prior-art-scout", "finding-verifier", "physics-contract-auditor", "ci-red-triage", "code-hunter", "surface-reviewer"];
  for (const id of readers) {
    const fm = frontmatter(fs.readFileSync(path.join(AGENTS, `${id}.md`), "utf8"));
    assert.match(fm, /^hooks:\n  PreToolUse:\n    - matcher: "Bash"\n      hooks:\n        - type: command\n          command: "[^"\n]*tools\/hooks\/readonly-bash\.sh/m, `${id}: hooks: PreToolUse Bash → readonly-bash.sh`);
    assert.doesNotMatch(fm, /^(readonly|is_background|memory):/m, `${id}: no undocumented or retired keys`);
    if (id !== "surface-reviewer") assert.doesNotMatch(fm, /^tools:.*\b(Write|Edit|NotebookEdit)\b/m, `${id}: no write tool`);
    else assert.match(fm, /^tools:.*\bWrite\b/m, "surface-reviewer has Write for its report (scratch-md-only.sh scopes it)");
    if (id !== "verify-agent") assert.doesNotMatch(fm, /READONLY_BASH_ALLOW/, `${id}: no exception`);
  }
  const verify = frontmatter(fs.readFileSync(path.join(AGENTS, "verify-agent.md"), "utf8"));
  assert.match(verify, /READONLY_BASH_ALLOW=.*verify-base/, "verify-agent's one exception is its ephemeral worktree");
  const surveyor = frontmatter(fs.readFileSync(path.join(AGENTS, "track-surveyor.md"), "utf8"));
  assert.match(surveyor, /matcher: "Write\|Edit\|MultiEdit\|NotebookEdit"\n      hooks:\n        - type: command\n          command: "[^"\n]*tools\/hooks\/surveyor-scope\.sh/, "track-surveyor wires surveyor-scope.sh");
  const reviewer = frontmatter(fs.readFileSync(path.join(AGENTS, "surface-reviewer.md"), "utf8"));
  assert.match(reviewer, /matcher: "Write\|Edit\|MultiEdit\|NotebookEdit"\n      hooks:\n        - type: command\n          command: "[^"\n]*tools\/hooks\/scratch-md-only\.sh/, "surface-reviewer wires scratch-md-only.sh");
  // the hook paths resolve and are executable
  for (const rel of ["tools/hooks/readonly-bash.sh", "tools/hooks/surveyor-scope.sh", "tools/hooks/scratch-md-only.sh"])
    assert.ok(fs.statSync(path.join(ROOT, rel)).mode & 0o111, `${rel} executable`);
  // the retired protect-files agent scopes are gone
  const pf = fs.readFileSync(path.join(ROOT, ".claude/hooks/protect-files.py"), "utf8");
  for (const gone of ["READONLY_AGENTS", "SURVEYOR_OK", "REPORTER_OK", "live_playwright_in", "shellparse", "ratchet_raise"]) assert.ok(!pf.includes(gone), `protect-files.py still has ${gone}`);
});

test("protect-files.py: generated files (derived list), generated blocks, package.json test scripts, the worktree contract, guards and the hatch", () => {
  const pf = (payload) => spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")], { input: JSON.stringify(payload), encoding: "utf8" });
  for (const f of ["version.json", "js/roster.js", "tools/README.md", "CHANGELOG.md", "docs/agent-index.json", "tests/data/impact-map.json",
    "tests/data/ratchets.json", "tools/shot/scenery-locations.json", "js/track/circuit-meta.js", "cockpit-view.html", ".cursor/rules/claude-config.mdc",
    "locales/en.json", "locales/manifest.json", "docs/AGENT-HOOKS.md", "docs/agent-output/catalog.json"]) {
    const r = pf(edit(f)); assert.equal(r.status, 2, `${f} is generated\n${r.stderr}`);
    const said = `BLOCKED: ${f} is GENERATED — `; assert.equal(r.stderr.slice(0, said.length), said, "the refusal names the file");
  }
  assert.equal(pf({ tool_name: "Write", tool_input: { file_path: path.join(ROOT, "tests/data/ratchets.d", "cursor--x.json"), content: "{}" } }).status, 2, "a ratchet fragment is tool-written");
  assert.equal(pf({ tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(ROOT, "version.json"), new_source: "x" } }).status, 2, "NotebookEdit-shaped input");
  for (const f of ["docs/PHYSICS.md", "js/core/log.js", "tests/groups.json", "css/a11y-loading.css", ".cursor/rules/apex-shared.mdc"]) assert.equal(pf(edit(f)).status, 0, `${f} is authored`);
  // a generated doc block: prose outside it is authored, the block is not
  const doc = path.join(ROOT, "docs/DEBUG-HOOKS.md");
  const text = fs.readFileSync(doc, "utf8");
  const inBlock = text.slice(text.indexOf("<!-- GENERATED: hooks-table -->"), text.indexOf("<!-- /GENERATED -->")).split("\n")[3];
  assert.ok(inBlock && text.indexOf(inBlock) === text.lastIndexOf(inBlock), "fixture: a unique line inside the generated block");
  assert.equal(pf({ tool_name: "Edit", tool_input: { file_path: doc, old_string: inBlock, new_string: inBlock + " x" } }).status, 2, "a generated doc block");
  const prose = text.split("\n").find((l) => l.length > 40 && text.indexOf(l) < text.indexOf("<!-- GENERATED") && text.indexOf(l) === text.lastIndexOf(l));
  assert.equal(pf({ tool_name: "Edit", tool_input: { file_path: doc, old_string: prose, new_string: prose + " x" } }).status, 0, "prose outside the block");
  // index.html: a hand edit outside the @gen-shell blocks passes in the MAIN checkout, a block edit never does
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tag = html.match(/<script [^>]*src=["']?js\/[^"'>\s]+[^>]*><\/script>/)?.[0];
  assert.ok(tag, "fixture: a script tag inside the gen-shell block");
  const blockEdit = pf({ tool_name: "Edit", tool_input: { file_path: path.join(ROOT, "index.html"), old_string: tag, new_string: "" } });
  assert.equal(blockEdit.status, 2);
  assert.equal(blockEdit.stderr, "BLOCKED: index.html: the edit touches a generated block (between @gen-… / GENERATED markers). gen-shell.mjs and the doc generators write those from their sources; edit the SOURCE and run `npm run gen`. "
    + `If this edit was explicitly assigned, the MAIN session runs: touch ${path.join(ROOT, ".claude/allow-protected")} , retries, and removes it after.\n`);
  const pkg = path.join(ROOT, "package.json");
  const mangled = JSON.parse(fs.readFileSync(pkg, "utf8")); mangled.scripts["test:guards"] = "echo nope";
  const w = pf({ tool_name: "Write", tool_input: { file_path: pkg, content: JSON.stringify(mangled, null, 2) } });
  assert.equal(w.status, 2); assert.match(w.stderr, /test:\* scripts are GENERATED|shared-contract/);
  // a linked worktree never edits a shared-contract file (matched by repo-relative path); the main checkout may
  const linked = fs.statSync(path.join(ROOT, ".git")).isFile();
  const shared = pf(edit("tools/manifest.cjs"));
  if (linked) { assert.equal(shared.status, 2); assert.match(shared.stderr, /shared-contract file/); } else assert.equal(shared.status, 0);
  if (fs.existsSync(path.join(ROOT, "desktop/package.json"))) assert.equal(pf(edit("desktop/package.json")).status, 0, "a basename twin is not the shared file");
  // a subagent never writes a guard or a hatch; the main session may
  for (const f of [".claude/allow-protected", ".claude/allow-context-cap", ".claude/hooks/bash-guard.py", ".claude/settings.json", ".githooks/pre-commit",
    "tools/hooks/readonly-bash.sh", ".mcp.json", ".cursor/hooks.json", ".codex/hooks/shell-guard.sh"]) {
    const r = pf({ tool_name: "Write", tool_input: { file_path: path.join(ROOT, f), content: "" }, agent_id: "a1" });
    assert.equal(r.status, 2, `subagent must not write ${f}`);
    assert.equal(r.stderr, `BLOCKED: ${f} is a guard (a .claude/allow-* hatch, a hook, settings, .githooks, tools/hooks, .mcp.json or a host's hook config): a subagent never writes one (AGENTS.md rule 10). Report the change for the parent.\n`);
  }
  assert.equal(pf({ tool_name: "Write", tool_input: { file_path: path.join(ROOT, ".claude/allow-protected"), content: "" } }).status, 0, "the main session creates its hatch");
  assert.equal(pf({ tool_name: "Bash", tool_input: { command: "echo x > version.json" } }).status, 0, "Bash is bash-guard's business");
  const junk = spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")], { input: "junk", encoding: "utf8" });
  assert.equal(junk.status, 2, "fail closed");
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const groups = settings.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.command.includes("protect-files.sh")));
  assert.equal(groups.length, 1, "protect-files runs on the edit tools only");
  for (const t of ["Write", "Edit", "NotebookEdit"]) assert.ok(new RegExp(`^(${groups[0].matcher})$`).test(t), `matcher selects ${t}`);
});

test("protect-files.py: the hatch lifts the rules for the MAIN session only, and says so on every guarded call; an unloadable list refuses", () => {
  // A throwaway copy of the inputs the hook reads, so the hatch never exists in the real checkout.
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "pf-hatch-"));
  try {
    spawnSync("git", ["init", "-q", dir]);
    for (const rel of ["tools/lib/generated-paths.mjs", "tools/gen/targets.mjs", "tools/gen/gen-shell.mjs", "tools/gen/gen-cursor-rules.mjs"]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
    }
    const gens = fs.readFileSync(path.join(ROOT, "tools/gen/targets.mjs"), "utf8").match(/GENERATORS = \[([\s\S]*?)\]/)[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
    for (const g of gens) { const rel = path.join("tools/gen", g); fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel)); }
    fs.writeFileSync(path.join(dir, "version.json"), "{}\n");
    const pf = (extra = {}) => spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")],
      { input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "version.json"), old_string: "{}", new_string: "[]" }, ...extra }), encoding: "utf8" });
    assert.equal(pf().status, 2, "no hatch: refused");
    fs.mkdirSync(path.join(dir, ".claude")); fs.writeFileSync(path.join(dir, ".claude/allow-protected"), "");
    const lifted = pf();
    assert.equal(lifted.status, 0, lifted.stderr);
    const tail = " Remove the file (rm .claude/allow-protected) as soon as the assigned edit is done.";
    assert.equal(JSON.parse(lifted.stdout).hookSpecificOutput.additionalContext,
      `protect-files: .claude/allow-protected is ACTIVE in ${dir} — it lifted: version.json is GENERATED.${tail}`);
    const other = spawnSync("python3", [path.join(ROOT, ".claude/hooks/protect-files.py")],
      { input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: path.join(dir, "notes.md"), content: "x" } }), encoding: "utf8" });
    assert.equal(JSON.parse(other.stdout).hookSpecificOutput.additionalContext,
      `protect-files: .claude/allow-protected is ACTIVE in ${dir} — no rule applied to notes.md.${tail}`, "every guarded call announces the hatch");
    assert.equal(pf({ agent_id: "a1" }).status, 2, "the hatch never lifts a rule for a subagent");
    fs.writeFileSync(path.join(dir, "tools/lib/generated-paths.mjs"), "export const NOTHING = 1;\n");
    const broken = pf({ agent_id: "a1" });
    assert.equal(broken.status, 2);
    assert.equal(broken.stderr, "BLOCKED: protect-files could not load the generated-file list (ValueError: tools/lib/generated-paths.mjs: GENERATED_PATHS / BUILT_PATHS not found), so it cannot tell whether version.json is generated and refuses the edit (fail closed). Report the hook error.\n");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("mcp-browser-guard.sh: a subagent never drives a browser; the main session may; a live Playwright run in this checkout blocks it", async () => {
  const mb = (payload) => sh(".claude/hooks/mcp-browser-guard.sh", payload);
  for (const p of [{ tool_name: "mcp__playwright-official__browser_navigate", agent_id: "a1" }, { tool_name: "mcp__chrome-devtools__new_page", agent_id: "a1" },
    { tool_name: "mcp__apex-tools__apex_eval", agent_id: "a1", tool_input: { expr: "1" } }, { tool_name: "mcp__js-debugger__debugger_attach", agent_id: "a1" },
    { tool_name: "mcp__apex-tools__apex_job_start", agent_id: "a1", tool_input: { kind: "shot_survey" } }, { tool_name: "mcp__apex-tools__apex_job_start", agent_id: "a1", tool_input: { kind: "no_such_kind" } },
    { tool_name: "mcp__apex-tools__apex_shot", agent_id: "a1", tool_input: "not json" },
    { tool_name: "mcp__apex-tools__apex_debug_chrome", agent_id: "a1", tool_input: { action: "start" } }, { tool_name: "mcp__plugin_browser-use_browser-use__x", agent_id: "a1" },
    { tool_name: "mcp__browserstack__runBrowserLiveSession", agent_id: "a1" }])
    assert.equal(mb(p).status, 2, JSON.stringify(p));
  for (const p of [{ tool_name: "mcp__playwright-official__browser_navigate" }, { tool_name: "mcp__js-debugger__debugger_state" },
    { tool_name: "mcp__apex-tools__apex_track_audit", agent_id: "a1" }, { tool_name: "mcp__apex-tools__apex_debug_chrome", agent_id: "a1", tool_input: { action: "status" } },
    { tool_name: "mcp__github__get_me", agent_id: "a1" }, { tool_name: "mcp__apex-tools__apex_eval", agent_id: "a1", tool_input: { expr: "1", vm: true } },
    { tool_name: "mcp__js-debugger__debugger_node_test", agent_id: "a1" }, { tool_name: "mcp__js-debugger__output_read", agent_id: "a1" },
    { tool_name: "mcp__apex-tools__apex_job_start", agent_id: "a1", tool_input: { kind: "verify_all" } },
    { tool_name: "mcp__apex-tools__apex_job_start", agent_id: "a1", tool_input: { kind: "verify_change_fast" } },
    { tool_name: "mcp__apex-tools__apex_eval", agent_type: "reviewer", tool_input: { expr: "1" } },
    { tool_name: "mcp__chrome-devtools__new_page", transcript_path: "/p/subagents/agent-x.jsonl" }])
    assert.equal(mb(p).status, 0, JSON.stringify(p));
  assert.equal(mb("junk").status, 2, "fail closed");
  // the settings matcher selects the browser tools and leaves the tree tools alone
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = settings.hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("mcp-browser-guard.sh")));
  const re = new RegExp(g.matcher);
  for (const n of ["mcp__playwright-official__browser_navigate", "mcp__chrome-devtools__new_page", "mcp__js-debugger__debugger_attach", "mcp__apex-tools__apex_shot",
    "mcp__apex-tools__apex_job_start", "mcp__apex-tools__apex_debug_chrome", "mcp__plugin_browser-use_browser-use__x", "mcp__browserstack__runBrowserLiveSession"])
    assert.ok(re.test(n), `matcher must select ${n}`);
  for (const n of ["mcp__apex-tools__apex_track_audit", "mcp__apex-tools__apex_status", "mcp__github__get_me", "Bash"]) assert.ok(!re.test(n), `matcher must leave ${n} alone`);
  // the live-run check (the one safety rule that had no mechanism): a `playwright test` whose cwd is under THIS checkout
  // (a shell whose -c text merely mentions the runner is skipped by design — the self-match trap — so the fixture is `node …/playwright test`)
  const { spawn } = await import("node:child_process");
  const bin = fs.mkdtempSync(path.join(ROOT, "artifacts", "mbg-"));
  fs.writeFileSync(path.join(bin, "playwright"), "setTimeout(() => {}, 30000);\n");
  const fake = spawn(process.execPath, [path.join(bin, "playwright"), "test"], { cwd: ROOT, stdio: "ignore", detached: true });
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 2000 && !fs.existsSync(`/proc/${fake.pid}/cmdline`)) { /* spin until /proc shows it */ }
    const r = mb({ tool_name: "mcp__playwright-official__browser_navigate" });
    assert.equal(r.status, 2, "main session: a second browser over a live run is refused");
    assert.match(r.stderr, /Playwright run .* is live/);
    assert.equal(mb({ tool_name: "mcp__github__get_me" }).status, 0, "tree tools stay open during a run");
  } finally { try { process.kill(-fake.pid, "SIGKILL"); } catch { /* gone */ } fs.rmSync(bin, { recursive: true, force: true }); }
});

test("github-mcp-guard.sh: the table — deny merges/arms/writes/cancels/reruns/train dispatch, ask a close, labels change by ONE name, allow the rest", () => {
  const gh = (tool_name, tool_input, env = {}) => {
    const r = sh(".claude/hooks/github-mcp-guard.sh", { tool_name, tool_input }, env);
    if (r.status === 2) return "exit2";
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "allow";
  };
  for (const [t, i] of [["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge" }], ["mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "squash" }],
    ["mcp__github__enable_pr_auto_merge", { pullNumber: 1 }], ["mcp__github__disable_pr_auto_merge", { pullNumber: 1 }], ["mcp__github__update_pull_request_branch", { pullNumber: 1 }],
    ["mcp__github__push_files", {}], ["mcp__github__create_or_update_file", {}], ["mcp__github__delete_file", {}], ["mcp__github__create_branch", {}],
    ["mcp__github__actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }], ["mcp__github__actions_run_trigger", { method: "force_cancel_workflow_run", run_id: 1 }],
    ["mcp__github__actions_run_trigger", { method: "rerun_failed_jobs", run_id: 1 }], ["mcp__github__actions_run_trigger", { method: "rerun_workflow_run", run_id: 1 }],
    ["mcp__github__actions_run_trigger", { method: "run_workflow", workflow_id: "pages.yml", ref: "x" }], ["mcp__github__actions_run_trigger", { method: "run_workflow", workflow_id: "ci.yml", ref: "x" }],
    ["mcp__github__actions_run_trigger", { method: "run_workflow", workflow_id: "123", ref: "x" }]])
    assert.equal(gh(t, i), "deny", `${t} ${JSON.stringify(i)}`);
  assert.equal(gh("mcp__github__actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }, { APEX_RUN_CANCEL_OK: "1" }), "deny", "no env hatch for a cancel");
  assert.equal(gh("mcp__github__update_pull_request", { pullNumber: 1, state: "closed" }), "ask");
  assert.equal(gh("mcp__github__update_pull_request", { pullNumber: 1, draft: false }), "allow", "the ready flip is the Plan gate's and CI's");
  assert.equal(gh("mcp__github__update_pull_request", { pullNumber: 1, body: "x" }), "allow");
  assert.equal(gh("mcp__github__actions_run_trigger", { method: "run_workflow", workflow_id: "browser-group.yml", ref: "x" }), "allow", "other workflows pass the hook (settings.json asks)");
  // The `labels` field REPLACES the list, so the guard makes it a one-label operation: the list must differ from the
  // live labels (a fake gh prints them) by exactly ONE name. Owner decision 2026-11-13, option 1A on PR #5524.
  const fakeGh = fs.mkdtempSync(path.join(ROOT, "artifacts", "fake-gh-"));
  fs.writeFileSync(path.join(fakeGh, "gh"), "#!/bin/sh\ncase \"$*\" in *events*) echo \"$FAKE_HOLD_BY\";; *) printf \"$FAKE_LABELS\";; esac\n"); fs.chmodSync(path.join(fakeGh, "gh"), 0o755);
  try {
    const lab = (labels, liveLabels, holdBy = "owner") => gh("mcp__github__issue_write", { method: "update", issue_number: 1, labels },
      { PATH: `${fakeGh}:${process.env.PATH}`, FAKE_LABELS: liveLabels.join("\\n"), FAKE_HOLD_BY: holdBy });
    const LIVE = ["config-ok", "hold", "land", "needs-decision", "lane:claude"];
    const table = [
      ["the live list itself (a no-op)", LIVE, LIVE, "allow"],
      ["one name added", [...LIVE, "priority"], LIVE, "allow"],
      ["one name added, other case and order", ["Priority", ...LIVE.slice().reverse()], LIVE, "allow"],
      ["needs-decision removed alone", LIVE.filter((x) => x !== "needs-decision"), LIVE, "allow"],
      ["land removed alone (a re-gate by hand)", LIVE.filter((x) => x !== "land"), LIVE, "allow"],
      ["the first label on a bare issue", ["claimed"], [], "allow"],
      ["the last label removed", [], ["needs-owner"], "allow"],
      ["a partial list (the 2026-11-11 loss of lane:claude)", ["needs-owner"], ["lane:claude"], "deny"],
      ["one added and one removed", ["lane:claude", "needs-owner"], ["lane:claude", "claimed"], "deny"],
      ["two added", [...LIVE, "priority", "blocked"], LIVE, "deny"],
      ["a stale list after an Action labelled", ["lane:claude", "land"], ["lane:claude", "deploy:red"], "deny"],
      ["config-ok added", ["lane:claude", "config-ok"], ["lane:claude"], "deny"],
      ["config-ok removed", LIVE.filter((x) => x !== "config-ok"), LIVE, "deny"],
      ["Bryce's hold removed", LIVE.filter((x) => x !== "hold"), LIVE, "deny"],
      ["a hold added", ["lane:claude", "hold"], ["lane:claude"], "allow"],
    ];
    assert.deepEqual(table.map(([why, labels, live]) => [why, lab(labels, live)]), table.map(([why, , , want]) => [why, want]));
    assert.equal(lab(LIVE.filter((x) => x !== "hold"), LIVE, "claude"), "allow", "an agent's own hold: any removal");
    assert.equal(lab(LIVE.filter((x) => x !== "hold"), LIVE, ""), "deny", "who set the hold is unreadable");
  } finally { fs.rmSync(fakeGh, { recursive: true, force: true }); }
  assert.equal(gh("mcp__github__issue_write", { method: "create", title: "x", labels: ["ready"] }), "allow", "a create has no hold to drop");
  assert.equal(gh("mcp__github__issue_write", { method: "update", issue_number: 1, title: "x" }), "allow", "no labels field");
  // labels the hook cannot read (gh fails) → ask; a fake gh at the front of PATH stands in for a logged-out host
  const noGh = fs.mkdtempSync(path.join(ROOT, "artifacts", "no-gh-"));
  fs.writeFileSync(path.join(noGh, "gh"), "#!/bin/sh\nexit 1\n"); fs.chmodSync(path.join(noGh, "gh"), 0o755);
  try { assert.equal(gh("mcp__github__issue_write", { method: "update", issue_number: 1, labels: ["ready"] }, { PATH: `${noGh}:${process.env.PATH}` }), "ask", "labels unknown (no gh) → ask"); }
  finally { fs.rmSync(noGh, { recursive: true, force: true }); }
  assert.equal(gh("mcp__github__pull_request_read", {}), "allow");
  assert.equal(gh("merge_pull_request", JSON.stringify({ pullNumber: 1 })), "deny", "Cursor's bare name and string input");
  assert.equal(gh("mcp__github__merge_pull_request", "not json"), "deny", "a guarded call with unreadable input");
  assert.equal(gh("mcp__github__update_pull_request", "not json"), "deny", "an unparsable input on a guarded tool is a deny, never {}");
  assert.equal(gh("mcp__github__issue_write", "{bad"), "deny");
  assert.equal(gh("MCP:merge_pull_request", JSON.stringify({ pullNumber: 1 })), "deny", "Cursor's preToolUse spelling");
  assert.equal(sh(".claude/hooks/github-mcp-guard.sh", "junk").status, 2, "fail closed");
  const src = fs.readFileSync(path.join(ROOT, ".claude/hooks/github-mcp-guard.sh"), "utf8");
  for (const gone of ["merge_policy", "receipt", "ready-gate", "APEX_RUN_CANCEL_OK", "APEX_MERGE_DESK"]) assert.ok(!src.includes(gone), `github-mcp-guard.sh still names ${gone}`);
  assert.ok(src.split("\n").length <= 110, `github-mcp-guard.sh is ${src.split("\n").length} lines (a table plus its header, cap 110)`);
});
