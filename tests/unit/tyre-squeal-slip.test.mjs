/* tyre-squeal-slip.test.mjs — Job 4: slip-driven tyre squeal (fake-audio VM).
 *
 * Proves GameAudio.squealFromSlip / setSkid:
 *   - silent at or below SQUEAL_THRESH on either axis
 *   - gain and pitch rise monotonically with lateral and longitudinal slip
 *   - onset/release schedule via setTargetAtTime (no per-frame .value snaps)
 *   - a steady slide allocates zero nodes
 *
 * Run: node --test tests/unit/tyre-squeal-slip.test.mjs
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

test("squealFromSlip is silent at or below the grip threshold", () => {
  const { GameAudio: A } = boot();
  assert.equal(A.squealFromSlip(0, 0, false).gain, 0);
  assert.equal(A.squealFromSlip(0.10, 0, false).gain, 0, "exactly on the 0.10 floor is still grip");
  assert.equal(A.squealFromSlip(0, 0.09, false).gain, 0, "long slip below the floor is silent");
  assert.equal(A.squealFromSlip(0.05, 0.05, false).gain, 0, "combined hypot still under the floor");
  assert.ok(A.squealFromSlip(0.11, 0, false).gain > 0, "one tick past the floor starts to talk");
});

test("squeal gain and pitch rise monotonically with lat and long slip", () => {
  const { GameAudio: A } = boot();
  let prevG = -1, prevHz = -1;
  for (const lat of [0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
    const q = A.squealFromSlip(lat, 0, false);
    assert.ok(q.gain > prevG, `lat ${lat}: gain ${q.gain} did not rise from ${prevG}`);
    assert.ok(q.hz > prevHz, `lat ${lat}: hz ${q.hz} did not rise from ${prevHz}`);
    prevG = q.gain; prevHz = q.hz;
  }
  prevG = -1; prevHz = -1;
  for (const lon of [0.12, 0.3, 0.5, 0.75, 1]) {
    const q = A.squealFromSlip(0, lon, false);
    assert.ok(q.gain > prevG, `long ${lon}: gain ${q.gain} did not rise from ${prevG}`);
    assert.ok(q.hz > prevHz, `long ${lon}: hz ${q.hz} did not rise from ${prevHz}`);
    prevG = q.gain; prevHz = q.hz;
  }
  const latOnly = A.squealFromSlip(0.5, 0, false);
  const both = A.squealFromSlip(0.5, 0.4, false);
  assert.ok(both.gain > latOnly.gain, "adding longitudinal slip raises gain");
  assert.ok(both.hz > latOnly.hz, "lock/spin also lifts pitch");
});

test("setSkid follows the slip map, glides, and lands an exact 0", async () => {
  const { GameAudio: A, ctx } = await sampleEngine();
  const gains = [];
  const mk = ctx.createGain;
  // Nodes already exist (built once in startEngine). Find the live skid gain after driving it.
  A.setSkid(0.6, false);
  assert.ok(A.skidLevel() > 0, "a slide past the threshold is audible");
  assert.equal(A.squealFromSlip(0.6, 0, false).gain, A.skidLevel(), "setSkid gain is the dry map");
  A.setSkid(0.08, false);
  assert.equal(A.skidLevel(), 0, "below the threshold the layer is silent");
  A.setSkid({ lat: 0.2, long: 0.5, wet: false });
  const mid = A.skidLevel();
  A.setSkid({ lat: 0.2, long: 0.8, wet: false });
  assert.ok(A.skidLevel() > mid, "more long slip raises the live gain");
  const pitch = A.skidPitch();
  assert.ok(pitch > 760, `pitch ${pitch} should sit above the dry rest`);
  A.setSkid(0, false);
  assert.equal(A.skidLevel(), 0, "release lands an exact 0");
  void mk; void gains;
});

test("setSkid ramps via setTargetAtTime and creates no nodes per frame", async () => {
  const { GameAudio: A, ctx, ctxTime } = await sampleEngine();
  let created = 0;
  for (const k of Object.keys(ctx)) {
    if (!k.startsWith("create") || typeof ctx[k] !== "function") continue;
    const f = ctx[k];
    ctx[k] = (...a) => { created++; return f(...a); };
  }
  const filt = [...live].find((n) => n.kind === "biquad" && Math.abs(n.Q.value - 1.4) < 1e-9);
  assert.ok(filt, "precondition: skid bandpass (Q 1.4) exists");
  A.setSkid(0.4, false);
  const gainNode = [...live].find((n) => n.kind === "gain" && Math.abs(n.gain.value - A.skidLevel()) < 1e-12);
  assert.ok(gainNode, "precondition: skid gain found");
  assert.equal(gainNode.gain.lastMethod, "target", "onset is a glide, not a .value poke");
  assert.equal(filt.frequency.lastMethod, "target", "pitch is a glide");
  created = 0;
  const sets0 = filt.frequency.sets + gainNode.gain.sets;
  for (let i = 0; i < 30; i++) { ctxTime(1 / 60); A.setSkid(0.4, false); }
  assert.equal(created, 0, `steady slide allocated ${created} nodes`);
  assert.equal(filt.frequency.sets + gainNode.gain.sets, sets0, "steady slide re-schedules nothing");
  ctxTime(1 / 60);
  A.setSkid(0.85, false);
  assert.ok(gainNode.gain.sets > 0 && gainNode.gain.lastMethod === "target");
  assert.equal(gainNode.gain.snaps, 0, "no setValueAtTime zipper on the skid gain");
});
