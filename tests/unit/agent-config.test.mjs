// agent-config.test.mjs — the host-facing agent configuration, asserted.
//
// Three hosts read this repo (Claude Code, Cursor, Codex) and each has its own
// file for the same fact: MCP servers live in .mcp.json, .cursor/mcp.json and
// .codex/config.toml; renderer rules live in .claude/rules/*.md and
// .cursor/rules/*.mdc. Prose kept them aligned for a while and then did not
// (a stale wgx-capture path and a "tinyfish for deploy" line survived in the
// Cursor copies for a month). What a test asserts stays true.
//
// Also holds the two numbers the official guidance gives for always-loaded
// instructions: AGENTS.md under 200 lines (imports do not reduce context),
// and emphasis reserved for one line.
//
// Run: node --test tests/unit/agent-config.test.mjs   (npm run test:tooling-fast)
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Every size/word budget lives in one data file (raise a number there, with the reason).
const BUDGET = JSON.parse(read("tests/data/agent-config-budgets.json"));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const stripFrontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  return { fm: m ? m[1] : "", body: m ? text.slice(m[0].length) : text };
};

// Parse only the first YAML document: a body line must never satisfy the schema.
const memoryType = (text) => {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
  const data = parseYAML(fm);
  return data?.type ?? data?.metadata?.type;
};
const MEMORY_TYPES = new Set(["user", "feedback", "project", "reference"]);

// Local Markdown targets are relative to their topic. Wiki targets name another
// topic in this store. This checks paths, not the continued truth of the prose.
function memoryLinkIssues(files, targetExists) {
  const issues = [];
  const linked = new Set();
  for (const [file, text] of files) {
    const body = stripFrontmatter(text).body
      .replace(/```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~/g, "")
      .replace(/`[^`\n]*`/g, "");
    const definitions = new Map([...body.matchAll(/^ {0,3}\[([^\]\n]+)\]:\s*(<[^>]+>|[^\s]+)(?:[^\n]*)$/gm)]
      .map((m) => [m[1].toLowerCase(), m[2].replace(/^<|>$/g, "")]));
    const targets = [
      ...[...body.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g)]
        .map((m) => ({ raw: m[1].replace(/^<|>$/g, ""), wiki: false })),
      ...[...body.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)]
        .map((m) => ({ raw: definitions.get((m[2] || m[1]).toLowerCase()), wiki: false })),
      ...[...body.matchAll(/\[\[([^\]\n]+)\]\]/g)]
        .map((m) => ({ raw: m[1].split("|")[0], wiki: true })),
    ];
    for (const { raw, wiki } of targets) {
      if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
      let rel;
      try { rel = decodeURIComponent(raw.split(/[?#]/)[0]); }
      catch { issues.push(`${file}: invalid link ${raw}`); continue; }
      if (!rel) continue;
      if (wiki && !path.extname(rel)) rel += ".md";
      const target = path.resolve(".claude/memory", rel);
      if (file === "MEMORY.md" && path.dirname(target) === path.resolve(".claude/memory"))
        linked.add(path.basename(target));
      if (!targetExists(rel)) issues.push(`${file}: missing link ${raw}`);
    }
  }
  for (const file of files.keys())
    if (file !== "MEMORY.md" && !linked.has(file)) issues.push(`${file}: orphan topic missing from MEMORY.md`);
  return issues;
}

test("memory type schema only accepts top-level or metadata type in the first frontmatter", () => {
  for (const type of MEMORY_TYPES) {
    assert.equal(memoryType(`---\ntype: ${type}\n---\nbody\n`), type);
    assert.equal(memoryType(`---\r\ntype: ${type}\r\n---`), type);
    assert.equal(memoryType(`---\nmetadata:\n  type: ${type}\n---\nbody\n`), type);
  }
  for (const text of [
    "---\nmetadata:\n  type: invented\n---\n\ntype: feedback\n---\nbody\n",
    "---\nname: missing\n---\n\ntype: user\n---\n",
    "---\nother:\n  type: feedback\n---\nbody\n",
    "---\ntype: invented\nmetadata:\n  type: user\n---\n",
    "body\n---\ntype: feedback\n---\n",
  ]) assert.ok(!MEMORY_TYPES.has(memoryType(text)), `accepted invalid topic: ${text}`);
  assert.throws(() => memoryType("---\ntype: [broken\n---\nbody\n"));
});

test("memory link guard catches missing Markdown/wiki targets and orphan topics", () => {
  const files = new Map([
    ["MEMORY.md", "- [A](a.md)\n- [B](b.md)\n"],
    ["a.md", "---\ntype: user\n---\n[B](b.md#section) [[b|B]] [docs](../../docs/topic.md) [web](https://example.com) [anchor](#local) `[[ignored]]`\n```md\n[[example]]\n```\n"],
    ["b.md", "---\ntype: feedback\n---\nbody\n"],
  ]);
  const exists = (rel) => ["a.md", "b.md", "../../docs/topic.md"].includes(rel);
  assert.deepEqual(memoryLinkIssues(files, exists), []);
  files.set("a.md", "[gone](missing.md#part) [[missing-wiki]] [reference][gone]\n[gone]: absent.md\n");
  files.set("orphan.md", "body");
  assert.deepEqual(memoryLinkIssues(files, exists), [
    "a.md: missing link missing.md#part", "a.md: missing link absent.md", "a.md: missing link missing-wiki", "orphan.md: orphan topic missing from MEMORY.md",
  ]);
  files.set("MEMORY.md", "- [A](a.md)\n- [Missing](gone.md)\n");
  assert.ok(memoryLinkIssues(files, exists).includes("MEMORY.md: missing link gone.md"));
});

// The three portable compound-* opt-in stubs were deleted 2026-10-26 (nothing routed to them;
// docs/notes/BASE-CONTEXT-AUDIT-2026-10-19.md had flagged their always-on description cost).

test("AGENTS.md emphasises at most one line and CLAUDE.md imports it", () => {
  // The size caps are BYTES and rule-bearing lines (below); a line count is gameable.
  const text = read("AGENTS.md");
  const important = (text.match(/\bIMPORTANT\b/g) || []).length;
  assert.ok(important <= 1, `AGENTS.md shouts IMPORTANT ${important} times; one line, or none`);
  // A bolded run is emphasis; the asset-pack "Ships ON." claim is test-owned
  // (docs-integrity) and allowed. Anything beyond that is noise.
  const bold = (text.match(/\*\*[^*\n]+\*\*/g) || []).filter((b) => !/^\*\*Ships ON\.\*\*$/.test(b));
  assert.ok(bold.length <= 3, `AGENTS.md has ${bold.length} bold spans — "if you emphasize many lines, none stands out"`);
  assert.ok(exists("CLAUDE.md") && /^@AGENTS\.md$/m.test(read("CLAUDE.md")));
});

test("the three MCP catalogs name the same servers with the same launch lines", () => {
  const claude = JSON.parse(read(".mcp.json")).mcpServers;
  const cursor = JSON.parse(read(".cursor/mcp.json")).mcpServers;
  assert.deepEqual(cursor, claude, ".cursor/mcp.json must lockstep .mcp.json");
  // Codex: [mcp_servers.<name>] tables with command/args. A minimal TOML read
  // — the file is ours and stays flat.
  const toml = read(".codex/config.toml");
  const codex = {};
  let cur = null;
  for (const raw of toml.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const h = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/);
    if (h) { cur = codex[h[1]] = {}; continue; }
    const kv = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
    if (kv && cur) {
      const v = kv[2].trim();
      cur[kv[1]] = v.startsWith("[") ? JSON.parse(v) : v.startsWith('"') ? JSON.parse(v) : Number(v);
    }
  }
  assert.deepEqual(Object.keys(codex).sort(), Object.keys(claude).sort(), ".codex/config.toml names a different server set");
  for (const [name, s] of Object.entries(claude)) {
    assert.equal(codex[name].command, s.command, `${name}: command differs in .codex/config.toml`);
    assert.deepEqual(codex[name].args, s.args, `${name}: args differ in .codex/config.toml`);
  }
  // apex_verify_change_fast runs the whole fast gate; Codex's default per-tool
  // timeout is 60 s, which would abort it.
  assert.ok(Number(codex["apex-tools"].tool_timeout_sec) >= 600, "apex-tools needs tool_timeout_sec >= 600 under Codex");
  assert.doesNotMatch(toml, /(api[_-]?key|token|secret)\s*=\s*"[^"$]/i, "no credential literals in .codex/config.toml");
  assert.doesNotMatch(read(".mcp.json"), /"(env|headers)"\s*:\s*\{[^}]*"[^"$]{16,}"/, "no credential literals in .mcp.json");
});

