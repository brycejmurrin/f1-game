/* Apex 26 — persistence for js/game.js: the cached localStorage wrapper
   (`store`, all keys prefixed "apex26."), the per-track time-trial
   leaderboard, season-points identity/migration helpers, and hex<->rgb.
   Pure data + localStorage; the only other global consumed is Teams (season
   roster). Must load BEFORE js/game.js (see index.html). */
const GameStore = (function () {
  "use strict";

const store = {
  _cache: new Map(),   // full-key -> parsed value; kills per-frame getItem + JSON.parse in the render loop
  rev: 0,              // bumped on every set — memo caches key off this to self-invalidate
  get(k, d) {
    const key = "apex26." + k;
    let v = this._cache.get(key);
    if (v === undefined && !this._cache.has(key)) {
      try { const raw = localStorage.getItem(key); v = raw === null ? undefined : JSON.parse(raw); }
      catch (e) { return d; }
      this._cache.set(key, v);
    }
    // Callers treat hot-path results as read-only; menu callers that mutate a
    // returned object always saveTeamParts()/store.set() after, re-caching the ref.
    return v === undefined ? d : v;
  },
  set(k, v) {
    const key = "apex26." + k;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
    this._cache.set(key, v);
    this.rev++;
  },
};

// Per-track time-trial leaderboard: top 10 laps ever, each tagged with the
// team + driver that set it. Stored sorted ascending by lap time.
const TT_BOARD_MAX = 10;
function ttBoard(trackId) {
  const b = store.get("ttlb." + trackId, []);
  return Array.isArray(b) ? b : [];
}
function ttBoardAdd(trackId, entry) {
  if (!isFinite(entry.t) || entry.t <= 0) return ttBoard(trackId);
  const b = ttBoard(trackId);
  b.push(entry);
  b.sort((a, z) => a.t - z.t);
  if (b.length > TT_BOARD_MAX) b.length = TT_BOARD_MAX;
  store.set("ttlb." + trackId, b);
  return b;
}

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
function rgbToHex(c) {
  const cl = (v) => Math.max(0, Math.min(1, v));
  const f = (v) => ("0" + Math.round(cl(v) * 255).toString(16)).slice(-2);
  return "#" + f(c[0]) + f(c[1]) + f(c[2]);
}

// ---------- season points identity ----------
function seasonDriverId(teamId, driverIndex) { return teamId + ":" + driverIndex; }
function seasonRoster() {
  const roster = [];
  Teams.LIST.forEach((team) => team.drivers.forEach((driver, driverIndex) => {
    roster.push({
      id: seasonDriverId(team.id, driverIndex),
      code: driver.code,
    });
  }));
  return roster;
}
// Remap a championship's points onto stable driver ids. PURE: mutates the passed
// object and returns it, but never touches localStorage — career owns a championship
// of the same shape nested inside its OWN save, and running the persisting variant
// over it would overwrite the standalone `apex26.season` with career's standings.
function remapPoints(season) {
  if (!season) return season;
  const oldPts = season.pts && typeof season.pts === "object" ? season.pts : {};
  const roster = seasonRoster();
  const nextPts = {};
  const codes = Object.assign({}, season.driverCodes || {});
  // Legacy display-code keys cannot be disambiguated after historical code collisions, so migration is best-effort.
  Object.entries(oldPts).forEach(([key, value]) => {
    const driver = roster.find((candidate) => candidate.id === key || candidate.code === key);
    const id = driver ? driver.id : key;
    nextPts[id] = (nextPts[id] || 0) + (Number(value) || 0);
    if (driver) codes[id] = driver.code;
    else if (!codes[id]) codes[id] = key;
  });
  roster.forEach((driver) => {
    if (Object.prototype.hasOwnProperty.call(nextPts, driver.id)) codes[driver.id] = driver.code;
  });
  season.pts = nextPts;
  season.driverCodes = codes;
  season.teamPts = season.teamPts && typeof season.teamPts === "object" ? season.teamPts : {};
  return season;
}

// Mutates + PERSISTS the standalone season save (no-op on null); returns it so
// game.js can do `season = GameStore.migrateSeasonPoints(season)`.
function migrateSeasonPoints(season) {
  if (!season) return season;
  remapPoints(season);
  store.set("season", season);
  return season;
}

// ---------- career save ----------
// THREE careers, under `apex26.career.0..2` (js/game/career.js owns the slots and
// which one is live; the single-save `apex26.career` of the first build migrates
// into slot 0). Versioned from the start: the shape will grow, and a stored save
// has to survive that. Migrations are a ladder — one function per version step,
// each taking the save from v(i) to v(i+1) — so a save written by any past build
// climbs to the current shape one rung at a time.
const CAREER_V = 1;
const CAREER_MIGRATIONS = [
  // v0 -> v1: the first shipped shape. A v0 save predates `v` entirely.
  (c) => { c.season = c.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; },
];

// Fill in every optional key so the rest of the code never guards for undefined,
// and climb the migration ladder.
//
// PURE — it mutates the save it is handed and returns it, but it does NOT write.
// It used to end in `store.set("career", career)`, which was correct when there
// was one save under one key and wrong the moment there were three: reading slot
// 0 wrote it back to the LEGACY key, so the key slot migration had just cleared
// came straight back on the same boot, and every later boot resurrected it again.
// A stale duplicate under the old name is exactly what an older build would find
// and load. Career.save() is the one thing that persists, and it knows the slot.
function migrateCareer(career) {
  if (!career || typeof career !== "object") return null;
  let v = career.v | 0;
  while (v < CAREER_V && CAREER_MIGRATIONS[v]) { CAREER_MIGRATIONS[v](career); v++; }
  career.v = CAREER_V;
  career.flavour = career.flavour === "myteam" ? "myteam" : "driver";
  career.year = career.year | 0 || 2026;
  career.money = Number(career.money) || 0;
  career.rep = Math.max(0, Math.min(100, Number(career.rep) || 0));
  career.seat = career.seat | 0;
  career.driver = career.driver && typeof career.driver === "object"
    ? career.driver : { name: "Your Name", code: "YOU", num: 99 };
  career.seed = career.seed | 0;
  career.season = remapPoints(career.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} });
  career.owned = Array.isArray(career.owned) ? career.owned : [];
  career.fitted = career.fitted && typeof career.fitted === "object" ? career.fitted : {};
  career.results = Array.isArray(career.results) ? career.results : [];
  career.history = Array.isArray(career.history) ? career.history : [];
  career.dev = career.dev && typeof career.dev === "object" ? career.dev : {};
  career.tdev = career.tdev && typeof career.tdev === "object" ? career.tdev : {};
  // The rollover's three: grid overrides the driver market writes, the contract
  // offers waiting to be signed, and the current round's objective. Fills, not a
  // migration step — a save from before any of them existed is still a valid v1
  // save, it just has nothing in them yet.
  career.seats = career.seats && typeof career.seats === "object" ? career.seats : {};
  career.offers = Array.isArray(career.offers) ? career.offers : [];
  career.obj = career.obj && typeof career.obj === "object" ? career.obj : null;
  career.budgetLvl = career.budgetLvl | 0;
  // The open-ended research facility (js/game/career.js). A fill, not a
  // migration step: a save from before it existed is a valid v1 save at level 0.
  career.facility = career.facility | 0;
  career.moves = Array.isArray(career.moves) ? career.moves : [];
  return career;
}

return { store, ttBoard, ttBoardAdd, TT_BOARD_MAX,
         hexToRgb, rgbToHex, seasonDriverId, seasonRoster,
         remapPoints, migrateSeasonPoints, migrateCareer, CAREER_V };
})();
