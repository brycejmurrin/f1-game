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
import { spawnSync } from "node:child_process";
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
  // Measured 2026-08-17 then split. A revert that pastes the catalog back
  // into SKILL.md would pass the 500-line ceiling and still burn tokens.
  const splits = [
    ["survey-ui-matrix", "references/probes.md"],
    ["survey-ui-matrix", "references/setup.md"],
    ["agent-view", "references/surface.md"],
    ["playwright-probe", "references/recipes.md"],
    ["restructure-screens-css", "references/rules.md"],
    ["multiplayer-debug", "references/workflow.md"],
    ["career-mode", "references/workflow.md"],
    ["race-incidents-control", "references/workflow.md"],
    ["new-track", "references/workflow.md"],
    ["webgl-debug", "references/failures.md"],
    ["garage-parts-livery", "references/workflow.md"],
    ["lighting-tuner", "references/symptoms.md"],
    ["tune-physics", "references/harness.md"],
    ["car-viewer", "references/presets.md"],
    ["scene-graph-instancing", "references/workflow.md"],
    ["audio-debug", "references/diagnose.md"],
    ["survey-track", "references/loop.md"],
    ["pwa-cache-service-worker", "references/workflow.md"],
    ["asset-pack", "references/workflow.md"],
    ["ui-menu-a11y", "references/workflow.md"],
    ["check-changes", "references/guards.md"],
    ["webgpu-debug", "references/defects.md"],
    ["bake-lighting", "references/steps.md"],
    ["scenery-dress", "references/rules.md"],
    ["game-feel", "references/workflow.md"],
    ["debug-cameras", "references/framing.md"],
    ["debug-tracks", "references/sweeps.md"],
    ["motion-capture", "references/traps.md"],
    ["perf-profile", "references/flame.md"],
    ["debug-state", "references/hooks.md"],
    ["deploy-merge", "references/protocol.md"],
    ["css-play", "references/loop.md"],
    ["slim-bloat", "references/do-not.md"],
    ["slim-bloat", "references/carves.md"],
  ];
  for (const [name, ref] of splits) {
    const skill = fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8");
    assert.ok(skill.split("\n").length <= 180, `${name} SKILL.md grew back past 180`);
    assert.match(skill, new RegExp(ref.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(SKILLS, name, ref)), `${name} lost ${ref}`);
  }
});

test("skills do not recommend the retired test:career group", () => {
  // career + quali + season + TT live in `test:modes`. `test-bg.mjs career`
  // exits 2 (unknown group). Saying "there is no test:career" is the warning.
  const dirs = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory());
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const text = fs.readFileSync(p, "utf8");
        if (/test-bg\.mjs career\b/.test(text) || /npm run test:career\b/.test(text))
          bad.push(path.relative(ROOT, p));
      }
    }
  };
  for (const d of dirs) walk(path.join(SKILLS, d.name));
  assert.deepEqual(bad, [], "use `test-bg.mjs modes` — there is no test:career");
});

test("skills only name real test-bg groups", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const groups = new Set(
    Object.keys(pkg.scripts).filter((k) => k.startsWith("test:")).map((k) => k.slice(5)),
  );
  const flags = new Set(["--status", "--stop", "--wait", "--force", "--json"]);
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const text = fs.readFileSync(p, "utf8");
        for (const m of text.matchAll(/test-bg\.mjs((?:[ \t]+(?:--[a-z]+|[a-z][a-z0-9-]*))+)/g)) {
          for (const tok of m[1].trim().split(/[ \t]+/)) {
            if (flags.has(tok) || groups.has(tok)) continue;
            bad.push(`${path.relative(ROOT, p)}: ${tok}`);
          }
        }
      }
    }
  };
  walk(SKILLS);
  walk(AGENTS);
  assert.deepEqual(bad, [], "unknown test-bg group (barriers, career, …) — use a package.json test:* name");
});

test("wgx-validate Usage lists --static as the no-browser gate", () => {
  const text = fs.readFileSync(path.join(ROOT, "tools/wgx-validate.mjs"), "utf8");
  const usage = text.match(/Usage:[\s\S]*?\n\/\/\n\/\/ PASS/);
  assert.ok(usage, "could not find the Usage block in tools/wgx-validate.mjs");
  assert.match(usage[0], /wgx-validate\.mjs --static/);
  assert.match(usage[0], /parent session only/);
});

test("verify-agent stays --fast and never starts Playwright", () => {
  const text = fs.readFileSync(path.join(AGENTS, "verify-agent.md"), "utf8");
  assert.match(text, /verify-change\.mjs --fast/);
  assert.match(text, /wgx-validate\.mjs --static/);
  assert.doesNotMatch(text, /test-solo\.mjs/);
  assert.doesNotMatch(text, /verify-change\.mjs --wait/);
});

