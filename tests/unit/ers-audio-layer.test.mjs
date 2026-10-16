/* ers-audio-layer.test.mjs — Job 6: MGU-K electric layer + overtake/boost cue.
 *
 * Proves ErsLayer on a fake-audio VM:
 *   - deploy whine gain and pitch rise monotonically with deploy power
 *   - harvest/regen tone is a distinct lower, braking-linked register
 *   - silent at an empty battery or with ERS off
 *   - boost/overtake cue fires once per activation
 *   - continuous layers aim via setTargetAtTime (no per-frame .value snaps)
 *   - a steady update allocates zero nodes
 *
 * Run: node --test tests/unit/ers-audio-layer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/ers-layer.js"), "utf8");

function param(v) {
  const p = {
    value: v, sets: 0, snaps: 0, cancels: 0, lastMethod: null, targets: [],
    setTargetAtTime(x) { p.sets++; p.lastMethod = "target"; p.value = x; p.targets.push(x); },
    setValueAtTime(x) { p.sets++; p.snaps++; p.lastMethod = "value"; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.lastMethod = "linear"; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.lastMethod = "exp"; p.value = x; },
    cancelScheduledValues() { p.cancels++; },
  };
  return p;
}

function node(kind, live) {
  const self = {
    kind, connections: [], connect(t) { self.connections.push(t); return t; }, disconnect() { live.delete(self); },
    start() { self.started = true; }, stop() { self.stopped = true; },
    type: "", gain: param(1), frequency: param(440), detune: param(0), Q: param(1),
  };
  live.add(self);
  return self;
}

function boot() {
  const live = new Set();
  let created = 0;
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest", live),
    createGain() { created++; return node("gain", live); },
    createBiquadFilter() { created++; return node("biquad", live); },
    createOscillator() { created++; return node("osc", live); },
    createBufferSource() { created++; return node("src", live); },
  };
  const dest = node("bus", live);
  const sb = { Math, console, Object, Array, Number, isFinite };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(SRC, vctx, { filename: "js/audio/ers-layer.js" });
  const ErsLayer = vm.runInContext("ErsLayer", vctx);
  return { ErsLayer, ctx, dest, live, created: () => created, resetCreated: () => { created = 0; } };
}

function layer() {
  const b = boot();
  b.ErsLayer.attach(b.ctx, b.dest);
  return b;
}

test("deploy whine gain and pitch rise monotonically with deploy power", () => {
  const { ErsLayer, ctx } = layer();
  let prevG = -1, prevHz = -1;
  for (const d of [0.15, 0.35, 0.55, 0.75, 1]) {
    ctx.currentTime += 0.02;
    ErsLayer.update({ t: ctx.currentTime, deploy: d, energy: 1, layerOn: true, speed: 0.75 });
    const g = ErsLayer.deployLevel();
    const hz = ErsLayer.inspect().deployHz;
    assert.ok(g > prevG, `deploy ${d}: gain ${g} did not rise from ${prevG}`);
    assert.ok(hz > prevHz, `deploy ${d}: hz ${hz} did not rise from ${prevHz}`);
    prevG = g; prevHz = hz;
  }
  assert.ok(prevG > 0 && prevHz >= 1000 && prevHz <= 1400, "full deploy stays in the softer electric register");
});

test("harvest tone is a distinct lower, braking-linked register", () => {
  const { ErsLayer, ctx } = layer();
  ErsLayer.update({ t: ctx.currentTime, deploy: 1, energy: 1, brake: 0, speed: 0.7 });
  const dep = ErsLayer.inspect();
  ctx.currentTime += 0.05;
  ErsLayer.update({ t: ctx.currentTime, deploy: 0, energy: 0.7, brake: 0.9, ax: -16, speed: 0.6 });
  const har = ErsLayer.inspect();
  assert.ok(dep.deploy > 0, "deploying drives the electric whine");
  assert.equal(dep.harvest, 0, "deploy gates the harvest tone");
  assert.ok(har.harvest > 0, "braking harvest is audible");
  assert.equal(har.deploy, 0, "harvest is not the deploy layer");
  assert.ok(har.harvestHz < 900 && dep.deployHz > 1000,
    `harvest ${har.harvestHz} Hz must sit well below deploy ${dep.deployHz} Hz`);
  const pureH = ErsLayer.harvestHz(1);
  const pureD = ErsLayer.deployHz(1, 1);
  assert.ok(pureH < 800 && pureD > 1000 && pureD <= 1400, "pure targets keep the registers apart");
});

test("layer is silent at an empty battery or with ERS off", () => {
  const { ErsLayer, ctx } = layer();
  const loud = { t: ctx.currentTime, deploy: 1, energy: 1, brake: 0.8, layerOn: true, ersOn: true, boost: true };
  ErsLayer.update(loud);
  assert.ok(ErsLayer.deployLevel() > 0, "precondition: deploy audible");
  ctx.currentTime += 0.02;
  ErsLayer.update({ ...loud, t: ctx.currentTime, energy: 0 });
  assert.equal(ErsLayer.deployLevel(), 0, "empty pack silences deploy");
  assert.equal(ErsLayer.harvestLevel(), 0, "empty pack silences harvest");
  assert.equal(ErsLayer.sustainLevel(), 0, "empty pack silences boost sustain");
  ctx.currentTime += 0.02;
  ErsLayer.update({ ...loud, t: ctx.currentTime, energy: 1, layerOn: false });
  assert.equal(ErsLayer.deployLevel(), 0, "ERS layer switch off silences deploy");
  ctx.currentTime += 0.02;
  ErsLayer.update({ ...loud, t: ctx.currentTime, energy: 1, ersOn: false });
  assert.equal(ErsLayer.deployLevel(), 0, "ERS off silences deploy");
  assert.ok(!ErsLayer.isLive(0, true, true), "isLive rejects an empty pack");
  assert.ok(!ErsLayer.isLive(1, false, true), "isLive rejects a muted layer");
});

test("boost cue fires once per activation", () => {
  const { ErsLayer, ctx } = layer();
  ErsLayer.update({ t: ctx.currentTime, deploy: 0, energy: 1 });
  assert.equal(ErsLayer.cueCount(), 0, "idle does not cue");
  ctx.currentTime += 0.05;
  ErsLayer.update({ t: ctx.currentTime, deploy: 1, energy: 1, boost: true });
  assert.equal(ErsLayer.cueCount(), 1, "rising deploy fires the cue");
  for (let i = 0; i < 20; i++) {
    ctx.currentTime += 1 / 60;
    ErsLayer.update({ t: ctx.currentTime, deploy: 1, energy: 1, boost: true });
  }
  assert.equal(ErsLayer.cueCount(), 1, "held boost does not re-fire");
  ctx.currentTime += 0.2;
  ErsLayer.update({ t: ctx.currentTime, deploy: 0, energy: 1, boost: false });
  ctx.currentTime += 0.2;
  ErsLayer.update({ t: ctx.currentTime, deploy: 1, energy: 1, otOn: true });
  assert.equal(ErsLayer.cueCount(), 2, "a second activation fires once more");
  ErsLayer.cueBoost(ctx.currentTime);
  assert.equal(ErsLayer.cueCount(), 2, "re-arm window swallows a same-tick deployBoost hook");
  assert.ok(ErsLayer.sustainLevel() > 0, "boost sustain sits under the cue while active");
});

test("ramps use setTargetAtTime and a steady update creates zero nodes", () => {
  const b = layer();
  const { ErsLayer, ctx, resetCreated, created } = b;
  ErsLayer.update({ t: ctx.currentTime, deploy: 0.6, energy: 1, brake: 0, speed: 0.7 });
  const snap = ErsLayer.inspect();
  assert.equal(snap.deployMethod, "target", "deploy gain is a glide");
  resetCreated();
  const builds0 = ErsLayer.builds();
  for (let i = 0; i < 40; i++) {
    ctx.currentTime += 1 / 60;
    ErsLayer.update({ t: ctx.currentTime, deploy: 0.6, energy: 1, brake: 0, speed: 0.7 });
  }
  assert.equal(created(), 0, `steady update allocated ${created()} nodes`);
  assert.equal(ErsLayer.builds(), builds0, "attach is not rebuilt per frame");
});

test("GameAudio.setEngine drives the layer through the init/update hook", async () => {
  const live = new Set();
  function p(v) {
    const o = {
      value: v, sets: 0, lastMethod: null,
      setTargetAtTime(x) { o.sets++; o.lastMethod = "target"; o.value = x; },
      setValueAtTime(x) { o.sets++; o.lastMethod = "value"; o.value = x; },
      linearRampToValueAtTime(x) { o.sets++; o.lastMethod = "linear"; o.value = x; },
      exponentialRampToValueAtTime(x) { o.sets++; o.lastMethod = "exp"; o.value = x; },
      cancelScheduledValues() {},
    };
    return o;
  }
  function n(kind) {
    const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start() {}, stop() {},
      type: "", loop: false, buffer: null, gain: p(1), frequency: p(440), detune: p(0), Q: p(1), playbackRate: p(1) };
    live.add(self);
    return self;
  }
  const SR = 44100;
  const ctx = {
    currentTime: 0, state: "running", sampleRate: SR, destination: n("dest"),
    createGain: () => n("gain"), createBiquadFilter: () => n("biquad"),
    createOscillator: () => n("osc"), createBufferSource: () => n("src"),
    createAnalyser: () => n("analyser"),
    createWaveShaper: () => Object.assign(n("shaper"), { curve: null }),
    createConvolver: () => Object.assign(n("convolver"), { buffer: null }),
    createStereoPanner: () => Object.assign(n("panner"), { pan: p(0) }),
    createDynamicsCompressor: () => Object.assign(n("comp"),
      { threshold: p(-24), knee: p(30), ratio: p(12), attack: p(0.003), release: p(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res({ sampleRate: SR, length: 8, duration: 8 / SR, numberOfChannels: 1, getChannelData: () => new Float32Array(8) }),
    createMediaElementSource: () => n("media"),
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
  const files = [
    "js/core/mat4.js",
    "js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js",
    "js/audio/radio-fx.js", "js/audio/ers-layer.js", "js/audio/engine.js",
  ];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: f });
  }
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const ErsLayer = vm.runInContext("ErsLayer", vctx);
  GameAudio.init();
  for (const r of held.splice(0)) r();
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  GameAudio.startEngine();
  assert.ok(ErsLayer.attached(), "init/startEngine binds the fixed ERS graph");
  GameAudio.setEngine(0.75, 1, false, 0.75, 6, { deploy: 1, energy: 1 });
  assert.ok(GameAudio.ersLevel() > 0, "setEngine deploy reaches ErsLayer");
  assert.ok(GameAudio.ersAudio() && GameAudio.ersAudio().deploy > 0, "ersAudio() exposes the layer");
  GameAudio.setEngine(0.75, 0, false, 0.75, 6, { deploy: 0, energy: 0 });
  assert.equal(GameAudio.ersLevel(), 0, "empty battery through setEngine is silent");
});


test("boost cue respects zero trim and muted ERS cancels an active cue", () => {
  const { ErsLayer: E, ctx, live } = layer();
  E.update({ deploy: 1, energy: 1, boostTune: 0 });
  assert.equal(E.cueCount(), 0, "zero BOOST level also silences its onset cue");
  ctx.currentTime += 0.2;
  E.update({ deploy: 0, energy: 1 });
  E.update({ deploy: 1, energy: 1, boostTune: 0.5 });
  assert.equal(E.cueCount(), 1);
  const cueOsc = [...live].find(n => n.kind === "osc" && n.frequency.value === 660);
  const cue = cueOsc.connections[0];
  assert.ok(cue.gain.targets.some(x => x > 0 && x < 0.01), "half-level onset is below 0.01 gain");
  const cancels = cue.gain.cancels;
  E.update({ deploy: 1, energy: 1, layerOn: false });
  assert.equal(E.deployLevel(), 0);
  assert.equal(E.sustainLevel(), 0);
  assert.equal(cue.gain.value, 0);
  assert.equal(cue.gain.cancels, cancels + 1, "muting cancels the outstanding cue envelope");
});

test("deploy and onset use soft sine waves and a nonresonant lowpass", () => {
  const { live } = layer();
  const oscs = [...live].filter(n => n.kind === "osc");
  assert.ok(oscs.every(n => n.type === "sine"), "no bright triangle harmonics in boost layers");
  const lowpass = [...live].find(n => n.kind === "biquad" && n.type === "lowpass");
  assert.ok(lowpass && lowpass.frequency.value <= 1800 && lowpass.Q.value <= 0.5);
});
