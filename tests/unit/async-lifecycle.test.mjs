import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const scanSource = await readFile(new URL("../../js/net/scan.js", import.meta.url), "utf8");
const musicSource = await readFile(new URL("../../js/audio/music-lib.js", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../../js/data/api.js", import.meta.url), "utf8");
const liveSource = await readFile(new URL("../../js/data/live.js", import.meta.url), "utf8");
const audioPanelSource = await readFile(new URL("../../js/audio/panel.js", import.meta.url), "utf8");

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function audioPanelHarness() {
  const nodes = new Map();
  const element = () => ({
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "",
    classList: { toggle() {} }, setAttribute() {}, closest() { return this; },
  });
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const calls = [];
  const writes = new Map();
  const GameAudio = {
    init() { calls.push("init"); },
    setEnabled(v) { calls.push(`enabled:${v}`); },
    setMusicEnabled(v) { calls.push(`music:${v}`); },
    setSfxEnabled(v) { calls.push(`sfx:${v}`); },
    setMusicVolume(v) { return v; }, setSfxVolume(v) { return v; },
    startMusic(v) { calls.push(`start:${v}`); },
    stopMusic() { calls.push("stopMusic"); }, stopEngine() { calls.push("stopEngine"); },
    stopRain() { calls.push("stopRain"); }, startEngine() { calls.push("startEngine"); },
    startRain() { calls.push("startRain"); },
    sourceCounts() { return { builtin: 3, user: 0 }; }, musicSource() { return "all"; },
    setMusicSource(v) { return v; }, trackName() { return ""; },
    uiTick() {}, skipTrack() {}, prevTrack() {},
    // ENGINE TONE: the panel reads the live profile/tune/layers back from the
    // engine on every sync rather than keeping a second copy, so these are part
    // of the contract init() depends on. Shapes mirror js/audio/engine.js;
    // tests/unit/audio-tune.test.mjs is what holds the two in step.
    profile() { return "team"; }, setProfile(v) { return v; },
    tune() { return { pitch: 1, detune: 1, revRange: 1, brightness: 1, whine: 1, sub: 1, limiter: 1 }; },
    setTune(v) { return v; },
    layers() { return { whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true }; },
    setLayer(k, v) { return v; },
    // The granular (PSOLA) core switch: AudioPanel.init() restores it, and the
    // panel reads its live state back on every sync.
    granular() { return { on: true, ready: false, active: false, period: 0 }; },
    setGranular(v) { return v; },
    grain() { return { on: true, ready: false, active: false, period: 0 }; }, setGrain(v) { return v; },
  };
  const G = {
    $, els: { soundbtn: $("soundbtn") },
    store: {
      get(_key, fallback) { return fallback; },
      set(key, value) { writes.set(key, value); },
    },
    soundOn: false, musicEnabled: true, state: "menu",
  };
  const context = vm.createContext({ GameAudio, Log: { info() {} } });
  vm.runInContext(`${audioPanelSource}\nglobalThis.__panel = AudioPanel;`, context,
    { filename: "js/audio/panel.js" });
  return { panel: context.__panel.create(G), G, nodes, calls, writes };
}

test("audio boot restore keeps saved master sound off when music is on", () => {
  const { panel, G, calls, writes } = audioPanelHarness();
  panel.init();

  assert.equal(G.soundOn, false);
  assert.equal(G.musicEnabled, true);
  assert.equal(writes.get("sound"), false);
  assert.equal(writes.get("music"), true);
  assert.equal(calls.includes("init"), false);
  assert.equal(calls.includes("start:-1"), false);
});

test("the sound button unlocks WebAudio synchronously after enabling its master", () => {
  const { panel, G, nodes, calls } = audioPanelHarness();
  panel.init();
  calls.length = 0;

  nodes.get("soundbtn").onclick();

  assert.equal(G.soundOn, true);
  assert.deepEqual(calls.slice(0, 3), ["enabled:true", "init", "start:-1"]);
});

test("music and SFX enable clicks also unlock a saved-off master synchronously", () => {
  for (const id of ["as-music-on", "as-sound-on"]) {
    const { panel, G, nodes, calls } = audioPanelHarness();
    panel.init();
    calls.length = 0;

    nodes.get(id).onclick({ stopPropagation() {} });

    assert.equal(G.soundOn, true, `${id} should lift the master`);
    assert.deepEqual(calls.slice(0, 2), ["enabled:true", "init"],
      `${id} should enable before synchronously unlocking WebAudio`);
  }
});

test("a stopped QR attempt disposes a camera stream that arrives late", async () => {
  const media = deferred();
  let intervals = 0;
  const track = { stops: 0, stop() { this.stops++; } };
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia: () => media.promise } },
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
      head: { appendChild() {} },
    },
    jsQR() {},
    setInterval() { intervals++; return intervals; },
    clearInterval() {},
  });
  seedLog(context);
  vm.runInContext(scanSource + ";globalThis.__scan=NetScan", context);
  const scanner = context.__scan.create();
  const video = { srcObject: null, setAttribute() {}, play: () => Promise.resolve() };
  const started = scanner.start(video, () => {});
  await Promise.resolve();
  scanner.stop();
  media.resolve({ getTracks: () => [track] });

  assert.equal((await started).error, "cancelled");
  assert.equal(scanner.active(), false);
  assert.equal(track.stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(intervals, 0);
});

