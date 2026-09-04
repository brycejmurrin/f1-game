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
//
// Every waitForFunction here passes `polling` for the same reason: Playwright
// polls on requestAnimationFrame by default, and a page driving the game loop
// under SwiftShader starves that poll, so a declared timeout never gets to fire.
// Measured 2026-08-08 — "40 HUD" reported `Timeout 10000ms exceeded` after 79s
// under a loaded box, and passed in 38s alone. Timer polling, not a bigger bound.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";

const PORTRAIT  = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
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
  await page.waitForFunction((t) => { try { return window.__apex.info().track === t; } catch (_) { return false; } }, track, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.park(0.1);
    const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
    document.getElementById("pausemenu").hidden = false;
    document.getElementById("pm-settings").click();
  });
  await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { polling: 100, timeout: 8_000 });
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
    expect(await cycleTo(page, "pm-steer", "TILT")).toContain("TILT");
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
    expect(await cycleTo(page, "pm-steer", "TILT")).toContain("TILT"); // GEARS only active in tilt
    expect(await cycleTo(page, "pm-gears", "MANUAL")).toContain("MANUAL");
    await shot(page, "portrait-33-settings-gears-manual");
  });

  test("34 settings menu — SOUND + MUSIC OFF", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    // BOTH switches now live in the MUSIC & SOUND panel — the pause menu's
    // duplicate SOUND toggle was removed, since it was the master mute while
    // the panel's switch is the effects bus and the two read as one control.
    await page.evaluate(() => document.getElementById("pm-audio").click());
    await page.waitForTimeout(120);
    await page.evaluate(() => document.getElementById("as-music-off").click());
    await page.evaluate(() => document.getElementById("as-sound-off").click());
    // The OFF half of each switch must now carry the selected ("active") ring —
    // game.js toggles it in the audio-sheet sync; AriaState mirrors it to aria-pressed.
    expect(await page.evaluate(() => ({
      music: document.getElementById("as-music-off").classList.contains("active"),
      sound: document.getElementById("as-sound-off").classList.contains("active"),
    }))).toEqual({ music: true, sound: true });
    await page.waitForTimeout(120);
    await shot(page, "portrait-34-settings-sound-music-off");
  });

  test("35 settings menu — RESOLUTION pinned", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page);
    expect(await cycleTo(page, "pm-res", "HIGH")).toContain("HIGH");
    await shot(page, "portrait-35-settings-res-high");
  });

  test("36 lighting tuner", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSettings(page, "singapore", "night", "dry");
    await clickId(page, "pm-lighting");
    await page.waitForFunction(() => !document.getElementById("lighting").hidden, null, { polling: 100, timeout: 8_000 });
    await page.waitForTimeout(400);
    // The tuner actually built its TUNE_DEFS slider rows, not just an empty shell.
    expect(await page.evaluate(() =>
      document.querySelectorAll("#lt-rows input[type=range]").length
    )).toBeGreaterThan(0);
    await shot(page, "portrait-36-lighting-tuner");
  });
});

test.describe("Menu survey — in-race HUD + controls (landscape)", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  async function startDriving(page, mode /* "touch"|"buttons"|"tilt" */) {
    await openSettings(page);                 // race bahrain + open settings
    expect(await cycleTo(page, "pm-steer", mode)).toContain(mode.toUpperCase());
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
    // Touch steering active: the body carries the steer-touch layout class.
    expect(await page.evaluate(() => document.body.classList.contains("steer-touch"))).toBe(true);
    await shot(page, "landscape-40-hud-touch");
  });

  test("41 HUD — button steering controls", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await startDriving(page, "buttons");
    // Button steering active: the steer buttons are actually on screen.
    await expect(page.locator("#btn-steer-left")).toBeVisible();
    await expect(page.locator("#btn-steer-right")).toBeVisible();
    await shot(page, "landscape-41-hud-buttons");
  });

  test("42 HUD hidden (clean screen)", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.jump(0.1, 50, 0); window.__apex.snapCam(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.body.classList.add("hud-hidden"));
    await page.waitForTimeout(300);
    // hud-hidden strips the HUD and leaves only the restore eye (css/overlays.css).
    await expect(page.locator("#hud")).toBeHidden();
    await expect(page.locator("#hud-restore")).toBeVisible();
    await shot(page, "landscape-42-hud-hidden");
  });

  test("43 camera picker grid", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.jump(0.1, 50, 0); window.__apex.snapCam(); });
    await page.waitForTimeout(300);
    await page.locator("#btn-cam").dispatchEvent("contextmenu");   // long-press equivalent
    await page.locator("#campicker").waitFor({ state: "visible" });
    // The grid built a button per camera mode and highlights exactly the current one.
    expect(await page.locator("#campicker button").count()).toBeGreaterThanOrEqual(10);
    expect(await page.locator("#campicker button.active").count()).toBe(1);
    await page.waitForTimeout(300);
    await shot(page, "landscape-43-camera-picker");
  });
});
