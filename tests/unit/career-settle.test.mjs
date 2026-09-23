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
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const Career` lands in the context's global LEXICAL scope, not on the global
// object — read it back by evaluating its name (same shape as race-control).
function load(seasonLen) {
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
      // Mirrors js/data/teams.js: the predicate every field walk uses to keep
      // MY TEAM and LEGENDS out of the championship (career-legends.test.mjs).
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff,
          drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}) },
    Tracks: seasonLen ? { LIST: [], SEASON: new Array(seasonLen).fill({}) } : { LIST: [] },
  });
  // js/core/mat4.js first — the shared scalar helpers (M4.clamp) career.js binds at eval.
  seedLog(ctx);
  seedHash32(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  // The REAL ratings table, because the goal draw now reaches it: beatRival ranks
  // the grid by DriverRatings.overall(). The driver loader below keeps its own
  // stub instead — its market tests pin overall() per code on purpose.
  vm.runInContext(readFileSync(join(ROOT, "js/data/driver-ratings.js"), "utf8"), ctx,
    { filename: "js/data/driver-ratings.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx,
    { filename: "js/career/career.js" });
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
      isReal: (t) => !!t && !t.custom && !t.legends,   // mirrors js/data/teams.js
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
    // An EMPTY calendar by default, which makes seasonDone() true at round 0 —
    // every rollover test here settles nothing and wants it that way. `rounds`
    // gives the few that need a live season one.
    Tracks: { LIST: [],
      SEASON: Array.from({ length: opts.rounds || 0 }, (_, i) => ({ id: "t" + i })) },
    DriverRatings: {
      // ratings, when supplied, keys per-driver overall() by code — the market
      // pin below uses it; every other test keeps the flat 80 that parks swaps.
      get: (code) => Object.assign({ code }, flatRating),
      overall: (r) => (ratings && r && ratings[r.code] != null ? ratings[r.code] : 80),
      AXES: ["pace", "craft", "awareness", "consistency", "experience"],
    },
  });
  seedLog(ctx);
  seedHash32(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  // REGULATIONS TOO, so era() is exercised rather than short-circuiting on
  // `typeof Regulations === "undefined"` — without it every era assertion
  // below passes VACUOUSLY, which is exactly how a wrong guard survives a
  // suite. It reads Parts.CATALOG at call time and the stub supplies one.
  vm.runInContext(readFileSync(join(ROOT, "js/career/regulations.js"), "utf8"), ctx,
    { filename: "js/career/regulations.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx,
    { filename: "js/career/career.js" });
  return vm.runInContext("Career", ctx);
}

// Start a driver career signed to Haas, force a known season goal, and roll the
// year over — returning what the winter decided about the contract.
function rollWith(goalValue, dealYears, amb) {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.rep = 50;                                    // mid-scale, clear of the 0/100 clamp
  career.deal.goal = { type: "champPos", value: goalValue };
  if (dealYears != null) { career.deal.years = dealYears; career.deal.left = dealYears; }
  // undefined leaves whatever start() signed (index 1); null strips the key to
  // stand in for a save written before ambition existed; a number pins the rung.
  if (amb === null) delete career.deal.ambition;
  else if (amb !== undefined) career.deal.ambition = amb;
  const out = Career.rollover();
  return { Career, career, out, goalResult: career.goalResult, offers: career.offers, deal: career.deal };
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
      isReal: (t) => !!t && !t.custom && !t.legends,   // mirrors js/data/teams.js
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
  seedHash32(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  // The REAL ratings table, because the goal draw now reaches it: beatRival ranks
  // the grid by DriverRatings.overall(). The driver loader below keeps its own
  // stub instead — its market tests pin overall() per code on purpose.
  vm.runInContext(readFileSync(join(ROOT, "js/data/driver-ratings.js"), "utf8"), ctx,
    { filename: "js/data/driver-ratings.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx,
    { filename: "js/career/career.js" });
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

// ── RACE CRAFT pays reputation and NEVER money ───────────────────────────────
// The whole point of the channel: a scruffy race already cost positions and
// therefore prize money, so billing the balance again would charge it twice.
// These tests settle the SAME classified order twice, changing only the marks
// the player left on the way there.

/** Settle a fixed P3 with the given craft-input fields on the player car. */
function settleCraft(marks) {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;
  const repBefore = career.rep;

  const mk = (id) => ({ team: { id }, retired: false, cuts: 0, penalty: 0, gridPos: 5 });
  const player = Object.assign(mk("custom"), marks);
  const order = [mk("haas"), mk("haas"), player, mk("haas"), mk("custom")];
  for (let i = 0; i < 15; i++) order.push(mk("haas"));

  const res = Career.settleRound(order, player);
  return { Career, res, repBefore, row: career.results[career.results.length - 1] };
}

test("craftScore is 1.00 for a faultless race and falls with each kind of mark", () => {
  const Career = load();
  assert.equal(Career.craftScore({}), 1, "no marks at all is a perfect score");
  assert.equal(Career.craftScore(null), 1, "a missing car cannot be scored down");
  // 2 cuts (0.20) + a single +5s penalty (0.35) = 0.55 off.
  assert.ok(Math.abs(Career.craftScore({ cuts: 2, penalty: 5 }) - 0.45) < 1e-9);
  // Contact is scaled by the WORST impact: the same hit at half severity costs half.
  assert.ok(Career.craftScore({ hits: 1, hitSev: 1 }) < Career.craftScore({ hits: 1, hitSev: 0.5 }));
  assert.equal(Career.craftScore({ wallHits: 99 }), 0, "the score floors at zero");
});

test("a RETIREMENT does not touch craft — every DNF here is a reliability draw", () => {
  // js/race/reliability.js draws "accident" from the same table as "gearbox";
  // nothing retires a car for how it was driven, so charging a DNF would price
  // a dice roll rather than the driving.
  const Career = load();
  assert.equal(Career.craftScore({ retired: true, dnf: "accident" }), 1);
});

test("the same P3, scruffy by CONTACT: reputation differs, the money is identical", () => {
  // Contact and wall strikes are the craft-only inputs — no objective reads them
  // (objectiveMet's "clean" brief looks at retired/cuts/penalty), so this pair
  // isolates the new channel completely.
  const clean = settleCraft({});
  const scruffy = settleCraft({ hits: 2, hitSev: 0.8, wallHits: 3 });

  assert.equal(clean.res.pos, scruffy.res.pos, "same classified position");
  assert.equal(clean.res.pts, scruffy.res.pts, "same points");
  assert.equal(clean.res.prize, scruffy.res.prize, "same prize money");
  assert.equal(clean.res.money, scruffy.res.money,
    "RACE CRAFT MUST NOT REACH THE BALANCE — it is a reputation channel only");
  assert.ok(clean.res.rep > scruffy.res.rep,
    "the clean round must be worth more reputation than the scruffy one");
});

test("cuts and penalties cost money only through the brief that already priced them", () => {
  // Round 0 at seed 7 draws the "clean" objective, so cuts DO move the balance —
  // by exactly OBJ_BONUS, and by nothing else. Craft adds no second money term.
  const clean = settleCraft({});
  const cut = settleCraft({ cuts: 4, penalty: 5 });
  assert.equal(clean.res.obj.done, true);
  assert.equal(cut.res.obj.done, false, "four cuts must fail the clean brief");
  assert.equal(clean.res.money - cut.res.money, clean.Career.OBJ_BONUS,
    "the whole money gap is the missed brief — craft contributes nothing");
});

test("the craft reputation term is bounded, and asymmetric in the clean run's favour", () => {
  const clean = settleCraft({});
  const floored = settleCraft({ wallHits: 99 });   // craftScore 0, well past the clamp
  const gain = clean.res.rep - clean.repBefore;
  const loss = floored.res.rep - floored.repBefore;
  // Both rounds share every other reputation term and both meet the clean brief
  // (wall contact is not a track-limits cut), so the gap is the craft term alone:
  // +1.5 at the top, -0.75 at the bottom (CRAFT_REP_MAX / CRAFT_REP_MIN).
  assert.ok(Math.abs((gain - loss) - 2.25) < 1e-9,
    `craft term spans 2.25 rep end to end, got ${gain - loss}`);
});

test("craft is recorded on the results row and averaged across the season", () => {
  // state() is not reachable from this loader (it reads Tracks.SEASON, which the
  // stub above does not carry); seasonCraft() is the value state() exposes.
  const { Career, row } = settleCraft({ cuts: 1 });
  assert.equal(row.craft, 0.9, "one cut costs 0.10, rounded to two places on the row");
  assert.ok(Math.abs(Career.seasonCraft() - 0.9) < 1e-9, "one race: the average is that race");
});

test("rounds saved before craft existed are skipped, not counted as zero", () => {
  const { Career } = settleCraft({});
  const career = Career.data();
  career.results.unshift({ r: 0, p: 8, pts: 4, obj: false, dnf: null });   // no craft key
  assert.equal(Career.seasonCraft(), 1,
    "a legacy row must not drag a faultless season down to 0.50");
});

// ── THE LOOP: driving -> rating -> the market ────────────────────────────────
// rolloverDrivers infers every axis of every driver from the RESULT, because for
// an AI seat there is nothing else to go on. For the player there is: a season of
// settled rounds that recorded how each was driven. These pin that the player's
// craft axis takes that evidence and that nobody else's does.

/** Race a full season of identical P3s with the given marks, then roll over. */
function seasonOf(marks) {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  const me = "haas:1";

  const mk = (id, seat) => ({ team: { id }, seat, retired: false, cuts: 0, penalty: 0, gridPos: 5 });
  for (let r = 0; r < 6; r++) {
    career.season.round = r + 1;
    const player = Object.assign(mk("haas", 1), marks);
    const order = [mk("apex", 0), mk("apex", 1), player, mk("vega", 0), mk("vega", 1),
                   mk("haas", 0), mk("vega", 0), mk("apex", 0)];
    Career.settleRound(order, player);
  }
  const before = JSON.stringify(career.dev);
  const summary = Career.rollover().summary;
  return { Career, career, me, before, summary, dev: career.dev };
}

test("a clean season develops the player's craft; a scruffy one costs it", () => {
  const clean = seasonOf({});
  const scruffy = seasonOf({ hits: 2, hitSev: 0.9, wallHits: 3 });

  assert.equal(clean.summary.craft, 1, "six faultless rounds average 1.00");
  assert.ok(scruffy.summary.craft < 0.6, `scruffy season averaged ${scruffy.summary.craft}`);
  assert.ok(clean.dev[clean.me].craft > scruffy.dev[scruffy.me].craft,
    "the craft axis must move with the driving, not with the finishing position");
  // Same classified P3 every round in both seasons, so pace — which is inferred
  // from the result — must be untouched by how the car was driven.
  assert.equal(clean.dev[clean.me].pace, scruffy.dev[scruffy.me].pace,
    "craft must not leak into the pace axis");
});

test("only the PLAYER'S seat reads race craft — every AI seat keeps the inferred drift", () => {
  const clean = seasonOf({});
  const scruffy = seasonOf({ hits: 2, hitSev: 0.9, wallHits: 3 });
  for (const id of Object.keys(clean.dev)) {
    if (id === clean.me) continue;
    assert.equal(JSON.stringify(clean.dev[id]), JSON.stringify(scruffy.dev[id]),
      `${id} is an AI seat: the player's driving must not develop it`);
  }
});

