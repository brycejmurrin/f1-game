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
 * through the helper. Same idiom as `waitForTimeout` in tests/data/ratchets.json:
 * the ceiling below only ever moves DOWN — lower it when you migrate sites.
 *
 * Run: node --test tests/unit/source-pin-hygiene.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carvedFromGame, gameSource, symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The count of quoted `game.js` path literals under tests/ (the hunter's metric:
// `rg -c "game\.js['\"]" tests`), less the helper that is the sanctioned reader.
const CEILING = 351;
const EXEMPT = new Set(["tests/helpers/game-source.mjs", "tests/unit/source-pin-hygiene.test.mjs"]);
const RAW = /game\.js['"]/g;

function rawSites() {
  const per = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(r); }
      else if (/\.(mjs|cjs|js)$/.test(e.name) && !EXEMPT.has(r)) {
        const n = (fs.readFileSync(path.join(ROOT, r), "utf8").match(RAW) || []).length;
        if (n) per.push([r, n]);
      }
    }
  };
  walk("tests");
  return per;
}

test("raw js/game.js source reads under tests/ never grow (read through tests/helpers/game-source.mjs)", () => {
  const per = rawSites();
  const total = per.reduce((a, [, n]) => a + n, 0);
  assert.ok(total <= CEILING,
    `${total} raw game.js reads (ceiling ${CEILING}) — read game.js through gameSource()/symbolSource() ` +
    `(tests/helpers/game-source.mjs) so the pin survives the next carve. Biggest: ` +
    per.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(", "));
  assert.ok(total > CEILING - 60,
    `${total} raw reads is far under the ceiling ${CEILING}: lower CEILING to ${total} so the ratchet keeps its grip`);
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
