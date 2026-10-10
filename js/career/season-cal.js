/* Apex 26 — the SEASON CALENDAR and the WEEKEND FORMAT: which circuits a standalone championship visits and in what order, whether the weekend qualifies, whether … */
const SeasonCal = (function () {
  "use strict";

const { store } = GameStore;

const CFG_KEY = "seasonCfg";           // store.get/set add the `apex26.` prefix
const SAVE_KEY = "season";

const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const CLASSIC_POINTS = [10, 6, 4, 3, 2, 1];   // 1991–2002 table
// Dropped scores: until 1990 only a driver's best N results counted (best 11
// of 16 in 1990). `drop` is how many of the season's rounds do NOT count.
const DROP_OPTS = [0, 2, 3];

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
    sprint: false,    // false | true (every round) | "rounds" (only the rounds in sprintIds)
    sprintIds: [],    // circuit ids that hold a sprint when sprint === "rounds"
    laps: DEFAULT_LAPS,
    points: "modern",
    flPoint: false,   // the 2019–2024 fastest-lap point (top-ten finisher, Grand Prix only)
    drop: 0,
  };
}

// NORMALISE ON READ. There is no generic migration registry for store keys, and
// GameStore.migrateCareer's "fill every optional field" tail is the house answer
// for a save whose shape may predate the build reading it. An id that no longer
// exists is dropped rather than failing the whole config, because losing one
// retired circuit should not cost the player their calendar.
// Each stored index's place in the calendar this build can race (-1: dropped —
// an id it does not know, or a repeat). knownIds is the ids that keep a place.
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
// PER-ROUND SPRINTS are additive: a config written before them has no
// `sprintIds` and a boolean `sprint`, and normalises to exactly what it meant.
// An older build reading "rounds" sees a non-true sprint and races no sprints.
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

let cfg = null;          // resolved lazily: Tracks.LIST is not ready at eval time
let resolved = null;     // trackIds -> circuit defs, invalidated with cfg
let activeCfg = null;    // frozen into the standalone save; setup edits cannot rewrite a season in progress
let activeSeason = null;
let seasonRevision = null;
let seasonConflict = false;
let lastSave = { ok: true, durable: true, reason: null };

