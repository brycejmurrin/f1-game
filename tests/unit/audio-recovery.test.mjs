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
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8").replace(/^const\b/gm, "var");
const param = (v) => ({ value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
function boot(opts = {}) {
  const started = [];
  const node = (kind) => { const n = { kind, connect: (t) => t, disconnect() {}, start() { started.push(n); }, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null,
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1), pan: param(0) }; return n; };
  let resumes = 0;
  const ctx = { currentTime: 0, state: opts.state || "running", sampleRate: 8000, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"), createOscillator: () => node("osc"), createBufferSource: () => node("src"),
    createDynamicsCompressor: () => Object.assign(node("comp"), { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res, rej) => (opts.badDecode && opts.badDecode(ab) ? rej(new Error("EncodingError")) : res({ duration: 4, length: 32000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(32000) })),
    resume: () => { resumes++; return Promise.resolve(); }, close: () => Promise.resolve() };
  const fetched = [];
  const sb = { Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn(...a) { if (opts.log) console.log("  Log.warn:", a.join(" ")); }, debug() {}, error() {} },
    document: { addEventListener() {}, hidden: !!opts.hidden }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, AudioContext: function () { return ctx; },
    fetch: (url) => { fetched.push(url); const ab = new ArrayBuffer(8); ab.url = url; return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(Object.assign(new ArrayBuffer(8), { _url: url })) }); } };
  sb.window = sb;
  const v = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), v);
  vm.runInContext(SRC, v);
  return { A: vm.runInContext("GameAudio", v), started, fetched, resumes: () => resumes };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };


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
  const g = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  // keydown is activation-triggering (html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event); Escape is not.
  assert.match(g, /const GESTURE_EVTS = \["pointerdown", "keydown", "click"\];/);
  assert.match(g, /if \(gestured \|\| \(e\.type === "keydown" && e\.key === "Escape"\)\) return;/);
  assert.match(g, /for \(const t of GESTURE_EVTS\) document\.addEventListener\(t, onFirstGesture, true\);/);
  const body = g.slice(g.indexOf("async function startRaceBody()"), g.indexOf("const sessionEntry = SessionEntry.create();"));
  assert.match(body, /if \(document\.hidden\) setPaused\(true\);\n\}\s*$/, "the hidden check is the LAST thing, after the audio starts it stops");
  const sp = g.slice(g.indexOf("function setPaused(p) {"), g.indexOf("els.pausebtn.onclick = () => setPaused(true);"));
  assert.match(sp, /else if \(soundOn\) \{[^\n]*GameAudio\.startEngine\(\); GameAudio\.startMusic\(trackIdx\); if \(isRaining\(\)\) GameAudio\.startRain\(\); \}/,
    "SOUND turned on under the pause card (js/audio/panel.js defers) gets music and rain back on RESUME");
  assert.match(g, /go\.addEventListener\("animationend", qGoShakeEnd, \{ once: true \}\)/, "one named handler, not a closure per rejected press");
  assert.match(g, /function tiltSay\(msg\) \{ els\.audiostate\.textContent = msg; if \(msg\) announce\(/, "tilt fallbacks reach the banner, not only the title line");
  assert.match(g, /if \(state === "race" && !camComfort\(\) && _buzzWet > 0\.01/, "REDUCE MOTION / XR comfort drops the onboard speed buzz");
  assert.match(g, /_vantExtra\.reduceMotion = camComfort\(\);/, "…and the kerb shiver (js/camera/vantage.js)");
});
