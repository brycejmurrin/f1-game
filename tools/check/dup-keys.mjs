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
// A LINE SCANNER, not a parser: it tracks brace depth over source with strings
// and comments blanked, and reports a key repeated at the same depth. That is
// enough for data literals, which is where the hazard lives, and it costs
// nothing to run. Computed keys, keys spanning lines and object spread are not
// understood — a false NEGATIVE is possible, a false positive is not, because
// every hit names two real lines you can read.
//
//   node tools/check/dup-keys.mjs            # scan, exit 1 on any hit
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The vendored three.js island is not ours to police.
const SKIP = new Set(["three"]);

export function scanFile(src, file) {
  const out = [];
  const stack = [new Map()];
  let n = 0;
  for (const raw of src.split("\n")) {
    n++;
    let code = raw.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");
    code = code.replace(/"(?:[^"\\]|\\.)*"/g, ' "" ').replace(/'(?:[^'\\]|\\.)*'/g, " '' ");
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(code);
    if (m) {
      const top = stack[stack.length - 1];
      if (top.has(m[1])) out.push({ file, line: n, key: m[1], first: top.get(m[1]) });
      else top.set(m[1], n);
    }
    for (const ch of code) {
      if (ch === "{") stack.push(new Map());
      else if (ch === "}" && stack.length > 1) stack.pop();
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e.endsWith(".js")) acc.push(p);
  }
  return acc;
}

const hits = [];
for (const f of walk(path.join(ROOT, "js")))
  hits.push(...scanFile(readFileSync(f, "utf8"), path.relative(ROOT, f)));

if (hits.length) {
  for (const h of hits)
    console.error(`${h.file}:${h.line} duplicate key \`${h.key}\` in one object literal — the one at line ${h.first} is dead`);
  console.error(`\n${hits.length} duplicate key(s). Merge the two into ONE, keeping both sides' fields.`);
  process.exit(1);
}
console.log("dup-keys: no duplicate object keys in js/");
