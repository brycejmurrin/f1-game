/* audio-tune.test.mjs — the player TUNE layer must not break the engine's
 * timbre contract.
 *
 * The ENGINE_VOICES note in js/audio/engine.js states the rule it lives by: every voice
 * field is a fixed multiplier, never a function of rev, so the pitch
 * invariants hold BY CONSTRUCTION rather than by measurement. The player tune
 * (profiles + sliders) is a second trim layered over that voice, so it inherits
 * the same obligation — and unlike a manufacturer voice, its values arrive from
 * a slider and from localStorage, where a NaN or a hand-edited number is a
 * realistic input rather than a hypothetical one.
 *
 * tools/check/audio-test.cjs proves the same invariants in a real browser, but
 * it needs a served tree and a Chromium; the arithmetic does not. This runs the
 * REAL engine.js in a VM over a fake AudioContext whose params record what was
 * scheduled, so GameAudio.rate() reads back the pitch the audio thread would
 * have got — and it sweeps EVERY profile at BOTH ends of every slider, which no
 * listening test could cover.
 *
 * Run: node --test tests/unit/audio-tune.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");
// A REAL device rate. The sub-octave layer derives its frequency from
// ctx.sampleRate, so the 8 kHz stand-in this harness used to fake put it under
// the 25 Hz floor at every rev — the layer read as a fixed drone that no actual
// device would produce, and the test would have passed a bug.
const SR = 44100;

// A recording AudioParam: setTargetAtTime lands in .value so rate() and the
// layer-gain reads below see what the audio thread would have received. `sets`
// counts scheduling calls — that is how the aimGain guard is observable.
// `snaps` / `cancels` / `lastMethod` distinguish a discontinuous setValueAtTime
// (skip-shift / first-frame rate snap) from a setTargetAtTime aim.
function param(v) {
  const p = {
    value: v, sets: 0, snaps: 0, cancels: 0, lastMethod: null,
    setTargetAtTime(x) { p.sets++; p.lastMethod = "target"; p.value = x; },
    setValueAtTime(x) { p.sets++; p.snaps++; p.lastMethod = "value"; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.lastMethod = "linear"; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.lastMethod = "exp"; p.value = x; },
    cancelScheduledValues() { p.cancels++; },
  };
  return p;
}
function idleSampleSrc() {
  // The idle voice plays the engine's loop WINDOW (engine.js loopWindow, perf
  // M-5a): a buffer it loops end to end. The full recording stays accepted for
  // a decode that could not be windowed.
  return [...live].find((n) => n.kind === "src" && n.loop && n.buffer &&
    (n.buffer.duration >= 3 || (n.loopStart === 0 && n.loopEnd > 0 && Math.abs(n.loopEnd - n.buffer.duration) < 1e-6)));
}
// `live` makes a LEAK observable: a node enters on creation and leaves only on
// disconnect(), which is the Web Audio contract that matters — a stopped source
// is collected on its own, but a Gain/Biquad still wired into the bus keeps
// RENDERING until something disconnects it.
const live = new Set();
function node(kind, counts) {
  if (counts) counts[kind] = (counts[kind] || 0) + 1;
  const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start(t) { self.startAt = t; }, stop(t) { self.stopAt = t; }, type: "", loop: false,
           loopStart: 0, loopEnd: 0, buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0,
           getFloatFrequencyData() {}, gain: param(1), frequency: param(440), detune: param(0),
           Q: param(1), playbackRate: param(1) };
  live.add(self);
  return self;
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

const pendingTimers = [];
function boot(opts) {
  const held = [];
  const counts = {};
  live.clear();
  pendingTimers.length = 0;
  const ctx = {
    currentTime: 0, state: "running", sampleRate: SR, destination: node("dest", counts),
    createGain: () => node("gain", counts), createBiquadFilter: () => node("biquad", counts),
    createOscillator: () => node("osc", counts), createBufferSource: () => node("src", counts),
    createAnalyser: () => node("analyser", counts),
    createWaveShaper: () => Object.assign(node("shaper", counts), { curve: null }),
    createConvolver: () => Object.assign(node("convolver", counts), { buffer: null }),
    createStereoPanner: () => Object.assign(node("panner", counts), { pan: param(0) }),
    createDynamicsCompressor: () => Object.assign(node("comp", counts),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, SR)),
    createMediaElementSource: (el) => Object.assign(node("mediaSrc", counts), { mediaElement: el }),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    // GLX is what decides `mobileTier`; the engine reads it lazily at
    // startEngine. Absent by default (desktop); mobileEngine() supplies it.
    GLX: opts && opts.mobile === "high"
      ? { isMobile: true, mobileTier: false }
      : opts && opts.mobile ? { isMobile: true, mobileTier: true } : undefined,
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    // stopEngine defers its disconnects behind setTimeout; a harness that
    // swallows them can never see a leak, so they are queued and fired by hand.
    setTimeout: (fn) => { pendingTimers.push(fn); return pendingTimers.length; },
    clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),   // ok: engine.js now rejects a !ok response before decoding
  };
  if (opts && opts.realWatch) sb.RealRace = { status: () => ({ watch: true }) };
  if (opts && opts.Audio) sb.Audio = opts.Audio;
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  // The crackle scheduler is TIME-driven: it fires when ctx.currentTime passes
  // the next due moment, so a harness with a frozen clock would see one burst
  // and then silence forever. Tests step it by hand.
  const ctxTime = (dt) => { ctx.currentTime += dt; };
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const flushTimers = () => { while (pendingTimers.length) { const fn = pendingTimers.shift(); try { fn(); } catch (e) { /* torn down */ } } };
  // Sources are excluded: a STOPPED BufferSource/Oscillator is collected without
  // a disconnect, so counting them would report a leak this file cannot fix.
  const liveNodes = () => [...live].filter((n) => n.kind !== "src" && n.kind !== "osc").length;
  return { GameAudio, release, counts, ctxTime, flushTimers, liveNodes, ctx, vctx };
}

// The sample core is the SHIPPED path, so every invariant below is measured on
// it: init + release decodes the fake buffers, then startEngine picks samples.
async function sampleEngine() {
  const { GameAudio, release } = boot();
  GameAudio.init();
  await release();
  GameAudio.startEngine();
  assert.equal(GameAudio.debug().usingSamples, true, "precondition: measuring the sample core, not the synth fallback");
  return GameAudio;
}

// The OSCILLATOR FALLBACK: never release the held fetches, so the decode never
// lands and startEngine takes the synth path — which is what a player whose
// f1_engine.mp3 404s or is blocked actually gets.
function synthEngine() {
  const { GameAudio } = boot();
  GameAudio.init();
  GameAudio.startEngine();
  assert.equal(GameAudio.debug().usingSamples, false, "precondition: measuring the synth fallback");
  return GameAudio;
}

const REVS = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1];

// Observe ownership/allocation at the API boundary, without exposing caches.
function observeBuffers(ctx) {
  const buffers = [], create = ctx.createBuffer;
  ctx.createBuffer = (...args) => { const b = create(...args); buffers.push(b); return b; };
  const loops = () => [...live].filter((n) => n.kind === "src" && n.loop && n.stopAt == null &&
    n.buffer && n.buffer.numberOfChannels === 1 && n.buffer.duration < 1);
  return { buffers, loops };
}

test("engine restarts reuse six independent noise buffers through fresh source nodes", async () => {
  for (const samples of [false, true]) {
    const { GameAudio: A, ctx, release } = boot();
    const { buffers, loops } = observeBuffers(ctx);
    A.init();
    if (samples) await release();
    A.startEngine();
    assert.equal(A.debug().usingSamples, samples);
    const first = loops();
    assert.equal(first.length, 6, "harvest, skid, scrub, surface, wind and brake each have a loop");
    assert.equal(new Set(first.map((n) => n.buffer)).size, 6, "equal durations must not share waveforms");
    assert.deepEqual(first.map((n) => n.buffer.length), [0.7, 0.5, 0.5, 0.5, 0.5, 0.6].map((s) => Math.ceil(SR * s)));
    const before = buffers.length;
    A.stopEngine(); A.startEngine();
    const second = loops();
    assert.equal(buffers.length, before, "restart does not generate fresh PCM buffers");
    assert.equal(second.length, 6);
    assert.ok(second.every((n, i) => n.buffer === first[i].buffer), "each layer retains its own buffer");
    assert.ok(second.every((n, i) => n !== first[i]), "single-use source nodes are recreated");
    assert.ok(first.every((n) => n.stopAt != null), "the previous sources were stopped");
  }
});

test("the radio noise pool is prepared before the first lights-out announcement", () => {
  const { GameAudio: A, ctx } = boot();
  const { buffers } = observeBuffers(ctx);
  A.setUiEnabled(false);   // upstream MENU SOUNDS OFF does not silence race SFX
  A.init(); A.startEngine();
  const pool = buffers.find((b) => b.numberOfChannels === 1 && b.length === SR * 3);
  assert.ok(pool, "the existing three-second one-shot pool is already prepared before green");
  const before = buffers.length;
  assert.equal(A.radioSting("radio", 1.9), true);
  A.lightsOut();
  assert.equal(buffers.length, before, "lights-out radio and blips allocate no PCM buffers");
  assert.ok([...live].some((n) => n.kind === "src" && n.loop && n.buffer === pool), "the radio bed uses the prepared pool");
});

test("delayed sample upgrade reuses noise and prepared loop metadata on the first race update", async () => {
  const { GameAudio: A, ctx, release, counts } = boot();
  const { buffers, loops } = observeBuffers(ctx);
  let sampleReads = 0;
  const decode = ctx.decodeAudioData;
  ctx.decodeAudioData = (ab, resolve, reject) => decode(ab, (b) => {
    const read = b.getChannelData;
    b.getChannelData = (...args) => { sampleReads++; return read(...args); };
    resolve(b);
  }, reject);
  A.init(); A.startEngine();
  assert.equal(A.debug().usingSamples, false, "held decoding preserves the synth fallback");
  const oldNoise = loops().map((n) => n.buffer);
  await release();
  assert.equal(A.debug().samplesReady, true);
  assert.equal(A.debug().usingSamples, false, "decode completion does not restart the audible graph");
  const before = { buffers: buffers.length, sampleReads, sources: counts.src };
  A.setEngine(0.6, 0, false, 0.6, 4, {});
  assert.equal(A.debug().usingSamples, true, "the first race update still consumes the pending upgrade");
  assert.equal(buffers.length, before.buffers, "upgrade does not generate noise again");
  assert.equal(sampleReads, before.sampleReads, "upgrade does not scan the decoded sample again");
  assert.ok(loops().every((n, i) => n.buffer === oldNoise[i]), "sample upgrade retains every layer buffer");
  assert.ok(counts.src > before.sources, "the sample graph has new source nodes");
  const sources = counts.src;
  A.setEngine(0.7, 0, false, 0.7, 5, {});
  assert.equal(counts.src, sources, "the upgrade occurs only once");
});

// The tune layer is a MULTIPLIER over the sample core, and until 2026-09-08 its
// shipped value was 1 on every knob, so "the default" and "neutral" were the
// same number and the knob tests below could use either. They are not the same
// any more: TUNE_DEF now carries the shipped ENGINE voice (pitch 0.85, rev
// range 1.3, no detune, a hard limiter). The LAYER's contract is unchanged, so
// these tests still measure it — from an explicit identity trim rather than
// from whatever the shipped voice happens to be. `sampleEngine()` still gives
// the shipped default; `neutralEngine()` is what a KNOB is measured against.
const TUNE_IDENTITY = Object.freeze({
  pitch: 1, idle: 1, revRange: 1, curve: 1, detune: 1, brightness: 1, gravel: 1, sub: 1,
  limiter: 1, limRate: 1, limPitch: 1, boost: 1, boostPitch: 1,
  whine: 1, harvest: 1, wind: 1, screech: 1, brakes: 1, shift: 1, rivals: 1, reverb: 1, overrun: 1,
});
async function neutralEngine() {
  const A = await sampleEngine();
  A.setTune(TUNE_IDENTITY);
  return A;
}

test("a fresh engine carries the shipped voice, and an identity trim reduces to the pre-tune formula", async () => {
  const A = await sampleEngine();
  assert.deepEqual(A.tune(), A.tuneDefaults(), "a fresh engine carries the shipped tune, whatever it is");
  assert.equal(A.profile(), "team", "and follows the team's engine, as it always did");
  // The shipped voice itself — the owner's own ENGINE tune became the default
  // on 2026-09-08. Pinned here so a change to it is a decision, not a drift.
  // JSON round-trip: values come back from the vm realm with that realm's
  // Object prototype, and strict deepEqual compares prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(A.tuneDefaults())), Object.assign({}, TUNE_IDENTITY, {
    pitch: 0.85, revRange: 1.3, detune: 0, sub: 0.25, limiter: 2.25, limRate: 0.8, limPitch: 0, whine: 0.62, boost: 1.12,
  }), "the shipped ENGINE voice");
  A.setTune(TUNE_IDENTITY);
  // The pre-tune formula: IDLE and CURVE at 1 must reduce the four-knob curve
  // to exactly this. No gear term since 2026-10-04 (LOW_GEAR_RATE removed, the
  // base retuned to 0.17 + 0.5115 rev so the shipped limiter did not move).
  for (const gear of [1, 2, 3, 4, 6, 8]) {
    for (const rev of REVS) {
      for (const b of [0, 1]) {
        A.setEngine(rev, b, false, 0.6, gear, {});
        const want = (0.17 + rev * 0.5115) * (1 + 0.04 * b) * 1.0;
        assert.ok(Math.abs(A.rate() - want) < 1e-4,
          `gear ${gear} rev ${rev} boost ${b}: ${A.rate()} != ${want.toFixed(4)}`);
      }
    }
  }
});

test("pitch stays monotonic in rev under EVERY profile and at both ends of every slider", async () => {
  const A = await sampleEngine();
  const range = A.tuneRange();
  // Each profile, plus each individual slider pinned to its min and its max —
  // the corners a player can actually reach.
  const cases = [];
  for (const p of A.profiles()) cases.push({ profile: p, tune: null });
  for (const k of Object.keys(range)) for (const v of range[k]) cases.push({ profile: "team", tune: { [k]: v } });
  // And the two whole-set extremes, where every knob is at once at its limit.
  for (const end of [0, 1]) {
    const t = {};
    for (const k of Object.keys(range)) t[k] = range[k][end];
    cases.push({ profile: "team", tune: t });
  }
  for (const c of cases) {
    A.setProfile(c.profile);
    if (c.tune) A.setTune(c.tune);
    const label = c.tune ? `tune ${JSON.stringify(c.tune)}` : `profile ${c.profile}`;
    for (const gear of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let prev = -Infinity;
      for (const rev of REVS) {
        A.setEngine(rev, 0, false, 0.6, gear, {});
        const r = A.rate();
        assert.ok(isFinite(r) && r > 0, `${label} g${gear} rev ${rev}: rate ${r} is not a usable playbackRate`);
        assert.ok(r >= prev - 1e-9, `${label} g${gear}: pitch fell from ${prev} to ${r} as revs rose`);
        prev = r;
      }
    }
    // The same rpm is the same note in every gear: the gearbox reaches the
    // pitch only through the rpm it hands the engine (game.js rpmFor).
    for (const rev of [0, 0.5, 1]) {
      A.setEngine(rev, 0, false, 0.6, 4, {});
      const g4 = A.rate();
      for (const gear of [1, 2, 3, 8]) {
        A.setEngine(rev, 0, false, 0.6, gear, {});
        assert.ok(Math.abs(A.rate() - g4) < 1e-9, `${label}: rev ${rev} reads ${A.rate()} in gear ${gear} but ${g4} in 4th`);
      }
    }
  }
});

