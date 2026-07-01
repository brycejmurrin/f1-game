/* Apex 26 — shared game state (AX): the mutable state bag every game-*
 * module reads/writes (state machine, track, cars, race/sector timing,
 * camera, modes, flags), plus the localStorage `store` helper and the
 * per-track time-trial leaderboard. Needs AXC (game-config.js) loaded first;
 * everything else in this file is self-contained. */
"use strict";

const AX = {};
window.AX = AX;   // reachable for tools & the game-* module split

(function () {
"use strict";

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("apex26." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("apex26." + k, JSON.stringify(v)); } catch (e) {} },
};

/// Per-track time-trial leaderboard: top 10 laps ever, each tagged with the
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

AX.teamIdx = store.get("team", 2);          // default McLaren
AX.driverIdx = store.get("driver", 0);
AX.trackIdx = store.get("track", 0);
AX.difficulty = store.get("difficulty", "normal");
AX.soundOn = store.get("sound", true);
AX.musicEnabled = store.get("music", true);    // music on/off, independent of sound
AX.manualMode = store.get("manual", false);   // manual gearbox preference (player shifts)
AX.unlimitedBudget = store.get("unlimitedBudget", false); // removes credit cap in car setup
// how the player steers: "tilt" | "buttons" | "touch" (migrates the old buttonSteer flag)
AX.steerMode = store.get("steerMode", store.get("buttonSteer", false) ? "buttons" : "tilt");
AX.season = store.get("season", null);      // {round, pts:{code:n}, teamPts:{id:n}}

// ---------- state ----------
AX.state = "menu";
AX.track = null; AX.builtTrackId = null; AX.builtTrackNight = null;
AX.cars = []; AX.player = null;
AX.raceT = 0; AX.countT = 0; AX.lightsLit = 0; AX.resultT = 0;
AX.camEye = [0, 6, -10]; AX.camTgt = [0, 0, 0]; AX.camFov = 62;
AX.hideMeshes = {};   // debug: per-mesh visibility toggle (set via __apex.meshToggle)
AX.dbgCam = null;   // debug free camera override (set via __apex.view); null = chase
AX.headlessMode = false;  // skip render() when true (headless control loop)
AX.camMode = Math.min(Math.max(store.get("camMode", 0) | 0, 0), AXC.CAM_MODES.length - 1);
AX.seasonMode = false;
AX.timeTrial = false;      // solo run against the clock, no AI
AX.lapsTarget = GAME_LAPS; // laps before the session ends (GAME_LAPS or TT_LAPS)
AX.raceLaps = GAME_LAPS;      // user-selected lap count
AX.raceWeather = "dry";       // "dry" | "wet" | "rain" | "overcast" | "fog"
AX.raceTimeOfDay = "default"; // "default" | "dawn" | "day" | "dusk" | "night"
AX.ttRecord = Infinity;    // best lap on the current TT track's leaderboard (seconds)
AX.ttNewRecord = false;    // set when the player takes provisional pole this session
AX.ttLaps = [];            // completed lap times this time-trial session
AX.ttSessionTs = 0;        // session start stamp; entries at/after it are "yours, just now"
AX.sectorStartT = 0;        // lapTime when current sector started
AX.sectorIdx = 0;           // 0, 1, 2 (current sector)
AX.sectorBests = [Infinity, Infinity, Infinity];  // best S1/S2/S3 times ever
AX.sectorLast = [null, null, null];               // last lap's S1/S2/S3 times
AX.frameSky = {}; AX.frame = {};

// Shared with game.js (and later game-* modules) via the AX bag.
Object.assign(AX, { store, ttBoard, ttBoardAdd });
})();
