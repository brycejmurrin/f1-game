// @ts-check
// Livery sidewallInk (garage slice S5): paint-only tyre sidewall lettering ink; the compound band keeps its colour.
// Unset = today's wheels byte for byte; set = colour arrays only, on all four wheels.
// The wheel-colour contract (unset = byte identical, colour arrays only, four corners) is
// pinned on the real Car3D build by tests/unit/livery-sidewall.test.mjs; this spec keeps only what
// needs the live creator UI.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { ensureLive } from "../helpers/shared-page.js";
import { revealLiveryControl as reveal, openEmptyCustomLivery } from "../helpers/livery-editor.js";

test.describe("Livery sidewall ink", () => {
  test("the creator's WHEELS & BRAKES section offers a SIDEWALL INK colour row", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await ensureLive(page);
    await openEmptyCustomLivery(page);
    await reveal(page, 'input[data-liv-field="sidewallInk"]');
    const sec = page.locator('[data-liv-section="WHEELS & BRAKES"]');
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).toHaveCount(1);
    await sec.locator('input[data-liv-field="sidewallInk"]').fill("#ff00ff");
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).not.toHaveClass(/cs-liv-off/);
    await expect(sec.locator('input[data-liv-field="sidewallInk"]')).toHaveValue("#ff00ff");
  });
});