test("every custom subagent declares name, description, and model", () => {
  // Cursor subagent docs (https://cursor.com/docs/subagents, Context7 2026-08-17):
  // name + description required; model: inherit (or a model id) so a subagent
  // does not silently pick a different model; readonly / is_background optional.
  const files = fs.readdirSync(AGENTS).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(files.length >= 7,
    "expected deploy-research, verify-agent, track-surveyor, plus doc-drift / physics-contract / worktree-regression / bloat-auditor");
  for (const f of files) {
    const text = fs.readFileSync(path.join(AGENTS, f), "utf8");
    const fm = frontmatter(text);
    const id = f.replace(/\.md$/, "");
    assert.equal(fm.name, id, `${f}: name must match the filename`);
    assert.ok(fm.description, `${f}: description is required`);
    assert.ok(fm.model, `${f}: model is required (use inherit unless a specific model is justified)`);
  }
});

test("review-pass contracts: no stale commands or steal phrases", () => {
  // 2026-08-17 review: these phrases sent agents down the wrong tool.
  const triage = fs.readFileSync(path.join(SKILLS, "test-timeout-triage/SKILL.md"), "utf8");
  assert.doesNotMatch(triage, /ONE browser group per batch \(`tools\/test-bg\.mjs`/);
  assert.doesNotMatch(triage, /test-bg\.mjs[\s\S]{0,40}enforces the cap/);
  assert.match(triage, /verify-change/);

  const walkMd = (dir, fn) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkMd(p, fn);
      else if (e.name.endsWith(".md")) fn(p, fs.readFileSync(p, "utf8"));
    }
  };
  const apexGfx = [];
  walkMd(SKILLS, (p, text) => {
    if (/apex-eval\.mjs[^\n]*APEX_GFX=/.test(text)) apexGfx.push(path.relative(ROOT, p));
  });
  assert.deepEqual(apexGfx, [], "apex-eval.mjs only parses <track> <expr> --raw; APEX_GFX= as argv is ignored");

  const pw = fs.readFileSync(path.join(SKILLS, "playwright-probe/SKILL.md"), "utf8");
  assert.doesNotMatch(pw, /exercise __apex hooks/);

  const nt = frontmatter(fs.readFileSync(path.join(SKILLS, "new-track/SKILL.md"), "utf8"));
  assert.doesNotMatch(nt.description, /troubleshoot an Apex 26 track build/);
  assert.doesNotMatch(nt.description, /fix corners/);

  const dm = frontmatter(fs.readFileSync(path.join(SKILLS, "deploy-merge/SKILL.md"), "utf8"));
  assert.doesNotMatch(dm.description, /verifying a live GitHub Pages deploy/);

  const ds = frontmatter(fs.readFileSync(path.join(SKILLS, "debug-state/SKILL.md"), "utf8"));
  assert.doesNotMatch(ds.description, /debug understeer/);

  const gl = frontmatter(fs.readFileSync(path.join(SKILLS, "webgl-debug/SKILL.md"), "utf8"));
  assert.match(gl.description, /black|blank|dark/i);

  const cc = frontmatter(fs.readFileSync(path.join(SKILLS, "check-changes/SKILL.md"), "utf8"));
  assert.match(cc.description, /test-timeout-triage|timeout/);

  const career = fs.readFileSync(path.join(SKILLS, "career-mode/SKILL.md"), "utf8");
  assert.match(career, /upgradeBudget\(\).*career\.js/);
  assert.doesNotMatch(career, /upgradeBudget\(\) in `js\/game\/career-ui\.js`/);
});

test("coverage skills exist for input, season, data-hub, and AI", () => {
  for (const name of ["input-controls", "season-mode", "data-hub", "ai-racecraft"]) {
    const file = path.join(SKILLS, name, "SKILL.md");
    assert.ok(fs.existsSync(file), `missing .claude/skills/${name}/SKILL.md`);
    const text = fs.readFileSync(file, "utf8");
    const fm = frontmatter(text);
    assert.equal(fm.name, name);
    assert.match(fm.description, /Use (when|it when|proactively)/);
    assert.ok(text.split("\n").length <= 180, `${name} SKILL.md must stay a thin index`);
  }
  const input = fs.readFileSync(path.join(SKILLS, "input-controls/SKILL.md"), "utf8");
  assert.match(input, /test-bg\.mjs steering/);
  assert.match(input, /tune-physics/);
  const season = fs.readFileSync(path.join(SKILLS, "season-mode/SKILL.md"), "utf8");
  assert.match(season, /Tracks\.SEASON/);
  assert.match(season, /test-bg\.mjs modes/);
  const data = fs.readFileSync(path.join(SKILLS, "data-hub/SKILL.md"), "utf8");
  assert.match(data, /innerHTML/);
  assert.match(data, /test-bg\.mjs api/);
  const ai = fs.readFileSync(path.join(SKILLS, "ai-racecraft/SKILL.md"), "utf8");
  assert.match(ai, /ai-drive\.js/);
  assert.match(ai, /tune-physics/);
});

