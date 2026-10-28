// @ts-check
// Regression coverage for the browser-hunt UI defects fixed together in Track B.
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";

const { LAZY_DATA } = createRequire(import.meta.url)("../../tools/manifest.cjs");

async function waitReady(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("Accessible settings discovery", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }) });
  test("settings Back reveals its launcher after rotating the phone", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("apex26.gfxBackend", "webgl2"));
    await waitReady(page); await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-settings").tap(); await page.locator("#pm-open-appearance").tap();
    const jump = page.locator('#appearance-studio [data-settings-jump="a11y"]');
    for (const viewport of [{ width: 390, height: 844 }, { width: 734, height: 343 }]) {
      await jump.tap(); await page.setViewportSize(viewport); await page.keyboard.press("Escape");
      await expect(jump).toBeFocused(); await expect(jump).toBeInViewport({ ratio: 1 });
      expect(await jump.evaluate(e => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("#pm-open-appearance")).toBeFocused();
    await expect(page.locator("#pm-open-appearance")).toBeInViewport({ ratio: 1 });
  });
  test("settings cross-links restore their page, scroll and focus before returning to search", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("apex26.gfxBackend", "webgl2"));
    await waitReady(page); await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-settings").tap(); await page.locator("#pm-open-appearance").tap();
    const jump = page.locator('#appearance-studio [data-settings-jump="a11y"]'), body = page.locator("#pm-settings-body"), motion = page.locator("#pm-motion-sel");
    const value = await motion.inputValue();
    for (const escape of [true, false]) {
      await jump.scrollIntoViewIfNeeded(); const scroll = await body.evaluate(e => e.scrollTop);
      await jump.tap(); await expect(motion).toBeFocused(); await expect(motion).toBeInViewport();
      if (escape) await page.keyboard.press("Escape"); else await page.locator("#pm-settings-close").tap();
      await expect(jump).toBeFocused(); await expect(jump).toBeInViewport();
      await expect.poll(() => body.evaluate(e => e.scrollTop)).toBeCloseTo(scroll, 0);
      await expect(motion).toHaveValue(value);
    }
    await page.keyboard.press("Escape"); await expect(page.locator("#pm-open-appearance")).toBeFocused();
    await expect(page.locator("#pm-open-appearance")).toBeInViewport({ ratio: 1 });
    const search = page.getByRole("searchbox", { name: "Find a setting" }); await search.fill("caption size");
    const result = page.locator("[data-setting-result]").first(); await result.tap();
    await jump.tap(); await expect(motion).toBeFocused();
    await page.keyboard.press("Escape"); await expect(jump).toBeFocused();
    await page.keyboard.press("Escape"); await expect(result).toBeFocused(); await expect(search).toHaveValue("caption size");
    await page.locator("#pm-settings-close").tap(); await expect(page.locator("#mb-settings")).toBeFocused();
  });
  test("search opens caption and hold controls without changing them, and Escape restores the result", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("apex26.gfxBackend", "webgl2"));
    await waitReady(page);
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-settings").tap();
    for (const [query, id, title] of [
      ["subtitles hearing", "pm-captions-sel", "APPEARANCE"], ["caption size", "pm-caption-size-sel", "APPEARANCE"],
      ["caption position", "pm-caption-pos-sel", "APPEARANCE"], ["caption background", "pm-caption-bg-sel", "APPEARANCE"],
      ["caption speaker", "pm-caption-speaker-sel", "APPEARANCE"], ["protanopia", "pm-cvd-sel", "APPEARANCE"],
      ["gas toggle", "pm-hold-throttle-sel", "ACCESSIBILITY"], ["look back toggle", "pm-hold-lookback-sel", "ACCESSIBILITY"],
    ]) {
      const search = page.getByRole("searchbox", { name: "Find a setting" }), control = page.locator("#" + id);
      const before = await control.inputValue();
      await search.fill(query);
      const result = page.locator("[data-setting-result]").first();
      await expect(result).toHaveText(new RegExp(" · " + title + "$"));
      await result.tap();
      await expect(control).toBeFocused(); await expect(control).toBeInViewport();
      await expect(control).toHaveValue(before);
      await page.keyboard.press("Escape");
      await expect(search).toBeVisible(); await expect(search).toHaveValue(query);
      await expect(result).toBeFocused(); await expect(result).toBeInViewport();
    }
    await page.locator("#pm-settings-close").tap();
    await expect(page.locator("#mb-settings")).toBeFocused();
  });
});

