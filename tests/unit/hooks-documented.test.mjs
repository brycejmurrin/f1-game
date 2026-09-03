/* hooks-documented.test.mjs — every __apex hook must be in docs/DEBUG-HOOKS.md.
 *
 * `docs/DEBUG-HOOKS.md` opens by calling itself the full reference for the dev
 * API. It documented 155 of 183 hooks. Nothing checked, so nothing noticed —
 * including, immediately, a hook added earlier in this same cleanup pass
 * (`persistState`), which is how this guard came to be written.
 *
 * The gap is not cosmetic. `logLevel` was undocumented while AGENTS.md tells
 * every agent to use it; the whole `lobby*` family — fifteen hooks that are the
 * only way to drive the multiplayer screens from a test — was invisible to
 * anyone reading the reference rather than the source.
 *
 * A RATCHET, not a wall. Documenting 28 hooks properly is real work and is not
 * this pass's job, so the ones already missing are named in UNDOCUMENTED below
 * and the assertion is that NOTHING NEW joins them. Delete a name from that list
 * when you write its section; the second test fails if a name is listed but has
 * since been documented, so the list cannot rot in the other direction either.
 *
 * Same idiom as tests/data/ratchets.json and tests/unit/comment-citations.test.mjs:
 * a number (or a list) you must look at gets thought about, where a rule nobody
 * can satisfy gets deleted the first time it is inconvenient.
 *
 * Run: node --test tests/unit/hooks-documented.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Known-undocumented as of the 2026-08 cleanup pass. SHRINK THIS LIST.
// Grouped by why they are here, because the reason decides who should fix them.
const UNDOCUMENTED = new Set([
  // 2026-09: the 24 names that sat here (lobby test surface, garage staging,
  // subsystem doors) were documented in docs/DEBUG-HOOKS.md. Keep it empty.
]);

/** Top-level keys of the `const api = {…}` literal in js/game/apex.js. */
function hookNames() {
  const src = read("js/game/apex.js");
  const body = src.slice(src.indexOf("const api = {"));
  const names = new Set();
  // `async foo(` is a hook too — without the optional prefix the three async
  // methods (assetLoad, lobbyPairs, fetchTrackOutline) were invisible to the ratchet.
  for (const m of body.matchAll(/^ {2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*[(:]/gm)) names.add(m[1]);
  return names;
}

// A hook counts as documented if the reference names it as `__apex.foo` or as a
// `foo(` heading — both forms are in use and neither is wrong.
function documented(doc, name) {
  return new RegExp("__apex\\." + name + "\\b|`" + name + "\\(").test(doc);
}

// The generated hook index (tools/gen-hooks-table.mjs) lists EVERY hook by
// construction, so it would satisfy `documented()` for all of them and turn
// this ratchet vacuous. Strip it: the requirement here is a HAND section per
// hook. tests/unit/generated-docs.test.mjs guards the index separately.
function handSections() {
  const doc = read("docs/DEBUG-HOOKS.md");
  const a = doc.indexOf("<!-- GENERATED: hooks-table -->");
  const b = doc.indexOf("<!-- /GENERATED -->", a);
  return a >= 0 && b > a ? doc.slice(0, a) + doc.slice(b) : doc;
}

test("no NEW __apex hook ships undocumented", () => {
  const doc = handSections();
  const missing = [...hookNames()].filter((n) => !documented(doc, n) && !UNDOCUMENTED.has(n)).sort();
  assert.deepEqual(missing, [],
    "a hook exists in js/game/apex.js with no section in docs/DEBUG-HOOKS.md. Write one — " +
    "the file calls itself the full reference, and a hook nobody can find is a hook nobody uses");
});

test("the undocumented list does not name a hook that has since been documented", () => {
  const doc = handSections();
  const stale = [...UNDOCUMENTED].filter((n) => documented(doc, n)).sort();
  assert.deepEqual(stale, [],
    "these are documented now — delete them from UNDOCUMENTED so the ratchet keeps its grip");
});

test("the undocumented list does not name a hook that no longer exists", () => {
  const names = hookNames();
  const gone = [...UNDOCUMENTED].filter((n) => !names.has(n)).sort();
  assert.deepEqual(gone, [],
    "these hooks are gone from js/game/apex.js — drop them from UNDOCUMENTED");
});

test("openf1 and jolpica guard a missing path instead of fetching garbage", () => {
  const src = read("js/game/apex.js");
  for (const name of ["openf1", "jolpica"]) {
    const m = src.match(new RegExp(name + "\\(path\\) \\{[\\s\\S]*?\\n  \\},"));
    assert.ok(m, name + " body not found");
    assert.match(m[0], /error:\s*"missing_path"/);
    assert.match(m[0], /ok:\s*false/);
  }
});

test("jump synchronises the HUD instead of depending on the next animation frame", () => {
  const game = read("js/game.js");
  const apex = read("js/game/apex.js");
  assert.match(game, /refreshHud:\s*\(\.\.\.a\)\s*=>\s*updateHud\(\.\.\.a\)/,
    "the shared facade must expose the real HUD updater through a deferred binding");
  const jump = apex.match(/jump\(frac, speed, lateral\) \{[\s\S]*?\n  \},/);
  assert.ok(jump, "jump body not found");
  assert.match(jump[0], /G\.refreshHud\(true\)/,
    "jump must force-publish its state to the HUD for frozen/headless probes");
});
