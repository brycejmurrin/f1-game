#!/usr/bin/env node
/**
 * gen-tools-readme.mjs — tools/README.md from each tool's header tags.
 * @doc Generates `tools/README.md` from each tool's `@doc` / `@skill` / `@section` header tags; `--check` fails on drift.
 * @skill check-changes
 *
 * Source of truth is the tool itself. Within the FIRST 15 LINES of every file
 * under tools/ (any comment style — `//`, `/* *`, `#`, a Python docstring, an
 * HTML comment) the generator reads three tags: `@doc` (one line, ≤ 120 chars —
 * the index row; required for every non-JSON file; the long story stays in the
 * header below it), `@skill` (the paired skill or skills, omitted → "—") and
 * `@section` (`runner` places the row in the two-column "Test runner &
 * coverage" table). An over-length `@doc` is truncated to the cap with a
 * warning on stderr, so one long line cannot turn the whole index red.
 *
 * JSON files carry no comment, so their row is DERIVED: "read by" lists the
 * tools and tests that name the file. Underscore-prefixed files are agent
 * scratch (.gitignore) and are not indexed.
 *
 * Rows are GROUPED by subdirectory, from the GROUPS roster below — a tool in a
 * directory that roster does not name fails the generator rather than landing
 * in an unlabelled bucket. The hand prose (intro, conventions) lives in this
 * file as a template; tests/unit/docs-integrity.test.mjs asserts the index both ways
 * (every tool has a row, every row names a tool) and tests/unit/
 * generated-docs.test.mjs asserts `--check` is clean.
 *
 *   node tools/gen/gen-tools-readme.mjs            # write
 *   node tools/gen/gen-tools-readme.mjs --check    # exit 1 when committed ≠ generated
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, emit, isMain } from "./gen-lib.mjs";

export const TARGET = "tools/README.md";
export const DOC_MAX = 120;
export const HEADER_LINES = 15;

const TOOL_EXT = /\.(mjs|cjs|js|sh|py|html)$/;

/** Every indexable file under tools/, relative to tools/, sorted. */
export function walkTools() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith("_") || e.name === "__pycache__" || e.name === "README.md") continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else out.push(r);
    }
  };
  walk(path.join(ROOT, "tools"), "");
  return out.sort();
}

/** Parse the `@tag value` lines out of the first HEADER_LINES lines. */
export function parseHeader(src) {
  const tags = {};
  const head = src.split("\n").slice(0, HEADER_LINES);
  for (const line of head) {
    const m = line.match(/@(doc|skill|section)\s+(.*?)\s*(?:\*\/|-->)?\s*$/);
    if (m && !(m[1] in tags)) tags[m[1]] = m[2].trim();
  }
  return tags;
}

/** Which tools/tests name this data file — the derived "read by" column. */
function readersOf(name, files) {
  const readers = new Set();
  for (const rel of files) {
    if (rel.endsWith(".json")) continue;
    if (fs.readFileSync(path.join(ROOT, "tools", rel), "utf8").includes(name)) readers.add(rel);
  }
  const testsDir = path.join(ROOT, "tests/unit");
  for (const f of fs.readdirSync(testsDir)) {
    if (!f.endsWith(".mjs")) continue;
    if (fs.readFileSync(path.join(testsDir, f), "utf8").includes(name)) readers.add(`tests/unit/${f}`);
  }
  return [...readers].sort();
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

/** The skills that exist. A `@skill` tag naming anything else is drift: eight
 *  tools carried tags for skills that had been merged away or never existed
 *  (`apex-env-setup`, `perf-profile`, `motion-capture`, `gpu-census.yml`,
 *  `debug-state`, `cross-backend-parity`, `scene-graph-instancing`), so the
 *  index sent readers to a workflow they could not open. Validated here rather
 *  than in a test, because the generator is what publishes the name. */
export function liveSkills() {
  const dir = path.join(ROOT, ".claude/skills");
  if (!fs.existsSync(dir)) return null;
  return new Set(fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "SKILL.md")))
    .map((e) => e.name));
}

