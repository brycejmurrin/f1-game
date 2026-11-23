// @ts-check
// settings-reload.spec.js — the SettingRow choices that reach the car or the phone HUD survive a reload:
// STEERING INPUT, THROTTLE (hold/latch/auto), GEARS, MIRROR CONTROLS, the race sheet's DRIVING LINE, and the HUD's
// MAP / GAPS / PROFILE / METRICS rows. Each is set through its own SettingRow <select> (the row's real write),
// the page reloads at the phone shape, and the test reads back the stored key, the row's painted value (read()
// reflects live game state) and, where one exists, a direct live signal. Node VMs cannot reach these writes (they
// live in game.js / race-settings.js rows), so this is their apply+persist proof (B·H11 settings audit).
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";
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
  "pm-fullscreen-sel": "fullscreen cannot re-enter without a user gesture (a browser rule)",
  "pm-hl-set-sel": "the HUD-layout editor's picker: which set is being edited",
  "pm-hl-el-sel": "the HUD-layout editor's picker: which element is being edited",
  "pm-hl-visibility-sel": "the HUD-layout editor's picker, follows the edited element",
  "pm-drill-sel": "the practice drill is the running session's (driving-coach drillMode starts free)",
  "practice-goal": "the practice goal is the running session's, same as the drill",
  "ps-tod": "Photo Studio restores the race's time of day on close",
  "ps-weather": "Photo Studio restores the race's weather on close",
  "ps-line": "Photo Studio framing aid, per shot",
  "ps-aspect": "Photo Studio framing aid, per shot",
  "ps-grid-select": "Photo Studio framing aid, per shot",
  "ps-postcard": "Photo Studio framing aid, per shot",
  "ps-samples": "Photo Studio capture quality for this session. A fresh session starts with instant capture.",
};
// CLAUDE LINK (#5259) sits in the hub but opens the bridge dialog, not a settings page: it has no rows to visit.
const DOORS = "#pm-settings-index button[id]:not(#pm-claude-link)";
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
  const moved = await page.evaluate(({ skip, initial }) => {
    const out = [];
    // Applying the THUMB layout preset also writes the individual screen looks.
    // Exercise that player action first, then leave each independent row off its original value.
    const selects = Array.from(document.querySelectorAll("select"));
    selects.sort((a, b) => Number(b.id === "pm-layoutpreset-sel") - Number(a.id === "pm-layoutpreset-sel"));
    for (const s of selects) {
      if (!s._srLive || s.disabled) continue;
      const row = s.id ? s : s.closest("[id]");
      if (!row || skip.includes(row.id)) continue;
      const v = [...s.options].filter((o) => !o.disabled).map((o) => o.value).find((x) => x !== initial[row.id] && x !== s.value);
      if (v == null) continue;
      s.value = v;
      s.dispatchEvent(new Event("change", { bubbles: true }));
      out.push(row.id);
    }
    return out;
  }, { skip: [...NAVIGATES], initial: before });
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
  expect(set["ps-samples"]).toBe("8");
  expect(after["ps-samples"]).toBe("1");
  // The allowlist stays honest: a transient row that starts persisting should leave the list.
  const nowPersist = Object.keys(TRANSIENT).filter((id) => id in set && set[id] !== before[id] && after[id] === set[id]);
  expect(nowPersist, "TRANSIENT rows that now persist (drop them from the list)").toEqual([]);
});

test.describe("individual desktop graphics", () => {
  test.use({ viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false });
  test("updates open detail rows after an edit from another tab", async ({ page, context }) => {
    const peer = await context.newPage();
    for (const tab of [page, peer]) {
      await tab.goto("/");
      await boot(tab);
      await tab.locator("#mb-settings").click();
      await tab.locator("#pm-open-graphics").click();
      await tab.getByText("Graphics details", { exact: true }).click();
    }
    const hdr = tab => tab.getByRole("combobox", { name: "HDR output", exact: true });
    const trees = tab => tab.getByRole("combobox", { name: "High-detail trees", exact: true });
    await hdr(page).selectOption("on");
    await expect(hdr(peer)).toHaveValue("on");
    await trees(peer).selectOption("on");
    await expect(trees(page)).toHaveValue("on");
    await expect(hdr(page)).toHaveValue("on");
  });
  test("saves independent effects across a reload and restores preset choices", async ({ page }) => {
    async function openDetail() {
      await page.locator("#mb-settings").click();
      await page.locator("#pm-open-graphics").click();
      await page.getByText("Graphics details", { exact: true }).click();
    }
    await page.goto("/");
    await boot(page);
    await openDetail();
    await expect(page.locator('script[src*="js/ui/desktop-graphics.js"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => Object.keys(GfxQuality.FEATURES).filter(key =>
      !document.querySelector(`[data-desktop-graphics] select[data-effect="${key}"]`)))).toEqual([]);
    const trees = page.getByRole("combobox", { name: "High-detail trees", exact: true });
    const mirrors = page.getByRole("combobox", { name: "High-resolution rear-view mirror", exact: true });
    await trees.selectOption("on");
    await mirrors.selectOption("off");
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Reload to apply" }).click()]);
    await boot(page);
    expect(await page.evaluate(() => [GfxQuality.feature("treesHi"), GfxQuality.feature("mirrorHi")])).toEqual([true, false]);
    await openDetail();
    await expect(trees).toHaveValue("on");
    await expect(mirrors).toHaveValue("off");
    await page.getByRole("button", { name: "Use preset for all" }).click();
    await expect(trees).toHaveValue("");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.gfxFeatureOverrides")))).toEqual({});
  });
});

test.describe("phone detail", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: { width: 852, height: 393 } }) });
  test("mobile detail changes survive reload without enabling desktop effects", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("apex26.gfxFeatureOverrides", JSON.stringify({ hdrOut: true })));
    async function openDetail() {
      await page.locator("#mb-settings").tap();
      await page.locator("#pm-open-graphics").tap();
      await page.getByText("Graphics details", { exact: true }).tap();
    }
    await page.goto("/");
    await boot(page);
    await openDetail();
    const kerbs = page.getByRole("combobox", { name: "Modelled kerbs", exact: true });
    await expect(page.getByRole("combobox", { name: "HDR output", exact: true })).toHaveCount(0);
    const kerbHelp = page.locator("#desktop-detail-kerbProfile details");
    await expect(kerbHelp.locator("p")).toBeHidden();
    await kerbHelp.locator("summary").tap();
    await expect(kerbHelp.locator("p")).toContainText("raised");
    await expect(kerbHelp.locator("p")).toBeVisible();
    await expect(kerbs).toHaveValue("");
    await kerbHelp.locator("summary").tap();
    await expect(kerbHelp.locator("p")).toBeHidden();
    await kerbs.selectOption("on");
    await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Reload to apply" }).tap()]);
    await boot(page);
    expect(await page.evaluate(() => [GfxQuality.feature("kerbProfile"), GfxQuality.feature("hdrOut")])).toEqual([true, false]);
    await openDetail();
    await expect(kerbs).toHaveValue("on");
    await page.getByRole("button", { name: "Use preset for all" }).tap();
    await expect(kerbs).toHaveValue("");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.gfxFeatureOverrides")))).toEqual({ hdrOut: true });
  });
});