test("a garbage stored value cannot reach playbackRate", async () => {
  const A = await sampleEngine();
  const before = A.tune();
  A.setTune({ pitch: NaN, revRange: Infinity, brightness: "1.4", whine: null, nope: 3 });
  assert.deepEqual(A.tune(), before, "non-finite and non-numeric input is ignored, not stored");
  assert.equal(A.tune().nope, undefined, "a field outside the table is not adopted");
  // Out of range clamps rather than refusing — a slider maximum should saturate.
  const r = A.tuneRange();
  A.setTune({ pitch: 99, revRange: -5 });
  assert.equal(A.tune().pitch, r.pitch[1], "above the range clamps to the maximum");
  assert.equal(A.tune().revRange, r.revRange[0], "below the range clamps to the minimum");
  A.setEngine(0.8, 0, false, 0.6, 5, {});
  assert.ok(isFinite(A.rate()) && A.rate() > 0, "and the resulting pitch is still usable");
});

test("picking a profile REPLACES the trim rather than merging into the last one", async () => {
  const A = await sampleEngine();
  A.setProfile("v10");
  const v10 = A.tune();
  A.setProfile("cockpit");
  A.setProfile("v10");
  assert.deepEqual(A.tune(), v10, "the same profile must give the same tune whatever preceded it");
  A.setProfile("team");
  assert.deepEqual(A.tune(), A.tuneDefaults(), "team restores identity");
  A.setProfile("no-such-profile");
  assert.equal(A.profile(), "team", "an unknown name falls back to team rather than leaving a stale tune");
});

test("a hand-edited trim stops the engine calling itself by the profile's name", async () => {
  // profile() is what the panel lights and what __apex.audio() reports. Left
  // alone, it would still say "cockpit" after the player had dragged a slider
  // away from cockpit's tune — a name that is simply false, in two places at
  // once. It flips to "custom" instead, which is not a selectable profile.
  const A = await sampleEngine();
  A.setProfile("cockpit");
  assert.equal(A.profile(), "cockpit");
  A.setTune({ pitch: 1.2 });
  assert.equal(A.profile(), "custom", "the tune is no longer cockpit's, so the name must not claim it is");
  assert.ok(!A.profiles().includes("custom"), "and custom is a state, not a preset the panel can offer");
  // Setting a trim to the value the profile already prescribes is NOT an edit —
  // otherwise restoring a saved tune would always read as hand-edited.
  A.setProfile("cockpit");
  const held = A.tune();
  A.setTune({ pitch: held.pitch, brightness: held.brightness });
  assert.equal(A.profile(), "cockpit", "re-applying the profile's own values leaves it on the profile");
  // And returning every trim to the defaults by hand lands back on team. THE
  // SHIPPED DEFAULT, not identity: "team" means TUNE_DEF, which since
  // 2026-09-08 is the shipped ENGINE voice rather than a row of 1s.
  A.setTune(A.tuneDefaults());
  assert.equal(A.profile(), "team", "a tune that matches team's is team's");
});

test("a muted layer goes silent and then costs nothing per frame", async () => {
  const A = await sampleEngine();
  // Drive a frame that would make every layer audible: revving, deploying,
  // sliding, at speed, over a kerb.
  const loud = () => A.setEngine(0.99, 1, false, 0.9, 6, { slip: 0.4, ax: 8, deploy: 1, energy: 1, onKerb: true });
  loud();
  assert.ok(A.windLevel() > 0, "precondition: the wind layer is audible on this frame");
  A.setLayer("wind", false);
  loud();
  assert.equal(A.windLevel(), 0, "switching the layer off silences it");
  // The guard: a second identical frame must not re-schedule the same 0.
  loud();
  assert.equal(A.windLevel(), 0, "and it stays silent");
  A.setLayer("wind", true);
  loud();
  assert.ok(A.windLevel() > 0, "switching it back on restores it");
});

test("the rev-limiter chop is switchable and its depth is a knob", async () => {
  const A = await neutralEngine();
  // Above 98.5% revs at speed is the only place the limiter gate opens.
  const atLimiter = () => A.setEngine(0.99, 0, false, 0.9, 7, {});
  atLimiter();
  const on = A.limiterDepth();
  assert.ok(on > 0, "precondition: the ignition cut is active above 98.5%");
  A.setTune({ limiter: 2 });
  atLimiter();
  assert.ok(A.limiterDepth() > on, "a higher depth chops harder");
  A.setTune({ limiter: 1 });
  A.setLayer("limiter", false);
  atLimiter();
  assert.equal(A.limiterDepth(), 0, "switched off, the chop is gone entirely");
  A.setLayer("limiter", true);
  atLimiter();
  assert.ok(A.limiterDepth() > 0, "and comes back");
});

test("in top gear the rev-limiter chop is a burst, not a wall", async () => {
  // The chop is a shift cue. Pinned at top speed in 8th there is no gear to
  // shift into, and the cut used to hammer for the whole straight — the only
  // way to stop it was to lift (player report, 2026-09-05). Below top gear it
  // never fades.
  const { GameAudio: A, release, ctxTime } = boot();
  A.init(); await release(); A.startEngine();
  const at = (gear, rev = 0.99) => A.setEngine(rev, 0, false, 0.95, gear, {});
  at(8);
  const full = A.limiterDepth();
  assert.ok(full > 0, "the cut still opens in top gear");
  assert.equal(A.limiterHeld(), 0, "the hold clock starts when the top-gear cut begins");
  ctxTime(0.3); at(8);
  assert.ok(A.limiterDepth() >= full * 0.99, "first half second: full depth — you hear that you are at the limit");
  ctxTime(0.45); at(8);
  const mid = A.limiterDepth();
  assert.ok(mid > 0 && mid < full * 0.8, `then it fades (${mid} of ${full})`);
  ctxTime(0.5); at(8);
  assert.equal(A.limiterDepth(), 0, "a second in, the note holds steady at the limiter with no chop");
  assert.equal(A.limiterCents(), 0, "and the pitch sag fades with it");
  at(8, 0.9);
  assert.equal(A.limiterHeld(), null, "dipping under the gate re-arms it");
  at(8);
  assert.ok(A.limiterDepth() > 0, "the next straight gets its burst again");
  // Gear 7 at the limiter for two seconds: the shift cue is never taken away.
  at(7);
  for (let i = 0; i < 20; i++) { ctxTime(0.1); at(7); }
  assert.ok(A.limiterDepth() >= full * 0.99, "below top gear the chop holds full depth indefinitely");
  assert.equal(A.limiterHeld(), null);
});

