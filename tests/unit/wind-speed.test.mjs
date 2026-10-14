/* wind-speed.test.mjs — Job 4: speed-scaled wind / air rush (fake-audio VM).
 *
 * Proves GameAudio.windFromSpeed / setEngine airflow:
 *   - silent at or below WIND_GATE (crawl / grid)
 *   - gain and filter cutoff rise monotonically with speed
 *   - quiet at pit-lane pace, full rush near vTop
 *   - onset/release schedule via setTargetAtTime
 *   - a steady speed allocates zero nodes
 *
 * Run: node --test tests/unit/wind-speed.test.mjs
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
    start() {}, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null,
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
  return { GameAudio, release, ctx, ctxTime };
}

async function sampleEngine() {
  const b = boot();
  b.GameAudio.init();
  await b.release();
  b.GameAudio.startEngine();
  return b;
}

const PH = Object.freeze({ slip: 1, ax: 0, onKerb: false, wet: false, tow: 0, deploy: 0, energy: 1, throttle: 1 });

test("windFromSpeed is silent at or below the crawl gate", () => {
  const { GameAudio: A } = boot();
  assert.equal(A.windFromSpeed(0).gain, 0);
  assert.equal(A.windFromSpeed(0.04).gain, 0, "exactly on the 0.04 gate is still silent");
  assert.ok(A.windFromSpeed(0.05).gain > 0, "just past the gate the layer opens");
});

test("wind gain and cutoff rise monotonically with speed", () => {
  const { GameAudio: A } = boot();
  let prevG = -1, prevHz = -1;
  for (const s of [0.04, 0.08, 0.15, 0.25, 0.4, 0.6, 0.8, 1]) {
    const w = A.windFromSpeed(s);
    assert.ok(w.gain >= prevG - 1e-12, `speed ${s}: gain ${w.gain} fell from ${prevG}`);
    assert.ok(w.hz >= prevHz - 1e-12, `speed ${s}: hz ${w.hz} fell from ${prevHz}`);
    if (s > 0.04) {
      assert.ok(w.gain > prevG, `speed ${s}: gain must strictly rise past the gate`);
      assert.ok(w.hz > prevHz, `speed ${s}: cutoff must strictly rise past the gate`);
    }
    prevG = w.gain; prevHz = w.hz;
  }
  const pit = A.windFromSpeed(0.25);
  const top = A.windFromSpeed(1);
  assert.ok(pit.gain > 0 && pit.gain < top.gain * 0.15, `pit-lane ${pit.gain} must stay quiet vs top ${top.gain}`);
  assert.ok(top.hz > pit.hz, "top speed opens the filter past pit-lane");
});

test("setEngine wind level and cutoff follow speed, gated on the grid", async () => {
  const { GameAudio: A } = await sampleEngine();
  A.setEngine(0.3, 0, false, 0, 1, PH);
  assert.equal(A.windLevel(), 0, "stationary: wind gated");
  A.setEngine(0.5, 0, false, 0.25, 3, PH);
  const pit = A.windLevel();
  const pitHz = A.windCutoff();
  A.setEngine(0.8, 0, false, 0.6, 6, PH);
  const mid = A.windLevel();
  const midHz = A.windCutoff();
  A.setEngine(0.95, 0, false, 1, 8, PH);
  const top = A.windLevel();
  const topHz = A.windCutoff();
  assert.ok(pit > 0 && mid > pit && top > mid, `wind gain ${pit} → ${mid} → ${top}`);
  assert.ok(midHz > pitHz && topHz > midHz, `wind cutoff ${pitHz} → ${midHz} → ${topHz}`);
});

test("setEngine wind ramps via setTargetAtTime and creates no nodes per frame", async () => {
  const { GameAudio: A, ctx, ctxTime } = await sampleEngine();
  let created = 0;
  for (const k of Object.keys(ctx)) {
    if (!k.startsWith("create") || typeof ctx[k] !== "function") continue;
    const f = ctx[k];
    ctx[k] = (...a) => { created++; return f(...a); };
  }
  A.setEngine(0.7, 0, false, 0.7, 6, PH);
  const gainNode = [...live].find((n) => n.kind === "gain" && Math.abs(n.gain.value - A.windLevel()) < 1e-12);
  const filt = [...live].find((n) => n.kind === "biquad" && Math.abs(n.frequency.value - A.windCutoff()) < 1e-6);
  assert.ok(gainNode, "precondition: wind gain found");
  assert.ok(filt, "precondition: wind bandpass (Q 0.7) found");
  assert.equal(gainNode.gain.lastMethod, "target", "wind gain is a glide");
  assert.equal(filt.frequency.lastMethod, "target", "wind cutoff is a glide");
  created = 0;
  const sets0 = filt.frequency.sets + gainNode.gain.sets;
  for (let i = 0; i < 30; i++) { ctxTime(1 / 60); A.setEngine(0.7, 0, false, 0.7, 6, PH); }
  assert.equal(created, 0, `steady setEngine allocated ${created} nodes`);
  assert.equal(filt.frequency.sets + gainNode.gain.sets, sets0, "steady speed re-schedules nothing");
  ctxTime(1 / 60);
  A.setEngine(0.85, 0, false, 0.95, 7, PH);
  assert.equal(gainNode.gain.lastMethod, "target");
  assert.equal(gainNode.gain.snaps, 0, "no setValueAtTime zipper on the wind gain");
});
