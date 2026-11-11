/* dom-id-literals.test.mjs — every DOM id the game looks up by a literal exists.
 *
 * WHY THIS FILE EXISTS. The unit-test DOMs cannot fail a renamed id:
 * tools/lib/game-vm.cjs `document.getElementById` builds a fresh element for
 * any id it has not seen (and its `document.querySelector` / `el.querySelector`
 * return a new <div> for ANY selector), and tests/helpers/mini-dom.mjs
 * auto-creates on getElementById the same way. Rename `id="pausemenu"` in
 * index.html and every VM-driven test still finds a #pausemenu. This file is
 * the static half those harnesses cannot be: it reads every
 *   document.getElementById("x")   querySelector("#x") / querySelectorAll("#x")
 *   $("x")   (in a file that defines `const $ = (id) => document.getElementById(id)`)
 * literal under js/** and requires the id to be one that some code path really
 * creates:
 *   1. a static id in index.html (index.html owns ALL static DOM);
 *   2. a static id in another root page (cockpit-view.html, …) that loads the
 *      SAME js file with a <script src>;
 *   3. an id the js/** source itself creates — DERIVED, not hand-listed:
 *        el.id = "x"                     (dotId)
 *        id="x" / id=\"x\" in a markup string or template (innerHTML)
 *        setAttribute("id", "x")
 *        builder("x", …) where `builder` is SettingRow.build or a function in
 *        the same file whose first parameter is `id` and whose body assigns
 *        `.id = id` or hands `id` to SettingRow.build (a "x-" + name first
 *        argument creates the prefix "x-");
 *   4. a block the deploy injects into the shell (tools/ci/bump-cache.mjs
 *      `*_ID` constants: the apex-lazy-v / apex-lazy-integrity JSON scripts).
 * A literal that matches none of these resolves to null in the real page.
 * KNOWN_MISSING names such ids (production bugs reported, not fixed here) and
 * is itself asserted still-missing, so a fix forces the entry out.
 *
 * Run: node --test tests/unit/dom-id-literals.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_IDS } from "../../tools/check/shell-ids.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Ids looked up by a literal that NO code path creates. Each entry is a real
// production lookup that returns null; empty today. Format: id -> why.
const KNOWN_MISSING = new Map([
]);

function jsFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (rel.endsWith(".js")) out.push(rel);
    }
  };
  walk("js");
  return out.sort();
}

const idsInHtml = (html) => new Set([...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
const lineOf = (src, at) => src.slice(0, at).split("\n").length;

/** Every id literal a js file looks up: [{ id, file, line }]. */
function lookups(file, src) {
  const res = [
    /getElementById\(\s*(["'`])([^"'`$]+)\1\s*\)/g,
    /querySelector(?:All)?\(\s*(["'`])#([A-Za-z][\w-]*)\1\s*\)/g,
  ];
  res.push(/(?<![\w.$])\$\(\s*(["'`])([^"'`$]+)\1\s*\)/g);
  const out = [];
  for (const re of res) for (const m of src.matchAll(re)) out.push({ id: m[2], file, line: lineOf(src, m.index) });
  return out;
}

/** Ids (exact) and id prefixes the js source creates at runtime. */
function runtimeIds(files) {
  const exact = new Map(), prefix = new Map();
  const note = (map, id, file) => { if (!map.has(id)) map.set(id, file); };
  const setRow = read("js/ui/setting-row.js");
  assert.match(setRow, /function build\(id, labelText, values\) \{\s*const d = doc\(\);\s*const row = d\.createElement\("div"\);\s*row\.id = id;/,
    "SettingRow.build must still assign its first argument as the row id (this test trusts it as a builder)");
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/\.id\s*=\s*(["'`])([\w-]+)\1/g)) note(exact, m[2], file);
    for (const m of src.matchAll(/\bid=\\?(["'])([\w-]+)\\?\1/g)) note(exact, m[2], file);
    for (const m of src.matchAll(/setAttribute\(\s*["']id["']\s*,\s*(["'`])([\w-]+)\1/g)) note(exact, m[2], file);
    // el.id = "x-" + key  →  the prefix "x-".
    for (const m of src.matchAll(/\.id\s*=\s*(["'])([\w-]+-)\1\s*\+/g)) note(prefix, m[2], file);
    // el.id = fn(…) where fn returns `x-${…}` (setup-sheet.js csTabId)  →  the prefix "x-".
    for (const m of src.matchAll(/function (\w+)\([^)]*\)\s*\{\s*return `([\w-]+-)\$\{/g)) {
      if (new RegExp(`\\.id = ${m[1]}\\(`).test(src)) note(prefix, m[2], file);
    }
    // An element factory called as f("tag", { id: "x", … }) (photo-studio.js mk).
    for (const m of src.matchAll(/(?<![\w$])\w+\(\s*"[a-z][a-z0-9]*"\s*,\s*\{\s*id:\s*"([\w-]+)"/g)) note(exact, m[1], file);
    // A row table ["x", "LABEL", …] read by a builder that destructures `const [id, …] = r` and sets `.id = id`
    // (garage/arrival.js buildRows).
    if (/const \[id, [^\]]*\] = \w+/.test(src) && /\.id = id;/.test(src)) {
      for (const m of src.matchAll(/\[\s*"([a-z][\w]*-[\w-]+)",\s*"[^"]*",/g)) note(exact, m[1], file);
    }
    // …and its row groups { group: "x", rows: […] } built as `g.id = r.group`.
    if (/\.id = \w+\.group;/.test(src)) for (const m of src.matchAll(/\{\s*group:\s*"([\w-]+)"/g)) note(exact, m[1], file);
    // Builders: SettingRow.build, plus same-file functions `f(id, …)` that set .id = id or pass id to SettingRow.build.
    const builders = ["SettingRow\\.build"];
    for (const m of src.matchAll(/(?:function (\w+)\s*\(id\b|const (\w+) = \(id\b)/g)) {
      const name = m[1] || m[2];
      const body = src.slice(m.index, m.index + 800);
      if (/\.id = id\b|SettingRow\.build\(id\b/.test(body)) builders.push(name);
    }
    const call = new RegExp(`(?<![\\w$])(?:${builders.join("|")})\\(\\s*(["'\`])([\\w-]+)\\1\\s*(\\+)?`, "g");
    for (const m of src.matchAll(call)) note(m[3] ? prefix : exact, m[2], file);
  }
  for (const m of read("tools/ci/bump-cache.mjs").matchAll(/^const \w+_ID = "([\w-]+)";/gm)) note(exact, m[1], "tools/ci/bump-cache.mjs");
  return { exact, prefix };
}

/** Other root pages: their static ids, valid for the js files each one loads. */
function pageIds() {
  const byFile = new Map();
  for (const page of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "index.html")) {
    const html = read(page);
    const ids = idsInHtml(html);
    for (const m of html.matchAll(/<script[^>]*\bsrc="([^"?]+)/g)) {
      if (!byFile.has(m[1])) byFile.set(m[1], new Set());
      for (const id of ids) byFile.get(m[1]).add(id);
    }
  }
  return byFile;
}

function unresolved(indexHtml) {
  const files = jsFiles();
  const html = idsInHtml(indexHtml);
  const pages = pageIds();
  const { exact, prefix } = runtimeIds(files);
  const missing = new Map();
  let n = 0;
  for (const file of files) {
    for (const l of lookups(file, read(file))) {
      n++;
      if (html.has(l.id) || exact.has(l.id)) continue;
      if (pages.has(file) && pages.get(file).has(l.id)) continue;
      if ([...prefix.keys()].some((p) => l.id.startsWith(p))) continue;
      if (!missing.has(l.id)) missing.set(l.id, []);
      missing.get(l.id).push(`${l.file}:${l.line}`);
    }
  }
  return { missing, n };
}

test("every id literal under js/ names an id index.html, its page or the js source creates", () => {
  const { missing, n } = unresolved(read("index.html"));
  assert.ok(n > 300, `expected the game's id lookups, scanned ${n}`);
  const fresh = [...missing].filter(([id]) => !KNOWN_MISSING.has(id)).map(([id, at]) => `#${id} (${at.join(", ")})`);
  assert.deepEqual(fresh, [], "these ids resolve to nothing in the real page (renamed in index.html? never created?)");
});

test("KNOWN_MISSING cannot go stale: every entry still resolves to nothing", () => {
  const { missing } = unresolved(read("index.html"));
  for (const id of KNOWN_MISSING.keys()) assert.ok(missing.has(id), `#${id} now resolves: drop it from KNOWN_MISSING`);
});

test("every hand-listed RUNTIME_IDS entry in tools/check/shell-ids.mjs is really created by the source", () => {
  // shell-ids.mjs exempts RUNTIME_IDS from its missing-id check by hand. An
  // entry whose builder was deleted or renamed stays exempt forever and hides
  // a lookup that now returns null; the derivation above must still find each.
  const { exact, prefix } = runtimeIds(jsFiles());
  const stale = Object.keys(RUNTIME_IDS).filter((id) => !exact.has(id) && ![...prefix.keys()].some((p) => id.startsWith(p)));
  assert.deepEqual(stale, [], "RUNTIME_IDS names ids no js source creates any more");
});

test("the scan sees a renamed index.html id (self-check against a vacuous pass)", () => {
  // #pausemenu is looked up by literal and created ONLY by index.html.
  const html = read("index.html");
  assert.match(html, /\sid="pausemenu"/);
  const { missing } = unresolved(html.replace(/(\sid=")pausemenu"/, '$1pausemenu-renamed"'));
  assert.ok(missing.has("pausemenu"), "renaming id=\"pausemenu\" must surface the js lookups of #pausemenu");
});
