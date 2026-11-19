const SeasonCal = (function () {
  "use strict";

const { store } = GameStore;

const CFG_KEY = "seasonCfg";
const SAVE_KEY = "season";

const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const CLASSIC_POINTS = [10, 6, 4, 3, 2, 1];
const DROP_OPTS = [0, 2, 3];

const SPRINT_FRAC = 1 / 3;
const SPRINT_MIN = 2;

const DEFAULT_LAPS = 3;
const LAP_OPTS = [3, 5, 10, 25, 57];

function legacyIds() { return Tracks.SEASON.map((t) => t.id); }
function defaultIds() { const ids = knownIds(REAL_2026.map((r) => r.id)); return ids.length === REAL_2026.length ? ids : legacyIds(); }
function fresh() {
  return {
    trackIds: defaultIds(),
    quali: true,
    sprint: false,
    sprintIds: [],
    laps: DEFAULT_LAPS,
    points: "modern",
    flPoint: false,
    drop: 0,
  };
}

function knownMap(raw) {
  const seen = new Set();
  let n = 0;
  return (Array.isArray(raw) ? raw : []).map((id) => {
    if (typeof id !== "string" || seen.has(id) || !Tracks.LIST.some((t) => t.id === id)) return -1;
    seen.add(id);
    return n++;
  });
}
function knownIds(raw) { const m = knownMap(raw); return m.length ? raw.filter((_, i) => m[i] >= 0) : []; }
function normalize(raw) {
  const def = fresh();
  const c = raw && typeof raw === "object" ? raw : {};
  const ids = knownIds(c.trackIds);
  return {
    trackIds: ids.length ? ids : def.trackIds,
    quali: c.quali !== false,
    sprint: c.sprint === true ? true : c.sprint === "rounds" ? "rounds" : false,
    sprintIds: knownIds(c.sprintIds),
    laps: LAP_OPTS.indexOf(c.laps) >= 0 ? c.laps : def.laps,
    points: c.points === "classic" ? "classic" : "modern",
    flPoint: c.flPoint === true,
    drop: DROP_OPTS.indexOf(c.drop) >= 0 ? c.drop : 0,
  };
}

let cfg = null;
let resolved = null;
let activeCfg = null;
let activeSeason = null;
let seasonRevision = null;
let seasonConflict = false;
let lastSave = { ok: true, durable: true, reason: null };

if (store.subscribe) store.subscribe((change) => {
  if (change.local && !seasonConflict && activeSeason && change.key === SAVE_KEY &&
      store.get(SAVE_KEY, null) === activeSeason) { seasonRevision = currentRevision(); return; }
  if (!change.foreign) return;
  if (change.clear || change.key === CFG_KEY) { cfg = null; resolved = null; }
  if (change.clear || change.key === SAVE_KEY) {
    if (flow === "season" && activeSeason) seasonConflict = true;
    else {
      activeSeason = null;
      activeCfg = null;
      seasonConflict = false;
      resolved = null;
    }
  }
});

function config() {
  if (!cfg) cfg = normalize(store.get(CFG_KEY, null));
  return cfg;
}
function setConfig(next) {
  cfg = normalize(next);
  resolved = null;
  store.set(CFG_KEY, cfg);
  Log.info("game", `SeasonCal.setConfig rounds=${cfg.trackIds.length}`);
  return cfg;
}
function resetConfig() { return setConfig(null); }

function frozenConfig(raw) {
  const out = normalize(raw);
  out.trackIds = Object.freeze(out.trackIds);
  out.sprintIds = Object.freeze(out.sprintIds);
  return Object.freeze(out);
}
function rulesConfig() { return flow === "season" && activeCfg ? activeCfg : config(); }
const currentRevision = () => store.keyRevision ? store.keyRevision(SAVE_KEY) : null;
function armRevision(season) {
  activeSeason = season;
  seasonRevision = currentRevision();
  seasonConflict = false;
}

let flow = "gp";
function engage(v) {
  flow = v || "gp";
  resolved = null;
  lastScored = "race";
  Log.info("game", `SeasonCal.engage ${flow}`);
}
const calCustom = () => flow !== "career";
const fmtActive = () => flow === "season";

function list() {
  if (!calCustom()) return typeof Career !== "undefined" && Career.calendar ? Career.calendar() : Tracks.SEASON;
  if (!resolved) {
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    resolved = rulesConfig().trackIds.map((id) => byId.get(id)).filter(Boolean);
    if (!resolved.length) resolved = Tracks.SEASON.slice();
  }
  return resolved;
}
function rounds() { return list().length; }
function track(round) { return list()[round] || null; }
const REAL_2026_GP = Object.freeze({ sepang: "Bahrain GP", catalunya: "Barcelona-Catalunya GP" });
function gpName(t) {
  if (!t) return "";
  if (fmtActive() && REAL_2026_GP[t.id]) {
    const ids = rulesConfig().trackIds || [];
    if (ids.length === REAL_2026.length && REAL_2026.every((r, i) => r.id === ids[i])) return REAL_2026_GP[t.id];
  }
  return t.gp || "";
}
function trackIndex(round) {
  const t = track(round);
  return t ? Tracks.LIST.indexOf(t) : -1;
}

let lastScored = "race";

function blank() {
  const snap = frozenConfig(flow === "season" && activeCfg ? activeCfg : config());
  if (flow === "season") activeCfg = snap;
  return { round: 0, pts: {}, teamPts: {}, driverCodes: {}, finishes: {}, roundPts: {}, config: snap };
}
function resetWeekend() { lastScored = "race"; }
function restart() {
  activeCfg = frozenConfig(config());
  resolved = null;
  resetWeekend();
  const season = blank();
  activeSeason = season;
  return season;
}
function matchesConfig(season, next) {
  return !!(season && season.config && JSON.stringify(normalize(season.config)) === JSON.stringify(normalize(next)));
}
function applyConfig(next) {
  const now = currentRevision();
  if (seasonConflict || (seasonRevision != null && now !== seasonRevision)) {
    seasonConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return Object.assign({ season: null }, lastSave);
  }
  if (canRace(activeSeason) && matchesConfig(activeSeason, next)) {
    if (!matchesConfig({ config: config() }, next)) setConfig(next);
    const refused = lastSave.reason === "invalid" || lastSave.reason === "unknown circuit" || lastSave.reason === "conflict";
    return Object.assign({}, refused ? { ok: true, durable: true, reason: null } : lastSave, { season: activeSeason, ok: true });
  }
  const snap = frozenConfig(next);
  const season = { round: 0, pts: {}, teamPts: {}, driverCodes: {}, finishes: {}, roundPts: {}, config: snap };
  if (typeof store.write === "function") lastSave = store.write(SAVE_KEY, season);
  else {
    const durable = store.set(SAVE_KEY, season) !== false;
    lastSave = { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
  }
  cfg = setConfig(next);
  activeCfg = snap;
  resolved = null;
  resetWeekend();
  armRevision(season);
  return Object.assign({ season }, lastSave);
}

function scoreMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, value]) => {
    const n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    if (id && isFinite(n)) out[id] = Math.max(0, n);
  });
  return out;
}
function roundMap(o) { return SaveMigrate.roundMap(o); }
function finishMap(o) { return SaveMigrate.finishMap(o); }
function codeMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, value]) => {
    if (id && typeof value === "string") out[id] = value.slice(0, 12);
  });
  return out;
}
function resume(saved) {
  const s = saved && typeof saved === "object" ? saved : null;
  const legacy = s && !s.config && store.get(CFG_KEY, null) == null
    ? Object.assign(fresh(), { trackIds: legacyIds() }) : null;
  activeCfg = frozenConfig(s && s.config ? s.config : legacy || config());
  resolved = null;
  const n = activeCfg.trackIds.length;
  const rawIds = s && s.config && Array.isArray(s.config.trackIds) ? s.config.trackIds : null;
  const idx = rawIds ? knownMap(rawIds) : null;
  const remap = idx && idx.some((v) => v >= 0) ? idx : null;
  if (remap && Number.isInteger(s.round) && s.round >= 0 && s.round <= rawIds.length) {
    s.round = remap.slice(0, s.round).filter((v) => v >= 0).length;
  }
  if (!s || !Number.isInteger(s.round) || s.round < 0 || s.round > n) {
    return restart();
  }
  s.config = activeCfg;
  s.pts = scoreMap(s.pts);
  s.teamPts = scoreMap(s.teamPts);
  s.driverCodes = codeMap(s.driverCodes);
  s.finishes = finishMap(s.finishes);
  s.roundPts = roundMap(s.roundPts);
  if (remap && remap.some((v, i) => v !== i)) {
    for (const id of Object.keys(s.roundPts)) {
      const row = [];
      s.roundPts[id].forEach((v, r) => { if (remap[r] >= 0) row[remap[r]] = v; });
      s.roundPts[id] = row;
    }
  }
  if (typeof s.lastFl !== "string") delete s.lastFl;
  if (!(Number.isInteger(s.seed) && s.seed > 0 && s.seed <= 0xFFFFFFFF)) delete s.seed;
  if (s.sprintOrder) delete s.sprintOrder;
  return s;
}
let lastLossy = false;
const lossySeasons = new WeakSet();
function lastLoadLossy() { return lastLossy; }
function load() {
  const raw = store.get(SAVE_KEY, null);
  const rawIds = raw && raw.config && Array.isArray(raw.config.trackIds) ? raw.config.trackIds : null;
  const copy = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : raw;
  const season = resume(copy);
  armRevision(season);
  const lossy = !!raw && rawIds != null && (knownIds(rawIds).length !== rawIds.length
    || (season === copy && season.config.trackIds.length !== rawIds.length));
  lastLossy = lossy;
  if (lossy) lossySeasons.add(season);
  if (raw && !lossy) save(season, { migration: true });
  return season;
}
function save(season, options) {
  if (!season || typeof season !== "object") {
    lastSave = { ok: false, durable: false, reason: "invalid" };
    return lastSave;
  }
  if (lossySeasons.has(season)) {
    lastSave = { ok: false, durable: false, reason: "unknown circuit" };
    Log.warn("game", "SeasonCal.save refused: the saved calendar names a circuit this build does not know");
    return lastSave;
  }
  const now = currentRevision();
  if (seasonConflict || (seasonRevision != null && now !== seasonRevision)) {
    seasonConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return lastSave;
  }
  activeCfg = frozenConfig(season.config || activeCfg || config());
  season.config = activeCfg;
  if (typeof store.write === "function") lastSave = store.write(SAVE_KEY, season, options);
  else {
    const durable = store.set(SAVE_KEY, season, options) !== false;
    lastSave = { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
  }
  armRevision(season);
  return lastSave;
}
function clear() {
  const now = currentRevision();
  if (seasonConflict || (seasonRevision != null && now !== seasonRevision)) {
    seasonConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return lastSave;
  }
  if (typeof store.write === "function") lastSave = store.write(SAVE_KEY, null);
  else {
    const durable = store.set(SAVE_KEY, null) !== false;
    lastSave = { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
  }
  activeSeason = null;
  activeCfg = null;
  resolved = null;
  seasonRevision = currentRevision();
  seasonConflict = false;
  return lastSave;
}
function conflicted() { return seasonConflict; }
function saveStatus() { return Object.assign({}, lastSave); }
function canRace(season) {
  return !!(season && Number.isInteger(season.round) && season.round >= 0 && season.round < rounds());
}
function hasProgress(season) {
  return !!(season && (season.round > 0 || season.stage === "race"));
}

function sprintOn(season) {
  if (!fmtActive()) return false;
  const c = rulesConfig();
  if (c.sprint === true) return true;
  if (c.sprint !== "rounds" || !c.sprintIds || !c.sprintIds.length) return false;
  const s = season || activeSeason;
  const t = track(s && Number.isInteger(s.round) ? s.round : 0);
  return !!t && c.sprintIds.indexOf(t.id) >= 0;
}
function stage(season) {
  if (!sprintOn(season)) return "race";
  return season && season.stage === "race" ? "race" : "sprint";
}
function midWeekend(season) { return sprintMid(season && season.config ? season.config : (fmtActive() ? rulesConfig() : null), season); }

function quali() { return !fmtActive() || rulesConfig().quali; }
function qualiNext() { return quali(); }
function qualiLabel(season) { return stage(season) === "sprint" ? "SPRINT QUALIFYING" : "QUALIFYING"; }

function lapsFor(fallback, season) {
  if (stage(season) !== "sprint") return fallback;
  return Math.max(SPRINT_MIN, Math.round(fallback * SPRINT_FRAC));
}

function formatLaps(fallback) { return fmtActive() ? rulesConfig().laps : fallback; }
function roundLaps(prev, season, full) {
  const laps = midWeekend(season) ? prev : formatLaps(prev);
  return full > 0 ? Math.min(laps, full) : laps;
}

function pointsTable() {
  return fmtActive() && rulesConfig().points === "classic" ? CLASSIC_POINTS : Teams.POINTS;
}

const SHORT_POINTS = [[6, 4, 3, 2, 1], [13, 10, 8, 6, 5, 4, 3, 2, 1], [19, 14, 12, 9, 8, 6, 5, 3, 2, 1]];
function shortFrac(run) { return run ? run.laps / Math.max(1, run.of) : 1; }
function payTable(table, scoring, run) {
  if (!run) return table;
  const f = shortFrac(run);
  if (run.laps < 2) return [];
  if (scoring === "sprint") return f < 0.5 ? [] : table;
  if (f >= 0.75) return table;
  return table === CLASSIC_POINTS ? table.map((p) => p / 2) : SHORT_POINTS[f < 0.25 ? 0 : f < 0.5 ? 1 : 2];
}

function award(season, order, fastestId, run) {
  if (season) delete season.lastFl;
  if (fmtActive() && seasonConflict) return null;
  if (!canRace(season)) return null;
  const scoring = stage(season);
  const table = payTable(scoring === "sprint" ? SPRINT_POINTS : pointsTable(), scoring, run);
  const fl = scoring !== "sprint" && fmtActive() && rulesConfig().flPoint && fastestId != null && shortFrac(run) >= 0.5;
  const rp = season.roundPts || (season.roundPts = {});
  order.forEach((c, i) => {
    const classified = c.classified != null ? !!c.classified : !c.retired;
    let pts = classified ? (table[i] || 0) : 0;
    if (fl && classified && !c.retired && c.driverId === fastestId && i < Math.min(10, table.length)) { pts += 1; season.lastFl = fastestId; }
    const row = rp[c.driverId] || (rp[c.driverId] = []);
    row[season.round] = (row[season.round] || 0) + pts;
    season.pts[c.driverId] = (season.pts[c.driverId] || 0) + pts;
    season.driverCodes[c.driverId] = c.code;
    season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
    if (scoring !== "sprint" && classified) {
      const f = season.finishes || (season.finishes = {});
      const row = f[c.driverId] || (f[c.driverId] = []);
      row[i] = (row[i] || 0) + 1;
    }
  });
  delete season.qualiOrder;
  delete season.qualiTrack;
  delete season.qualiMode;
  if (scoring === "sprint") {
    season.stage = "race";
  } else {
    season.round++;
    delete season.stage;
    delete season.sprintOrder;
  }
  lastScored = scoring;
  Log.info("game", `SeasonCal.award ${scoring} round=${season.round}`);
  return scoring;
}
function scored() { return lastScored; }

function sprintMid(c, season) {
  if (!c || !season || season.stage !== "race") return false;
  if (c.sprint === true) return true;
  if (c.sprint !== "rounds" || !c.sprintIds || !c.trackIds) return false;
  const id = c.trackIds[Number.isInteger(season.round) ? season.round : 0];
  return !!id && c.sprintIds.indexOf(id) >= 0;
}
function netPts(season, id) {
  const gross = (season && season.pts && season.pts[id]) || 0;
  const c = season && season.config ? season.config : (fmtActive() ? rulesConfig() : null);
  const drop = c ? c.drop || 0 : 0;
  if (!drop || !season) return gross;
  const row = (season.roundPts && season.roundPts[id]) || [];
  const played = (season.round || 0) + (sprintMid(c, season) ? 1 : 0);
  const keep = Math.max(1, (c.trackIds ? c.trackIds.length : rounds()) - drop);
  if (played <= keep || !row.length) return gross;
  const vals = [];
  for (let r = 0, n = Math.min(played, row.length); r < n; r++) vals.push(row[r] || 0);
  vals.sort((x, y) => y - x);
  let sum = 0;
  for (let i = 0; i < keep; i++) sum += vals[i] || 0;
  return sum;
}

function rank(season, a, b) {
  const d = netPts(season, b) - netPts(season, a);
  if (d) return d;
  const fin = (season && season.finishes) || {};
  const fa = fin[a] || [], fb = fin[b] || [];
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    const e = (fb[i] || 0) - (fa[i] || 0);
    if (e) return e;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

let luckStamps = 0;
function luckSeed(season, sessionSeed) {
  const base = (sessionSeed >>> 0) || 1;
  if (!season || typeof season !== "object") return base;
  if (Number.isInteger(season.seed) && season.seed > 0) return season.seed >>> 0;
  season.seed = (luckStamps ? (base ^ Math.imul(luckStamps, 0x9E3779B1)) >>> 0 : base) || 1;
  luckStamps++;
  save(season);
  return season.seed;
}

function teamFinishes(season, team) {
  const row = [];
  const fin = (season && season.finishes) || {};
  for (const id of Object.keys(fin)) {
    const k = id.lastIndexOf(":");
    if ((k > 0 ? id.slice(0, k) : id) !== team) continue;
    const f = fin[id] || [];
    for (let i = 0; i < f.length; i++) if (f[i]) row[i] = (row[i] || 0) + f[i];
  }
  return row;
}
function rankTeams(season, a, b) {
  const pts = (season && season.teamPts) || {};
  const d = (pts[b] || 0) - (pts[a] || 0);
  if (d) return d;
  if (a === b) return 0;
  const fa = teamFinishes(season, a), fb = teamFinishes(season, b);
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    const e = (fb[i] || 0) - (fa[i] || 0);
    if (e) return e;
  }
  const list = (typeof Teams !== "undefined" && Teams.LIST) || [];
  const ta = list.find((t) => t.id === a);
  const tb = list.find((t) => t.id === b);
  const tierA = ta && Number.isFinite(ta.tier) ? ta.tier : Infinity;
  const tierB = tb && Number.isFinite(tb.tier) ? tb.tier : Infinity;
  if (tierA !== tierB) return tierA - tierB;
  return a < b ? -1 : a > b ? 1 : 0;
}

const SPRINT_SEED_OFFSET = 1000;
function drawRound(season) {
  const r = season ? season.round : 0;
  return stage(season) === "sprint" ? r + SPRINT_SEED_OFFSET : r;
}

const REAL_2026 = Object.freeze([
  ["albert_park", "03-06", "03-08"], ["shanghai", "03-13", "03-15", 1], ["suzuka", "03-27", "03-29"],
  ["miami", "05-01", "05-03", 1], ["montreal", "05-22", "05-24", 1], ["monaco", "06-05", "06-07"],
  ["catalunya", "06-12", "06-14"], ["redbull", "06-26", "06-28"], ["silverstone", "07-03", "07-05", 1],
  ["spa", "07-17", "07-19"], ["hungaroring", "07-24", "07-26"], ["zandvoort", "08-21", "08-23", 1],
  ["monza", "09-04", "09-06"], ["madrid", "09-11", "09-13"], ["baku", "09-24", "09-26"],
  ["sepang", "10-02", "10-04"], ["singapore", "10-09", "10-11", 1], ["cota", "10-23", "10-25"],
  ["mexico", "10-30", "11-01"], ["interlagos", "11-06", "11-08"], ["vegas", "11-19", "11-21"],
  ["qatar", "11-27", "11-29"], ["abudhabi", "12-04", "12-06"],
].map(([id, from, to, sprint]) => Object.freeze({ id, from: "2026-" + from, to: "2026-" + to, sprint: !!sprint })));

const PRESETS = [
  { id: "real2026", label: "2026 REAL" },
  { id: "full", label: "24-ROUND" },
  { id: "12", label: "12" },
  { id: "8", label: "8" },
  { id: "5", label: "5" },
  { id: "classics", label: "CLASSICS" },
];
function presetIds(id) {
  if (id === "real2026") return knownIds(REAL_2026.map((r) => r.id));
  if (id === "classics") return Tracks.LIST.filter((t) => t.classic).map((t) => t.id);
  const all = Tracks.SEASON.map((t) => t.id);
  const n = parseInt(id, 10);
  return n > 0 ? all.slice(0, Math.min(n, all.length)) : all;
}
function preset(id) {
  const out = { trackIds: presetIds(id) };
  if (id === "real2026") {
    out.sprint = "rounds";
    out.sprintIds = knownIds(REAL_2026.filter((r) => r.sprint).map((r) => r.id));
  }
  return out;
}
function shuffled(ids, seed) {
  const a = ids.slice();
  let s = seed != null ? (seed | 0) : null;
  for (let i = a.length - 1; i > 0; i--) {
    let r;
    if (s != null) {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    } else {
      r = Math.random();
    }
    const j = Math.floor(r * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

return {
  SPRINT_POINTS, CLASSIC_POINTS, payTable, DROP_OPTS, LAP_OPTS, PRESETS, DEFAULT_LAPS, REAL_2026,
  config, setConfig, resetConfig, applyConfig, matchesConfig, fresh, normalize,
  engage, list, rounds, track, trackIndex,
  load, lastLoadLossy, save, clear, conflicted, saveStatus,
  resume, blank, restart, canRace, hasProgress,
  quali, qualiNext, qualiLabel, stage, midWeekend, sprintOn, lapsFor, formatLaps, roundLaps, pointsTable,
  award, scored, rank, rankTeams, netPts, drawRound, luckSeed,
  presetIds, preset, shuffled, gpName, legacyIds,
};
})();
