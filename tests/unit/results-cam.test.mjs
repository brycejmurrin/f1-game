/* results-cam.test.mjs — chequered / orbit / highlights (js/camera/results-cam.js),
 * plus the HIGHLIGHTS montage audio feed from game.js tickBody.
 * Run: node --test tests/unit/results-cam.test.mjs
 */
import { renderRateStubs } from "../helpers/render-rate-stub.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot(globals = {}, perfTier = 0) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    PerfGov: { tier: () => perfTier },
    ...globals,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/results-cam.js"), ctx, { filename: "results-cam.js" });
  vm.runInContext(src("js/camera/replay-buf.js"), ctx);
  vm.runInContext(src("js/core/mat4.js"), ctx);
  const R = vm.runInContext("ResultsCam", ctx);
  return { ...R, ReplayBuf: vm.runInContext("ReplayBuf", ctx), M4: vm.runInContext("M4", ctx) };
}

test("orbitPose is finite and highlightsReel respects budget + order", () => {
  const R = boot();
  const pose = R.orbitPose(10, 1, -5, Math.PI / 4);
  assert.ok(pose.eye.every(Number.isFinite));
  assert.ok(pose.target.every(Number.isFinite));

  const tags = [
    { kind: "contact", t: 1, car: 0 },
    { kind: "retirement", t: 8, car: 2 },
    { kind: "chequered", t: 19, car: 0 },
  ];
  const reel = R.highlightsReel(tags, 0, 20, 12);
  assert.ok(reel.length >= 2);
  let span = 0;
  for (const c of reel) {
    assert.ok(c.t1 > c.t0);
    span += c.t1 - c.t0;
  }
  assert.ok(span <= 12 + 1e-6);
  assert.ok(reel[0].t0 <= reel[reel.length - 1].t0);
});

test("create: chequered → orbit; disabled on mobile / high PerfGov tier", () => {
  const R = boot();
  const player = { s: 0, x: 0, px: 1, py: 1, pz: 2, head: 0, speed: 40, finPos: 1 };
  const G = {
    player, cars: [player], dbgCam: null, netPlay: { active: () => false },
    gfx: { isMobile: false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }),
  };
  const api = R.create(G);
  assert.equal(api.onFlag(), true);
  assert.equal(api.live(), true);
  assert.equal(api.status().phase, "chequered");
  assert.ok(G.dbgCam && G.dbgCam._resultsCam);

  // Advance past CHEQ_S
  for (let i = 0; i < 80; i++) api.tick(1 / 30);
  assert.equal(api.status().phase, "orbit");
  assert.ok(api.live());

  // Mobile off
  G.gfx.isMobile = true;
  api.reset();
  assert.equal(api.onFlag(), false);
  assert.equal(api.live(), false);
});

test("PerfGov tier >= 2 turns the results camera off; tier 1 keeps it", () => {
  const car = { s: 0, x: 0, px: 1, py: 1, pz: 2, head: 0, speed: 40, finPos: 1 };
  const mk = (tier) => {
    const G = { player: car, cars: [car], dbgCam: null, netPlay: { active: () => false }, gfx: { isMobile: false },
      camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }) };
    return { G, api: boot({}, tier).create(G) };
  };
  for (const tier of [2, 3]) {
    const { G, api } = mk(tier);
    assert.equal(api.onFlag(), false, `tier ${tier} refuses the finish cut`);
    assert.equal(api.live(), false);
    assert.equal(G.dbgCam, null, "no camera installed under load");
  }
  const { G, api } = mk(1);
  assert.equal(api.onFlag(), true, "tier 1 still runs the finish cut");
  assert.ok(G.dbgCam && G.dbgCam._resultsCam);
});