test("every id the ENGINE TONE panel looks up exists in the shell", () => {
  // js/audio/panel.js drives this section from tables, so its lookups are
  // `$(t.id)` and `$(t.id + "-v")` — dynamic reads, which
  // tools/check/shell-ids.mjs can only COUNT, never resolve. That is the whole
  // reason its ratchet exists, and raising it (43 -> 50 for this feature) buys
  // back nothing on its own. This is the check that does: the ids are literals
  // in those tables, so a static pass can prove each one is really in the
  // shell — the same guarantee `$("as-mvol")` gets for free, restored for the
  // table-driven form. A typo here is otherwise a null dereference inside an
  // IIFE at the moment the player opens the panel.
  const panel = fs.readFileSync(path.join(ROOT, "js/audio/panel.js"), "utf8");
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const declared = new Set([...shell.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  const sliders = [...panel.matchAll(/\{ k: "\w+",\s*id: "([\w-]+)",/g)].map((m) => m[1]);
  const layers = [...panel.matchAll(/\{ k: "\w+",\s+id: "([\w-]+)" \}/g)].map((m) => m[1]);
  // The PROFILE setting row (js/ui/setting-row.js): five pickable names plus a
  // shown-but-disabled CUSTOM; the row itself is #as-p in the shell.
  const profiles = [...panel.matchAll(/\["(team|broadcast|trackside|cockpit|v10)", "[A-Z0-9]+"\]/g)].map((m) => m[1]);
  assert.match(panel, /\["custom", "CUSTOM", true\]/, "CUSTOM is listed but unpickable");
  assert.equal(sliders.length, 22, "expected the twenty-two tuner sliders — the table shape changed, so does this check");
  assert.equal(layers.length, 12, "expected the twelve layer switches");
  assert.equal(profiles.length, 5, "expected the five sound profiles");

  const missing = [];
  // Each slider owns TWO nodes: the range input and the <b> that reads its value.
  for (const id of sliders) for (const suffix of ["", "-v"]) if (!declared.has(id + suffix)) missing.push(id + suffix);
  for (const id of [...layers, "as-p", "as-p-sel", "as-t-reset", "as-p-note", "as-engine-details"]) if (!declared.has(id)) missing.push(id);
  assert.deepEqual(missing, [], "js/audio/panel.js looks up an id that index.html does not declare");
});

test("every sound profile and layer the panel offers is one the engine knows", () => {
  // The other half of the same seam: the panel names profiles and layers as
  // strings, and GameAudio silently falls back to "team" for an unknown
  // profile — so a rename in the engine would leave a button that lights up
  // and does nothing, which is worse than one that throws.
  const panel = fs.readFileSync(path.join(ROOT, "js/audio/panel.js"), "utf8");
  const A = await_boot();
  // PROFILE_VALUES feeds the PROFILE setting row; the disabled CUSTOM entry
  // (`, true`) is a state, not a pick, and the two-field regex skips it.
  const at = panel.indexOf("PROFILE_VALUES = [");
  const block = panel.slice(at, panel.indexOf("];", at));
  const offered = [...block.matchAll(/\["(\w+)", "[A-Z0-9]+"\]/g)].map((m) => m[1]);
  assert.deepEqual(offered.filter((p) => !A.profiles().includes(p)), [],
    "the panel offers a profile SOUND_PROFILES does not define");
  assert.deepEqual([...A.profiles()].filter((p) => !offered.includes(p)), [],
    "the engine defines a profile the panel gives no way to pick");
  const layerKeys = [...panel.matchAll(/\{ k: "(\w+)",\s+id: "as-l-[\w-]+" \}/g)].map((m) => m[1]);
  const known = Object.keys(A.layerDefaults());
  assert.deepEqual(layerKeys.filter((k) => !known.includes(k)), [], "the panel switches a layer the engine does not have");
  assert.deepEqual(known.filter((k) => !layerKeys.includes(k)), [], "the engine has a layer the panel cannot switch");
  const tuneKeys = [...panel.matchAll(/\{ k: "(\w+)",\s*id: "as-t-[\w-]+",/g)].map((m) => m[1]);
  const knownTune = Object.keys(A.tuneDefaults());
  assert.deepEqual(tuneKeys.filter((k) => !knownTune.includes(k)), [], "the panel drives a trim the engine does not have");
});

// The tune tests above need a running engine; these two only need the tables,
// so they boot the engine without the sample decode the others wait for.
function await_boot() { return boot().GameAudio; }

test("DETUNE lands on the sample core's own detune param", async () => {
  // It once did not: for the life of the granular core, engSrcIdle.detune was
  // the only place this trim landed and that core never built the node, so the
  // slider moved and nothing happened. The granular core is gone; this pins the
  // remaining path so the trim cannot go quietly inert again.
  const A = await neutralEngine();
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  const neutral = A.detuneCents();
  A.setTune({ detune: 3 });          // +60 cents on the "default" voice
  assert.ok(Math.abs(A.detuneCents() - (neutral + 60)) < 1e-6,
    `detune 3 should sit 60 cents above neutral, got ${A.detuneCents()} vs ${neutral}`);
  // 0 is "chorus off" (the shipped value). On the one-source sample core it
  // was a 30-cent-flat transposition of every TEAM voice; now 0..1 is no
  // offset at all.
  A.setTune({ detune: 0 });
  assert.ok(Math.abs(A.detuneCents() - neutral) < 1e-6,
    `detune 0 must not transpose the sample core, got ${A.detuneCents()} vs ${neutral}`);
  A.setTune({ detune: 0.5 });
  assert.ok(Math.abs(A.detuneCents() - neutral) < 1e-6, "anywhere in 0..1 is no offset on the sample core");
  // A FINE trim: an order of magnitude under what PITCH spans.
  A.setTune({ detune: 3 });
  assert.ok(Math.abs(Math.pow(2, (A.detuneCents() - neutral) / 1200) - 1) < 0.05,
    "detune must stay a fine trim, not a second pitch control");
});

test("SUB is audible on the shipped core, not just the oscillator fallback", async () => {
  // `sub` was a tune field FOUR of the five profiles set and the sample core
  // never read: the sub-octave lived only on engC, which exists in the synth
  // fallback. COCKPIT asking for 1.60 got exactly what TEAM got. The layer now
  // sits under the sample/granular core too, so the number means something.
  const A = await sampleEngine();
  const loud = () => A.setEngine(0.8, 0, false, 0.7, 5, {});
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  loud();
  const base = A.subLevel();
  assert.ok(base > 0, "the sub layer must be audible on the core that actually ships");
  A.setTune({ sub: 2.5 });
  loud();
  assert.ok(A.subLevel() > base * 2, "the SUB trim must scale it");
  A.setTune({ sub: 0 });
  loud();
  assert.equal(A.subLevel(), 0, "and zero must be silent, not merely quiet");
  // The switch is the hard off, independent of the trim.
  A.setTune({ sub: 1 });
  A.setLayer("sub", false);
  loud();
  assert.equal(A.subLevel(), 0, "switching the layer off silences it whatever the trim says");
  A.setLayer("sub", true);
  loud();
  assert.ok(A.subLevel() > 0, "and back on restores it");
  // It tracks the NOTE, and keeps tracking it at the top. The first cut clamped
  // at 160 Hz and pinned from about rev 0.8 up — measured live — so the layer
  // stopped following exactly where the engine is loudest and turned into the
  // fixed drone the clamp exists to prevent. Proportionality catches that
  // wherever the ceiling sits: sub is an octave under the fundamental, so
  // subHz/rate must hold across the range.
  A.setEngine(0.2, 0, false, 0.7, 5, {});
  const lowF = A.subHz(), lowR = A.rate();
  A.setEngine(0.95, 0, false, 0.7, 5, {});
  const hiF = A.subHz(), hiR = A.rate();
  assert.ok(hiF > lowF, `sub should rise with the engine: ${lowF} -> ${hiF}`);
  const drift = Math.abs((hiF / hiR) / (lowF / lowR) - 1);
  assert.ok(drift < 0.02,
    `sub must stay an octave under the fundamental at both ends, not pin against a clamp ` +
    `(${lowF.toFixed(1)}Hz @ rate ${lowR} vs ${hiF.toFixed(1)}Hz @ rate ${hiR})`);
});

test("the circuit's acoustics come from the definition it already carries", async () => {
  // Before this there was no ConvolverNode anywhere in the graph: every circuit
  // was an anechoic chamber, and Monaco between the barriers sounded exactly
  // like Spa in the trees. The mapping uses data the circuits ALREADY have —
  // `street: true` on five of them, and `theme` — rather than a new per-track
  // field somebody would have to fill in forty times.
  const A = await sampleEngine();
  assert.equal(A.setVenue({ street: true, theme: "street_day" }), "street");
  const street = A.venue();
  assert.equal(A.setVenue({ theme: "green" }), "green");
  const green = A.venue();
  assert.equal(A.setVenue({ theme: "desert" }), "desert");
  assert.equal(A.setVenue({ theme: "modern" }), "modern");
  assert.equal(A.setVenue(null), "modern", "an unknown or missing definition must not throw");
  assert.equal(A.setVenue({}), "modern");

  // Hard walls a couple of metres away must ring longer and louder than trees.
  assert.ok(street.decay > green.decay,
    `a street circuit should ring longer than a park one (${street.decay}s vs ${green.decay}s)`);
  assert.ok(street.level > green.level,
    `and louder (${street.level} vs ${green.level})`);
});

test("SPACE and its switch both reach the live reverb return", async () => {
  const A = await sampleEngine();
  A.setVenue({ street: true, theme: "street_day" });
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  const base = A.venue().level;
  assert.ok(base > 0, "a street circuit must actually be wet");
  A.setTune({ reverb: 2.5 });
  assert.ok(A.venue().level > base * 2, "the SPACE trim must scale it");
  A.setTune({ reverb: 0 });
  assert.equal(A.venue().level, 0, "and zero must be dry, not merely quieter");
  A.setTune({ reverb: 1 });
  A.setLayer("reverb", false);
  assert.equal(A.venue().level, 0, "the switch is the hard off whatever the trim says");
  A.setLayer("reverb", true);
  assert.ok(A.venue().level > 0, "and back on restores it");
});

test("overrun crackles on a trailing throttle, and not while coasting or braking", async () => {
  // The state that sounded identical to coasting: loadLift is clamp01(ax/12),
  // so it is zero the instant you lift and nothing else in the mix noticed a
  // closed throttle at revs. Crackles are one-shots with no persistent gain, so
  // the observable is NODE CONSTRUCTION — each burst builds its own source.
  const { GameAudio: A, release, counts, ctxTime } = boot();
  A.init();
  await release();
  A.startEngine();
  // The wastegate is ALSO a one-shot on a lift — braking after the "pulling"
  // frames below is exactly when it dumps — and it builds a source too. It has
  // its own test; here the TURBO switch takes it out so the count is overrun's.
  A.setLayer("whine", false);
  const burstsOver = (frames, phys) => {
    const before = counts.src || 0;
    // now() advances with ctx.currentTime, which this harness holds still, so
    // step it by hand — the crackle scheduler is time-driven by design.
    for (let i = 0; i < frames; i++) { ctxTime(0.05); A.setEngine(0.7, 0, false, 0.6, 5, phys); }
    return (counts.src || 0) - before;
  };
  // 40 frames x 50 ms = TWO SECONDS of context time, stepped by hand. The rate
  // has to be pinned here and not in a browser: with no audio device this
  // container's ctx.currentTime free-runs at roughly 100x wall (measured: 25
  // seconds of context time per 200 ms of real time), so a live probe can see
  // the GATING but can tell you nothing about how often it fires.
  const lifting = burstsOver(40, { ax: -4 });
  assert.ok(lifting >= 6 && lifting <= 45,
    `two seconds of lifting should crackle a handful of times, got ${lifting} — ` +
    "too few is inaudible, too many is a machine gun rather than an exhaust");
  const coasting = burstsOver(40, { ax: 0 });
  assert.equal(coasting, 0, "a steady throttle must be silent — that is the state it was confused with");
  const pulling = burstsOver(40, { ax: 8 });
  assert.equal(pulling, 0, "accelerating must not crackle");
  const braking = burstsOver(40, { ax: -40 });
  assert.equal(braking, 0, "hard braking has its own sound; stacking crackle on it is just noise");
  // The switch and the trim.
  A.setLayer("overrun", false);
  assert.equal(burstsOver(40, { ax: -4 }), 0, "switched off is silent");
  A.setLayer("overrun", true);
  assert.ok(burstsOver(40, { ax: -4 }) > 0, "and back on crackles again");
});

test("every slider spans its trim's FULL range and can land exactly on 1.0", () => {
  // Three numbers have to agree for a slider to be usable, and they live in
  // three files: the engine's TUNE_RANGE, the panel's {lo, step}, and the
  // shell's min/max/value. Hand-checking them is how a range gets widened in
  // one place and not the others — a slider that stops short of its trim's
  // maximum is a control the player cannot reach the end of, and one that
  // cannot hit 1.0 exactly is a panel that cannot return to the shipped sound.
  const panel = fs.readFileSync(path.join(ROOT, "js/audio/panel.js"), "utf8");
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const A = boot().GameAudio;
  const range = A.tuneRange(), defs = A.tuneDefaults();

  const rows = [...panel.matchAll(/\{ k: "(\w+)",\s*id: "([\w-]+)",\s*lo: ([\d.]+),\s*step: ([\d.]+) \}/g)];
  assert.equal(rows.length, 22, "expected twenty-two tuner sliders");
  for (const [, key, id, loS, stepS] of rows) {
    const lo = Number(loS), step = Number(stepS);
    const m = shell.match(new RegExp(`<input id="${id}" type="range" min="0" max="(\\d+)" step="1" value="(\\d+)"`));
    assert.ok(m, `${id} is missing from the shell, or its attributes changed shape`);
    const max = Number(m[1]), dflt = Number(m[2]);
    const [rLo, rHi] = range[key];
    assert.ok(Math.abs(lo - rLo) < 1e-9, `${key}: the panel starts at ${lo}, the engine's range at ${rLo}`);
    assert.ok(Math.abs(lo + max * step - rHi) < 1e-9,
      `${key}: the slider tops out at ${lo + max * step}, the engine allows ${rHi} — the player cannot reach the end`);
    // The shipped sound is TUNE_DEF, no longer an identity trim (tone-model.js):
    // the shell's default position must land on it, or the panel opens with the
    // thumb somewhere the engine is not and can never return (bug-hunt 2 H23).
    assert.ok(Math.abs(lo + dflt * step - defs[key]) < 1e-9,
      `${key}: the default position is ${lo + dflt * step}, not the shipped ${defs[key]} — the panel cannot return to the shipped sound`);
  }
});

test("BRIGHTNESS keeps moving the corner across its whole range, and stops below Nyquist", async () => {
  const A = await sampleEngine();
  const at = (b) => { A.setTune({ brightness: b }); A.setEngine(0.8, 0, false, 0.6, 6, {}); return A.engineCut(); };
  const [lo, hi] = A.tuneRange().brightness;
  const NY = 44100 * 0.5;
  let last = -1;
  for (const b of [lo, 0.6, 1, 1.5, 2, hi]) {
    const cut = at(b);
    assert.ok(cut > last, `BRIGHTNESS ${b} did not open the filter further (${last} -> ${cut})`);
    assert.ok(cut < NY, `corner ${cut} Hz is at or past Nyquist, where the node pins it silently`);
    last = cut;
  }
});

test("the LIMITER is three knobs: depth that never inverts the gate, a rate, and a pitch sag", async () => {
  const A = await neutralEngine();
  const atLimiter = () => A.setEngine(0.99, 0, false, 0.9, 7, {});
  const r = A.tuneRange();
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  for (const k of [0, 0.5, 1, 2, r.limiter[1]]) {
    A.setTune({ limiter: k });
    atLimiter();
    // engGain's base is (lvl - depth) and the square swings +-depth on top, so
    // the trough is lvl - 2*depth. Negative there is a phase flip, not a cut.
    const depth = A.limiterDepth(), lvl = A.engineLevel() + depth;
    assert.ok(depth <= lvl * 0.5 + 1e-9,
      `DEPTH ${k}: depth ${depth} exceeds half of level ${lvl} — the gate inverts`);
    assert.ok(Math.abs(A.limiterHz() - 13) < 0.01, "DEPTH must not move the chop rate — that is RATE's knob now");
  }
  A.setTune({ limiter: 1 });
  let lastHz = -1;
  for (const k of [r.limRate[0], 0.7, 1, 2, r.limRate[1]]) {
    A.setTune({ limRate: k });
    const hz = A.limiterHz();
    assert.ok(hz > lastHz, `RATE ${k}: the chop rate stopped rising (${lastHz} -> ${hz})`);
    lastHz = hz;
  }
  A.setTune({ limRate: 1 });
  assert.ok(Math.abs(A.limiterHz() - 13) < 0.01, "1.0 is still the stock 13 Hz cut");
  // PITCH SAG: cents of swing in step with the cut, only while the cut is on.
  atLimiter();
  const sag = A.limiterCents();
  assert.ok(sag > 0, "the stock tune sags on each cut");
  A.setTune({ limPitch: 3 });
  atLimiter();
  assert.ok(Math.abs(A.limiterCents() - sag * 3) < 1e-6, "PITCH SAG is a multiplier on the cents");
  A.setTune({ limPitch: 0 });
  atLimiter();
  assert.equal(A.limiterCents(), 0, "zero is a steady note under the cut");
  A.setTune({ limPitch: 1 });
  A.setEngine(0.8, 0, false, 0.9, 7, {});
  assert.equal(A.limiterCents(), 0, "and below the limiter the note never sags");
  A.setLayer("limiter", false);
  atLimiter();
  assert.equal(A.limiterCents(), 0, "the switch is the hard off for the sag too");
});

test("BOOST is the ERS layers' level and the rev lift under deploy", async () => {
  const A = await neutralEngine();
  const deploying = () => A.setEngine(0.7, 1, false, 0.7, 6, { deploy: 1, energy: 1 });
  const coasting = () => A.setEngine(0.7, 0, false, 0.7, 6, {});
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  coasting();
  const flat = A.rate();
  deploying();
  const lift = A.rate() / flat;
  assert.ok(lift > 1.03 && lift < 1.05, `the stock deploy lift is 4%, got ${lift}`);
  const whine = A.ersLevel();
  assert.ok(whine > 0, "the stock tune whines while deploying");
  A.setTune({ boostPitch: 3 });
  deploying();
  assert.ok(Math.abs((A.rate() / flat - 1) - 0.04 * 3) < 1e-6, "REV LIFT is a multiplier on the 4%");
  A.setTune({ boostPitch: 0 });
  deploying();
  assert.ok(Math.abs(A.rate() - flat) < 1e-9, "zero lift leaves the note where coasting has it");
  A.setTune({ boostPitch: 1, boost: 2.5 });
  deploying();
  assert.ok(A.ersLevel() > whine * 2, "LEVEL scales the deploy whine");
  A.setTune({ boost: 0 });
  deploying();
  assert.equal(A.ersLevel(), 0, "zero is a silent hybrid");
  // The deploy whoosh is a one-shot; its level is what the trim gave it.
  A.setTune({ boost: 1 });
  A.deployBoost();
  const stock = A.boostState().peak;
  assert.ok(stock > 0 && A.boostState().fired === 1, "a deploy fires one whoosh at the stock level");
  A.setTune({ boost: 2 });
  A.deployBoost();
  assert.ok(Math.abs(A.boostState().peak - stock * 2) < 1e-9, "the trim scales the whoosh");
});

test("the layers that only had a switch now have a level", async () => {
  const { GameAudio: A, release, ctxTime } = boot();
  A.init();
  await release();
  A.startEngine();
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  // Wind at speed, harvest under a lift, tyres sliding, a rival alongside.
  const windy = () => A.setEngine(0.8, 0, false, 0.9, 6, {});
  const harvesting = () => {   // the harvest layer follows the smoothed decel of speed01 over TIME
    for (let i = 0; i < 8; i++) { ctxTime(0.05); A.setEngine(0.6, 0, false, 0.9 - i * 0.05, 5, { ax: -6 }); }
  };
  const sliding = () => A.setSkid(0.8, false);
  const rival = () => { A.setRivals([{ lat: 3, arc: 1, rev: 0.8, approach: 0 }]); return A.rivalState()[0].gain; };
  const cases = [
    ["wind",    windy,      () => A.windLevel()],
    ["harvest", harvesting, () => A.harvestLevel()],
    ["screech", sliding,    () => A.skidLevel()],
    ["rivals",  () => {},   rival],
  ];
  for (const [k, drive, read] of cases) {
    A.setTune({ [k]: 1 });
    drive();
    const base = read();
    assert.ok(base > 0, `${k}: precondition — the layer is audible on this frame`);
    A.setTune({ [k]: 2.5 });
    drive();
    assert.ok(read() > base * 2, `${k}: the trim must scale it (${base} -> ${read()})`);
    A.setTune({ [k]: 0 });
    drive();
    assert.equal(read(), 0, `${k}: zero must be silent`);
    A.setTune({ [k]: 1 });
  }
});

test("rival voices are four distinct cars, not one car four times", async () => {
  const A = await sampleEngine();
  // Four cars in a line, all at the same rev: the only thing separating their
  // pitches is the per-slot detune spread, so they must still all differ.
  A.setRivals([0, 1, 2, 3].map((i) => ({ lat: 0, arc: 4 + i * 4, rev: 0.6, approach: 0 })));
  const rates = A.rivalState().map((v) => v.rate);
  assert.equal(new Set(rates).size, 4, `four voices share a pitch: ${rates.join(", ")}`);
  const spread = Math.max(...rates) / Math.min(...rates);
  assert.ok(spread > 1.001 && spread < 1.05, `spread ${spread} is not a few cents`);
});

test("a rival close alongside is heard, and one far up the road fades instead of popping", async () => {
  const A = await sampleEngine();
  const one = (arc, lat = 0, rev = 0.8) => {
    A.setRivals([{ lat, arc, rev, approach: 0 }]);
    return A.rivalState()[0];
  };
  const near = one(1, 4), far = one(100), gone = one(200);   // alongside on the right
  assert.ok(near.gain > 0.2, `a car three metres away is at ${near.gain}, which is a rumour`);
  assert.ok(far.gain > 0 && far.gain < near.gain, "a hundred metres up the road is quiet but present");
  assert.equal(gone.gain, 0, "past the audible radius it is gone");
  assert.ok(near.pan > 0.6, "a car alongside on your right is on your right");
  assert.ok(near.cut > far.cut, "and the far one has lost its top end to the air");
});

test("Doppler is bounded however hard two cars close on each other", async () => {
  const A = await sampleEngine();
  const rate = (approach) => {
    A.setRivals([{ lat: 0, arc: 5, rev: 0.5, approach }]);
    return A.rivalState()[0].rate;
  };
  const still = rate(0);
  assert.ok(rate(40) > still, "a car closing rises in pitch");
  assert.ok(rate(-40) < still, "one dropping away falls");
  for (const v of [1e6, -1e6, NaN, Infinity]) {
    const r = rate(v);
    assert.ok(Number.isFinite(r) && r > 0.05 && r < 2, `approach ${v} produced playbackRate ${r}`);
  }
});

test("the field is audible on the oscillator fallback too, and not louder than you", async () => {
  const A = synthEngine();
  const one = (arc, rev = 0.8) => {
    A.setRivals([{ lat: 0, arc, rev, approach: 0 }]);
    return A.rivalState()[0];
  };
  const near = one(3);
  assert.ok(near.gain > 0, "a car three metres away is silent on the fallback");
  assert.equal(near.rate, 0, "the synth voice has no playbackRate to report");
  assert.ok(near.hz > 100, `the synth voice is not pitched: ${near.hz} Hz`);
  assert.ok(one(3, 0.2).hz < near.hz, "and it does not rise with their revs");

  // The saws are far hotter than the recording, which is why the player's own
  // fallback runs at about a fifth of the sample core's level. A rival that
  // ignored that discount would be louder than the car you are sitting in.
  A.setEngine(0.9, 0, false, 0.9, 6, {});
  const mine = A.engineLevel() + A.limiterDepth();
  assert.ok(near.gain < mine, `a rival at ${near.gain} is over your own engine at ${mine}`);

  const gone = one(200);
  assert.equal(gone.gain, 0, "and it still goes away past the audible radius");
});

test("four fallback voices are four cars as well", () => {
  const A = synthEngine();
  A.setRivals([0, 1, 2, 3].map((i) => ({ lat: 0, arc: 4 + i * 4, rev: 0.6, approach: 0 })));
  const hz = A.rivalState().map((v) => v.hz);
  assert.equal(new Set(hz).size, 4, `four fallback voices share a pitch: ${hz.join(", ")}`);
});

test("net-owned rival rev steps (~10 Hz) keep maxRivalHzJump under 25 Hz", () => {
  const { GameAudio: A, ctxTime } = boot();
  A.init();
  A.startEngine();
  assert.equal(A.debug().usingSamples, false);
  const rival = { lat: 3, arc: 8, approach: 0, voice: "", slot: 0 };
  const lo = 0.35, hi = 0.60;
  for (let w = 0; w < 12; w++) {
    A.setRivals([{ ...rival, rev: lo, net: true, key: 42 }]);
    ctxTime(1 / 60);
  }
  const rivalHz = () => A.rivalState()[0].hz;
  let maxJump = 0, prev = rivalHz();
  for (let f = 0; f < 360; f++) {
    const rev = Math.floor(f / 6) % 2 === 0 ? lo : hi;
    A.setRivals([{ ...rival, rev, net: true, key: 42 }]);
    ctxTime(1 / 60);
    const hz = rivalHz();
    maxJump = Math.max(maxJump, Math.abs(hz - prev));
    prev = hz;
  }
  assert.ok(maxJump < 25, `net rival pitch must not zipper (max frame jump ${maxJump.toFixed(1)} Hz)`);
});

test("solo AI rival rev step reaches 90% within 200 ms", () => {
  const { GameAudio: A, ctxTime } = boot();
  A.init();
  A.startEngine();
  const rival = { lat: 3, arc: 8, approach: 0, voice: "", slot: 0 };
  const from = 0.25, to = 0.85;
  A.setRivals([{ ...rival, rev: from, net: false, key: 7 }]);
  ctxTime(1 / 60);
  const rivalHz = () => A.rivalState()[0].hz;
  const hz0 = rivalHz();
  A.setRivals([{ ...rival, rev: to, net: false, key: 7 }]);
  ctxTime(1 / 60);
  const target = rivalHz();
  const need = hz0 + 0.9 * (target - hz0);
  let reached = -1;
  for (let f = 1; f <= 14; f++) {
    A.setRivals([{ ...rival, rev: to, net: false, key: 7 }]);
    ctxTime(1 / 60);
    if (rivalHz() >= need - 0.5) { reached = f * (1000 / 60); break; }
  }
  assert.ok(reached >= 0 && reached <= 200, `solo rival must hit 90% within 200 ms (got ${reached} ms)`);
});

test("rival voice slot reassignment snaps pitch to the new car", () => {
  const { GameAudio: A, ctxTime } = boot();
  A.init();
  A.startEngine();
  const rival = { lat: 3, arc: 8, approach: 0, voice: "", slot: 0 };
  A.setRivals([{ ...rival, rev: 0.2, net: true, key: 1 }]);
  ctxTime(1 / 60);
  const lowHz = A.rivalState()[0].hz;
  A.setRivals([{ ...rival, rev: 0.92, net: true, key: 2 }]);
  ctxTime(1 / 60);
  assert.ok(A.rivalState()[0].hz > lowHz + 300, "reassigned slot must snap, not glide");
});

test("a voice stays with its car when two rivals swap places", async () => {
  // js/audio/rivals.js binds each car to a voice (row.slot) for as long as it
  // stays in the voiced set. setRivals must play a row on ITS voice, not on
  // the voice of its rank: a rank swap used to glide the two pans across each
  // other and jump each note by the slot-detune delta.
  const A = await sampleEngine();
  const left = { lat: -4, arc: 6, rev: 0.6, approach: 0, slot: 0 };
  const right = { lat: 4, arc: 8, rev: 0.6, approach: 0, slot: 1 };
  A.setRivals([left, right]);
  const before = A.rivalState();
  right.arc = 5;   // the right-hand car is now nearer: the list is re-sorted
  A.setRivals([right, left]);
  const after = A.rivalState();
  assert.ok(before[0].pan < 0 && after[0].pan < 0, "voice 0 is still the car on your left");
  assert.ok(before[1].pan > 0 && after[1].pan > 0, "voice 1 is still the car on your right");
  assert.equal(after[0].rate, before[0].rate, "and neither note moved: same car, same rev, same detune");
  assert.equal(after[1].rate, before[1].rate);
  assert.equal(after[2].gain, 0, "the unbound voices stay silent");
});

test("the same rpm is the same note in every gear, and upshift drops shrink up the box", async () => {
  // LOW_GEAR_RATE (0.60/0.72/0.84 on gears 1-3) put the 15 000 rpm limiter 884
  // cents lower in 1st than in 4th and made the 3->4 drop (-369 c) smaller than
  // 4->5 (-603 c). The shipped voice now pitches by rpm alone.
  const A = await sampleEngine();
  const GEAR_TOP = [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0];   // js/physics/consts.js
  const IDLE = 5000, MAX = 15000;                                       // ditto
  const rate = (rev, gear) => { A.setEngine(rev, 0, false, 0.6, gear, {}); return A.rate(); };
  const drops = [];
  for (let g = 1; g < 8; g++) {
    const rpm = Math.max(IDLE, MAX * GEAR_TOP[g - 1] / GEAR_TOP[g]);   // game.js rpmFor right after the shift
    drops.push(1200 * Math.log2(rate((rpm - IDLE) / (MAX - IDLE), g + 1) / rate(1, g)));
  }
  for (let i = 1; i < drops.length; i++)
    assert.ok(Math.abs(drops[i]) < Math.abs(drops[i - 1]), `upshift drops must shrink: ${drops.map(Math.round).join(" ")}`);
  // The range barely moved: the top-gear limiter is where the shipped voice had
  // it (0.7097), and the idle lies between the old 1st-gear idle (0.1275) and
  // the old 4th-and-up idle (0.2125).
  assert.ok(Math.abs(rate(1, 8) - 0.7097) < 0.001, `top-gear limiter moved to ${rate(1, 8)}`);
  for (const g of [1, 4, 8])
    assert.ok(rate(0, g) > 0.1275 && rate(0, g) < 0.2125, `idle in gear ${g} is ${rate(0, g)}`);
});

test("the shipped detune 0 leaves the sample core at the voice's own cents", async () => {
  const A = await sampleEngine();
  assert.equal(A.tune().detune, 0, "precondition: the shipped voice has detune off");
  assert.equal(A.detuneCents(), 0, "the default voice is 0 cents, not 30 flat");
});

test("mute, the SFX bus and the music level glide instead of stepping", async () => {
  // A `.value =` write is a step mid-waveform: a click on the mute button and a
  // zipper on a dragged slider. Each must cancel what is in flight and aim with
  // setTargetAtTime (tau ~20 ms).
  const { GameAudio: A, release, ctx } = boot();
  const gains = [];
  const mk = ctx.createGain;
  ctx.createGain = () => { const n = mk(); gains.push(n); return n; };
  A.init();
  A.startMusic();
  await release();
  const [master, sfxBus] = gains;   // created first, in that order (engine.js createCtx)
  const glided = (p, v, what) => {
    assert.equal(p.lastMethod, "target", `${what}: a setTargetAtTime, not a direct write`);
    assert.ok(p.cancels > 0, `${what}: the in-flight glide is cancelled first`);
    assert.ok(Math.abs(p.value - v) < 1e-9, `${what}: aimed at ${v}, got ${p.value}`);
  };
  A.setEnabled(false); glided(master.gain, 0, "master mute");
  A.setEnabled(true); glided(master.gain, 0.8, "master unmute");
  A.setSfxVolume(0.4); glided(sfxBus.gain, 0.4, "sfx volume");
  A.setSfxEnabled(false); glided(sfxBus.gain, 0, "sfx off");
  A.setSfxEnabled(true);
  const music = gains.find((g) => g !== master && g !== sfxBus && g.gain.value === 0.5 * 0.52);
  assert.ok(music, "precondition: the music gain exists at its default level");
  A.setMusicVolume(0.25); glided(music.gain, 0.25 * 0.52, "music volume");
});

// A RADIO LINE ON AIR KEEPS THE MUSIC UNDER IT, whatever else moves the music
// level. setEngine re-applies the radio duck every frame, but only while the
// engine runs with SFX on; the settings sheet that carries the music slider and
// the SFX switch also carries the radio TEST buttons, and it is open on the
// title or under the pause card, engine stopped. Three writers ignored the duck:
// the slider (musicVol * MUSIC_FULL), SFX OFF (releaseEngineDuck(..., false))
// and a music gain created mid-line. Each put the music back over the voice for
// the rest of the clip.
async function duckRig() {
  const b = boot(); const gains = []; const mk = b.ctx.createGain;
  b.ctx.createGain = () => { const n = mk(); gains.push(n); return n; };
  b.GameAudio.init(); b.GameAudio.startMusic(); await b.release();
  const music = gains.find((g) => g !== gains[0] && g !== gains[1] && Math.abs(g.gain.value - 0.5 * 0.52) < 1e-9);
  assert.ok(music, "precondition: the music gain exists at its default level");
  return { ...b, gains, music };
}
test("the music slider keeps a radio line's duck (engine stopped: title / pause sheet)", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  A.setRadioDuck(true);
  assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52 * 0.35) < 1e-9, "precondition: the line ducks the music");
  A.setMusicVolume(0.4);
  assert.ok(Math.abs(r.music.gain.value - 0.4 * 0.52 * 0.35) < 1e-9, `slider mid-line stays ducked, got ${r.music.gain.value}`);
  A.setRadioDuck(false);
  assert.ok(Math.abs(r.music.gain.value - 0.4 * 0.52) < 1e-9, "the line's end lifts it to the new level");
});
test("SFX OFF mid-line releases the engine's duck but keeps the radio's", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  A.startEngine(); A.setRadioDuck(true); A.setEngine(0.5, 0, false, 0.5, 4, {});
  assert.ok(r.music.gain.value < 0.5 * 0.52 * 0.35, "precondition: engine + radio duck stacked");
  A.setSfxEnabled(false);
  assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52 * 0.35) < 1e-9, `SFX off mid-line stays under the voice, got ${r.music.gain.value}`);
  A.setRadioDuck(false);
  assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52) < 1e-9, "and comes up when the line ends");
});
test("a music gain created while a line is on air starts ducked", async () => {
  const b = boot(); const gains = []; const mk = b.ctx.createGain;
  b.ctx.createGain = () => { const n = mk(); gains.push(n); return n; };
  const A = b.GameAudio; A.init(); await b.release();
  A.setRadioDuck(true);
  const n0 = gains.length; A.startMusic(); await b.release();
  const g = gains.slice(n0).find((x) => x.gain.value > 0);
  assert.ok(g, "precondition: startMusic built the music gain");
  assert.ok(Math.abs(g.gain.value - 0.5 * 0.52 * 0.35) < 1e-9, `born at the ducked level, got ${g.gain.value}`);
});