test("a canceled QR attempt cannot arm an interval after video.play settles", async () => {
  const playing = deferred();
  let intervals = 0;
  const track = { stops: 0, stop() { this.stops++; } };
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } },
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
      head: { appendChild() {} },
    },
    jsQR() {}, setInterval() { intervals++; return intervals; }, clearInterval() {},
  });
  seedLog(context);
  vm.runInContext(scanSource + ";globalThis.__scan=NetScan", context);
  const scanner = context.__scan.create();
  const started = scanner.start({ srcObject: null, setAttribute() {}, play: () => playing.promise }, () => {});
  for (let i = 0; i < 4; i++) await Promise.resolve();
  scanner.stop();
  playing.resolve();

  assert.equal((await started).error, "cancelled");
  assert.equal(track.stops, 1);
  assert.equal(intervals, 0);
});

test("a decoder that loads without registering is retried", async () => {
  const scripts = [];
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia: () => Promise.reject(new Error("unused")) } },
    document: {
      createElement(tag) { const out = {}; if (tag === "script") scripts.push(out); return out; },
      head: { appendChild() {} },
    },
    setInterval, clearInterval,
  });
  seedLog(context);
  vm.runInContext(scanSource + ";globalThis.__scan=NetScan", context);
  const scanner = context.__scan.create();
  const first = scanner.start({}, () => {});
  scripts[0].onload();
  assert.equal((await first).error, "no_decoder");
  const second = scanner.start({}, () => {});
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  assert.equal((await second).error, "no_decoder");
});

test("an IndexedDB open that succeeds after timeout closes its orphan handle", async () => {
  let request;
  const timers = [];
  const context = vm.createContext({
    window: null,
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null },
    indexedDB: { open() { request = {}; return request; } },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    URL: { createObjectURL() {}, revokeObjectURL() {} }, Map,
  });
  context.window = context;
  seedLog(context);
  vm.runInContext(musicSource, context);
  const init = context.MusicLib.init();
  timers.shift()();
  await init;
  const db = { closes: 0, close() { this.closes++; }, objectStoreNames: { contains: () => true } };
  request.result = db;
  request.onsuccess();

  assert.equal(db.closes, 1);
  assert.equal(context.MusicLib.available(), false);
});

