const Career = (function () {
  "use strict";

const { store, seasonDriverId, migrateCareer } = GameStore;
const clamp = M4.clamp;

const START_MONEY = { driver: 1200, myteam: 2000 };
const START_REP = { driver: 30, myteam: 50 };

const PRIZE = [900, 700, 560, 460, 380, 320, 270, 230, 200, 170];
const PRIZE_MID = 120;
const PRIZE_TAIL = 80;

const RESEARCH_MULT = 3;

const BUDGET_MULT = [1.0, 1.15, 1.35, 1.6];
const BUDGET_UPGRADE = [2500, 5000, 9000];

const TDEV_MAX = 8;
const TDEV_SHOVE = 2;
const TDEV_REACH = 3;
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

const CRAFT_CUT = 0.10;
const CRAFT_PEN = 0.07;
const CRAFT_HIT = 0.12;
const CRAFT_WALL = 0.20;
const CRAFT_BASE = 0.75;
const CRAFT_REP = 6;
const CRAFT_REP_MIN = -0.75, CRAFT_REP_MAX = 1.5;

const HISTORY_MAX = 10;
const DEV_MAX = 12;
const EXP_MAX = 40;

const teamOf = (id) => Teams.LIST.find((t) => t.id === id);
const driverRec = (d) => ({ name: d.name, code: d.code, num: d.num });

let career = null;
let engaged = false;
function engage(on) { engaged = !!on && !calendarProtection && writerStatus().ok; adoptTeamIdentity(); if (applyRegs()) save({ migration: true }); identityChanged(); }
function inCareer() { return engaged && career != null && !calendarProtection; }

function hash(seed, ...parts) {
  return Hash32.unit(seed, ...parts);
}
function rnd(...parts) {
  return hash(career ? career.seed : 0, ...parts);
}
function seasonSeed() {
  if (!career) return 0;
  const k = (career.year | 0) - 2026;
  return (k ? (career.seed ^ Math.imul(k, 0x9E3779B1)) : career.seed) >>> 0;
}

const SLOTS = 3;
const FLAVOURS = ["driver", "myteam"];
const flavourIn = (f) => (f === "myteam" ? "myteam" : "driver");
const slotKey = (f, i) => `career.${flavourIn(f)}.${i | 0}`;
const slotIn = (i) => clamp(i | 0, 0, SLOTS - 1);
let slotIdx = 0;
let slotFlavour = "driver";
let careerRevision = null;
let careerConflict = false;
let calendarProtection = null;
const protectedRaw = new Map();
function writerStatus() { return store.careerWriteStatus ? store.careerWriteStatus() : { ok: true }; }
function blocked() { return careerConflict || !!calendarProtection || !writerStatus().ok; }

const liveSlotKey = () => slotKey(slotFlavour, slotIdx);
const currentRevision = () => store.keyRevision ? store.keyRevision(liveSlotKey()) : null;
function armRevision() { careerRevision = currentRevision(); careerConflict = false; }

const identityListeners = new Set();
let identityRevision = 0;
function identityChanged() { ++identityRevision; for (const fn of identityListeners) fn(); }
function onIdentityChange(fn) { identityListeners.add(fn); return () => identityListeners.delete(fn); }
function adoptTeamIdentity() {
  if (career && career.flavour === "myteam" && typeof CareerTeamIdentity !== "undefined") {
    career.myTeamIdentity = career.myTeamIdentity ? CareerTeamIdentity.sanitize(career.myTeamIdentity) : CareerTeamIdentity.capture(store);
  }
}
function identityValue(key, fallback) {
  const id = inCareer() && career.flavour === "myteam" && career.myTeamIdentity;
  if (!id || !Object.hasOwn(id, key)) return fallback;
  return id[key] != null || key === "customLogo" ? id[key] : fallback;
}
function setIdentityValue(key, value) {
  if (!inCareer() || career.flavour !== "myteam" || blocked() || (careerRevision != null && currentRevision() !== careerRevision) || typeof CareerTeamIdentity === "undefined") return false;
  const cleaned = CareerTeamIdentity.value(key, value);
  if (cleaned === undefined) return false;
  if (!commit(() => { adoptTeamIdentity(); career.myTeamIdentity[key] = cleaned; })) return false;
  identityChanged(); return true;
}
function data() { return career; }
function conflicted() { return blocked(); }
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
    if (typeof CareerPlanning !== "undefined" && CareerPlanning.protect(c, Tracks.LIST || [])) continue;
    if (c && Number(c.v) > GameStore.CAREER_V) continue;
    const f = flavourIn(c && c.flavour);
    while (next[f] < SLOTS && store.get(slotKey(f, next[f]), null)) next[f]++;
    if (next[f] >= SLOTS) continue;
    if (!store.set(slotKey(f, next[f]), c, { migration: true })) continue;
    store.set(item.source, null, { migration: true });
    next[f]++;
  }
}
const blockedSlot = (f, i) => {
  const raw = store.get(slotKey(f, i), null);
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "damaged";
  const v = typeof SaveMigrate !== "undefined" && SaveMigrate.careerVersion ? SaveMigrate.careerVersion(raw.v) : Number(raw.v);
  if (v == null || Number.isNaN(v)) return "damaged";
  return v > GameStore.CAREER_V ? "newer" : null;
};
const unsupportedSlot = (f, i) => blockedSlot(f, i) != null;
const blockedReason = (f, i) => (blockedSlot(f, i) === "damaged" ? "damaged" : "newer-version");
const readSlot = (f, i) => { const key = slotKey(f, i); let c = store.get(key, null); const pr = protectedRaw.get(key); if (typeof pr === "string" && store.raw && store.raw(key) === pr) c = JSON.parse(pr); return migrateCareer(c && JSON.parse(JSON.stringify(c))); };

if (store.subscribe) store.subscribe((change) => {
  if (change.local && career && change.key === liveSlotKey() && store.get(change.key, null) === career) {
    if (!careerConflict) armRevision();
    return;
  }
  if (!change.foreign) return;
  if (change.restoredBatch) {
    const keys = Array.isArray(change.keys) ? change.keys : [];
    if (!keys.some((k) => k === "careerSlot" || k.indexOf("career.") === 0)) return;
    if ((engaged || calendarProtection) && career) {
      if (keys.indexOf("careerSlot") !== -1 || keys.indexOf(liveSlotKey()) !== -1) careerConflict = true;
      return;
    }
    load();
    return;
  }
  if (!change.clear && change.key !== liveSlotKey()) return;
  if ((engaged || calendarProtection) && career) {
    careerConflict = true;
    return;
  }
  calendarProtection = null;
  career = change.clear ? null : adoptCalendar(readSlot(slotFlavour, slotIdx));
  armRevision();
});

