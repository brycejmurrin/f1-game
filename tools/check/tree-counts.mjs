#!/usr/bin/env node
// @doc Counts behind the `tree` ratchets: CSS classes/spacing/colour, shell nodes, bare catches, waits, sleeps. `--offenders`.
/**
 * tree-counts.mjs — the measurements behind `tree` entries in
 * tests/data/ratchets.json.
 *
 * These numbers used to live as `const CEILING = N` beside the assertion in
 * three unit files, each with its own slack rule and its own copy of the walk.
 * The measurement is the reusable part, so it moved here; the number moved to
 * ratchets.json; the ceiling history moved to docs/notes/CEILING-HISTORY.md.
 * Behaviour is unchanged — each function is the original scan, moved verbatim.
 *
 * sourceSliceTests: test files under tests/ (not tests/data/ or fixtures) holding `new Function(` AND a js/ read —
 *   they slice module source and rebuild it. vm.runIn*Context loads are NOT counted: tree.vmSrcLoads owns those.
 * typeofGuards: sites in js/ (not circuits/) of `typeof G ==|!= "undefined"|"function"|"object"` where G is a global a
 *   manifest module declares; platform checks (OffscreenCanvas, window, ...) are legitimate and do not count.
 * gWrites (U0.2 of #6920): G.<member> writes through the façade, by file; measured only.
 */
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CSS_SOURCES } from "../lib/css-source.mjs";
import { wallAt } from "./boot-wall.mjs";
import { stripJs } from "../lib/js-strip.mjs";

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
  for (const m of src.matchAll(/catch\s*(?:\([^)]*\))?\s*\{/g)) {
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

/** Fixed sleeps in the suite: `.waitForTimeout(` under tests/specs and
 *  tests/helpers. A sleep is a guess about the machine — under SwiftShader a
 *  150 ms settle is one frame on an idle box and none on a loaded one — so the
 *  population is ratcheted and each site is converted to a condition wait on
 *  `__apex` state (`{ polling: 100 }`) as it is touched. Same shape as
 *  waitNoPolling: a tree count with a per-file breakdown for --offenders.
 *
 *  THE DOT IS LOAD-BEARING (2026-09-16). The bare `\bwaitForTimeout\(` this
 *  used to match cannot tell a CALL from a DEFINITION or a mention: it counted
 *  the `async waitForTimeout(_ms)` method on tests/helpers/vm-page.js's page
 *  adapter — which sleeps for nothing, it only exists so an unmodified spec
 *  compiles against the VM — and a `waitForTimeout(300)` inside the comment at
 *  tests/specs/menu-keyboard.spec.js that explains why that sleep was DELETED. Both
 *  pushed the ceiling the wrong way. A real sleep is always `page.` or
 *  `racePage.`-qualified, so requiring the dot counts sleeps and nothing else;
 *  the ceiling came DOWN by two when this landed. */
export function waitForTimeoutReport() {
  const rows = [];
  for (const dir of ["tests/specs", "tests/helpers"]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => /\.(js|mjs|cjs)$/.test(x)).sort()) {
      const n = (fs.readFileSync(path.join(abs, f), "utf8").match(/\.waitForTimeout\(/g) || []).length;
      if (n) rows.push({ file: `${dir}/${f}`, count: n });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}
export const waitForTimeout = () => waitForTimeoutReport().reduce((n, r) => n + r.count, 0);

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

/** sheets() as they were at a git ref, read from the object store (no checkout);
 *  memoised per ref, since every AT_REF count below reads the same sheets. */
const atRef = new Map();
export function sheetsAt(ref) {
  if (!atRef.has(ref)) atRef.set(ref, readSheetsAt(ref));
  return atRef.get(ref);
}
function readSheetsAt(ref) {
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  return git("ls-tree", "--name-only", ref, "css/").split("\n").filter((f) => f.endsWith(".css")).sort()
    .map((f) => ({ name: path.basename(f), src: stripComments(git("show", `${ref}:${f}`)) }));
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
export function subFloorFontSizeReport(all = sheets()) {
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
export function rawSpacingReport(all = sheets()) {
  const rows = [];
  for (const { name, src } of all)
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
export function colorLiterals(all = sheets()) {
  const found = [];
  for (const { name, src } of all) {
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
export function colorForks(all = sheets()) {
  const byNorm = new Map();
  for (const { value } of colorLiterals(all)) {
    const n = normColor(value);
    if (!byNorm.has(n)) byNorm.set(n, new Set());
    byNorm.get(n).add(value);
  }
  return byNorm;
}
export const rawColorDistinct = () => colorForks().size;

/** The tree counts measured at a git ref (the css/ scans and the boot wall,
 *  tools/check/boot-wall.mjs): what ratchets.mjs needs to tell a branch's OWN
 *  lowering (head minus merge-base) from a loose base (#4257). */
export const AT_REF = {
  rawColor: (ref) => colorLiterals(sheetsAt(ref)).length,
  rawColorDistinct: (ref) => colorForks(sheetsAt(ref)).size,
  rawSpacing: (ref) => rawSpacingReport(sheetsAt(ref)).length,
  subFloorFontSize: (ref) => subFloorFontSizeReport(sheetsAt(ref)).length,
  eagerScripts: (ref) => wallAt(ref).scripts,
  eagerBytes: (ref) => wallAt(ref).bytes,
  eagerCodeBytes: (ref) => wallAt(ref).codeBytes,
};

/** Sheets that space themselves entirely in raw px and read neither --pad nor
 *  --gap, so they cannot respond to the density ladder. A LIST, not a count:
 *  which screen is density-blind is the whole content of the finding. */
export function zeroSpacingSheets(all = sheets()) {
  // A physical split must not change whether its SCREEN responds to density.
  // Literal counters above still scan each file. Only this screen-level policy
  // joins the declared source families; unknown sheets remain independent.
  const owners = new Map(Object.entries(CSS_SOURCES)
    .flatMap(([owner, files]) => files.map((file) => [path.basename(file), path.basename(owner)])));
  const logical = new Map();
  for (const { name, src } of all) {
    const owner = owners.get(name) || name;
    logical.set(owner, (logical.get(owner) || "") + "\n" + src);
  }
  return [...logical].map(([name, src]) => ({ name, src }))
    .filter(({ name }) => name !== "tokens.css")
    .filter(({ src }) => /(?:padding|margin|gap)[a-z-]*:[^;{}]*[0-9.]+px/.test(src))
    .filter(({ src }) => !/(?:padding|margin|gap)[a-z-]*:[^;{}]*var\(--(?:pad|gap)/.test(src))
    .map(({ name }) => name)
    .sort();
}

/** Every module path the manifest loads: FULL, every DEFERRED list, and EVERY `LAZY_*` export that is a list of
 *  file paths (the `*_EDGES` pair lists are not), deduplicated. Derived, not hand-copied: the hand-copied roster
 *  this replaced had silently dropped six lazy lists (66 modules, all of js/race/*).
 *  TODO: switch to the shared all-lazy-rosters helper in tools/manifest.cjs once it lands. */
export function manifestModules(manifest = createRequire(import.meta.url)("../manifest.cjs")) {
  const lists = [manifest.FULL, ...Object.values(manifest.DEFERRED || {})];
  for (const [k, v] of Object.entries(manifest)) {
    if (/^LAZY_/.test(k) && Array.isArray(v) && v.length && v.every((f) => typeof f === "string")) lists.push(v);
  }
  return [...new Set(lists.flat())];
}

/** Manifest modules (every js/ file tools/manifest.cjs loads, circuits and
 *  scenery excluded — they are data, gated per circuit by verify-track and the
 *  sweeps) that NOTHING under tests/ names: not by path, not by basename, not
 *  by the global the file declares. A module with zero references has zero
 *  tests by construction; the 2026-09 census found one (js/physics/body-attitude.js).
 *  `corpus` is injectable so the measurement itself can be tested. */
export function zeroRefModulesReport(corpus) {
  const manifest = createRequire(import.meta.url)("../manifest.cjs");
  const mods = new Set();
  for (const f of manifestModules(manifest)) if (f.startsWith("js/") && !f.startsWith("js/circuits/")) mods.add(f);
  if (corpus === undefined) {
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(m?js|cjs)$/.test(e.name)) files.push(p);
      }
    })(path.join(ROOT, "tests"));
    corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  }
  const out = [];
  for (const f of [...mods].sort()) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const g = (src.match(/^(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/m) || [])[1]
           || (src.match(/window\.([A-Za-z_$][\w$]*)\s*=/) || [])[1] || null;
    const named = corpus.includes(f) || corpus.includes(path.basename(f))
      || (g && new RegExp(`\\b${g.replace(/\$/g, "\\$")}\\b`).test(corpus));
    if (!named) out.push({ file: f, global: g });
  }
  return out;
}
export const zeroRefModules = () => zeroRefModulesReport().length;

/* ---- source-slice tests and module-presence typeof guards (#6920 U0.1) ---- */
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/** Every .js/.mjs/.cjs under tests/ except tests/data/ and fixtures. */
function testFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "data" && !/fixtures?$/.test(e.name)) walk(p); }
      else if (/\.(m?js|cjs)$/.test(e.name)) out.push(p);
    }
  })(path.join(ROOT, "tests"));
  return out.sort().map((p) => ({ file: rel(p), text: fs.readFileSync(p, "utf8") }));
}

