/* title-mode-grid-scale.test.mjs — #3305 title mode doors fit at UI scale 200%
   on phone landscape (compact-wide). Pins the em-floor + compact --tap-paint
   re-derive; menu-fit 844×390@200 is the live gate. */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("compact-wide title mode bigbtns floor height with 2.75em (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /#overlay #menu-buttons :is\(#menu-primary,#menu-explore,#menu-hero,#menu-retention,#menu-garage\) \.bigbtn \{[^}]*min-height:\s*max\(32px,\s*var\(--tap-min\),\s*var\(--tap-paint\),\s*2\.75em\)\s*!important/,
    "em floor tracks --ui-compact-text; !important beats destinations @layer responsive 40px",
  );
  assert.match(
    menus,
    /#overlay #menu-buttons #menu-secondary > \.bigbtn \{[^}]*min-height:\s*max\(32px,\s*var\(--tap-paint\),\s*2\.75em\)\s*!important/,
    "rooms (DATA HUB) get the same em floor",
  );
  assert.match(
    menus,
    /#overlay #menu-buttons :is\(#menu-primary,#menu-explore,#menu-hero,#menu-retention,#menu-garage\) \.bigbtn \{[^}]*height:\s*auto/,
    "wrapped labels (TIME TRIAL) must still grow",
  );
});

test("compact #menu-buttons re-derives --tap-paint against --ui-compact-scale (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /body\[data-density="compact"\]\) #menu-buttons \{[^}]*--tap-paint:\s*max\(24px,\s*calc\(var\(--tap-paint-at\)\s*\/\s*var\(--ui-compact-scale\)\)\)/,
    "title column must match the sheet compact-zoom tap floor",
  );
});
