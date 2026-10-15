/* audio-panel-boot.test.mjs — AudioPanel.init restores the MUSIC switch
 * BEFORE the master SOUND gate (round-2 hunt, audio F5): setSound(true) starts
 * the menu track, and soundtrack.js's own switch defaults ON, so with the old
 * order a MUSIC OFF player still fetched and decoded menu.mp3 at boot.
 * Run: node --test tests/unit/audio-panel-boot.test.mjs
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

function boot({ soundOn, musicEnabled, raceRadio, data = {}, extra = {} }) {
  const dom = makeDom();
  const calls = [];
  const spied = { setMusicEnabled: (b) => calls.push("setMusicEnabled:" + b), startMusic: () => calls.push("startMusic"),
                  setEnabled: (b) => calls.push("setEnabled:" + b) };
  const GameAudio = new Proxy({}, {
    get: (t, k) => k in t ? t[k] : (spied[k] || ((v) => (typeof v === "number" ? v : undefined))),
  });
  Object.assign(GameAudio, {
    musicSource: () => "all", setMusicSource: (v) => v, sourceCounts: () => ({ builtin: 0, user: 0 }),
    profile: () => "team", setProfile: (v) => v, trackName: () => "",
    tune: () => ({ pitch: 1, detune: 1, revRange: 1, brightness: 1, whine: 1, sub: 1, limiter: 1 }),
    layers: () => ({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true }),
    radioFxLevel: () => 1, granular: () => ({ on: true, ready: false, active: false, period: 0 }),
    grain: () => ({ on: true, ready: false, active: false, period: 0 }),
  });
  const wired = new Map();
  const SettingRow = { wire(id, o) { wired.set(id, o); return null; }, paint() {}, optionDisabled() {}, disable() {}, labels: (l) => l.map((v) => [v, v]) };
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; }, subscribe: () => () => {} };
  const $ = (id) => { const e = dom.byId(id); e.closest = () => e; return e; };
  const G = { $, els: { soundbtn: dom.byId("soundbtn") }, store, soundOn, musicEnabled, state: "menu", raceRadio };
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, window: null, GameAudio, SettingRow, G,
               ScrollFade: { refresh() {} } };
  Object.assign(sb, extra);
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx); seedDom(ctx);
  vm.runInContext(read("js/audio/panel.js").replace(/^const\b/gm, "var") + "; globalThis.__audioPanel = AudioPanel;", ctx, { filename: "js/audio/panel.js" });
  const panel = ctx.__audioPanel.create(G);
  calls.length = 0;
  panel.init();
  return { calls, wired, data, dom, G, GameAudio, panel };
}

test("init sets the music switch before setSound can start the menu track", () => {
  const { calls } = boot({ soundOn: true, musicEnabled: false });
  const sw = calls.indexOf("setMusicEnabled:false"), start = calls.indexOf("startMusic");
  assert.ok(sw >= 0, calls.join(" "));
  assert.ok(start < 0 || sw < start, "setSound started the menu track before the MUSIC OFF switch reached the soundtrack: " + calls.join(" "));
});

test("init with music on still starts the menu track (after the switch)", () => {
  const { calls } = boot({ soundOn: true, musicEnabled: true });
  assert.ok(calls.indexOf("setMusicEnabled:true") < calls.indexOf("startMusic"), calls.join(" "));
});

// Round-2 hunt: the race-session STUB (session-stub.js) is truthy but persists
// nothing. A chatter / commentary / spotter row changed before LAZY_RACE_SESSION
// landed was written to it and lost; the real RaceRadio.create reads the store.
test("rows changed while RaceRadio is still the stub land in the store", () => {
  const stub = { _stub: true, setChat: (v) => v || "normal", setComm: (v) => v || "tv", setSpotter: () => false,
                 chat: () => "normal", comm: () => "tv", spotter: () => false };
  const { wired, data } = boot({ soundOn: true, musicEnabled: true, raceRadio: stub });
  wired.get("as-chat").write("chatty");
  wired.get("as-comm").write("on");
  wired.get("as-spot").write("on");
  assert.equal(data.radioChat, "chatty");
  assert.equal(data.commentary, "on");
  assert.equal(data.spotter, true);
  assert.equal(wired.get("as-chat").read(), "chatty", "the row reads back what was set, not the stub's default");
  assert.equal(wired.get("as-comm").read(), "on");
});

test("with the real RaceRadio the module owns the write", () => {
  const calls = [];
  const real = { setChat: (v) => calls.push("chat:" + v), setComm: (v) => calls.push("comm:" + v), setSpotter: (b) => calls.push("spot:" + b),
                 chat: () => "normal", comm: () => "tv" };
  const { wired, data } = boot({ soundOn: true, musicEnabled: true, raceRadio: real });
  wired.get("as-chat").write("key"); wired.get("as-comm").write("off"); wired.get("as-spot").write("on");
  assert.deepEqual(calls, ["chat:key", "comm:off", "spot:true"]);
  assert.equal(data.radioChat, undefined);
});


test("battle samples stop when leaving audio, hiding its panel or closing the settings dialog", () => {
  const observers = [], leave = []; let active = false, plays = 0;
  const b = { ready: () => true, prepare: () => Promise.resolve(true),
    play: () => { active = true; plays++; return true; }, stop: () => { active = false; } };
  const r = boot({ soundOn: true, musicEnabled: false, data: { battleEarcon: true }, extra: {
    BattleEarcon: { create: () => b }, SettingsNav: { onLeave: (fn) => leave.push(fn) },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { observers.push({ el, fn: this.fn }); } },
  } });
  const sample = r.dom.byId("as-battle-ahead-closing"), panel = r.dom.byId("audioset"), settings = r.dom.byId("pmsettings");
  assert.equal(r.wired.get("as-battle").read(), "on", "stored opt-in reads correctly");
  for (const mode of ["leave", "panel-hidden", "settings-hidden", "close", "cancel", "mute", "off"]) {
    panel.hidden = false; settings.hidden = false; r.G.soundOn = true; r.data.battleEarcon = true;
    sample.onclick(); assert.equal(active, true, mode);
    if (mode === "leave") leave[0]("audio");
    if (mode === "panel-hidden") { panel.hidden = true; observers.find((o) => o.el === panel).fn(); }
    if (mode === "settings-hidden") { settings.hidden = true; observers.find((o) => o.el === settings).fn(); }
    if (mode === "close" || mode === "cancel") settings.dispatchEvent({ type: mode });
    if (mode === "mute") r.G.els.soundbtn.onclick();
    if (mode === "off") r.wired.get("as-battle").write("off");
    assert.equal(active, false, mode);
  }
  assert.equal(plays, 7);
});
test("default-off and system-announcer speech suppress battle sample playback", () => {
  let plays = 0;
  const b = { ready: () => true, prepare: () => Promise.resolve(true), play: () => { plays++; return true; }, stop() {} };
  const r = boot({ soundOn: true, musicEnabled: false, extra: { BattleEarcon: { create: () => b } } });
  const sample = r.dom.byId("as-battle-ahead-closing");
  assert.equal(r.wired.get("as-battle").read(), "off"); sample.onclick(); assert.equal(plays, 0);
  r.data.battleEarcon = true; r.G.announcer = { speaking: () => true };
  sample.onclick(); assert.equal(plays, 0, "system TEST speech owns the audio moment too");
  r.G.announcer.speaking = () => false; sample.onclick(); assert.equal(plays, 1);
});


test("radio focus native choice persists through lazy stub replacement and reload without lifting master mute", () => {
  const data = {}, r = boot({ soundOn: false, musicEnabled: false, data });
  r.GameAudio._stub = true;
  r.wired.get("as-focus").write("8");
  assert.equal(data.radioFocusDb, 8); assert.equal(typeof data.radioFocusDb, "number");
  assert.equal(r.wired.get("as-focus").read(), 8); assert.equal(r.G.soundOn, false);
  let applied = 0;
  r.GameAudio._stub = false;
  r.GameAudio.setRadioFocusDb = (v) => { applied = [0, 4, 8, 12].includes(v) ? v : 0; return applied; };
  r.GameAudio.getRadioFocusDb = () => applied;
  r.panel.init(); assert.equal(applied, 8); assert.equal(r.wired.get("as-focus").read(), 8);
  assert.equal(r.G.soundOn, false, "rehydration is not a sound-enable gesture");
  const reload = boot({ soundOn: false, musicEnabled: false, data: { radioFocusDb: data.radioFocusDb } });
  assert.equal(reload.wired.get("as-focus").read(), 8);
  reload.wired.get("as-focus").write("9"); assert.equal(reload.data.radioFocusDb, 0);
});
