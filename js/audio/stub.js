/* Apex 26 — audio stub for the title script wall.
   Real modules are LAZY_AUDIO (tools/manifest.cjs); ensureAudio() loads them
   and reassigns these bindings via top-level `var`. Menus must not throw.
   One file, many globals on purpose — MULTI_GLOBAL + SHARED_GLOBALS (cap 2)
   in tests/unit/global-registry.test.mjs document the reinjection pair. */
"use strict";

var GameAudio = (function () {
  // platform-session.js registers its "the platform took the audio" pause at
  // wireLifecycle — on THIS stub. Held here so ensureAudio can hand it to the
  // real engine (js/core/lazy-bundles.js restoreOnEngine).
  let interrupted = null;
  function noop() { return undefined; }
  function noop0() { return 0; }
  function noopStr() { return ""; }
  function noopObj() { return {}; }
  return {
    _stub: true,
    onInterrupted: (fn) => { interrupted = typeof fn === "function" ? fn : null; },
    _interruptHook: () => interrupted,
    init: noop, setEnabled: noop, setSfxEnabled: noop, setUiEnabled: noop,
    setMusicEnabled: noop, setMusicVolume: noop0, setSfxVolume: noop0,
    setMusicSource: noopStr, musicSource: noopStr, setMusicBackend: noop,
    musicBackend: noop, setSessionType: noop, profile: () => "team",
    sourceCounts: () => ({ builtin: 0, user: 0 }),
    setRadioFx: noop, radioFxLevel: noop0, setRadioPreset: noop,
    setRadioDuck: noop, radioLeadS: noop0, radioSting: noop, radioStingStop: noop,
    startMusic: noop, stopMusic: noop, startEngine: noop, stopEngine: noop,
    startRain: noop, stopRain: noop, setEngine: noop, setSkid: noop,
    setRivals: noop, setGridIdle: noop, feedReplayScrub: noop, syncReplayRpms: noop, resetReplayScrub: noop, setVoice: noop, setVenue: noop,
    setCameraMix: noop, setCarSfx: noop, brakeCue: noop, shift: noop,
    collision: noop, penalty: noop, finish: noop, lap: noop, offtrack: noop,
    rumble: noop, lightOn: noop, lightsOut: noop, deployBoost: noop,
    overtakeReady: noop, xMode: noop, thunder: noop, uiTick: noop,
    uiSelect: noop, uiReject: noop, driveBrakeTone: noop, cornerCall: noop,
    volumes: noopObj, tuneDefaults: noopObj, layerDefaults: noopObj,
    setTune: noop, ensure: noop, skipTrack: noop, prevTrack: noop,
    // Playlist API — real engine replaces these; stub must not throw if a
    // menu row or test races ahead of ensureAudio().
    playTrackId: () => false, currentTrackId: () => null, trackName: noopStr,
    tracks: () => [], addTracks: noop, removeTrack: noop,
  };
})();

var GameAudioSignal = { create: () => ({}), resetContext: function () {} };
var GameAudioSoundtrack = { create: () => ({}) };
var GameAudioRadioFx = { create: () => ({}), resetContext: function () {} };
var GameAudioToneModel = { patchTune: function () {}, nameForTune: function () { return ""; } };
var CarSfx = { create: () => ({ update: function () {}, levels: () => ({}), pitGuns: function () {} }) };
var RivalAudio = { create: () => ({ collect: () => [] }) };
var VoicePack = { create: () => null };
var RecordedAnnouncer = { create: () => ({ play: () => false, stop: function () {} }) };
var DrivingCues = {
  create: function () {}, tick: function () {}, setLevel: function () {},
  labelOf: (v) => (v <= 1 ? "OFF" : "CUES " + v),
};
var RadioVoice = (function () {
  function inert() {
    return {
      stop: function () {}, speak: () => false, say: function () {}, halt: function () {},
      prepare: function () {}, unlock: function () {}, enabled: () => false, setEnabled: function () {},
      setVolume: function () {}, volume: () => 0, pack: null, packOn: () => false,
      announcerPackOn: () => false, current: function () {}, tick: function () {},
    };
  }
  return {
    SPEAKERS: { radio: "radio", control: "control", coach: "coach", announcer: "announcer" },
    inert, create: () => inert(),
    plan: () => ({}), speakable: () => true, estimate: () => 0,
  };
})();
var Announcer = (function () {
  function inert() {
    return {
      play: () => false, stop: function () {}, enabled: () => false,
      setEnabled: function () {}, setVoice: function () {}, prepare: function () {},
      wrapUp: function () {}, readMs: () => 0,
    };
  }
  return {
    inert, create: () => inert(),
    script: () => "", rows: () => [],
  };
})();
var AudioPanel = {
  create: function (G) {
    const { els, store } = G;
    function setSound(b) {
      G.soundOn = b; store.set("sound", b);
      if (els.soundbtn) {
        els.soundbtn.textContent = b ? "♪ SOUND ON" : "♪ SOUND OFF";
        els.soundbtn.setAttribute("aria-pressed", b ? "true" : "false");
      }
      if (typeof GameAudio !== "undefined" && GameAudio.setEnabled) GameAudio.setEnabled(b);
    }
    if (els && els.soundbtn) {
      els.soundbtn.onclick = () => {
        const next = !G.soundOn;
        // game.js sets AudioPanel._ensure = ensureAudio while the stub is resident.
        const ensure = AudioPanel._ensure;
        if (typeof ensure === "function") {
          ensure().then(() => { setSound(next); if (next && GameAudio.init) GameAudio.init(); });
        } else setSound(next);
      };
    }
    return { init: function () {}, _stub: true, setSound };
  },
};
