// @ts-check
// phone-layout-pin — Bryce's cell, pinned (#5139): 852x393 landscape, display-mode standalone, 59/21/59 safe-area
// insets, touch, his own settings export. Every screen in tools/ui/phone-layout-pin.mjs SCREENS keeps the boxes and
// global tokens blessed in tests/data/phone-layout-pin.json (1 px). The Nov 4-5 UI merges moved the title cluster
// 34 px without any test noticing; this is the test that notices. A wanted change re-blesses:
// `node tools/ui/phone-layout-pin.mjs --update`, and the PR says why.
import { devices } from "@playwright/test";
import { test, expect } from "../helpers/fixtures.js";
import { testOptions, measureAll, compareFingerprint, readGolden, SCREENS } from "../../tools/ui/phone-layout-pin.mjs";

test.describe("Bryce's phone cell: every screen keeps its blessed layout", () => {
  test.use(testOptions(devices));
  test("852x393 standalone, his export, 1 px", async ({ page }) => {
    test.setTimeout(240000);
    const golden = readGolden();
    const got = await measureAll(page);
    const lines = [];
    for (const { id } of SCREENS) lines.push(...compareFingerprint(id, golden.screens[id], got[id]));
    expect(lines, "layout fingerprint vs tests/data/phone-layout-pin.json (a wanted change: --update, and say why)").toEqual([]);
  });
});
