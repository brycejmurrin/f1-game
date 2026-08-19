/* Apex 26 — the SEASON CALENDAR and the WEEKEND FORMAT: which circuits a standalone championship visits and in what order, whether the weekend qualifies, whether … */
const SeasonCal = (function () {
  "use strict";

const { store } = GameStore;

const CFG_KEY = "seasonCfg";           // store.get/set add the `apex26.` prefix

const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const CLASSIC_POINTS = [10, 6, 4, 3, 2, 1];

const SPRINT_FRAC = 1 / 3;
const SPRINT_MIN = 2;

// The distance a fresh config asks for. Matches GAME_LAPS in js/game.js; it is
// duplicated rather than imported because that value is a game-loop constant in
// a file this one must not depend on, and a mismatch is harmless (it is a
// PRESELECTION for the #rs-laps chips, never an override of them).
const DEFAULT_LAPS = 3;
const LAP_OPTS = [3, 5, 10, 25, 57];

// Circuits are named by ID, never by index. `apex26.track` is a positional index
// into Tracks.LIST and tools/manifest.cjs carries a standing warning about what
// that costs when the list is reordered; a saved calendar has to survive the
// list growing, so it stores what it means.
function fresh() {
  return {
    trackIds: Tracks.SEASON.map((t) => t.id),
    quali: true,
    sprint: false,
    laps: DEFAULT_LAPS,
    points: "modern",
  };
}

// NORMALISE ON READ. There is no generic migration registry for store keys, and
// GameStore.migrateCareer's "fill every optional field" tail is the house answer
// for a save whose shape may predate the build reading it. An id that no longer
// exists is dropped rather than failing the whole config, because losing one
// retired circuit should not cost the player their calendar.
function normalize(raw) {
  const def = fresh();
  const c = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const ids = (Array.isArray(c.trackIds) ? c.trackIds : []).filter((id) => {
    if (typeof id !== "string" || seen.has(id)) return false;
    if (!Tracks.LIST.some((t) => t.id === id)) return false;
    seen.add(id);
    return true;
  });
  return {
    trackIds: ids.length ? ids : def.trackIds,
    quali: c.quali !== false,
    sprint: c.sprint === true,
    laps: LAP_OPTS.indexOf(c.laps) >= 0 ? c.laps : def.laps,
    points: c.points === "classic" ? "classic" : "modern",
  };
}

let cfg = null;          // resolved lazily: Tracks.LIST is not ready at eval time
let resolved = null;     // trackIds -> circuit defs, invalidated with cfg

if (store.subscribe) store.subscribe((change) => {
  if (change.clear || change.key === CFG_KEY) { cfg = null; resolved = null; }
});

function config() {
  if (!cfg) cfg = normalize(store.get(CFG_KEY, null));
  return cfg;
}
function setConfig(next) {
  cfg = normalize(next);
  resolved = null;
  store.set(CFG_KEY, cfg);
  Log.info("game", "SeasonCal.setConfig rounds=" + cfg.trackIds.length);
  return cfg;
}
function resetConfig() { return setConfig(null); }

// setFlow() in js/game.js is the only writer, alongside its Career.engage() call.
let flow = "gp";
function engage(v) { flow = v || "gp"; resolved = null; lastScored = "race"; Log.info("game", "SeasonCal.engage " + flow); }
// See the header: two gates, deliberately different.
const calCustom = () => flow !== "career";
const fmtActive = () => flow === "season";

function list() {
  if (!calCustom()) return Tracks.SEASON;
  if (!resolved) {
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    resolved = config().trackIds.map((id) => byId.get(id)).filter(Boolean);
    if (!resolved.length) resolved = Tracks.SEASON.slice();
  }
  return resolved;
}
function rounds() { return list().length; }
function track(round) { return list()[round] || null; }
function trackIndex(round) {
  const t = track(round);
  return t ? Tracks.LIST.indexOf(t) : -1;
}

let lastScored = "race";
let sprintOrder = null;   // driverIds, for a no-qualifying sprint weekend's grid

function blank() { return { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; }
function resetWeekend() { lastScored = "race"; sprintOrder = null; }
function restart() { resetWeekend(); return blank(); }

function scoreMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, value]) => {
    const n = Number(value);
    if (id && isFinite(n)) out[id] = Math.max(0, n);
  });
  return out;
}
function codeMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([id, value]) => {
    if (id && typeof value === "string") out[id] = value.slice(0, 12);
  });
  return out;
}
// The standalone `apex26.season` save, made safe to race. A save from a LONGER
// calendar than the one now configured would sit past its own last round and
// never finish — only blank when round > rounds() (calendar shrink). round ===
// rounds() is a FINISHED championship and must stay readable for standings /
// champion UI; blanking it wiped the table the moment the player re-opened SEASON.
function resume(saved) {
  const s = saved && typeof saved === "object" ? saved : null;
  const n = rounds();
  if (!s || !Number.isInteger(s.round) || s.round < 0 || s.round > n) {
    return restart();
  }
  s.pts = scoreMap(s.pts);
  s.teamPts = scoreMap(s.teamPts);
  s.driverCodes = codeMap(s.driverCodes);
  if (s.stage === "race" && Array.isArray(s.sprintOrder) && s.sprintOrder.length) {
    sprintOrder = s.sprintOrder.slice();
  } else {
    sprintOrder = null;
    if (s.sprintOrder) delete s.sprintOrder;
  }
  return s;
}
function canRace(season) {
  return !!(season && Number.isInteger(season.round) && season.round >= 0 && season.round < rounds());
}
function hasProgress(season) {
  return !!(season && (season.round > 0 || season.stage === "race"));
}

