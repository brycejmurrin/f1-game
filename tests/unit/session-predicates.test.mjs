/* SESSION PREDICATES (#7113 = gardener #6858 items 1 + 5). One night / wet
 * predicate (M4.isNight / M4.isWet, js/core/mat4.js) for every site that
 * spelled its own copy, and one 3-arg smoothstep edge form (M4.smoothEdge) for
 * lamp-bake.js.
 *
 * The behaviour tables below run on the shipped modules in a Node VM and held
 * on the base before the carve (FlybySeq.whenMatch, GarageExterior.lighting,
 * LampBake's cone): the carve changes no answer. The STORM case is pinned
 * explicitly: storm is wet everywhere EXCEPT the garage tyre trolley
 * (scene-equipment.js), which racks slicks in a storm — the one recorded
 * disagreement, left for Bryce (#7148). The source rows fail on the base: each
 * site must answer from the one home, with no inline spelling left.
 *
 * Run: node --test tests/unit/session-predicates.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const TODS = ["night", "default", "day", "dusk", "dawn", undefined];
const TRACKS = [null, {}, { night: false }, { night: true }, { night: 1 }];
const WEATHERS = ["dry", "overcast", "fog", "wet", "rain", "storm", undefined, ""];
// The reference truth: night is the session as LIT; wet is the wet family incl. storm.
const NIGHT = (tod, track) => tod === "night" || (tod === "default" && !!(track && track.night));
const WET = (w) => w === "wet" || w === "rain" || w === "storm";

function context(files) {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, Map, Set, WeakMap, Float32Array, Uint32Array, Uint16Array,
    isFinite, Promise, Date, setTimeout: () => 0, performance: { now: () => 0 }, Log: { info() {}, warn() {} },
  });
  for (const f of ["js/core/mat4.js", ...files]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  return ctx;
}

test("FlybySeq.whenMatch: the night x wet truth table over tod x track.night x weather (storm is wet)", () => {
  const F = vm.runInContext("FlybySeq", context(["js/camera/flyby-clear.js", "js/camera/flyby-seq.js"]));
  for (const tod of TODS) for (const track of TRACKS) for (const weather of WEATHERS) {
    const info = { tod, track, weather };
    const k = JSON.stringify(info);
    assert.equal(F.whenMatch({ night: true }, info), NIGHT(tod, track), "night " + k);
    assert.equal(F.whenMatch({ wet: true }, info), WET(weather), "wet " + k);
    assert.equal(F.whenMatch({ night: false, wet: false }, info), !NIGHT(tod, track) && !WET(weather), "dry day " + k);
  }
  // `def` stands in for `track` (the loading card's info shape).
  assert.equal(F.whenMatch({ night: true }, { tod: "default", def: { night: true } }), true);
});

test("GarageExterior.lighting: night and wet answer the same table (storm wet, s.night or def.night)", () => {
  const X = vm.runInContext("GarageExterior", context(["js/garage/exterior-geometry.js", "js/garage/exterior.js"]));
  for (const tod of TODS) for (const def of TRACKS) for (const weather of WEATHERS) {
    const L = X.lighting({ tod, weather, def });
    const k = JSON.stringify({ tod, def, weather });
    assert.equal(L.night, NIGHT(tod || "default", def), "night " + k);
    assert.equal(L.wet, WET(weather || "dry"), "wet " + k);
  }
  assert.equal(X.lighting({ tod: "default", night: true, def: { night: false } }).night, true, "a selection's own night flag counts");
});

test("M4.isNight / M4.isWet are the reference table", () => {
  const ctx = context([]);
  const M4 = vm.runInContext("M4", ctx);
  for (const tod of TODS) for (const track of TRACKS) assert.equal(M4.isNight(tod, track), NIGHT(tod, track), tod + " " + JSON.stringify(track));
  for (const w of WEATHERS) assert.equal(M4.isWet(w), WET(w), String(w));
  assert.equal(M4.isWet("storm"), true, "STORM is wet");
  assert.equal(M4.isNight("dusk", { night: true }), false, "dusk on a night circuit is not night (narrow predicate)");
});

// A spy on the ONE home (M4 is frozen, so the sandbox gets a copy as its M4):
// the site answers through it (it is called) and its answer is the site's answer.
function spiedContext(files) {
  const real = vm.runInContext("M4", context([])), calls = { isNight: 0, isWet: 0, smoothEdge: 0 };
  const M4 = Object.assign({}, real);
  for (const k of Object.keys(calls)) M4[k] = (...a) => { calls[k]++; return real[k](...a); };
  const ctx = vm.createContext({ M4, Math, JSON, Object, Array, Number, String, Map, Set, WeakMap, Float32Array, Uint32Array,
    Uint16Array, isFinite, Promise, Date, setTimeout: () => 0, performance: { now: () => 0 }, Log: { info() {}, warn() {} } });
  for (const f of files) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  return { ctx, calls };
}

test("FlybySeq and GarageExterior answer through M4.isNight / M4.isWet; the dead FlybySeq exports are gone", () => {
  const { ctx: fctx, calls: fc } = spiedContext(["js/camera/flyby-clear.js", "js/camera/flyby-seq.js"]);
  const F = vm.runInContext("FlybySeq", fctx);
  F.whenMatch({ night: true, wet: true }, { tod: "night", weather: "storm" });
  assert.deepEqual([fc.isNight, fc.isWet], [1, 1]);
  // FlybySeq.isNight / isWet had no consumer (lsp refs): not exported any more.
  assert.deepEqual([F.isNight, F.isWet], [undefined, undefined]);
  const { ctx: xctx, calls: xc } = spiedContext(["js/garage/exterior-geometry.js", "js/garage/exterior.js"]);
  vm.runInContext("GarageExterior", xctx).lighting({ tod: "default", weather: "rain", def: { night: true } });
  assert.deepEqual([xc.isNight >= 1, xc.isWet >= 1], [true, true]);
});

test("garage tyre trolley: STORM racks slicks (recorded disagreement, pinned until Bryce calls it)", () => {
  const E = read("js/garage/scene-equipment.js");
  const line = E.match(/const wet = ([^\n]+);\n/)[1];
  const M4 = vm.runInContext("M4", context([]));
  const wet = vm.compileFunction("return " + line, ["M4", "ctx"]);
  const got = Object.fromEntries(WEATHERS.map((w) => [String(w), wet(M4, { weather: w })]));
  assert.deepEqual(got, { dry: false, overcast: false, fog: false, wet: true, rain: true, storm: false, undefined: false, "": false });
  assert.equal(wet(M4, null), false);
});

test("M4.smoothEdge: GLSL smoothstep with a pinned zero-width edge (e0 == e1 steps at e1, never NaN)", () => {
  const M4 = vm.runInContext("M4", context([]));
  const S = M4.smoothEdge;
  // Normal edge: the Hermite ease on the clamped ramp.
  assert.equal(S(0, 1, -1), 0);
  assert.equal(S(0, 1, 0.5), 0.5);
  assert.equal(S(0, 1, 2), 1);
  assert.ok(Math.abs(S(0.2, 0.6, 0.3) - (0.25 * 0.25 * (3 - 0.5))) < 1e-12);
  // Reversed edge (e0 > e1, a cone with cosOuter > cosInner) ramps the other way, as GLSL does on desktop.
  assert.equal(S(1, 0, 0.25), S(0, 1, 0.75));
  // The zero-width edge table.
  const EDGE = [[0.9, 0.9, 0.8999, 0], [0.9, 0.9, 0.9, 1], [0.9, 0.9, 0.95, 1], [0, 0, -1e-9, 0], [0, 0, 0, 1], [1, 1, 1, 1], [1, 1, 0.5, 0]];
  for (const [e0, e1, x, want] of EDGE) assert.equal(S(e0, e1, x), want, `smoothEdge(${e0}, ${e1}, ${x})`);
  for (const [e0, e1, x] of EDGE) assert.ok(Number.isFinite(S(e0, e1, x)));
});

test("LampBake bakes its cone through M4.smoothEdge: a zero-width cone (cosOuter == cosInner) bakes finite", () => {
  const { ctx, calls } = spiedContext(["js/lighting/lamp-bake.js"]);
  const LB = vm.runInContext("LampBake", ctx);
  // One lamp 9 m up aimed straight down (lamp-bake.test.mjs LAMP_A) with both cone cosines at 0.7.
  const b = LB.bake([0, 9, 0, 40, 32, 20, 24, 0, -1, 0, 0.7, 0.7, 0.12, 0.5, 1], () => 0, 4.0);
  assert.ok(b && b.tiles > 0, "a bake");
  assert.ok(calls.smoothEdge > 0, "the cone term went through M4.smoothEdge");
  let nonFinite = 0;
  for (let i = 0; i < b.data.length; i++) if ((b.data[i] & 0x7c00) === 0x7c00) nonFinite++;   // half Inf / NaN
  assert.equal(nonFinite, 0, "no NaN / Inf texel from the zero-width edge");
});
