/* global-registry.test.mjs — a LINKER for the globals architecture.
 *
 * Bedrock Phase 0 (docs/research/ARCHITECTURE-REDESIGN-2026-08.md, "Phase 0 —
 * Observe"). Every js/ file is an IIFE assigning one global; nothing verified
 * that the file really assigns exactly the global it is supposed to, or that
 * every global it references is assigned by SOME file that loads first. The
 * post-extraction ritual was "grep the removed symbols" — this test replaces
 * it with the real reference graph from tools/check/scan-globals.mjs (espree +
 * eslint-scope over every manifest FULL + DEFERRED + LAZY_AGENT file, scanned LIVE — no
 * artifacts/ state, works from a fresh clone).
 *
 * Rules, with the currently-known violations FROZEN as baselines in the
 * size-ratchet idiom (existing entries are tolerated and documented;
 * new code cannot add to them — fix the read or extend the manifest instead):
 *
 *   1. one file, one global — every file eval-assigns exactly one global.
 *      Exceptions are enumerated: mat4.js's [M4, V3] pair, plus the deliberate
 *      multi-writer ACCUMULATOR globals — GLXShaders/TLXShaders (writer counts
 *      frozen) and TrackDefs (product data designed to grow: every new circuit
 *      is a new writer, so only its js/circuits/ home is pinned, not a count).
 *   2. eval-time reads resolve in load order — a global referenced during
 *      evaluation must be assigned by an earlier-or-same file (this is the
 *      invariant HARD_EDGES hand-records; violating it is a load-time
 *      ReferenceError). Asserted via the scanner's own --check logic.
 *   3. call-time reads resolve somewhere — a global referenced inside a
 *      function body must be assigned by SOME manifest file, be a host/env
 *      name, or sit in the frozen externals baseline below.
 *
 * The scan is EVIDENCE, not a pruner: dynamic `window[expr]` access is a
 * known false-negative class; the scanner lists such sites and this test
 * asserts the count stays zero so the class cannot creep in unseen.
 *
 * Run: node --test tests/unit/global-registry.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { scanRepo, buildGraph, checkGraph } from "../../tools/check/scan-globals.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
// "everything directly under <dir>/" as a path regex, from the manifest's own
// directory constant — the one place the circuits' home is spelled.
const homeOf = (dir) => new RegExp("^" + dir.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "/[^/]+\\.js$");

// One scan serves every test below (~2 s for the ~170 files).
const scan = scanRepo();
const graph = buildGraph(scan);
const report = checkGraph(scan);

// ---------------------------------------------------------------------------
// Frozen baselines (the ratchet). Shrinking any of these is progress; growth
// is the defect this suite exists to catch.

// Files allowed to eval-assign MORE than one global, with the exact set.
const MULTI_GLOBAL = {
  "js/core/mat4.js": ["M4", "V3"], // grandfathered pair — the matrix+vector math island
};

// Globals deliberately written by MANY files (accumulator idiom:
// `window.X = Object.assign(window.X || {}, …)` / `(window.X = window.X || []).push`).
// Value = the frozen writer count; the writer set may only shrink or stay.
// Growing one is a deliberate act: bump the count in the same commit that
// adds the writer (e.g. a new shader file merging into GLXShaders).
const SHARED_GLOBALS = {
  GLXShaders: 4,  // shaders/lit|sky|fx|post.js each merge their GLSL sources in
  // TLXShaders (8 writers, the three/ TSL family) left with the 2026-09-03
  // spike-out — no shipped file writes it now, so a frozen count of 8 would
  // fail in the direction that means "the files are gone", not "a writer was
  // added". It comes back with the backend.
};

// Accumulator globals that are PRODUCT DATA designed to grow — no writer-count
// freeze, only a writer-location rule. TrackDefs gains a writer with every new
// circuit (`new-track` is a sanctioned routine flow); per-file discipline is
// already covered by the one-global rule above (each circuit file assigns
// exactly TrackDefs), so the only thing to pin is that nothing OUTSIDE
// js/circuits/ ever writes it.
const GROWABLE_GLOBALS = {
  TrackDefs: homeOf(MANIFEST.CIRCUITS_DIR),
  // Same idiom, same reason, one directory deeper: each circuit's bespoke
  // scenery closure was split out of its def file so the 1,083 KB of closures
  // stops riding the boot script wall for a session that builds ONE circuit.
  // Forty writers by design; what is pinned is that nothing outside the split
  // directory writes it.
  TrackScenery: homeOf(MANIFEST.SCENERY_DIR),
};

// Known reads of names NO manifest file assigns — each with its story. A new
// external name is a red flag (an undeclared dependency or a typo'd global).
const KNOWN_EXTERNAL_READS = {
  "js/track/tracks.js": ["CircuitElevations"],  // future tools/gen/bake-elevation.mjs output; typeof-guarded feature probe
  "js/audio/spotify.js": [
    "Spotify",                      // the Spotify Web Playback SDK, injected at connect time
    "onSpotifyWebPlaybackSDKReady", // the SDK's own window callback contract
  ],
  "js/ui/select-screen.js": ["__APEX_BUILD"],          // exportRecovery stamps the shell build id
  "js/perf/governor.js": ["__APEX_BUILD"],            // index.html inline shell script sets these —
  "js/agent/apex.js": ["__APEX_BUILD", "__apexErrors"],      // the shell is outside the manifest,
  "js/game.js": ["__APEX_BUILD", "__apexReportError", "__TEST_MODE"], // so the scan cannot see the writer; Playwright init-script flag
  "js/net/scan.js": ["jsQR"],                     // vendored decoder, script-injected on demand
  // The two opt-in backends left the shipped tree in the 2026-09-03 spike-out
  // (spike/backends/, README there says how to re-attach). gfx.js keeps the
  // seam: both reads are `typeof X === "undefined"` probes that return null,
  // which is the same "backend refused" path an unsupported browser has always
  // taken. Keeping the branches is deliberate — the fallback is what makes the
  // spike safe, and re-attaching is then putting the files back, nothing more.
  "js/render/gfx.js": ["TLX", "WGX"],
};

// ---------------------------------------------------------------------------

test("every manifest file parses (the scan itself is whole)", () => {
  assert.deepEqual(scan.errors, [], "scan-globals could not parse a manifest file");
  assert.equal(scan.files.size, scan.all.length, "a manifest file was not scanned");
});

test("one file, one global — every file eval-assigns exactly its declared global", () => {
  const bad = [];
  for (const rel of scan.all) {
    const r = scan.files.get(rel);
    const got = [...r.assigns].sort();
    const expected = MULTI_GLOBAL[rel];
    if (expected) {
      if (JSON.stringify(got) !== JSON.stringify([...expected].sort()))
        bad.push(`${rel} assigns [${got}] (baseline says [${expected}])`);
    } else if (got.length !== 1) {
      bad.push(`${rel} assigns ${got.length} globals [${got}] — one file, one global`);
    }
  }
  assert.deepEqual(bad, [],
    "a file's eval-time global assignments drifted from the one-global rule; " +
    "new multi-global files are not allowed — split the file or fix the leak");
});

test("every global has one writer, except the declared accumulators", () => {
  const bad = [];
  for (const [nm, writers] of scan.assignedBy) {
    const where = GROWABLE_GLOBALS[nm];
    if (where) {
      // growable product-data accumulator: any number of writers, but only
      // from the declared location.
      for (const f of writers)
        if (!where.test(f)) bad.push(`${nm} is written by ${f}, outside its home ${where}`);
      continue;
    }
    const cap = SHARED_GLOBALS[nm] ?? 1;
    if (writers.length > cap)
      bad.push(`${nm} is written by ${writers.length} files (frozen at ${cap}): ${writers.join(", ")}`);
  }
  assert.deepEqual(bad, [],
    "a global gained a writer. If this is a deliberate new writer — e.g. a new " +
    "shader file merging into GLXShaders/TLXShaders — bump that name's frozen " +
    "count in SHARED_GLOBALS in this same commit; a second writer to a normal " +
    "single-owner global is a collision — rename the new file's global instead");
});

test("eval-time reads resolve in load order (manifest FULL is a topological sort)", () => {
  assert.deepEqual(report.toposort, [],
    "a file references a global AT EVAL TIME that no earlier file assigns — " +
    "that is a ReferenceError at load; reorder the manifest (and index.html) or defer the read");
});

test("deferred-backend globals are never eval-read by tagged files", () => {
  // A FULL file eval-reading a DEFERRED-only global (TLX/WGX/…) would crash
  // every boot that does not opt into that backend. The scanner separates
  // these; today there are none and none may appear.
  assert.deepEqual(report.deferredProvided, [],
    "an eval-time read is served only by a deferred (injected) file — that global " +
    "does not exist at tag-evaluation time");
});

test("call-time reads resolve to SOME manifest global, or a documented external", () => {
  const bad = [];
  for (const rel of scan.all) {
    const rec = graph.files[rel];
    const allowed = KNOWN_EXTERNAL_READS[rel] || [];
    for (const nm of rec.externalReads)
      if (!allowed.includes(nm))
        bad.push(`${rel} reads "${nm}" which no manifest file assigns and no baseline explains`);
  }
  assert.deepEqual(bad, [],
    "an undeclared global read appeared — either it is a typo, a missing manifest " +
    "file, or a genuinely new external dependency (document it in KNOWN_EXTERNAL_READS " +
    "with its story, in the same commit that adds it)");
});

// Dynamic `window[<expr>]` sites the scanner cannot resolve, frozen as
// "file:line" strings with a reason. Empty today, and it should stay that
// way — an entry here is a permanent blind spot in the registry.
const KNOWN_UNSCANNABLE_SITES = [];

test("the unscannable window[<expr>] class stays extinct", () => {
  const sites = Object.entries(graph.files)
    .flatMap(([f, r]) => r.unscannable.map((u) => `${f}:${u.line}`))
    .filter((s) => !KNOWN_UNSCANNABLE_SITES.includes(s));
  assert.deepEqual(sites, [],
    "dynamic window[expr] access defeats the whole registry — name the global " +
    "statically; if truly unavoidable, record the site in KNOWN_UNSCANNABLE_SITES " +
    "as \"file:line\" with a comment saying why it cannot be static");
});
