// @ts-check
// A portrait phone can be rotation-locked before a race starts. The full-screen
// landscape prompt must explain how to recover and provide actions that do not
// depend on the OS honouring manifest orientation or ScreenOrientation.lock().
import { test, expect } from "../helpers/fixtures.js";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function startPortraitRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.go());
  await expect(page.locator("#rotate-device")).toBeVisible();
}

test("portrait blocker explains rotation lock and opens controls safely", async ({ page }) => {
  await startPortraitRace(page);
  const blocker = page.getByRole("dialog", { name: "Rotate to landscape to race" });
  await expect(blocker).toContainText("Turn off rotation lock");
  await expect(page.locator("#rotate-controls")).toBeFocused();

  await page.locator("#rotate-controls").click();
  await expect(blocker).toBeHidden();
  await expect(page.locator("#howtoplay")).toBeVisible();
  await expect(page.locator("#htp-close")).toBeFocused();

  await page.locator("#htp-close").click();
  await expect(blocker).toBeVisible();
  await expect(page.locator("#rotate-controls")).toBeFocused();
});

test("a gamepad routes to the blocker's buttons, not the car", async ({ page }) => {
  // navOpen() is what js/game/input.js branches on: false meant d-pad/A were
  // spent on boost/shift BEHIND the opaque blocker and a pad-only player had
  // no reachable way to press OPEN CONTROLS or EXIT RACE.
  await startPortraitRace(page);
  const nav = await page.evaluate(() =>
    window.UiLayers.navOpen() && (window.UiLayers.top() || {}).id);
  expect(nav).toBe("rotate-device");
});

test("portrait blocker can exit the race", async ({ page }) => {
  await startPortraitRace(page);
  await page.locator("#rotate-exit").click();
  await expect(page.locator("#rotate-device")).toBeHidden();
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/in-race/);
});