function load(options) {
  const persist = !(options && options.persist === false);
  if (persist) migrateSlots();
  const live = String(store.get("careerSlot", "driver:0")).split(":");
  slotFlavour = flavourIn(live[0]);
  slotIdx = slotIn(live[1]);
  pointerHeld = false;
  const wanted = [slotFlavour, slotIdx];
  career = readSlot(slotFlavour, slotIdx);
  const keepPointer = !career && unsupportedSlot(slotFlavour, slotIdx);
  if (!career)
    outer: for (const f of FLAVOURS)
      for (let i = 0; i < SLOTS; i++) {
        const c = readSlot(f, i);
        if (c) { slotFlavour = f; slotIdx = i; career = c; keepPointer || holdPointer(wanted) || setLive({ migration: true }); break outer; }
      }
  calendarProtection = null;
  adoptCalendar(career);
  adoptTeamIdentity();
  armRevision();
  applyRegs();
  if (persist) save({ migration: true });
  identityChanged();
  return career;
}
function setLive(options) { pointerHeld = false; store.set("careerSlot", `${slotFlavour}:${slotIdx}`, options); }
let pointerHeld = false;
function holdPointer(wanted) {
  const m = store.mirror;
  if (!m || m.settled !== false || !m.ready || typeof m.ready.then !== "function") return false;
  pointerHeld = true;
  m.ready.then(() => {
    if (!pointerHeld) return;
    pointerHeld = false;
    if (!readSlot(wanted[0], wanted[1])) setLive({ migration: true });
  });
  return true;
}
let lastSave = { ok: true, durable: true, reason: null };
function writeResult(key, value, options) {
  if (typeof store.write === "function") return store.write(key, value, options);
  const durable = store.set(key, value, options) !== false;
  return { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
}
function save(options) {
  const ownership = writerStatus();
  if (!ownership.ok) { lastSave = ownership; return career; }
  if (calendarProtection) { lastSave = { ok: false, durable: false, reason: "calendar-unavailable" }; return career; }
  if (unsupportedSlot(slotFlavour, slotIdx)) {
    lastSave = { ok: false, durable: false, reason: blockedReason(slotFlavour, slotIdx) };
    return career;
  }
  if (career) {
    const now = currentRevision();
    if (careerConflict || (careerRevision != null && now !== careerRevision)) {
      careerConflict = true;
      lastSave = { ok: false, durable: false, reason: "conflict" };
      return career;
    }
    lastSave = writeResult(liveSlotKey(), career, options);
    armRevision();
  }
  return career;
}
function saveStatus() { return Object.assign({}, lastSave); }
const saveKept = () => lastSave.ok !== false && lastSave.durable !== false;
const snap = () => JSON.parse(JSON.stringify(career));
function commit(apply) { const before = snap(); apply(); return keep(before); }
function keep(before) {
  save({ requireDurable: true });
  if (saveKept()) return true;
  const seasonRef = career.season;
  const replace = (target, source) => {
    for (const k of Object.keys(target)) if (!Object.hasOwn(source, k)) delete target[k];
    Object.assign(target, source);
  };
  replace(career, before);
  if (seasonRef && career.season) { replace(seasonRef, career.season); career.season = seasonRef; }
  return false;
}
function clear() {
  const ownership = writerStatus();
  if (!ownership.ok) return (lastSave = ownership);
  if (calendarProtection) return { ok: false, durable: false, reason: "calendar-unavailable" };
  const now = currentRevision();
  if (careerConflict || (careerRevision != null && now !== careerRevision)) {
    careerConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return lastSave;
  }
  career = null;
  lastSave = writeResult(liveSlotKey(), null);
  armRevision();
  applyRegs();
  identityChanged();
  return lastSave;
}

function slotInfo(c, f, i) {
  const blocked = blockedSlot(f, i);
  if (blocked === "damaged") return { flavour: f, i, used: true, unsupported: true, damaged: true,
    live: false, teamName: "DAMAGED SAVE", code: "", name: "Unreadable save",
    year: "Kept on device", round: 0, rounds: 0, money: 0, seasons: 0, wins: 0, titles: 0 };
  if (blocked) return { flavour: f, i, used: true, unsupported: true,
    live: false, teamName: "UPDATE REQUIRED", code: "", name: "Newer save",
    year: "Newer build", round: 0, rounds: 0, money: 0, seasons: 0, wins: 0, titles: 0 };
  if (!c) return { flavour: f, i, used: false };
  const team = teamOf(c.team);
  const tally = tallyOf(c);
  return {
    flavour: f, i, used: true, year: c.year,
    live: f === slotFlavour && i === slotIdx,
    round: c.season.round, rounds: calendarOf(c).length,
    team: c.team, teamName: c.myTeamIdentity && c.myTeamIdentity.customTeam ? c.myTeamIdentity.customTeam.name : team ? team.name : (c.team == null ? "" : String(c.team)),
    code: c.driver ? c.driver.code : "", name: c.driver ? c.driver.name : "",
    money: c.money, rep: c.rep,
    seasons: tally.seasons + 1,
    titles: tally.titles,
    wins: tally.wins + (c.results || []).filter((r) => r.p === 1).length,
  };
}
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
function firstFree(flavour) {
  const set = slots(flavour);
  for (const s of set) if (!s.used) return s.i;
  return -1;
}

function useSlot(flavour, i) {
  const f = flavourIn(flavour);
  const n = slotIn(i);
  if (unsupportedSlot(f, n)) {
    lastSave = { ok: false, durable: false, reason: blockedReason(f, n) };
    return null;
  }
  if (career && (f !== slotFlavour || n !== slotIdx)) save();
  slotFlavour = f;
  slotIdx = n;
  calendarProtection = null;
  career = adoptCalendar(readSlot(f, n));
  if (career || store.get(slotKey(f, n), null) != null) setLive();
  else pointerHeld = false;
  adoptTeamIdentity();
  armRevision();
  if (career && career.flavour === "myteam" && !calendarProtection) save({ migration: true });
  identityChanged();
  if (applyRegs()) save({ migration: true });
  return career;
}
function deleteSlot(flavour, i, expectedRevision) {
  const ownership = writerStatus();
  if (!ownership.ok) return (lastSave = ownership);
  const f = flavourIn(flavour);
  const n = slotIn(i);
  const key = slotKey(f, n);
  if ((f === slotFlavour && n === slotIdx && (careerConflict ||
       (careerRevision != null && currentRevision() !== careerRevision))) ||
      (expectedRevision != null && expectedRevision !== store.keyRevision(key))) {
    lastSave = { ok: false, durable: false, reason: "conflict" };
    if (f === slotFlavour && n === slotIdx) careerConflict = true;
    return Object.assign({}, lastSave);
  }
  lastSave = writeResult(key, null);
  protectedRaw.delete(key);
  if (f === slotFlavour && n === slotIdx) { career = null; calendarProtection = null; armRevision(); applyRegs(); identityChanged(); }
  return Object.assign({}, lastSave);
}
function slotRevision(flavour, i) { return store.keyRevision(slotKey(flavourIn(flavour), slotIn(i))); }
function armedRevision() { return careerRevision; }

function rosterEntry(agent, left) {
  return { name: agent.name, code: agent.code, num: agent.num,
           tier: agent.tier, salary: agent.ask, left, pending: null };
}

function start(opts) {
  const ownership = writerStatus();
  if (!ownership.ok) { lastSave = ownership; return null; }
  const o = opts || {};
  const flavour = flavourIn(o.flavour);
  const free = firstFree(flavour);
  const target = o.slot != null ? slotIn(o.slot) : free;
  if (target < 0 || unsupportedSlot(flavour, target)) return null;
  const targetSave = readSlot(flavour, target);
  if ((calendarProtection && flavour === slotFlavour && target === slotIdx) ||
      (typeof CareerPlanning !== "undefined" && CareerPlanning.protect(targetSave, Tracks.LIST || []))) {
    lastSave = { ok: false, durable: false, reason: "calendar-unavailable" }; return null;
  }
  if (career && !calendarProtection && (flavour !== slotFlavour || target !== slotIdx)) save();
  const left = { career, flavour: slotFlavour, idx: slotIdx, protection: calendarProtection, revision: careerRevision, conflict: careerConflict };
  calendarProtection = null;
  slotFlavour = flavour;
  slotIdx = target;
  setLive();
  armRevision();
  const teamId = o.teamId || (flavour === "myteam" ? "custom" : "haas");
  const team = teamOf(teamId) || teamOf("custom") || Teams.LIST[0];
  if (typeof Parts !== "undefined" && Parts.setLegality) Parts.setLegality(null, "");
  const factory = Parts.getFactorySetup(team);

  career = {
    v: GameStore.CAREER_V,
    flavour,
    year: 2026,
    seed: (o.seed | 0) || (Hash32.fnv1a(`${team.id}:${flavour}:${Date.now()}`) % 1000000),
    team: team.id,
    seat: flavour === "myteam" ? 0 : (o.seat | 0),
    driver: {
      name: (o.name || "Your Name").slice(0, 22),
      code: (o.code || "YOU").toUpperCase().slice(0, 3),
      num: clamp(o.num | 0 || 99, 1, 99),
    },
    money: START_MONEY[flavour],
    rep: START_REP[flavour],
    budgetLvl: 0,
    facility: 0,
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} },
    results: [],
    owned: ownedOf(factory),
    fitted: Object.assign({}, factory),
    deal: null,
    offers: [],
    dev: {}, tdev: {}, seats: {},
    moves: [],
    paidSponsors: [],
    obj: null,
    objPick: null,
    history: [],
    tally: { seasons: 0, wins: 0, podiums: 0, titles: 0, cTitles: 0, pts: 0 },
    roster: null,
  };
  if (flavour === "myteam") {
    adoptTeamIdentity();
    const hired = FREE_AGENTS.find((a) => a.code === o.hire) || FREE_AGENTS[FREE_AGENTS.length - 3];
    career.roster = [rosterEntry(hired, 1)];
  }
  career.year0 = YEAR0;
  career.calSet = o.calendar === "24" ? "24" : "real2026";
  stampCalendar(career.season, career.calSet);
  career.amb = ambIdx(o.amb);
  applyRegs();
  career.deal = newDeal(team, 1);
  Log.info("game", `Career.start flavour=${flavour} team=${teamId}`);
  save();
  if (lastSave.ok !== false) return career;
  const refused = lastSave;
  career = left.career; slotFlavour = left.flavour; slotIdx = left.idx; calendarProtection = left.protection;
  setLive();
  careerRevision = left.revision; careerConflict = left.conflict;
  applyRegs();
  lastSave = refused;
  return null;
}

