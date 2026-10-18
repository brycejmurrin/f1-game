#!/usr/bin/env node
/**
 * gen-agent-index.mjs — docs/agent-index.json, the hook page, and the impact map.
 * @doc Regenerates `docs/agent-index.json`, `docs/AGENT-HOOKS.md` and `tests/data/impact-map.json`; `--check`.
 * @skill agent-view
 *
 * One static pass, no browser. Hook rows are the object `agentHelp()` returns
 * in js/agent/agentview.js (string literals evaluated in place). Groups come
 * from tests/groups.json, circuits and modules from tools/manifest.cjs. The
 * impact map is the narrow static slice: a test that names a `js/…` path and
 * calls a function that file declares. Nightly V8 coverage and select-specs
 * consumption stay follow-ups (those files are outside this change).
 * No per-group test counts: any PR that adds a test would stale every other
 * one on merge (#2808); readers count with declaredTests() in select-budget.
 *
 *   node tools/docs/gen-agent-index.mjs
 *   node tools/docs/gen-agent-index.mjs --check
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { argGate, emit, isMain, readRepo, ROOT } from "../gen/gen-lib.mjs";
import { fileGlobal, rosterOf } from "../gen/gen-arch-table.mjs";
import { isTwinned } from "../ci/twinned-specs.mjs";

const require = createRequire(import.meta.url);
const espree = require("espree");
const MANIFEST = require("../manifest.cjs");

export const INDEX_TARGET = "docs/agent-index.json";
export const HOOKS_TARGET = "docs/AGENT-HOOKS.md";
export const IMPACT_TARGET = "tests/data/impact-map.json";
export const TARGET = INDEX_TARGET;
export const TARGETS = [INDEX_TARGET, HOOKS_TARGET, IMPACT_TARGET];

const HOOK_GROUPS = ["perceive", "detail", "know", "act", "fields", "read", "control", "model"];
const CALL_GROUPS = new Set(["read", "control"]);

function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, fn); }
    else if (v && typeof v.type === "string") walk(v, fn);
  }
}

function evalNode(node, consts) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal": return node.value;
    case "TemplateLiteral":
      if (node.expressions.length) return undefined;
      return node.quasis[0].value.cooked;
    case "Identifier":
      if (node.name === "undefined") return undefined;
      return consts.has(node.name) ? consts.get(node.name) : undefined;
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number")
        return -node.argument.value;
      return undefined;
    case "BinaryExpression": {
      if (node.operator !== "+") return undefined;
      const l = evalNode(node.left, consts);
      const r = evalNode(node.right, consts);
      if (typeof l === "string" && typeof r === "string") return l + r;
      if (typeof l === "number" && typeof r === "number") return l + r;
      return undefined;
    }
    case "ArrayExpression": {
      const out = [];
      for (const el of node.elements) {
        if (!el) return undefined;
        const v = evalNode(el, consts);
        if (v === undefined && !(el.type === "Identifier" && el.name === "undefined") && el.type !== "Literal")
          return undefined;
        out.push(v);
      }
      return out;
    }
    case "ObjectExpression": {
      const out = {};
      for (const p of node.properties) {
        if (p.type !== "Property" || p.computed) return undefined;
        const key = p.key.type === "Identifier" ? p.key.name
          : p.key.type === "Literal" ? String(p.key.value) : null;
        if (key == null) return undefined;
        const v = evalNode(p.value, consts);
        if (v === undefined && !(p.value.type === "Identifier" && (p.value.name === "undefined" || consts.has(p.value.name))) && p.value.type !== "Literal")
          return undefined;
        out[key] = v;
      }
      return out;
    }
    default: return undefined;
  }
}

/** The object `agentHelp()` returns, evaluated from source. */
export function agentHelpFromSource(src = readRepo("js/agent/agentview.js")) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "script", range: true });
  const decls = [];
  let ret = null;
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id?.type === "Identifier" && n.init) decls.push(n);
    if (n.type === "FunctionDeclaration" && n.id?.name === "agentHelp" && !ret) {
      walk(n.body, (inner) => {
        if (!ret && inner.type === "ReturnStatement" && inner.argument?.type === "ObjectExpression") ret = inner.argument;
      });
    }
  });
  if (!ret) throw new Error("agentHelp() return object not found in js/agent/agentview.js");
  decls.sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  const consts = new Map();
  for (const d of decls) {
    const v = evalNode(d.init, consts);
    if (v !== undefined) consts.set(d.id.name, v);
  }
  const obj = evalNode(ret, consts);
  if (!obj || typeof obj !== "object") throw new Error("agentHelp() return did not evaluate to an object");
  return obj;
}

