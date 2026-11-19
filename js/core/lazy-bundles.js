const LazyBundles = (function () {
"use strict";
function create(deps) {
const { els, loadBackendScripts: loadScripts } = deps;
const ctxOrNull = () => {
  try { return typeof deps.getContext === "function" ? deps.getContext() : null; }
  catch (_) { return null; }
};
const AGENT_FILES = ApexRoster.LAZY_AGENT;
const AGENT_EDGES = ApexRoster.LAZY_EDGES;
const isGarageData = (f) => /^js\/garage\/|^js\/data\/garage-/.test(f);
const RACE_FILES = ApexRoster.LAZY_RACE.filter((f) => !isGarageData(f));
const GARAGE_FILES = ApexRoster.LAZY_RACE.filter(isGarageData);
const RACE_SESSION_FILES = ApexRoster.LAZY_RACE_SESSION || [];
const RACE_SESSION_EDGES = ApexRoster.LAZY_RACE_SESSION_EDGES || [];
let raceSessionLoad = null;
const RACE_SESSION_READY = {
  "js/data/garage-departure-motion.js": () => typeof GarageDepartureMotion !== "undefined",
  "js/garage/departure-wheels.js": () => typeof GarageDepartureWheels !== "undefined",
  "js/race/reliability.js": () => typeof Reliability !== "undefined" && !!Reliability && !Reliability._stub,
  "js/race/damage.js": () => typeof Damage !== "undefined" && !!Damage && !Damage._stub,
  "js/race/damage-handling.js": () => typeof DamageHandling !== "undefined" && !!DamageHandling && !DamageHandling._stub,
  "js/race/duel.js": () => typeof Duel !== "undefined" && !!Duel && !Duel._stub,
  "js/race/session-records.js": () => typeof SessionRecords !== "undefined" && !!SessionRecords && !SessionRecords._stub,
  "js/race/pit-geom.js": () => typeof PitGeom !== "undefined" && !!PitGeom,
  "js/race/pit-lane.js": () => typeof PitLane !== "undefined" && !!PitLane && !PitLane._stub,
  "js/race/engineer.js": () => typeof RaceEngineer !== "undefined" && !!RaceEngineer && !RaceEngineer._stub,
  "js/race/radio-lines.js": () => typeof RadioLines !== "undefined" && !!RadioLines && !RadioLines._stub,
  "js/race/race-facts.js": () => typeof RaceFacts !== "undefined" && !!RaceFacts && !RaceFacts._stub,
  "js/race/spotter.js": () => typeof Spotter !== "undefined" && !!Spotter && !Spotter._stub,
  "js/race/race-radio.js": () => typeof RaceRadio !== "undefined" && !!RaceRadio && !RaceRadio._stub,
  "js/race/start-lights.js": () => typeof StartLights !== "undefined" && !!StartLights && !StartLights._stub,
  "js/race/marshal-panels.js": () => typeof MarshalPanels !== "undefined" && !!MarshalPanels && !MarshalPanels._stub,
  "js/race/flying-start.js": () => typeof FlyingStart !== "undefined" && !!FlyingStart && !FlyingStart._stub,
  "js/race/jump-start-penalty.js": () => typeof JumpStartPenalty !== "undefined" && !!JumpStartPenalty && !JumpStartPenalty._stub,
};
const raceSessionLoaded = new Set();
let raceSessionHooked = false;
function raceSessionReady() {
  return RACE_SESSION_FILES.every((f) => raceSessionLoaded.has(f));
}
async function loadRaceSessionSerial(opts) {
  const files = RACE_SESSION_FILES;
  const preds = new Map(files.map((f) => [f, []]));
  for (const [a, b] of RACE_SESSION_EDGES) if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  const pending = files.filter((f) => !raceSessionLoaded.has(f));
  if (pending.length > 1 && typeof ScriptLoader !== "undefined" && ScriptLoader.preload) {
    try { ScriptLoader.preload(pending); } catch (_) {  }
  }
  let first = true;
  while (pending.length) {
    const i = pending.findIndex((f) => preds.get(f).every((p) => raceSessionLoaded.has(p) || !pending.includes(p)));
    if (i < 0) return loadBackendScripts(pending, RACE_SESSION_EDGES, opts);
    const src = pending.splice(i, 1)[0];
    if (!first) await audioYieldToMain("task");
    first = false;
    if (!(await loadBackendScripts([src], RACE_SESSION_EDGES, opts))) return false;
  }
  return true;
}
function ensureRaceSession() {
  if (raceSessionLoad) return raceSessionLoad;
  if (!RACE_SESSION_FILES.length) return Promise.resolve(false);
  if (!raceSessionLoaded.size && RACE_SESSION_FILES.every((f) => !RACE_SESSION_READY[f] || RACE_SESSION_READY[f]())) {
    raceSessionLoad = Promise.resolve(true);
    return raceSessionLoad;
  }
  raceSessionLoad = loadRaceSessionSerial({
    strict: true, loaded: raceSessionLoaded,
    onSlow: () => { if (typeof LoadingScreen !== "undefined" && LoadingScreen.slowNotice) LoadingScreen.slowNotice(); },
    ready: (src) => !RACE_SESSION_READY[src] || RACE_SESSION_READY[src](),
  }).then((ok) => {
    if (!ok || !raceSessionReady()) {
      Log.warn("race", "the race-session bundle did not load");
      raceSessionLoad = null;
      return false;
    }
    if (!raceSessionHooked) {
      try {
        if (typeof deps.onRaceSessionReady === "function") deps.onRaceSessionReady();
        raceSessionHooked = true;
      } catch (e) {
        Log.error("race", "the race-session ready hook threw: " + (e && e.message));
        raceSessionLoad = null;
        return false;
      }
    }
    return true;
  });
  return raceSessionLoad;
}
let garageExteriorLoad = null;
function ensureGarageExterior() {
  if (typeof GarageExterior !== "undefined" && typeof GarageExteriorGeometry !== "undefined") return Promise.resolve(true);
  if (!garageExteriorLoad) garageExteriorLoad = loadBackendScripts(ApexRoster.LAZY_GARAGE_EXTERIOR || [], [], { strict: true,
    ready: (src) => src.endsWith("exterior-geometry.js") ? typeof GarageExteriorGeometry !== "undefined" : typeof GarageExterior !== "undefined" })
    .then((ok) => { ok = !!ok && typeof GarageExterior !== "undefined" && typeof GarageExteriorGeometry !== "undefined"; if (!ok) garageExteriorLoad = null; return ok; }).catch(() => { garageExteriorLoad = null; return false; });
  return garageExteriorLoad;
}
const CIRCUITS_DIR = ApexRoster.CIRCUITS_DIR || "js/circuits";
const _circuitLoads = new Map();
function circuitResident(def) {
  return !!(typeof Tracks !== "undefined" && Tracks.circuitPayloadResident && Tracks.circuitPayloadResident(def));
}
function ensureCircuit(idx) {
  if (lightFailed) ensureLightPresets();
  const def = Tracks.LIST[idx];
  if (!def || circuitResident(def) || def.custom) return Promise.resolve();
  let p = _circuitLoads.get(def.id);
  if (!p) {
    p = loadBackendScripts([CIRCUITS_DIR + "/" + def.id + ".js"], [], { transientRetry: false }).then((ok) => {
      if (!ok) {
        Log.warn("track", "circuit payload failed to load: " + def.id);
        return false;
      }
      const all = window.TrackDefs || [];
      let raw = null;
      for (let i = all.length - 1; i >= 0; i--) {
        const d = all[i];
        if (d && d.id === def.id && d.path && d.path.pts && d.path.pts.length) { raw = d; break; }
      }
      if (!raw) {
        Log.warn("track", "circuit payload missing path after load: " + def.id);
        return false;
      }
      return Tracks.hydrate(raw);
    }).finally(() => _circuitLoads.delete(def.id));
    _circuitLoads.set(def.id, p);
  }
  return p.then((ok) => {
    if (ok === false || !circuitResident(Tracks.LIST[idx])) {
      throw new Error("circuit payload not resident: " + (def && def.id));
    }
  });
}
const SCENERY_DIR = ApexRoster.SCENERY_DIR;
function sceneryResident(id) {
  return !!(window.TrackScenery && window.TrackScenery[id]);
}
const _sceneryLoads = new Map();
function sceneryModels(def) {
  if (typeof Assets === "undefined" || !Assets.modelsReady) return Promise.resolve();
  const fn = def && (def.scenery || (window.TrackScenery && window.TrackScenery[def.id]));
  return Assets.modelsReady(0, fn ? String(fn) : "");
}
function fetchScenery(id) {
  let p = _sceneryLoads.get(id);
  if (!p) {
    p = loadBackendScripts([SCENERY_DIR + "/" + id + ".js"], [], { transientRetry: false })
      .catch((e) => { Log.warn("track", "scenery fetch threw: " + id + ": " + (e && e.message)); })
      .then(() => { _sceneryLoads.delete(id); });
    _sceneryLoads.set(id, p);
  }
  return p;
}
const TRACK_BUILD_FILES = ApexRoster.LAZY_TRACK_BUILD || [];
const TRACK_BUILD_EDGES = ApexRoster.LAZY_TRACK_BUILD_EDGES || [];
const trackBuildLoaded = new Set();
let trackBuildLoad = null;
function trackBuildResident() {
  return typeof TrackBuildProps !== "undefined" && !!TrackBuildProps &&
    typeof TrackModels !== "undefined" && !!TrackModels &&
    typeof TrackHiddenFaces !== "undefined" && !!TrackHiddenFaces;
}
function ensureTrackBuild() {
  if (trackBuildResident() && (!TRACK_BUILD_FILES.length || TRACK_BUILD_FILES.every((f) => trackBuildLoaded.has(f)))) {
    return Promise.resolve(true);
  }
  if (trackBuildLoad) return trackBuildLoad;
  if (!TRACK_BUILD_FILES.length) return Promise.resolve(trackBuildResident());
  if (trackBuildResident() && !trackBuildLoaded.size) {
    for (const f of TRACK_BUILD_FILES) trackBuildLoaded.add(f);
    return Promise.resolve(true);
  }
  trackBuildLoad = loadBackendScripts(TRACK_BUILD_FILES, TRACK_BUILD_EDGES, {
    strict: true, loaded: trackBuildLoaded,
    ready: (src) => {
      if (src === "js/track/scenery/build-props.js") return typeof TrackBuildProps !== "undefined" && !!TrackBuildProps;
      if (src === "js/track/scenery/models.js") return typeof TrackModels !== "undefined" && !!TrackModels;
      if (src === "js/track/core/hidden-faces.js") return typeof TrackHiddenFaces !== "undefined" && !!TrackHiddenFaces;
      return true;
    },
  }).then((ok) => {
    if (!ok || !trackBuildResident()) {
      Log.warn("track", "the track-build bundle did not load");
      trackBuildLoad = null;
      return false;
    }
    return true;
  });
  return trackBuildLoad;
}
async function ensureScenery(idx) {
  const buildP = ensureTrackBuild();
  const def0 = Tracks.LIST[idx];
  const early = def0 && !def0.custom && !def0.scenery && !sceneryResident(def0.id) ? fetchScenery(def0.id) : null;
  await ensureCircuit(idx);
  const def = Tracks.LIST[idx];
  if (def && !def.scenery && !sceneryResident(def.id)) {
    await (early && def === def0 ? early : fetchScenery(def.id));
    if (!sceneryResident(def.id)) {
      Log.warn("track", "scenery closure did not load: " + def.id + " — the world builds bare");
      await buildP;
      return false;
    }
  }
  const modelsP = sceneryModels(def);
  if (!(await buildP)) {
    await modelsP;
    Log.warn("track", "track-build toolkit missing — Tracks.build cannot dress the world");
    return false;
  }
  await modelsP;
  return true;
}
const DATA_FILES = ApexRoster.LAZY_DATA;
const DATA_EDGES = ApexRoster.LAZY_DATA_EDGES;
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
  "js/data/ics.js": () => typeof DataIcs !== "undefined",
  "js/data/standings.js": () => typeof DataStandings !== "undefined",
  "js/data/results.js": () => typeof DataResults !== "undefined",
  "js/data/live.js": () => typeof DataLive !== "undefined",
  "js/data/real-race-script.js": () => typeof DataRealRaceScript !== "undefined",
  "js/data/real-race-fetch.js": () => typeof DataRealRaceFetch !== "undefined",
  "js/data/real-race-tab.js": () => typeof DataRealRace !== "undefined",
  "js/data/hub.js": () => typeof DataHub !== "undefined",
};
const REAL_RACE_FILES = ApexRoster.LAZY_REAL_RACE || [];
const REAL_RACE_EDGES = ApexRoster.LAZY_REAL_RACE_EDGES || [];
const REAL_RACE_READY = {
  "js/ui/watch-transport.js": () => typeof WatchTransport !== "undefined",
  "js/race/real-replay.js": () => typeof RealReplay !== "undefined",
  "js/race/real-race-pace.js": () => typeof RealRacePace !== "undefined",
  "js/race/real-race.js": () => typeof RealRaceBody !== "undefined",
};
const realRaceLoaded = new Set();
let realRaceLoad = null;
function ensureRealRace() {
  if (realRaceLoad) return realRaceLoad;
  if (!REAL_RACE_FILES.length) return Promise.resolve(true);
  if (!realRaceLoaded.size && REAL_RACE_FILES.every((f) => REAL_RACE_READY[f] && REAL_RACE_READY[f]())) {
    realRaceLoad = Promise.resolve(true);
    return realRaceLoad;
  }
  realRaceLoad = loadBackendScripts(REAL_RACE_FILES, REAL_RACE_EDGES, {
    strict: true, loaded: realRaceLoaded,
    ready: (src) => !REAL_RACE_READY[src] || REAL_RACE_READY[src](),
  }).then((ok) => {
    if (!ok || typeof RealRaceBody === "undefined") {
      Log.warn("data", "the real-race bundle did not load");
      realRaceLoad = null;
      return false;
    }
    return true;
  }).catch((e) => {
    Log.warn("data", "the real-race bundle did not load: " + (e && e.message));
    realRaceLoad = null;
    return false;
  });
  return realRaceLoad;
}

let dataHubLoad = null;
const DATA_HUB_RETRY_MS = [400, 1200];
function dataHubRetryDelay(attempt) {
  const ms = DATA_HUB_RETRY_MS[attempt - 1];
  if (!ms) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
function ensureDataHub() {
  if (dataHubLoad) return dataHubLoad;
  dataHubLoad = (async () => {
    const maxAttempts = DATA_HUB_RETRY_MS.length + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await dataHubRetryDelay(attempt);
      const [complete, realOk] = await Promise.all([loadBackendScripts(DATA_FILES, DATA_EDGES, {
        strict: true, loaded: dataScriptsLoaded,
        ready: (src) => DATA_READY[src] && DATA_READY[src](),
        cacheBust: attempt > 0 ? attempt : 0,
      }), ensureRealRace()]);
      if (!complete || !realOk) {
        if (attempt < maxAttempts - 1) continue;
        Log.warn("data", "the data hub bundle did not load — DATA stays closed");
        dataHubLoad = null;
        return false;
      }
      try { DataHub.init(els.datahub); }
      catch (e) {
        Log.error("data", "the data hub failed to start: " + (e && e.message));
        dataHubLoad = null;
        return false;
      }
      return true;
    }
    return false;
  })();
  return dataHubLoad;
}

const NET_FILES = ApexRoster.LAZY_NET;
const NET_EDGES = ApexRoster.LAZY_NET_EDGES;
let netLoad = null;
const netScriptsLoaded = new Set();
const NET_READY = {
  "js/net/bytes.js": () => typeof NetBytes !== "undefined",
  "js/net/nostr.js": () => typeof NetNostr !== "undefined",
  "js/net/rendezvous.js": () => typeof NetRendezvous !== "undefined",
  "js/net/sdp.js": () => typeof NetSdp !== "undefined",
  "js/net/qr.js": () => typeof NetQr !== "undefined",
  "js/net/scan.js": () => typeof NetScan !== "undefined",
  "js/net/ice.js": () => typeof NetIce !== "undefined",
  "js/net/interp.js": () => typeof NetInterp !== "undefined",
  "js/net/transport.js": () => typeof NetTransport !== "undefined",
  "js/net/handshake.js": () => typeof NetHandshake !== "undefined",
  "js/net/lobby-codes.js": () => typeof LobbyCodes !== "undefined",
  "js/net/snapshot.js": () => typeof NetSnapshot !== "undefined",
  "js/net/session.js": () => typeof NetSession !== "undefined",
  "js/net/quali-wire.js": () => typeof QualiWire !== "undefined",
  "js/net/strategy-wire.js": () => typeof StrategyWire !== "undefined",
  "js/net/netplay.js": () => typeof NetPlay !== "undefined",
  "js/net/lobby.js": () => typeof NetLobby !== "undefined",
  "js/input/phone-pad-codec.js": () => typeof PhonePadCodec !== "undefined",
  "js/input/phone-pad-page.js": () => typeof PhonePadPage !== "undefined",
  "js/input/phone-pad.js": () => typeof PhonePad !== "undefined",
};
function ensureNet() {
  if (netLoad) return netLoad;
  netLoad = loadBackendScripts(NET_FILES, NET_EDGES, {
    strict: true, loaded: netScriptsLoaded,
    ready: (src) => !NET_READY[src] || NET_READY[src](),
  }).then((complete) => {
    if (!complete || typeof NetPlay === "undefined" || typeof NetLobby === "undefined") {
      Log.warn("net", "the multiplayer bundle did not load — VS FRIEND unavailable");
      netLoad = null;
      return false;
    }
    try {
      const netLobby = deps.createNetwork();
      netLobby.wire();
    } catch (e) {
      Log.error("net", "the multiplayer lobby failed to start: " + (e && e.message));
      netLoad = null;
      return false;
    }
    return true;
  });
  return netLoad;
}

const AUDIO_FILES = ApexRoster.LAZY_AUDIO || [];
const AUDIO_EDGES = ApexRoster.LAZY_AUDIO_EDGES || [];
let audioLoad = null;
let audioRestored = false;
let audioStub = null;
const audioScriptsLoaded = new Set();
let audioHooked = false;
let audioStubVals = null;
const AUDIO_GLOBAL = {
  "js/audio/signal.js": () => typeof GameAudioSignal !== "undefined" ? GameAudioSignal : undefined,
  "js/audio/soundtrack.js": () => typeof GameAudioSoundtrack !== "undefined" ? GameAudioSoundtrack : undefined,
  "js/audio/radio-fx.js": () => typeof GameAudioRadioFx !== "undefined" ? GameAudioRadioFx : undefined,
  "js/audio/tone-model.js": () => typeof GameAudioToneModel !== "undefined" ? GameAudioToneModel : undefined,
  "js/audio/engine.js": () => typeof GameAudio !== "undefined" ? GameAudio : undefined,
  "js/audio/music-lib.js": () => window.MusicLib,
  "js/audio/spotify.js": () => window.SpotifyMusic,
  "js/audio/rivals.js": () => typeof RivalAudio !== "undefined" ? RivalAudio : undefined,
  "js/audio/crowd.js": () => typeof CrowdAudio !== "undefined" ? CrowdAudio : undefined,
  "js/audio/car-sfx.js": () => typeof CarSfx !== "undefined" ? CarSfx : undefined,
  "js/audio/voice-pack.js": () => typeof VoicePack !== "undefined" ? VoicePack : undefined,
  "js/audio/radio-voice.js": () => typeof RadioVoice !== "undefined" ? RadioVoice : undefined,
  "js/audio/announcer-recorded.js": () => typeof RecordedAnnouncer !== "undefined" ? RecordedAnnouncer : undefined,
  "js/audio/announcer.js": () => typeof Announcer !== "undefined" ? Announcer : undefined,
  "js/audio/panel.js": () => typeof AudioPanel !== "undefined" ? AudioPanel : undefined,
  "js/audio/driving-cues.js": () => typeof DrivingCues !== "undefined" ? DrivingCues : undefined,
};
function audioFileLanded(src) {
  const read = AUDIO_GLOBAL[src];
  if (!read) return true;
  const v = read();
  return v !== undefined && v !== null && !v._stub && v !== (audioStubVals && audioStubVals[src]);
}
function audioIsGameVm() {
  return typeof navigator !== "undefined" && /apex-game-vm/.test(navigator.userAgent || "");
}
function audioYieldToMain(kind) {
  if (audioIsGameVm()) return Promise.resolve();
  const macrotask = () => new Promise((r) => setTimeout(r, 0));
  if (kind === "paint") {
    const afterFrame = () => new Promise((r) => setTimeout(r, 16));
    if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
      return scheduler.yield().then(afterFrame);
    }
    return afterFrame();
  }
  if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
    return scheduler.yield();
  }
  return macrotask();
}
function settingsUiHot() {
  if (typeof MenuSheetGate !== "undefined" && MenuSheetGate.open) return MenuSheetGate.open();
  try {
    if (typeof document === "undefined") return false;
    const pm = document.getElementById("pmsettings");
    if (pm && !pm.hidden) return true;
    const a = document.activeElement;
    if (a && (a.id === "mb-settings" || a.id === "pm-settings")) return true;
  } catch (_) {  }
  return false;
}
function audioMark(name) {
  try {
    if (typeof performance !== "undefined" && performance.mark) performance.mark(name);
  } catch (_) {  }
}
async function loadAudioSerial(skipLeadingYield) {
  const preds = new Map(AUDIO_FILES.map((f) => [f, []]));
  for (const [a, b] of (AUDIO_EDGES || [])) {
    if (preds.has(a) && preds.has(b)) preds.get(b).push(a);
  }
  const pending = new Set(AUDIO_FILES.filter((f) => !audioScriptsLoaded.has(f)));
  const readyFn = (src) => { restoreOnEngine(); return audioFileLanded(src); };
  const hot = () => settingsUiHot();
  while (pending.size) {
    const ready = [...pending].filter((f) => preds.get(f).every((p) => audioScriptsLoaded.has(p)));
    if (!ready.length) {
      return loadScripts([...pending], AUDIO_EDGES, { loaded: audioScriptsLoaded, ready: readyFn });
    }
    if (!skipLeadingYield) await audioYieldToMain(hot() ? "paint" : "task");
    skipLeadingYield = false;
    audioMark("apex:audio:chunk");
    const src = ready[0];
    pending.delete(src);
    const ok = await loadScripts([src], [], { loaded: audioScriptsLoaded, ready: readyFn });
    if (!ok) return false;
  }
  return true;
}
async function loadBackendScripts(files, edges, opts) {
  if (files === AUDIO_FILES && settingsUiHot()) {
    audioMark("apex:settings:audio-deferred");
    await audioYieldToMain("paint");
    await audioYieldToMain("task");
    return loadAudioSerial(true);
  }
  return loadScripts(files, edges, opts);
}
const audioPrefetched = new Set();
function prefetchAudio() {
  if (audioIsGameVm() || audioLoad || typeof fetch !== "function") return;
  for (let i = 0; i < AUDIO_FILES.length; i++) {
    const src = AUDIO_FILES[i];
    if (audioPrefetched.has(src)) continue;
    audioPrefetched.add(src);
    const href = typeof ScriptLoader !== "undefined" && ScriptLoader.url ? ScriptLoader.url(src) : src + "?v=" + (window.__APEX_BUILD || 0);
    try {
      fetch(href, { priority: "low", credentials: "same-origin", mode: "cors" })
        .then((r) => r.arrayBuffer()).catch(() => {});
    } catch (_) {  }
  }
}
function restoreOnEngine() {
  if (audioRestored || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) return true;
  const G = ctxOrNull(), store = G && G.store;
  if (!store) return true;
  audioRestored = true;
  try {
    GameAudio.setEnabled(!!G.soundOn);
    GameAudio.setMusicVolume(store.get("volMusic"));
    GameAudio.setSfxVolume(store.get("volSfx"));
    if (GameAudio.setRadioFocusDb) GameAudio.setRadioFocusDb(store.get("radioFocusDb", 0));
    const radio = G.radio;
    if (radio && radio.setVolume) radio.setVolume(store.get("volRadio", 0.8));
  } catch (e) { Log.warn("audio", "early level restore failed: " + (e && e.message)); }
  try {
    const hook = audioStub && audioStub._interruptHook ? audioStub._interruptHook() : null;
    if (hook && GameAudio.onInterrupted) GameAudio.onInterrupted(hook);
    if (typeof CamModes !== "undefined" && CamModes.CAM_MODES && CamModes.CAM_MODES[G.camMode]) GameAudio.setCameraMix(CamModes.CAM_MODES[G.camMode].id);
    const ua = typeof navigator !== "undefined" ? navigator.userActivation : null;
    const desktopShell = typeof Native !== "undefined" && Native.platform() === "desktop";
    if (G.soundOn && (desktopShell || !ua || ua.hasBeenActive)) GameAudio.init();
  } catch (e) { Log.warn("audio", "first-gesture replay failed: " + (e && e.message)); }
  return true;
}
const AUDIO_GESTURES = ["pointerup", "touchend", "click", "keydown"];
let audioGestureArmed = false;
function audioGestureUnlock(e) {
  if (e && (e.isTrusted === false || (e.type === "keydown" && e.key === "Escape"))) return;
  if (!audioHooked) ensureAudio();
  if (typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) return;
  const G = ctxOrNull();
  if (!G || !G.soundOn) return;
  const ctx = GameAudio.context ? GameAudio.context() : null;
  try { if (!ctx || ctx.state !== "running") GameAudio.init(); } catch (err) { Log.warn("audio", "gesture unlock failed: " + (err && err.message)); }
  const now = GameAudio.context ? GameAudio.context() : null;
  if (now && now.state === "running") disarmAudioGesture();
}
function armAudioGesture() {
  if (audioGestureArmed || typeof window === "undefined" || !window.addEventListener) return;
  audioGestureArmed = true;
  for (const t of AUDIO_GESTURES) window.addEventListener(t, audioGestureUnlock, true);
}
function disarmAudioGesture() {
  for (const t of AUDIO_GESTURES) window.removeEventListener(t, audioGestureUnlock, true);
}
armAudioGesture();
const audioReadyDone = new Set();
function audioReadyOnce(key, fn) {
  if (audioReadyDone.has(key)) return;
  fn();
  audioReadyDone.add(key);
}
function ensureAudio() {
  if (audioLoad) return audioLoad;
  if (!AUDIO_FILES.length) return Promise.resolve(false);
  if (!audioScriptsLoaded.size && typeof GameAudio !== "undefined" && GameAudio && !GameAudio._stub) {
    audioLoad = Promise.resolve(true);
    return audioLoad;
  }
  if (!audioStubVals) {
    audioStub = typeof GameAudio !== "undefined" ? GameAudio : null;
    audioStubVals = {};
    for (const f of AUDIO_FILES) if (AUDIO_GLOBAL[f]) audioStubVals[f] = AUDIO_GLOBAL[f]();
  }
  audioLoad = (async () => {
    await audioYieldToMain("paint");
    const ok = await loadBackendScripts(AUDIO_FILES, AUDIO_EDGES, {
      strict: true, loaded: audioScriptsLoaded,
      ready: (src) => { restoreOnEngine(); return audioFileLanded(src); },
    });
    if (!ok || AUDIO_FILES.some((f) => !audioScriptsLoaded.has(f)) || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) {
      Log.warn("audio", "the audio bundle did not load — sound stays silent");
      audioLoad = null;
      return false;
    }
    if (audioHooked) return true;
    await audioYieldToMain("task");
    if (typeof deps.onAudioReady === "function") try {
      const parts = [];
      deps.onAudioReady((key, fn) => { parts.push([key, fn]); });
      let ran = false;
      for (const [key, fn] of parts) {
        if (audioReadyDone.has(key)) continue;
        if (ran) await audioYieldToMain("task");
        ran = true;
        audioReadyOnce(key, fn);
      }
    } catch (e) {
      Log.error("audio", "the audio ready hook threw: " + (e && e.message));
      audioLoad = null;
      return false;
    }
    try {
      if (typeof CrowdAudio !== "undefined" && CrowdAudio && CrowdAudio.bind) {
        CrowdAudio.bind(ctxOrNull());
      }
    } catch (e) { Log.warn("audio", "CrowdAudio.bind failed: " + (e && e.message)); }
    audioHooked = true;
    audioMark("apex:audio:ready");
    return true;
  })();
  return audioLoad;
}