async function dataReady(page) {
  await page.goto("/version.json");
  await page.setContent(`
    <link rel="stylesheet" href="/css/tokens.css">
    <link rel="stylesheet" href="/css/components.css">
    <link rel="stylesheet" href="/css/data.css">
    <body data-width="wide" data-density="normal" data-shape="wide">
      <dialog id="datahub" class="screen" data-esc-close="dh-close-btn" hidden></dialog>
    </body>`);
  await page.evaluate(() => { window.Teams = { LIST: [] }; });
  for (const url of [
    "/js/core/log.js", "/js/ui/modal.js", "/js/core/mat4.js", "/js/ui/dom.js", "/js/core/i18n.js",
    ...LAZY_DATA.map((file) => "/" + file),
  ]) await page.addScriptTag({ url });
  await page.evaluate(() => {
    const meta = {
      sessionKey: 999, meetingKey: 99, year: 2026, name: "Race", type: "Race",
      circuit: "Madrid", country: "Spain", dateStart: "2026-09-13T06:00:00Z",
    };
    const drivers = Array.from({ length: 20 }, (_, i) => ({
      num: i + 1,
      code: i === 0 ? "ANT" : "D" + String(i + 1).padStart(2, "0"),
      name: i === 0 ? "Andrea Kimi Antonelli" : "Example Driver " + (i + 1),
      team: i === 0 ? "Mercedes-AMG Petronas Formula One Team" : "Example Racing Team",
      color: "E10600",
    }));
    F1API.schedule = () => Promise.resolve([]);
    F1API.driverStandings = () => Promise.resolve([]);
    F1API.constructorStandings = () => Promise.resolve([]);
    F1API.latestSession = () => Promise.resolve(meta);
    F1API.meetings = () => Promise.resolve([{ meetingKey: 99, name: "Spanish Grand Prix", year: 2026 }]);
    F1API.sessionsForMeeting = () => Promise.resolve([meta]);
    F1API.sessionDrivers = () => Promise.resolve(drivers);
    F1API.sessionResult = () => Promise.resolve(drivers.map((d, i) => ({
      num: d.num, pos: i + 1, laps: 57, duration: 5670 + i, gap: i * 2.1,
      points: i < 10 ? 25 - i : 0, dnf: false, dns: false, dsq: false,
    })));
    F1API.weather = () => Promise.resolve({ airT: 31.4, trackT: 53.3, humidity: 21.4, rainfall: 0, windSpeed: 2.2 });
    F1API.livePositions = () => Promise.resolve({
      values: drivers.map((d, i) => ({ num: d.num, pos: i + 1, timeDiff: i * 1.5 })),
      cursor: "2026-09-13T06:10:00Z",
    });
    F1API.liveIntervals = () => Promise.resolve({ values: {}, cursor: "2026-09-13T06:10:00Z" });
    F1API.fastestLap = () => Promise.resolve(null);
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await expect(page.getByRole("dialog", { name: "F1 DATA HUB" })).toBeVisible();
}

test("Duel help belongs to the Duel control at every grid width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 525 });
  await waitReady(page);
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();

  await page.locator("#rs-fold-field-sum").click();

  for (const mode of [
    { width: 1024, height: 525, columns: 2 },
    { width: 430, height: 800, columns: 1 },
  ]) {
    await page.setViewportSize({ width: mode.width, height: mode.height });
    await expect(page.locator("#rs-duel")).toBeVisible();
    await expect(page.locator("#rs-duel-help")).toBeVisible();
    await expect(page.locator("#rs-caution")).toBeVisible();

    const relation = await page.evaluate(() => {
      const fold = document.getElementById("rs-fold-field");
      const duel = document.getElementById("rs-duel");
      const help = document.getElementById("rs-duel-help");
      const caution = document.getElementById("rs-caution");
      const dr = duel.getBoundingClientRect();
      const hr = help.getBoundingClientRect();
      const cr = caution.getBoundingClientRect();
      return {
        open: fold.open,
        columns: getComputedStyle(fold).gridTemplateColumns.split(" ").filter(Boolean).length,
        parent: help.parentElement.id,
        contained:
          hr.top >= dr.top - 1 && hr.bottom <= dr.bottom + 1 &&
          hr.left >= dr.left - 1 && hr.right <= dr.right + 1,
        cautionFollowsHelp: cr.top >= hr.bottom - 1,
      };
    });
    expect(relation).toEqual({
      open: true,
      columns: mode.columns,
      parent: "rs-duel",
      contained: true,
      cautionFollowsHelp: true,
    });
  }
});

test("choosing a free Time Trial circuit clears Daily Standard chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 525 });
  await waitReady(page);
  await page.locator("#mb-daily").click();
  await expect(page.locator("#sel-daily")).toHaveAttribute("aria-pressed", "true");

  const free = page.locator(".track-row:not(.active)").first();
  const freeName = await free.getAttribute("aria-label");
  await free.click();

  await expect(page.locator("#sel-daily")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#sel-daily")).toContainText("TODAY'S CHALLENGE");
  await expect(page.locator("#sel-daily")).not.toContainText("DAILY STANDARD");
  await expect(page.locator(`.track-row[aria-label="${freeName}"]`)).toHaveAttribute("aria-pressed", "true");
});

test("Results preserves complete driver and team names without table overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await dataReady(page);
  await page.getByRole("tab", { name: "RESULTS" }).click();
  await expect(page.locator(".dh-td-driver").first()).toContainText("Andrea Kimi Antonelli");

  const fit = await page.evaluate(() => {
    const driver = document.querySelector(".dh-td-driver");
    const team = document.querySelector(".dh-td-team");
    const table = document.querySelector(".dh-table");
    const content = document.querySelector(".dh-content");
    return {
      driverWhiteSpace: getComputedStyle(driver).whiteSpace,
      teamWhiteSpace: getComputedStyle(team).whiteSpace,
      driverFits: driver.scrollWidth <= driver.clientWidth + 1,
      teamFits: team.scrollWidth <= team.clientWidth + 1,
      tableFits: table.getBoundingClientRect().right <= content.getBoundingClientRect().right + 1,
    };
  });
  expect(fit).toEqual({
    driverWhiteSpace: "normal",
    teamWhiteSpace: "normal",
    driverFits: true,
    teamFits: true,
    tableFits: true,
  });
});

