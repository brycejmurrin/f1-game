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
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The count of quoted `game.js` path literals under tests/ (the hunter's metric:
// `rg -c "game\.js['\"]" tests`), less the helper that is the sanctioned reader.
// 2026-10-11: ship #1313/#1398 lowered to 308; #1389/#1403 sync keeps that.
const CEILING = 308;
const EXEMPT = new Set(["tests/helpers/game-source.mjs", "tests/unit/source-pin-hygiene.test.mjs"]);
// A quoted path literal ends `game.js"` / `game.js'`. A possessive in prose (`game.js's`)
// is not a read: 2026-10-16 a comment saying "game.js's real scale" counted as the 309th
// read and turned the tip red, so an apostrophe followed by `s` is not counted.
const RAW = /game\.js(?:"|'(?!s\b))/g;

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

test("the raw-read pattern counts quoted path literals, not possessive prose", () => {
  const count = (t) => (t.match(RAW) || []).length;
  assert.equal(count('readFileSync(join(ROOT, "js/game.js"), "utf8")'), 1);
  assert.equal(count("readFileSync(join(ROOT, 'js/game.js'), 'utf8')"), 1);
  assert.equal(count("// Scripted pace on game.js's real scale"), 0, "a possessive comment is not a read");
  assert.equal(count("// see game.js's note and also read 'js/game.js'"), 1, "only the real literal counts");
});

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

// Exact-span regressions share the registered source-reader contract suite.
// Expected strings are independent fixture boundaries, never computed by the
// extraction algorithm. Each sibling contains a marker that must stay outside.
test("inline declarations stop at their own close, preserving source bytes", () => {
  const expected = 'function identityGet(k) { return { value: k }; }';
  const src = `(() => { ${expected} function identitySet() { return "SIBLING"; } })();`;
  assert.equal(fnSource(src, "function identityGet("), expected);
  assert.equal(fnSource('  ' + expected, "  function identityGet("), '  ' + expected);
});

test("strings, comments, templates and regex braces never end a function", () => {
  const expected = [
    'function target(v = { a: "}" }) {',
    '/* a misleading closing line:',
    '}',
    'function target(fake) {',
    '*/',
    'const text = "function target(fake) { }";',
    '// } function target(fake) {',
    'const re = /[{}]/g;',
    'const template = `} ${(() => ({ nested: "{" }))()} {`;',
    'return { v, text, re, template };',
    '}',
  ].join('\n');
  assert.equal(fnSource(expected + '\nfunction sibling() { return "OUTSIDE"; }', "function target("), expected);
});

test("nested declarations are exact and duplicate declarations are ambiguous", () => {
  const nested = 'function inner() { return "nested"; }';
  assert.equal(fnSource(`function outer() { ${nested} return inner(); }`, "function inner("), nested);
  const src = 'function a() { function same() {} } function b() { function same() {} }';
  assert.throws(() => fnSource(src, "function same("), /ambiguous/);
  assert.throws(() => fnSource('function same(a) {} function same(b) {}', 'function same('), /ambiguous/);
  assert.equal(fnSource('function same(a) {} function same(b) {}', 'function same(b)'), 'function same(b) {}');
});

test("text-only declarations and identifier prefixes are rejected", () => {
  const src = '// function absent() {}\nconst text = "function absent() {}"; function longer() {}';
  assert.throws(() => fnSource(src, "function absent("), /not found/);
  assert.throws(() => fnSource(src, "function long"), /not found/);
  assert.throws(() => fnSource(src, ""), /non-empty/);
  assert.throws(() => fnSource('function broken() {', "function broken("), SyntaxError);
});

test("async functions, generators and method-shaped callers retain exact syntax", () => {
  const asyncFn = 'async function readGlCapture() { return await Promise.resolve("}"); }';
  const generator = 'function* values() { yield { a: 1 }; }';
  const method = 'capturePixels() { return { pixels: "}" }; }';
  const src = `${asyncFn}\n${generator}\nconst gfx = { ${method}, sibling() {} };`;
  assert.equal(fnSource(src, "async function readGlCapture("), asyncFn);
  assert.equal(fnSource(src, "function* values("), generator);
  assert.equal(fnSource(src, "capturePixels() {"), method);
});

test("function-valued variable callers stop at their own declaration", () => {
  const block = 'const refuseTab = () => { return "}"; };';
  const expression = 'const menuKey = (idx) => [idx, "|"].join("|");';
  assert.equal(fnSource(block + '\n' + expression, "const refuseTab = "), block);
  assert.equal(fnSource(block + '\n' + expression, "const menuKey = "), expression);
});

test("symbolSource retains the game/module union and failure contract", () => {
  assert.match(symbolSource("async function consumeGhostHash()"), /GhostShare/);
  assert.throws(() => symbolSource("function definitelyAbsent()"), /no file/);
  assert.throws(() => symbolSource("function create("), /multiple functions.*longer declaration/);
});