function wantAgentSurface() {
  if (typeof window !== "undefined" && window.__TEST_MODE) return true;
  try { if (localStorage.getItem("apex26.devApi") === "1") return true; } catch (_) {  }
  const q = typeof location !== "undefined" ? location.search : "";
  if (/[?&](apex|debug|report)(=|&|$)/.test(q)) return true;
  if (typeof navigator !== "undefined" && navigator.webdriver) return true;
  const h = typeof location !== "undefined" ? location.hostname : "";
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
}
let _agentLoad = null;
const agentScriptsLoaded = new Set();
function loadAgentSurface() {
  if (!_agentLoad) _agentLoad = (async () => {
    const netOk = await ensureNet();
    const realOk = await ensureRealRace();
    const agentOk = await loadBackendScripts(AGENT_FILES, AGENT_EDGES, { loaded: agentScriptsLoaded });
    let bound = true;
    try { deps.bindAgent(); }
    catch (e) { bound = false; Log.warn("game", "agent surface bind failed: " + (e && e.message)); }
    if (netOk === false || realOk === false || !agentOk || !bound) {
      Log.warn("game", "the agent surface did not fully load — a later ask retries");
      _agentLoad = null;
    }
  })();
  return _agentLoad;
}
let _bridgeLinkLoad = null;
function openBridgeLink() {
  if (!_bridgeLinkLoad) {
    _bridgeLinkLoad = Promise.resolve(loadBackendScripts(AGENT_FILES.filter((f) => /\/bridge-link\.js$/.test(f)), [], { loaded: agentScriptsLoaded }))
      .then(() => typeof BridgeLink !== "undefined", () => false)
      .then((ok) => { if (!ok) _bridgeLinkLoad = null; return ok; });
  }
  return _bridgeLinkLoad.then((ok) => ok && BridgeLink.open({ loadAgentSurface }));
}
function mountBridgeLinkDoor() {
  const hub = typeof document !== "undefined" && document.getElementById ? document.getElementById("pm-settings-index") : null;
  if (!hub || !document.createElement || document.getElementById("pm-claude-link")) return;
  const door = document.createElement("button"), small = document.createElement("small");
  door.id = "pm-claude-link"; door.type = "button"; door.textContent = "CLAUDE LINK\u2026";
  small.textContent = "Let a Claude session read this app through a GitHub issue";
  door.appendChild(small);
  door.addEventListener("click", () => {
    openBridgeLink().then((ok) => { if (!ok) small.textContent = "Could not load. Check the connection, then tap again."; });
  });
  hub.appendChild(door);
}
async function bootAgentSurface() {
  if (!wantAgentSurface()) return;
  try { await loadAgentSurface(); }
  catch (e) { Log.warn("game", "bootAgentSurface failed: " + (e && e.message)); }
}