// SPOTTER CALLS DUCK THE MUSIC TOO (#988 left this alone). The engineer path
// ducks from radio-voice.js via setRadioDuck; the spotter never goes through
// that module — it keys radioVoice directly — so the duck has to live on the
// clip. Same depth as the engineer (0.35); release when the clip ends; and a
// spotter release must not lift the music under a live engineer line (or the
// reverse), because say() calls setRadioDuck(false) on every card replace even
// while pack.remaining("spotter") is still holding the next line's lead.
const clipBuf = (d) => ({ duration: d, sampleRate: SR, length: d * SR, numberOfChannels: 1, getChannelData: () => new Float32Array(1) });
test("a spotter clip ducks the music while it is on air", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  const full = 0.5 * 0.52;
  const ducked = full * 0.35;
  assert.ok(Math.abs(r.music.gain.value - full) < 1e-9, "precondition: music at the default level");
  const h = A.radioVoice([clipBuf(0.8)], 0, { channel: "spotter" });
  assert.ok(h, "precondition: spotter clip scheduled");
  assert.ok(Math.abs(r.music.gain.value - ducked) < 1e-9, `mid-spotter music stays ducked, got ${r.music.gain.value}`);
  h.stop();
  for (const fn of pendingTimers.splice(0)) fn();
  assert.ok(Math.abs(r.music.gain.value - full) < 1e-9, `spotter end releases the duck, got ${r.music.gain.value}`);
});
test("an engineer duck survives a nested spotter clip ending", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  const full = 0.5 * 0.52;
  const ducked = full * 0.35;
  A.setRadioDuck(true);
  const h = A.radioVoice([clipBuf(0.5)], 0, { channel: "spotter" });
  assert.ok(h);
  assert.ok(Math.abs(r.music.gain.value - ducked) < 1e-9, "both holds keep the music down");
  h.stop();
  for (const fn of pendingTimers.splice(0)) fn();
  assert.ok(Math.abs(r.music.gain.value - ducked) < 1e-9, `spotter end must not lift an engineer duck, got ${r.music.gain.value}`);
  A.setRadioDuck(false);
  assert.ok(Math.abs(r.music.gain.value - full) < 1e-9, "engineer end finally releases");
});
test("a spotter duck survives an engineer setRadioDuck(false) while the clip is still live", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  const full = 0.5 * 0.52;
  const ducked = full * 0.35;
  const h = A.radioVoice([clipBuf(0.6)], 0, { channel: "spotter" });
  assert.ok(h);
  A.setRadioDuck(true);
  A.setRadioDuck(false);   // stopVoice() on every card replace — unpaired with a spotter hold
  assert.ok(Math.abs(r.music.gain.value - ducked) < 1e-9, `engineer false must not cut the spotter duck short, got ${r.music.gain.value}`);
  h.stop();
  for (const fn of pendingTimers.splice(0)) fn();
  assert.ok(Math.abs(r.music.gain.value - full) < 1e-9, "spotter end releases once both holds are clear");
});
test("an engineer radioVoice clip does not own the duck (radio-voice.js does)", async () => {
  const r = await duckRig(); const A = r.GameAudio;
  const full = 0.5 * 0.52;
  const h = A.radioVoice([clipBuf(0.4)], 0, { channel: "radio" });
  assert.ok(h);
  assert.ok(Math.abs(r.music.gain.value - full) < 1e-9, `radio fx must not double-duck from radioVoice, got ${r.music.gain.value}`);
  h.stop();
  for (const fn of pendingTimers.splice(0)) fn();
});

test("playWatchMedia ducks music and routes media elements through the radio band", async () => {
  const b = boot({
    Audio: function AudioMock() {
      this.crossOrigin = "";
      this.preload = "";
      this.src = "";
      this.volume = 1;
      this.paused = false;
      this.ended = false;
      this.play = () => Promise.resolve();
      this.pause = () => {};
    },
  });
  const gains = [];
  const mk = b.ctx.createGain;
  b.ctx.createGain = () => { const n = mk(); gains.push(n); return n; };
  b.GameAudio.init();
  b.GameAudio.startMusic();
  await b.release();
  const musicGain = gains.find((g) => Math.abs(g.gain.value - 0.5 * 0.52) < 1e-9);
  assert.ok(musicGain, "precondition: music gain");
  const full = musicGain.gain.value;
  const GameAudioRadioFx = vm.runInContext("GameAudioRadioFx", b.vctx);
  const h = GameAudioRadioFx.playWatchMedia("https://example.test/radio.mp3", { volume: 0.9 });
  assert.ok(h && h.chained, "media element path chains into WebAudio");
  assert.ok(Math.abs(musicGain.gain.value - full * 0.35) < 1e-9, "music ducks for the clip");
  assert.ok((b.counts.mediaSrc || 0) >= 1, "createMediaElementSource ran");
  assert.ok((b.counts.biquad || 0) >= 2, "radio band filters are in the graph");
  h.stop();
  assert.ok(Math.abs(musicGain.gain.value - full) < 1e-9, "stop releases the duck");
});

