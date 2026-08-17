/* Apex 26 — the SEASON CALENDAR and the WEEKEND FORMAT: which circuits a
   standalone championship visits and in what order, whether the weekend
   qualifies, whether it runs a sprint, how long the race is, and which points
   table pays it out. Persisted at `apex26.seasonCfg`.

   Pure data and rules — no DOM. The SEASON SETUP screen lives in
   js/game/season-ui.js; game.js calls into this from setFlow()/startRace()/
   endRace(). Same split, and the same reason, as js/game/career.js and
   js/game/career-ui.js.

   TWO KINDS OF ACCESSOR, GATED ON DIFFERENT FLOWS. This is the whole design and
   getting it wrong is a real bug, so it is stated once here rather than repeated
   at every call site:

     CALENDAR reads (rounds/track/trackIndex) are the player's whenever the flow
     is NOT "career". They have to be: js/game.js reads them at boot and on the
     title screen, where `flow` is still "gp", and what they mean there is the
     standalone season save. A career always races the built-in Tracks.SEASON.

     FORMAT reads (quali/laps/stage/pointsTable/grid) are the player's ONLY when
     the flow is "season", and return their NEUTRAL fallback otherwise. `flow`
     is "gp" for a plain Grand Prix, a time trial and a VS FRIEND race, all of
     which run through the same startRace()/endRace() lines — so a "not career"
     gate here would give a one-off Grand Prix the season's sprint distance and
     print its results sheet under the season's points table.

   Destructures GameStore at eval time, so it must load AFTER js/game/store.js
   (see tools/manifest.cjs HARD_EDGES). Consumes globals Tracks and Teams at CALL
   time only — the calendar cannot be resolved at eval time anyway, because it
   names circuits that js/circuits/ has only just finished registering. */
