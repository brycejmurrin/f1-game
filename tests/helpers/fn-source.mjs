/* fn-source.mjs — extract a top-level function's REAL body from a source file.
 *
 * Why this exists: `src.slice(i, i + 2200)` was how tests read a function out
 * of js/game.js, and on 2026-09-02 it took the deploy branch red. `quitToMenu`
 * grew past 2200 chars as sessions added IncidentSim.reset()/DebrisWorld.reset()
 * and their comments, so `netLobby.cancel()` — still present, still correct —
 * moved to +2605 and fell outside the window. The assertion failed for a
 * behaviour that had not changed, pages.yml runs 1888/1889 failed, and the
 * live site stopped updating. The session branch was 29 characters from the
 * same failure.
 *
 * A magic window is a test that silently stops reading what it claims to read.
 * Bound extraction by parsed syntax ranges instead: indentation and inline
 * closing braces are layout, while strings/comments/templates/regexes can all
 * contain braces that do not delimit the function. Espree is already a test
 * dependency; its ranges preserve the original source bytes.
 *
 * For js/game.js use tests/helpers/game-source.mjs `symbolSource(decl)`: the
 * same extraction over game.js AND the modules carved out of it, so a pin
 * follows its function through an extraction instead of going red (or, for a
 * negative pin, silently vacuous).
 */

import { parse } from "espree";

// Keep only ranges, not whole ASTs. A test process repeatedly reads the same
// renderer/game sources; parsing each once also keeps source pins inexpensive.
// Script and module grammars must never share a cached parse result.
const rangesBySource = new Map();
function functionRanges(src, sourceType) {
  const byType = rangesBySource.get(src);
  if (byType?.has(sourceType)) return byType.get(sourceType);
  const ast = parse(src, { ecmaVersion: "latest", sourceType, range: true });
  const ranges = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration"
        || node.type === "MethodDefinition"
        || node.type === "Property" && node.method
        || node.type === "VariableDeclaration" && node.declarations.length === 1
          && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.declarations[0].init?.type)
        // `save.onclick = () => {` — a handler assigned to a property (setup-sheet.js; team-livery.test.mjs)
        || node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression"
          && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.expression.right?.type)) {
      ranges.push(node.range);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
  if (!byType) rangesBySource.set(src, new Map());
  rangesBySource.get(src).set(sourceType, ranges);
  return ranges;
}

/** Full original text of one syntactic function declaration, method or
 * function-valued variable declaration. `decl` is its exact source prefix
 * (optional leading indentation included). Missing and ambiguous matches throw;
 * text in comments/strings and neighboring declarations never count as hits.
 * Parsing defaults to script; pass { sourceType: "module" } for ES modules. */
// An HTML page (tools/carview.html's inline script) is not one JS program and cannot be
// parsed; it keeps the column rule this module used before the parse: the closing brace sits at
// the declaration's own indentation.
function columnSource(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error(`fnSource: declaration not found: ${decl}`);
  const ls = src.lastIndexOf("\n", i) + 1;
  const indent = src.slice(ls, i);
  if (/[^ \t]/.test(indent))
    throw new Error(`fnSource: ${decl} is not at the start of its line — cannot infer the closing column`);
  const rest = src.slice(i);
  const m = new RegExp("\\n" + indent + "\\}").exec(rest);
  if (!m) throw new Error(`fnSource: no closing brace at column ${indent.length} after ${decl}`);
  return rest.slice(0, m.index + indent.length + 2);
}

export function fnSource(src, decl, { sourceType = "script" } = {}) {
  if (typeof decl !== "string" || !decl.trim()) throw new Error("fnSource: declaration must be non-empty");
  const prefix = decl.trimStart(), indent = decl.length - prefix.length;
  let ranges;
  try { ranges = functionRanges(src, sourceType); }
  catch (e) { if (/^\s*<|<script\b/i.test(src)) return columnSource(src, decl); throw e; }   // an HTML page only; JS syntax errors still throw
  const hits = ranges.filter(([start, end]) => {
    const at = start - indent;
    return at >= 0 && src.slice(at, at + decl.length) === decl
      && start + prefix.length <= end
      && !(/[\w$]$/.test(prefix) && /[\w$]/.test(src[start + prefix.length] || ""));
  });
  if (hits.length !== 1) throw new Error(`fnSource: declaration ${hits.length ? "is ambiguous" : "not found"}: ${decl}`);
  const [start, end] = hits[0];
  return src.slice(start - indent, end);
}
