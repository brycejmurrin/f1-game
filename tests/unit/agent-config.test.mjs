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
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const stripFrontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  return { fm: m ? m[1] : "", body: m ? text.slice(m[0].length) : text };
};

test("AGENTS.md stays under 200 lines and emphasises at most one line", () => {
  // Claude Code memory docs: "target under 200 lines per CLAUDE.md file.
  // Longer files consume more context and reduce adherence." Imports load in
  // full, so the cap applies to the imported file, not the stub.
  const text = read("AGENTS.md");
  const lines = text.trimEnd().split("\n").length;
  assert.ok(lines <= 200, `AGENTS.md is ${lines} lines — move procedure to a skill, evidence to docs/notes/`);
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

test("path-scoped renderer rules exist for Claude Code and Cursor with identical bodies", () => {
  // Claude Code: .claude/rules/<x>.md with `paths:`; Cursor: .cursor/rules/<x>.mdc
  // with `globs:`. Same body, same glob, or the two hosts drift apart.
  for (const name of ["render-wgx", "render-tlx"]) {
    const claude = stripFrontmatter(read(`.claude/rules/${name}.md`));
    const cursor = stripFrontmatter(read(`.cursor/rules/${name}.mdc`));
    assert.equal(cursor.body, claude.body, `${name}: .cursor/rules body drifted from .claude/rules`);
    const paths = claude.fm.match(/paths:\s*\n\s*-\s*"([^"]+)"/);
    assert.ok(paths, `${name}: .claude/rules needs a paths: list`);
    const globs = cursor.fm.match(/globs:\s*(\S+)/);
    assert.ok(globs, `${name}: .cursor/rules needs globs:`);
    assert.equal(globs[1], paths[1], `${name}: paths and globs differ`);
    assert.match(cursor.fm, /alwaysApply:\s*false/);
    // Every js/ or tools/ path a rule cites must exist — the stale
    // wgx-capture path lived in the Cursor copy for weeks.
    for (const m of new Set(claude.body.match(/(?<![\w./-])(?:js|tools|docs)\/[\w./-]+\.(?:js|mjs|cjs|md)/g) || []))
      assert.ok(exists(m), `${name} cites ${m}, which does not exist`);
  }
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
    const rel = c.command.replace(/^"?\$CLAUDE_PROJECT_DIR\//, "").replace(/"$/, "");
    assert.ok(exists(rel), `hook ${rel} is registered but missing`);
    assert.ok(fs.statSync(path.join(ROOT, rel)).mode & 0o111, `hook ${rel} is not executable`);
  }
  assert.ok(Array.isArray(settings.permissions?.allow) && settings.permissions.allow.some((p) => /test:guards|test:\*/.test(p)),
    "the permissions allowlist must pre-approve the guard suite");
  // The rules the hooks enforce say so, and the escape hatch is documented.
  const agents = read("AGENTS.md");
  for (const hook of ["session-start.sh", "protect-files.sh", "bash-guard.sh"])
    assert.ok(agents.includes(hook), `AGENTS.md must name ${hook}`);
  assert.match(agents, /allow-protected/);
  for (const hook of ["protect-files.sh", "bash-guard.sh"])
    assert.match(read(`.claude/hooks/${hook}`), /allow-protected|APEX_SKIP_GUARDS/, `${hook} needs its escape hatch`);
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
  ]) assert.equal(run(cmd).status, 2, `bash-guard must block: ${cmd}`);
  // …and stays out of the way of ordinary work, including a command that only
  // MENTIONS the words outside command position. The heredoc case is not
  // hypothetical: the pgrep rule went in unanchored and blocked the very
  // commit that added it, because the message described what it blocks.
  for (const cmd of [
    "git status",
    "ps -eo pid,comm",
    'echo "pkill -f chrome"',
    "git commit -F - <<'MSG'\nthe guard now covers a pgrep -f list piped into xargs kill\nMSG",
  ]) assert.equal(run(cmd).status, 0, `bash-guard must allow: ${cmd}`);
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
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: pkg, content: current } }).status, 0,
    "a Write that leaves the generated block alone is not the guard's business");
});

test("the commit guard's docs-only fast path keeps its two exclusions", () => {
  // A prose commit runs docs-integrity alone (1.1 s against ~25 s measured
  // 2026-09-16) and, more to the point, never lets --auto-raise stage
  // tests/data/ratchets.json into a commit that changed no code. Both
  // exclusions are the whole safety of it: a GENERATED doc is prose whose
  // source is code (generated-docs must still run), and `git commit -a` stages
  // at commit time, so the staged list the hook reads is not what will be
  // committed. AGENTS.md rule 3 states the rule this encodes.
  const hook = read(".claude/hooks/bash-guard.sh");
  assert.match(hook, /git diff --cached --name-only/, "the fast path must decide on the STAGED paths");
  assert.match(hook, /\^\(docs\/\|\\\.claude\/skills\/\|\\\.claude\/agents\/\)\|\\\.md\$/,
    "the docs-only path set is docs/, skills, agents and *.md — nothing wider");
  for (const gen of ["tools/README.md", "docs/DEBUG-HOOKS.md", "docs/ARCHITECTURE.md", "docs/LIGHTING-TUNER-SLIDERS.md"])
    assert.ok(hook.includes(gen), `${gen} is generated from code; it must fall through to the full guards`);
  assert.match(hook, /--all/, "`git commit -a` stages at commit time: the fast path must not trust the index then");
  assert.match(hook, /node --test tests\/unit\/docs-integrity\.test\.mjs/);
  assert.match(read("AGENTS.md"), /docs-integrity/, "rule 3 must state the docs-only carve-out");
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