test("highlight windows fit end tags, short recordings and the actual budget", () => {
  const R = boot();
  const finish = R.highlightsReel([{ t: 20 }], 0, 20, 4);
  assert.equal(finish[0].t0, 16);
  assert.equal(finish[0].t1, 20);
  const short = R.highlightsReel([{ t: 10 }, { t: 10.5 }, { t: 11 }], 10, 11, 2.5);
  assert.equal(short.length, 1, "same-subject overlapping tags share one clip");
  assert.equal(short.reduce((sum, clip) => sum + clip.t1 - clip.t0, 0), 1);
  assert.equal(short[0].events.length, 3, "every tag remains identified in the merged moment");
  for (const clip of short) assert.ok(clip.t0 >= 10 && clip.t1 <= 11 && clip.t1 > clip.t0);
  assert.equal(R.highlightsReel([{ t: 10 }], 10, 10, 4).length, 0);
  assert.equal(R.highlightsReel([{ t: 10 }], 11, 10, 4).length, 0);
});

test("untagged subsecond highlights stay inside the recording and finish promptly", () => {
  const R = boot(), car = { finPos: 1, s: 0, px: 0, pz: 0 }, applied = [];
  const G = { player: car, cars: [car], gfx: {},
    camVantage: () => ({ eye: [0, 5, -10], tgt: [0, 0, 0] }) };
  const camera = R.create(G);
  let end = 10.2;
  camera.attachReplay({ window: () => ({ t0: 10, t1: end, frames: 6 }), tags: () => [],
    beginScrub: () => true, apply: (t) => applied.push(t), endScrub() {} });
  camera.onFlag();
  assert.equal(camera.startHighlights(), true);
  camera.tick(.1);
  assert.ok(applied.every((t) => t >= 10 && t <= 10.2));
  camera.tick(.11);
  assert.equal(camera.status().phase, "orbit", "short recording has no frozen tail");
  end = 10;
  assert.equal(camera.startHighlights(), false, "empty recording cannot acquire replay");
});

test("game.js gates results early-return on ResultsCam.live()", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /ResultsCam\.create\(G[,)]/);
  assert.match(game, /state === "results" && !resultsCam\.live\(\)/);
  assert.match(game, /resultsCam\.onFlag\(/);
});

function recordedFinish() {
  const R = boot();
  const car = { s: 1, x: 2, head: .3, speed: 20, px: 10, py: 1, pz: 30, steer: .2, yawVis: .4, finPos: 1 };
  const G = { player: car, cars: [car], raceT: 0, gfx: {}, netPlay: { active: () => false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }) };
  const replay = R.ReplayBuf.create(G);
  for (let i = 0; i < 4; i++) { G.raceT = i; car.px = 10 + i; replay.sample(i, G.cars); }
  Object.assign(car, { s: 100, px: 200, pz: 300, head: 1, yawVis: 2,
    rPrevS: 99, rPrevX: 0, rPrevPx: 190, rPrevPz: 290, rPrevHead: .9, rPrevYawVis: undefined });
  const finish = { ...car };
  const camera = R.create(G); camera.attachReplay(replay); camera.onFlag();
  return { R, G, car, finish, replay, camera };
}

test("chequered and orbit cameras produce finite renderer projection matrices", () => {
  const { R, G, camera } = recordedFinish();
  for (const orbit of [false, true]) {
    if (orbit) camera.startOrbit();
    const m = new Float32Array(16);
    R.M4.perspectiveTo(m, G.dbgCam.fov * Math.PI / 180, 1.6, .1, G.dbgCam.far);
    assert.ok(m.every(Number.isFinite), "results camera must produce a usable projection");
    for (const k of ["eye", "target"]) {
      assert.equal(G.dbgCam[k].length, 3, `${k} is a 3-vector`);
      assert.ok(G.dbgCam[k].every(Number.isFinite), `${orbit ? "orbit" : "chequered"} ${k} is finite`);
    }
    assert.ok(Number.isFinite(G.dbgCam.fov) && G.dbgCam.fov > 0);
  }
});

