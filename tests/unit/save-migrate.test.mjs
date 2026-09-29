/* save-migrate.test.mjs — js/career/save-migrate.js, the versioned career
 * ladder, as the contract the NEXT rung has to keep.
 *
 * career-cross-tab.test.mjs already covers the sanitising half (deal, results,
 * per-round maps). This file holds the LADDER's own properties, which nothing
 * pinned while there was only one rung:
 *
 *   - CAREER_V and the rung count agree — a rung added without the bump (or
 *     the bump without a rung) is the migration that never runs, or the one
 *     that runs on every load.
 *   - Migration is IDEMPOTENT: running it twice equals running it once, so a
 *     save that loads in two tabs, or is re-saved without change, never drifts.
 *   - A v0 save (predates `v`) climbs to CAREER_V and gains a season.
 *   - A save from a NEWER build keeps its version and unknown keys.
 *
 * When rung v1 → v2 lands: add its shape to `RUNG_INPUTS` below and the
 * idempotence and climb cases cover it without a new test.
 *
 * Run: node --test tests/unit/save-migrate.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/career/save-migrate.js"), "utf8");

function load() {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, isFinite, console,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "AAA" }, { code: "BBB" }] }] },
  });
  seedSaveMigrate(ctx);
  return vm.runInContext("SaveMigrate", ctx);
}

/** One representative save per rung the ladder has seen. */
const RUNG_INPUTS = {
  v0: () => ({ flavour: "driver", team: "haas", money: 100 }),                       // predates `v` and `season`
  v1: () => ({ v: 1, flavour: "driver", team: "haas", money: 100, year: 2026,
    season: { round: 2, pts: { AAA: 25 }, teamPts: { haas: 25 }, driverCodes: {} } }),
};

test("CAREER_V equals the number of rungs in CAREER_MIGRATIONS (source-slice)", () => {
  const v = Number(/const CAREER_V = (\d+);/.exec(SRC)?.[1]);
  const body = /const CAREER_MIGRATIONS = \[([\s\S]*?)\n  \];/.exec(SRC)?.[1];
  assert.ok(Number.isInteger(v) && body, "save-migrate.js must declare CAREER_V and the CAREER_MIGRATIONS array");
  const rungs = (body.match(/^\s*\(c\) =>/gm) || []).length;
  assert.equal(rungs, v, `CAREER_V is ${v} but the ladder has ${rungs} rung(s) — bump both together`);
  assert.equal(load().CAREER_V, v, "the exported constant is the declared one");
});

test("a v0 save climbs every rung and lands on CAREER_V with a season", () => {
  const SM = load();
  const c = SM.migrateCareer(RUNG_INPUTS.v0());
  assert.equal(c.v, SM.CAREER_V);
  assert.deepEqual(JSON.parse(JSON.stringify(c.season)), { round: 0, pts: {}, teamPts: {}, driverCodes: {}, finishes: {}, roundPts: {} });
  assert.equal(c.flavour, "driver");
  assert.equal(c.year, 2026, "a save with no year reads as the first season");
});

test("migration is idempotent at every rung", () => {
  const SM = load();
  for (const [name, mk] of Object.entries(RUNG_INPUTS)) {
    const once = JSON.parse(JSON.stringify(SM.migrateCareer(mk())));
    const twice = JSON.parse(JSON.stringify(SM.migrateCareer(SM.migrateCareer(mk()))));
    assert.deepEqual(twice, once, `${name}: a second pass changed the save`);
    // And the SAME object, migrated in place a second time, is unchanged too —
    // that is the two-tabs case, where both tabs hold one parsed save.
    const obj = SM.migrateCareer(mk());
    const snap = JSON.stringify(obj);
    SM.migrateCareer(obj);
    assert.equal(JSON.stringify(obj), snap, `${name}: in-place re-migration drifted`);
  }
});

test("legacy code-keyed points remap onto stable ids exactly once", () => {
  const SM = load();
  const c = SM.migrateCareer(RUNG_INPUTS.v1());
  assert.deepEqual(JSON.parse(JSON.stringify(c.season.pts)), { "haas:0": 25 });
  assert.equal(c.season.driverCodes["haas:0"], "AAA");
  const again = SM.migrateCareer(c);
  assert.deepEqual(JSON.parse(JSON.stringify(again.season.pts)), { "haas:0": 25 }, "an id key must not be re-mapped or doubled");
});