const SeasonCal = (function () {
  "use strict";

const { store } = GameStore;

const CFG_KEY = "seasonCfg";           // store.get/set add the `apex26.` prefix

// ---------- the points tables ----------
// Teams.POINTS is the modern table and stays the default. These two are the
// alternatives the format offers, and they live here so the setup screen can
// QUOTE them rather than retype them — the rule js/game/career-ui.js already
// follows for the career guide's economy numbers.
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const CLASSIC_POINTS = [10, 6, 4, 3, 2, 1];

// A sprint is a third of the race distance, floored at two laps: one to settle
// the pack off the grid and one to race. Fractional rather than a flat literal
// so it tracks whatever distance the player chose — a 3-lap season would
// otherwise have a sprint longer than its Grand Prix.
const SPRINT_FRAC = 1 / 3;
const SPRINT_MIN = 2;

// The distance a fresh config asks for. Matches GAME_LAPS in js/game.js; it is
// duplicated rather than imported because that value is a game-loop constant in
// a file this one must not depend on, and a mismatch is harmless (it is a
// PRESELECTION for the #rs-laps chips, never an override of them).
const DEFAULT_LAPS = 3;
const LAP_OPTS = [3, 5, 10, 25, 57];

// ---------- the config ----------
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

function config() {
  if (!cfg) cfg = normalize(store.get(CFG_KEY, null));
  return cfg;
}
function setConfig(next) {
  cfg = normalize(next);
  resolved = null;
  store.set(CFG_KEY, cfg);
  return cfg;
}
function resetConfig() { return setConfig(null); }

// ---------- which flow is running ----------
// setFlow() in js/game.js is the only writer, alongside its Career.engage() call.
let flow = "gp";
function engage(v) { flow = v || "gp"; resolved = null; }
// See the header: two gates, deliberately different.
const calCustom = () => flow !== "career";
const fmtActive = () => flow === "season";

// ---------- the calendar ----------
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
// Tracks.LIST index of a round, 0-based; -1 once the calendar is exhausted.
// Same contract as Tracks.seasonIndex(), which this replaces at every shared
// call site — but over the player's calendar, which may include classics.
function trackIndex(round) {
  const t = track(round);
  return t ? Tracks.LIST.indexOf(t) : -1;
}

// ---------- the season save ----------
// Module weekend state lives here (above resume) so a reload can restore the
// sprint grid from the persisted save without racing a TDZ on first call.
let lastScored = "race";
let sprintOrder = null;   // driverIds, for a no-qualifying sprint weekend's grid

function blank() { return { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; }
// The standalone `apex26.season` save, made safe to race. A save from a LONGER
// calendar than the one now configured would sit past its own last round and
// never finish — only blank when round > rounds() (calendar shrink). round ===
// rounds() is a FINISHED championship and must stay readable for standings /
// champion UI; blanking it wiped the table the moment the player re-opened SEASON.
function resume(saved) {
  const s = saved && typeof saved === "object" ? saved : null;
  const n = rounds();
  if (!s || !(s.round >= 0) || s.round > n) {
    sprintOrder = null;
    return blank();
  }
  if (!s.pts) s.pts = {};
  if (!s.teamPts) s.teamPts = {};
  if (!s.driverCodes) s.driverCodes = {};
  // Restore the sprint grid for a mid-weekend reload (stage === "race"). Cleared
  // when the GP has scored or the save is not mid-weekend — module state alone
  // used to lose the order across a quit/reload.
  if (s.stage === "race" && Array.isArray(s.sprintOrder) && s.sprintOrder.length) {
    sprintOrder = s.sprintOrder.slice();
  } else {
    sprintOrder = null;
    if (s.sprintOrder) delete s.sprintOrder;
  }
  return s;
}
// Is there a championship worth showing STANDINGS for? Not `round > 0` alone:
// on a sprint weekend the first sprint banks real points while the round is
// still 0, and a player who has scored should be able to see the table.
function hasProgress(season) {
  return !!(season && (season.round > 0 || season.stage === "race"));
}

// ---------- the weekend ----------
// A sprint weekend is TWO scoring sessions on one round: the sprint, then the
// Grand Prix. `season.stage` is what says which one is next, and it lives on the
// SEASON SAVE rather than in a module `let` on purpose — endRace() persists the
// save in the same write that banks the points, so a quit or a reload between
// the two legs cannot come back to a weekend that has already paid its sprint
// points and is about to pay them again.
//
// Absent means "the sprint has not run", which is what a fresh weekend wants.
function sprintOn() { return fmtActive() && config().sprint; }
function stage(season) {
  if (!sprintOn()) return "race";
  return season && season.stage === "race" ? "race" : "sprint";
}
// True between the two legs — the GP is next and the weekend has already
// qualified and already sprinted.
function midWeekend(season) { return sprintOn() && !!season && season.stage === "race"; }

// Does a championship weekend qualify at all? Neutral (true) outside a season,
// so a career and a friend race are unaffected.
function quali() { return !fmtActive() || config().quali; }
// …and is qualifying what comes NEXT? One qualifying session per weekend: the
// Grand Prix of a sprint weekend grids off the same classification the sprint
// did, exactly as it does in the real thing.
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

// The distance the #rs-laps chips should OPEN on. Gated like every other format
// read: `isChampionship()` at the call site is true for a career too, and a
// career's race distance is not the season config's to set.
function formatLaps(fallback) { return fmtActive() ? config().laps : fallback; }

function pointsTable() {
  return fmtActive() && config().points === "classic" ? CLASSIC_POINTS : Teams.POINTS;
}

// ---------- the award ----------
// What endRace() used to do inline. A retirement scores nothing — explicit
// rather than relying on it landing outside the table's ten slots, because `i`
// still advances and every classified car above keeps the points its position
// earns.
//
// Returns the stage it SCORED, not the one coming next: buildResults() runs
// after this and has to title the sheet with the session that just finished.
function award(season, order) {
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
    // Persist with the season save so a quit/reload mid-weekend can rebuild the
    // no-quali GP grid. Cleared when the Grand Prix scores below.
    season.sprintOrder = sprintOrder.slice();
  } else {
    season.round++;
    delete season.stage;
    delete season.sprintOrder;
    sprintOrder = null;
  }
  lastScored = scoring;
  return scoring;
}
function scored() { return lastScored; }

// The grid for a race that is NOT coming out of qualifying. Null everywhere
// except the Grand Prix of a sprint weekend with qualifying switched off, where
// the sprint result is the only running order the weekend has produced —
// gridUp() takes null as "sort by team tier" and would otherwise throw away the
// one race that had just been run to decide it.
function grid(cars) {
  // fmtActive() as well as the two obvious guards: sprintOrder is module state
  // that outlives the season it was set in, and a plain Grand Prix reaching this
  // line must never be gridded off a race it was not part of.
  if (!fmtActive() || !sprintOrder || quali()) return null;
  const byId = new Map(cars.map((c) => [c.driverId, c]));
  const out = [];
  for (const id of sprintOrder) { const c = byId.get(id); if (c) out.push(c); }
  return out.length === cars.length ? out : null;
}

// The retirement draw's round key. Reliability.arm() hashes (seed, round,
// driver) and nothing else, and simSeed() is constant across a standalone
// season — so the sprint and the Grand Prix of one weekend, sharing
// season.round, would retire the SAME cars at the same distance for the same
// reason. Offsetting the sprint leg is the whole fix. Career and every
// no-sprint season are always stage "race" and their draws are untouched.
const SPRINT_SEED_OFFSET = 1000;
function drawRound(season) {
  const r = season ? season.round : 0;
  return stage(season) === "sprint" ? r + SPRINT_SEED_OFFSET : r;
}

// ---------- calendar presets, for the setup screen ----------
// The screen offers these rather than making the player tap 24 circuits off a
// list to get to an 8-round year. `n` slices the championship calendar; the
// player can still reorder and swap afterwards.
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
// Fisher-Yates on a COPY. The caller owns the result; nothing here mutates the
// live config until setConfig() is called with it. Supports an optional seed for
// deterministic shuffling.
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
  resume, blank, hasProgress,
  quali, qualiNext, stage, midWeekend, sprintOn, lapsFor, formatLaps, pointsTable,
  award, scored, grid, drawRound,
  presetIds, shuffled,
};
})();
