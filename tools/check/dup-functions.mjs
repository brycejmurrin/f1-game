#!/usr/bin/env node
// @doc Scans js/, tools/, tests/ for a function declared twice in one scope: the hoisted later copy wins, the first is dead.
// @skill check-changes
//
// WHY. js/car/car-body-geom.js carried two `function fitBodyDetails(` in the
// same create() scope (audit4 B1, 2026-10-26). Two sessions landed a copy each
// on the same day; git merged both without a conflict and JavaScript hoists the
// LATER declaration over the earlier one, so the first copy was dead with no
// error. An agent that grepped and edited the first copy changed nothing, and
// the garage preview "looked the same". apex-lsp's diagnostics did not report
// it (TS2393 is not in its high-signal set), and dup-keys only reads object
// literals. This is the scope-level sibling of tools/check/dup-keys.mjs.
//
// Parsed with espree (as dup-keys is): a statement list — a Program, a block, a
// function body, a static block or a switch case — that holds two
// FunctionDeclaration nodes with the same name is a finding. Nested scopes are
// separate lists, so a helper reused by name in two sibling functions is fine.
//
//   node tools/check/dup-functions.mjs       # scan, exit 1 on any hit
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as espree from "espree";
import { walkDir, ROOTS } from "./dup-keys.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARSE = { ecmaVersion: "latest", loc: true };
const KEYS = espree.VisitorKeys;   // child keys per node type: no walk over loc/range/raw

/** Every statement list in `src` checked for a function name declared twice. */
export function scanFile(src, file) {
  let ast = null;
  for (const sourceType of ["module", "script"]) {
    try { ast = espree.parse(src, { ...PARSE, sourceType }); break; } catch { /* try the other */ }
  }
  if (!ast) return [{ file, line: 1, name: "<unparseable>", first: 1, parseError: true }];
  const out = [];
  const check = (list) => {
    const seen = new Map();
    for (const st of list) {
      const decl = st && st.type === "ExportNamedDeclaration" ? st.declaration : st;
      if (!decl || decl.type !== "FunctionDeclaration" || !decl.id) continue;
      const first = seen.get(decl.id.name);
      if (first == null) seen.set(decl.id.name, decl.loc.start.line);
      else out.push({ file, line: decl.loc.start.line, name: decl.id.name, first });
    }
  };
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (!node.type) return;
    if (node.type === "Program" || node.type === "BlockStatement" || node.type === "StaticBlock") check(node.body);
    else if (node.type === "SwitchCase") check(node.consequent);
    for (const k of KEYS[node.type] || []) walk(node[k]);
  })(ast);
  return out;
}

export function scanTree(root = ROOT, roots = ROOTS) {
  const hits = [];
  for (const r of roots)
    for (const f of walkDir(path.join(root, r), [], root))
      hits.push(...scanFile(readFileSync(f, "utf8"), path.relative(root, f).split(path.sep).join("/")));
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("usage: node tools/check/dup-functions.mjs   # exit 1 when a scope declares one function name twice");
    process.exit(0);
  }
  if (args.length) { console.error(`dup-functions: unknown argument ${args[0]} (try --help)`); process.exit(2); }
  const hits = scanTree();
  if (hits.length) {
    for (const h of hits)
      console.error(h.parseError
        ? `${h.file}: could not be parsed as a module or a script — no duplicate-function check ran on it`
        : `${h.file}:${h.line} function \`${h.name}\` declared again in the same scope — the copy at line ${h.first} is dead (the later declaration wins)`);
    console.error(`\n${hits.length} finding(s). Keep ONE declaration, carrying over anything only the dead copy had.`);
    process.exit(1);
  }
  console.log(`dup-functions: no function declared twice in one scope in ${ROOTS.join("/, ")}/`);
}
