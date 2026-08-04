/* Apex 26 — CAREER core: the `apex26.career` save, the credits economy, driver and
   team development, per-round settlement and the season rollover.

   Pure data and rules — no DOM, no renderer, no game-loop state. The screens live
   in js/game/career-ui.js; qualifying lives in js/game/quali.js. game.js calls into
   this from makeCars()/recomputePlayerMods()/endRace(), and every GAMEPLAY accessor
   here returns a neutral value unless a career is actually being played (paceMult
   1, teamStats the team's own literal, owned null) — see inCareer(). That is what
   makes Grand Prix and Time Trial bit-identical whether or not a career save
   exists on the device: the save is loaded at boot, but its rules are not.

   Destructures GameStore at eval time, so it must load AFTER js/game/store.js
   (see tools/manifest.cjs HARD_EDGES). Consumes globals Teams, Tracks, Parts. */
const Career = (function () {
  "use strict";

const { store, seasonDriverId, migrateCareer } = GameStore;

// ---------- economy constants ----------
// Everything is priced in CREDITS — the same unit Parts.CATALOG already uses, so a
// race result converts straight into "most of a new front wing" with no exchange
// rate to explain.
const START_MONEY = { driver: 1200, myteam: 2000 };
const START_REP = { driver: 30, myteam: 50 };

// Race prize money, P1..P10, then two flat tails. Finishing last still pays: a
// career that can go bankrupt from one bad weekend stops being fun to play.
const PRIZE = [900, 700, 560, 460, 380, 320, 270, 230, 200, 170];
const PRIZE_MID = 120;    // P11..P15
const PRIZE_TAIL = 80;    // P16+

// Researching a part costs a multiple of its catalog price. The catalog stays the
// single source of truth for what a part is WORTH; this one number sets the pace of
// the entire economy, which is why it is a constant and not scattered per option.
const RESEARCH_MULT = 3;

// Fitted-cost cap, as a MULTIPLE of what the team's own works car costs, indexed
// by budgetLvl. Relative rather than flat for two reasons. First, correctness: a
// FACTORY_PRESETS build runs 570 cr (Haas) to 2035 cr (McLaren), so any single
// flat number either starts a top team illegally over its own cap or hands a
// back-marker a fortune. Second, meaning: level 0 is exactly the car your team
// actually fields, so every upgrade reads as "how much better than the works car
// am I allowed to run" instead of an arbitrary credit ceiling.
//
// Ownership alone would let one good season max the car out and kill the economy
// dead — this is what keeps a career owning more parts than it can fit at once, so
// every weekend stays a choice.
const BUDGET_MULT = [1.0, 1.15, 1.35, 1.6];
const BUDGET_UPGRADE = [2500, 5000, 9000];   // cost to reach level 1 / 2 / 3

// Team development is stored as stat points and converted to a pace multiplier
// here. ±8 points is ±2%, which is a little over one TIER_V step (0.988 → 0.973 is
// 1.5%) — enough for a team to genuinely climb or fall a tier across two or three
// seasons without ever rewriting `team.tier`, which drives the grid sort, the mesh
// presets and the colours.
const TDEV_MAX = 8;
const TDEV_TO_PACE = 0.0025;

// Per-round objective payout. Small next to a podium's prize money on purpose:
// the brief is a reason to care about a race you cannot win, not a second economy.
const OBJ_BONUS = 150;
const OBJ_REP = 2;

// Season rollover. HISTORY_MAX is a localStorage budget, not a design limit — ten
// years of archive is already more than any save will reach. DEV_MAX bounds a
// driver's accumulated drift so the shipped DriverRatings table stays recognisable
// after a decade; EXP_MAX is separate because experience is CUMULATIVE (see
// rolloverDrivers) and ±12 would freeze a rookie's growth curve after four years.
const HISTORY_MAX = 10;
const DEV_MAX = 12;
const EXP_MAX = 40;

let career = null;        // the loaded save, or null
// Whether career RULES apply to the session that is running. The save is loaded
// once at boot and stays loaded, so "a career exists" is not the same question as
// "we are in one" — without this split, a Grand Prix would silently inherit the
// career's team development and its garage. game.js drives this from one place
// (setFlow), so it cannot drift out of step with `flow`.
let engaged = false;
function engage(on) { engaged = !!on; }
function inCareer() { return engaged && career != null; }

// ---------- deterministic randomness ----------
// Career draws never touch simRnd(): that stream belongs to the physics sim, and
// consuming from it here would make a career's existence change seeded race
// results. This is a STATELESS hash instead — there is no cursor to persist, so a
// save/load round-trip cannot desync it, and the same (seed, key) always agrees.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rnd(...parts) {
  return hash32((career ? career.seed : 0) + ":" + parts.join(":")) / 4294967296;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------- save lifecycle ----------
function data() { return career; }
// A career EXISTS (save on disk). For "career rules apply now", use inCareer().
function active() { return career != null; }

function load() {
  career = migrateCareer(store.get("career", null));
  return career;
}
function save() {
  if (career) store.set("career", career);
  return career;
}
function clear() {
  career = null;
  store.set("career", null);
}

// A fresh career. `teamId` is who you drive for (driver flavour) or who you own
// (my team). The starting garage is seeded with the team's OWN factory build, so
// your career car begins as that team's real 2026 car — signature parts and all —
// rather than a stripped default nobody would want to drive.
function start(opts) {
  const o = opts || {};
  const flavour = o.flavour === "myteam" ? "myteam" : "driver";
  const teamId = o.teamId || (flavour === "myteam" ? "custom" : "haas");
  const team = Teams.LIST.find((t) => t.id === teamId) || Teams.LIST[Teams.LIST.length - 1];
  const factory = Parts.getFactorySetup(team);

  career = {
    v: GameStore.CAREER_V,
    flavour,
    year: 2026,
    seed: (o.seed | 0) || (hash32(teamId + ":" + flavour + ":" + Date.now()) % 1000000),
    team: teamId,
    seat: o.seat | 0,
    // WHO you are. In driver career this replaces one of the team's two real
    // drivers on the grid; the other stays as your team-mate and benchmark.
    driver: {
      name: (o.name || "Your Name").slice(0, 22),
      code: (o.code || "YOU").toUpperCase().slice(0, 3),
      num: clamp(o.num | 0 || 99, 2, 99),
    },
    money: START_MONEY[flavour],
    rep: START_REP[flavour],
    budgetLvl: 0,
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} },
    results: [],
    owned: Object.values(factory),
    fitted: Object.assign({}, factory),
    deal: null,             // filled by contract() below
    offers: [],
    dev: {}, tdev: {}, seats: {},
    obj: null,
    history: [],
  };
  career.deal = newDeal(team, 1);
  return save();
}

