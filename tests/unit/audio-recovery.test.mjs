// audio-recovery.test.mjs — two ways the soundtrack went silent for good
// (bug hunt 2026-09-26), over the stub AudioContext of audio-sample-upgrade.
//  * a track decodeAudioData refuses (an upload in a format the browser
//    cannot decode — https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata
//    rejects with EncodingError — a 404, offline) never advanced the list;
//  * rain asked for while SOUND EFFECTS was off never started when it came on.
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
  const ctx = { currentTime: 0, state: "running", sampleRate: 8000, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"), createOscillator: () => node("osc"), createBufferSource: () => node("src"),
    createDynamicsCompressor: () => Object.assign(node("comp"), { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res, rej) => (opts.badDecode && opts.badDecode(ab) ? rej(new Error("EncodingError")) : res({ duration: 4, length: 32000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(32000) })),
    resume: () => Promise.resolve(), close: () => Promise.resolve() };
  const fetched = [];
  const sb = { Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn(...a) { if (opts.log) console.log("  Log.warn:", a.join(" ")); }, debug() {}, error() {} },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, AudioContext: function () { return ctx; },
    fetch: (url) => { fetched.push(url); const ab = new ArrayBuffer(8); ab.url = url; return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(Object.assign(new ArrayBuffer(8), { _url: url })) }); } };
  sb.window = sb;
  const v = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), v);
  vm.runInContext(SRC, v);
  return { A: vm.runInContext("GameAudio", v), started, fetched };
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