let _devLoad = null;
function wantDevPanels() {
  try { return typeof DevFlags !== "undefined" && !!DevFlags.get("gfxdebug"); }
  catch (_) { return false; }
}
function bootDevPanels() {
  const files = ApexRoster.LAZY_DEV || [];
  if (_devLoad || !files.length || !wantDevPanels()) return _devLoad;
  _devLoad = loadBackendScripts(files, [], { strict: true }).catch((e) => {
    Log.warn("game", "dev panels failed to load: " + (e && e.message));
    _devLoad = null;
    return false;
  });
  return _devLoad;
}

let _perfLoad = null, _perfBind = null;
const perfLoaded = new Set();
function perfResumePending() {
  try {
    const s = typeof GameStore !== "undefined" && GameStore.store;
    return !!(s ? s.raw("apex26.benchRun") : localStorage.getItem("apex26.benchRun"));
  } catch (_) { return false; }
}
function ensurePerfRig() {
  if (_perfLoad) return _perfLoad;
  const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_PERF) || [];
  if (!files.length) return Promise.resolve(false);
  _perfLoad = loadBackendScripts(files, ApexRoster.LAZY_PERF_EDGES || [], { strict: true, loaded: perfLoaded }).then((ok) => {
    bindPerfRig();
    if (ok === false) _perfLoad = null;
    return ok !== false;
  }).catch((e) => {
    Log.warn("game", "perf rig failed to load: " + (e && e.message));
    _perfLoad = null;
    return false;
  });
  return _perfLoad;
}
let _perfBound = false;
function bindPerfRig() {
  if (_perfBound || !_perfBind || typeof SoakRun === "undefined" || typeof BenchRun === "undefined") return;
  _perfBound = true;
  try { _perfBind(); } catch (e) { Log.warn("game", "perf rig bind failed: " + (e && e.message)); }
}
function bootPerfRig(bind) {
  _perfBind = bind;
  bindPerfRig();
  if (perfResumePending()) ensurePerfRig();
  else scheduleIdle(() => { ensurePerfRig(); }, 3000);
  return _perfLoad;
}

