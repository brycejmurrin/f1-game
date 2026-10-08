/* rival-audio.test.mjs — the field around you, in the player's track frame.
 *
 * Apex 26 shipped with NO opponent audio and no panner anywhere in the graph:
 * a car alongside was silent, and the mirror was the only cue you had for it.
 * This covers the half that knows about the track — js/audio/rivals.js — where
 * the bugs actually live, because every one of them is a SIGN: left/right,
 * ahead/behind, closing/opening. Get one backwards and the feature is worse
 * than silence, because it lies about where a car is.
 *
 * Run: node --test tests/unit/rival-audio.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAP = 1000;

function load() {
  const sb = { Math, Array, Object, Number, console };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8"), ctx, { filename: "consts.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8"), ctx, { filename: "rivals.js" });
  return vm.runInContext("RivalAudio", ctx);
}

const IDLE = 5000, MAX = 15000;
function car(o) { return { s: 0, x: 0, speed: 50, rpm: IDLE, retired: false, ...o }; }
function make(cars) {
  const G = { track: { total: LAP }, cars };
  const R = load().create(G);
  // collect() returns an array built INSIDE the vm realm, whose Array.prototype
  // is not this one — and node:assert/strict makes deepEqual prototype-strict,
  // so a correct result would fail on the realm alone. Copy across the boundary.
  return { collect: (p) => [...R.collect(p)] };
}

test("a car alongside on your LEFT reads negative lateral, and on your right positive", () => {
  const me = car({ s: 500, x: 0 });
  const left = car({ s: 500, x: -3 });
  const right = car({ s: 500, x: 4 });
  const got = make([me, left, right]).collect(me);
  assert.equal(got.length, 2, "both cars are within range");
  const lats = got.map((r) => r.lat).sort((a, b) => a - b);
  assert.deepEqual(lats, [-3, 4], "lateral is metres to the RIGHT of you, signed");
  for (const r of got) assert.equal(r.arc, 0, "side by side is zero arc gap");
});

test("ahead is positive arc, behind is negative — across the start/finish wrap", () => {
  // The wrap is where an arc-frame bug hides: a car 10 m up the road from you
  // at s=995 is at s=5, and a naive subtraction calls that 990 m BEHIND.
  const me = car({ s: 995 });
  const ahead = car({ s: 5 });      // 10 m in front, over the line
  const behind = car({ s: 985 });   // 10 m back
  const got = make([me, ahead, behind]).collect(me);
  const byArc = got.slice().sort((a, b) => a.arc - b.arc);
  assert.equal(byArc.length, 2);
  assert.equal(byArc[0].arc, -10, "the car behind is 10 m behind, not 990 ahead");
  assert.equal(byArc[1].arc, 10, "the car ahead is 10 m ahead, not -990");
});

test("approach is positive only when the gap is actually CLOSING", () => {
  const me = car({ s: 500, speed: 60 });
  // A car AHEAD going slower than you: you are closing.
  let got = make([me, car({ s: 520, speed: 40 })]).collect(me);
  assert.ok(got[0].approach > 0, "catching a slower car ahead must read as approaching");
  // A car AHEAD pulling away: opening.
  got = make([me, car({ s: 520, speed: 80 })]).collect(me);
  assert.ok(got[0].approach < 0, "a car ahead pulling away must read as opening");
  // A car BEHIND going faster: closing on you.
  got = make([me, car({ s: 480, speed: 80 })]).collect(me);
  assert.ok(got[0].approach > 0, "a faster car behind must read as approaching");
  // A car BEHIND dropping back: opening.
  got = make([me, car({ s: 480, speed: 40 })]).collect(me);
  assert.ok(got[0].approach < 0, "a car behind dropping back must read as opening");
});

test("only the nearest few survive, nearest first, and the far field is dropped", () => {
  const me = car({ s: 500 });
  const field = [me];
  for (let i = 1; i <= 12; i++) field.push(car({ s: 500 + i * 5 }));   // 5..60 m ahead
  field.push(car({ s: 800 }));                                        // 300 m away
  const got = make(field).collect(me);
  assert.equal(got.length, 4, "the pool is four voices, so four rivals");
  for (let i = 1; i < got.length; i++)
    assert.ok(got[i].dist >= got[i - 1].dist, "nearest first");
  assert.deepEqual(got.map((r) => r.arc), [5, 10, 15, 20], "and they are the four nearest");
  assert.ok(got.every((r) => r.dist <= 150), "nothing beyond the audible range is returned");
});

test("the audible radius reaches out to 150 m, and stops there", () => {
  const me = car({ s: 500 });
  const far = car({ s: 620 });     // 120 m up the road: fading, but there
  const gone = car({ s: 660 });    // 160 m: past the edge
  const got = make([me, far, gone]).collect(me);
  assert.equal(got.length, 1, "one of the two is in range");
  assert.equal(got[0].arc, 120, "and it is the nearer one");
});

test("retired cars and the player are never in the field", () => {
  const me = car({ s: 500 });
  const ghost = car({ s: 505, retired: true });
  const real = car({ s: 510 });
  const got = make([me, ghost, real]).collect(me);
  assert.equal(got.length, 1, "a retired car makes no noise, and you are not your own rival");
  assert.equal(got[0].arc, 10);
});

test("rev is normalised from their own rpm", () => {
  const me = car({ s: 500 });
  const idling = car({ s: 505, rpm: IDLE });
  const flat = car({ s: 510, rpm: MAX });
  const got = make([me, idling, flat]).collect(me);
  assert.equal(got[0].rev, 0, "idle is 0");
  assert.equal(got[1].rev, 1, "redline is 1");
});

test("the returned rows are reused, so a caller must read them before the next call", () => {
  // Not a wart to fix — a contract to state. This runs beside setEngine every
  // frame, and allocating a row per car would hand the GC 21 objects a frame to
  // keep four. The test exists so the reuse is deliberate and known.
  const me = car({ s: 500 });
  const R = load().create({ track: { total: LAP }, cars: [me, car({ s: 510 })] });
  const first = R.collect(me);
  const rowA = first[0];
  const second = R.collect(me);
  assert.equal(second[0], rowA, "the same row objects come back");
});

test("an empty or impossible field is quiet, not a crash", () => {
  const me = car({ s: 500 });
  assert.deepEqual(make([me]).collect(me), [], "alone on track is silence");
  assert.deepEqual(make([me]).collect(null), [], "no player yet");
  const noTrack = load().create({ track: null, cars: [me] });
  assert.deepEqual([...noTrack.collect(me)], [], "no track yet");
  const noS = load().create({ track: { total: LAP }, cars: [me, car({ s: null })] });
  assert.deepEqual([...noS.collect(me)], [], "a car with no arc position is skipped");
});

test("each rival carries its own power unit's voice, and it follows the car through a re-sort", () => {
  const me = car({ s: 500 });
  const ferrari = car({ s: 530, team: { engine: "Ferrari" } });
  const audi = car({ s: 510, team: { engine: "Audi" } });
  const privateer = car({ s: 520 });
  const got = make([me, ferrari, audi, privateer]).collect(me);
  assert.deepEqual(got.map((r) => [r.arc, r.voice]), [[10, "Audi"], [20, ""], [30, "Ferrari"]],
    "nearest first, each slot keeping ITS car's engine (engine.js falls back to default for \"\")");
});

// ── voice binding (2026-10-04) ─────────────────────────────────────────────
// engine.js plays each row on voice `row.slot`. It used to play row i on voice
// i — the distance RANK — so two rivals swapping places swapped voices: pans
// glided across each other and each note jumped by the slot-detune delta,
// exactly when they were side by side.

test("a voice stays with its car through a rank swap", () => {
  const me = car({ s: 500 });
  const a = car({ s: 510 }), b = car({ s: 520 });
  const R = load().create({ track: { total: LAP }, cars: [me, a, b] });
  const slotOf = (rows, arc) => rows.find((r) => r.arc === arc).slot;
  let rows = [...R.collect(me)];
  const slotA = slotOf(rows, 10), slotB = slotOf(rows, 20);
  assert.notEqual(slotA, slotB, "two cars, two voices");
  a.s = 525;   // a passes b: the nearest-first order flips
  rows = [...R.collect(me)];
  assert.deepEqual(rows.map((r) => r.arc), [20, 25], "the rows are still nearest first");
  assert.equal(slotOf(rows, 25), slotA, "car a kept its voice");
  assert.equal(slotOf(rows, 20), slotB, "car b kept its voice");
});

test("a voice is handed on only when its car leaves the voiced set", () => {
  const me = car({ s: 500 });
  const field = [me];
  for (let i = 1; i <= 4; i++) field.push(car({ s: 500 + i * 10 }));   // 10..40 m ahead
  const late = car({ s: 700 });                                         // out of range
  field.push(late);
  const R = load().create({ track: { total: LAP }, cars: field });
  const first = [...R.collect(me)].map((r) => ({ arc: r.arc, slot: r.slot }));
  assert.deepEqual(first.map((r) => r.slot).sort(), [0, 1, 2, 3], "four cars hold the four voices");
  const slot40 = first.find((r) => r.arc === 40).slot;
  late.s = 505;   // a newcomer, nearer than all four: the 40 m car drops out
  const rows = [...R.collect(me)];
  assert.equal(rows[0].arc, 5);
  assert.equal(rows[0].slot, slot40, "the newcomer takes the voice the departed car freed");
  for (const r of rows.slice(1))
    assert.equal(r.slot, first.find((f) => f.arc === r.arc).slot, `the car at ${r.arc} m kept its voice`);
});

test("net-owned rivals are flagged for heavier engine pitch smoothing", () => {
  const me = car({ s: 500 });
  const remote = car({ s: 510 });
  const ai = car({ s: 515 });
  const G = {
    track: { total: LAP },
    cars: [me, remote, ai],
    wireId: (c) => G.cars.indexOf(c),
    netPlay: { active: () => true, owns: (c) => c === remote },
  };
  const got = load().create(G).collect(me);
  const byArc = Object.fromEntries(got.map((r) => [r.arc, r]));
  assert.equal(byArc[10].net, true, "net-owned rival");
  assert.equal(byArc[15].net, false, "local AI rival");
  assert.equal(byArc[10].key, 1);
});

// ── camera-relative pan (Radio r6 f3) ─────────────────────────────────────

const CHASE_PAN_FIXTURES = [
  { lat: -3, arc: 0, pan: -0.85 },
  { lat: 4, arc: 0, pan: 0.85 },
  { lat: 0, arc: 40, pan: 0 },
  { lat: 3, arc: 1, pan: 0.85 * (3 / 4) },
  { lat: -2, arc: 50, pan: 0.85 * (-2 / 53) },
];

const ENGINE_SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/engine.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n").replace(/^const\b/gm, "var");

function bootRivalPanEngine(basisRef) {
  const param = (v) => ({
    value: v, sets: 0,
    setTargetAtTime(x) { this.value = x; this.sets++; },
    setValueAtTime(x) { this.value = x; },
    exponentialRampToValueAtTime(x) { this.value = x; },
    cancelScheduledValues() {},
  });
  const node = (kind) => ({
    kind, connect: () => node(kind), disconnect() {},
    gain: param(1), frequency: param(8000), Q: param(1), detune: param(0), playbackRate: param(1),
    pan: param(0), threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25),
    type: "", loop: false, start() {}, stop() {},
  });
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"),
    createOscillator: () => node("osc"), createBufferSource: () => node("src"),
    createStereoPanner: () => node("panner"), createDynamicsCompressor: () => node("comp"),
    createAnalyser: () => node("analyser"), createWaveShaper: () => node("shaper"),
    createConvolver: () => node("convolver"),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (_a, ok) => ok({ sampleRate: 44100, length: 44100, duration: 1, numberOfChannels: 1, getChannelData: () => new Float32Array(44100) }),
    resume: () => Promise.resolve(), close() {}, onstatechange: null,
  };
  const sb = {
    Math, console, Object, Array, Number, JSON, parseFloat, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    AudioContext: function () { return ctx; },
    fetch: () => new Promise(() => {}),
    GameCams: { getListenerBasis: () => basisRef.current },
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx);
  vm.runInContext(ENGINE_SRC, vctx, { filename: "engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  GameAudio.init();
  GameAudio.startEngine();
  return GameAudio;
}

function rivalPan(row, basis) {
  const A = bootRivalPanEngine({ current: basis });
  A.setRivals([row]);
  return A.rivalState()[0].pan;
}

test("external camera: rival on the visual left pans negative; 180° yaw flips the sign", () => {
  const leftBasis = { external: true, x: 0, z: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: -1, valid: true };
  const flipBasis = { external: true, x: 0, z: 0, fwdX: -1, fwdZ: 0, rightX: 0, rightZ: 1, valid: true };
  const row = { lat: 0, arc: 10, wx: 0, wz: 12, rev: 0.5, approach: 0, slot: 0 };
  const panLeft = rivalPan(row, leftBasis);
  const panFlip = rivalPan(row, flipBasis);
  assert.ok(panLeft < -0.2, `visual left should pan negative, got ${panLeft}`);
  assert.ok(panFlip > 0.2, `flipped camera should pan positive, got ${panFlip}`);
  assert.ok(Math.sign(panLeft) !== Math.sign(panFlip), "pan sign follows the camera, not the car frame");
});

test("external camera: rival ahead or behind the line of sight pans near centre", () => {
  const basis = { external: true, x: 0, z: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: -1, valid: true };
  const ahead = rivalPan({ lat: 0, arc: 0, wx: 40, wz: 0, rev: 0.5, approach: 0, slot: 0 }, basis);
  const behind = rivalPan({ lat: 0, arc: 0, wx: -30, wz: 0, rev: 0.5, approach: 0, slot: 0 }, basis);
  assert.ok(Math.abs(ahead) < 0.05, `ahead pan ${ahead} should be near 0`);
  assert.ok(Math.abs(behind) < 0.05, `behind pan ${behind} should be near 0`);
});

test("chase and missing camera basis keep the pre-fix player-track pan law", () => {
  for (const f of CHASE_PAN_FIXTURES) {
    const row = { lat: f.lat, arc: f.arc, rev: 0.6, approach: 0, slot: 0 };
    const chase = rivalPan(row, { external: false, valid: true, x: 0, z: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: -1 });
    const missing = rivalPan(row, null);
    assert.ok(Math.abs(chase - f.pan) < 1e-4, `chase ${f.lat},${f.arc} expected ${f.pan}, got ${chase}`);
    assert.ok(Math.abs(missing - f.pan) < 1e-4, `fallback ${f.lat},${f.arc} expected ${f.pan}, got ${missing}`);
  }
});

test("onboard → TV external flag clears cached pan targets so the next aim reschedules", () => {
  const row = { lat: 3, arc: 5, wx: 50, wz: 53, rev: 0.6, approach: 0, slot: 0 };
  const basisRef = {
    current: { external: false, valid: true, x: 0, z: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: -1 },
  };
  const A = bootRivalPanEngine(basisRef);
  A.setRivals([row]);
  const st0 = A.rivalState()[0];
  basisRef.current = { external: true, x: 0, z: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: -1, valid: true };
  A.setRivals([row]);
  const st1 = A.rivalState()[0];
  assert.notEqual(st1.pan, st0.pan, "camera-relative pan differs from player-track pan for the same row");
  assert.ok(Math.abs(st1.pan) <= 0.85 && Math.abs(st0.pan) <= 0.85, "both laws stay inside the hard-pan clamp");
});

test("Doppler closing speed is the line-of-sight component: zero when level, full when in line", () => {
  // -(arc/dist)·Δv, not -sign(arc)·Δv: the old form flipped the full Δv across
  // arc = 0 — a ~300-cent pitch step in 0.2 m as a car came past.
  const me = car({ s: 500, x: 0, speed: 60 });
  const at = (s, x, speed) => make([me, car({ s, x, speed })]).collect(me)[0].approach;
  assert.equal(Math.abs(at(500, 2, 90)), 0, "a car level with you neither closes nor opens");
  const ahead = at(530, 0, 40);   // dead ahead, 20 m/s slower: closing at the full 20
  assert.ok(Math.abs(ahead - 20) < 1e-9, `in line it is the full Δv, got ${ahead}`);
  const oblique = at(501, 2, 30);   // 1 m ahead, 2 m across, 30 m/s slower
  assert.ok(Math.abs(oblique - 30 / Math.hypot(1, 2)) < 1e-9, `oblique is (arc/dist)·Δv, got ${oblique}`);
  const justBehind = at(499.9, 2, 30), justAhead = at(500.1, 2, 30);
  // ±0.1 m of arc at 2 m across is ±1.5 m/s of closing; the old form jumped 60.
  assert.ok(Math.abs(justAhead - justBehind) < 4, `crossing arc 0 must not step the closing speed (${justBehind} -> ${justAhead})`);
});
