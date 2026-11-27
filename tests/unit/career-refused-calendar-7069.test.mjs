/* career-refused-calendar-7069.test.mjs — #7069 (#6605 rows 8, 10, 11).
 * Row 8: a refused setAmbition save leaves the old rung, the offers' goals and a failed saveStatus,
 *        and the offers screen reports it (saveRefused after setAmbition).
 * Row 10: "Race starts" is counted per closed season under that year's calendar, so a calendar of
 *        another length later does not rewrite it.
 * Row 11: a refused clear() leaves the career in memory.
 * Run: node --test tests/unit/career-refused-calendar-7069.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEASON = ["a", "b", "c", "d"].map((id) => ({ id }));

function boot() {
  const disk = new Map(), state = { refuse: false };
  const ctx = vm.createContext({ I18n: i18nStub(),
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, queueMicrotask, setTimeout, clearTimeout,
    localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), removeItem: (k) => disk.delete(k), setItem: (k, v) => disk.set(k, String(v)) },
    window: { addEventListener() {} },
    Log: { warn() {}, info() {} },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "custom", tier: 2, custom: true, stats: {}, drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, stats: {}, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
        { id: "sauber", tier: 3, stats: {}, drivers: [{ name: "C", code: "CCC", num: 3 }, { name: "D", code: "DDD", num: 4 }] },
      ],
    },
    Tracks: { LIST: SEASON.slice(), SEASON: SEASON.slice(), seasonIndex: () => 0 },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0 },
  });
  for (const f of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js", "js/career/save-migrate.js",
    "js/core/store.js", "js/career/team-identity.js", "js/career/career-planning.js", "js/career/career.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  const store = vm.runInContext("GameStore.store", ctx), write = store.write.bind(store);
  store.write = (k, v, o) => (state.refuse && String(k).startsWith("career.")
    ? { ok: false, durable: false, reason: "conflict" } : write(k, v, o));
  const Career = vm.runInContext("Career", ctx);
  Career.start({ flavour: "driver", teamId: "haas", seed: 7 });
  Career.engage(true);
  return { Career, state, ctx };
}

test("row 8: a refused setAmbition keeps the old rung and offer goals and reports the failure", () => {
  const { Career, state } = boot();
  Career.data().offers = [{ teamId: "sauber", years: 2, salary: 120, goal: { type: "teamPos", value: 6 } }];
  Career.save();
  const rung = Career.ambition(), goals = JSON.stringify(Career.data().offers);
  state.refuse = true;
  assert.equal(Career.setAmbition(rung === 2 ? 0 : 2), rung);
  assert.equal(Career.saveStatus().ok, false);
  assert.equal(JSON.stringify(Career.data().offers), goals);
});

test("row 10: Race starts keeps each closed season's own calendar length", () => {
  const { Career, ctx } = boot();
  const c = Career.data();
  c.results = [{ p: 1 }, { p: 2 }, { p: 3 }, { p: 4 }];   // a 4-round season
  Career.rollover();
  assert.equal(Career.data().tally.seasons, 1);
  assert.equal(Career.tallyOf(Career.data()).starts, 4);
  vm.runInContext("Tracks.SEASON = Tracks.LIST = Tracks.SEASON.concat([{id:'e'},{id:'f'},{id:'g'}])", ctx);
  assert.equal(Career.roundsTotal() >= 4, true);
  assert.equal(Career.tallyOf(Career.data()).starts, 4, "a longer calendar later must not rewrite the seasons already run");
  assert.equal(JSON.stringify(Career.tallyOf(Career.data()).starts), "4");
});

test("row 11: a refused clear() leaves the career in memory", () => {
  const { Career, state } = boot();
  state.refuse = true;
  const r = Career.clear();
  assert.equal(r.ok, false);
  assert.ok(Career.data(), "the career is still in memory after a refused delete");
  state.refuse = false;
  assert.equal(Career.clear().ok, true);
  assert.equal(Career.data(), null);
});

test("row 10: tally.starts in a save is kept only when a finite non-negative number", () => {
  const { Career } = boot();
  for (const [bad, want] of [["5", undefined], [null, undefined], [Infinity, undefined], [-3, undefined], [12, 12]]) {
    Career.data().tally.starts = bad;
    Career.save();
    Career.load();
    assert.equal(Career.data().tally.starts, want, String(bad));
  }
});
