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
// Mutates + persists the passed season object (no-op on null); returns it so
// game.js can do `season = GameStore.migrateSeasonPoints(season)`.
function migrateSeasonPoints(season) {
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
  store.set("season", season);
  return season;
}

return { store, ttBoard, ttBoardAdd, TT_BOARD_MAX,
         hexToRgb, rgbToHex, seasonDriverId, seasonRoster, migrateSeasonPoints };
})();
