/* engine-note-quality.test.mjs — Job 1 done-when for the player engine voice.
 *
 * Proves on the fake-audio VM (same shape as audio-tune.test.mjs):
 *   - pitch is monotonic with RPM
 *   - steady rev climbs schedule via setTargetAtTime (no per-frame setValue snaps)
 *   - overrun (lift) timbre differs from on-throttle at the same rev
 *   - upshift gain dip + rev-limiter chop are present
 *   - setEngine allocates zero nodes on a steady per-frame update
 *
 * Run: node --test tests/unit/engine-note-quality.test.mjs
 */
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
    value: v, sets: 0, snaps: 0, lastMethod: null,
    setTargetAtTime(x) { p.sets++; p.lastMethod = "target"; p.value = x; },
    setValueAtTime(x) { p.sets++; p.snaps++; p.lastMethod = "value"; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.lastMethod = "linear"; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.lastMethod = "exp"; p.value = x; },
    cancelScheduledValues() {},
  };
  return p;
}
const live = new Set();
function node(kind) {
  const self = {
    kind, connect: (t) => t, disconnect() { live.delete(self); },
    start(t) { self.startAt = t; }, stop(t) { self.stopAt = t; },
    type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null,
    fftSize: 0, frequencyBinCount: 0, getFloatFrequencyData() {},
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1),
  };
  live.add(self);
  return self;
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot() {
  live.clear();
  const pendingTimers = [];
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
  const held = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: (fn) => { pendingTimers.push(fn); return pendingTimers.length; },
    clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
  return { GameAudio, release, ctx, ctxTime, live };
}

async function sampleEngine() {
  const bootState = boot();
  bootState.GameAudio.init();
  await bootState.release();
  bootState.GameAudio.startEngine();
  assert.equal(bootState.GameAudio.debug().usingSamples, true, "precondition: sample core");
  return bootState;
}

function idleSampleSrc() {
  return [...live].find((n) => n.kind === "src" && n.loop && n.buffer &&
    (n.buffer.duration >= 3 || (n.loopStart === 0 && n.loopEnd > 0 && Math.abs(n.loopEnd - n.buffer.duration) < 1e-6)));
}

test("pitch is monotonic with RPM on the sample core", async () => {
  const { GameAudio: A } = await sampleEngine();
  let prev = -1;
  for (const rev of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    A.setEngine(rev, 0, false, 0.6, 5, {});
    const r = A.rate();
    assert.ok(r >= prev - 1e-9, `pitch fell from ${prev} to ${r} at rev ${rev}`);
    prev = r;
  }
});

test("a steady rev climb smooths via setTargetAtTime, not per-frame setValue snaps", async () => {
  const { GameAudio: A, ctxTime } = await sampleEngine();
  const src = idleSampleSrc();
  assert.ok(src, "precondition: idle BufferSource");
  // Seed past the first-frame snap.
  A.setEngine(0.2, 0, false, 0.5, 5, {});
  const snaps0 = src.playbackRate.snaps;
  const targets0 = src.playbackRate.sets - src.playbackRate.snaps;
  for (let i = 0; i < 20; i++) {
    ctxTime(1 / 60);
    A.setEngine(0.2 + i * 0.02, 0, false, 0.5, 5, {});
  }
  assert.equal(src.playbackRate.snaps, snaps0, "steady climb must not setValueAtTime the rate");
  assert.ok(src.playbackRate.sets - src.playbackRate.snaps > targets0, "climb must schedule setTargetAtTime aims");
  assert.equal(src.playbackRate.lastMethod, "target");
});

test("overrun (lift) timbre is darker than on-throttle at the same rev", async () => {
  const { GameAudio: A } = await sampleEngine();
  const rev = 0.7, speed = 0.65, gear = 5;
  A.setEngine(rev, 0, false, speed, gear, { throttle: 1, ax: 4, axStd: 4 });
  const onThrottle = A.engineCut();
  const onLvl = A.engineLevel();
  A.setEngine(rev, 0, false, speed, gear, { throttle: 0, ax: -4, brake: 0 });
  const liftCut = A.engineCut();
  const liftLvl = A.engineLevel();
  assert.ok(liftCut < onThrottle * 0.95, `lift cut ${liftCut} must sit below on-throttle ${onThrottle}`);
  assert.ok(liftLvl < onLvl, `lift level ${liftLvl} must sit below on-throttle ${onLvl}`);
  A.setLayer("overrun", false);
  A.setEngine(rev, 0, false, speed, gear, { throttle: 0, ax: -4, brake: 0 });
  assert.ok(A.engineCut() > liftCut, "overrun layer off restores the brighter closed-throttle colour");
  A.setLayer("overrun", true);
});

test("an upshift dips the engine then recovers; the rev limiter chops at redline", async () => {
  const { GameAudio: A, ctxTime } = await sampleEngine();
  for (let i = 0; i < 4; i++) A.setEngine(0.7, 0, false, 0.6, 5, {});
  const base = A.engineLevel();
  A.shift(true);
  A.setEngine(0.7, 0, false, 0.6, 5, {});
  const ducked = A.engineLevel();
  assert.ok(ducked < base * 0.7, `shift duck must cut the note (${ducked} vs ${base})`);
  for (let i = 0; i < 40; i++) { ctxTime(0.02); A.setEngine(0.7, 0, false, 0.6, 5, {}); }
  assert.ok(A.engineLevel() > ducked * 1.2, "duck recovers after ~0.12 s tau");
  assert.ok(Math.abs(A.engineLevel() - base) < base * 0.05, "recovered level returns near the pre-shift base");

  A.setEngine(0.99, 0, false, 0.9, 7, {});
  assert.ok(A.limiterDepth() > 0, "rev limiter must chop above 98.5% revs at speed");
  A.setEngine(0.8, 0, false, 0.9, 7, {});
  assert.equal(A.limiterDepth(), 0, "below the gate the chop is gone");
});

test("setEngine allocates zero nodes on a steady per-frame update", async () => {
  const { GameAudio: A, ctx, ctxTime } = await sampleEngine();
  let created = 0;
  for (const k of Object.keys(ctx)) {
    if (!k.startsWith("create") || typeof ctx[k] !== "function") continue;
    const f = ctx[k];
    ctx[k] = (...a) => { created++; return f(...a); };
  }
  const ph = { slip: 1, ax: 2, axStd: 2, throttle: 1, onKerb: false, wet: false, tow: 0, deploy: 0, energy: 1 };
  for (let i = 0; i < 4; i++) { ctxTime(1 / 60); A.setEngine(0.55, 0, false, 0.55, 5, ph); }
  created = 0;
  for (let i = 0; i < 45; i++) { ctxTime(1 / 60); A.setEngine(0.55, 0, false, 0.55, 5, ph); }
  assert.equal(created, 0, `steady setEngine allocated ${created} nodes`);
});