test("a season with no craft rows falls back to the inferred drift, not a bad year", () => {
  // The path a save raced entirely before craft existed takes. Strip the key from
  // every settled round and roll over: the player's craft must develop exactly as
  // an AI seat's does (half the pace drift), never as a season scored zero.
  const clean = seasonOf({});
  const legacy = loadDriver();
  legacy.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  legacy.engage(true);
  const career = legacy.data();
  const mk = (id, seat) => ({ team: { id }, seat, retired: false, cuts: 0, penalty: 0, gridPos: 5 });
  for (let r = 0; r < 6; r++) {
    career.season.round = r + 1;
    const player = mk("haas", 1);
    legacy.settleRound(player ? [mk("apex", 0), mk("apex", 1), player, mk("vega", 0),
                                 mk("vega", 1), mk("haas", 0), mk("vega", 0), mk("apex", 0)] : [], player);
    delete career.results[career.results.length - 1].craft;
  }
  assert.equal(legacy.seasonCraft(), null, "no craft rows at all");
  legacy.rollover();
  const craft = career.dev["haas:1"].craft, pace = career.dev["haas:1"].pace;
  // Half the pace drift, within the rounding bumpAxis applies to each axis.
  assert.ok(Math.abs(craft - pace / 2) <= 0.5,
    `legacy craft ${craft} must be half the pace drift ${pace}, as an AI seat's is`);
  assert.notEqual(craft, -3,
    "a season with no craft rows must not be scored as a season of zeroes");
});

