// Progressive skill disclosure — fat SKILL.md bodies burn tokens when attached.
// mcp-probe is the template: thin index + references/ for traps and recipes.
//
// Caps and frontmatter rules come from the official Agent Skills docs
// (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices,
// queried 2026-08-17 via Context7): SKILL.md body under 500 lines; name is
// lowercase/hyphens and matches the folder; description is third-person and
// states BOTH what the skill does AND when to use it. Cursor subagent docs
// require name + description + model (inherit | a model id).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS = path.join(ROOT, ".claude/skills");
const AGENTS = path.join(ROOT, ".claude/agents");
const MCP = path.join(SKILLS, "mcp-probe");

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, "missing YAML frontmatter");
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
};

test("mcp-probe SKILL.md stays a thin index (not the war-story dump)", () => {
  const skill = fs.readFileSync(path.join(MCP, "SKILL.md"), "utf8");
  const lines = skill.split("\n").length;
  assert.ok(lines <= 120,
    `mcp-probe/SKILL.md is ${lines} lines — move traps/recipes to references/ (cap 120)`);
  assert.match(skill, /references\/traps\.md/);
  assert.match(skill, /references\/recipes\.md/);
});

test("mcp-probe references keep the measured traps and recipes", () => {
  const traps = fs.readFileSync(path.join(MCP, "references/traps.md"), "utf8");
  const recipes = fs.readFileSync(path.join(MCP, "references/recipes.md"), "utf8");
  assert.match(traps, /never render in the MCP browser while Playwright/);
  assert.match(traps, /snapCam/);
  assert.match(recipes, /tinyfish|deploy-check/);
  assert.match(recipes, /Probing a specific renderer|secure context|navigator\.gpu/i);
});

test("every skill: name matches folder, description has a trigger, body ≤ 500 lines", () => {
  // Official Agent Skills cap is 500 lines (progressive disclosure). The
  // project template is thinner (mcp-probe ≤ 120); this test holds the
  // published ceiling so a skill cannot silently become a token dump.
  const dirs = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory());
  const fat = [];
  for (const d of dirs) {
    const file = path.join(SKILLS, d.name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const fm = frontmatter(text);
    assert.equal(fm.name, d.name, `${d.name}: frontmatter name must match the folder`);
    assert.ok(fm.description, `${d.name}: description is required`);
    assert.ok(fm.description.length <= 1024, `${d.name}: description over 1024 chars`);
    assert.match(fm.description, /Use (when|it when|proactively)/,
      `${d.name}: description must say when to load the skill (official: what + when)`);
    const lines = text.split("\n").length;
    if (lines > 500) fat.push(`${d.name} (${lines})`);
  }
  assert.deepEqual(fat, [], "SKILL.md over the official 500-line cap — split into references/");
});

test("previously-fat skills stay split (index + references/)", () => {
  // Measured 2026-08-17 then split: survey-ui-matrix 389, agent-view 298,
  // playwright-probe 200, restructure-screens-css 209, multiplayer-debug 193,
  // career-mode 176. A revert that pastes the catalog back into SKILL.md
  // would pass the 500-line ceiling and still burn tokens.
  const splits = [
    ["survey-ui-matrix", "references/probes.md"],
    ["agent-view", "references/surface.md"],
    ["playwright-probe", "references/recipes.md"],
    ["restructure-screens-css", "references/rules.md"],
    ["multiplayer-debug", "references/workflow.md"],
    ["career-mode", "references/workflow.md"],
  ];
  for (const [name, ref] of splits) {
    const skill = fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8");
    assert.ok(skill.split("\n").length <= 180, `${name} SKILL.md grew back past 180`);
    assert.match(skill, new RegExp(ref.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(SKILLS, name, ref)), `${name} lost ${ref}`);
  }
});

test("every custom subagent declares name, description, and model", () => {
  // Cursor subagent docs (https://cursor.com/docs/subagents, Context7 2026-08-17):
  // name + description required; model: inherit (or a model id) so a subagent
  // does not silently pick a different model; readonly / is_background optional.
  const files = fs.readdirSync(AGENTS).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(files.length >= 3, "expected deploy-research, verify-agent, track-surveyor");
  for (const f of files) {
    const text = fs.readFileSync(path.join(AGENTS, f), "utf8");
    const fm = frontmatter(text);
    const id = f.replace(/\.md$/, "");
    assert.equal(fm.name, id, `${f}: name must match the filename`);
    assert.ok(fm.description, `${f}: description is required`);
    assert.ok(fm.model, `${f}: model is required (use inherit unless a specific model is justified)`);
  }
});
