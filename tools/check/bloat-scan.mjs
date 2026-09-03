#!/usr/bin/env node
// @doc Size report for slim-bloat: ratchets.json line-ceiling slack, SKILL.md / agent line counts. `--json`; never edits.
// @skill slim-bloat
/* bloat-scan.mjs — size report for slim-bloat / bloat-auditor.
 *
 * Prints ratchet slack (from tests/data/ratchets.json `lines` ceilings),
 * SKILL.md / agent line counts, and oversized unratcheted files. Evidence
 * only — never edits, never launches a browser.
 *
 *   node tools/check/bloat-scan.mjs [--json] [path...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const json = args.includes("--json");
const extra = args.filter((a) => a !== "--json" && a !== "--help");

if (args.includes("--help")) {
  console.log("usage: node tools/check/bloat-scan.mjs [--json] [path...]");
  process.exit(0);
}

const linesOf = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return fs.readFileSync(abs, "utf8").split("\n").length;
};

const CEILINGS = {};
{
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/ratchets.json"), "utf8"));
  for (const [file, metrics] of Object.entries(data.files)) if (metrics.lines) CEILINGS[file] = metrics.lines;
}

function walkFiles(rel, out = []) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    out.push(rel.split(path.sep).join("/"));
    return out;
  }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    walkFiles(path.join(rel, e.name), out);
  }
  return out;
}

const files = [];
const seen = new Set();
const add = (rel, kind, ceiling) => {
  const norm = rel.split(path.sep).join("/");
  if (seen.has(norm)) return;
  const n = linesOf(norm);
  if (n == null) return;
  seen.add(norm);
  const row = { path: norm, lines: n, kind };
  if (ceiling != null) {
    row.ceiling = ceiling;
    row.slack = ceiling - n;
  }
  files.push(row);
};

for (const [file, ceiling] of Object.entries(CEILINGS)) add(file, "ratchet", ceiling);

const skillsRoot = path.join(ROOT, ".claude/skills");
if (fs.existsSync(skillsRoot)) {
  for (const d of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    add(path.join(".claude/skills", d.name, "SKILL.md"), "skill");
  }
}
const agentsRoot = path.join(ROOT, ".claude/agents");
if (fs.existsSync(agentsRoot)) {
  for (const f of fs.readdirSync(agentsRoot)) {
    if (f.endsWith(".md")) add(path.join(".claude/agents", f), "agent");
  }
}
add("AGENTS.md", "always-on");

const LARGE = 800;
for (const rel of extra) {
  for (const f of walkFiles(rel)) {
    if (seen.has(f)) continue;
    const n = linesOf(f);
    if (n == null) continue;
    add(f, n >= LARGE ? "large" : "file");
  }
}

files.sort((a, b) => (a.slack ?? 1e9) - (b.slack ?? 1e9) || b.lines - a.lines);

if (json) {
  console.log(JSON.stringify({ ok: true, files }, null, 2));
} else {
  console.log("path\tlines\tceiling\tslack\tkind");
  for (const f of files) {
    console.log([f.path, f.lines, f.ceiling ?? "", f.slack ?? "", f.kind].join("\t"));
  }
}