test("montage poses render consistently at every interpolation fraction and restore the finish", () => {
  const { car, finish, replay, camera } = recordedFinish();
  assert.equal(camera.startHighlights(), true);
  const pose = replay.at(replay.window().t0).cars[0];
  for (const alpha of [0, .5, 1]) {
    for (const [current, previous] of [["s", "rPrevS"], ["px", "rPrevPx"], ["pz", "rPrevPz"], ["yawVis", "rPrevYawVis"]]) {
      assert.equal(car[previous] + (car[current] - car[previous]) * alpha, pose[current], `${current} at alpha=${alpha}`);
    }
  }
  for (let i = 0; i < 150; i++) camera.tick(1 / 30);
  assert.equal(camera.status().phase, "orbit");
  assert.deepEqual(car, finish, "montage completion restores exact finish pose and property presence");
  assert.equal(replay.isScrubbing(), false);
  assert.equal(camera.startHighlights(), true);
  camera.reset();
  assert.deepEqual(car, finish, "cancel/restart restores exact finish pose");
  assert.equal(replay.isScrubbing(), false);
  assert.equal(camera.startHighlights(), false, "idle results cannot acquire the next session's replay");
});

test("a retained highlights control cannot acquire an online session", () => {
  const { G, car, finish, replay, camera } = recordedFinish();
  G.netPlay.active = () => true;
  assert.equal(camera.startHighlights(), false);
  assert.equal(camera.startOrbit(), false);
  assert.deepEqual(car, finish);
  assert.equal(replay.isScrubbing(), false);
});

test("HIGHLIGHTS button stays hidden when ReplayBuf has no scrubbable footage", () => {
  const nodes = new Map();
  const menu = { parentNode: { insertBefore(el) { nodes.set(el.id, el); } } };
  nodes.set("res-menu", menu);
  const document = {
    getElementById: (id) => nodes.get(id) || null,
    createElement: (tag) => ({
      tagName: tag, id: "", hidden: false, disabled: false, title: "",
      type: "", textContent: "", onclick: null,
    }),
  };
  const R = boot({ document });
  const car = { finPos: 1, s: 0, px: 0, pz: 0 };
  const G = { player: car, cars: [car], gfx: {},
    camVantage: () => ({ eye: [0, 5, -10], tgt: [0, 0, 0] }) };
  const camera = R.create(G);
  camera.attachReplay({ window: () => ({ t0: 0, t1: 0, frames: 0 }), tags: () => [],
    beginScrub: () => true, apply() {}, endScrub() {} });
  camera.onFlag();
  const btn = nodes.get("res-highlights");
  assert.ok(btn, "ensureHighlightsButton creates the control");
  assert.equal(btn.hidden, true, "empty ReplayBuf must not offer HIGHLIGHTS");
  assert.equal(btn.disabled, true);
  assert.match(btn.title, /No recorded footage/i);
  assert.equal(camera.startHighlights(), false);
});

test("highlights frame the tagged car after posing, including a retirement, then return to the winner", () => {
  const R = boot(), winner = { finPos: 1, s: 10, px: 10, pz: 0 }, retired = { finPos: 2, retired: true, s: 800, px: 800, pz: 0 };
  const G = { player: winner, cars: [winner, retired], gfx: {},
    camVantage: (_mode, s) => ({ eye: [s, 5, -10], tgt: [s, 0, 0], fov: 58 }) };
  const camera = R.create(G);
  camera.attachReplay({ window: () => ({ t0: 0, t1: 20, frames: 600 }),
    tags: () => [{ kind: "retirement", t: 10, car: 1 }, { kind: "contact", t: 15, car: 99 }],
    beginScrub: () => true, apply: () => { retired.s = retired.px = 700; },
    endScrub: () => { retired.s = retired.px = 800; } });
  camera.onFlag();
  assert.equal(G.dbgCam.target[0], 10, "flag frames the winner");
  assert.equal(camera.startHighlights(), true);
  assert.equal(G.dbgCam.target[0], 700, "retirement clip uses its newly posed subject, even though retired");
  assert.equal(G.player, winner, "presentation never changes player ownership");
  camera.tick(4.1);
  assert.equal(G.dbgCam.target[0], 10, "a missing tag subject falls back to the winner");
  camera.tick(4.1);
  assert.equal(camera.status().phase, "orbit");
  assert.equal(G.dbgCam.target[0], 10);
  assert.equal(retired.px, 800, "ending the montage restores the live pose");
});


