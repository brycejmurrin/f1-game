/* pause-silence.test.mjs — non-radio sources must go silent on every pause path.
 *
 * Radio was covered by #988 / #1029 / #1064. This pins the announcer (synth +
 * recorded): speechSynthesis / pack clips sit outside the WebAudio graph, so
 * stopEngine() does not touch them. Pause paths that re-hide #pausemenu in the
 * same task (rotate-block, photo-studio) must still cut via G.paused; the pit
 * garage never shows the card at all.
 *
 * Measured on tip before the fix: visible pause, rotate-block, photo, and pit
 * garage left speaking() true; only a hidden tab stopped the read. Driving
 * cues already gate on G.paused; rival/car SFX are silenced by stopEngine().
 * Soundtrack music under pause is intentional — no stinger API in soundtrack.js.
 *
 * Run: node --test tests/unit/pause-silence.test.mjs
 *      npm run test:audio-unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const unrefTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); t.unref?.(); return t; };
const flush = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const INFO = {
  track: { id: "monza", name: "Monza", gp: "Italian GP", country: "Italy", lengthKm: 5.793 },
  laps: 12, turns: 11, relief: 4, weather: "dry", tod: "day",
};

/** Announcer alone (no RadioVoice pause observers stealing the signal). */
function bootAnnouncer() {
  const observers = [];
  const listeners = {};
  const pause = { _hidden: true };
  Object.defineProperty(pause, "hidden", {
    get() { return this._hidden; },
    set(v) {
      this._hidden = !!v;
      for (const o of observers) if (o.el === pause) queueMicrotask(o.fn);
    },
  });
  const garage = { _hidden: true };
  Object.defineProperty(garage, "hidden", {
    get() { return this._hidden; },
    set(v) {
      this._hidden = !!v;
      for (const o of observers) if (o.el === garage) queueMicrotask(o.fn);
    },
  });
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, Set, console,
    setTimeout: unrefTimeout, clearTimeout,
  });
  seedLog(ctx);
  const synth = {
    calls: [],
    getVoices() { return [{ name: "Daniel", lang: "en-GB", localService: true }]; },
    speak(u) { this.calls.push({ m: "speak", text: u.text }); },
    cancel() { this.calls.push({ m: "cancel" }); },
    resume() { this.calls.push({ m: "resume" }); },
  };
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck() {}, radioStingStop() {} };
  ctx.document = {
    hidden: false,
    documentElement: { lang: "en" },
    getElementById: (id) => (id === "pausemenu" ? pause : id === "carsetup" ? garage : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  ctx.MutationObserver = function (fn) { this.observe = (el) => observers.push({ el, fn }); };
  // Minimal radio stub: announcer.create needs G.radio for the recorded path
  // and RadioVoice globals for speakable/SAMPLE — load the real module but do
  // not attach its pause observers to OUR pause/garage (create after we own them).
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  vm.runInContext(read("js/audio/announcer-recorded.js"), ctx, { filename: "js/audio/announcer-recorded.js" });
  vm.runInContext(read("js/audio/announcer.js"), ctx, { filename: "js/audio/announcer.js" });
  const A = vm.runInContext("Announcer", ctx);
  const RV = vm.runInContext("RadioVoice", ctx);
  let paused = false;
  const packStops = [];
  const G = {
    soundOn: true, state: "count", track: null,
    get paused() { return paused; },
    set paused(v) { paused = !!v; },
    store: { get: (_k, d) => d, set() {} },
    radio: {
      pack: {
        stop: (ch) => packStops.push(ch == null ? "*" : ch),
        load: () => Promise.resolve(false),
        ready: () => false, ensure() {}, plan: () => null, speak: () => false,
      },
      packOn: () => false, announcerPackOn: () => false,
      recordedPack: () => "announcer", recordedVoice: () => "announcer",
      volume: () => 0.8, stop() {},
      speakable: (t) => RV.speakable(t),
    },
  };
  // Drop RadioVoice's own observers from the list before Announcer.create — we
  // only want the announcer's pause wiring under test.
  observers.length = 0;
  const ann = A.create(G);
  return { ann, G, synth, pause, garage, observers, listeners, packStops, setPausedFlag: (v) => { paused = !!v; } };
}

test("the visible pause card stops the announcer mid-read", async () => {
  const { ann, pause, observers, setPausedFlag } = bootAnnouncer();
  assert.ok(observers.some((o) => o.el === pause), "announcer observes #pausemenu");
  assert.equal(ann.play(INFO), true);
  assert.equal(ann.speaking(), true, "precondition: a read is live");
  setPausedFlag(true);
  pause.hidden = false;
  await flush();
  assert.equal(ann.speaking(), false, "the pause card cuts commentary");
});

test("a rotate-block / photo pause that re-hides the card in the same task still stops the announcer", async () => {
  // setPaused(true) shows #pausemenu; syncRotateBlocker / photo-studio then sets
  // hidden again in the same synchronous task. MutationObserver runs after the
  // task with hidden===true — gating only on !pause.hidden misses it (same miss
  // #1029/#1064 fixed for radio). G.paused survives the re-hide.
  const { ann, pause, setPausedFlag, synth } = bootAnnouncer();
  assert.equal(ann.play(INFO), true);
  assert.equal(ann.speaking(), true);
  const cancelsBefore = synth.calls.filter((c) => c.m === "cancel").length;
  setPausedFlag(true);
  pause.hidden = false;
  pause.hidden = true;   // same task as setPaused — card already gone
  assert.equal(pause.hidden, true, "the card is gone by the end of the task");
  await flush();
  assert.equal(ann.speaking(), false, "G.paused still cuts after the same-task re-hide");
  assert.ok(synth.calls.filter((c) => c.m === "cancel").length > cancelsBefore, "synth.cancel ran");
});

test("the pit garage stops the announcer the way the pause card does", async () => {
  // openPitWork freezes behind #carsetup without showing #pausemenu.
  const { ann, garage, observers, setPausedFlag } = bootAnnouncer();
  assert.ok(observers.some((o) => o.el === garage), "announcer observes #carsetup");
  assert.equal(ann.play(INFO), true);
  assert.equal(ann.speaking(), true);
  setPausedFlag(true);
  garage.hidden = false;
  await flush();
  assert.equal(ann.speaking(), false, "opening the pit garage cuts commentary");
});

test("hidden tab stops the announcer; resume does not restart the stale line", async () => {
  const observers = [];
  const listeners = {};
  const pause = { hidden: true };
  const garage = { hidden: true };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, Set, console,
    setTimeout: unrefTimeout, clearTimeout,
  });
  seedLog(ctx);
  const synth = {
    calls: [],
    getVoices() { return [{ name: "Daniel", lang: "en-GB", localService: true }]; },
    speak(u) { this.calls.push({ m: "speak", text: u.text }); },
    cancel() { this.calls.push({ m: "cancel" }); },
    resume() {},
  };
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck() {}, radioStingStop() {} };
  ctx.document = {
    hidden: false,
    documentElement: { lang: "en" },
    getElementById: (id) => (id === "pausemenu" ? pause : id === "carsetup" ? garage : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  ctx.MutationObserver = function (fn) { this.observe = (el) => observers.push({ el, fn }); };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx);
  vm.runInContext(read("js/audio/announcer-recorded.js"), ctx);
  vm.runInContext(read("js/audio/announcer.js"), ctx);
  const A = vm.runInContext("Announcer", ctx);
  const RV = vm.runInContext("RadioVoice", ctx);
  let paused = false;
  const G = {
    soundOn: true, state: "count", track: null,
    get paused() { return paused; },
    store: { get: (_k, d) => d, set() {} },
    radio: {
      pack: { stop() {}, load: () => Promise.resolve(false), ready: () => false, ensure() {}, plan: () => null, speak: () => false },
      packOn: () => false, announcerPackOn: () => false,
      recordedPack: () => "announcer", recordedVoice: () => "announcer",
      volume: () => 0.8, stop() {}, speakable: (t) => RV.speakable(t),
    },
  };
  observers.length = 0;
  const ann = A.create(G);
  assert.equal(ann.play(INFO), true);
  assert.equal(ann.speaking(), true);
  ctx.document.hidden = true;
  listeners.visibilitychange();
  assert.equal(ann.speaking(), false, "hiding the tab cuts commentary");
  assert.equal(ann.play(INFO), false, "a hidden tab refuses a NEW read: a flyby timer landing in the background would speak unseen (bug-hunt 3, 2026-10-10)");
  assert.equal(ann.speaking(), false);
  // Resume: clear pause flags the way setPaused(false) would — must not restart.
  paused = false;
  pause.hidden = true;
  garage.hidden = true;
  ctx.document.hidden = false;
  await flush();
  assert.equal(ann.speaking(), false, "resume must not restart a stale announcer read");
});

