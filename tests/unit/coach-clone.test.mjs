// The coach's rewind clone must be JSON-faithful, or a rewind is silently wrong.
//
// WHY THIS EXISTS. DrivingCoach's practice rewind captured three fields per car
// with `JSON.parse(JSON.stringify(x))` — 20 cars at 2 Hz is 120 serialisations
// a minute whose only product is a copy, with a text representation built and
// reparsed in the middle. jsonClone() walks the value instead.
//
// The danger is not performance, it is SEMANTICS. restore() reads back exactly
// what capture() wrote, so any place the direct walk disagrees with the round
// trip it replaces is a rewind that puts the car into a state it was never in —
// and the disagreements are all in the corners: JSON.stringify writes `null`
// for NaN and Infinity, drops an undefined property from an object but writes
// `null` for one in an array, drops functions the same two ways, and lets a
// Date serialise through toJSON rather than copying its (empty) own
// properties.
//
// So this does not test jsonClone against a description of JSON. It tests it
// against JSON, on the real lifted source, over every shape that could differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/driving-coach.js"), "utf8");

/** Lift jsonClone out of the factory IIFE it lives in. It closes over nothing,
 *  which is what makes this the real function rather than a copy of it. */
function liftClone() {
  const start = SRC.indexOf("    function jsonClone(v) {");
  assert.notEqual(start, -1, "jsonClone moved — update this test, do not delete it");
  const end = SRC.indexOf("\n    function captureCar(c) {", start);
  assert.notEqual(end, -1, "captureCar no longer follows jsonClone — update this test");
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict";${SRC.slice(start, end)};return jsonClone;`)();
}
const jsonClone = liftClone();

const roundTrip = (v) => JSON.parse(JSON.stringify(v));

// The shapes the three DEEP fields actually carry (tyre / tyreLog / pitNext),
// then every corner where a direct walk could drift from JSON.
const CASES = [
  ["a tyre record", { code: "S", id: "soft", colour: "#e33", grip: 1.04, life: 0.62 }],
  ["a tyre log", [{ code: "M", id: "medium", colour: "#dd2", lap0: 0, lap1: 14 },
    { code: "S", id: "soft", colour: "#e33", lap0: 14, lap1: null }]],
  ["a null pitNext", null],
  ["nested objects and arrays", { a: { b: [1, 2, { c: "d" }] }, e: [] }],
  ["an empty object and array", { o: {}, a: [] }],
  ["booleans and empty strings", { t: true, f: false, s: "" }],
  ["zero and negative zero", { z: 0, nz: -0 }],
  ["NaN in an object", { g: NaN }],
  ["Infinity in an object", { g: Infinity, h: -Infinity }],
  ["NaN inside an array", [1, NaN, 3]],
  ["undefined property on an object", { a: 1, b: undefined }],
  ["undefined inside an array", [1, undefined, 3]],
  ["a function on an object", { a: 1, f: function () { return 1; } }],
  ["a function inside an array", [1, function () { return 1; }, 3]],
  ["a Date", { when: new Date(0) }],
  ["a deep mix", { l: [{ n: NaN, u: undefined, d: new Date(0) }, [Infinity]], k: "v" }],
];

for (const [name, value] of CASES) {
  test(`jsonClone matches the JSON round trip: ${name}`, () => {
    assert.deepEqual(jsonClone(value), roundTrip(value));
  });
}

test("jsonClone returns a copy, never the original", () => {
  // A rewind snapshot that aliased the live car would be overwritten by the
  // very driving it is meant to undo — the whole point of capturing.
  const src = { tyre: { code: "S", wear: [0.1, 0.2] } };
  const out = jsonClone(src);
  assert.deepEqual(out, src);
  assert.notEqual(out, src, "top level is the same object");
  assert.notEqual(out.tyre, src.tyre, "nested object is shared");
  assert.notEqual(out.tyre.wear, src.tyre.wear, "nested array is shared");
  src.tyre.wear[0] = 9;
  assert.equal(out.tyre.wear[0], 0.1, "mutating the source changed the copy");
});
