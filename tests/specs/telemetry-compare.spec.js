// @ts-check
// Data hub TELEMETRY — multi-lane comparison + cross-session (race vs quali).
// Drives the real telemetry UI with a stubbed F1API (the live endpoints are
// network-blocked), a small circular GPS lap per driver so the map + dots draw.
import { test, expect } from "@playwright/test";

async function dataReady(page) {
  await page.goto("/version.json");
  await page.setContent('<div id="datahub" hidden></div>');
  await page.evaluate(() => { window.Teams = { LIST: [] }; });
  // mat4.js FIRST, and it is not optional: js/data/telemetry.js aliases
  // `const clamp = M4.clamp` at EVAL time (telemetry.js), so without M4 that
  // file throws, DataTelemetry is stranded in its temporal dead zone, and
  // hub.js's top-level `DataTelemetry.create(...)` throws in turn — leaving
  // DataHub dead too. The symptom is a bare `ReferenceError: DataHub is not
  // defined` from the waitForFunction below, three links from the cause.
  // index.html has always loaded mat4.js before js/data/*, so the app was
  // never affected; only this standalone harness was. The ordering is now
  // asserted too: HARD_EDGES carries mat4.js -> js/data/telemetry.js.
  // log.js too: hub.js's open() logs through the Log global (index.html loads
  // it before everything); without it this standalone harness threw
  // "Log is not defined" the moment a test called DataHub.open — red since
  // the logging landed, whenever the suite actually ran.
  await page.addScriptTag({ url: "/js/log.js" });
  await page.addScriptTag({ url: "/js/mat4.js" });
  for (const u of ["api", "telemetry", "export", "schedule", "standings", "lastrace", "live", "hub"])
    await page.addScriptTag({ url: "/js/data/" + u + ".js" });
  await page.waitForFunction(() => typeof F1API !== "undefined" && typeof DataHub !== "undefined");
}

// A circular lap: N drivers each get GPS + car data so map dots and delta draw.
// Different lap durations per driver so deltas are non-trivial.
async function stubApi(page) {
  await page.evaluate(() => {
    const SESSIONS = [
      { sessionKey: 9997, meetingKey: 1234, year: 2026, name: "Qualifying", type: "Qualifying", circuit: "Montreal", country: "Canada" },
      { sessionKey: 9999, meetingKey: 1234, year: 2026, name: "Race", type: "Race", circuit: "Montreal", country: "Canada" }
    ];
    const DRIVERS = [
      { num: 1,  code: "NOR", name: "Lando Norris",   color: "FF8000", team: "McLaren" },
      { num: 63, code: "RUS", name: "George Russell", color: "27F4D2", team: "Mercedes" },
      { num: 16, code: "LEC", name: "Charles Leclerc", color: "E8002D", team: "Ferrari" },
      { num: 44, code: "HAM", name: "Lewis Hamilton",  color: "E8002D", team: "Ferrari" }
    ];
    function lap(dur) {
      const car = [], loc = [], t0 = 1e12;
      for (let i = 0; i * 0.1 <= dur; i++) {
        const t = i * 0.1, a = (t / dur) * 2 * Math.PI;
        car.push({ t, date: t0 + t * 1000, speed: 200 + 40 * Math.sin(a), throttle: 80, brake: 0, gear: 6, rpm: 11000, drs: 8 });
      }
      for (let i = 0; i * 0.27 <= dur; i++) {
        const t = i * 0.27, a = (t / dur) * 2 * Math.PI;
        loc.push({ x: 3000 + 1600 * Math.cos(a), y: 4000 + 1400 * Math.sin(a), date: t0 + t * 1000 });
      }
      return { car, loc };
    }
    F1API.schedule = () => Promise.resolve([]);
    F1API.driverStandings = () => Promise.resolve([]);
    F1API.constructorStandings = () => Promise.resolve([]);
    F1API.lastRace = () => Promise.resolve(null);
    F1API.latestSession = () => Promise.resolve(SESSIONS[1]);   // default to Race
    F1API.meetings = () => Promise.resolve([{ meetingKey: 1234, name: "Canadian GP", year: 2026 }]);
    F1API.sessionsForMeeting = () => Promise.resolve(SESSIONS);
    F1API.sessionDrivers = () => Promise.resolve(DRIVERS.slice());
    // duration keyed off driver so laps differ; race (9999) a touch slower than quali
    F1API.fastestLap = (sk, num) => {
      const base = { 1: 75.1, 63: 75.6, 16: 76.0, 44: 76.4 }[num] || 76;
      const dur = base + (sk === 9999 ? 0.8 : 0);
      return Promise.resolve({ lapNumber: 44, lapDuration: dur, s1: dur * 0.3, s2: dur * 0.4, s3: dur * 0.3,
        dateStart: new Date(1e12).toISOString() });
    };
    F1API.carData = (sk, num) => Promise.resolve(lap(({ 1: 75.1, 63: 75.6, 16: 76.0, 44: 76.4 }[num] || 76) + (sk === 9999 ? 0.8 : 0)).car);
    F1API.locationData = (sk, num) => Promise.resolve(lap(({ 1: 75.1, 63: 75.6, 16: 76.0, 44: 76.4 }[num] || 76) + (sk === 9999 ? 0.8 : 0)).loc);
    F1API.stints = () => Promise.resolve([]);
    F1API.pits = () => Promise.resolve([]);
  });
}

