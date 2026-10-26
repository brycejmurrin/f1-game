/* source-pin-hygiene.test.mjs — raw reads of js/game.js's TEXT only go down.
 *
 * R3-ARCHITECTURE-4 (2026-10-10): 132 test files held 354 `readFileSync(…
 * "js/game.js")` sites (measured by the hunter as quoted `game.js` literals).
 * Every carve out of game.js moves text those tests regex: a positive pin goes
 * red, a negative pin (`doesNotMatch(game, /x/)`) goes silently vacuous. The
 * replacement is tests/helpers/game-source.mjs — `gameSource()` (game.js plus
 * every module carved out of it, derived from the manifest) and
 * `symbolSource(decl)` (fnSource over that union) — so a carve stops being a
 * 5-20-test rewrite. Existing sites stay (counted, not moved); new code reads
 * through the helper. The ceiling is `tree.rawGameReads` in tests/data/ratchets.json
 * and only ever moves DOWN — lower it when you migrate sites.
 *
 * Run: node --test tests/unit/source-pin-hygiene.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carvedFromGame, gameSource, symbolSource } from "../helpers/game-source.mjs";
import { pinVerdict, pinSites, pinPatterns } from "../../tools/check/ratchets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The count is `tree.rawGameReads` in tests/data/ratchets.json (quoted `game.js` path
// literals under tests/, less the helper that is the sanctioned reader), judged
// diff-relative on a PR like every pin counter (tools/check/ratchets.mjs ratchetMode).
// A possessive in prose (`game.js's`) is not a read: 2026-10-16 a comment saying
// "game.js's real scale" counted as the 309th read and turned the tip red.
const RAW = pinPatterns.RAW_GAME;

test("the raw-read pattern counts quoted path literals, not possessive prose", () => {
  const count = (t) => (t.match(RAW) || []).length;
  assert.equal(count('readFileSync(join(ROOT, "js/game.js"), "utf8")'), 1);
  assert.equal(count("readFileSync(join(ROOT, 'js/game.js'), 'utf8')"), 1);
  assert.equal(count("// Scripted pace on game.js's real scale"), 0, "a possessive comment is not a read");
  assert.equal(count("// see game.js's note and also read 'js/game.js'"), 1, "only the real literal counts");
});

test("raw js/game.js source reads under tests/ never grow (read through tests/helpers/game-source.mjs)", async () => {
  const v = await pinVerdict("rawGameReads");
  const biggest = (await pinSites("rawGameReads")).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(", ");
  assert.ok(v.ok,
    `${v.value} raw game.js reads (ceiling ${v.ceiling}${v.base ? `; base ${v.base.value}/${v.base.ceiling}` : ""}) — read game.js through ` +
    `gameSource()/symbolSource() (tests/helpers/game-source.mjs) so the pin survives the next carve. Biggest: ${biggest}`);
  assert.ok(v.looseOk,
    `${v.value} raw reads is far under the ceiling ${v.ceiling}: node tools/check/ratchets.mjs --update --lower-only so the ratchet keeps its grip`);
});

test("gameSource is game.js plus the modules game.js instantiates — derived, not listed", () => {
  const carved = carvedFromGame();
  // A sample of carves across the 2026-07..10 waves: each is a `X.create(G…)` in game.js.
  for (const f of ["js/race/race-control.js", "js/ui/title-flow.js", "js/race/quali-model.js", "js/garage/setup-camera.js"]) {
    assert.ok(carved.includes(f), `${f} is carved from game.js (game.js creates its global)`);
  }
  assert.ok(!carved.includes("js/game.js"));
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  for (const f of carved) {
    const g = fs.readFileSync(path.join(ROOT, f), "utf8").match(/^(?:const|var) ([A-Z][A-Za-z0-9_]*) = /m)[1];
    assert.match(game, new RegExp("\\b" + g + "\\.create\\("), `${f}: game.js must instantiate ${g}`);
  }
  const union = gameSource();
  assert.ok(union.startsWith("// ==== js/game.js\n" + game.slice(0, 200)), "game.js leads, so game.js-first indexOf pins keep their meaning");
  for (const f of carved) assert.ok(union.includes(`// ==== ${f}\n`), f);
});

test("symbolSource reads from the one declaring file, and throws on none or many", () => {
  assert.match(symbolSource("function quitToMenu()"), /^function quitToMenu\(\) \{[\s\S]*\n\}$/);
  assert.match(symbolSource("async function consumeGhostHash()"), /GhostShare/, "title-flow.js, carved from game.js");
  assert.throws(() => symbolSource("function definitelyNotDeclaredAnywhere()"), /no file/);
  assert.throws(() => symbolSource("function create("), /declared in .*, .*longer declaration/, "every carved module declares create(");
});