test("tinyfish stays CLI-only: the lockstep guard owns its deliberate non-attachment", () => {
  // TinyFish was REMOVED from the catalog in 2026-09 on purpose, and prose
  // alone does not hold a removal (this file's header: a stale "tinyfish for
  // deploy" line is one of the drifts that created the guard). The wrapper
  // (tools/mcp/tinyfish-mcp.sh) is a CLI managing a tmux-held HTTP proxy on
  // 127.0.0.1:3711 — it has no stdio run/serve mode for output-level-mcp.sh
  // to spawn — and container egress blocks agent.tinyfish.ai, so the proxy
  // can never answer from an agent session (docs/AGENT-SURFACE.md, "Removed
  // 2026-09"; .claude/agents/deploy-research.md routes live-web checks to
  // the host fetch tool / hosted connector). tests/unit/mcp-smoke.test.mjs
  // pins the absence against .mcp.json only; this is the same pin at
  // lockstep scope: the decision cannot drift in ANY catalog, and the CLI
  // surface cannot silently vanish either. Re-attaching tinyfish is a
  // deliberate change — it starts by editing this test, with fresh egress
  // evidence attached.
  const claude = JSON.parse(read(".mcp.json")).mcpServers;
  const cursor = JSON.parse(read(".cursor/mcp.json")).mcpServers;
  assert.equal(claude.tinyfish, undefined, "tinyfish must not be MCP-attached (.mcp.json)");
  assert.equal(cursor.tinyfish, undefined, "tinyfish must not be MCP-attached (.cursor/mcp.json)");
  for (const f of [".mcp.json", ".cursor/mcp.json", ".codex/config.toml"])
    assert.doesNotMatch(read(f), /tinyfish/i,
      `${f} must not name tinyfish at all — the catalogs stay silent about a CLI-only tool`);
  const allow = JSON.parse(read(".cursor/environment.json")).mcpServerAllowlist;
  assert.ok(!allow.some((a) => /tinyfish/i.test(a.name)), "environment.json must not allowlist tinyfish");
  // The CLI that remains: wrapper + RPC unwrapper, still declaring itself.
  assert.ok(exists("tools/mcp/tinyfish-mcp.sh"),
    "the tinyfish CLI wrapper is gone — if that is deliberate, update this pin and AGENT-SURFACE together");
  assert.ok(exists("tools/mcp/tinyfish-rpc.py"), "the tinyfish RPC helper is gone — see the wrapper pin above");
  assert.ok(
    /CLI ONLY — NOT MCP-ATTACHED/.test(read("tools/mcp/tinyfish-mcp.sh")),
    "the wrapper no longer declares itself CLI-only — a changed interface re-opens the attachment decision here, not by drift",
  );
  // The doc side of the decision stays in the surface map.
  assert.ok(
    /Removed 2026-09 \(CLI only now, not MCP-attached\)/.test(read("docs/AGENT-SURFACE.md")),
    "AGENT-SURFACE lost the Removed-2026-09 section that explains tinyfish",
  );
});

test("Claude rules generate Cursor .mdc twins (gen-cursor-rules owns the mirror)", () => {
  // Source of truth: .claude/rules/<x>.md. Cursor twins are generated
  // (paths→globs, no paths→alwaysApply). Hand-mirroring drifted for weeks;
  // gen:check / this spawn is the gate. apex-shared.mdc stays hand-written.
  const r = spawnSync(process.execPath, ["tools/gen/gen-cursor-rules.mjs", "--check"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const name of ["render-wgx", "render-tlx", "js-nav", "claude-config", "ci-tools"]) {
    const claude = stripFrontmatter(read(`.claude/rules/${name}.md`));
    const cursor = stripFrontmatter(read(`.cursor/rules/${name}.mdc`));
    assert.match(claude.fm, /paths:/, `${name}: .claude/rules needs paths:`);
    assert.match(cursor.fm, /globs:\s*\S+/, `${name}: generated .mdc needs globs:`);
    assert.match(cursor.fm, /alwaysApply:\s*false/);
    assert.match(cursor.body, /generated by tools\/gen\/gen-cursor-rules\.mjs/);
    for (const m of new Set(claude.body.match(/(?<![\w./-])(?:js|tools|docs)\/[\w./-]+\.(?:js|mjs|cjs|md)/g) || []))
      assert.ok(exists(m), `${name} cites ${m}, which does not exist`);
  }
  assert.match(read(".claude/rules/render-tlx.md"), /One census run per branch/);
  assert.match(read(".claude/rules/render-wgx.md"), /One census run per branch/);
  assert.doesNotMatch(read("AGENTS.md"), /sampleCount/, "the WGSL rules moved to .claude/rules/render-wgx.md");
});

test("settings.json registers the hooks that enforce the rules, and each hook exists", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  const commands = [];
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    for (const g of groups) for (const h of g.hooks || []) commands.push({ event, matcher: g.matcher, command: h.command });
  }
  const byEvent = (e) => commands.filter((c) => c.event === e);
  assert.ok(byEvent("SessionStart").some((c) => c.command.includes("session-start.sh")), "SessionStart install hook missing");
  assert.ok(byEvent("PreToolUse").some((c) => /Write\|Edit/.test(c.matcher) && c.command.includes("protect-files.sh")),
    "PreToolUse edit guard missing");
  assert.ok(byEvent("PreToolUse").some((c) => c.matcher === "Bash" && c.command.includes("bash-guard.sh")),
    "PreToolUse Bash guard missing");
  for (const c of commands) {
    const rel = c.command.replace(/^"?\$CLAUDE_PROJECT_DIR\//, "").replace(/"(\s.*)?$/, "");   // drop args
    assert.ok(exists(rel), `hook ${rel} is registered but missing`);
    assert.ok(fs.statSync(path.join(ROOT, rel)).mode & 0o111, `hook ${rel} is not executable`);
  }
  // The rules the hooks enforce say so (AGENTS.md names the hook beside the rule), and the escape
  // hatch is documented where the hooks are listed (.claude/rules/claude-config.md, 2026-11-03).
  const agents = read("AGENTS.md");
  for (const hook of ["session-start.sh", "protect-files.sh", "bash-guard.sh", "mcp-browser-guard.sh"])
    assert.ok(agents.includes(hook), `AGENTS.md must name ${hook}`);
  assert.match(read(".claude/rules/claude-config.md"), /allow-protected/);
});

