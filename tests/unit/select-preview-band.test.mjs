/* select-preview-band.test.mjs — the circuit picker's outline sits in the band
 * the caption and the numbers leave free, centred, never under either (#5656).
 *
 * Bryce's iPhone (UI SIZE 70, 852x393 touch): the compact card's map button
 * kept `align-items: flex-start` from the old caption-at-the-bottom layout, so
 * the outline hugged the still's top edge under the flag + name while the
 * space above the TURNS / CIRCUIT LENGTH row stayed empty (measured locally:
 * outline 120.9 → 238.5, free band 146.1 → 271.6, 29 px high, every circuit).
 * Menus.previewMapBand (js/ui/select-screen.js) is the pure maths; the button
 * is padded by its result and centres the canvas. The geometry below is the
 * measured local layout (rounded to whole px).
 * Run: node --test tests/unit/select-preview-band.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "js/ui/select-screen.js"), "utf8");
const Menus = vm.runInContext(src + "\n;Menus", vm.createContext({ Object, Set, Array, Math }), { filename: absSrc("js/ui/select-screen.js") });
const band = (box, over, m) => ({ ...Menus.previewMapBand(box, over, m) });
const R = (top, bottom, left, right) => ({ top, bottom, left, right });

test("phone card: the band runs from the caption's bottom to the numbers band's top", () => {
  const still = R(115, 321, 18, 834);
  const cap = R(121, 146, 28, 824);
  const info = R(272, 321, 18, 834);
  const facts = R(0, 0, 0, 0); // display: none on the compact card
  assert.deepEqual(band(still, [cap, facts, info], 5), { top: 36, bottom: 54 });
  // The content box is 146+5 → 272-5 (121 px), centred on 209: the free band's own middle.
  assert.deepEqual(band(still, [cap, facts, info], 0), { top: 31, bottom: 49 });
});

test("desktop: the numbers sit beside the still (ignored), the badges are an overlay below", () => {
  const still = R(265, 596, 153, 724);
  const cap = R(282, 339, 176, 701);
  const info = R(265, 596, 736, 1117); // the column to the right, not over the still
  const facts = R(552, 580, 176, 317); // street-circuit badges, bottom-left
  assert.deepEqual(band(still, [cap, facts, info], 8), { top: 82, bottom: 52 });
  assert.deepEqual(band(still, [cap, R(580, 580, 176, 176), info], 8), { top: 82, bottom: 8 }, "an empty badge row is ignored");
});

test("portrait: the numbers below the still are outside it, the caption bottom-left is an overlay below", () => {
  const still = R(281, 471, 28, 365);
  const capBottom = R(430, 460, 45, 348);
  const info = R(480, 744, 28, 365);
  assert.deepEqual(band(still, [capBottom, info], 0), { top: 0, bottom: 41 });
});

test("a short room: the numbers chip moves up beside the caption, so both push the top down", () => {
  const still = R(100, 200, 0, 800);
  const cap = R(105, 125, 10, 600);
  const chip = R(104, 132, 650, 790);
  assert.deepEqual(band(still, [cap, chip], 2), { top: 34, bottom: 2 });
});

test("no overlays, a missing list and a negative margin leave the whole still", () => {
  const still = R(0, 100, 0, 200);
  assert.deepEqual(band(still, [], 0), { top: 0, bottom: 0 });
  assert.deepEqual(band(still, undefined, -4), { top: 0, bottom: 0 });
  assert.deepEqual(band(still, [null, R(120, 140, 0, 200)], 3), { top: 3, bottom: 3 }, "an overlay outside the still is ignored");
});
