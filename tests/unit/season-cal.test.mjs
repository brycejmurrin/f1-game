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
import { createRequire } from "node:module";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

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
function load(stored0, tracks0) {
  const stored = new Map(Object.entries(stored0 || {}));
  const subscribers = [];
  const revisions = new Map();
  let clearRevision = 0;
  const tracks = tracks0 || trackDefs();
  const notify = (change) => subscribers.forEach((fn) => fn(change));
  const bump = (key) => revisions.set(key, (revisions.get(key) || 0) + 1);
  const write = (k, v) => {
    stored.set(k, v);
    bump(k);
    notify({ key: k, local: true, durable: true });
    return { ok: true, durable: true, reason: null };
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Set, Map, isNaN, isFinite, parseInt, console,
    GameStore: {
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => write(k, v).durable,
        write,
        keyRevision: (k) => clearRevision + ":" + (revisions.get(k) || 0),
        subscribe: (fn) => { subscribers.push(fn); return () => {}; },
      },
    },
    Tracks: tracks,
    Teams: { POINTS },
  });
  seedLog(ctx);
  seedSaveMigrate(ctx);   // season-cal delegates roundMap/finishMap to SaveMigrate
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx);
  return {
    S: vm.runInContext("SeasonCal", ctx), stored, tracks,
    writes: (key) => revisions.get(key) || 0,   // how many times `key` was written (bumps count too)
    foreign: (key) => {
      if (key == null) clearRevision++;
      else bump(key);
      notify({ key, foreign: true, clear: key == null });
    },
  };
}

// A classified field, finishing in the order given. Points / finishes / FL need
// `finished` (BUGS.md B4); retired cars stay at 0 even if they crossed the line.
function field(n, retired) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const isRet = !!(retired || []).includes(i);
    out.push({
      driverId: "d" + i, code: "D" + i, team: { id: "t" + i },
      finished: !isRet, retired: isRet,
    });
  }
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

test("an active season keeps its saved rules when seasonCfg changes elsewhere", () => {
  const { S, stored, foreign } = load({
    seasonCfg: { trackIds: ["kyalami"], points: "modern", sprint: false },
    season: {
      round: 0, pts: {}, teamPts: {}, driverCodes: {},
      config: { trackIds: ["monza"], points: "classic", sprint: true, laps: 10 },
    },
  });
  S.engage("season");
  const season = S.load();
  assert.equal(S.track(0).id, "monza");
  assert.deepEqual(S.pointsTable(), S.CLASSIC_POINTS);
  assert.equal(S.sprintOn(), true);
  assert.equal(Object.isFrozen(season.config), true);
  assert.equal(Object.isFrozen(season.config.trackIds), true);

  stored.set("seasonCfg", { trackIds: ["suzuka"], points: "modern", sprint: false });
  foreign("seasonCfg");
  assert.equal(S.track(0).id, "monza", "the in-progress calendar is a save property");
  assert.deepEqual(S.pointsTable(), S.CLASSIC_POINTS, "scoring cannot change under banked points");
  assert.equal(S.sprintOn(), true);
});

test("load migrates a legacy season by snapshotting and persisting its current config", () => {
  const { S, stored } = load({
    seasonCfg: { trackIds: ["monza", "monaco"], points: "classic", drop: 2 },
    season: { round: 1, pts: { d0: 10 }, teamPts: {}, driverCodes: {} },
  });
  S.engage("season");
  const season = S.load();
  assert.deepEqual(Array.from(season.config.trackIds), ["monza", "monaco"]);
  assert.equal(season.config.points, "classic");
  assert.equal(season.config.drop, 2);
  assert.equal(stored.get("season").config, season.config,
    "the one-time migration is durable, not repeated on every reload");
});

test("a foreign season save conflicts before standings mutate or stale data writes", () => {
  const { S, stored, foreign } = load({
    seasonCfg: { trackIds: ["monza", "monaco"] },
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} },
  });
  S.engage("season");
  const local = S.load();
  const winner = { round: 1, pts: { d0: 25 }, teamPts: { t0: 25 }, driverCodes: { d0: "D0" }, config: local.config };
  stored.set("season", winner);
  foreign("season");

  assert.equal(S.conflicted(), true);
  assert.equal(S.award(local, field(2)), null);
  assert.equal(local.round, 0, "a result that cannot be saved must not enter RAM");
  assert.equal(S.save(local).reason, "conflict");
  assert.equal(S.clear().reason, "conflict", "finishing locally cannot delete the other tab's winner");
  assert.equal(stored.get("season"), winner);
});

test("a refused award clears last round's fastest-lap recipient, so the sheet paints no stale +FL", () => {
  // award() returned on the save conflict BEFORE `delete season.lastFl`, and the
  // results sheet still showed +FL (+1 pt) for last round's holder (bug hunt 2026-10-05 G9).
  const { S, stored, foreign } = load({
    seasonCfg: { trackIds: ["monza", "monaco"], flPoint: true },
    season: { round: 1, pts: { d0: 26 }, teamPts: {}, driverCodes: {}, lastFl: "d0" },
  });
  S.engage("season");
  const local = S.load();
  assert.equal(local.lastFl, "d0", "precondition: last round's recipient is on the season");
  stored.set("season", { round: 2, pts: {}, teamPts: {}, driverCodes: {}, config: local.config });
  foreign("season");
  assert.equal(S.award(local, field(2), "d0"), null, "the conflict refuses the award");
  assert.equal(local.lastFl, undefined, "…and no +FL survives it");
  assert.equal(local.pts.d0, 26, "standings untouched");
});

