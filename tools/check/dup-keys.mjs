#!/usr/bin/env node
// @doc Scans js/ for a DUPLICATE key in one object literal — the merge hazard where two sessions add a field and later wins.
// @skill check-changes
//
// WHY. Two sessions each added a `livery:` block to the same team records. Git
// merged both without a conflict — separate lines, same object — and JavaScript
// keeps the LAST duplicate key, so the earlier session's whole design went dead
// with no error and no warning. It happened twice in one day (Ferrari and
// Mercedes, then Williams). tests/unit/team-livery.test.mjs guards the team
// records specifically; this is the general case, because the hazard belongs to
// object literals rather than to that one file.
//
// PARSED, not scanned. The first version was a line scanner with regexes for
// strings and comments, and it was wrong three different ways the moment the
// scan widened past js/: it read CSS and prompt text inside template literals
// as keys, the `//` in every URL truncated its line and left an unterminated
// template desynchronising the rest of the file, and a blanked string turned
// every `case "x":` into a key. Each fix revealed the next. A regex cannot
// tell a regex literal from a division either, so the class does not end.
//
// espree is already a devDependency (the ESLint parser), so this walks a real
// ESTree AST and looks at ObjectExpression nodes only. No false positives are
// possible: a duplicate is two Property nodes with the same static key in one
// object literal, which is exactly the hazard. Computed keys are skipped —
// their value is not knowable here — and spread is not a key at all.
//
//   node tools/check/dup-keys.mjs            # scan, exit 1 on any hit
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Skipped by PATH, never by directory name (2026-10-10, DK1): the skip used to
// be the basename "three", which exempted js/render/three/ — the default TLX
// renderer, our own code — while the vendored three.js island sits in
// vendor/three-*/, outside ROOTS anyway. Only node_modules is exempt anywhere.
const SKIP_NAMES = new Set(["node_modules"]);
export const SKIP_PATHS = new Set([]);

const PARSE = { ecmaVersion: "latest", loc: true, range: false };

/* Every ObjectExpression in the file, checked for a static key it declares
   twice. `sourceType` is tried both ways because this repo is a mix: js/ is
   plain scripts (IIFEs, no modules by rule) while tools/ and tests/ are ESM. */
export function scanFile(src, file) {
  let ast = null;
  for (const sourceType of ["module", "script"]) {
    try { ast = espree.parse(src, { ...PARSE, sourceType }); break; } catch { /* try the other */ }
  }
  // A file neither mode parses was checked by nothing: report it (DK1), or a
  // syntax slip silently exempts the whole file from the duplicate-key scan.
  if (!ast) return [{ file, line: 1, key: "<unparseable>", first: 1, parseError: true }];
  const out = [];
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (!node.type) return;
    seen.add(node);
    if (node.type === "ObjectExpression") {
      // A key may legally appear twice as a GETTER and a SETTER — the G façade
      // in game.js is 200 lines of exactly that, and reporting those buried the
      // one real finding under 132. A duplicate is two properties competing for
      // the SAME slot: init over init, get over get, set over set, or a plain
      // value beside an accessor.
      const keys = new Map();   // key -> { kinds:Set, line }
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.computed) continue;
        const k = prop.key.type === "Identifier" ? prop.key.name
                : prop.key.type === "Literal" ? String(prop.key.value) : null;
        if (k == null) continue;
        const kind = prop.kind === "get" || prop.kind === "set" ? prop.kind : "init";
        const line = prop.key.loc.start.line;
        const prev = keys.get(k);
        if (!prev) { keys.set(k, { kinds: new Set([kind]), line }); continue; }
        const clashes = prev.kinds.has(kind) || kind === "init" || prev.kinds.has("init");
        if (clashes) out.push({ file, line, key: k, first: prev.line });
        else prev.kinds.add(kind);
      }
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v);
  })(ast);
  return out;
}

export function walkDir(dir, acc = [], root = ROOT) {
  for (const e of readdirSync(dir)) {
    if (SKIP_NAMES.has(e)) continue;
    const p = path.join(dir, e);
    if (SKIP_PATHS.has(path.relative(root, p).split(path.sep).join("/"))) continue;
    if (statSync(p).isDirectory()) walkDir(p, acc, root);
    else if (/\.(m|c)?js$/.test(e)) acc.push(p);
  }
  return acc;
}

// js/ is where the hazard has actually bitten — twice, in the same file — but
// the same silent merge can happen in any object literal, so the scan is the
// whole tree the repo owns.
export const ROOTS = ["js", "tools", "tests"];

export function scanTree(root = ROOT, roots = ROOTS) {
  const hits = [];
  for (const r of roots)
    for (const f of walkDir(path.join(root, r), [], root))
      hits.push(...scanFile(readFileSync(f, "utf8"), path.relative(root, f)));
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = scanTree();
  if (hits.length) {
    for (const h of hits)
      console.error(h.parseError
        ? `${h.file}: could not be parsed as a module or a script — no duplicate-key check ran on it`
        : `${h.file}:${h.line} duplicate key \`${h.key}\` in one object literal — the one at line ${h.first} is dead`);
    console.error(`\n${hits.length} finding(s). Merge duplicate keys into ONE, keeping both sides' fields.`);
    process.exit(1);
  }
  console.log(`dup-keys: no duplicate object keys in ${ROOTS.join("/, ")}/`);
}
