// @ts-check
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

// One boot protects representative CSS hit targets and the real pause lifecycle.
// Keep shipped typography and theme defaults; buttons is a selectable steering mode.
test("trusted pointer can reach pause and resume repeatedly", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apex26.steerMode", JSON.stringify("buttons"));
    // Exercise the production modal click shield, including second-finger taps.
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null,
    { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => document.fonts.ready);
  const hitTarget = async (id) => {
    const button = page.locator("#" + id);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    // The title groups (Play, Garage, Watch & Explore, Create, Utilities) share one scroller on a short phone, so a
    // lower group is reached by scrolling; the check below still demands it fits and owns its pointer target.
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const target = document.elementFromPoint(x, y);
      return { x, y, width: r.width, height: r.height,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        reachable: !!target && (target === el || el.contains(target)) };
    });
    expect(hit.width).toBeGreaterThan(0);
    expect(hit.height).toBeGreaterThan(0);
    expect(hit.inside, id + " fits in the viewport").toBe(true);
    expect(hit.reachable, id + " owns its pointer target").toBe(true);
    return hit;
  };
  const pointerClick = async (id) => {
    const hit = await hitTarget(id);
    await page.mouse.click(hit.x, hit.y);
  };
  for (const id of ["mb-race", "mb-garage", "mb-settings"]) {
    // Destination groups share a scrolling column on short screens.
    await page.locator("#" + id).scrollIntoViewIfNeeded();
    await hitTarget(id);
  }
  await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null,
    { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.go();
    window.__trustedPauseClicks = [];
    for (const id of ["pausebtn", "pm-resume"]) {
      document.getElementById(id).addEventListener("click", (e) => {
        window.__trustedPauseClicks.push({ id, trusted: e.isTrusted });
      });
    }
  });
  await expect(page.locator("#loading")).toBeHidden({ timeout: BOOT_MS });
  expect(await page.evaluate(() => window.__apex.inputState().steerMode)).toBe("buttons");
  for (const id of ["btn-throttle", "btn-brake", "btn-steer-left", "btn-steer-right"]) {
    await hitTarget(id);
  }
  for (let visit = 0; visit < 2; visit++) {
    await pointerClick("pausebtn");
    await expect(page.locator("#pausemenu")).toBeVisible();
    expect(await page.evaluate(() => window.UiLayers.navOpen())).toBe(true);
    await pointerClick("pm-resume");
    await expect(page.locator("#pausemenu")).toBeHidden();
    expect(await page.evaluate(() => window.__apex.inputState().gate.anyOpen)).toBe(false);
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("race");
  }
  expect(await page.evaluate(() => window.__trustedPauseClicks)).toEqual([
    { id: "pausebtn", trusted: true }, { id: "pm-resume", trusted: true },
    { id: "pausebtn", trusted: true }, { id: "pm-resume", trusted: true },
  ]);

  // Compatibility clicks are absent for a second touch while GAS is held.
  // Check the actual camera change as well as the independent driving contact.
  const cdp = await page.context().newCDPSession(page);
  const contact = async (id, pointerId) => { const h = await hitTarget(id); return { x: h.x, y: h.y, id: pointerId }; };
  let contactOpen = false;
  const touch = async (type, points) => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    if (type === "touchStart") contactOpen = true;
    if (type === "touchCancel") contactOpen = false;
  };
  try {
    const gas = await contact("btn-throttle", 1), cam = await contact("btn-cam", 2);
    const before = await page.evaluate(() => window.__apex.camera().index);
    await touch("touchStart", [gas]); await touch("touchStart", [cam]);
    await touch("touchEnd", [cam]); // Chromium legacy route ends the named contact.
    const after = await page.evaluate(() => ({ camera: window.__apex.camera().index, throttle: window.__apex.inputState().btn.throttle }));
    expect(after.camera).not.toBe(before);
    expect(after.throttle).toBe(true);
    await touch("touchCancel", []);
    expect(await page.evaluate(() => window.__apex.inputState().btn.throttle)).toBe(false);

    const held = await contact("btn-throttle", 3), pause = await contact("pausebtn", 4);
    await touch("touchStart", [held]); await touch("touchStart", [pause]); await touch("touchEnd", [pause]);
    await expect(page.locator("#pausemenu")).toBeVisible();
    // The held contact stays tracked while the modal gates applied driving input.
    const paused = await page.evaluate(() => window.__apex.inputState());
    expect(paused.gate.anyOpen).toBe(true);
    expect(paused.throttle).toBe(false);
    expect(paused.throttleLevel).toBe(0);
    await touch("touchCancel", []);
    expect(await page.evaluate(() => window.__apex.inputState().btn.throttle)).toBe(false);
    await pointerClick("pm-resume");
    await expect(page.locator("#pausemenu")).toBeHidden();
  } finally { if (contactOpen) await touch("touchCancel", []); await cdp.detach(); }
});

