// @ts-check
/**
 * Garage Change Car sheet wait. Isolated from shared-page.js so a two-rAF
 * openSetup defer does not import-graph every spec that only needs toMenu.
 */

/**
 * #carsetup is shown BEFORE buildSetup fills the tabs (openSetup yields two
 * rAF frames so Change Car never freezes). Specs that only wait for visible
 * then read #cs-budget get "" — wait until aria-busy clears and the budget
 * line has been painted.
 */
export async function waitGarageSheet(page, timeout = 15000) {
  await page.locator("#carsetup").waitFor({ state: "visible", timeout });
  await page.waitForFunction(() => {
    const cs = document.getElementById("carsetup");
    if (!cs || cs.hidden || cs.hasAttribute("aria-busy")) return false;
    const budget = document.getElementById("cs-budget");
    return !!(budget && budget.textContent && budget.textContent.trim());
  }, null, { polling: 100, timeout });
}
