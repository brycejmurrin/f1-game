/* career-settle.test.mjs — settleRound()'s sponsor "double" fact, in a VM.
 *
 * career.js is pure rules with no DOM, so like race-control.test.mjs it loads
 * whole into a VM with stub GameStore / Teams / Parts and the round is settled
 * directly. The rule under test: a "double" is BOTH cars home in the points,
 * and a car that RETIRED scores nothing even when enough of the field DNFs for
 * its classified position to land inside the top ten. The base code read the
 * mate's position alone (`Teams.POINTS[order.indexOf(mate)]`), so a retired
 * mate classified P5 banked half of a "double" it never drove — the same
 * retirement rule `pts` applies to the player six lines above.
 *
 * Run: node --test tests/unit/career-settle.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const Career` lands in the context's global LEXICAL scope, not on the global
// object — read it back by evaluating its name (same shape as race-control).
function load() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: {
      CAREER_V: 3,
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
      },
      seasonDriverId: (teamId, i) => teamId + ":" + i,
      migrateCareer: (c) => c,
    },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff,
          drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}) },
    Tracks: { LIST: [] },
  });
  // js/mat4.js first — the shared scalar helpers (M4.clamp) career.js binds at eval.
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx,
    { filename: "js/game/career.js" });
  return vm.runInContext("Career", ctx);
}

/** Start a MY TEAM career, advance the calendar past round 0, settle `order`:
 *  P1,P2 rivals; the player P3 (15 pts); a P4 rival; the mate P5 — classified
 *  in the points either way, `mateRetired` decides whether it got there. */
function settle(mateRetired) {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;                       // endRace() advances BEFORE settleRound()

  const mk = (id, retired) => ({ team: { id }, retired, cuts: 0, penalty: 0, gridPos: 5 });
  const player = mk("custom", false);
  const mate = mk("custom", mateRetired);
  const order = [mk("haas", false), mk("haas", false), player, mk("haas", false), mate];
  for (let i = 0; i < 15; i++) order.push(mk("haas", i < 5)); // pad the field

  const res = Career.settleRound(order, player);
  const row = career.results[career.results.length - 1];
  return { res, row };
}

test("mate FINISHED P5: both cars in the points, so the double is recorded", () => {
  const { res, row } = settle(false);
  assert.equal(res.pos, 3);
  assert.equal(res.pts, 15, "player P3 scores 15");
  assert.equal(row.double, true, "mate finished P5: double must be recorded");
});

test("mate classified P5 but RETIRED: a retired car scores nothing — no double", () => {
  // Classification inside the top ten is possible for a retiree when enough of
  // the field DNFs; the points rule still pays only cars that finished.
  const { res, row } = settle(true);
  assert.equal(res.pts, 15, "player's own points unaffected by the mate");
  assert.equal(row.double, false,
    "mate retired: a retired car scores nothing, so this is NOT a double");
});

test("MY TEAM standings include the hired second driver", () => {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.pts["custom:0"] = 25;
  career.season.pts["custom:1"] = 18;

  const custom = Career.driverStandings().filter((row) => row.team.id === "custom");
  assert.deepEqual(Array.from(custom, (row) => row.id).sort(), ["custom:0", "custom:1"]);
  assert.equal(custom.find((row) => row.id === "custom:1").pts, 18);
});

test("the retired flag is the ONLY discriminator between the two rounds", () => {
  // The base code failed exactly this: both rounds classify the mate P5, and a
  // position-only read (`Teams.POINTS[order.indexOf(mate)]`) returns 10 points
  // in both, recording a double either way. Current code must discriminate.
  const finished = settle(false);
  const retired = settle(true);
  assert.equal(finished.res.pts, retired.res.pts, "identical player result in both rounds");
  assert.notEqual(finished.row.double, retired.row.double,
    "same classified order, different retired flag — the double facts must differ");
});