test("a timed-out API fetch releases the shared queue", async () => {
  const timers = [];
  const calls = [];
  const context = vm.createContext({
    fetch(url) {
      calls.push(url);
      if (calls.length === 1) return new Promise(() => {});
      return Promise.resolve(new Response("[]", { status: 200 }));
    },
    AbortController, Response,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date,
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const first = context.__api.weather(1, 0).catch((e) => e);
  const second = context.__api.positions(1, 0);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(calls.length, 1);
  timers.shift()(); // fetch deadline
  const firstError = await first;
  await new Promise((resolve) => setImmediate(resolve));
  // The minimum-gap timer may be present after the timeout releases the queue.
  while (calls.length < 2 && timers.length) {
    timers.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.match(firstError.message, /timed out/);
  assert.equal(calls.length, 2);
  await second;
});

test("API auth failures never fall back to stale cached data", async () => {
  const url = "https://api.openf1.org/v1/weather?session_key=7";
  const key = "apex26.api." + url;
  const stale = JSON.stringify({ t: 1, data: [{ rainfall: 99 }] });
  const context = vm.createContext({
    fetch: async () => ({
      ok: false, status: 403,
      headers: { get: () => null },
      text: async () => JSON.stringify({ detail: "Not authenticated" }),
    }),
    AbortController,
    localStorage: {
      length: 1,
      getItem: (k) => k === key ? stale : null,
      setItem() {}, key: () => key, removeItem() {},
    },
    Log: { warn() {} }, Date, setTimeout, clearTimeout,
  });
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);

  await assert.rejects(context.__api.weather(7, 0), (err) => {
    assert.equal(err.status, 403);
    assert.match(err.message, /Not authenticated/);
    return true;
  });
});

function dataApiHarness(responses, initial = new Map()) {
  const calls = [], sets = [];
  let keyCalls = 0, now = Date.parse("2026-07-26T14:45:00Z");
  class ClockDate extends Date { static now() { now += 1000; return now; } }
  const storage = {
    get length() { return initial.size; },
    key(i) { keyCalls++; return [...initial.keys()][i] ?? null; },
    getItem(k) { return initial.has(k) ? initial.get(k) : null; },
    setItem(k, v) { initial.set(k, String(v)); sets.push(k); },
    removeItem(k) { initial.delete(k); },
  };
  const context = vm.createContext({
    console, Date: ClockDate, Map, Set, Object, Array, JSON, Math, Number,
    isFinite, parseFloat, encodeURIComponent, AbortController,
    setTimeout, clearTimeout, localStorage: storage,
    fetch: async (url) => {
      calls.push(String(url));
      const body = responses.shift();
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
    },
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  return { api: context.__api, calls, sets, keyCalls: () => keyCalls };
}

function liveMergeHelpers() {
  const context = vm.createContext({ console, Map, Object, Array });
  vm.runInContext(liveSource + ";globalThis.__live=DataLive", context);
  return context.__live;
}

test("LIVE position/interval requests use watermarks and never touch localStorage", async () => {
  const h = dataApiHarness([
    [
      { driver_number: 44, position: 1, date: "2026-07-26T14:44:00Z" },
      { driver_number: 4, position: 2, date: "2026-07-26T14:44:00Z" },
    ],
    [{ driver_number: 4, position: 1, date: "2026-07-26T14:44:30Z" }],
    [{ driver_number: 44, gap_to_leader: 0, date: "2026-07-26T14:44:30Z" }],
  ]);
  const live = liveMergeHelpers();
  const state = { positionCursor: null, intervalCursor: null, positions: new Map(), intervals: {} };

  const first = await h.api.livePositions(999, null);
  assert.equal(first.cursor, "2026-07-26T14:44:00Z");
  live._mergePositionBatch(state, first);
  const delta = await h.api.livePositions(999, state.positionCursor);
  const merged = live._mergePositionBatch(state, delta);
  assert.deepEqual(Array.from(merged, (p) => [p.num, p.pos]).sort((a, b) => a[0] - b[0]), [[4, 1], [44, 1]],
    "a delta must update one driver without dropping unchanged drivers");
  const gaps = await h.api.liveIntervals(999, null);
  live._mergeIntervalBatch(state, gaps);

  assert.equal(h.calls[0], "https://api.openf1.org/v1/position?session_key=999");
  assert.match(h.calls[1], /position\?session_key=999&date%3E=2026-07-26T14%3A44%3A00Z$/);
  assert.equal(state.positionCursor, "2026-07-26T14:44:30Z");
  assert.equal(state.intervals[44], 0);
  assert.deepEqual(h.sets, [], "LIVE history/deltas must remain memory-only");
});

test("ordinary API writes sweep the cache at most once per five-minute window", async () => {
  const oldKey = "apex26.api.https://example.test/old";
  const entries = new Map([[oldKey, JSON.stringify({ t: Date.parse("2026-07-26T14:44:00Z"), data: [] })]]);
  const h = dataApiHarness([[], []], entries);
  await h.api.weather(1, 0);
  const afterFirst = h.keyCalls();
  await h.api.weather(2, 0);
  assert.equal(afterFirst, 1, "first write should perform one age sweep");
  assert.equal(h.keyCalls(), afterFirst, "second response in the same batch must not rescan storage");
});
