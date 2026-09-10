/* Apex 26 — CAREER core: the `apex26.career.<flavour>.0..2` saves (three DRIVER slots and three MY TEAM slots, one live at a time), the credits economy, driver an… */
const Career = (function () {
  "use strict";

const { store, seasonDriverId, migrateCareer } = GameStore;
const clamp = M4.clamp;

const START_MONEY = { driver: 1200, myteam: 2000 };
const START_REP = { driver: 30, myteam: 50 };

const PRIZE = [900, 700, 560, 460, 380, 320, 270, 230, 200, 170];
const PRIZE_MID = 120;    // P11..P15
const PRIZE_TAIL = 80;    // P16+

// Research costs a multiple of the catalog price: the catalog says what a part
// is WORTH, this one number sets the pace of the whole economy.
const RESEARCH_MULT = 3;

const BUDGET_MULT = [1.0, 1.15, 1.35, 1.6];
const BUDGET_UPGRADE = [2500, 5000, 9000];   // cost to reach level 1 / 2 / 3

// Team development is stat points converted to a pace multiplier here: ±8 points
// is ±2%, a little over one TIER_V step (0.988 → 0.973 is 1.5%), so a team can
// climb or fall a tier over a few seasons without `team.tier` ever changing
// (it drives the grid sort, the mesh presets and the colours).
const TDEV_MAX = 8;
const TDEV_TO_PACE = 0.0025;

const MYTEAM_WORKS = 900;

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

const OBJ_BONUS = 150;
const OBJ_REP = 2;

const HISTORY_MAX = 10;
const DEV_MAX = 12;
const EXP_MAX = 40;

const teamOf = (id) => Teams.LIST.find((t) => t.id === id);
const driverRec = (d) => ({ name: d.name, code: d.code, num: d.num });

let career = null;        // the loaded save, or null
let engaged = false;
function engage(on) { engaged = !!on; }
function inCareer() { return engaged && career != null; }

// Career draws never touch simRnd(): consuming that stream here would make a
// career's existence change seeded race results. A STATELESS hash has no cursor
// to persist, so a save/load round-trip cannot desync it.
function hash(seed, ...parts) {
  return Hash32.unit(seed, ...parts);
}
function rnd(...parts) {
  return hash(career ? career.seed : 0, ...parts);
}

// SIX SAVES: three DRIVER slots and three MY TEAM slots, `apex26.career.<flavour>.<i>`
// one key each, `apex26.careerSlot` naming the live one as "flavour:index".
// Separate keys, not one array: localStorage writes the WHOLE value per save(),
// and a quota failure would lose six saves instead of one. Separate SETS, not
// six shared slots: the two modes are different games and must never compete
// for room.
const SLOTS = 3;                                  // per flavour
const FLAVOURS = ["driver", "myteam"];
const flavourIn = (f) => (f === "myteam" ? "myteam" : "driver");
const slotKey = (f, i) => `career.${flavourIn(f)}.${i | 0}`;
const slotIn = (i) => clamp(i | 0, 0, SLOTS - 1);
let slotIdx = 0;
let slotFlavour = "driver";
let careerRevision = null;
let careerConflict = false;

const liveSlotKey = () => slotKey(slotFlavour, slotIdx);
const currentRevision = () => store.keyRevision ? store.keyRevision(liveSlotKey()) : null;
function armRevision() { careerRevision = currentRevision(); careerConflict = false; }

function data() { return career; }
function conflicted() { return careerConflict; }
// A career EXISTS (save on disk). For "career rules apply now", use inCareer().
function active() { return career != null; }
function slot() { return { flavour: slotFlavour, i: slotIdx }; }

function migrateSlots() {
  const found = [];
  const legacy = store.get("career", null);
  if (legacy) found.push({ source: "career", value: legacy });
  for (let i = 0; i < SLOTS; i++) {
    const c = store.get(`career.${i}`, null);
    if (c) found.push({ source: `career.${i}`, value: c });
  }
  if (!found.length) return;
  const next = { driver: 0, myteam: 0 };
  for (const item of found) {
    const c = item.value;
    const f = flavourIn(c && c.flavour);
    // Never overwrite: a set that already holds saves is the current layout, and
    // a stale key left behind by a half-finished migration must not clobber it.
    while (next[f] < SLOTS && store.get(slotKey(f, next[f]), null)) next[f]++;
    if (next[f] >= SLOTS) continue;
    if (!store.set(slotKey(f, next[f]), c)) continue;
    store.set(item.source, null);
    next[f]++;
  }
}
const readSlot = (f, i) => migrateCareer(store.get(slotKey(f, i), null));

if (store.subscribe) store.subscribe((change) => {
  if (!change.foreign) return;
  if (!change.clear && change.key !== liveSlotKey()) return;
  if (engaged && career) {
    careerConflict = true;
    return;
  }
  career = change.clear ? null : readSlot(slotFlavour, slotIdx);
  armRevision();
});

function load() {
  migrateSlots();
  const live = String(store.get("careerSlot", "driver:0")).split(":");
  slotFlavour = flavourIn(live[0]);
  slotIdx = slotIn(live[1]);
  career = readSlot(slotFlavour, slotIdx);
  if (!career)
    outer: for (const f of FLAVOURS)
      for (let i = 0; i < SLOTS; i++) {
        const c = readSlot(f, i);
        if (c) { slotFlavour = f; slotIdx = i; career = c; setLive(); break outer; }
      }
  armRevision();
  // migrateCareer() is pure (it must not write, or reading a slot would rewrite
  // the key it was migrated FROM), so persisting the climbed shape is this
  // function's job — otherwise a v0 save would migrate in memory on every boot
  // and never on disk, and the next build's ladder would start from v0 again.
  save();
  return career;
}
function setLive() { store.set("careerSlot", `${slotFlavour}:${slotIdx}`); }
let lastSave = { ok: true, durable: true, reason: null };
function writeResult(key, value) {
  if (typeof store.write === "function") return store.write(key, value);
  const durable = store.set(key, value) !== false;
  return { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
}
function save() {
  if (career) {
    // A storage event invalidates GameStore's parsed cache, but this module owns a
    // long-lived object reference. Never write that reference over a newer save
    // from another tab. There is no meaningful merge for two diverged seasons;
    // refusing the stale write is the only lossless choice.
    const now = currentRevision();
    if (careerConflict || (careerRevision != null && now !== careerRevision)) {
      lastSave = { ok: false, durable: false, reason: "conflict" };
      return career;
    }
    lastSave = writeResult(liveSlotKey(), career);
    armRevision();
  }
  return career;
}
function saveStatus() { save(); return Object.assign({}, lastSave); }
// Wipes the LIVE slot only. The other five are untouched — deleting one career
// must never be a way to lose the others.
function clear() {
  career = null;
  store.set(liveSlotKey(), null);
  armRevision();
}

function slotInfo(c, f, i) {
  if (!c) return { flavour: f, i, used: false };
  const team = teamOf(c.team);
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
function firstFree(flavour) {
  const set = slots(flavour);
  for (const s of set) if (!s.used) return s.i;
  return -1;
}

function useSlot(flavour, i) {
  const f = flavourIn(flavour);
  const n = slotIn(i);
  if (career && (f !== slotFlavour || n !== slotIdx)) save();
  slotFlavour = f;
  slotIdx = n;
  setLive();
  career = readSlot(f, n);
  armRevision();
  return career;
}
function deleteSlot(flavour, i) {
  const f = flavourIn(flavour);
  const n = slotIn(i);
  store.set(slotKey(f, n), null);
  if (f === slotFlavour && n === slotIdx) { career = null; armRevision(); }
  return true;
}

function rosterEntry(agent, left) {
  return { name: agent.name, code: agent.code, num: agent.num,
           tier: agent.tier, salary: agent.ask, left, pending: null };
}

function start(opts) {
  const o = opts || {};
  const flavour = flavourIn(o.flavour);
  // WHICH SET is the career's own flavour, never the caller's: a MY TEAM must not
  // fill a driver slot. WHICH SLOT is `o.slot`, else the first free one, else the
  // live one in this set. A FULL set with no slot named REFUSES (null): the old
  // hard-coded 0 silently destroyed that slot's career whenever the live pointer
  // was in the other flavour, and the caller opens the slot picker instead.
  const free = firstFree(flavour);   // once — each call walks the slot store
  const target = o.slot != null ? slotIn(o.slot)
    : free >= 0 ? free
    : (flavour === slotFlavour ? slotIdx : -1);
  if (target < 0) return null;
  // Save the career being left before the new one takes its place — starting a
  // career must not cost an unsaved change in the one you were playing.
  if (career && (flavour !== slotFlavour || target !== slotIdx)) save();
  slotFlavour = flavour;
  slotIdx = target;
  setLive();
  armRevision();
  const teamId = o.teamId || (flavour === "myteam" ? "custom" : "haas");
  const team = teamOf(teamId) || Teams.LIST[Teams.LIST.length - 1];
  const factory = Parts.getFactorySetup(team);

  career = {
    v: GameStore.CAREER_V,
    flavour,
    year: 2026,
    seed: (o.seed | 0) || (Hash32.fnv1a(`${teamId}:${flavour}:${Date.now()}`) % 1000000),
    team: teamId,
    // MY TEAM IS ALWAYS SEAT 0 (driverOverride maps seat 0 to you, seat 1 to the
    // hire). Forced HERE, not in the draft: freshDraft() starts at seat 1 and the
    // MY TEAM form never reset it, so every MY TEAM save raced under the hired
    // driver's name while the AI drove yours; __apex.career() omits seat too.
    seat: flavour === "myteam" ? 0 : (o.seat | 0),
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
    paidSponsors: [],
    obj: null,
    history: [],
    roster: null,
  };
  if (flavour === "myteam") {
    const hired = FREE_AGENTS.find((a) => a.code === o.hire) || FREE_AGENTS[FREE_AGENTS.length - 3];
    career.roster = [rosterEntry(hired, 1)];
  }
  career.deal = newDeal(team, 1);
  Log.info("game", `Career.start flavour=${flavour} team=${teamId}`);
  return save();
}

function salaryFor(team, rep) {
  return Math.round(20 + rep * 1.2 + team.tier * 15);
}
const GOAL_REP = 5;
const GOAL_MV = 12;

function bonusPtFor(team) { return 8 + (4 - team.tier) * 4; }
function newDeal(team, years) {
  return {
    team: team.id,
    seat: career ? career.seat : 0,
    years, left: years,
    salary: salaryFor(team, career ? career.rep : 30),
    bonusPt: bonusPtFor(team),
    goal: { type: "champPos", value: expectedFinish(team) },
  };
}
function tierFinish(team) { return 2 + team.tier * 4; }
function expectedFinish(team) {
  return clamp(tierFinish(team) - Math.round(((career ? career.rep : 30) - 50) / 25), 1, 22);
}

function seatDriver(teamId, seatIdx, fallback) {
  if (!career) return fallback;
  if (career.flavour === "driver" && teamId === career.team && seatIdx === career.seat)
    return career.driver;
  return career.seats[seasonDriverId(teamId, seatIdx)] || fallback;
}
function driverOverride(teamId, seatIdx) {
  if (!inCareer()) return null;
  if (career.flavour === "myteam" && teamId === career.team) {
    if (seatIdx === 0) return career.driver;
    const hired = career.roster && career.roster[0];
    return hired ? driverRec(hired) : null;
  }
  return seatDriver(teamId, seatIdx, null);
}

function gridDrivers(team) {
  if (!inCareer() || !team) return team && team.drivers;
  if (career.flavour !== "myteam" || team.id !== career.team) return team.drivers;
  const hired = career.roster && career.roster[0];
  if (!hired) return team.drivers;
  return [career.driver, driverRec(hired)];
}

function wageBill() {
  if (!inCareer() || career.flavour !== "myteam" || !career.roster) return 0;
  return career.roster.reduce((n, d) => n + (d.salary || 0), 0);
}

function devFor(teamId, seatIdx) {
  if (!inCareer()) return null;
  return career.dev[seasonDriverId(teamId, seatIdx)] || null;
}

// Neutral outside career. `tdev` is an additive delta in stat points; Teams.LIST is
// NEVER mutated, so a save can't corrupt the shipped grid.
function paceMult(teamId) {
  if (!inCareer()) return 1;
  return 1 + (career.tdev[teamId] || 0) * TDEV_TO_PACE;
}
function teamStats(team) {
  if (!inCareer() || !team) return team && team.stats;
  const d = career.tdev[team.id] || 0;
  if (!d) return team.stats;
  const out = {};
  for (const k in team.stats) out[k] = clamp(team.stats[k] + d, 0, 100);
  return out;
}

// The option ids this team may fit. Every cost-0 option is always owned: Parts.DEFAULTS
// are all cost-0, so Parts._resolve()'s fallback always lands on something owned
// and a save can never produce an illegal car.
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
// The facility discount lands HERE, not at the point of sale, so the garage's
// RESEARCH price and the balance charged can never disagree.
function researchCost(opt) {
  return Math.round((opt.cost || 0) * RESEARCH_MULT * (1 - facilityDiscount()));
}

// What the team's own works car costs — the baseline every career budget is
// measured against. Memoised: getCost walks all 12 categories and the garage
// asks on every render.
const _worksCost = new Map();
function worksCost(teamId) {
  if (_worksCost.has(teamId)) return _worksCost.get(teamId);
  const team = teamOf(teamId);
  const c = !team ? 0
    : team.custom ? MYTEAM_WORKS
    : Parts.getCost(Parts.getFactorySetup(team), team);
  _worksCost.set(teamId, c);
  return c;
}
// The ceiling every career budget obeys: the whole top shelf minus its dearest
// single part, DERIVED from the catalog so repricing moves it. Without it a
// front-running works car (~86% of the top shelf) at budgetLvl 1 could fit the
// dearest option in every category (measured: 2035 * 1.15 = 2340 = the top
// shelf, exactly) and the economy constrained nothing. Call-time read of Parts.
let _budgetCap = null;
function budgetCap() {
  if (_budgetCap == null) {
    let all = 0;
    let top = 0;
    for (const cat of Parts.CATALOG) {
      let hi = 0;
      for (const o of cat.options) hi = Math.max(hi, o.cost || 0);
      all += hi;
      top = Math.max(top, hi);
    }
    _budgetCap = all - top;
  }
  return _budgetCap;
}
function budgetAt(lvl) {
  const l = Math.max(0, Math.min(lvl | 0, BUDGET_MULT.length - 1));
  const works = worksCost(career.team);
  const raw = Math.round(works * BUDGET_MULT[l]);
  // A team can always rebuild its own works car, cap or no cap; parts-ladder.test
  // asserts the cap clears the dearest preset, so this only bites if one outgrows it.
  return Math.min(raw, Math.max(budgetCap(), works));
}
function budget() { return career ? budgetAt(career.budgetLvl) : 0; }
function budgetUpgradeCost() {
  if (!career || career.budgetLvl >= BUDGET_UPGRADE.length) return null;
  // A rung that raises nothing is not for sale (the cap already binds for a
  // front-running works car: Ferrari 1830 / McLaren 2000 against a 2105 cap).
  if (budgetAt(career.budgetLvl + 1) <= budgetAt(career.budgetLvl)) return null;
  return BUDGET_UPGRADE[career.budgetLvl];
}

const GRANT = 5000;
function freeMoney(on) {
  if (on !== undefined) store.set("career.freeMoney", !!on);
  return !!store.get("career.freeMoney", false);
}
// Hand yourself credits. Returns the new balance, or null with no career loaded.
function grant(n) {
  if (!career || careerConflict) return null;
  career.money += Math.max(0, Math.round(Number(n) || GRANT));
  save();
  return career.money;
}
const charge = (cost) => (freeMoney() ? 0 : cost);

function research(opt) {
  if (!career || !opt || careerConflict) return false;
  if (career.owned.indexOf(opt.id) >= 0) return false;
  const cost = charge(researchCost(opt));
  if (cost > career.money) return false;
  career.money -= cost;
  career.owned.push(opt.id);
  save();
  return true;
}
// Raise the fitted-cost cap one rung of BUDGET_MULT (the RAISE THE CAP card).
// Deliberately a different sink from the factory: the factory cuts what FUTURE
// parts cost and never runs out; this raises what you may BOLT ON AT ONCE and
// stops at three rungs, so spending on one genuinely gives up the other.
function upgradeBudget() {
  const cost = charge(budgetUpgradeCost());
  if (!career || careerConflict || budgetUpgradeCost() == null || cost > career.money) return false;
  career.money -= cost;
  career.budgetLvl++;
  save();
  return true;
}

const SPONSOR_KINDS = [
  // Every one is measured over a WINDOW of consecutive rounds, so a single lucky
  // weekend cannot pay it and a single bad one does not sink it.
  { type: "points", window: 5, value: (t) => Math.max(2, 14 - t.tier * 2), pay: 600 },
  { type: "finishes", window: 4, value: () => 3, pay: 450 },
  { type: "double", window: 6, value: () => 2, pay: 800 },
  { type: "clean", window: 4, value: () => 4, pay: 400 },
];
const SPONSOR_LABELS = {
  points: (v, w) => `Score ${v} points across ${w} rounds`,
  finishes: (v, w) => `Finish ${v} of the next ${w} rounds in the points`,
  double: (v, w) => `Get BOTH cars home in the points ${v} times in ${w} rounds`,
  clean: (v, w) => `Keep it clean — no retirements, no penalties — for ${w} rounds`,
};
function sponsorLabel(sp) {
  const f = sp && SPONSOR_LABELS[sp.type];
  return f ? f(sp.value, sp.window) : "";
}

function sponsorAt(round) {
  if (!career || career.flavour !== "myteam") return null;
  const team = teamOf(career.team) || { tier: 2 };
  // Which window that round falls in. Windows tile the season from round 0.
  let start = 0;
  let idx = 0;
  let kind = null;
  while (start <= round) {
    const i = Math.floor(rnd(career.year, "spon", idx) * SPONSOR_KINDS.length);
    kind = SPONSOR_KINDS[Math.min(i, SPONSOR_KINDS.length - 1)];
    if (start + kind.window > round) break;
    start += kind.window;
    idx++;
  }
  if (!kind) return null;
  const value = kind.value(team);
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
function sponsor() { return career ? sponsorAt(career.season.round) : null; }
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

// Ownership only grows and the budget ladder stops at three, so a career used to
// converge on owning everything with no end game. FACILITY is the open-ended
// sink: each level is a permanent slice off research cost. Geometric price,
// linear capped discount — always affordable in principle, never trivialising.
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
  if (!career || careerConflict || raw == null) return false;
  const cost = charge(raw);
  if (cost > career.money) return false;
  career.money -= cost;
  career.facility = facility() + 1;
  save();
  return true;
}

// One brief per round, drawn from the career seed so a refresh cannot reroll it.
// The save stores {round, type, value, done}, never the sentence (prose in a save
// needs a migration to reword); `round` matters because endRace() advances the
// calendar BEFORE settleRound() runs.
const OBJ_KINDS = [
  { type: "finish", value: (team) => clamp(expectedFinish(team) - 1, 1, 20) },
  { type: "beatMate", value: () => 0 },
  { type: "outQualMate", value: () => 0 },
  { type: "points", value: () => 1 },
  { type: "clean", value: () => 0 },
];
const OBJ_LABELS = {
  finish: (v) => `Finish P${v} or better`,
  beatMate: () => "Finish ahead of your team-mate",
  outQualMate: () => "Out-qualify your team-mate",
  points: (v) => (v > 1 ? `Score ${v} points` : "Score championship points"),
  clean: () => "Clean race — no track limits, no penalty",
};
function objectiveLabel(o) {
  const f = o && OBJ_LABELS[o.type];
  return f ? f(o.value) : "";
}

function objectiveFor(r) {
  const team = teamOf(career.team);
  const i = Math.min(OBJ_KINDS.length - 1, Math.floor(rnd(career.year, "obj", r) * OBJ_KINDS.length));
  const kind = OBJ_KINDS[i];
  return { round: r, type: kind.type, value: team ? kind.value(team) : 0, done: null };
}
function objective() {
  if (!career) return null;
  if (seasonDone()) return null;
  const r = career.season.round;
  if (!career.obj || career.obj.round !== r) {
    if (careerConflict) return career.obj || null;
    career.obj = objectiveFor(r); save();
  }
  return career.obj;
}
function objectiveMet(o, ctx) {
  switch (o.type) {
    case "finish": return ctx.pos <= o.value;
    case "points": return ctx.pts >= o.value;
    case "clean": return !ctx.player.retired && !(ctx.player.cuts | 0) && !(ctx.player.penalty | 0);
    case "beatMate": return !ctx.mate || ctx.pos < ctx.matePos;
    case "outQualMate": return !ctx.mate || (ctx.player.gridPos || 99) < (ctx.mate.gridPos || 99);
    default: return false;
  }
}

function prizeFor(pos) {
  if (pos <= PRIZE.length) return PRIZE[pos - 1];
  return pos <= 15 ? PRIZE_MID : PRIZE_TAIL;
}

function settleRound(order, player) {
  if (!inCareer() || !player || careerConflict) return null;
  // The calendar has already moved on, so the brief that was live for this race is
  // the PREVIOUS round's. Idempotent: a second call for the same raced round must
  // not re-pay prize/salary/wages (half-written saves + re-entry used to double it).
  const raced = career.season.round - 1;
  if (career.results.some((row) => row.r === raced)) return null;
  const pos = order.indexOf(player) + 1;
  const team = teamOf(career.team);
  const pts = player.retired ? 0 : (Teams.POINTS[pos - 1] || 0);
  const prize = prizeFor(pos);
  const salary = career.deal ? career.deal.salary : 0;
  const bonus = career.deal ? career.deal.bonusPt * pts : 0;

  // Recomputed rather than read off career.obj: the draw is pure, so this can
  // never disagree with what the hub showed.
  const obj = objectiveFor(raced);
  const mate = order.find((c) => c !== player && c.team && c.team.id === career.team);
  obj.done = objectiveMet(obj, {
    pos, pts, player, mate, matePos: mate ? order.indexOf(mate) + 1 : 0,
  });

  // MY TEAM's wage bill comes off the balance, never off the fitted cap, so
  // hiring well costs upgrades rather than legality. Wages can exceed a round's
  // income, so the balance floors at zero.
  const wages = wageBill();
  career.money += prize + salary + bonus + (obj.done ? OBJ_BONUS : 0) - wages;
  career.money = Math.max(0, career.money);
  // Two reputation channels: the result term is relative to the CAR (expectedFinish
  // encodes the tier), the objective term is flat. A team id no longer on
  // Teams.LIST degrades to a mid-grid expectation rather than throwing in endRace.
  const repDelta = clamp(((team ? expectedFinish(team) : 11) - pos) * 0.6, -4, 6)
                 + (obj.done ? OBJ_REP : -OBJ_REP);
  career.rep = clamp(career.rep + repDelta, 0, 100);
  const dnf = player.retired ? (player.dnf || "mechanical") : null;
  const matePts = mate && !mate.retired ? (Teams.POINTS[order.indexOf(mate)] || 0) : 0;
  const dbl = career.flavour === "myteam" && pts > 0 && matePts > 0;
  const cleanRun = !player.retired && !(player.cuts | 0) && !(player.penalty | 0);
  career.results.push({ r: raced, p: pos, pts, obj: obj.done, dnf,
                        double: dbl, clean: cleanRun });
  career.obj = null;          // the next round draws its own brief on demand
  const sponsorPay = settleSponsor();
  const persisted = saveStatus();
  Log.info("game", `Career.settleRound pos=${pos}${dnf ? ` dnf=${dnf}` : ""}`);
  return { pos, pts, prize, salary, bonus, wages, obj, dnf, sponsorPay,
           money: career.money, rep: career.rep, save: persisted,
           unsaved: !persisted.durable };
}

function gridSeats() {
  const out = [];
  for (const team of Teams.LIST) {
    if (team.custom && team.id !== career.team) continue;
    gridDrivers(team).forEach((d, i) => {
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

function driverStandings() {
  const rows = gridSeats().map((s) => ({
    id: s.id, team: s.team, seat: s.seat, code: s.driver.code,
    pts: career.season.pts[s.id] || 0,
  }));
  // Same tie-break as the WORLD CHAMPION screen (SeasonCal.rank: points, then
  // countback) — a points-only sort here crowned a different driver in
  // history/contract goals than the one the results sheet showed.
  rows.sort((a, b) => (typeof SeasonCal !== "undefined" && SeasonCal.rank)
    ? SeasonCal.rank(career.season, a.id, b.id)
    : (b.pts - a.pts || (a.id < b.id ? -1 : 1)));
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
function expectedConstructor() {
  const m = new Map();
  Teams.LIST.filter((t) => !t.custom || t.id === career.team)
    .slice().sort((a, b) => a.tier - b.tier)
    .forEach((t, i) => m.set(t.id, i + 1));
  return m;
}

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
    d.experience = clamp(Math.round((d.experience || 0) + 4), 0, EXP_MAX);
  }
}

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
  const da = career.dev[a.id];
  const db = career.dev[b.id];
  if (db) career.dev[a.id] = db; else delete career.dev[a.id];
  if (da) career.dev[b.id] = da; else delete career.dev[b.id];
}

const HIRE_MIN = 12;          // nobody drives for nothing
const HIRE_RAISE_MAX = 0.45;  // the steepest ask a good year can produce

function hireAsk(hire, pos, expected) {
  const beat = clamp((expected - pos) / 8, -0.35, HIRE_RAISE_MAX);
  return Math.max(HIRE_MIN, Math.round((hire.salary || HIRE_MIN) * (1 + beat)));
}

function rolloverHire(dStand) {
  if (career.flavour !== "myteam" || !career.roster || !career.roster[0]) return;
  const hire = career.roster[0];
  if (hire.left > 0) hire.left--;
  if (hire.left > 0) { hire.pending = null; return; }
  const team = teamOf(career.team);
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
  if (!career || careerConflict) return false;
  const hire = career.roster && career.roster[0];
  if (!hire || !hire.pending || hire.pending.kind !== "renew") return false;
  hire.salary = hire.pending.ask;
  hire.left = clamp(years | 0 || 1, 1, 3);
  hire.pending = null;
  save();
  return true;
}
function hireDriver(code, years) {
  if (!career || careerConflict || career.flavour !== "myteam") return false;
  const agent = FREE_AGENTS.find((x) => x.code === code);
  if (!agent) return false;
  career.roster = [rosterEntry(agent, clamp(years | 0 || 1, 1, 3))];
  if (career.dev) delete career.dev[seasonDriverId(career.team, 1)];
  save();
  return true;
}
// Whether the seat needs a decision before the season can start.
function hirePending() {
  const hire = career.roster && career.roster[0];
  return hire && hire.pending ? Object.assign({ code: hire.code, name: hire.name,
    salary: hire.salary }, hire.pending) : null;
}

function marketValue(dStand) {
  const me = seasonDriverId(career.team, career.seat);
  const i = dStand.findIndex((r) => r.id === me);
  const n = dStand.length;
  const pct = n > 1 ? (n - 1 - Math.max(i, 0)) / (n - 1) : 1;
  return clamp(0.5 * career.rep + 0.5 * pct * 100, 0, 100);
}
function offerBar(tier) { return 92 - tier * 18; }

function offerFrom(team, years) {
  return {
    teamId: team.id, years,
    salary: salaryFor(team, career.rep),
    goal: { type: "champPos", value: expectedFinish(team) },
  };
}
function makeOffers(mv) {
  if (career.flavour === "myteam") return [];
  const years = clamp(1 + Math.floor(mv / 40), 1, 3);
  const mine = teamOf(career.team);
  const out = [];
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

function weakerSeat(team) {
  if (!team.drivers || team.drivers.length < 2) return 0;
  const rate = (i) => DriverRatings.overall(DriverRatings.get(
    seatDriver(team.id, i, team.drivers[i]).code, team.tier,
    career.dev[seasonDriverId(team.id, i)]));
  return rate(0) <= rate(1) ? 0 : 1;
}

function acceptOffer(i) {
  if (!career || careerConflict) return null;
  const o = career.offers ? career.offers[i | 0] : null;
  const team = o && teamOf(o.teamId);
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
    bonusPt: bonusPtFor(team),
    goal: o.goal,
  };
  career.offers = [];
  save();
  Log.info("game", `Career.acceptOffer team=${team.id} years=${o.years}`);
  return career.deal;
}

// The code in a seat, for a driverId the championship recorded but whose display
// code the save never captured (a season settled entirely through careerSim).
function codeOf(id) {
  const [teamId, seat] = String(id).split(":");
  const t = teamOf(teamId);
  const d = t && seatDriver(teamId, seat | 0, t.drivers[seat | 0]);
  return (d && d.code) || id;
}

function rollover() {
  if (!career || careerConflict) return null;
  const dStand = driverStandings();
  const tStand = teamStandings();
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
  if (career.history.length > HISTORY_MAX)
    career.history.splice(0, career.history.length - HISTORY_MAX);

  rolloverDrivers(dStand);
  rolloverTeams(tStand);
  rolloverMarket();

  let mv = marketValue(dStand);
  // THE CONTRACT'S SEASON GOAL, RESOLVED. Met is worth reputation; missed costs
  // reputation AND market value, so next winter's offers come from further down
  // the offerBar() ladder the hub shows all season. No money either way:
  // tools/car/career-economy.mjs does not model a per-season bonus and every
  // figure in docs/CAREER.md would go stale. MY TEAM has nobody to promise to.
  if (career.flavour !== "myteam" && career.deal && career.deal.goal) {
    const met = entry.pos <= career.deal.goal.value;
    career.rep = clamp(career.rep + (met ? GOAL_REP : -GOAL_REP), 0, 100);
    if (!met) mv = Math.max(0, mv - GOAL_MV);
    // Transient, like career.moves: drawn once on the end-of-season sheet, absent
    // on an older save (the sheet skips the line), so no CAREER_V rung is owed.
    career.goalResult = { value: career.deal.goal.value, pos: entry.pos, met };
  } else {
    career.goalResult = null;
  }
  if (career.flavour !== "myteam" && career.deal && career.deal.left > 0) career.deal.left--;
  rolloverHire(dStand);
  // A CONTRACT THAT RUNS IS A CONTRACT: offers are drawn only in the winter the
  // term expires. makeOffers used to run every winter beside `left--`, so a
  // re-signing reset the term and "3 seasons" could never become 2. Until then
  // the hub goes straight to NEXT RACE (the empty-list path MY TEAM always took).
  career.offers = career.deal && career.deal.left > 0 ? [] : makeOffers(mv);

  career.year++;
  // MUTATED IN PLACE, never reassigned: game.js aliases this exact object as its
  // `season` (openCareer does `season = c.season`), and a fresh object would
  // orphan that alias so the next race wrote its points into a dead one.
  const s = career.season;
  s.round = 0; s.pts = {}; s.teamPts = {}; s.driverCodes = {};
  // SeasonCal.award accumulates the countback histogram here; left alone, a
  // points tie in season N was broken by season N-1's wins. The weekend
  // staging fields are last season's too.
  s.finishes = {};
  delete s.stage; delete s.sprintOrder; delete s.qualiOrder; delete s.qualiTrack;
  career.results = [];
  career.obj = null;
  career.paidSponsors = [];
  save();
  return { year: career.year, champion: entry.champion, summary: entry,
           offers: career.offers, history: career.history, moves: career.moves };
}

function round() { return career ? career.season.round : 0; }
function roundsTotal() { return Tracks.SEASON.length; }
function seasonDone() { return career ? career.season.round >= Tracks.SEASON.length : false; }
// LIST index of the round about to be raced. Once the calendar is exhausted
// (`seasonDone`), clamp to the LAST valid round — callers (openCareer / #res-next
// → scheduleFlybyTrack → loadTrack) must never see -1, which crashes on `def.night`.
function trackIndex() {
  const n = Tracks.SEASON.length;
  if (!n) return -1;
  const r = career ? career.season.round : 0;
  return Tracks.seasonIndex(Math.min(Math.max(0, r), n - 1));
}

// A compact snapshot for the HUD, the hub header and __apex.careerState().
function state() {
  if (!career) return null;
  const team = teamOf(career.team);
  return {
    flavour: career.flavour, year: career.year,
    round: career.season.round, rounds: Tracks.SEASON.length,
    team: career.team, teamName: team ? team.name : career.team,
    money: career.money, rep: career.rep,
    budget: budget(), budgetLvl: career.budgetLvl,
    budgetCost: budgetUpgradeCost(), budgetMax: BUDGET_MULT.length - 1,
    facility: facility(), facilityCost: facilityCost(),
    facilityDiscount: facilityDiscount(),
    owned: career.owned.length,
    deal: career.deal, obj: objective(),
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
  data, active, inCareer, conflicted, engage, load, save, saveStatus, clear, start, state, rnd, hash,
  GRANT, freeMoney, grant,
  sponsor, sponsorAt, sponsorLabel, settleSponsor,
  FACILITY_MAX, FACILITY_DISCOUNT_MAX, facility, facilityCost, facilityDiscount,
  upgradeFacility, SPONSOR_KINDS,
  renewHire, hireDriver, hirePending, HIRE_MIN,
  salaryFor, newDeal, expectedFinish, tierFinish, driverOverride, devFor,
  gridDrivers, wageBill, freeAgents, MYTEAM_WORKS,
  paceMult, teamStats,
  owned, isOwned, researchCost, research, budget, budgetUpgradeCost, upgradeBudget,
  objective, objectiveFor, objectiveLabel, prizeFor, settleRound, worksCost, budgetCap,
  driverStandings, teamStandings, rollover, offers, acceptOffer, marketValue, offerBar,
  round, roundsTotal, seasonDone, trackIndex,
};
})();
Object.freeze(Career);