// ---------- contract ----------
// Salary rises with reputation and falls with the quality of the car you are given:
// a back-marker has to pay you more to sign, which is both true to life and the
// mechanism that stops an early career being unwinnable.
function salaryFor(team, rep) {
  return Math.round(20 + rep * 1.2 + (4 - team.tier) * 15);
}
function newDeal(team, years) {
  return {
    team: team.id,
    seat: career ? career.seat : 0,
    years, left: years,
    salary: salaryFor(team, career ? career.rep : 30),
    bonusPt: 8 + (4 - team.tier) * 4,
    // The championship position the team expects of you. Derived from the car, then
    // nudged by reputation — a well-regarded driver is asked for more.
    goal: { type: "champPos", value: expectedFinish(team) },
  };
}
// Roughly where this car should finish in the drivers' championship: 2 cars per
// team, so tier 0 ≈ P2, tier 4 ≈ P19.
function tierFinish(team) { return 2 + team.tier * 4; }
// The same bar, shifted by reputation — a well-regarded driver is asked for more.
// Only ever applied to the PLAYER's car: nudging every rival's expectation by the
// player's standing in the paddock would be nonsense.
function expectedFinish(team) {
  return clamp(tierFinish(team) - Math.round(((career ? career.rep : 30) - 50) / 25), 1, 22);
}

