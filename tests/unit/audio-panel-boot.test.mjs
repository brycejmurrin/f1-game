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
import { seedStore } from "../helpers/seed-store.mjs";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

function boot({ soundOn, musicEnabled, raceRadio, data = {} }) {
  const dom = makeDom();
  const calls = [];
  const spied = { setMusicEnabled: (b) => calls.push("setMusicEnabled:" + b), startMusic: () => calls.push("startMusic"),
                  setEnabled: (b) => calls.push("setEnabled:" + b) };
  const GameAudio = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : spied[k]) || ((v) => (typeof v === "number" ? v : undefined)),
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
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx); seedDom(ctx);
  vm.runInContext(read("js/audio/panel.js").replace(/^const\b/gm, "var") + "; globalThis.__audioPanel = AudioPanel;", ctx, { filename: "js/audio/panel.js" });
  const panel = ctx.__audioPanel.create(G);
  calls.length = 0;
  panel.init();
  return { calls, wired, data };
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


for (const readyState of ["loading", "interactive", "complete"]) {
  test(`lazy music controls initialize once with document ${readyState}`, async () => {
    const listeners = new Map(), elements = new Map();
    const inits = [];
    let picks = 0, requests = 0;
    for (const id of ["as-add", "as-file", "as-sp-save", "as-sp-id"]) {
      elements.set(id, { value: "", bindings: 0, click() { picks++; },
        addEventListener(type, fn) { this.bindings++; this[type] = fn; } });
    }
    const document = {
      readyState,
      getElementById: id => elements.get(id) || null,
      addEventListener(type, fn, opts) {
        const list = listeners.get(type) || [];
        list.push({ fn, once: opts?.once }); listeners.set(type, list);
      },
    };
    const emit = type => {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter(item => !item.once));
      for (const { fn } of list) fn();
    };
    const context = vm.createContext({ document,
      location: { origin: "https://game.test", pathname: "/", hostname: "game.test", search: "" },
      localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null },
      fetch() { requests++; throw new Error("initialization must not contact Spotify"); },
      setTimeout, clearTimeout, URL, URLSearchParams,
    });
    context.window = context;
    seedLog(context); seedStore(context);
    context.Log.info = (...args) => inits.push(args.join(" "));
    vm.runInContext(read("js/audio/music-lib.js"), context);
    vm.runInContext(read("js/audio/spotify.js"), context);
    const add = elements.get("as-add"), file = elements.get("as-file");
    const save = elements.get("as-sp-save");
    if (readyState === "loading") {
      assert.equal(add.onclick, undefined, "wait while DOM is being parsed");
      assert.equal(save.bindings, 0);
      document.readyState = "interactive";
      emit("DOMContentLoaded");
    }
    await context.MusicLib.init();
    assert.equal(typeof add.onclick, "function", "ADD is bound before window.load");
    assert.equal(typeof file.onchange, "function", "file selection is bound before window.load");
    assert.equal(save.bindings, 1, "Spotify settings bind without an account");
    const firstAdd = add.onclick, firstChange = file.onchange;
    add.onclick();
    assert.equal(picks, 1, "ADD opens the file picker");
    await context.MusicLib.init();
    context.SpotifyMusic.openPanel(); context.SpotifyMusic.openPanel();
    document.readyState = "complete";
    emit("load"); emit("DOMContentLoaded");
    await context.MusicLib.init();
    assert.equal(add.onclick, firstAdd);
    assert.equal(file.onchange, firstChange);
    assert.equal(save.bindings, 1, "later load/settings opens do not duplicate listeners");
    assert.equal(inits.filter(line => line.includes("SpotifyMusic.init")).length, 1);
    assert.equal(requests, 0);
  });
}
