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

// uihunt4-flows-1030 #4: the FULL matrix. Every live SettingRow <select> on every Settings page is moved off its
// value, the page reloads, and the two snapshots are diffed. TRANSIENT rows are session state by design; every
// other row must come back exactly as it was left. XR MODE is not touched: switching it reloads into the XR path.
const NAVIGATES = new Set(["pm-xr-mode-sel"]);
const TRANSIENT = {
  "pm-drill-sel": "the practice drill is the running session's (driving-coach drillMode starts free)",
  "practice-goal": "the practice goal is the running session's, same as the drill",
  "ps-tod": "Photo Studio restores the race's time of day on close",
  "ps-weather": "Photo Studio restores the race's weather on close",
  "ps-line": "Photo Studio framing aid, per shot",
  "ps-aspect": "Photo Studio framing aid, per shot",
  "ps-grid-select": "Photo Studio framing aid, per shot",
  "ps-postcard": "Photo Studio framing aid, per shot",
};
const DOORS = "#pm-settings-index button[id]";
async function visitPages(page) {
  await page.evaluate(() => document.getElementById("mb-settings").click());
  const doors = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((b) => b.id), DOORS);
  const shown = () => performance.getEntriesByName("apex:settings:shown").length;
  for (const d of doors) {
    const n = await page.evaluate(shown);
    await page.locator("#" + d).dispatchEvent("click");
    // A page wires its rows on enter (MUSIC & SOUND after its lazy bundle); SettingsNav marks the reveal.
    await page.waitForFunction((k) => performance.getEntriesByName("apex:settings:shown").length > k, n, { polling: 100, timeout: BOOT_MS });
  }
  return doors.length;
}
const snapRows = (page) => page.evaluate(() => {
  const o = {};
  for (const s of document.querySelectorAll("select")) {
    if (!s._srLive) continue;
    const row = s.id ? s : s.closest("[id]");
    if (row) o[row.id] = s.value;
  }
  return o;
});

test("every live Settings row left off its value comes back after a reload (persistence matrix)", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/");
  await boot(page);
  expect(await visitPages(page), "the settings door index").toBeGreaterThanOrEqual(8);
  const before = await snapRows(page);
  const moved = await page.evaluate((skip) => {
    const out = [];
    for (const s of document.querySelectorAll("select")) {
      if (!s._srLive || s.disabled) continue;
      const row = s.id ? s : s.closest("[id]");
      if (!row || skip.includes(row.id)) continue;
      const v = [...s.options].filter((o) => !o.disabled).map((o) => o.value).find((x) => x !== s.value);
      if (v == null) continue;
      s.value = v;
      s.dispatchEvent(new Event("change", { bubbles: true }));
      out.push(row.id);
    }
    return out;
  }, [...NAVIGATES]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const set = await snapRows(page);
  const offDefault = Object.keys(set).filter((id) => set[id] !== before[id]);
  // 155 of 163 live rows measured moving on 2026-10-30; a collapse here means the walk stopped reaching pages.
  expect(offDefault.length, `rows moved off their value (${moved.length} written)`).toBeGreaterThanOrEqual(120);

  await page.reload();
  await boot(page);
  await visitPages(page);
  const after = await snapRows(page);
  const lost = Object.keys(set).filter((id) => !(id in TRANSIENT) && after[id] !== set[id]).map((id) => `${id}: ${set[id]} -> ${after[id]}`);
  expect(lost, "rows that did not come back after the reload").toEqual([]);
  // The allowlist stays honest: a transient row that starts persisting should leave the list.
  const nowPersist = Object.keys(TRANSIENT).filter((id) => id in set && set[id] !== before[id] && after[id] === set[id]);
  expect(nowPersist, "TRANSIENT rows that now persist (drop them from the list)").toEqual([]);
});