// ---------- grid identity ----------
// Who is actually in a seat, given the career's own two sources of override: YOU
// (driver flavour), and whatever the winter driver market did to the rest of the
// grid. `fallback` is the driver teams.js ships there. Ungated — the rollover
// needs to read the grid while composing the next one, before `engaged` means
// anything; driverOverride() below is the gated view makeCars() consumes.
function seatDriver(teamId, seatIdx, fallback) {
  if (!career) return fallback;
  if (career.flavour === "driver" && teamId === career.team && seatIdx === career.seat)
    return career.driver;
  return career.seats[seasonDriverId(teamId, seatIdx)] || fallback;
}
// The driver occupying a seat, when career has replaced whoever teams.js ships
// there. Returns null everywhere else, so makeCars() falls straight through to the
// real 2026 grid outside career. This is the ONE path a career override reaches
// the grid by — the market writes career.seats and is read right here.
function driverOverride(teamId, seatIdx) {
  if (!inCareer()) return null;
  return seatDriver(teamId, seatIdx, null);
}

// Per-driver development deltas, or null outside career. DriverRatings owns the
// base table (it applies in every mode — the grid has personality in a one-off
// Grand Prix too); career only layers its own drift on top.
function devFor(teamId, seatIdx) {
  if (!inCareer()) return null;
  return career.dev[seasonDriverId(teamId, seatIdx)] || null;
}

// ---------- team development ----------
// Neutral outside career. `tdev` is an additive delta in stat points; Teams.LIST is
// NEVER mutated, so a save can't corrupt the shipped grid.
function paceMult(teamId) {
  if (!inCareer()) return 1;
  return 1 + (career.tdev[teamId] || 0) * TDEV_TO_PACE;
}
// The player team's stats with development folded in — recomputePlayerMods() reads
// this instead of team.stats so the career car actually improves.
function teamStats(team) {
  if (!inCareer() || !team) return team && team.stats;
  const d = career.tdev[team.id] || 0;
  if (!d) return team.stats;
  const out = {};
  for (const k in team.stats) out[k] = clamp(team.stats[k] + d, 0, 100);
  return out;
}

// ---------- R&D ownership ----------
// The set of option ids this team may fit. Every cost-0 option is always owned,
// which is what keeps the "a save can never produce an illegal car" guarantee:
// Parts.DEFAULTS are all cost-0, so the fallback in Parts._resolve() always lands
// on something owned without parts.js needing to know career exists.
function owned(teamId) {
  if (!inCareer() || teamId !== career.team) return null;
  const s = new Set(career.owned);
  for (const cat of Parts.CATALOG)
    for (const o of cat.options) if (!o.cost) s.add(o.id);
  return s;
}
function isOwned(teamId, optId) {
  const s = owned(teamId);
  return s ? s.has(optId) : true;
}
function researchCost(opt) { return (opt.cost || 0) * RESEARCH_MULT; }

// What the team's own works car costs to build — the baseline every career budget
// is measured against. Memoised per team: Parts.getFactorySetup is already cached,
// but getCost walks all 12 categories and the garage asks for this on every render.
const _worksCost = new Map();
function worksCost(teamId) {
  if (_worksCost.has(teamId)) return _worksCost.get(teamId);
  const team = Teams.LIST.find((t) => t.id === teamId);
  const c = team ? Parts.getCost(Parts.getFactorySetup(team), team) : 0;
  _worksCost.set(teamId, c);
  return c;
}
function budget() {
  if (!career) return 0;
  const lvl = Math.max(0, Math.min(career.budgetLvl | 0, BUDGET_MULT.length - 1));
  return Math.round(worksCost(career.team) * BUDGET_MULT[lvl]);
}
function budgetUpgradeCost() {
  return career && career.budgetLvl < BUDGET_UPGRADE.length ? BUDGET_UPGRADE[career.budgetLvl] : null;
}

// Buy an option outright. Returns false when it cannot be afforded or is already
// owned, so the caller can play the existing budget-reject animation.
function research(opt) {
  if (!career || !opt) return false;
  if (career.owned.indexOf(opt.id) >= 0) return false;
  const cost = researchCost(opt);
  if (cost > career.money) return false;
  career.money -= cost;
  career.owned.push(opt.id);
  save();
  return true;
}
function upgradeBudget() {
  const cost = budgetUpgradeCost();
  if (!career || cost == null || cost > career.money) return false;
  career.money -= cost;
  career.budgetLvl++;
  save();
  return true;
}