test("recorded announcer clips stop on the pause card too", async () => {
  const observers = [];
  const listeners = {};
  const pause = { _hidden: true };
  Object.defineProperty(pause, "hidden", {
    get() { return this._hidden; },
    set(v) {
      this._hidden = !!v;
      for (const o of observers) if (o.el === pause) queueMicrotask(o.fn);
    },
  });
  const garage = { hidden: true };
  const packStops = [];
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, Set, console, Date,
    setTimeout: unrefTimeout, clearTimeout, Promise,
  });
  seedLog(ctx);
  // No speechSynthesis — force the recorded path.
  ctx.window = {};
  ctx.GameAudio = { setRadioDuck() {}, radioStingStop() {} };
  ctx.document = {
    hidden: false,
    documentElement: { lang: "en" },
    getElementById: (id) => (id === "pausemenu" ? pause : id === "carsetup" ? garage : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  ctx.MutationObserver = function (fn) { this.observe = (el) => observers.push({ el, fn }); };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx);
  vm.runInContext(read("js/audio/announcer-recorded.js"), ctx);
  vm.runInContext(read("js/audio/announcer.js"), ctx);
  const A = vm.runInContext("Announcer", ctx);
  let paused = false;
  const pack = {
    stop: (ch) => packStops.push(ch == null ? "*" : ch),
    load: () => Promise.resolve(true),
    ready: () => true, ensure() {},
    plan: (_id, text) => ({ secs: 1.2, text }),
    speak: () => true,
  };
  const G = {
    soundOn: true, state: "count", track: null,
    get paused() { return paused; },
    store: { get: (_k, d) => d, set() {} },
    radio: {
      pack, packOn: () => true, announcerPackOn: () => true,
      recordedPack: () => "announcer", recordedVoice: () => "announcer",
      volume: () => 0.8, stop() {},
      speakable: (t) => t,
    },
  };
  observers.length = 0;
  const ann = A.create(G);
  assert.ok(ann.available(), "recorded path is live without speechSynthesis");
  assert.equal(ann.play(INFO), true);
  await flush();
  assert.equal(ann.speaking(), true, "precondition: recorded read is live");
  packStops.length = 0;
  paused = true;
  pause.hidden = false;
  await flush();
  assert.equal(ann.speaking(), false, "pause card stops the recorded pack");
  assert.ok(packStops.includes("intro"), "intro channel is stopped");
});
