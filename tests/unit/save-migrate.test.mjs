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

test("MY TEAM roster numbers are sanitised like the contract's: wageBill cannot turn money into NaN", () => {
  const c = load().migrateCareer({ flavour: "myteam", money: 100, roster: [
    { code: "AAA", salary: "x", left: "1e400", pending: { kind: "renew", ask: "nope" } },
    { code: "BBB", salary: "7", left: 2, pending: "junk" },
  ] });
  assert.equal(c.roster[0].salary, 0);
  assert.equal(c.roster[0].left, 0);
  assert.equal(c.roster[0].pending.ask, 0);
  assert.equal(c.roster[1].salary, 7);
  assert.equal(c.roster[1].left, 2);
  assert.equal(c.roster[1].pending, null);
  const bill = c.roster.reduce((n, d) => n + (d.salary || 0), 0);   // career.js wageBill()
  assert.equal(c.money - bill, 93);
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

test("each rung climbed is logged once; a newer-build or junk save warns; a missing one is silent", () => {
  const lines = [];
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, isFinite, console,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "AAA" }, { code: "BBB" }] }] },
    Log: { info: (ns, m) => lines.push(["info", ns, m]), warn: (ns, m) => lines.push(["warn", ns, m]) },
  });
  seedSaveMigrate(ctx);
  const SM = vm.runInContext("SaveMigrate", ctx);
  SM.migrateCareer(RUNG_INPUTS.v0());
  assert.deepEqual(lines.map((l) => l[2]),
    Array.from({ length: SM.CAREER_V }, (_, v) => `Career save migrated v${v}->v${v + 1}`));
  lines.length = 0;
  SM.migrateCareer({ v: SM.CAREER_V, flavour: "driver" });
  assert.deepEqual(lines, [], "an up-to-date save climbs nothing and says nothing");
  SM.migrateCareer({ v: SM.CAREER_V + 5 });
  SM.migrateCareer([1]);
  SM.migrateCareer(null);
  assert.deepEqual(lines.map((l) => l[0]), ["warn", "warn"], "newer build + array warn; a missing save (null) is silent");
  assert.ok(lines.every((l) => l[1] === "game"));
});

// review-race-career-data #5: `career.seat | 0` let `seat: 5` / `-1` through,
// game.js copies it into driverIdx, and makeCars then marks no car as the
// player. The seat is clamped to the team's grid row; MY TEAM's is always 0.
test("the career seat is clamped to the team's grid row (MY TEAM: seat 0)", () => {
  const SM = load();
  const seatOf = (o) => SM.migrateCareer(Object.assign(RUNG_INPUTS.v1(), o)).seat;
  assert.equal(seatOf({ seat: 1 }), 1, "a valid seat is kept");
  assert.equal(seatOf({ seat: 5 }), 1, "past the row: the last seat");
  assert.equal(seatOf({ seat: -1 }), 0);
  assert.equal(seatOf({ seat: "x" }), 0);
  assert.equal(seatOf({ seat: 1e309 }), 1, "overflow clamps, never wraps");
  assert.equal(seatOf({ team: "nobody", seat: 3 }), 1, "an unknown team still has two seats");
  assert.equal(seatOf({ flavour: "myteam", team: "custom", seat: 1 }), 0);
  const once = JSON.stringify(SM.migrateCareer(Object.assign(RUNG_INPUTS.v1(), { seat: 9 })));
  assert.equal(JSON.stringify(SM.migrateCareer(JSON.parse(once))), once, "idempotent");
});

// review-race-career-data (WP-B #1): tdev/dev/seats/offers/results passed
// through on a bare typeof-object check, so a hand-edited or imported save put
// NaN / 1e308 into every AI car's pace and a string salary into the balance.
test("hostile tdev / dev / offers / results / seats are coerced to finite, bounded values", () => {
  const SM = load();
  const c = SM.migrateCareer(Object.assign(RUNG_INPUTS.v1(), {
    tdev: { x: "abc", y: 1e308, z: -1e308, w: "3", ["__proto__"]: 5 },
    dev: { "a:0": { pace: "x", craft: 1e308, awareness: -99, consistency: "4", experience: 1e9 }, "b:1": 7 },
    offers: [{ teamId: "haas", salary: "9", years: "x" }, { teamId: "haas", salary: 1e308, years: 99 }],
    results: [{ r: "2", p: "1", pts: "x" }, { r: -3, p: 1e309, pts: -5 }],
    seats: { "haas:1": { name: 5, code: 7, num: "z" }, "haas:0": { name: "N", code: "NNN", num: 1e9 } },
  }));
  const L = SM.LIMITS;
  for (const [k, v] of Object.entries(c.tdev)) {
    assert.ok(Number.isFinite(v) && Math.abs(v) <= L.TDEV_MAX, `tdev.${k}=${v}`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(c.tdev)), { y: L.TDEV_MAX, z: -L.TDEV_MAX, w: 3 }, "non-numeric entries are dropped, the rest clamped");
  assert.deepEqual(JSON.parse(JSON.stringify(c.dev["a:0"])), { craft: L.DEV_MAX, awareness: -L.DEV_MAX, consistency: 4, experience: L.EXP_MAX });
  assert.equal(c.dev["b:1"], undefined, "a non-object dev row is dropped");
  for (const o of c.offers) {
    assert.ok(Number.isFinite(o.salary) && o.salary >= 0, `offer salary ${o.salary}`);
    assert.ok(Number.isInteger(o.years) && o.years >= 1 && o.years <= 3, `offer years ${o.years}`);
  }
  assert.equal(c.offers[0].salary, 9, "a numeric string is kept as the number it spells");
  assert.deepEqual(c.results.map((r) => [r.r, r.p, r.pts]).flat(), [2, 1, 0, 0, 0, 0],
    "strings become numbers; negatives and Infinity become 0");
  assert.deepEqual(JSON.parse(JSON.stringify(c.seats)), { "haas:0": { name: "N", code: "NNN", num: 999 } }, "an entry without a named, coded driver is dropped");
  const once = JSON.stringify(c);
  assert.equal(JSON.stringify(SM.migrateCareer(JSON.parse(once))), once, "idempotent");
});

