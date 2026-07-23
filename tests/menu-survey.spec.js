// @ts-check
// Menu / HUD survey — the "click every button, capture every state" companion
// to ui-audit.spec.js. ui-audit captures each PAGE; this captures the pause
// SETTINGS sub-menu and every toggle button's STATES (STEER modes, RESOLUTION
// values, SOUND/MUSIC/GEARS on-off, HIDE HUD), the lighting tuner, and the
// in-race camera picker + per-mode touch controls.
// Output: artifacts/galleries-<port>/menu-survey/
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

// Race + park, then reveal the pause SETTINGS sub-menu. Hides the rotate-device
// overlay (portrait) so it can't intercept clicks, and opens the panels via the
// same DOM path a player would.
async function openSettings(page, track = "bahrain", tod = "day", wx = "dry") {
  await page.evaluate(({ track, tod, wx }) => window.__apex.race(track, tod, wx), { track, tod, wx });
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => {
    window.__apex.park(0.1);
    const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
    document.getElementById("pausemenu").hidden = false;
  });
  await page.locator("#pm-settings").click();
  await page.locator("#pmsettings").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
}

// Cycle a labelled button until its text contains `want`, capped at `max` clicks.
async function cycleTo(page, id, want, max = 4) {
  for (let i = 0; i < max; i++) {
    const t = (await page.locator(`#${id}`).textContent()) || "";
    if (t.toUpperCase().includes(want.toUpperCase())) return t;
    await page.locator(`#${id}`).click({ force: true });
    await page.waitForTimeout(150);
  }
  return (await page.locator(`#${id}`).textContent()) || "";
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
    await cycleTo(page, "pm-steer", "BUTTONS");
    await shot(page, "portrait-31-settings-steer-buttons");
  });

  test("32 settings menu — steer TOUCH", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    await cycleTo(page, "pm-steer", "TOUCH");
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
    await page.locator("#pm-lighting").click();
    await page.locator("#lighting").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await shot(page, "portrait-36-lighting-tuner");
  });
});

test.describe("Menu survey — in-race HUD + controls (landscape)", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  async function startDriving(page, mode /* "touch"|"buttons"|"tilt" */) {
    await page.evaluate((m) => {
      window.__apex.race("bahrain");
    }, mode);
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
    // set steer mode via the pause settings, then resume
    await page.evaluate(() => {
      window.__apex.park(0.1);
      document.getElementById("pausemenu").hidden = false;
    });
    await page.locator("#pm-settings").click();
    await page.locator("#pmsettings").waitFor({ state: "visible" });
    await cycleTo(page, "pm-steer", mode);
    await page.locator("#pm-settings-close").click();
    await page.locator("#pm-resume").click();
    await page.evaluate(() => { window.__apex.jump(0.1, 50, 0); window.__apex.snapCam(); });
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
    // Long-press opens the picker; fire it via a real contextmenu on the CAM btn.
    await page.locator("#btn-cam").dispatchEvent("contextmenu");
    await page.locator("#campicker").waitFor({ state: "visible" }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, "landscape-43-camera-picker");
  });
});
