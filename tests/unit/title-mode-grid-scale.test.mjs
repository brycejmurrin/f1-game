/* title-mode-grid-scale.test.mjs — #3305 title mode doors fit at UI scale 200%
   on phone landscape (compact-wide). Pins the em-floor + compact --tap-paint
   re-derive; menu-fit 844×390@200 is the live gate. */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("compact-wide title mode bigbtns floor + tap-paint re-derive (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  const emRamp =
    "calc(40px + (2.75em - 40px) * clamp(0, (var(--ui-compact-text, 1) - 1.001) * 999, 1)";
  assert.ok(
    menus.includes("@media (max-height: 460px)"),
    "scoped em ramp lives in the short-viewport band (#3305)",
  );
  assert.ok(
    menus.includes(
      "#overlay #menu-buttons :is(#menu-primary,#menu-explore,#menu-hero,#menu-retention,#menu-garage) .bigbtn",
    ) && menus.includes(emRamp),
    "compact-wide room doors use the em ramp (#3305)",
  );
  assert.ok(
    menus.includes(
      "--tap-paint: max(24px, calc(var(--tap-paint-at) / var(--ui-compact-scale))); /* #3305 */",
    ),
    "compact #menu-buttons re-derives --tap-paint (#3305)",
  );
});