/** Collect every row; throws with the full list of problems on any defect. */
export function collect() {
  const files = walkTools();
  const SKILLS = liveSkills();
  const problems = [], warnings = [];
  const main = [], runner = [], data = [];
  for (const rel of files) {
    if (rel.endsWith(".json")) {
      data.push({ rel, readers: readersOf(path.basename(rel), files) });
      continue;
    }
    if (!TOOL_EXT.test(rel)) {
      problems.push(`${rel}: unknown extension — teach gen-tools-readme.mjs about it or move the file`);
      continue;
    }
    const tags = parseHeader(fs.readFileSync(path.join(ROOT, "tools", rel), "utf8"));
    if (!tags.doc) {
      problems.push(`${rel}: no \`@doc\` line in its first ${HEADER_LINES} lines`);
      continue;
    }
    let doc = tags.doc;
    if (doc.length > DOC_MAX) {
      warnings.push(`${rel}: @doc is ${doc.length} chars (max ${DOC_MAX}) — truncated in the index; trim the header line`);
      doc = doc.slice(0, DOC_MAX - 1).replace(/\s+\S*$/, "") + "…";
    }
    if (/undefined/.test(doc)) problems.push(`${rel}: @doc contains "undefined"`);
    if (tags.skill && SKILLS) {
      for (const name of tags.skill.split("/").map((x) => x.trim()).filter(Boolean))
        if (!SKILLS.has(name))
          problems.push(`${rel}: \`@skill ${name}\` names no skill under .claude/skills/ — retarget it or drop the tag`);
    }
    const dir = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : "";
    if (!GROUPS.some(([g]) => g === dir))
      problems.push(`${rel}: tools/${dir}/ is not a documented group — add it to GROUPS in gen-tools-readme.mjs or move the file`);
    const row = { rel, doc, skill: tags.skill || "—", section: tags.section || "", dir };
    if (row.section === "runner") runner.push(row);
    else if (row.section) problems.push(`${rel}: unknown @section "${row.section}" (only "runner" exists)`);
    else main.push(row);
  }
  if (problems.length) throw new Error("tools/ header tags:\n  " + problems.join("\n  "));
  return { main, runner, data, warnings };
}

/** The tools/ subdirectories, in reading order, with the one line that says
 *  what belongs in each. A tool in a directory NOT listed here fails the
 *  generator rather than landing in an unlabelled table: the grouping is the
 *  index's whole value, and a silent "misc" bucket is how 160 flat files
 *  happened the first time. Root holds only what every consumer hardcodes. */
export const GROUPS = [
  ["", "Root — the load-order truth and the car studio page; every consumer hardcodes these paths."],
  ["lib", "Shared harnesses and helpers other tools load: the browser+server harness, the two Node-VM harnesses, the output-path contract, the WebGPU flag set."],
  ["ci", "The test runner and the release pipeline: what to run, how to run it in the background, what CI selected, and the deploy."],
  ["check", "Static guards over the source — a red exit here is a defect, not a report."],
  ["gen", "Author-time generation: the generated doc blocks, the shell, and the asset bakes."],
  ["shot", "Headless observation of the running game: framed screenshots, one-expression evals, the agent surface, a CPU profile."],
  ["capture", "Shared Playwright probe helpers and garage/menu capture gates reused by shot tools."],
  ["gfx", "Renderer and GPU probes — GLX, WGX, TLX, and the adapter census."],
  ["track", "Circuit geometry and scenery: the build guard, the baseline-gated audits, the survey and the start-line maths."],
  ["car", "The car and the garage: option sweeps, livery and crest rendering, career economics."],
  ["ui", "Menu geometry and the CSS edit loop, plus the axes (viewport, scale, circuit) they share."],
  ["lighting", "The lighting tuner: A/B harnesses, slider effectiveness, and the batch campaign package."],
  ["mcp", "MCP wrappers and daemons — the repo's own apex_* server, the Chrome DevTools and TinyFish bridges, the phone report pair."],
  ["net", "WebRTC and Nostr end-to-end harnesses plus the local relay and TURN servers."],
  ["env", "Container bootstrap: browsers and the Cursor Cloud install."],
  ["moves", "Move plans read by gen/move-tree.mjs — data, not code."],
];