// ---------- per-round objectives ----------
// One brief per round, drawn from the career seed rather than rolled, so it is the
// same brief on every load of the same save and cannot be rerolled by refreshing.
//
// The save stores four scalars — {round, type, value, done} — and never the
// sentence. Prose in a save is prose that can never be reworded, translated or
// shortened again without a migration; the wording lives in LABELS and is derived
// at render time. `round` is not decoration: endRace() advances the calendar
// BEFORE calling settleRound(), so without it there is no way to tell the brief
// that was live for the race just run from the one for the race to come.
const OBJ_KINDS = [
  // One place better than the contract's own season target. A race brief that is
  // easier than the year-long one is free money, and the contract goal is already
  // the bar for "did the season go as it should".
  { type: "finish", value: (team) => clamp(expectedFinish(team) - 1, 1, 20) },
  { type: "beatMate", value: () => 0 },
  { type: "outQualMate", value: () => 0 },
  { type: "points", value: () => 1 },
  { type: "clean", value: () => 0 },
];
const OBJ_LABELS = {
  finish: (v) => "Finish P" + v + " or better",
  beatMate: () => "Finish ahead of your team-mate",
  outQualMate: () => "Out-qualify your team-mate",
  points: (v) => (v > 1 ? "Score " + v + " points" : "Score championship points"),
  clean: () => "Clean race — no track limits, no penalty",
};
function objectiveLabel(o) {
  const f = o && OBJ_LABELS[o.type];
  return f ? f(o.value) : "";
}

// PURE: the same (seed, year, round) always yields the same brief, which is what
// lets settleRound() recompute the raced round's objective instead of trusting a
// cached one to still be the right one.
function objectiveFor(r) {
  const team = Teams.LIST.find((t) => t.id === career.team);
  const i = Math.min(OBJ_KINDS.length - 1, Math.floor(rnd(career.year, "obj", r) * OBJ_KINDS.length));
  const kind = OBJ_KINDS[i];
  return { round: r, type: kind.type, value: team ? kind.value(team) : 0, done: null };
}
// The brief for the round about to be raced. Cached on the save so the hub and
// the HUD agree, refreshed whenever the calendar has moved past it.
function objective() {
  if (!career) return null;
  const r = career.season.round;
  if (!career.obj || career.obj.round !== r) { career.obj = objectiveFor(r); save(); }
  return career.obj;
}
// `ctx` carries everything a check can need: finishing position, points, the
// player's car (cuts, penalty, grid slot) and the team-mate's. A missing team-mate
// makes the two comparison briefs VACUOUS rather than failed — the custom team
// fields one car, and failing a brief there is no fault of the driver's.
function objectiveMet(o, ctx) {
  switch (o.type) {
    case "finish": return ctx.pos <= o.value;
    case "points": return ctx.pts >= o.value;
    case "clean": return !(ctx.player.cuts | 0) && !(ctx.player.penalty | 0);
    case "beatMate": return !ctx.mate || ctx.pos < ctx.matePos;
    case "outQualMate": return !ctx.mate || (ctx.player.gridPos || 99) < (ctx.mate.gridPos || 99);
    default: return false;
  }
}

// ---------- round settlement ----------
function prizeFor(pos) {
  if (pos <= PRIZE.length) return PRIZE[pos - 1];
  return pos <= 15 ? PRIZE_MID : PRIZE_TAIL;
}

