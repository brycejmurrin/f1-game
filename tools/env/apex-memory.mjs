#!/usr/bin/env node
/**
 * apex-memory.mjs — read / update / retire the shared `.claude/memory/` store
 * from any host (Claude Code, Cursor, Codex). Does not use git assume-unchanged
 * (that Claude-only hide is for Stop-hook noise; every host sees tracked files).
 * @doc List, show, and retire `.claude/memory` topic files from any host; no assume-unchanged.
 * @skill agent-config
 *
 *   node tools/env/apex-memory.mjs list
 *   node tools/env/apex-memory.mjs show <file.md>
 *   node tools/env/apex-memory.mjs retire <file.md>   # drops topic + MEMORY.md index line
 *
 * Docs: docs/notes/AGENT-MEMORY.md. Fleet rules: .claude/rules/fleet-core.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MEM = path.join(ROOT, ".claude/memory");
const INDEX = path.join(MEM, "MEMORY.md");

const USAGE = `usage: node tools/env/apex-memory.mjs <list|show|retire> [file.md]
  Shared auto-memory store (.claude/memory/). Every host reads the same files.
  Fleet rules: .claude/rules/fleet-core.md. Details: docs/notes/AGENT-MEMORY.md.`;

function die(msg, code = 2) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

function listIndex() {
  if (!fs.existsSync(INDEX)) die("MEMORY.md missing", 1);
  const text = fs.readFileSync(INDEX, "utf8");
  const rows = [...text.matchAll(/^\s*-\s*\[([^\]]*)\]\(([^)]+\.md)\)\s*(?:—\s*(.*))?$/gm)]
    .map((m) => ({ title: m[1], file: m[2], blurb: (m[3] || "").trim() }));
  return { text, rows };
}

function cmdList() {
  const { rows } = listIndex();
  process.stdout.write(`${rows.length} memories in .claude/memory/\n`);
  for (const r of rows) {
    process.stdout.write(`- ${r.file}\t${r.title}${r.blurb ? ` — ${r.blurb}` : ""}\n`);
  }
  const onDisk = fs.readdirSync(MEM).filter((n) => n.endsWith(".md") && n !== "MEMORY.md");
  const linked = new Set(rows.map((r) => r.file));
  const orphans = onDisk.filter((f) => !linked.has(f));
  if (orphans.length) process.stdout.write(`orphans (on disk, not in index): ${orphans.join(", ")}\n`);
}

function cmdShow(file) {
  if (!file) die(USAGE);
  const base = path.basename(file);
  const abs = path.join(MEM, base);
  if (!fs.existsSync(abs)) die(`not found: .claude/memory/${base}`, 1);
  process.stdout.write(fs.readFileSync(abs, "utf8"));
  if (!fs.readFileSync(abs, "utf8").endsWith("\n")) process.stdout.write("\n");
}

function cmdRetire(file) {
  if (!file) die(USAGE);
  const base = path.basename(file);
  if (base === "MEMORY.md") die("refuse to retire MEMORY.md itself", 2);
  const abs = path.join(MEM, base);
  const { text, rows } = listIndex();
  const next = text.split("\n").filter((line) => {
    const m = line.match(/^\s*-\s*\[[^\]]*\]\(([^)]+\.md)\)/);
    return !(m && m[1] === base);
  }).join("\n").replace(/\n{3,}/g, "\n\n");
  if (next === text && !fs.existsSync(abs)) die(`nothing to retire: ${base}`, 1);
  fs.writeFileSync(INDEX, next.endsWith("\n") ? next : next + "\n");
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  const kept = rows.filter((r) => r.file !== base).length;
  process.stdout.write(`retired ${base}; index now ${kept} entries. Commit .claude/memory/ on a memory-change: PR.\n`);
}

const [cmd, arg] = process.argv.slice(2);
if (!cmd || cmd === "--help" || cmd === "-h") { process.stdout.write(USAGE + "\n"); process.exit(0); }
if (cmd === "list") cmdList();
else if (cmd === "show") cmdShow(arg);
else if (cmd === "retire") cmdRetire(arg);
else die(USAGE);