let lightLoad = null, lightFailed = false;
function ensureLightPresets() {
  if (window.LightPresets) return Promise.resolve(true);
  if (lightLoad) return lightLoad;
  lightLoad = loadBackendScripts(RACE_FILES, [], { transientRetry: false }).catch(() => false).then(() => {
    lightLoad = null;
    lightFailed = !window.LightPresets;
    if (lightFailed) { Log.warn("game", "the lighting presets did not load — the next race start asks again"); return false; }
    deps.applyLightTuneIfReady();
    return true;
  }).catch(() => false);
  return lightLoad;
}
let garageLoad = null;
const garageReady = () => typeof GarageData !== "undefined" && !!GarageData;
function ensureGarageData() {
  if (garageReady() || !GARAGE_FILES.length) return Promise.resolve(garageReady());
  if (garageLoad) return garageLoad;
  garageLoad = loadBackendScripts(GARAGE_FILES, [], { strict: true, transientRetry: false }).catch(() => false).then(() => {
    garageLoad = null;
    if (!garageReady()) Log.warn("game", "the garage's Blender tables did not load — the next garage visit asks again");
    return garageReady();
  });
  return garageLoad;
}
function ensureResultsSheet() {
  if (typeof GameResultsSheet !== "undefined") return Promise.resolve(true);
  if (typeof GameResults !== "undefined" && GameResults.ensureLoaded) return GameResults.ensureLoaded().then((ok) => !!ok && typeof GameResultsSheet !== "undefined");
  return Promise.resolve(false);
}
function lowDataLink() {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  return !!(c && (c.saveData || /2g$/.test(c.effectiveType || "")));
}
function scheduleIdle(fn, timeoutMs) {
  const ms = timeoutMs != null ? timeoutMs : 2000;
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: ms });
  else setTimeout(fn, Math.min(ms, 800));
}

