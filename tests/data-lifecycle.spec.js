import { test, expect } from "@playwright/test";

const OPENF1 = "https://api.openf1.org/v1";

async function dataReady(page) {
  await page.goto("/version.json");
  await page.setContent("<div id=\"datahub\" hidden></div>");
  await page.evaluate(() => {
    window.Teams = { LIST: [] };
  });
  await page.addScriptTag({ url: "/js/api.js" });
  await page.addScriptTag({ url: "/js/data-telemetry.js" });
  await page.addScriptTag({ url: "/js/data-export.js" });
  await page.addScriptTag({ url: "/js/data.js" });
  await page.waitForFunction(() => typeof F1API !== "undefined" && typeof DataHub !== "undefined");
}

async function openLive(page) {
  await page.evaluate(() => {
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await page.locator(".dh-tab").filter({ hasText: "LIVE" }).click();
  await expect(page.locator(".dh-picker")).toBeVisible();
  await expect(page.locator(".dh-pick-select").first()).not.toHaveText("loading…");
}

async function installPickerApi(page, options = {}) {
  await page.evaluate((config) => {
    function deferred() {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      return { promise, resolve };
    }
    const meetings = [
      { meetingKey: 1, name: "Alpha GP", year: 2026 },
      { meetingKey: 2, name: "Beta GP", year: 2026 },
      { meetingKey: 3, name: "Gamma GP", year: 2026 }
    ];
    const sessions = [
      { sessionKey: 11, meetingKey: 3, year: 2026, name: "Practice", type: "Practice" },
      { sessionKey: 12, meetingKey: 3, year: 2026, name: "Qualifying", type: "Qualifying" },
      { sessionKey: 13, meetingKey: 3, year: 2026, name: "Race", type: "Race" }
    ];
    window.__life = { meetingCalls: [], sessionCalls: [], driverCalls: [] };
    F1API.latestSession = () => Promise.resolve(sessions[0]);
    F1API.meetings = (year) => {
      if (year === 2026) return Promise.resolve(meetings);
      const d = deferred();
      window.__life.meetingCalls.push({ year, resolve: d.resolve });
      return d.promise;
    };
    F1API.sessionsForMeeting = (meetingKey) => {
      if (meetingKey === 3) return Promise.resolve(sessions);
      const d = deferred();
      window.__life.sessionCalls.push({ meetingKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.sessionDrivers = (sessionKey) => {
      if (!config.deferDrivers) {
        return Promise.resolve([{ num: 1, code: "INI", name: "Initial Driver" }]);
      }
      const d = deferred();
      window.__life.driverCalls.push({ sessionKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.weather = () => Promise.resolve(null);
    F1API.positions = () => Promise.resolve(null);
  }, options);
}

test("meeting session lists refresh recent meetings but retain historic lists", async ({ page }) => {
  let recentMeetingSessionRequests = 0;
  let historicMeetingSessionRequests = 0;
  const now = Date.now();
  const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const historicDate = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();

  await page.route(`${OPENF1}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/meetings")) {
      await route.fulfill({
        json: [
          { meeting_key: 101, meeting_name: "Recent GP", date_start: recentDate },
          { meeting_key: 202, meeting_name: "Historic GP", date_start: historicDate }
        ]
      });
      return;
    }
    if (url.searchParams.get("meeting_key") === "101") recentMeetingSessionRequests++;
    if (url.searchParams.get("meeting_key") === "202") historicMeetingSessionRequests++;
    await route.fulfill({ json: [] });
  });

  await page.goto("/version.json");
  await page.setContent("<div></div>");
  await page.addScriptTag({ url: "/js/api.js" });
  await page.waitForFunction(() => typeof F1API !== "undefined");
  await page.evaluate(async () => {
    localStorage.clear();
    await F1API.meetings(2026);
    await F1API.sessionsForMeeting(101);
    await F1API.sessionsForMeeting(202);
    [101, 202].forEach((key) => {
      const url = `https://api.openf1.org/v1/sessions?meeting_key=${key}`;
      const cacheKey = `apex26.api.${url}`;
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      cached.t -= 11 * 60 * 1000;
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    });
    await F1API.sessionsForMeeting(101);
    await F1API.sessionsForMeeting(202);
  });

  expect(recentMeetingSessionRequests).toBe(2);
  expect(historicMeetingSessionRequests).toBe(1);
});

test("latest year response owns the meeting options", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page);
  await openLive(page);

  await page.getByRole("button", { name: "2025", exact: true }).click();
  await page.getByRole("button", { name: "2024", exact: true }).click();
  await page.evaluate(() => {
    window.__life.meetingCalls.find((x) => x.year === 2024).resolve([
      { meetingKey: 24, name: "Last Selected Year GP", year: 2024 }
    ]);
  });
  await expect(page.locator(".dh-pick-select").first().locator("option")).toHaveText(["Last Selected Year GP"]);
  await page.evaluate(() => {
    window.__life.meetingCalls.find((x) => x.year === 2025).resolve([
      { meetingKey: 25, name: "Stale Year GP", year: 2025 }
    ]);
  });

  await expect(page.locator(".dh-pick-select").first().locator("option")).toHaveText(["Last Selected Year GP"]);
});

test("latest meeting response owns the session options", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page);
  await openLive(page);

  const gp = page.locator(".dh-pick-select").first();
  await gp.selectOption("1");
  await gp.selectOption("2");
  await page.evaluate(() => {
    window.__life.sessionCalls.find((x) => x.meetingKey === 2).resolve([
      { sessionKey: 22, meetingKey: 2, name: "Last Selected Meeting Session", type: "Practice" }
    ]);
  });
  await expect(page.locator(".dh-pick-select").nth(1).locator("option")).toHaveText(["Last Selected Meeting Session"]);
  await page.evaluate(() => {
    window.__life.sessionCalls.find((x) => x.meetingKey === 1).resolve([
      { sessionKey: 21, meetingKey: 1, name: "Stale Meeting Session", type: "Practice" }
    ]);
  });

  await expect(page.locator(".dh-pick-select").nth(1).locator("option")).toHaveText(["Last Selected Meeting Session"]);
});

test("latest telemetry driver response owns the driver chips", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page, { deferDrivers: true });
  await page.evaluate(() => {
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
  await expect(page.locator(".dh-picker")).toBeVisible();
  await expect(page.locator(".dh-pick-select").nth(1).locator("option")).toHaveCount(3);

  const session = page.locator(".dh-pick-select").nth(1);
  await session.selectOption("12");
  await session.selectOption("13");
  await page.evaluate(() => {
    window.__life.driverCalls.find((x) => x.sessionKey === 13).resolve([
      { num: 13, code: "NEW", name: "Latest Driver" }
    ]);
  });
  await expect(page.locator(".dh-dchip")).toHaveText(["NEW"]);
  await page.evaluate(() => {
    window.__life.driverCalls.find((x) => x.sessionKey === 12).resolve([
      { num: 12, code: "OLD", name: "Stale Driver" }
    ]);
  });

  await expect(page.locator(".dh-dchip")).toHaveText(["NEW"]);
});
