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
// LAZY_RACE — lighting presets, fetched before the first race.
const RACE_FILES = ApexRoster.LAZY_RACE;
// LAZY_RACE_SESSION — pit / radio / coach / reliability (~320 KB). Title boots
// the stub; startRace awaits ensureRaceSession(); idle also prefetches so RACE!
// does not pay the whole fetch on the critical path.
const RACE_SESSION_FILES = ApexRoster.LAZY_RACE_SESSION || [];
const RACE_SESSION_EDGES = ApexRoster.LAZY_RACE_SESSION_EDGES || [];
let raceSessionLoad = null;
// Every module of the group has its own stub (session-stub.js, all `_stub:true`),
// so "this file landed" is "its global is no longer the stub". Probing ONE global
// (PitLane) called a group whose later file failed complete: the retry saw the
// real PitLane, loaded nothing, and the race ran on stub engineer / radio.
const RACE_SESSION_READY = {
  "js/race/reliability.js": () => typeof Reliability !== "undefined" && !!Reliability && !Reliability._stub,
  "js/race/damage.js": () => typeof Damage !== "undefined" && !!Damage && !Damage._stub,
  "js/race/duel.js": () => typeof Duel !== "undefined" && !!Duel && !Duel._stub,
  "js/race/session-records.js": () => typeof SessionRecords !== "undefined" && !!SessionRecords && !SessionRecords._stub,
  "js/race/pit-lane.js": () => typeof PitLane !== "undefined" && !!PitLane && !PitLane._stub,
  "js/race/engineer.js": () => typeof RaceEngineer !== "undefined" && !!RaceEngineer && !RaceEngineer._stub,
  "js/race/radio-lines.js": () => typeof RadioLines !== "undefined" && !!RadioLines && !RadioLines._stub,
  "js/race/race-facts.js": () => typeof RaceFacts !== "undefined" && !!RaceFacts && !RaceFacts._stub,
  "js/race/spotter.js": () => typeof Spotter !== "undefined" && !!Spotter && !Spotter._stub,
  "js/race/race-radio.js": () => typeof RaceRadio !== "undefined" && !!RaceRadio && !RaceRadio._stub,
  "js/race/start-lights.js": () => typeof StartLights !== "undefined" && !!StartLights && !StartLights._stub,
  "js/race/marshal-panels.js": () => typeof MarshalPanels !== "undefined" && !!MarshalPanels && !MarshalPanels._stub,
  "js/race/flying-start.js": () => typeof FlyingStart !== "undefined" && !!FlyingStart && !FlyingStart._stub,
};
// Files that evaluated for real, kept across a failed attempt (the dataScriptsLoaded
// idiom): a retry loads only the rest. The hook runs once, on the transition to complete.
const raceSessionLoaded = new Set();
let raceSessionHooked = false;
function raceSessionReady() {
  return RACE_SESSION_FILES.every((f) => raceSessionLoaded.has(f));
}
function ensureRaceSession() {
  if (raceSessionLoad) return raceSessionLoad;
  if (!RACE_SESSION_FILES.length) return Promise.resolve(false);
  // Real before THIS loader ran anything (an eager shell / a spec that evaluated
  // the group itself): nothing to fetch and nobody to notify.
  if (!raceSessionLoaded.size && RACE_SESSION_READY["js/race/pit-lane.js"]()) {
    raceSessionLoad = Promise.resolve(true);
    return raceSessionLoad;
  }
  raceSessionLoad = loadBackendScripts(RACE_SESSION_FILES, RACE_SESSION_EDGES, {
    strict: true, loaded: raceSessionLoaded,
    ready: (src) => !RACE_SESSION_READY[src] || RACE_SESSION_READY[src](),
  }).then((ok) => {
    if (!ok || !raceSessionReady()) {
      Log.warn("race", "the race-session bundle did not load");
      raceSessionLoad = null;
      return false;
    }
    if (!raceSessionHooked) {
      // The hook is app code (it rebuilds the session modules' instances): a throw
      // here would latch a REJECTED memo and RACE! would fail until reload. Count
      // it as fired only once it returns, so the next call retries it.
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
// LAZY_CIRCUIT (tools/manifest.cjs): full js/circuits/<id>.js payload. Title
// boots with GENERATED meta.js (~picker fields only); path/pal/sectors/kit
// hydrate here before buildCenterline / Tracks.build / TrackMaps.compute.
const CIRCUITS_DIR = ApexRoster.CIRCUITS_DIR || "js/circuits";
const _circuitLoads = new Map();
function circuitResident(def) {
  return !!(typeof Tracks !== "undefined" && Tracks.circuitPayloadResident && Tracks.circuitPayloadResident(def));
}
function ensureCircuit(idx) {
  const def = Tracks.LIST[idx];
  if (!def || circuitResident(def) || def.custom) return Promise.resolve();
  let p = _circuitLoads.get(def.id);
  if (!p) {
    p = loadBackendScripts([CIRCUITS_DIR + "/" + def.id + ".js"], []).then((ok) => {
      _circuitLoads.delete(def.id);
      if (!ok) {
        Log.warn("track", "circuit payload failed to load: " + def.id);
        return false;
      }
      // The authored file pushes onto TrackDefs; find the full raw and hydrate
      // the existing LIST entry in place (SEASON / indexes stay valid).
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
    });
    _circuitLoads.set(def.id, p);
  }
  // Reject when hydrate/load fails so ensureScenery / startRace never build a
  // meta stub (a swallowed false left Tracks.build throwing "has no path").
  return p.then((ok) => {
    if (ok === false || !circuitResident(Tracks.LIST[idx])) {
      throw new Error("circuit payload not resident: " + (def && def.id));
    }
  });
}
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
// One fetch of the closure, shared by every caller in flight. The loader RESOLVES
// false on an error (offline, a CDN 404, a refused stale-build request), so the
// answer is read back from the registry, never from the loader's result.
function fetchScenery(id) {
  let p = _sceneryLoads.get(id);
  if (!p) {
    p = loadBackendScripts([SCENERY_DIR + "/" + id + ".js"], [])
      .catch((e) => { Log.warn("track", "scenery fetch threw: " + id + ": " + (e && e.message)); })
      .then(() => { _sceneryLoads.delete(id); });
    _sceneryLoads.set(id, p);
  }
  return p;
}
// Resolves true once the closure is resident, false when it is not (after ONE
// retry, the ensureCircuit shape): the caller can tell, because Tracks.build()
// of a circuit whose closure never landed is a bare world that the rebuild
// guard (id, night, grid) then keeps for the session. It does not throw — a
// bare world is playable, a rejection at the title is the red overlay.
async function ensureScenery(idx) {
  // Path payload before scenery: Tracks.build / buildCenterline need def.path.
  await ensureCircuit(idx);
  const def = Tracks.LIST[idx];
  if (def && !def.scenery && !sceneryResident(def.id)) {   // def.scenery: an inline closure (a custom circuit) — nothing to fetch
    await fetchScenery(def.id);
    if (!sceneryResident(def.id)) await fetchScenery(def.id);
    if (!sceneryResident(def.id)) {
      Log.warn("track", "scenery closure did not load: " + def.id + " — the world builds bare");
      return false;
    }
  }
  await sceneryModels(def);
  return true;
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
    try { DataHub.init(els.datahub); }
    catch (e) {
      // Post-load app code must not latch a rejected memo: DATA would stay dead
      // until reload. Null it so the next tap retries.
      Log.error("data", "the data hub failed to start: " + (e && e.message));
      dataHubLoad = null;
      return false;
    }
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
// Every net file declares a script-level `const`, so re-injecting one that already
// evaluated throws "Identifier has already been declared" (13 SyntaxErrors and the
// red overlay on a VS FRIEND retry). Same cure as the data hub: remember what
// landed, and only START a dependent once its predecessors really evaluated.
const netScriptsLoaded = new Set();
const NET_READY = {
  "js/net/bytes.js": () => typeof NetBytes !== "undefined",
  "js/net/nostr.js": () => typeof NetNostr !== "undefined",
  "js/net/rendezvous.js": () => typeof NetRendezvous !== "undefined",
  "js/net/sdp.js": () => typeof NetSdp !== "undefined",
  "js/net/qr.js": () => typeof NetQr !== "undefined",
  "js/net/scan.js": () => typeof NetScan !== "undefined",
  "js/net/transport.js": () => typeof NetTransport !== "undefined",
  "js/net/handshake.js": () => typeof NetHandshake !== "undefined",
  "js/net/lobby-codes.js": () => typeof LobbyCodes !== "undefined",
  "js/net/snapshot.js": () => typeof NetSnapshot !== "undefined",
  "js/net/session.js": () => typeof NetSession !== "undefined",
  "js/net/netplay.js": () => typeof NetPlay !== "undefined",
  "js/net/lobby.js": () => typeof NetLobby !== "undefined",
  "js/input/phone-pad.js": () => typeof PhonePad !== "undefined",
};
function ensureNet() {
  if (netLoad) return netLoad;
  netLoad = loadBackendScripts(NET_FILES, NET_EDGES, {
    strict: true, loaded: netScriptsLoaded,
    ready: (src) => !NET_READY[src] || NET_READY[src](),
  }).then((complete) => {
    // A failed group may leave a binding in its temporal dead zone, where even
    // typeof throws: only probe the globals after a complete load.
    if (!complete || typeof NetPlay === "undefined" || typeof NetLobby === "undefined") {
      // inject() resolves on error, so this is the only place a miss shows.
      // Keep the stubs (the game stays playable solo) and null the memo so a
      // second attempt can succeed rather than latching for the session.
      Log.warn("net", "the multiplayer bundle did not load — VS FRIEND unavailable");
      netLoad = null;
      return false;
    }
    try {
      const netLobby = deps.createNetwork();
      // The real lobby binds #vsfriend here — the boot position the stub's inert
      // wire() stood in for. Once, because ensureNet() memoises on the promise.
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

// LAZY_AUDIO (tools/manifest.cjs) — ~449 KB WebAudio engine + panel/voice.
// Title boots the stub; real modules reinject via top-level `var` and
// onAudioReady recreates panel/voice/announcer instances.
const AUDIO_FILES = ApexRoster.LAZY_AUDIO || [];
const AUDIO_EDGES = ApexRoster.LAZY_AUDIO_EDGES || [];
let audioLoad = null;
// GameAudio turns real the moment engine.js evaluates — files ahead of panel.js
// and onAudioReady, where AudioPanel.create restores the saved mixer. Anything
// reading it in that gap saw engine defaults (music 0.5 / sfx 1, master on), and
// the title's LAZY_CIRCUIT + scenery fetches widen it. Restore the persisted
// master and levels (the setters clamp to 0..1) as soon as the engine lands.
let audioRestored = false;
let audioStub = null;   // the title stub, captured before reinjection replaces it
// Which files landed (the raceSessionLoaded idiom): GameAudio turns real the moment
// engine.js evaluates, so testing that one global called a group whose panel.js /
// announcer.js failed complete, and the retry never loaded them. A file counts as
// landed when its global is defined and no longer the title stub's value.
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
  if (!read) return true;   // a file the table does not know: onload is all there is
  const v = read();
  return v !== undefined && v !== null && !v._stub && v !== (audioStubVals && audioStubVals[src]);
}
// game-vm stubs requestIdleCallback as a no-op (tools/lib/game-vm.cjs) and has
// no frame pump. Deferrals that must complete for VM tests skip under that UA
// (same mark startRaceBody uses) so ensureAudio still resolves deterministically.
function audioIsGameVm() {
  return typeof navigator !== "undefined" && /apex-game-vm/.test(navigator.userAgent || "");
}
// Yield so a title-tap menu transition can paint before ~449 KB of LAZY_AUDIO
// eval / onAudioReady DOM work. Skip entirely under the apex-game-vm UA.
function audioYieldToMain(kind) {
  if (audioIsGameVm()) return Promise.resolve();
  // Do NOT wait on rAF here: a GARAGE tap starts WebGL, and software GL
  // ReadPixels stall animation frames for seconds (the hitch we are moving
  // audio *off*). scheduler.yield lets the browser paint + handle input;
  // a trailing setTimeout(0) is the Safari / no-scheduler fallback and a
  // second hop after yield so presentation can commit. Never rIC — game-vm
  // stubs it as a no-op and would hang awaiters.
  const macrotask = () => new Promise((r) => setTimeout(r, 0));
  if (kind === "paint") {
    // One frame of wall time (not rAF): lets the tap's next paint commit
    // before script eval. rAF would wait on garage WebGL; a 0-delay task
    // often resumes at ~2 ms, still inside the same vsync as the click.
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
function prefetchAudio() {
  // HTTP-cache only — do not evaluate. Evaluating at idle would create no
  // AudioContext (restoreOnEngine still gates on userActivation) but would
  // still compete with title paint; #1135 forbids putting these 449 KB on
  // the title networkidle wall, so this runs on a late idle timeout.
  if (audioIsGameVm() || audioLoad) return;
  if (typeof document === "undefined" || !document.createElement) return;
  for (let i = 0; i < AUDIO_FILES.length; i++) {
    const src = AUDIO_FILES[i];
    const href = src + "?v=" + (window.__APEX_BUILD || 0);
    if (document.querySelector && document.querySelector('link[rel="prefetch"][href="' + href + '"]')) continue;
    const el = document.createElement("link");
    el.rel = "prefetch";
    el.as = "script";
    el.href = href;
    el.crossOrigin = "anonymous";
    document.head.appendChild(el);
  }
}
function restoreOnEngine() {
  if (audioRestored || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) return true;
  audioRestored = true;
  const G = deps.getContext(), store = G && G.store;
  if (!store) return true;
  try {
    GameAudio.setEnabled(!!G.soundOn);
    GameAudio.setMusicVolume(store.get("volMusic"));
    GameAudio.setSfxVolume(store.get("volSfx"));
    const radio = G.radio;
    if (radio && radio.setVolume) radio.setVolume(store.get("volRadio", 0.8));
  } catch (e) { Log.warn("audio", "early level restore failed: " + (e && e.message)); }
  // EVERYTHING ELSE BOOT SAID TO THE STUB. PlatformSession.firstGesture ran
  // GameAudio.init() + startMusic(-1) on the noop (the gesture is what pulls
  // this bundle), so no AudioContext existed and the title AND the first race
  // were silent: startEngine/startMusic return without one. The saved camera's
  // mix (mode-switch.js boot call) and the iOS interruption pause hook
  // (platform-session.js) went to the stub as well.
  try {
    const hook = audioStub && audioStub._interruptHook ? audioStub._interruptHook() : null;
    if (hook && GameAudio.onInterrupted) GameAudio.onInterrupted(hook);
    if (typeof CamModes !== "undefined" && CamModes.CAM_MODES && CamModes.CAM_MODES[G.camMode]) GameAudio.setCameraMix(CamModes.CAM_MODES[G.camMode].id);
    const ua = typeof navigator !== "undefined" ? navigator.userActivation : null;
    const desktopShell = typeof Native !== "undefined" && Native.platform() === "desktop";
    if (G.soundOn && (desktopShell || !ua || ua.hasBeenActive)) GameAudio.init();   // AudioPanel.init's setSound then starts the title loop on it
  } catch (e) { Log.warn("audio", "first-gesture replay failed: " + (e && e.message)); }
  return true;
}
function ensureAudio() {
  if (audioLoad) return audioLoad;
  if (!AUDIO_FILES.length) return Promise.resolve(false);
  // Real before THIS loader ran anything (a spec / eager shell evaluated it):
  // nothing to fetch and no hook to run, as before.
  if (!audioScriptsLoaded.size && typeof GameAudio !== "undefined" && GameAudio && !GameAudio._stub) {
    audioLoad = Promise.resolve(true);
    return audioLoad;
  }
  if (!audioStubVals) {   // once: a retry must not mistake a half-loaded real module for the stub
    audioStub = typeof GameAudio !== "undefined" ? GameAudio : null;
    audioStubVals = {};
    for (const f of AUDIO_FILES) if (AUDIO_GLOBAL[f]) audioStubVals[f] = AUDIO_GLOBAL[f]();
  }
  // Approach (b): yield AFTER the title tap so the menu transition paints
  // before LAZY_AUDIO script eval lands on the main thread, then yield again
  // before onAudioReady (panel DOM). restoreOnEngine still runs from each
  // script's onload (ready:) under sticky userActivation — AudioContext is
  // created/resumed the same way as before; awaiting callers still get a
  // fully ready engine when this promise resolves.
  audioLoad = (async () => {
    await audioYieldToMain("paint");
    const ok = await loadBackendScripts(AUDIO_FILES, AUDIO_EDGES, {
      loaded: audioScriptsLoaded,
      ready: (src) => { restoreOnEngine(); return audioFileLanded(src); },
    });
    if (!ok || AUDIO_FILES.some((f) => !audioScriptsLoaded.has(f)) || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) {
      Log.warn("audio", "the audio bundle did not load — sound stays silent");
      audioLoad = null;
      return false;
    }
    if (audioHooked) return true;
    // onAudioReady is counted as fired only once it returns: a throw (it rebuilds
    // panel / voice / announcer instances) clears the memo so the next call
    // retries it, instead of latching a rejection.
    await audioYieldToMain("task");
    if (typeof deps.onAudioReady === "function") try {
      deps.onAudioReady();
    } catch (e) {
      Log.error("audio", "the audio ready hook threw: " + (e && e.message));
      audioLoad = null;
      return false;
    }
    audioHooked = true;
    return true;
  })();
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
// Files that evaluated, kept across a failed attempt so a retry never re-injects a
// script-level const (the dataScriptsLoaded idiom).
const agentScriptsLoaded = new Set();
function loadAgentSurface() {
  if (!_agentLoad) _agentLoad = (async () => {
    // js/net comes WITH the agent surface. apex.js reads NetTransport /
    // NetSession / NetSnapshot at eval-adjacent call sites and drives 22
    // netLobby methods the stub does not carry, so a dev session or a spec that
    // got __apex without the real net would fail on the multiplayer hooks
    // instead of on anything this change is about. Awaited BEFORE apex.js so
    // ApexApi.create(G) sees the real objects through the G getters.
    const netOk = await ensureNet();
    const agentOk = await loadBackendScripts(AGENT_FILES, AGENT_EDGES, { loaded: agentScriptsLoaded });
    deps.bindAgent();
    // Memoised on the promise, but a FAILED load must not latch for the session:
    // METRICS / the flyby panel ask again on their next open.
    if (netOk === false || !agentOk) {
      Log.warn("game", "the agent surface did not fully load — a later ask retries");
      _agentLoad = null;
    }
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
//
// Split (2026-10-06): scenery/circuit leave the boot turn via queueMicrotask
// (not requestIdleCallback — game-vm stubs rIC as a no-op, and a bare first
// build is a different physics world; tools/lib/game-vm.cjs §raceAssets).
// LAZY_RACE lighting (~361 KB) stays on real idle so it does not fight title
// paint for the wire. ensureScenery already awaits ensureCircuit.
function scheduleIdle(fn, timeoutMs) {
  const ms = timeoutMs != null ? timeoutMs : 2000;
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: ms });
  else setTimeout(fn, Math.min(ms, 800));
}
function raceAssets() {
  // Do NOT evaluate LAZY_AUDIO here — that put ~449 KB back on the title
  // networkidle wall (#1135). First pointerdown / SOUND click / Settings /
  // MUSIC & SOUND / startRace still pulls it (startRace awaits ensureAudio
  // before startEngine; openSettings and the audio door also call it).
  // A late idle prefetch fills the HTTP cache only (no eval / no AudioContext).
  const kickScenery = () => {
    // Selected circuit (persisted trackIdx / default): most likely RACE! and
    // the __apex no-track fallback — fetch scenery (and its path payload) here.
    // Best-effort: ensureCircuit REJECTS when the payload cannot load (offline,
    // a CDN 404, a stale tab), and an unguarded rejection here paints the red
    // overlay on the title. startRace / openQuali re-ask and handle their own.
    ensureScenery(deps.getContext().trackIdx).catch((e) => {
      Log.warn("track", "scenery prefetch failed: " + (e && e.message));
    });
    // Opt-in build worker: parse TRACK_VM off the main thread while the menu
    // idles so RACE! does not pay worker importScripts on the critical path.
    if (typeof TrackBuildClient !== "undefined" && TrackBuildClient.idleWarm) {
      try { TrackBuildClient.idleWarm(); } catch (_) { /* warm is best-effort */ }
    }
  };
  if (typeof queueMicrotask === "function") queueMicrotask(kickScenery);
  else Promise.resolve().then(kickScenery);
  scheduleIdle(() => {
    if (window.LightPresets) return;
    loadBackendScripts(RACE_FILES, []).then(() => {
      if (window.LightPresets) deps.applyLightTuneIfReady();
    });
  }, 2500);
  // Prefetch the session stub's real modules on idle so startRace's await is
  // usually a no-op. Do not put them on the title paint path (microtask).
  scheduleIdle(() => { ensureRaceSession(); }, 2800);
  scheduleIdle(() => { prefetchAudio(); }, 4500);
  bootDesktopAudio();
}

function bootDesktopAudio() {
  if (typeof Native === "undefined" || Native.platform() !== "desktop") return;
  const bind = () => {
    ensureAudio().then((ok) => {
      if (!ok) return;
      const G = deps.getContext();
      if (!G || !G.soundOn) return;
      try {
        GameAudio.init();
        if (G.musicEnabled !== false) GameAudio.startMusic(-1);
      } catch (e) { Log.warn("audio", "desktop boot audio bind failed: " + (e && e.message)); }
    });
  };
  // game-vm stubs requestIdleCallback as a no-op — use a microtask so unit tests
  // see the bind without a title gesture. Real Electron still prefers idle paint.
  if (audioIsGameVm()) queueMicrotask(bind);
  else scheduleIdle(bind, 400);
}

return { SCENERY_DIR, CIRCUITS_DIR, sceneryResident, circuitResident, raceAssets, ensureCircuit, ensureScenery, ensureDataHub, ensureNet, ensureAudio, ensureRaceSession, wantAgentSurface, loadAgentSurface, bootAgentSurface, bootDesktopAudio };
}
  return { create };
})();
Object.freeze(LazyBundles);
