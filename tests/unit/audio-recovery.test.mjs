// audio-recovery.test.mjs — two ways the soundtrack went silent for good
// (bug hunt 2026-09-26), over the stub AudioContext of audio-sample-upgrade.
//  * a track decodeAudioData refuses (an upload in a format the browser
//    cannot decode — https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata
//    rejects with EncodingError — a 404, offline) never advanced the list;
//  * rain asked for while SOUND EFFECTS was off never started when it came on.
// Plus (2026-09-27): no resume() in a hidden tab, and the game.js unlock/pause wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");
const param = (v) => ({ value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
function boot(opts = {}) {
  const started = [];
  const listeners = {};
  const node = (kind) => { const n = { kind, connect: (t) => t, disconnect() {}, start(...args) { n.startArgs = args; started.push(n); }, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null,
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1), pan: param(0) }; return n; };
  let resumes = 0;
  const contexts = [];
  function createContext() {
    const buffers = [];
    const ctx = { currentTime: 0, state: opts.state || "running", sampleRate: 8000, destination: node("dest"), buffers,
      createGain: () => node("gain"), createBiquadFilter: () => node("biquad"), createOscillator: () => node("osc"), createBufferSource: () => node("src"),
      createDynamicsCompressor: () => Object.assign(node("comp"), { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
      createBuffer: (ch, len, sr) => { const b = { sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }; buffers.push(b); return b; },
      decodeAudioData: (ab, res, rej) => (decoded.push(ab._url || ""), opts.badDecode && opts.badDecode(ab) ? rej(new Error("EncodingError")) : res({ duration: 4, length: 32000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(32000) })),
      resume: () => { resumes++; return Promise.resolve(); }, suspend: () => { ctx.state = "suspended"; return Promise.resolve(); }, close: () => { ctx.state = "closed"; return Promise.resolve(); } };
    if (opts.mediaSource) ctx.createMediaElementSource = (el) => { mediaEls.push(el); return node("mediaEl"); };
    contexts.push(ctx);
    return ctx;
  }
  const fetched = [], decoded = [], mediaEls = [];
  const sb = { Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date: opts.Date || Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn(...a) { if (opts.log) console.log("  Log.warn:", a.join(" ")); }, debug() {}, error() {} },
    document: { addEventListener(type, fn) { listeners[type] = fn; }, hidden: !!opts.hidden }, addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => { if (typeof fn === "function") return setTimeout(fn, ms || 0); return 0; },
    clearTimeout: (id) => { if (id) clearTimeout(id); },
    navigator: opts.userActivation ? { userActivation: opts.userActivation } : {},
    AudioContext: function () { return createContext(); },
    fetch: (url) => { fetched.push(url); const ab = new ArrayBuffer(8); ab.url = url; return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(Object.assign(new ArrayBuffer(/^blob:/.test(url) && opts.bytes || 8), { _url: url })) }); } };
  if (opts.Audio) sb.Audio = opts.Audio;
  if (opts.perf) sb.performance = opts.perf;
  sb.window = sb;
  if (opts.clock) sb.Date = { now: opts.clock };
  const v = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), v);
  vm.runInContext(SRC, v);
  const blipFires = () => vm.runInContext("GameAudioSignal.blipFireTotal()", v);
  const deviceListeners = {};
  if (opts.mediaDevices !== false) {
    sb.navigator.mediaDevices = {
      addEventListener(type, fn) { if (type === "devicechange") deviceListeners[type] = fn; },
      removeEventListener() {},
    };
  }
  return {
    A: vm.runInContext("GameAudio", v), started, fetched, decoded, mediaEls, resumes: () => resumes, contexts,
    document: sb.document, listeners, blipFires, sandbox: sb,
    fireDeviceChange: () => { if (deviceListeners.devicechange) deviceListeners.devicechange(); },
  };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test("switching external music backends stops the outgoing player before starting the replacement", async () => {
  const { A } = boot();
  A.init(); await flush();
  const calls = [];
  const backend = (id) => ({ setVolume() {}, start() { calls.push(id + ":start"); }, stop() { calls.push(id + ":stop"); } });
  const first = backend("spotify"), second = backend("other");
  A.setMusicBackend(first);
  A.setMusicBackend(first);
  assert.deepEqual(calls, ["spotify:start"], "reselecting a source does not interrupt it");
  A.setMusicBackend(second);
  assert.deepEqual(calls, ["spotify:start", "spotify:stop", "other:start"]);
  A.setMusicBackend(null); await flush();
  assert.equal(calls.at(-1), "other:stop");
  assert.equal(A.currentTrackId(), "builtin:menu", "the local soundtrack resumes");
  A.stopMusic();
  assert.equal(calls.filter((c) => c.endsWith(":stop")).length, 2, "no outgoing player is orphaned");
});

