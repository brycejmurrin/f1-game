/* steer-tuning-lock.test.mjs — shipped STEER LOCK slider mapping (notch 7 = NORMAL). */
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
