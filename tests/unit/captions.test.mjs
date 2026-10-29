/* captions.test.mjs — spotter/announcer caption ring + speaker table (#1597).
 * Run: node --test tests/unit/captions.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/captions.js"), "utf8");

function memStore(init = {}) {
  const bag = { ...init };
  return {
    get(k, d) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : d; },
    set(k, v) { bag[k] = v; return true; },
  };
}

function loadCaptions(store, extra = {}) {
  const strip = {
    hidden: true,
    parts: { ".cap-who": { textContent: "" }, ".cap-text": { textContent: "" }, ".cap-side": { textContent: "", hidden: true } },
    querySelector(sel) { return this.parts[sel] || null; },
    setAttribute() {},
  };
  const doc = {
    documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {}, removeAttribute() {} },
    readyState: "complete",
    addEventListener() {},
    getElementById(id) {
      if (id === "captions") return strip;
      if (id === "ld-caption") {
        return {
          hidden: true,
          querySelector(sel) {
            if (sel === ".ld-caption-who") return { textContent: "" };
            if (sel === ".ld-caption-text") return { textContent: "" };
            return null;
          },
        };
      }
      return null;
    },
  };
  const ctx = {
    Math, Object, Array, Number, JSON, String, Date,
    GameStore: { store },
    AppearanceOpts: { textSize: () => "large" },
    RadioVoice: { SPEAKERS: { control: "control", coach: "coach", comm: "announcer", race: "radio" } },
    document: doc,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    SettingRow: undefined,
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return Object.assign({ __strip: strip }, ctx.Captions);   // Captions is frozen
}

test("source never names Tracks, curvature, or player.", () => {
  assert.equal(/Tracks/.test(SRC), false);
  assert.equal(/curvature/.test(SRC), false);
  assert.doesNotMatch(SRC, /\bplayer\./);
});

test("radioWho maps control/coach/comm and driver radio", () => {
  const C = loadCaptions(memStore());
  assert.equal(C.radioWho("control", null), "RACE CONTROL");
  assert.equal(C.radioWho("coach", null), "COACH");
  assert.equal(C.radioWho("comm", null), "COMMENTARY");
  const who = C.radioWho("race", { name: "Lewis Hamilton", code: "HAM", num: 44 });
  assert.equal(who, "HAMILTON · RADIO");
});

test("ring keeps the last N records", () => {
  const C = loadCaptions(memStore());
  for (let i = 0; i < C.RING_MAX + 4; i++) C.push({ who: "SPOTTER", text: "line " + i, kind: "spotter" });
  const r = C.ring();
  assert.equal(r.length, C.RING_MAX);
  assert.equal(r[0].text, "line 4");
  assert.equal(r[r.length - 1].text, "line " + (C.RING_MAX + 3));
});

test("settings keys round-trip through the store API", () => {
  const store = memStore();
  const C = loadCaptions(store);
  C.setMode("spoken");
  C.setSize("large");
  C.setPos("bottom");
  C.setBg(55);
  C.setSpeakerInk("off");
  assert.equal(store.get("captions"), "spoken");
  assert.equal(store.get("captionSize"), "large");
  assert.equal(store.get("captionPos"), "bottom");
  assert.equal(store.get("captionBg"), 55);
  assert.equal(store.get("captionSpeakerInk"), "off");
});

test("large caption scale fits phone-landscape width budget at 38ch", () => {
  const C = loadCaptions(memStore({ captionSize: "large", textSize: "larger" }));
  C.setSize("large");
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /max-width: min\(440px, calc\(var\(--caption-ch, 38\) \* 1ch \+ 4rem\)\)/);
  assert.equal(C.TEXT_CH_MAX, 38);
});

// #captions sits outside #hud: nothing else hid a spotter call, so the last one
// stayed on screen through the finish and over the menus.
test("spotter strip auto-hides after its hold, and each call re-arms the timer", () => {
  const timers = new Map();
  let next = 1;
  const C = loadCaptions(memStore(), {
    setTimeout: (fn, ms) => { timers.set(next, { fn, ms }); return next++; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  const strip = C.__strip;
  C.onSpotter("Car left", "car left");
  assert.equal(strip.hidden, false);
  assert.equal(timers.size, 1);
  C.onSpotter("Clear", "clear");
  assert.equal(timers.size, 1, "the previous hold is cleared, not stacked");
  const [{ fn, ms }] = [...timers.values()];
  assert.ok(ms >= 2000 && ms <= 3000, "hold is ~2.5 s");
  fn();
  assert.equal(strip.hidden, true, "the strip hides when its hold ends");
});

test("clear() hides the strip and drops a pending hold (race reset / quit to menu)", () => {
  const timers = new Map();
  let next = 1;
  const C = loadCaptions(memStore(), {
    setTimeout: (fn) => { timers.set(next, fn); return next++; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  C.onSpotter("Three wide", "three wide");
  assert.equal(C.__strip.hidden, false);
  C.clear();
  assert.equal(C.__strip.hidden, true);
  assert.equal(timers.size, 0);
});

test("GameHud.resetRace and the race-to-menu sweep both call Captions.clear", () => {
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const reset = hud.slice(hud.indexOf("function resetRace()"), hud.indexOf("function resetRace()") + 600);
  assert.match(reset, /Captions\.clear\(\)/);
  assert.match(symbolSource("function closeRaceSheets()"), /Captions\.clear\(\)/);
});
