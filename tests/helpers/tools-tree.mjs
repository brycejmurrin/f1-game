/* tools-tree.mjs — the tools/ walk shared by the four tools-runnable*.test.mjs
 * files (split out of tools-runnable.test.mjs, #3043 T5-12): ROOT, TOOLS, the
 * file list, and tool(name) — a tool's absolute path by basename. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const TOOLS = path.join(ROOT, "tools");

export function toolFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // tools/_*.mjs is transient agent scratch by convention (.gitignore).
      if (e.name.startsWith("_") || e.name === "__pycache__") continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else out.push({ abs, rel: r, ext: path.extname(e.name) });
    }
  };
  walk(TOOLS, "");
  return out;
}

export const FILES = toolFiles();

/** Absolute path of a tool by BASENAME. tools/ is grouped into subdirectories
 *  (lib, ci, check, gen, shot, gfx, track, car, ui, lighting, mcp, net, env)
 *  and a tool moving between them is not a fact this file should have an
 *  opinion about — every assertion below is about what the tool DOES. A name
 *  that is ambiguous or absent fails loudly rather than silently skipping. */
export function tool(name) {
  const hits = FILES.filter((f) => f.rel === name || f.rel.endsWith(`/${name}`));
  assert.equal(hits.length, 1, `tool(${name}): expected one match, found ${hits.map((h) => h.rel).join(", ") || "none"}`);
  return hits[0].abs;
}
