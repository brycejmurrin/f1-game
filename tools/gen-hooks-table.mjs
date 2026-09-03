#!/usr/bin/env node
/**
 * gen-hooks-table.mjs — the `__apex` hook index block in docs/DEBUG-HOOKS.md.
 * @doc Regenerates the `__apex` hook index block in `docs/DEBUG-HOOKS.md` from `apex.js` + `agentHelp()`; `--check`.
 * @skill agent-view
 *
 * docs/DEBUG-HOOKS.md calls itself the full reference and is 150 KB of hand
 * prose; nothing in it could answer "what hooks exist, with what parameters"
 * without reading the whole file. This generator owns ONE block —
 * `<!-- GENERATED: hooks-table -->` … `<!-- /GENERATED -->` — and lists:
 *
 *   1. every top-level key of `const api = {…}` in js/agent/apex.js (methods,
 *      `async` methods, arrow/function values, and namespaces such as tiltSim),
 *      with its signature AS WRITTEN IN SOURCE (parameter names, defaults,
 *      rest) and a one-line summary taken from the comment immediately above
 *      the hook when there is one;
 *   2. the agent-view surface as `agentHelp()` in js/agent/agentview.js
 *      describes it (perceive / detail / know / act), evaluated from source.
 *
 * Parsed with espree (the same parser tools/check-gctx.mjs and
 * tools/cross-file-paths.mjs use), so a hook cannot hide from a regex. The
 * hand sections stay; tests/unit/hooks-documented.test.mjs keeps requiring a
 * hand section per hook with this block stripped, so the table is an index,
 * not a way to skip writing one.
 *
 *   node tools/gen-hooks-table.mjs            # write
 *   node tools/gen-hooks-table.mjs --check    # exit 1 when committed ≠ generated
 */
import { createRequire } from "node:module";
import { emit, isMain, readRepo, replaceBlock } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);
const espree = require("espree");

export const TARGET = "docs/DEBUG-HOOKS.md";
export const APEX = "js/agent/apex.js";
export const AGENTVIEW = "js/agent/agentview.js";

function parse(src) {
  return espree.parse(src, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true, comment: true });
}

/** Depth-first search for the first node satisfying `pred`. */
function find(node, pred) {
  if (!node || typeof node.type !== "string") return null;
  if (pred(node)) return node;
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) { const r = find(c, pred); if (r) return r; } }
    else if (v && typeof v.type === "string") { const r = find(v, pred); if (r) return r; }
  }
  return null;
}

const keyName = (p) => (p.key.type === "Identifier" ? p.key.name : String(p.key.value));

function params(src, fn) {
  return fn.params.map((p) => src.slice(p.range[0], p.range[1]).replace(/\s+/g, " ")).join(", ");
}

/** Signature as written: name(params), plus what kind of value it is. */
function signature(src, prop) {
  const name = keyName(prop);
  const v = prop.value;
  if (v.type === "FunctionExpression" || v.type === "ArrowFunctionExpression") {
    return { sig: `${v.async ? "async " : ""}${name}(${params(src, v)})`, kind: v.async ? "async" : "fn" };
  }
  if (v.type === "ObjectExpression") {
    const members = v.properties.filter((p) => p.type === "Property").map((p) => {
      const pv = p.value;
      const isFn = pv.type === "FunctionExpression" || pv.type === "ArrowFunctionExpression";
      return keyName(p) + (isFn ? `(${params(src, pv)})` : "");
    });
    return { sig: name, kind: "namespace", members };
  }
  return { sig: name, kind: "value", expr: src.slice(v.range[0], v.range[1]).replace(/\s+/g, " ").slice(0, 60) };
}

/** The contiguous comment block whose last line sits directly above `line`. */
function commentAbove(comments, line) {
  const block = [];
  let want = line - 1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.loc.end.line > want) continue;
    if (c.loc.end.line < want) break;
    block.unshift(c);
    want = c.loc.start.line - 1;
    if (c.type === "Block") break;
  }
  return block;
}

function summarise(block, name) {
  if (!block.length) return "";
  const text = block.map((c) => c.value).join("\n")
    .split("\n").map((l) => l.replace(/^\s*\*+\s?/, "").trim()).filter(Boolean).join(" ")
    .replace(/\s+/g, " ").trim();
  // Drop a leading "name(...) —" / "name —" restatement of the hook itself.
  let s = text.replace(new RegExp(`^${name.replace(/\$/g, "\\$")}\\s*(\\([^)]*\\))?\\??\\s*[—:-]\\s*`), "");
  // First sentence, bounded.
  const m = s.match(/^(.*?[.!?])(\s|$)/);
  if (m && m[1].length >= 24) s = m[1];
  if (s.length > 150) s = s.slice(0, 147).replace(/\s+\S*$/, "") + "…";
  return s.replace(/\|/g, "\\|");
}