test("SaveMigrate's clamp limits equal career.js's TDEV_MAX / DEV_MAX / EXP_MAX", () => {
  const careerSrc = fs.readFileSync(path.join(ROOT, "js/career/career.js"), "utf8");
  const L = load().LIMITS;
  for (const name of ["TDEV_MAX", "DEV_MAX", "EXP_MAX"]) {
    assert.equal(Number(new RegExp(`const ${name} = (\\d+);`).exec(careerSrc)?.[1]), L[name], name);
  }
});

test("a save from before the tally derives it once from its history; a present tally is kept", () => {
  const SM = load();
  const hist = [{ pos: 1, cPos: 2, wins: 5, podiums: 8, pts: 300 }, { pos: 3, cPos: 1, wins: 1, podiums: 4, pts: 150 }, null];
  const c = SM.migrateCareer(Object.assign(RUNG_INPUTS.v1(), { history: hist }));
  assert.deepEqual(JSON.parse(JSON.stringify(c.tally)), { seasons: 2, wins: 6, podiums: 12, titles: 1, cTitles: 1, pts: 450 });
  c.history.length = 0;                       // the archive trimmed: the tally must not shrink with it
  assert.equal(SM.migrateCareer(c).tally.seasons, 2);
  const bad = SM.migrateCareer(Object.assign(RUNG_INPUTS.v1(), { tally: { seasons: "x", wins: -4, titles: 1e309 } }));
  assert.ok(Object.values(bad.tally).every((n) => Number.isFinite(n) && n >= 0), "a poisoned tally is made finite");
});

test("a missing or junk team defaults as Career.start does, so the title's team.toUpperCase() cannot throw at boot", () => {
  const SM = load();
  for (const bad of [undefined, null, 7, "", {}]) {
    assert.equal(SM.migrateCareer({ money: 100, team: bad }).team, "haas", `driver team ${JSON.stringify(bad)}`);
    assert.equal(SM.migrateCareer({ flavour: "myteam", money: 100, team: bad }).team, "custom", `myteam team ${JSON.stringify(bad)}`);
  }
  assert.equal(SM.migrateCareer({ money: 100 }).team, "haas", "the bare {money:100} backup row");
  assert.equal(SM.migrateCareer({ flavour: "driver", team: "haas", money: 1 }).team, "haas", "a real team is kept");
});

test("an imported season.config is dropped: a huge round must not make SeasonCal.netPts loop round times", () => {
  const SM = load();
  const c = SM.migrateCareer({ v: 1, flavour: "driver", team: "haas", money: 1,
    season: { round: 2e9, pts: { AAA: 5 }, teamPts: {}, driverCodes: {}, roundPts: { AAA: [1, 2] }, config: { drop: 1, trackIds: [] } } });
  assert.ok(!("config" in c.season), "config is not carried into a career season");
  assert.equal(c.season.round, 2e9, "the rest of the season is untouched");
  assert.ok(!("config" in SM.migrateCareer(JSON.parse(JSON.stringify(c))).season), "idempotent");
});

test("a deal goal whose type names an Object.prototype member is normalised to champPos; a plain unknown type is kept", () => {
  const SM = load();
  const goalOf = (goal) => SM.migrateCareer({ v: 1, flavour: "driver", team: "haas", deal: { salary: 1, bonusPt: 1, left: 1, years: 1, goal } }).deal.goal;
  for (const type of ["constructor", "__proto__", "toString", 7, null]) assert.equal(goalOf({ type, value: 2 }).type, "champPos", String(type));
  assert.equal(goalOf({ type: "beatRival", value: "haas:0" }).type, "beatRival");
  assert.equal(goalOf({ type: "no-such-kind", value: 1 }).type, "no-such-kind", "unknown plain types already resolve as champPos downstream");
  assert.equal(goalOf(undefined), undefined, "no goal stays no goal");
});

test("remapPoints leaves season.config alone: the standalone season keeps its frozen rules (only migrateCareer strips it)", () => {
  const SM = load();
  const cfg = { drop: 1, trackIds: ["monza"] };
  const s = SM.remapPoints({ round: 1, pts: { AAA: 5 }, teamPts: {}, driverCodes: {}, config: cfg });
  assert.equal(s.config, cfg, "remapPoints does not touch config");
  const viaStandalone = { round: 1, pts: {}, config: { drop: 2 } };
  SM.migrateSeasonPoints({ get: () => null, set() {} }, viaStandalone);
  assert.deepEqual(JSON.parse(JSON.stringify(viaStandalone.config)), { drop: 2 }, "migrateSeasonPoints keeps it too");
});
