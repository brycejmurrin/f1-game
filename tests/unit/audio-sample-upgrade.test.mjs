/* audio-sample-upgrade.test.mjs — the engine voice upgrades to the samples
 * once they decode, instead of running the whole race on the synth.
 *
 * 2026-09-02 bug hunt. `usingSamples` is decided ONCE, in startEngine(); when
 * lights-out beat the decode of f1_engine.mp3 (cold cache on a phone) the race
 * ran its whole distance on the oscillator fallback. setEngine() now restarts
 * the engine once, the first time it sees samples it is not using.
 *
 * js/audio/engine.js has no other node harness: this is a fake AudioContext just
 * wide enough for createCtx/startEngine/setEngine/stopEngine (every node is a
 * generic connect/start/stop object with AudioParam-shaped fields). The fetch
 * of the two sample files is held back until the test releases it.
 *
 * Run: node --test tests/unit/audio-sample-upgrade.test.mjs
 *   APEX_AUDIO_SRC=<path> evaluates another copy of audio.js (old-code proof).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_PATH = process.env.APEX_AUDIO_SRC || path.join(ROOT, "js/audio/engine.js");
const SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js", "js/audio/radio-fx.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8"))
  .concat(fs.readFileSync(SRC_PATH, "utf8")).join("\n").replace(/^const\b/gm, "var");

function param(v) {
  return { value: v, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
           exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
}
function node(counts, kind) {
  counts[kind] = (counts[kind] || 0) + 1;
  return { kind, connect: (t) => t, disconnect() {}, start() {}, stop() {}, type: "", loop: false, loopStart: 0, loopEnd: 0,
           buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0, getFloatFrequencyData() {},
           gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1) };
}
function sampleBuf(seconds, sr) {
  const len = Math.floor(seconds * sr), d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05);
  return { sampleRate: sr, length: len, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function boot(extra = {}) {
  const counts = {};
  const held = [];   // fetch resolvers, released by the test
  const ctx = {
    currentTime: 0, state: "running", sampleRate: 8000, destination: node(counts, "dest"),
    createGain: () => node(counts, "gain"), createBiquadFilter: () => node(counts, "biquad"),
    createOscillator: () => node(counts, "osc"), createBufferSource: () => node(counts, "src"),
    createAnalyser: () => node(counts, "analyser"),
    createDynamicsCompressor: () => Object.assign(node(counts, "comp"),
      { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }),
    decodeAudioData: (ab, res) => res(sampleBuf(4, 8000)),
    createMediaElementSource: (el) => Object.assign(node(counts, "mediaSrc"), { mediaElement: el }),
    resume: () => Promise.resolve(), close() {},
  };
  Object.assign(ctx, extra.ctx || {});   // per-test node overrides
  extra = { ...extra }; delete extra.ctx;
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise, Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: { addEventListener() {}, hidden: false }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    AudioContext: function () { return ctx; },
    fetch: () => new Promise((res) => held.push(() => res({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))),
  };
  Object.assign(sb, extra);
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var"), vctx, { filename: "js/core/mat4.js" });
  vm.runInContext(SRC, vctx, { filename: "js/audio/engine.js" });
  const GameAudio = vm.runInContext("GameAudio", vctx);
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { GameAudio, counts, release, ctx, Signal: vm.runInContext("GameAudioSignal", vctx) };
}

test("an engine started on the synth voice upgrades to the samples once they decode", async () => {
  const { GameAudio, counts, release } = boot();
  GameAudio.init();            // creates the context and starts the (held) sample fetch
  GameAudio.startEngine();     // lights-out before the decode finished
  assert.equal(GameAudio.debug().usingSamples, false, "precondition: synth voice, samples not ready");
  GameAudio.setEngine(0.5, 0, false, 0.5, 3, {});
  assert.equal(GameAudio.debug().usingSamples, false, "nothing to upgrade to yet");
  await release();
  assert.equal(GameAudio.debug().samplesReady, true, "precondition: the samples decoded mid-race");
  assert.equal(GameAudio.debug().usingSamples, false, "the decision was made once, at startEngine");
  const srcBefore = counts.src;
  GameAudio.setEngine(0.6, 0, false, 0.6, 4, {});
  assert.equal(GameAudio.debug().usingSamples, true, "the next setEngine must restart the engine on the samples");
  assert.equal(GameAudio.debug().engineOn, true);
  assert.ok(counts.src > srcBefore, "two looping buffer sources were created for the sample voice");
  const srcAfter = counts.src;
  GameAudio.setEngine(0.7, 0, false, 0.7, 5, {});
  GameAudio.setEngine(0.8, 0, false, 0.8, 6, {});
  assert.equal(counts.src, srcAfter, "one restart, not one per frame");
});

test("music PCM cache: a phone keeps only the playing track, desktop the two most recent", async () => {
  // Decoded PCM is ~90 MB per song. The cache bound is the difference between
  // a phone holding one song and holding two; fetch count is the observable
  // (a cache hit never fetches).
  const play = async (isMobile) => {
    let fetches = 0;
    const held = [];
    const fetch = () => { fetches++; return new Promise((res) => held.push(() => res({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))); };
    const { GameAudio } = boot({ fetch, ...(isMobile ? { GLX: { isMobile: true } } : {}) });
    const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
    GameAudio.init(); await release();           // engine samples (2 fetches)
    const base = fetches;
    GameAudio.playTrackId("builtin:menu");  await release();
    GameAudio.playTrackId("builtin:song2"); await release();
    GameAudio.playTrackId("builtin:menu");  await release();   // repeat: hit or miss?
    return fetches - base;
  };
  assert.equal(await play(false), 2, "desktop: the two most recent stay decoded, so the repeat is a cache hit");
  assert.equal(await play(true), 3, "phone: only the playing track is kept, so the repeat re-fetches (and re-decodes)");
});

// A phone streams by default (M-4); apex26.musicStream "0" pins the decode path.
const store = (v) => ({ getItem: (k) => (k === "apex26.musicStream" ? v : null), setItem() {}, removeItem() {} });
function heldFetch() {
  const held = [], urls = [];
  const fetch = (u) => { urls.push(u); return new Promise((res) => held.push(() => res({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))); };
  const release = async () => { for (const r of held.splice(0)) r(); for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { fetch, urls, release };
}

test("song change on a phone drops the old decoded track BEFORE the next fetch (perf-memory M-4a)", async () => {
  // The old buffer was evicted only once the NEW decode resolved (and the
  // resume pin kept it too): old + new PCM, ~150 MB, at every song change.
  // Observable: going back to the old track while the new fetch is still in
  // flight is a re-fetch on a phone, a cache hit on desktop (unchanged).
  const run = async (isMobile) => {
    const f = heldFetch();
    const { GameAudio } = boot({ fetch: f.fetch, localStorage: store("0"), ...(isMobile ? { GLX: { isMobile: true } } : {}) });
    GameAudio.init(); await f.release();
    GameAudio.playTrackId("builtin:menu"); await f.release();
    GameAudio.playTrackId("builtin:song2");                 // fetch held: the decode has not resolved
    const before = f.urls.length;
    GameAudio.playTrackId("builtin:menu");
    const refetched = f.urls.length - before;
    await f.release();
    return refetched;
  };
  assert.equal(await run(true), 1, "phone: menu's PCM was already released when song2's fetch started");
  assert.equal(await run(false), 0, "desktop keeps its two-track cache: menu is still a hit");
});

function fakeAudio() {
  const els = [];
  class Audio {
    constructor() { this.src = ""; this.currentTime = 0; this.duration = NaN; this.paused = true; this.plays = 0; this.released = 0; els.push(this); }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(n) { if (n === "src") { this.src = ""; this.released++; } }
    load() {}
  }
  return { Audio, els };
}

test("music stream switch: phones stream through one <audio> element, desktop decodes, apex26.musicStream overrides (M-4)", async () => {
  const run = async (isMobile, override) => {
    const f = heldFetch(), A = fakeAudio();
    const { GameAudio, counts } = boot({ fetch: f.fetch, Audio: A.Audio, localStorage: store(override), ...(isMobile ? { GLX: { isMobile: true } } : {}) });
    GameAudio.init(); await f.release();
    const base = f.urls.length;
    GameAudio.playTrackId("builtin:menu"); await f.release();
    GameAudio.playTrackId("builtin:song2"); await f.release();
    return { fetches: f.urls.length - base, els: A.els, media: counts.mediaSrc || 0 };
  };
  const phone = await run(true, null);
  assert.equal(phone.fetches, 0, "phone default: no fetch + decodeAudioData");
  assert.equal(phone.els.length, 1, "one element reused across tracks (iOS keeps its gesture unlock)");
  assert.equal(phone.media, 1, "one MediaElementSource per context");
  assert.match(phone.els[0].src, /song2\.mp3$/);
  assert.equal(phone.els[0].plays, 2);
  const desk = await run(false, null);
  assert.equal(desk.fetches, 2, "desktop default: the decode path, unchanged");
  assert.equal(desk.els.length, 0);
  assert.equal((await run(true, "0")).fetches, 2, "apex26.musicStream=0 puts a phone on the decode path");
  assert.equal((await run(false, "1")).els.length, 1, "apex26.musicStream=1 streams on desktop");
});

test("streamed music keeps the soundtrack contract: resume offset, ended -> next, a failed load skips, stop releases", async () => {
  const A = fakeAudio();
  const { GameAudio } = boot({ Audio: A.Audio, GLX: { isMobile: true } });
  GameAudio.init();
  GameAudio.playTrackId("builtin:song2");
  const el = A.els[0];
  assert.equal(GameAudio.currentTrackId(), "builtin:song2");
  el.currentTime = 42; el.duration = 180;
  GameAudio.playTrackId("builtin:song2");                  // same song again (a source switch, a resume)
  el.currentTime = 0; el.onloadedmetadata();
  assert.equal(el.currentTime, 42, "the same url resumes where it was");
  el.onended();
  assert.equal(GameAudio.currentTrackId(), "builtin:song3", "track end hands over to the next song");
  el.currentTime = 0; el.onloadedmetadata();
  assert.equal(el.currentTime, 0, "a different song starts from the top");
  el.error = { code: 4 }; el.onerror();
  assert.equal(GameAudio.currentTrackId(), "builtin:song4", "an unplayable track skips");
  GameAudio.setMusicEnabled(false);
  assert.equal(el.paused, true);
  assert.ok(el.released >= 1, "an explicit stop drops the src (decoder and buffered bytes)");
  assert.equal(GameAudio.currentTrackId(), null, "and the soundtrack reports itself stopped");
});

test("master limiter: one compressor sits between master and the destination", () => {
  const { GameAudio, counts } = boot();
  GameAudio.init();
  assert.equal(counts.comp, 1, "exactly one DynamicsCompressor is created at context build");
});

test("collision scales with impact and a shallow wall angle is a scrape, not a thump", () => {
  const { GameAudio, counts } = boot();
  GameAudio.init();
  const snap = () => ({ osc: counts.osc || 0, src: counts.src || 0, biquad: counts.biquad || 0 });
  const a = snap(); GameAudio.collision(0.2); const b = snap();
  assert.equal(b.osc - a.osc, 1, "a graze is one tone + noise (no bang)");
  GameAudio.collision(0.95); const c = snap();
  assert.equal(c.osc - b.osc, 2, "a heavy hit adds the low bang");
  GameAudio.collision(0.5, true); const d = snap();
  assert.equal(d.osc - c.osc, 0, "a scrape is noise only");
  assert.equal(d.src - c.src, 1, "one band-passed noise burst");
  assert.equal(d.biquad - c.biquad, 1);
});

test("the rev-limiter gate is an audio-thread oscillator built with the engine", async () => {
  const { GameAudio, counts, release } = boot();
  GameAudio.init(); await release();
  const before = counts.osc || 0;
  GameAudio.startEngine();
  assert.ok((counts.osc || 0) - before >= 1, "startEngine builds the gate oscillator alongside the voice");
  // A sweep at ax <= 0 (what tools/check/audio-test.cjs runs) must not throw.
  for (const rv of [0, 0.5, 0.99, 1]) GameAudio.setEngine(rv, 0, false, rv, 6, { ax: 0 });
  GameAudio.setEngine(0.7, 0, false, 0.7, 4, { ax: 12 });   // full load: the lowpass opens
  GameAudio.stopEngine();
});

test("the engine sample keeps only its loop window: same samples, loop length and rival offsets (perf-memory M-5a)", async () => {
  // ~30 s decoded, ~2 s ever played. A 6 s recording whose first 2 s are
  // unsteady puts the stable window mid-buffer, so a copy that ignored the
  // window's offset would show.
  const SR = 8000, N = 6 * SR, full = new Float32Array(N);
  let seed = 7;
  for (let i = 0; i < N; i++) {
    if (i < 2 * SR) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; full[i] = ((seed >> 8) % 3 === 0 ? 1 : -1) * Math.sin(i * (0.02 + (i % 3000) / 9000)); }
    else full[i] = Math.sin(i * 0.3);
  }
  const fullBuf = { sampleRate: SR, length: N, duration: N / SR, numberOfChannels: 1, getChannelData: () => full };
  const made = [], srcs = [];
  const { GameAudio, release, Signal } = boot({ ctx: {
    decodeAudioData: (ab, res) => res(fullBuf),
    createBuffer: (ch, len, sr) => {
      const d = Array.from({ length: ch }, () => new Float32Array(len));
      const b = { sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: (c) => d[c],
                  copyToChannel: (src, c) => d[c].set(src) };
      made.push(b); return b;
    },
    createBufferSource: () => { const n = node({}, "src"); n.start = (...a) => { n.startArgs = a; }; srcs.push(n); return n; },
    createStereoPanner: () => Object.assign(node({}, "pan"), { pan: { value: 0, setTargetAtTime() {} } }),
  } });
  GameAudio.init(); await release();
  const li = Signal.findStableLoop(fullBuf);
  assert.ok(li.start >= 1.5, `precondition: the stable window sits mid-buffer (start ${li.start})`);
  GameAudio.startEngine();
  const engine = srcs.filter((s) => s.loop && made.includes(s.buffer) && s.buffer.length > SR);
  assert.ok(engine.length >= 2, "the idle voice and the rival voices play the window copy");
  const win = engine[0].buffer, a = Math.round(li.start * SR), b = Math.round(li.end * SR);
  assert.equal(win.length, b - a, "only the loop window is kept");
  assert.ok(win.length < N / 2);
  assert.deepEqual(Array.from(win.getChannelData(0).subarray(0, 64)), Array.from(full.subarray(a, a + 64)), "same samples, from the window start");
  assert.equal(win.getChannelData(0)[win.length - 1], full[b - 1]);
  for (const s of engine) {
    assert.equal(s.buffer, win, "one shared copy, no per-voice buffer");
    assert.equal(s.loopStart, 0);
    assert.ok(Math.abs((s.loopEnd - s.loopStart) - (li.end - li.start)) < 1e-9, "loop length unchanged");
  }
  const offs = engine.map((s) => s.startArgs && s.startArgs[1]);
  assert.equal(offs[0], 0, "the idle voice starts at the loop start, now 0");
  const rivals = offs.slice(1);
  rivals.forEach((o, i) => assert.ok(Math.abs(o - (li.end - li.start) * (i / rivals.length)) < 1e-9, `rival ${i} keeps its fraction of the loop: ${o}`));
  const dbg = GameAudio.debug().loop;
  assert.deepEqual([dbg.s, dbg.e], [0, +(li.end - li.start).toFixed(2)]);
  assert.deepEqual(Array.from(dbg.win), [+li.start.toFixed(2), +li.end.toFixed(2)], "debug still names where the window sat in the recording");
});