test("a rejected outgoing backend stop does not prevent switching music sources", async () => {
  const { A } = boot();
  A.init(); await flush();
  A.setMusicBackend({ setVolume() {}, start() {}, stop() { return Promise.reject(new Error("device unavailable")); } });
  A.setMusicBackend(null); await flush();
  assert.equal(A.currentTrackId(), "builtin:menu");
});

test("empty MY TRACKS stays silent across resume, music toggles, and backend removal", async () => {
  const { A, fetched } = boot();
  A.init(); await flush();
  A.addTracks([{ id: "user:last", name: "last", url: "blob:last" }]);
  A.setMusicSource("user"); A.startMusic(); await flush();
  assert.equal(A.currentTrackId(), "user:last");
  A.removeTrack("user:last");
  const before = fetched.length;
  for (const resume of [
    () => A.startMusic(),
    () => { A.setMusicEnabled(false); A.setMusicEnabled(true); },
    () => { A.setMusicBackend({ setVolume() {}, start() {}, stop() {} }); A.setMusicBackend(null); },
  ]) {
    resume(); await flush();
    assert.equal(A.musicSource(), "user");
    assert.equal(A.currentTrackId(), null);
    assert.equal(fetched.length, before, "no builtin track is fetched as a fallback");
  }
  A.addTracks([{ id: "user:new", name: "new", url: "blob:new" }]);
  A.startMusic(); await flush();
  assert.equal(A.currentTrackId(), "user:new", "a new eligible upload restores playback");
});

test("a context rebuild replaces cached noise and keeps the delayed sample fallback", async () => {
  let now = 10000;
  class ClockDate extends Date { static now() { return now; } }
  const { A, started, contexts } = boot({ Date: ClockDate });
  A.setMusicEnabled(false);
  A.setUiEnabled(false);
  A.init(); await flush(); A.startEngine();
  assert.equal(A.debug().usingSamples, true);
  const old = contexts[0];
  const oldBuffers = new Set(old.buffers);
  old.state = "interrupted";
  A.init();                 // first trusted gesture attempts resume
  now += 1000;
  A.init();                 // a later gesture rebuilds the still-stalled context
  assert.equal(contexts.length, 2);
  assert.equal(old.state, "closed");
  assert.equal(A.uiEnabled(), false, "context replacement preserves upstream menu-sound preference");
  const fresh = contexts[1];
  const noise = started.filter((n) => n.kind === "src" && n.loop && fresh.buffers.includes(n.buffer) && n.buffer.duration < 1);
  assert.equal(noise.length, 6);
  assert.equal(new Set(noise.map((n) => n.buffer)).size, 6);
  assert.ok(fresh.buffers.every((b) => !oldBuffers.has(b)), "all prepared PCM belongs to the new context");
  assert.equal(A.debug().engineOn, true);
  assert.equal(A.debug().usingSamples, false, "the new context starts on the synth while decoding is pending");
  const buffers = fresh.buffers.length;
  await flush();
  A.setEngine(0.6, 0, false, 0.6, 4, {});
  assert.equal(A.debug().usingSamples, true);
  // +1: the decode keeps only the engine's 2 s loop window, a createBuffer copy (perf-memory M-5a).
  assert.equal(fresh.buffers.length, buffers + 1, "new-context upgrade also reuses its prepared noise");
  assert.equal(fresh.buffers[fresh.buffers.length - 1].duration, 2, "and the one new buffer is that loop window");
  assert.ok(started.filter((n) => n.kind === "src" && n.loop && fresh.buffers.includes(n.buffer)).every((n) => !oldBuffers.has(n.buffer)));
});

