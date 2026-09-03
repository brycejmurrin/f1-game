#!/usr/bin/env node
// @doc Tree-wide counts behind the `tree` ratchets: CSS class tokens, shell DOM nodes, bare catches, unpolled waits.
/**
 * tree-counts.mjs — the measurements behind `tree` entries in
 * tests/data/ratchets.json.
 *
 * These four numbers used to live as `const CEILING = N` beside the assertion
 * in two unit files, each with its own slack rule and its own copy of the walk.
 * The measurement is the reusable part, so it moved here; the number moved to
 * ratchets.json; the ceiling history moved to docs/notes/CEILING-HISTORY.md.
 * Behaviour is unchanged — each function is the original scan, moved verbatim.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** SKILL.md: grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l */
export function classTokens() {
  const dir = path.join(ROOT, "css");
  const seen = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css")).sort())
    for (const m of fs.readFileSync(path.join(dir, f), "utf8")
      .matchAll(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g)) seen.add(m[0]);
  return seen;
}

/** SKILL.md rule 13: grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l —
 *  minus the <script>/<link> tags, which are a projection of tools/manifest.cjs
 *  (written by gen-shell) and not DOM the page renders; counting them made
 *  every new js file a ratchet edit. */
export function shellNodes() {
  return [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)].filter((m) => m[1] !== "script" && m[1] !== "link").length;
}

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Brace-match each catch body, so a nested block does not end it early.
 *  A body with a comment in it is allowed — it says why it swallows. */
export function bareCatchSites(src) {
  const hits = [];
  for (const m of src.matchAll(/catch\s*\([^)]*\)\s*\{/g)) {
    const start = m.index + m[0].length;
    let depth = 1, j = start;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const raw = src.slice(start, j - 1);
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
    if (stripped) continue;                       // handles the error somehow
    if (raw.trim()) continue;                     // empty, but says why — allowed
    hits.push(src.slice(0, start).split("\n").length);
  }
  return hits;
}

/** Every bare `catch (e) {}` under js/, with its file and line, worst first. */
export function bareCatchReport() {
  const rows = [];
  for (const abs of walkJs(path.join(ROOT, "js"))) {
    const lines = bareCatchSites(fs.readFileSync(abs, "utf8"));
    if (lines.length) rows.push({ file: path.relative(ROOT, abs).replace(/\\/g, "/"), lines });
  }
  return rows.sort((a, b) => b.lines.length - a.lines.length);
}

export const bareCatches = () => bareCatchReport().reduce((n, r) => n + r.lines.length, 0);

/** waitForFunction calls that declare a timeout but no polling — the wait that
 *  cannot fire on a rendering page. The lint itself lives in wait-polling-lint. */
export async function waitNoPolling() {
  const { count } = await import("./wait-polling-lint.mjs");
  return count();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({
    cssClasses: classTokens().size,
    shellNodes: shellNodes(),
    bareCatches: bareCatches(),
    waitNoPolling: await waitNoPolling(),
  }, null, 2));
}