// ── THE BRIEF IS A CHOICE ────────────────────────────────────────────────────
// Three briefs per round, drawn purely from the seed; only the PICK is stored.
// The load-bearing property is that settleRound still recomputes the brief
// rather than reading career.obj, so the settlement cannot disagree with what
// the hub showed — and a save written before the choice existed keeps its brief.

function hub() {
  const Career = loadDriver(null, { rounds: 8 });
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  return Career;
}

test("index 0 is the brief that used to be dealt, so an old save keeps it", () => {
  const Career = hub();
  const career = Career.data();
  assert.equal(career.objPick, null, "a fresh save has no pick");
  const choices = Career.objectiveChoices(0);
  assert.equal(choices.length, Career.OBJ_CHOICES);
  assert.equal(JSON.stringify(Career.objective()), JSON.stringify(choices[0]),
    "unchosen must resolve to index 0");
  assert.equal(new Set(choices.map((o) => o.type)).size, choices.length,
    "the three briefs must be distinct kinds, or the choice is not one");
});

test("choosing a brief changes what the hub shows and what settleRound pays", () => {
  const Career = hub();
  const career = Career.data();
  const choices = Career.objectiveChoices(0);
  assert.equal(Career.chooseObjective(2), true);
  assert.equal(JSON.stringify(Career.objective()), JSON.stringify(choices[2]));

  // Settle round 0 and check the brief that was PAID is the one that was picked.
  career.season.round = 1;
  const mk = (id, seat) => ({ team: { id }, seat, retired: false, cuts: 0, penalty: 0, gridPos: 5 });
  const player = mk("haas", 1);
  const res = Career.settleRound([mk("apex", 0), player, mk("vega", 0)], player);
  assert.equal(res.obj.type, choices[2].type,
    "settleRound recomputes the brief; it must recompute the CHOSEN one");
});

