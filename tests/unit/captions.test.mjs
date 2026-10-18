/* captions.test.mjs — spotter/announcer caption ring + speaker table (#1597).
 * Run: node --test tests/unit/captions.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

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
  const doc = {
    documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {}, removeAttribute() {} },
    readyState: "complete",
    addEventListener() {},
    getElementById(id) {
      if (id === "captions") {
        return {
          hidden: true,
          querySelector(sel) {
            if (sel === ".cap-who") return { textContent: "" };
            if (sel === ".cap-text") return { textContent: "" };
            if (sel === ".cap-side") return { textContent: "", hidden: true };
            return null;
          },
          setAttribute() {},
        };
      }
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
  return ctx.Captions;
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
