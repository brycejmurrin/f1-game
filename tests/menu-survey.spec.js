// @ts-check
// Menu / HUD survey — the "click every button, capture every state" companion
// to ui-audit.spec.js. ui-audit captures each PAGE; this captures the pause
// SETTINGS sub-menu and every toggle button's STATES (STEER modes, RESOLUTION
// values, SOUND/MUSIC/GEARS on-off, HIDE HUD), the lighting tuner, and the
// in-race camera picker + per-mode touch controls.
// Output: artifacts/galleries-<port>/menu-survey/
//
// Menu navigation is driven with in-page element.click() (via page.evaluate),
// NOT Playwright's auto-waiting locator.click(): the game canvas renders every
// frame, and the actionability hit-test on a button layered over that canvas can
// spin until the test timeout even though the button is perfectly clickable.
// In-page clicks fire the handler directly; we then poll the DOM for the result.
import { test, expect } from "./fixtures.js";
import { galleryPath } from "./output-paths.js";

const PORTRAIT  = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}
async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: galleryPath("menu-survey", `${name}.png`), fullPage: false });
}
// Fire a button's click handler in-page (bypasses canvas hit-test flakiness).
const clickId = (page, id) => page.evaluate((id) => document.getElementById(id).click(), id);
const labelOf = (page, id) => page.evaluate((id) => document.getElementById(id).textContent || "", id);

// Race + park, then reveal the pause SETTINGS sub-menu.
async function openSettings(page, track = "bahrain", tod = "day", wx = "dry") {
  await page.evaluate(({ track, tod, wx }) => window.__apex.race(track, tod, wx), { track, tod, wx });
  await page.waitForFunction((t) => { try { return window.__apex.info().track === t; } catch (_) { return false; } }, track, { timeout: 10_000 });
  await page.evaluate(() => {
    window.__apex.park(0.1);
    const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
    document.getElementById("pausemenu").hidden = false;
    document.getElementById("pm-settings").click();
  });
  await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 8_000 });
  await page.waitForTimeout(200);
}
// Cycle a labelled toggle in-page until its text contains `want`.
async function cycleTo(page, id, want, max = 4) {
  await page.evaluate(({ id, want, max }) => {
    const b = document.getElementById(id);
    for (let i = 0; i < max && !b.textContent.toUpperCase().includes(want.toUpperCase()); i++) b.click();
  }, { id, want, max });
  await page.waitForTimeout(120);
  return labelOf(page, id);
}

test.describe("Menu survey — settings sub-menu (portrait)", () => {
  test.use({ viewport: PORTRAIT, hasTouch: true });

  test("30 settings menu — default (steer TILT)", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    await cycleTo(page, "pm-steer", "TILT");
    await shot(page, "portrait-30-settings-tilt");
  });

  test("31 settings menu — steer BUTTONS", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    expect(await cycleTo(page, "pm-steer", "BUTTONS")).toContain("BUTTONS");
    await shot(page, "portrait-31-settings-steer-buttons");
  });

  test("32 settings menu — steer TOUCH", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    expect(await cycleTo(page, "pm-steer", "TOUCH")).toContain("TOUCH");
    await shot(page, "portrait-32-settings-steer-touch");
  });

  test("33 settings menu — GEARS MANUAL (tilt)", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    await cycleTo(page, "pm-steer", "TILT");        // GEARS only active in tilt
    await cycleTo(page, "pm-gears", "MANUAL");
    await shot(page, "portrait-33-settings-gears-manual");
  });

  test("34 settings menu — SOUND + MUSIC OFF", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    await cycleTo(page, "pm-sound", "OFF");
    await cycleTo(page, "pm-music", "OFF");
    await shot(page, "portrait-34-settings-sound-music-off");
  });

  test("35 settings menu — RESOLUTION pinned", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    await cycleTo(page, "pm-res", "HIGH");
    await shot(page, "portrait-35-settings-res-high");
  });

  test("36 lighting tuner", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page, "singapore", "night", "dry");
    await clickId(page, "pm-lighting");
    await page.waitForFunction(() => !document.getElementById("lighting").hidden, null, { timeout: 8_000 });
    await page.waitForTimeout(400);
    await shot(page, "portrait-36-lighting-tuner");
  });
});

test.describe("Menu survey — in-race HUD + controls (landscape)", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  async function startDriving(page, mode /* "touch"|"buttons"|"tilt" */) {
    await openSettings(page);                 // race bahrain + open settings
    await cycleTo(page, "pm-steer", mode);
    await page.evaluate(() => {
      document.getElementById("pm-settings-close").click();
      document.getElementById("pm-resume").click();
      window.__apex.jump(0.1, 50, 0); window.__apex.snapCam();
    });
    await page.waitForTimeout(500);
  }

  test("40 HUD — touch controls", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await startDriving(page, "touch");
    await shot(page, "landscape-40-hud-touch");
  });

  test("41 HUD — button steering controls", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await startDriving(page, "buttons");
    await shot(page, "landscape-41-hud-buttons");
  });

  test("42 HUD hidden (clean screen)", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
    await page.evaluate(() => { window.__apex.jump(0.1, 50, 0); window.__apex.snapCam(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.body.classList.add("hud-hidden"));
    await page.waitForTimeout(300);
    await shot(page, "landscape-42-hud-hidden");
  });

  test("43 camera picker grid", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
    await page.evaluate(() => { window.__apex.jump(0.1, 50, 0); window.__apex.snapCam(); });
    await page.waitForTimeout(300);
    await page.locator("#btn-cam").dispatchEvent("contextmenu");   // long-press equivalent
    await page.locator("#campicker").waitFor({ state: "visible" }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, "landscape-43-camera-picker");
  });
});
