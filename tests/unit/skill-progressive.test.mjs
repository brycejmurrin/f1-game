// Progressive skill disclosure — fat SKILL.md bodies burn tokens when attached.
// mcp-probe is the template: thin index + references/ for traps and recipes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, ".claude/skills/mcp-probe");

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
