#!/usr/bin/env node
/**
 * gen-arch-table.mjs — the module index of docs/ARCHITECTURE.md, from the manifest.
 * @doc Generates the module index block of `docs/ARCHITECTURE.md` from `tools/manifest.cjs` + each file's header; `--check` drift.
 * @skill check-changes
 *
 * One row per rostered js/ file, grouped by directory: the global it assigns,
 * the roster that loads it (tag order, a DEFERRED backend, a LAZY_* bundle)
 * and the FIRST SENTENCE of its header comment. Source of truth is the manifest
 * plus the file itself; nothing here is hand-listed, so a file that moves or a
 * header that is rewritten shows up as `--check` drift and is fixed by
 * regenerating. The forty circuit defs and their forty scenery closures share
 * one header shape each and collapse to a single row per directory.
 *
 * The hand-written contract prose in ARCHITECTURE.md (what a module may
 * assume, why it exists) stays hand-written: this block is the MAP, owned
 * between the `<!-- @gen-arch:modules -->` … `<!-- /@gen-arch:modules -->`
 * markers, and the generator never touches a byte outside them.
 * (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2 — regenerated per
 * directory from file headers, so the move window only rewrites path strings.)
 *
 *   node tools/gen-arch-table.mjs            # write the block
 *   node tools/gen-arch-table.mjs --check    # exit 1 when committed ≠ generated
 *   node tools/gen-arch-table.mjs --rows     # print the rows as JSON (debug)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, emit, isMain, readRepo } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("./manifest.cjs");

export const TARGET = "docs/ARCHITECTURE.md";
export const OPEN = "<!-- @gen-arch:modules -->";
export const CLOSE = "<!-- /@gen-arch:modules -->";
export const SENTENCE_MAX = 160;

/**
 * The first sentence of a file's header comment, or null when the file opens
 * with code. Accepts the shapes js/ actually uses: a `/* … *\/` block or a run
 * of `//` lines, optionally after a bare `"use strict";`. The project prefix
 * (`Apex 26 — `, or the file's own path) is dropped; the cut is the first
 * sentence-ending punctuation followed by a capital, backtick, bracket or the
 * end of the header, so `e.g.` and a bare `js/track/tracks.js` mid-sentence do not end one.
 */
