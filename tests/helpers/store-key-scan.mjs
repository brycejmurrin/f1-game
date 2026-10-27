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
