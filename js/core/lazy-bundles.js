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
// LAZY_RACE — lighting presets, fetched at idle and again at a race start if that failed.
const RACE_FILES = ApexRoster.LAZY_RACE;
// LAZY_RACE_SESSION — pit / radio / coach / reliability (~320 KB). Title boots
// the stub; startRace awaits ensureRaceSession(); idle also prefetches so RACE!
// does not pay the whole fetch on the critical path.
const RACE_SESSION_FILES = ApexRoster.LAZY_RACE_SESSION || [];
const RACE_SESSION_EDGES = ApexRoster.LAZY_RACE_SESSION_EDGES || [];
let raceSessionLoad = null;
function raceSessionReady() {
  return typeof PitLane !== "undefined" && PitLane && !PitLane._stub;
}
function ensureRaceSession() {
  if (raceSessionLoad) return raceSessionLoad;
  if (!RACE_SESSION_FILES.length) return Promise.resolve(false);
  if (raceSessionReady()) {
    raceSessionLoad = Promise.resolve(true);
    return raceSessionLoad;
  }
  raceSessionLoad = loadBackendScripts(RACE_SESSION_FILES, RACE_SESSION_EDGES, { strict: true }).then((ok) => {
    if (!ok || !raceSessionReady()) {
      Log.warn("race", "the race-session bundle did not load");
      raceSessionLoad = null;
      return false;
    }
    if (typeof deps.onRaceSessionReady === "function") deps.onRaceSessionReady();
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
  if (lightFailed) ensureLightPresets();   // a race start (or a circuit pick) after a failed presets fetch: try again
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
function ensureScenery(idx) {
  // Path payload before scenery: Tracks.build / buildCenterline need def.path.
  return ensureCircuit(idx).then(() => {
    const def = Tracks.LIST[idx];
    const models = () => sceneryModels(def);
    if (!def || def.scenery || sceneryResident(def.id)) return models().then(() => {});   // def.scenery: an inline closure (a custom circuit) — nothing to fetch
    let p = _sceneryLoads.get(def.id);
    if (!p) {
      p = loadBackendScripts([SCENERY_DIR + "/" + def.id + ".js"], []).then(() => { _sceneryLoads.delete(def.id); });
      _sceneryLoads.set(def.id, p);
    }
    return p.then(models).then(() => {});
  });
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
// GameAudio turns real the moment engine.js evaluates — files ahead of panel.js
// and onAudioReady, where AudioPanel.create restores the saved mixer. Anything
// reading it in that gap saw engine defaults (music 0.5 / sfx 1, master on), and
// the title's LAZY_CIRCUIT + scenery fetches widen it. Restore the persisted
// master and levels (the setters clamp to 0..1) as soon as the engine lands.
let audioRestored = false;
let audioStub = null;   // the title stub, captured before reinjection replaces it
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
    // The key inject() will ask for (content hash when deployed), so the prefetch is the hit.
    const href = typeof ScriptLoader !== "undefined" && ScriptLoader.url ? ScriptLoader.url(src) : src + "?v=" + (window.__APEX_BUILD || 0);
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
  if (typeof GameAudio !== "undefined" && GameAudio && !GameAudio._stub) {
    audioLoad = Promise.resolve(true);
    return audioLoad;
  }
  audioStub = typeof GameAudio !== "undefined" ? GameAudio : null;
  // Approach (b): yield AFTER the title tap so the menu transition paints
  // before LAZY_AUDIO script eval lands on the main thread, then yield again
  // before onAudioReady (panel DOM). restoreOnEngine still runs from each
  // script's onload (ready:) under sticky userActivation — AudioContext is
  // created/resumed the same way as before; awaiting callers still get a
  // fully ready engine when this promise resolves.
  audioLoad = (async () => {
    await audioYieldToMain("paint");
    const ok = await loadBackendScripts(AUDIO_FILES, AUDIO_EDGES, { ready: restoreOnEngine });
    if (!ok || typeof GameAudio === "undefined" || !GameAudio || GameAudio._stub) {
      Log.warn("audio", "the audio bundle did not load — sound stays silent");
      audioLoad = null;
      return false;
    }
    await audioYieldToMain("task");
    if (typeof deps.onAudioReady === "function") deps.onAudioReady();
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
//
// Split (2026-10-06): scenery/circuit leave the boot turn via queueMicrotask
// (not requestIdleCallback — game-vm stubs rIC as a no-op, and a bare first
// build is a different physics world; tools/lib/game-vm.cjs §raceAssets).
// LAZY_RACE lighting (~361 KB) stays on real idle so it does not fight title
// paint for the wire. ensureScenery already awaits ensureCircuit.
// ONE fetch of the presets in flight, and a failed one is forgotten: the loader
// RESOLVES false on an error (offline, a refused stale-build request), so the
// answer is read back from window.LightPresets. Without this the single idle
// attempt below was the only one — one dropped request meant default lighting
// for every race of the session. ensureCircuit re-asks at the next race start
// after a failure (the circuit fetch's own pattern); until one has failed, the
// boot path stays the idle prefetch alone.
let lightLoad = null, lightFailed = false;
function ensureLightPresets() {
  if (window.LightPresets) return Promise.resolve(true);
  if (lightLoad) return lightLoad;
  lightLoad = loadBackendScripts(RACE_FILES, []).catch(() => false).then(() => {
    lightLoad = null;
    lightFailed = !window.LightPresets;
    if (lightFailed) { Log.warn("game", "the lighting presets did not load — the next race start asks again"); return false; }
    deps.applyLightTuneIfReady();
    return true;
  });
  return lightLoad;
}
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
    ensureScenery(deps.getContext().trackIdx);
    // Build worker: warmed at the title for the AGENT SURFACE only (its
    // __apex.race() track switches are what post builds); a player's worker is
    // spawned by the first build actually posted (R3-ASYNC-2, build-client.js).
    if (typeof TrackBuildClient !== "undefined" && TrackBuildClient.idleWarm) {
      try { TrackBuildClient.idleWarm(wantAgentSurface()); } catch (_) { /* warm is best-effort */ }
    }
  };
  if (typeof queueMicrotask === "function") queueMicrotask(kickScenery);
  else Promise.resolve().then(kickScenery);
  scheduleIdle(() => { ensureLightPresets(); }, 2500);
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