function salaryFor(team, rep) {
  return Math.round(20 + rep * 1.2 + team.tier * 15);
}
const AMBITION = [
  { key: "modest", name: "PLAY IT SAFE", delta: 3, rep: 3, mv: 6,
    blurb: "A softer target. The paddock shrugs either way." },
  { key: "expected", name: "WHAT THEY ASK", delta: 0, rep: 5, mv: 12,
    blurb: "The finish this team expects from this car." },
  { key: "ambitious", name: "PROMISE MORE", delta: -3, rep: 8, mv: 20,
    blurb: "Beat the car. Worth more if you manage it, and costlier if you do not." },
];
const AMBITION_DEF = 1;
function ambIdx(i) {
  return Number.isInteger(i) && i >= 0 && i < AMBITION.length ? i : AMBITION_DEF;
}
function ambitionOf(deal) { return ambIdx(deal && deal.ambition); }
function ambition() { return career ? ambIdx(career.amb) : AMBITION_DEF; }
function goalValueFor(team, amb) {
  return clamp(expectedFinish(team) + AMBITION[ambIdx(amb)].delta, 1, 22);
}

const GOAL_KINDS = {
  champPos: {
    value: (team, amb) => goalValueFor(team, amb),
    met: (v, r) => r.pos <= v,
    label: (v) => `Finish P${v} or better in the championship`,
    now: (c) => { const r = myStandingRow(); return r ? `P${r.pos}` : null; },
    onTrack: (v) => { const r = myStandingRow(); return r ? r.pos <= v : null; },
  },
  teamPos: {
    value: (team, amb) => clamp((expectedConstructor().get(team.id) || 11)
                                + AMBITION[ambIdx(amb)].delta, 1, 11),
    met: (v, r) => r.cPos <= v,
    label: (v) => `Take the team to P${v} or better in the constructors'`,
    now: () => { const r = myTeamStandingRow(); return r ? `P${r.pos}` : null; },
    onTrack: (v) => { const r = myTeamStandingRow(); return r ? r.pos <= v : null; },
  },
  beatMate: {
    value: () => 0,
    met: (v, r) => r.matePos == null || r.pos < r.matePos,
    label: () => "Finish the season ahead of your team-mate",
    now: () => {
      const me = myStandingRow(), mate = mateStandingRow();
      return me && mate ? `P${me.pos} to their P${mate.pos}` : null;
    },
    onTrack: () => {
      const me = myStandingRow(), mate = mateStandingRow();
      return me && mate ? me.pos < mate.pos : null;
    },
  },
  beatRival: {
    value: (team, amb) => rivalSeatFor(team, amb),
    met: (v, r) => r.rivalPos == null || r.pos < r.rivalPos,
    label: (v, code) => `Finish the season ahead of ${code || codeOfSeat(v) || "your rival"}`,
    now: (c, v) => {
      const me = myStandingRow(), riv = rivalStandingRow(v);
      return me && riv ? `P${me.pos} to ${riv.code} P${riv.pos}` : null;
    },
    onTrack: (v) => {
      const me = myStandingRow(), riv = rivalStandingRow(v);
      return me && riv ? me.pos < riv.pos : null;
    },
  },
};
const GOAL_BASE = ["champPos", "teamPos", "beatMate"];
const GOAL_ORDER = GOAL_BASE.concat(["beatRival"]);
function goalKind(type) { return Object.hasOwn(GOAL_KINDS, type) ? GOAL_KINDS[type] : GOAL_KINDS.champPos; }
function goalTypeOk(type) { return Object.hasOwn(GOAL_KINDS, type) ? type : "champPos"; }
const RIVAL_SHARE = 0.25;
function goalTypeFor(year) {
  if (rnd(year, "goalrival") < RIVAL_SHARE) return "beatRival";
  const i = Math.floor(rnd(year, "goalkind") * GOAL_BASE.length);
  return GOAL_BASE[clamp(i, 0, GOAL_BASE.length - 1)];
}
function goalFor(team, amb, year) {
  const type = goalTypeFor(year);
  return { type, value: goalKind(type).value(team, amb) };
}
function goalLabel(goal, code) {
  if (!goal) return "";
  return goalKind(goal.type).label(goal.value, code);
}
function standingTeamId(r) { return r && r.team ? (typeof r.team === "string" ? r.team : r.team.id) : null; }
function myStandingRow() {
  if (!career) return null;
  return driverStandings().find((r) => standingTeamId(r) === career.team && r.seat === career.seat) || null;
}
function mateStandingRow() {
  if (!career) return null;
  return driverStandings()
    .find((r) => standingTeamId(r) === career.team && r.seat === (career.seat === 0 ? 1 : 0)) || null;
}
function rivalStandingRow(id) {
  if (!career || !id) return null;
  return driverStandings().find((r) => r.id === id) || null;
}
function codeOfSeat(id) {
  if (!career || !id) return "";
  const s = gridSeats().find((g) => g.id === id);
  return s ? s.driver.code : "";
}
function rivalSeatFor(team, amb) {
  if (!career) return "";
  const forId = team && team.id ? team.id : career.team;
  const tier = team && Number.isFinite(team.tier) ? team.tier : null;
  const pool = gridSeats().filter((s) => s.team.id !== forId && !isPlayerSeat(s));
  if (!pool.length) return "";
  const rate = (s) => DriverRatings.overall(ratingOf(s));
  pool.sort((a, b) => rate(b) - rate(a));
  const meSeat = gridSeats().find(isPlayerSeat);
  const mine = meSeat ? DriverRatings.overall(DriverRatings.get(
    meSeat.driver.code, tier != null ? tier : meSeat.team.tier, career.dev[meSeat.id])) : 0;
  const at = pool.filter((s) => rate(s) > mine).length;
  const i = clamp(at + AMBITION[ambIdx(amb)].delta, 0, pool.length - 1);
  return pool[i].id;
}
function myTeamStandingRow() {
  if (!career) return null;
  return teamStandings().find((r) => r.id === career.team) || null;
}
function goalHasResult() {
  const s = career && career.season;
  return !!(s && (s.round > 0 || Object.keys(s.pts || {}).length));
}
function goalNow(goal) { return goal && goalHasResult() ? goalKind(goal.type).now(career, goal.value) : null; }
function goalOnTrack(goal) { return goal && goalHasResult() ? goalKind(goal.type).onTrack(goal.value) : null; }
function setAmbition(i) {
  if (!career || blocked()) return ambition();
  const before = snap();
  career.amb = ambIdx(clamp(i | 0, 0, AMBITION.length - 1));
  for (const o of career.offers || []) {
    const t = teamOf(o.teamId);
    if (t && o.goal) {
      const type = goalTypeOk(o.goal.type);
      o.goal = { type, value: goalKind(type).value(t, career.amb) };
    }
  }
  keep(before);
  return career.amb;
}