// Called from endRace() once the classification is known and championship points
// have been awarded. `order` is the finishing order; `player` is the player's car.
function settleRound(order, player) {
  if (!inCareer() || !player) return null;
  const pos = order.indexOf(player) + 1;
  const team = Teams.LIST.find((t) => t.id === career.team);
  const pts = Teams.POINTS[pos - 1] || 0;
  const prize = prizeFor(pos);
  const salary = career.deal ? career.deal.salary : 0;
  const bonus = career.deal ? career.deal.bonusPt * pts : 0;

  // The calendar has already moved on, so the brief that was live for this race is
  // the PREVIOUS round's. Recomputed rather than read off career.obj: the draw is
  // pure, so this can never disagree with what the hub showed.
  const raced = career.season.round - 1;
  const obj = objectiveFor(raced);
  const mate = order.find((c) => c !== player && c.team && c.team.id === career.team);
  obj.done = objectiveMet(obj, {
    pos, pts, player, mate, matePos: mate ? order.indexOf(mate) + 1 : 0,
  });

  // Two reputation channels, deliberately different in kind. The result term is
  // relative to the CAR (expectedFinish already encodes the tier), so beating a
  // bad car raises reputation and cruising in a good one does not. The objective
  // term is flat, because a brief is met or it is not.
  career.money += prize + salary + bonus + (obj.done ? OBJ_BONUS : 0);
  const repDelta = clamp((expectedFinish(team) - pos) * 0.6, -4, 6)
                 + (obj.done ? OBJ_REP : -OBJ_REP);
  career.rep = clamp(career.rep + repDelta, 0, 100);
  career.results.push({ r: raced, p: pos, pts, obj: obj.done });
  career.obj = null;          // the next round draws its own brief on demand
  save();
  return { pos, pts, prize, salary, bonus, obj, money: career.money, rep: career.rep };
}

// ---------- the grid, as career sees it ----------
// Every seat career reasons about, with whoever is currently in it. The custom
// team is only on the grid when the player has taken it, and makeCars() filters it
// the same way — development or a market move for a team that is not racing would
// be invisible bookkeeping.
function gridSeats() {
  const out = [];
  for (const team of Teams.LIST) {
    if (team.custom && team.id !== career.team) continue;
    team.drivers.forEach((d, i) => {
      const id = seasonDriverId(team.id, i);
      out.push({ id, team, seat: i, driver: seatDriver(team.id, i, d) });
    });
  }
  return out;
}
const isPlayerSeat = (s) => s.team.id === career.team && s.seat === career.seat;
function ratingOf(s) {
  return DriverRatings.get(s.driver.code, s.team.tier, career.dev[s.id]);
}
// A driver record is COPIED whenever it moves seats. career.seats entries are
// plain objects the market writes and rewrites; aliasing one into two seats would
// make the next swap move both.
const driverRec = (d) => ({ name: d.name, code: d.code, num: d.num });

// Full championship order over every seat on the grid, not just the scorers —
// `pts` only holds drivers who scored, and "P22 with nothing" is a real answer the
// history and the development form term both need. Ties break on the stable driver
// id so a rollover is reproducible.
function driverStandings() {
  const rows = gridSeats().map((s) => ({
    id: s.id, team: s.team, seat: s.seat, code: s.driver.code,
    pts: career.season.pts[s.id] || 0,
  }));
  rows.sort((a, b) => b.pts - a.pts || (a.id < b.id ? -1 : 1));
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}
function teamStandings() {
  const rows = Teams.LIST
    .filter((t) => !t.custom || t.id === career.team)
    .map((t) => ({ id: t.id, tier: t.tier, pts: career.season.teamPts[t.id] || 0 }));
  rows.sort((a, b) => b.pts - a.pts || a.tier - b.tier || (a.id < b.id ? -1 : 1));
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}
// Where each constructor SHOULD have finished — the tier order, ties left in the
// shipped LIST order (Array#sort is stable), so the bar a team is judged against
// does not wander between saves.
function expectedConstructor() {
  const m = new Map();
  Teams.LIST.filter((t) => !t.custom || t.id === career.team)
    .slice().sort((a, b) => a.tier - b.tier)
    .forEach((t, i) => m.set(t.id, i + 1));
  return m;
}

// ---------- season rollover ----------

function bumpAxis(d, axis, by) {
  d[axis] = clamp(Math.round((d[axis] || 0) + by), -DEV_MAX, DEV_MAX);
}