export function headerSentence(src) {
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length && (/^\s*$/.test(lines[i]) || /^\s*"use strict";\s*$/.test(lines[i]))) i++;
  let text;
  if (/^\s*\/\*/.test(lines[i] || "")) {
    const rest = lines.slice(i).join("\n");
    const a = rest.indexOf("/*") + 2, b = rest.indexOf("*/", a);
    text = rest.slice(a, b < 0 ? undefined : b);
  } else if (/^\s*\/\//.test(lines[i] || "")) {
    const buf = [];
    for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) buf.push(lines[i].replace(/^\s*\/\/ ?/, ""));
    text = buf.join("\n");
  } else return null;
  text = text.split("\n").map((l) => l.replace(/^\s*\*+ ?/, "")).join(" ").replace(/\s+/g, " ").trim();
  text = text.replace(/^Apex 26 — /, "").replace(/^js\/[\w/.-]+\.js — /, "");
  const m = /^(.*?[.!?])(?:\s+(?=[A-Z(`"[])|$)/.exec(text);
  let s = (m ? m[1] : text).trim();
  if (!s) return null;
  if (s.length > SENTENCE_MAX) s = s.slice(0, SENTENCE_MAX - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

/**
 * The global a file assigns: a column-0 `const X = (function () {` / `(() => {`
 * IIFE or a frozen data object, a `window.X =` publish, or the accumulator idiom
 * (`(window.X = window.X || []).push`, `Object.assign(window.X || {}, …)`).
 * Deliberately NOT "any const at column 0": js/game.js keeps its helpers there
 * (`const $ = (id) => …`) and assigns no global at all.
 */
export function fileGlobal(rel, src) {
  // js/game.js is the one FULL file that assigns no global at all — a bare
  // `(async function () { … })()` entry point, per AGENTS.md's layout. Its
  // body still opens with 374 column-0 `const NAME = (function/Object.freeze…`
  // declarations by the same one-indent convention every module IIFE uses, so
  // the generic scan below would happily report the first one (NEUTRAL_INPUT)
  // as "the global" — a real false positive, not a hypothetical one. Everything
  // else in js/ is exactly the shape the scan below is written for: the file's
  // own global IIFE / freeze / publish, first in the file, before anything runs.
  if (rel === MANIFEST.PATHS.GAME) return null;
  const m = /^(?:const|let|var) ([A-Za-z0-9_$]+) = (?:\((?:async\s+)?function\b|\(\(\)\s*=>|Object\.freeze\()/m.exec(src)
    || /\(?(?:window|self)\.([A-Za-z0-9_$]+) = (?:Object\.assign\()?(?:window|self)\.\1\b/.exec(src)
    || /^\s*(?:window|self)\.([A-Za-z0-9_$]+) = /m.exec(src);
  return m ? m[1] : null;
}

/** Every rostered file with the roster that loads it, in manifest order. */
export function rosterOf() {
  const out = new Map();
  const add = (files, label) => { for (const f of files) if (!out.has(f)) out.set(f, label); };
  add(MANIFEST.FULL, "tag");
  for (const [k, v] of Object.entries(MANIFEST.DEFERRED)) add(v, `DEFERRED:${k}`);
  add(MANIFEST.LAZY_AGENT, "LAZY_AGENT");
  add(MANIFEST.LAZY_RACE, "LAZY_RACE");
  add(MANIFEST.LAZY_SCENERY, "LAZY_SCENERY");
  add(MANIFEST.LAZY_DATA, "LAZY_DATA");
  add(MANIFEST.LAZY_NET, "LAZY_NET");
  return out;
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

/** Rows grouped by directory: [{ dir, rows: [{ file, global, roster, purpose }] }]. */
export function collect() {
  const roster = rosterOf();
  const circuits = new Set(MANIFEST.CIRCUITS.map(MANIFEST.circuitPath));
  const scenery = new Set(MANIFEST.LAZY_SCENERY);
  const groups = new Map();
  const push = (dir, row) => { if (!groups.has(dir)) groups.set(dir, []); groups.get(dir).push(row); };
  const collapsed = new Set();
  for (const [rel, loaded] of roster) {
    const dir = path.posix.dirname(rel);
    if (circuits.has(rel) || scenery.has(rel)) {
      // One row per directory for the two forty-file data families.
      if (collapsed.has(dir)) continue;
      collapsed.add(dir);
      const n = circuits.has(rel) ? circuits.size : scenery.size;
      const purpose = circuits.has(rel)
        ? `${n} circuit definitions (data only), one file per id in \`Tracks.LIST\` order — see the "js/circuits/<id>.js" section`
        : `${n} bespoke \`scenery(api)\` closures, one per circuit, fetched when that circuit is built`;
      push(dir, { file: `<id>.js × ${n}`, global: circuits.has(rel) ? "TrackDefs" : "TrackScenery", roster: loaded, purpose });
      continue;
    }
    const src = readRepo(rel);
    push(dir, {
      file: path.posix.basename(rel),
      global: fileGlobal(rel, src) || "—",
      roster: loaded,
      purpose: headerSentence(src) || "— (no header comment)",
    });
  }
  // Directories in the order their first file loads; rows keep manifest order.
  return [...groups].map(([dir, rows]) => ({ dir, rows }));
}

export function renderBlock() {
  const groups = collect();
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const out = [
    `_${total} rows over ${groups.length} directories, in load order. \`tag\` = a \`<script>\` in index.html (FULL);` +
    " every other roster is injected by js/game.js when needed._",
    "",
  ];
  for (const g of groups) {
    out.push(`**\`${g.dir}/\`**`, "", "| File | Global | Loaded | Purpose (header, first sentence) |", "|---|---|---|---|");
    for (const r of g.rows) out.push(`| \`${cell(r.file)}\` | \`${cell(r.global)}\` | ${cell(r.roster)} | ${cell(r.purpose)} |`);
    out.push("");
  }
  return out.join("\n");
}

/** The doc with the marked block replaced; throws when the markers are missing. */
export function render() {
  const doc = readRepo(TARGET);
  const a = doc.indexOf(OPEN);
  if (a < 0) throw new Error(`${TARGET}: marker ${OPEN} not found — add it where the module index belongs`);
  const b = doc.indexOf(CLOSE, a);
  if (b < 0) throw new Error(`${TARGET}: closing marker ${CLOSE} not found after ${OPEN}`);
  return doc.slice(0, a) + OPEN + "\n" + renderBlock().replace(/\s+$/, "") + "\n" + doc.slice(b);
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.includes("--rows")) {
      process.stdout.write(JSON.stringify(collect(), null, 2) + "\n");
    } else {
      process.exitCode = emit(TARGET, render());
    }
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 2;
  }
}
