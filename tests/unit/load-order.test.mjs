// load-order.test.mjs — asserts index.html / tools/carview.html against the
// single source of truth in tools/manifest.cjs.
//
// The tag blocks, sw.js's precache seed and js/roster.js are GENERATED from
// the manifest by tools/gen-shell.mjs; this test makes divergence impossible
// to ship:
//   - every generated block is byte-identical to a fresh `gen-shell` run
//   - the <script> sequence must equal MANIFEST.FULL exactly (order included)
//   - the stylesheet <link> sequence must equal MANIFEST.CSS
//   - every ?v= value must match that asset's content hash
//   - the shell build meta and version.json generation must match
//   - every file under js/**/*.js must appear in FULL ∪ DEFERRED ∪ LAZY_*
//     (no forgotten tags, no dead files) — catches "created the file but
//     forgot the manifest entry"
//   - every HARD_EDGES pair must be ordered in FULL (eval-time dependencies)
//   - LAZY_AGENT has no <script> tag and is not SW-optional (V8 full-compiles
//     install puts)
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
import { fileURLToPath } from "node:url";

import { stale as genShellStale } from "../../tools/gen-shell.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

// Extracted list blocks carry inline comments, and a bare /"…"/g pull treats a
// quoted phrase INSIDE a comment as a listed file — a round-6 audit measured
// the sw.js optional set capturing 'no side world' from a comment, meaning a
// DEFERRED file named only in prose would satisfy the precache lockstep (the
// exact build-895 failure this guard exists to prevent). Strip comments first.
function stripComments(block) {
  return block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}


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