/** Test files that slice js/ source and rebuild it with `new Function(`. Rows {file, count of calls}. */
export function sourceSliceTestsReport(files = testFiles()) {
  const rows = [];
  for (const { file, text } of files) {
    const n = (text.match(/new\s+Function\(/g) || []).length;
    if (n && /["'`/]js\//.test(text)) rows.push({ file, count: n });
  }
  return rows.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}
export const sourceSliceTests = () => sourceSliceTestsReport().length;

const jsFiles = () => walkJs(path.join(ROOT, "js")).sort()
  .map((p) => ({ file: rel(p), text: fs.readFileSync(p, "utf8") }));
function jsFilesAt(ref) {
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 });
  return git("ls-tree", "-r", "--name-only", ref, "js/").split("\n").filter((f) => f.endsWith(".js")).sort()
    .map((file) => ({ file, text: git("show", `${ref}:${file}`) }));
}

/** The globals manifest modules declare: the first column-0 const/var/let, else a `window.X =` (as zeroRefModulesReport). */
export function moduleGlobals(files = jsFiles()) {
  const mods = new Set(manifestModules().filter((f) => f.startsWith("js/") && !f.startsWith("js/circuits/")));
  const out = new Set();
  for (const { file, text } of files) {
    if (!mods.has(file)) continue;
    const g = (text.match(/^(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/m) || [])[1]
           || (text.match(/window\.([A-Za-z_$][\w$]*)\s*=/) || [])[1];
    if (g) out.add(g);
  }
  return out;
}

/** Comments stripped, string contents blanked except the three typeof comparands. */
function codeOnly(text) {
  return stripJs(text).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g,
    (m, q) => (/^.(?:undefined|function|object).$/.test(m) ? m : q + q));
}

/** Module-presence guards: `typeof <module global> ==|!= "undefined"|"function"|"object"`. Rows {file, count}. */
export function typeofGuardsReport(files = jsFiles(), globals = moduleGlobals(files)) {
  const re = /\btypeof\s+([A-Za-z_$][\w$]*)\s*(?:===|!==|==|!=)\s*["'](?:undefined|function|object)["']/g;
  const rows = [];
  for (const { file, text } of files) {
    if (file.startsWith("js/circuits/")) continue;
    let n = 0;
    for (const m of codeOnly(text).matchAll(re)) if (globals.has(m[1])) n++;
    if (n) rows.push({ file, count: n });
  }
  return rows.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}
export const typeofGuards = () => typeofGuardsReport().reduce((n, r) => n + r.count, 0);
/** typeofGuards at a git ref. Not in AT_REF yet: U0.R wires AT_REF.typeofGuards with its TREE_METRICS row (#6944). */
export const typeofGuardsAt = (ref) => typeofGuardsReport(jsFilesAt(ref)).reduce((n, r) => n + r.count, 0);

/** Owner map for gWrites: {default, owners:{member: ownerFile}}. Only members a module truly owns are listed. */
const loadOwners = () => JSON.parse(fs.readFileSync(path.join(ROOT, "tools/check/g-owners.json"), "utf8"));

/**
 * gWrites — `G.<member> = ...` writes a create(ctx) module makes through the façade
 * (state with no declared owner). Scope-resolved by check-gctx's collectUsage, so a
 * local `G` that is not the create() parameter is not counted. `+=` and `++` are
 * writes (collectUsage's 'write'); `delete G.x` is not. Members whose owner is the
 * writing file itself are dropped; every other write counts (game.js, the default
 * owner, is not scanned). One {file, member, line} row per written name.
 */
export async function gWriteSites(rel, source = null, owners = loadOwners().owners) {
  const { collectUsage } = await import("./check-gctx.mjs");
  const rows = [];
  for (const h of collectUsage(rel, source))
    if (h.kind === "write")
      for (const member of h.names) if ((owners || {})[member] !== rel) rows.push({ file: rel, member, line: h.line });
  return rows;
}

let gWriteMemo = null;
/** Every write row over check-gctx's usage files. Memoised per process (about 2 s). */
export async function gWriteReport() {
  if (gWriteMemo) return gWriteMemo;
  const { usageFiles } = await import("./check-gctx.mjs");
  const owners = loadOwners().owners;
  const rows = [];
  for (const rel of usageFiles()) rows.push(...await gWriteSites(rel, null, owners));
  return (gWriteMemo = rows);
}
export const gWrites = async () => (await gWriteReport()).length;

/** file -> count, for a failure message that says WHERE. */
export const byFile = (rows) => rows.reduce((m, r) => (m[r.file] = (m[r.file] || 0) + 1, m), {});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--offenders")) {
    // The breakdown behind a failed CSS ratchet: the number says a sheet drifted,
    // this says which one and what it wrote.
    const forks = [...colorForks().entries()].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
    console.log(JSON.stringify({
      waitForTimeout: Object.fromEntries(waitForTimeoutReport().map((r) => [r.file, r.count])),
      subFloorFontSize: byFile(subFloorFontSizeReport()),
      rawSpacing: byFile(rawSpacingReport()),
      rawColor: byFile(colorLiterals()),
      colourForks: forks.slice(0, 12).map(([n, s]) => `${n} <- ${[...s].join(" | ")}`),
      zeroSpacingSheets: zeroSpacingSheets(),
      sourceSliceTests: Object.fromEntries(sourceSliceTestsReport().map((r) => [r.file, r.count])),
      typeofGuards: Object.fromEntries(typeofGuardsReport().map((r) => [r.file, r.count])),
      zeroRefModules: zeroRefModulesReport().map((r) => `${r.file} (${r.global || "no global"})`),
      gWrites: byFile(await gWriteReport()),
    }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({
    cssClasses: classTokens().size,
    shellNodes: shellNodes(),
    bareCatches: bareCatches(),
    waitNoPolling: await waitNoPolling(),
    waitForTimeout: waitForTimeout(),
    subFloorFontSize: subFloorFontSize(),
    rawSpacing: rawSpacing(),
    rawColor: rawColor(),
    rawColorDistinct: rawColorDistinct(),
    zeroRefModules: zeroRefModules(),
    sourceSliceTests: sourceSliceTests(),
    typeofGuards: typeofGuards(),

    gWrites: await gWrites(),
  }, null, 2));
}