async function awaitPackSettled(opts) {
  const o = opts || {};
  const yieldFn = typeof o.yieldFn === "function" ? o.yieldFn : () => Promise.resolve();
  const stale = typeof o.stale === "function" ? o.stale : () => false;
  const timeoutMs = o.timeoutMs != null ? +o.timeoutMs : 30000;
  const getState = typeof o.getState === "function" ? o.getState
    : () => (typeof Assets !== "undefined" && Assets.state ? Assets.state() : null);
  const settled = typeof o.settled === "function" ? o.settled
    : (s) => !s || s.supported === false || !!s.uploaded || !!s.error || s.tier === "off";
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const t0 = now();
  while (!settled(getState()) && !stale()) {
    if (now() - t0 >= timeoutMs) break;
    await yieldFn();
  }
  return settled(getState());
}
function raceAssets() {
  const kickScenery = () => {
    const bootCtx = ctxOrNull();
    if (bootCtx) ensureScenery(bootCtx.trackIdx).catch((e) => {
      Log.warn("track", "scenery prefetch failed: " + (e && e.message));
    });
    if (typeof TrackBuildClient !== "undefined" && TrackBuildClient.idleWarm) {
      try { TrackBuildClient.idleWarm(wantAgentSurface()); } catch (_) {  }
    }
  };
  if (typeof queueMicrotask === "function") queueMicrotask(kickScenery);
  else Promise.resolve().then(kickScenery);
  if (!lowDataLink()) {
    scheduleIdle(() => { ensureLightPresets(); }, 8000);
    scheduleIdle(() => { ensureRaceSession(); }, 9000);
    scheduleIdle(() => { ensureResultsSheet(); }, 9500);
    scheduleIdle(() => { prefetchAudio(); }, 12000);
    if (GARAGE_FILES.length) scheduleIdle(() => { ensureGarageData(); }, 6000);
  }
  bootDesktopAudio();
}

