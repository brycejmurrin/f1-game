/* steer-tuning-lock.test.mjs — shipped STEER LOCK slider mapping (notch 7 = NORMAL)
 * and TOUCH SENSITIVITY (notch 5 = the shipped 0.12 drag range). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/input/steer-tuning.js"), "utf8");

/** Same linear map as lockFromSlider in steer-tuning.js. */
function lockFromSlider(v) {
  return 0.18 + (0.435 - 0.18) * (v - 1) / 9;
}

test("lockFromSlider source: notch 7 is 0.35 rad (NORMAL / STANDARD steerLock)", () => {
  assert.match(SRC, /function lockFromSlider\(v\)\s*\{\s*return 0\.18 \+ \(0\.435 - 0\.18\) \* \(v - 1\) \/ 9; \}/);
  assert.ok(Math.abs(lockFromSlider(7) - 0.35) < 1e-9, `notch 7 = ${lockFromSlider(7)} rad`);
  assert.ok(Math.abs(lockFromSlider(5) - 0.293333) < 0.001, "notch 5 ~0.293");
  assert.ok(Math.abs(lockFromSlider(10) - 0.435) < 1e-9, "notch 10 = 0.435");
});

/** The REAL touchRangeFromSlider, cut out of the source (brace-balanced) and evaluated. */
function extractFn(name) {
  const at = SRC.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found in steer-tuning.js`);
  let depth = 0, i = SRC.indexOf("{", at);
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) break;
  }
  return new Function(`${SRC.slice(at, i + 1)}; return ${name};`)();
}

test("touchRangeFromSlider: notch 5 is input.js TOUCH_RANGE_FRAC 0.12, ends 0.24 / 0.06, monotonic", () => {
  const f = extractFn("touchRangeFromSlider");
  const inputSrc = fs.readFileSync(path.join(ROOT, "js/input/input.js"), "utf8");
  const shipped = Number(/const TOUCH_RANGE_FRAC = ([\d.]+);/.exec(inputSrc)?.[1]);
  assert.equal(shipped, 0.12, "input.js TOUCH_RANGE_FRAC");
  assert.ok(Math.abs(f(5) - shipped) < 1e-12, `notch 5 = ${f(5)}, want ${shipped} (the default must be a no-op)`);
  assert.ok(Math.abs(f(1) - 0.24) < 1e-12, `notch 1 = ${f(1)}`);
  assert.ok(Math.abs(f(10) - 0.06) < 1e-12, `notch 10 = ${f(10)}`);
  for (let v = 1; v < 10; v++) assert.ok(f(v + 1) < f(v), `not decreasing at notch ${v}: ${f(v)} -> ${f(v + 1)}`);
});
