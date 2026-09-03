/* gen-arch-table.test.mjs — the module index of docs/ARCHITECTURE.md cannot drift.
 *
 * Same idiom as generated-docs.test.mjs: tools/gen-arch-table.mjs derives the
 * `<!-- @gen-arch:modules -->` block from tools/manifest.cjs + each file's
 * header comment, and `--check` exits 1 when the committed doc is not
 * byte-identical to a fresh regeneration. This test runs that mode and adds
 * the sanity assertions a silently-empty or silently-wrong generator would
 * still pass: every non-data manifest file has a row, the roster label on
 * each row is the manifest's own roster (not a guess), the header-sentence
 * extractor handles the three comment shapes js/ actually uses, and the
 * hand-written contract prose around the block survives untouched.
 *
 * (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2 — the generator this
 * pins is what lets the later move window rewrite path strings only, never
 * hand-edit a module table.)
 *
 * Run: node --test tests/unit/gen-arch-table.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { collect, headerSentence, fileGlobal, rosterOf, OPEN, CLOSE } from "../../tools/gen-arch-table.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("docs/ARCHITECTURE.md matches a fresh `gen-arch-table.mjs --check`", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/gen-arch-table.mjs"), "--check"],
    { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0,
    `docs/ARCHITECTURE.md's module index is stale or the generator failed (exit ${r.status}).\n${r.stdout}${r.stderr}\n` +
    "Regenerate with: node tools/gen-arch-table.mjs");
});

test("every non-data manifest file gets exactly one row", () => {
  const groups = collect();
  const rows = groups.flatMap((g) => g.rows);
  // 138 non-collapsed rows today: every FULL/DEFERRED/LAZY_* file minus the 40
  // circuit defs and 40 scenery closures, which collapse to one row per
  // directory. A generator that silently dropped a roster would undershoot.
  assert.ok(rows.length > 130, `expected > 130 rows, found ${rows.length}`);
  const dataFiles = new Set([...MANIFEST.CIRCUITS.map(MANIFEST.circuitPath), ...MANIFEST.LAZY_SCENERY]);
  const rostered = [
    ...MANIFEST.FULL, ...Object.values(MANIFEST.DEFERRED).flat(), ...MANIFEST.LAZY_AGENT,
    ...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
  ].filter((f) => !dataFiles.has(f));
  const named = new Set(rows.map((r) => r.file));
  const missing = rostered.filter((f) => !named.has(path.posix.basename(f)));
  assert.deepEqual(missing, [], "a rostered file has no row in the generated module index");
  // Both collapsed directories appear exactly once, with the roster's own count.
  const circuitsRow = rows.find((r) => r.file.startsWith("<id>.js"));
  assert.ok(circuitsRow, "js/circuits/ collapsed row is missing");
  assert.equal(circuitsRow.file, `<id>.js × ${MANIFEST.CIRCUITS.length}`);
  const sceneryRow = rows.find((r) => r.file.startsWith("<id>.js") && r !== circuitsRow);
  assert.ok(sceneryRow, "js/circuits/scenery/ collapsed row is missing");
  assert.equal(sceneryRow.file, `<id>.js × ${MANIFEST.LAZY_SCENERY.length}`);
});

test("each row's roster label is the manifest's own roster, not a guess", () => {
  const roster = rosterOf();
  const groups = collect();
  for (const g of groups) {
    for (const r of g.rows) {
      if (r.file.startsWith("<id>.js")) continue;  // collapsed rows carry their own label, checked above
      const rel = `${g.dir}/${r.file}`;
      assert.equal(r.roster, roster.get(rel), `${rel}: row says roster "${r.roster}", manifest says "${roster.get(rel)}"`);
    }
  }
});

test("headerSentence handles the three header shapes js/ uses", () => {
  assert.equal(
    headerSentence('/* Apex 26 — Teams: hardcoded grid.\n   Second line. */\nconst Teams = (function () {'),
    "Teams: hardcoded grid.");
  assert.equal(
    headerSentence('"use strict";\n// MusicLib — bring your own music.\n// Second comment line.\nconst MusicLib = (function () {'),
    "MusicLib — bring your own music.");
  assert.equal(
    headerSentence('const CrestPaths = Object.freeze({\n  // no header at all\n'),
    null);
  // e.g. / a file name mid-sentence do not end it early.
  assert.equal(
    headerSentence('/* Apex 26 — reads e.g. this file, js/track/tracks.js, for context. Second sentence. */\nconst X = (function () {'),
    "reads e.g. this file, js/track/tracks.js, for context.");
});

test("fileGlobal finds the real global, and treats js/game.js as the documented exception", () => {
  assert.equal(fileGlobal("js/data/teams.js", 'const Teams = (function () {\n  "use strict";\n'), "Teams");
  assert.equal(fileGlobal("js/car/crest-paths.js", 'const CrestPaths = Object.freeze({\n'), "CrestPaths");
  assert.equal(fileGlobal("js/roster.js", 'self.ApexRoster = Object.freeze({\n'), "ApexRoster");
  // game.js is a bare entry point with no product global — the 374 column-0
  // `const NAME = (function/Object.freeze…` declarations inside its own IIFE
  // (NEUTRAL_INPUT among them) must not be mistaken for its "global".
  assert.equal(fileGlobal(MANIFEST.PATHS.GAME, 'const NEUTRAL_INPUT = Object.freeze({ steer: 0 });\n'), null);
});

test("the hand-written contract prose around the block survives regeneration", () => {
  const doc = read("docs/ARCHITECTURE.md");
  const a = doc.indexOf(OPEN), b = doc.indexOf(CLOSE, a);
  assert.ok(a >= 0 && b > a, "docs/ARCHITECTURE.md is missing the @gen-arch:modules markers");
  assert.match(doc.slice(0, a), /## Module index \(generated\)/, "the marker's own intro heading must survive");
  assert.match(doc, /## js\/game\.js — main/, "the hand-written js/game.js contract section must survive");
  assert.match(doc, /## js\/render\/glx\.js .* renderers/, "the hand-written renderer contract section must survive");
  assert.doesNotMatch(doc.slice(a, b), /\bundefined\b/);
});