test("the Bash guard blocks every shape of the kill that orphans browsers", () => {
  // These are RUN, not grepped: the pattern that shipped required -f as the
  // FIRST flag, so `pkill -9 -f node` — what anyone types when a plain pkill
  // "did not work" — walked past a guard whose whole purpose is that pkill -f
  // matches the guard's own shell. A regex assertion would have passed on the
  // broken pattern; only executing the hook catches it.
  const run = (command) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/bash-guard.sh")], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  for (const cmd of [
    "pkill -f chrome",                     // the original form
    "pkill -9 -f node",                    // signal before -f
    "pkill -TERM -f chrome",               // named signal before -f
    "pkill --full playwright",             // long flag
    "sudo pkill -f chrome",                // privileged prefix
    "killall chrome",
    "kill -9 $(pgrep -f chrome)",          // substitution: no literal pid
    "pgrep -f chrome | xargs kill -9",     // pipe: no literal pid
    // 2026-11-03: the `sh -c "pkill …"` and `/usr/bin/pkill` shapes are a documented miss of the slim
    // guard (plan §4.7); the deny rules in settings.json and B1's hook tests own what remains.
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  // …and stays out of the way of ordinary work, including a command that only
  // MENTIONS the words outside command position. The heredoc case is not
  // hypothetical: the pgrep rule went in unanchored and blocked the very
  // commit that added it, because the message described what it blocks. The
  // quoted `&&` case is the false positive the same review found: `&& pkill`
  // inside a string read as command position.
  for (const cmd of [
    "git status",
    "ps -eo pid,comm",
    'echo "pkill -f chrome"',
    "echo 'note: && pkill -f chrome is bad'",
    "printf '%s' 'x; /usr/bin/pkill -f chrome'",
    // --dry-run: this row is about the pkill rule reading a heredoc body as
    // prose. A real commit here would run the commit guard (and, since
    // 2026-10-04, refuse on any unstaged edit in the checkout under test).
    "git commit --dry-run -F - <<'MSG'\nthe guard now covers a pgrep -f list piped into xargs kill\nMSG",
  ]) assert.equal(run(cmd).status, 0, `bash-guard must allow: ${cmd}`);
});

