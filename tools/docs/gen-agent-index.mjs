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
 * calls a function that file declares. Manual `narrow` pins live in
 * `tests/data/impact-map.d/*.json` (select-specs reads them via tools/lib/impact-map.mjs).
 * Nightly V8 coverage is still a follow-up.
 * No per-group test counts: any PR that adds a test would stale every other
 * one on merge (#2808); readers count with declaredTests() in select-budget.
 * No positional counters either (2026-10-28): module and circuit rows carried
 * `order`, their index in the manifest roster, so one added module renumbered
 * every later row. #4020 and #3982 each added a js/ module, landed 3.5 min
 * apart, and git merged the two renumberings clean into a stale file (`order`
 * 341 vs 342) that failed gen:check on every PR until #4054 regenerated it.
 * Nothing read the field, so it is dropped rather than replaced by an `after:`
 * link (that still rewrites one neighbour per insertion). A row is keyed and
 * sorted by its path or id alone, so an insertion is one added row and two
 * insertions merge to their union in either landing order (pinned by
 * tests/unit/gen-agent-index-order.test.mjs). Load order lives only in
 * tools/manifest.cjs: read FULL, DEFERRED and the LAZY_* lists there.
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

/** Plain string compare — locale-free so gen output matches across hosts (no localeCompare). */
export function cmpStr(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable id order; ties break on source path. */
export function cmpIdThenPath(aId, bId, aPath = "", bPath = "") {
  return cmpStr(aId, bId) || cmpStr(aPath, bPath);
}

/** Sort a copy by id ascending, ties by source path. */
export function sortById(items, idOf, pathOf = () => "") {
  return items.slice().sort((a, b) => cmpIdThenPath(idOf(a), idOf(b), pathOf(a), pathOf(b)));
}

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
  // Group order fixed; within a group sort by name id, ties by signature (source key).
  return sortById(
    hooks,
    (h) => `${String(HOOK_GROUPS.indexOf(h.group)).padStart(2, "0")}\0${h.name}`,
    (h) => h.signature,
  );
}

function groupsTable() {
  const groups = JSON.parse(readRepo("tests/groups.json")).groups || {};
  const rows = Object.keys(groups).map((script) => {
    const def = groups[script] || {};
    const files = (def.files || [])
      .filter((f) => typeof f === "string" && !f.startsWith("//"))
      .slice()
      .sort(cmpStr);
    return {
      id: script.replace(/^test:/, ""),
      script,
      kind: def.kind || null,
      files,
      twinned: files.some((f) => isTwinned(f)),
    };
  });
  return sortById(rows, (r) => r.id, (r) => r.script);
}

/** Circuit rows sorted by id. No roster index (header): `ids` is injectable for the merge test. */
export function circuitsTable(ids = MANIFEST.CIRCUITS) {
  const rows = ids.map((id) => {
    const file = MANIFEST.circuitPath(id);
    const head = readRepo(file).slice(0, 5000);
    return { id, file, classic: /classic:\s*true/.test(head) };
  });
  return sortById(rows, (r) => r.id, (r) => r.file);
}

// NO ratchetLines (2026-10-26, audit lane X3): the field copied tests/data/ratchets.json alone, so between folds
// it showed ceilings the ratchets.d fragments had already moved, and nothing read it. Applying the fragments
// instead would make every commit-hook auto-raise stale this generated file. The live ceilings are
// `node tools/check/ratchets.mjs` (base + fragments).
/** Module rows sorted by path. No load-order counter (header): `roster` (path → label) is injectable for the merge test. */
export function modulesTable(roster = rosterOf()) {
  const out = [];
  for (const [rel, label] of roster) out.push({ path: rel, global: fileGlobal(rel, readRepo(rel)), roster: label });
  return sortById(out, (r) => r.path, (r) => r.roster || "");
}

/** `opts.roster` / `opts.circuits` replace the manifest's lists (tests only). */
export function buildIndex(manifest = agentHelpFromSource(), opts = {}) {
  return {
    generatedBy: "tools/docs/gen-agent-index.mjs",
    apiVersion: manifest.apiVersion ?? null,
    physicsVersion: manifest.physicsVersion ?? null,
    conventions: typeof manifest.conventions === "string" ? manifest.conventions : "",
    hooks: flattenHooks(manifest),
    groups: groupsTable(),
    circuits: circuitsTable(opts.circuits),
    modules: modulesTable(opts.roster),
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
    for (const name of fs.readdirSync(path.join(ROOT, dir)).filter((n) => re.test(n)).sort(cmpStr))
      out.push(`${dir}/${name}`);
  }
  return out;
}

/** Re-key a `{ file: { fn: [specs] } }` map in deterministic id order. */
export function sortImpactMap(map) {
  const sorted = {};
  for (const file of Object.keys(map).sort(cmpStr)) {
    const row = map[file] || {};
    const sortedRow = {};
    const fns = Object.keys(row).sort((a, b) => (a === "*") - (b === "*") || cmpStr(a, b));
    for (const fn of fns) sortedRow[fn] = [...new Set(row[fn] || [])].sort(cmpStr);
    sorted[file] = sortedRow;
  }
  return sorted;
}

/** `{ file: { fn: [specs] } }` from tests that both name the path and call the function. */
export function buildImpactMap(specList = testFiles()) {
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
  for (const spec of specList) {
    const text = readRepo(spec);
    const paths = new Set();
    for (const m of text.matchAll(/\b(js\/[A-Za-z0-9_./-]+\.js)\b/g)) {
      if (fs.existsSync(path.join(ROOT, m[1]))) paths.add(m[1]);
    }
    for (const file of [...paths].sort(cmpStr)) {
      const hits = [];
      for (const name of funcs(file)) {
        if (text.includes(name + "(")) hits.push(name);
      }
      hits.sort(cmpStr);
      if (!hits.length) add(file, "*", spec);
      else for (const name of hits) add(file, name, spec);
    }
  }
  const out = {};
  for (const file of [...map.keys()].sort(cmpStr)) {
    const row = {};
    const fns = [...map.get(file).keys()].sort((a, b) => (a === "*") - (b === "*") || cmpStr(a, b));
    for (const fn of fns) row[fn] = [...new Set(map.get(file).get(fn))].sort(cmpStr);
    out[file] = row;
  }
  return {
    generatedBy: "tools/docs/gen-agent-index.mjs",
    kind: "static-reference",
    narrowOnly: true,
    note: "A test is listed under a function when it names that js path and spells name(. The `narrow` key is hand-pinned in tests/data/impact-map.d/ for select-specs.",
    map: mergeImpactPinFiles(out),
  };
}

/** Merge hand-pinned `narrow` rows from tests/data/impact-map.d/*.json into the generated map. */
export function mergeImpactPinFiles(map) {
  const dir = path.join(ROOT, "tests/data/impact-map.d");
  if (!fs.existsSync(dir)) return sortImpactMap(map);
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort(cmpStr)) {
    let frag;
    try { frag = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); }
    catch { continue; }
    const pins = frag.pins || frag;
    for (const [file, fnMap] of Object.entries(pins)) {
      if (!map[file]) map[file] = {};
      for (const [fn, specs] of Object.entries(fnMap)) {
        map[file][fn] = [...new Set([...(map[file][fn] || []), ...specs])].sort(cmpStr);
      }
    }
  }
  // Pin files can insert new keys after the sorted pass — re-sort by id.
  return sortImpactMap(map);
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
