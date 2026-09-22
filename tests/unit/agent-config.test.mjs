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
    // 2026-09-22: the two bypasses a review reproduced — a shell -c wrapper
    // and an absolute path — plus the wrapper-and-path combination.
    'sh -c "pkill -f chrome"',
    "bash -lc 'pkill -f chrome'",
    "/usr/bin/pkill -f chrome",
    "env /usr/bin/pkill -9 -f node",
    "sh -c 'echo hi; pkill -f chrome'",
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
    "git commit -F - <<'MSG'\nthe guard now covers a pgrep -f list piped into xargs kill\nMSG",
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
    "node tools/ci/test-solo.mjs tests/specs/autopilot.spec.js",
    "python3 tools/mcp/probe-mcp.py chrome-start",
  ];
  const nodeOnly = [
    "node tools/ci/test-bg.mjs --status",
    "node tools/ci/verify-change.mjs --fast --json",
    "npm run test:tooling-fast",
    "node --test tests/unit/ratchets.test.mjs",
    "node tools/track/verify-track.cjs monza",
  ];
  for (const cmd of browser) assert.equal(run(cmd, true).status, 2, `a subagent must not run: ${cmd}`);
  for (const cmd of nodeOnly) assert.equal(run(cmd, true).status, 0, `a subagent may run: ${cmd}`);
  for (const cmd of browser) assert.equal(run(cmd, false).status, 0, `the main session may run: ${cmd}`);
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
  assert.ok(agents <= 75,
    `AGENTS.md carries ~${agents} rule-bearing lines (budget 75) — promote one to a hook or a test, or delete it`);

  // Skill DESCRIPTIONS are always loaded for routing, so they are part of the
  // same budget even though the bodies are not (progressive disclosure).
  const skills = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(`.claude/skills/${d.name}/SKILL.md`));
  let descWords = 0;
  for (const d of skills) {
    const { fm } = stripFrontmatter(read(`.claude/skills/${d.name}/SKILL.md`));
    descWords += fm.split(/\s+/).filter(Boolean).length;
  }
  assert.ok(descWords <= 1600,
    `${skills.length} skill descriptions cost ~${descWords} always-on words (budget 1600) — tighten one, or retire a skill`);
});

// ── A MEMORY STORE THAT CANNOT EXPIRE IS A RATCHET ──────────────────────────
// .claude/agent-memory/<name>/ is the one memory store that survives here: it is
// in the repo and tracked (!.claude/agent-memory/ in .gitignore), unlike Claude
// Code's auto memory under ~/.claude, which a fresh cloud container wipes every
// session. Because it is written by an agent and read by later agents, it is the
// exact shape the literature warns about — arXiv 2607.24300 measured agents
// scoring their own work at >=0.70 while 15 of 35 runs fell below a random
// baseline. verify-agent's seed already answers this ("an entry older than the
// merge-base is re-verified, not trusted"); this makes that property a rule
// rather than a habit, for every store that gets added later.
test("every agent-memory store declares its schema and how an entry expires", () => {
  const dir = path.join(ROOT, ".claude/agent-memory");
  if (!fs.existsSync(dir)) return;                    // no stores yet is fine
  const stores = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(stores.length > 0, "an empty .claude/agent-memory/ should not be committed");
  for (const s of stores) {
    const rel = `.claude/agent-memory/${s.name}/MEMORY.md`;
    assert.ok(exists(rel), `${s.name} has a memory dir but no MEMORY.md index`);
    const text = read(rel);
    // A schema: the store says what ONE entry looks like, so entries stay
    // comparable and a later agent can tell a real record from a musing.
    assert.ok(/`[^`]*—[^`]*`/.test(text),
      `${rel} states no entry schema — a store without one accumulates prose`);
    // An expiry/distrust rule: something that makes an old entry stop counting.
    assert.ok(/re-verif|expire|stale|older than|no longer|re-check|recheck/i.test(text),
      `${rel} names no way for an entry to stop being believed — that is the ratchet arXiv 2608.11095 measures`);
    // The agent that owns it must actually declare the memory, or the file is
    // decoration that nothing reads.
    const agent = `.claude/agents/${s.name}.md`;
    assert.ok(exists(agent), `${rel} has no owning subagent at ${agent}`);
    assert.match(read(agent), /^memory:\s*(user|project|local)\s*$/m,
      `${s.name} has a memory store but its frontmatter never declares memory:`);
  }
});
