// A STORED VALUE IS PLAYER INPUT, AND THREE READERS TREATED IT AS A PROMISE.
//
// `DIFF[difficulty]` (2026-09-22) was the first of this family: a persisted
// string used as a table key, dereferenced, and a TypeError on every physics
// tick because an imported file carried "medium". These are its siblings, found
// by hunting the same shape rather than the same symptom — and the point of
// this file is that each one is asserted by EXECUTING the shipped source, not
// by grepping it. A regex over `Number.isInteger` would pass the day someone
// rewrote the clamp into a new wrong form.
//
// The fourth member of the family lives in settings-export.test.mjs ("the four
// garage singles are shape-checked like the liveries"), at the door the file
// comes in through; these three are the readers behind it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Balanced-brace extraction, same technique as debris-step-skip.test.mjs: a
// test that re-implements the function it is checking proves nothing.
function extractFn(src, name, file) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in ${file} — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}() in ${file}`);
}

// `apex26.team`, `driver` and `track` are three of the values a GARAGE FILE can
// set, and each indexes a LIST. game.js tested them with `x >= 0 && x < len` —
// in BOTH spellings, and each spelling leaks the opposite way: "abc" fails
// `< 0 || >= len`, so the negated form passed it through; "" passes
// `>= 0 && < len`, so the positive form did. Either way the value reached
// Teams.LIST[…] as undefined and the first `team.id` threw.
//
// This test wrote the first version of itself against `teamIdx >= 0 &&
// teamIdx < Teams.LIST.length` and matched restoreFreePlaySelection's copy
// instead of the boot one — which is how the SECOND site was found. Hence one
// helper and one guard over it, rather than a regex per call site.
test("idxOr rejects every non-index, not just out-of-range numbers", () => {
  const src = read("js/game.js");
  const fn = extractFn(src, "idxOr", "js/game.js");
  const idxOr = new Function(`${fn}\nreturn idxOr;`)();
  for (const bad of ["abc", "", " ", null, undefined, true, false, NaN, Infinity,
                     2.5, -1, -0.0001, 21, 99, [], {}, [4], "4"]) {
    assert.equal(idxOr(bad, 21, 2), 2, `${JSON.stringify(bad)} must fall back to the default`);
  }
  for (const good of [0, 2, 4, 20]) {
    assert.equal(idxOr(good, 21, 2), good, `${good} is a real index and must survive`);
  }
  assert.equal(idxOr(0, 0, 3), 3, "an empty list has no index 0");
  // …and every stored index in game.js goes through it. A clamp written by hand
  // is a clamp written in one of the two wrong halves.
  const handRolled = src.match(/^.*(?:teamIdx|trackIdx|driverIdx) *[<>]=? *0 *(?:\|\||&&).*$/gm) || [];
  assert.deepEqual(handRolled, [],
    "a stored index is clamped by hand again instead of through idxOr(): " + handRolled.join(" | "));
});

// syncCustomTeam() pushes loadCustomTeam()'s return straight into Teams.LIST,
// and SaveMigrate.seasonRoster() does `team.drivers.forEach(...)` over that list
// at boot. So `{}` under apex26.customTeam was a TypeError before the menu
// painted. The `id` half is quieter and just as real: the splice that removes
// the previous custom entry matches on "custom", so a renamed team would have
// every sync push ANOTHER car onto the grid.
test("a corrupt custom team is repaired, not pushed into Teams.LIST as it lies", () => {
  const src = extractFn(read("js/career/custom-team.js"), "loadCustomTeam", "js/career/custom-team.js");
  // The repair itself is Teams.sanitizeCustom (js/data/teams.js) — run the
  // shipped one, not a copy.
  const ctx = vm.createContext({});
  vm.runInContext(read("js/data/teams.js"), ctx, { filename: "js/data/teams.js" });
  const Teams = vm.runInContext("Teams", ctx);
  const DEFAULT_CUSTOM = Teams.DEFAULT_CUSTOM;
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const load = (stored) => plain(new Function("store", "DEFAULT_CUSTOM", "Teams",
    `${src}\nreturn loadCustomTeam();`)(
    { get: (k, d) => (stored === undefined ? d : stored) }, DEFAULT_CUSTOM, Teams));

  // Every shape that reached `.drivers.forEach` and threw.
  for (const bad of [{}, null, [], "team", 7, { id: "custom", name: "Mine" },
                     { id: "custom", drivers: [] }, { id: "custom", drivers: "two" },
                     { id: "custom", drivers: [null] }]) {
    const t = load(bad);
    assert.ok(Array.isArray(t.drivers) && t.drivers.length > 0,
      `${JSON.stringify(bad)} must come back with a usable roster`);
    assert.equal(t.id, "custom", "the entry syncCustomTeam() splices on must stay findable");
    t.drivers.forEach((d) => assert.ok(d && typeof d === "object"));
  }
  // REPAIR, NOT DISCARD: a bad roster is not a reason to lose the livery.
  const half = load({ id: "custom", name: "Scuderia Me", color: [1, 0, 0], drivers: 0 });
  assert.equal(half.name, "Scuderia Me", "the player's own fields survive the repair");
  assert.deepEqual(half.color, [1, 0, 0]);
  assert.deepEqual(half.drivers, plain(DEFAULT_CUSTOM.drivers));
  // …and a sound team comes back with every field it had, unchanged.
  const sound = plain(Object.assign({}, DEFAULT_CUSTOM,
    { name: "Mine", drivers: [{ name: "A", code: "AAA", num: 1 }] }));
  assert.deepEqual(load(sound), sound, "nothing the dialog could have saved is altered");
  assert.deepEqual(load(undefined), plain(DEFAULT_CUSTOM), "an empty store still gets the seed");
});