test("the Bash guard refuses a browser run from inside a subagent, and only there", () => {
  // AGENTS.md §Verification 10 was prose plus a body lint; every agent carries
  // Bash. Hook input from a subagent names it (agent_id / agent_type, or a
  // transcript under subagents/ — the shape this session's own transcripts
  // have); the main session carries none of those and keeps every command.
  const run = (command, sub) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/bash-guard.sh")], {
    input: JSON.stringify({
      tool_name: "Bash", tool_input: { command },
      ...(sub ? { transcript_path: "/root/.claude/projects/p/s/subagents/agent-abc.jsonl" } : {}),
    }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const browser = [
    "node tools/ci/test-bg.mjs smoke",
    "npx playwright test tests/specs/autopilot.spec.js",
    "npm test -- tests/specs/autopilot.spec.js",
    "node tools/ci/verify-change.mjs --wait",
    // 2026-09-24: the path-prefix and npm-script forms walked past the guard.
    "node ./tools/ci/test-bg.mjs smoke",
    "node /home/user/f1-game/tools/ci/test-bg.mjs smoke",
    "npm run test:smoke",
    "npm run --silent test:smoke -- --workers=1",
    "node tools/ci/verify-change.mjs",     // bare form starts batch 1 via test-bg
  ];
  const nodeOnly = [
    "node tools/ci/test-bg.mjs --status",
    "node tools/ci/test-bg.mjs --tail smoke",
    "node tools/ci/verify-change.mjs --fast --json",
    "node tools/ci/verify-change.mjs --plan",
    "npm run test:guards",
    "npm run test:tooling-fast -- --changed",
    "node --test tests/unit/ratchets.test.mjs",
    "node tools/track/verify-track.cjs monza",
  ];
  for (const cmd of browser) assert.equal(run(cmd, true).status, 2, `a subagent must not run: ${cmd}`);
  for (const cmd of nodeOnly) assert.equal(run(cmd, true).status, 0, `a subagent may run: ${cmd}`);
  for (const cmd of browser) assert.equal(run(cmd, false).status, 0, `the main session may run: ${cmd}`);
});

// 2026-11-03 (plan §4.7): the test-bg supervisor-pid rule, shellparse.py's commit parser and the Bash-write
// half of protect-files (live-run rule included) are gone with the slim hooks; their surviving behaviour is
// pinned in the hook tests B1 owns (bash-guard-hardening.test.mjs), not here.

test("a subagent cannot reach a browser through MCP tools either", () => {
  /* AGENTS.md §Verification 10 held for Bash only; every subagent was offered
     playwright-official, chrome-devtools and the apex_* browser tools. Claude
     Code runs PreToolUse hooks on MCP tool names and marks a subagent's call
     with agent_id (https://code.claude.com/docs/en/hooks). */
  const settings = JSON.parse(read(".claude/settings.json"));
  const groups = settings.hooks.PreToolUse;
  const mcp = groups.find((g) => (g.hooks || []).some((h) => h.command.includes("mcp-browser-guard.sh")));
  assert.ok(mcp, "the MCP browser guard is registered");
  const re = new RegExp(mcp.matcher);
  for (const n of ["mcp__playwright-official__browser_navigate", "mcp__chrome-devtools__new_page", "mcp__js-debugger__debugger_attach", "mcp__js-debugger__debugger_control",
                   "mcp__apex-tools__apex_shot", "mcp__apex-tools__apex_shot_survey", "mcp__apex-tools__apex_track", "mcp__apex-tools__apex_job_start"])
    assert.ok(re.test(n), `matcher must select ${n}`);
  for (const n of ["mcp__apex-tools__apex_track_audit", "mcp__apex-tools__apex_status", "mcp__github__get_me", "Bash"])
    assert.ok(!re.test(n), `matcher must leave ${n} alone`);
  const run = (payload) => spawnSync("bash", [path.join(ROOT, ".claude/hooks/mcp-browser-guard.sh")],
    { input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(run({ tool_name: "mcp__playwright-official__browser_navigate", agent_id: "a1" }).status, 2);
  assert.equal(run({ tool_name: "mcp__chrome-devtools__new_page", transcript_path: "/p/subagents/agent-x.jsonl" }).status, 2);
  assert.equal(run({ tool_name: "mcp__apex-tools__apex_eval", agent_id: "a1" }).status, 2);
  assert.equal(run({ tool_name: "mcp__js-debugger__debugger_attach", agent_id: "a1" }).status, 2);
  assert.equal(run({ tool_name: "mcp__js-debugger__debugger_control", agent_type: "reviewer" }).status, 2);
  assert.equal(run({ tool_name: "mcp__js-debugger__debugger_state" }).status, 0, "parent retains debugger access");
  assert.equal(run({ tool_name: "mcp__playwright-official__browser_navigate" }).status, 0, "the main session keeps its browser");
  assert.equal(run({ tool_name: "mcp__apex-tools__apex_track_audit", agent_id: "a1" }).status, 0, "tree tools stay open to subagents");
});

test("auto memory is on, restored at SessionStart, and its tracked copy stays small, typed and secret-free", () => {
  // docs/notes/AGENT-MEMORY.md: the CLI turns auto memory OFF in cloud sessions
  // unless this env is falsy, and memory-sync.sh restores the tracked copy at
  // SessionStart (one-way since 2026-11-03: the repo wins). The tracked copy is
  // model-written and committed, so it gets the same limits the CLI applies
  // (200-line index) plus a secret scan.
  const settings = JSON.parse(read(".claude/settings.json"));
  assert.equal(settings.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "0", "auto memory must be forced on (it is off in remote sessions)");
  assert.match(read(".claude/hooks/session-start.sh"), /memory-sync\.sh" restore/, "session-start must restore memory");
  assert.match(read(".gitignore"), /^!\.claude\/memory\/$/m, ".claude/memory/ must be tracked");
  const dir = path.join(ROOT, ".claude/memory");
  const index = read(".claude/memory/MEMORY.md");
  assert.ok(index.split("\n").length <= BUDGET.memoryIndexLines, "MEMORY.md past 200 lines is silently truncated at load — move detail into topic files");
  for (const [, file] of index.matchAll(/\]\(([^)]+\.md)\)/g))
    assert.ok(fs.existsSync(path.join(dir, file)), `MEMORY.md links ${file}, which does not exist`);
  const SECRET = /(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|token|password|secret)\s*[:=]\s*\S{12,})/i;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const text = read(`.claude/memory/${f}`);
    assert.doesNotMatch(text, SECRET, `.claude/memory/${f} holds a secret-shaped string — memories are committed`);
    // `type:` at the top level, or under `metadata:` — memory-sync.sh writes the
    // latter shape (2026-09-30: it dropped a top-level `type` and this pin
    // reddened PR #498's guards), and the auto-memory format defines both.
    if (f !== "MEMORY.md")
      assert.ok(MEMORY_TYPES.has(memoryType(text)),
        `.claude/memory/${f} needs frontmatter with type: user|feedback|project|reference (top level or under metadata:)`);
  }
});

test("shared memory has no orphan topics or missing relative Markdown/wiki links", () => {
  const dir = path.join(ROOT, ".claude/memory");
  const files = new Map(fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
  assert.deepEqual(memoryLinkIssues(files, (rel) => fs.existsSync(path.resolve(dir, rel))), []);
});

// docs/notes/SECOND-BRAIN-2026-10-14.md: GitHub Copilot Memory stores the code
// location each fact rests on and re-checks it before use, so a fact whose
// evidence moved stops being served. Ours is the static half of that: a
// memory MAY carry `source: <path>[, <path>…]` (top level or under metadata:),
// and a cited path that no longer exists fails here — the memory is stale and
// must be rewritten or deleted, not silently recalled. Entries that are not
// paths (`user`, `#1519`, a test name) are allowed and not checked.
test("a memory's source: paths still exist", () => {
  let seen = 0;
  const dir = path.join(ROOT, ".claude/memory");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "MEMORY.md")) {
    const fm = read(`.claude/memory/${f}`).match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
    const line = fm.match(/^\s*source:\s*(.+)$/m);
    if (!line) continue;
    seen++;
    for (const raw of line[1].split(",")) {
      const rel = raw.trim().replace(/^["'`]|["'`]$/g, "").replace(/(#.*|:\d+(-\d+)?)$/, "");
      if (!/\/|\.[a-z]{1,5}$/i.test(rel)) continue;
      assert.ok(exists(rel), `.claude/memory/${f} cites source ${raw.trim()}, which no longer exists — rewrite or delete the memory`);
    }
  }
  assert.ok(seen >= 1, "no memory carries a `source:` line — the scan above checked nothing");
});

// AGENTS.md §Coordination owns merge/hold/arm; the MEMORY.md index must not
// restate those topics. Topic files with a "Stale check" note are themselves
// stale — delete or rewrite, do not keep the flag.
test("MEMORY.md index has no duplicate topic links, no coordination restatements, no Stale-check topics", () => {
  const index = read(".claude/memory/MEMORY.md");
  const links = [...index.matchAll(/^\s*-\s*\[[^\]]*\]\(([^)]+\.md)\)/gm)].map((m) => m[1]);
  const seen = new Map();
  for (const f of links) {
    assert.ok(!seen.has(f), `MEMORY.md links ${f} twice — keep one index line per topic file`);
    seen.set(f, true);
  }
  const FLEET_RE = /\bMERGE-HOLD\b|\bsquash\b|\bSWEEP\b|\bauto-?merge\b|\barms?\b|\barming\b|\barmed\b/i;
  for (const line of index.split("\n")) {
    if (!/^\s*-\s*\[/.test(line)) continue;
    assert.doesNotMatch(line, FLEET_RE,
      `MEMORY.md index restates a coordination rule (${line.slice(0, 80)}…) — its home is AGENTS.md §Coordination; trim`);
  }
  const dir = path.join(ROOT, ".claude/memory");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "MEMORY.md")) {
    const text = read(`.claude/memory/${f}`);
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
    if (!/^\s*type:\s*project\s*$/m.test(fm)) continue;
    assert.doesNotMatch(text, /\*\*Stale check\b|^Stale check\b/m,
      `.claude/memory/${f} is type: project with a Stale check note — delete or rewrite the topic`);
  }
});