test("hiding resumes a track from its position; an explicit stop starts it fresh", async () => {
  const { A, started, fetched, contexts, document, listeners } = boot();
  A.init(); A.startMusic(); await flush();
  const ctx = contexts[0];
  const musicSources = () => started.filter((n) => n.kind === "src" && !n.loop);
  assert.equal(musicSources().at(-1).startArgs[1], 0);
  ctx.currentTime = 1.25;
  document.hidden = true; listeners.visibilitychange(); await flush();
  assert.equal(ctx.state, "suspended");
  document.hidden = false; listeners.visibilitychange(); await flush();
  assert.equal(musicSources().at(-1).startArgs[1], 1.25, "hide carries the soundtrack resume position across teardown");
  assert.equal(fetched.filter((url) => /music/.test(url)).length, 1, "show reuses the decoded buffer");
  A.stopMusic(); A.startMusic(); await flush();
  assert.equal(musicSources().at(-1).startArgs[1], 0, "a deliberate stop discards the resume position");
});

test("gesture recovery clears the soundtrack cache and restores the running track", async () => {
  let clock = 1000;
  const { A, fetched, contexts } = boot({ clock: () => clock });
  A.init(); A.startMusic(); await flush();
  A.playTrackId("builtin:song3"); await flush();
  const generation = A.ctxGen();
  const ctx = contexts[0];
  ctx.state = "interrupted";
  A.init(); await flush();
  clock += 1000;
  A.init(); await flush();
  assert.equal(A.ctxGen(), generation + 1, "a later gesture rebuilds the stalled context");
  assert.equal(A.currentTrackId(), "builtin:song3", "the soundtrack remembers its playlist position");
  assert.equal(fetched.filter((url) => /song3/.test(url)).length, 2, "the replacement context decodes its own buffer");
});


test("turning SOUND EFFECTS on mid-race starts the rain the race asked for", async () => {
  const { A, started } = boot();
  A.init(); await flush();
  A.setSfxEnabled(false);
  A.startEngine();
  A.startRain();
  const before = started.filter((n) => n.kind === "src" && n.loop).length;
  A.setSfxEnabled(true);
  await flush();
  assert.equal(started.filter((n) => n.kind === "src" && n.loop).length - before, 1);
});

test("a track that cannot be decoded moves the playlist on instead of going silent", async () => {
  const { A, started, fetched } = boot({ badDecode: (ab) => /song3/.test(ab._url || "") });
  A.init(); await flush();
  A.playTrackId("builtin:song3"); await flush();
  assert.ok(fetched.some((u) => /song4/.test(u)), "the next track is fetched");
  assert.ok(started.some((n) => n.kind === "src" && !n.loop), "and it plays");
  assert.notEqual(A.currentTrackId(), "builtin:song3");
});

test("a playlist where nothing decodes stops rather than spinning", async () => {
  const { A, fetched } = boot({ badDecode: () => true });
  A.init(); await flush();
  A.playTrackId("builtin:song3"); await flush();
  const n = fetched.filter((u) => /music/.test(u)).length;
  await flush();
  assert.equal(fetched.filter((u) => /music/.test(u)).length, n, "no further fetches once every track has failed");
});

test("a dead MY TRACKS list stops after one pass over ITS tracks, not the whole library", async () => {
  // The failure cap was PLAYLIST.length (6 builtins + uploads) while nextTrack
  // cycles only the selected source: two dead uploads were re-fetched and
  // re-decoded four times each before the player went silent.
  const { A, fetched } = boot({ badDecode: (ab) => /dead/.test(ab._url || "") });
  A.init(); await flush();
  assert.equal(A.addTracks([{ id: "user:a", name: "a", url: "blob:dead-a" }, { id: "user:b", name: "b", url: "blob:dead-b" }]), 2);
  assert.equal(A.setMusicSource("user"), "user");
  A.playTrackId("user:a"); await flush(); await flush();
  const dead = fetched.filter((u) => /dead/.test(u));
  assert.equal(dead.length, 2, "each dead upload is tried once: " + dead.join(", "));
  assert.equal(A.currentTrackId(), null, "and the music stops");
});

test("a race started in a HIDDEN tab never wakes the context the hide path suspended", async () => {
  // The flyby timer (js/ui/loading-screen.js) can land startRaceBody in a
  // background tab: createCtx and playIndex used to ctx.resume() regardless.
  const hid = boot({ state: "suspended", hidden: true });
  hid.A.setEnabled(true); hid.A.setMusicEnabled(true);
  hid.A.init(); hid.A.startMusic(0); await flush();
  assert.equal(hid.resumes(), 0, "no resume() while document.hidden — onVisibility's show branch owns it");
  const vis = boot({ state: "suspended" });
  vis.A.setEnabled(true); vis.A.setMusicEnabled(true);
  vis.A.init(); vis.A.startMusic(0); await flush();
  assert.ok(vis.resumes() > 0, "a visible page still resumes inside the gesture");
});

