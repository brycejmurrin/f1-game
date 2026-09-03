#!/usr/bin/env node
// @doc Reorg helper for `game.js` extractions: free-reference analysis of a line range, rewritten against `G.<name>` (`--out`).
// @skill slim-bloat
/* extract-module.mjs — reorg helper: analyse a line range of a source file for
   extraction into an IIFE module. Parses the range as a program (wrapping it in
   a function if needed), lists FREE references (eslint-scope, program scope
   only), and — given a comma-separated list of known mutable closure lets —
   emits the range with those references rewritten to G.<name> (shorthand
   properties expanded), plus the getter/setter lines the G façade needs.

   Usage:
     node tools/check/extract-module.mjs <file> <startLine> <endLine>            # analyse only
     node tools/check/extract-module.mjs <file> <start> <end> --mutable a,b,c \
          --out artifacts/tmp/body.js --g-out artifacts/tmp/g.txt         # rewrite

   The analyse pass prints FREE names sorted; classify them yourself against
   the source file's `let` vs `const`/`function` declarations, then run the
   rewrite pass. Used for the js/game.js and js/track/tracks.js splits. */
import { readFileSync, writeFileSync } from "node:fs";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";

const [file, startS, endS, ...rest] = process.argv.slice(2);
if (!file || !startS || !endS) {
  console.error("usage: extract-module.mjs <file> <startLine> <endLine> [--mutable a,b] [--out f] [--g-out f]");
  process.exit(1);
}
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i]] = rest[i + 1];
const mutable = new Set((args["--mutable"] || "").split(",").filter(Boolean));

const lines = readFileSync(file, "utf8").split("\n");
const start = parseInt(startS, 10), end = parseInt(endS, 10);
let block = lines.slice(start - 1, end).join("\n");

// A bare statement list parses fine as a program; expressions/object bodies
// would need wrapping — caller passes whole functions/statements, so parse raw.
const ast = espree.parse(block, { ecmaVersion: 2023, range: true });
const shorthandAt = new Set();
(function walk(n) {
  if (!n || typeof n.type !== "string") return;
  if (n.type === "Property" && n.shorthand && n.value && n.value.type === "Identifier")
    shorthandAt.add(n.value.range[0]);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v.type === "string") walk(v);
  }
})(ast);
const sm = eslintScope.analyze(ast, { ecmaVersion: 2023, sourceType: "script" });
const globalScope = sm.acquire(ast);

const BUILTINS = new Set(["Array","Object","Math","JSON","Number","String","Boolean","Infinity","NaN","undefined","isFinite","isNaN","parseInt","parseFloat","window","document","performance","localStorage","fetch","console","requestAnimationFrame","setTimeout","clearTimeout","Float32Array","Uint8Array","Uint16Array","Uint32Array","Map","Set","WeakMap","Promise","URL","navigator","Date","Error","Event","Image","alert","location"]);

if (!mutable.size) {
  const free = new Map();
  for (const ref of globalScope.through) {
    const n = ref.identifier.name;
    if (!BUILTINS.has(n)) free.set(n, (free.get(n) || 0) + 1);
  }
  console.log([...free.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}×${c}`).join(" "));
  process.exit(0);
}

const edits = [];
for (const ref of globalScope.through) {
  const id = ref.identifier;
  if (!mutable.has(id.name)) continue;
  const sh = shorthandAt.has(id.range[0]);
  edits.push({ from: id.range[0], to: id.range[1], text: sh ? `${id.name}: G.${id.name}` : `G.${id.name}` });
}
edits.sort((a, b) => b.from - a.from);
for (const e of edits) block = block.slice(0, e.from) + e.text + block.slice(e.to);
console.log("rewrote", edits.length, "refs");
if (args["--out"]) writeFileSync(args["--out"], block);
if (args["--g-out"]) {
  writeFileSync(args["--g-out"], [...mutable].map(n =>
    `  get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; },`).join("\n"));
}
