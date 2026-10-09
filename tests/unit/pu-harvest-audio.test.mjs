/* 2026 PU deploy whine, cylinder-cut texture, lift-and-coast harvest (engine.js). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");
const SR = 44100;

function param(v) {
  const p = {
    value: v, sets: 0,
    setTargetAtTime(x) { p.sets++; p.value = x; },
    setValueAtTime(x) { p.sets++; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.value = x; },
    cancelScheduledValues() {},
  };
  return p;
}
const live = new Set();
function node(kind) {
  const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start() {}, stop() {}, type: "", loop: false,
    loopStart: 0, loopEnd: 0, buffer: null, gain: param(1), frequency: param(440), detune: param(0),
    Q: param(1), playbackRate: param(1) };
  live.add(self);
  return self;
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot() {
  const held = [];
  const ctx = {
    currentTime: 0, state: "running", sampleRate: SR, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"),
    createOscillator: () => node("osc"), createBufferSource: () => node("src"),
    createAnalyser: () => node("analyser"),
    createWaveShaper: () => Object.assign(node("shaper"), { curve: null }),
    createConvolver: () => Object.assign(node("convolver"), { buffer: null }),
    createStereoPanner: () => Object.assign(node("panner"), { pan: param(0) }),
    createDynamicsCompressor: () => Object.assign(node("comp"),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, SR)),
    createMediaElementSource: (el) => Object.assign(node("mediaSrc"), { mediaElement: el }),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const ctxTime = (dt) => { ctx.currentTime += dt; };
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { GameAudio, release, ctxTime };
}

const TUNE_ID = Object.freeze({
  pitch: 1, idle: 1, revRange: 1, curve: 1, detune: 1, brightness: 1, gravel: 1, sub: 1,
  limiter: 1, limRate: 1, limPitch: 1, boost: 1, boostPitch: 1,
  whine: 1, harvest: 1, wind: 1, screech: 1, brakes: 1, shift: 1, rivals: 1, reverb: 1, overrun: 1,
});

async function engine() {
  const { GameAudio: A, release } = boot();
  A.init();
  await release();
  A.startEngine();
  A.setTune(TUNE_ID);
  return A;
}

test("ERS deploy whine level and pitch rise with deploy at speed", async () => {
  const A = await engine();
  const frame = (deploy) => {
    for (let i = 0; i < 4; i++) A.setEngine(0.75, deploy, false, 0.75, 6, { deploy, energy: 1 });
  };
  frame(0.25);
  const low = A.ersLevel();
  frame(1);
  const high = A.ersLevel();
  assert.ok(low > 0 && high > low * 1.4, `deploy level should scale whine (${low} -> ${high})`);
  frame(0.85);
  const mid = A.ersLevel();
  frame(1);
  assert.ok(A.ersLevel() > mid, "ERS whine should keep climbing toward full deploy");
});

test("cylinder-cut engages on part-throttle and full-pack regen, not at full throttle", async () => {
  const A = await engine();
  A.setEngine(0.7, 0, false, 0.6, 5, { throttle: 1, deploy: 0, energy: 1 });
  assert.equal(A.cylCutDepth(), 0, "full throttle: no cylinder-cut");
  A.setEngine(0.7, 0, false, 0.6, 5, { throttle: 0.45, deploy: 0, energy: 0.8 });
  assert.ok(A.cylCutDepth() > 0, "part throttle harvest should add a subtle cut");
  A.setEngine(0.65, 0, false, 0.55, 5, { throttle: 0, brake: 0, deploy: 0, energy: 1, regen: 0.8 });
  for (let i = 0; i < 6; i++) A.setEngine(0.65, 0, false, 0.55, 5, { throttle: 0, brake: 0, deploy: 0, energy: 1, regen: 0.8 });
  assert.ok(A.cylCutDepth() > 0, "full pack + lift-and-coast regen should clip harvest");
});

test("lift-and-coast harvest is audible off throttle and brake; full throttle stays dry", async () => {
  const A = await engine();
  const coast = { throttle: 0, brake: 0, deploy: 0, energy: 0.7, regen: 0.85 };
  for (let i = 0; i < 10; i++) A.setEngine(0.55, 0, false, 0.72, 6, coast);
  const coastLvl = A.harvestCoastLevel();
  const coastAud = A.harvestLevel();
  assert.ok(coastLvl > 0.08, `coast regen level expected (${coastLvl})`);
  assert.ok(coastAud > 0, "lift-and-coast should drive harvest audibly");
  A.setEngine(0.85, 0, false, 0.72, 6, { throttle: 1, brake: 0, deploy: 0, energy: 0.7, regen: 0.85 });
  for (let i = 0; i < 6; i++) A.setEngine(0.85, 0, false, 0.72, 6, { throttle: 1, brake: 0, deploy: 0, energy: 0.7, regen: 0.85 });
  assert.ok(A.harvestCoastLevel() < coastLvl * 0.2, "full throttle should not coast-harvest");
});

test("braking harvest still follows hard deceleration", async () => {
  const { GameAudio: A, release, ctxTime } = boot();
  A.init();
  await release();
  A.startEngine();
  A.setTune(TUNE_ID);
  let brakeHarv = 0;
  for (let i = 0; i < 10; i++) {
    ctxTime(0.05);
    A.setEngine(0.6, 0, false, 0.9 - i * 0.06, 5, { ax: -18, throttle: 0, brake: 0.9 });
  }
  brakeHarv = A.harvestBrakeLevel();
  assert.ok(brakeHarv > 0.35, `braking decel harvest (${brakeHarv})`);
  assert.ok(A.harvestLevel() > 0.01, "braking harvest is audible on the bus");
});
