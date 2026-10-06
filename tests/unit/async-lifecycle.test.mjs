import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedDom } from "../helpers/seed-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";

const scanSource = await readFile(new URL("../../js/net/scan.js", import.meta.url), "utf8");
const musicSource = await readFile(new URL("../../js/audio/music-lib.js", import.meta.url), "utf8");
const apiSource = (await Promise.all(["api-transport", "api"].map((name) =>
  readFile(new URL(`../../js/data/${name}.js`, import.meta.url), "utf8")))).join("\n");
const liveSource = (await Promise.all(["tab-utils", "live"].map((name) =>
  readFile(new URL(`../../js/data/${name}.js`, import.meta.url), "utf8")))).join("\n");
const dataCss = await readFile(new URL("../../css/data.css", import.meta.url), "utf8");
const audioPanelSource = await readFile(new URL("../../js/audio/panel.js", import.meta.url), "utf8");
const menusSource = await readFile(new URL("../../js/ui/select-screen.js", import.meta.url), "utf8");

test("a skipped View Transition cannot raise unhandled animation rejections or apply the screen twice", async () => {
  const begin = menusSource.indexOf("const vtReduce ="), end = menusSource.indexOf("// Full-screen team picker", begin);
  assert.ok(begin >= 0 && end > begin);
  const callbacks = [], timers = [];
  let swaps = 0;
  const sandbox = { window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: { dataset: { motion: "on" } }, startViewTransition(run) {
      callbacks.push(run);
      return { ready: Promise.reject(new Error("snapshot skipped")), finished: Promise.reject(new Error("transition aborted")),
        updateCallbackDone: Promise.reject(new Error("DOM update timed out")) };
    } }, setTimeout: run => timers.push(run) };
  const context = vm.createContext(sandbox);
  vm.runInContext(menusSource.slice(begin, end) + ";globalThis.swap=vt;", context);
  context.swap(() => swaps++);
  assert.equal(swaps, 0);
  timers[0](); callbacks[0](); timers[0]();
  assert.equal(swaps, 1, "the fallback and delayed native callback share one DOM change");
  await new Promise(resolve => setImmediate(resolve)); // Node fails the test for any unhandled rejection.
  sandbox.document.documentElement.dataset.motion = "reduce";
  context.swap(() => swaps++);
  assert.equal(swaps, 2); assert.equal(callbacks.length, 1, "reduced motion bypasses snapshots");
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function audioPanelHarness({ voiceUI = false } = {}) {
  const nodes = new Map();
  const element = () => ({
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "",
    classList: { toggle() {} }, setAttribute() {}, closest() { return this; },
    // AudioPanel.addEventListener on #pm-audio so SettingsNav can keep its
    // own onclick (the door opens the MUSIC page). This harness never clicks
    // that door — a no-op is enough to let create() finish.
    addEventListener() {},
  });
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const calls = [];
  const writes = new Map();
  // The panel's picks are setting rows (js/ui/setting-row.js). This harness has
  // no DOM, so a two-method stand-in records each row's read/write pair by id;
  // the tests below drive a pick through `wired.get(id).write(v)`.
  const wired = new Map();
  const SettingRow = { wire(id, o) { wired.set(id, o); return null; }, paint() {}, optionDisabled() {}, disable() {}, labels: (l) => l.map((v) => [v, v]) };
  const GameAudio = {
    init() { calls.push("init"); },
    setEnabled(v) { calls.push(`enabled:${v}`); },
    setMusicEnabled(v) { calls.push(`music:${v}`); },
    setSfxEnabled(v) { calls.push(`sfx:${v}`); },
    setUiEnabled(v) { calls.push(`ui:${v}`); },
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
    // TEAM RADIO FX. create() restores the stored level before any panel is
    // opened — radioSting is reachable from showAnnounce long before that —
    // so a stub without it takes the whole panel down at construction.
    setRadioFx(v) { return v; }, radioFxLevel() { return 1; },
  };
  const G = {
    $, els: { soundbtn: $("soundbtn") },
    store: {
      get(_key, fallback) { return fallback; },
      set(key, value) { writes.set(key, value); },
    },
    soundOn: false, musicEnabled: true, state: "menu",
  };
  const voices = [{ name: "First", lang: "en-GB" }], tunes = {};
  let recorded = true;
  const makeNode = (tag) => {
    const e = element(); e.tagName = tag; e.children = [];
    e.appendChild = child => { e.children.push(child); return child; };
    e.append = (...children) => children.forEach(e.appendChild);
    e.removeChild = child => { e.children.splice(e.children.indexOf(child), 1); };
    Object.defineProperty(e, "lastChild", {get: () => e.children.at(-1)});
    Object.defineProperty(e, "id", {set: id => nodes.set(id, e)});
    e.querySelectorAll = () => e.children.flatMap(c => [c, ...(c.querySelectorAll ? c.querySelectorAll() : [])]).filter(c => ['select','input','button'].includes(c.tagName));
    return e;
  };
  const extras = voiceUI ? {
    document: { createElement: makeNode, createTextNode: textContent => ({textContent}) },
    RadioVoice: {PITCH_MIN:.5,PITCH_MAX:1.6,RATE_MIN:.6,RATE_MAX:1.35},
  } : {};
  if (voiceUI) {
    for (const id of ['as-voices','as-ann-voice']) { const host = makeNode('div'); host.appendChild(makeNode('p')); nodes.set(id,host); }
    G.radio = { available:()=>true, voiceList:()=>voices, tuneFor:ch=>({name:'',pitch:1,rate:1,...tunes[ch]}),
      setTune:(ch,patch)=>{tunes[ch]={...tunes[ch],...patch};}, setPackOn:v=>{recorded=v;}, packOn:()=>recorded,
      setEnabled(){}, unlock(){}, stop(){}, setVolume:v=>v, preview:ch=>{calls.push('preview:'+ch);} };
    G.announcer = {available:()=>true,enabled:()=>false,stop(){},setEnabled(){},sample(){calls.push('ann-sample');}};
  }
  const context = vm.createContext({ GameAudio, SettingRow, Log: { info() {} }, ...extras });
  seedDom(context);   // the closed-fold summaries paint through Dom.paintFold
  vm.runInContext(`${audioPanelSource}\nglobalThis.__panel = AudioPanel;`, context,
    { filename: "js/audio/panel.js" });
  return { panel: context.__panel.create(G), G, nodes, calls, writes, wired, voices, tunes };
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

test("master sound off cancels pending announcements and every recorded channel", () => {
  const { panel, G, nodes, calls } = audioPanelHarness(); panel.init();
  G.radio = { available: () => false, packOn: () => true,
    stop: () => calls.push("radio-stop"), pack: { stop: () => calls.push("pack-stop") } };
  G.announcer = { available: () => false, enabled: () => false, stop: () => calls.push("ann-stop") };
  G.soundOn = true; calls.length = 0;
  nodes.get("soundbtn").onclick();
  assert.equal(G.soundOn, false);
  assert.ok(calls.includes("radio-stop"));
  assert.ok(calls.includes("ann-stop"));
  assert.ok(calls.includes("pack-stop"));
});

test("music and SFX enable clicks also unlock a saved-off master synchronously", () => {
  for (const id of ["as-music", "as-sound"]) {
    const { panel, G, wired, calls } = audioPanelHarness();
    panel.init();
    calls.length = 0;

    wired.get(id).write("on");

    assert.equal(G.soundOn, true, `${id} should lift the master`);
    assert.deepEqual(calls.slice(0, 2), ["enabled:true", "init"],
      `${id} should enable before synchronously unlocking WebAudio`);
  }
});

test("MENU SOUNDS row persists apex26.menuSfx and gates the engine's ui blips", () => {
  const { panel, wired, calls } = audioPanelHarness();
  panel.init();
  assert.ok(calls.includes("ui:true"), "boot restores the saved (default ON) switch");
  calls.length = 0;
  wired.get("as-ui").write("off");
  assert.equal(wired.get("as-ui").read(), "off");
  assert.ok(calls.includes("ui:false"));
});

test("a stopped QR attempt disposes a camera stream that arrives late", async () => {
  const media = deferred(), requested = deferred();
  let intervals = 0;
  const track = { stops: 0, stop() { this.stops++; } };
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia: () => { requested.resolve(); return media.promise; } } },
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
  await requested.promise;
  scanner.stop();
  media.resolve({ getTracks: () => [track] });

  assert.equal((await started).error, "cancelled");
  assert.equal(scanner.active(), false);
  assert.equal(track.stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(intervals, 0);
});

test("a canceled QR attempt cannot arm an interval after video.play settles", async () => {
  const playing = deferred(), playEntered = deferred();
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
  const started = scanner.start({ srcObject: null, setAttribute() {}, play: () => { playEntered.resolve(); return playing.promise; } }, () => {});
  await playEntered.promise;
  scanner.stop();
  playing.resolve();

  assert.equal((await started).error, "cancelled");
  assert.equal(track.stops, 1);
  assert.equal(intervals, 0);
});

test("a decoder that loads without registering is retried", async () => {
  const scripts = [], appended = [deferred(), deferred()];
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia: () => Promise.reject(new Error("unused")) } },
    document: {
      createElement(tag) { const out = {}; if (tag === "script") scripts.push(out); return out; },
      head: { appendChild() { appended[scripts.length - 1].resolve(); } },
    },
    setInterval, clearInterval,
  });
  seedLog(context);
  vm.runInContext(scanSource + ";globalThis.__scan=NetScan", context);
  const scanner = context.__scan.create();
  const first = scanner.start({}, () => {});
  await appended[0].promise;
  scripts[0].onload();
  assert.equal((await first).error, "no_decoder");
  const second = scanner.start({}, () => {});
  await appended[1].promise;
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