test("the skid layer glides its gain and filter, and still lands an exact 0", async () => {
  const { GameAudio: A, release, ctx } = boot();
  const nodes = [];
  for (const k of ["createGain", "createBiquadFilter"]) {
    const mk = ctx[k];
    ctx[k] = () => { const n = mk(); nodes.push(n); return n; };
  }
  A.init(); await release(); A.startEngine();
  A.setSkid(0.7, false);
  const gain = nodes.find((n) => n.kind === "gain" && n.gain.value > 0 && Math.abs(n.gain.value - A.skidLevel()) < 1e-12);
  assert.ok(gain, "precondition: the skid gain is found");
  assert.equal(gain.gain.lastMethod, "target", "the slide level is a glide, not a stepped .value");
  const filt = nodes.find((n) => n.kind === "biquad" && n.frequency.lastMethod === "target" && n.frequency.value > 700 && n.frequency.value < 1200);
  assert.ok(filt, "the screech filter centre is a glide too");
  A.setSkid(0, false);
  assert.equal(A.skidLevel(), 0, "releasing the slide still aims at an exact 0");
  assert.equal(gain.gain.lastMethod, "target");
});

test("pausing and resuming does not strand nodes that keep rendering", async () => {
  // setPaused() in js/game.js stops the engine on pause and starts it on resume, so a long
  // session runs this cycle many times. engGainIdle and limGain were NULLED but
  // never DISCONNECTED, stranding two GainNodes per cycle — and a Gain still
  // wired into the bus keeps RENDERING (Web Audio contract), so this cost CPU as
  // well as memory. Measured at +2/cycle across EVERY point in engine.js's
  // history, so it predated the rival voices rather than arriving with them.
  const { GameAudio, release, flushTimers, liveNodes, ctx } = boot();
  GameAudio.init();
  await release();
  GameAudio.startEngine();
  assert.equal(GameAudio.debug().usingSamples, true, "precondition: the shipped core");

  const marks = [];
  for (let i = 0; i < 6; i++) {
    GameAudio.stopEngine();
    ctx.currentTime += 1;
    flushTimers();               // stopEngine defers its disconnects
    GameAudio.startEngine();
    marks.push(liveNodes());
  }
  assert.deepEqual(new Set(marks).size, 1,
    `the live node count must not grow across pause/resume: ${marks.join(" -> ")}`);
});

test("the same holds on the oscillator fallback, which builds a bigger graph", async () => {
  const { GameAudio, flushTimers, liveNodes, ctx } = boot();
  GameAudio.init();                       // never release(): the synth path
  GameAudio.startEngine();
  assert.equal(GameAudio.debug().usingSamples, false, "precondition: the fallback");
  const marks = [];
  for (let i = 0; i < 6; i++) {
    GameAudio.stopEngine();
    ctx.currentTime += 1;
    flushTimers();
    GameAudio.startEngine();
    marks.push(liveNodes());
  }
  assert.deepEqual(new Set(marks).size, 1,
    `fallback live node count grew across pause/resume: ${marks.join(" -> ")}`);
});

test("resume does not keep the fading graph rendering under the new one", async () => {
  // setPaused stop+start used to leave the old chain on sfxBus for 450 ms
  // (disconnect was deferred). Two full graphs — player + rivals + optional
  // convolver — is the pause-menu fps dip. startEngine now buries the dying
  // nodes before it builds.
  const { GameAudio, release, flushTimers, liveNodes } = boot();
  GameAudio.init();
  await release();
  GameAudio.startEngine();
  const one = liveNodes();
  GameAudio.stopEngine();
  GameAudio.startEngine();          // no flushTimers — the overlap window
  assert.equal(liveNodes(), one, "resume stacked the fading graph under the new one");
  flushTimers();
  assert.equal(liveNodes(), one, "the deferred disconnect must not drop the live graph");
});

test("a phone gets a cheaper graph: no convolver, half the rival voices", async () => {
  // Every other pool here is mobile-tiered; the 2026-09-04 audio was not, and a
  // ~1.5 s stereo ConvolverNode fed by the engine plus four looping rival voices
  // is the most expensive thing this file asks for. Reported as an iPhone that
  // had been fine that morning crashing — CPU contention, so it left no OOM
  // strike and no context-loss marker.
  const { GameAudio: A, release, counts } = boot({ mobile: true });
  A.init();
  await release();
  A.startEngine();
  assert.equal(A.debug().usingSamples, true, "precondition: the sample core");
  assert.equal(counts.convolver || 0, 0, "a phone built a ConvolverNode");
  assert.equal(A.rivalState().length, 2, "a phone built more than two rival voices");
  assert.equal(A.venue().level, 0, "venue() must report OFF rather than lie about a reverb that is not there");

  // ...and the desktop budget is untouched.
  const D = await sampleEngine();
  assert.equal(D.rivalState().length, 4, "desktop lost a rival voice");
  assert.ok(D.venue().level >= 0, "desktop still has a venue send");
});

test("GRAPHICS HIGH on a phone still gets the cheap audio graph", async () => {
  // mobileTier is IS_MOBILE && !gfxHigh. HIGH used to undo the phone cut.
  const { GameAudio: A, release, counts } = boot({ mobile: "high" });
  A.init();
  await release();
  A.startEngine();
  assert.equal(counts.convolver || 0, 0, "gfx-high phone built a ConvolverNode");
  assert.equal(A.rivalState().length, 2, "gfx-high phone built desktop rival voices");
});

test("two rival voices still give a LEFT and a RIGHT", async () => {
  // Halving the pool must not cost the thing the pool is FOR: a car alongside
  // has to land on the correct side, or the cue is worse than absent.
  const { GameAudio: A, release } = boot({ mobile: true });
  A.init(); await release(); A.startEngine();
  A.setRivals([
    { lat: -4, arc: 1, rev: 0.7, approach: 0 },   // hard left
    { lat: 4, arc: 1, rev: 0.7, approach: 0 },    // hard right
  ]);
  const [l, r] = A.rivalState();
  assert.ok(l.pan < -0.3, `left-hand car panned ${l.pan}`);
  assert.ok(r.pan > 0.3, `right-hand car panned ${r.pan}`);
  assert.ok(l.gain > 0 && r.gain > 0, "both alongside cars must be audible");
});

test("on two voices a car bound to slot 3 takes the free voice, not silence", async () => {
  // RivalAudio binds A-D to slots 0-3. A drops out of the nearest four; the
  // nearest two are B (slot 1) and C (slot 3). B takes voice 1; C's slot is out
  // of range on a phone and its rank fallback (1) is B's — it used to be
  // dropped while voice 0 sat idle.
  const { GameAudio: A, release } = boot({ mobile: true });
  A.init(); await release(); A.startEngine();
  A.setRivals([
    { lat: 4, arc: 2, rev: 0.7, approach: 0, slot: 1 },    // B, on your right
    { lat: -4, arc: 3, rev: 0.7, approach: 0, slot: 3 },   // C, on your left
  ]);
  const [v0, v1] = A.rivalState();
  assert.ok(v1.gain > 0 && v1.pan > 0.3, `B keeps its bound voice 1 (gain ${v1.gain}, pan ${v1.pan})`);
  assert.ok(v0.gain > 0, "C must be audible on the free voice 0, not muted");
  assert.ok(v0.pan < -0.3, `C on voice 0 is still on your left (pan ${v0.pan})`);
});

test("IDLE and REV RANGE reach a low idle AND a high redline at once", async () => {
  // The complaint that started the redesign: PITCH scaled both ends of the
  // curve, so a low, grumbling idle could only be bought by dragging the whole
  // curve down, and REV RANGE could not put the redline back. Measured on the
  // old table: PITCH 0.6 + REV RANGE 2.5 gave a redline rate of 0.83 against
  // the stock 0.70 — a fifth of an octave for a knob that read 2.5x. The four
  // knobs are independent now, and this pins that a low end and a high end
  // are reachable TOGETHER, not one at the other's expense.
  const A = await neutralEngine();
  const r = A.tuneRange();
  const at = (rev) => { A.setEngine(rev, 0, false, 0.6, 6, {}); return A.rate(); };
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  const stockIdle = at(0), stockTop = at(1);
  // Idle an octave under stock, redline an octave over it, in the same tune.
  A.setTune({ idle: 0.5, revRange: 3.0 });
  assert.ok(at(0) <= stockIdle * 0.5 + 1e-9, `idle ${at(0)} is not an octave under stock ${stockIdle}`);
  assert.ok(at(1) >= stockTop * 2, `redline ${at(1)} is not an octave over stock ${stockTop}`);
  // IDLE moves only the idle end: the span (top - idle) is REV RANGE's alone.
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  const span = at(1) - at(0);
  A.setTune({ idle: r.idle[1] });
  assert.ok(Math.abs((at(1) - at(0)) - span) < 1e-9, "IDLE changed the span, which is REV RANGE's job");
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  A.setTune({ revRange: 2 });
  assert.ok(Math.abs(at(0) - stockIdle) < 1e-9, "REV RANGE moved the idle end, which is IDLE's job");
  // And PITCH is a transpose: it scales both ends by the same factor.
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  A.setTune({ pitch: 1.5 });
  assert.ok(Math.abs(at(0) / stockIdle - 1.5) < 1e-9 && Math.abs(at(1) / stockTop - 1.5) < 1e-9,
    "PITCH must scale idle and redline alike");
  // The corners: the widest spread the panel can reach, and it must still be
  // a usable playbackRate at both ends.
  A.setTune({ idle: r.idle[0], pitch: r.pitch[0], revRange: r.revRange[0] });
  const lo = at(0);
  A.setTune({ idle: r.idle[1], pitch: r.pitch[1], revRange: r.revRange[1] });
  const hi = at(1);
  assert.ok(lo > 0.05 && hi < 5, `corner rates ${lo}..${hi} left the range a BufferSource plays cleanly`);
  assert.ok(hi / lo > 30, `the tuner's reach is ${(hi / lo).toFixed(1)}:1 — the redesign promised an order beyond stock`);
});

test("CURVE bends the path between idle and redline without moving either end", async () => {
  const A = await sampleEngine();
  const at = (rev) => { A.setEngine(rev, 0, false, 0.6, 6, {}); return A.rate(); };
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  const idle = at(0), top = at(1), midLinear = at(0.5);
  for (const c of [A.tuneRange().curve[0], 0.7, 1.4, A.tuneRange().curve[1]]) {
    A.setTune({ curve: c });
    assert.ok(Math.abs(at(0) - idle) < 1e-9 && Math.abs(at(1) - top) < 1e-9, `CURVE ${c} moved an end`);
    const mid = at(0.5);
    if (c > 1) assert.ok(mid < midLinear, `CURVE ${c} > 1 should hang low through the mid-range (${mid} vs ${midLinear})`);
    else assert.ok(mid > midLinear, `CURVE ${c} < 1 should rise early (${mid} vs ${midLinear})`);
  }
});

test("GRAVEL is roughness at idle that is gone by redline, and never inverts the engine", async () => {
  const A = await sampleEngine();
  const frame = (rev) => A.setEngine(rev, 0, false, 0.5, 5, {});
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  frame(0);
  const idle = A.gravelDepth();
  assert.ok(idle > 0, "the shipped tune must carry some roughness at idle");
  assert.ok(A.gravelHz() >= 18 && A.gravelHz() <= 140, `crank rate ${A.gravelHz()} Hz is outside the roughness band`);
  const lowHz = A.gravelHz();
  frame(0.5);
  assert.ok(A.gravelDepth() < idle * 0.5, "half revs should carry well under half the roughness");
  assert.ok(A.gravelHz() > lowHz, "the crank rate must rise with the engine");
  frame(1);
  assert.ok(A.gravelDepth() < 1e-6, `redline should be smooth, got ${A.gravelDepth()}`);
  // The trim scales it, zero is silent, and the switch is the hard off.
  frame(0);
  A.setTune({ gravel: 3 });
  frame(0);
  assert.ok(A.gravelDepth() > idle, "the GRAVEL trim must deepen it");
  // ...but a swing deeper than the engine's own level would take the gain
  // through zero, which is a phase flip rather than more grit.
  assert.ok(A.gravelDepth() <= A.engineLevel() + 1e-9,
    `depth ${A.gravelDepth()} exceeds the engine level ${A.engineLevel()} — the modulation inverts`);
  A.setTune({ gravel: 0 });
  frame(0);
  assert.equal(A.gravelDepth(), 0, "zero must be smooth, not merely smoother");
  A.setTune({ gravel: 1 });
  A.setLayer("gravel", false);
  frame(0);
  assert.equal(A.gravelDepth(), 0, "switched off is silent whatever the trim says");
  A.setLayer("gravel", true);
  frame(0);
  assert.ok(A.gravelDepth() > 0, "and back on restores it");
});

test("BRAKES roar under deceleration at speed and are silent on the throttle", async () => {
  const A = await sampleEngine();
  const frame = (ax, s) => A.setEngine(0.6, 0, false, s, 5, { ax });
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  frame(0, 0.8);
  assert.equal(A.brakeLevel(), 0, "coasting is silent");
  frame(10, 0.8);
  assert.equal(A.brakeLevel(), 0, "and so is accelerating");
  frame(-30, 0.8);
  const fast = A.brakeLevel();
  assert.ok(fast > 0, "a hard stop from speed must be audible");
  frame(-30, 0.15);
  assert.ok(A.brakeLevel() < fast, "the same stop from a crawl is quieter");
  frame(-55, 0.8);
  assert.ok(A.brakeLevel() > fast, "and a harder pedal is louder");
  A.setTune({ brakes: 3 });
  frame(-30, 0.8);
  assert.ok(A.brakeLevel() > fast * 2, "the BRAKES trim must scale it");
  A.setTune({ brakes: 0 });
  frame(-30, 0.8);
  assert.equal(A.brakeLevel(), 0, "zero is silent");
  A.setTune({ brakes: 1 });
  A.setLayer("brakes", false);
  frame(-30, 0.8);
  assert.equal(A.brakeLevel(), 0, "the switch is the hard off");
  A.setLayer("brakes", true);
  frame(-30, 0.8);
  assert.ok(A.brakeLevel() > 0, "and back on restores it");
});

test("the wastegate dumps once per lift, and only after a real pull", async () => {
  const { GameAudio: A, release, ctxTime } = boot();
  A.init();
  await release();
  A.startEngine();
  const run = (frames, ax, rev = 0.8) => {
    for (let i = 0; i < frames; i++) { ctxTime(0.05); A.setEngine(rev, 0, false, 0.7, 5, { ax }); }
  };
  const fired = () => A.wastegateState().fired;
  run(4, 0);
  assert.equal(fired(), 0, "nothing on a cold start");
  run(20, 10);                     // a second under load
  assert.equal(fired(), 0, "no dump while still pulling");
  run(2, -3);                      // the lift
  assert.equal(fired(), 1, "one dump on the lift");
  run(40, -3);
  assert.equal(fired(), 1, "and only one — staying off the throttle must not repeat it");
  run(4, 10);                      // a blip too short to build boost
  run(4, -3);
  assert.equal(fired(), 1, "a quarter-second stab of throttle is not a pull");
  run(20, 10, 0.3);                // a long pull at idle revs
  run(4, -3, 0.3);
  assert.equal(fired(), 1, "pulling at low revs builds no boost to dump");
  // It is the turbo's sound: the TURBO switch owns it.
  A.setLayer("whine", false);
  run(20, 10); run(4, -3);
  assert.equal(fired(), 1, "switched off with the turbo");
  A.setLayer("whine", true);
  run(20, 10); run(4, -3);
  assert.equal(fired(), 2, "and back with it");
});

test("the SHIFT trim scales the gear-change crack", async () => {
  const A = await sampleEngine();
  A.setTune(TUNE_IDENTITY);   // a KNOB is measured from neutral, not from the shipped voice
  A.shift(true);
  const stock = A.shiftState().peak;
  assert.ok(stock > 0 && A.shiftState().fired === 1, "a shift fires one crack at the stock level");
  A.setTune({ shift: 2.5 });
  A.shift(true);
  assert.ok(Math.abs(A.shiftState().peak - stock * 2.5) < 1e-9, "the trim is a multiplier on the crack");
  A.setTune({ shift: 0 });
  A.shift(false);
  assert.equal(A.shiftState().peak, 0, "zero is a silent gearbox");
  // The rev-cut is the ENGINE's behaviour and must survive a silent gearbox:
  // the next frame still dips.
  A.setEngine(0.7, 0, false, 0.6, 5, {});
  const ducked = A.engineLevel();
  A.setTune({ shift: 1 });
  for (let i = 0; i < 40; i++) A.setEngine(0.7, 0, false, 0.6, 5, {});
  assert.ok(ducked <= A.engineLevel() + 1e-9, "the shift duck stays with the engine, not the trim");
});

