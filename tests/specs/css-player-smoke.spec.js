// @ts-check
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

// One boot protects representative CSS hit targets and the real pause lifecycle.
// Keep shipped typography and theme defaults; buttons is a selectable steering mode.
test("trusted pointer can reach pause and resume repeatedly", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apex26.steerMode", JSON.stringify("buttons"));
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
  for (const id of ["mb-race", "mb-garage", "mb-settings"]) await hitTarget(id);
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
});