// Instructions are an attack surface: the 2025 "Rules File Backdoor" hid
// prompts in agent rules files with zero-width and bidi characters that render
// as nothing in review (docs/notes/SECOND-BRAIN-2026-10-14.md). Nothing a
// session loads as instructions or memory may carry one.
test("no instruction or memory file carries invisible or bidi-control characters", () => {
  const HIDDEN = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/u;
  const files = spawnSync("git", ["ls-files", "AGENTS.md", "CLAUDE.md", "*/AGENTS.md", "*/CLAUDE.md",
    ".claude/rules", ".claude/skills", ".claude/agents", ".claude/memory", ".claude/agent-memory",
    ".cursor/rules", ".github/pull_request_template.md"], { cwd: ROOT, encoding: "utf8" })
    .stdout.split("\n").filter((f) => /\.(md|mdc)$/.test(f));
  assert.ok(files.length > 20, "the instruction-file listing came back nearly empty");
  for (const rel of files) {
    if (fs.lstatSync(path.join(ROOT, rel)).isSymbolicLink()) continue;
    const text = read(rel);
    const i = text.search(HIDDEN);
    if (i < 0) continue;
    const ln = text.slice(0, i).split("\n").length;
    assert.fail(`${rel}:${ln} holds U+${text.codePointAt(i).toString(16).toUpperCase().padStart(4, "0")}, an invisible/bidi control — delete it (it hides text from review)`);
  }
});

test("the edit guard treats tests/data/ratchets.json as tool-written", () => {
  // A ceiling moves through ratchets.mjs (--auto-raise in the commit hook,
  // --update with a reason); a hand edit was unblocked until 2026-09-22.
  const hook = path.join(ROOT, ".claude/hooks/protect-files.sh");
  const run = (payload) => spawnSync("bash", [hook], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const file = path.join(ROOT, "tests/data/ratchets.json");
  assert.equal(run({ tool_name: "Edit", tool_input: { file_path: file, old_string: "a", new_string: "b" } }).status, 2);
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: file, content: "{}" } }).status, 2);
  // ...and so is a per-branch raise fragment (#2291): the hook's --auto-raise writes it.
  const frag = path.join(ROOT, "tests/data/ratchets.d", "cursor--x-1234.json");
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: frag, content: "{}" } }).status, 2);
  assert.equal(run({ tool_name: "Edit", tool_input: { file_path: path.join(ROOT, "docs/PHYSICS.md"), old_string: "a", new_string: "b" } }).status, 0);
});

test("the edit guard refuses a generated package.json block through Write as well as Edit", () => {
  // The test:* scripts are generated from tests/groups.json. The guard matched
  // on old_string, which a whole-file Write does not carry, so a Write rewrote
  // the generated block unguarded — the one tool call that can drop a whole
  // test group from the gate.
  const hook = path.join(ROOT, ".claude/hooks/protect-files.sh");
  const pkg = path.join(ROOT, "package.json");
  const current = read("package.json");
  const run = (payload) => spawnSync("bash", [hook], {
    input: JSON.stringify(payload), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const mangled = JSON.parse(current);
  mangled.scripts["test:guards"] = "echo nope";
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: pkg, content: JSON.stringify(mangled, null, 2) } }).status, 2,
    "a Write that rewrites a test:* script must be blocked");
  assert.equal(run({ tool_name: "Edit", tool_input: { file_path: pkg, old_string: '"test:guards":', new_string: '"test:guards":' } }).status, 2,
    "the Edit path must still be blocked");
  // A LINKED WORKTREE has a second, wider rule in front of this one: the hook
  // makes package.json (and index.html, manifest.cjs, sw.js) main-session-only,
  // so an unchanged Write is refused there too — for a reason that has nothing
  // to do with the generated block. Asserting status 0 flat made this test fail
  // for every worktree agent on every diff (two hit it on 2026-09-22). Assert
  // the DISTINCTION instead: outside a worktree the guard stays out of the way,
  // inside one it says worktree, never "generated".
  const untouched = run({ tool_name: "Write", tool_input: { file_path: pkg, content: current } });
  const linkedWorktree = fs.statSync(path.join(ROOT, ".git")).isFile();
  if (linkedWorktree) {
    assert.equal(untouched.status, 2, "a worktree agent is refused package.json outright");
    assert.match(`${untouched.stdout}${untouched.stderr}`, /worktree/i,
      "and the refusal must be the worktree rule, not the generated-block one");
  } else {
    assert.equal(untouched.status, 0,
      "a Write that leaves the generated block alone is not the guard's business");
  }
});

test("the Codex skill mirror is tracked symlinks and the repair script exists", () => {
  // The deploy branch tracks .agents/skills/<name> -> ../../.claude/skills/<name>
  // (agent-surface.test.mjs locksteps every dir); it must NOT be gitignored,
  // or a fresh clone's Codex sees no skills. The script repairs, never copies
  // into git.
  assert.doesNotMatch(read(".gitignore"), /^\.agents\/?$/m, ".agents/ is the tracked Codex mirror — do not gitignore it");
  assert.match(read(".gitignore"), /^!\.claude\/rules\/$/m, ".claude/rules/ must be tracked");
  assert.ok(exists("tools/env/mirror-skills.sh"));
  assert.match(read("tools/env/mirror-skills.sh"), /\.agents\/skills/);
  assert.match(read("tools/env/mirror-skills.sh"), /ln -s/, "the repair makes symlinks, the tracked form");
});

test("env install scripts answer --help without side effects", () => {
  // --help used to run the install body (npm / apt / MCP clones).
  const cases = [
    { cmd: "bash", args: ["tools/env/mirror-skills.sh", "--help"], want: /--check/, no: /mirrored \d+ skills/ },
    { cmd: "bash", args: ["tools/env/install-browsers.sh", "--help"], want: /Playwright Chromium/, no: /OK: Playwright Chromium ready/ },
    { cmd: "bash", args: ["tools/env/cloud-agent-install.sh", "--help"], want: /install-browsers/, no: /OK: cloud-agent install complete/ },
  ];
  for (const c of cases) {
    const r = spawnSync(c.cmd, c.args, { encoding: "utf8", cwd: ROOT, timeout: 10000 });
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    assert.equal(r.status, 0, `${c.args[0]} --help: ${text}`);
    assert.match(text, c.want, `${c.args[0]} --help missing ${c.want}`);
    if (c.no) assert.doesNotMatch(text, c.no, `${c.args[0]} --help ran the real body`);
  }
});

