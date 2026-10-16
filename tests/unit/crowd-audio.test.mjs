/* crowd-audio.test.mjs — Radio r9 trackside crowd ambience.
 *
 * Bed runs in a live race; silent on podium/results, countdown, pause, and
 * with SFX off. Swells on a climb into P1–P3 and on finish are capped.
 * No per-frame node allocations once attached.
 *
 * Run: node --test tests/unit/crowd-audio.test.mjs
 *      npm run test:audio-unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/crowd.js"), "utf8");
const SIGNAL = fs.readFileSync(path.join(ROOT, "js/audio/signal.js"), "utf8");

function param(v) {
  const p = {
    value: v, targets: [],
    setTargetAtTime(x) { p.value = x; p.targets.push(x); p._apexCrowdTgt = x; },
    setValueAtTime(x) { p.value = x; },
    linearRampToValueAtTime(x) { p.value = x; },
    exponentialRampToValueAtTime(x) { p.value = x; },
    cancelScheduledValues() {},
  };
  return p;
}

function countingContext() {
  let created = 0;
  function node(kind) {
    created++;
    return {
      kind, connect(t) { return t; }, disconnect() {}, start() {}, stop() {},
      type: "", loop: false, buffer: null,
      gain: param(0), frequency: param(900), Q: param(1),
      playbackRate: param(1),
    };
  }
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
    createGain: () => node("gain"),
    createBiquadFilter: () => node("biquad"),
    createBufferSource: () => node("src"),
    createBuffer: (ch, len, sr) => ({
      sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch,
      getChannelData: () => new Float32Array(len),
    }),
  };
  return { ctx, created: () => created, resetCreated: () => { created = 0; } };
}

function boot(opts) {
  const o = opts || {};
  const { ctx, created, resetCreated } = countingContext();
  let sfxEnabled = true;
  const bus = ctx.createGain();
  resetCreated();
  const results = { hidden: true };
  const G = {
    state: o.state || "race",
    paused: !!o.paused,
    photoMode: !!o.photoMode,
    track: { total: 5000, props: o.props || [] },
    player: o.player || { s: 50, pos: 5, finished: false },
  };
  const GameAudio = {
    _stub: false,
    enabled: () => true,
    context: () => ctx,
    sfxBus: () => bus,
    setEngine() {},
    stopEngine() {},
    setGridIdle() {},
    setSfxEnabled(b) { sfxEnabled = !!b; return sfxEnabled; },
    finish() {},
    startEngine() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, isFinite, Float32Array,
    GameAudio,
    document: { getElementById: (id) => (id === "results" ? results : null) },
    GLX: o.mobile ? { isMobile: true, mobileTier: true } : undefined,
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(SIGNAL, vctx, { filename: "signal.js" });
  vm.runInContext(SRC, vctx, { filename: "crowd.js" });
  const CrowdAudio = vm.runInContext("CrowdAudio", vctx);
  const GameAudioSignal = vm.runInContext("GameAudioSignal", vctx);
  const host = {
    context: () => ctx,
    bus: () => bus,
    sfxOk: () => sfxEnabled,
    now: () => ctx.currentTime,
  };
  GameAudioSignal.create(host);
  CrowdAudio.bindHost(host);
  CrowdAudio.bind(G);
  CrowdAudio.attach(ctx, bus);
  resetCreated();
  return { CrowdAudio, GameAudio, G, ctx, bus, results, created, resetCreated, sfx: {
    get on() { return sfxEnabled; },
    set on(v) { sfxEnabled = !!v; },
  } };
}

test("bed is audible during a live race near the pit straight", () => {
  const { CrowdAudio, G, ctx } = boot({ player: { s: 40, pos: 8, finished: false } });
  CrowdAudio.update();
  const bed = CrowdAudio.inspect().bed;
  assert.ok(bed > 0.01, `race bed should be up, got ${bed}`);
  assert.equal(CrowdAudio.liveOk(), true);
  // Closer to s=0 → higher proximity.
  G.player.s = 10;
  ctx.currentTime += 0.05;
  CrowdAudio.update();
  const near = CrowdAudio.inspect().bed;
  G.player.s = 2000;
  ctx.currentTime += 0.05;
  CrowdAudio.update();
  const mid = CrowdAudio.inspect().bed;
  assert.ok(near > mid, `pit-straight bed ${near} should exceed mid-lap ${mid}`);
});

test("silent on countdown, pause, results, and SFX off", () => {
  const b = boot();
  b.CrowdAudio.update();
  assert.ok(b.CrowdAudio.inspect().bed > 0, "precondition: race bed up");

  b.G.state = "count";
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "countdown silent");

  b.G.state = "race";
  b.G.paused = true;
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "pause silent");

  b.G.paused = false;
  b.G.photoMode = true;
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "photo mode silent");

  b.G.photoMode = false;
  b.results.hidden = false;
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "results sheet silent");

  b.results.hidden = true;
  b.G.state = "results";
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "results state silent");

  b.G.state = "race";
  b.GameAudio.setSfxEnabled(false);
  b.ctx.currentTime += 0.05;
  b.CrowdAudio.update();
  assert.equal(b.CrowdAudio.inspect().bed, 0, "SFX off silent");
});

test("P3 overtake and chequered-flag swells are capped", () => {
  const { CrowdAudio, G, ctx, GameAudio } = boot({ player: { s: 100, pos: 5, finished: false } });
  CrowdAudio._setPos(5);
  G.player.pos = 3;
  ctx.currentTime += 0.05;
  CrowdAudio.update();
  const afterPass = CrowdAudio.inspect();
  assert.ok(afterPass.swell > 0, "P3 climb starts a swell");
  assert.ok(afterPass.bed <= 0.11 + 1e-6, `swell capped, bed=${afterPass.bed}`);

  CrowdAudio._resetEvents();
  CrowdAudio.silence();
  ctx.currentTime += 3;
  G.player.finished = true;
  CrowdAudio.update();
  const afterFlag = CrowdAudio.inspect();
  assert.ok(afterFlag.swell > 0 || afterFlag.bed > 0.01, "chequered swell/bed");
  assert.ok(afterFlag.bed <= 0.11 + 1e-6, `flag swell capped, bed=${afterFlag.bed}`);

  GameAudio.finish();
  assert.ok(CrowdAudio.inspect().bed <= 0.11 + 1e-6, "finish() swell still capped");
});

test("attach builds a fixed graph; update allocates no nodes", () => {
  const { CrowdAudio, ctx, created, resetCreated } = boot();
  assert.ok(CrowdAudio._cheerPool() >= 2, "cheer pool present");
  resetCreated();
  for (let i = 0; i < 30; i++) {
    ctx.currentTime += 0.016;
    CrowdAudio.update();
  }
  assert.equal(created(), 0, "no per-frame AudioNode allocations");
});

test("GameAudioSignal.lastHost is published for the crowd leaf", () => {
  const { ctx } = countingContext();
  const bus = ctx.createGain();
  const sb = { Math, console, Object, Array, Number, isFinite, Float32Array, CrowdAudio: undefined };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(SIGNAL, vctx, { filename: "signal.js" });
  const GameAudioSignal = vm.runInContext("GameAudioSignal", vctx);
  const host = { context: () => ctx, bus: () => bus, sfxOk: () => true, now: () => 0 };
  GameAudioSignal.create(host);
  assert.equal(GameAudioSignal.lastHost(), host);
});

test("setGridIdle and stopEngine silence the bed", () => {
  const { CrowdAudio, GameAudio, ctx } = boot();
  CrowdAudio.update();
  assert.ok(CrowdAudio.inspect().bed > 0);
  GameAudio.setGridIdle();
  assert.equal(CrowdAudio.inspect().bed, 0, "grid idle silences");
  ctx.currentTime += 0.05;
  CrowdAudio.update();
  // still in race state — update may revive; simulate countdown silence via state
  // stopEngine path:
  CrowdAudio.update();
  GameAudio.stopEngine();
  assert.equal(CrowdAudio.inspect().bed, 0, "stopEngine silences");
});
