// @ts-check
// A portrait phone can be rotation-locked before a race starts. The full-screen
// landscape prompt must explain how to recover and provide actions that do not
// depend on the OS honouring manifest orientation or ScreenOrientation.lock().
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function startPortraitRace(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
  await expect(page.locator("#rotate-device")).toBeVisible();
}

// BUDGET, MEASURED. On CI run 33881691888 (Pages #1987) all three tests here
// died on "waitForFunction: Timeout 45000ms exceeded" in the change-aware
// gate, at 83.1 s / 74.4 s / 72.4 s. Nothing asserted was wrong — the page log
// shows the FIXTURE stalling:
//
//     3634ms  [car] build mclaren
//    77029ms  [car] build mercedes     <- a 73-second gap
//
// That is three parallel workers each booting a full race on one shared
// runner. BOOT_MS is 45 s and its own comment records that it was measured on
// an IDLE container (worst case 24.6 s) — a fair number for an idle box and
// far under a loaded one. 88 specs import it, so raising it is a separate
// change needing a measurement on a LOADED runner; this spec's own cost is
// what is measured here.
//
// Declared so tools/ci/select-specs.mjs EXCLUDES it rather than selecting it
// into a 120 s gate its boot alone cannot clear. An UNDECLARED budget is
// UNKNOWN, not safe. 300 s matches the other over-cap specs on this tree.
test("portrait blocker explains rotation lock and opens controls safely", async ({ page }) => {
  test.setTimeout(300_000);
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
  test.setTimeout(300_000);
  // navOpen() is what js/input/input.js branches on: false meant d-pad/A were
  // spent on boost/shift BEHIND the opaque blocker and a pad-only player had
  // no reachable way to press OPEN CONTROLS or EXIT RACE.
  await startPortraitRace(page);
  const nav = await page.evaluate(() =>
    window.UiLayers.navOpen() && (window.UiLayers.top() || {}).id);
  expect(nav).toBe("rotate-device");
});

test("portrait blocker can exit the race", async ({ page }) => {
  test.setTimeout(300_000);
  await startPortraitRace(page);
  await page.locator("#rotate-exit").click();
  await expect(page.locator("#rotate-device")).toBeHidden();
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/in-race/);
});
