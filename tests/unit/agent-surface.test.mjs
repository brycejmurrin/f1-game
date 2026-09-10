// agent-surface.test.mjs — lockstep the wrap map to the MCP catalog + skills.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOC = path.join(ROOT, "docs/AGENT-SURFACE.md");
const CATALOG = path.join(ROOT, "tools/mcp/apex-tools-mcp.json");
const SKILLS = path.join(ROOT, ".claude/skills");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function parseTable(text, marker) {
  const i = text.indexOf(marker);
  assert.ok(i >= 0, `docs/AGENT-SURFACE.md missing ${marker}`);
  const rows = [];
  for (const line of text.slice(i).split("\n").slice(1)) {
    if (!line.startsWith("|")) {
      if (rows.length) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!cells[0] || /^[-:]+$/.test(cells[0]) || cells[0] === "MCP tool"
      || cells[0] === "CLI / action") continue;
    rows.push(cells);
  }
  assert.ok(rows.length > 0, `${marker} table is empty`);
  return rows;
}

function stripTick(s) {
  return String(s || "").replace(/^`|`$/g, "");
}

test("wrap map names match tools/mcp/apex-tools-mcp.json", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const wrap = parseTable(doc, "<!-- WRAP-MAP -->");
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const mapped = wrap.map((r) => stripTick(r[0])).sort();
  const listed = [...catalog.tools].sort();
  assert.deepEqual(mapped, listed, "AGENT-SURFACE wrap table drifted from apex-tools-mcp.json");
});

test("every wrap row has a real CLI (or built-in) and a real skill", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const wrap = parseTable(doc, "<!-- WRAP-MAP -->");
  const missing = [];
  for (const [mcp, cliRaw, kind, skillRaw] of wrap) {
    assert.match(stripTick(mcp), /^apex_/, `${mcp} is not an apex_* name`);
    assert.match(kind, /^(tree|browser)$/, `${mcp} kind must be tree|browser`);
    const cli = stripTick(cliRaw);
    if (cli !== "built-in") {
      const file = path.join(ROOT, "tools", cli);
      if (!fs.existsSync(file)) missing.push(`${mcp} CLI ${cli}`);
    }
    const skill = stripTick(skillRaw);
    assert.notEqual(skill, "—", `${mcp} wrap row must name a skill`);
    assert.notEqual(skill, "-", `${mcp} wrap row must name a skill`);
    const dir = path.join(SKILLS, skill);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) missing.push(`${mcp} skill ${skill}`);
  }
  assert.deepEqual(missing, [], "wrap map points at a missing CLI or skill");
});