test("a save from a newer build keeps its version (never downgraded), keys intact", () => {
  // It used to be stamped BACK to CAREER_V ("documented, not endorsed"): a
  // newer build's save opened once in an older tab then read as old, and the
  // newer build re-ran rungs over data they had already migrated (bug hunt
  // 2026-09-22). migrateCareer now keeps Math.max(v, CAREER_V).
  const SM = load();
  const c = SM.migrateCareer({ v: SM.CAREER_V + 5, flavour: "myteam", team: "haas", futureKey: { x: 1 } });
  assert.equal(c.v, SM.CAREER_V + 5);
  assert.equal(c.flavour, "myteam");
  assert.deepEqual(c.futureKey, { x: 1 }, "unknown keys survive the stamp — the next rung decides whether that stays true");
});

test("junk in, null out: a non-object save is refused rather than repaired", () => {
  const SM = load();
  for (const bad of [null, undefined, 7, "save", []]) {
    const r = SM.migrateCareer(bad);
    assert.equal(r, null, `${JSON.stringify(bad)} should be refused`);
  }
});

test("a malformed season (number, string, array) is replaced, never thrown on — Career.load runs at boot", () => {
  const SM = load();
  for (const bad of [5, "x", true, []]) {
    const c = SM.migrateCareer({ v: 1, flavour: "driver", team: "haas", money: 1, season: bad });
    assert.equal(typeof c.season, "object");
    assert.ok(!Array.isArray(c.season));
    assert.equal(c.season.round, 0);
  }
});


test("JSON exponent overflow cannot poison career money or contract arithmetic", () => {
  const SM = load();
  const c = SM.migrateCareer(JSON.parse(`{"money":1e309,"deal":{
    "salary":-1e309,"bonusPt":"Infinity","left":1e309,"years":"-Infinity"}}`));
  assert.equal(c.money, 0);
  for (const key of ["salary", "bonusPt", "left", "years"]) assert.equal(c.deal[key], 0, key);
  assert.equal(c.money + c.deal.salary + c.deal.bonusPt * 25, 0,
    "settling a race must not receive Infinity or NaN from the loaded contract");
  const reread = SM.migrateCareer(JSON.parse(JSON.stringify(c)));
  assert.equal(reread.money, c.money);
  assert.deepEqual(reread.deal, c.deal, "a save/reload must not turn corrupt numbers into null");
});

test("finite numeric strings retain career money and contract values", () => {
  const c = load().migrateCareer({ money: "500", deal: { salary: "25", bonusPt: "12", left: "1", years: "2" } });
  assert.equal(c.money, 500);
  assert.deepEqual(c.deal, { salary: 25, bonusPt: 12, left: 1, years: 2 });
});

test("invalid driver points and overflowing legacy aliases stay finite and idempotent", () => {
  const SM = load();
  const s = SM.remapPoints(JSON.parse(`{"pts":{"AAA":1e309,"BBB":"Infinity","haas:0":25},"teamPts":{"haas":1e309}}`));
  assert.equal(s.pts["haas:0"], 25, "invalid legacy points cannot erase valid stable-id points");
  assert.equal(s.pts["haas:1"], 0);
  assert.equal(Object.hasOwn(s.teamPts, "haas"), false);
  const overflow = SM.remapPoints({ pts: { AAA: 1e308, "haas:0": 1e308 } });
  assert.ok(Number.isFinite(overflow.pts["haas:0"]), "two individually finite aliases must not sum to Infinity");
  const snap = JSON.stringify(overflow);
  SM.remapPoints(overflow);
  assert.equal(JSON.stringify(overflow), snap);
});

test("a stored display code is never overwritten from the shipped roster on load", () => {
  // award() files the player's seat as "YOU" (and market moves / MY TEAM hires
  // re-label seats); remapPoints reset it to the shipped seat code on every
  // load, so the hub named the player's row after the AI and a boot re-save
  // diverged from disk (a spurious cross-tab conflict).
  const SM = load();
  const save = { v: 1, flavour: "driver", team: "haas", money: 100, year: 2026,
    season: { round: 2, pts: { "haas:0": 25 }, teamPts: { haas: 25 }, driverCodes: { "haas:0": "YOU" } } };
  const c = SM.migrateCareer(save);
  assert.equal(c.season.driverCodes["haas:0"], "YOU");
  assert.equal(SM.migrateCareer(c).season.driverCodes["haas:0"], "YOU", "and on every later load");
  const fresh = SM.migrateCareer({ v: 1, flavour: "driver", team: "haas", money: 1, year: 2026,
    season: { round: 1, pts: { AAA: 25 }, teamPts: {}, driverCodes: {} } });
  assert.equal(fresh.season.driverCodes["haas:0"], "AAA", "a missing code is still filled from the roster");
});