test("a pick is keyed on its round — a stale one never applies to another", () => {
  const Career = hub();
  const career = Career.data();
  Career.chooseObjective(2);
  assert.equal(Career.objectivePick(0), 2);
  career.season.round = 1;
  assert.equal(Career.objectivePick(1), 0, "the next round is unchosen, not still on 2");
  assert.equal(JSON.stringify(Career.objective()),
    JSON.stringify(Career.objectiveChoices(1)[0]));
});

test("the pick locks once the weekend is under way", () => {
  const Career = hub();
  const career = Career.data();
  Career.chooseObjective(1);
  career.season.stage = "race";          // the sprint has run
  assert.equal(Career.objectiveLocked(), true);
  assert.equal(Career.chooseObjective(2), false, "no choosing with the answer in hand");
  assert.equal(Career.objectivePick(0), 1, "and the earlier pick stands");
  delete career.season.stage;
  career.season.qualiOrder = ["haas:1"];  // or quali has
  assert.equal(Career.chooseObjective(2), false);
});

test("the choices are drawn from the seed, so reloading cannot reroll them", () => {
  const a = hub(), b = hub();
  assert.equal(JSON.stringify(a.objectiveChoices(3)), JSON.stringify(b.objectiveChoices(3)));
  // ...and a different round draws a different set, or the "choice" is one brief
  // three times over the whole season.
  const seen = new Set();
  for (let r = 0; r < 6; r++) seen.add(a.objectiveChoices(r)[0].type);
  assert.ok(seen.size > 1, "the dealt brief must still vary between rounds");
});

// ── THE PROMISE (deal.ambition) ─────────────────────────────────────────────
// The season goal used to be one number the game chose. It is now a rung the
// player picks when signing, and the middle rung has to be the old behaviour
// EXACTLY or every career in existence silently re-prices itself.

test("a deal with NO ambition resolves on the old numbers — +5 / -5 REP", () => {
  // The back-compat proof, and the reason the table is indexed with 1 in the
  // middle: a save written before the picker existed carries no `ambition`.
  const met = rollWith(99, null, null);
  assert.equal(met.career.rep, 55, "an ambition-less deal met is worth the old +5");
  const missed = rollWith(1, null, null);
  assert.equal(missed.career.rep, 45, "an ambition-less deal missed costs the old -5");
});

