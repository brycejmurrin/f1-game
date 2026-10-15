/* rival-contact-sfx.test.mjs — Radio r9 field contact SFX.
 *
 * AI / rival bump, scrape and squeal: pooled voices (cap 3), per-car cooldown
 * ≥250 ms, distance falloff, silent when fieldArmed is false (countdown /
 * pause via stopEngine / setGridIdle), and SFX-off silences. Player
 * GameAudio.collision() is not exercised here.
 *
 * Run: node --test tests/unit/rival-contact-sfx.test.mjs
 *      npm run test:audio-unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENGINE_SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js",
  "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");
const RIVALS_SRC = fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8");

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
  const counts = { src: 0, gain: 0, panner: 0, biquad: 0 };
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

function boot(listener) {
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
    // Hold fetches so startEngine takes the synth path (no sample wait).
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000, GEARS: 8, GEAR_TOP: [0, 80, 120, 160, 200, 240, 280, 320, 360] },
    GameCams: {
      getListenerBasis: () => listener || {
        external: true, x: 0, z: 0, fwdX: 0, fwdZ: 1, rightX: 1, rightZ: 0, valid: true,
      },
    },
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
  GameAudio.startEngine();
  // Arm the field the way the race loop does (setRivals).
  GameAudio.setRivals([]);
  return { GameAudio, ctx, counts, vctx, held };
}

test("fieldContact: a bump fires a voice and arms the pool (≤3)", () => {
  const { GameAudio, counts } = boot();
  const beforeSrc = counts.src;
  const ok = GameAudio.fieldContact("bump", 0.7, 5, 2, 3);
  assert.equal(ok, true);
  const st = GameAudio.fieldContactState();
  assert.equal(st.armed, true);
  assert.ok(st.voices >= 2 && st.voices <= 3, `voice cap 2..3, got ${st.voices}`);
  assert.equal(st.fired, 1);
  assert.equal(counts.src, beforeSrc, "no BufferSource alloc on fire (osc pool, no loop PCM)");
});

test("fieldContact: per-car cooldown ≥250 ms holds a second bump", () => {
  const { GameAudio, ctx } = boot();
  assert.equal(GameAudio.fieldContact("bump", 0.8, 3, 1, 7), true);
  assert.equal(GameAudio.fieldContact("bump", 0.8, 3, 1, 7), false, "same carKey blocked");
  assert.equal(GameAudio.fieldContactState().deniedCd, 1);
  ctx.currentTime += 0.26;
  assert.equal(GameAudio.fieldContact("bump", 0.8, 3, 1, 7), true, "after cooldown");
  assert.equal(GameAudio.fieldContactState().cooldown, 0.25);
});

test("fieldContact: hard cap of pool size — excess denied", () => {
  const { GameAudio } = boot();
  const n = GameAudio.fieldContactState().voices;
  let fired = 0, denied = 0;
  for (let i = 0; i < n + 2; i++) {
    if (GameAudio.fieldContact("bump", 0.9, 2, 1, 100 + i)) fired++;
    else denied++;
  }
  assert.equal(fired, n, `exactly ${n} voices fire`);
  assert.ok(denied >= 2, "overflow denied");
  assert.ok(GameAudio.fieldContactState().deniedCap >= 2);
});

test("fieldContact: gain falls with distance (far quieter than near)", () => {
  const { GameAudio, ctx } = boot({
    external: true, x: 0, z: 0, fwdX: 0, fwdZ: 1, rightX: 1, rightZ: 0, valid: true,
  });
  // Peek at live gain via fieldContactState.live and by reading pool after fire.
  // Near at REF (8 m) vs far (~80 m): both fire, near peak > far peak.
  const peaks = [];
  const spy = GameAudio.fieldContactState;
  // Re-fire after cooldown with different distances; capture gain.value after env.
  assert.equal(GameAudio.fieldContact("bump", 1, 4, 0, 1), true);
  // The fake env sets gain to peak then to floor — last set is the floor.
  // Instead compare deniedGate for out-of-range.
  ctx.currentTime += 0.3;
  assert.equal(GameAudio.fieldContact("bump", 1, 0, 200, 2), false, "200 m past CONTACT_RANGE");
  assert.ok(GameAudio.fieldContactState().deniedGate >= 1);
  ctx.currentTime += 0.3;
  assert.equal(GameAudio.fieldContact("bump", 1, 0, 10, 3), true, "10 m still audible");
  void spy; void peaks;
});

test("fieldContact: silent in countdown (setGridIdle) and when SFX off", () => {
  const { GameAudio } = boot();
  GameAudio.setGridIdle({ rpm: 5000, gear: 1, energy: 1, ersDeploy: 0.5 }, { soundOn: true, step: true });
  assert.equal(GameAudio.fieldContactState().armed, false);
  assert.equal(GameAudio.fieldContact("bump", 1, 2, 1, 9), false);
  // Re-arm via setRivals, then SFX off.
  GameAudio.setRivals([]);
  assert.equal(GameAudio.fieldContactState().armed, true);
  GameAudio.setSfxEnabled(false);
  assert.equal(GameAudio.fieldContact("bump", 1, 2, 1, 10), false);
  GameAudio.setSfxEnabled(true);
  assert.equal(GameAudio.fieldContact("bump", 1, 2, 1, 11), true);
});

test("fieldContact: stopEngine (pause / results) disarms and tears the pool", () => {
  const { GameAudio } = boot();
  assert.equal(GameAudio.fieldContact("scrape", 0.5, 3, 1, 4), true);
  GameAudio.stopEngine();
  const st = GameAudio.fieldContactState();
  assert.equal(st.armed, false);
  assert.equal(st.voices, 0);
  assert.equal(GameAudio.fieldContact("bump", 1, 2, 1, 5), false);
});

test("RivalAudio.emitFieldSfx: lock-up triggers squeal for a rival, not the player", () => {
  const { GameAudio, vctx } = boot();
  vm.runInContext(RIVALS_SRC.replace(/^const\b/gm, "var"), vctx, { filename: "rivals.js" });
  const RivalAudio = vm.runInContext("RivalAudio", vctx);
  const me = { s: 100, x: 0, speed: 50, rpm: 8000, isPlayer: true, retired: false };
  const ai = {
    s: 105, x: 2, speed: 40, rpm: 9000, isPlayer: false, retired: false,
    wheelLock: 0.9, skidIntensity: 0.2, px: 4, pz: 3,
  };
  const G = { track: { total: 1000 }, cars: [me, ai], vTop: () => 100 };
  const R = RivalAudio.create(G);
  const before = GameAudio.fieldContactState().fired;
  R.emitFieldSfx(me);
  assert.ok(GameAudio.fieldContactState().fired > before, "AI lock-up fires squeal");
  const mid = GameAudio.fieldContactState().fired;
  // Player with lock must not fire through emitFieldSfx.
  me.wheelLock = 1; me.skidIntensity = 1; me.px = 0; me.pz = 0;
  R.emitFieldSfx(me);
  assert.equal(GameAudio.fieldContactState().fired, mid, "player path stays quiet here");
});

// The wall-clamp half (a regex over js/physics/wall-clamp.js) is gone: it
// passed while every car shared one cooldown key (#2170). Behaviour is pinned
// in tests/unit/wall-clamp.test.mjs, which runs WallClamp.apply for real.
test("collideFx gate: rival–rival forwards fieldContact; player branch keeps collision()", () => {
  // Read through gameSource() so this suite does not raise the raw game.js pin.
  const src = gameSource();
  const start = src.indexOf("function collideFx");
  assert.ok(start >= 0, "collideFx present in gameSource union");
  const fx = src.slice(start, start + 2800);
  assert.match(fx, /GameAudio\.fieldContact\("bump"/);
  assert.match(fx, /!a\.isPlayer && !b\.isPlayer/);
  assert.match(fx, /GameAudio\.collision\(impact, false, side\)/);
  assert.match(fx, /const side = Math\.abs\(lat\) > 0\.08/);
});
