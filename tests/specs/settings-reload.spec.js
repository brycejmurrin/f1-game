// @ts-check
// settings-reload.spec.js — the SettingRow choices that reach the car or the phone HUD survive a reload:
// STEERING INPUT, THROTTLE (hold/latch/auto), GEARS, MIRROR CONTROLS, the race sheet's DRIVING LINE, and the HUD's
// MAP / GAPS / PROFILE / METRICS rows. Each is set through its own SettingRow <select> (the row's real write),
// the page reloads at the phone shape, and the test reads back the stored key, the row's painted value (read()
// reflects live game state) and, where one exists, a direct live signal. Node VMs cannot reach these writes (they
// live in game.js / race-settings.js rows), so this is their apply+persist proof (B·H11 settings audit).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

// [row id, apex26 key, value to pick]; every pick is off its shipped default.
const ROWS = [
  ["pm-steer", "steerMode", "touch"],
  ["pm-throttlemode", "throttleLatch", "latch"],
  ["pm-gears", "manual", "manual"],
  ["pm-mirror", "mirrorControls", "on"],
  ["rs-line", "drivingLine", null],          // the first option that is not the current one
  ["pm-hudmap", "hudMapVis", "off"],
  ["pm-hudgaps", "hudGapsVis", "off"],
  ["pm-hudprofile", "hudProfile", "broadcast"],
  ["pm-hudmetrics", "hudMetricsLayout", "compact"],
];

const boot = async (page) => {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
};
const rowValue = (page, id) => page.evaluate((i) => {
  const sel = document.getElementById(i) && document.getElementById(i).querySelector("select");
  return sel ? sel.value : null;
}, id);

test("each driving and HUD SettingRow choice is stored and live again after a reload at 844x390", async ({ page }) => {
  await page.goto("/");
  await boot(page);
  // DRIVING LINE lives on the race sheet, wired the first time it opens (select screen › GO).
  await page.evaluate(() => document.getElementById("sel-go").click());
  await page.waitForFunction(() => {
    const s = document.querySelector("#rs-line select");
    return !!(s && s._srLive && s.options.length > 1);
  }, null, { polling: 100, timeout: BOOT_MS });

  const picked = await page.evaluate((rows) => rows.map(([id, key, want]) => {
    const sel = document.getElementById(id).querySelector("select");
    const v = want != null ? want : [...sel.options].map((o) => o.value).find((o) => o !== sel.value);
    sel.value = v;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return [id, key, v];
  }), ROWS);
  const stored = await page.evaluate((rows) => Object.fromEntries(rows.map(([, k]) => [k, localStorage.getItem("apex26." + k)])), picked);
  for (const [id, key] of picked) expect(stored[key], `${id} stores apex26.${key}`).not.toBeNull();

  await page.reload();
  await boot(page);
  await page.evaluate(() => document.getElementById("sel-go").click());
  await page.waitForFunction(() => {
    const s = document.querySelector("#rs-line select");
    return !!(s && s._srLive);
  }, null, { polling: 100, timeout: BOOT_MS });

  for (const [id, key, v] of picked) {
    expect(await page.evaluate((k) => localStorage.getItem("apex26." + k), key), `apex26.${key} survives the reload`).toBe(stored[key]);
    expect(await rowValue(page, id), `${id} paints the stored choice from live state`).toBe(v);
  }
  // Direct live signals where the game exposes one.
  expect(await page.evaluate(() => Input.debugState().steerMode)).toBe("touch");
  expect(await page.evaluate(() => document.body.classList.contains("mirror-controls"))).toBe(true);
  expect(await page.evaluate(() => DrivingLine.mode())).toBe(picked.find(([id]) => id === "rs-line")[2]);
});
