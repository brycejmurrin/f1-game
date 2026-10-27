/* audio-panel-settings-ui.test.mjs — MUSIC & SOUND panel UX (Radio round 4):
 * opened <details> folds scroll into view inside #audioset-inner; ENGINE TONE
 * help copy matches team-profile readouts. Run: node --test tests/unit/audio-panel-settings-ui.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedDom } from "../helpers/seed-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const panelSrc = () => read("js/audio/panel.js").replace(/^const\b/gm, "var");

function bootPanelOnAudioInner(radioGlobals = null) {
  const dom = makeDom();
  const inner = dom.makeElement("div", "audioset-inner");
  dom.body.appendChild(inner);
  const details = dom.makeElement("details", "as-sp-wrap");
  details.tagName = "DETAILS";
  let open = false;
  Object.defineProperty(details, "open", {
    get: () => open,
    set: (v) => { open = !!v; },
    configurable: true,
  });
  const summary = dom.makeElement("summary");
  summary.tagName = "SUMMARY";
  const foldBody = dom.makeElement("div", "as-sp-body");
  let scrollCalls = 0;
  let scrollOpts = null;
  foldBody.scrollIntoView = (opts) => { scrollCalls++; scrollOpts = opts; };
  details.appendChild(summary);
  details.appendChild(foldBody);
  inner.appendChild(details);

  const wired = new Map();
  const SettingRow = {
    wire(id, o) { wired.set(id, o); return null; },
    paint() {}, optionDisabled() {}, disable() {}, labels: (l) => l.map((v) => [v, v]),
  };
  const GameAudio = {
    init() {}, setEnabled() {}, setMusicEnabled() {}, setSfxEnabled() {}, setUiEnabled() {},
    setMusicVolume: (v) => v, setSfxVolume: (v) => v, setRadioFx() {}, setRadioPreset() {},
    sourceCounts: () => ({ builtin: 0, user: 0 }), musicSource: () => "all", setMusicSource: (v) => v,
    trackName: () => "", uiTick() {}, skipTrack() {}, prevTrack() {},
    profile: () => "team", setProfile: (v) => v,
    tune: () => ({ pitch: 1, detune: 1, revRange: 1, brightness: 1, whine: 1, sub: 1, limiter: 1 }),
    setTune: (v) => v,
    layers: () => ({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true }),
    setLayer: () => {}, radioFxLevel: () => 1,
    granular: () => ({ on: true, ready: false, active: false, period: 0 }),
    setGranular: (v) => v, grain: () => ({ on: true, ready: false, active: false, period: 0 }), setGrain: (v) => v,
  };
  const store = { get: (_k, d) => d, set() {}, subscribe: () => () => {} };
  const G = {
    $: (id) => dom.byId(id),
    els: { soundbtn: dom.byId("soundbtn") },
    store,
    soundOn: true, musicEnabled: true, state: "menu",
  };
  const scrollFadeCalls = [];
  const sb = {
    Math, JSON, Object, Array, String, Number, console,
    document: dom.document, window: null,
    GameAudio, SettingRow, G,
    ScrollFade: { refresh: () => scrollFadeCalls.push("refresh") },
    ...(radioGlobals || {}),
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  seedDom(ctx);
  vm.runInContext(read("js/ui/setting-row.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/setting-row.js") });
  vm.runInContext(`${panelSrc()}; globalThis.__audioPanel = AudioPanel;`, ctx, { filename: absSrc("js/audio/panel.js") });
  if (radioGlobals) {
    vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: absSrc("js/audio/radio-voice.js") });
    G.state = "race"; G.paused = true;
    G.radio = vm.runInContext("RadioVoice.create(G)", ctx);
  }
  ctx.__audioPanel.create(G);
  return { dom, G, ctx, details, foldBody, scrollCalls: () => scrollCalls, scrollOpts: () => scrollOpts, scrollFadeCalls };
}

test("opening a fold inside #audioset-inner scrolls its body into view and refreshes ScrollFade", () => {
  const h = bootPanelOnAudioInner();
  assert.equal(h.scrollCalls(), 0);
  h.details.open = true;
  h.dom.dispatch(h.details, { type: "toggle", bubbles: true });
  assert.equal(h.scrollCalls(), 1, "the opened fold body must scrollIntoView");
  assert.equal(h.scrollOpts().block, "nearest");
  assert.equal(h.scrollOpts().inline, "nearest");
  assert.deepEqual(h.scrollFadeCalls, ["refresh"]);
});

test("every ENGINE TONE slider's grid lands on the shipped TUNE_DEF value and spans its range (H23)", () => {
  // tone-model.js promises "the panel's step table still lands on each one". BOOST ships
  // 1.12 and TURBO .62: on the old .25 grid the thumb sat at 1.0/.5 and the first drag
  // wrote a value the shipped voice (and the team profile match) could not return to.
  const html = read("index.html");
  const ctx = vm.createContext({});
  vm.runInContext(read("js/audio/tone-model.js"), ctx, { filename: absSrc("js/audio/tone-model.js") });
  const { TUNE_DEF, TUNE_RANGE } = vm.runInContext("GameAudioToneModel", ctx);
  const rows = [...read("js/audio/panel.js").matchAll(/\{ k: "(\w+)",\s*id: "(as-t-[\w-]+)",\s*lo: ([\d.]+),\s*step: ([\d.]+) \}/g)]
    .map((m) => ({ k: m[1], id: m[2], lo: +m[3], step: +m[4] }));
  assert.ok(rows.length >= 20, "found the TONE rows (" + rows.length + ")");
  for (const r of rows) {
    const idx = (TUNE_DEF[r.k] - r.lo) / r.step;
    assert.ok(Math.abs(idx - Math.round(idx)) < 1e-6,
      `${r.id}: shipped ${r.k} ${TUNE_DEF[r.k]} is slider position ${idx} on lo ${r.lo} step ${r.step}`);
    assert.ok(Math.abs(r.lo + Math.round(idx) * r.step - TUNE_DEF[r.k]) < 1e-9, `${r.id}: round-trip`);
    const tag = html.match(new RegExp('<input id="' + r.id + '"[^>]*>'));
    assert.ok(tag, `${r.id} is in index.html`);
    const max = +tag[0].match(/max="(\d+)"/)[1];
    const top = Math.round((TUNE_RANGE[r.k][1] - r.lo) / r.step);
    assert.ok(max >= top, `${r.id}: max ${max} cannot reach the range top (${top} steps)`);
  }
});

test("ENGINE TONE PITCH CURVE help describes team factory readouts, not 100 on every slider", () => {
  const html = read("index.html");
  const start = html.indexOf('id="as-engine-details"');
  assert.ok(start >= 0);
  const end = html.indexOf("</details>", start);
  const block = html.slice(start, end);
  assert.doesNotMatch(block, /100 leaving it unchanged/i,
    "TEAM profile shows PITCH 85, REV 130, etc. — 100 is not the factory default on every slider");
  assert.match(block, /restores that profile/i,
    "help names what RESET TO TEAM SOUND does (setProfile team via panel.js)");
  assert.match(block, /factory mix/i);
});

function bootRecordedPanel() {
  const leaves = [], observers = [], speaks = [], stops = [], loads = [];
  let ready = false;
  const pack = { load: () => new Promise(resolve => loads.push(resolve)), ready: () => ready, remaining: () => 0, ensure() {},
    stop() { stops.push(true); }, speak(id, text) { speaks.push({ id, text }); return true; }, releaseExcept() {}, debug: () => ({}) };
  const h = bootPanelOnAudioInner({ SettingsNav: { onLeave(fn) { leaves.push(fn); } }, VoicePack: { create: () => pack, choices: () => [] },
    setTimeout: () => 1, clearTimeout() {},
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { observers.push({ el, fn: this.fn }); } },
    speechSynthesis: { speak() {}, cancel() {}, resume() {}, getVoices: () => [] }, SpeechSynthesisUtterance: function(text) { this.text = text; } });
  // The settings dialog stays open and its pause card stays hidden throughout.
  h.dom.byId("pmsettings").hidden = false; h.dom.byId("audioset").hidden = false; h.dom.byId("pausemenu").hidden = true;
  h.dom.document.createTextNode = text => { const node = h.dom.makeElement("span"); node.nodeType = 3; node.textContent = text; return node; };
  for (const id of ["as-mvol", "as-svol", "as-rvol", "as-rfx"]) {
    const row = h.dom.makeElement("label"); row.className = "tune-row"; row.appendChild(h.dom.byId(id));
  }
  h.dom.dispatch(h.dom.byId("pm-audio"), { type: "click" });
  return { ...h, leaves, observers, speaks, stops, loads, ready() { ready = true; } };
}

test("leaving audio retires its pending recorded TEST while settings remains open", async () => {
  for (const ending of ["back", "other-page", "panel-hidden", "dialog-hidden", "close", "cancel", "stay"]) {
    const h = bootRecordedPanel(), button = h.dom.byId("as-v-radio-test");
    assert.equal(typeof button.onclick, "function", "the actual panel TEST button owns the preview");
    button.onclick();
    assert.equal(h.loads.length, 1);
    const generation = h.G.radio.previewGeneration();
    if (ending === "back" || ending === "other-page") h.leaves.forEach(fn => fn("audio"));
    else if (ending === "panel-hidden" || ending === "dialog-hidden") {
      const el = h.dom.byId(ending === "panel-hidden" ? "audioset" : "pmsettings"); el.hidden = true;
      h.observers.filter(o => o.el === el).forEach(o => o.fn([]));
    } else if (ending === "close" || ending === "cancel") h.dom.dispatch(h.dom.byId("pmsettings"), { type: ending });
    else h.leaves.forEach(fn => fn("display")); // leaving another page is unrelated
    h.ready(); h.loads.forEach(resolve => resolve(true));
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(h.speaks.length, ending === "stay" ? 1 : 0, ending);
    assert.equal(h.G.radio.previewGeneration() === generation, ending === "stay", ending);
    if (["back", "other-page", "stay"].includes(ending)) {
      assert.equal(h.dom.byId("pmsettings").hidden, false);
      assert.equal(h.dom.byId("pausemenu").hidden, true);
    }
    assert.equal(h.G.store.get("radioVoice", false), false, "TEST works independently of automatic radio policy");
  }
});

test("audio page leave preserves a later independent voice and does not stop unowned race radio", async () => {
  const h = bootRecordedPanel();
  h.dom.byId("as-v-radio-test").onclick();
  const panelGeneration = h.G.radio.previewGeneration();
  assert.equal(h.G.radio.preview("control", "Independent later test"), true);
  const newer = h.G.radio.previewGeneration(), stopped = h.stops.length;
  assert.notEqual(newer, panelGeneration);
  h.leaves.forEach(fn => fn("audio"));
  assert.equal(h.G.radio.previewGeneration(), newer);
  assert.equal(h.stops.length, stopped, "stale panel ownership cannot stop a newer voice");
  h.ready(); h.loads.forEach(resolve => resolve(true));
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(h.speaks.length, 1, "only the independent newer preview plays");
  for (const hadPanelPreview of [false, true]) {
    const race = bootRecordedPanel();
    if (hadPanelPreview) race.dom.byId("as-v-radio-test").onclick();
    race.ready(); race.G.paused = false; race.G.radio.setEnabled(true);
    assert.equal(race.G.radio.say("BOX BOX BOX", 3, "info"), true);
    const raceGeneration = race.G.radio.previewGeneration(), raceStops = race.stops.length;
    race.leaves.forEach(fn => fn("audio"));
    race.loads.forEach(resolve => resolve(true));
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(race.G.radio.previewGeneration(), raceGeneration);
    assert.equal(race.stops.length, raceStops, "page cleanup never halts newer/unowned live race radio");
    assert.equal(race.speaks.length, 1, "the actual race transmission survives without a stale TEST playing");
  }
});
