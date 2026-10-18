// @ts-check
// Photo Studio TIME & WEATHER: the on-track studio changes the session's time of day and weather through the
// lighting tuner's own seam (G.setTimeOfDay / G.weather), live; it is a preview that every close and RESET put
// back, so physics and the race are untouched (js/ui/photo-studio.js).
import { test, expect, BOOT_MS, clickLive } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 852, height: 393 };
const PORTRAIT = { width: 390, height: 844 };
test.use({ viewport: LANDSCAPE, hasTouch: true });

const TODS = ["dawn", "day", "dusk", "night", "default"];
const WXS = ["dry", "overcast", "fog", "wet", "rain", "storm"];

async function boot(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("apex26.resMode", '"low"'));
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    null, { polling: 100, timeout: BOOT_MS });
}
const light = (page) => page.evaluate(() => JSON.stringify(__apex.lightState()));
const phys = (page) => page.evaluate(() => {
  const p = __apex.physState();
  return { s: p.s, x: p.x, px: p.px, pz: p.pz, speed: p.speed, head: p.head, lap: __apex.cars().length };
});

test("Paused race photo changes time of day and weather live, resets, and leaves the race untouched", async ({ page, pageErrors }) => {
  test.setTimeout(240000);
  await boot(page);
  await page.evaluate(async () => {
    __apex.headless(true);
    await __apex.race("bahrain", "day", "dry");
    __apex.go(); __apex.park(0.1);
  });
  const before = await phys(page);
  await clickLive(page, "pausebtn");
  await clickLive(page, "pm-photo");
  await expect(page.locator("#ps-tod")).toBeVisible();
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(["day", "dry"]);
  await expect(page.locator("#ps-cond-reset")).toBeDisabled();

  // Every time of day: the hook follows the row and the resolved scene changes.
  let seen = await light(page);
  for (const tod of ["dawn", "dusk", "night", "default", "day"]) {
    await page.locator("#ps-tod").selectOption(tod);
    expect(await page.evaluate(() => __apex.setTimeOfDay())).toBe(tod);
    const now = await light(page);
    expect(now, `scene changed for ${tod}`).not.toBe(seen);
    seen = now;
  }
  const lum = () => page.evaluate(() => __apex.lightState().ambientSky.reduce((t, v) => t + v, 0));
  const dayLum = await lum();
  await page.locator("#ps-tod").selectOption("night");
  expect(await lum(), "night is darker than day").toBeLessThan(dayLum);
  await page.locator("#ps-tod").selectOption("day");

  // Every weather: the hook follows the row; the lighting differs from dry for each lateral/wet state.
  const dry = await light(page);
  for (const wx of WXS.slice(1)) {
    await page.locator("#ps-weather").selectOption(wx);
    expect(await page.evaluate(() => __apex.weather())).toBe(wx);
    expect(await light(page), `scene changed for ${wx}`).not.toBe(dry);
    await expect(page.locator("#ps-weather")).toHaveValue(wx);
  }
  await expect(page.locator("#ps-cond-reset")).toBeEnabled();

  // RESET returns the conditions the session came with.
  await clickLive(page, "ps-cond-reset");
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(["day", "dry"]);
  await expect(page.locator("#ps-tod")).toHaveValue("day");
  await expect(page.locator("#ps-weather")).toHaveValue("dry");
  await expect(page.locator("#ps-cond-reset")).toBeDisabled();
  expect(await light(page)).toBe(dry);

  // A change left in place is still put back by DONE.
  await page.locator("#ps-tod").selectOption("night");
  await page.locator("#ps-weather").selectOption("rain");
  await clickLive(page, "ps-close");
  await expect(page.locator("#photo-studio")).toBeHidden();
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(["day", "dry"]);
  expect(await phys(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
});

test("Time & weather controls fit the phone sheet at 852x393 and 390x844", async ({ page, pageErrors }) => {
  test.setTimeout(240000);
  await boot(page);
  await page.evaluate(async () => {
    __apex.headless(true);
    await __apex.race("bahrain", "day", "dry");
    __apex.go(); __apex.park(0.1);
  });
  await clickLive(page, "pausebtn");
  await clickLive(page, "pm-photo");
  await page.evaluate(() => __apex.headless(false));
  for (const viewport of [LANDSCAPE, PORTRAIT]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => __apex.awaitPresent(20000));
    for (const id of ["ps-tod", "ps-weather", "ps-cond-reset", "ps-capture", "ps-close"]) {
      await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: "nearest" }), id);
      const r = await page.evaluate((id) => {
        const el = document.getElementById(id), b = CssZoom.viewportRect(el), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        const pane = CssZoom.viewportRect(document.getElementById("ps-panel"));
        const range = document.createRange(); range.selectNodeContents(el);
        return { id, w: b.width, h: b.height, hit: hit === el || el.contains(hit),
          inside: b.x >= pane.x - 0.5 && b.x + b.width <= pane.x + pane.width + 0.5 && b.y >= -0.5 && b.y + b.height <= innerHeight + 0.5,
          clipped: el.scrollWidth > el.clientWidth + 1,
          lines: el.tagName === "BUTTON" ? new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size : 1 };
      }, id);
      const tag = `${id} @${viewport.width}x${viewport.height}`;
      expect(r.hit, `${tag} receives input`).toBe(true);
      expect(r.inside, `${tag} inside the sheet and viewport`).toBe(true);
      expect(r.clipped, `${tag} not clipped`).toBe(false);
      expect(r.lines, `${tag} label on one line (no mid-word break)`).toBe(1);
      expect(r.h, `${tag} tap height`).toBeGreaterThanOrEqual(40);
    }
  }
  expect(pageErrors).toEqual([]);
});

test("Title circuit photo changes time and weather for the shoot and restores Home", async ({ page, pageErrors }) => {
  test.setTimeout(240000);
  await boot(page);
  const home = await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()]);
  await clickLive(page, "mb-photo");
  await page.locator("#ps-subject").selectOption("circuit");
  await page.waitForFunction(() => PhotoStudio.state().open && PhotoStudio.state().source === "home-track",
    null, { polling: 100, timeout: BOOT_MS });
  await expect(page.locator("#ps-tod")).toBeVisible();
  const start = await phys(page);
  await page.locator("#ps-tod").selectOption("night");
  await page.locator("#ps-weather").selectOption("rain");
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(["night", "rain"]);
  expect(await phys(page)).toEqual(start);
  await clickLive(page, "ps-cond-reset");
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(home);
  await page.locator("#ps-weather").selectOption("fog");
  await clickLive(page, "ps-close");
  await expect(page.locator("#photo-studio")).toBeHidden();
  expect(await page.evaluate(() => [__apex.setTimeOfDay(), __apex.weather()])).toEqual(home);

  // The garage subject has no track to light: the group stays out of it.
  await clickLive(page, "mb-photo");
  await page.locator("#ps-subject").selectOption("garage");
  await page.waitForFunction(() => PhotoStudio.state().open && PhotoStudio.state().source === "home",
    null, { polling: 100, timeout: BOOT_MS });
  await expect(page.locator("#ps-tod")).toBeHidden();
  await clickLive(page, "ps-close");
  expect(pageErrors).toEqual([]);
});