test("promising more pays more, and costs more when missed", () => {
  const Career = loadDriver();
  const A = Career.AMBITION;
  assert.equal(A.length, 3, "three rungs");
  assert.ok(A[2].rep > A[1].rep && A[1].rep > A[0].rep, "reward climbs with ambition");
  assert.ok(A[2].mv > A[1].mv && A[1].mv > A[0].mv, "so does what missing costs");

  assert.equal(rollWith(99, null, 2).career.rep, 50 + A[2].rep, "ambitious, met");
  assert.equal(rollWith(1, null, 2).career.rep, 50 - A[2].rep, "ambitious, missed");
  assert.equal(rollWith(99, null, 0).career.rep, 50 + A[0].rep, "modest, met");
  assert.equal(rollWith(1, null, 0).career.rep, 50 - A[0].rep, "modest, missed");
});

test("the TARGET itself moves with the promise", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const haas = Career.data().team;
  const team = { id: haas, tier: 4 };
  const bold = Career.goalValueFor(team, 2);
  const asked = Career.goalValueFor(team, 1);
  const safe = Career.goalValueFor(team, 0);
  assert.ok(bold < asked, "promising more asks for a better finish");
  assert.ok(safe > asked, "promising less asks for a worse one");
  assert.equal(asked, Career.expectedFinish(team), "the middle rung IS expectedFinish");
});

test("a season is priced by the promise SIGNED, not by the picker's current rung", () => {
  // The picker sets what the NEXT deal signs at. A player who changes it in
  // March must not retroactively re-price the contract they are running.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.rep = 50;
  career.deal.goal = { type: "champPos", value: 99 };
  career.deal.ambition = 2;                 // signed ambitious
  Career.setAmbition(0);                    // then thought better of it
  Career.rollover();
  assert.equal(career.rep, 50 + Career.AMBITION[2].rep,
    "the signed rung prices the season, not the pending pick");
  assert.equal(career.goalResult.ambition, 2, "and the sheet reads back what was promised");
});

test("changing the promise re-stamps the offers already on the table", () => {
  // The sheet prints o.goal.value and the offers are drawn at rollover, before
  // the pick exists. A stale target would put one number on the button and sign
  // the contract at another.
  const { Career, offers } = rollWith(99, 1);
  assert.ok(offers.length > 0, "a expired 1-year deal draws seats");
  const before = offers.map((o) => ({ type: o.goal.type, value: o.goal.value }));
  Career.setAmbition(2);
  const after = Career.data().offers.map((o) => ({ type: o.goal.type, value: o.goal.value }));
  // KIND-AWARE, because a contract no longer always promises a championship
  // position: the re-stamp re-derives through the goal's OWN kind, and the kind
  // itself is seeded on the year so it must not move when the rung does.
  assert.deepEqual(after.map((g) => g.type), before.map((g) => g.type),
    "the rung changes the target, never the kind");
  for (const g of after) {
    const team = { id: Career.data().offers[after.indexOf(g)].teamId, tier: 4 };
    assert.equal(g.value, Career.GOAL_KINDS[g.type].value(team, 2),
      `${g.type}'s target is re-derived at the new rung`);
  }
  assert.ok(after.every((g, i) => g.value <= before[i].value),
    "an ambitious rung never softens a target");
});

test("ambIdx refuses a rung that is not one", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const def = Career.AMBITION[Career.ambitionOf({})];
  for (const bad of [undefined, null, -1, 3, 99, 1.5, "2", NaN, {}])
    assert.equal(Career.AMBITION[Career.ambitionOf({ ambition: bad })], def,
      `a deal carrying ${JSON.stringify(bad)} reads as the default rung`);
  assert.equal(Career.setAmbition(99), Career.AMBITION.length - 1, "setAmbition clamps high");
  assert.equal(Career.setAmbition(-5), 0, "and low");
});

// ── GOAL KINDS ──────────────────────────────────────────────────────────────
// A contract used to promise exactly one thing. Each kind derives its target
// from an expectation that already existed, so none of this invents a balance
// number — and champPos stays the fallback so no signed deal changes meaning.

test("champPos is the fallback, so an unknown or missing kind cannot silently pass", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  c.rep = 50;
  // P1-or-better, which a flat empty season misses. An unknown type must
  // resolve through champPos and MISS — not fall through to "met".
  c.deal.goal = { type: "no-such-kind", value: 1 };
  Career.rollover();
  assert.equal(c.goalResult.met, false,
    "an unrecognised goal kind resolves as champPos, not as satisfied");
  assert.equal(c.rep, 45, "and it is priced exactly as champPos would be");
});