function bonusPtFor(team) { return 8 + (4 - team.tier) * 4; }
function newDeal(team, years) {
  const amb = ambition();
  return {
    team: team.id,
    seat: career ? career.seat : 0,
    years, left: years,
    salary: salaryFor(team, career ? career.rep : 30),
    bonusPt: bonusPtFor(team),
    ambition: amb,
    goal: goalFor(team, amb, career ? career.year : 2026),
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
  return career.roster.reduce((n, d) => n + (Number(d.salary) || 0), 0);
}

function devFor(teamId, seatIdx) {
  if (!inCareer()) return null;
  return career.dev[seasonDriverId(teamId, seatIdx)] || null;
}

function paceMult(teamId) {
  if (!inCareer()) return 1;
  const d = Number(career.tdev[teamId]);
  return clamp(1 + (Number.isFinite(d) ? d : 0) * TDEV_TO_PACE, 0.9, 1.1);
}
function teamStats(team) {
  if (!inCareer() || !team) return team && team.stats;
  const d = Number(career.tdev[team.id]) || 0;
  if (!d) return team.stats;
  const out = {};
  for (const k in team.stats) out[k] = clamp(team.stats[k] + d, 0, 100);
  return out;
}

const _owned = { career: null, arr: null, len: -1, team: null, set: null };
function owned(teamId) {
  if (!inCareer() || teamId !== career.team) return null;
  const m = _owned, arr = career.owned;
  if (m.set && m.career === career && m.arr === arr && m.len === arr.length && m.team === teamId) return m.set;
  const s = new Set(arr);
  for (const cat of Parts.CATALOG)
    for (const o of cat.options) if (!o.cost) s.add(o.id);
  m.career = career; m.arr = arr; m.len = arr.length; m.team = teamId; m.set = s;
  return s;
}
function researchCost(opt) {
  return Math.round((opt.cost || 0) * RESEARCH_MULT * (1 - facilityDiscount()));
}

const _worksCost = new Map();
function worksCost(teamId) {
  const legal = Parts.legalityKey ? Parts.legalityKey() : "";
  const key = teamId + "|" + legal;
  if (_worksCost.has(key)) return _worksCost.get(key);
  const team = teamOf(teamId);
  const c = !team ? 0
    : team.custom ? MYTEAM_WORKS
    : Parts.getCost(Parts.getFactorySetup(team), team);
  _worksCost.set(key, c);
  return c;
}
const YEAR0 = 2026;
function seasonsElapsed() {
  if (!career) return 0;
  return Math.max(0, (career.year | 0) - ((career.year0 | 0) || YEAR0));
}
function era() {
  if (!inCareer() || typeof Regulations === "undefined") return null;
  return Regulations.eraFor(seasonsElapsed());
}
function eraSeasonsLeft() {
  if (!inCareer() || typeof Regulations === "undefined") return 0;
  return Regulations.seasonsLeft(seasonsElapsed());
}
function applyRegs() {
  if (typeof Parts === "undefined" || !Parts.setLegality) return;
  const e = inCareer() ? era() : null;
  if (!e || !Regulations) { Parts.setLegality(null, ""); return; }
  Parts.setLegality(Regulations.legalityFor(e.id), e.id);
  return !blocked() && refitBudget();
}

function refitBudget() {
  if (!Parts.resolveSetup) return false;
  const team = teamOf(career.team), cap = budget(), have = owned(career.team);
  let fit = Parts.resolveSetup(career.fitted, team), changed = false;
  while (fit.cost > cap) {
    const excess = fit.cost - cap;
    let best = null;
    for (const cat of Parts.CATALOG) for (const opt of cat.options) {
      if (!Parts.isOptionAvailable(opt, team, have)) continue;
      const saving = (fit.options[cat.id].cost || 0) - (opt.cost || 0);
      if (saving <= 0) continue;
      const covers = saving >= excess, distance = Math.abs(saving - excess);
      const id = cat.id + ":" + opt.id;
      if (!best || (covers && !best.covers) || (covers === best.covers &&
          (distance < best.distance || (distance === best.distance && id < best.id))))
        best = { cat: cat.id, opt: opt.id, covers, distance, id };
    }
    if (!best) break;
    career.fitted[best.cat] = best.opt;
    fit = Parts.resolveSetup(career.fitted, team);
    changed = true;
  }
  return changed;
}

let _budgetCap = null;
let _budgetCapKey = null;
function budgetCap() {
  const e = inCareer() ? era() : null;
  const key = e ? e.id : "";
  if (_budgetCap == null || _budgetCapKey !== key) {
    const legal = (o) => !e || typeof Regulations === "undefined"
      || Regulations.isLegal(o.id, e.id);
    let all = 0;
    let top = 0;
    for (const cat of Parts.CATALOG) {
      let hi = 0;
      for (const o of cat.options) if (legal(o)) hi = Math.max(hi, o.cost || 0);
      all += hi;
      top = Math.max(top, hi);
    }
    _budgetCap = all - top;
    _budgetCapKey = key;
  }
  return _budgetCap;
}
function budgetAt(lvl) {
  const l = Math.max(0, Math.min(lvl | 0, BUDGET_MULT.length - 1));
  const works = worksCost(career.team);
  const raw = Math.round(works * BUDGET_MULT[l]);
  return Math.min(raw, Math.max(budgetCap(), works));
}
function budget() { return career ? budgetAt(career.budgetLvl) : 0; }
function budgetUpgradeCost() {
  if (!career || career.budgetLvl >= BUDGET_UPGRADE.length) return null;
  if (budgetAt(career.budgetLvl + 1) <= budgetAt(career.budgetLvl)) return null;
  return BUDGET_UPGRADE[career.budgetLvl];
}

const GRANT = 5000;
function freeMoney(on) {
  if (on !== undefined) store.set("career.freeMoney", !!on);
  return !!store.get("career.freeMoney", false);
}
function grant(n) {
  if (!career || blocked()) return null;
  const add = Math.max(0, Math.round(Number(n) || GRANT));
  return commit(() => { career.money += add; }) ? career.money : null;
}
const charge = (cost) => (freeMoney() ? 0 : cost);

function ownedOf(setup) {
  return Object.keys(setup).map((cat) => (Parts.ownIdOf ? Parts.ownIdOf(cat, setup[cat]) : setup[cat]));
}
function research(opt) {
  if (!career || !opt || blocked()) return false;
  const key = Parts.ownId ? Parts.ownId(opt) : opt.id;
  if (career.owned.indexOf(key) >= 0) return false;
  const cost = charge(researchCost(opt));
  if (cost > career.money) return false;
  return commit(() => { career.money -= cost; career.owned.push(key); });
}
function upgradeBudget() {
  const cost = charge(budgetUpgradeCost());
  if (!career || blocked() || budgetUpgradeCost() == null || cost > career.money) return false;
  return commit(() => { career.money -= cost; career.budgetLvl++; });
}

const SPONSOR_KINDS = [
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
  const rounds = calendarOf(career).length;
  const window = rounds > 0 ? Math.max(1, Math.min(kind.window, rounds - start)) : kind.window;
  const part = window / kind.window;
  const full = kind.value(team);
  const value = part < 1 && kind.type !== "clean" ? Math.max(1, Math.ceil(full * part)) : full;
  const pay = part < 1 ? Math.round(kind.pay * part) : kind.pay;
  const selected = career.sponsorPicks && career.sponsorPicks[career.year + ":" + idx];
  if (selected === 1) kind = SPONSOR_KINDS[(SPONSOR_KINDS.indexOf(kind) + 1) % SPONSOR_KINDS.length];
  const target = kind.value(team);
  const selectedValue = selected === 1 ? (kind.type === "clean" ? window : Math.max(1, Math.ceil(target * window / kind.window))) : value;
  const selectedPay = selected === 1 ? Math.round(kind.pay * window / kind.window) : pay;
  const rows = (career.results || []).filter((r) => r.r >= start && r.r < start + window);
  let done = 0;
  for (const r of rows) {
    if (kind.type === "points") done += r.pts || 0;
    else if (kind.type === "finishes") done += (r.pts || 0) > 0 ? 1 : 0;
    else if (kind.type === "double") done += r.double ? 1 : 0;
    else if (kind.type === "clean") done += (!r.dnf && r.clean) ? 1 : 0;
  }
  const need = kind.type === "clean" ? window : selectedValue;
  return {
    type: kind.type, value: selectedValue, window, pay: selectedPay,
    start, end: start + window - 1, idx,
    done, need, met: done >= need,
    possible: kind.type === "points" || done + Math.max(0, window - rows.length) >= need,
    roundsLeft: Math.max(0, start + window - 1 - round),
    label: sponsorLabel({ type: kind.type, value: selectedValue, window }),
  };
}
function sponsor() { return career && !seasonDone() ? sponsorAt(career.season.round) : null; }
function settleSponsor() {
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

const FACILITY_MAX = 8;
const FACILITY_BASE = 3000;
const FACILITY_STEP = 1.6;
const FACILITY_DISCOUNT = 0.05;
const FACILITY_DISCOUNT_MAX = 0.40;

function facility() { return career ? clamp(career.facility | 0, 0, FACILITY_MAX) : 0; }
function facilityCost() {
  const lvl = facility();
  return lvl >= FACILITY_MAX ? null
    : Math.round(FACILITY_BASE * Math.pow(FACILITY_STEP, lvl) / 50) * 50;
}
function facilityDiscount() {
  return Math.min(FACILITY_DISCOUNT_MAX, facility() * FACILITY_DISCOUNT);
}
function upgradeFacility() {
  const raw = facilityCost();
  if (!career || blocked() || raw == null) return false;
  const cost = charge(raw);
  if (cost > career.money) return false;
  return commit(() => { career.money -= cost; career.facility = facility() + 1; });
}

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
  const f = o && Object.hasOwn(OBJ_LABELS, o.type) ? OBJ_LABELS[o.type] : null;
  return f ? f(o.value) : "";
}

const OBJ_CHOICES = 3;
function objectiveAt(r, i) {
  const team = teamOf(career.team);
  const base = Math.floor(rnd(career.year, "obj", r) * OBJ_KINDS.length);
  const kind = OBJ_KINDS[(base + i) % OBJ_KINDS.length];
  return { round: r, type: kind.type, value: team ? kind.value(team) : 0, done: null };
}
function objectiveChoices(r) {
  const out = [];
  for (let i = 0; i < OBJ_CHOICES; i++) out.push(objectiveAt(r, i));
  return out;
}
function objectivePick(r) {
  const p = career && career.objPick;
  return p && p.round === r ? clamp(p.i | 0, 0, OBJ_CHOICES - 1) : 0;
}
function objectiveFor(r) { return objectiveAt(r, objectivePick(r)); }
function objectiveLocked() {
  const s = career && career.season;
  return !!(s && (s.stage || s.qualiOrder || s.sprintOrder || s.startedRound === s.round));
}
function markWeekendStarted() {
  const s = career && career.season;
  if (!s || blocked() || s.startedRound === s.round) return;
  if (planning()) planning().escrow(s.round);
  s.startedRound = s.round;
  save();
}
function chooseObjective(i) {
  if (!career || blocked() || seasonDone() || objectiveLocked()) return false;
  const pick = clamp(i | 0, 0, OBJ_CHOICES - 1);
  const r = career.season.round;
  if (objectivePick(r) === pick && career.obj && career.obj.round === r) return true;
  return commit(() => { career.objPick = { round: r, i: pick }; career.obj = objectiveFor(r); });
}
function objective() {
  if (!career) return null;
  if (seasonDone()) return null;
  const r = career.season.round;
  if (!career.obj || career.obj.round !== r) {
    if (blocked()) return career.obj || null;
    career.obj = objectiveFor(r); save();
  }
  return career.obj;
}
function objectiveMet(o, ctx) {
  switch (o.type) {
    case "finish": return ctx.pos <= o.value;
    case "points": return ctx.pts >= o.value;
    case "clean": return !ctx.player.retired && !ctx.player.dsq && !(ctx.player.cuts | 0) && !(ctx.player.penalty | 0);
    case "beatMate": return !ctx.mate || ctx.pos < ctx.matePos;
    case "outQualMate": return !ctx.mate || (ctx.player.gridPos || 99) < (ctx.mate.gridPos || 99);
    default: return false;
  }
}

function prizeFor(pos) {
  if (pos < 1) return 0;
  if (pos <= PRIZE.length) return PRIZE[pos - 1];
  return pos <= 15 ? PRIZE_MID : PRIZE_TAIL;
}

function craftScore(p) {
  if (!p) return 1;
  const loss = CRAFT_CUT * (p.cuts | 0)
             + CRAFT_PEN * Math.max(0, p.penalty || 0)
             + CRAFT_HIT * (p.hits | 0) * clamp(p.hitSev || 0, 0, 1)
             + CRAFT_WALL * (p.wallHits | 0);
  return clamp(1 - loss, 0, 1);
}

function seasonCraft() {
  const rows = career ? career.results.filter((r) => typeof r.craft === "number") : [];
  if (!rows.length) return null;
  return rows.reduce((a, r) => a + r.craft, 0) / rows.length;
}

function settleRound(order, player, table = Teams.POINTS) {
  if (!inCareer() || !player || blocked()) return null;
  const raced = career.season.round - 1;
  if (career.results.some((row) => row.r === raced)) return null;
  const pos = order.indexOf(player) + 1;
  const team = teamOf(career.team);
  const scored = (c) => (c.classified != null ? !!c.classified : !c.retired);
  const paid = (c) => scored(c) && !c.dsq;
  const pts = paid(player) ? (table[pos - 1] || 0) : 0;
  const prize = paid(player) ? prizeFor(pos) : 0;
  const owner = career.flavour === "myteam";
  const dealSalary = career.deal ? Number(career.deal.salary) : 0;
  const salary = career.deal && !owner && Number.isFinite(dealSalary) ? dealSalary : 0;
  const bonus = career.deal && !owner ? career.deal.bonusPt * pts : 0;

  const obj = objectiveFor(raced);
  const mate = order.find((c) => c !== player && c.team && c.team.id === career.team);
  const matePos = mate ? order.indexOf(mate) + 1 : 0;
  obj.done = objectiveMet(obj, {
    pos, pts, player, mate, matePos,
  });
  const matePrize = owner && mate && paid(mate) ? prizeFor(matePos) : 0;

  const wages = wageBill();
  const stake = planning() ? planning().escrow(raced) : 0;
  career.money += prize + matePrize + salary + bonus + (obj.done ? OBJ_BONUS + stake * 2 : 0) - wages;
  career.money = Math.max(0, career.money);
  const craft = craftScore(player);
  const repDelta = clamp(((team ? expectedFinish(team) : 11) - pos) * 0.6, -4, 6)
                 + (obj.done ? OBJ_REP : -OBJ_REP)
                 + clamp((craft - CRAFT_BASE) * CRAFT_REP, CRAFT_REP_MIN, CRAFT_REP_MAX);
  career.rep = clamp(career.rep + repDelta, 0, 100);
  const dnf = player.retired ? (player.dnf || "mechanical") : null;
  const matePts = mate && paid(mate) ? (table[order.indexOf(mate)] || 0) : 0;
  const dbl = career.flavour === "myteam" && pts > 0 && matePts > 0;
  const cleanRun = !player.retired && !player.dsq && !(player.cuts | 0) && !(player.penalty | 0);
  career.results.push({ r: raced, p: pos, pts, obj: obj.done, dnf,
                        double: dbl, clean: cleanRun,
                        craft: Math.round(craft * 100) / 100 });
  career.obj = null;
  const closedSponsor = sponsorAt(raced);
  const sponsorVerdict = closedSponsor && raced === closedSponsor.end ? { met: closedSponsor.met, label: closedSponsor.label, reason: closedSponsor.met ? "Target met" : "Target missed", pay: closedSponsor.met ? closedSponsor.pay : 0 } : null;
  const sponsorPay = settleSponsor();
  save();
  const persisted = saveStatus();
  if (persisted.ok && persisted.durable && typeof CareerRestorePoints !== "undefined") CareerRestorePoints.capture(slotFlavour, slotIdx, career, { reason: "round" });
  Log.info("game", `Career.settleRound pos=${pos}${dnf ? ` dnf=${dnf}` : ""}`);
  return { pos, pts, prize, matePos, matePrize, salary, bonus, wages, obj, dnf, sponsorPay, craft,
           money: career.money, rep: career.rep, sponsorVerdict, stake, save: persisted,
           unsaved: !persisted.durable };
}

function scoreRound(order, player, fastestId, run) {
  if (!inCareer() || !player || blocked() ||
      (careerRevision != null && currentRevision() !== careerRevision)) {
    careerConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return null;
  }
  if (career.results.some((row) => row.r === career.season.round)) return null;
  const original = JSON.parse(JSON.stringify(career));
  const seasonRef = career.season;
  const staged = JSON.parse(JSON.stringify(seasonRef));
  if (SeasonCal.award(staged, order, fastestId, run) !== "race") return null;
  if (careerConflict || (careerRevision != null && currentRevision() !== careerRevision)) {
    careerConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return null;
  }
  function replace(target, source) {
    for (const key of Object.keys(target)) if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
    Object.assign(target, source);
  }
  replace(seasonRef, staged);
  const result = settleRound(order, player, SeasonCal.payTable(Teams.POINTS, "race", run));
  if (result && result.save && result.save.ok) return result;
  replace(career, original);
  replace(seasonRef, original.season);
  career.season = seasonRef;
  if (careerRevision != null && currentRevision() !== careerRevision) careerConflict = true;
  return null;
}

function gridSeats() {
  const out = [];
  for (const team of Teams.LIST) {
    if (!Teams.isReal(team) && team.id !== career.team) continue;
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
  rows.sort((a, b) => (typeof SeasonCal !== "undefined" && SeasonCal.rank)
    ? SeasonCal.rank(career.season, a.id, b.id)
    : (b.pts - a.pts || (a.id < b.id ? -1 : 1)));
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}
function teamStandings() {
  const rows = Teams.LIST
    .filter((t) => Teams.isReal(t) || t.id === career.team)
    .map((t) => ({ id: t.id, tier: t.tier, pts: career.season.teamPts[t.id] || 0 }));
  rows.sort((a, b) => (typeof SeasonCal !== "undefined" && SeasonCal.rankTeams)
    ? SeasonCal.rankTeams(career.season, a.id, b.id)
    : (b.pts - a.pts || a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}
function expectedConstructor() {
  const m = new Map();
  Teams.LIST.filter((t) => Teams.isReal(t) || t.id === career.team)
    .slice().sort((a, b) => a.tier - b.tier)
    .forEach((t, i) => m.set(t.id, i + 1));
  return m;
}

function bumpAxis(d, axis, by) {
  d[axis] = clamp(Math.round((d[axis] || 0) + by), -DEV_MAX, DEV_MAX);
}

const CRAFT_DEV = 12;
function rolloverDrivers(dStand) {
  const posOf = new Map(dStand.map((r) => [r.id, r.pos]));
  const seasonMark = seasonCraft();
  for (const s of gridSeats()) {
    const r = ratingOf(s);
    const growth = (1 - r.experience / 100) * 6 - 1.5;
    const form = clamp((tierFinish(s.team) - (posOf.get(s.id) || 22)) * 0.25, -3, 3);
    const noise = (rnd(career.year, "dev", s.id) - 0.5) * 4;
    const drift = growth + form + noise;
    const d = career.dev[s.id] || (career.dev[s.id] = {});
    bumpAxis(d, "pace", drift);
    const mine = isPlayerSeat(s) && seasonMark != null;
    bumpAxis(d, "craft", mine
      ? clamp((seasonMark - CRAFT_BASE) * CRAFT_DEV, -3, 3)
      : drift * 0.5);
    d.experience = clamp(Math.round((d.experience || 0) + 4), 0, EXP_MAX);
  }
}

function rolloverTeams(tStand) {
  const posOf = new Map(tStand.map((r) => [r.id, r.pos]));
  const expect = expectedConstructor();
  for (const team of Teams.LIST) {
    if (!Teams.isReal(team) && team.id !== career.team) continue;
    const shove = ((expect.get(team.id) || 11) - (posOf.get(team.id) || 11)) * 0.5;
    const next = tdevStep(career.tdev[team.id] || 0, shove);
    if (next) career.tdev[team.id] = next; else delete career.tdev[team.id];
  }
}
function tdevStep(prev, shove) {
  const v = (Number(prev) || 0) * 0.5 + clamp(Number(shove) || 0, -TDEV_SHOVE, TDEV_SHOVE);
  return clamp(Math.sign(v) * Math.ceil(Math.abs(v) - 0.5), -TDEV_MAX, TDEV_MAX) || 0;
}

function aiSetup(team) {
  if (!inCareer() || !team || typeof CareerAiDev === "undefined") return null;
  return CareerAiDev.fittedOf(career, team);
}

const TOP_TIER = 1;
const MID_TIER = 3;

function rolloverMarket() {
  career.moves = [];
  const swaps = Math.floor(rnd(career.year, "mkt", "n") * 3);
  for (let i = 0; i < swaps; i++) {
    const seats = gridSeats().filter((s) => Teams.isReal(s.team) && !isPlayerSeat(s));
    const rate = (s) => DriverRatings.overall(ratingOf(s));
    const top = seats.filter((s) => s.team.tier <= TOP_TIER)
      .sort((a, b) => rate(a) - rate(b))[0];
    const mid = seats.filter((s) => s.team.tier > TOP_TIER && s.team.tier <= MID_TIER)
      .sort((a, b) => rate(b) - rate(a))[0];
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

const HIRE_MIN = 12;
const HIRE_RAISE_MAX = 0.45;

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
  const poached = pos < expected - 4
    && rnd(career.year, "hire", "poach") < 0.35;
  hire.pending = poached
    ? { kind: "left", ask: 0 }
    : { kind: "renew", ask: hireAsk(hire, pos, expected) };
}

function renewHire(years) {
  if (!career || blocked()) return false;
  const hire = career.roster && career.roster[0];
  if (!hire || !hire.pending || hire.pending.kind !== "renew") return false;
  return commit(() => {
    const h = career.roster[0];
    h.salary = h.pending.ask;
    h.left = clamp(years | 0 || 1, 1, 3);
    h.pending = null;
  });
}
function hireDriver(code, years) {
  if (!career || blocked() || career.flavour !== "myteam") return false;
  const hire = career.roster && career.roster[0];
  if (hire && hire.code === code) return false;
  const agent = FREE_AGENTS.find((x) => x.code === code);
  if (!agent) return false;
  return commit(() => {
    career.roster = [rosterEntry(agent, clamp(years | 0 || 1, 1, 3))];
    if (career.dev) delete career.dev[seasonDriverId(career.team, 1)];
  });
}
function hirePending() {
  const hire = career && career.roster && career.roster[0];
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
    goal: goalFor(team, ambition(), career.year),
  };
}
function makeOffers(mv) {
  if (career.flavour === "myteam") return [];
  const years = clamp(1 + Math.floor(mv / 40), 1, 3);
  const mine = teamOf(career.team);
  const out = [];
  if (mine) out.push(offerFrom(mine, years));
  const willing = Teams.LIST
    .filter((t) => Teams.isReal(t) && t.id !== career.team && mv >= offerBar(t.tier))
    .sort((a, b) => a.tier - b.tier
      || rnd(career.year, "offer", a.id) - rnd(career.year, "offer", b.id));
  const extra = Math.floor(rnd(career.year, "offer", "n") * 3);
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

function worksSnapshot(team) {
  const raw = team.factory || (Parts.FACTORY_PRESETS && Parts.FACTORY_PRESETS[team.id]) || Parts.DEFAULTS;
  const out = {};
  const allowed = (o) => (!o.teams || o.teams.includes(team.id)) && (!o.team || o.team === team.id) && (!o.suppliers || o.suppliers.includes(team.engine)) && (!o.supplier || o.supplier === team.engine);
  for (const cat of Parts.CATALOG) {
    let opt = cat.options.find((o) => o.id === raw[cat.id]);
    if (opt && !allowed(opt)) opt = cat.options.find((o) => o.id === opt.equivalent && allowed(o));
    out[cat.id] = (opt || cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]) || cat.options[0]).id;
  }
  return out;
}
function offerPreview(i) {
  if (!career || blocked()) return null;
  const o = career.offers && career.offers[i | 0], team = o && teamOf(o.teamId);
  if (!team) return null;
  const moving = team.id !== career.team, seat = moving ? weakerSeat(team) : career.seat;
  const fitted = moving ? worksSnapshot(team) : Object.assign({}, career.fitted);
  const owned = moving ? ownedOf(fitted) : career.owned.slice();
  const kind = goalTypeOk(o.goal && o.goal.type), amb = ambition();
  const keep = kind === "beatRival" && o.goal && typeof o.goal.value === "string" && o.goal.value;
  const goal = { type: kind, value: keep || goalKind(kind).value(team, amb) };
  const mate = team.drivers && team.drivers[seat === 0 ? 1 : 0];
  const teammate = mate && seatDriver(team.id, seat === 0 ? 1 : 0, mate);
  const works = worksCost(team.id);
  const cap = Math.min(Math.round(works * BUDGET_MULT[clamp(career.budgetLvl | 0, 0, BUDGET_MULT.length - 1)]), Math.max(budgetCap(), works));
  return { index: i | 0, moving, teamId: team.id, teamName: team.name, seat,
    teammate: teammate ? { name: teammate.name, code: teammate.code } : null,
    fitted, resolvedFitted: Parts.resolveSetup ? Object.assign({}, Parts.resolveSetup(fitted, team).setup) : Object.assign({}, fitted), currentFitted: Object.assign({}, career.fitted), currentCap: budget(), owned, cap, lostResearch: moving ? career.owned.filter((id) => !owned.includes(id)) : [],
    retained: { money: career.money, facility: career.facility, development: Object.assign({}, career.dev[seasonDriverId(career.team, career.seat)] || {}) },
    deal: { team: team.id, seat, years: o.years, left: o.years, salary: Number.isFinite(Number(o.salary)) ? Number(o.salary) : 0, bonusPt: bonusPtFor(team), ambition: amb, goal },
    revision: careerRevision, signature: JSON.stringify([career.year, career.team, career.seat, career.rep, career.amb, career.offers, career.fitted, career.owned, career.dev, career.seats, career.money, career.facility, career.budgetLvl, Parts.legalityKey ? Parts.legalityKey() : ""]) };
}
function acceptOffer(i, reviewed) {
  if (!career || blocked() || (careerRevision != null && currentRevision() !== careerRevision)) return null;
  const preview = offerPreview(i);
  if (!preview || (reviewed && (reviewed.signature !== preview.signature || reviewed.revision !== preview.revision))) return null;
  const o = career.offers ? career.offers[i | 0] : null;
  const team = o && teamOf(o.teamId);
  if (!team) return null;
  const before = snap();
  if (team.id !== career.team) {
    const oldId = seasonDriverId(career.team, career.seat);
    const seat = preview.seat;
    career.team = team.id;
    career.seat = seat;
    const newId = seasonDriverId(career.team, career.seat);
    if (career.dev && oldId !== newId) {
      const mine = career.dev[oldId];
      if (mine) career.dev[newId] = mine; else delete career.dev[newId];
      delete career.dev[oldId];
    }
    career.owned = preview.owned.slice();
    career.fitted = Object.assign({}, preview.fitted);
  }
  career.deal = JSON.parse(JSON.stringify(preview.deal));
  career.offers = [];
  if (!keep(before)) return null;
  Log.info("game", `Career.acceptOffer team=${team.id} years=${o.years}`);
  return career.deal;
}

function codeOf(id) {
  const [teamId, seat] = String(id).split(":");
  const t = teamOf(teamId);
  const d = t && seatDriver(teamId, seat | 0, t.drivers[seat | 0]);
  return (d && d.code) || id;
}

function tallyOf(c) {
  if (c.tally && typeof c.tally === "object") return c.tally;
  const t = { seasons: 0, wins: 0, podiums: 0, titles: 0, cTitles: 0, pts: 0 };
  for (const h of c.history || []) {
    t.seasons++; t.wins += h.wins || 0; t.podiums += h.podiums || 0; t.pts += h.pts || 0;
    if (h.pos === 1) t.titles++;
    if (h.cPos === 1) t.cTitles++;
  }
  return t;
}

function rollover() {
  if (!career || !seasonDone()) return null;
  if (blocked() || (careerRevision != null && currentRevision() !== careerRevision)) {
    if (career && careerRevision != null && currentRevision() !== careerRevision) {
      careerConflict = true;
      lastSave = { ok: false, durable: false, reason: "conflict" };
    }
    return null;
  }
  const original = JSON.parse(JSON.stringify(career));
  const seasonRef = career.season;
  const result = rolloverApply();
  if (lastSave && lastSave.ok && lastSave.durable) return result;
  const reason = (lastSave && lastSave.reason) || "conflict";
  const replace = (target, source) => {
    for (const key of Object.keys(target)) if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
    Object.assign(target, source);
  };
  const restoredSeason = original.season;
  replace(career, original);
  career.season = seasonRef;
  replace(seasonRef, restoredSeason);
  careerConflict = true;
  lastSave = { ok: false, durable: false, reason };
  return null;
}

function rolloverApply() {
  const dStand = driverStandings();
  const tStand = teamStandings();
  const devYear = career.year;
  const devExpect = expectedConstructor();
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
    podiums: career.results.filter((r) => r.p > 0 && r.p <= 3).length,
    craft: seasonCraft() == null ? null : Math.round(seasonCraft() * 100) / 100,
  };
  const tally = career.tally = tallyOf(career);
  tally.seasons++;
  tally.wins += entry.wins;
  tally.podiums += entry.podiums;
  tally.pts += entry.pts;
  if (entry.pos === 1) tally.titles++;
  if (entry.cPos === 1) tally.cTitles++;
  career.history.push(entry);
  if (career.history.length > HISTORY_MAX)
    career.history.splice(0, career.history.length - HISTORY_MAX);

  const winterSeats = gridSeats().filter((seat) => seat.team.id === career.team);
  const winterBefore = winterSeats.map((seat) => ({ seat, rating: ratingOf(seat) }));
  const teamBefore = Object.assign({}, career.tdev);
  const teamOrder = (dev) => Teams.LIST.filter((t) => Teams.isReal(t) || t.id === career.team).slice().sort((a, b) => ((Teams.TIER_V && Teams.TIER_V[b.tier] || 1) * (1 + (dev[b.id] || 0) * TDEV_TO_PACE)) - ((Teams.TIER_V && Teams.TIER_V[a.tier] || 1) * (1 + (dev[a.id] || 0) * TDEV_TO_PACE)) || a.id.localeCompare(b.id)).map((t) => t.id);
  const ranksBefore = teamOrder(teamBefore);
  const buildsBefore = JSON.stringify(career.aiParts || {});
  const oldEra = era();
  rolloverDrivers(dStand);
  rolloverTeams(tStand);
  career.winterReport = { year: devYear, drivers: winterBefore.map(({ seat, rating }) => {
    const after = ratingOf(seat), axes = {};
    for (const key of ["pace", "craft", "awareness", "consistency", "experience"]) axes[key] = { before: rating[key], after: after[key], delta: after[key] - rating[key] };
    return { code: seat.driver.code, name: seat.driver.name, player: isPlayerSeat(seat), axes };
  }), team: { id: career.team, before: teamBefore[career.team] || 0, after: career.tdev[career.team] || 0 },
  teams: Teams.LIST.filter((t) => Teams.isReal(t) || t.id === career.team).map((t) => ({ id: t.id, name: t.name, before: teamBefore[t.id] || 0, after: career.tdev[t.id] || 0, rankBefore: ranksBefore.indexOf(t.id) + 1, rankAfter: teamOrder(career.tdev).indexOf(t.id) + 1, delta: (career.tdev[t.id] || 0) - (teamBefore[t.id] || 0) })).sort((a, b) => Math.abs(b.rankAfter - b.rankBefore) - Math.abs(a.rankAfter - a.rankBefore) || Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id)).slice(0, 3),
  explanation: "Driver pace combines experience, season results and form; your craft also uses settled driving. Team development reflects constructors performance and previous development decay." };
  rolloverMarket();

  let mvPenalty = 0;
  if (career.flavour !== "myteam" && career.deal && career.deal.goal) {
    const mateId = seasonDriverId(career.team, career.seat === 0 ? 1 : 0);
    const mateRow = dStand.find((r) => r.id === mateId);
    const rivalRow = career.deal.goal.type === "beatRival"
      ? dStand.find((r) => r.id === career.deal.goal.value) : null;
    const res = { pos: entry.pos, cPos: entry.cPos, wins: entry.wins,
                  podiums: entry.podiums, matePos: mateRow ? mateRow.pos : null,
                  rivalPos: rivalRow ? rivalRow.pos : null };
    const met = goalKind(career.deal.goal.type).met(career.deal.goal.value, res);
    const A = AMBITION[ambitionOf(career.deal)];
    career.rep = clamp(career.rep + (met ? A.rep : -A.rep), 0, 100);
    if (!met) mvPenalty = A.mv;
    career.goalResult = { value: career.deal.goal.value, pos: entry.pos, met,
                          type: career.deal.goal.type,
                          label: goalLabel(career.deal.goal, rivalRow && rivalRow.code),
                          ambition: ambitionOf(career.deal) };
  } else {
    career.goalResult = null;
  }
  const mv = Math.max(0, marketValue(dStand) - mvPenalty);
  if (career.flavour !== "myteam" && career.deal && career.deal.left > 0) career.deal.left--;
  rolloverHire(dStand);
  career.offers = career.deal && career.deal.left > 0 ? [] : makeOffers(mv);

  career.year++;
  applyRegs();
  if (typeof CareerAiDev !== "undefined") {
    if (CareerAiDev.scrubFitted) CareerAiDev.scrubFitted(career);
    if (CareerAiDev.developWinter) CareerAiDev.developWinter(career, tStand, devExpect, rnd, devYear);
  }
  career.winterReport.carBuildsChanged = buildsBefore !== JSON.stringify(career.aiParts || {});
  career.winterReport.eraChanged = !!(oldEra && era() && oldEra.id !== era().id);
  const s = career.season;
  s.round = 0; s.pts = {}; s.teamPts = {}; s.driverCodes = {};
  s.finishes = {};
  s.roundPts = {}; delete s.lastFl;
  delete s.stage; delete s.sprintOrder; delete s.qualiOrder; delete s.qualiTrack; delete s.qualiMode;
  delete s.startedRound;
  stampCalendar(s, career.calSet);
  career.results = [];
  career.obj = null;
  career.objPick = null;
  career.paidSponsors = [];
  save({ requireDurable: true });
  return { year: career.year, champion: entry.champion, summary: entry,
           offers: career.offers, history: career.history, moves: career.moves };
}

function calIdsNow(set) {
  if (set === "real2026" && typeof SeasonCal !== "undefined" && SeasonCal.presetIds) {
    const real = SeasonCal.presetIds("real2026");
    if (real.length && real.length === (SeasonCal.REAL_2026 || []).length) return real.slice();
  }
  const ids = (Tracks.SEASON || []).map((t) => t && t.id);
  return ids.length && ids.every((id) => typeof id === "string") ? ids : null;
}
function stampCalendar(season, set) {
  const ids = calIdsNow(set);
  if (ids) season.calIds = ids; else delete season.calIds;
}
let calMemo = null;
function calendarOf(c) {
  const all = Tracks.SEASON || [];
  const ids = c && c.season && c.season.calIds;
  if (!Array.isArray(ids) || !ids.length) return all;
  const list = Tracks.LIST || [];
  if (calMemo && calMemo.ids === ids && calMemo.list === list && calMemo.n === list.length) return calMemo.cal;
  const byId = new Map(list.map((t) => [t.id, t]));
  const cal = ids.map((id) => byId.get(id)).filter(Boolean);
  const out = cal.length === ids.length ? cal : all;
  calMemo = { ids, list, n: list.length, cal: out };
  return out;
}
const CAL_MAX = 64;
function adoptCalendar(c, explicit) {
  const s = c && c.season;
  if (!s || typeof s !== "object") return c;
  const ids = s.calIds;
  if (!explicit && typeof CareerPlanning !== "undefined" && CareerPlanning.protect(c, Tracks.LIST || [])) {
    calendarProtection = { raw: store.raw ? store.raw(liveSlotKey()) : JSON.stringify(c), missing: CareerPlanning.missing(c, Tracks.LIST || []) };
    protectedRaw.set(liveSlotKey(), calendarProtection.raw);
    return c;
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > CAL_MAX ||
      ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
    if (explicit) { if (typeof CareerPlanning !== "undefined") CareerPlanning.remapWeekend(c, s.round, 0); s.round = 0; s.pts = {}; s.teamPts = {}; s.roundPts = {}; s.finishes = {}; c.results = []; }
    stampCalendar(s, c.calSet);
    return c;
  }
  const known = new Set((Tracks.LIST || []).map((t) => t && t.id));
  if (!known.size || ids.every((id) => known.has(id))) return c;
  const keep = ids.filter((id) => known.has(id));
  if (!keep.length) { if (typeof CareerPlanning !== "undefined") CareerPlanning.remapWeekend(c, s.round, 0); s.round = 0; s.pts = {}; s.teamPts = {}; s.roundPts = {}; s.finishes = {}; c.results = []; stampCalendar(s, c.calSet); return c; }
  const done = Number.isInteger(s.round) ? Math.min(Math.max(s.round, 0), ids.length) : 0;
  const to = [];
  let n = 0;
  ids.forEach((id, i) => { to[i] = known.has(id) ? n++ : -1; });
  s.round = ids.slice(0, done).filter((id) => known.has(id)).length;
  s.calIds = keep;
  if (s.roundPts && typeof s.roundPts === "object") {
    for (const id of Object.keys(s.roundPts)) {
      const row = [];
      (Array.isArray(s.roundPts[id]) ? s.roundPts[id] : []).forEach((v, r) => { if (to[r] >= 0) row[to[r]] = v; });
      s.roundPts[id] = row;
    }
  }
  if (Array.isArray(c.results)) {
    c.results = c.results.filter((r) => r &&
      ((typeof r.archivedCircuit === "string" && !("r" in r)) || Number.isInteger(r.r) && r.r >= 0 && r.r < ids.length));
    c.results.forEach((r) => {
      if (!("r" in r)) return;
      if (to[r.r] >= 0) r.r = to[r.r];
      else {
        r.archivedCircuit = ids[r.r];
        delete r.r;
      }
    });
  }
  if (typeof CareerPlanning !== "undefined") CareerPlanning.remapWeekend(c, done, s.round);
  else { c.objPick = null; delete s.startedRound; }
  return c;
}

function planning() {
  if (typeof CareerPlanning === "undefined") return null;
  return CareerPlanning.create({
    data: () => career, blocked, commit, api: () => Career,
    raw: () => store.raw ? store.raw(liveSlotKey()) : null,
    protection: () => calendarProtection, revision: currentRevision, armed: () => careerRevision,
    adopt: () => {
      if (!calendarProtection || careerConflict || currentRevision() !== careerRevision ||
          (store.raw && store.raw(liveSlotKey()) !== calendarProtection.raw) ||
          (typeof SaveMigrate !== "undefined" && career.v > SaveMigrate.CAREER_V)) return false;
      const original = career, protection = calendarProtection;
      career = adoptCalendar(JSON.parse(JSON.stringify(career)), true);
      calendarProtection = null; save({ requireDurable: true });
      if (!lastSave.durable) { career = original; calendarProtection = protection; return false; }
      protectedRaw.delete(liveSlotKey()); return true;
    },
  });
}
function round() { return career ? career.season.round : 0; }
function roundsTotal() { return calendarOf(career).length; }
function seasonDone() { return career ? career.season.round >= calendarOf(career).length : false; }
function calendar() { return calendarOf(career); }
function trackIndex() {
  const cal = calendarOf(career);
  const n = cal.length;
  if (!n) return -1;
  const r = career ? career.season.round : 0;
  const i = Math.min(Math.max(0, r), n - 1);
  return cal === Tracks.SEASON ? Tracks.seasonIndex(i) : Tracks.LIST.indexOf(cal[i]);
}

function state() {
  if (!career) return null;
  const team = teamOf(career.team);
  return {
    flavour: career.flavour, year: career.year,
    round: career.season.round, rounds: calendarOf(career).length,
    team: career.team, teamName: team ? team.name : career.team,
    money: career.money, rep: career.rep,
    budget: budget(), budgetLvl: career.budgetLvl,
    budgetCost: budgetUpgradeCost(), budgetMax: BUDGET_MULT.length - 1,
    facility: facility(), facilityCost: facilityCost(),
    facilityDiscount: facilityDiscount(),
    owned: career.owned.length,
    deal: career.deal, obj: objective(),
    era: (() => {
      const e = era();
      return e ? { id: e.id, name: e.name, blurb: e.blurb, cats: e.cats.slice(),
                   left: eraSeasonsLeft(), banned: Regulations.bannedIds(e.id).size } : null;
    })(),
    amb: ambition(),
    dnfs: career.results.filter((r) => r.dnf).length,
    craft: seasonCraft(),
    roster: career.roster, wages: wageBill(), hire: hirePending(),
    sponsor: sponsor(),
    offers: career.offers.length, moves: (career.moves || []).length,
    seasons: tallyOf(career).seasons,
    slot: slotIdx, slotFlavour,
    slotsUsed: slots(career.flavour).filter((s) => s.used).length,
    slotsTotal: SLOTS,
  };
}

return {
  PRIZE, RESEARCH_MULT, TDEV_MAX, TDEV_REACH, TDEV_TO_PACE, START_MONEY, tdevStep,
  planning,
  OBJ_BONUS, OBJ_REP, HISTORY_MAX, craftScore, seasonCraft,
  SLOTS, FLAVOURS, slot, slots, useSlot, deleteSlot, slotRevision, armedRevision, firstFree,
  data, active, inCareer, conflicted, engage, load, save, saveStatus, clear, start, state, rnd, hash, seasonSeed,
  GRANT, freeMoney, grant,
  sponsor, sponsorAt, sponsorLabel, settleSponsor,
  FACILITY_MAX, FACILITY_DISCOUNT_MAX, facility, facilityCost, facilityDiscount,
  upgradeFacility, SPONSOR_KINDS,
  renewHire, hireDriver, hirePending, HIRE_MIN,
  salaryFor, expectedFinish, tierFinish, driverOverride, devFor,
  AMBITION, ambition, ambitionOf, setAmbition, goalValueFor,
  GOAL_KINDS, GOAL_ORDER, goalFor, goalLabel, goalNow, goalOnTrack, goalTypeFor,
  era, eraSeasonsLeft, seasonsElapsed, applyRegs,
  gridDrivers, freeAgents, MYTEAM_WORKS,
  paceMult, teamStats, aiSetup,
  owned, researchCost, research, budget, upgradeBudget,
  identityValue, setIdentityValue, onIdentityChange, identityRevision: () => identityRevision,
  objective, objectiveFor, objectiveLabel, objectiveMet, prizeFor, settleRound, scoreRound, budgetCap,
  OBJ_CHOICES, objectiveChoices, objectivePick, chooseObjective, objectiveLocked, markWeekendStarted,
  driverStandings, teamStandings, rollover, offers, offerPreview, acceptOffer, marketValue, offerBar,
  round, roundsTotal, seasonDone, trackIndex, calendar, tallyOf,
};
})();
Object.freeze(Career);
