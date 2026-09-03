/* audio-sample-upgrade.test.mjs — the engine voice upgrades to the samples
 * once they decode, instead of running the whole race on the synth.
 *
 * 2026-09-02 bug hunt. `usingSamples` is decided ONCE, in startEngine(); when
 * lights-out beat the decode of f1_engine.mp3 (cold cache on a phone) the race
 * ran its whole distance on the oscillator fallback. setEngine() now restarts
 * the engine once, the first time it sees samples it is not using.
 *
 * js/game/audio.js has no other node harness: this is a fake AudioContext just
 * wide enough for createCtx/startEngine/setEngine/stopEngine (every node is a
 * generic connect/start/stop object with AudioParam-shaped fields). The fetch
 * of the two sample files is held back until the test releases it.
 *
 * Run: node --test tests/unit/audio-sample-upgrade.test.mjs
 *   APEX_AUDIO_SRC=<path> evaluates another copy of audio.js (old-code proof).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_PATH = process.env.APEX_AUDIO_SRC || path.join(ROOT, "js/game/audio.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8").replace(/^const\b/gm, "var");

function param(v) {
  return { value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
           exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
}
function node(counts, kind) {
  counts[kind] = (counts[kind] || 0) + 1;
  return { kind, connect: (t) => t, disconnect() {}, start() {}, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0,
           buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0, getFloatFrequencyData() {},
           gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1) };
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot(extra = {}) {
  const counts = {};
  const held = [];   // fetch resolvers, released by the test
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 8000, destination: node(counts, "dest"),
    createGain: () => node(counts, "gain"), createBiquadFilter: () => node(counts, "biquad"),
    createOscillator: () => node(counts, "osc"), createBufferSource: () => node(counts, "src"),
    createAnalyser: () => node(counts, "analyser"),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, 8000)),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
  Object.assign(sb, extra);
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/game/audio.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { GameAudio, counts, release };
}

test("an engine started on the synth voice upgrades to the samples once they decode", async () => {
  const { GameAudio, counts, release } = boot();
  GameAudio.init();            // creates the context and starts the (held) sample fetch
  GameAudio.startEngine();     // lights-out before the decode finished
  assert.equal(GameAudio.debug().usingSamples, false, "precondition: synth voice, samples not ready");
  GameAudio.setEngine(0.5, 0, false, 0.5, 3, {});
  assert.equal(GameAudio.debug().usingSamples, false, "nothing to upgrade to yet");
  await release();
  assert.equal(GameAudio.debug().samplesReady, true, "precondition: the samples decoded mid-race");
  assert.equal(GameAudio.debug().usingSamples, false, "the decision was made once, at startEngine");
  const srcBefore = counts.src;
  GameAudio.setEngine(0.6, 0, false, 0.6, 4, {});
  assert.equal(GameAudio.debug().usingSamples, true, "the next setEngine must restart the engine on the samples");
  assert.equal(GameAudio.debug().engineOn, true);
  assert.ok(counts.src > srcBefore, "two looping buffer sources were created for the sample voice");
  const srcAfter = counts.src;
  GameAudio.setEngine(0.7, 0, false, 0.7, 5, {});
  GameAudio.setEngine(0.8, 0, false, 0.8, 6, {});
  assert.equal(counts.src, srcAfter, "one restart, not one per frame");
});

test("music PCM cache: a phone keeps only the playing track, desktop the two most recent", async () => {
  // Decoded PCM is ~90 MB per song. The cache bound is the difference between
  // a phone holding one song and holding two; fetch count is the observable
  // (a cache hit never fetches).
  const play = async (isMobile) => {
    let fetches = 0;
    const held = [];
    const fetch = () => { fetches++; return new Promise((res) => held.push(() => res({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))); };
    const { GameAudio } = boot({ fetch, ...(isMobile ? { GLX: { isMobile: true } } : {}) });
    const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
    GameAudio.init(); await release();           // engine samples (2 fetches)
    const base = fetches;
    GameAudio.playTrackId("builtin:menu");  await release();
    GameAudio.playTrackId("builtin:song2"); await release();
    GameAudio.playTrackId("builtin:menu");  await release();   // repeat: hit or miss?
    return fetches - base;
  };
  assert.equal(await play(false), 2, "desktop: the two most recent stay decoded, so the repeat is a cache hit");
  assert.equal(await play(true), 3, "phone: only the playing track is kept, so the repeat re-fetches (and re-decodes)");
});