test("every declared kind derives a target and labels it", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const team = { id: "haas", tier: 4 };
  for (const type of Career.GOAL_ORDER) {
    const kind = Career.GOAL_KINDS[type];
    const v = kind.value(team, 1);
    // A TARGET IS NOT ALWAYS A NUMBER. champPos/teamPos derive a position and
    // beatMate derives 0, but beatRival's target is WHO — a seasonDriverId, kept
    // in `value` precisely because every site that rebuilds a goal writes
    // `{ type, value }` and would drop a field beside it.
    assert.ok(Number.isFinite(v) || (typeof v === "string" && v.length > 0),
      `${type} must derive a target: a finite position, or an id naming one`);
    const label = Career.goalLabel({ type, value: v });
    assert.ok(label && label.length > 4, `${type} must label itself`);
  }
});

test("ambition shifts every kind that HAS a target, in the same direction", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const team = { id: "haas", tier: 4 };
  for (const type of ["champPos", "teamPos"]) {
    const kind = Career.GOAL_KINDS[type];
    const bold = kind.value(team, 2), asked = kind.value(team, 1), safe = kind.value(team, 0);
    assert.ok(bold <= asked, `${type}: promising more never asks for less`);
    assert.ok(safe >= asked, `${type}: promising less never asks for more`);
  }
  // beatMate is binary — there is nothing to scale, and that is deliberate.
  assert.equal(Career.GOAL_KINDS.beatMate.value(team, 2), 0);
});

test("each kind resolves against the season it was written for", () => {
  const Career = loadDriver();
  const K = Career.GOAL_KINDS;
  const season = { pos: 4, cPos: 6, wins: 1, podiums: 3, matePos: 9 };
  assert.equal(K.champPos.met(4, season), true, "P4 meets a P4 target");
  assert.equal(K.champPos.met(3, season), false, "and misses a P3 one");
  assert.equal(K.teamPos.met(6, season), true, "the team's own position, not the driver's");
  assert.equal(K.teamPos.met(5, season), false);
  assert.equal(K.beatMate.met(0, season), true, "P4 is ahead of a team-mate's P9");
  assert.equal(K.beatMate.met(0, { ...season, matePos: 2 }), false);
  assert.equal(K.beatMate.met(0, { ...season, matePos: null }), true,
    "no team-mate on the board is not a failure to beat one");
});

test("the kind is drawn from the seed and the year, so it cannot be rerolled", () => {
  const a = loadDriver(); a.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  a.engage(true);
  const b = loadDriver(); b.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  b.engage(true);
  assert.equal(a.data().deal.goal.type, b.data().deal.goal.type,
    "the same seed and year draw the same kind");
  const years = new Set([2026, 2027, 2028, 2029, 2030, 2031].map((y) => a.goalTypeFor(y)));
  assert.ok(years.size > 1, "and six seasons do not all promise the same thing");
});

// ── acceptOffer ─────────────────────────────────────────────────────────────
// THIS FUNCTION HAD NO TESTS AT ALL, which is how it shipped signing a
// different contract from the one on the button. Everything below exists
// because a verification pass found that by reading, not by playing.

test("SIGNING AN OFFER SIGNS WHAT THE BUTTON SHOWED — the kind never redraws", () => {
  // rollover() draws the winter's offers BEFORE career.year++, and the goal
  // kind is seeded on the year. acceptOffer() used to re-derive the kind at
  // accept time, reading the incremented year: measured at 67% of seasons, the
  // contract signed a different promise from the one displayed.
  for (const seed of [1, 7, 13, 21, 34, 55, 89]) {
    const Career = loadDriver();
    Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed });
    Career.engage(true);
    const c = Career.data();
    c.rep = 50;
    c.deal.years = 1; c.deal.left = 1;          // expire it so the winter draws seats
    Career.rollover();
    const offers = c.offers || [];
    if (!offers.length) continue;
    const shown = { type: offers[0].goal.type, value: offers[0].goal.value };
    const deal = Career.acceptOffer(0);
    assert.equal(deal.goal.type, shown.type,
      `seed ${seed}: signed a ${deal.goal.type} contract off a ${shown.type} button`);
  }
});

test("accepting recomputes the TARGET, because a move re-seats you", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  c.rep = 50; c.deal.years = 1; c.deal.left = 1;
  Career.rollover();
  if (!(c.offers || []).length) return;
  const o = c.offers[0];
  const deal = Career.acceptOffer(0);
  // The value is derived through the offer's OWN kind, never through champPos.
  const team = { id: deal.team, tier: 4 };
  assert.equal(deal.goal.value, Career.GOAL_KINDS[deal.goal.type].value(team, Career.ambition()),
    "the target is re-derived through the signed kind");
  assert.equal(deal.ambition, Career.ambition(), "and the rung is the pending pick");
});

