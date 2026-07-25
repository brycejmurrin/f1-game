// load-order.test.mjs — asserts index.html / tools/carview.html against the
// single source of truth in tools/manifest.cjs.
//
// index.html cannot be generated (no build step), so it is hand-edited; this
// test makes divergence impossible to ship:
//   - the <script> sequence must equal MANIFEST.FULL exactly (order included)
//   - the stylesheet <link> sequence must equal MANIFEST.CSS
//   - every ?v= value must be identical, and version.json must match it
//   - every file under js/**/*.js must appear in FULL (no forgotten tags,
//     no dead files) — catches "created the file but forgot the tag"
//   - every HARD_EDGES pair must be ordered (eval-time dependencies)
//   - tools/carview.html's tags must equal MANIFEST.CARVIEW
//   - TRACK_VM entries must exist and appear in FULL
//
// Run: node --test tests/load-order.test.mjs   (part of npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MANIFEST = require("../tools/manifest.cjs");
const ROOT = new URL("..", import.meta.url).pathname;

const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");

// Same double-quoted attribute parse sw.js relies on at install time.
function parseTags(html, attrRe) {
  const out = [];
  for (const m of html.matchAll(attrRe)) out.push(m[1]);
  return out;
}
const scriptSrcs = parseTags(indexHtml, /<script[^>]*\bsrc="([^"]+)"/g);
const linkHrefs = parseTags(indexHtml, /<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g);

const stripV = (u) => u.replace(/\?v=\d+$/, "");
const vOf = (u) => { const m = u.match(/\?v=(\d+)$/); return m ? parseInt(m[1], 10) : null; };

test("index.html script sequence equals MANIFEST.FULL", () => {
  assert.deepEqual(scriptSrcs.map(stripV), MANIFEST.FULL);
});

test("index.html stylesheet sequence equals MANIFEST.CSS", () => {
  assert.deepEqual(linkHrefs.map(stripV), MANIFEST.CSS);
});

test("every asset carries the same ?v= and version.json matches", () => {
  const vs = new Set([...scriptSrcs, ...linkHrefs].map(vOf));
  assert.equal(vs.size, 1, `mixed ?v= values: ${[...vs].join(", ")}`);
  const v = [...vs][0];
  assert.ok(Number.isInteger(v) && v > 0, "assets must carry ?v=N");
  const versionJson = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
  assert.equal(versionJson.build, v, "version.json build must equal the ?v= build");
});

test("__APEX_BUILD is derived, not a stale literal", () => {
  assert.ok(!/window\.__APEX_BUILD\s*=\s*[1-9]\d*/.test(indexHtml),
    "index.html must not hardcode window.__APEX_BUILD = <number> (the ?v= bump sed does not touch it)");
});

test("every js/**/*.js appears in MANIFEST.FULL (and vice versa)", () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(".js")) files.push(rel);
    }
  })("js");
  const full = new Set(MANIFEST.FULL);
  const missing = files.filter((f) => !full.has(f));
  const dead = MANIFEST.FULL.filter((f) => !files.includes(f));
  assert.deepEqual(missing, [], `js/ files with no manifest entry (add a <script> tag + manifest line): ${missing}`);
  assert.deepEqual(dead, [], `manifest entries with no file on disk: ${dead}`);
});

test("HARD_EDGES are ordered in FULL", () => {
  const idx = new Map(MANIFEST.FULL.map((f, i) => [f, i]));
  for (const [before, after] of MANIFEST.HARD_EDGES) {
    assert.ok(idx.has(before), `HARD_EDGES references unknown file ${before}`);
    assert.ok(idx.has(after), `HARD_EDGES references unknown file ${after}`);
    assert.ok(idx.get(before) < idx.get(after), `${before} must load before ${after}`);
  }
});

test("all circuit defs load before the tracks engine; game.js loads last", () => {
  const idx = new Map(MANIFEST.FULL.map((f, i) => [f, i]));
  const tracksAt = idx.get("js/tracks.js");
  for (const id of MANIFEST.CIRCUITS) {
    const at = idx.get(`${MANIFEST.CIRCUITS_DIR}/${id}.js`);
    assert.ok(at !== undefined && at < tracksAt, `${id} circuit def must precede js/tracks.js`);
  }
  assert.equal(MANIFEST.FULL[MANIFEST.FULL.length - 1], "js/game.js");
});

test("tools/carview.html tags equal MANIFEST.CARVIEW", () => {
  const carview = readFileSync(join(ROOT, "tools/carview.html"), "utf8");
  const srcs = parseTags(carview, /<script[^>]*\bsrc="([^"]+)"/g)
    .map((s) => s.replace(/^\.\.\//, "")).map(stripV);
  assert.deepEqual(srcs, MANIFEST.CARVIEW);
});

test("TRACK_VM entries exist in FULL", () => {
  const full = new Set(MANIFEST.FULL);
  for (const entry of MANIFEST.TRACK_VM) {
    if (entry === "@circuits") continue;
    assert.ok(full.has(entry), `TRACK_VM entry ${entry} missing from FULL`);
  }
});
