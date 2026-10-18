#!/usr/bin/env node
// @doc apex-lsp vs grep on fixed code questions with known answers: correctness, output chars, time; `--json`.
/* lsp-eval — is apex-lsp still better than grep on the questions agents ask?
 *
 * Each question has an ANSWER (a regex the right output must contain) and the
 * grep an agent would type for it. Both run against the working tree; the
 * table scores correctness, output size (a proxy for tokens: ~4 chars each)
 * and wall time. A question the tool gets wrong is a regression in
 * tools/mcp/lsp-mcp.mjs; one grep gets right with less output is a question
 * the tool does not earn. Answers are pinned to stable declarations; when one
 * moves on purpose, update its regex here (docs/notes/LSP-MCP-2026-10-18.md).
 *
 *   node tools/mcp/lsp-eval.mjs            # markdown table + totals
 *   node tools/mcp/lsp-eval.mjs --json     # one object per question
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Lsp, callTool } from "./lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// q, the apex-lsp call, the regex a correct answer contains, the grep an agent would run first.
export const QUESTIONS = [
  { q: "Where is Liveries.forTeam implemented?", tool: ["lsp_definition", { symbol: "Liveries.forTeam" }], answer: /js\/car\/liveries\.js:\d+:\d+ {2}\[def\] function forTeam\(/, grep: "grep -rn 'Liveries\\.forTeam' js" },
  { q: "Where is Tracks.curvature implemented (through the re-export)?", tool: ["lsp_definition", { symbol: "Tracks.curvature" }], answer: /js\/track\/core\/spline\.js:\d+:\d+ {2}\[def\] function curvature\(/, grep: "grep -rn 'Tracks\\.curvature' js" },
  { q: "Where is GameHud declared?", tool: ["lsp_definition", { symbol: "GameHud" }], answer: /js\/ui\/hud\.js:2:\d+ {2}\[def\] const GameHud/, grep: "grep -rn 'GameHud' js" },
  { q: "What does Liveries.forTeam return?", tool: ["lsp_hover", { symbol: "Liveries.forTeam" }], answer: /forTeam: \(team: any\) => \{/, grep: "grep -rn 'function forTeam' js" },
  { q: "Which functions call AiDrive.cornerK?", tool: ["lsp_callers", { symbol: "AiDrive.cornerK" }], answer: /js\/game\.js:\d+ {2}\S/, grep: "grep -rn 'AiDrive\\.cornerK' js" },
  { q: "Who reads PhysicsConsts.MAX_RPM, destructures included?", tool: ["lsp_references", { symbol: "PhysicsConsts.MAX_RPM", format: "concise" }], answer: /js\/ui\/hud\.js:5:\d+ {2}\[alias\][^]*js\/ui\/hud\.js:\d+:\d+ {2}\[use\]/, grep: "grep -rn 'MAX_RPM' js" },
  { q: "What does G.wrapS do, per the façade contract?", tool: ["lsp_hover", { symbol: "G.wrapS" }], answer: /GameCtx\.wrapS: \(s: number\) => number/, grep: "grep -rn 'wrapS' types" },
  { q: "How many separate clamp functions exist (not aliases)?", tool: ["lsp_symbols", { query: "clamp" }], answer: /^clamp {2}function {2}js\/core\/mat4\.js:\d+:\d+\n(?!clamp ).*[^]*\+ \d+ aliases/, grep: "grep -rn 'clamp\\b' js" },
  { q: "What does the Ghost module export?", tool: ["lsp_outline", { symbol: "Ghost" }], answer: /Ghost {2}:\d+ {2}IIFE module: \d+ exported[^]*\[export\] hasGhost/, grep: "grep -n 'return {' -A6 js/car/ghost.js" },
  { q: "Show the body of Liveries.forTeam.", tool: ["lsp_definition", { symbol: "Liveries.forTeam", body: true, maxLines: 12 }], answer: /function forTeam\(team\) \{\n.*const def = /, grep: "grep -n 'function forTeam' -A12 js/car/liveries.js" },
  { q: "Who uses Ghost (a CommonJS-flagged global)?", tool: ["lsp_references", { symbol: "Ghost", files: true }], answer: /js\/race\/session-records\.js \d+/, grep: "grep -rln '\\bGhost\\b' js" },
  { q: "Does a missing member answer honestly?", tool: ["lsp_definition", { symbol: "GameHud.noSuchMember" }], answer: /has no member noSuchMember/, grep: "grep -rn 'GameHud\\.noSuchMember' js" },
];

export async function run({ lsp = new Lsp({ idleMs: 0 }) } = {}) {
  const rows = [];
  try {
    for (const item of QUESTIONS) {
      const [name, args] = item.tool;
      let t = Date.now();
      const r = await callTool(lsp, name, args);
      const out = r.content[0].text, lspMs = Date.now() - t;
      t = Date.now();
      let g = "";
      try { g = execSync(item.grep, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }); } catch (e) { g = e.stdout || ""; }
      rows.push({ q: item.q, tool: `${name} ${JSON.stringify(args)}`, ok: item.answer.test(out), lspChars: out.length, lspMs,
        grep: item.grep, grepChars: g.length, grepLines: g ? g.trimEnd().split("\n").length : 0, grepMs: Date.now() - t });
    }
  } finally { lsp.stop(); }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) { process.stdout.write("node tools/mcp/lsp-eval.mjs [--json]\n"); process.exit(0); }
  const rows = await run();
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  else {
    const sum = k => rows.reduce((n, r) => n + r[k], 0);
    process.stdout.write("| question | apex-lsp | chars | ms | grep lines | grep chars |\n|---|---|---|---|---|---|\n"
      + rows.map(r => `| ${r.q} | ${r.ok ? "correct" : "**WRONG**"} | ${r.lspChars} | ${r.lspMs} | ${r.grepLines} | ${r.grepChars} |`).join("\n")
      + `\n\napex-lsp ${rows.filter(r => r.ok).length}/${rows.length} correct, ${sum("lspChars")} chars; grep ${sum("grepChars")} chars (answers still to be picked out by hand).\n`);
  }
  process.exitCode = rows.every(r => r.ok) ? 0 : 1;
}
