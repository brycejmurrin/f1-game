// store-key-scan.mjs — the one source walk and storage-receiver test shared by
// the apex26.* key tripwires (store-registry, save-schema-registry; #3040 T4-15).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Data-table files the apex26.* write/read scans skip (not writers). Do NOT
 *  exclude `setup-presets.js` — it writes `setupPresets.<team>` (#review F1). */
const SKIP_JS = new Set(["presets.js", "elev-presets.js"]);

/** Every scannable js/ file (circuits, vendored code and lighting/elev presets tables excluded). */
export function jsFiles(dir = "js", out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!/^js\/circuits$|vendor|three\/lib/.test(p)) jsFiles(p, out); }
    else if (e.name.endsWith(".js") && !SKIP_JS.has(e.name)) out.push(p);
  }
  return out;
}

/** Depth-first AST walk calling fn on every typed node. */
export function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return; }
  if (typeof node.type === "string") fn(node);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "loc" || k === "range" || k === "parent") continue;
    walk(node[k], fn);
  }
}

/** True when `obj` is `localStorage`, `store`, or `<x>.store` (incl. GameStore.store). */
export function storageReceiver(obj) {
  if (!obj) return null;
  if (obj.type === "Identifier" && obj.name === "localStorage") return "ls";
  if (obj.type === "Identifier" && obj.name === "store") return "store";
  if (obj.type === "MemberExpression" && !obj.computed && obj.property && obj.property.name === "store") return "store";
  return null;
}

/** File-local localStorage wrappers (#5532): `function lsSet(k, v) { localStorage.setItem(k, v) }` or
 *  `const on = (k) => localStorage.getItem(k) === "1"`. Map wrapper name -> { op, param, range }: the
 *  localStorage op the wrapper relays its FIRST parameter to. Both key tripwires read wrapper calls
 *  through this one helper, so neither can go blind to a wrapper the other sees. `ast` needs `range`. */
export function lsWrappers(ast) {
  const wrappers = new Map();
  const fnOf = (n) => {
    if (n.type === "FunctionDeclaration" && n.id) return { name: n.id.name, fn: n };
    if (n.type === "VariableDeclarator" && n.id && n.id.type === "Identifier" && n.init
      && (n.init.type === "FunctionExpression" || n.init.type === "ArrowFunctionExpression")) return { name: n.id.name, fn: n.init };
    return null;
  };
  walk(ast, (n) => {
    const f = fnOf(n);
    if (!f || !f.fn.params.length || f.fn.params[0].type !== "Identifier") return;
    const param = f.fn.params[0].name;
    walk(f.fn.body, (c) => {
      if (c.type !== "CallExpression" || !c.callee || c.callee.type !== "MemberExpression" || c.callee.computed) return;
      if (storageReceiver(c.callee.object) !== "ls") return;
      const a0 = c.arguments && c.arguments[0];
      if (a0 && a0.type === "Identifier" && a0.name === param && !wrappers.has(f.name)) {
        wrappers.set(f.name, { op: c.callee.property.name, param, range: f.fn.range });
      }
    });
  });
  return wrappers;
}
