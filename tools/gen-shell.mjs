#!/usr/bin/env node
/**
 * gen-shell.mjs — the shell's load-order blocks, from tools/manifest.cjs.
 * @doc Generates the shell tag blocks, sw.js precache seed and js/roster.js from the manifest; `--check` fails on drift.
 * @skill check-changes
 *
 * tools/manifest.cjs is the ONE hand-edited roster. Everything that used to
 * mirror it by hand — the <script>/<link> tags in index.html, the carview
 * tags, the lazy rosters js/game.js injects at runtime, and the tagless files
 * sw.js has to seed into its optional precache — is now written by this tool.
 * Adding a file is one manifest line plus `node tools/gen-shell.mjs`; moving a
 * file is `git mv` plus the same. tests/unit/load-order.test.mjs runs the
 * `--check` form, so a hand edit inside a generated block cannot land.
 *
 * Owned blocks (markers must already exist; the tool never guesses):
 *   index.html         <!-- @gen-shell:preload --> … <!-- /@gen-shell:preload -->
 *                      <!-- @gen-shell:css --> … <!-- /@gen-shell:css -->
 *                      <!-- @gen-shell:scripts --> … <!-- /@gen-shell:scripts -->
 *   tools/carview.html <!-- @gen-shell:carview --> … <!-- /@gen-shell:carview -->
 *   sw.js              // @gen-shell:sw-optional … // /@gen-shell:sw-optional
 *                      // @gen-shell:sw-lazy-agent … // /@gen-shell:sw-lazy-agent
 *   js/roster.js       the whole file (one global, ApexRoster)
 *
 * The `?v=` token on every tag in the REPO is the literal `dev`: hashes are
 * stamped by the deploy (pages.yml runs `bump-cache --apply --at N --root
 * _site` on the staged copy), so no cache bump ever happens in development
 * and index.html changes only when markup changes. `digest()` stays exported
 * for that deploy path and computes the same 12-hex token bump-cache writes.
 *
 *   node tools/gen-shell.mjs            # write every block
 *   node tools/gen-shell.mjs --check    # exit 1 when any committed block ≠ generated
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { ROOT, isMain, firstDiff } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("./manifest.cjs");

export const TARGETS = Object.freeze(["index.html", "tools/carview.html", "sw.js", "js/roster.js"]);
/** The `?v=` token written into the repo's shell. Real hashes exist only in
 *  the deploy's staged copy. */
export const DEV_TOKEN = "dev";

/** 12-hex SHA-256 prefix — the same token tools/bump-cache.mjs writes. The
 *  roster is hashed from its GENERATED text, so index.html's tag for it is
 *  right on the same run that first writes the file. */
const hashText = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
export function digest(rel) {
  if (rel === "js/roster.js") return hashText(rosterSource());
  return hashText(fs.readFileSync(path.join(ROOT, rel)));
}

/** Replace the text between two marker lines, keeping the markers. */
export function replaceMarked(text, open, close, body) {
  const a = text.indexOf(open);
  if (a < 0) throw new Error(`marker ${JSON.stringify(open)} not found`);
  const b = text.indexOf(close, a + open.length);
  if (b < 0) throw new Error(`closing marker ${JSON.stringify(close)} not found after ${JSON.stringify(open)}`);
  const lineStart = text.lastIndexOf("\n", b) + 1;
  return text.slice(0, a + open.length) + "\n" + body + text.slice(lineStart);
}

// ---------------------------------------------------------------------------
// Block bodies.

function preloadBlock() {
  return (MANIFEST.CSS_PRELOAD || []).map((f) =>
    `<link rel="preload" href="${f}?v=${DEV_TOKEN}" as="style">`).join("\n") + "\n";
}

function cssBlock() {
  const deferred = new Set(MANIFEST.CSS_DEFERRED || []);
  return MANIFEST.CSS.map((f) =>
    `<link rel="stylesheet" href="${f}?v=${DEV_TOKEN}"` +
    (deferred.has(f) ? ` media="print" onload="this.media='all'"` : "") + ">").join("\n") + "\n";
}

function scriptsBlock() {
  const notes = MANIFEST.SHELL_NOTES || { before: {}, after: {} };
  const out = [];
  for (const f of MANIFEST.FULL) {
    if (notes.before[f]) out.push(notes.before[f]);
    out.push(`<script defer crossorigin="anonymous" src="${f}?v=${DEV_TOKEN}"></script>`);
    if (notes.after[f]) out.push(notes.after[f]);
  }
  return out.join("\n") + "\n";
}

function carviewBlock() {
  return MANIFEST.CARVIEW.map((f) => `<script src="../${f}"></script>`).join("\n") + "\n";
}

