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
// A REAL device rate. The sub-octave layer derives its frequency from
// ctx.sampleRate, so the 8 kHz stand-in this harness used to fake put it under
// the 25 Hz floor at every rev — the layer read as a fixed drone that no actual
// device would produce, and the test would have passed a bug.
const SR = 44100;

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
// `live` makes a LEAK observable: a node enters on creation and leaves only on
// disconnect(), which is the Web Audio contract that matters — a stopped source
// is collected on its own, but a Gain/Biquad still wired into the bus keeps
// RENDERING until something disconnects it.
const live = new Set();
function node(kind, counts) {
  if (counts) counts[kind] = (counts[kind] || 0) + 1;
  const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start() {}, stop() {}, type: "", loop: false,
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
    createConvolver: () => Object.assign(node("convolver", counts), { buffer: null }),
    createStereoPanner: () => Object.assign(node("panner", counts), { pan: param(0) }),
    createDynamicsCompressor: () => Object.assign(node("comp", counts),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, SR)),
    resume: () => Promise.resolve(), close() {},
  };
  const sb = {
    // GLX is what decides `mobileTier`; the engine reads it lazily at
    // startEngine. Absent by default (desktop); mobileEngine() supplies it.
    GLX: opts && opts.mobile ? { mobileTier: true } : undefined,
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error,
    parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    // stopEngine defers its disconnects behind setTimeout; a harness that
    // swallows them can never see a leak, so they are queued and fired by hand.
    setTimeout: (fn) => { pendingTimers.push(fn); return pendingTimers.length; },
    clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
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
  return { GameAudio, release, counts, ctxTime, flushTimers, liveNodes, ctx };
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
  assert.equal(sliders.length, 9, "expected the nine tuner sliders — the table shape changed, so does this check");
  assert.equal(layers.length, 10, "expected the ten layer switches");
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

test("DETUNE lands on the sample core's own detune param", async () => {
  // It once did not: for the life of the granular core, engSrcIdle.detune was
  // the only place this trim landed and that core never built the node, so the
  // slider moved and nothing happened. The granular core is gone; this pins the
  // remaining path so the trim cannot go quietly inert again.
  const A = await sampleEngine();
  A.setTune(A.tuneDefaults());
  const neutral = A.detuneCents();
  A.setTune({ detune: 3 });          // +60 cents on the "default" voice
  assert.ok(Math.abs(A.detuneCents() - (neutral + 60)) < 1e-6,
    `detune 3 should sit 60 cents above neutral, got ${A.detuneCents()} vs ${neutral}`);
  A.setTune({ detune: 0 });          // -30 cents
  assert.ok(Math.abs(A.detuneCents() - (neutral - 30)) < 1e-6,
    `detune 0 should sit 30 cents below neutral, got ${A.detuneCents()}`);
  // A FINE trim: an order of magnitude under what PITCH spans.
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
  A.setTune(A.tuneDefaults());
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
  A.setTune(A.tuneDefaults());
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
  const range = A.tuneRange();

  const rows = [...panel.matchAll(/\{ k: "(\w+)",\s*id: "([\w-]+)",\s*lo: ([\d.]+),\s*step: ([\d.]+) \}/g)];
  assert.equal(rows.length, 9, "expected nine tuner sliders");
  for (const [, key, id, loS, stepS] of rows) {
    const lo = Number(loS), step = Number(stepS);
    const m = shell.match(new RegExp(`<input id="${id}" type="range" min="0" max="(\\d+)" step="1" value="(\\d+)"`));
    assert.ok(m, `${id} is missing from the shell, or its attributes changed shape`);
    const max = Number(m[1]), dflt = Number(m[2]);
    const [rLo, rHi] = range[key];
    assert.ok(Math.abs(lo - rLo) < 1e-9, `${key}: the panel starts at ${lo}, the engine's range at ${rLo}`);
    assert.ok(Math.abs(lo + max * step - rHi) < 1e-9,
      `${key}: the slider tops out at ${lo + max * step}, the engine allows ${rHi} — the player cannot reach the end`);
    assert.ok(Math.abs(lo + dflt * step - 1) < 1e-9,
      `${key}: the default position is ${lo + dflt * step}, not 1.0 — the panel cannot return to the shipped sound`);
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

test("the LIMITER trim never inverts the gate, and spends its top half on the chop rate", async () => {
  const A = await sampleEngine();
  const atLimiter = () => A.setEngine(0.99, 0, false, 0.9, 7, {});
  const [, hi] = A.tuneRange().limiter;
  let lastHz = -1;
  for (const k of [0, 0.5, 1, 2, hi]) {
    A.setTune({ limiter: k });
    atLimiter();
    // engGain's base is (lvl - depth) and the square swings +-depth on top, so
    // the trough is lvl - 2*depth. Negative there is a phase flip, not a cut.
    const depth = A.limiterDepth(), lvl = A.engineLevel() + depth;
    assert.ok(depth <= lvl * 0.5 + 1e-9,
      `LIMITER ${k}: depth ${depth} exceeds half of level ${lvl} — the gate inverts`);
    const hz = A.limiterHz();
    assert.ok(hz > lastHz, `LIMITER ${k}: the chop rate stopped rising (${lastHz} -> ${hz})`);
    lastHz = hz;
  }
  A.setTune({ limiter: 1 });
  atLimiter();
  assert.ok(Math.abs(A.limiterHz() - 13) < 0.01, "1.0 is still the stock 13 Hz cut");
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
