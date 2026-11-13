// @ts-check
// BRYCE'S PHONE — what the owner's eye and thumb actually get (issue #5262).
//
// Every other fit check in the suite measures an element's OWN px: `tap-floor.mjs` divides rects by the CSS zoom and
// `fit-audit.mjs` reads the computed font size. At his stored UI SIZE (61 %) a "14 px" label paints 8.5 px and a
// "48 px" button paints 29 px, and nothing said so. This spec boots the game the way his phone does — his window
// (Home Screen app 852x393 with env() insets 59/21/59, the Safari tab 852x368 measured on the device, and the 844x390
// cell older reports used), his live settings export — and judges the PAINTED result on title, select, garage,
// settings, the race HUD, pause and results, at UI SIZE 50 (the phone floor since #5452), 70 (his stored value) and
// 109 (the touch default):
//
//   text paints >= 12 px · tap targets paint >= 44 px and own their centre · nothing crosses the safe box · no page scroll
//
// The product is RED on these floors today, by measurement. Decision #5235 (a phone stops at 70 %) landed with #5384,
// which took the count on his three windows from 350 at 61 % to 114 at 70 %; #5452 lowered the floor to 50 (Bryce's
// choice: the player may zoom out further), and the 50 cells record what that size paints.
// So each cell asserts the EXACT number of violations recorded in tests/data/bryce-phone-paint.json:
// one more is a regression, one fewer is a stale ceiling (lower it: `node tools/ui/bryce-paint.mjs --write`). The
// numbers only go down. Do not skip a cell and do not raise a number to get green.
//
// The measure is tools/lib/paint-floor.mjs; the flow is `measureCell` in tools/ui/bryce-paint.mjs, the same function
// the CLI that recorded the ceilings runs. Imported from @playwright/test, not the shared fixtures: this spec owns its
// context (the preset's viewport, insets and storage), and the fixtures' page would boot a second game.
import { test, expect } from "@playwright/test";
import { BRYCE_WINDOWS, UI_SIZE_AXIS } from "../../tools/lib/bryce-phone.mjs";
import { ACCEPT_SCREENS, cellKey, judgeCells, measureCell, readCeilings } from "../../tools/ui/bryce-paint.mjs";
import { paintLine } from "../../tools/lib/paint-floor.mjs";

const CEILINGS = readCeilings();

for (const window of Object.keys(BRYCE_WINDOWS)) {
  for (const uiScale of UI_SIZE_AXIS) {
    const key = cellKey(window, uiScale);
    test(`${key}: painted text, taps, safe box and page scroll hold their recorded ceilings`, async ({ browser, baseURL }) => {
      test.setTimeout(300000);
      const lines = [];
      const cell = await measureCell(browser, String(baseURL), { window, uiScale,
        log: (id, p) => lines.push(`${key} ${id}: ${p.error ? "NOT MEASURED — " + p.error : paintLine(p)}`) });
      await test.info().attach("paint", { body: lines.join("\n"), contentType: "text/plain" });
      expect(cell.mismatches, "the page reports the preset's window, insets and stored profile").toEqual([]);
      expect(cell.applied.uiScale, "UI SIZE reached --ui-scale").toBe(String(uiScale / 100));
      expect(Object.keys(cell.screens), "every acceptance screen was reached").toEqual([...ACCEPT_SCREENS]);
      expect(judgeCells({ [key]: cell.screens }, CEILINGS), lines.join("\n")).toEqual([]);
    });
  }
}
