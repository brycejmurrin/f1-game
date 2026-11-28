/* transition-direct-calls.test.mjs — a shrink-only baseline of direct reset calls in the six race transitions.
 *
 * #7397 phase 1 / #7398 member 2. What a transition resets is spread over three partial
 * registries (CarFields.RESETS, the Scopes race bus, SimState) and inline lists in
 * game.js. Each inline `.reset(` / `.clear(` / `.release(` / `.stop(` member call in
 * the transition functions is a reset the bus does not own yet. This test scans the source
 * (comments and strings stripped) of
 *
 *   startRaceBody  redFlagRestart  endRace  quitToMenu  resetEpisodeOwners   (game.js)
 *   retry                                                                      (js/race/lap-retry.js, RETRY LAP)
 *
 * counts the calls by receiver.method, and compares with
 * tests/unit/fixtures/transition-direct-calls.json:
 *   - a call ADDED (a new key, or a higher count) fails: register the reset with Scopes
 *     (js/core/scopes.js) or SimState instead, or defend the new call in the PR and raise the baseline;
 *   - a call REMOVED (a lower count) fails until the fixture is lowered, so the baseline can only shrink.
 * Regenerate after a deliberate shrink: UPDATE_TRANSITION_BASELINE=1 node --test tests/unit/transition-direct-calls.test.mjs
 *
 * The order those calls run in is pinned by tests/unit/transition-order-vm.test.mjs.
 *
 * Run: node --test tests/unit/transition-direct-calls.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_REL } from "../helpers/game-source.mjs";

const ROOT = new URL("../../", import.meta.url);
const BASELINE = new URL("./fixtures/transition-direct-calls.json", import.meta.url);
const UPDATE = !!process.env.UPDATE_TRANSITION_BASELINE;

/** [name, file, declaration up to its opening brace (a RegExp source)]. */
const TRANSITIONS = [
  ["startRaceBody", GAME_REL, String.raw`async function startRaceBody\s*\([^)]*\)\s*\{`],
  ["redFlagRestart", GAME_REL, String.raw`\bfunction redFlagRestart\s*\([^)]*\)\s*\{`],
  ["endRace", GAME_REL, String.raw`\bfunction endRace\s*\([^)]*\)\s*\{`],
  ["quitToMenu", GAME_REL, String.raw`\bfunction quitToMenu\s*\([^)]*\)\s*\{`],
  ["resetEpisodeOwners", GAME_REL, String.raw`\bresetEpisodeOwners\s*\(\s*\)\s*\{`],
  ["LapRetry.retry", "js/race/lap-retry.js", String.raw`\bfunction retry\s*\(\s*\)\s*\{`],
];
const CALL = /([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*?)\??\.(reset|clear|release|stop)\s*\(/g;

/** Blank out comments, strings, template text and regex-free literals, keeping every offset. */
function strip(src) {
  const out = src.split("");
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  for (let i = 0; i < src.length;) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = src.indexOf("\n", i); if (j < 0) j = src.length; blank(i, j); i = j; }
    else if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? src.length : j + 2; blank(i, j); i = j; }
    else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      blank(i + 1, j); i = j + 1;
    } else i++;
  }
  return out.join("");
}

/** The text of the braced body that opens at the end of `decl`'s match. */
function bodyOf(text, decl) {
  const m = new RegExp(decl).exec(text);
  assert.ok(m, "declaration not found: " + decl);
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  throw new Error("unbalanced body: " + decl);
}

function scan() {
  const out = {};
  for (const [name, file, decl] of TRANSITIONS) {
    const body = bodyOf(strip(fs.readFileSync(new URL(file, ROOT), "utf8")), decl);
    const counts = {};
    for (const m of body.matchAll(CALL)) { const key = m[1] + "." + m[2]; counts[key] = (counts[key] || 0) + 1; }
    out[name] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return out;
}

const actual = scan();
if (UPDATE) fs.writeFileSync(BASELINE, JSON.stringify(actual, null, 2) + "\n");
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

test("the scan finds the 12 calls #7398 names in startRaceBody", () => {
  const want = { "loadingScreen.stop": 4, "announcer.stop": 1, "banner.clear": 1, "raceMessageHistory.clear": 1, "Particles.clear": 1, "coach.reset": 1, "skids.reset": 1, "director.reset": 1, "garagePre.release": 1 };
  assert.deepEqual(actual.startRaceBody, Object.fromEntries(Object.entries(want).sort(([x], [y]) => (x < y ? -1 : 1))));
});

test("the stripper hides comments, strings and templates", () => {
  const t = strip('a.reset(); // b.reset()\n/* c.clear() */ const s = "d.stop()"; const t = `e.release()`;');
  assert.deepEqual([...t.matchAll(CALL)].map((m) => m[1]), ["a"]);
});

for (const [name] of TRANSITIONS) {
  test(`${name}: direct reset calls never grow, and the baseline shrinks with them`, () => {
    const now = actual[name], was = baseline[name];
    const added = [], removed = [];
    for (const k of new Set([...Object.keys(now), ...Object.keys(was)])) {
      const n = now[k] || 0, w = was[k] || 0;
      if (n > w) added.push(`${k} ${w}→${n}`);
      else if (n < w) removed.push(`${k} ${w}→${n}`);
    }
    assert.deepEqual(added, [], `${name}: direct reset calls ADDED. Register the reset with Scopes/SimState, or defend the call and raise tests/unit/fixtures/transition-direct-calls.json in this PR`);
    assert.deepEqual(removed, [], `${name}: direct reset calls REMOVED, so lower the baseline (UPDATE_TRANSITION_BASELINE=1 node --test tests/unit/transition-direct-calls.test.mjs) — it only shrinks`);
  });
}
