/* THE NET STUB IS A CONTRACT, AND THIS IS THE ONLY THING HOLDING IT.
 *
 * js/net is LAZY_NET: 241 KB of WebRTC that a solo session never loads. But
 * netPlay is called at 20 sites in js/game.js and only three are `netPlay && …`
 * guarded — netPlay.tick() is in the frame loop — so "absent" is not an option
 * the way it is for the data hub. game.js holds an inert null object from boot
 * and swaps in NetPlay.create(G) / NetLobby.create(G) when VS FRIEND opens.
 *
 * A method the stub forgets is a TypeError mid-race, and nothing else in the
 * suite would see it: every unit test runs in Node with no game.js, and every
 * browser spec loads the agent surface, which pulls the REAL net bundle. So
 * this guard derives the required surface from the CALL SITES — grep the tree
 * for netPlay.<m> / netLobby.<m> outside js/net and js/game/apex.js — rather
 * than from a hand-written roster that would drift the moment a call site is
 * added. Adding a call to a method the stub lacks turns this red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAME = readFileSync(join(ROOT, "js/game.js"), "utf8");

function jsFiles(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) jsFiles(rel, out);
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

// The stub literals in game.js. Parsed as text, not evaluated: game.js is a
// 9,000-line IIFE that cannot be imported into Node.
function stubKeys(name) {
  const m = GAME.match(new RegExp(`let ${name} = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(m, `js/game.js must declare an inert ${name} stub`);
  return new Set([...m[1].matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g)].map((x) => x[1]));
}

// Every method actually called on the façade, anywhere a player can reach.
// js/net is excluded (it holds the real objects) and so is js/game/apex.js:
// the agent surface pulls the real bundle before apex.js evaluates, which is
// the seam that keeps the multiplayer specs unchanged by this split.
function calledMethods(receiver) {
  const hits = new Map();
  for (const rel of jsFiles("js")) {
    if (rel.startsWith("js/net/") || rel === "js/game/apex.js") continue;
    const src = readFileSync(join(ROOT, rel), "utf8")
      // Strip comments so prose naming a method is not read as a call site.
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const m of src.matchAll(new RegExp(`(?:G\\.)?${receiver}\\.([A-Za-z_$][\\w$]*)`, "g"))) {
      if (!hits.has(m[1])) hits.set(m[1], rel);
    }
  }
  return hits;
}

for (const name of ["netPlay", "netLobby"]) {
  test(`the inert ${name} stub answers every call site outside js/net`, () => {
    const keys = stubKeys(name);
    const called = calledMethods(name);
    assert.ok(called.size >= 8, `expected to find ${name} call sites; found ${called.size}`);
    const missing = [...called].filter(([m]) => !keys.has(m))
      .map(([m, where]) => `${name}.${m}() called in ${where} but the stub has no such member`);
    assert.deepEqual(missing, [],
      "a call site the stub cannot answer is a TypeError the moment a solo session reaches it");
  });
}

// THE ONE STUB VALUE THAT IS NOT A NO-OP, and the only mistake here that would
// not announce itself with a crash. In js/net/netplay.js both predicates are
// `!active || role === "host"`, so with no session they are TRUE: a solo game
// owns its own race control and its own classification. A stub returning false
// would leave a solo race unable to classify its result — silent, and wrong.
test("the inert netPlay owns race control and classification (solo owns everything)", () => {
  const m = GAME.match(/let netPlay = \{([\s\S]*?)\n\};/);
  assert.ok(m, "js/game.js must declare an inert netPlay stub");
  for (const fn of ["ownsRaceControl", "ownsClassification"]) {
    assert.match(m[1], new RegExp(`${fn}:\\s*\\(\\)\\s*=>\\s*true`),
      `${fn} must be TRUE while inert — js/net/netplay.js returns !active || role === "host"`);
  }
  // ...and the real module must still agree, or this test is pinning a fossil.
  const real = readFileSync(join(ROOT, "js/net/netplay.js"), "utf8");
  for (const fn of ["ownsRaceControl", "ownsClassification"]) {
    assert.match(real, new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return !active \\|\\| role === "host"; \\}`),
      `js/net/netplay.js ${fn} changed shape — re-derive the stub's value from it`);
  }
});

// The predicates that gate the frame loop and the solo paths must be FALSE, or
// a game with no session starts behaving as if it had one.
test("the inert netPlay reports no session", () => {
  const m = GAME.match(/let netPlay = \{([\s\S]*?)\n\};/)[1];
  for (const fn of ["active", "owns", "awaitingStart", "awaitingResult"]) {
    assert.match(m, new RegExp(`${fn}:\\s*\\([^)]*\\)\\s*=>\\s*false`),
      `${fn} must be false while inert`);
  }
});

// Two call sites read these WITHOUT a guard — js/game.js netPlay.rivalDriverIds()
// and netLobby.roomState().peers — so returning undefined is a TypeError, not a
// quiet no-op. Pin the shape, not just the presence.
test("the inert stubs return the right EMPTY shapes where callers do not guard", () => {
  const play = GAME.match(/let netPlay = \{([\s\S]*?)\n\};/)[1];
  const lobby = GAME.match(/let netLobby = \{([\s\S]*?)\n\};/)[1];
  assert.match(play, /rivalDriverIds:\s*\(\)\s*=>\s*\[\]/, "rivalDriverIds() is .map()ed unguarded");
  assert.match(play, /peerLaps:\s*\(\)\s*=>\s*\[\]/, "peerLaps() must be an array");
  assert.match(lobby, /peerSeats:\s*\(\)\s*=>\s*\[\]/, "peerSeats() feeds the garage seat check");
  assert.match(lobby, /roomState:\s*\(\)\s*=>\s*\(\{[^}]*peers:\s*\[\]/,
    "roomState().peers is read unguarded in js/game.js");
});