function sprintOn() { return fmtActive() && config().sprint; }
function stage(season) {
  if (!sprintOn()) return "race";
  return season && season.stage === "race" ? "race" : "sprint";
}
function midWeekend(season) { return sprintOn() && !!season && season.stage === "race"; }

function quali() { return !fmtActive() || config().quali; }
function qualiNext(season) { return quali() && !midWeekend(season); }

// The distance THIS session runs. `fallback` is the player's #rs-laps choice and
// is returned untouched for every race the format does not own — the format's
// own `laps` is a PRESELECTION for those chips (see openRaceSettings), never an
// override of them, so there is exactly one source of truth for race distance.
// Only the sprint leg shortens it, and only ever by dividing.
function lapsFor(fallback, season) {
  if (stage(season) !== "sprint") return fallback;
  return Math.max(SPRINT_MIN, Math.round(fallback * SPRINT_FRAC));
}

function formatLaps(fallback) { return fmtActive() ? config().laps : fallback; }

function pointsTable() {
  return fmtActive() && config().points === "classic" ? CLASSIC_POINTS : Teams.POINTS;
}

function award(season, order) {
  if (!canRace(season)) return null;
  const scoring = stage(season);
  const table = scoring === "sprint" ? SPRINT_POINTS : pointsTable();
  order.forEach((c, i) => {
    const pts = c.retired ? 0 : (table[i] || 0);
    season.pts[c.driverId] = (season.pts[c.driverId] || 0) + pts;
    season.driverCodes[c.driverId] = c.code;
    season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
  });
  if (scoring === "sprint") {
    season.stage = "race";
    sprintOrder = order.map((c) => c.driverId);
    season.sprintOrder = sprintOrder.slice();
  } else {
    season.round++;
    delete season.stage;
    delete season.sprintOrder;
    delete season.qualiOrder;
    sprintOrder = null;
  }
  lastScored = scoring;
  Log.info("game", "SeasonCal.award " + scoring + " round=" + season.round);
  return scoring;
}
function scored() { return lastScored; }

function grid(cars, season) {
  // fmtActive() as well as the two obvious guards: sprintOrder is module state
  // that outlives the season it was set in, and a plain Grand Prix reaching this
  // line must never be gridded off a race it was not part of.
  if (!fmtActive() || !midWeekend(season) || !sprintOrder || quali()) return null;
  const byId = new Map(cars.map((c) => [c.driverId, c]));
  const out = [];
  for (const id of sprintOrder) { const c = byId.get(id); if (c) out.push(c); }
  return out.length === cars.length ? out : null;
}

const SPRINT_SEED_OFFSET = 1000;
function drawRound(season) {
  const r = season ? season.round : 0;
  return stage(season) === "sprint" ? r + SPRINT_SEED_OFFSET : r;
}

const PRESETS = [
  { id: "full", label: "FULL" },
  { id: "12", label: "12" },
  { id: "8", label: "8" },
  { id: "5", label: "5" },
  { id: "classics", label: "CLASSICS" },
];
function presetIds(id) {
  if (id === "classics") return Tracks.LIST.filter((t) => t.classic).map((t) => t.id);
  const all = Tracks.SEASON.map((t) => t.id);
  const n = parseInt(id, 10);
  return n > 0 ? all.slice(0, Math.min(n, all.length)) : all;
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
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

return {
  SPRINT_POINTS, CLASSIC_POINTS, LAP_OPTS, PRESETS, DEFAULT_LAPS,
  config, setConfig, resetConfig, fresh, normalize,
  engage, list, rounds, track, trackIndex,
  resume, blank, restart, resetWeekend, canRace, hasProgress,
  quali, qualiNext, stage, midWeekend, sprintOn, lapsFor, formatLaps, pointsTable,
  award, scored, grid, drawRound,
  presetIds, shuffled,
};
})();