// ── THE ALWAYS-ON SURFACE HAS A BUDGET ──────────────────────────────────────
// Rationale and evidence: docs/notes/SELF-IMPROVING-SURFACE-2026-09-22.md.
// Measured across 1,867 repos and 247,694 instruction lifetimes (arXiv
// 2608.11095), agentic context files grow +226% over their lifetime at +4.9 net
// instructions per commit, and the deletion hazard FALLS with instruction age
// (-0.032/commit) because removing a rule means reconstructing why it was added.
// Adding is free; removing is expensive; nothing pushes back. These two caps are
// the push-back. They are deliberately close to today's numbers so the next line
// costs a decision, not so that they never move — raise them WITH the reason, the
// way tests/data/ratchets.json is raised.
test("the always-on instruction surface stays inside its budget", () => {
  // A rule-bearing line is one that tells a session what to do. Counted crudely
  // but CONSISTENTLY: the absolute number matters less than the direction.
  const RULE = /\b(never|always|must|do not|don't|use |run |prefer|keep |avoid|only |refuse|blocks?|stop |edit the|read |name |push |wait )/i;
  const ruleLines = (text) => text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|---") && !l.startsWith("```") && RULE.test(l)).length;

  const agents = ruleLines(read("AGENTS.md"));
  // Reported ceiling for reliable instruction-following is ~150-200 TOTAL, and
  // Claude Code's own system prompt already spends ~50 of them before this file
  // is read. 75 leaves room for the skills, which add their own on invocation.
  assert.ok(agents <= BUDGET.agentsMdRuleLines,
    `AGENTS.md carries ~${agents} rule-bearing lines (budget ${BUDGET.agentsMdRuleLines}) — promote one to a hook or a test, or delete it`);

  // Skill DESCRIPTIONS are always loaded for routing, so they are part of the
  // same budget even though the bodies are not (progressive disclosure).
  const skills = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(`.claude/skills/${d.name}/SKILL.md`));
  let descWords = 0;
  for (const d of skills) {
    const { fm } = stripFrontmatter(read(`.claude/skills/${d.name}/SKILL.md`));
    // Measure the described surface, not YAML keys, name fields or scalar
    // quoting/folding syntax. Parsing also refuses malformed descriptions.
    const parsed = parseYAML(fm);
    const description = parsed?.description;
    assert.equal(typeof description, "string", `${d.name}: description must be a YAML string`);
    // user-only skills (disable-model-invocation) are not in context: see the budgets file comment
    descWords += parsed["disable-model-invocation"] === true ? 0 : description.split(/\s+/).filter(Boolean).length;
  }
  // Raised 1600 -> 1700 on 2026-10-16 (Bryce: "Raise the skill budget"): 40 skills left
  // ~0 slack, so every skill edit traded routing recall (skill-hint-hook floor) for budget.
  assert.ok(descWords <= BUDGET.skillDescriptionWords,
    `${skills.length} skill descriptions cost ~${descWords} always-on words (budget ${BUDGET.skillDescriptionWords}) — tighten one, or retire a skill`);
});

// ── BYTE AND ROUTING BUDGETS (2026-10-14, docs/notes/AGENT-GUARDS-2026-10-14.md) ──
// Lines and words are gameable (one 2 KB line is "one line"); the hosts cap
// BYTES and CHARS. Codex concatenates AGENTS.md from the repo root down to the
// working directory and stops adding files at project_doc_max_bytes, 32 KiB
// by default (https://learn.chatgpt.com/docs/agent-configuration/agents-md),
// so a long root file silently truncates the nested one — js/track's carries
// the test-frozen scenery contract. The 2026-10-14 trim took the root to
// ~22.5 KB; the caps pin a margin above it (raise them only with a reason).
const AGENTS_MAX = BUDGET.agentsMdBytes;
const CHAIN_MAX = BUDGET.agentsChainBytes;
const nestedAgents = () => spawnSync("git", ["ls-files", "*/AGENTS.md"], { cwd: ROOT, encoding: "utf8" })
  .stdout.split("\n").filter(Boolean);

test("AGENTS.md and every root-to-nested AGENTS.md chain fit Codex's project-doc byte cap", () => {
  const rootBytes = fs.statSync(path.join(ROOT, "AGENTS.md")).size;
  assert.ok(rootBytes <= AGENTS_MAX, `AGENTS.md is ${rootBytes} B (cap ${AGENTS_MAX}) — move a rule to a hook, a test or a skill`);
  const nested = nestedAgents();
  assert.ok(nested.length >= 2, "js/track and js/circuits carry nested AGENTS.md");
  for (const rel of nested) {
    // the chain is every AGENTS.md from the root down to this directory, joined by a blank line
    const parts = rel.split("/").slice(0, -1);
    const chain = ["AGENTS.md"];
    for (let i = 1; i <= parts.length; i++) {
      const p = [...parts.slice(0, i), "AGENTS.md"].join("/");
      if (exists(p)) chain.push(p);
    }
    const bytes = chain.reduce((n, p) => n + fs.readFileSync(fs.realpathSync(path.join(ROOT, p))).length, 0) + 2 * (chain.length - 1);
    assert.ok(bytes <= CHAIN_MAX, `${chain.join(" + ")} = ${bytes} B > ${CHAIN_MAX}: Codex truncates ${rel}`);
  }
});

test("nested AGENTS.md files are symlinks to their sibling CLAUDE.md (one copy per directory)", () => {
  for (const rel of nestedAgents()) {
    const st = fs.lstatSync(path.join(ROOT, rel));
    assert.ok(st.isSymbolicLink(), `${rel} must be a symlink, not a copy`);
    assert.equal(fs.readlinkSync(path.join(ROOT, rel)), "CLAUDE.md", `${rel} must point at its sibling CLAUDE.md`);
    assert.ok(exists(path.join(path.dirname(rel), "CLAUDE.md")), `${rel}: sibling CLAUDE.md missing`);
  }
});

test("skill descriptions: a char budget, every arrow resolves", () => {
  // Routing prompts and the deterministic description checks: the skill-descriptions unit test (2026-11-03).
  const skills = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(`.claude/skills/${d.name}/SKILL.md`)).map((d) => d.name);
  const agents = fs.readdirSync(path.join(ROOT, ".claude/agents")).filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.replace(/\.md$/, ""));
  let chars = 0;
  for (const name of skills) {
    const meta = parseYAML(stripFrontmatter(read(`.claude/skills/${name}/SKILL.md`)).fm);
    const desc = meta.description;
    // The Agent Skills spec caps a description at 1,024 characters.
    assert.ok(desc.length <= BUDGET.skillDescriptionCharsEach, `${name}: description is ${desc.length} chars (spec max ${BUDGET.skillDescriptionCharsEach})`);
    if (meta["disable-model-invocation"] !== true) chars += desc.length; // user-only: not always-on
    for (const m of desc.matchAll(/(?:→|->)\s*(?:agent\s+)?\**`?([a-z0-9][a-z0-9-]*)/g))
      assert.ok(skills.includes(m[1]) || agents.includes(m[1]), `${name}: "→ ${m[1]}" names no skill or agent`);
  }
  // 11,986 chars on 2026-10-14, rounded up to the next 100. Raised to 12,800 on 2026-10-16
  // (Bryce: "Raise the skill budget") for the same reason as the word budget. Trim one to add one.
  assert.ok(chars <= BUDGET.skillDescriptionChars, `${skills.length} skill descriptions are ${chars} chars (budget ${BUDGET.skillDescriptionChars})`);
});

