/* audio-tune.test.mjs — the player TUNE layer must not break the engine's
 * timbre contract.
 *
 * js/audio/engine.js:19 states the rule ENGINE_VOICES lives by: every voice
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
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8").replace(/^const\b/gm, "var");

// A recording AudioParam: setTargetAtTime lands in .value so rate() and the
// layer-gain reads below see what the audio thread would have received. `sets`
// counts scheduling calls — that is how the aimGain guard is observable.
function param(v) {
  const p = {
    value: v, sets: 0,
    setTargetAtTime(x) { p.sets++; p.value = x; },
    setValueAtTime(x) { p.sets++; p.value = x; },
    linearRampToValueAtTime(x) { p.sets++; p.value = x; },
    exponentialRampToValueAtTime(x) { p.sets++; p.value = x; },
    cancelScheduledValues() {},
  };
  return p;
}
function node(kind) {
  return { kind, connect: (t) => t, disconnect() {}, start() {}, stop() {}, type: "", loop: false,
           loopStart: 0, loopEnd: 0, buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0,
           getFloatFrequencyData() {}, gain: param(1), frequency: param(440), detune: param(0),
           Q: param(1), playbackRate: param(1) };
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot() {
  const held = [];
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 8000, destination: node("dest"),
    createGain: () => node("gain"), createBiquadFilter: () => node("biquad"),
    createOscillator: () => node("osc"), createBufferSource: () => node("src"),
    createAnalyser: () => node("analyser"),
    createDynamicsCompressor: () => Object.assign(node("comp"),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, 8000)),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { GameAudio, release };
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

const REVS = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1];

test("defaults are identity — the shipped sound is untouched by the tune layer", async () => {
  const A = await sampleEngine();
  assert.deepEqual(A.tune(), A.tuneDefaults(), "a fresh engine carries no trim");
  assert.equal(A.profile(), "team", "and follows the team's engine, as it always did");
  // The pre-tune formula, verbatim from the commit that introduced the trim.
  const LOW = [0.6, 0.72, 0.84];   // LOW_GEAR_RATE, engine.js:656
  for (const gear of [1, 2, 3, 4, 6, 8]) {
    for (const rev of REVS) {
      for (const b of [0, 1]) {
        A.setEngine(rev, b, false, 0.6, gear, {});
        const gmul = gear <= 3 ? LOW[gear - 1] : 1.0;
        const want = (0.25 + rev * 0.45) * (1 + 0.04 * b) * gmul * 1.0;
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
    // gear ordering at redline: a low gear must still read lower than a high one
    A.setEngine(1, 0, false, 0.6, 1, {});
    const g1 = A.rate();
    A.setEngine(1, 0, false, 0.6, 4, {});
    assert.ok(g1 < A.rate(), `${label}: gear 1 no longer reads below gear 4 at redline`);
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
  // And returning every trim to the defaults by hand lands back on team.
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
  const A = await sampleEngine();
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
  const profiles = [...panel.matchAll(/\["(as-p-[\w-]+)", "\w+"\]/g)].map((m) => m[1]);
  assert.equal(sliders.length, 6, "expected the six tuner sliders — the table shape changed, so does this check");
  assert.equal(layers.length, 6, "expected the six layer switches");
  assert.equal(profiles.length, 5, "expected the five sound profiles");

  const missing = [];
  // Each slider owns TWO nodes: the range input and the <b> that reads its value.
  for (const id of sliders) for (const suffix of ["", "-v"]) if (!declared.has(id + suffix)) missing.push(id + suffix);
  for (const id of [...layers, ...profiles, "as-t-reset", "as-p-note", "as-engine-details"]) if (!declared.has(id)) missing.push(id);
  assert.deepEqual(missing, [], "js/audio/panel.js looks up an id that index.html does not declare");
});

test("every sound profile and layer the panel offers is one the engine knows", () => {
  // The other half of the same seam: the panel names profiles and layers as
  // strings, and GameAudio silently falls back to "team" for an unknown
  // profile — so a rename in the engine would leave a button that lights up
  // and does nothing, which is worse than one that throws.
  const panel = fs.readFileSync(path.join(ROOT, "js/audio/panel.js"), "utf8");
  const A = await_boot();
  const offered = [...panel.matchAll(/\["as-p-[\w-]+", "(\w+)"\]/g)].map((m) => m[1]);
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