// ── the contract binds, and the budget ladder moves (F1 25 research fixes) ───
// A DRIVER career this time, because the two contract rules under test are
// excluded for MY TEAM by design. Its own context: rollover() reaches
// DriverRatings (driver/team development, the market), which settleRound() does
// not, so this loader stubs it flat — every driver rates the same, which parks
// the market (a swap needs a midfielder to out-rate a top-team seat) and leaves
// the contract and budget rules the only things moving.
function loadDriver(ratings, opts = {}) {
  const stored = new Map();
  const flatRating = { pace: 80, craft: 75, awareness: 75, consistency: 75, experience: 50 };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: {
      CAREER_V: 3,
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
      },
      seasonDriverId: (teamId, i) => teamId + ":" + i,
      migrateCareer: (c) => c,
    },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      // A real spread of tiers so makeOffers() has a ladder to draw from, each
      // with two seats and a `name` (rolloverMarket reads it when it records a
      // swap — parked here, but present so a future change does not NPE).
      LIST: [
        { id: "custom", name: "My Team", tier: 2, custom: true,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "apex", name: "Apex", tier: 0,
          drivers: [{ name: "P1", code: "AP1", num: 3 }, { name: "P2", code: "AP2", num: 4 }] },
        { id: "vega", name: "Vega", tier: 2,
          drivers: [{ name: "V1", code: "VG1", num: 5 }, { name: "V2", code: "VG2", num: 6 }] },
        { id: "haas", name: "Haas", tier: 4,
          drivers: [{ name: "H1", code: "HH1", num: 1 }, { name: "H2", code: "HH2", num: 2 }] },
      ],
    },
    // getCost feeds worksCost() -> budget(): a non-custom team's fitted cap is a
    // multiple of what its works car costs. 600 is a plausible mid-grid figure;
    // the ladder is a RATIO over it, so the exact number is not the subject.
    // CATALOG feeds budgetCap(): the ceiling is the dearest build MINUS the
    // dearest single part, so this stub prices a top shelf of 3000 with a
    // dearest part of 500 -> cap 2500, comfortably above 600 * 1.6 so the
    // RUNGS, not the cap, are what this test measures.
    Parts: {
      getFactorySetup: () => ({}), getCost: () => opts.worksCost || 600,
      CATALOG: Array.from({ length: 6 }, (_, i) => ({
        id: "c" + i, options: [{ cost: 0 }, { cost: 500 }],
      })),
    },
    Tracks: { LIST: [], SEASON: [] },
    DriverRatings: {
      // ratings, when supplied, keys per-driver overall() by code — the market
      // pin below uses it; every other test keeps the flat 80 that parks swaps.
      get: (code) => Object.assign({ code }, flatRating),
      overall: (r) => (ratings && r && ratings[r.code] != null ? ratings[r.code] : 80),
      AXES: ["pace", "craft", "awareness", "consistency", "experience"],
    },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx,
    { filename: "js/game/career.js" });
  return vm.runInContext("Career", ctx);
}

// Start a driver career signed to Haas, force a known season goal, and roll the
// year over — returning what the winter decided about the contract.
function rollWith(goalValue, dealYears) {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.rep = 50;                                    // mid-scale, clear of the 0/100 clamp
  career.deal.goal = { type: "champPos", value: goalValue };
  if (dealYears != null) { career.deal.years = dealYears; career.deal.left = dealYears; }
  const out = Career.rollover();
  return { career, out, goalResult: career.goalResult, offers: career.offers, deal: career.deal };
}

test("the season goal is RESOLVED at the winter: met lifts reputation", () => {
  // value 99 is met at any finishing position, so this pins the met branch
  // without depending on where the empty-standings sort places the player.
  const { career, goalResult } = rollWith(99);
  assert.ok(goalResult, "a driver career must record how the contract's goal was settled");
  assert.equal(goalResult.met, true, "P99-or-better is met at every position");
  assert.equal(goalResult.met, goalResult.pos <= goalResult.value, "met is pos <= value, nothing else");
  assert.equal(career.rep, 55, "meeting the goal is worth +5 reputation");
});

test("the season goal is RESOLVED at the winter: missed costs reputation", () => {
  // value 1 is P1-or-better; with a flat, empty season the player is not champion,
  // so this is the missed branch.
  const { career, goalResult } = rollWith(1);
  assert.equal(goalResult.met, false, "P1-or-better is missed short of the title");
  assert.equal(career.rep, 45, "missing the goal costs 5 reputation");
});

test("a multi-year contract suppresses the winter market until it expires", () => {
  // deal.left 3 -> 2 after the decrement: still under contract, so no seats are
  // drawn and the hub goes straight to next season. This is the fix for a
  // three-year deal that re-signed itself every winter.
  const { deal, offers } = rollWith(99, 3);
  assert.equal(deal.left, 2, "a 3-year deal ticks down to 2, it does not reset");
  // .length, not deepStrictEqual([]): career.offers is built inside the VM realm,
  // so its Array.prototype is not this file's and a strict deep-equal on an empty
  // array fails on the prototype alone. Emptiness is the fact under test.
  assert.equal(offers.length, 0, "offers are withheld while the contract still runs");
});

test("offers ARE drawn the winter the contract runs out", () => {
  // deal.left 1 -> 0: the term is up, so the market opens. Your own team always
  // talks first, so the list is never empty in the expiring winter.
  const { deal, offers } = rollWith(99, 1);
  assert.equal(deal.left, 0, "the final year ticks down to 0");
  assert.ok(offers.length >= 1, "a seat is on the table the winter the deal expires");
});

test("the budget ladder raises the fitted cap, three rungs then stops", () => {
  // BUDGET_MULT is [1.0, 1.15, 1.35, 1.6]; upgradeBudget() was complete but had
  // no caller, so budgetLvl sat at 0 for the life of every career.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.money = 1_000_000;                           // affordable, not the subject
  const cap0 = Career.state().budget;
  assert.equal(career.budgetLvl, 0, "a fresh career starts at cap level 0");
  assert.equal(Career.upgradeBudget(), true, "the first rung is affordable and taken");
  assert.equal(career.budgetLvl, 1, "budgetLvl advances");
  assert.ok(Career.state().budget > cap0, "the fitted cap actually rises");
  assert.equal(Career.upgradeBudget(), true);
  assert.equal(Career.upgradeBudget(), true);
  assert.equal(career.budgetLvl, 3, "three rungs reach the top of BUDGET_MULT");
  assert.equal(Career.state().budgetCost, null, "at the ceiling there is nothing left to buy");
  assert.equal(Career.upgradeBudget(), false, "and the fourth rung is refused");
});

