#!/usr/bin/env node
/**
 * @doc Fails when a file destructures a name its script-global provider does not export (a dropped name after a rebase).
 * @skill slim-bloat
 * destructure-usage.mjs — `const { camVantage } = Global;` reads `undefined` when a merge
 * or rebase drops `camVantage` from Global's export object: nothing fails at load, then 30+
 * downstream tests fail at first use (2026-10-16: a rebase dropped `camVantage`, 32 circuit
 * tests red). This check resolves each `const {…} = Name` whose `Name` is a script global
 * (eslint-scope: unresolved in that file) to the manifest file that defines `Name` as an IIFE
 * returning an object literal, and fails when a destructured key is not in that literal.
 *
 *   node tools/check/destructure-usage.mjs          # exit 1 on a missing name
 *   node tools/check/destructure-usage.mjs --json
 *
 * Conservative: a global whose export cannot be read statically (a spread, a computed key,
 * `Object.assign(Name, …)`, no object-literal return) is skipped, a `Name.key = …` expando
 * anywhere counts as a provider of `key`, and a destructure with a default (`{ a = 1 }`) is
 * allowed to miss. The façade `G` is check-gctx.mjs's job.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const espree = require("espree");
const eslintScope = require("eslint-scope");

const parse = (src) => espree.parse(src, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true });

function walk(node, visit, parent = null) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node, parent);
  for (const key in node) {
    if (key === "parent") continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit, node);
    else if (v && typeof v === "object") walk(v, visit, node);
  }
}

const keyName = (p) => (p.computed ? null : p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null);

/** Keys of an ObjectExpression, or null when it is not statically readable. */
function objectKeys(obj) {
  const keys = new Set();
  for (const p of obj.properties) {
    if (p.type !== "Property") return null;
    const k = keyName(p);
    if (k === null) return null;
    keys.add(k);
  }
  return keys;
}

/** The object literal a top-level `const Name = (function () { … return {…}; })()` hands out. */
function exportObject(init) {
  if (!init) return null;
  if (init.type === "ObjectExpression") return init;
  if (init.type !== "CallExpression") return null;
  const fn = init.callee.type === "FunctionExpression" || init.callee.type === "ArrowFunctionExpression" ? init.callee : null;
  if (!fn || fn.body.type !== "BlockStatement") return null;
  const rets = fn.body.body.filter((s) => s.type === "ReturnStatement");
  const last = rets[rets.length - 1];
  return last && last.argument && last.argument.type === "ObjectExpression" ? last.argument : null;
}

/**
 * PURE. `files` is [{ rel, src }]. Returns { missing: [{ file, line, global, name, provider }], checked }.
 */
export function check(files) {
  const asts = files.map((f) => {
    try { return { ...f, ast: parse(f.src) }; } catch { return { ...f, ast: null }; }
  });
  // Providers: top-level declarations of an exportable global.
  const exports = new Map(); // global → { keys:Set|null, rel }
  for (const f of asts) {
    if (!f.ast) continue;
    for (const st of f.ast.body) {
      if (st.type !== "VariableDeclaration") continue;
      for (const d of st.declarations) {
        if (d.id.type !== "Identifier") continue;
        const obj = exportObject(d.init);
        if (!obj) continue;
        exports.set(d.id.name, { keys: objectKeys(obj), rel: f.rel });
      }
    }
  }
  // Expandos and Object.assign anywhere make a provider.
  for (const f of asts) {
    if (!f.ast) continue;
    walk(f.ast, (n) => {
      if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && n.left.object.type === "Identifier") {
        const e = exports.get(n.left.object.name);
        if (e && e.keys) {
          const k = n.left.computed ? (n.left.property.type === "Literal" ? String(n.left.property.value) : null) : n.left.property.name;
          if (k === null) e.keys = null; else e.keys.add(k);
        }
      } else if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.object.name === "Object"
        && ["assign", "defineProperty", "defineProperties"].includes(n.callee.property.name) && n.arguments[0]?.type === "Identifier") {
        const e = exports.get(n.arguments[0].name);
        if (e) e.keys = null;
      }
    });
  }
  const missing = [];
  let checked = 0;
  for (const f of asts) {
    if (!f.ast) continue;
    const scopes = eslintScope.analyze(f.ast, { ecmaVersion: 2022, sourceType: "script" });
    const unresolved = new Set();
    for (const ref of scopes.globalScope.through) unresolved.add(ref.identifier);
    walk(f.ast, (n) => {
      if (n.type !== "VariableDeclarator" || n.id.type !== "ObjectPattern" || !n.init || n.init.type !== "Identifier") return;
      if (!unresolved.has(n.init)) return; // a local binding, or this file's own provider
      const e = exports.get(n.init.name);
      if (!e || !e.keys) return;
      checked++;
      for (const p of n.id.properties) {
        if (p.type !== "Property" || p.value.type === "AssignmentPattern") continue;
        const k = keyName(p);
        if (k !== null && !e.keys.has(k)) missing.push({ file: f.rel, line: p.loc.start.line, global: n.init.name, name: k, provider: e.rel });
      }
    });
  }
  return { missing, checked };
}

/** Every rostered script (the same set check-gctx reads). */
export function rosteredFiles() {
  const M = require("../manifest.cjs");
  const rels = new Set([
    ...M.FULL, ...Object.values(M.DEFERRED).flat(), ...M.LAZY_AGENT, ...M.LAZY_RACE, ...(M.LAZY_RACE_SESSION || []),
    ...(M.LAZY_AUDIO || []), ...M.LAZY_DATA, ...M.LAZY_NET, ...(M.LAZY_EDITOR || []), ...(M.LAZY_XR || []),
    ...(M.LAZY_CAM_EDITOR || []), ...(M.LAZY_CAREER_UI || []), ...(M.LAZY_TRACK_BUILD || []),
  ]);
  return [...rels].filter((r) => r.endsWith(".js") && fs.existsSync(path.join(ROOT, r)))
    .map((rel) => ({ rel, src: fs.readFileSync(path.join(ROOT, rel), "utf8") }));
}

function main() {
  const r = check(rosteredFiles());
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    for (const m of r.missing) console.error(`${m.file}:${m.line} destructures ${m.name} from ${m.global}, which ${m.provider} does not export`);
    console.log(`destructure-usage: ${r.checked} destructure(s) of script globals checked, ${r.missing.length} missing`);
  }
  process.exitCode = r.missing.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
