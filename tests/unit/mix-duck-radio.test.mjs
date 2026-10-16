/* mix-duck-radio.test.mjs — Job 5 done-when for mix ducking under voice.
 *
 * Radio / announcer already emit GameAudio.setRadioDuck(on, src). This suite
 * proves the mix/bus SUBSCRIBER in js/audio/engine.js, on the fake-audio VM:
 *   - SFX bus dips on voice start (−8 dB) and releases after the end
 *   - overlapping lines hold the duck without a second attack (no pump)
 *   - ramps are setTargetAtTime only (80 ms attack / 400 ms release)
 *   - interrupt + context recovery restore the bus
 *   - setRadioDuck / setEngine allocate zero nodes
 *   - the engine stays audible (bus not muted; engineLevel stays up)
 *
 * Run: node --test tests/unit/mix-duck-radio.test.mjs
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
const DUCK_DB = -8;
const DUCK_LIN = 10 ** (DUCK_DB / 20);
const ATTACK_TAU = 0.08;
const RELEASE_TAU = 0.4;

function param(v) {
  const p = {
    value: v, sets: 0, snaps: 0, cancels: 0, lastMethod: null, lastTau: null,
    setTargetAtTime(x, _t, tau) { p.sets++; p.lastMethod = "target"; p.value = x; p.lastTau = tau; },
    setValueAtTime(x) { p.sets++; p.snaps++; p.lastMethod = "value"; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.lastMethod = "linear"; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.lastMethod = "exp"; p.value = x; },
    cancelScheduledValues() { p.cancels++; },
  };
  return p;
}

function node(kind, counts) {
  if (counts) counts[kind] = (counts[kind] || 0) + 1;
  const self = {
    kind, connect: (t) => t, disconnect() {},
    start(t) { self.startAt = t; }, stop(t) { self.stopAt = t; },
    type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null,
    fftSize: 0, frequencyBinCount: 0, getFloatFrequencyData() {},
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1),
  };
  return self;
}

function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot(opts = {}) {
  const counts = {};
  const gains = [];
  const held = [];
  const contexts = [];
  const deviceListeners = {};
  function makeCtx() {
    const ctx = {
      currentTime: 0, state: "running", sampleRate: SR, destination: node("dest", counts),
      createGain() {
        const n = node("gain", counts);
        gains.push(n);
        return n;
      },
      createBiquadFilter: () => node("biquad", counts),
      createOscillator: () => node("osc", counts),
      createBufferSource: () => node("src", counts),
      createAnalyser: () => node("analyser", counts),
      createWaveShaper: () => Object.assign(node("shaper", counts), { curve: null }),
      createConvolver: () => Object.assign(node("convolver", counts), { buffer: null }),
      createStereoPanner: () => Object.assign(node("panner", counts), { pan: param(0) }),
      createDynamicsCompressor: () => Object.assign(node("comp", counts),
        { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
      createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
      decodeAudioData: (ab, res) => res(sampleBuf(4, SR)),
      createMediaElementSource: (el) => Object.assign(node("mediaSrc", counts), { mediaElement: el }),
      resume: () => Promise.resolve(), close() { ctx.state = "closed"; },
    };
    contexts.push(ctx);
    return ctx;
  }
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => setTimeout(fn, ms || 0),
    clearTimeout,
    navigator: {
      userActivation: { isActive: true, hasBeenActive: true },
      mediaDevices: {
        addEventListener(type, fn) { if (type === "devicechange") deviceListeners[type] = fn; },
        removeEventListener() {},
      },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return makeCtx(); },
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return {
    GameAudio, release, counts, gains, contexts,
    fireDeviceChange: () => { if (deviceListeners.devicechange) deviceListeners.devicechange(); },
  };
}

function sfxBusOf(gains) {
  // createCtx builds master then sfxBus (limiter is a compressor, not a gain).
  assert.ok(gains.length >= 2, "precondition: master + sfxBus exist");
  return gains[1];
}

const near = (a, b, what) => {
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: expected ${b}, got ${a}`);
};

test("setRadioDuck engages the SFX bus at −8 dB via setTargetAtTime (~80 ms)", async () => {
  const { GameAudio: A, gains } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  const duck = A.mixDuck();
  near(duck.lin, DUCK_LIN, "mixDuck.lin");
  near(duck.attackTau, ATTACK_TAU, "mixDuck.attackTau");
  near(duck.releaseTau, RELEASE_TAU, "mixDuck.releaseTau");
  near(bus.gain.value, 1, "precondition: SFX bus at unity");
  const sets0 = bus.gain.sets;
  A.setRadioDuck(true);
  assert.equal(bus.gain.lastMethod, "target", "attack is setTargetAtTime, not a step");
  assert.equal(bus.gain.snaps, 0, "no setValueAtTime on engage");
  near(bus.gain.lastTau, ATTACK_TAU, "attack tau");
  near(bus.gain.value, DUCK_LIN, "SFX bus dipped");
  assert.equal(A.mixDuck().on, true);
  assert.ok(bus.gain.sets > sets0, "one attack schedule");
  assert.ok(bus.gain.cancels > 0, "in-flight values cancelled first");
});

test("setRadioDuck(false) releases the SFX bus via setTargetAtTime (~400 ms)", async () => {
  const { GameAudio: A, gains } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  A.setRadioDuck(true);
  A.setRadioDuck(false);
  assert.equal(bus.gain.lastMethod, "target", "release is setTargetAtTime, not a step");
  assert.equal(bus.gain.snaps, 0, "no setValueAtTime on release");
  near(bus.gain.lastTau, RELEASE_TAU, "release tau");
  near(bus.gain.value, 1, "SFX bus restored");
  assert.equal(A.mixDuck().on, false);
});

test("overlapping lines hold the duck without a second attack (no pump)", async () => {
  const { GameAudio: A, gains } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  A.setRadioDuck(true, "radio");
  const afterFirst = bus.gain.sets;
  const tauAfterFirst = bus.gain.lastTau;
  A.setRadioDuck(true, "watch:1");
  assert.equal(bus.gain.sets, afterFirst, "a second hold must not re-ramp");
  assert.equal(bus.gain.lastTau, tauAfterFirst);
  near(bus.gain.value, DUCK_LIN, "still dipped");
  A.setRadioDuck(false, "radio");
  assert.equal(bus.gain.sets, afterFirst, "dropping one hold must not release");
  near(bus.gain.value, DUCK_LIN, "held by the remaining line");
  assert.equal(A.mixDuck().on, true);
  A.setRadioDuck(false, "watch:1");
  near(bus.gain.lastTau, RELEASE_TAU, "last holder releases");
  near(bus.gain.value, 1, "restored once every hold is clear");
  assert.equal(A.mixDuck().on, false);
});

test("a volume slider mid-line stays ducked (composed sfxVol × lin)", async () => {
  const { GameAudio: A, gains } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  A.setRadioDuck(true);
  A.setSfxVolume(0.5);
  near(bus.gain.value, 0.5 * DUCK_LIN, "slider mid-line stays under the voice");
  A.setRadioDuck(false);
  near(bus.gain.value, 0.5, "release lands on the new slider level");
});

test("SFX OFF mid-line silences the bus; SFX ON mid-line returns ducked", async () => {
  const { GameAudio: A, gains } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  A.setRadioDuck(true);
  A.setSfxEnabled(false);
  near(bus.gain.value, 0, "SFX off is silence, not a half-duck");
  A.setSfxEnabled(true);
  near(bus.gain.value, DUCK_LIN, "SFX back on while a line is live stays ducked");
});

test("an interrupted session releases the SFX duck; running re-latches if the line is still on air", async () => {
  const { GameAudio: A, gains, contexts } = boot();
  A.init();
  const bus = sfxBusOf(gains);
  const ctx = contexts[0];
  A.setRadioDuck(true);
  near(bus.gain.value, DUCK_LIN, "precondition: ducked");
  ctx.state = "interrupted";
  ctx.onstatechange();
  near(bus.gain.value, 1, "interrupt restores the SFX bus");
  near(bus.gain.lastTau, RELEASE_TAU, "interrupt uses the release ramp");
  assert.equal(A.mixDuck().on, false, "latch dropped for the dead session");
  ctx.state = "running";
  ctx.onstatechange();
  near(bus.gain.value, DUCK_LIN, "running re-latches while the hold is still live");
  assert.equal(A.mixDuck().on, true);
});

test("a context rebuild drops ghost holds and boots the new SFX bus unducked", async () => {
  const { GameAudio: A, gains, contexts, fireDeviceChange } = boot();
  A.init();
  A.setRadioDuck(true);
  near(sfxBusOf(gains).gain.value, DUCK_LIN, "precondition: ducked on the old graph");
  const n0 = contexts.length;
  fireDeviceChange();
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(contexts.length > n0, "precondition: rebuilt");
  const rebuilt = gains.filter((g) => g.gain);
  const newSfx = rebuilt[rebuilt.length - 1] === gains[1] ? gains[1] : gains.find((g, i) => i > 0 && g.gain.value === 1) || gains[gains.length - 1];
  assert.equal(A.mixDuck().on, false, "rebuild cleared the latch");
  assert.equal(A.mixDuck().holds, 0, "rebuild dropped ghost radio holds");
  near(A.mixDuck().sfx, 1, "new SFX bus is unducked");
  assert.ok(newSfx, "new graph has an SFX bus");
});

test("setRadioDuck and a steady setEngine allocate zero GainNodes", async () => {
  const { GameAudio: A, counts, release } = boot();
  A.init();
  await release();
  A.startEngine();
  const gains0 = counts.gain || 0;
  A.setRadioDuck(true);
  A.setEngine(0.5, 0, false, 0.5, 4, {});
  A.setEngine(0.62, 0.1, false, 0.5, 4, {});
  A.setRadioDuck(false);
  assert.equal(counts.gain, gains0, "duck + setEngine must reuse the existing bus, not spawn nodes");
});

test("the engine stays audible while the SFX bus is ducked", async () => {
  const { GameAudio: A, release } = boot();
  A.init();
  await release();
  A.startEngine();
  A.setEngine(0.55, 0, false, 0.6, 4, {});
  const eng0 = A.engineLevel();
  assert.ok(eng0 > 0, "precondition: engine core has gain");
  A.setRadioDuck(true);
  const duck = A.mixDuck();
  assert.ok(duck.sfx > 0.3 && duck.sfx < 0.5, `SFX bus in the −6…−10 dB band, got ${duck.sfx}`);
  assert.ok(A.engineLevel() > 0, "engine core is not muted");
  assert.ok(Math.abs(A.engineLevel() - eng0) < 1e-9, "engineLevel is upstream of the bus duck");
});

test("music still ducks through the existing soundtrack subscriber", async () => {
  const { GameAudio: A, gains, release } = boot();
  A.init();
  A.startMusic();
  await release();
  const music = gains.find((g) => g !== gains[0] && g !== gains[1] && Math.abs(g.gain.value - 0.5 * 0.52) < 1e-9);
  assert.ok(music, "precondition: music gain at the default level");
  A.setRadioDuck(true);
  near(music.gain.value, 0.5 * 0.52 * 0.35, "music still dips under a radio line");
  A.setRadioDuck(false);
  near(music.gain.value, 0.5 * 0.52, "music releases with the line");
});
