#!/usr/bin/env node
// @doc Counts behind the `tree` ratchets: CSS classes/spacing/colour, shell nodes, bare catches, unpolled waits. `--offenders`.
/**
 * tree-counts.mjs — the measurements behind `tree` entries in
 * tests/data/ratchets.json.
 *
 * These numbers used to live as `const CEILING = N` beside the assertion in
 * three unit files, each with its own slack rule and its own copy of the walk.
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

/* ---- the CSS token-adoption counters -------------------------------------
 * Moved here from tests/unit/css-token-adoption.test.mjs so the counts feed
 * the one ratchet mechanism and the OFFENDER LISTS come off the same pass —
 * a number that fails is useless without the breakdown that says where.
 * Every scan below is the original, moved unchanged; the policy prose that
 * justifies each exception stayed with the test, and the ceiling history
 * moved to docs/notes/CEILING-HISTORY.md.
 */

/** Strip comments as a CSS tokenizer does, so prose citing an old value is not a declaration. */
export function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;
    i = close + 2;
  }
  return out;
}

export function sheets() {
  const dir = path.join(ROOT, "css");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".css")).sort()
    .map((f) => ({ name: f, src: stripComments(fs.readFileSync(path.join(dir, f), "utf8")) }));
}

/* The floor comes from the sheet, not from a copy of it here: if someone raises
   --fs-micro, this guard must move with it rather than keep asserting 14. */
export function microFloor(all = sheets()) {
  const tokens = all.find((s) => s.name === "tokens.css");
  if (!tokens) throw new Error("css/tokens.css missing");
  const m = tokens.src.match(/--fs-micro:\s*([0-9.]+)px/);
  if (!m) throw new Error("could not read --fs-micro from css/tokens.css — the scan broke, not the sheet");
  return parseFloat(m[1]);
}

/** font-size declarations whose value carries a px literal below --fs-micro.
 *  Every px literal in the VALUE, not just a bare `font-size: 12px`: the narrow
 *  form let `min()`/`clamp()` walk straight past the floor. */
export function subFloorFontSizeReport() {
  const all = sheets();
  const floor = microFloor(all);
  const rows = [];
  for (const { name, src } of all)
    for (const decl of src.matchAll(/font-size:([^;}]*)/g))
      for (const m of decl[1].matchAll(/([0-9.]+)px/g))
        if (parseFloat(m[1]) < floor) rows.push({ file: name, value: `${m[1]}px` });
  return rows;
}
export const subFloorFontSize = () => subFloorFontSizeReport().length;

/** padding / gap / margin declarations containing a raw px literal. */
export function rawSpacingReport() {
  const rows = [];
  for (const { name, src } of sheets())
    for (const m of src.matchAll(/(?:padding|margin|gap|row-gap|column-gap)[a-z-]*:\s*[^;{}]*?[0-9.]+px[^;{}]*/g))
      rows.push({ file: name, value: m[0].trim().slice(0, 60) });
  return rows;
}
export const rawSpacing = () => rawSpacingReport().length;

/* Colours appear across many properties (color, background, border-*, shadows,
   gradients), so the counter iterates declaration VALUES generically instead of
   anchoring on a property list — [^;{}] confines each match to one declaration,
   which is what keeps selectors out (verified: no selector in this tree contains
   a 3/4/6/8-hex token or an rgb() call). Gradient and color-mix interiors are
   deliberately IN scope: they are where #fff and #000 hide. */
const COLOR_DECL = /(--[a-zA-Z0-9-]+|[a-z-]+)\s*:\s*([^;{}]*)/g;
const COLOR_LIT = /rgba?\([^)]*\)|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const URL_VALUE = /url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g;

/** Raw colour literals in declaration values. tokens.css custom-property
 *  DEFINITIONS are excluded — the definition site is the system, not drift. */
export function colorLiterals() {
  const found = [];
  for (const { name, src } of sheets()) {
    for (const d of src.matchAll(COLOR_DECL)) {
      if (name === "tokens.css" && d[1].startsWith("--")) continue;
      const lits = d[2].replace(URL_VALUE, "").match(COLOR_LIT);
      if (lits) for (const v of lits) found.push({ file: name, value: v });
    }
  }
  return found;
}
export const rawColor = () => colorLiterals().length;

/* One canonical spelling per paint value, so a fork cannot read as two
   colours: expand short hex, fold hex and rgb()/rgba() to the same rendering,
   parseFloat every channel (kills trailing zeros and leading dots). */
export function normColor(v) {
  if (v[0] === "#") {
    let h = v.slice(1).toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const ch = [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
    const a = h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 1000) / 1000 : 1;
    return `rgb(${ch.join()},${a})`;
  }
  const parts = v.slice(v.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return `rgb(${[r, g, b].join()},${Math.round(a * 1000) / 1000})`;
}

/** normalised value -> the spellings it is written in. A group of size > 1 is a
 *  fork: identical paint hiding behind two spellings, which is how grep-based
 *  dedup plans go wrong. */
export function colorForks() {
  const byNorm = new Map();
  for (const { value } of colorLiterals()) {
    const n = normColor(value);
    if (!byNorm.has(n)) byNorm.set(n, new Set());
    byNorm.get(n).add(value);
  }
  return byNorm;
}
export const rawColorDistinct = () => colorForks().size;

/** Sheets that space themselves entirely in raw px and read neither --pad nor
 *  --gap, so they cannot respond to the density ladder. A LIST, not a count:
 *  which screen is density-blind is the whole content of the finding. */
export function zeroSpacingSheets() {
  return sheets()
    .filter(({ name }) => name !== "tokens.css")
    .filter(({ src }) => /(?:padding|margin|gap)[a-z-]*:[^;{}]*[0-9.]+px/.test(src))
    .filter(({ src }) => !/(?:padding|margin|gap)[a-z-]*:[^;{}]*var\(--(?:pad|gap)/.test(src))
    .map(({ name }) => name)
    .sort();
}

/** file -> count, for a failure message that says WHERE. */
export const byFile = (rows) => rows.reduce((m, r) => (m[r.file] = (m[r.file] || 0) + 1, m), {});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--offenders")) {
    // The breakdown behind a failed CSS ratchet: the number says a sheet drifted,
    // this says which one and what it wrote.
    const forks = [...colorForks().entries()].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
    console.log(JSON.stringify({
      subFloorFontSize: byFile(subFloorFontSizeReport()),
      rawSpacing: byFile(rawSpacingReport()),
      rawColor: byFile(colorLiterals()),
      colourForks: forks.slice(0, 12).map(([n, s]) => `${n} <- ${[...s].join(" | ")}`),
      zeroSpacingSheets: zeroSpacingSheets(),
    }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({
    cssClasses: classTokens().size,
    shellNodes: shellNodes(),
    bareCatches: bareCatches(),
    waitNoPolling: await waitNoPolling(),
    subFloorFontSize: subFloorFontSize(),
    rawSpacing: rawSpacing(),
    rawColor: rawColor(),
    rawColorDistinct: rawColorDistinct(),
  }, null, 2));
}
