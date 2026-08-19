// load-order.test.mjs — asserts index.html / tools/carview.html against the
// single source of truth in tools/manifest.cjs.
//
// index.html cannot be generated (no build step), so it is hand-edited; this
// test makes divergence impossible to ship:
//   - the <script> sequence must equal MANIFEST.FULL exactly (order included)
//   - the stylesheet <link> sequence must equal MANIFEST.CSS
//   - every ?v= value must match that asset's content hash
//   - the shell build meta and version.json generation must match
//   - every file under js/**/*.js must appear in FULL ∪ DEFERRED ∪ LAZY_AGENT
//     (no forgotten tags, no dead files) — catches "created the file but
//     forgot the tag / DEFERRED / LAZY_AGENT entry"
//   - every HARD_EDGES pair must be ordered in FULL (eval-time dependencies)
//   - LAZY_AGENT has no <script> tag and is not SW-optional (V8 full-compiles
//     install puts); game.js AGENT_FILES / AGENT_EDGES must match the manifest
//   - tools/carview.html's tags must equal MANIFEST.CARVIEW
//   - TRACK_VM entries must exist and appear in FULL
//
// Run: node --test tests/unit/load-order.test.mjs   (part of npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = new URL("../..", import.meta.url).pathname;

const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");

// Same double-quoted attribute parse sw.js relies on at install time.
function parseTags(html, attrRe) {
  const out = [];
  for (const m of html.matchAll(attrRe)) out.push(m[1]);
  return out;
}
const scriptSrcs = parseTags(indexHtml, /<script[^>]*\bsrc="([^"]+)"/g);
const linkHrefs = parseTags(indexHtml, /<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g);

const stripV = (u) => u.replace(/\?v=[A-Za-z0-9._-]+$/, "");
const vOf = (u) => { const m = u.match(/\?v=([a-f0-9]{12})$/); return m ? m[1] : null; };

test("index.html script sequence equals MANIFEST.FULL", () => {
  assert.deepEqual(scriptSrcs.map(stripV), MANIFEST.FULL);
});

test("index.html stylesheet sequence equals MANIFEST.CSS", () => {
  assert.deepEqual(linkHrefs.map(stripV), MANIFEST.CSS);
});

test("every asset carries its content hash and shell generation matches version.json", () => {
  for (const url of [...scriptSrcs, ...linkHrefs]) {
    const rel = stripV(url);
    const expected = createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex").slice(0, 12);
    assert.equal(vOf(url), expected, `${rel} must carry its current content hash`);
  }
  const versionJson = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
  const meta = indexHtml.match(/<meta\s+name="apex-build"\s+content="(\d+)"/);
  assert.ok(meta, "index.html must declare the shell generation");
  assert.equal(versionJson.build, Number(meta[1]), "version.json build must equal the shell generation");
});

test("__APEX_BUILD is derived, not a stale literal", () => {
  assert.ok(!/window\.__APEX_BUILD\s*=\s*[1-9]\d*/.test(indexHtml),
    "index.html must not hardcode window.__APEX_BUILD = <number> (the ?v= bump sed does not touch it)");
});

test("shell locks scale and cancels iOS double-tap / gesture zoom", () => {
  const m = indexHtml.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
  console.log("[load-order] viewport content:", m ? m[1] : "NOT FOUND");
  assert.ok(m, "index.html must declare a viewport");
  assert.match(m[1], /maximum-scale=1/, "viewport must cap scale");
  assert.match(m[1], /user-scalable=no/, "viewport must disable pinch/double-tap scale");
  const hasGesture = /addEventListener\("gesturestart"/.test(indexHtml);
  const hasTouchEnd = /addEventListener\("touchend"/.test(indexHtml);
  console.log("[load-order] gesturestart listener present:", hasGesture);
  console.log("[load-order] touchend listener present:", hasTouchEnd);
  assert.match(indexHtml, /addEventListener\("gesturestart"/,
    "shell must cancel iOS GestureEvents (page pinch-zoom)");
  assert.match(indexHtml, /addEventListener\("touchend"/,
    "shell must cancel same-spot double-tap zoom");
  console.log("[load-order] iOS zoom cancel: OK");
});

test("service-worker registration derives the shell build", () => {
  assert.match(indexHtml, /meta\[name="apex-build"\]/,
    "inline shell code must discover the shell generation from metadata");
  assert.match(indexHtml, /register\("sw\.js" \+ \(loaded \? "\?v=" \+ loaded : ""\)\)/,
    "service-worker registration must append the parsed build once");
});

test("every js/**/*.js appears in FULL ∪ DEFERRED ∪ LAZY_AGENT (and vice versa)", () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(".js")) files.push(rel);
    }
  })("js");
  // FULL ∪ DEFERRED ∪ LAZY_AGENT: a tagless file has no <script> by design, but
  // it must still be accounted for, or "created the file, forgot to load it"
  // stops being catchable.
  const known = new Set([...MANIFEST.FULL, ...deferredFiles(), ...lazyFiles()]);
  const missing = files.filter((f) => !known.has(f));
  const dead = [...known].filter((f) => !files.includes(f));
  assert.deepEqual(missing, [], `js/ files with no manifest entry (add a <script> tag + manifest line, a DEFERRED entry, or a LAZY_AGENT entry): ${missing}`);
  assert.deepEqual(dead, [], `manifest entries with no file on disk: ${dead}`);
});

