/* The TEAM tile crest bitmap follows devicePixelRatio (.tm-colour is a 32 CSS px box; was a fixed 48 px canvas).
 * It was a fixed 48×48 bitmap: on a DPR-3 phone the box is ~99 device px, so the crest drew at 0.49
 * texels per device pixel (measured live at 852×393 DPR 3, docs/notes/PIXEL-TRUTH-HUNT-2026-11-09.md F4).
 * The bitmap must follow devicePixelRatio, stay bounded, and keep the desktop DPR-1 size.
 * Run: node --test tests/unit/team-swatch-density.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const src = fs.readFileSync(absSrc("js/ui/select-screen.js"), "utf8");
const css = fs.readFileSync(absSrc("css/select.css"), "utf8");

function swatchPx() {
  const m = src.match(/function swatchPx\(dpr\) \{[\s\S]*?\n\}/);
  assert.ok(m, "select-screen.js defines swatchPx(dpr)");
  return vm.runInNewContext("(" + m[0] + ")", {}, { filename: absSrc("js/ui/select-screen.js") });
}

test("the crest bitmap covers its 32 CSS px box at the device's pixel ratio", () => {
  const box = +(css.match(/\.tm-colour \{[^}]*width: (\d+)px/) || [])[1];
  assert.equal(box, 32, "the box swatchPx is sized for");
  const px = swatchPx();
  for (const dpr of [1, 1.5, 2, 3]) {
    assert.ok(px(dpr) >= box * dpr, `dpr ${dpr}: ${px(dpr)} px must cover ${box * dpr} device px`);
  }
  assert.equal(px(3), 128, "a DPR-3 phone (was 48: 0.49 of the box's device pixels)");
  assert.equal(px(1), 48, "DPR 1 keeps the shipped bitmap");
});

test("the bitmap is bounded and survives a missing or bad devicePixelRatio", () => {
  const px = swatchPx();
  assert.equal(px(8), 128);
  for (const bad of [undefined, 0, NaN, -2, "x"]) assert.equal(px(bad), 48);
});

test("teamSwatch sizes its canvas through swatchPx, not a literal", () => {
  const body = src.slice(src.indexOf("function teamSwatch(t)"), src.indexOf("function setTeamPicker"));
  assert.match(body, /c\.width = c\.height = swatchPx\(/);
  assert.doesNotMatch(body, /c\.width = \d+/);
});