test("setup apply refuses a foreign season before changing active rules", () => {
  const { S, stored, foreign } = load({ seasonCfg: { trackIds: ["monza"], points: "modern" },
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} } });
  S.engage("season");
  const local = S.load();
  const winner = { round: 1, pts: { d0: 25 }, teamPts: {}, driverCodes: {}, config: local.config };
  stored.set("season", winner); foreign("season");
  const result = S.applyConfig({ trackIds: ["kyalami"], points: "classic" });
  assert.equal(result.reason, "conflict");
  assert.equal(result.season, null);
  assert.equal(S.track(0).id, "monza");
  assert.equal(stored.get("season"), winner);
  assert.equal(stored.get("seasonCfg").points, "modern");
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

test("a sprint weekend qualifies TWICE: SPRINT QUALIFYING, then again for the GP (FIA 2026 SR B2.2.1)", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = S.blank();
  assert.equal(S.qualiNext(season), true, "the weekend opens with sprint qualifying");
  assert.equal(S.qualiLabel(season), "SPRINT QUALIFYING");
  season.qualiOrder = [{ id: "d0", t: 80 }]; season.qualiTrack = "bahrain"; season.qualiMode = "season";   // what quali-model persists
  S.award(season, field(4));
  assert.equal(season.qualiOrder, undefined, "the sprint spends its session: the GP cannot grid off it");
  assert.equal(season.qualiTrack, undefined);
  assert.equal(season.qualiMode, undefined, "S7: the mode stamp goes with the order it described");
  assert.equal(S.qualiNext(season), true, "...so the Grand Prix qualifies again");
  assert.equal(S.qualiLabel(season), "QUALIFYING");
  S.award(season, field(4));
  assert.equal(S.qualiNext(season), true, "the next weekend qualifies again");
  assert.equal(S.qualiLabel(season), "SPRINT QUALIFYING");
});

test("a season with qualifying off never qualifies, sprint or not; outside a season the label is plain", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const season = S.blank();
  assert.equal(S.qualiNext(season), false);
  S.award(season, field(3));
  assert.equal(S.qualiNext(season), false, "the GP leg does not qualify either");
  S.engage("gp");
  assert.equal(S.qualiLabel(season), "QUALIFYING", "outside a season there is no sprint session");
});

test("a retirement scores nothing while the cars above keep their points", () => {
  const { S } = load();
  S.engage("season");
  const season = S.blank();
  S.award(season, field(4, [1]));
  assert.equal(season.pts.d0, 25);
  assert.equal(season.pts.d1, 0, "retired P2 scores nothing");
  assert.equal(season.pts.d2, 15, "P3 still earns what P3 earns");
});

