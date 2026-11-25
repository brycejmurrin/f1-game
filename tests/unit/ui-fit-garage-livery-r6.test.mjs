/* ui-fit round 6 — Garage LIVERY grid tap floor + finish tags.
   Pins #cs-options.cs-liv-grid overrides in css/carsetup.css only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
const rules = cssRules(css);
const GRID = "#cs-options.cs-liv-grid";
const CHIP = "#cs-options.cs-liv-grid .cs-liv-edit";
const TAG = "#cs-options.cs-liv-grid .cs-opt-tag";
const SWATCH = "#cs-options.cs-liv-grid .cs-liv-row .cs-liv-swatch";

test("LIVERY grid columns floor at 2× --tap (room for both chips + CHROME)", () => {
  assert.equal(
    decl(rules, `${GRID}, ${GRID} > details > div`, "grid-template-columns"),
    "repeat(auto-fill, minmax(min(max(72px, calc(var(--tap) * 2)), 100%), 1fr))",
  );
});

test("LIVERY grid edit chips lift the hit box to --tap / --tap-paint", () => {
  assert.equal(decl(rules, CHIP, "box-sizing"), "content-box");
  assert.equal(decl(rules, CHIP, "width"), "var(--tap-min)");
  assert.equal(decl(rules, CHIP, "height"), "var(--tap-min)");
  assert.equal(
    decl(rules, CHIP, "padding"),
    "calc((max(var(--tap), var(--tap-paint)) - var(--tap-min)) / 2)",
    "padding is the hit slop: content stays --tap-min, border-box meets --tap",
  );
  assert.equal(decl(rules, CHIP, "background-clip"), "content-box");
});

test("LIVERY grid finish tags do not ellipsis SATIN/CHROME", () => {
  assert.equal(decl(rules, TAG, "text-overflow"), "clip");
  assert.equal(decl(rules, TAG, "overflow"), "visible");
  assert.equal(decl(rules, TAG, "max-width"), "none");
  assert.equal(decl(rules, TAG, "white-space"), "nowrap");
  assert.equal(decl(rules, SWATCH, "width"), "100%");
  assert.equal(
    decl(rules, "#cs-options.cs-liv-grid .cs-liv-swatch", "width"),
    null,
    "CREATE row swatch must not inherit width:100%",
  );
});

test("r6 carve stays Garage LIVERY grid (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Garage LIVERY tap floor[\s\S]*?\n#cs-options\.cs-liv-grid \.cs-liv-edit \{/);
  assert.ok(m, "r6 LIVERY block present through the chip position rule");
  assert.doesNotMatch(m[0], /#hud|#lighting|#camtune|#ps-|tokens\.css|touch-controls|tuner\.css|menus\.css/,
    "must not retarget HUD / tuner / Photo Studio / other sheets");
  assert.match(m[0], /#cs-options\.cs-liv-grid/);
});

// UI-MATRIX 2026-11-25 row 1: the 112 factory cards live in
// details.cs-liv-factory > div, one level below #cs-options. A child combinator
// (`> .cs-liv-row`) missed them all, so their ⧉ chips had no positioned
// ancestor and stacked at one point of the sheet.
test("LIVERY card rules reach the factory fold (descendant, never child)", () => {
  assert.deepEqual(rules.map(r => r.selector).filter(sel => /\.cs-liv-grid\s*>\s*\.cs-liv-row/.test(sel)), [],
    "a child combinator misses the factory fold's cards");
  assert.equal(decl(rules, `${GRID} .cs-liv-row`, "position"), "relative",
    "every card (fold included) anchors its absolute chips");
  const FOLD = `${GRID} > details`;
  assert.equal(decl(rules, FOLD, "grid-column"), "1 / -1", "the fold spans the grid");
  assert.equal(decl(rules, `${GRID}, ${FOLD} > div`, "display"), "grid",
    "the fold's inner div IS the top-level grid rule (same columns)");
});

test("custom cards carry no delete chip beside ✎ (DELETE lives in the editor)", () => {
  assert.deepEqual(rules.map(r => r.selector).filter(sel => sel.includes(".cs-liv-grid") && sel.includes(".cs-liv-del")), [],
    "no grid card rule styles a delete chip");
  assert.equal(decl(rules, ".cs-liv-del.armed", "background"), "var(--armed-fill)");
});