async function openTelemetry(page) {
  await stubApi(page);
  await page.evaluate(() => { DataHub.init(document.getElementById("datahub")); DataHub.open(); });
  await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
  await expect(page.locator(".dh-dchip").first()).toBeVisible();
}

test("more drivers: three lanes load, each with its own colour and map dot", async ({ page }) => {
  await dataReady(page);
  await openTelemetry(page);

  // pick three drivers
  for (const c of ["NOR", "RUS", "LEC"]) await page.locator(".dh-dchip", { hasText: c }).click();
  await expect(page.locator(".dh-livecard .dh-row")).toHaveCount(3);   // three lanes in the tray
  await page.locator(".dh-livebtn", { hasText: "COMPARE 3 LANES" }).click();

  // popup: three legend chips, three map-legend chips, and a drawn map
  await expect(page.locator(".dh-tpopup")).toBeVisible();
  await expect(page.locator(".dh-legend .dh-codechip")).toHaveCount(3);
  await expect(page.locator(".dh-maplegend .dh-legend-item")).toHaveCount(4);   // 3 lanes + gradient key
  await expect(page.locator(".dh-laneboard-row")).toHaveCount(3);               // per-lane board (3-4 only)
  await expect(page.locator(".dh-delta")).toBeVisible();

  // the map canvas actually rendered something
  const painted = await page.locator("canvas.dh-map").evaluate((c) => {
    const g = c.getContext("2d"); const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  expect(painted).toBe(true);
});

test("cross-session: one driver's race lap vs qualifying lap", async ({ page }) => {
  await dataReady(page);
  await openTelemetry(page);

  // default session is Race — pick Norris
  await page.locator(".dh-dchip", { hasText: "NOR" }).click();
  await expect(page.locator(".dh-livecard .dh-row")).toHaveCount(1);

  // switch the SESSION dropdown to Qualifying; the tray must SURVIVE the switch
  const sesSel = page.locator(".dh-pick-select").nth(1);
  await sesSel.selectOption({ label: "Qualifying" });
  await expect(page.locator(".dh-dchip").first()).toBeVisible();
  await expect(page.locator(".dh-livecard .dh-row")).toHaveCount(1);   // Norris@Race still there

  // pick Norris again — now from Qualifying — for a second lane
  await page.locator(".dh-dchip", { hasText: "NOR" }).click();
  const rows = page.locator(".dh-livecard .dh-row");
  await expect(rows).toHaveCount(2);
  // both lanes are NOR, disambiguated by a session badge (R / Q)
  await expect(page.locator(".dh-lane-ses")).toHaveCount(2);
  const badges = await page.locator(".dh-lane-ses").allTextContents();
  expect(badges.sort()).toEqual(["Q", "R"]);

  await page.locator(".dh-livebtn", { hasText: "COMPARE 2 LANES" }).click();
  await expect(page.locator(".dh-tpopup")).toBeVisible();
  // title tags each NORRIS with its session; subtitle marks it cross-session
  await expect(page.locator(".dh-tpopup-title")).toContainText("Norris R");
  await expect(page.locator(".dh-tpopup-title")).toContainText("Norris Q");
  await expect(page.locator(".dh-tpopup-sub")).toContainText("cross-session");
});

test("a lane can be removed from the tray before loading", async ({ page }) => {
  await dataReady(page);
  await openTelemetry(page);
  for (const c of ["NOR", "RUS"]) await page.locator(".dh-dchip", { hasText: c }).click();
  await expect(page.locator(".dh-livecard .dh-row")).toHaveCount(2);
  await page.locator(".dh-row", { hasText: "NOR" }).locator(".dh-lane-x").click();
  await expect(page.locator(".dh-livecard .dh-row")).toHaveCount(1);
  await expect(page.locator(".dh-livecard .dh-row")).toContainText("RUS");
});
