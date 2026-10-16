/* rival-passby-pool.test.mjs — pass-by voice pool on RivalAudio.
 *
 * Engine notes live in engine.js (Audio PR #1527). This file owns the OTHER
 * half of a passing car: a fixed pool of whoosh voices with distance gain,
 * Doppler rate, and stereo pan, aimed with setTargetAtTime so a frame of
 * motion does not zipper. Zero per-frame node creation; steal by distance.
 *
 * Run: node --test tests/unit/rival-passby-pool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const fakeAudio = require("./fake-audio-vm.cjs");

const LAP = 1000;
const IDLE = 5000;

function car(o) { return { s: 0, x: 0, speed: 50, rpm: IDLE, retired: false, ...o }; }

function wrapParam(p) {
  if (!p || p._apexWrap) return p;
  p._apexWrap = true;
  p.targets = 0;
  const orig = p.setTargetAtTime.bind(p);
  p.setTargetAtTime = function (x, t, tau) {
    p.targets++;
    p.lastTau = tau;
    return orig(x, t, tau);
  };
  return p;
}

function countingContext(sandbox) {
  const audio = fakeAudio.install(sandbox);
  const Orig = sandbox.AudioContext;
  let creates = 0;
  sandbox.AudioContext = function CountingAC() {
    const ctx = new Orig();
    for (const name of ["createGain", "createBiquadFilter", "createOscillator",
      "createBufferSource", "createStereoPanner", "createDynamicsCompressor"]) {
      if (typeof ctx[name] !== "function") continue;
      const orig = ctx[name].bind(ctx);
      ctx[name] = function () {
        creates++;
        const node = orig();
        wrapParam(node.gain);
        wrapParam(node.pan);
        wrapParam(node.playbackRate);
        wrapParam(node.frequency);
        wrapParam(node.detune);
        return node;
      };
    }
    ctx.created = () => creates;
    return ctx;
  };
  return { audio, created: () => creates };
}

function load() {
  const sb = { Math, Array, Object, Number, console, Float32Array, isFinite, parseFloat };
  sb.window = sb;
  const count = countingContext(sb);
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8"), ctx, { filename: "consts.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8"), ctx, { filename: "rivals.js" });
  const RivalAudio = vm.runInContext("RivalAudio", ctx);
  return { RivalAudio, AudioContext: sb.AudioContext, created: count.created };
}

function boot(cars) {
  const { RivalAudio, AudioContext, created } = load();
  const G = { track: { total: LAP }, cars };
  const R = RivalAudio.create(G);
  const ac = new AudioContext();
  assert.equal(typeof R.attach, "function", "pass-by pool attaches to a real (or fake) AudioContext");
  R.attach(ac);
  return {
    R,
    ac,
    created,
    collect: (p) => [...R.collect(p)],
    state: () => [...R.passByState()],
    RivalAudio,
  };
}

test("gain falls with distance on the attached pass-by pool", () => {
  const me = car({ s: 500, x: 0 });
  const rival = car({ s: 506, x: 0 });
  const { collect, state } = boot([me, rival]);
  collect(me);
  const near = state().find((v) => v.gain > 0);
  assert.ok(near, "a car 6 m ahead opens a voice");
  const nearGain = near.gain;
  rival.s = 580;                          // 80 m ahead
  collect(me);
  const far = state().find((v) => v.slot === near.slot);
  assert.ok(far.gain < nearGain * 0.55, `80 m must be quieter than 6 m (${far.gain} vs ${nearGain})`);
  assert.ok(far.gain > 0, "80 m is still inside the audible radius");
});

test("Doppler raises pitch when approaching and lowers it when receding", () => {
  const me = car({ s: 500, speed: 60 });
  const rival = car({ s: 530, speed: 40 });   // slower ahead: closing
  const { collect, state } = boot([me, rival]);
  collect(me);
  const closing = state().find((v) => v.gain > 0);
  assert.ok(closing.rate > 1, `approaching must raise playbackRate, got ${closing.rate}`);
  rival.speed = 90;                          // faster ahead: opening
  collect(me);
  const opening = state().find((v) => v.slot === closing.slot);
  assert.ok(opening.rate < 1, `receding must lower playbackRate, got ${opening.rate}`);
  assert.ok(closing.rate > opening.rate, "closing is sharper than opening");
});

test("pan follows lateral position: left negative, right positive, ahead near centre", () => {
  const me = car({ s: 500, x: 0 });
  const rival = car({ s: 500, x: -3 });
  const { collect, state } = boot([me, rival]);
  collect(me);
  const left = state().find((v) => v.gain > 0);
  assert.ok(left.pan < -0.4, `alongside left must pan left, got ${left.pan}`);
  rival.x = 4;
  collect(me);
  const right = state().find((v) => v.slot === left.slot);
  assert.ok(right.pan > 0.4, `alongside right must pan right, got ${right.pan}`);
  rival.x = 0;
  rival.s = 540;
  collect(me);
  const ahead = state().find((v) => v.slot === left.slot);
  assert.ok(Math.abs(ahead.pan) < 0.08, `dead ahead must sit near centre, got ${ahead.pan}`);
});

test("the pool is a fixed size and tick creates no nodes", () => {
  const me = car({ s: 500 });
  const field = [me];
  for (let i = 1; i <= 12; i++) field.push(car({ s: 500 + i * 5 }));
  const { R, collect, state, created, ac } = boot(field);
  const afterAttach = created();
  assert.ok(afterAttach > 0, "attach builds the graph once");
  assert.equal(state().length, 4, "four voices, matching collect()'s SLOTS");
  const t0 = ac.currentTime;
  for (let i = 0; i < 30; i++) {
    ac.currentTime = t0 + i / 60;
    field[1].s = 505 + (i % 5);
    collect(me);
  }
  assert.equal(created(), afterAttach, "thirty frames must not create a node");
  assert.equal(state().length, 4, "the pool length is frozen");
  // collect() without attach still works (existing geometry tests)
  const bare = load().RivalAudio.create({ track: { total: LAP }, cars: [me, car({ s: 510 })] });
  assert.equal(bare.collect(me).length, 1);
  assert.equal([...bare.passByState()].length, 0, "no graph until attach");
});

test("voice stealing is by distance: a closer newcomer takes the farthest slot", () => {
  const me = car({ s: 500 });
  const a = car({ s: 510 }), b = car({ s: 520 }), c = car({ s: 530 }), d = car({ s: 540 });
  const late = car({ s: 700 });
  const { collect, state } = boot([me, a, b, c, d, late]);
  collect(me);
  const before = Object.fromEntries(state().filter((v) => v.gain > 0).map((v) => [v.slot, v.dist]));
  assert.equal(Object.keys(before).length, 4);
  const farSlot = state().sort((x, y) => y.dist - x.dist)[0].slot;
  late.s = 505;                             // 5 m: nearer than all four
  collect(me);
  const stolen = state().find((v) => v.slot === farSlot);
  assert.ok(stolen.dist < 8, `the farthest voice is restolen for the 5 m car, dist ${stolen.dist}`);
  assert.ok(stolen.gain > state().filter((v) => v.slot !== farSlot).reduce((m, v) => Math.max(m, v.gain), 0) * 0.8,
    "the stolen voice is now the loudest (nearest) pass-by");
});

test("aim uses setTargetAtTime with a tau, never a raw per-frame value poke", () => {
  const me = car({ s: 500 });
  const rival = car({ s: 508, x: -2, speed: 40 });
  const { R, collect, ac } = boot([me, rival]);
  collect(me);
  const voices = R.passByVoices();
  assert.ok(Array.isArray(voices) && voices.length === 4);
  const live = voices.find((v) => v.gain.gain.value > 0);
  assert.ok(live, "a voiced car");
  assert.ok(live.gain.gain.targets >= 1, "gain is aimed");
  assert.ok(live.src.playbackRate.targets >= 1, "Doppler rate is aimed");
  assert.ok(live.pan.pan.targets >= 1, "pan is aimed");
  assert.ok(live.gain.gain.lastTau > 0 && live.gain.gain.lastTau <= 0.2, "gain tau is a short ramp, not a snap");
  const src = fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(src, /setTargetAtTime/, "the pool ramps; zipper noise is a raw .value write");
  ac.currentTime += 0.016;
  rival.s = 512;
  collect(me);
  assert.ok(live.gain.gain.targets >= 2, "a moved car re-aims, it does not assign .value");
});


test("pass-by hiss is softer alongside and follows relative motion", () => {
  const me = car({ s: 500, speed: 50 });
  const rival = car({ s: 500, x: 3, speed: 50 });
  const { R, collect, state } = boot([me, rival]);
  collect(me);
  const steady = state().find(v => v.gain > 0);
  assert.ok(steady.gain < 0.01, "holding station must not sustain a loud fly-by");
  rival.speed = 95; collect(me);
  const passing = state().find(v => v.slot === steady.slot);
  assert.ok(passing.gain > steady.gain * 5 && passing.gain <= 0.07);
  const voice = R.passByVoices()[steady.slot];
  assert.ok(voice.filt.frequency.value <= 2400 && voice.filt.Q.value <= 0.5, "no 12 kHz resonant hiss");
});