// One winter of driver development. Three additive terms, each saying something
// different, because a single "form" number produces a grid that only ever sorts
// itself into the order it already had:
//
//   GROWTH  where a driver is in their arc. `experience` is the age proxy — a
//           30-rated rookie gains ~+2.7 a year, a 100-rated veteran loses 1.5.
//   FORM    did the season beat what the CAR should have done. Bounded ±3, so a
//           great year in a bad car is worth more than a title in the best one.
//   NOISE   development is not a formula. ±2, from the stateless career hash.
//
// Stored as per-axis deltas over the shipped DriverRatings table, never absolutes,
// so updating the real 2026 ratings never invalidates a save.
function rolloverDrivers(dStand) {
  const posOf = new Map(dStand.map((r) => [r.id, r.pos]));
  for (const s of gridSeats()) {
    const r = ratingOf(s);
    const growth = (1 - r.experience / 100) * 6 - 1.5;
    const form = clamp((tierFinish(s.team) - (posOf.get(s.id) || 22)) * 0.25, -3, 3);
    const noise = (rnd(career.year, "dev", s.id) - 0.5) * 4;
    const drift = growth + form + noise;
    const d = career.dev[s.id] || (career.dev[s.id] = {});
    // Pace takes the whole drift; the softer axes take half. A driver who has a
    // year does not become a different person, they get quicker.
    bumpAxis(d, "pace", drift);
    bumpAxis(d, "craft", drift * 0.5);
    bumpAxis(d, "consistency", drift * 0.5);
    // Experience only ever climbs, and unlike the skill axes it ACCUMULATES: it is
    // the age proxy, so capping it at DEV_MAX would stall a rookie four seasons in
    // and freeze the growth term above at its opening value forever.
    d.experience = clamp(Math.round((d.experience || 0) + 4), 0, EXP_MAX);
  }
}

// Team development. Half the accumulated delta evaporates every winter — without
// that decay a team that gets ahead compounds forever and the grid ossifies after
// three seasons — and then one bounded shove for the year just run.
function rolloverTeams(tStand) {
  const posOf = new Map(tStand.map((r) => [r.id, r.pos]));
  const expect = expectedConstructor();
  for (const team of Teams.LIST) {
    if (team.custom && team.id !== career.team) continue;
    const shove = clamp(((expect.get(team.id) || 11) - (posOf.get(team.id) || 11)) * 0.5, -2, 2);
    const next = clamp(Math.round((career.tdev[team.id] || 0) * 0.5 + shove), -TDEV_MAX, TDEV_MAX);
    if (next) career.tdev[team.id] = next; else delete career.tdev[team.id];
  }
}

// The driver market: 0-2 seat swaps a year, each trading a top team's weakest
// driver for the best driver in the midfield. Small on purpose. A market that
// reshuffles ten seats a winter makes the grid you spent a season learning
// meaningless; the move worth simulating is the one that puts a driver you have
// been racing all year into a car that can win.
const TOP_TIER = 1;      // tier 0-1: the seats worth taking
const MID_TIER = 3;      // tier 2-3: where the climbers are

function rolloverMarket() {
  const swaps = Math.floor(rnd(career.year, "mkt", "n") * 3);   // 0, 1 or 2
  for (let i = 0; i < swaps; i++) {
    // Recomputed each pass: a swap changes who the weakest top-team driver is, so
    // the second move is drawn against the grid the first one produced.
    const seats = gridSeats().filter((s) => !s.team.custom && !isPlayerSeat(s));
    const rate = (s) => DriverRatings.overall(ratingOf(s));
    const top = seats.filter((s) => s.team.tier <= TOP_TIER)
      .sort((a, b) => rate(a) - rate(b))[0];
    const mid = seats.filter((s) => s.team.tier > TOP_TIER && s.team.tier <= MID_TIER)
      .sort((a, b) => rate(b) - rate(a))[0];
    // Nobody has earned the move — a swap that downgrades the top team is a bug,
    // not a story, and this is also the natural stop after the first trade.
    if (!top || !mid || rate(mid) <= rate(top)) break;
    swapSeats(top, mid);
  }
}
function swapSeats(a, b) {
  career.seats[a.id] = driverRec(b.driver);
  career.seats[b.id] = driverRec(a.driver);
  // Development follows the DRIVER, not the seat. dev is keyed by seat because
  // that is the id the championship uses, so a swap that left the deltas behind
  // would hand the mover somebody else's career.
  const da = career.dev[a.id], db = career.dev[b.id];
  if (db) career.dev[a.id] = db; else delete career.dev[a.id];
  if (da) career.dev[b.id] = da; else delete career.dev[b.id];
}