test("game.js wiring: keyboard unlocks audio, a hidden-tab start pauses, resume restores music + rain", () => {
  const g = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8") + fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  // keydown is activation-triggering (html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event); Escape is not.
  assert.match(g, /const GESTURE_EVTS = \["pointerdown", "pointerup", "touchend", "keydown", "click"\];/);
  assert.match(g, /if \(gestured \|\| !isActivation\(e\)\) return;/);
  // The one-shot fires only on an ACTIVATION-triggering event (same spec link): a
  // finger's pointerdown is not one, and spending the gesture on it left WebKit's
  // speech engine unprimed — every phone flyby / radio / race-control line silent.
  const src = g.slice(g.indexOf("function isActivation(e) {"), g.indexOf("function onFirstGesture(e) {"));
  const isActivation = new Function(src + "; return isActivation;")();
  const cases = [
    [{ type: "pointerdown", pointerType: "touch" }, false, "a finger's pointerdown is NOT activation"],
    [{ type: "pointerdown", pointerType: "pen" }, false, "nor a pen's"],
    [{ type: "pointerdown", pointerType: "mouse" }, true, "a mouse's is"],
    [{ type: "pointerup", pointerType: "touch" }, true, "touch activates on pointerup"],
    [{ type: "pointerup", pointerType: "mouse" }, false, "a mouse already activated on pointerdown"],
    [{ type: "touchend" }, true, "touchend"],
    [{ type: "click" }, true, "click"],
    [{ type: "keydown", key: "a" }, true, "a key"],
    [{ type: "keydown", key: "Escape" }, false, "but not Escape"],
  ];
  for (const [e, want, why] of cases) assert.equal(isActivation(e), want, why);
  assert.match(g, /for \(const t of GESTURE_EVTS\) document\.addEventListener\(t, onFirstGesture, true\);/);
  const body = g.slice(g.indexOf("async function startRaceBody()"), g.indexOf("const sessionEntry = SessionEntry.create();"));
  assert.match(body, /if \(document\.hidden\) setPaused\(true, "hidden-tab"\);\n\}\s*$/, "the hidden check is the LAST thing, after the audio starts it stops");
  const sp = g.slice(g.indexOf("function setPaused(p, why) {"), g.indexOf("els.pausebtn.onclick = () => setPaused(true);"));
  assert.match(sp, /if \(p\) \{ GameAudio\.stopEngine\(\); GameAudio\.setSkid\(0\); GameAudio\.stopRain\(\); radioVoice\.halt\(\);/,
    "pause stops rain with the engine — rain rides the SFX bus and must not hiss over a frozen race");
  assert.match(sp, /else if \(soundOn\) \{[^\n]*GameAudio\.startEngine\(\); GameAudio\.startMusic\(trackIdx\); if \(isRaining\(\)\) GameAudio\.startRain\(\); \}/,
    "SOUND turned on under the pause card (js/audio/panel.js defers) gets music and rain back on RESUME");
  assert.match(g, /go\.addEventListener\("animationend", qGoShakeEnd, \{ once: true \}\)/, "one named handler, not a closure per rejected press");
  assert.match(g, /function tiltSay\(msg\) \{ els\.audiostate\.textContent = msg; if \(msg\) announce\(/, "tilt fallbacks reach the banner, not only the title line");
  assert.match(g, /CamTune\.buzzAmp\(spV, player\.deploying, camComfort\(\), _buzzWet\)/, "REDUCE MOTION / XR comfort drops the onboard speed buzz via CamTune.buzzAmp");
  assert.match(g, /_vantExtra\.reduceMotion = camComfort\(\);/, "…and the kerb shiver (js/camera/vantage.js)");
  assert.match(g, /CamTune\.shakeOffset\(shake, camComfort\(\)\)/, "collision shake also goes through CamTune (comfort bob)");
  assert.match(g, /CamTune\.rollTarget\(roadCamRoll, camSlipSm/, "horizon lean goes through CamTune (comfort rollLean)");
});

// MENU SOUNDS (apex26.menuSfx) and ONE CLICK, ONE SOUND: the track tile once
// played uiSelect then tickUi's uiTick — two blips for one tap.
test("ui blips: one per click, and MENU SOUNDS OFF silences them without touching SFX", async () => {
  // Blip voices are pooled (OscillatorNode starts once); fire count is the
  // observable, not createOscillator / start().
  const clock = { t: 1000 };
  const { A, started, blipFires } = boot({ perf: { now: () => clock.t } });
  A.init(); await flush();
  let n = blipFires();
  A.uiSelect(); A.uiTick();
  assert.equal(blipFires() - n, 1, "a second ui blip on the same click is dropped");
  clock.t += 200; n = blipFires();
  A.uiTick();
  assert.equal(blipFires() - n, 1, "the next click still sounds");
  A.setUiEnabled(false); clock.t += 200; n = blipFires();
  A.uiTick(); A.uiSelect(); A.uiReject();
  assert.equal(blipFires() - n, 0, "MENU SOUNDS OFF");
  assert.equal(A.uiEnabled(), false);
  A.lap();
  assert.ok(blipFires() - n > 0, "race sfx are not menu sounds");
  assert.ok(started.filter((n) => n.kind === "osc").length <= 8,
    "pooled blip oscillators stay within the voice cap");
});

// ── uploads and PCM (2026-10-04) ───────────────────────────────────────────
// music-lib caps an upload at 25 MB of BYTES; decoded, that is up to ~1.26 GB
// of Float32 (64 kbps Opus, ~55 min). Desktop decoded every upload in full.
// A stub <audio>: `duration` is what loadedmetadata reports for any src.
function fakeAudio(duration) {
  const made = [];
  function Audio() {
    const el = { preload: "", currentTime: 0, duration: NaN, onloadedmetadata: null, onerror: null, onended: null, onplaying: null,
      _src: "", pause() {}, load() {}, removeAttribute() { el._src = ""; }, play() { return Promise.resolve(); } };
    Object.defineProperty(el, "src", { get: () => el._src, set(v) {
      el._src = v; el.duration = duration;
      Promise.resolve().then(() => { if (el.onloadedmetadata) el.onloadedmetadata(); });
    } });
    made.push(el);
    return el;
  }
  Audio.made = made;
  return Audio;
}
const UPLOAD = { id: "user:7", name: "dj mix", url: "blob:apex/7" };

test("an upload streams through the media element on desktop, never through decodeAudioData", async () => {
  const Audio = fakeAudio(3300);
  const { A, fetched, decoded, mediaEls } = boot({ Audio, mediaSource: true });
  A.init(); await flush();
  A.addTracks([UPLOAD]);
  assert.equal(A.playTrackId(UPLOAD.id), true);
  await flush();
  assert.equal(mediaEls.length, 1, "the upload plays through createMediaElementSource");
  assert.equal(mediaEls[0].src, UPLOAD.url);
  assert.ok(!fetched.includes(UPLOAD.url) && !decoded.includes(UPLOAD.url), "and its bytes are never fetched for a full decode");
  assert.equal(A.currentTrackId(), UPLOAD.id);
});

test("the shipped tracks still decode on desktop next to a streamed upload", async () => {
  const { A, decoded } = boot({ Audio: fakeAudio(200), mediaSource: true });
  A.init(); await flush();
  A.addTracks([UPLOAD]);
  A.playTrackId("builtin:song3"); await flush();
  assert.ok(decoded.some((u) => /song3/.test(u)), "the A/B default for builtins is unchanged on desktop");
});

test("without streaming, an upload longer than the cap is refused before it decodes", async () => {
  // A media element exists but cannot be routed into the context, so the
  // decode path is the fallback; the file's own metadata says 55 minutes.
  const { A, fetched, decoded } = boot({ Audio: fakeAudio(3300) });
  A.init(); await flush();
  A.addTracks([UPLOAD]);
  A.setMusicSource("user");
  A.playTrackId(UPLOAD.id); await flush();
  assert.ok(fetched.includes(UPLOAD.url), "precondition: the decode path fetched it");
  assert.ok(!decoded.includes(UPLOAD.url), "a 55-minute upload must not reach decodeAudioData");
  assert.equal(A.currentTrackId(), null, "the only eligible track failed: the list stops instead of looping on it");
});

test("without streaming, a song-length upload still decodes and plays", async () => {
  const { A, decoded } = boot({ Audio: fakeAudio(240) });
  A.init(); await flush();
  A.addTracks([UPLOAD]);
  A.playTrackId(UPLOAD.id); await flush();
  assert.ok(decoded.includes(UPLOAD.url), "four minutes is within the cap");
  assert.equal(A.currentTrackId(), UPLOAD.id);
});

test("with no media element at all, the cap falls back to the file size", async () => {
  // 20 MB at the 128 kbps estimate is ~22 min: refused. 2 MB (~2 min): decoded.
  let r = boot({ bytes: 20 * 1024 * 1024 });
  r.A.init(); await flush();
  r.A.addTracks([UPLOAD]); r.A.playTrackId(UPLOAD.id); await flush();
  assert.ok(!r.decoded.includes(UPLOAD.url), "a 20 MB upload is too long to decode by its size");
  r = boot({ bytes: 2 * 1024 * 1024 });
  r.A.init(); await flush();
  r.A.addTracks([UPLOAD]); r.A.playTrackId(UPLOAD.id); await flush();
  assert.ok(r.decoded.includes(UPLOAD.url), "a 2 MB upload decodes");
});

// SOUND OFF -> ON mid-race restarts the rain from the LIVE weather. panel.js
// keyed it off G.raceWeather (the grid's weather), so a dry race the weather arc
// turned wet came back with no rain after a SOUND toggle, and a wet race that
// dried out came back raining. Every other startRain caller asks isRaining().
const DEVICE_REBUILD_DEBOUNCE_MS = 280;

test("devicechange debounces to one context rebuild and restores the camera mix", async () => {
  let now = 5000;
  class ClockDate extends Date { static now() { return now; } }
  const { A, contexts, fireDeviceChange } = boot({ Date: ClockDate, userActivation: { isActive: true, hasBeenActive: true } });
  A.init(); await flush();
  A.setCameraMix("helmet");
  assert.equal(A.cameraMix().kind, "onboard");
  A.setTune({ reverb: 0.42 });
  const gen0 = A.ctxGen();
  for (let i = 0; i < 5; i++) fireDeviceChange();
  now += DEVICE_REBUILD_DEBOUNCE_MS + 50;
  await new Promise((r) => setTimeout(r, DEVICE_REBUILD_DEBOUNCE_MS + 40));
  await flush();
  assert.equal(contexts.length, 2, "one rebuild after a burst of devicechange events");
  assert.equal(A.ctxGen(), gen0 + 1);
  assert.equal(A.cameraMix().kind, "onboard", "camera mix re-applied on the new context");
  assert.equal(A.tune().reverb, 0.42, "tune / cue trims re-applied on the new context");
});

test("devicechange without sticky user activation defers rebuild until the next gesture", async () => {
  let now = 8000;
  class ClockDate extends Date { static now() { return now; } }
  const { A, contexts, fireDeviceChange } = boot({
    Date: ClockDate,
    userActivation: { isActive: false, hasBeenActive: false },
  });
  A.init(); await flush();
  const gen0 = A.ctxGen();
  fireDeviceChange();
  now += DEVICE_REBUILD_DEBOUNCE_MS + 50;
  await new Promise((r) => setTimeout(r, DEVICE_REBUILD_DEBOUNCE_MS + 40));
  await flush();
  assert.equal(contexts.length, 1, "no rebuild without user activation");
  assert.equal(A.ctxGen(), gen0);
  A.init(); await flush();
  assert.equal(contexts.length, 2, "gesture performs the deferred rebuild");
});

test("init does not throw when navigator.mediaDevices is absent", async () => {
  const { A } = boot({ mediaDevices: false });
  assert.doesNotThrow(() => A.init());
  await flush();
});

test("the SOUND toggle restarts rain from the live weather, not the grid's raceWeather", () => {
  const panel = fs.readFileSync(path.join(ROOT, "js/audio/panel.js"), "utf8");
  const on = panel.slice(panel.indexOf('else if ((G.state === "race" || G.state === "count") && !G.paused) {'));
  const block = on.slice(0, on.indexOf("syncAudioPanel();"));
  assert.match(block, /GameAudio\.startEngine\(\);/, "precondition: found the mid-race SOUND ON block");
  assert.doesNotMatch(block, /raceWeather/, "the grid's weather does not describe a race the arc has turned");
  assert.match(block, /if \(G\.isRaining\(\)\) GameAudio\.startRain\(\);/);
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /\bisRaining: \(\) => isRaining\(\),/, "G.isRaining is exported to the panel");
});