export function collectHooks() {
  const src = readRepo(APEX);
  const ast = parse(src);
  const decl = find(ast, (n) => n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === "api"
    && n.init && n.init.type === "ObjectExpression");
  if (!decl) throw new Error(`${APEX}: could not find \`const api = {…}\``);
  const comments = ast.comments;
  const hooks = [];
  for (const p of decl.init.properties) {
    if (p.type !== "Property") throw new Error(`${APEX}:${p.loc.start.line}: unexpected ${p.type} in api — spreads hide hooks from the index`);
    const s = signature(src, p);
    const summary = summarise(commentAbove(comments, p.loc.start.line), keyName(p));
    hooks.push({ name: keyName(p), line: p.loc.start.line, ...s, summary });
  }
  return hooks;
}

/** Fold a string-concatenation expression into its text. */
function stringOf(node) {
  if (node.type === "Literal") return String(node.value);
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("");
  if (node.type === "BinaryExpression" && node.operator === "+") return stringOf(node.left) + stringOf(node.right);
  throw new Error(`agentHelp(): cannot fold ${node.type} at line ${node.loc.start.line}`);
}

export function collectAgentSurface() {
  const src = readRepo(AGENTVIEW);
  const ast = parse(src);
  const fn = find(ast, (n) => n.type === "FunctionDeclaration" && n.id && n.id.name === "agentHelp");
  if (!fn) throw new Error(`${AGENTVIEW}: could not find function agentHelp()`);
  const ret = find(fn.body, (n) => n.type === "ReturnStatement" && n.argument && n.argument.type === "ObjectExpression");
  if (!ret) throw new Error("agentHelp(): no object return");
  const groups = [];
  for (const p of ret.argument.properties) {
    if (p.type !== "Property" || p.value.type !== "ObjectExpression") continue;
    const g = keyName(p);
    if (!["perceive", "detail", "know", "act"].includes(g)) continue;
    const calls = p.value.properties.filter((q) => q.type === "Property")
      .map((q) => ({ call: keyName(q).replace(/\|/g, "\\|"), says: stringOf(q.value).replace(/\s+/g, " ").replace(/\|/g, "\\|") }));
    groups.push({ group: g, calls });
  }
  if (!groups.length) throw new Error("agentHelp(): no perceive/detail/know/act groups found");
  return groups;
}

export function renderBlock() {
  const hooks = collectHooks();
  const agent = collectAgentSurface();
  const nAsync = hooks.filter((h) => h.kind === "async").length;
  const out = [
    "## Hook index",
    "",
    `_Generated by \`node tools/gen-hooks-table.mjs\` from \`const api = {…}\` in \`js/agent/apex.js\` (${hooks.length} hooks, ${nAsync} async) and \`agentHelp()\` in \`js/agent/agentview.js\`. Signatures are as written in source; the summary is the comment directly above each hook. The sections below this index are the hand-written reference and are required for every hook (\`tests/unit/hooks-documented.test.mjs\`); \`--check\` guards this block (\`tests/unit/generated-docs.test.mjs\`)._`,
    "",
    "| Hook | Summary |",
    "|---|---|",
  ];
  for (const h of hooks) {
    let summary = h.summary;
    if (h.kind === "namespace") summary = `namespace: ${h.members.map((m) => `\`${m}\``).join(", ")}${summary ? ` — ${summary}` : ""}`;
    else if (h.kind === "value") summary = summary || `value: \`${h.expr}\``;
    out.push(`| \`${h.sig}\` | ${summary || "—"} |`);
  }
  out.push("", "### Agent view surface (`__apex.agentHelp()`)", "", "| Group | Call | What it answers |", "|---|---|---|");
  for (const g of agent) for (const c of g.calls) out.push(`| ${g.group} | \`${c.call}\` | ${c.says} |`);
  out.push("");
  return out.join("\n");
}

export function render(existing) {
  return replaceBlock(existing, "hooks-table", renderBlock());
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = emit(TARGET, render(readRepo(TARGET)));
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 2;
  }
}
