#!/usr/bin/env node
// html-sink-lint — every HTML sink in js/ writes a constant, or is audited.
// @doc Flags `.innerHTML =` / `.outerHTML =` / `insertAdjacentHTML()` in js/ whose HTML is not constant and not in the audited allowlist.
// @section runner
//
//   node tools/check/html-sink-lint.mjs          # list non-constant sinks, audited or not
//   node tools/check/html-sink-lint.mjs --json
//
// WHY. A custom team's driver name — set by an imported garage file — reached
// `el.innerHTML` through js/ui/aria-state.js paintOnOff, which re-wrapped a
// button's textContent in markup: `ON <img onerror=…>` was stored XSS
// (fixed 2026-09-24 by escaping). Nothing in the tree said which other sinks
// could carry player text; every one had to be read to find out. This lint
// makes that reading a one-time audit plus a gate on the NEXT site.
//
// WHAT IS A SITE. An assignment (`=` or `+=`) to `.innerHTML` / `.outerHTML`
// (dotted or `["innerHTML"]`), or an `insertAdjacentHTML(pos, html)` call,
// whose HTML is not CONSTANT. Constant means: a string literal, a template
// with no substitutions, `+` of constants, or a ternary whose two arms are
// constants (the test may be anything — it only picks between literals).
// Everything else is a site and must be in tests/data/html-sink-allowlist.json
// with a reason saying why its dynamic parts cannot carry player text.
//
// THE ALLOWLIST KEY is `<file>::<receiver source>.<sink>` — no line numbers,
// which drift with every edit above the site. The entry's `count` is how many
// sites share the key, so a SECOND `sum.innerHTML = …` in an audited file is
// not waved through by the first one's reason. tests/unit/html-sink-lint.test.mjs
// fails on an unaudited site AND on a stale entry.
//
// THE FIX FOR A NEW SITE is almost never an allowlist row: build the node with
// Dom.el()/textContent, or escape the dynamic part the way aria-state.js does.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ALLOWLIST = "tests/data/html-sink-allowlist.json";
const SINK_PROPS = new Set(["innerHTML", "outerHTML"]);

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);
function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

/** True when `n` can only ever evaluate to markup written in the source. */
export function isConstantHtml(n) {
  if (!n) return false;
  switch (n.type) {
    case "Literal": return typeof n.value === "string" || typeof n.value === "number";
    case "TemplateLiteral": return n.expressions.every(isConstantHtml);
    case "BinaryExpression": return n.operator === "+" && isConstantHtml(n.left) && isConstantHtml(n.right);
    case "ConditionalExpression": return isConstantHtml(n.consequent) && isConstantHtml(n.alternate);
    default: return false;
  }
}

function propName(m) {
  if (m.type !== "MemberExpression") return null;
  if (!m.computed && m.property.type === "Identifier") return m.property.name;
  if (m.computed && m.property.type === "Literal" && typeof m.property.value === "string") return m.property.value;
  return null;
}

/** Non-constant HTML sinks in one source. */
export function lintSource(src, file = "<src>") {
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: 2022, loc: true, range: true }); }
  catch (e) { return { file, parseError: e.message, sites: [] }; }
  const text = (n) => src.slice(n.range[0], n.range[1]).replace(/\s+/g, " ");
  const sites = [];
  each(ast, (n) => {
    if (n.type === "AssignmentExpression" && (n.operator === "=" || n.operator === "+=")) {
      const p = propName(n.left);
      if (!p || !SINK_PROPS.has(p) || isConstantHtml(n.right)) return;
      sites.push({ line: n.loc.start.line, sink: p, key: `${file}::${text(n.left.object)}.${p}` });
    } else if (n.type === "CallExpression" && propName(n.callee) === "insertAdjacentHTML") {
      if (isConstantHtml(n.arguments[1])) return;
      sites.push({ line: n.loc.start.line, sink: "insertAdjacentHTML",
        key: `${file}::${text(n.callee.object)}.insertAdjacentHTML` });
    }
  });
  return { file, parseError: null, sites };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* walk(p); }
    else if (e.name.endsWith(".js")) yield p;
  }
}

/** Every non-constant sink under js/ (parse errors included, as rows). */
export function lintAll(root = ROOT) {
  const out = [];
  const abs = path.join(root, "js");
  if (!fs.existsSync(abs)) return out;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    if (!/innerHTML|outerHTML|insertAdjacentHTML/.test(src)) continue;   // cheap pre-filter
    const r = lintSource(src, rel);
    if (r.parseError || r.sites.length) out.push(r);
  }
  return out;
}

export function readAllowlist(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST), "utf8")).sites || {};
}

/** { unaudited: [site], stale: [key], miscounted: [{key, want, got}], parseErrors: [row] } */
export function audit(root = ROOT) {
  const rows = lintAll(root);
  const allow = readAllowlist(root);
  const got = new Map();
  const unaudited = [];
  for (const r of rows) for (const s of r.sites) {
    got.set(s.key, (got.get(s.key) || 0) + 1);
    if (!allow[s.key]) unaudited.push(Object.assign({ file: r.file }, s));
  }
  const stale = Object.keys(allow).filter((k) => !got.has(k));
  const miscounted = Object.keys(allow).filter((k) => got.has(k) && got.get(k) !== (allow[k].count || 1))
    .map((k) => ({ key: k, want: allow[k].count || 1, got: got.get(k) }));
  return { unaudited, stale, miscounted, parseErrors: rows.filter((r) => r.parseError) };
}

function main() {
  const json = process.argv.includes("--json");
  const a = audit();
  if (json) { console.log(JSON.stringify(a, null, 2)); }
  else {
    const allow = readAllowlist();
    for (const r of lintAll()) {
      if (r.parseError) { console.log(`PARSE ${r.file}: ${r.parseError}`); continue; }
      for (const s of r.sites) console.log(`${allow[s.key] ? "audited " : "UNAUDITED"} ${r.file}:${s.line}  ${s.key.split("::")[1]}`);
    }
    for (const k of a.stale) console.log(`STALE allowlist entry (no such site): ${k}`);
    for (const m of a.miscounted) console.log(`COUNT ${m.key}: allowlist says ${m.want}, tree has ${m.got}`);
    if (a.unaudited.length) {
      console.log("\nFix: build the node with Dom.el()/textContent, or escape the dynamic part;");
      console.log(`only a site whose dynamic parts cannot carry player text belongs in ${ALLOWLIST}.`);
    }
  }
  const bad = a.unaudited.length + a.stale.length + a.miscounted.length + a.parseErrors.length;
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
