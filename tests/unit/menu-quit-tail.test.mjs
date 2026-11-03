/* menu-quit-tail.test.mjs — MenuQuitTail.afterOverlay only needs the deps it reads.
 *
 * Run: node --test tests/unit/menu-quit-tail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/menu-quit-tail.js"), "utf8");

function load(hash = "") {
  const calls = { setFlow: [], consume: 0, career: 0, tyre: null };
  const docEl = { dataset: { team: "mclaren" } };
  const ctx = {
    Object, Array, String, RegExp, location: { hash },
    document: { documentElement: docEl },
    MenuTeardown: undefined,
  };
  const MenuQuitTail = vm.runInNewContext(SRC + "\n;MenuQuitTail", ctx, {
    filename: absSrc("js/perf/menu-quit-tail.js"),
  });
  const deps = {
    _doc: docEl,
    mirrorPass: { cancelPreparation() { calls.mirror = true; } },
    stormFx: { _ltNextT: 1, _thunderT: 2 },
    setFlow(v) { calls.setFlow.push(v); },
    session: "quali",
    tyres: { setLevel(v) { calls.tyre = v; } },
    raceTyreWear: 0.4,
    IncidentSim: { reset() { calls.inc = true; } },
    DebrisWorld: { reset() { calls.deb = true; } },
    SeasonCal: { load() { return { round: 0 }; }, hasProgress() { return false; }, rounds() { return 24; } },
    season: null,
    $() { return { hidden: true }; },
    refreshCareerButton() { calls.career++; },
    CustomTracks: { consumeTrackHash() { calls.consume++; } },
    ensureNet() { return Promise.resolve(false); },
    netLobby: { openFromUrl() {} },
  };
  MenuQuitTail.wire(deps);
  return { MenuQuitTail, deps, calls };
}

test("afterOverlay resets session flow without needing forgetGp or unused wire fields", () => {
  const { MenuQuitTail, deps, calls } = load();
  assert.equal("team" in deps._doc.dataset, true);
  MenuQuitTail.afterOverlay("ignored");
  assert.equal(calls.mirror, true);
  assert.equal(deps.stormFx._ltNextT, 0);
  assert.equal(deps.stormFx._thunderT, -1);
  assert.deepEqual(calls.setFlow, ["gp"]);
  assert.equal(deps.session, "race");
  assert.equal(calls.tyre, 0.4);
  assert.equal(calls.inc, true);
  assert.equal(calls.deb, true);
  assert.equal(calls.consume, 1);
  assert.equal(calls.career, 1);
  assert.equal("team" in deps._doc.dataset, false);
});

// #4551 B7: game.js wires MenuQuitTail once at boot. A shorthand field copies
// the binding's value at that moment, so a `let` the game reassigns later
// (raceTyreWear: the Settings TYRE WEAR setter) reached every quit as its
// boot-time value and tyres.setLevel() undid the player's choice on the menu.
// Every mutable game.js binding must cross as a getter.
const GAME = readFileSync(join(ROOT, "js/game.js"), "utf8");
function wireFields() {
  const at = GAME.indexOf("MenuQuitTail.wire({");
  assert.ok(at >= 0, "game.js wires MenuQuitTail");
  let i = GAME.indexOf("{", at), depth = 0, end = -1;
  for (let j = i; j < GAME.length; j++) {
    if (GAME[j] === "{") depth++;
    else if (GAME[j] === "}" && --depth === 0) { end = j; break; }
  }
  const body = GAME.slice(i + 1, end);
  // top-level comma split (getter bodies hold braces, no commas at depth 0)
  const parts = []; let cur = "", d = 0;
  for (const ch of body) {
    if (ch === "{" || ch === "(") d++; else if (ch === "}" || ch === ")") d--;
    if (ch === "," && d === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

test("game.js passes every reassigned let to MenuQuitTail as a live getter (#4551)", () => {
  const shorthand = wireFields().filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
  const lets = shorthand.filter((name) => {
    if (!new RegExp("^let [^;]*\\b" + name + "\\b", "m").test(GAME)) return false;
    // reassigned after its declaration (plain `name =`, not `==`)
    const writes = GAME.match(new RegExp("(^|[^.\\w$])" + name + "\\s*=(?!=)", "g")) || [];
    return writes.length > 1;
  });
  assert.deepEqual(lets, [], "shorthand wire fields snapshot a mutable let: " + lets.join(", "));
  for (const name of ["raceTyreWear", "netLobby"])
    assert.ok(wireFields().some((p) => p.startsWith("get " + name + "()")), name + " crosses as a getter");
});

test("afterOverlay applies the CURRENT tyre wear level, not the wired-time one (#4551)", () => {
  const { MenuQuitTail, deps, calls } = load();
  let live = "real";
  delete deps.raceTyreWear;
  Object.defineProperty(deps, "raceTyreWear", { get: () => live, enumerable: true });
  live = "off";   // Settings changed it after boot
  MenuQuitTail.afterOverlay();
  assert.equal(calls.tyre, "off");
});

test("a #vs= invite deferred during the race opens the REAL lobby after quit (#4551)", async () => {
  const { MenuQuitTail, deps } = load("#vs=ABCD");
  const opened = [];
  let lobby = { openFromUrl() { opened.push("stub"); return false; } };   // game.js boot stub
  delete deps.netLobby;
  Object.defineProperty(deps, "netLobby", { get: () => lobby, enumerable: true });
  // ensureNet() is what swaps the stub for NetLobby.create(G) (lazyBundles createNetwork)
  deps.ensureNet = () => { lobby = { openFromUrl() { opened.push("real"); return true; } }; return Promise.resolve(true); };
  MenuQuitTail.afterOverlay();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(opened, ["real"]);
});
