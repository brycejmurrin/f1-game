// TLX's material cache key must be memoised WITHOUT ever going stale.
//
// WHY THIS EXISTS. matCache.get(key) needs the key string to exist before the
// lookup, so tlx.js built it on every materialFor() call — about fifteen
// intermediate strings, at 150-400 draws a frame. Every caller passes a
// long-lived scratch object it mutates in place, so the same object arrives
// frame after frame usually carrying identical values and producing an
// identical string. The memo skips the rebuild behind a field-by-field
// compare.
//
// The failure mode that memo introduces is the dangerous one in this file: a
// STALE key returns the wrong material, and the wrong material is a visible
// defect (a matte car, a car-paint road, an alpha-written decal) that no
// counter would flag. A compare that misses one field is silent until someone
// looks at the screen.
//
// So this fuzzes the real source. It lifts buildMatKey and matKeyFor straight
// out of js/render/three/tlx.js and evaluates them, then asserts the invariant
// that matters — the memoised key is ALWAYS the key a fresh build would
// produce — across every single-field mutation of every field the builder
// reads, on the same object identity, which is the only path on which a memo
// can go stale.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

/** Lift the memo pair out of the IIFE they live in. They close over nothing
 *  else, which is what makes this legitimate rather than a re-implementation —
 *  a re-implementation would test the test. */
function liftMemo() {
  const start = SRC.indexOf("const _matKeyMemo = new WeakMap();");
  assert.notEqual(start, -1, "the memo declaration moved — update this test, do not delete it");
  const marker = "\n      function materialFor(opts, chunked, instanced) {";
  const end = SRC.indexOf(marker, start);
  assert.notEqual(end, -1, "materialFor no longer follows the memo — update this test");
  const body = SRC.slice(start, end);
  assert.match(body, /function buildMatKey\(/, "buildMatKey is not in the lifted range");
  assert.match(body, /function matKeyFor\(/, "matKeyFor is not in the lifted range");
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict";${body};return { buildMatKey, matKeyFor };`)();
}

const { buildMatKey, matKeyFor } = liftMemo();

// Every field the builder reads, with a value that is NOT its default — so a
// compare that forgot this field returns the previous key and this test fails.
const FIELDS = [
  ["emissive", 0.5], ["alpha", 0.25], ["roughness", 0.31], ["metalness", 0.77],
  ["specular", 0.11], ["detail", 3], ["clearcoat", 0.9], ["carPaint", 1],
  ["sparkle", 0.2], ["doubleSided", true], ["noAlphaWrite", true],
  ["noDepthTest", true], ["depthBias", [2, 3]],
];

test("the memo never returns a key a fresh build would not", () => {
  // ONE object identity throughout: a fresh object gets a fresh memo, so only
  // mutation in place can expose a stale compare — and mutation in place is
  // exactly how every caller uses these.
  const o = {};
  for (const [chunked, instanced] of [[false, false], [true, false], [false, true]]) {
    assert.equal(matKeyFor(o, chunked, instanced), buildMatKey(o, chunked, instanced));
    for (const [field, value] of FIELDS) {
      o[field] = value;
      assert.equal(matKeyFor(o, chunked, instanced), buildMatKey(o, chunked, instanced),
        `setting ${field} did not invalidate the memo`);
      delete o[field];
      assert.equal(matKeyFor(o, chunked, instanced), buildMatKey(o, chunked, instanced),
        `clearing ${field} did not invalidate the memo`);
    }
  }
});

test("depthBias is compared by VALUE — the array is mutated in place too", () => {
  // The one field that is an object. Comparing the array by identity would
  // hold a key across a caller writing new numbers into the same array, which
  // is how a scratch object carries a depth bias.
  const db = [1, 1];
  const o = { depthBias: db };
  assert.equal(matKeyFor(o, false, false), buildMatKey(o, false, false));
  db[0] = 4;
  assert.equal(matKeyFor(o, false, false), buildMatKey(o, false, false), "depthBias[0] change missed");
  db[1] = 9;
  assert.equal(matKeyFor(o, false, false), buildMatKey(o, false, false), "depthBias[1] change missed");
});

test("the chunked and instanced flags are part of the compare, not just the key", () => {
  // The same opts object is passed with different flags by draw() and
  // drawChunked() in the SAME frame. A memo keyed on the object alone would
  // hand the chunked draw the unchunked material.
  const o = { roughness: 0.4 };
  const plain = matKeyFor(o, false, false);
  const chunk = matKeyFor(o, true, false);
  const inst = matKeyFor(o, false, true);
  assert.notEqual(plain, chunk);
  assert.notEqual(plain, inst);
  assert.equal(plain, buildMatKey(o, false, false));
  assert.equal(chunk, buildMatKey(o, true, false));
  assert.equal(inst, buildMatKey(o, false, true));
  // ...and back again, which is the case an alternating memo would get wrong.
  assert.equal(matKeyFor(o, false, false), plain);
});

test("a repeated call on unchanged input returns the SAME string instance", () => {
  // The point of the memo, stated as a test: no rebuild means no new string.
  // Object.is on the instance is the only way to see that from outside — an
  // equal-but-fresh string would pass every assertion above and allocate
  // exactly as much as before.
  const o = { roughness: 0.4, emissive: 0.2 };
  const a = matKeyFor(o, false, false);
  assert.ok(Object.is(a, matKeyFor(o, false, false)), "the key was rebuilt for identical input");
});
