/* Apex 26 — CAREER core: the `apex26.career.<flavour>.0..2` saves (three DRIVER
   slots and three MY TEAM slots, one live at a time), the credits economy, driver and team development, per-round settlement
   and the season rollover.

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

// ---------- MY TEAM ----------
// The custom team has no FACTORY_PRESETS entry, so Parts.getFactorySetup() gives
// it the all-cost-0 DEFAULTS and its works cost is zero — which made the fitted
// cap zero too, and every part in the garage unfittable. A startup team is not a
// works team, so this is a deliberate figure rather than a derived one: between
// Haas (570) and Alpine (955), i.e. a real car, off the back of the grid.
const MYTEAM_WORKS = 900;

// Drivers for hire. Codes are chosen not to collide with the 22 on the grid, and
// they carry no ratings table of their own: DriverRatings.get() falls through to
// its deterministic tier hash for an unknown code, so each one has a stable
// personality without a second table to maintain. `ask` is the salary per round.
const FREE_AGENTS = [
  { name: "Matteo Ferrante", code: "FER2", num: 21, tier: 1, ask: 95 },
  { name: "Kai Lindqvist",   code: "LNQ",  num: 34, tier: 1, ask: 84 },
  { name: "Diego Salazar",   code: "SLZ",  num: 19, tier: 2, ask: 62 },
  { name: "Tom Ashcroft",    code: "ASH",  num: 46, tier: 2, ask: 55 },
  { name: "Yuki Nakamura",   code: "NKM",  num: 52, tier: 3, ask: 38 },
  { name: "Pierre Duval",    code: "DVL",  num: 28, tier: 3, ask: 33 },
  { name: "Ravi Chandra",    code: "CHD",  num: 61, tier: 4, ask: 22 },
  { name: "Sam Okonkwo",     code: "OKO",  num: 73, tier: 4, ask: 18 },
];
function freeAgents() { return FREE_AGENTS.slice(); }

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
// FNV-1a alone is NOT enough here, and the failure is specific rather than
// theoretical. Every key this draws on ends in the part that varies — a round
// number, a driver id — and FNV-1a's last multiply barely disturbs the HIGH bits,
// which is exactly the end `h / 2^32` reads. Drawing one of five objectives that
// way gave 24-round seasons where the SAME brief came up every single round, and
// every season was missing at least one kind. This is the standard xorshift-
// multiply finalizer (Murmur3's, via degski's 32-bit constants): it costs two
// multiplies and takes the draw from "100% of seasons miss a kind" to the 2.4%
// that genuinely uniform draws produce.
function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
// The draw with the seed passed in. Exported because js/game/reliability.js needs
// exactly this construction OUTSIDE a career, where there is no career.seed to
// hash on and the sim seed stands in for it — one implementation of the finalizer
// above rather than a second copy that could quietly lose it.
function hash(seed, ...parts) {
  return mix32(hash32(seed + ":" + parts.join(":"))) / 4294967296;
}
function rnd(...parts) {
  return hash(career ? career.seed : 0, ...parts);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------- save lifecycle ----------
// SIX SAVES: three DRIVER-career slots and three MY TEAM slots, kept in separate
// sets so the two modes can never compete for room. `apex26.career.<flavour>.<i>`
// is one key each, and `apex26.careerSlot` names the live one as "flavour:index".
//
// Separate keys rather than one array, because localStorage writes the WHOLE
// value every save(): a single array would rewrite all six careers on every
// round settled, and a quota failure would lose six saves instead of one.
//
// Separate SETS rather than six shared slots, because the two modes are
// different games. A player twelve rounds into a MY TEAM should not have to
// weigh that against trying a driver career, and "which of my three careers do I
// delete to make room" is not a question either mode should be able to ask of
// the other.
const SLOTS = 3;                                  // per flavour
const FLAVOURS = ["driver", "myteam"];
const flavourIn = (f) => (f === "myteam" ? "myteam" : "driver");
const slotKey = (f, i) => "career." + flavourIn(f) + "." + (i | 0);
const slotIn = (i) => clamp(i | 0, 0, SLOTS - 1);
let slotIdx = 0;
let slotFlavour = "driver";

function data() { return career; }
// A career EXISTS (save on disk). For "career rules apply now", use inCareer().
function active() { return career != null; }
// The live save's address. Both halves, because an index alone no longer says
// which career it is.
function slot() { return { flavour: slotFlavour, i: slotIdx }; }

// Two earlier storage layouts have to survive an update.
//
//   `apex26.career`      the single save of the first career build
//   `apex26.career.0..2` three SHARED slots, either flavour in any of them
//
// Both are read, sorted into the per-flavour sets in their original order, and
// their old keys cleared. Order is preserved rather than index: a MY TEAM that
// sat in shared slot 2 becomes MY TEAM slot 1 if it is the second MY TEAM found,
// which is what a player scanning the new screen would expect to see.
function migrateSlots() {
  const found = [];
  const legacy = store.get("career", null);
  if (legacy) { found.push(legacy); store.set("career", null); }
  for (let i = 0; i < SLOTS; i++) {
    const c = store.get("career." + i, null);
    if (c) { found.push(c); store.set("career." + i, null); }
  }
  if (!found.length) return;
  const next = { driver: 0, myteam: 0 };
  for (const c of found) {
    const f = flavourIn(c && c.flavour);
    // Never overwrite: a set that already holds saves is the current layout, and
    // a stale key left behind by a half-finished migration must not clobber it.
    while (next[f] < SLOTS && store.get(slotKey(f, next[f]), null)) next[f]++;
    if (next[f] >= SLOTS) continue;             // full — the old save is dropped
    store.set(slotKey(f, next[f]), c);
    next[f]++;
  }
}
const readSlot = (f, i) => migrateCareer(store.get(slotKey(f, i), null));

function load() {
  migrateSlots();
  const live = String(store.get("careerSlot", "driver:0")).split(":");
  slotFlavour = flavourIn(live[0]);
  slotIdx = slotIn(live[1]);
  career = readSlot(slotFlavour, slotIdx);
  // The remembered slot can be empty — it was deleted, or the player started
  // somewhere else. Fall through to the first save anywhere, because the title
  // button offers CONTINUE and it has to continue something. Nothing at all is a
  // genuine null: a first-time player.
  if (!career)
    outer: for (const f of FLAVOURS)
      for (let i = 0; i < SLOTS; i++) {
        const c = readSlot(f, i);
        if (c) { slotFlavour = f; slotIdx = i; career = c; setLive(); break outer; }
      }
  // migrateCareer() is pure (it must not write, or reading a slot would rewrite
  // the key it was migrated FROM), so persisting the climbed shape is this
  // function's job — otherwise a v0 save would migrate in memory on every boot
  // and never on disk, and the next build's ladder would start from v0 again.
  return save();
}
function setLive() { store.set("careerSlot", slotFlavour + ":" + slotIdx); }
function save() {
  if (career) store.set(slotKey(slotFlavour, slotIdx), career);
  return career;
}
// Wipes the LIVE slot only. The other five are untouched — deleting one career
// must never be a way to lose the others.
function clear() {
  career = null;
  store.set(slotKey(slotFlavour, slotIdx), null);
}

// What the picker renders. The LIVE slot is summarised from the in-memory object
// rather than from storage: a round settled but not yet written would otherwise
// show the disk copy and read as lost progress.
function slotInfo(c, f, i) {
  if (!c) return { flavour: f, i, used: false };
  const team = Teams.LIST.find((t) => t.id === c.team);
  const hist = c.history || [];
  return {
    flavour: f, i, used: true, year: c.year,
    live: f === slotFlavour && i === slotIdx,
    round: c.season.round, rounds: Tracks.SEASON.length,
    team: c.team, teamName: team ? team.name : c.team,
    code: c.driver ? c.driver.code : "", name: c.driver ? c.driver.name : "",
    money: c.money, rep: c.rep,
    seasons: hist.length + 1,
    titles: hist.filter((h) => h.pos === 1).length,
    wins: hist.reduce((n, h) => n + (h.wins || 0), 0)
        + (c.results || []).filter((r) => r.p === 1).length,
  };
}
// One flavour's three, or all six when asked for neither.
function slots(flavour) {
  const fl = flavour == null ? FLAVOURS : [flavourIn(flavour)];
  const out = [];
  for (const f of fl)
    for (let i = 0; i < SLOTS; i++) {
      const live = f === slotFlavour && i === slotIdx && career;
      out.push(slotInfo(live ? career : readSlot(f, i), f, i));
    }
  return out;
}
function anySave(flavour) { return slots(flavour).some((s) => s.used); }
// The lowest free slot in a set, or -1. Lowest rather than "after the live one"
// so NEW CAREER always fills the first gap the player can see.
function firstFree(flavour) {
  const set = slots(flavour);
  for (const s of set) if (!s.used) return s.i;
  return -1;
}

// Switch. SAVES THE ONE BEING LEFT FIRST — settleRound() already persists, but a
// garage edit or an accepted offer between rounds lives on the object until
// something calls save(), and switching away is exactly when that would be lost.
function useSlot(flavour, i) {
  const f = flavourIn(flavour), n = slotIn(i);
  if (career && (f !== slotFlavour || n !== slotIdx)) save();
  slotFlavour = f; slotIdx = n;
  setLive();
  career = readSlot(f, n);
  return career;
}
function deleteSlot(flavour, i) {
  const f = flavourIn(flavour), n = slotIn(i);
  store.set(slotKey(f, n), null);
  if (f === slotFlavour && n === slotIdx) career = null;
  return true;
}

// A fresh career. `teamId` is who you drive for (driver flavour) or who you own
// (my team). The starting garage is seeded with the team's OWN factory build, so
// your career car begins as that team's real 2026 car — signature parts and all —
// rather than a stripped default nobody would want to drive.
// `slot` says WHERE it goes; omitted, it replaces whatever is in the live slot,
// which is what the setup screen wants after the picker has already chosen one.
function start(opts) {
  const o = opts || {};
  const flavour = flavourIn(o.flavour);
  // WHICH SET is decided by the career's own flavour, never by the caller: a
  // driver career belongs in the driver set by definition, and letting an
  // argument override that is how a MY TEAM ends up filling a driver slot.
  // WHICH SLOT is `o.slot`, or the first free one, or — when the set is full —
  // whichever is live there, which is the only remaining meaning of "start one".
  const target = o.slot != null ? slotIn(o.slot)
    : firstFree(flavour) >= 0 ? firstFree(flavour)
    : (flavour === slotFlavour ? slotIdx : 0);
  // Save the career being left before the new one takes its place — starting a
  // career must not cost an unsaved change in the one you were playing.
  if (career && (flavour !== slotFlavour || target !== slotIdx)) save();
  slotFlavour = flavour;
  slotIdx = target;
  setLive();
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
    facility: 0,          // the open-ended research facility
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} },
    results: [],
    owned: Object.values(factory),
    fitted: Object.assign({}, factory),
    deal: null,             // filled by contract() below
    offers: [],
    dev: {}, tdev: {}, seats: {},
    moves: [],            // what the winter market did, for the season summary
    // Which sponsor windows have already paid. migrateCareer() fills this for
    // a loaded save, so ONLY a freshly started career was ever missing it —
    // and settleSponsor() creates it lazily, so nothing noticed until a test
    // read it before the first window closed.
    paidSponsors: [],
    obj: null,
    history: [],
    // MY TEAM only. You own the team and drive one of its two cars; `roster` is
    // the OTHER seat — a driver you hire and pay every round. Null in a driver
    // career, where the team already has two drivers of its own.
    roster: null,
  };
  if (flavour === "myteam") {
    const hired = FREE_AGENTS.find((a) => a.code === o.hire) || FREE_AGENTS[FREE_AGENTS.length - 3];
    career.roster = [{ name: hired.name, code: hired.code, num: hired.num,
                       tier: hired.tier, salary: hired.ask, left: 1, pending: null }];
  }
  career.deal = newDeal(team, 1);
  return save();
}

// ---------- contract ----------
// Salary rises with reputation and RISES as the car gets worse: a back-marker has
// to pay more to get anyone to sign, and that is the mechanism that stops an
// early career being unwinnable.
//
// The tier term used to read `(4 - team.tier) * 15`, which is the opposite of
// what the sentence above describes — tier 0 is the BEST car, so the best seat
// paid the most and the worst paid the least. tools/career-economy.mjs is what
// caught it: a tier-4 season earned 4.0-4.8k against a tier-3 season's 5.8-7.5k,
// so the slowest cars on the grid also earned ~35% less to fix themselves with.
// The mode already hands them the disadvantage; the economy was compounding it.
function salaryFor(team, rep) {
  return Math.round(20 + rep * 1.2 + team.tier * 15);
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
  // MY TEAM: seat 0 is you, seat 1 is whoever you hired. The custom team ships
  // with a single driver, so seat 1 only exists because gridDrivers() below adds
  // it — this is what fills it.
  if (career.flavour === "myteam" && teamId === career.team) {
    if (seatIdx === 0) return career.driver;
    const hired = career.roster && career.roster[0];
    return hired ? { name: hired.name, code: hired.code, num: hired.num } : null;
  }
  return seatDriver(teamId, seatIdx, null);
}

// The seats makeCars() should build for a team. Normally the team's own drivers;
// for the MY TEAM custom team it is TWO, because you own a constructor and a
// constructor enters two cars. Returning team.drivers unchanged everywhere else
// keeps free play (where the custom team is a single entry) exactly as it was.
function gridDrivers(team) {
  if (!inCareer() || !team) return team && team.drivers;
  if (career.flavour !== "myteam" || team.id !== career.team) return team.drivers;
  const hired = career.roster && career.roster[0];
  if (!hired) return team.drivers;
  return [career.driver, { name: hired.name, code: hired.code, num: hired.num }];
}

// What the team-mate costs per round. Zero in a driver career: there you ARE the
// wage bill, and it is paid TO you.
function wageBill() {
  if (!inCareer() || career.flavour !== "myteam" || !career.roster) return 0;
  return career.roster.reduce((n, d) => n + (d.salary || 0), 0);
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
// The facility's discount lands HERE rather than at the point of sale, so the
// garage's RESEARCH price and what the balance is actually charged can never
// disagree — the row shows the number the player pays.
function researchCost(opt) {
  return Math.round((opt.cost || 0) * RESEARCH_MULT * (1 - facilityDiscount()));
}

// What the team's own works car costs to build — the baseline every career budget
// is measured against. Memoised per team: Parts.getFactorySetup is already cached,
// but getCost walks all 12 categories and the garage asks for this on every render.
const _worksCost = new Map();
function worksCost(teamId) {
  if (_worksCost.has(teamId)) return _worksCost.get(teamId);
  const team = Teams.LIST.find((t) => t.id === teamId);
  // The custom team has no factory preset, so its resolved build is the cost-0
  // DEFAULTS — a zero baseline, and therefore a zero fitted cap that nothing can
  // be fitted under. MY TEAM gets a startup car's worth instead.
  const c = !team ? 0
    : team.custom ? MYTEAM_WORKS
    : Parts.getCost(Parts.getFactorySetup(team), team);
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

// ---------- extra funds ----------
// A deliberate cheat, and stored OUTSIDE the save (`apex26.career.freeMoney`)
// because it is a preference about how you want to play, not a fact about one
// career — turning it on should not be something you have to redo per slot, and
// deleting a career should not silently re-arm the economy.
//
// The career garage hides FREE BUILD precisely because an unlimited parts budget
// would hand away the economy the mode is built on. This is the same trade made
// explicit and reversible instead of hidden: money stops being scarce, the
// FITTED CAP does not move, and every other rule stands. So an unlimited balance
// still cannot put more on the car than the cap allows — which is the constraint
// that actually makes a weekend a choice.
const GRANT = 5000;
function freeMoney(on) {
  if (on !== undefined) store.set("career.freeMoney", !!on);
  return !!store.get("career.freeMoney", false);
}
// Hand yourself credits. Returns the new balance, or null with no career loaded.
function grant(n) {
  if (!career) return null;
  career.money += Math.max(0, Math.round(Number(n) || GRANT));
  save();
  return career.money;
}
// What a purchase actually costs the balance. Zero under free money, so the
// ownership and cap rules below run completely unchanged — there is no second
// code path for a cheated career to diverge down.
const charge = (cost) => (freeMoney() ? 0 : cost);

// Buy an option outright. Returns false when it cannot be afforded or is already
// owned, so the caller can play the existing budget-reject animation.
function research(opt) {
  if (!career || !opt) return false;
  if (career.owned.indexOf(opt.id) >= 0) return false;
  const cost = charge(researchCost(opt));
  if (cost > career.money) return false;
  career.money -= cost;
  career.owned.push(opt.id);
  save();
  return true;
}
function upgradeBudget() {
  const cost = charge(budgetUpgradeCost());
  if (!career || budgetUpgradeCost() == null || cost > career.money) return false;
  career.money -= cost;
  career.budgetLvl++;
  save();
  return true;
}

// ---------- MY TEAM: sponsors ----------
// A driver is paid a salary; an owner is paid by SPONSORS. That is the second
// income the two modes should not share, and it is the one thing MY TEAM had
// nothing of — it started with more money and then earned exactly like a driver.
//
// A sponsor is a MULTI-ROUND brief. The per-round objective already asks "how
// did this weekend go"; a sponsor asks "how is the season going", which is the
// question a team principal is actually judged on. Deliberately built out of the
// same parts as the round objective rather than a second system: a type, a
// value, and a pure draw off the career seed.
const SPONSOR_KINDS = [
  // Every one is measured over a WINDOW of consecutive rounds, so a single lucky
  // weekend cannot pay it and a single bad one does not sink it.
  { type: "points", window: 5, value: (t) => Math.max(2, 14 - t.tier * 2), pay: 600 },
  { type: "finishes", window: 4, value: () => 3, pay: 450 },
  { type: "double", window: 6, value: () => 2, pay: 800 },
  { type: "clean", window: 4, value: () => 4, pay: 400 },
];
const SPONSOR_LABELS = {
  points: (v, w) => "Score " + v + " points across " + w + " rounds",
  finishes: (v, w) => "Finish " + v + " of the next " + w + " rounds in the points",
  double: (v, w) => "Get BOTH cars home in the points " + v + " times in " + w + " rounds",
  clean: (v, w) => "Keep it clean — no retirements, no penalties — for " + w + " rounds",
};
function sponsorLabel(sp) {
  const f = sp && SPONSOR_LABELS[sp.type];
  return f ? f(sp.value, sp.window) : "";
}

// The deal running right now, drawn once per window and pure in (seed, year,
// windowIndex) so it survives a reload and cannot be rerolled.
// The deal covering a GIVEN round. Parameterised because the two callers ask
// about different rounds and conflating them cost the whole mechanic: the hub
// wants the window the season is in NOW, but settlement runs after
// endRace()/simCareerRound() have already advanced season.round, so it has to
// ask about the round that was just RACED. Reading the live round there meant
// settleSponsor() always inspected the NEXT window, whose end is by definition
// still ahead — so its guard was always true, it always returned early, and no
// sponsor ever paid out at all.
function sponsorAt(round) {
  if (!career || career.flavour !== "myteam") return null;
  const team = Teams.LIST.find((t) => t.id === career.team) || { tier: 2 };
  // Which window that round falls in. Windows tile the season from round 0.
  let start = 0, idx = 0, kind = null;
  while (start <= round) {
    const i = Math.floor(rnd(career.year, "spon", idx) * SPONSOR_KINDS.length);
    kind = SPONSOR_KINDS[Math.min(i, SPONSOR_KINDS.length - 1)];
    if (start + kind.window > round) break;
    start += kind.window;
    idx++;
  }
  if (!kind) return null;
  const value = kind.value(team);
  // Progress is read off the results the season already recorded — no second
  // ledger to keep in step, and a settled round counts the moment it settles.
  const rows = (career.results || []).filter((r) => r.r >= start && r.r < start + kind.window);
  let done = 0;
  for (const r of rows) {
    if (kind.type === "points") done += r.pts || 0;
    else if (kind.type === "finishes") done += (r.pts || 0) > 0 ? 1 : 0;
    else if (kind.type === "double") done += r.double ? 1 : 0;
    else if (kind.type === "clean") done += (!r.dnf && r.clean) ? 1 : 0;
  }
  const need = kind.type === "points" ? value : kind.type === "clean" ? kind.window : value;
  return {
    type: kind.type, value, window: kind.window, pay: kind.pay,
    start, end: start + kind.window - 1, idx,
    done, need, met: done >= need,
    roundsLeft: Math.max(0, start + kind.window - 1 - round),
    label: sponsorLabel({ type: kind.type, value, window: kind.window }),
  };
}
// Gated on the SAVE, not on inCareer(): this describes which deal is running —
// a save/UI accessor like state() and data(), not a gameplay rule — and gating
// it on "a career is being played" made it read as null any time the save was
// merely loaded, which is exactly what a reload leaves you with. The rule that
// MOVES MONEY is settleSponsor(), reached only through settleRound(), which is
// gated. The money stays protected; the description stays readable.
function sponsor() { return career ? sponsorAt(career.season.round) : null; }
// Paid ONCE, at the round that closes the window, and only if it was met.
// `career.paidSponsors` records which windows have paid so a reload cannot
// double-pay and an unmet window cannot be retried by replaying the round.
function settleSponsor() {
  // The round just RACED, not the one the calendar has moved on to.
  const raced = career.season.round - 1;
  const sp = sponsorAt(raced);
  if (!sp || raced < sp.end) return 0;
  career.paidSponsors = career.paidSponsors || [];
  if (career.paidSponsors.indexOf(sp.idx) >= 0) return 0;
  career.paidSponsors.push(sp.idx);
  if (!sp.met) return 0;
  career.money += sp.pay;
  return sp.pay;
}

// ---------- the facility: the sink that does not run out ----------
// Ownership only ever grows and the budget ladder stops at three, so a
// successful career converged on owning the whole catalog with nothing left to
// spend on — the mode had no end game. FACILITY is an open-ended track that
// keeps buying something real: each level is a permanent slice off what research
// costs, so late money still converts into progress rather than sitting there.
//
// Priced to stay meaningful against a maxed-out career rather than to be
// finished: the cost grows geometrically while the discount grows linearly and
// is capped, so it is always affordable-in-principle and never trivialises the
// catalog.
const FACILITY_MAX = 8;
const FACILITY_BASE = 3000;
const FACILITY_STEP = 1.6;          // each level costs 1.6x the last
const FACILITY_DISCOUNT = 0.05;     // per level, off research cost
const FACILITY_DISCOUNT_MAX = 0.40;

function facility() { return career ? clamp(career.facility | 0, 0, FACILITY_MAX) : 0; }
function facilityCost() {
  const lvl = facility();
  return lvl >= FACILITY_MAX ? null
    : Math.round(FACILITY_BASE * Math.pow(FACILITY_STEP, lvl) / 50) * 50;
}
// What the facility takes off a research bill, 0..FACILITY_DISCOUNT_MAX.
function facilityDiscount() {
  return Math.min(FACILITY_DISCOUNT_MAX, facility() * FACILITY_DISCOUNT);
}
function upgradeFacility() {
  const raw = facilityCost();
  if (!career || raw == null) return false;
  const cost = charge(raw);
  if (cost > career.money) return false;
  career.money -= cost;
  career.facility = facility() + 1;
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
    // A retirement is not a clean race. Even a mechanical one: the brief asks for
    // a race completed without incident, and a car in the barriers on lap two has
    // not completed anything. Paying the bonus for a DNF would make the one round
    // you did not race the cheapest one to bank.
    case "clean": return !ctx.player.retired && !(ctx.player.cuts | 0) && !(ctx.player.penalty | 0);
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
  // A retirement scores nothing — the same rule endRace() awards on. Recomputing
  // it from position alone would disagree with the championship the moment a
  // race loses enough cars for a DNF to land inside the top ten.
  const pts = player.retired ? 0 : (Teams.POINTS[pos - 1] || 0);
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
  // MY TEAM pays its second driver every round. Real driver salaries sit OUTSIDE
  // the development cost cap, and so does this: it comes off the balance, never
  // off the fitted cap, so hiring well costs you upgrades rather than legality.
  const wages = wageBill();
  career.money += prize + salary + bonus + (obj.done ? OBJ_BONUS : 0) - wages;
  const repDelta = clamp((expectedFinish(team) - pos) * 0.6, -4, 6)
                 + (obj.done ? OBJ_REP : -OBJ_REP);
  career.rep = clamp(career.rep + repDelta, 0, 100);
  // The reason, not just the fact: `dnf` is null for a finish and "engine" /
  // "gearbox" / "accident" for a retirement, so the archive can say WHY a season
  // came apart. Classification (and therefore prize money) already handles the
  // cost of it — a retirement is last, and last pays the tail.
  const dnf = player.retired ? (player.dnf || "mechanical") : null;
  // Two extra facts the SPONSOR windows read. Recorded here rather than derived
  // later because the cars are live right now and will not be by the time the
  // window closes: `double` is both your cars in the points (MY TEAM only), and
  // `clean` is the same test the round objective uses.
  const matePts = mate ? (Teams.POINTS[order.indexOf(mate)] || 0) : 0;
  const dbl = career.flavour === "myteam" && pts > 0 && matePts > 0;
  const cleanRun = !player.retired && !(player.cuts | 0) && !(player.penalty | 0);
  career.results.push({ r: raced, p: pos, pts, obj: obj.done, dnf,
                        double: dbl, clean: cleanRun });
  career.obj = null;          // the next round draws its own brief on demand
  // A sponsor pays after the round is on the books, because that round is what
  // closes its window.
  const sponsorPay = settleSponsor();
  save();
  return { pos, pts, prize, salary, bonus, wages, obj, dnf, sponsorPay,
           money: career.money, rep: career.rep };
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
  // The moves are RECORDED, not just made. The market has always swapped seats
  // and the player never learned about it — the grid simply looked different
  // next year, which reads as the game being inconsistent rather than as a
  // story. `career.moves` is what the season summary prints.
  career.moves = [];
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
    career.moves.push({
      code: mid.driver.code, name: mid.driver.name,
      from: mid.team.id, fromName: mid.team.name,
      to: top.team.id, toName: top.team.name,
      out: top.driver.code, outName: top.driver.name,
    });
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

// ---------- MY TEAM: the hire's contract ----------
// A hired driver is on a deal like anyone else. At the end of a season theirs
// ticks down, and when it expires one of three things happens — they ask for
// more, they walk, or they re-sign at the same money. Which one is not a die
// roll: it follows what the seat was actually worth to them.
const HIRE_MIN = 12;          // nobody drives for nothing
const HIRE_RAISE_MAX = 0.45;  // the steepest ask a good year can produce

// What a driver thinks the seat is worth next year, from what THEY did in it.
// Beating the car's expectation is worth money; being beaten by it is a pay cut.
function hireAsk(hire, pos, expected) {
  const beat = clamp((expected - pos) / 8, -0.35, HIRE_RAISE_MAX);
  return Math.max(HIRE_MIN, Math.round((hire.salary || HIRE_MIN) * (1 + beat)));
}

// Runs at the rollover, before offers are drawn. Writes `pending` onto the hire
// rather than resolving it: the DECISION is the player's, and the hub is where
// they make it. A hire with nothing pending is simply under contract.
function rolloverHire(dStand) {
  if (career.flavour !== "myteam" || !career.roster || !career.roster[0]) return;
  const hire = career.roster[0];
  if (hire.left > 0) hire.left--;
  if (hire.left > 0) { hire.pending = null; return; }
  const team = Teams.LIST.find((t) => t.id === career.team);
  const id = seasonDriverId(career.team, 1);
  const rowOf = dStand.find((r) => r.id === id);
  const pos = rowOf ? rowOf.pos : dStand.length;
  const expected = team ? tierFinish(team) : 12;
  // A driver who had a genuinely good year in a startup team gets looked at by
  // the rest of the grid, and sometimes simply goes. Deterministic off the
  // career seed, and only ever possible when they OUTPERFORMED — losing a driver
  // who was beaten all year would read as a bug rather than a story.
  const poached = pos < expected - 4
    && rnd(career.year, "hire", "poach") < 0.35;
  hire.pending = poached
    ? { kind: "left", ask: 0 }
    : { kind: "renew", ask: hireAsk(hire, pos, expected) };
}

// Take the pending offer: pay the new figure and re-sign for a year.
function renewHire(years) {
  const hire = career.roster && career.roster[0];
  if (!hire || !hire.pending || hire.pending.kind !== "renew") return false;
  hire.salary = hire.pending.ask;
  hire.left = clamp(years | 0 || 1, 1, 3);
  hire.pending = null;
  save();
  return true;
}
// Sign somebody else from the market. The seat is empty either way once a
// contract has expired, so this is also how a "left" is resolved.
function hireDriver(code, years) {
  if (career.flavour !== "myteam") return false;
  const a = FREE_AGENTS.find((x) => x.code === code);
  if (!a) return false;
  career.roster = [{ name: a.name, code: a.code, num: a.num, tier: a.tier,
                     salary: a.ask, left: clamp(years | 0 || 1, 1, 3), pending: null }];
  save();
  return true;
}
// Whether the seat needs a decision before the season can start.
function hirePending() {
  const hire = career.roster && career.roster[0];
  return hire && hire.pending ? Object.assign({ code: hire.code, name: hire.name,
    salary: hire.salary }, hire.pending) : null;
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
  // MY TEAM IS NOT A SEAT. You own the constructor, so nobody signs you and there
  // is nothing to renew — and an offer accepted here was actively destructive:
  // acceptOffer() moves career.team while `flavour` stays "myteam", so the next
  // makeCars() put you and your hired driver into the seats of a real team and
  // dropped the custom team off the grid entirely. The career you were playing
  // simply stopped existing. An empty list is also what the hub already handles:
  // with no seat to sign it goes straight to NEXT RACE.
  if (career.flavour === "myteam") return [];
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
  // An owner's deal has no clock to run down: there is no year at which you stop
  // being allowed to drive your own car, and counting to zero only ever showed
  // "Seasons left 0" on the hub for the rest of the save.
  if (career.flavour !== "myteam" && career.deal && career.deal.left > 0) career.deal.left--;
  // YOUR HIRE'S contract does run. `left` was written when they were signed and
  // then read by nothing at all — the driver could never be renewed, replaced or
  // lost, which made the one relationship MY TEAM is built on a static number.
  rolloverHire(dStand);
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
  // Sponsor windows are indexed WITHIN a season (sponsorAt walks from round 0), so
  // this has to be cleared with the round counter or year two starts at window 0
  // with 0 already recorded as paid — and settleSponsor() then returns 0 at every
  // window for the rest of the career. MY TEAM silently loses its whole second
  // income stream from season two on, with the hub still showing the brief and
  // its fee. The within-season double-pay guard this array exists for is
  // unaffected: it only has to hold until the season ends.
  career.paidSponsors = [];
  save();
  return { year: career.year, champion: entry.champion, summary: entry,
           offers: career.offers, history: career.history, moves: career.moves };
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
    facility: facility(), facilityCost: facilityCost(),
    facilityDiscount: facilityDiscount(),
    owned: career.owned.length,
    deal: career.deal, obj: objective(),
    // Retirements this season, off the same results rows the archive counts wins
    // and podiums from — a season's reliability record with no second ledger.
    dnfs: career.results.filter((r) => r.dnf).length,
    // MY TEAM only; null in a driver career, where you are the wage bill.
    roster: career.roster, wages: wageBill(), hire: hirePending(),
    sponsor: sponsor(),
    offers: career.offers.length, moves: (career.moves || []).length,
    seasons: career.history.length,
    slot: slotIdx, slotFlavour,
    slotsUsed: slots(career.flavour).filter((s) => s.used).length,
    slotsTotal: SLOTS,
  };
}

return {
  PRIZE, RESEARCH_MULT, BUDGET_MULT, TDEV_MAX, TDEV_TO_PACE, START_MONEY,
  OBJ_BONUS, OBJ_REP, DEV_MAX, HISTORY_MAX,
  SLOTS, FLAVOURS, slot, slots, useSlot, deleteSlot, anySave, firstFree,
  data, active, inCareer, engage, load, save, clear, start, state, rnd, hash,
  GRANT, freeMoney, grant,
  sponsor, sponsorAt, sponsorLabel, settleSponsor,
  FACILITY_MAX, FACILITY_DISCOUNT_MAX, facility, facilityCost, facilityDiscount,
  upgradeFacility, SPONSOR_KINDS,
  renewHire, hireDriver, hirePending, HIRE_MIN,
  salaryFor, newDeal, expectedFinish, tierFinish, driverOverride, devFor,
  gridDrivers, wageBill, freeAgents, MYTEAM_WORKS,
  paceMult, teamStats,
  owned, isOwned, researchCost, research, budget, budgetUpgradeCost, upgradeBudget,
  objective, objectiveFor, objectiveLabel, prizeFor, settleRound, worksCost,
  driverStandings, teamStandings, rollover, offers, acceptOffer, marketValue, offerBar,
  round, roundsTotal, seasonDone, trackIndex,
};
})();
