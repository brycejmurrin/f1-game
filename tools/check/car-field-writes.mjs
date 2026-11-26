// @doc Static guard: a `c.<name> =` write in game.js, physics/ or race/ to an undeclared car field fails a test (#6920 U1.4).
// @skill check-changes
//
// WHY. A car field written late, with no declaration, is how the reset paths (newRace, rescue, redFlag, episode) lose
// state: the field has no row in the RESETS table of js/race/car-fields.js, so nothing resets it and it leaks into the
// next episode. #6920 moved the reset truth into that table; this scan keeps new fields from bypassing it.
//
// WHAT. espree walks each file and finds an AssignmentExpression (=, +=, ||=, ??= and the other operators) whose target
// is `c.<name>` (non-computed). A name is DECLARED when the caller passes it in `declared`: the makeCars spawn keys, the
// CarFields KEYS / WARM / MUTABLE lists and the RESETS keys. The tool stays pure: the unit test supplies the runtime
// spawn keys (a game-vm car) because a static read of makeCars misses its spreads (CarDraw.carVisual, driverSkill).
//
// LIMIT. Only the receiver name `c` is seen. `car`, `p`, `other`, `self` and any other alias are NOT scanned, and
// neither is a computed key `c[k] =`. A function whose `c` is not a car (a colour, a key, a config) goes in `skip`,
// keyed by file and enclosing function, never in the baseline.
//
// To declare a new car field: add it to js/race/car-fields.js (GROUPS / RESET_GROUPS) in the same change. A baseline
// entry in tests/data/car-field-writes-baseline.json is shrink-only: delete it when its field is declared.
//
// No CLI: the spawn keys come from a booted game, so tests/unit/car-field-writes.test.mjs is the one caller.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARSE = { ecmaVersion: "latest", loc: true, range: false };

/** The files in scope, repo-relative, sorted. */
export function scopeFiles(root = ROOT) {
  const out = ["js/game.js"];
  for (const dir of ["js/physics", "js/race"]) {
    for (const f of readdirSync(path.join(root, dir)).sort()) if (f.endsWith(".js")) out.push(`${dir}/${f}`);
  }
  return out;
}

/** Every `c.<name> <op>= ...` write in one file: [{ file, fn, name, line }]. `fn` is the nearest enclosing function with a
 * name (declaration, `const f = () =>`, `key: function`, method), else "<top>". A file that does not parse reports one
 * row with name "<unparseable>" so a syntax slip cannot exempt it. */
export function scanSource(src, file) {
  let ast = null;
  for (const sourceType of ["script", "module"]) {
    try { ast = espree.parse(src, { ...PARSE, sourceType }); break; } catch { /* try the other */ }
  }
  if (!ast) return [{ file, fn: "<top>", name: "<unparseable>", line: 1 }];
  const out = [];
  const seen = new Set();
  const fnName = (node, parent) => {
    if (node.id && node.id.name) return node.id.name;
    if (parent && parent.type === "VariableDeclarator" && parent.id.type === "Identifier") return parent.id.name;
    if (parent && (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition")
      && !parent.computed && parent.key) return parent.key.name || String(parent.key.value);
    if (parent && parent.type === "AssignmentExpression" && parent.left.type === "MemberExpression"
      && !parent.left.computed) return parent.left.property.name;
    return null;
  };
  (function walk(node, parent, fns) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, parent, fns); return; }
    if (!node.type) return;
    seen.add(node);
    let chain = fns;
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      const n = fnName(node, parent);
      if (n) chain = [...fns, n];
    }
    if (node.type === "AssignmentExpression") {
      const t = node.left;
      if (t.type === "MemberExpression" && !t.computed && t.object.type === "Identifier" && t.object.name === "c"
        && t.property.type === "Identifier") {
        out.push({ file, fn: chain.length ? chain[chain.length - 1] : "<top>", name: t.property.name, line: t.loc.start.line });
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "type") continue;
      walk(node[k], node, chain);
    }
  })(ast, null, []);
  return out;
}

/** The undeclared writes over `files` ([{ file, src }]).
 *  declared: Set|Array of declared car-field names.
 *  skip:     { [file]: [fnName, ...] } functions whose `c` is not a car.
 * Returns { writes, undeclared } — `writes` is every c.<name> write (skip applied), `undeclared` the ones not declared,
 * each { file, fn, name, line }. */
export function scan(files, { declared = [], skip = {} } = {}) {
  const decl = new Set(declared);
  const writes = [];
  for (const { file, src } of files) {
    const skipFns = new Set(skip[file] || []);
    for (const w of scanSource(src, file)) if (!skipFns.has(w.fn)) writes.push(w);
  }
  return { writes, undeclared: writes.filter((w) => !decl.has(w.name)) };
}

/** Read the tree's in-scope files. */
export function readTree(root = ROOT) {
  return scopeFiles(root).map((file) => ({ file, src: readFileSync(path.join(root, file), "utf8") }));
}

/** One-line-per-name report of undeclared writes not covered by `baseline` ({ names: { [name]: {...} } } or an array of
 * names). The message names js/race/car-fields.js and the shrink-only rule. */
export function report(undeclared, baselineNames = []) {
  const base = new Set(baselineNames);
  const fresh = undeclared.filter((w) => !base.has(w.name));
  if (!fresh.length) return "";
  const rows = fresh.map((w) => `  c.${w.name} = ...   ${w.file}:${w.line} (${w.fn})`);
  return `undeclared car-field write${fresh.length > 1 ? "s" : ""}:\n${rows.join("\n")}\n` +
    "Declare the field in js/race/car-fields.js (GROUPS, and a RESET_GROUPS row for its lifetime), not in the baseline. " +
    "tests/data/car-field-writes-baseline.json is shrink-only: a PR that declares a baseline name must delete its entry.";
}