test("cars still running at the flag are classified by position, and may take the FL point", () => {
  // endRace ends the session 2.2 s after the human finishes and orders the
  // still-running cars by progress, so they are classified, as the results
  // sheet shows. The fastest-lap point follows: requiring c.finished paid it
  // only to cars within ~2.2 s of the player.
  const { S } = load({ seasonCfg: { flPoint: true } });
  S.engage("season");
  const season = S.blank();
  const cars = field(4);
  cars[1].finished = false;   // still running when the session ends
  cars[2].finished = false;
  S.award(season, cars, "d1");
  assert.equal(season.pts.d0, 25);
  assert.equal(season.pts.d1, 19, "a running car scores its classified position, plus the FL point");
  assert.equal(season.pts.d2, 15);
  assert.equal(season.pts.d3, 12);
  assert.equal(season.lastFl, "d1", "a car running at the flag earns the FL point");
  assert.equal(season.finishes.d1[1], 1, "countback counts the classified position");
  assert.equal(season.finishes.d0[0], 1);
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

test("a no-qualifying sprint weekend no longer grids the GP off the sprint result", () => {
  // The grid is the championship order now (js/race/sporting-regs.js champOrder,
  // FIA 2026 SR B2.5.4(a)); the sprint result is not written for it any more.
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const season = S.blank();
  const sprintResult = field(3);
  S.award(season, [sprintResult[2], sprintResult[0], sprintResult[1]]);
  assert.equal(season.stage, "race");
  assert.equal(season.sprintOrder, undefined, "no sprint grid is persisted");
  assert.equal(S.grid, undefined, "the sprint-result grid is gone from the API");
  assert.equal(season.pts.d2, 8, "...and the sprint's points (which the championship grid reads) are paid");
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

test("an OLD mid-weekend save (sprint result as the GP grid) still loads, and its sprintOrder is dropped", () => {
  const { S } = load({ seasonCfg: { sprint: true, quali: false } });
  S.engage("season");
  const old = { round: 0, stage: "race", sprintOrder: ["d2", "d0", "d1"], pts: { d2: 8, d0: 7, d1: 6 },
    teamPts: {}, driverCodes: {} };
  const back = S.resume(old);
  assert.equal(back.stage, "race", "the Grand Prix is still what is owed");
  assert.equal(S.stage(back), "race");
  assert.equal(back.sprintOrder, undefined, "the legacy grid field is dropped, nothing reads it");
  assert.equal(back.pts.d2, 8, "...and the sprint's points stand");
  S.award(back, field(3));
  assert.equal(back.round, 1, "the weekend closes normally");
});

test("an OLD mid-weekend save that qualified once keeps its order for the GP (no forced re-quali)", () => {
  // quali-model restores season.qualiOrder; resume must not strip it, or an
  // old weekend would silently lose the grid it already qualified for.
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const back = S.resume({ round: 0, stage: "race", qualiOrder: [{ id: "d0", t: 80 }], qualiTrack: "bahrain",
    pts: { d0: 8 }, teamPts: {}, driverCodes: {} });
  assert.equal(back.qualiOrder.length, 1);
  assert.equal(back.qualiTrack, "bahrain");
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

// ── scoring variants: the fastest-lap point and dropped scores ────────────────

test("the fastest-lap point pays +1 to a top-ten finisher only, and never on a sprint", () => {
  const { S } = load({ seasonCfg: { flPoint: true } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(12), "d11");                 // P12 set the fastest lap: nothing
  assert.equal(season.pts.d11 || 0, 0);
  assert.equal(season.lastFl, undefined, "no recipient this round");
  S.award(season, field(12), "d3");                  // P4 again: 12 + 12 + 1
  assert.equal(season.pts.d3, 12 + 12 + 1);
  assert.equal(season.teamPts.t3, 12 + 12 + 1, "the constructor gets it too");
  assert.equal(season.lastFl, "d3");
  assert.equal(season.pts.d0, 25 + 25, "the winner's points are untouched");

  const sp = load({ seasonCfg: { flPoint: true, sprint: true } });
  sp.S.engage("season");
  const wk = sp.S.blank();
  sp.S.award(wk, field(4), "d0");                    // the sprint leg pays no FL point
  assert.equal(wk.pts.d0, 8);
  assert.equal(wk.lastFl, undefined);
  sp.S.award(wk, field(4), "d0");                    // the Grand Prix leg does
  assert.equal(wk.pts.d0, 8 + 25 + 1);
});

test("a retired fastest-lap setter earns nothing, and a career never pays the point", () => {
  const { S } = load({ seasonCfg: { flPoint: true } });
  S.engage("season");
  const season = S.blank();
  S.award(season, field(3, [0]), "d0");
  assert.equal(season.pts.d0 || 0, 0);
  assert.equal(season.lastFl, undefined);
  S.engage("career");
  const c = S.blank();
  S.award(c, field(3), "d0");
  assert.equal(c.pts.d0, 25, "career pays the plain table whatever the season format says");
});

test("a race nobody took the flag in pays the shortened-race scale by the leader's laps (FIA SR Art. 6.5/6.6)", () => {
  // The only human retiring ends the session 2.2 s later (RaceControl.finishDelay):
  // the AI field was paid the FULL table from a lap-1 snapshot (bug hunt 2026-10-05 G1).
  const { S } = load({ seasonCfg: { flPoint: true } });
  S.engage("season");
  const pay = (laps, of, fl) => { const s = S.blank(); S.award(s, field(11), fl, laps == null ? null : { laps, of }); return s; };
  assert.equal(pay(1, 10).pts.d0 || 0, 0, "under two laps: no points");
  assert.deepEqual([0, 4, 5].map((i) => pay(2, 10).pts["d" + i] || 0), [6, 1, 0], "2 laps to 25 %: column 1, top five");
  assert.deepEqual([0, 8, 9].map((i) => pay(4, 10).pts["d" + i] || 0), [13, 1, 0], "25-50 %: column 2, top nine");
  assert.deepEqual([0, 3, 9].map((i) => pay(5, 10).pts["d" + i] || 0), [19, 10, 1], "50-75 %: column 3");
  assert.equal(pay(8, 10).pts.d0, 25, "75 % or more: the full table");
  assert.equal(pay(null).pts.d0, 25, "a race that saw the flag is never shortened");
  assert.equal(pay(4, 10, "d0").lastFl, undefined, "no fastest-lap point below 50 %");
  assert.equal(pay(5, 10, "d0").pts.d0, 19 + 1, "the point is back from 50 %");
  assert.deepEqual(Array.from(S.payTable(S.SPRINT_POINTS, "sprint", { laps: 2, of: 5 })), [], "a sprint pays nothing below 50 %");
  assert.equal(S.payTable(S.SPRINT_POINTS, "sprint", { laps: 3, of: 5 }), S.SPRINT_POINTS, "and the full sprint table from 50 %");
  assert.deepEqual(Array.from(S.payTable(S.CLASSIC_POINTS, "race", { laps: 5, of: 10 })), [5, 3, 2, 1.5, 1, 0.5], "the classic table pays half below 75 %");
});

test("roundLaps: NEXT ROUND's distance is the format's laps clamped to the circuit's FULL; a sprint weekend's GP keeps its own", () => {
  const { S } = load({ seasonCfg: { laps: 57 } });
  S.engage("season");
  const season = S.blank();
  assert.equal(S.roundLaps(57, season, 52), 52, "clamped to a shorter FULL");
  assert.equal(S.roundLaps(52, season, 66), 57, "a value clamped at a short circuit does not stick: back to the format's 57");
  assert.equal(S.roundLaps(57, season, null), 57, "no FULL known: the format distance");
  const sp = load({ seasonCfg: { laps: 57, sprint: true } });
  sp.S.engage("season");
  const wk = sp.S.blank();
  sp.S.award(wk, field(3));                               // the sprint pays; the GP is next, same circuit
  assert.equal(sp.S.roundLaps(25, wk, 66), 25, "mid-weekend: the Grand Prix keeps the weekend's distance");
});

test("DROP WORST 2 ranks on the best rounds — countback and the gross total are both kept", () => {
  const { S } = load({ seasonCfg: { drop: 2 } });        // 8 rounds → the best 6 count
  S.engage("season");
  const season = S.blank();
  const d0 = { driverId: "d0", code: "D0", team: { id: "t0" }, finished: true };
  const d1 = { driverId: "d1", code: "D1", team: { id: "t1" }, finished: true };
  for (let r = 0; r < 6; r++) S.award(season, [d0, d1]);           // d0 25×6, d1 18×6
  assert.equal(S.netPts(season, "d0"), 150, "inside the counting rounds net is gross");
  assert.equal(S.rank(season, "d0", "d1") < 0, true);
  for (let r = 0; r < 2; r++) S.award(season, [d1, { ...d0, retired: true, finished: false }]);   // d1 wins twice, d0 out
  assert.equal(season.pts.d1, 108 + 50, "gross: d1 leads");
  assert.equal(season.pts.d0, 150);
  assert.equal(S.netPts(season, "d1"), 25 + 25 + 18 * 4, "d1's two 18s drop");
  assert.equal(S.netPts(season, "d0"), 150, "d0's two zeros drop");
  assert.equal(S.rank(season, "d0", "d1") < 0, true, "d0 leads on counting points");
  assert.deepEqual(JSON.parse(JSON.stringify(season.roundPts.d0)), [25, 25, 25, 25, 25, 25, 0, 0]);   // VM realm: compare plain data
});

test("an old save without roundPts normalises to {} and a bad lastFl is dropped", () => {
  const { S } = load({ seasonCfg: { drop: 3 } });
  S.engage("season");
  const s = S.resume({ round: 1, pts: { d0: 25 }, lastFl: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(s.roundPts)), {});
  assert.equal(s.lastFl, undefined);
  assert.equal(S.netPts(s, "d0"), 25, "no per-round record: the gross total stands");
  const c = S.normalize({ flPoint: "yes", drop: 7 });
  assert.equal(c.flPoint, false, "only an explicit true turns the fastest-lap point on");
  assert.equal(c.drop, 0, "an unknown drop count falls back to all rounds counting");
});

// ── 2026 REAL: the calendar as raced, with per-round sprints ─────────────────

// The REAL circuit roster, read from the circuit files themselves (id +
// classic flag), in CIRCUITS / LAZY_CIRCUIT order — so "every id exists" is
// checked against what ships, not against the eight-circuit stub above.
// Title boots GENERATED js/track/circuit-meta.js; full defs are tagless
// (LAZY_CIRCUIT), so reading index.html script tags no longer finds them.
function realTracks() {
  const MANIFEST = createRequire(import.meta.url)(join(ROOT, "tools/manifest.cjs"));
  const files = MANIFEST.LAZY_CIRCUIT || MANIFEST.CIRCUITS.map(MANIFEST.circuitPath);
  const LIST = files.map((f) => {
    const s = readFileSync(join(ROOT, f), "utf8");
    return { id: /\bid:\s*"([^"]+)"/.exec(s)[1], name: f, classic: /\bclassic:\s*true/.test(s) };
  });
  return { LIST, SEASON: LIST.filter((t) => !t.classic) };
}
const REAL_ORDER = ["albert_park", "shanghai", "suzuka", "miami", "montreal", "monaco", "catalunya",
  "redbull", "silverstone", "spa", "hungaroring", "zandvoort", "monza", "madrid", "baku", "sepang",
  "singapore", "cota", "mexico", "interlagos", "vegas", "qatar", "abudhabi"];
const REAL_SPRINTS = ["shanghai", "miami", "montreal", "silverstone", "zandvoort", "singapore"];

test("2026 REAL: every round is a shipped circuit, in calendar order, 23 rounds", () => {
  const tracks = realTracks();
  assert.ok(tracks.LIST.length > 40, "precondition: the circuit tags were found");
  const { S } = load(null, tracks);
  const ids = S.presetIds("real2026");
  assert.deepEqual([...ids], REAL_ORDER);
  for (const id of ids) assert.ok(tracks.LIST.some((t) => t.id === id), id + " is in Tracks.LIST");
  for (const gone of ["bahrain", "jeddah", "istanbul", "portimao"]) assert.ok(!ids.includes(gone), gone + " is not a 2026 round");
  // Dates ascend (Baku and Vegas race on a Saturday; `to` is the last day).
  const days = S.REAL_2026.map((r) => r.to);
  assert.deepEqual([...days], [...days].sort(), "rounds are in date order");
  assert.equal(S.REAL_2026.find((r) => r.id === "sepang").to, "2026-10-04", "Bahrain GP at Sepang");
});

test("2026 REAL: exactly the six real sprint weekends, per round", () => {
  const { S } = load(null, realTracks());
  const p = S.preset("real2026");
  assert.equal(p.sprint, "rounds");
  assert.deepEqual([...p.sprintIds], REAL_SPRINTS);
  S.setConfig(p);
  S.engage("season");
  const season = S.restart();
  const sprinted = [];
  for (let r = 0; r < S.rounds(); r++) {
    season.round = r;
    delete season.stage;
    if (S.stage(season) === "sprint") sprinted.push(S.track(r).id);
  }
  assert.deepEqual(sprinted, REAL_SPRINTS);
  season.round = 0;
  assert.equal(S.stage(season), "race", "Australia is a plain Grand Prix");
  // China sprints, then its Grand Prix closes the round; Japan does not sprint.
  season.round = 1;
  assert.equal(S.stage(season), "sprint");
  assert.equal(S.award(season, field(10)), "sprint");
  assert.equal(S.midWeekend(season), true);
  assert.equal(S.award(season, field(10)), "race");
  assert.equal(season.round, 2);
  assert.equal(S.stage(season), "race", "Japan is a plain Grand Prix");
  // Outside a season the format is neutral whatever the config says.
  S.engage("gp");
  season.round = 1;
  assert.equal(S.stage(season), "race");
});

test("2026 REAL leaves the other presets and old configs exactly as they were", () => {
  const { S, tracks } = load();
  assert.deepEqual([...S.PRESETS.map((p) => p.id)], ["full", "real2026", "12", "8", "5", "classics"]);
  assert.deepEqual(JSON.parse(JSON.stringify(S.preset("full"))), { trackIds: tracks.SEASON.map((t) => t.id) },
    "a calendar preset sets no format");
  assert.deepEqual([...S.preset("8").trackIds], tracks.SEASON.map((t) => t.id).slice(0, 8));
  // An old boolean config normalises to what it meant, with no sprint rounds.
  const on = S.normalize({ trackIds: ["monza"], sprint: true });
  assert.equal(on.sprint, true);
  assert.deepEqual([...on.sprintIds], []);
  assert.equal(S.normalize({ sprint: false }).sprint, false);
  const mixed = S.normalize({ sprint: "rounds", sprintIds: ["monza", "nowhere", "monza", 7] });
  assert.equal(mixed.sprint, "rounds");
  assert.deepEqual([...mixed.sprintIds], ["monza"]);
  // A global sprint still sprints every round.
  S.setConfig({ sprint: true });
  S.engage("season");
  const season = S.restart();
  season.round = 5;
  assert.equal(S.stage(season), "sprint");
  // "rounds" with no marked rounds is simply no sprints.
  const { S: S2 } = load({ seasonCfg: { sprint: "rounds" } });
  S2.engage("season");
  assert.equal(S2.stage(S2.restart()), "race");
});

test("2026 REAL survives a save/load round-trip, sprint rounds and all", () => {
  const tracks = realTracks();
  const { S, stored } = load(null, tracks);
  S.engage("season");
  const res = S.applyConfig(S.preset("real2026"));
  assert.equal(res.ok, true);
  const saved = JSON.parse(JSON.stringify(stored.get("season")));
  const cfg = JSON.parse(JSON.stringify(stored.get("seasonCfg")));
  assert.equal(saved.config.sprint, "rounds");
  assert.deepEqual(saved.config.sprintIds, REAL_SPRINTS);
  assert.deepEqual(cfg.trackIds, REAL_ORDER);
  // A fresh module over the same storage resumes the same season rules.
  const { S: T } = load({ season: saved, seasonCfg: cfg }, tracks);
  T.engage("season");
  const s = T.load();
  assert.equal(T.rounds(), 23);
  s.round = 11;
  assert.equal(T.track(11).id, "zandvoort");
  assert.equal(T.stage(s), "sprint");
  assert.ok(Object.isFrozen(s.config.sprintIds), "the frozen season rules include the sprint rounds");
});

test("the 2026 REAL calendar names its rounds as raced: Bahrain GP at Sepang, Barcelona-Catalunya GP", () => {
  const tracks = realTracks();
  const { S } = load(null, tracks);
  S.engage("season");
  assert.equal(S.applyConfig(S.preset("real2026")).ok, true);
  const byId = (id) => tracks.LIST.find((t) => t.id === id);
  assert.equal(S.gpName(byId("sepang")), "Bahrain GP");
  assert.equal(S.gpName(byId("catalunya")), "Barcelona-Catalunya GP");
  assert.equal(S.gpName(byId("madrid")), byId("madrid").gp || "", "the Spanish GP is Madrid's");
  assert.equal(S.gpName(byId("monza")), byId("monza").gp || "", "every other round keeps its circuit's name");
  // An edited calendar is no longer 2026 as raced: the circuit's own name again.
  assert.equal(S.applyConfig(S.preset("full")).ok, true);
  assert.equal(S.gpName(byId("sepang")), byId("sepang").gp || "");
});

// ── bug hunt 2026-09-29: persistence ──────────────────────────────────────────

test("a tab that left the championship cannot write its stale season over another tab's newer rounds", () => {
  // The foreign-write branch for flow "gp" nulled seasonRevision, switching off
  // save()'s guard: a GP's qualifying (persistSeason) or retrySave then wrote
  // this tab's old season object over the other tab's progress.
  const { S, stored, foreign } = load({
    seasonCfg: { trackIds: ["monza", "monaco"] },
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} },
  });
  S.engage("season");
  const local = S.load();
  S.engage("gp");                                   // back to the title / a one-off GP
  const winner = { round: 1, pts: { d0: 25 }, teamPts: { t0: 25 }, driverCodes: { d0: "D0" }, config: local.config };
  stored.set("season", winner);
  foreign("season");
  assert.equal(S.save(local).reason, "conflict", "the stale object is refused");
  assert.equal(stored.get("season"), winner, "the other tab's rounds survive");
  S.engage("season");
  assert.equal(S.load().round, 1, "re-entering the championship reads the newer season");
});

test("load() never persists a season this build could not read whole (an unknown circuit id)", () => {
  // A stale cached shell or a renamed circuit: normalize drops the id, the
  // calendar shrinks, and writing that back erased the circuit for good — or
  // blanked a finished season whose round now exceeded the shorter calendar.
  const inProgress = { round: 1, pts: { d0: 25 }, teamPts: {}, driverCodes: {}, config: { trackIds: ["monza", "monaco", "nosuch"] } };
  const a = load({ season: inProgress });
  a.S.engage("season");
  a.S.load();
  assert.equal(a.writes("season"), 0, "an in-progress season with an unknown round is not written back");
  // Boot's migrate-and-save (game.js) reads this: it wrote the loss back anyway.
  assert.equal(a.S.lastLoadLossy(), true, "the lossy verdict is readable after load()");
  const finished = { round: 3, pts: { d0: 75 }, teamPts: {}, driverCodes: {}, config: { trackIds: ["monza", "monaco", "nosuch"] } };
  const b = load({ season: finished });
  b.S.engage("season");
  b.S.load();
  assert.equal(b.writes("season"), 0, "a finished season is not blanked on disk");
  assert.equal(b.stored.get("season").pts.d0, 75);
  const whole = load({ season: { round: 1, pts: { d0: 25 }, teamPts: {}, driverCodes: {} } });
  whole.S.engage("season");
  whole.S.load();
  assert.equal(whole.writes("season"), 1, "a season read whole is still migrated and persisted");
  assert.equal(whole.S.lastLoadLossy(), false);
});

test("a season with an unknown circuit races the stored round's circuit and is never saved shrunk", () => {
  // The stored round indexes the FULL calendar. Shrunk to the ids this build
  // knows, round 2 of [monza, nosuch, monaco, imola] pointed at imola (skipping
  // monaco), and endRace's SeasonCal.save wrote the 3-round calendar back.
  const raw = { round: 2, pts: { d0: 25 }, teamPts: {}, driverCodes: {}, config: { trackIds: ["monza", "nosuch", "monaco", "imola"] } };
  const a = load({ season: raw });
  a.S.engage("season");
  const season = a.S.load();
  assert.equal(season.round, 1, "the round is re-read as the known circuits already raced");
  assert.equal(a.S.track(season.round).id, "monaco", "the next round is the circuit the save named");
  const res = a.S.save(season);
  assert.equal(res.ok, false, "a shrunk read is refused, not written back");
  assert.equal(a.writes("season"), 0, "the stored 4-round calendar is never overwritten");
  // A finished season stays finished (not blanked by round > rounds()).
  const done = load({ season: { round: 4, pts: { d0: 100 }, teamPts: {}, driverCodes: {}, config: { trackIds: ["monza", "nosuch", "monaco", "imola"] } } });
  done.S.engage("season");
  const fin = done.S.load();
  assert.equal(fin.round, 3);
  assert.equal(fin.pts.d0, 100);
  // A new season (restart) is a new object and saves normally.
  const fresh = a.S.restart();
  assert.equal(a.S.save(fresh).ok, true);
  // A save read whole keeps its round and saves exactly as before.
  const whole = load({ season: { round: 2, pts: {}, teamPts: {}, driverCodes: {}, config: { trackIds: ["monza", "monaco", "imola"] } } });
  whole.S.engage("season");
  const w = whole.S.load();
  assert.equal(w.round, 2);
  assert.equal(whole.S.save(w).ok, true);
});

test("a calendar shrunk by an unknown circuit keeps roundPts aligned with the remapped round", () => {
  // resume() re-read `round` as the known circuits raced but left roundPts on
  // the stored indexes: netPts (dropped scores) read the wrong rounds, and the
  // next award landed in a slot already used (bug hunt 2026-10-05 G10).
  const raw = { round: 3, pts: { d0: 25 + 1 + 18 }, teamPts: {}, driverCodes: {},
    roundPts: { d0: [25, 1, 18] },   // monza 25, the unknown circuit 1, monaco 18
    config: { trackIds: ["monza", "nosuch", "monaco", "imola"], drop: 2 } };
  const a = load({ season: raw });
  a.S.engage("season");
  const season = a.S.load();
  assert.equal(season.round, 2, "monza and monaco raced");
  assert.deepEqual(Array.from(season.roundPts.d0), [25, 18], "round 0 monza, round 1 monaco; the dropped circuit's round leaves");
  a.S.award(season, field(2));                                     // imola: d0 wins
  assert.deepEqual(Array.from(season.roundPts.d0), [25, 18, 25], "imola lands in its own slot, not on top of monaco's");
});

test("rankTeams: points, then the team's tier, then the id — one order for every constructors' table", () => {
  const { S } = load();
  const season = { teamPts: { b: 10, a: 10, c: 12, z: 10 } };
  assert.deepEqual(["a", "b", "c", "z"].sort((x, y) => S.rankTeams(season, x, y)), ["c", "a", "b", "z"],
    "no tier known: points then id");
  // results-sheet routes both CONSTRUCTORS tables through teamOrder → rankTeams
  // (not a bare Object.entries sort); career.teamStandings still ranks by id.
  const results = readFileSync(join(ROOT, "js/ui/results-sheet.js"), "utf8");
  assert.match(results, /function teamOrder\(season\)/);
  assert.match(results, /teamOrder\(season\)\.slice\(0, 5\)/, "results CONSTRUCTORS uses teamOrder");
  assert.match(results, /^\s*const tmList = teamOrder\(season\);/m, "standings CONSTRUCTORS uses teamOrder");
  assert.match(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), /SeasonCal\.rankTeams\(career\.season, a\.id, b\.id\)/);
});

test("boot's migrate-and-save never writes back a season load() refused (game.js)", () => {
  const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.match(game, /season = GameStore\.migrateSeasonPoints\(season\); if \(!SeasonCal\.lastLoadLossy\(\)\) SeasonCal\.save\(season, \{ migration: true \}\);/);
});

test("mid-weekend reads the season's own config: the title menu (flow gp) still says AFTER THE SPRINT", () => {
  const { S } = load({ seasonCfg: { sprint: true } });
  S.engage("season");
  const season = S.blank();
  assert.equal(S.award(season, field(10)), "sprint");
  assert.equal(S.midWeekend(season), true);
  S.engage("gp");   // quitToMenu / boot: STANDINGS opens from the title in flow gp
  assert.equal(S.midWeekend(season), true, "a sprint scored, the Grand Prix not yet run");
  season.stage = "sprint";
  assert.equal(S.midWeekend(season), false);
});

test("title-menu STANDINGS ranks on counting points: the season's own drop rule applies outside season flow", () => {
  // mb-standings runs in flow "gp" (after quitToMenu or boot), where the live
  // rules are the one-off's: netPts fell back to GROSS points and showed a
  // driver ahead on counting points behind.
  const { S } = load({ seasonCfg: { drop: 2 } });
  S.engage("season");
  const season = S.blank();
  const d0 = { driverId: "d0", code: "D0", team: { id: "t0" }, finished: true };
  const d1 = { driverId: "d1", code: "D1", team: { id: "t1" }, finished: true };
  for (let r = 0; r < 6; r++) S.award(season, [d0, d1]);
  for (let r = 0; r < 2; r++) S.award(season, [d1, { ...d0, retired: true, finished: false }]);
  S.engage("gp");
  assert.equal(S.netPts(season, "d1"), 25 + 25 + 18 * 4, "d1's two 18s still drop");
  assert.equal(S.rank(season, "d0", "d1") < 0, true, "d0 still leads on counting points");
});

// review-race-career-data #9: the results sheet sorted constructors by points
// alone (insertion order on a tie) and Career.teamStandings by points then
// tier, so two screens could name different P5s. One comparator now,
// SeasonCal.rankTeams: points, then the team's countback, then tier, then id.
test("constructors rank by points, then the team's countback, then tier, then id — one rule everywhere", () => {
  const { S } = load();
  const season = {
    teamPts: { ferrari: 30, haas: 30, alpine: 30, williams: 0, audi: 0 },
    // "team:seat" ids: haas's two cars hold a win; ferrari two seconds; alpine one second.
    finishes: { "haas:1": [1], "ferrari:0": [0, 1], "ferrari:1": [0, 1], "alpine:0": [0, 1], "williams:0": [0, 0, 0, 1] },
  };
  const order = ["alpine", "audi", "ferrari", "williams", "haas"].sort((a, b) => S.rankTeams(season, a, b));
  assert.equal(order.join(","), "haas,ferrari,alpine,williams,audi",
    "a win beats two seconds; two seconds beat one; any finish beats none; then the id");
  assert.equal(S.rankTeams(season, "haas", "haas"), 0);
  assert.equal(["b", "a"].sort((x, y) => S.rankTeams({ teamPts: { b: 5, a: 5 } }, x, y)).join(","), "a,b", "no finishes, no tiers: the id, stably");
  // Both tables that print constructors use it.
  const sheet = readFileSync(join(ROOT, "js/ui/results-sheet.js"), "utf8");
  assert.doesNotMatch(sheet, /Object\.entries\(season\.teamPts\)/, "no private constructors sort left in the results sheet");
  assert.match(sheet, /SeasonCal\.rankTeams\(/);
  const career = readFileSync(join(ROOT, "js/career/career.js"), "utf8");
  const ts = career.slice(career.indexOf("function teamStandings"), career.indexOf("function expectedConstructor"));
  assert.match(ts, /SeasonCal\.rankTeams\(/);
});

// review-race-career-data #10: outside a career the luck seed was the SESSION's
// (fresh per page load), so reloading re-rolled a planned retirement and the
// qualifying draw. A standalone season now stamps and saves its own.
test("a standalone season stamps its own luck seed once, saves it, and a reload keeps it", () => {
  const { S, stored } = load();
  S.engage("season");
  const season = S.restart();
  assert.equal(season.seed, undefined, "nothing stamped before the first draw");
  assert.equal(S.luckSeed(season, 1234), 1234, "the first stamp of a page load IS the session seed");
  assert.equal(S.luckSeed(season, 999), 1234, "later draws read the stamp, whatever the session seed now is");
  assert.equal(stored.get("season").seed, 1234, "saved with the season at once — not at the next award");
  // A reload: a fresh module over the same disk, a different session seed.
  const again = load(Object.fromEntries(stored));
  again.S.engage("season");
  const back = again.S.load();
  assert.equal(again.S.luckSeed(back, 777), 1234, "the reload replays the same luck");
  // A NEW championship in the same page load is not the last one's luck again.
  const next = S.restart();
  const n = S.luckSeed(next, 1234);
  assert.notEqual(n, 1234);
  assert.ok(Number.isInteger(n) && n > 0);
  // Junk on disk is dropped, then stamped fresh.
  const junk = load({ season: { round: 0, pts: {}, teamPts: {}, driverCodes: {}, seed: -5 } });
  junk.S.engage("season");
  assert.equal(junk.S.load().seed, undefined);
  // game.js and quali-model route every (seed, round, driver) draw through it.
  const game = readFileSync(join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /const luckSeed = \(\) =>[^\n]*SeasonCal\.luckSeed\(season, simSeed\(\)\)/);
  assert.equal((game.match(/Career\.seasonSeed\(\)/g) || []).length, 1, "one career-or-season seed site in game.js");
  assert.match(readFileSync(join(ROOT, "js/race/quali-model.js"), "utf8"), /SeasonCal\.luckSeed\(G\.season, G\.simSeed\(\)\)/);
});

// UI-02 (hunt2): the champion banner and the results sheet's DRIVERS list
// ranked G.cars — this race's grid — while points are keyed by SEAT. A Season
// raced partly as MY TEAM (custom:0) then switched to McLaren kept custom:0's
// points in season.pts, off the grid: the banner crowned NOR while STANDINGS
// (season.pts) showed the custom seat P1. Both now rank the season table.
test("the champion is the season.pts leader even when that seat is no longer on the grid", () => {
  const { S } = load();
  S.engage("season");
  const season = S.blank();
  Object.assign(season, { round: 3, pts: { "custom:0": 60, "mclaren:0": 40, "ferrari:0": 30 }, driverCodes: { "custom:0": "YOU" } });
  const mk = (tag) => ({ tagName: tag, children: [], style: {}, className: "", textContent: "",
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; } });
  const els = { resultsTitle: mk("h2"), resultsTable: mk("div"), resNext: mk("button") };
  const said = [];
  const G = {
    els, season, soundOn: false, cssCol: () => "#f00", announce: (m) => said.push(m),
    cars: [
      { driverId: "mclaren:0", code: "NOR", name: "Norris", team: { name: "McLaren", color: [1, 0.5, 0] }, isPlayer: true },
      { driverId: "ferrari:0", code: "LEC", name: "Leclerc", team: { name: "Ferrari", color: [1, 0, 0] } },
    ],
  };
  const ctx = vm.createContext({ document: { createElement: mk }, SeasonCal: S, Teams: { LIST: [], POINTS }, GameAudio: {} });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/ui/results-sheet.js"), "utf8") + ";this.GameResults = GameResults;", ctx);
  ctx.GameResults.create(G).buildChampion();
  assert.deepEqual(said, ["YOU IS WORLD CHAMPION!"], "the table leader, not the best car on the final grid");
  const rows = els.resultsTable.children.filter((r) => /res-row/.test(r.className));
  assert.deepEqual(rows.map((r) => r.children[2].textContent), ["YOU", "NOR", "LEC"], "FINAL STANDINGS is every seat that scored");
  assert.deepEqual(rows.map((r) => / you$/.test(r.className)), [false, true, false], "the player's row is marked, as on every other table");
  assert.doesNotMatch(els.resultsTable.children[1].style.cssText, /#aaa/, "the team line reads theme tokens");
  const sheet = readFileSync(join(ROOT, "js/ui/results-sheet.js"), "utf8");
  assert.match(sheet, /const all = seasonTable\(cars, season\)\.slice\(0, 10\);/, "the results DRIVERS list ranks the same table");
});

test("repeated menu loads preserve unknown calendar ids and keep every lossy view unsavable", () => {
  const raw = { round: 2, pts: { d0: 25 }, teamPts: {}, driverCodes: {},
    config: { trackIds: ["monza", "unknown", "monaco", "imola"] } };
  const before = JSON.stringify(raw);
  const { S, stored, writes } = load({ season: raw });
  const bootSeason = S.load();
  S.engage("season");
  const menuSeason = S.load();
  assert.equal(menuSeason.round, 1);
  assert.equal(S.track(menuSeason.round).id, "monaco");
  assert.equal(S.lastLoadLossy(), true);
  assert.equal(JSON.stringify(stored.get("season")), before, "normalization never mutates the raw cache");
  assert.equal(S.save(bootSeason).ok, false, "a retained boot reference cannot save after menu re-entry");
  assert.equal(S.save(menuSeason).ok, false);
  assert.equal(writes("season"), 0);
  assert.equal(S.save(S.restart()).ok, true, "an intentional new season still replaces the old one");
});

test("an all-unknown calendar cannot be saved when its fallback has the same length", () => {
  const raw = { round: 1, pts: { d0: 25 }, config: { trackIds: trackDefs().SEASON.map((t) => "old-" + t.id) } };
  const before = JSON.stringify(raw);
  const { S, stored, writes } = load({ season: raw });
  for (let i = 0; i < 2; i++) {
    const season = S.load();
    assert.equal(S.lastLoadLossy(), true);
    assert.equal(S.save(season).ok, false);
  }
  assert.equal(writes("season"), 0);
  assert.equal(JSON.stringify(stored.get("season")), before);
});


test("an empty saved calendar retains the existing lossy-read protection", () => {
  const raw = { round: 0, pts: { d0: 25 }, config: { trackIds: [] } };
  const { S, stored, writes } = load({ season: raw });
  const season = S.load();
  assert.equal(S.lastLoadLossy(), true);
  assert.equal(S.save(season).ok, false);
  assert.equal(writes("season"), 0);
  assert.equal(stored.get("season").config.trackIds.length, 0);
});