test("server table names the three attached servers and the four that left", () => {
  const doc = read("docs/AGENT-SURFACE.md");
  for (const name of ["apex-tools", "chrome-devtools", "playwright-official"]) {
    assert.match(doc, new RegExp(`\\*\\*${name}\\*\\*`), `AGENT-SURFACE.md must name **${name}**`);
  }
  // Removed 2026-09 — still documented as CLI-only so nobody re-adds them blind.
  for (const gone of ["probe", "tinyfish", "chrome-devtools-official"]) {
    assert.match(doc, new RegExp(`\\*\\*${gone}\\*\\*`), `AGENT-SURFACE.md must explain why **${gone}** left`);
  }
  assert.match(doc, /browser_\*/);
  assert.match(doc, /playwright-mcp\.sh/);
  assert.match(doc, /probe-mcp\.py chrome-start/);
  assert.match(doc, /deploy-research/);
  const cfg = JSON.parse(read(".mcp.json"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
  const cursor = JSON.parse(read(".cursor/mcp.json"));
  assert.deepEqual(cursor, cfg, ".cursor/mcp.json must lockstep .mcp.json");
});

test("wrap map is exactly the ten kept wraps", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  assert.equal(catalog.tools.length, 10,
    "30 → 12 on 2026-09, then 12 → 10 on 2026-09-03 when apex_gfx_probe and " +
    "apex_wgx_validate_static left with the WGX/TLX spike-out (their CLIs are in " +
    "tools/gfx/ now); grow it on purpose, in the doc too");
});

test("never-wrap table names the load-bearing refuses", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const never = parseTable(doc, "<!-- NEVER-WRAP -->")
    .map((r) => r.join(" "))
    .join("\n");
  for (const need of [
    "test-bg.mjs",
    "verify-change.mjs",
    "--fast",
    "bump-cache.mjs --apply",
    "github.io",
    "tinyfish",
  ]) {
    assert.match(never, new RegExp(need.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `never-wrap table must name ${need}`);
  }
});

test("mcp-smoke is a CLI, not an apex_* wrap", () => {
  const doc = read("docs/AGENT-SURFACE.md");
  assert.match(doc, /mcp-smoke/);
  assert.match(read("tools/README.md"), /mcp-smoke\.mjs/);
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  assert.ok(!catalog.tools.includes("apex_mcp_smoke"));
  assert.ok(!catalog.tools.includes("apex_smoke"));
});

test("indexes point at AGENT-SURFACE.md", () => {
  const need = [
    "AGENTS.md",
    "docs/README.md",
    ".claude/skills/README.md",
    "tools/README.md",
    "docs/research/APEX-TOOLS-MCP.md",
    ".claude/skills/check-changes/SKILL.md",
    ".claude/skills/mcp-probe/SKILL.md",
    ".claude/agents/README.md",
    ".cursor/rules/apex-shared.mdc",
  ];
  const missing = need.filter((rel) => !read(rel).includes("AGENT-SURFACE.md"));
  assert.deepEqual(missing, [], "an index lost the AGENT-SURFACE.md pointer");
});

test("bootstrap contract is documented for Cloud + desktop", () => {
  const doc = read("docs/AGENT-SURFACE.md");
  assert.match(doc, /^## Bootstrap \(auto-setup\)/m);
  assert.match(doc, /\.cursor\/environment\.json/);
  assert.match(doc, /Integrations & MCP/);
  assert.match(doc, /\.agents\/skills/);
  assert.match(doc, /Codex/);
  const agents = read("AGENTS.md");
  assert.match(agents, /^## Cursor Cloud specific instructions/m);
  assert.match(agents, /mcpServerAllowlist/);
  assert.match(agents, /\.agents\/skills/);
  assert.match(read("CLAUDE.md"), /@AGENTS\.md/);
});

test("Codex skill mirror locksteps .claude/skills via symlinks", () => {
  const claude = path.join(ROOT, ".claude/skills");
  const codex = path.join(ROOT, ".agents/skills");
  assert.ok(fs.existsSync(codex), ".agents/skills missing — Codex will not see project skills");
  const names = fs.readdirSync(claude).filter((n) => {
    try { return fs.statSync(path.join(claude, n)).isDirectory(); }
    catch { return false; }
  }).sort();
  const mirrored = fs.readdirSync(codex).sort();
  assert.deepEqual(mirrored, names, ".agents/skills must mirror every .claude/skills dir");
  const broken = [];
  for (const name of names) {
    const link = path.join(codex, name);
    const st = fs.lstatSync(link);
    if (!st.isSymbolicLink()) {
      broken.push(`${name} is not a symlink`);
      continue;
    }
    const target = fs.readlinkSync(link);
    if (target !== `../../.claude/skills/${name}`) {
      broken.push(`${name} → ${target} (want ../../.claude/skills/${name})`);
    }
    if (!fs.existsSync(path.join(link, "SKILL.md"))) {
      broken.push(`${name} does not resolve to SKILL.md`);
    }
  }
  assert.deepEqual(broken, [], "Codex skill mirror broken");
});

test("Codex .codex/config.toml MCP servers lockstep .mcp.json", () => {
  const cfg = JSON.parse(read(".mcp.json"));
  const toml = read(".codex/config.toml");
  assert.match(toml, /trusted/i);
  const names = Object.keys(cfg.mcpServers).sort();
  assert.deepEqual(names, ["apex-tools", "chrome-devtools", "playwright-official"]);
  for (const name of names) {
    assert.match(toml, new RegExp(`\\[mcp_servers\\.${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]`),
      `.codex/config.toml missing [mcp_servers.${name}]`);
    const srv = cfg.mcpServers[name];
    assert.match(toml, new RegExp(`command\\s*=\\s*"${srv.command}"`),
      `${name} command must match .mcp.json`);
    for (const arg of srv.args) {
      assert.match(toml, new RegExp(`"${arg.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`),
        `${name} args must include ${arg}`);
    }
  }
  assert.match(read("docs/AGENT-SURFACE.md"), /\.codex\/config\.toml/);
  assert.match(read("AGENTS.md"), /\.codex\/config\.toml/);
});

test("MCP descriptions state tree vs browser", () => {
  const src = read("tools/mcp/apex-tools-mcp.mjs");
  assert.match(src, /docs\/AGENT-SURFACE\.md/);
  const doc = fs.readFileSync(DOC, "utf8");
  const wrap = parseTable(doc, "<!-- WRAP-MAP -->");
  for (const [mcp, , kind] of wrap) {
    const name = stripTick(mcp);
    const prefix = kind === "browser" ? "Browser \\(lock first\\)" : "Tree";
    assert.match(src, new RegExp(`name: "${name}"[\\s\\S]{0,240}description: "${prefix}`),
      `${name} description must start with ${kind === "browser" ? "Browser (lock first)" : "Tree"}`);
  }
});