function oneLine(s, cap = 180) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > cap ? t.slice(0, cap - 1).replace(/\s+\S*$/, "") + "…" : t;
}

/** Flat hook rows. `read` / `control` values are space-separated calls. */
export function flattenHooks(manifest) {
  const hooks = [];
  const seen = new Set();
  const push = (name, group, signature, summary) => {
    const key = `${group}\0${name}\0${signature}`;
    if (seen.has(key)) return;
    seen.add(key);
    hooks.push({ name, group, signature: oneLine(signature, 120), summary: oneLine(summary) });
  };
  for (const group of HOOK_GROUPS) {
    const table = manifest[group];
    if (!table || typeof table !== "object" || Array.isArray(table)) continue;
    for (const [key, val] of Object.entries(table)) {
      const text = typeof val === "string" ? val : "";
      if (CALL_GROUPS.has(group) && text) {
        const calls = text.match(/[A-Za-z_][\w]*\s*\([^)]*\)/g);
        if (calls?.length) {
          for (const call of calls) {
            const name = call.slice(0, call.indexOf("(")).trim();
            push(name, group, call.replace(/\s+/g, ""), text);
          }
          continue;
        }
      }
      const name = key.includes("(") ? key.slice(0, key.indexOf("(")).trim() : key;
      push(name, group, key, text);
    }
  }
  hooks.sort((a, b) => HOOK_GROUPS.indexOf(a.group) - HOOK_GROUPS.indexOf(b.group)
    || a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature));
  return hooks;
}

function groupsTable() {
  const groups = JSON.parse(readRepo("tests/groups.json")).groups || {};
  return Object.keys(groups).sort().map((script) => {
    const def = groups[script] || {};
    const files = (def.files || []).filter((f) => typeof f === "string" && !f.startsWith("//")).sort();
    return {
      id: script.replace(/^test:/, ""),
      script,
      kind: def.kind || null,
      files,
      twinned: files.some((f) => isTwinned(f)),
    };
  });
}

function circuitsTable() {
  return MANIFEST.CIRCUITS.map((id, order) => {
    const file = MANIFEST.circuitPath(id);
    const head = readRepo(file).slice(0, 5000);
    return { id, file, order, classic: /classic:\s*true/.test(head) };
  });
}

function modulesTable() {
  let ratchet = {};
  try { ratchet = JSON.parse(readRepo("tests/data/ratchets.json")).files || {}; } catch { /* none */ }
  const out = [];
  let order = 0;
  for (const [rel, roster] of rosterOf()) {
    const row = { path: rel, global: fileGlobal(rel, readRepo(rel)), order, roster };
    if (ratchet[rel]?.lines != null) row.ratchetLines = ratchet[rel].lines;
    out.push(row);
    order += 1;
  }
  return out;
}

export function buildIndex(manifest = agentHelpFromSource()) {
  return {
    generatedBy: "tools/docs/gen-agent-index.mjs",
    apiVersion: manifest.apiVersion ?? null,
    physicsVersion: manifest.physicsVersion ?? null,
    conventions: typeof manifest.conventions === "string" ? manifest.conventions : "",
    hooks: flattenHooks(manifest),
    groups: groupsTable(),
    circuits: circuitsTable(),
    modules: modulesTable(),
  };
}

export function renderIndex(index = buildIndex()) {
  return JSON.stringify(index, null, 2) + "\n";
}

