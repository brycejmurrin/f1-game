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
 *   - A save from a NEWER build is stamped back to CAREER_V rather than
 *     refused — recorded here because it is what the code does, not because
 *     it is obviously right: the next rung's author decides whether a
 *     downgrade should keep unknown keys or bail.
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

test("a save from a newer build is stamped back to CAREER_V, keys intact (documented, not endorsed)", () => {
  const SM = load();
  const c = SM.migrateCareer({ v: SM.CAREER_V + 5, flavour: "myteam", team: "haas", futureKey: { x: 1 } });
  assert.equal(c.v, SM.CAREER_V);
  assert.equal(c.flavour, "myteam");
  assert.deepEqual(c.futureKey, { x: 1 }, "unknown keys survive the stamp — the next rung decides whether that stays true");
});

test("junk in, null out: a non-object save is refused rather than repaired", () => {
  const SM = load();
  for (const bad of [null, undefined, 7, "save", []]) {
    const r = SM.migrateCareer(bad);
    if (Array.isArray(bad)) assert.equal(typeof r, "object"); // an array is an object to `typeof`; documented edge
    else assert.equal(r, null, `${JSON.stringify(bad)} should be refused`);
  }
});
