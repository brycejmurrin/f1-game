// @ts-check
// Regression coverage for the browser-hunt UI defects fixed together in Track B.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { BOOT_MS } from "../helpers/fixtures.js";

async function waitReady(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
}

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
    "/js/core/log.js", "/js/ui/modal.js", "/js/core/mat4.js", "/js/ui/dom.js",
    "/js/data/api.js", "/js/data/telemetry.js", "/js/data/export.js",
    "/js/data/schedule.js", "/js/data/standings.js", "/js/data/results.js",
    "/js/data/live.js", "/js/data/hub.js",
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

  const snapshot = () => page.evaluate(() => {
    const ids = ["rs-body", "rs-fold-field", "rs-fold-field-sum", "rs-duel", "rs-duel-help", "rs-caution"];
    const fields = Object.fromEntries(ids.map((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return [id, {
        rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left },
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        gridColumn: cs.gridColumn,
        hidden: el.hidden,
        checkVisibility: el.checkVisibility(),
        clientRects: el.getClientRects().length,
        offsetParent: el.offsetParent?.id || null,
      }];
    }));
    const dr = fields["rs-duel"].rect;
    const hr = fields["rs-duel-help"].rect;
    const cr = fields["rs-caution"].rect;
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      fieldOpen: document.getElementById("rs-fold-field").open,
      fieldAriaExpanded: document.getElementById("rs-fold-field-sum").getAttribute("aria-expanded"),
      bodyGridTemplateColumns: getComputedStyle(document.getElementById("rs-body")).gridTemplateColumns,
      foldGridTemplateColumns: getComputedStyle(document.getElementById("rs-fold-field")).gridTemplateColumns,
      parent: document.getElementById("rs-duel-help").parentElement.id,
      belowDuel: hr.top >= dr.top && hr.left >= dr.left - 1 && hr.right <= dr.right + 1,
      duelOverlap: overlap(hr, dr),
      cautionOverlap: overlap(hr, cr),
      fields,
    };
  });

  const relation = await snapshot();
  // #region agent log
  fs.appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "A,D", location: "tests/specs/browser-ui-hunt.spec.js:duel-closed", message: "Duel relation while FIELD has its default state", data: relation, timestamp: Date.now() }) + "\n");
  // #endregion

  await page.locator("#rs-fold-field-sum").click();
  const wideOpen = await snapshot();
  // #region agent log
  fs.appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "B,C,D", location: "tests/specs/browser-ui-hunt.spec.js:duel-wide-open", message: "Duel relation with FIELD open above the container breakpoint", data: wideOpen, timestamp: Date.now() }) + "\n");
  // #endregion

  await page.setViewportSize({ width: 430, height: 800 });
  const narrowOpen = await snapshot();
  // #region agent log
  fs.appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "B,C", location: "tests/specs/browser-ui-hunt.spec.js:duel-narrow-open", message: "Duel relation with FIELD open below the container breakpoint", data: narrowOpen, timestamp: Date.now() }) + "\n");
  // #endregion

  // Restore the exact failing state so Playwright's configured failure
  // screenshot is evidence of the original closed/wide disclosure.
  await page.setViewportSize({ width: 1024, height: 525 });
  await page.locator("#rs-fold-field-sum").click();
  expect(relation.parent).toBe("rs-duel");
  expect(relation.belowDuel).toBe(true);
  expect(relation.duelOverlap).toBeGreaterThan(relation.cautionOverlap);
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

test("Live uses the hub content as its only stacked scroll owner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await dataReady(page);
  await page.getByRole("tab", { name: "LIVE" }).click();
  await expect(page.locator(".dh-class-rows .dh-row")).toHaveCount(20);

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
    };
  });
  expect(overflow).toEqual({
    outerY: "auto",
    rightX: "visible",
    rightY: "visible",
    splitGrow: "0",
    rightHorizontalOverflow: false,
  });
});

test("Export explains the Gather prerequisite before Download is ready", async ({ page }) => {
  await dataReady(page);
  await page.getByRole("tab", { name: "EXPORT" }).click();
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
