// #6795 rows 4 and 6: two help lines say what the controls do (copy only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const para = (re) => (html.match(re) || [])[0] || "";

test("OVERALL SPEED help says PACE does not scale grip or braking", () => {
  const p = para(/<p id="pm-pace-help"[^>]*>[\s\S]*?<\/p>/);
  assert.match(p, /grip, braking or coast drag/);
  assert.match(p, /braking zones (get|grow) longer|braking zones lengthen/);
});

test("CAR WEIGHT help says a touch screen starts at 10", () => {
  const p = para(/<p class="adv-help">How heavy the car feels[\s\S]*?<\/p>/);
  assert.match(p, /5 is the standard car/);
  assert.match(p, /touch screen starts at 10 until you move the slider/);
});
