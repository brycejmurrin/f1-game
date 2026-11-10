/* season-calendar-default.test.mjs — W18 (audit 2026-11-09): a NEW season or
 * career races the real 2026 calendar; every EXISTING save keeps the calendar it
 * was created with; the 24-round list stays on offer. Plus the career-save fixes
 * that rode along: start() never overwrites a full set, prize money needs a
 * classified car, and imports are range-checked.
 *
 * The circuit roster is the REAL one (js/track/circuit-meta.js, in LIST order,
 * `classic` flags and all), so Tracks.SEASON here is the shipped 24-round list
 * and SeasonCal.REAL_2026 resolves whole. Saves go through the real
 * SaveMigrate.migrateCareer (GameStore.migrateCareer is that function in
 * js/core/store.js) and Career.load(), the path a boot takes.
 *
 * Run: node --test tests/unit/season-calendar-default.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
// The VM realm has its own Array/Object prototypes: compare by value.
const J = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);

// The shipped roster, as tracks.js builds LIST (DEFS order) and SEASON (non-classic).
function realTracks() {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read("js/track/circuit-meta.js"), c, { filename: absSrc("js/track/circuit-meta.js") });
  const LIST = c.window.TrackDefs.map((d) => ({ id: d.id, name: d.name, gp: d.gp, classic: !!d.classic }));
  const SEASON = LIST.filter((t) => !t.classic);
  return { LIST, SEASON, seasonIndex: (r) => (SEASON[r] ? LIST.indexOf(SEASON[r]) : -1) };
}
const TRACKS = realTracks();
const OLD_24 = TRACKS.SEASON.map((t) => t.id);

function boot(stored0 = {}) {
  const stored = new Map(Object.entries(stored0).map(([k, v]) => ["apex26." + k, JSON.parse(JSON.stringify(v))]));
  const rev = new Map();
  const write = (k, v) => { stored.set("apex26." + k, v); rev.set(k, (rev.get(k) || 0) + 1); return { ok: true, durable: true, reason: null }; };
  const store = {
    get: (k, d) => (stored.has("apex26." + k) ? stored.get("apex26." + k) : d),
    set: (k, v) => write(k, v).durable,
    write,
    keyRevision: (k) => String(rev.get(k) || 0),
    subscribe: () => () => {},
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, WeakSet, isNaN, isFinite, parseInt, console,
    GameStore: { CAREER_V: 2, store, seasonDriverId: (teamId, i) => teamId + ":" + i, migrateCareer: null },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222, drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}), setLegality() {} },
    Tracks: TRACKS,
  });
  seedLog(ctx);
  seedHash32(ctx);
  seedSaveMigrate(ctx);
  ctx.GameStore.migrateCareer = vm.runInContext("SaveMigrate.migrateCareer", ctx);
  for (const f of ["js/core/mat4.js", "js/data/driver-ratings.js", "js/career/season-cal.js",
    "js/career/career-planning.js", "js/career/career.js"]) {
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  }
  return { ...vm.runInContext("({ Career, SeasonCal, SaveMigrate })", ctx), stored, store };
}

// A career save as the build before this change wrote it: no calSet, its
// season stamped with the 24-round list.
function oldCareer(round, opts = {}) {
  const pts = { "haas:1": 40, "haas:0": 22 };
  return {
    v: 2, flavour: "driver", year: 2026, year0: 2026, money: 2345, rep: 37, seat: 1, seed: 7,
    driver: { name: "Bryce", code: "BRY", num: 26 }, team: "haas",
    season: Object.assign({ round, pts, teamPts: { haas: 62 }, driverCodes: {}, finishes: {}, roundPts: {} },
      opts.unstamped ? {} : { calIds: OLD_24.slice() }),
    owned: [], fitted: {}, results: round > 0 ? [{ r: round - 1, p: 4, pts: 12 }] : [], history: [],
    dev: {}, tdev: {}, seats: {}, offers: [], obj: null, budgetLvl: 0, facility: 0, moves: [], paidSponsors: [],
    deal: { team: "haas", seat: 1, salary: 60, bonusPt: 2, left: 1, years: 1 },
  };
}

// ── the default ───────────────────────────────────────────────────────────────

test("REAL_2026 is whole in this build, 23 rounds, and is a new season's default", () => {
  const { SeasonCal } = boot();
  const real = SeasonCal.REAL_2026.map((r) => r.id);
  assert.equal(real.length, 23);
  deq([...SeasonCal.presetIds("real2026")], real, "every 2026 round maps to a circuit this game has");
  deq([...SeasonCal.fresh().trackIds], real);
  deq([...SeasonCal.config().trackIds], real, "no stored setup: the new season is 2026 REAL");
  assert.equal(SeasonCal.fresh().sprint, false, "the default sets the calendar, not the sprint format");
  // The rounds the audit named: the 24-round list is the one with Bahrain/Jeddah.
  for (const id of ["zandvoort", "catalunya", "sepang", "qatar", "abudhabi"]) assert.ok(real.includes(id), id);
  for (const id of ["bahrain", "jeddah", "istanbul", "portimao"]) assert.ok(!real.includes(id), id);
  assert.equal(OLD_24.length, 24);
});

test("the old list is offered as 24-ROUND, and Tracks.SEASON is untouched", () => {
  const { SeasonCal } = boot();
  const p = SeasonCal.PRESETS.find((x) => x.id === "full");
  assert.equal(p.label, "24-ROUND");
  assert.equal(SeasonCal.PRESETS[0].id, "real2026", "the default is the first chip");
  deq([...SeasonCal.presetIds("full")], OLD_24);
  deq([...SeasonCal.legacyIds()], OLD_24);
});

test("a new career stamps 2026 REAL; the 24-round list on request", () => {
  const { Career, SeasonCal } = boot();
  Career.engage(true);
  assert.ok(Career.start({ teamId: "haas", seat: 1 }));
  assert.equal(Career.data().calSet, "real2026");
  deq([...Career.calendar().map((t) => t.id)], SeasonCal.REAL_2026.map((r) => r.id));
  assert.equal(Career.roundsTotal(), 23);
  assert.ok(Career.start({ teamId: "haas", seat: 1, calendar: "24", slot: 1 }));
  assert.equal(Career.data().calSet, "24");
  deq([...Career.calendar().map((t) => t.id)], OLD_24);
});

// ── existing saves keep their calendar ────────────────────────────────────────

for (const [label, round] of [["mid-season (round 9)", 9], ["finished (round 24)", 24]]) {
  test(`an existing career saved ${label} loads with its calendar, round and points intact`, () => {
    const saved = oldCareer(round);
    const { Career } = boot({ "career.driver.0": saved, careerSlot: "driver:0" });
    Career.engage(true);
    const c = Career.load();
    assert.ok(c, "the save loads");
    deq([...Career.calendar().map((t) => t.id)], OLD_24, "still the 24-round calendar");
    assert.equal(Career.round(), round);
    assert.equal(Career.roundsTotal(), 24);
    deq({ ...c.season.pts }, saved.season.pts);
    deq({ ...c.season.teamPts }, saved.season.teamPts);
    assert.equal(c.money, 2345);
    assert.equal(Career.seasonDone(), round >= 24);
    if (round < 24) assert.equal(Career.trackIndex(), TRACKS.LIST.findIndex((t) => t.id === OLD_24[round]), "the next race is the same circuit");
  });
}

test("an unstamped (older) career is stamped with the 24-round list, not today's default", () => {
  const { Career } = boot({ "career.driver.0": oldCareer(5, { unstamped: true }), careerSlot: "driver:0" });
  Career.engage(true);
  const c = Career.load();
  deq([...c.season.calIds], OLD_24);
  assert.equal(Career.round(), 5);
});

test("a finished pre-change career rolls into a new season on the SAME 24-round list", () => {
  const { Career } = boot({ "career.driver.0": oldCareer(24), careerSlot: "driver:0" });
  Career.engage(true);
  Career.load();
  assert.ok(Career.seasonDone());
  Career.rollover();
  assert.equal(Career.round(), 0);
  deq([...Career.calendar().map((t) => t.id)], OLD_24);
});

test("a 2026 REAL career rolls over onto 2026 REAL", () => {
  const { Career, SeasonCal } = boot();
  Career.engage(true);
  Career.start({ teamId: "haas", seat: 1 });
  Career.data().season.round = 23;
  Career.rollover();
  deq([...Career.calendar().map((t) => t.id)], SeasonCal.REAL_2026.map((r) => r.id));
});

test("an existing standalone season keeps its calendar: snapshot, and a pre-snapshot save", () => {
  // Mid-season with the frozen config every build since the snapshot wrote.
  const snap = { round: 7, pts: { "haas:0": 30 }, teamPts: { haas: 30 }, driverCodes: {}, finishes: {}, roundPts: {},
    config: { trackIds: OLD_24, quali: true, sprint: false, sprintIds: [], laps: 3, points: "modern", flPoint: false, drop: 0 } };
  let { SeasonCal } = boot({ season: snap });
  SeasonCal.engage("season");
  let s = SeasonCal.load();
  assert.equal(s.round, 7);
  deq({ ...s.pts }, snap.pts);
  deq([...SeasonCal.list().map((t) => t.id)], OLD_24);
  // Finished.
  ({ SeasonCal } = boot({ season: Object.assign({}, snap, { round: 24 }) }));
  SeasonCal.engage("season");
  s = SeasonCal.load();
  assert.equal(s.round, 24);
  assert.equal(SeasonCal.rounds(), 24, "a finished 24-round championship stays finished");
  // A save from before the snapshot, no stored setup: raced on the 24 of its day.
  ({ SeasonCal } = boot({ season: { round: 11, pts: { "haas:0": 50 }, teamPts: {} } }));
  SeasonCal.engage("season");
  s = SeasonCal.load();
  assert.equal(s.round, 11);
  deq([...SeasonCal.list().map((t) => t.id)], OLD_24);
  // …and with a stored setup, that setup, as before.
  const mine = ["monza", "spa", "suzuka"];
  ({ SeasonCal } = boot({ season: { round: 1, pts: {}, teamPts: {} }, seasonCfg: { trackIds: mine } }));
  SeasonCal.engage("season");
  SeasonCal.load();
  deq([...SeasonCal.list().map((t) => t.id)], mine);
});

test("Bryce's exported profile carries no career or season, so it changes nothing here", () => {
  const raw = JSON.parse(read("tests/data/settings-defaults-export.json"));
  const keys = JSON.stringify(Object.keys(raw.values || raw.settings || raw));
  assert.ok(!/career\.(driver|myteam)|"season"/.test(keys), "the export excludes saves (its `excluded` note)");
  assert.match(String(raw.excluded || ""), /career, season/);
});

// ── start() never overwrites a full set ───────────────────────────────────────

test("start() with every slot of the mode used and none named returns null and writes nothing", () => {
  const stored0 = { careerSlot: "driver:2" };
  for (let i = 0; i < 3; i++) stored0["career.driver." + i] = oldCareer(3 + i);
  const { Career, stored } = boot(stored0);
  Career.engage(true);
  Career.load();
  const before = JSON.stringify(stored.get("apex26.career.driver.2"));
  assert.equal(Career.firstFree("driver"), -1);
  assert.equal(Career.start({ flavour: "driver", teamId: "haas", seat: 1 }), null);
  assert.equal(JSON.stringify(stored.get("apex26.career.driver.2")), before, "the live career is untouched");
  assert.ok(Career.start({ flavour: "driver", teamId: "haas", seat: 1, slot: 2 }), "an explicit slot is the player's call");
});

// ── prize money needs a classified car ────────────────────────────────────────

function race(Career, mark) {
  Career.engage(true);
  Career.start({ teamId: "haas", seat: 1 });
  Career.data().season.round = 1;
  const field = Array.from({ length: 6 }, (_, i) => ({ team: { id: "x" + i }, driverId: "x" + i }));
  const me = { isPlayer: true, team: { id: "haas" }, driverId: "haas:1" };
  Object.assign(me, mark);
  const order = [field[0], me, ...field.slice(1)];
  const before = Career.data().money;
  Career.settleRound(order, me);
  return Career.data().money - before;
}

test("a classified P2 is paid its prize; a retired or disqualified P2 is not", () => {
  const ok = race(boot().Career, { classified: true });
  const dnf = race(boot().Career, { retired: true, classified: false });
  const dsq = race(boot().Career, { dsq: "technical", classified: true });
  assert.ok(ok - dnf >= 700, `P2 prize paid only when classified (paid ${ok}, retired ${dnf})`);
  assert.equal(dsq, dnf, "a disqualified car is paid as a retirement");
});

// ── import ranges ─────────────────────────────────────────────────────────────

test("a stored career's money and salaries are clamped to what play can produce", () => {
  const { SaveMigrate } = boot();
  const { MONEY_MAX, SALARY_MAX } = SaveMigrate.LIMITS;
  const c = oldCareer(1);
  c.money = 1e308;
  c.offers = [{ team: "haas", seat: 0, years: 1, salary: 1e300 }];
  c.deal.salary = -9;
  const m = SaveMigrate.migrateCareer(c);
  assert.equal(m.money, MONEY_MAX);
  assert.equal(m.offers[0].salary, SALARY_MAX);
  assert.equal(m.deal.salary, 0);
  assert.equal(SaveMigrate.migrateCareer(Object.assign(oldCareer(1), { money: -5 })).money, 0);
});

test("career-backup refuses an import whose money or salary is out of range", () => {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Set, Map, isNaN, isFinite, console,
    Blob: class { constructor(p) { this.size = String(p[0]).length; } }, Promise });
  seedLog(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(read("js/career/career-backup.js"), ctx, { filename: absSrc("js/career/career-backup.js") });
  const B = vm.runInContext("CareerBackup", ctx);
  const env = (data) => ({ format: B.FORMAT, slots: [{ flavour: "driver", i: 0, data }] });
  assert.equal(B.validate(env(oldCareer(1))).ok, true);
  assert.equal(B.validate(env(Object.assign(oldCareer(1), { money: -5 }))).reason, "money-range");
  assert.equal(B.validate(env(Object.assign(oldCareer(1), { money: 1e308 }))).reason, "money-range");
  assert.equal(B.validate(env(Object.assign(oldCareer(1), { offers: [{ team: "haas", salary: 1e12 }] }))).reason, "salary-range");
  assert.equal(B.validate(env(Object.assign(oldCareer(1), { deal: { salary: -1 } }))).reason, "salary-range");
});

test("hirePending() (the __apex.careerHire hook) is null with no career loaded, as the sibling hooks", () => {
  const { Career } = boot();
  assert.equal(Career.data && Career.data(), null);
  assert.equal(Career.hirePending(), null);
});
