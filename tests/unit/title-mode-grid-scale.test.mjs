/* title-mode-grid-scale.test.mjs — #3305 title mode doors fit at UI scale 200%
   on phone landscape (compact-wide). Pins the em-floor + compact --tap-paint
   re-derive; menu-fit 844×390@200 is the live gate. */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("compact-wide title mode bigbtns floor + tap-paint re-derive (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  // All four CSS facts required in one regex (deploy tip has a single free site).
  assert.match(
    menus,
    /#overlay #menu-buttons :is\(#menu-primary,#menu-explore,#menu-hero\) \.bigbtn \{[^}]*min-height:\s*max\(var\(--tap-min\),\s*var\(--tap-paint\),\s*calc\(2\.75em\s*\*\s*clamp\([^;]*?\)\)[^}]*height:\s*auto[\s\S]*:is\(#menu-retention,#menu-garage\) \.bigbtn \{[^}]*min-height:\s*max\(var\(--tap\),\s*calc\(2\.75em[^;]*?\)[\s\S]*#overlay #menu-buttons #menu-secondary > \.bigbtn \{[^}]*min-height:\s*max\(var\(--tap-paint\),\s*calc\(2\.75em[^;]*?\)[\s\S]*body\[data-density="compact"\]\) #menu-buttons \{[^}]*--tap-paint:\s*max\(24px,\s*calc\(var\(--tap-paint-at\)\s*\/\s*var\(--ui-compact-scale\)\)\)/,
    "em floor ramped by --ui-compact-scale on every door group + default min-heights kept + compact --tap-paint re-derive (#3305)",
  );
});
