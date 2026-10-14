/* player-collision-side.test.mjs — player GameAudio.collision() stereo side.
 *
 * Default side 0 keeps the centred blip+noise path (byte-identical to before).
 * Non-zero side routes through the pooled contact voices + StereoPanner.
 *
 * Run: node --test tests/unit/player-collision-side.test.mjs
 *      npm run test:audio-unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  const counts = { src: 0, gain: 0, panner: 0, biquad: 0, osc: 0 };
  function node(kind) {
    if (counts[kind] != null) counts[kind]++;
    return {
      kind, connect(t) { return t; }, disconnect() {}, start() {}, stop() {},
      type: "", loop: false, buffer: null, onended: null,
      gain: param(1), frequency: param(440), detune: param(0), Q: param(1),
      playbackRate: param(1), pan: param(0),
    };
  }
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
    createGain: () => node("gain"), createOscillator: () => { counts.osc++; return node("osc"); },
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

function boot({ engine = true } = {}) {
  const { ctx, counts } = countingContext();
  const held = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Int32Array, Float64Array,
    Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false },
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    webkitAudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000, GEARS: 8, GEAR_TOP: [0, 80, 120, 160, 200, 240, 280, 320, 360] },
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"),
    vctx, { filename: "mat4.js" });
  vm.runInContext(ENGINE_SRC, vctx, { filename: "engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  GameAudio.init();
  GameAudio.setEnabled(true);
  GameAudio.setSfxEnabled(true);
  if (engine) GameAudio.startEngine();
  return { GameAudio, ctx, counts };
}

test("collision(): default side 0 matches centred blip+noise (unchanged)", () => {
  const { GameAudio, counts } = boot({ engine: false });
  const snap = () => ({ osc: counts.osc || 0, src: counts.src || 0, biquad: counts.biquad || 0 });
  const a = snap();
  GameAudio.collision(0.2);
  const b = snap();
  assert.ok(b.osc > a.osc && b.src > a.src, "a graze uses blip + noise");
  assert.ok(b.osc - a.osc < 3, "a graze is not a heavy multi-bang hit");
  GameAudio.collision(0.95);
  const c = snap();
  assert.ok(c.osc > b.osc, "a heavy hit adds the low bang");
  GameAudio.collision(0.5, true);
  const d = snap();
  assert.equal(d.osc, c.osc, "a centred scrape is noise only");
  assert.equal(d.src - c.src, 1, "one band-passed noise burst");
  assert.equal(d.biquad - c.biquad, 1);
  assert.equal(GameAudio.contactPoolPans().length, 0, "centred path does not pan the contact pool");
});

test("collision(): side -1 and +1 pan through the contact pool", () => {
  const { GameAudio } = boot();
  assert.ok(GameAudio.fieldContactState().voices >= 2);
  assert.equal(GameAudio.collision(0.7, false, -1), undefined);
  assert.equal(GameAudio.lastPlayerContactPan(), -1);
  assert.ok(GameAudio.contactPoolPans().includes(-1), "live voice panned left");
  GameAudio.collision(0.7, false, 1);
  assert.equal(GameAudio.lastPlayerContactPan(), 1);
  assert.ok(GameAudio.contactPoolPans().includes(1), "live voice panned right");
});

test("collision(): out-of-range side is clamped to the panner limits", () => {
  const { GameAudio } = boot();
  GameAudio.collision(0.6, false, -2.5);
  assert.equal(GameAudio.lastPlayerContactPan(), -1);
  GameAudio.collision(0.6, false, 9);
  assert.equal(GameAudio.lastPlayerContactPan(), 1);
});

test("collision(): side 0 explicit still uses centred path (no pool pan latch)", () => {
  const { GameAudio, counts } = boot({ engine: false });
  const osc0 = counts.osc || 0;
  GameAudio.collision(0.4, false, 0);
  assert.ok((counts.osc || 0) > osc0, "centred blip still allocates osc from blip pool");
  assert.equal(GameAudio.lastPlayerContactPan(), 0);
});