/* THE BRAKE CUE (GameAudio.brakeCue, driven by DrivingLine.cue).
 * A blip train has no persistent node, so brakeCueState() is the only surface
 * that can say the layer did anything — and the three things worth pinning are
 * exactly the three a listening test could not: that silence is silent, that
 * the RATE tightens with urgency, and that a stood-down cue does not bank a
 * backlog it then machine-guns out (the overrun crackle above shipped that bug
 * once, which is why its own clock is reset the same way).
 *
 * The rate is the assertion and the pitch is not, deliberately:
 * docs/research/DRIVING-CONTROLS-RESEARCH.md quotes Forza's Blind Driving
 * Assists on this ("the playback of these cues will vary in SPEED to indicate
 * the rate of deceleration required") and warns that a pitch ramp conflates
 * "a corner is coming" with "how much car you need". A test that pinned pitch
 * would be pinning the mistake. */
test("the braking cue is silent on the pace, tightens with urgency, and banks no backlog", async () => {
  // The SHIPPED path, and one clock: sfxOk() gates the whole layer on
  // isEnabled, which only init()+release()+startEngine() sets, so a bare
  // init() would have measured a permanently muted cue and called it silence.
  const { GameAudio, release, ctxTime } = boot();
  GameAudio.init();
  await release();
  GameAudio.startEngine();
  const fired = () => GameAudio.brakeCueState().fired;

  // Silence is silent, however long it is left running.
  const before = fired();
  for (let i = 0; i < 200; i++) { GameAudio.brakeCue(0); ctxTime(0.016); }
  assert.equal(fired(), before, "u=0 emits nothing at all");
  assert.equal(GameAudio.brakeCueState().urgency, 0);

  // A LOW urgency beeps; a HIGH urgency beeps more often over the same window.
  const count = (u, seconds) => {
    const t0 = fired();
    for (let i = 0; i < Math.round(seconds / 0.016); i++) { GameAudio.brakeCue(u); ctxTime(0.016); }
    return fired() - t0;
  };
  const slow = count(0.1, 4), fast = count(1, 4);
  assert.ok(slow > 0, `a light cue still beeps (${slow} in 4 s)`);
  assert.ok(fast > slow * 2, `full urgency is far denser: ${fast} vs ${slow} in 4 s`);
  // The shipped ends of the ramp, so a change to them is a decision: ~0.4 s
  // apart at the foot and ~0.07 s at full red.
  assert.ok(slow >= 8 && slow <= 12, `~10 blips in 4 s at u=0.1, got ${slow}`);
  assert.ok(fast >= 50 && fast <= 60, `~57 blips in 4 s at u=1, got ${fast}`);

  // NO BACKLOG: stand the cue down, let a long time pass, bring it back — the
  // next blip is one gap away, not a burst of everything that was "due".
  GameAudio.brakeCue(0);
  ctxTime(30);
  const t0 = fired();
  GameAudio.brakeCue(1);
  assert.equal(fired() - t0, 1, "exactly one blip on resume, not a banked burst");
});

test("assist brake cues stay silent during a real-race WATCH", async () => {
  const { GameAudio, release, ctxTime } = boot({ realWatch: true });
  GameAudio.init();
  await release();
  GameAudio.startEngine();
  const fired = () => GameAudio.brakeCueState().fired;
  const before = fired();
  for (let i = 0; i < 120; i++) { GameAudio.brakeCue(1); ctxTime(0.016); }
  assert.equal(fired(), before, "brake cue does not fire while watching a replay");
  const d0 = GameAudio.driveCueState().brakeFired;
  for (let i = 0; i < 80; i++) { GameAudio.driveBrakeTone(1); ctxTime(0.016); }
  assert.equal(GameAudio.driveCueState().brakeFired, d0, "audio driving-cue tone stays off in WATCH");
  const c0 = GameAudio.driveCueState().callFired;
  GameAudio.cornerCall("L");
  assert.equal(GameAudio.driveCueState().callFired, c0, "corner call stays off in WATCH");
});

/* ── TEAM RADIO FX ──────────────────────────────────────────────────────────
 *
 * The one thing this chain must never become is a filter on the voice, because
 * it cannot be one: speechSynthesis has no node in this graph and no browser
 * exposes its output as a stream. What it IS — a click, a band-limited hiss
 * bed and a squelch tail around the card — is ordinary Web Audio, and these
 * are the parts of it that are worth asserting rather than listening to.
 */

/** Fire every pending onended, as a real context does once a source stops. */
function endAll() { for (const n of [...live]) if (n.onended) { const f = n.onended; n.onended = null; f(); } }
const band = () => [...live].filter((n) => n.kind === "biquad")
  .map((n) => `${n.type}@${Math.round(n.frequency.value)}`);

test("a transmission is band-limited to the voice-radio band at both ends", async () => {
  const GameAudio = await sampleEngine();
  assert.equal(GameAudio.radioSting("radio", 1.5), true);
  const f = band();
  // 300 Hz – 3.4 kHz is what analogue and digital voice radio both carry, and
  // why every handheld sounds alike. A chain missing the HIGHPASS is the easy
  // regression: it still hisses, but it hisses like weather, not like a mic.
  assert.ok(f.includes("highpass@300"), "no 300 Hz highpass — the hiss keeps a bottom end no radio has: " + f.join(" "));
  assert.ok(f.includes("lowpass@3400"), "no 3.4 kHz lowpass on the engineer's channel: " + f.join(" "));
});

test("the driving coach is not on a radio, and says so by making no sound", async () => {
  const GameAudio = await sampleEngine();
  endAll();
  const before = live.size;
  assert.equal(GameAudio.radioSting("coach", 1.5), false,
    "a squelch on the coach is a lie about where the line comes from");
  assert.equal(live.size, before, "...and it must not have built a graph either");
  assert.equal(GameAudio.radioSting("nonsense-kind", 1.5), false,
    "an unknown channel is silent by construction — the kind arrives as a string from js/game.js");
});

test("the level clamps, and zero is properly off", async () => {
  const GameAudio = await sampleEngine();
  assert.equal(GameAudio.setRadioFx(99), GameAudio.radioFxMax(), "a hand-edited store must not blow the level out");
  assert.equal(GameAudio.setRadioFx(-1), 0);
  assert.equal(GameAudio.setRadioFx(NaN), 1, "a NaN from localStorage falls back to the shipped level");
  endAll();
  const before = live.size;
  GameAudio.setRadioFx(0);
  assert.equal(GameAudio.radioSting("radio", 1.5), false, "off means off, not quiet");
  assert.equal(live.size, before);
});

test("a preempted transmission leaves nothing rendering", async () => {
  const GameAudio = await sampleEngine();
  endAll();
  const before = live.size;
  // A penalty cutting off the engineer is a case the game produces on its own,
  // so re-entry is the normal path and not an edge one.
  for (let i = 0; i < 12; i++) GameAudio.radioSting("radio", 2);
  GameAudio.radioStingStop();
  endAll();
  assert.equal(live.size, before,
    "twelve preempts left " + (live.size - before) + " nodes wired into sfxBus — a Gain still connected keeps rendering for ever");
});

/* The engine keeps its own oscillators running (gravel, whine, sub, limiter),
 * so the courtesy tone has to be measured as a DELTA around the sting rather
 * than as the contents of the graph. */
const oscSet = () => new Set([...live].filter((n) => n.kind === "osc"));
function newTones(before) {
  return [...live].filter((n) => n.kind === "osc" && !before.has(n)).map((n) => Math.round(n.frequency.value));
}

test("the engineer's cue is a four-note figure, not a beep", () => {
  /* MEASURING IT BADLY SAID "ONE NOTE". The CC0 recreation of the F1 beep was
   * first FFT'd in its single loudest window, which reported a near-pure
   * 786 Hz — and one window of a melody can only ever see one note of it. A
   * spectrogram across the whole file shows four: 1055, 775, 1184, 991 Hz,
   * about 100 ms each. That is the shape this asserts. */
  const { GameAudio } = boot();
  GameAudio.init();
  GameAudio.startEngine();
  const before = oscSet();
  assert.equal(GameAudio.radioSting("radio", 2), true);
  const hz = newTones(before);
  assert.equal(hz.length, 4, "a beep where a figure should be: " + hz.join(","));
  const want = [1055, 775, 1184, 991];
  for (let i = 0; i < want.length; i++)
    assert.ok(Math.abs(hz[i] - want[i]) <= 22,
      `note ${i + 1} is ${hz[i]} Hz, measured ${want[i]} Hz (FFT bin was 21.5 Hz)`);
  // Down a fourth, up a fifth, down a minor third — the shape, independent of
  // the exact tuning, so a deliberate transpose stays legal and a scramble does not.
  const semis = hz.slice(1).map((v, i) => 12 * Math.log2(v / hz[i]));
  assert.ok(semis[0] < -4 && semis[0] > -7, "first move is down a fourth-ish: " + semis[0].toFixed(1));
  assert.ok(semis[1] > 6 && semis[1] < 9, "then up a fifth-ish: " + semis[1].toFixed(1));
  assert.ok(semis[2] < -2 && semis[2] > -5, "then down a minor third-ish: " + semis[2].toFixed(1));
  // Still inside the band the rest of the frame lives in, and out of the
  // piercing register Quindar's 2525 Hz had put it in.
  for (const f of hz) assert.ok(f > 300 && f < 1500, `${f} Hz is outside the register this figure sits in`);
});

test("the courtesy figure obeys the same gates as the rest of the frame", () => {
  const { GameAudio } = boot();
  GameAudio.init();
  GameAudio.startEngine();
  let before = oscSet();
  assert.equal(GameAudio.radioSting("coach", 1.5), false);
  assert.equal(newTones(before).length, 0, "the coach is not on a radio, so there is nothing to key");
  GameAudio.setRadioFx(0);
  before = oscSet();
  GameAudio.radioSting("radio", 1.5);
  assert.equal(newTones(before).length, 0, "off means off — the figure is part of the frame, not beside it");
  GameAudio.setRadioFx(1);
  // Race control is a different source and gets its own, shorter cue: the
  // broadcast does not put the team-radio sting over race control either, and
  // two channels that open identically are one channel.
  before = oscSet();
  GameAudio.radioSting("control", 1.5);
  const ctl = newTones(before);
  assert.ok(ctl.length >= 1 && ctl.length < 4, "race control is shorter than the engineer's: " + ctl.join(","));
  for (const f of ctl) assert.ok(f > 300 && f < 1500, `${f} Hz is outside the register`);
});

test("the hiss bed outlasts the figure, however short the card", () => {
  // A short card is shorter than four notes. Scheduling the squelch tail off
  // the card's life alone closed the mic while the cue was still playing —
  // the tail is the END of a transmission the figure has only just opened.
  const src = fs.readFileSync(path.join(ROOT, "js/audio/radio-fx.js"), "utf8");
  const fn = src.match(/function radioSting\([\s\S]*?\n    \}/);
  assert.ok(fn, "could not find radioSting in js/audio/radio-fx.js");
  assert.match(fn[0], /const hold = Math\.max\(0\.25, tuneS \+ [\d.]+,/,
    "hold must be floored by the figure's own length, not just the card's");
  // ...and the figure has to be measured, not assumed: radioTune returns it.
  assert.match(fn[0], /const tuneS = [\d.]+ \+ radioTune\(/);
});

// ---- camera mix, downshift flare, car SFX, wheel guns (js/audio/car-sfx.js) ----

test("the camera mix: chase is neutral, TV sits your car back and opens the venue, onboard dries it", async () => {
  const A = await sampleEngine();
  const drive = () => { for (let i = 0; i < 4; i++) A.setEngine(0.7, 0, false, 0.6, 5, {}); return A.engineLevel(); };
  assert.equal(A.setCameraMix("chase"), "chase");
  const chase = drive(), chaseRev = A.venue().level;
  assert.equal(A.setCameraMix("heli"), "tv");
  const tv = drive(), tvRev = A.venue().level;
  assert.ok(tv < chase * 0.7, `TV camera must pull your engine back: ${tv} vs ${chase}`);
  assert.ok(tvRev >= chaseRev, "TV camera opens the reverb, never closes it");
  assert.equal(A.setCameraMix("cockpit"), "onboard");
  assert.ok(drive() > chase, "onboard is closer to the engine than the chase camera");
  assert.equal(A.setCameraMix("no-such-camera"), "chase", "an unknown id is the neutral mix");
  assert.equal(drive(), chase, "back on chase, every level is what it was");
});

test("a downshift flares the note, then it settles; an upshift does not", async () => {
  const A = await sampleEngine();
  for (let i = 0; i < 4; i++) A.setEngine(0.5, 0, false, 0.5, 4, {});
  const base = A.rate();
  A.shift(true);
  A.setEngine(0.5, 0, false, 0.5, 4, {});
  assert.equal(A.carSfx().revFlare, 0, "an upshift is a cut, not a blip");
  A.shift(false);
  A.setEngine(0.5, 0, false, 0.5, 4, {});
  const flared = A.rate();
  assert.ok(flared > base * 1.02 && flared < base * 1.06, `downshift blip overshoots by a few percent: ${flared} vs ${base}`);
});

test("car SFX levels follow the car's own state, never the road's curvature", () => {
  const sb = { Math, Number, Object, GameAudio: {} };
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/car-sfx.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "car-sfx.js" });
  const sent = [], guns = [];
  sb.GameAudio.setCarSfx = (o) => sent.push({ ...o });
  sb.GameAudio.pitGun = (t) => guns.push(t);
  const G = { vTop: () => 100, isWetRoad: () => false };
  const S = vm.runInContext("CarSfx", vctx).create(G);
  const L = (c, v) => ({ ...S.levels(c, v) });

  assert.deepEqual(L({ frontUtil: 0.9, wheelLock: 0 }, 0.5), { scrub: 0, lock: 0, surface: 0, pitLim: 0 }, "below the grip peak it is silent");
  assert.ok(L({ frontUtil: 1.1 }, 0.5).scrub > 0.5, "fronts past the peak scrub");
  assert.equal(L({ frontUtil: 1.1, offroad: true }, 0.5).scrub, 0, "off the road the rumble carries it, not the scrub");
  assert.equal(L({ wheelLock: 1 }, 0.5).lock, 1, "a locked wheel squeals");
  assert.equal(L({ wheelLock: 1 }, 0.01).lock, 0, "...but not at a crawl");
  assert.ok(L({ offroad: true }, 0.9).surface > L({ offroad: true }, 0.2).surface, "the rumble grows with speed");
  assert.equal(L({ pitState: "lane" }, 0.2).pitLim, 1, "rolling down the lane is on the limiter");
  assert.equal(L({ pitState: "box" }, 0).pitLim, 0, "stationary in the box is not");

  // Wheel guns on the stop's edges: loosen into the box, tighten on release.
  const car = { speed: 10, pitState: "none" };
  S.update(car);
  car.pitState = "lane"; S.update(car);
  car.pitState = "box"; S.update(car); S.update(car);
  car.pitState = "out"; S.update(car);
  assert.deepEqual(guns, [false, true], "one loosen, one tighten, nothing per frame");
  assert.equal(sent.length, 5, "levels go out every frame");
  // A new race's car starting mid-state does not fire a phantom gun.
  S.update({ speed: 0, pitState: "box" });
  assert.equal(guns.length, 2, "a fresh car resets the edge");
});

