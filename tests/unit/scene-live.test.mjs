// scene-live.test.mjs — the garage LIVE atlas on a LAZY_CIRCUIT meta stub (10-F3).
//
// `Tracks.LIST` entries are meta stubs until a circuit hydrates; `fromRaw` installs a
// `points` getter on every one, and on a stub it THROWS ('has no path'). paintLive used to
// read it unguarded, so the throw aborted the whole atlas (flag, sign, banners, career
// footer) behind scene.js's catch, and ctxKey never changed when the circuit hydrated, so
// nothing repainted it. Runs the real modules in a node:vm — no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let resident = false;
const sandbox = {
  console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array, isFinite, parseFloat, parseInt, Date,
  Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  LiveryTex: {},
  Tracks: { circuitPayloadResident: () => resident },
};
const vctx = vm.createContext(sandbox);
for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                 "js/garage/scene-live.js", "js/garage/experience.js", "js/garage/scene.js"])
  vm.runInContext(read(f), vctx, { filename: f });
const GarageLive = vm.runInContext("GarageLive", vctx);
const GarageScene = vm.runInContext("GarageScene", vctx);

/** A canvas whose 2D context records fillText and swallows everything else. */
function fakeCanvas() {
  const texts = [], strokes = { n: 0 };
  const c2d = new Proxy({}, {
    get(t, k) {
      if (k === "fillText") return (s) => texts.push(String(s));
      if (k === "stroke") return () => { strokes.n++; };
      if (k === "createRadialGradient") return () => ({ addColorStop() {} });
      return k in t ? t[k] : () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { cv: { getContext: () => c2d }, texts, strokes };
}

const stub = () => {
  const e = { id: "spa", name: "Spa-Francorchamps", country: "Belgium", _metaOnly: true };
  Object.defineProperty(e, "points", { get() { throw new Error('Tracks: circuit "spa" has no path'); } });
  return e;
};
const TEAM = { id: "mclaren", name: "McLaren", short: "MCL", drivers: [{ name: "A", code: "AAA", num: 4 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

test("paintLive on an unhydrated stub paints the rest of the atlas instead of throwing", () => {
  const { cv, texts, strokes } = fakeCanvas();
  assert.doesNotThrow(() => GarageLive.paintLive(cv, TEAM, LIV, { track: stub(), weather: "dry" }), "stub .points threw out of paintLive");
  assert.ok(texts.some((t) => /SPA-FRANCORCHAMPS GP/.test(t)), "the next-race sign (after the map) never painted");
  assert.ok(texts.some((t) => /BELGIUM/.test(t)), "the footer never painted");
  assert.equal(strokes.n, 0, "a map was stroked for a circuit with no points");
});

test("paintLive still draws the map once the circuit has points", () => {
  const { cv, strokes } = fakeCanvas();
  const t = { id: "x", name: "X", country: "UK", points: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]] };
  GarageLive.paintLive(cv, TEAM, LIV, { track: t });
  assert.ok(strokes.n >= 2, "the track map was not drawn");
});

test("ctxKey changes when the circuit hydrates, so the live atlas repaints", () => {
  const t = stub();
  resident = false;
  const before = GarageScene.ctxKey({ track: t });
  resident = true;
  const after = GarageScene.ctxKey({ track: t });
  resident = false;
  assert.notEqual(before, after, "hydration did not re-key the room");
  assert.equal(GarageScene.ctxKey({ track: t }), before, "the key is not stable for an unchanged stub");
});