test("readonly review agents stay --fast and never start Playwright", () => {
  for (const id of ["doc-drift-auditor", "physics-contract-auditor", "worktree-regression-check", "bloat-auditor"]) {
    const file = path.join(AGENTS, `${id}.md`);
    assert.ok(fs.existsSync(file), `missing .claude/agents/${id}.md`);
    const text = fs.readFileSync(file, "utf8");
    const fm = frontmatter(text);
    assert.equal(fm.name, id);
    assert.equal(fm.readonly, "true", `${id} must be readonly`);
    assert.equal(fm.model, "inherit");
    assert.doesNotMatch(text, /verify-change\.mjs --wait/);
    assert.doesNotMatch(text, /test-solo\.mjs/);
    assert.doesNotMatch(text, /npx playwright test/);
  }
  const phys = fs.readFileSync(path.join(AGENTS, "physics-contract-auditor.md"), "utf8");
  assert.match(phys, /vstd-lint/);
  assert.match(phys, /AI-only/);
  const wt = fs.readFileSync(path.join(AGENTS, "worktree-regression-check.md"), "utf8");
  assert.match(wt, /verify-change\.mjs --fast/);
  const drift = fs.readFileSync(path.join(AGENTS, "doc-drift-auditor.md"), "utf8");
  assert.match(drift, /DOC-DRIFT/);
  const bloat = fs.readFileSync(path.join(AGENTS, "bloat-auditor.md"), "utf8");
  assert.match(bloat, /BLOAT/);
  assert.match(bloat, /bloat-scan\.mjs/);
  assert.match(bloat, /NEVER start[\s\S]*chrome-start/);
  assert.match(bloat, /NEVER start[\s\S]*apex-eval\.mjs/);
  assert.doesNotMatch(bloat, /python3 tools\/probe-mcp\.py chrome-start/);
  assert.doesNotMatch(bloat, /node tools\/apex-eval/);
});

test("do not grow a parallel Cursor skills or agents tree", () => {
  // Cursor loads .claude/skills and .claude/agents. A second tree under
  // .cursor/ is the drift this repo already paid for with CLAUDE.md vs AGENTS.md.
  // Allowlist: a file that is explicitly Cursor-only may live there; none do.
  for (const rel of [".cursor/skills", ".cursor/agents"]) {
    assert.equal(
      fs.existsSync(path.join(ROOT, rel)),
      false,
      `${rel} exists — keep skills/agents in .claude/ unless the file is Cursor-only`,
    );
  }
});

test("apex-shared.mdc stays a pointer, not a second AGENTS.md", () => {
  const file = path.join(ROOT, ".cursor/rules/apex-shared.mdc");
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n").length;
  assert.ok(lines <= 40,
    `.cursor/rules/apex-shared.mdc is ${lines} lines — keep it a pointer (cap 40)`);
  assert.match(text, /AGENTS\.md/);
  assert.match(text, /deploy-research/);
  assert.match(text, /verify-agent/);
  assert.match(text, /mcp-probe/);
  assert.match(text, /tinyfish-mcp\.sh|probe-mcp\.py/);
  assert.match(text, /apex-tools-mcp\.sh/);
  assert.match(text, /does \*\*not\*\* auto-load|does not auto-load/i);
});