test("a rewind that jumps the race clock across a pit edge re-seeds wheel guns silently", () => {
  const sb = { Math, Number, Object, GameAudio: {} };
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/car-sfx.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "car-sfx.js" });
  const guns = [];
  sb.GameAudio.setCarSfx = () => {};
  sb.GameAudio.pitGun = (t) => guns.push(t);
  const G = { vTop: () => 100, isWetRoad: () => false, raceT: 50 };
  const S = vm.runInContext("CarSfx", vctx).create(G);
  const car = { speed: 10, pitState: "none" };
  S.update(car);
  G.raceT = 51; car.pitState = "lane"; S.update(car);
  G.raceT = 52; car.pitState = "box"; S.update(car);
  assert.deepEqual(guns, [false], "forward into the box loosens once");
  // Coach rewind: race clock steps back while pitState jumps to before the stop.
  G.raceT = 48; car.pitState = "none"; S.update(car);
  G.raceT = 49; car.pitState = "lane"; S.update(car);
  assert.equal(guns.length, 1, "rewind across edges does not replay wheel guns");
  G.raceT = 53; car.pitState = "box"; S.update(car);
  G.raceT = 54; car.pitState = "out"; S.update(car);
  assert.deepEqual(guns, [false, false, true], "forward stop edges after a rewind still fire once each");
});

test("setCarSfx and pitGun are safe with the engine off, and drive their layers with it on", async () => {
  const { GameAudio } = boot();
  GameAudio.init();
  GameAudio.setCarSfx({ scrub: 1, lock: 1, surface: 1, pitLim: 1 });   // engine off: no throw
  GameAudio.pitGun(false);
  const A = await sampleEngine();
  A.setCarSfx({ scrub: 0.5, lock: 1, surface: 0.3, pitLim: 1, wet: false });
  const got = A.carSfx();
  assert.equal(got.scrub, 0.5); assert.equal(got.lock, 1); assert.equal(got.pitLim, 1);
  A.setCarSfx({ scrub: NaN, lock: -3, surface: 9 });
  assert.equal(A.carSfx().scrub, 0, "NaN clamps to off");
  assert.equal(A.carSfx().surface, 1, "levels clamp to 1");
  const before = A.carSfx().pitGuns;
  A.pitGun(true);
  assert.equal(A.carSfx().pitGuns, before + 1);
});

test("recorded radio voice: clips play back to back through the radio band; a line's nodes are released, the band is built once per sound", async () => {
  const { GameAudio, release, ctx, liveNodes } = boot();
  GameAudio.init();
  await release();
  const before = liveNodes();
  const clip = (d) => ({ duration: d, sampleRate: SR, length: d * SR, numberOfChannels: 1, getChannelData: () => new Float32Array(1) });
  ctx.currentTime = 10;
  const h = GameAudio.radioVoice([clip(0.5), 0.1, clip(0.3)], 10.2, { channel: "radio", volume: 0.8 });
  assert.ok(h, "scheduled");
  assert.ok(Math.abs(h.end - 11.1) < 1e-9, `ends after both clips and the pause: ${h.end}`);
  assert.equal(GameAudio.radioVoicesLive(), 1);
  h.stop();
  // stop() schedules the teardown; fire it the way the harness fires timers.
  for (const n of [...pendingTimers.splice(0)]) n();
  assert.equal(GameAudio.radioVoicesLive(), 0, "the transmission is released");
  // What stays is the SOUND, not the line: one filter pair, soft-clip and
  // compressor per voice sound, built once and shared by every line after it.
  const chain = liveNodes() - before;
  assert.equal(chain, 4, "only the shared band (highpass, lowpass, shaper, compressor) outlives the line");
  const joined = GameAudio.radioVoice([clip(0.5), clip(0.3)], 10, {});
  assert.ok(Math.abs(joined.end - 10.75) < 1e-9, `back-to-back clips overlap by 50 ms: ${joined.end}`);
  joined.stop();
  for (const n of [...pendingTimers.splice(0)]) n();
  assert.equal(liveNodes() - before, chain, "a second line on the same sound reuses the band: nothing new is left");
  const comm = GameAudio.radioVoice([clip(0.4)], 10, { channel: "radio", fx: "announcer" });
  comm.stop();
  for (const n of [...pendingTimers.splice(0)]) n();
  assert.equal(liveNodes() - before, 2 * chain, "the commentator is a different sound (the broadcast band): its own chain, once");
  assert.equal(GameAudio.radioVoice([], 0, {}), null, "nothing to play is not a transmission");
  assert.equal(GameAudio.radioVoice([clip(0.2)], 0, { volume: 0 }), null, "volume 0 is off");
});

test("clean and vintage radio presets change the recorded band and cue, but preserve the broadcast", async () => {
  const { GameAudio: A, release } = boot(); A.init(); await release();
  assert.equal(A.radioPreset(), "modern");
  assert.equal(A.setRadioPreset("toString"), "modern");
  const clip = { duration: 0.5 };
  for (const [id, lo, hi, cue] of [["clean", 100, 9000, false], ["vintage", 450, 2800, true]]) {
    A.setRadioPreset(id);
    const h = A.radioVoice([clip], 0, { channel: "radio" });
    assert.ok(h);
    const filters = [...live].filter((n) => n.kind === "biquad").slice(-2);
    assert.deepEqual(filters.map((f) => f.frequency.value), [lo, hi]);
    assert.equal(A.radioLeadS("radio") > 0, cue);
    assert.equal(A.radioSting("radio", 2), cue);
    h.stop();
    for (const fn of pendingTimers.splice(0)) fn();
  }
  const h = A.radioVoice([clip], 0, { fx: "announcer" });
  assert.deepEqual([...live].filter((n) => n.kind === "biquad").slice(-2).map((f) => f.frequency.value), [90, 9000]);
  h.stop(); for (const fn of pendingTimers.splice(0)) fn();
});

test("M8: radio voice chains prune on preset switch and never outgrow the live set", async () => {
  const { GameAudio: A, release, liveNodes } = boot();
  A.init(); await release();
  const clip = { duration: 0.5, sampleRate: SR, length: SR / 2, numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
  const flush = () => { while (pendingTimers.length) pendingTimers.shift()(); };
  const fireEnded = () => {
    for (const n of [...live]) if (n.kind === "src" && n.onended) { const fn = n.onended; n.onended = null; try { fn(); } catch (_) { /* torn */ } }
  };
  const play = (o) => { const h = A.radioVoice([clip], 0, o); if (h) { h.stop(); flush(); } fireEnded(); };
  const all = [
    { channel: "radio" },
    { channel: "spotter", fx: "spotter" },
    { channel: "control", fx: "control" },
    { channel: "coach", fx: "coach" },
    { fx: "announcer" },
  ];
  const base = liveNodes();
  for (const p of ["modern", "clean", "vintage"]) {
    A.setRadioPreset(p);
    for (const o of all) play(o);
    // A preset switch drops the previous radio/spotter pair; the live set is
    // this preset's radio+spotter plus the three broadcast chains.
    assert.equal(A.voiceChainsLive(), 5, `after ${p}: only the live preset's chains`);
    assert.equal(liveNodes() - base, 20, `after ${p}: 5 × 4 chain nodes`);
  }
  for (let i = 0; i < 30; i++) {
    A.setRadioPreset(["modern", "clean", "vintage"][i % 3]);
    play({ channel: "radio" });
    play({ channel: "spotter", fx: "spotter" });
  }
  assert.ok(A.voiceChainsLive() <= 9, "VOICE_CHAIN_MAX is a hard ceiling");
  assert.equal(A.voiceChainsLive(), 5, "cycles settle on the current preset only");
  const held = liveNodes();
  play({ channel: "radio" });
  play({ channel: "spotter", fx: "spotter" });
  assert.equal(liveNodes(), held, "a repeat line on the live preset reuses the chain");
});

test("the pit limiter only ever CUTS the engine: base down by the depth, never louder, never negative", async () => {
  const A = await sampleEngine();
  const run = () => { for (let i = 0; i < 4; i++) A.setEngine(0.4, 0, false, 0.15, 2, {}); return A.engineLevel(); };
  const free = run();
  A.setCarSfx({ pitLim: 1 });
  const base = run();
  const depth = A.carSfx().pitDepth;
  assert.ok(depth > 0, "the stutter is on");
  assert.ok(base + depth <= free + 1e-9, `the peak of the swing (${base + depth}) never exceeds the free engine (${free})`);
  assert.ok(base - depth >= 0, `the trough (${base - depth}) never inverts`);
  A.setCarSfx({ pitLim: 0 });
  assert.ok(Math.abs(run() - free) < 1e-9, "and it is gone the moment the limiter is");
});

test("pit limiter follows the lane's own predicate (the exit road too); a red flag in the box fires no guns", () => {
  const sb = { Math, Number, Object, GameAudio: {} };
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/car-sfx.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "car-sfx.js" });
  const guns = [];
  sb.GameAudio.setCarSfx = () => {};
  sb.GameAudio.pitGun = (t) => guns.push(t);
  const exitRoad = new Set();
  const G = { vTop: () => 100, isWetRoad: () => false, pits: { held: (c) => c.pitState === "lane" || exitRoad.has(c) } };
  const S = vm.runInContext("CarSfx", vctx).create(G);
  const car = { speed: 20, pitState: "out" };
  exitRoad.add(car);
  assert.equal(S.levels(car, 0.2).pitLim, 1, "still limited on the exit road after the stop");
  exitRoad.delete(car);
  assert.equal(S.levels(car, 0.2).pitLim, 0, "released at the exit line");
  const c2 = { speed: 0, pitState: "none" };
  S.update(c2); c2.pitState = "box"; S.update(c2);
  c2.pitState = "none"; S.update(c2);        // redFlagRestart -> pits.clearArm
  assert.deepEqual(guns, [false], "loosened on arrival, but a red flag is not a crew tightening wheels");
});

test("the saved camera's mix is applied at boot, not only on the first camera change", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const tail = src.slice(src.lastIndexOf("refreshCamBtn();"));
  assert.match(tail, /GameAudio\.setCameraMix\(CAM_MODES\[G\.camMode\]\.id\)/);
});

