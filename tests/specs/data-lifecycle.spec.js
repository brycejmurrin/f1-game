import { test, expect } from "@playwright/test";

const OPENF1 = "https://api.openf1.org/v1";

async function dataReady(page) {
  await page.goto("/version.json");
  // The real shell markup: #datahub is a <dialog> (round 11), and its open
  // state is driven by TopModal mirroring `hidden` onto showModal() — so the
  // harness carries topmodal.js too (loaded below), or every open() here
  // would leave a UA-hidden closed dialog.
  await page.setContent("<dialog id=\"datahub\" class=\"screen\" data-esc-close=\"dh-close-btn\" hidden></dialog>");
  await page.evaluate(() => {
    window.Teams = { LIST: [] };
  });
  // hub.js calls every tab module's create() at IIFE-eval time (see
  // HARD_EDGES in tools/manifest.cjs), so ALL data modules must load first.
  // mat4.js comes before them, and it is not optional: js/data/telemetry.js
  // aliases `const clamp = M4.clamp` at EVAL time, so without M4 telemetry.js
  // throws, DataTelemetry is stranded in its temporal dead zone, and hub.js's
  // top-level DataTelemetry.create(...) throws in turn — leaving DataHub dead
  // too. The symptom is a bare `ReferenceError: DataHub is not defined` from
  // the waitForFunction below, three links away from the cause. index.html has
  // always loaded mat4.js before js/data/*, so the app was never affected.
  // The ordering is now asserted: HARD_EDGES carries mat4.js -> telemetry.js.
  // log.js too, same trap as telemetry-compare's harness: hub.js's open() and
  // api.js's warnFetchFail log through the Log global (index.html loads it
  // before everything); this standalone harness threw "Log is not defined"
  // the moment either ran — red since the logging landed, whenever the suite
  // actually ran.
  await page.addScriptTag({ url: "/js/log.js" });
  await page.addScriptTag({ url: "/js/game/topmodal.js" });
  await page.addScriptTag({ url: "/js/mat4.js" });
  await page.addScriptTag({ url: "/js/data/api.js" });
  await page.addScriptTag({ url: "/js/data/telemetry.js" });
  await page.addScriptTag({ url: "/js/data/export.js" });
  await page.addScriptTag({ url: "/js/data/schedule.js" });
  await page.addScriptTag({ url: "/js/data/standings.js" });
  await page.addScriptTag({ url: "/js/data/lastrace.js" });
  await page.addScriptTag({ url: "/js/data/live.js" });
  await page.addScriptTag({ url: "/js/data/hub.js" });
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
    window.__life = {
      meetingCalls: [], sessionCalls: [], driverCalls: [],
      weatherCalls: [], positionCalls: [], intervalCalls: [], telemetryCalls: [], interval: null
    };
    F1API.schedule = () => Promise.resolve([]);
    F1API.driverStandings = () => Promise.resolve([]);
    F1API.constructorStandings = () => Promise.resolve([]);
    F1API.lastRace = () => Promise.resolve(null);
    F1API.latestSession = () => Promise.resolve(sessions[0]);
    F1API.meetings = (year) => {
      if (year === 2026 && !config.deferCurrentMeetings) return Promise.resolve(meetings);
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
      if (!config.deferDrivers && !config.deferLive) {
        return Promise.resolve([{ num: 1, code: "INI", name: "Initial Driver" }]);
      }
      const d = deferred();
      window.__life.driverCalls.push({ sessionKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.weather = (sessionKey) => {
      if (!config.deferLive) return Promise.resolve(null);
      const d = deferred();
      window.__life.weatherCalls.push({ sessionKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.positions = (sessionKey) => {
      if (!config.deferLive) return Promise.resolve(null);
      const d = deferred();
      window.__life.positionCalls.push({ sessionKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.livePositions = (sessionKey, cursor) => {
      if (!config.deferLive) return Promise.resolve({ values: [], cursor: cursor || null });
      const d = deferred();
      window.__life.positionCalls.push({ sessionKey, cursor, resolve: d.resolve });
      return d.promise;
    };
    F1API.intervals = (sessionKey) => {
      if (!config.deferLive) return Promise.resolve(null);
      const d = deferred();
      window.__life.intervalCalls.push({ sessionKey, resolve: d.resolve });
      return d.promise;
    };
    F1API.liveIntervals = (sessionKey, cursor) => {
      if (!config.deferLive) return Promise.resolve({ values: {}, cursor: cursor || null });
      const d = deferred();
      window.__life.intervalCalls.push({ sessionKey, cursor, resolve: d.resolve });
      return d.promise;
    };
    F1API.fastestLap = (sessionKey, num) => {
      if (!config.deferTelemetry) return Promise.resolve(null);
      const d = deferred();
      window.__life.telemetryCalls.push({ sessionKey, num, resolve: d.resolve });
      return d.promise;
    };
    if (config.captureInterval) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 30000) { window.__life.interval = fn; return 987654; }
        return nativeSetTimeout(fn, ms, ...args);
      };
      window.clearTimeout = (id) => { if (id !== 987654) nativeClearTimeout(id); };
    }
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
  await page.addScriptTag({ url: "/js/log.js" });   // warnFetchFail logs through Log
  await page.addScriptTag({ url: "/js/data/api.js" });
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

test("LIVE and TELEMETRY picker requests do not invalidate each other", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page, { deferCurrentMeetings: true });
  await page.evaluate(() => {
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await page.locator(".dh-tab").filter({ hasText: "LIVE" }).click();
  await expect.poll(() => page.evaluate(() => window.__life.meetingCalls.length)).toBe(1);
  await expect(page.locator(".dh-pick-select").first()).toHaveText("loading…");

  await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
  await expect.poll(() => page.evaluate(() => window.__life.meetingCalls.length)).toBe(2);
  await page.evaluate(() => {
    window.__life.meetingCalls[1].resolve([
      { meetingKey: 3, name: "Gamma GP", year: 2026 }
    ]);
  });
  await expect(page.locator(".dh-dchip")).toBeVisible();

  await page.evaluate(() => {
    window.__life.meetingCalls[0].resolve([
      { meetingKey: 3, name: "Gamma GP", year: 2026 }
    ]);
  });
  await page.locator(".dh-tab").filter({ hasText: "LIVE" }).click();

  await expect(page.locator(".dh-pick-select").first()).toHaveText("Gamma GP");
  await expect(page.locator(".dh-pick-select").nth(1)).not.toHaveText("loading…");
});

test("LIVE refreshes coalesce and AUTO schedules only after settlement", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page, { deferLive: true, captureInterval: true });
  await openLive(page);
  await expect.poll(() => page.evaluate(() => window.__life.weatherCalls.length)).toBe(1);

  await page.getByRole("button", { name: /REFRESH/ }).click();
  expect(await page.evaluate(() => window.__life.weatherCalls.length)).toBe(1);
  await page.getByRole("button", { name: "AUTO", exact: true }).click();
  expect(await page.getByRole("button", { name: /REFRESH/ }).getAttribute("aria-pressed")).toBeNull();
  await expect(page.getByRole("button", { name: "AUTO", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    const life = window.__life;
    life.weatherCalls[0].resolve(null);
    life.positionCalls[0].resolve([{ num: 44, pos: 1 }]);
    life.intervalCalls[0].resolve(null);
    life.driverCalls[0].resolve([{ num: 44, code: "NEW", name: "Newest Driver" }]);
  });
  const liveData = page.locator(".dh-split-R").first();
  await expect(liveData).toContainText("Newest Driver");
  await expect.poll(() => page.evaluate(() => typeof window.__life.interval)).toBe("function");
  await page.evaluate(() => window.__life.interval());
  await expect.poll(() => page.evaluate(() => window.__life.weatherCalls.length)).toBe(2);
});

test("deselecting every telemetry driver synchronously restores the empty state", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page, { deferTelemetry: true });
  await page.evaluate(() => {
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
  const driver = page.locator(".dh-dchip").first();
  await expect(driver).toBeVisible();

  // Current flow: chip click selects; the LOAD LAP button starts the fetch.
  await driver.click();
  await page.getByRole("button", { name: "LOAD LAP" }).click();
  await expect.poll(() => page.evaluate(() => window.__life.telemetryCalls.length)).toBe(1);
  await expect(page.locator(".dh-telem-detail .dh-spinner")).toHaveCount(1);
  await driver.click();

  await expect(page.locator(".dh-telem-detail .dh-spinner")).toHaveCount(0);
  await expect(page.locator(".dh-telem-detail")).toContainText("Pick 1");
});

test("data hub exposes modal tabs, traps focus, and restores its opener", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page);
  await page.evaluate(() => {
    const opener = document.createElement("button");
    opener.id = "data-opener";
    opener.textContent = "Open data";
    const after = document.createElement("button");
    after.id = "after-data";
    after.textContent = "After data";
    document.body.prepend(opener);
    document.body.appendChild(after);
    DataHub.init(document.getElementById("datahub"));
    opener.focus();
    DataHub.open();
  });

  const dialog = page.getByRole("dialog", { name: "F1 DATA HUB" });
  // A real <dialog> since round 11 — assert the modality itself, not an
  // aria-modal attribute nobody writes any more.
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.matches(":modal"))).toBe(true);
  await expect(page.getByRole("tablist")).toBeVisible();
  const schedule = page.getByRole("tab", { name: "SCHEDULE" });
  const standings = page.getByRole("tab", { name: "STANDINGS" });
  await expect(schedule).toHaveAttribute("aria-selected", "true");
  await expect(schedule).toBeFocused();
  await schedule.press("ArrowRight");
  await expect(standings).toBeFocused();
  await expect(standings).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", await standings.getAttribute("id"));

  const close = page.getByRole("button", { name: "Close data hub" });
  await standings.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(standings).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#data-opener")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#after-data")).toBeFocused();
});

test("telemetry popup is a labelled modal and restores driver focus", async ({ page }) => {
  await dataReady(page);
  await installPickerApi(page);
  await page.evaluate(() => {
    DataHub.init(document.getElementById("datahub"));
    DataHub.open();
  });
  await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
  const driver = page.getByRole("button", { name: "INI" });
  await driver.click();
  // Current flow: the popup opens from LOAD LAP, not from the chip itself.
  await page.getByRole("button", { name: "LOAD LAP" }).click();

  const popup = page.getByRole("dialog", { name: /Initial Driver/ });
  // A real <dialog> since round 11: the platform asserts the role and the
  // modality, so the old aria-modal attribute pin is replaced by the thing
  // it stood for — the dialog actually being modal.
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((d) => d.matches(":modal"))).toBe(true);
  const close = page.getByRole("button", { name: "Close telemetry" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await close.click();
  await expect(driver).toBeFocused();
});