export function renderHookPage(index = buildIndex()) {
  const lines = [
    "# Agent hooks",
    "",
    "_Generated by `node tools/docs/gen-agent-index.mjs` from `agentHelp()` in `js/agent/agentview.js`. Do not hand-edit. One hook from a shell: `node tools/shot/agent.mjs help <hook>`. The same rows are `docs/agent-index.json`. The long reference stays `docs/DEBUG-HOOKS.md`._",
    "",
    "```sh",
    "jq '.hooks[] | select(.name==\"physState\")' docs/agent-index.json",
    "```",
    "",
  ];
  let group = "";
  for (const hook of index.hooks) {
    if (hook.group !== group) {
      group = hook.group;
      lines.push(`## ${group}`, "", "| Hook | Signature | Summary |", "|---|---|---|");
    }
    lines.push(`| \`${hook.name.replace(/\|/g, "\\|")}\` | \`${hook.signature.replace(/\|/g, "\\|")}\` | ${hook.summary.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n").replace(/\n+$/, "\n");
}

const FN_STOP = new Set(["function", "return", "const", "test", "assert", "async", "await"]);

function functionsIn(src) {
  const names = new Set();
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (m[1].length >= 4 && !FN_STOP.has(m[1])) names.add(m[1]);
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/g)) {
    if (m[1].length >= 4 && !FN_STOP.has(m[1])) names.add(m[1]);
  }
  return names;
}

function testFiles() {
  const out = [];
  for (const [dir, re] of [["tests/specs", /\.spec\.js$/], ["tests/unit", /\.test\.(mjs|cjs)$/]]) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).filter((n) => re.test(n)).sort())
      out.push(`${dir}/${name}`);
  }
  return out;
}

/** `{ file: { fn: [specs] } }` from tests that both name the path and call the function. */
export function buildImpactMap() {
  const fnCache = new Map();
  const map = new Map();
  const funcs = (rel) => {
    if (!fnCache.has(rel)) {
      try { fnCache.set(rel, functionsIn(readRepo(rel))); }
      catch { fnCache.set(rel, new Set()); }
    }
    return fnCache.get(rel);
  };
  const add = (file, fn, spec) => {
    if (!map.has(file)) map.set(file, new Map());
    const row = map.get(file);
    if (!row.has(fn)) row.set(fn, []);
    row.get(fn).push(spec);
  };
  for (const spec of testFiles()) {
    const text = readRepo(spec);
    const paths = new Set();
    for (const m of text.matchAll(/\b(js\/[A-Za-z0-9_./-]+\.js)\b/g)) {
      if (fs.existsSync(path.join(ROOT, m[1]))) paths.add(m[1]);
    }
    for (const file of [...paths].sort()) {
      const hits = [];
      for (const name of funcs(file)) {
        if (text.includes(name + "(")) hits.push(name);
      }
      hits.sort();
      if (!hits.length) add(file, "*", spec);
      else for (const name of hits) add(file, name, spec);
    }
  }
  const out = {};
  for (const file of [...map.keys()].sort()) {
    const row = {};
    const fns = [...map.get(file).keys()].sort((a, b) => (a === "*") - (b === "*") || a.localeCompare(b));
    for (const fn of fns) row[fn] = [...new Set(map.get(file).get(fn))].sort();
    out[file] = row;
  }
  return {
    generatedBy: "tools/docs/gen-agent-index.mjs",
    kind: "static-reference",
    narrowOnly: true,
    note: "A test is listed under a function when it names that js path and spells name(. Nightly V8 ranges and select-specs narrowing are follow-ups.",
    map: out,
  };
}

export function renderImpact(map = buildImpactMap()) {
  return JSON.stringify(map, null, 2) + "\n";
}

function outputs() {
  const index = buildIndex();
  return [
    [INDEX_TARGET, renderIndex(index)],
    [HOOKS_TARGET, renderHookPage(index)],
    [IMPACT_TARGET, renderImpact()],
  ];
}

function main() {
  const argv = process.argv.slice(2);
  const gated = argGate(argv, { tool: "tools/docs/gen-agent-index.mjs" });
  if (gated !== null) return gated;
  const check = argv.includes("--check") ? ["--check"] : [];
  let code = 0;
  for (const [rel, body] of outputs()) {
    const c = emit(rel, body, check);
    if (c) code = c;
  }
  return code;
}

if (isMain(import.meta.url)) process.exit(main());
