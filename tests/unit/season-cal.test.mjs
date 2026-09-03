/* season-cal.test.mjs — the SEASON calendar/format model, in a VM.
 *
 * js/career/season-cal.js is pure rules with no DOM, so like career-settle.test.mjs
 * and race-control.test.mjs it loads whole into a VM with stub GameStore / Tracks
 * / Teams and is driven directly. Playwright buys nothing here and costs 20 s a
 * case.
 *
 * THE RULE THIS FILE EXISTS FOR is the two-gate split in the module header: the
 * CALENDAR follows the player whenever the flow is not "career", but the FORMAT
 * follows the player ONLY in "season". A single "not career" gate compiles, ships
 * and silently gives a one-off Grand Prix the season's sprint distance and its
 * points table — nothing in the browser suite would notice, because both look
 * like an ordinary race. `format accessors are neutral outside a season` below is
 * the assertion that catches it.
 *
 * Run: node --test tests/unit/season-cal.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// Eight championship circuits and three classics — enough shape to test slicing,
// ordering and "a classic is a legal round" without carrying all 40 defs.
function trackDefs() {
  const season = ["bahrain", "jeddah", "melbourne", "suzuka", "imola", "monaco", "montreal", "monza"]
    .map((id) => ({ id, name: id.toUpperCase(), classic: false }));
  const classics = ["kyalami", "estoril", "adelaide"]
    .map((id) => ({ id, name: id.toUpperCase(), classic: true }));
  return { LIST: season.concat(classics), SEASON: season };
}

// `const SeasonCal` lands in the context's global LEXICAL scope, not on the
// global object — read it back by evaluating its name (same shape as
// career-settle.test.mjs).
function load(stored0) {
  const stored = new Map(Object.entries(stored0 || {}));
  const subscribers = [];
  const tracks = trackDefs();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Set, Map, isNaN, isFinite, parseInt, console,
    GameStore: {
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
        subscribe: (fn) => { subscribers.push(fn); return () => {}; },
      },
    },
    Tracks: tracks,
    Teams: { POINTS },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx);
  return {
    S: vm.runInContext("SeasonCal", ctx), stored, tracks,
    foreign: (key) => subscribers.forEach((fn) => fn({ key, foreign: true, clear: key == null })),
  };
}

// A classified field, finishing in the order given. `retired` cars are still
// classified — that is the case the award rule is about.
function field(n, retired) {
  const out = [];
  for (let i = 0; i < n; i++)
    out.push({ driverId: "d" + i, code: "D" + i, team: { id: "t" + i }, retired: !!(retired || []).includes(i) });
  return out;
}

// ── the config ────────────────────────────────────────────────────────────────

test("a fresh config is the built-in championship calendar", () => {
  const { S, tracks } = load();
  const c = S.config();
  assert.deepEqual(c.trackIds, tracks.SEASON.map((t) => t.id));
  assert.equal(c.quali, true);
  assert.equal(c.sprint, false);
  assert.equal(c.points, "modern");
});

test("normalise drops unknown ids, collapses duplicates and keeps order", () => {
  const { S } = load();
  const c = S.normalize({ trackIds: ["monza", "nowhere", "monza", "kyalami"] });
  assert.deepEqual(c.trackIds, ["monza", "kyalami"]);
});

test("an empty or unusable calendar falls back rather than leaving zero rounds", () => {
  const { S, tracks } = load();
  assert.deepEqual(S.normalize({ trackIds: [] }).trackIds, tracks.SEASON.map((t) => t.id));
  assert.deepEqual(S.normalize({ trackIds: ["nowhere"] }).trackIds, tracks.SEASON.map((t) => t.id));
  assert.deepEqual(S.normalize(null).trackIds, tracks.SEASON.map((t) => t.id));
});

test("out-of-range format values fall back instead of shipping into a race", () => {
  const { S } = load();
  const c = S.normalize({ laps: 999, points: "gibberish", quali: "yes", sprint: "yes" });
  assert.equal(c.laps, S.DEFAULT_LAPS);
  assert.equal(c.points, "modern");
  assert.equal(c.quali, true, "only an explicit false turns qualifying off");
  assert.equal(c.sprint, false, "only an explicit true turns the sprint on");
});

test("setConfig persists the NORMALISED config, not what it was handed", () => {
  const { S, stored } = load();
  S.setConfig({ trackIds: ["monza", "monza", "nope"], laps: 10, points: "classic" });
  assert.deepEqual(stored.get("seasonCfg").trackIds, ["monza"]);
  assert.equal(stored.get("seasonCfg").laps, 10);
});

test("a foreign calendar write invalidates SeasonCal's own resolved cache", () => {
  const { S, stored, foreign } = load({ seasonCfg: { trackIds: ["monza"] } });
  assert.equal(S.track(0).id, "monza");
  stored.set("seasonCfg", { trackIds: ["kyalami"] });
  foreign("seasonCfg");
  assert.equal(S.track(0).id, "kyalami");
});

// ── the calendar gate ─────────────────────────────────────────────────────────

test("the calendar is the player's in season AND in gp, but never in career", () => {
  const { S, tracks } = load({ seasonCfg: { trackIds: ["monza", "kyalami", "monaco"] } });
  for (const flow of ["season", "gp"]) {
    S.engage(flow);
    assert.equal(S.rounds(), 3, flow);
    assert.equal(S.track(0).id, "monza", flow);
  }
  // gp matters on its own: js/game.js reads the calendar at boot and on the title
  // screen, where the flow is still "gp" and the standalone save is what it means.
  S.engage("career");
  assert.equal(S.rounds(), tracks.SEASON.length);
  assert.equal(S.track(0).id, "bahrain");
});

test("trackIndex is a Tracks.LIST index and a classic is a legal round", () => {
  const { S, tracks } = load({ seasonCfg: { trackIds: ["kyalami", "monza"] } });
  S.engage("season");
  assert.equal(S.trackIndex(0), tracks.LIST.findIndex((t) => t.id === "kyalami"));
  assert.equal(S.trackIndex(1), tracks.LIST.findIndex((t) => t.id === "monza"));
  assert.equal(S.trackIndex(2), -1, "past the last round is -1, as Tracks.seasonIndex was");
});

// ── the format gate — see the file header ─────────────────────────────────────

test("format accessors are neutral outside a season, whatever the config holds", () => {
  const { S } = load({ seasonCfg: { quali: false, sprint: true, points: "classic", laps: 25 } });
  for (const flow of ["gp", "career"]) {
    assert.equal(S.engage(flow), undefined);
    assert.equal(S.quali(), true, `${flow} must still qualify when asked to`);
    assert.equal(S.stage(null), "race", `${flow} has no sprint leg`);
    assert.equal(S.lapsFor(58, null), 58, `${flow} keeps the distance it was given`);
    assert.equal(S.formatLaps(3), 3, `${flow} opens #rs-laps on its own default`);
    assert.deepEqual(S.pointsTable(), POINTS, `${flow} pays the modern table`);
  }
  S.engage("season");
  assert.equal(S.quali(), false);
  assert.equal(S.stage(null), "sprint");
  assert.equal(S.formatLaps(3), 25);
  assert.deepEqual(S.pointsTable(), S.CLASSIC_POINTS);
});

test("a sprint is a third of the race distance, never shorter than two laps", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  assert.equal(S.lapsFor(57, null), 19);
  assert.equal(S.lapsFor(3, null), 2, "a 3-lap season must not out-run its own sprint");
  assert.equal(S.lapsFor(57, { round: 0, stage: "race" }), 57, "the GP leg is full distance");
});

// ── the weekend stage machine ─────────────────────────────────────────────────

test("a sprint scores its own table and does NOT advance the round", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = S.blank();
  const scored = S.award(season, field(4));
  assert.equal(scored, "sprint");
  assert.equal(S.scored(), "sprint");
  assert.equal(season.round, 0, "the weekend is not over");
  assert.equal(season.stage, "race", "…and the Grand Prix is what comes next");
  assert.equal(season.pts.d0, 8);
  assert.equal(season.pts.d1, 7);
});

test("the Grand Prix leg then scores the full table and closes the round", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(4));
  const scored = S.award(season, field(4));
  assert.equal(scored, "race");
  assert.equal(season.round, 1);
  assert.equal(season.stage, undefined, "…and the next weekend starts at its sprint");
  assert.equal(season.pts.d0, 8 + 25, "both legs of one weekend pay");
  assert.equal(season.teamPts.t0, 8 + 25);
});

test("qualifying runs once a weekend — the GP grids off the sprint's own session", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = S.blank();
  assert.equal(S.qualiNext(season), true, "the weekend opens with qualifying");
  S.award(season, field(4));
  assert.equal(S.qualiNext(season), false, "…and does not re-run it before the GP");
  S.award(season, field(4));
  assert.equal(S.qualiNext(season), true, "the next weekend qualifies again");
});

test("a retirement scores nothing while the cars above keep their points", () => {
  const { S } = load();
  S.engage("season");
  const season = S.blank();
  S.award(season, field(4, [1]));
  assert.equal(season.pts.d0, 25);
  assert.equal(season.pts.d1, 0, "classified P2, retired, scores nothing");
  assert.equal(season.pts.d2, 15, "P3 still earns what P3 earns");
});

test("the sprint leg draws retirements on a different key from the Grand Prix", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = { round: 4 };
  assert.notEqual(S.drawRound(season), S.drawRound({ round: 4, stage: "race" }),
    "sharing season.round would retire the same cars twice in one weekend");
  // …and nothing else moves: a career and a no-sprint season keep the old key.
  S.engage("career");
  assert.equal(S.drawRound(season), 4);
});

test("a no-qualifying sprint weekend grids the GP off the sprint result", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const season = S.blank();
  const sprintResult = field(3);
  S.award(season, [sprintResult[2], sprintResult[0], sprintResult[1]]);
  // Joined, not deep-compared: `grid` is built inside the VM, so its array has
  // the VM realm's prototype and assert/strict's deepEqual rejects it against a
  // host literal that has the same contents. Same trap for teamPts below.
  const grid = S.grid(sprintResult, season);
  assert.equal(grid.map((c) => c.driverId).join(","), "d2,d0,d1");
});

test("restarting a season clears the prior weekend's sprint grid", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const cars = field(3);
  const old = S.blank();
  S.award(old, [cars[2], cars[0], cars[1]]);
  const fresh = S.restart();
  assert.equal(S.stage(fresh), "sprint");
  assert.equal(S.grid(cars, fresh), null, "an opening sprint cannot inherit the prior season's result");
});

test("grid() is null whenever qualifying has already decided the order", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: true } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(3));
  assert.equal(S.grid(field(3), season), null, "gridUp must fall through to quali.order()");
});

test("a sprint order recorded in a season cannot grid a later Grand Prix", () => {
  // sprintOrder is module state that outlives the season it was set in, and
  // startRace() calls grid() for any race that is not coming out of qualifying.
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(3));
  S.engage("gp");
  assert.equal(S.grid(field(3), season), null, "a one-off must not inherit a season's grid");
});

// ── the save ──────────────────────────────────────────────────────────────────

test("resume repairs a partial save; finished stays; only past-calendar blanks", () => {
  const { S } = load({ seasonCfg: { trackIds: ["monza", "monaco"] } });
  S.engage("season");
  assert.deepEqual(S.resume(null), S.blank());
  // round === rounds() is a finished championship — keep standings readable.
  const done = S.resume({ round: 2, pts: { d0: 100 }, teamPts: { t0: 100 }, driverCodes: {} });
  assert.equal(done.round, 2, "finished championship is not wiped on re-entry");
  assert.equal(done.pts.d0, 100);
  assert.equal(S.resume({ round: 5 }).round, 0, "past a shortened calendar blanks");
  const partial = S.resume({ round: 1, pts: { d0: 25 } });
  assert.equal(partial.round, 1);
  assert.equal(Object.keys(partial.teamPts).length, 0, "the missing halves are filled, not thrown away");
  assert.equal(partial.pts.d0, 25, "…and the ones that were there are not touched");
});

test("a completed season is readable but cannot be scored again", () => {
  const { S } = load({ seasonCfg: { trackIds: ["monza", "monaco"] } });
  S.engage("season");
  const done = S.resume({ round: 2, pts: { d0: 50 }, teamPts: { t0: 50 }, driverCodes: {} });
  assert.equal(S.canRace(done), false);
  assert.equal(S.award(done, field(3)), null);
  assert.equal(done.round, 2);
  assert.equal(done.pts.d0, 50);
});

test("resume rejects non-integer rounds and normalises score-map shapes", () => {
  const { S } = load({ seasonCfg: { trackIds: ["monza", "monaco"] } });
  S.engage("season");
  assert.equal(S.resume({ round: 1.5, pts: { d0: 99 } }).round, 0);
  assert.equal(S.resume({ round: "1", pts: { d0: 99 } }).round, 0);
  const repaired = S.resume({ round: 1, pts: { d0: "25", bad: Infinity }, teamPts: [], driverCodes: [] });
  assert.equal(repaired.pts.d0, 25);
  assert.equal(repaired.pts.bad, undefined);
  assert.equal(Object.keys(repaired.teamPts).length, 0);
  assert.equal(Object.keys(repaired.driverCodes).length, 0);
});

test("sprintOrder persists on the season save and restores on resume", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(3));
  assert.deepEqual(season.sprintOrder, ["d0", "d1", "d2"], "award writes sprintOrder onto the save");
  assert.ok(S.grid(field(3), season), "live module state grids the GP");
  // Simulate a reload: wipe module state by blanking via an out-of-range resume,
  // then restore the mid-weekend save.
  S.resume({ round: 99 });
  assert.equal(S.grid(field(3), season), null, "module state alone is gone after a blanking resume");
  const back = S.resume(season);
  assert.equal(back.stage, "race");
  assert.deepEqual(back.sprintOrder, ["d0", "d1", "d2"]);
  assert.ok(S.grid(field(3), back), "restored sprintOrder rebuilds the GP grid");
  S.award(back, field(3));
  assert.equal(back.sprintOrder, undefined, "GP score clears the persisted order");
  assert.equal(S.grid(field(3), back), null, "…and the module state");
});

test("resume keeps a mid-weekend stage, so a reload cannot re-pay a sprint", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const back = S.resume({ round: 0, stage: "race", pts: { d0: 8 }, teamPts: {}, driverCodes: {} });
  assert.equal(back.stage, "race");
  assert.equal(S.stage(back), "race", "the Grand Prix is still what is owed");
});

test("STANDINGS is offered as soon as a sprint has paid, not only after a round", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  assert.equal(S.hasProgress(null), false);
  assert.equal(S.hasProgress({ round: 0 }), false);
  assert.equal(S.hasProgress({ round: 0, stage: "race" }), true);
  assert.equal(S.hasProgress({ round: 3 }), true);
});

// ── presets ───────────────────────────────────────────────────────────────────

test("presets slice the championship, and CLASSICS is the retired list", () => {
  const { S, tracks } = load();
  assert.equal(S.presetIds("full").length, tracks.SEASON.length);
  assert.equal(S.presetIds("5").length, 5);
  assert.deepEqual(S.presetIds("classics"), tracks.LIST.filter((t) => t.classic).map((t) => t.id));
  assert.equal(S.presetIds("999").length, tracks.SEASON.length, "a preset cannot invent circuits");
});

test("shuffled returns a permutation and leaves its input alone", () => {
  const { S } = load();
  const ids = S.presetIds("full");
  const before = ids.slice();
  const out = S.shuffled(ids);
  assert.deepEqual(ids, before, "the caller's array is not the working copy");
  assert.deepEqual(out.slice().sort(), before.slice().sort());
});

test("shuffled is deterministic when given an explicit seed", () => {
  const { S } = load();
  const ids = S.presetIds("full");
  const run1 = S.shuffled(ids, 42);
  const run2 = S.shuffled(ids, 42);
  const run3 = S.shuffled(ids, 99);
  assert.deepEqual(run1, run2, "identical seeds must produce identical permutations");
  assert.notDeepEqual(run1, run3, "different seeds should produce different permutations");
});

test("equal points fall to countback, not to who scored first", () => {
  const { S } = load({ seasonCfg: { sprint: false } });
  S.engage("season");
  const season = S.blank();
  // Round 1: d0 wins, d1 second. Round 2: d1 wins, d0 second. Round 3: d2 wins,
  // d1 third, d0 fourth — so d0 and d1 each hold one win and one second, and the
  // third round is what separates them.
  S.award(season, field(4));                                   // d0 d1 d2 d3
  S.award(season, [field(4)[1], field(4)[0], field(4)[2], field(4)[3]]);   // d1 d0 d2 d3
  S.award(season, [field(4)[2], field(4)[3], field(4)[1], field(4)[0]]);   // d2 d3 d1 d0
  assert.equal(season.pts.d0, 25 + 18 + 12);
  assert.equal(season.pts.d1, 18 + 25 + 15);
  // Array.from, not .map: the histogram is sparse and .map skips holes.
  assert.equal(JSON.stringify(Array.from(season.finishes.d0, (v) => v || 0)), "[1,1,0,1]");
  const order = Object.keys(season.pts).sort((a, b) => S.rank(season, a, b));
  assert.equal(order[0], "d1", "d1 58 pts beats d0 55 on points");
  // Now force a dead heat on points and let countback decide: one win and one
  // second each, then d1's third beats d0's fourth.
  season.pts.d0 = season.pts.d1;
  assert.equal(S.rank(season, "d0", "d1"), 1, "equal points: d1's 1-1-1 beats d0's 1-1-0-1 on the third place");
  assert.equal(S.rank(season, "d1", "d0"), -1, "and the comparison is antisymmetric");
  const tied = Object.keys(season.pts).filter((k) => k === "d0" || k === "d1").sort((a, b) => S.rank(season, a, b));
  assert.equal(tied.join(","), "d1,d0", "insertion order (d0 first) no longer decides");
  // A retired classification records no finish; a sprint records none either.
  const s2 = S.blank();
  S.award(s2, field(2, [1]));
  assert.equal(s2.finishes.d1, undefined, "a DNF is not a finish");
});

test("a saved season without finishes normalises to an empty map", () => {
  const { S } = load();
  S.engage("season");
  if (typeof S.resume === "function") {
    const season = S.resume({ round: 1, pts: { d0: 25 }, teamPts: { t0: 25 }, driverCodes: { d0: "D0" } });
    // (Object.keys, not deepEqual: the season object comes from the VM realm and
    // strict deepEqual compares prototypes across realms.)
    if (season) assert.equal(Object.keys(season.finishes).length, 0, "finishes present and empty on a pre-countback save");
  }
  assert.equal(S.rank({ pts: { a: 1, b: 1 } }, "a", "b"), -1, "no finishes at all: the id breaks the tie, stably");
  assert.equal(S.rank({ pts: { a: 1, b: 1 } }, "b", "a"), 1);
});
