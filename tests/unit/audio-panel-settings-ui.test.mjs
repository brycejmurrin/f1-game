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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const panelSrc = () => read("js/audio/panel.js").replace(/^const\b/gm, "var");

function bootPanelOnAudioInner() {
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
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  seedDom(ctx);
  vm.runInContext(read("js/ui/setting-row.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/setting-row.js" });
  vm.runInContext(`${panelSrc()}; globalThis.__audioPanel = AudioPanel;`, ctx, { filename: "js/audio/panel.js" });
  ctx.__audioPanel.create(G);
  return { dom, details, foldBody, scrollCalls: () => scrollCalls, scrollOpts: () => scrollOpts, scrollFadeCalls };
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
