// soundtrack-cache.test.mjs — removeTrack must also forget the track's slot in
// the decoded-buffer LRU (round-2 hunt, audio F16). The stale _bufKeys entry kept
// holding one of the MUSIC_CACHE slots, so the next decode evicted a LIVE buffer
// early (a phone's one-slot cache re-decoded the playing song). Harness: the stub
// AudioContext of audio-recovery.test.mjs.
// Run: node --test tests/unit/soundtrack-cache.test.mjs
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

test("removeTrack frees its LRU slot: a live cached buffer is not evicted early", async () => {
  const { A, decoded } = boot();
  A.init(); await flush();
  const [x, y, z] = A.tracks().filter((t) => t.builtin);
  assert.ok(z, "needs three builtin tracks");
  const play = async (t) => { assert.equal(typeof A.playTrackId(t.id), "boolean"); await flush(); };
  await play(x); await play(y); await play(x);        // cache [x, y]; x is the one playing
  const decodes = () => decoded.length;
  const before = decodes();
  assert.ok(A.removeTrack(y.id), "y removed while not playing");
  await play(z);                                      // a third decode: must evict nothing live
  const afterZ = decodes();
  assert.equal(afterZ, before + 1, "z decoded once");
  await play(x);                                      // x was cached and live: no re-decode
  assert.equal(decodes(), afterZ, "x was evicted early by the stale slot of the removed track");
});