if (store.subscribe) store.subscribe((change) => {
  // FOREIGN WRITES ONLY — the guard career.js's store subscriber already
  // carries. Without it this also fired on our OWN store.set: setConfig()
  // builds `cfg = normalize(next)`, then `store.set(CFG_KEY, cfg)` re-entered
  // here synchronously and nulled the cfg it had just built, so the very next
  // statement threw on `cfg.trackIds` — SEASON SETUP ▸ APPLY died before
  // restart(), before the save, and before the sheet could close.
  if (!change.foreign) return;
  if (change.clear || change.key === CFG_KEY) { cfg = null; resolved = null; }
  if (change.clear || change.key === SAVE_KEY) {
    if (flow === "season" && activeSeason) seasonConflict = true;
    else {
      activeSeason = null;
      activeCfg = null;
      // seasonRevision is KEPT: nulling it switched off save()'s guard, so a
      // stale season object this tab still held (persistSeason from a GP's
      // qualifying, retrySave) overwrote the other tab's newer rounds.
      // load() re-arms it whenever this tab re-enters the championship.
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

// setFlow() in js/game.js is the only writer, alongside its Career.engage() call.
let flow = "gp";
function engage(v) {
  flow = v || "gp";
  resolved = null;
  lastScored = "race";
  Log.info("game", `SeasonCal.engage ${flow}`);
}
// See the header: two gates, deliberately different.
const calCustom = () => flow !== "career";
const fmtActive = () => flow === "season";

function list() {
  if (!calCustom()) return Tracks.SEASON;
  if (!resolved) {
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    resolved = rulesConfig().trackIds.map((id) => byId.get(id)).filter(Boolean);
    if (!resolved.length) resolved = Tracks.SEASON.slice();
  }
  return resolved;
}
function rounds() { return list().length; }
function track(round) { return list()[round] || null; }
/** The round's Grand Prix name. A circuit carries its classic name (Sepang is
 *  the "Malaysian GP"); the 2026 REAL calendar, raced as published, renames two
 *  rounds — the Bahrain GP runs at Sepang, and Barcelona's round is the
 *  Barcelona-Catalunya GP now that the Spanish GP is Madrid's. Only an unedited
 *  2026 calendar (the preset's ids, in order) takes those names. */
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
// Applying a new setup replaces a saved championship. Resolve the revision
// before changing either the active rules or the new season's in-memory state.
function applyConfig(next) {
  const now = currentRevision();
  if (seasonConflict || (seasonRevision != null && now !== seasonRevision)) {
    seasonConflict = true;
    lastSave = { ok: false, durable: false, reason: "conflict" };
    return Object.assign({ season: null }, lastSave);
  }
  const snap = frozenConfig(next);
  const season = { round: 0, pts: {}, teamPts: {}, driverCodes: {}, finishes: {}, roundPts: {}, config: snap };
  if (typeof store.write === "function") lastSave = store.write(SAVE_KEY, season);
  else {
    const durable = store.set(SAVE_KEY, season) !== false;
    lastSave = { ok: true, durable, reason: durable ? null : (store.broken || "Error") };
  }
  // A quota failure still leaves the requested season in GameStore's session
  // cache, so adopt it and let the caller show the non-durable result.
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
    const n = Number(value);
    if (id && isFinite(n)) out[id] = Math.max(0, n);
  });
  return out;
}
// finishes: driverId -> sparse array of per-position counts (see award()).
// roundPts: driverId -> sparse array of points per ROUND (both legs of a sprint
// weekend land in the same index). netPts() reads it when scores are dropped.
// Both sanitisers live in SaveMigrate so a career's nested championship
// (migrateCareer -> remapPoints) and the standalone save (resume) agree.
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
// The standalone `apex26.season` save, made safe to race. A save from a LONGER
// calendar than the one now configured would sit past its own last round and
// never finish — only blank when round > rounds() (calendar shrink). round ===
// rounds() is a FINISHED championship and must stay readable for standings /
// champion UI; blanking it wiped the table the moment the player re-opened SEASON.
function resume(saved) {
  const s = saved && typeof saved === "object" ? saved : null;
  activeCfg = frozenConfig(s && s.config ? s.config : config());
  resolved = null;
  const n = activeCfg.trackIds.length;
  // MAP THE ROUND BY CIRCUIT ID. A stored calendar holding an id this build
  // does not know shrinks in normalize(); the stored `round` indexes the FULL
  // list, so read it as "the circuits already raced that this build knows" —
  // the next round is the same circuit, and a finished season stays finished.
  // Identity for a calendar read whole (every id known and unique).
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
  // …and the per-round points with it: roundPts is indexed by the STORED round,
  // so with dropped scores netPts read the wrong rounds and award() added this
  // round into a slot already used. A dropped circuit's round leaves the
  // counting set (its points stay in the gross total; the save is refused).
  if (remap && remap.some((v, i) => v !== i)) {
    for (const id of Object.keys(s.roundPts)) {
      const row = [];
      s.roundPts[id].forEach((v, r) => { if (remap[r] >= 0) row[remap[r]] = v; });
      s.roundPts[id] = row;
    }
  }
  if (typeof s.lastFl !== "string") delete s.lastFl;
  if (!(Number.isInteger(s.seed) && s.seed > 0 && s.seed <= 0xFFFFFFFF)) delete s.seed;
  // A save from before separate sprint qualifying carries the sprint RESULT as
  // the GP grid. The GP no longer copies it (qualifying, or the championship
  // order: B2.5.4(a)), so the field is dropped; its stage and points stand.
  if (s.sprintOrder) delete s.sprintOrder;
  return s;
}
let lastLossy = false;
const lossySeasons = new WeakSet();   // every lossy read stays unsavable, even after another load
function lastLoadLossy() { return lastLossy; }
function load() {
  const raw = store.get(SAVE_KEY, null);
  const rawIds = raw && raw.config && Array.isArray(raw.config.trackIds) ? raw.config.trackIds : null;
  // resume repairs in place. Never repair the store cache: a second menu load
  // must still see the original calendar, including this build's unknown ids.
  const copy = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : raw;
  const season = resume(copy);
  armRevision(season);
  // Existing saves were rewritten at boot by migrateSeasonPoints(). Keep that
  // migration contract while adding the config snapshot and the stricter maps —
  // but NOT for a season this build could not read whole: a circuit id it does
  // not know (a stale cached shell, a renamed circuit) shrank the calendar, and
  // writing that back erased the circuit for good, or blanked a finished season.
  // LOSSY MEANS AN UNKNOWN CIRCUIT ID, nothing else. `season !== copy` is also
  // true when resume() fell back to restart() for a round out of range, and that
  // clean rebuilt season was then refused by every later save ("unknown circuit")
  // although this build knew every id. A collapsed duplicate only counts when the
  // save was repaired in place (the restart() config is not the stored one).
  const lossy = !!raw && rawIds != null && (knownIds(rawIds).length !== rawIds.length
    || (season === copy && season.config.trackIds.length !== rawIds.length));
  lastLossy = lossy;   // boot's migrate-and-save reads it: never write a lossy read back
  // Nor the race that follows: endRace's SeasonCal.save would persist the shrunk
  // calendar and erase the unknown circuit for good. A build that knows every id
  // reads the save whole again; restart()/applyConfig() hand out a new object.
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

// Whether THIS round is a sprint weekend. `season` names the round; without
// one (a label asking in general) the live standalone season stands in.
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
// From the saved season's OWN frozen config: the title menu's STANDINGS reads
// it in flow "gp", where sprintOn() (fmtActive) is always false and a sprint
// weekend read "AFTER ROUND 0" over a table holding the sprint's points.
function midWeekend(season) { return sprintMid(season && season.config ? season.config : (fmtActive() ? rulesConfig() : null), season); }

function quali() { return !fmtActive() || rulesConfig().quali; }
// SEPARATE SPRINT QUALIFYING (FIA 2026 SR B2.2.1, B2.4.1(b)): a sprint weekend
// qualifies for the sprint, then again for the Grand Prix, so every racing
// session qualifies (callers still pass `season`).
function qualiNext() { return quali(); }
/** The session's name on the sheet and the GO button. */
function qualiLabel(season) { return stage(season) === "sprint" ? "SPRINT QUALIFYING" : "QUALIFYING"; }

// The distance THIS session runs. `fallback` is the player's #rs-laps choice and
// is returned untouched for every race the format does not own — the format's
// own `laps` is a PRESELECTION for those chips (see openRaceSettings), never an
// override of them, so there is exactly one source of truth for race distance.
// Only the sprint leg shortens it, and only ever by dividing.
function lapsFor(fallback, season) {
  if (stage(season) !== "sprint") return fallback;
  return Math.max(SPRINT_MIN, Math.round(fallback * SPRINT_FRAC));
}

function formatLaps(fallback) { return fmtActive() ? rulesConfig().laps : fallback; }
// NEXT ROUND's distance: what RACE SETTINGS would preselect for the new round
// (the format's laps, clamped to the circuit's FULL, never raised) — NEXT ROUND
// skips that screen, so a 57-lap format ran 57 at Silverstone (full 52) and a
// value clamped at a short circuit stuck to every longer round after it. The
// Grand Prix after a sprint keeps the weekend's distance (lapsFor divides it).
function roundLaps(prev, season, full) {
  const laps = midWeekend(season) ? prev : formatLaps(prev);
  return full > 0 ? Math.min(laps, full) : laps;
}

function pointsTable() {
  return fmtActive() && rulesConfig().points === "classic" ? CLASSIC_POINTS : Teams.POINTS;
}

// A SHORTENED RACE (FIA F1 SR 2024 Art. 6.5 / 6.6; the 2019–2024 point, 6.4).
// `run` = RaceControl.shortRun: { laps the leader completed, of the scheduled
// laps }, null for a race that saw the flag. The game ends a session when its
// only human retires, so without this a lap-1 snapshot paid a full Grand Prix.
// Under 2 laps nothing; a Grand Prix pays column 1/2/3 below 25/50/75 %, a
// sprint nothing below 50 %; the CLASSIC (1991–2002) table pays half below 75 %,
// the rule of its era. The fastest-lap point needs 50 % (Art. 6.4).
const SHORT_POINTS = [[6, 4, 3, 2, 1], [13, 10, 8, 6, 5, 4, 3, 2, 1], [19, 14, 12, 10, 8, 6, 4, 3, 2, 1]];
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
  // `lastFl` names THIS round's fastest-lap recipient for the results sheet:
  // cleared before either refusal, or a save conflict left last round's +FL
  // (and its +1 pt) painted beside whoever held it.
  if (season) delete season.lastFl;
  if (fmtActive() && seasonConflict) return null;
  if (!canRace(season)) return null;
  const scoring = stage(season);
  const table = payTable(scoring === "sprint" ? SPRINT_POINTS : pointsTable(), scoring, run);
  // The 2019–2024 fastest-lap point: one point, Grand Prix leg only, and only
  // to a driver classified inside the top ten — inside the PAYING places when
  // the table is shorter (CLASSIC pays six). Season format only (fmtActive):
  // a career keeps the table it always paid. `lastFl` (cleared above) names
  // this round's recipient for the results sheet.
  const fl = scoring !== "sprint" && fmtActive() && rulesConfig().flPoint && fastestId != null && shortFrac(run) >= 0.5;
  const rp = season.roundPts || (season.roundPts = {});
  order.forEach((c, i) => {
    // CLASSIFIED = STILL IN THE RACE. endRace ends the session 2.2 s after the
    // last human crosses the line and classifies every running car by track
    // position (fin, then run, then out) — a car 3 s behind at the flag is the
    // NORMAL case here, not a time-cap corner. B4 (BUGS.md) required
    // `c.finished` as well, and from then on most of the field scored 0 while
    // the results sheet still showed their points. Only retirements score
    // nothing. The fastest-lap bonus follows the same rule (a runner at the
    // flag earns it) but skips a classified retirement.
    const classified = c.classified != null ? !!c.classified : !c.retired;   // endRace sets it: a DNF past 90 % of the winner's laps is classified (FIA 2026 SR B2.5.5(b))
    let pts = classified ? (table[i] || 0) : 0;
    if (fl && classified && !c.retired && c.driverId === fastestId && i < Math.min(10, table.length)) { pts += 1; season.lastFl = fastestId; }
    const row = rp[c.driverId] || (rp[c.driverId] = []);
    row[season.round] = (row[season.round] || 0) + pts;
    season.pts[c.driverId] = (season.pts[c.driverId] || 0) + pts;
    season.driverCodes[c.driverId] = c.code;
    season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
    // Countback material: a histogram of Grand Prix finishing positions per
    // driver (sprints do not count, as in the real tie-break). rank() reads it.
    if (scoring !== "sprint" && classified) {
      const f = season.finishes || (season.finishes = {});
      const row = f[c.driverId] || (f[c.driverId] = []);
      row[i] = (row[i] || 0) + 1;
    }
  });
  // Either leg spends its qualifying: the Grand Prix runs its own session.
  delete season.qualiOrder;
  delete season.qualiTrack;
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

// Standings order for two driver ids: points, then countback (more wins, then
// more seconds, …), then the id so the order is total and stable (not
// Object.entries insertion order — whoever scored first).
// A driver's COUNTING points. With dropped scores only the best
// (rounds − drop) results count, and only once a driver has more scoring
// rounds than that — early in the season the gross total stands, as it did
// in the dropped-score years. Gross for a save with no per-round record.
// The season's OWN frozen rules when it carries them: the title-menu STANDINGS
// reads a saved championship in flow "gp", where fmtActive() is false, and so
// would rank by GROSS points — a driver ahead on counting points shown behind.
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
  if (!drop || !season) return gross;   // rank() has always tolerated a null season; so must this
  const row = (season.roundPts && season.roundPts[id]) || [];
  const played = (season.round || 0) + (sprintMid(c, season) ? 1 : 0);
  const keep = Math.max(1, (c.trackIds ? c.trackIds.length : rounds()) - drop);
  if (played <= keep || !row.length) return gross;
  // Bounded by the stored row, not by `played`: an imported season.round of 1e9
  // made this push a billion entries. Rounds past the row scored nothing (0), so
  // they only matter when fewer than `keep` real results exist: `|| 0` covers it.
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

// A STANDALONE SEASON'S OWN LUCK SEED — Career.seasonSeed()'s counterpart.
// Reliability, qualifying execution, launches and AI mistakes hash (seed,
// round, driver); outside a career the seed was the SESSION's, drawn fresh per
// page load, so quitting and reloading re-rolled a planned retirement. The
// season stamps one at its first draw and saves it, so a reload replays the
// same luck. The first stamp of a page load IS the session seed (a seeded or
// automated session draws exactly what it always did); a later season in the
// same load mixes a counter in, as seasonSeed() mixes the year, so a restarted
// championship is not the last one's luck again.
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

// THE CONSTRUCTORS' ORDER, one comparator for every table that prints it (the
// results sheet, the season sheet, Career.teamStandings → goals, history and
// the winter shove): points, then the team's countback (both cars' Grand Prix
// finishes summed off `finishes`, whose ids are "team:seat" — more wins, then
// more seconds, …), then the lower (stronger) tier, then a stable id. A
// points-only sort left ties in teamPts insertion order, so two screens could
// disagree on who was P5; tier alone ignored who actually finished ahead.
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

// THE 2026 CALENDAR AS RACED — verified 2026-09-25, in calendar order, mapped
// to the circuits this game has (all 23 do). Weekend dates are Fri–Sun (Baku
// races on Saturday 26 Sep; Las Vegas on Saturday 21 Nov). Bahrain and Saudi
// Arabia were cancelled in April over the Middle East conflict; the Bahrain GP
// runs at SEPANG on 2–4 Oct. Qatar and Abu Dhabi are still scheduled (plan A;
// Imola is the stated plan B, decision expected mid-October). Barcelona hosts
// the "Barcelona-Catalunya GP"; the Spanish GP moved to Madrid (Madring).
// Sprints: China, Miami, Canada, Britain, Netherlands, Singapore.
//   https://www.formula1.com/en/racing/2026
//   https://www.formula1.com/en/latest/article/formula-1-and-fia-announce-2026-sprint-calendar.3PyLPAazrBNe8kQIS3wOfY
//   https://www.gpfans.com/en/f1-news/1090484/f1-schedule-2026-september-azerbaijan-middle-east-conflict/
//   https://www.skysports.com/f1/news/13591254/formula-1-teams-expect-final-call-on-qatar-abu-dhabi-grands-prix-by-middle-of-october-on-closing-2026-season-races
//   https://en.wikipedia.org/wiki/2026_Barcelona-Catalunya_Grand_Prix
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
  { id: "full", label: "FULL" },
  { id: "real2026", label: "2026 REAL" },
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
// What a preset changes in a setup draft. Only 2026 REAL sets the format too
// (its own sprint rounds); every other preset is a calendar and nothing else.
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
  SPRINT_POINTS, CLASSIC_POINTS, SHORT_POINTS, payTable, DROP_OPTS, LAP_OPTS, PRESETS, DEFAULT_LAPS, REAL_2026,
  config, setConfig, resetConfig, applyConfig, fresh, normalize,
  engage, list, rounds, track, trackIndex,
  load, lastLoadLossy, save, clear, conflicted, saveStatus,
  resume, blank, restart, resetWeekend, canRace, hasProgress,
  quali, qualiNext, qualiLabel, stage, midWeekend, sprintOn, lapsFor, formatLaps, roundLaps, pointsTable,
  award, scored, rank, rankTeams, netPts, drawRound, luckSeed,
  presetIds, preset, shuffled, gpName,
};
})();