// EVERY CAMERA HAS A MIX. setCameraMix falls back to "chase" for an id CAM_KIND
// does not list, so a camera added to CAM_MODES without a CAM_KIND entry is
// silently heard as the chase cam. The TV director ("tv", 2026-09-30) was
// missed when rival/pitwall/drone/helmet were added: it played the full chase
// engine and wind behind spectator shots.
test("every CAM_MODES id has an explicit camera mix kind", () => {
  const modes = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const list = modes.slice(modes.indexOf("const CAM_MODES = ["));
  const ids = [...list.slice(0, list.indexOf("];")).matchAll(/\bid:\s*"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 20 && ids.includes("tv"), "precondition: parsed the camera list, got " + ids.join(","));
  const eng = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8");
  const kindSrc = eng.slice(eng.indexOf("const CAM_KIND"), eng.indexOf("});", eng.indexOf("const CAM_KIND")));
  const listed = new Set([...kindSrc.matchAll(/\b([a-z]+):\s*"(?:onboard|chase|tv)"/g)].map((m) => m[1]));
  assert.deepEqual(ids.filter((id) => !listed.has(id)), [], "camera ids with no CAM_KIND entry fall back to the chase mix");
  const { GameAudio: A } = boot();
  A.init();
  assert.equal(A.setCameraMix("tv"), "tv", "the TV director camera gets the TV (spectator) mix");
});

// STEADY STATE SCHEDULES NOTHING. setEngine re-aimed the core's pitch, the
// lowpass, the level and four more params on every call, and setSkid wrote
// skidGain.gain.value (= setValueAtTime) every physics step — 0 onto 0 on
// every step not sliding. aimGain / aimParam and the skid write guard skip a
// target within a hair of the last one issued: a car holding the same revs,
// speed and slide must cost the audio thread nothing after its first frame,
// and a change must still land.
test("a steady setEngine and a quiet setSkid schedule nothing after the first frame", async () => {
  for (const core of ["samples", "synth"]) {
    const { GameAudio, release, ctx, ctxTime } = boot();
    const made = [];
    for (const k of Object.keys(ctx)) {
      if (!k.startsWith("create") || typeof ctx[k] !== "function") continue;
      const f = ctx[k];
      ctx[k] = (...a) => { const n = f(...a); made.push(n); return n; };
    }
    GameAudio.init();
    if (core === "samples") await release();
    GameAudio.startEngine();
    assert.equal(GameAudio.debug().usingSamples, core === "samples", "precondition: " + core);
    let writes = 0;   // direct .value writes on a gain (setSkid's path)
    for (const n of made) {
      if (!n.gain) continue;
      let v = n.gain.value;
      Object.defineProperty(n.gain, "value", { get: () => v, set: (x) => { writes++; v = x; } });
    }
    const PARAMS = ["gain", "frequency", "detune", "Q", "playbackRate"];
    const sets = () => made.reduce((s, n) => s + PARAMS.reduce((t, k) => t + ((n[k] && n[k].sets) || 0), 0), 0) + writes;
    const ph = { slip: 1, ax: 0, onKerb: false, wet: false, tow: 0, deploy: 0, energy: 1, ersDeploy: 0.5 };
    const frame = (skid) => { ctxTime(1 / 60); GameAudio.setEngine(0.6, 0, false, 0.6, 5, ph); GameAudio.setSkid(skid, false); };
    for (let i = 0; i < 3; i++) frame(0);   // settle: first issues, harvest smoother, idle ramp
    const s0 = sets();
    for (let i = 0; i < 30; i++) frame(0);
    assert.equal(sets(), s0, core + ": 30 identical frames re-scheduled " + (sets() - s0) + " param events");
    frame(0.5);
    assert.ok(sets() > s0, core + ": a slide must still reach the skid gain");
    assert.ok(GameAudio.skidLevel() > 0, core + ": the slide is audible");
    frame(0);
    assert.equal(GameAudio.skidLevel(), 0, core + ": releasing the slide lands an exact 0");
  }
});

test("a sustained skid wobbles on the audio thread, not with a main-thread filter aim every frame", async () => {
  const { GameAudio: A, release, ctx, ctxTime } = boot();
  const biquads = [];
  const mkFilt = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => { const n = mkFilt(); biquads.push(n); return n; };
  A.init();
  await release();
  A.startEngine();
  const skidFilt = () => biquads.find((n) => Math.abs(n.Q.value - 1.4) < 1e-9);
  const settle = () => {
    for (let i = 0; i < 5; i++) { ctxTime(1 / 60); A.setSkid(0.8, false); }
  };
  settle();
  const filt = skidFilt();
  assert.ok(filt, "precondition: skid bandpass (Q 1.4) exists");
  const before = filt.frequency.sets;
  for (let i = 0; i < 30; i++) { ctxTime(1 / 60); A.setSkid(0.8, false); }
  const added = filt.frequency.sets - before;
  assert.ok(added <= 2,
    `steady slide at 0.8 re-aimed the filter centre ${added} times in 30 frames (want <= 2 after settle)`);
});

test("the reverb send is dry when SPACE is off or the reverb layer is disabled", async () => {
  const { GameAudio: A, release, ctx } = boot();
  let revSendGain = null;
  const mkConv = ctx.createConvolver;
  ctx.createConvolver = () => {
    const c = mkConv();
    const mkGain = ctx.createGain;
    ctx.createGain = () => {
      const g = mkGain();
      if (!revSendGain) revSendGain = g.gain;
      ctx.createGain = mkGain;
      return g;
    };
    return c;
  };
  A.init();
  await release();
  A.startEngine();
  assert.ok(revSendGain, "precondition: revSend gain is captured");
  A.setVenue({ street: true, theme: "street_day" });
  A.setTune({ reverb: 1 });
  A.setLayer("reverb", true);
  assert.ok(revSendGain.value > 0, "precondition: send open when SPACE is on");
  A.setLayer("reverb", false);
  assert.equal(revSendGain.value, 0, "layer off must gate the convolver send, not only the return");
  A.setLayer("reverb", true);
  assert.ok(revSendGain.value > 0, "layer on restores the send");
  A.setTune({ reverb: 0 });
  assert.equal(revSendGain.value, 0, "SPACE trim at zero must gate the send");
  A.setTune({ reverb: 1 });
  assert.ok(revSendGain.value > 0, "non-zero SPACE restores the send");
});

test("on a TV camera the rev limiter's swing scales with the engine: the gain never inverts", async () => {
  const A = await sampleEngine();
  for (const cam of ["chase", "heli", "cockpit"]) {
    A.setCameraMix(cam);
    for (let i = 0; i < 6; i++) A.setEngine(1, 0, false, 0.9, 5, {});
    const base = A.engineLevel(), swing = A.debug().limSwing;
    assert.ok(swing != null, "limSwing is reported");
    assert.ok(base - swing >= -1e-9, `${cam}: trough ${base - swing} (base ${base}, swing ${swing})`);
  }
});

test("the off-road rumble's filter is not rescheduled every frame for a steady surface", async () => {
  const A = await sampleEngine();
  const before = A.debug().surfSched;
  for (let i = 0; i < 120; i++) A.setCarSfx({ surface: 0.5 });
  assert.ok(A.debug().surfSched - before <= 1, `rescheduled ${A.debug().surfSched - before} times`);
});

test("cutting a transmission short cuts its courtesy figure and squelch tail too, not just the hiss", async () => {
  const { GameAudio, ctx } = boot();
  GameAudio.init();
  const before = new Set(live);
  assert.equal(GameAudio.radioSting("radio", 3), true);
  const mine = [...live].filter((n) => !before.has(n) && (n.kind === "src" || n.kind === "osc"));
  ctx.currentTime = 1.0;                      // paused, quit or preempted 1 s in
  GameAudio.radioStingStop();
  const late = mine.filter((n) => !n.loop && n.startAt != null && n.startAt > 1.0 && !(n.stopAt <= 1.0 + 1e-9));
  assert.deepEqual(late.map((n) => [n.kind, n.startAt]), [], "scheduled after the cut, still due to play");
});

test("audio-test.cjs --help exits 0 and does not treat --help as a baseURL", () => {
  // Pre-fix: argv[2] defaulted to localhost:8099 and `--help` was passed to
  // page.goto as a URL ("Cannot navigate to invalid URL").
  const r = spawnSync(process.execPath, ["tools/check/audio-test.cjs", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /audio-test/);
  assert.match(r.stdout, /static server|baseURL/i);
});


// Run the real CLI control flow without browser/audio delays; replace only its
// dynamic harness dependency, and provide Playwright's page boundary via require.
async function runAudioProbe(pageErrorBrowser = 0) {
  const events = [], messages = [], exits = [];
  let launches = 0;
  const chromium = { async launch() {
    const id = ++launches;
    let pageError;
    return {
      async close() { events.push("browser-close-" + id); },
      async newPage() { return {
        on(name, fn) { if (name === "pageerror") pageError = fn; },
        async goto() { if (id === pageErrorBrowser) pageError(new Error("fixture page failure")); },
        async waitForFunction() {}, async waitForTimeout() {}, async click() {},
        async evaluate(fn, values) {
          if (!Array.isArray(values)) return;
          if (typeof values[0] === "string") {
            return Object.fromEntries(values.map((voice) => {
              const trim = voice === "Ferrari" ? 1.03 : voice === "Audi" ? 0.98 : 1;
              return [voice, { rates: [0.2, 0.5, 0.8].map((rev) => (1 + rev) * trim), cen: 300, dbg: voice }];
            }));
          }
          const rate = {}, cen = {};
          for (let gear = 1; gear <= 8; gear++) {
            // Healthy = pitch by rev alone, the same in every gear (engine.js
            // RATE_IDLE / RATE_SPAN; there is no low-gear multiplier any more).
            rate[gear] = values.map((rev) => 1 + rev);
            cen[gear] = values.map((rev) => 200 + rev * 100);
          }
          return { rate, cen, boostOff: 1, boostOn: 1.04,
            coast: { rate: 1, cen: 200 }, pull: { rate: 1, cen: 300 } };
        },
      }; },
    };
  } };
  const cliProcess = { argv: ["node", "audio-test.cjs"], exit: (code) => exits.push(code) };
  const harness = {
    async startStaticServer() { events.push("server-open"); return { url: "http://fixture.invalid/" }; },
    pickChromium: () => null,
    async shutdown() { events.push("server-close"); },
  };
  const source = fs.readFileSync(path.join(ROOT, "tools/check/audio-test.cjs"), "utf8");
  const dependency = 'await import("../lib/harness.mjs")';
  assert.equal(source.split(dependency).length, 2, "replace exactly the harness dependency");
  await vm.runInNewContext(source.replace(dependency, "await __harness"), {
    __dirname: path.join(ROOT, "tools/check"), __harness: harness, process: cliProcess,
    console: { log: (...args) => messages.push(args.join(" ")) },
    require(name) {
      if (name === "playwright") return { chromium };
      if (name === "node:path") return path;
      throw new Error("Unexpected CLI dependency: " + name);
    },
  }, { filename: "tools/check/audio-test.cjs" });
  return { status: exits.at(-1) ?? cliProcess.exitCode ?? 0, events, messages, launches };
}

test("audio probe exits with failure on page errors in either browser after closing owned resources", async () => {
  for (const browser of [1, 2]) {
    const result = await runAudioProbe(browser);
    assert.equal(result.status, 1, "page errors from browser " + browser + " must fail the CLI");
    assert.ok(result.messages.some((line) => line.includes("pageerrors") && line.includes("fixture page failure")));
    assert.equal(result.launches, browser, "the failing phase stops the probe");
    assert.deepEqual(result.events, ["server-open", ...Array.from({ length: browser }, (_, i) => "browser-close-" + (i + 1)), "server-close"]);
  }
});

test("a healthy audio probe completes both metric sweeps and exits successfully after cleanup", async () => {
  const result = await runAudioProbe();
  assert.equal(result.status, 0);
  assert.equal(result.launches, 2);
  assert.ok(result.messages.some((line) => line.startsWith("PASS: all voices monotonic")));
  assert.deepEqual(result.events, ["server-open", "browser-close-1", "browser-close-2", "server-close"]);
});

// --- Skip-shift / lights-out rate discontinuities (Suzuka lap audit 2026-10) ---

test("sample BufferSource is seeded below 1.0 and the first setEngine snaps", async () => {
  const { GameAudio: A, release } = boot();
  A.init(); await release();
  A.setVoice("Mercedes");
  A.startEngine();
  const src = idleSampleSrc();
  assert.ok(src, "sample idle source exists");
  assert.ok(src.playbackRate.value < 0.5, "seeded below the Web Audio default of 1.0, got " + src.playbackRate.value);
  assert.ok(src.playbackRate.value > 0.05, "seeded at a usable idle rate");
  // Lights-out shape from the audit: gear 5, ~12500 rpm → high revFrac.
  A.setEngine(0.8, 0, false, 0.7, 5, {});
  assert.equal(src.playbackRate.lastMethod, "value", "first frame must snap, not setTargetAtTime from 1.0");
  assert.ok(src.playbackRate.cancels >= 1, "snap cancels any prior ramp");
  const r = A.rate();
  assert.ok(r < 0.95, "must not briefly report a near-1.0 spike, got " + r);
  assert.ok(r > 0.3, "live rate after lights-out shape, got " + r);
});

test("a 1→3 skip-shift snaps playbackRate on the shift frame", async () => {
  const A = await sampleEngine();
  A.setVoice("Mercedes");
  // Near-idle in 1st — matches the measured 0.1275 stock idle end in gear 1.
  A.setEngine(0.0, 0, false, 0.16, 1, {});
  const idleRate = A.rate();
  assert.ok(idleRate > 0.10 && idleRate < 0.20, "precondition idle gear-1 rate, got " + idleRate);
  const src = idleSampleSrc();
  const snapsBefore = src.playbackRate.snaps;
  // Skip 1→3 at high rev (~13400 rpm / ~16 m/s in the audit).
  A.setEngine(0.87, 0, false, 0.35, 3, {});
  assert.ok(src.playbackRate.snaps > snapsBefore, "skip-shift must use setValueAtTime");
  assert.equal(src.playbackRate.lastMethod, "value");
  const r = A.rate();
  assert.ok(r > 0.40 && r < 0.70, "skip-shift target on the shift frame, got " + r);
  assert.ok(Math.abs(r - idleRate) >= 0.08, "discontinuity large enough that smoothing would lag");
});

test("a steady same-gear rev climb still aims playbackRate", async () => {
  const A = await sampleEngine();
  A.setEngine(0.40, 0, false, 0.50, 4, {});
  const src = idleSampleSrc();
  const snapsBefore = src.playbackRate.snaps;
  A.setEngine(0.42, 0, false, 0.51, 4, {});
  assert.equal(src.playbackRate.snaps, snapsBefore, "smooth climb must not snap");
  assert.equal(src.playbackRate.lastMethod, "target");
});

test("synth→sample upgrade seeds playbackRate from lastRate, not 1.0", async () => {
  const { GameAudio: A, release } = boot();
  A.init();
  A.setVoice("Mercedes");
  A.startEngine();
  assert.equal(A.debug().usingSamples, false);
  A.setEngine(0.75, 0, false, 0.65, 5, {});
  assert.equal(A.debug().usingSamples, false);
  await release();
  assert.equal(A.debug().samplesReady, true);
  A.setEngine(0.75, 0, false, 0.65, 5, {});
  assert.equal(A.debug().usingSamples, true, "upgrade restarts onto the sample voice");
  const src = idleSampleSrc();
  assert.ok(src);
  assert.ok(src.playbackRate.value < 0.95, "upgraded source must not start at the 1.0 default, got " + src.playbackRate.value);
  assert.ok(A.rate() > 0.3 && A.rate() < 0.95, "live rate after upgrade, got " + A.rate());
  assert.ok(A.engineLevel() > 0, "mid-race upgrade keeps the voice open instead of fading from silence");
});

// THE GRID IDLES. startRaceBody calls startEngine with engGain at 0, and only
// setEngine opens it. update() returned out of its countdown branch before the
// race block that calls setEngine, so the player's car was silent through all
// five lamps and the note slammed in at LIGHTS OUT (measured: engineLevel 0 at
// every lamp, then 0 -> 0.16 in one 50 ms probe at green). The countdown must
// drive the engine at idle, stationary (speed 0, so wind and whine stay gated).
test("the countdown drives the player's engine at idle, not silence until lights-out", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const upd = src.slice(src.indexOf("function update(dt)"));
  const count = upd.slice(upd.indexOf('if (state === "count") {'), upd.indexOf('if (state !== "race") return;'));
  assert.ok(count.length > 0, "precondition: found update()'s countdown branch");
  assert.match(count, /_gridIdleOpts\.soundOn\s*=\s*soundOn;[\s\S]*?GameAudio\.setGridIdle\(player,\s*_gridIdleOpts\);\s*return;/,
    "the countdown branch fills the pooled _gridIdleOpts bag then setGridIdle (no per-frame {})");
  assert.doesNotMatch(count, /GameAudio\.setEngine\(/, "the idle pack lives in GameAudio.setGridIdle, not inline in game.js");
  const { GameAudio: A } = boot();
  A.init();
  A.startEngine();
  assert.equal(A.engineLevel(), 0, "precondition: startEngine alone leaves the engine silent");
  const car = { rpm: 5000, gear: 1, energy: 1, ersDeploy: 0.5 };
  A.setGridIdle(null, { soundOn: true, step: true });
  assert.equal(A.engineLevel(), 0, "no player: stay silent");
  A.setGridIdle(car, { soundOn: false, step: true });
  assert.equal(A.engineLevel(), 0, "SOUND off: stay silent");
  A.setGridIdle(car, { soundOn: true, step: false });
  assert.equal(A.engineLevel(), 0, "non-last physics step: stay silent");
  A.setGridIdle(car, { soundOn: true, wet: false, step: true });
  assert.ok(A.engineLevel() > 0, "a stationary idle setGridIdle opens the note");
  assert.equal(A.windLevel(), 0, "and keeps the wind gated on the grid");
});

// INSTANT REPLAY (#1262). tickBody's paused branch returns before the race
// block, so a pause-menu replay scrub played in silence with every car's rpm
// pinned at the pause frame. The feed lives in GameAudio.feedReplayScrub (the
// #972 setGridIdle pattern: game.js keeps one call on its existing return line,
// +0 lines) and uses game.js's own gear/rpm helpers so revs match the live note.
test("feedReplayScrub: replay scrub drives engine + rivals from replayed speed, silences once on exit", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const tick = src.slice(src.indexOf("function tickBody(now) {"));
  const paused = tick.slice(0, tick.indexOf("replayBuf.onTick(raceT, cars, state);"));
  assert.match(paused, /GameAudio\.feedReplayScrub\(soundOn && player, replayBuf\.isScrubbing\(\), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop\); return;/,
    "the paused branch's return line hands the frame to GameAudio.feedReplayScrub (hoisted refs, no per-frame {})");
  assert.doesNotMatch(paused, /GameAudio\.setEngine\(/, "the scrub engine pack lives in GameAudio, not inline in game.js");
  assert.match(src, /paused = p; GameAudio\.resetReplayScrub\(\);/, "setPaused clears the scrub one-shot");
  const rb = fs.readFileSync(path.join(ROOT, "js/camera/replay-buf.js"), "utf8");
  assert.match(rb, /GameAudio\.syncReplayRpms\(cars\)/, "applyPose re-revs the field from the replayed speeds");

  const { GameAudio: A } = boot();
  A.init();
  const gearOf = (v) => (v < 30 ? 2 : 6);
  const rpmFor = (g, v) => Math.min(15000, 5000 + v * 1000 / g);
  const rivalAudio = { collect: () => [{ lat: 3, arc: 4, rev: 0.7, approach: 0 }] };
  const player = { speed: 20, rpm: 5000, energy: 1, offroad: false };
  const cars = [player, { speed: 60, rpm: 5000 }];
  const feed = (p, scrubbing) => A.feedReplayScrub(p, scrubbing, cars, gearOf, rpmFor, rivalAudio, () => false, () => 90);

  feed(null, true);
  assert.equal(A.debug().engineOn, false, "SOUND off / no player: untouched");
  feed(player, false);
  assert.equal(A.debug().engineOn, false, "paused, not scrubbing: stays silent");
  feed(player, true);
  assert.equal(A.debug().engineOn, true, "scrubbing starts the engine voice");
  assert.ok(A.engineLevel() > 0, "and opens the note");
  assert.equal(player.rpm, rpmFor(2, 20), "player rpm = rpmFor(naturalGear(v), v)");
  assert.equal(cars[1].rpm, rpmFor(6, 60), "every car re-revs from its replayed speed");
  assert.ok(A.rivalState().some((v) => v.gain > 0), "the field is fed to the rival voices");
  // A seek (applyPose) re-revs at once through syncReplayRpms.
  player.speed = 50; A.syncReplayRpms(cars);
  assert.equal(player.rpm, rpmFor(6, 50), "syncReplayRpms follows a seek without waiting for a frame");
  feed(player, false);
  assert.equal(A.debug().engineOn, false, "leaving the scrub silences the engine once");
  A.startEngine();
  feed(player, false);
  assert.equal(A.debug().engineOn, true, "the exit is a one-shot: later paused frames leave the engine alone");
  A.stopEngine();
  feed(player, true); A.resetReplayScrub(); feed(player, false);
  assert.equal(A.debug().engineOn, true, "resetReplayScrub (setPaused) drops the pending exit");
});