// …AND A SHAPE-SOUND TEAM IS STILL PLAYER INPUT. The dialog caps every field as
// it is typed (custom-team.js clean()); a stored or imported team never went
// through the dialog. The names are painted into chips, the HUD and results —
// and aria-state.js paintOnOff once wrote one back through innerHTML
// (2026-09-24). The load is the second wall: rebuilt to the dialog's limits.
test("a loaded custom team is capped to the dialog's limits (malicious store)", () => {
  const src = extractFn(read("js/career/custom-team.js"), "loadCustomTeam", "js/career/custom-team.js");
  const ctx = vm.createContext({});
  vm.runInContext(read("js/data/teams.js"), ctx, { filename: "js/data/teams.js" });
  const Teams = vm.runInContext("Teams", ctx);
  const t = new Function("store", "DEFAULT_CUSTOM", "Teams", `${src}\nreturn loadCustomTeam();`)(
    { get: () => ({
      id: "custom", name: "\u0007" + "N".repeat(400), short: "toolong", engine: 5,
      drivers: Array.from({ length: 50 }, (_, i) => ({ name: "<i>" + i + "</i>" + "x".repeat(99), code: "abcdef", num: 123.7 + i })),
    }) }, Teams.DEFAULT_CUSTOM, Teams);
  assert.equal(t.name, "N".repeat(22));
  assert.equal(t.short, "TOOL");
  assert.equal(t.engine, "Custom", "a non-string falls back");
  assert.equal(t.drivers.length, 2, "fifty seats are not a team");
  for (const d of t.drivers) {
    assert.ok(d.name.length <= 22, d.name);
    assert.equal(d.code, "ABC");
    assert.equal(d.num, 99);
  }
});

// DebrisWorld._active is the ONE boolean game.js reads to decide whether debris,
// marbles and the caution they feed exist at all. step()'s catch lowers it on a
// trapped rapier step — right for that race — but setEnabled() was the only
// other writer, and game.js never calls setEnabled. So one transient WASM fault
// turned the whole surface off for the rest of the browser SESSION: through
// every restart, every new race, in silence, because reset() (which exists to
// stop exactly this kind of carry-over) never touched the latch.
test("DebrisWorld.reset() re-arms the latch a trapped step lowered", () => {
  const src = read("js/physics/debris-world.js");
  const reset = extractFn(src, "reset", "js/physics/debris-world.js");
  assert.match(src, /_active = false;\s*\n\s*try \{ destroyWorld\(\)/,
    "step()'s trap no longer lowers _active — this guard is measuring nothing");
  const run = (state) => new Function("destroyWorld", "status", "s", `
    let _active = s._active, _enabled = s._enabled, _loadState = s._loadState;
    let _tick, _stepSkips, _seq, _spawnedTotal, _lastImpact;
    let _marbleSeq, _furnBuilt, _lastForce, _panelSeq, _panelsBroken;
    ${reset}
    reset();
    return _active;`)(() => {}, () => ({}), state);

  // The bug: enabled, rapier loaded, latch tripped by a trapped step.
  assert.equal(run({ _active: false, _enabled: true, _loadState: 2 }), true,
    "a new race must get a fresh chance at the side-world");
  // …without reviving what the player or the loader turned off.
  assert.equal(run({ _active: false, _enabled: false, _loadState: 2 }), false,
    "DEBRIS OFF stays off");
  assert.equal(run({ _active: true, _enabled: true, _loadState: -1 }), false,
    "a load that genuinely failed stays down");
  assert.equal(run({ _active: false, _enabled: true, _loadState: 0 }), false,
    "rapier has not landed yet — prime() would build nothing");
});