test("losing results eligibility during a montage restores the finish and releases replay", () => {
  const { R, G, car, finish, replay } = recordedFinish();
  let allowed = true;
  const camera = R.create(G, () => allowed); camera.attachReplay(replay); camera.onFlag();
  assert.equal(camera.startHighlights(), true);
  assert.equal(replay.isScrubbing(), true);
  allowed = false;
  assert.equal(camera.tick(1 / 30), false);
  assert.equal(camera.live(), false);
  assert.equal(replay.isScrubbing(), false);
  assert.deepEqual(car, finish);
});

// RESULTS HIGHLIGHTS AUDIO. Survey bc-c28828df measured the montage at -87 dB
// live: GameAudio.feedReplayScrub (#1262) only ran on tickBody's paused return,
// and the results scrub (startHighlights -> ReplayBuf.beginScrub) starts after
// endRace has stopped the engine, so nothing fed it. tickBody now hands every
// non-race frame to the same feed, scrubbing only while a results scrub is live:
// engine + field play over each clip, and the frame after the scrub ends (orbit,
// NEXT, RACE AGAIN, MENU — each goes through resultsCam.reset/startOrbit ->
// endScrub) the existing one-shot silences them. No HIGHLIGHTS, no audio (#1246).
// Runs the REAL tickBody against the real ResultsCam, ReplayBuf and GameAudio
// (engine.js on a recording AudioContext).
const TICK = symbolSource("function tickBody(now) {");
const FEED = "GameAudio.feedReplayScrub(soundOn && player, state === \"results\" && replayBuf.isScrubbing(), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop);";

function param(v) {
  const p = { value: v, setTargetAtTime(x) { p.value = x; }, setValueAtTime(x) { p.value = x; },
    linearRampToValueAtTime(x) { p.value = x; }, exponentialRampToValueAtTime(x) { p.value = x; }, cancelScheduledValues() {} };
  return p;
}
function node(kind) {
  return { kind, connect: (t) => t, disconnect() {}, start() {}, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0,
    buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0, getFloatFrequencyData() {},
    gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1) };
}

function bootAudio() {
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"),
    createOscillator: () => node("osc"), createBufferSource: () => node("src"), createAnalyser: () => node("analyser"),
    createWaveShaper: () => Object.assign(node("shaper"), { curve: null }),
    createConvolver: () => Object.assign(node("convolver"), { buffer: null }),
    createStereoPanner: () => Object.assign(node("panner"), { pan: param(0) }),
    createDynamicsCompressor: () => Object.assign(node("comp"),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: () => new Promise(() => {}), createMediaElementSource: () => node("mediaSrc"),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; }, fetch: () => new Promise(() => {}),
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  const SRC = ["js/core/mat4.js", "js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/engine.js"]
    .map(src).join("\n");
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const real = vm.runInContext("GameAudio", vctx);
  real.init();
  // Count the one-shot: feedReplayScrub's exit branch calls stopEngine through its
  // own closure, so the observable is engineOn falling while a scrub was fed.
  const log = { feeds: 0, scrubFeeds: 0 };
  const GameAudio = {
    feedReplayScrub(p, scrubbing, ...rest) { log.feeds++; if (scrubbing) log.scrubFeeds++; return real.feedReplayScrub(p, scrubbing, ...rest); },
  };
  return { real, GameAudio, log };
}

