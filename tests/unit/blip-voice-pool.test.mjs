/* blip-voice-pool.test.mjs — overrun / UI blips must not allocate a new
 * OscillatorNode + GainNode per pop. Radio round 4 finding 5: lift-and-coast
 * fired blip() at ~5–15 Hz while signal.js built a fresh osc+gain each call.
 * Voices are pooled (OscillatorNode cannot restart after stop()); envelope and
 * frequency math are unchanged.
 *
 * Run: node --test tests/unit/blip-voice-pool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIGNAL_SRC = fs.readFileSync(path.join(ROOT, "js/audio/signal.js"), "utf8")
  .replace(/^const\b/gm, "var");
const ENGINE_SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js",
  "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");

function param(v) {
  const p = {
    value: v,
    setTargetAtTime(x) { p.value = x; },
    setValueAtTime(x) { p.value = x; },
    linearRampToValueAtTime(x) { p.value = x; },
    exponentialRampToValueAtTime(x) { p.value = x; },
    cancelScheduledValues() {},
  };
  return p;
}

function countingContext() {
  const counts = { osc: 0, gain: 0 };
  function node(kind) {
    if (kind === "osc") counts.osc++;
    if (kind === "gain") counts.gain++;
    return {
      kind, connect: (t) => t, disconnect() {}, start() {}, stop() {}, type: "",
      gain: param(1), frequency: param(440), detune: param(0), Q: param(1),
      playbackRate: param(1), buffer: null, loop: false, onended: null,
    };
  }
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
    createGain: () => node("gain"), createOscillator: () => node("osc"),
    createBiquadFilter: () => node("biquad"), createBufferSource: () => node("src"),
    createAnalyser: () => node("analyser"),
    createWaveShaper: () => Object.assign(node("shaper"), { curve: null }),
    createConvolver: () => Object.assign(node("convolver"), { buffer: null }),
    createStereoPanner: () => Object.assign(node("panner"), { pan: param(0) }),
    createDynamicsCompressor: () => Object.assign(node("comp"), {
      threshold: param(-24), knee: param(30), ratio: param(12),
      attack: param(0.003), release: param(0.25),
    }),
    createBuffer: (ch, len, sr) => ({
      sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch,
      getChannelData: () => new Float32Array(len),
    }),
    decodeAudioData: (ab, res) => res({
      sampleRate: 44100, length: 44100 * 4, duration: 4, numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100 * 4),
    }),
    createMediaElementSource: () => node("media"),
    resume: () => Promise.resolve(), close() {},
  };
  return { ctx, counts };
}

function loadSignal(ctx) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap,
    Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(SIGNAL_SRC, vctx, { filename: "js/audio/signal.js" });
  const Signal = vm.runInContext("GameAudioSignal", vctx);
  const api = Signal.create({
    context: () => ctx, bus: () => ctx.destination, sfxOk: () => true, now: () => ctx.currentTime,
  });
  return { Signal, api };
}

test("blip pool: 300 pops allocate at most poolCap oscillators and gains", () => {
  const { ctx, counts } = countingContext();
  const { api } = loadSignal(ctx);
  const before = { osc: counts.osc, gain: counts.gain };
  for (let i = 0; i < 300; i++) {
    ctx.currentTime += 0.016;
    api.blip(90 + (i % 50), "square", 0.05, 0.002, 0.05, 55);
  }
  const oscN = counts.osc - before.osc;
  const gainN = counts.gain - before.gain;
  const stats = api.blipStats();
  assert.equal(stats.fired, 300, "every blip still fires");
  assert.equal(stats.poolCap, 8);
  assert.ok(oscN <= stats.poolCap, `createOscillator bounded: got ${oscN}, cap ${stats.poolCap}`);
  assert.ok(gainN <= stats.poolCap, `createGain bounded: got ${gainN}, cap ${stats.poolCap}`);
  assert.equal(stats.pool, oscN, "pool size matches allocated oscillators");
  // Before the pool: 300 osc + 300 gain (measured on tip pre-fix). After: ≤8.
  assert.ok(oscN < 300 / 10, `regression: osc alloc ${oscN} must be far below one-per-pop`);
});

test("blip pool: envelope and frequency schedule match the one-shot contract", () => {
  const nodes = [];
  function inode(kind) {
    const n = {
      kind, connect(t) { n.out = t; return t; }, disconnect() {}, start(t) { n.startedAt = t; },
      stop() {}, type: "", gain: param(1), frequency: param(440),
    };
    nodes.push(n);
    return n;
  }
  const ictx = {
    currentTime: 2, sampleRate: 44100, destination: inode("dest"),
    createGain: () => inode("gain"), createOscillator: () => inode("osc"),
  };
  const { api } = loadSignal(ictx);
  api.blip(200, "sawtooth", 0.12, 0.01, 0.14, 880, 0.05);
  const osc = nodes.find((n) => n.kind === "osc");
  const g = nodes.find((n) => n.kind === "gain");
  assert.ok(osc && g, "one voice created");
  assert.equal(osc.type, "sawtooth");
  assert.equal(osc.frequency.value, 880, "slideTo lands on frequency (fake param stores last set)");
  assert.equal(g.gain.value, 0.0001, "envelope ends at the near-zero floor");
  assert.equal(osc.startedAt, 0, "pooled oscillator starts once at 0, not per pop");
  // Second pop reuses the same nodes.
  const nBefore = nodes.length;
  ictx.currentTime = 3;
  api.blip(90, "square", 0.05, 0.002, 0.05, 55);
  assert.equal(nodes.length, nBefore, "reuse allocates no new osc/gain");
  assert.equal(api.blipStats().fired, 2);
  assert.equal(api.blipStats().pool, 1);
});

test("sustained lift: GameAudio overrun blips stay within the pool cap", async () => {
  const { ctx, counts } = countingContext();
  const held = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap,
    Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false },
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({
      ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }))),
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8")
    .replace(/^const\b/gm, "var"), vctx);
  vm.runInContext(ENGINE_SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const Signal = vm.runInContext("GameAudioSignal", vctx);
  GameAudio.init();
  for (const r of held.splice(0)) r();
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  GameAudio.startEngine();
  // Whine off so wastegate one-shots do not muddy the picture; overrun stays on.
  GameAudio.setLayer("whine", false);
  const osc0 = counts.osc;
  const gain0 = counts.gain;
  const fire0 = Signal.blipFireTotal();
  // ~300 frames × 16 ms ≈ 4.8 s of lift — denser than a typical straight.
  for (let i = 0; i < 300; i++) {
    ctx.currentTime += 0.016;
    GameAudio.setEngine(0.75, 0, false, 0.7, 6, { ax: -6, throttle: 0 });
  }
  const oscDelta = counts.osc - osc0;
  const gainDelta = counts.gain - gain0;
  const fires = Signal.blipFireTotal() - fire0;
  const ovr = GameAudio.overrunState().fired;
  assert.ok(ovr >= 20, `overrun still crackles across 300 frames (fired=${ovr})`);
  // Noise bursts still allocate GainNodes (out of scope); blip() oscillators must not.
  assert.ok(fires >= 1, `some square overrun pops still fire (blipFireTotal Δ=${fires})`);
  assert.ok(oscDelta <= 8, `createOscillator during lift bounded: Δ=${oscDelta} (gain Δ=${gainDelta} is noise+blip)`);
});
