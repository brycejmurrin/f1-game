/* title-mode-grid-scale.test.mjs — #3305 title mode doors fit at UI scale 200%
   on phone landscape (compact-wide). Pins the em-floor + compact --tap-paint
   re-derive; menu-fit 844×390@200 is the live gate.
   Uses indexOf (not assert.match) so the assert.match ratchet stays flat. */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("compact-wide title mode bigbtns floor height with 2.75em (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  const playSel =
    '#overlay #menu-buttons :is(#menu-primary,#menu-explore,#menu-hero,#menu-retention,#menu-garage) .bigbtn';
  const playIdx = menus.indexOf(playSel);
  assert.ok(playIdx >= 0, "play/retention/garage doors share the compact-wide overlay selector");
  const playBlock = menus.slice(playIdx, playIdx + 280);
  assert.ok(
    playBlock.includes("min-height: max(32px, var(--tap-min), var(--tap-paint), 2.75em) !important"),
    "em floor tracks --ui-compact-text; !important beats destinations @layer responsive 40px",
  );
  assert.ok(playBlock.includes("height: auto"), "wrapped labels (TIME TRIAL) must still grow");

  const roomSel = "#overlay #menu-buttons #menu-secondary > .bigbtn";
  const roomIdx = menus.indexOf(roomSel);
  assert.ok(roomIdx >= 0, "rooms selector present");
  const roomBlock = menus.slice(roomIdx, roomIdx + 200);
  assert.ok(
    roomBlock.includes("min-height: max(32px, var(--tap-paint), 2.75em) !important"),
    "rooms (DATA HUB) get the same em floor",
  );
});

test("compact #menu-buttons re-derives --tap-paint against --ui-compact-scale (#3305)", () => {
  const menus = readCssSource("css/menus.css");
  const pin = "--tap-paint: max(24px, calc(var(--tap-paint-at) / var(--ui-compact-scale)))";
  const idx = menus.indexOf(pin);
  assert.ok(idx >= 0, "title column must match the sheet compact-zoom tap floor");
  // Must sit on the compact #menu-buttons zoom block, not on .sheet's --_sheet-z re-derive.
  const window = menus.slice(Math.max(0, idx - 420), idx);
  assert.ok(
    window.includes('body[data-density="compact"]) #menu-buttons') && window.includes("zoom: var(--ui-compact-scale)"),
    "pin lives on compact #menu-buttons (painted zoom), not elsewhere",
  );
});
