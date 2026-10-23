/* #3307 — Settings APPEARANCE SettingRow steppers soft taps at UI scale 75%.
   Pins css/appearance-studio.css (#pm-panel-appearance .set-row button[data-step]
   → --tap-paint). Uses cssRules/decl only (source-pin ratchet stays flat). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/appearance-studio.css"), "utf8");
const rules = cssRules(css);
const STEPPER = "#pm-panel-appearance .set-row button[data-step]";
const COARSE = /@media \(pointer:\s*coarse\)/;

test("Appearance SettingRow steppers floor at --tap-paint on coarse pointer", () => {
  assert.equal(
    decl(rules, STEPPER, "min-height", { context: COARSE }),
    "var(--tap-paint)",
    "#pm-uitheme-prev/next and sibling data-step steppers must paint at --tap-paint, not --tap",
  );
  assert.equal(
    decl(rules, STEPPER, "min-width", { context: COARSE }),
    "var(--tap-paint)",
    "layout-audit soft-flags either axis under the house tap floor",
  );
});

test("compact density keeps the same --tap-paint stepper floor", () => {
  assert.equal(decl(rules, `body[data-density="compact"] ${STEPPER}`, "min-height"), "var(--tap-paint)");
  assert.equal(decl(rules, `body[data-density="compact"] ${STEPPER}`, "min-width"), "var(--tap-paint)");
});

test("stepper carve stays Appearance panel set-row data-step (no foreign selectors)", () => {
  const coarse = ruleFor(rules, STEPPER, "min-height", { context: COARSE });
  assert.ok(coarse, "coarse-pointer stepper rule present");
  assert.equal(coarse.decls.get("min-height"), "var(--tap-paint)");
  assert.ok(
    !/lighting|camtune|#ps-|#hud|#cs-|photo-studio/.test(coarse.selector),
    "must not retarget tuner / Photo Studio / HUD / garage selectors",
  );
  const compact = ruleFor(rules, `body[data-density="compact"] ${STEPPER}`, "min-height");
  assert.ok(compact, "compact-density stepper rule present");
});