function bootDesktopAudio() {
  if (typeof Native === "undefined" || Native.platform() !== "desktop") return;
  const bind = () => {
    ensureAudio().then((ok) => {
      if (!ok) return;
      const G = ctxOrNull();
      if (!G || !G.soundOn) return;
      try {
        GameAudio.init();
        if (G.musicEnabled !== false) GameAudio.startMusic(-1);
      } catch (e) { Log.warn("audio", "desktop boot audio bind failed: " + (e && e.message)); }
    });
  };
  if (audioIsGameVm()) queueMicrotask(bind);
  else scheduleIdle(bind, 400);
}

const ROUTE_BACKSTOP_MS = 15000;
const routeLinks = () => {
  try { return Array.from(document.querySelectorAll('link[rel="stylesheet"][data-route][media="print"]')); } catch (_) { return []; }
};
function ensureRouteCss(id) {
  let n = 0;
  for (const l of routeLinks()) if (id == null || l.dataset.route.split(" ").includes(id)) { l.media = "all"; n++; }
  return n;
}
function watchRouteCss() {
  if (typeof document === "undefined" || !document.documentElement || typeof MutationObserver !== "function") return null;
  const links = routeLinks();
  if (!links.length) return null;
  const ids = new Set(links.flatMap((l) => l.dataset.route.split(" ")));
  const shown = (el) => !!el && ids.has(el.id) && (!el.hidden || el.open === true);
  const flip = (id) => { ids.delete(id); ensureRouteCss(id); if (!routeLinks().length) mo.disconnect(); };
  const mo = new MutationObserver((recs) => { for (const r of recs) if (shown(r.target)) flip(r.target.id); });
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["hidden", "open"] });
  for (const el of Array.from(document.querySelectorAll([...ids].map((id) => "#" + id).join(",")))) if (shown(el)) flip(el.id);
  setTimeout(() => scheduleIdle(() => { ensureRouteCss(); mo.disconnect(); }, 4000), ROUTE_BACKSTOP_MS);
  return mo;
}
watchRouteCss();
bootDevPanels();
mountBridgeLinkDoor();
return { bootPerfRig, ensurePerfRig, openBridgeLink, ensureGarageExterior, SCENERY_DIR, CIRCUITS_DIR, sceneryResident, circuitResident, raceAssets, ensureCircuit, ensureScenery, ensureTrackBuild, trackBuildResident, ensureDataHub, ensureRealRace, ensureNet, ensureAudio, ensureRaceSession, ensureLightPresets, ensureGarageData, ensureResultsSheet, ensureRouteCss, wantAgentSurface, loadAgentSurface, bootAgentSurface, bootDesktopAudio, awaitPackSettled };
}
  let live = null;
  return { create: (deps) => (live = create(deps)), live: () => live };
})();
Object.freeze(LazyBundles);