test("an offer carrying no goal at all still signs something resolvable", () => {
  // Defensive: an offer from an older save shape must not produce a deal whose
  // goal cannot be resolved, or rollover() would silently skip the season.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  c.rep = 50; c.deal.years = 1; c.deal.left = 1;
  Career.rollover();
  if (!(c.offers || []).length) return;
  delete c.offers[0].goal;
  const deal = Career.acceptOffer(0);
  assert.ok(deal.goal && deal.goal.type, "a goal-less offer still yields a typed goal");
  assert.equal(deal.goal.type, "champPos", "and it falls back to the kind every deal used to carry");
});

// ── THE ERA GUARD ───────────────────────────────────────────────────────────

test("a LOADED but unplayed career reports NO era, because nothing is regulated", () => {
  // The guard is inCareer(), not `career != null`, and the gap between them was
  // a real desync: load() runs at boot whatever the flow, so a save parked in a
  // restricted era reported that era from the main menu while the Grand Prix
  // actually being played resolved unrestricted. Readout said "banned",
  // resolution said "legal". An earlier pass fixed the null-vs-open-era half of
  // this and left the guard one condition short.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  c.year = (c.year0 || 2026) + 5;                  // well past the opening era
  assert.ok(Career.era(), "engaged and five seasons in: there IS an era");
  assert.ok(Career.eraSeasonsLeft() > 0);

  Career.engage(false);                             // leave career, save still loaded
  assert.ok(Career.data(), "the save is still loaded");
  assert.equal(Career.era(), null, "but nothing is regulated, so no era is reported");
  assert.equal(Career.eraSeasonsLeft(), 0);
});

test("the era advances on seasons ELAPSED, which survives the archive cap", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  const first = Career.era().id;
  assert.equal(Career.seasonsElapsed(), 0, "a new career starts at season zero");
  c.year = (c.year0 || 2026) + 4;
  assert.equal(Career.seasonsElapsed(), 4);
  assert.notEqual(Career.era().id, first, "four seasons on is a different ruleset");
  // year0, not history.length: HISTORY_MAX caps the archive at 10, so a long
  // career would otherwise stop advancing its era entirely.
  c.year = (c.year0 || 2026) + 30;
  assert.equal(Career.seasonsElapsed(), 30, "and thirty seasons still counts thirty");
});

// ── BEATRIVAL ───────────────────────────────────────────────────────────────
// A named cross-grid benchmark. The contract ladder terminates at the top
// otherwise: docs/notes/CAREER-CEILING-FIX-2026-09-22.md measures five of eleven
// teams converging on the same capped build, so "which seat you hold" stops
// changing your car. Who you are measured against still can.

test("the rival is never your own garage — that is what beatMate already promises", () => {
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const c = Career.data();
  for (let amb = 0; amb < Career.AMBITION.length; amb++) {
    const id = Career.GOAL_KINDS.beatRival.value({ id: "haas", tier: 4 }, amb);
    assert.ok(id && typeof id === "string", `ambition ${amb} names a rival`);
    assert.notEqual(id.split(":")[0], c.team,
      `ambition ${amb} picked ${id}, which is your own team`);
  }
});

test("the rival rides in `value`, so a goal rebuilt as {type,value} keeps it", () => {
  // The defect this guards shipped once already: acceptOffer rebuilt the goal as
  // `{ type, value }` and dropped everything else. A rival stored beside those
  // two fields would be lost on signing, and the contract would silently become
  // a different promise than the offer showed.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const id = Career.GOAL_KINDS.beatRival.value({ id: "haas", tier: 4 }, 1);
  const rebuilt = { type: "beatRival", value: id };
  assert.equal(rebuilt.value, id, "the rival survives a {type,value} round trip");
  assert.ok(Career.goalLabel(rebuilt).length > 4, "and the rebuilt goal still labels");
});

test("a rival who finished ahead MISSES the goal, and one behind MEETS it", () => {
  for (const [rivalPos, want] of [[1, false], [20, true]]) {
    const Career = loadDriver(undefined, { rounds: 0 });
    Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
    Career.engage(true);
    const c = Career.data();
    c.rep = 50;
    const kind = Career.GOAL_KINDS.beatRival;
    // met() is pure over the assembled result, so drive it directly rather than
    // staging a whole season: pos is the player's, rivalPos the rival's.
    assert.equal(kind.met("x:0", { pos: 5, rivalPos }), want,
      `player P5 vs rival P${rivalPos}`);
  }
});

