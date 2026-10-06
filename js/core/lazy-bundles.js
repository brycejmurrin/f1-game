/* Apex 26 — LazyBundles: extracted runtime orchestration.
   Contract: docs/ARCHITECTURE.md. */
const LazyBundles = (function () {
"use strict";
function create(deps) {
const { els, loadBackendScripts } = deps;
// LAZY_AGENT. Not SW-optional (V8 full-compiles install puts). Players on
// github.io skip this; tests and localhost inject.
const AGENT_FILES = ApexRoster.LAZY_AGENT;
const AGENT_EDGES = ApexRoster.LAZY_EDGES;
// LAZY_RACE — the race payload, fetched before the first race.
const RACE_FILES = ApexRoster.LAZY_RACE;
// LAZY_SCENERY (tools/manifest.cjs): one file per circuit, ~27 KB each, holding
// that circuit's bespoke scenery() closure — all 40 were 1,083 KB of boot
// script for a session that builds ONE of them.
//
// This one needs a real gate, unlike the presets: Tracks.build() is
// synchronous and every loadTrack() caller uses `track` on the next line, so
// the closure must be resident BEFORE loadTrack runs. Hence a promise at each
// of the three entries that can reach a circuit not yet loaded: the menu
// flyby, startRace(), and openQuali(). Everything else only ever re-loads the
// circuit already on screen.
const SCENERY_DIR = ApexRoster.SCENERY_DIR;
function sceneryResident(id) {
  return !!(window.TrackScenery && window.TrackScenery[id]);
}
// Memoised on the in-flight PROMISE (the ensureDataHub idiom below): several
// callers ask for the same circuit before sceneryResident() goes true and
// would each inject their own copy (28-58 KB, up to four times). Cleared on
// settle so a dropped fetch retries.
const _sceneryLoads = new Map();
// Also wait for THIS circuit's baked models (Assets.modelsReady, capped at
// 4 s): prop placement is synchronous, so a build that ran before the models
// landed kept the box fallback for the whole session. The set is the model
// ids the scenery closure's source names, so it is known only once the
// closure is resident; a circuit that names none (35 of 40) waits on nothing.
// Boot used to prefetch all 77 models (~2 MB) for the 29 five circuits use.
function sceneryModels(def) {
  if (typeof Assets === "undefined" || !Assets.modelsReady) return Promise.resolve();
  const fn = def && (def.scenery || (window.TrackScenery && window.TrackScenery[def.id]));
  return Assets.modelsReady(0, fn ? String(fn) : "");
}
function ensureScenery(idx) {
  const def = Tracks.LIST[idx];
  const models = () => sceneryModels(def);
  if (!def || def.scenery || sceneryResident(def.id)) return models().then(() => {});   // def.scenery: an inline closure (a custom circuit) — nothing to fetch
  let p = _sceneryLoads.get(def.id);
  if (!p) {
    p = loadBackendScripts([SCENERY_DIR + "/" + def.id + ".js"], []).then(() => { _sceneryLoads.delete(def.id); });
    _sceneryLoads.set(def.id, p);
  }
  return p.then(models).then(() => {});
}
// LAZY_DATA (tools/manifest.cjs). The Jolpica/OpenF1 hub — 154 KB behind ONE
// menu button, which a session that never opens DATA runs no byte of. Unlike
// the scenery closures, nothing outside reads a Data* global, so this needs
// no gate beyond the button itself.
const DATA_FILES = ApexRoster.LAZY_DATA;
// hub.js calls Data*.create() at EVAL time, so every tab module lands first —
// the manifest derives "everything, then the hub" and the roster carries it.
const DATA_EDGES = ApexRoster.LAZY_DATA_EDGES;
// Keep successfully evaluated script-level consts across a failed attempt:
// reinjecting one on retry throws "Identifier has already been declared".
const dataScriptsLoaded = new Set();
const DATA_READY = {
  "js/data/api-transport.js": () => typeof F1Transport !== "undefined",
  "js/data/tab-utils.js": () => typeof DataTabUtils !== "undefined",
  "js/data/telemetry-model.js": () => typeof DataTelemetryModel !== "undefined",
  "js/data/telemetry-render.js": () => typeof DataTelemetryRender !== "undefined",
  "js/data/telemetry-player.js": () => typeof DataTelemetryPlayer !== "undefined",
  "js/data/telemetry-view.js": () => typeof DataTelemetryView !== "undefined",
  "js/data/api.js": () => typeof F1API !== "undefined",
  "js/data/telemetry.js": () => typeof DataTelemetry !== "undefined",
  "js/data/export.js": () => typeof DataExport !== "undefined",
  "js/data/schedule.js": () => typeof DataSchedule !== "undefined",
  "js/data/standings.js": () => typeof DataStandings !== "undefined",
  "js/data/results.js": () => typeof DataResults !== "undefined",
  "js/data/live.js": () => typeof DataLive !== "undefined",
  "js/data/real-race-tab.js": () => typeof DataRealRace !== "undefined",
  "js/data/hub.js": () => typeof DataHub !== "undefined",
};
// Memoised on the PROMISE, not on a boolean: two fast taps on DATA must not
// inject the bundle twice, and the second tap has to await the first load
// rather than call DataHub.open() while hub.js is still in flight.
let dataHubLoad = null;
function ensureDataHub() {
  if (dataHubLoad) return dataHubLoad;
  dataHubLoad = loadBackendScripts(DATA_FILES, DATA_EDGES, {
    strict: true, loaded: dataScriptsLoaded,
    ready: (src) => DATA_READY[src] && DATA_READY[src](),
  }).then((complete) => {
    // Bare global, not window.DataHub: hub.js is a script-level `const`, a
    // lexical binding that is never a window property. Null the memo on an
    // incomplete group so a later tap retries instead of latching failure.
    // A failed sibling must not even START hub.js. The binding can be in its
    // temporal dead zone after a script exception, so do not probe it on an
    // incomplete load (even typeof throws in that case).
    if (!complete) {
      Log.warn("data", "the data hub bundle did not load — DATA stays closed");
      dataHubLoad = null;
      return false;
    }
    DataHub.init(els.datahub);
    return true;
  });
  return dataHubLoad;
}

// LAZY_NET (tools/manifest.cjs) — the 241 KB WebRTC stack. Loaded from the ONE
// player-facing entry (VS FRIEND) and, at boot, whenever the agent surface is
// wanted: js/agent/apex.js reads NetTransport / NetSession / NetSnapshot and 22
// netLobby methods directly and drives the multiplayer specs, so tying the two
// together keeps every test and dev session behaving exactly as before and
// confines this change to players, who load neither.
const NET_FILES = ApexRoster.LAZY_NET;
const NET_EDGES = ApexRoster.LAZY_NET_EDGES;
let netLoad = null;
function ensureNet() {
  if (netLoad) return netLoad;
  netLoad = loadBackendScripts(NET_FILES, NET_EDGES).then(() => {
    if (typeof NetPlay === "undefined" || typeof NetLobby === "undefined") {
      // inject() resolves on error, so this is the only place a miss shows.
      // Keep the stubs (the game stays playable solo) and null the memo so a
      // second attempt can succeed rather than latching for the session.
      Log.warn("net", "the multiplayer bundle did not load — VS FRIEND unavailable");
      netLoad = null;
      return false;
    }
    const netLobby = deps.createNetwork();
    // The real lobby binds #vsfriend here — the boot position the stub's inert
    // wire() stood in for. Once, because ensureNet() memoises on the promise.
    netLobby.wire();
    return true;
  });
  return netLoad;
}

// LAZY_AUDIO (tools/manifest.cjs) — ~449 KB WebAudio engine + panel/voice.
// Title boots the stub; real modules reinject via top-level `var` and
// onAudioReady recreates panel/voice/announcer instances.
const AUDIO_FILES = ApexRoster.LAZY_AUDIO || [];
const AUDIO_EDGES = ApexRoster.LAZY_AUDIO_EDGES || [];
let audioLoad = null;
function ensureAudio() {
  if (audioLoad) return audioLoad;
  if (!AUDIO_FILES.length) return Promise.resolve(false);
  if (typeof GameAudio !== "undefined" && GameAudio && !GameAudio._stub) {
    audioLoad = Promise.resolve(true);
    return audioLoad;
  }
  audioLoad = loadBackendScripts(AUDIO_FILES, AUDIO_EDGES).then(() => {
    if (typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) {
      Log.warn("audio", "the audio bundle did not load — sound stays silent");
      audioLoad = null;
      return false;
    }
    if (typeof deps.onAudioReady === "function") deps.onAudioReady();
    return true;
  });
  return audioLoad;
}

function wantAgentSurface() {
  if (typeof window !== "undefined" && window.__TEST_MODE) return true;
  try { if (localStorage.getItem("apex26.devApi") === "1") return true; } catch (_) { /* blocked */ }
  const q = typeof location !== "undefined" ? location.search : "";
  if (/[?&](apex|debug|report)(=|&|$)/.test(q)) return true;
  if (typeof navigator !== "undefined" && navigator.webdriver) return true;
  const h = typeof location !== "undefined" ? location.hostname : "";
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
}
// The INJECT, split from the boot GATE below so a player-facing consumer can
// ask for it later. Memoised on the in-flight promise (the ensureScenery /
// ensureDataHub idiom): boot and a METRICS toggle must never fetch it twice.
let _agentLoad = null;
function loadAgentSurface() {
  if (!_agentLoad) _agentLoad = (async () => {
    // js/net comes WITH the agent surface. apex.js reads NetTransport /
    // NetSession / NetSnapshot at eval-adjacent call sites and drives 22
    // netLobby methods the stub does not carry, so a dev session or a spec that
    // got __apex without the real net would fail on the multiplayer hooks
    // instead of on anything this change is about. Awaited BEFORE apex.js so
    // ApexApi.create(G) sees the real objects through the G getters.
    await ensureNet();
    await loadBackendScripts(AGENT_FILES, AGENT_EDGES);
    deps.bindAgent();
  })();
  return _agentLoad;
}
async function bootAgentSurface() {
  if (!wantAgentSurface()) return;
  await loadAgentSurface();
}

// THE RACE PAYLOAD (LAZY_RACE in tools/manifest.cjs). NOT awaited, on
// purpose: awaiting it here would put the 338 KB straight back on the
// critical path. Nothing in a menu resolves lighting — applyRaceSettings()
// first runs inside startRace() — so the fetch has the entire time a player
// spends picking a circuit to land.
//
// No gate is needed because an ABSENT file is already a legal state:
// light-store reads window.LightPresets at call time (`|| null`), so until it
// arrives every knob resolves to its TUNE_DEFS default, and when it does
// arrive applyLightTune() re-walks TUNE_DEFS and fires liveEffects only for
// knobs that moved. Worst case is a frame of default lighting, not a wrong
// scene that stays wrong.
async function raceAssets() {
  // The circuit already selected (persisted trackIdx, or the default) is the
  // one a player is most likely to race and the one the __apex no-track
  // fallback would build, so fetch its scenery up front rather than making the
  // first GO wait for it.
  ensureScenery(deps.getContext().trackIdx);
  // Prefetch audio so a title→race click still has a sync gesture window for
  // AudioContext.unlock; startRace awaits ensureAudio either way.
  ensureAudio();
  if (window.LightPresets) return;
  await loadBackendScripts(RACE_FILES, []);
  if (window.LightPresets) deps.applyLightTuneIfReady();
}

return { SCENERY_DIR, sceneryResident, raceAssets, ensureScenery, ensureDataHub, ensureNet, ensureAudio, wantAgentSurface, loadAgentSurface, bootAgentSurface };
}
  return { create };
})();
Object.freeze(LazyBundles);