test("RAISE THE CAP is not for sale at a rung the derived ceiling already binds", () => {
  // budget() is min(works × BUDGET_MULT[lvl], budgetCap()). With the real
  // catalog a front-running works car (McLaren 2000 vs a 2105 cap) reaches the
  // ceiling at rung 1, and the hub used to sell rungs 2 and 3 (5000 + 9000 cr)
  // for a cap that did not move. This stub prices the works car at 2000
  // against the same 2500 cap: rung 1 lifts it to 2300, rung 2 clips at 2500,
  // rung 3 would buy nothing and must not be offered.
  const Career = loadDriver(null, { worksCost: 2000 });
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.money = 1_000_000;
  assert.equal(Career.upgradeBudget(), true, "rung 1: 2000 -> 2300, real");
  assert.equal(Career.upgradeBudget(), true, "rung 2: 2300 -> 2500 (clipped), still real");
  assert.equal(Career.state().budget, 2500, "the derived cap binds");
  assert.equal(Career.state().budgetCost, null, "rung 3 would raise nothing, so it is not offered");
  assert.equal(Career.upgradeBudget(), false, "and cannot be bought");
  assert.equal(career.budgetLvl, 2, "budgetLvl stops where the cap bound");
});

// ── settleRound idempotency, money floor, exhausted-calendar clamps ───────────
// SEASON + seasonIndex stubs: trackIndex/seasonDone need a real calendar length.
function loadWithSeason(n) {
  const stored = new Map();
  const SEASON = [];
  for (let i = 0; i < n; i++) SEASON.push({ id: "t" + i, name: "T" + i });
  const LIST = SEASON.slice();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: {
      CAREER_V: 3,
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
      },
      seasonDriverId: (teamId, i) => teamId + ":" + i,
      migrateCareer: (c) => c,
    },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff,
          drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}) },
    Tracks: {
      LIST, SEASON,
      seasonIndex: (round) => {
        const t = SEASON[round];
        return t ? LIST.indexOf(t) : -1;
      },
    },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx,
    { filename: "js/game/career.js" });
  return vm.runInContext("Career", ctx);
}

test("settleRound is idempotent: a second call for the same raced round pays nothing", () => {
  const Career = loadWithSeason(3);
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;
  career.money = 10_000;
  const mk = (id) => ({ team: { id }, retired: false, cuts: 0, penalty: 0, gridPos: 5 });
  const player = mk("custom");
  const order = [player, mk("haas"), mk("haas")];
  const first = Career.settleRound(order, player);
  assert.ok(first, "first settle pays");
  const moneyAfter = career.money;
  const rows = career.results.length;
  const second = Career.settleRound(order, player);
  assert.equal(second, null, "second settle is a no-op");
  assert.equal(career.money, moneyAfter, "money not re-paid");
  assert.equal(career.results.length, rows, "no second results row");
});

test("settleRound floors money at zero after wage settlement", () => {
  const Career = loadWithSeason(3);
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;
  career.money = 0;
  // Inflate the roster wage so the round's income cannot cover it.
  career.roster = [{ code: "X", salary: 1_000_000 }];
  const mk = (id) => ({ team: { id }, retired: true, cuts: 0, penalty: 0, gridPos: 20, dnf: "engine" });
  const player = mk("custom");
  const order = [mk("haas"), mk("haas"), player];
  Career.settleRound(order, player);
  assert.equal(career.money, 0, "balance never goes permanently negative");
});

test("objective is null and trackIndex clamps once the season is done", () => {
  const Career = loadWithSeason(2);
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 2;                          // === SEASON.length → done
  assert.equal(Career.seasonDone(), true);
  assert.equal(Career.objective(), null, "no phantom brief after the last race");
  assert.equal(Career.trackIndex(), 1, "clamps to last valid LIST index, never -1");
  assert.notEqual(Career.trackIndex(), -1);
});

// ── overall() is a SIM INPUT, not a readout ──────────────────────────────────
// driver-ratings.js used to claim "Display only; nothing in the sim reads it";
// this pins the real consumer: rolloverMarket() ranks the grid with overall()
// and swaps the out-rating midfielder into the top team's weaker seat. If the
// weighting (or this wiring) changes, a saved career's silly season changes.
test("silly season moves the driver overall() rates highest, not a coin flip", () => {
  // Vega's VG1 out-rates both Apex seats; everyone else is mid. The market
  // must record VG1 moving vega -> apex. Flat-80 loaders park this by design.
  const Career = loadDriver({ VG1: 95, AP1: 60, AP2: 62 });
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.rep = 50;
  Career.rollover();
  const move = (career.moves || []).find((m) => m.code === "VG1");
  assert.ok(move, "the top-rated midfielder must be the one who moves");
  assert.equal(move.from, "vega");
  assert.equal(move.to, "apex");
});