function highlightsRig({ sound = true } = {}) {
  const sb = { Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array, isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } }, PerfGov: { tier: () => 0 } };
  sb.window = sb;
  const camCtx = vm.createContext(sb);
  vm.runInContext(src("js/camera/results-cam.js"), camCtx);
  vm.runInContext(src("js/camera/replay-buf.js"), camCtx);
  const ResultsCam = vm.runInContext("ResultsCam", camCtx), ReplayBuf = vm.runInContext("ReplayBuf", camCtx);

  const player = { s: 0, x: 0, head: 0, speed: 60, px: 0, py: 0, pz: 0, steer: 0, yawVis: 0, rpm: 5000, energy: 1, offroad: false, finPos: 1 };
  const rival = { s: 0, x: 3, head: 0, speed: 58, px: 3, py: 0, pz: 0, steer: 0, yawVis: 0, rpm: 5000, finPos: 2 };
  const cars = [player, rival];
  const G = { player, cars, raceT: 0, gfx: {}, dbgCam: null, netPlay: { active: () => false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }) };
  const replayBuf = ReplayBuf.create(G);
  for (let i = 0; i < 90; i++) {   // 3 s of race in the ring; untagged, so the reel is the window clip
    const t = i / 30; G.raceT = t;
    for (const c of cars) { c.s = c.speed * t; c.pz = c.s; }
    replayBuf.sample(t, cars);
  }
  const resultsCam = ResultsCam.create(G); resultsCam.attachReplay(replayBuf);

  const audio = bootAudio();
  const field = { collects: 0 };
  const rivalAudio = { collect(p) { field.collects++; return cars.filter((c) => c !== p).map((c, k) => ({ lat: 3, arc: 4 + k, rev: 0.7, approach: 0, slot: k })); } };
  const noop = () => {};
  const tickCtx = vm.createContext({
    ...renderRateStubs(),
    Math, performance: { now: () => 0 }, PerfSpans: { begin() {}, end() {} }, lastFrame: 0, paused: false, state: "results",
    gfx: { warming: () => false }, Input: { poll: noop, clearEdges: noop, setTimeScale: noop }, BrakeCue: { tick: noop }, onboard: { tick: noop },
    netPlay: { tick: noop, active: () => false }, netStart: null, countT: 0, startLights: { countCredit: () => 0 }, PerfGov: { tick: noop, recordSimulation: noop }, UiExperience: { resumeHolding: () => false },
    director: { tick: noop, reset: noop }, mirrorPass: { preparing: () => false }, replayBuf, resultsCam, raceT: 3,
    GameAudio: audio.GameAudio, soundOn: sound, player, cars, rivalAudio,
    naturalGear: (v) => (v < 30 ? 2 : 6), rpmFor: (g, v) => Math.min(15000, 5000 + v * 1000 / g), isWetRoad: () => false, vTop: () => 90,
    _poseAt: null, photoMode: false, setupPreviewOn: false, announceT: 0, hitStop: 0, frozen: false, track: {}, physAcc: 0, PHYS_DT: 1 / 60,
    banner: { tick() {}, clear() {}, announce() {}, get t() { return 0; } }, feel: { shake: 0, camRoll: 0, hitStop: 0 },
    renderAlpha: 0, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), updateHud: noop, render: noop, update: noop, updatePhotoCam: noop,
  });
  vm.runInContext(TICK, tickCtx, { filename: "js/game.js#tickBody" });
  let now = 0;
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { now += 1000 / 60; tickCtx.tickBody(now); } };
  return { tickCtx, frame, resultsCam, replayBuf, audio, field, player, rival };
}

