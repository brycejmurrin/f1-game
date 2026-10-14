/* ui-fit r7 — camera tuner rail-off portrait: place #ct-previews + shrink #ct-*.
   Pins #camtune-inner / #ct-* overrides in css/tuner.css (lighting untouched). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/tuner.css"), "utf8");
const rules = cssRules(css);

const COL = "#camtune-inner[data-density=\"compact\"][data-rail=\"off\"]";
const PREV = "#camtune-inner[data-rail=\"off\"] #ct-previews";
const PREV_BTN = "#camtune-inner[data-rail=\"off\"] #ct-previews > button";
const FOOT_BTN = "#camtune-inner[data-rail=\"off\"] > .sheet-foot button";
const CLOSE = "#camtune-inner[data-rail=\"off\"] > .sheet-foot #ct-close";

test("compact rail-off camera sheet is one minmax column (no AUTO preview column)", () => {
  assert.equal(decl(rules, COL, "grid-template-columns"), "minmax(0, 1fr)");
});

test("rail-off #ct-previews sit in explicit grid row 3 and can shrink", () => {
  assert.equal(decl(rules, PREV, "grid-row"), "3");
  assert.equal(decl(rules, PREV, "grid-column"), "1 / -1");
  assert.equal(decl(rules, PREV, "min-width"), "0");
  assert.equal(decl(rules, PREV, "flex-wrap"), "nowrap");
});

test("rail-off preview chips and #ct-close keep the --tap-paint floor", () => {
  assert.equal(decl(rules, PREV_BTN, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, PREV_BTN, "min-width"), "0");
  assert.equal(decl(rules, FOOT_BTN, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, CLOSE, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, CLOSE, "width"), "auto");
  assert.equal(decl(rules, CLOSE, "min-width"), "0");
});

test("camera preset chips and copy-all keep the --tap-paint floor", () => {
  assert.equal(decl(rules, "#camtune-inner [id^=\"ct-preset-\"]", "min-width"), "var(--tap-paint)");
  assert.equal(decl(rules, "#camtune-inner #ct-copy-all-btn", "min-height"), "var(--tap-paint)");
});

test("r7 overrides stay camera-only (no lighting-inner retarget in the block)", () => {
  const m = css.match(/UI Fit r7: camera tuner rail-off portrait[\s\S]*?\}\s*\/\* @layer components \*\//);
  assert.ok(m, "r7 block present before @layer components close");
  assert.doesNotMatch(m[0], /#lighting-inner/, "must not retarget lighting in the r7 carve");
  assert.doesNotMatch(m[0], /#lt-/, "must not retarget #lt-* lighting selectors");
  assert.match(m[0], /#ct-previews/);
  assert.match(m[0], /#ct-close/);
});