test("settings.json denies GitHub-MCP repo surgery; nothing asks (the owner, 2026-10-15)", () => {
  const perms = JSON.parse(read(".claude/settings.json")).permissions;
  for (const t of ["mcp__github__delete_file", "mcp__github__create_repository", "mcp__github__fork_repository"])
    assert.ok(perms.deny.includes(t), `permissions.deny must hold ${t} (AGENTS.md: agents never merge)`);
  // 2026-11-03 (plan §4.7): permissions.ask holds the few Bryce-attended routes (gh api DELETE, workflow
  // dispatch); which ones is settings.json's own business, pinned by B1's hook tests.
  assert.ok(perms.allow.includes("mcp__github"), "the whole GitHub MCP server is pre-approved");
  for (const t of [...perms.deny, ...(perms.ask || [])])
    assert.ok(!perms.allow.includes(t), `${t} is both allowed and gated`);
  const pre = JSON.parse(read(".claude/settings.json")).hooks.PreToolUse;
  assert.ok(pre.some((g) => g.hooks.some((h) => h.command.includes("github-mcp-guard.sh"))),
    "enable_pr_auto_merge and draft:false go through github-mcp-guard.sh");
});

test(".cursor/environment.json allowlists exactly the .mcp.json servers, with their launch lines", () => {
  const servers = JSON.parse(read(".mcp.json")).mcpServers;
  const allow = JSON.parse(read(".cursor/environment.json")).mcpServerAllowlist;
  const patternMatches = (pattern, text) => {
    const re = new RegExp(
      `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    );
    return re.test(text);
  };
  const mcpLaunch = (row) => [row.command, ...(row.args || [])].join(" ");
  assert.deepEqual(allow.map((a) => a.name).sort(), Object.keys(servers).sort());
  for (const a of allow) {
    const s = servers[a.name];
    const launch = mcpLaunch(s);
    assert.ok(
      patternMatches(a.command, launch) || patternMatches(a.command, `/usr/bin/${launch}`),
      `${a.name}: allowlist pattern ${JSON.stringify(a.command)} must match .mcp.json launch ${JSON.stringify(launch)}`,
    );
    assert.ok(a.command.includes("*"), `${a.name}: allowlist command should use * wildcards`);
  }
});

// 2026-11-03: the per-agent memory stores (.claude/agent-memory/) and their `memory:` cards are gone
// (plan §4.6); a store that comes back needs its schema and expiry rule pinned again here.
test("no agent-memory store is committed without a schema and an expiry rule", () => {
  const dir = path.join(ROOT, ".claude/agent-memory");
  if (!fs.existsSync(dir)) return;
  for (const s of fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const rel = `.claude/agent-memory/${s.name}/MEMORY.md`;
    assert.ok(exists(rel), `${s.name} has a memory dir but no MEMORY.md index`);
    const text = read(rel);
    assert.ok(/`[^`]*—[^`]*`/.test(text), `${rel} states no entry schema — a store without one accumulates prose`);
    assert.ok(/re-verif|expire|stale|older than|no longer|re-check|recheck/i.test(text),
      `${rel} names no way for an entry to stop being believed — that is the ratchet arXiv 2608.11095 measures`);
  }
});

// ── SKILL REFERENCES: ONE HOP, AND A CONTENTS BLOCK PAST 100 LINES ──────────
// Anthropic's skill-authoring guide (platform.claude.com/docs/en/agents-and-tools/
// agent-skills/best-practices, read 2026-10-05): a reference reached through
// another reference may be previewed with `head -100`, so every reference links
// directly from SKILL.md, and a reference over 100 lines opens with a table of
// contents so a partial read still shows its scope. CLAUDE.md, AGENTS.md and
// SKILL.md load whole on every session or invocation and are NOT covered: a
// Contents block there spends lines the 200-line target wants back.
test("every skill reference is linked from its SKILL.md and, past 100 lines, opens with a Contents block", () => {
  const skillsDir = path.join(ROOT, ".claude/skills");
  const problems = [];
  for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory() || !exists(`.claude/skills/${d.name}/references`)) continue;
    const skillMd = read(`.claude/skills/${d.name}/SKILL.md`);
    const refs = fs.readdirSync(path.join(skillsDir, d.name, "references")).filter((f) => f.endsWith(".md"));
    for (const ref of refs) {
      const rel = `.claude/skills/${d.name}/references/${ref}`;
      if (!skillMd.includes(`references/${ref}`)) problems.push(`${rel}: not linked from SKILL.md (keep references one hop deep)`);
      const lines = read(rel).split("\n");
      const n = lines.length - 1;
      if (n <= 100) continue;
      let fence = false;
      const h2 = [];
      for (const l of lines) {
        if (/^\s*(```|~~~)/.test(l)) fence = !fence;
        else if (!fence && /^## /.test(l)) h2.push(l.slice(3).trim());
      }
      if (h2[0] !== "Contents") { problems.push(`${rel}: ${n} lines, its first H2 must be "## Contents"`); continue; }
      const listed = [];
      for (let i = lines.indexOf("## Contents") + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
        const m = lines[i].match(/^- (.+)$/);
        if (m) listed.push(m[1].trim());
      }
      const want = h2.slice(1);
      if (listed.join("\n") !== want.join("\n")) {
        problems.push(`${rel}: Contents lists [${listed.join(" | ")}] but the H2s are [${want.join(" | ")}]`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// 2026-10-13 retired squash: Merge Desk arms MERGE-commit auto-merge only
// (AGENTS.md §Coordination, github-mcp-guard.sh). A day later the Merge Desk
// subagent, Bugbot's rules, the Cursor/Grok plugin, the steward card and
// deploy.mjs's PR notes still said "arms SQUASH" — each tool read a different
// rule. Nothing any agent reads may tell it to squash again.
test("no agent-facing file tells an agent to arm or merge with SQUASH", () => {
  const files = spawnSync("git", ["ls-files", "AGENTS.md", ".claude/agents", ".claude/skills", ".claude/rules",
    ".cursor", "cursor-plugins", ".codex", ".agents", "docs/notes/APEX-STEWARD-CARD-2026-10-05.md", "tools/ci/deploy.mjs"],
    { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean)
    .filter((f) => !fs.lstatSync(path.join(ROOT, f)).isSymbolicLink());
  assert.ok(files.length > 20, "the agent-facing file listing came back nearly empty");
  const STALE = /mergeMethod:\s*"SQUASH"|arms?\s+(auto-merge\s*\()?SQUASH\b|SQUASH only\b|\*\*SQUASH only\*\*/i;
  const bad = [];
  for (const f of files) read(f).split("\n").forEach((l, i) => { if (STALE.test(l) && !/retired/i.test(l)) bad.push(`${f}:${i + 1}: ${l.trim()}`); });
  assert.deepEqual(bad, [], "squash is retired — Merge Desk arms MERGE (merge commit) only");
});

// 2026-11-03: bash-guard's GUARD_TRIGGER fast path went with shellparse.py (plan §4.7); the slim guard's
// shapes are pinned in B1's bash-guard-hardening.test.mjs.

// #1984: a delegation prompt must not grant a write the track-surveyor's own scope hook denies
// (the regex now lives in the surveyor's own scope hook, named in its card; plan §4.6).
test("the survey-track delegation template owns only the surveyor's circuit pair (#1984)", () => {
  const tpl = fs.readFileSync(path.join(ROOT, ".claude/skills/survey-track/references/delegation.md"), "utf8");
  const owned = tpl.split("\n").find((l) => l.startsWith("OWNED"));
  assert.ok(owned, "template has an OWNED line");
  assert.match(owned, /js\/circuits\/<id>\.js/);
  assert.match(owned, /js\/circuits\/scenery\/<id>\.js/);
  assert.doesNotMatch(owned, /docs\//, "docs/tracks/<id>.md is not writable by the surveyor");
  assert.match(tpl.split("\n").find((l) => l.startsWith("FORBIDDEN")), /docs\/\*\*/);
});

// Skill hygiene pins from the 2026-10-16 issue burn-down (#1693 #1688 #1687 #1700).
{
  const skillsDir = path.join(ROOT, ".claude/skills");
  const skillText = (rel) => fs.readFileSync(path.join(skillsDir, rel), "utf8");

  test("no SKILL.md quotes a suite size ('~100 tests'): a count drifts, the command does not (#1693)", () => {
    const hits = [];
    for (const d of fs.readdirSync(skillsDir)) {
      const f = path.join(skillsDir, d, "SKILL.md");
      if (!fs.existsSync(f)) continue;
      fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (/~?\d+\+? tests\b/.test(l)) hits.push(`${d}/SKILL.md:${i + 1}: ${l.trim()}`);
      });
    }
    assert.deepEqual(hits, []);
  });

  test("check-changes routes the add-a-VM-twin recipe and the scoped DEFECT-LEDGER grep (#1688 #1687)", () => {
    const body = skillText("check-changes/SKILL.md");
    assert.match(body, /references\/vm-twin\.md/);
    assert.match(body, /DEFECT-LEDGER\.md/);
    const ref = skillText("check-changes/references/vm-twin.md");
    for (const needle of ["vm-portable.mjs", "ADAPTED", "TWINNED", "mutants.json", "twin-fidelity.mjs", "twinDebt"])
      assert.ok(ref.includes(needle), `vm-twin.md must name ${needle}`);
    // the recipe names real files
    for (const rel of ["tools/check/vm-portable.mjs", "tools/check/twin-fidelity.mjs", "tools/ci/twinned-specs.mjs",
      "tests/data/mutants.json", "tests/helpers/vm-page.js", "docs/notes/DEFECT-LEDGER.md"])
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} must exist`);
  });

  test("mcp-probe carries the tool-naming table; renderer-debug carries all_dark and the webgpu smoke (#1700)", () => {
    const probe = skillText("mcp-probe/SKILL.md");
    assert.match(probe, /`chrome_click`.*`click`/);
    const wgx = skillText("renderer-debug/references/wgx.md");
    assert.match(wgx, /all_dark/);
    assert.match(wgx, /apex-eval\.mjs monza .* --backend webgpu/);
  });
}

// Claude Code's own skill validator (Claude Academy, "Troubleshooting skills"; needs Claude Code
// v2.1.233+; https://code.claude.com/docs/en/plugins/cli-reference#validate-a-directory,
// checked 2026-10-28). It catches a SKILL.md whose frontmatter does not parse, which the budget tests above
// only see through our own parser. It skips where the CLI is absent or too old (CI runners).
test("claude plugin validate accepts project skills and rejects malformed skill frontmatter", { timeout: 100000 }, (t) => {
  const r = spawnSync("claude", ["plugin", "validate", ".claude/skills"], { cwd: ROOT, encoding: "utf8", timeout: 80000 });
  if (r.error && r.error.code === "ENOENT") return t.skip("claude CLI not on PATH");
  const out = `${r.stdout}${r.stderr}`;
  if (/unknown command|not a (known|valid) command|unknown option/i.test(out)) return t.skip("claude CLI too old for `plugin validate`");
  assert.equal(r.status, 0, `claude plugin validate .claude/skills failed:\n${out}`);
  // Exercise the validator's decision rather than its success-message wording.
  // The valid control ensures a nonzero result is about the malformed YAML,
  // not an unsupported fixture layout or path.
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "skill-validator-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const skills = path.join(dir, "skills"), skill = path.join(skills, "example"); fs.mkdirSync(skill, { recursive: true });
  const file = path.join(skill, "SKILL.md");
  fs.writeFileSync(file, '---\nname: example\ndescription: "Use when testing skill validation."\n---\n# Example\n');
  const validate = () => spawnSync("claude", ["plugin", "validate", skills], { cwd: ROOT, encoding: "utf8", timeout: 5000 });
  const valid = validate();
  assert.equal(valid.status, 0, `valid fixture refused: ${valid.error || valid.stdout + valid.stderr}`);
  fs.writeFileSync(file, '---\nname: example\ndescription: [unterminated\n---\n# Example\n');
  const invalid = validate();
  assert.equal(invalid.error, undefined, `validator must execute, not fail to launch: ${invalid.error}`);
  assert.equal(invalid.signal, null, "malformed frontmatter must return a verdict, not time out");
  // ENVIRONMENT PRECONDITION, not a quarantine: a `claude` whose validator accepts the malformed control (exit 0)
  // cannot validate here at all (the cloud containers' CLI, 2.1.314, 2026-10-30), so the assertion below would
  // measure the CLI, not our skills. Where the validator rejects the control, the assertion stays and a real
  // failure of it is still red. Known container-only reds: docs/TESTING.md.
  if (invalid.status === 0) return t.skip("claude CLI cannot validate here: it accepted malformed skill frontmatter (exit 0)");
  assert.equal(invalid.status, 1, "malformed frontmatter must fail validation (not an unexpected validator error)");
});

test("season-mode references quote only unit-test names that exist", () => {
  // `name…` in backticks is a test-title prefix; a renamed test would leave the skill pointing at nothing.
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const corpus = walk("tests/unit").filter((f) => /\.(mjs|js|cjs)$/.test(f)).map(read).join("\n");
  const missing = [];
  for (const f of walk(".claude/skills/season-mode").filter((x) => x.endsWith(".md"))) {
    for (const m of read(f).matchAll(/`([^`\n]{12,}?)…`/g)) if (!corpus.includes(m[1])) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});