test("a response whose BODY stalls still times out and releases the queue", async () => {
  // 2026-09-24: the deadline covered only the headers; res.json() ran after the
  // race settled, so a body stalled mid-transfer hung the queue for the session.
  const timers = [];
  const calls = [];
  const context = vm.createContext({
    fetch(url) {
      calls.push(url);
      if (calls.length === 1) return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
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
  timers.shift()(); // fetch deadline, with the body still unread
  const firstError = await first;
  await new Promise((resolve) => setImmediate(resolve));
  while (calls.length < 2 && timers.length) {
    timers.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.match(firstError.message, /timed out/, "a stalled body is a timeout, not a hang");
  assert.equal(calls.length, 2, "the next request is not stuck behind it");
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
  const context = vm.createContext({ console, Map, Object, Array, Date });
  vm.runInContext(liveSource + ";globalThis.__live=DataLive", context);
  return context.__live;
}

test("LIVE labels sessions as upcoming, live, or completed", () => {
  const live = liveMergeHelpers();
  const now = Date.parse("2026-09-18T12:00:00Z");
  assert.equal(live._sessionStatus({ type: "Race", dateStart: "2026-09-18T14:00:00Z" }, now), "UPCOMING");
  assert.equal(live._sessionStatus({ type: "Race", dateStart: "2026-09-18T10:00:00Z" }, now), "LIVE");
  assert.equal(live._sessionStatus({ type: "Race", dateStart: "2026-09-13T10:00:00Z" }, now), "COMPLETED");
});

test("LIVE session time copy agrees with the status badge", () => {
  const live = liveMergeHelpers();
  const meta = { dateStart: "2026-09-18T10:00:00Z" };
  const fmt = (value) => `[${value}]`;
  assert.equal(live._sessionTimeLabel(meta, "UPCOMING", fmt), "Starts [2026-09-18T10:00:00Z]");
  assert.equal(live._sessionTimeLabel(meta, "LIVE", fmt), "Started [2026-09-18T10:00:00Z]");
  assert.equal(live._sessionTimeLabel(meta, "COMPLETED", fmt), "Started [2026-09-18T10:00:00Z]");
  assert.equal(live._sessionTimeLabel({}, "COMPLETED", fmt), "");
});

test("LIVE split panes can shrink without creating modal-wide horizontal overflow", () => {
  for (const selector of [".dh-split", ".dh-split-L", ".dh-split-R"]) {
    const block = dataCss.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "s"));
    assert.ok(block, `${selector} CSS block exists`);
    assert.match(block[1], /min-width:\s*0/, `${selector} must be allowed to shrink inside the modal`);
  }
});

test("LIVE completed badge has a distinct muted treatment", () => {
  const block = dataCss.match(/\.dh-live-state\[data-state="completed"\]\s*\{([^}]*)\}/s);
  assert.ok(block, "completed state has its own CSS block");
  assert.match(block[1], /color:\s*var\(--dim\)/);
  assert.match(block[1], /background:/);
});

test("mergeIntervalBatch ignores values:null and never writes meta keys into gaps", () => {
  const live = liveMergeHelpers();
  const state = { intervals: { 44: 1.2 }, intervalCursor: "a" };
  live._mergeIntervalBatch(state, { values: null, cursor: "b" });
  assert.deepEqual(state.intervals, { 44: 1.2 }, "prior gaps survive a null values batch");
  assert.equal(state.intervalCursor, "b", "cursor still advances");
  assert.equal(state.intervals.values, undefined);
  assert.equal(state.intervals.cursor, undefined);

  live._mergeIntervalBatch(state, { values: { 4: 0.5 }, cursor: "c" });
  assert.equal(state.intervals[4], 0.5);
  assert.equal(state.intervals[44], 1.2);

  // Snapshot shape from intervals(): a plain number map, no values wrapper.
  const plain = { intervals: {}, intervalCursor: null };
  live._mergeIntervalBatch(plain, { 44: 0, 4: 1.1 });
  assert.deepEqual(plain.intervals, { 44: 0, 4: 1.1 });
});

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

test("snapshot and delta classification share row mapping while retaining their empty-response shapes", async () => {
  const older = "2026-07-26T14:43:00Z", newer = "2026-07-26T14:44:00Z";
  const positions = [
    { driver_number: 44, position: 3, date: older },
    { driver_number: 4, position: 2, date: newer },
    { driver_number: 44, position: 1, date: newer },
    { driver_number: 4, position: 4, date: older },
    { driver_number: 7, position: null, date: newer }
  ];
  const intervals = [
    { driver_number: 44, gap_to_leader: 0, date: newer },
    { driver_number: 4, gap_to_leader: " +1 LAP ", date: newer },
    { driver_number: 4, gap_to_leader: 3, date: older }
  ];
  const h = dataApiHarness([positions, positions, intervals, intervals, [], [], [], []]);
  const snapshot = await h.api.positions(7, 0);
  const delta = await h.api.livePositions(7, older);
  assert.deepEqual(Array.from(snapshot, (row) => [row.num, row.pos]), [[44, 1], [4, 2], [7, null]]);
  assert.deepEqual(Array.from(delta.values, (row) => [row.num, row.pos]), Array.from(snapshot, (row) => [row.num, row.pos]));
  assert.equal(delta.cursor, newer);
  const gaps = await h.api.intervals(7, 0);
  const gapDelta = await h.api.liveIntervals(7, older);
  assert.equal(gaps[4], "+1 LAP");
  assert.equal(gapDelta.values[4], gaps[4]);
  assert.equal(gapDelta.values[44], 0);
  assert.equal(gapDelta.cursor, newer);
  assert.equal(await h.api.positions(7, 0), null);
  assert.equal((await h.api.livePositions(7, newer)).values.length, 0);
  assert.equal(await h.api.intervals(7, 0), null);
  const empty = await h.api.liveIntervals(7, newer);
  assert.equal(Object.keys(empty.values).length, 0);
  assert.equal(empty.cursor, null);
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

test('voice volume and auditions remain available with automatic radio and announcer off', () => {
  const {G,nodes,wired,calls}=audioPanelHarness({voiceUI:true});
  G.soundOn=true; wired.get('as-radio').write('off');
  assert.equal(nodes.get('as-rvol').disabled,false);
  assert.equal(nodes.get('as-v-coach-test').disabled,false);
  assert.equal(nodes.get('as-v-announcer-test').disabled,false);
  nodes.get('as-v-coach-test').onclick(); assert.ok(calls.includes('preview:coach'));
});

test('choosing a system voice for a race channel switches source, but the announcer pick leaves it alone', () => {
  // Every race channel has a recorded voice (RadioVoice.PACK_VOICE), so a pick
  // for any of them is choosing SYSTEM; the announcer's pick reads the pre-race
  // show, and RECORDED keeps the recorded commentator in the race.
  for (const ch of ['radio','coach','control']) {
    const {G,nodes,wired,tunes}=audioPanelHarness({voiceUI:true});
    G.soundOn=true; wired.get('as-radio').write('off');
    const ann=nodes.get('as-v-announcer');ann.value='First';ann.onchange();
    assert.equal(G.radio.packOn(),true, 'announcer pick keeps RECORDED');
    const sel=nodes.get('as-v-'+ch);sel.value='First';sel.onchange();
    assert.equal(G.radio.packOn(),false, ch+' pick selects SYSTEM'); assert.equal(tunes[ch].name,'First');
  }
});

test('same-size voice-list replacements refresh both settings selectors', () => {
  const {G,nodes,wired,voices}=audioPanelHarness({voiceUI:true});
  G.soundOn=true; wired.get('as-radio').write('off');
  voices[0]={name:'Replacement',lang:'en-GB'};
  wired.get('as-radio').write('off');
  for(const id of ['as-v-radio','as-v-announcer']) assert.ok(nodes.get(id).children.flatMap(o=>o.children || [o]).some(o=>o.value==='Replacement'),id);
});