// ---------- contracts ----------
// Market value, 0-100: half what the paddock thinks of you, half what the season
// actually returned. Reputation alone lets a well-liked driver coast on one good
// year; points alone ignores that reputation is exactly where "beat a bad car"
// was already banked.
function marketValue(dStand) {
  const me = seasonDriverId(career.team, career.seat);
  const i = dStand.findIndex((r) => r.id === me);
  const n = dStand.length;
  const pct = n > 1 ? (n - 1 - Math.max(i, 0)) / (n - 1) : 1;
  return clamp(0.5 * career.rep + 0.5 * pct * 100, 0, 100);
}
// The market value a team's tier wants to see. Tier 0 asks 92 — essentially a
// champion — and tier 4 will take almost anyone. A visible ladder rather than a
// hidden interest model, so the climb reads as earned.
function offerBar(tier) { return 92 - tier * 18; }

function offerFrom(team, years) {
  return {
    teamId: team.id, years,
    salary: salaryFor(team, career.rep),
    goal: { type: "champPos", value: expectedFinish(team) },
  };
}
function makeOffers(mv) {
  // Length of deal tracks standing: a team gambling on an unknown signs them for
  // one year, a team signing a proven driver locks them up for three.
  const years = clamp(1 + Math.floor(mv / 40), 1, 3);
  const mine = Teams.LIST.find((t) => t.id === career.team);
  const out = [];
  // Your own team always talks first. An offer list that can come back empty would
  // strand a career with no seat, no way forward and nothing to press.
  if (mine) out.push(offerFrom(mine, years));
  const willing = Teams.LIST
    .filter((t) => !t.custom && t.id !== career.team && mv >= offerBar(t.tier))
    .sort((a, b) => a.tier - b.tier
      || rnd(career.year, "offer", a.id) - rnd(career.year, "offer", b.id));
  const extra = Math.floor(rnd(career.year, "offer", "n") * 3);   // 0-2 beyond the renewal
  for (const t of willing.slice(0, extra)) out.push(offerFrom(t, years));
  return out;
}
function offers() { return career ? career.offers : []; }

// Which seat a new team puts you in: the one held by the driver you are the more
// obvious upgrade on. Deterministic, so a save reloaded mid-negotiation agrees
// with the one that was open.
function weakerSeat(team) {
  if (!team.drivers || team.drivers.length < 2) return 0;
  const rate = (i) => DriverRatings.overall(DriverRatings.get(
    seatDriver(team.id, i, team.drivers[i]).code, team.tier,
    career.dev[seasonDriverId(team.id, i)]));
  return rate(0) <= rate(1) ? 0 : 1;
}

// Sign. MOVING teams re-seeds the garage from the new team's works build: you do
// not take your old team's parts with you, and that is also what re-opens the R&D
// economy for a second season instead of arriving with a car already maxed out.
// RENEWING does not touch the garage — a career should not be punished for loyalty.
function acceptOffer(i) {
  const o = career && career.offers ? career.offers[i | 0] : null;
  const team = o && Teams.LIST.find((t) => t.id === o.teamId);
  if (!team) return null;
  if (team.id !== career.team) {
    career.team = team.id;
    career.seat = weakerSeat(team);
    const factory = Parts.getFactorySetup(team);
    career.owned = Object.values(factory);
    career.fitted = Object.assign({}, factory);
  }
  career.deal = {
    team: team.id, seat: career.seat,
    years: o.years, left: o.years, salary: o.salary,
    bonusPt: 8 + (4 - team.tier) * 4,
    goal: o.goal,
  };
  career.offers = [];
  save();
  return career.deal;
}