const INTRO = `# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in \`.claude/skills/\` (which explains when/how
to use them) — this index is the quick map. Run from the repo root. Disposable
output never goes to \`/tmp\`: use \`artifacts/tmp/\` for batch logs/probes and
\`scratch/\` for human-reviewed captures, renders, and profiles.

**Layers:** skill = when; this folder = the CLI; \`apex_*\` MCP = a **pinned**
subset (safe flags only). Which rows are wrapped, and which must stay CLI-only:
[\`docs/AGENT-SURFACE.md\`](../docs/AGENT-SURFACE.md).

**This file is generated** by \`node tools/gen/gen-tools-readme.mjs\` from the
\`@doc\` / \`@skill\` / \`@section\` tags in each tool's header comment (first 15
lines). Edit the tool's header, then regenerate; \`--check\` is the drift gate
(\`tests/unit/generated-docs.test.mjs\`). The long story behind a row stays in
the tool's own header.
`;

const CONVENTIONS = `## Conventions

- **Where a tool goes:** by what it DOES, not by what it is named. The
  directory headings above are the contract — \`gen-tools-readme.mjs\` fails on
  a tool in a group it does not know, so a new tool picks a group or the group
  gets documented. Only what every consumer hardcodes stays at \`tools/\` root.
- **Capture tools are a family:** \`shot/apex-capture.mjs\` is the parallel
  sweep, \`car/carshot.mjs\` the ~5 KB studio probe, \`car/render-car.mjs\` the
  contact sheet, \`shot/shot.mjs\` one framed shot, \`track/survey-track.mjs
  <id>\` the one-stop circuit pass (\`--oblique\` adds topdown + N/E/S/W).
  Redundant one-offs were deleted; recover from git history if a need returns.
  \`ui/menu-fit.mjs\` survives \`ui/layout-audit.mjs\` only for \`--safe=\`
  (arbitrary notch insets — headless Chromium reports every
  \`env(safe-area-inset-*)\` as 0).
- **Chromium:** \`CHROME\` / \`PW_CHROMIUM\`, then \`/opt/pw-browsers/...\`, else
  Playwright's bundled browser. Servers bind a free port (or \`:3456\`).
- **Two Playwright packages on purpose:** specs run on \`@playwright/test\`;
  ~10 tools import bare \`playwright\` for direct browser control.
- No cache bump after a \`js/*\` / \`css/*\` edit: tags read \`?v=dev\` and the deploy stamps hashes. A \`tools/manifest.cjs\` change needs \`node tools/gen/gen-shell.mjs\`.
- \`net/rtc-e2e.mjs\` (\`npm run rtc:e2e\`) is outside every test group on
  purpose: minutes long, host-network dependent; the lobby spec fakes the
  transport because a sandboxed CI browser never finishes ICE.
`;

export function render() {
  const { main, runner, data, warnings } = collect();
  for (const w of warnings) process.stderr.write(`gen-tools-readme: ${w}\n`);
  const out = [INTRO];
  out.push("## The tools, by what they do\n");
  for (const [dir, blurb] of GROUPS) {
    const rows = main.filter((r) => r.dir === dir);
    if (!rows.length) continue;
    out.push(`### \`tools/${dir}${dir ? "/" : ""}\`\n`);
    out.push(`${blurb}\n`);
    out.push("| Tool | Does | Paired skill |\n|---|---|---|");
    for (const r of rows) out.push(`| **${r.rel}** | ${cell(r.doc)} | ${cell(r.skill)} |`);
    out.push("");
  }
  out.push("## Test runner & coverage\n\n| Tool | Does |\n|---|---|");
  for (const r of runner) out.push(`| **${r.rel}** | ${cell(r.doc)} |`);
  out.push("");
  out.push("## Data files\n\nNo header comment in JSON, so the \"read by\" column is derived from which tools and unit tests name the file.\n\n| File | Read by |\n|---|---|");
  for (const d of data) out.push(`| **${d.rel}** | ${d.readers.map((r) => `\`${r}\``).join(", ") || "—"} |`);
  out.push("");
  out.push(CONVENTIONS);
  return out.join("\n");
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = emit(TARGET, render());
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 2;
  }
}