test("file-family skills declare Cursor paths; cross-cutting skills do not", () => {
  // Cursor skills.md (2026): `paths` hides a skill unless matching files are in
  // play. Cross-cutting workflows must stay unset so they still match from chat.
  const scoped = {
    "webgpu-debug": /js\/render\/webgpu/,
    "webgl-debug": /js\/render\/glx/,
    "new-track": /js\/circuits/,
    "scenery-dress": /js\/circuits/,
  };
  for (const [name, re] of Object.entries(scoped)) {
    const fm = frontmatter(fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8"));
    assert.ok(fm.paths, `${name}: missing paths frontmatter`);
    assert.match(fm.paths, re, `${name}: paths ${fm.paths} should match ${re}`);
  }
  for (const name of ["check-changes", "bump-cache", "deploy-merge", "mcp-probe", "playwright-probe", "slim-bloat"]) {
    const fm = frontmatter(fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8"));
    assert.equal(fm.paths, undefined, `${name} is cross-cutting — leave paths unset`);
  }
});

test("check-changes names the apex-tools MCP wrap", () => {
  const text = fs.readFileSync(path.join(SKILLS, "check-changes/SKILL.md"), "utf8");
  assert.match(text, /apex-tools-mcp\.sh/);
  assert.match(text, /apex_verify_change_fast/);
  assert.match(text, /AGENT-SURFACE\.md/);
});

test("skills README and AGENTS.md point at the wrap map", () => {
  const skills = fs.readFileSync(path.join(SKILLS, "README.md"), "utf8");
  const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  assert.match(skills, /AGENT-SURFACE\.md/);
  assert.match(agents, /AGENT-SURFACE\.md/);
  assert.match(skills, /A skill is when\/how/);
});

test("AGENTS.md points at mcp-probe recipes for renderer probes", () => {
  const text = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  assert.match(text, /mcp-probe\/references\/recipes\.md/);
  assert.doesNotMatch(text, /mcp-probe\/SKILL\.md[^\n]*Probing a specific renderer/);
});

test("css-play names the css-play CLI and Playwright DOM commands", () => {
  const text = fs.readFileSync(path.join(SKILLS, "css-play/SKILL.md"), "utf8");
  assert.match(text, /css-play\.mjs/);
  assert.match(text, /playwright-mcp\.sh/);
  assert.match(text, /#game/);
  assert.match(text, /bump-cache/);
  assert.match(text, /hot-swap|hot.swap/i);
});

test("survey-ui-matrix names the layout-audit CLI recipes", () => {
  const text = fs.readFileSync(path.join(SKILLS, "survey-ui-matrix/SKILL.md"), "utf8");
  assert.match(text, /layout-audit\.mjs/);
  assert.match(text, /--gallery|--survey/);
  assert.match(text, /npm run ui:survey/);
});

test("webgpu-debug names wgx-shot --gallery for multi-track frames", () => {
  const text = fs.readFileSync(path.join(SKILLS, "webgpu-debug/SKILL.md"), "utf8");
  assert.match(text, /wgx-shot\.mjs --gallery/);
  assert.match(text, /wgx:gallery/);
});

test("skills README uses content-hash cache busting, not ?v=N", () => {
  const text = fs.readFileSync(path.join(SKILLS, "README.md"), "utf8");
  assert.match(text, /\?v=<sha256>/);
  assert.doesNotMatch(text, /\?v=N\b/);
});

test("wgx-capture pairs with webgpu-debug in tools/README.md", () => {
  const text = fs.readFileSync(path.join(ROOT, "tools/README.md"), "utf8");
  const row = text.split("\n").find((l) => l.includes("wgx-capture.mjs"));
  assert.ok(row, "tools/README.md lost the wgx-capture.mjs row");
  assert.match(row, /webgpu-debug/);
  assert.doesNotMatch(row, /webgl-debug/);
});

test("slim-bloat is the Claude-simplify analog and stays a thin index", () => {
  const skill = fs.readFileSync(path.join(SKILLS, "slim-bloat/SKILL.md"), "utf8");
  const fm = frontmatter(skill);
  assert.equal(fm.name, "slim-bloat");
  assert.match(fm.description, /Use when/i);
  assert.match(fm.description, /bloat|dead|extract|split/i);
  assert.ok(skill.split("\n").length <= 180, "slim-bloat SKILL.md must stay a thin index");
  assert.match(skill, /bloat-auditor/);
  assert.match(skill, /bloat-scan\.mjs/);
  assert.match(skill, /extract-module\.mjs/);
  assert.match(skill, /mcp-probe|Context7|context7/i);
  assert.doesNotMatch(skill, /npx playwright test/);
  const doNot = fs.readFileSync(path.join(SKILLS, "slim-bloat/references/do-not.md"), "utf8");
  assert.match(doNot, /PACE|vTop|vStd|aStd/);
  assert.match(doNot, /IIFE|ES module/i);
  assert.match(doNot, /updateCar|render\(\)/);
  assert.match(doNot, /bug-explaining/);
  const carves = fs.readFileSync(path.join(SKILLS, "slim-bloat/references/carves.md"), "utf8");
  assert.match(carves, /manifest\.cjs/);
  assert.match(carves, /bump-cache/);
  assert.match(carves, /Module\.create/);
});

test("bloat-scan reports ratchet slack and skill sizes as JSON", () => {
  const r = spawnSync(process.execPath, ["tools/bloat-scan.mjs", "--json"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  const game = j.files.find((f) => f.path === "js/game.js");
  assert.ok(game, "scan missed js/game.js");
  assert.equal(game.kind, "ratchet");
  assert.ok(Number.isInteger(game.lines) && game.lines > 0);
  assert.ok(Number.isInteger(game.ceiling) && game.ceiling >= game.lines);
  const skill = j.files.find((f) => f.path === ".claude/skills/slim-bloat/SKILL.md");
  assert.ok(skill, "scan missed slim-bloat SKILL.md");
  assert.equal(skill.kind, "skill");
});