// ---- DEFERRED: js/ files with no tag, injected at runtime by game.js --------
// Three things have to agree or a deferred backend silently 404s in production
// while every local run passes (the exact failure mode that shipped vendor/ to
// Pages in build 895): the manifest, game.js's own loader table, and sw.js's
// optional precache seed (the SW discovers everything else by parsing tags, so
// a tagless file is invisible to it).
function deferredFiles() {
  return Object.values(MANIFEST.DEFERRED).flat();
}

function lazyFiles() {
  return MANIFEST.LAZY_AGENT || [];
}

test("DEFERRED files have no <script> tag", () => {
  const tagged = new Set(scriptSrcs.map(stripV));
  for (const f of deferredFiles()) {
    assert.ok(!tagged.has(f), `${f} is DEFERRED but still has a <script> tag in index.html`);
  }
});

test("DEFERRED_EDGES are ordered within their group", () => {
  for (const [before, after] of MANIFEST.DEFERRED_EDGES) {
    const group = Object.values(MANIFEST.DEFERRED).find((g) => g.includes(before) && g.includes(after));
    assert.ok(group, `DEFERRED_EDGES pair ${before} -> ${after} spans no single group`);
    assert.ok(group.indexOf(before) < group.indexOf(after), `${before} must load before ${after}`);
  }
});

test("js/game.js BACKEND_FILES equals MANIFEST.DEFERRED, group for group", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const block = src.match(/const BACKEND_FILES = \{([\s\S]*?)\n\};/);
  assert.ok(block, "js/game.js must declare a BACKEND_FILES table for the deferred backends");
  for (const [name, files] of Object.entries(MANIFEST.DEFERRED)) {
    const group = block[1].match(new RegExp(`\\b${name}:\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(group, `BACKEND_FILES is missing the "${name}" group`);
    const listed = [...group[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(listed, files, `BACKEND_FILES.${name} must match MANIFEST.DEFERRED.${name} exactly, in order`);
  }
});

test("js/game.js BACKEND_EDGES equals MANIFEST.DEFERRED_EDGES", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const block = src.match(/const BACKEND_EDGES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "js/game.js must declare BACKEND_EDGES for the DAG loader");
  const listed = [...block[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(listed, MANIFEST.DEFERRED_EDGES);
});

test("DEFERRED_EDGES leave more than one TLX file ready at wave 0", () => {
  const files = MANIFEST.DEFERRED.three;
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of MANIFEST.DEFERRED_EDGES) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const wave0 = files.filter((f) => preds.get(f).length === 0);
  assert.ok(wave0.length >= 6, `TLX wave 0 should start the independent IIFEs together, got ${wave0.length}: ${wave0.join(",")}`);
  assert.ok(!wave0.includes("js/render/three/tlx.js"), "tlx.js must wait for its factories");
  assert.ok(!wave0.includes("js/render/three/tsl-lit.js"), "tsl-lit.js must wait for tsl-chunks.js");
});

test("sw.js seeds every DEFERRED file into its optional precache set", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const optional = sw.match(/const optional = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(optional, "sw.js must declare an `optional` precache Set");
  const seeded = new Set([...optional[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const f of deferredFiles()) {
    assert.ok(seeded.has(f), `${f} is DEFERRED, so sw.js must seed it (the tag parser cannot find it)`);
  }
});

test("LAZY_AGENT files have no <script> tag", () => {
  const tagged = new Set(scriptSrcs.map(stripV));
  assert.ok(lazyFiles().length >= 3, "LAZY_AGENT must list the agent surface");
  for (const f of lazyFiles()) {
    assert.ok(!tagged.has(f), `${f} is LAZY_AGENT but still has a <script> tag in index.html`);
  }
});

test("LAZY_EDGES are ordered within LAZY_AGENT", () => {
  const group = lazyFiles();
  for (const [before, after] of MANIFEST.LAZY_EDGES) {
    assert.ok(group.includes(before) && group.includes(after),
      `LAZY_EDGES pair ${before} -> ${after} spans no LAZY_AGENT file`);
    assert.ok(group.indexOf(before) < group.indexOf(after), `${before} must load before ${after}`);
  }
});

test("js/game.js AGENT_FILES equals MANIFEST.LAZY_AGENT", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const block = src.match(/const AGENT_FILES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "js/game.js must declare AGENT_FILES for the lazy agent surface");
  const listed = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed, MANIFEST.LAZY_AGENT);
});

test("js/game.js AGENT_EDGES equals MANIFEST.LAZY_EDGES", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const block = src.match(/const AGENT_EDGES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "js/game.js must declare AGENT_EDGES for the lazy agent DAG");
  const listed = [...block[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(listed, MANIFEST.LAZY_EDGES);
});

test("sw.js optional precache does not include LAZY_AGENT", () => {
  // Install-time Cache.put full-compiles (v8.dev). These three stay fetch-miss
  // only — do not seed them in optional the way DEFERRED backends are seeded.
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const optional = sw.match(/const optional = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(optional, "sw.js must declare an `optional` precache Set");
  const seeded = new Set([...optional[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const f of lazyFiles()) {
    assert.ok(!seeded.has(f), `${f} is LAZY_AGENT — must not be SW-optional`);
    assert.ok(![...seeded].some((u) => u.includes(f)), `${f} must not appear in sw.js optional`);
  }
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
  const tracksAt = idx.get(MANIFEST.PATHS.TRACKS_ENGINE);
  for (const id of MANIFEST.CIRCUITS) {
    const at = idx.get(`${MANIFEST.CIRCUITS_DIR}/${id}.js`);
    assert.ok(at !== undefined && at < tracksAt, `${id} circuit def must precede js/track/tracks.js`);
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
