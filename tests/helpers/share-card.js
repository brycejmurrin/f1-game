// @ts-check
// SHARE CARD chip → preview sheet → SAVE IMAGE (#1546–#1548). Headless Chromium has
// no Web Share, so SHARE is hidden and SAVE IMAGE downloads the real PNG. Also
// asserts the sheet's a11y contract and that it fits the viewport (844x390 phone).
import { expect } from "@playwright/test";

export async function saveSharedCard(page, chipSelector, fileName) {
  const chip = page.locator(chipSelector);
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toBeVisible();
  await chip.click();
  const sheet = page.locator("#share-card-preview");
  await expect(sheet).toBeVisible();
  await expect(page.locator("#scp-status")).toHaveText(/^Card ready — portrait, \d+ KB\.$/, { timeout: 20_000 });
  await expect(page.locator("#scp-status")).toHaveAttribute("aria-live", "polite");
  expect((await page.locator("#scp-img").getAttribute("alt")) || "").toMatch(/Unofficial fan game card\.$/);
  await expect(page.locator("#scp-size-portrait")).toHaveAttribute("aria-pressed", "true");
  const view = page.viewportSize();
  for (const id of ["#scp-save", "#scp-close", "#scp-size-square"]) {
    const box = await page.locator(id).boundingBox();
    expect(box, id).toBeTruthy();
    if (box && view) expect(box.y + box.height, `${id} inside the viewport`).toBeLessThanOrEqual(view.height + 0.5);
  }
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.locator("#scp-save").click()]);
  expect(file.suggestedFilename()).toMatch(fileName);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(chip).toHaveText("SAVED");
}
