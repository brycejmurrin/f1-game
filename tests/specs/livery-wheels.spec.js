// @ts-check
// Livery rimTint / caliperTint (garage slice S2): paint-only wheel colour overrides.
// Unset = today's wheels byte for byte; set = colour arrays only, on all four wheels.
// The wheel-colour contract (unset = byte identical, colour arrays only, four corners) is
// pinned on the real Car3D build by tests/unit/livery-wheels.test.mjs; this spec keeps only what
// needs the live creator UI.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { ensureLive } from "../helpers/shared-page.js";
import { revealLiveryControl as reveal, openEmptyCustomLivery } from "../helpers/livery-editor.js";

test.describe("Livery wheel tints", () => {
  test("the creator's WHEELS & BRAKES section offers RIM and CALIPER colour rows", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await ensureLive(page);
    await openEmptyCustomLivery(page);
    await reveal(page, 'input[data-liv-field="rimTint"]');
    const sec = page.locator('[data-liv-section="WHEELS & BRAKES"]');
    await expect(sec.locator('input[data-liv-field="rimTint"]')).toHaveCount(1);
    await expect(sec.locator('input[data-liv-field="caliperTint"]')).toHaveCount(1);
    await sec.locator('input[data-liv-field="rimTint"]').fill("#ff00ff");
    await expect(sec.locator('input[data-liv-field="rimTint"]')).not.toHaveClass(/cs-liv-off/);
  });
});