// THE ONE DRIFT CHECK. index.html's tag blocks, carview's tags, sw.js's optional
// seed and js/roster.js are projections of the manifest; a hand edit inside a
// generated block, or a manifest edit without a regeneration, shows up here as
// the first differing line.
test("every gen-shell block is byte-identical to a fresh generation", () => {
  const drift = genShellStale();
  assert.deepEqual(drift.map((d) => `${d.rel}\n${d.diff}`), [],
    "run `node tools/gen-shell.mjs` — a generated block has been hand-edited or the manifest changed");
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
// The manifest is the truth; js/roster.js (game.js's loader table) and sw.js's
// optional precache seed are generated from it (the SW discovers everything
// else by parsing tags, so a tagless file is invisible to it). A deferred
// backend that silently 404s in production while every local run passes was
// the build-895 failure; the seed tests below keep the generated block honest.
function deferredFiles() {
  return Object.values(MANIFEST.DEFERRED).flat();
}

function lazyFiles() {
  // LAZY_AGENT (dev/test surface) + LAZY_RACE (the race payload: no tag, pulled
  // by game.js once a session needs it). Both are tagless BY DESIGN and still
  // have to be accounted for, or "created the file, forgot to load it" stops
  // being catchable.
  return [...(MANIFEST.LAZY_AGENT || []), ...(MANIFEST.LAZY_RACE || []),
    ...(MANIFEST.LAZY_SCENERY || []), ...(MANIFEST.LAZY_DATA || []),
    ...(MANIFEST.LAZY_NET || [])];
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
  const seeded = new Set([...stripComments(optional[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const f of deferredFiles()) {
    assert.ok(seeded.has(f), `${f} is DEFERRED, so sw.js must seed it (the tag parser cannot find it)`);
  }
  // LAZY_RACE + LAZY_SCENERY are tagless for the same reason and fail the same
  // way, only worse: loadBackendScripts resolves on error, so offline the
  // circuit builds BARE — road and terrain, no dressing — with no exception to
  // notice. LAZY_AGENT is deliberately NOT here (dev/test surface; a player who
  // never opens it should not pay for it in the install).
  for (const f of [...(MANIFEST.LAZY_RACE || []), ...(MANIFEST.LAZY_SCENERY || []),
                   ...(MANIFEST.LAZY_DATA || []), ...(MANIFEST.LAZY_NET || [])]) {
    assert.ok(seeded.has(f),
      `${f} is a lazily-injected asset, so sw.js must seed it or it is unreachable offline`);
  }
});

// The seed key has to MATCH the request. loadBackendScripts injects everything
// it loads as `<path>?v=<build>`, and the SW's fetch handler matches without
// ignoreSearch, so a bare seed is a key nothing ever asks for — the build-895
// shape, recorded in sw.js's own install comment.
test("sw.js stamps every injected asset it seeds", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const m = sw.match(/const stamped = urls\.optional\.map\(\(u\) =>\s*(\/.+\/)\.test\(u\)/);
  assert.ok(m, "sw.js must map its optional seeds through a build stamp");
  // Rebuild the SW's own predicate and RUN it, rather than pattern-matching the
  // source text: the question is which paths actually get the ?v= suffix.
  const stamps = new RegExp(m[1].slice(1, -1));
  const injected = [...deferredFiles(), ...(MANIFEST.LAZY_RACE || []),
    ...(MANIFEST.LAZY_SCENERY || []), ...(MANIFEST.LAZY_DATA || []),
    ...(MANIFEST.LAZY_NET || [])];
  const unstamped = injected.filter((f) => !stamps.test(f));
  assert.deepEqual(unstamped, [],
    `these are injected as ?v=<build> but seeded bare, so the cache key is one nothing requests: ${unstamped}`);
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

// EVERY CIRCUIT LOADER MUST ALSO LOAD THE SCENERY DIRECTORY. Circuits are read
// with readdirSync(CIRCUITS_DIR).filter(f => f.endsWith(".js")), which does not
// descend into js/circuits/scenery/ — so a loader that misses the roster builds
// every circuit BARE (road and terrain, no dressing) and still produces
// confident, plausible numbers. Measured while doing the split: tools/
// float-audit.cjs reported cota at 3,988 prop cells instead of 32,897 and the
// grounding baseline "grew" a floater, which reads as a scenery regression
// rather than as a missing include. Five loaders existed; four had to be found
// by chasing red tests. This is so the sixth cannot be.
test("every circuit loader also loads the split scenery roster", () => {
  const roots = ["tools", "tests/unit"];
  const offenders = [];
  for (const root of roots) {
    for (const name of readdirSync(join(ROOT, root))) {
      if (!/\.(mjs|cjs|js)$/.test(name)) continue;
      const rel = `${root}/${name}`;
      // CODE, not prose: read with comments stripped. The first cut of this
      // guard was satisfied by the word LAZY_SCENERY appearing in the very
      // comment explaining why the roster is needed, so deleting the actual
      // load left it green — a guard that passes on a mention of itself.
      const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
      // A loader is a file that RUNS circuit files, not one that merely names
      // the directory (manifest.cjs itself, or a path-building helper).
      if (!/CIRCUITS_DIR/.test(src)) continue;
      if (!/runFile\(|runInContext\(|runInNewContext\(/.test(src)) continue;
      if (/LAZY_SCENERY|sceneryPath/.test(src)) continue;
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [],
    `these run circuit files but never load js/circuits/scenery/ — they will build every ` +
    `circuit bare and report it as a scenery regression: ${offenders.join(", ")}`);
});

test("LAZY_RACE files have no <script> tag", () => {
  const tagged = new Set(scriptSrcs.map(stripV));
  for (const f of (MANIFEST.LAZY_RACE || [])) {
    assert.ok(!tagged.has(f), `${f} is LAZY_RACE but still has a <script> tag in index.html`);
  }
});

// hub.js calls Data*.create() at EVAL time, so these pairs are the difference
// between a working hub and a TypeError on the tab modules. The manifest
// DERIVES them ("everything, then the hub") and js/roster.js carries the
// result to game.js; assert the derivation actually orders every tab module.
test("the data-hub DAG orders every tab module before hub.js", () => {
  const want = MANIFEST.LAZY_DATA.filter((f) => f !== "js/data/hub.js").map((f) => [f, "js/data/hub.js"]);
  assert.deepEqual(MANIFEST.LAZY_DATA_EDGES, want);
  assert.equal(want.length, MANIFEST.LAZY_DATA.length - 1,
    "every LAZY_DATA file except the hub itself must be ordered before it");
});

test("sw.js optional precache does not include LAZY_AGENT", () => {
  // Install-time Cache.put full-compiles (v8.dev). These three stay fetch-miss
  // only — do not seed them in optional the way DEFERRED backends are seeded.
  // MANIFEST.LAZY_AGENT, not lazyFiles(): that helper now spans three tagless
  // rosters and the other two (LAZY_RACE / LAZY_SCENERY) are REQUIRED to be
  // seeded, because a missed fetch there builds a bare circuit offline instead
  // of merely withholding a dev API.
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const optional = sw.match(/const optional = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(optional, "sw.js must declare an `optional` precache Set");
  const seeded = new Set([...stripComments(optional[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const f of (MANIFEST.LAZY_AGENT || [])) {
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
