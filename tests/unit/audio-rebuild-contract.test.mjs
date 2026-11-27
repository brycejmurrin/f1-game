// audio-rebuild-contract.test.mjs — #7252: one rebuild = one signal.resetContext, one detach + one
// re-attach of each ctx-bound layer (Ers, Crowd, Rivals), and a battle cue cannot hold an old-clock `end`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { absSrc } from "../helpers/abs-src.mjs";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");
const param = (v) => ({ value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect: (t) => t, disconnect() {}, start() {}, stop() {}, gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1), pan: param(0) });
function boot() {
  const contexts = [];
  const mk = () => {
    const c = { currentTime: 0, state: "running", sampleRate: 8000, destination: node(),
      createGain: node, createBiquadFilter: node, createOscillator: node, createWaveShaper: node, createBufferSource: node,
      createDynamicsCompressor: () => Object.assign(node(), { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
      createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
      decodeAudioData: (ab, res) => res({ duration: 1, length: 8000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(8000) }),
      resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => { c.state = "closed"; return Promise.resolve(); } };
    contexts.push(c); return c;
  };
  const calls = { reset: 0 };
  const layer = (name) => { calls[name] = { attach: 0, detach: 0 }; return { attach() { calls[name].attach++; }, detach() { calls[name].detach++; }, setMix() {}, silence() {}, sprayAhead: () => 0, idle() {} }; };
  const sb = { Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, navigator: {}, AudioContext: function () { return mk(); }, fetch: () => Promise.reject(new Error("offline")),
    ErsLayer: layer("ers"), CrowdAudio: layer("crowd"), RivalAudio: layer("rivals") };
  sb.window = sb;
  const v = vm.createContext(sb);
  sb.__calls = calls;
  for (const f of ["js/core/mat4.js", "js/audio/tone-model.js"]) vm.runInContext(read(f), v, { filename: absSrc(f) });
  // Count signal.resetContext by patching its source (the module is frozen).
  vm.runInContext(read("js/audio/signal.js").replace("resetContext() {", "resetContext() { __calls.reset++;"), v, { filename: absSrc("js/audio/signal.js") });
  for (const f of ["js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/mix-duck.js", "js/ui/platform-session.js", "js/audio/engine.js"]) vm.runInContext(read(f), v, { filename: absSrc(f) });
  return { A: vm.runInContext("GameAudio", v), calls, contexts, v };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test("one rebuild: resetContext once, each of Ers / Crowd / Rivals detached once and re-attached once", async () => {
  const { A, calls, contexts } = boot();
  A.init(); await flush();
  assert.equal(contexts.length, 1);
  const base = { reset: calls.reset, ers: { ...calls.ers }, crowd: { ...calls.crowd }, rivals: { ...calls.rivals } };
  const now = { v: 10000 }; // rebuild via the gesture path: stalled resume, then a later activation
  contexts[0].state = "interrupted";
  const realNow = Date.now; Date.now = () => now.v;
  try { A.init(); now.v += 1000; A.init(); } finally { Date.now = realNow; }
  assert.equal(contexts.length, 2, "exactly one rebuild");
  assert.equal(calls.reset - base.reset, 1, "resetContext once");
  for (const k of ["ers", "crowd", "rivals"]) {
    assert.equal(calls[k].detach - base[k].detach, 1, k + " detached once");
    assert.equal(calls[k].attach - base[k].attach, 1, k + " re-attached once");
  }
});

test("battle-earcon: busy() is false after a rebuild while a cue was active", async () => {
  const src = read("js/audio/battle-earcon.js");
  const sb = { Math, Number, Promise, Array, Set, Object, ArrayBuffer, DataView, document: { addEventListener() {}, getElementById: () => null, hidden: false }, window: { addEventListener() {} }, addEventListener() {} };
  const v = vm.createContext(sb); vm.runInContext(src, v, { filename: absSrc("js/audio/battle-earcon.js") });
  let gen = 1, t = 0;
  const audio = { ctxGen: () => gen, now: () => t, decodeClip: async () => ({ duration: 1 }), enabled: () => true, radioVoicesLive: () => 0,
    radioVoice: () => ({ end: 1e6, stop() {} }) };
  const svc = vm.runInContext("BattleEarcon", v).create(audio);
  assert.equal(await svc.prepare(), true);
  const k = "ahead:closing";
  assert.equal(svc.play(k, 1), true, "cue starts");
  assert.equal(svc.busy(), true);
  gen = 2; t = 0;   // rebuilt context: new generation, near-0 clock
  assert.equal(svc.busy(), false, "old-clock end no longer holds busy");
});