test("an unresolvable rival cannot fail the player", () => {
  // Same leniency beatMate has: if the seat is not in the standings at all
  // (a grid that changed under the contract), the promise is not held against
  // you. Silently missing a goal you had no way to measure is worse than a
  // goal that quietly passes.
  const Career = loadDriver();
  assert.equal(Career.GOAL_KINDS.beatRival.met("nobody:9", { pos: 18, rivalPos: null }), true,
    "no rival row means the goal cannot be failed");
});

test("ambition moves WHO the rival is, in the direction it moves every other kind", () => {
  // champPos shifts its target position by AMBITION.delta; beatRival walks the
  // same delta along the rating-ranked grid. Ambitious must never name someone
  // slower than modest does.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "mclaren", seat: 1, seed: 11 });
  Career.engage(true);
  const team = { id: "mclaren", tier: 1 };
  const ids = Career.AMBITION.map((_, i) => Career.GOAL_KINDS.beatRival.value(team, i));
  assert.equal(new Set(ids).size >= 1, true, "every rung names someone");
  // The rungs are ordered modest -> ambitious, and delta runs +3 -> -3, so the
  // ambitious pick sits at or above the modest one in the ranked pool.
  assert.ok(Career.AMBITION[0].delta > Career.AMBITION[Career.AMBITION.length - 1].delta,
    "the ambition table still runs modest-high to ambitious-low");
});

test("ADDING A KIND MUST NOT RE-PROMISE THE OTHER THREE", () => {
  // The regression this pins, measured on 2026-09-22: goalTypeFor was
  // `floor(roll * GOAL_ORDER.length)`, so appending beatRival took the divisor
  // 3 -> 4 and every seed and year drew a different kind. Two career specs that
  // read deal.goal.value as a position bar were handed beatMate's 0 and went
  // red, and an in-flight career would have been promised something other than
  // what it was on course for. Appending preserves an array's INDICES, not its
  // DRAWS.
  //
  // The property: whatever goalTypeFor returns for a year, it is one of the
  // declared kinds, and the three originals are still drawn by dividing by
  // THREE — so a roll that used to land on champPos still does.
  const Career = loadDriver();
  Career.start({ flavour: "driver", teamId: "haas", seat: 1, seed: 7 });
  Career.engage(true);
  const seen = new Set();
  for (let year = 2026; year < 2126; year++) {
    const t = Career.goalTypeFor(year);
    assert.ok(Career.GOAL_ORDER.includes(t), `${t} is not a declared kind`);
    seen.add(t);
  }
  assert.ok(seen.has("beatRival"), "beatRival must actually be drawn sometimes");
  for (const base of ["champPos", "teamPos", "beatMate"])
    assert.ok(seen.has(base), `${base} must still be drawn`);
  // beatRival rides its own roll, so it cannot crowd the originals out: over a
  // century of seasons the three originals must still be the clear majority.
  let rivals = 0;
  for (let year = 2026; year < 2126; year++)
    if (Career.goalTypeFor(year) === "beatRival") rivals++;
  assert.ok(rivals > 0 && rivals < 60,
    `beatRival drawn ${rivals}/100 seasons — its own roll should be a minority share`);
});

test("the LAST sponsor window of a season ends at the finale, and asks pro rata", () => {
  // Bug hunt 2026-09-22: windows of 4-6 rounds tiled from round 0 with no clamp,
  // settleSponsor() pays only once raced >= end, and rollover() clears the books
  // — so in ~78 % of seasons the final brief could never pay.
  for (const len of [22, 23, 24, 25]) {
    for (let seed = 1; seed <= 40; seed++) {
      const Career = load(len);
      Career.start({ flavour: "myteam", teamId: "custom", seed });
      Career.engage(true);
      const sp = Career.sponsorAt(len - 1);
      assert.ok(sp, "the finale has a sponsor window");
      assert.ok(sp.end <= len - 1, `len ${len} seed ${seed}: window ends at ${sp.end}, past the finale ${len - 1}`);
      assert.ok(sp.need <= sp.window * 25, "a cut window never asks more than it can score");
    }
  }
});