/** Every tagless file sw.js must seed: loadBackendScripts() injects each one as
 *  `<path>?v=<build>`, and the tag parser cannot see any of them. LAZY_AGENT is
 *  deliberately absent (dev/test surface; an install-time put full-compiles). */
export function swOptionalFiles() {
  return [
    ...Object.values(MANIFEST.DEFERRED).flat(),
    ...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_SCENERY, ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
  ];
}

function swOptionalBlock() {
  const groups = [
    ["DEFERRED renderer backends (no <script> tag; injected on opt-in)", Object.values(MANIFEST.DEFERRED).flat()],
    ["LAZY_RACE + LAZY_SCENERY — the race payload; a miss builds a bare circuit offline", [...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_SCENERY]],
    ["LAZY_DATA — the data hub bundle behind the DATA button", MANIFEST.LAZY_DATA],
    ["LAZY_NET — the multiplayer stack behind VS FRIEND", MANIFEST.LAZY_NET],
  ];
  const out = [];
  for (const [title, files] of groups) {
    out.push(`    // ${title}`);
    for (const f of files) out.push(`    "${f}",`);
  }
  return out.join("\n") + "\n";
}

function swLazyAgentBlock() {
  return `  const LAZY_AGENT = ${JSON.stringify(MANIFEST.LAZY_AGENT)};\n`;
}

function rosterSource() {
  const pretty = (v) => JSON.stringify(v, null, 2).replace(/\n/g, "\n  ");
  const fields = [
    ["DEFERRED", MANIFEST.DEFERRED], ["DEFERRED_EDGES", MANIFEST.DEFERRED_EDGES],
    ["LAZY_AGENT", MANIFEST.LAZY_AGENT], ["LAZY_EDGES", MANIFEST.LAZY_EDGES],
    ["LAZY_RACE", MANIFEST.LAZY_RACE], ["SCENERY_DIR", MANIFEST.SCENERY_DIR],
    ["LAZY_DATA", MANIFEST.LAZY_DATA], ["LAZY_DATA_EDGES", MANIFEST.LAZY_DATA_EDGES],
    ["LAZY_NET", MANIFEST.LAZY_NET], ["LAZY_NET_EDGES", MANIFEST.LAZY_NET_EDGES],
  ];
  return [
    "// js/roster.js — GENERATED by tools/gen-shell.mjs from tools/manifest.cjs. Do not edit.",
    "// The tagless rosters js/game.js injects at runtime (deferred backends, the",
    "// agent surface, the race payload, the data hub, the multiplayer stack) and",
    "// the eval-order edges inside each. Edit the manifest, then regenerate.",
    "(function () {",
    '  "use strict";',
    "  self.ApexRoster = Object.freeze({",
    ...fields.map(([k, v]) => `    ${k}: ${pretty(v)},`),
    "  });",
    "})();",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------

/** Generated content for every target, keyed by repo-relative path. */
export function generate() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  let html = read("index.html");
  html = replaceMarked(html, "<!-- @gen-shell:preload -->", "<!-- /@gen-shell:preload -->", preloadBlock());
  html = replaceMarked(html, "<!-- @gen-shell:css -->", "<!-- /@gen-shell:css -->", cssBlock());
  html = replaceMarked(html, "<!-- @gen-shell:scripts -->", "<!-- /@gen-shell:scripts -->", scriptsBlock());
  let carview = read("tools/carview.html");
  carview = replaceMarked(carview, "<!-- @gen-shell:carview -->", "<!-- /@gen-shell:carview -->", carviewBlock());
  let sw = read("sw.js");
  sw = replaceMarked(sw, "// @gen-shell:sw-optional", "// /@gen-shell:sw-optional", swOptionalBlock());
  sw = replaceMarked(sw, "// @gen-shell:sw-lazy-agent", "// /@gen-shell:sw-lazy-agent", swLazyAgentBlock());
  return { "index.html": html, "tools/carview.html": carview, "sw.js": sw, "js/roster.js": rosterSource() };
}

/** Targets whose committed bytes differ from a fresh generation. */
export function stale() {
  const out = [];
  for (const [rel, content] of Object.entries(generate())) {
    const abs = path.join(ROOT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    if (current !== content) out.push({ rel, diff: firstDiff(current, content) });
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const drift = stale();
  if (check) {
    if (!drift.length) { process.stdout.write("gen-shell: every block up to date\n"); return 0; }
    for (const d of drift) process.stdout.write(`${d.rel}: STALE — run \`node tools/gen-shell.mjs\`\n${d.diff}\n`);
    return 1;
  }
  const out = generate();
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (current === out[rel]) { process.stdout.write(`${rel}: unchanged\n`); continue; }
    fs.writeFileSync(abs, out[rel]);
    process.stdout.write(`${rel}: written\n`);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exit(main());
