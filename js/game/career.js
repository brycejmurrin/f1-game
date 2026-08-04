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
// team, so tier 0 ≈ P2, tier 4 ≈ P19. Reputation shifts the bar.
function expectedFinish(team) {
  const base = 2 + team.tier * 4;
  return clamp(base - Math.round(((career ? career.rep : 30) - 50) / 25), 1, 22);
}

// ---------- grid identity ----------
// The driver occupying a seat, when career has replaced whoever teams.js ships
// there. Returns null everywhere else, so makeCars() falls straight through to the
// real 2026 grid outside career.
function driverOverride(teamId, seatIdx) {
  if (!inCareer() || career.flavour !== "driver") return null;
  if (teamId !== career.team || seatIdx !== career.seat) return null;
  return career.driver;
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

  career.money += prize + salary + bonus;
  career.rep = clamp(career.rep + clamp((expectedFinish(team) - pos) * 0.6, -4, 6), 0, 100);
  career.results.push({ r: career.season.round - 1, p: pos, pts });
  save();
  return { pos, pts, prize, salary, bonus, money: career.money, rep: career.rep };
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
    deal: career.deal, obj: career.obj,
    seasons: career.history.length,
  };
}

return {
  PRIZE, RESEARCH_MULT, BUDGET_MULT, TDEV_MAX, START_MONEY,
  data, active, inCareer, engage, load, save, clear, start, state, rnd,
  salaryFor, newDeal, expectedFinish, driverOverride, devFor,
  paceMult, teamStats,
  owned, isOwned, researchCost, research, budget, budgetUpgradeCost, upgradeBudget,
  prizeFor, settleRound, worksCost,
  round, roundsTotal, seasonDone, trackIndex,
};
})();
