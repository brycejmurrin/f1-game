#!/usr/bin/env node
// @doc Scans js/ for a DUPLICATE key in one object literal — the silent merge hazard where two sessions each add a field and the later one wins.
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
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The vendored three.js island is not ours to police.
const SKIP = new Set(["three", "node_modules"]);

const PARSE = { ecmaVersion: "latest", loc: true, range: false };

/* Every ObjectExpression in the file, checked for a static key it declares
   twice. `sourceType` is tried both ways because this repo is a mix: js/ is
   plain scripts (IIFEs, no modules by rule) while tools/ and tests/ are ESM. */
export function scanFile(src, file) {
  let ast = null;
  for (const sourceType of ["module", "script"]) {
    try { ast = espree.parse(src, { ...PARSE, sourceType }); break; } catch { /* try the other */ }
  }
  if (!ast) return [];   // unparseable is not this tool's business to report
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

function walkDir(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walkDir(p, acc);
    else if (/\.(m|c)?js$/.test(e)) acc.push(p);
  }
  return acc;
}

// js/ is where the hazard has actually bitten — twice, in the same file — but
// the same silent merge can happen in any object literal, so the scan is the
// whole tree the repo owns.
const ROOTS = ["js", "tools", "tests"];
const hits = [];
for (const r of ROOTS)
  for (const f of walkDir(path.join(ROOT, r)))
    hits.push(...scanFile(readFileSync(f, "utf8"), path.relative(ROOT, f)));

if (hits.length) {
  for (const h of hits)
    console.error(`${h.file}:${h.line} duplicate key \`${h.key}\` in one object literal — the one at line ${h.first} is dead`);
  console.error(`\n${hits.length} duplicate key(s). Merge the two into ONE, keeping both sides' fields.`);
  process.exit(1);
}
console.log(`dup-keys: no duplicate object keys in ${ROOTS.join("/, ")}/`);