test("game.js feeds feedReplayScrub from the results tick, off the race/count frames, unchanged #1262 call", () => {
  const at = TICK.indexOf(FEED);
  assert.ok(at > 0, "tickBody hands non-race frames to GameAudio.feedReplayScrub, scrubbing only for a results scrub");
  const line = TICK.slice(TICK.lastIndexOf("\n", at) + 1, TICK.indexOf("\n", at));
  assert.match(line, /^\s*if \(state !== "race" && state !== "count"\) GameAudio\.feedReplayScrub\(/,
    "never on race/count frames: a RACE AGAIN that inherits the montage engine is not cut on the grid");
  assert.ok(TICK.indexOf("resultsCam.tick(") < at && at < TICK.indexOf('PerfSpans.begin("render"); render('),
    "after resultsCam.tick (the clip's pose is applied), before render");
  assert.ok(TICK.indexOf("replayBuf.onTick(raceT, cars, state);") < at, "outside the paused branch");
  assert.match(TICK, /GameAudio\.feedReplayScrub\(soundOn && player, replayBuf\.isScrubbing\(\), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop\); return;/,
    "the #1262 paused-branch feed is untouched");
});

test("results sheet without HIGHLIGHTS stays silent (chequered cut + orbit)", () => {
  const { frame, resultsCam, audio, field } = highlightsRig();
  assert.equal(resultsCam.onFlag(), true);
  frame(240);   // chequered (2.2 s) into the orbit
  assert.equal(resultsCam.status().phase, "orbit");
  assert.ok(audio.log.feeds > 0, "the results frames do reach the feed");
  assert.equal(audio.log.scrubFeeds, 0, "but never as a scrub");
  assert.equal(audio.real.debug().engineOn, false, "no engine under the results sheet (#1246)");
  assert.equal(field.collects, 0, "and no field");
});

test("HIGHLIGHTS: engine + field play over each clip, then silence exactly once on the return to the orbit", () => {
  const { frame, resultsCam, replayBuf, audio, field, player, rival } = highlightsRig();
  resultsCam.onFlag(); frame(10);
  assert.equal(resultsCam.startHighlights(), true);
  assert.equal(replayBuf.isScrubbing(), true);
  frame(1);
  assert.equal(audio.real.debug().engineOn, true, "the montage starts the engine voice (was -87 dB)");
  assert.ok(audio.real.engineLevel() > 0, "and opens the note");
  assert.ok(field.collects > 0, "the field is collected for the TV camera mix");
  assert.ok(audio.real.rivalState().some((v) => v.gain > 0), "and fed to the rival voices");
  assert.equal(player.rpm, Math.min(15000, 5000 + player.speed * 1000 / 6), "revs follow the replayed speed (rpmFor(naturalGear(v), v))");
  assert.ok(rival.rpm > 5000, "every car re-revs");

  let stops = 0, wasOn = true;
  for (let i = 0; i < 60 * 60 && resultsCam.status().phase === "highlights"; i++) {
    frame(1);
    const on = audio.real.debug().engineOn;
    if (wasOn && !on) stops++;
    wasOn = on;
    if (resultsCam.status().phase === "highlights") assert.equal(on, true, "engines stay up for the whole montage");
  }
  assert.equal(resultsCam.status().phase, "orbit", "the montage returns to the orbit");
  assert.equal(replayBuf.isScrubbing(), false);
  frame(1);
  if (wasOn && !audio.real.debug().engineOn) stops++;
  assert.equal(stops, 1, "the scrub-exit one-shot silences engine + field once");
  assert.equal(audio.real.debug().engineOn, false);
  audio.real.startEngine();   // anything else that legitimately owns the engine keeps it
  frame(120);
  assert.equal(audio.real.debug().engineOn, true, "one-shot: later orbit frames leave the engine alone");
});

test("leaving results mid-montage (NEXT / MENU / RACE AGAIN) silences on the next frame; a new race keeps its engine", () => {
  for (const exit of ["menu", "results", "count"]) {
    const { tickCtx, frame, resultsCam, audio } = highlightsRig();
    resultsCam.onFlag(); frame(10); resultsCam.startHighlights(); frame(5);
    assert.equal(audio.real.debug().engineOn, true);
    resultsCam.reset();   // every exit path calls this first -> ReplayBuf.endScrub
    tickCtx.state = exit;
    frame(1);
    if (exit === "count") {
      // A synchronous RACE AGAIN with no frame in between inherits the running
      // engine (startEngine is a no-op while on); race frames never feed, so it is not cut.
      assert.equal(audio.real.debug().engineOn, true, "count: the race's engine is not cut by a stale one-shot");
    } else {
      assert.equal(audio.real.debug().engineOn, false, `${exit}: the montage audio stops`);
    }
  }
});

test("SOUND off: the montage never starts the engine", () => {
  const { frame, resultsCam, audio } = highlightsRig({ sound: false });
  resultsCam.onFlag(); frame(10); resultsCam.startHighlights(); frame(60);
  assert.equal(audio.real.debug().engineOn, false);
});

test("results orbit uses the rendered subject and road elevation instead of a missing car.py", () => {
  const R = boot({ Tracks: {
    sample: (_track, _s, out) => { out.p[1] = 80; },
    banking: () => ({ dy: 2 }),
  } });
  const car = { finPos: 1, s: 100, x: 3, px: 200, pz: 300, speed: 0 };
  let extra;
  const G = { player: car, cars: [car], gfx: {}, track: {},
    camPoseOf: () => ({ s: 99, x: 3, carPos: [198, 298], carHead: 1 }),
    camVantage: (_mode, s, x, speed, now, e) => { extra = e; return { eye: [180, 85, 298], tgt: [198, 83, 298] }; } };
  const api = R.create(G); api.onFlag();
  assert.deepEqual(Array.from(extra.carPos), [198, 298], "opening shot uses the drawn body anchor");
  assert.equal(extra.frameSubject, true);
  assert.equal(extra.bankDy, 2, "opening side shot follows the same banked road height as the orbit");
  api.startOrbit();
  assert.deepEqual(Array.from(G.dbgCam.target), [198, 83.2, 298]);
  assert.equal(G.dbgCam.eye[1], 88, "orbit is above the banked road, not below an elevated circuit");
});


test("chequered and highlights frame the bank lift at each rendered subject pose", () => {
  for (const interpolated of [true, false]) {
    const samples = [];
    const R = boot({ Tracks: { banking: (_track, s, x, out, smooth) => {
      samples.push({ s, x, out, smooth });
      out.dy = x; return out;
    } } });
    const winner = { finPos: 1, s: 20, x: 3, px: 20, pz: 1 };
    const rival = { finPos: 2, s: 50, x: -2, px: 50, pz: 2 };
    const G = { player: winner, cars: [winner, rival], gfx: {}, track: {},
      camPoseOf: interpolated ? (c) => ({ s: c.s - 1, x: c.x, carPos: [c.px - 1, c.pz], carHead: 0 }) : null,
      camVantage: (_mode, _s, _x, _speed, _time, extra) => ({
        eye: [extra.carPos[0], 5 + extra.bankDy, 0], tgt: [extra.carPos[0], 1 + extra.bankDy, 0],
      }) };
    const camera = R.create(G);
    camera.attachReplay({ window: () => ({ t0: 0, t1: 10, frames: 30 }),
      tags: () => [{ t: 5, car: 1 }], beginScrub: () => true,
      apply: () => { rival.s = rival.px = 70; }, endScrub() {} });
    assert.equal(camera.onFlag(), true);
    assert.equal(G.dbgCam.target[1], 4, "flag lifts the target to the winner's banked surface");
    assert.equal(camera.startHighlights(), true);
    assert.equal(G.dbgCam.target[1], -1, "highlight preserves signed bank lift for the tagged car");
    assert.equal(G.dbgCam.target[0], interpolated ? 69 : 70, "sample the newly posed highlight subject");
    assert.deepEqual(samples.map(({ s, x, smooth }) => [s, x, smooth]),
      [[interpolated ? 19 : 20, 3, true], [interpolated ? 69 : 70, -2, true]]);
    assert.equal(samples[0].out, samples[1].out, "banking scratch is reused across shots");
    camera.reset();
  }
});


test("chequered framing tolerates absent track banking without a stale lift", () => {
  for (const Tracks of [undefined, {}, { banking: () => null }]) {
    const R = boot({ Tracks });
    const car = { s: 5, x: 1, px: 10, pz: 20, finPos: 1 };
    let lift;
    const G = { player: car, cars: [car], gfx: {}, track: {},
      camVantage: (_mode, _s, _x, _speed, _time, extra) => {
        lift = extra.bankDy; return { eye: [0, 5, 0], tgt: [10, lift, 20] };
      } };
    const camera = R.create(G);
    assert.equal(camera.onFlag(), true);
    assert.equal(lift, 0);
    assert.ok(G.dbgCam.target.every(Number.isFinite));
    camera.reset();
  }
});


test("results highlights expose the scene and restore the sheet on every exit", () => {
  for (const exit of ["button", "complete", "reset", "eligibility"]) {
    const nodes = new Map([["results", { dataset: {} }], ["res-menu", { parentNode: { insertBefore: (b) => nodes.set(b.id, b) } }]]);
    const R = boot({ document: { getElementById: (id) => nodes.get(id) || null, createElement: () => ({}) } });
    const car = { finPos: 1, s: 0, px: 0, pz: 0 };
    const G = { player: car, cars: [car], gfx: {}, camVantage: () => ({ eye: [0, 5, -10], tgt: [0, 0, 0] }) };
    let allowed = true, ends = 0;
    const camera = R.create(G, () => allowed);
    camera.attachReplay({ window: () => ({ t0: 0, t1: 2, frames: 60 }), tags: () => [],
      beginScrub: () => true, apply() {}, endScrub: () => ends++ });
    camera.onFlag();
    const button = nodes.get("res-highlights"), sheet = nodes.get("results");
    assert.equal(button.textContent, "HIGHLIGHTS");
    button.onclick();
    assert.equal(camera.status().phase, "highlights");
    assert.equal(sheet.dataset.resultsPlayback, "playing", "presentation hides the classification over the footage");
    assert.equal(button.textContent, "BACK TO RESULTS");
    if (exit === "button") button.onclick();
    else if (exit === "complete") camera.tick(3);
    else if (exit === "reset") camera.reset();
    else { allowed = false; camera.tick(1); }
    assert.equal(sheet.dataset.resultsPlayback, undefined, exit + " restores full results presentation");
    assert.equal(button.textContent, "HIGHLIGHTS");
    assert.equal(ends, 1, "replay released exactly once");
    assert.equal(camera.status().phase, exit === "reset" || exit === "eligibility" ? "idle" : "orbit");
  }
});

test("dense same-subject highlights coalesce without losing event metadata or another subject", () => {
  const R = boot();
  const reel = R.highlightsReel([{ kind: "incident", t: 15, car: 0 }, { kind: "other", t: 15.1, car: 1 }, { kind: "retirement", t: 15.2, car: 0 }, { kind: "flag", t: 15.4, car: 0 }], 0, 20, 45);
  assert.equal(reel.length, 2);
  const same = reel.find((c) => c.car === 0);
  assert.ok(Math.abs((same.t1 - same.t0) - 4.4) < 1e-9);
  assert.deepEqual(Array.from(same.events, (e) => e.kind), ["incident", "retirement", "flag"]);
  assert.ok(reel.some((c) => c.car === 1), "overlapping different-subject shot survives");
  const capped = R.highlightsReel([{ t: 2, car: 0 }, { t: 12, car: 0 }, { t: 12.2, car: 0 }], 0, 20, 5);
  assert.ok(capped.reduce((sum, c) => sum + c.t1 - c.t0, 0) <= 5 + 1e-9);
  assert.ok(capped.every((c) => c.t0 >= 0 && c.t1 <= 20 && c.t1 > c.t0));
});