// The code in a seat, for a driverId the championship recorded but whose display
// code the save never captured (a season settled entirely through careerSim).
function codeOf(id) {
  const [teamId, seat] = String(id).split(":");
  const t = Teams.LIST.find((x) => x.id === teamId);
  const d = t && seatDriver(teamId, seat | 0, t.drivers[seat | 0]);
  return (d && d.code) || id;
}

// Close the year out and open the next one. Order matters: development and the
// market are drawn against the season that just finished (and hash on the year
// that just finished), so `year++` and the standings reset come last.
function rollover() {
  if (!career) return null;
  const dStand = driverStandings(), tStand = teamStandings();
  const me = seasonDriverId(career.team, career.seat);
  const myRow = dStand.find((r) => r.id === me);
  const myTeam = tStand.find((r) => r.id === career.team);
  const champ = dStand[0];

  const entry = {
    year: career.year, team: career.team,
    pos: myRow ? myRow.pos : dStand.length, pts: myRow ? myRow.pts : 0,
    cPos: myTeam ? myTeam.pos : tStand.length, cPts: myTeam ? myTeam.pts : 0,
    champion: champ ? (career.season.driverCodes[champ.id] || codeOf(champ.id)) : "",
    wins: career.results.filter((r) => r.p === 1).length,
    podiums: career.results.filter((r) => r.p <= 3).length,
  };
  career.history.push(entry);
  // Ten years of archive is already more than a save will reach, and this is
  // localStorage: an unbounded array is a quota error waiting for a patient player.
  if (career.history.length > HISTORY_MAX)
    career.history.splice(0, career.history.length - HISTORY_MAX);

  rolloverDrivers(dStand);
  rolloverTeams(tStand);
  rolloverMarket();

  const mv = marketValue(dStand);
  if (career.deal && career.deal.left > 0) career.deal.left--;
  career.offers = makeOffers(mv);

  career.year++;
  // MUTATED IN PLACE, never reassigned. game.js holds this exact object as its
  // `season` (openCareer does `season = c.season`), which is the whole reason
  // buildResults/buildStandings/the HUD work in career untouched. Swapping in a
  // fresh object here would silently orphan that alias and the next race would
  // write its points into a dead one.
  const s = career.season;
  s.round = 0; s.pts = {}; s.teamPts = {}; s.driverCodes = {};
  career.results = [];
  career.obj = null;
  save();
  return { year: career.year, champion: entry.champion, summary: entry,
           offers: career.offers, history: career.history };
}

// ---------- calendar ----------
function round() { return career ? career.season.round : 0; }
function roundsTotal() { return Tracks.SEASON.length; }
function seasonDone() { return career ? career.season.round >= Tracks.SEASON.length : false; }
function trackIndex() { return Tracks.seasonIndex(career ? career.season.round : 0); }

// A compact snapshot for the HUD, the hub header and __apex.careerState().
function state() {
  if (!career) return null;
  const team = Teams.LIST.find((t) => t.id === career.team);
  return {
    flavour: career.flavour, year: career.year,
    round: career.season.round, rounds: Tracks.SEASON.length,
    team: career.team, teamName: team ? team.name : career.team,
    money: career.money, rep: career.rep,
    budget: budget(), budgetLvl: career.budgetLvl,
    owned: career.owned.length,
    deal: career.deal, obj: objective(),
    offers: career.offers.length,
    seasons: career.history.length,
  };
}

return {
  PRIZE, RESEARCH_MULT, BUDGET_MULT, TDEV_MAX, START_MONEY,
  OBJ_BONUS, OBJ_REP, DEV_MAX, HISTORY_MAX,
  data, active, inCareer, engage, load, save, clear, start, state, rnd,
  salaryFor, newDeal, expectedFinish, tierFinish, driverOverride, devFor,
  paceMult, teamStats,
  owned, isOwned, researchCost, research, budget, budgetUpgradeCost, upgradeBudget,
  objective, objectiveFor, objectiveLabel, prizeFor, settleRound, worksCost,
  driverStandings, teamStandings, rollover, offers, acceptOffer, marketValue,
  round, roundsTotal, seasonDone, trackIndex,
};
})();