test("Results never ellipsises a driver surname on a phone at UI SIZE 200%", async ({ page }) => {
  // 844x390 @200%: the driver column (~106px) is narrower than the unbreakable
  // surname HULKENBERG; the shared .dh-name ellipsis cut it to "HULKENBE…"
  // (UI-G survey 2026-10-17). The surname must wrap inside its cell instead.
  await page.setViewportSize({ width: 844, height: 390 });
  await dataReady(page);
  await page.evaluate(() => {
    document.body.dataset.width = "narrow"; document.body.dataset.density = "compact"; document.body.dataset.shape = "wide";
    document.documentElement.style.setProperty("--ui-scale", "2");
    document.getElementById("datahub").style.zoom = "2";
  });
  await page.getByRole("tab", { name: "RESULTS" }).click();
  await expect(page.locator(".dh-td-driver").first()).toContainText("Andrea Kimi Antonelli");
  await page.evaluate(() => { document.querySelector(".dh-td-driver .dh-name").textContent = "Nico HULKENBERG"; });
  const names = await page.$$eval(".dh-td-driver .dh-name", (els) => els.map((e) => ({
    text: e.textContent, w: e.clientWidth, sw: e.scrollWidth })));
  for (const n of names) {
    expect(n.sw, `${n.text} is cut off (${n.w}px of ${n.sw}px)`).toBeLessThanOrEqual(n.w + 1);
  }
});

test("Live uses the hub content as its only stacked scroll owner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await dataReady(page);
  await page.getByRole("tab", { name: "LIVE" }).click();
  await expect(page.locator(".dh-class-rows .dh-row")).toHaveCount(20);
  // Swap-loaded fonts change glyph overflow; measure the settled layout.
  await page.evaluate(() => document.fonts.ready);

  // Field-by-field: the live reporter truncates a deep toEqual to
  // "Received + 1" and swallows which key flipped (ui-scale.spec.js lesson).
  const overflow = await page.evaluate(() => {
    const content = document.querySelector(".dh-content");
    const right = document.querySelector(".dh-split-R");
    const split = document.querySelector(".dh-split");
    return {
      outerY: getComputedStyle(content).overflowY,
      rightX: getComputedStyle(right).overflowX,
      rightY: getComputedStyle(right).overflowY,
      splitGrow: getComputedStyle(split).flexGrow,
      rightHorizontalOverflow: right.scrollWidth > right.clientWidth + 1,
      rightScrollDelta: right.scrollWidth - right.clientWidth,
    };
  });
  expect(overflow.outerY, "hub content owns vertical scroll").toBe("auto");
  expect(overflow.rightX, "right pane must not own horizontal scroll").toBe("visible");
  expect(overflow.rightY, "right pane must not own vertical scroll").toBe("visible");
  expect(overflow.splitGrow, "stacked split must not flex-grow into a second scroller").toBe("0");
  expect(
    overflow.rightHorizontalOverflow,
    `right pane must not grow sideways (scrollDelta=${overflow.rightScrollDelta})`,
  ).toBe(false);
  const bars = await page.locator(".dh-live-gapbar").evaluateAll((els) =>
    els.slice(0, 2).map((el) => el.getBoundingClientRect().width));
  expect(bars[0], "smaller gaps retain a smaller bar").toBeLessThan(bars[1]);
});

test("Export explains the Gather prerequisite before Download is ready", async ({ page }) => {
  await dataReady(page);
  // GPS trace export belongs to Developer tools rather than the player tab rail.
  await page.locator(".dh-developer-tools > summary").click();
  await page.getByRole("button", { name: "GPS TRACE EXPORT", exact: true }).click();
  const status = page.locator(".dh-export-status");
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();
  await expect(status).toContainText("Not gathered yet");
  await expect(status).toContainText("about 10 minutes");
  await expect(status).toContainText("Download unlocks");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
});

test("Telemetry explains driver selection and comparison before using lane terms", async ({ page }) => {
  await dataReady(page);
  await page.getByRole("tab", { name: "TELEMETRY" }).click();
  await expect(page.getByRole("heading", { name: "SELECT DRIVERS" })).toBeVisible();
  const antonelli = page.getByRole("button", { name: "Select Andrea Kimi Antonelli" });
  await expect(antonelli).toContainText("ANT");
  await expect(antonelli).toContainText("Antonelli");
  const empty = page.locator(".dh-telem-detail");
  await expect(empty).toContainText("Select one driver");
  await expect(empty).toContainText("Select a second");
  await expect(empty).toContainText("reference");
});
