// @ts-check
// UI audit — captures every screen/menu at four viewports.
//
// A CAPTURE HARNESS, not a test file: its product is a PNG gallery and it
// asserts nothing beyond "the screen appeared". That is legitimate for what it
// does and misleading where it sat — inside `test:ui`, where its 39 green ticks
// were counted as coverage alongside real assertions, while dominating the
// group's wall time (13-108 s per shot). It now has its own on-demand group.
//
// Run with: npm run test:gallery   (or: npm test -- tests/specs/ui-audit.spec.js)
// Output: artifacts/galleries-<port>/ui-audit/
//
// tools/ci/assert-audit.mjs allow-lists this file by name. If it ever grows real
// assertions, tests/unit/assert-audit.test.mjs fails and says so — the exemption is
// not allowed to quietly cover a file that stopped being a harness.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { setupApiMocks } from "../helpers/f1-api-mock.js";
import { galleryPath } from "../helpers/output-paths.js";

const PORTRAIT  = { width: 390, height: 844 };   // iPhone 14
const LANDSCAPE = { width: 844, height: 390 };   // same rotated

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

async function waitTabLoaded(page) {
  // Wait until the data hub spinner is gone (API resolved or failed), cap at 8s
  await page.waitForFunction(() => !document.querySelector(".dh-spinner"), null, { polling: 100, timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// A championship weekend opens with QUALIFYING, so #rs-go lands on the sheet
// rather than on track: SIMULATE takes the modelled lap, TO THE GRID starts the
// race. Season and career both; only a one-off Grand Prix still goes straight in.
async function qualiToGrid(page) {
  await page.locator("#quali").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#q-sim").click();
  await page.locator("#q-go").click();
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: galleryPath("ui-audit", `${name}.png`), fullPage: false });
}

for (const [orient, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  test.describe(`UI audit — ${orient}`, () => {
    test.use({ viewport: vp });

    test("01 main menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await shot(page, `${orient}-01-main-menu`);
    });

    test("02 select screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${orient}-02-select`);
    });

    test("03 customize my team", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      // MY TEAM lives in the garage's TEAM tab now, not on the select screen.
      await page.locator("#sel-car").click();
      await page.locator("#carsetup").waitFor({ state: "visible" });
      await page.locator('#cs-tabs [data-cs-cat="team"]').click();
      await page.locator("#cs-customize").click();
      await page.locator("#customize").waitFor({ state: "visible" });
      await shot(page, `${orient}-03-customize`);
    });

    test("04 car setup", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-car").click();
      await page.locator("#carsetup").waitFor({ state: "visible" });
      await shot(page, `${orient}-04-carsetup`);
    });

    test("05 race settings", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await shot(page, `${orient}-05-race-settings`);
    });

    test("06 how to play", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-help").click();
      await page.locator("#howtoplay").waitFor({ state: "visible" });
      await shot(page, `${orient}-06-howtoplay`);
    });

    test("07 in-race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-07-hud`);
    });

    test("08 pause menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        window.__apex.park(0.1);
        // Show pause menu directly to avoid the #rotate-device overlay blocking
        // the pause button in portrait orientation.
        document.getElementById("pausemenu").hidden = false;
      });
      await page.locator("#pausemenu").waitFor({ state: "visible" });
      await shot(page, `${orient}-08-pause`);
    });

    test("09 results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-09-results`);
    });

    test("10 f1 data hub", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await waitTabLoaded(page);
      await shot(page, `${orient}-10-datahub`);
    });

    test("11 time trial select", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-tt").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${orient}-11-time-trial`);
    });

    test("12 in-race hood camera", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        window.__apex.camera("hood");
        window.__apex.park(0.1);
        window.__apex.jump(0.1, 50, 0);
        window.__apex.snapCam();
      });
      await page.waitForTimeout(600);
      await shot(page, `${orient}-12-hood-cam`);
    });

    test("13 track detail modal", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      // Click the circuit preview map — triggers openTrackDetail() with real canvas/elevation
      await page.locator("#sel-preview-map").click();
      await page.locator("#track-detail").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-13-track-detail`);
    });

    test("14 advanced steering", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => { window.__apex.race("bahrain"); });
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        // Hide the rotate-device overlay so it doesn't intercept clicks in portrait
        const rd = document.getElementById("rotate-device");
        if (rd) rd.hidden = true;
        document.getElementById("pausemenu").hidden = false;
      });
      await page.locator("#pm-settings").click();
      await page.locator("#pmsettings").waitFor({ state: "visible" });
      await page.locator("#pm-tab-more").click();
      await page.locator("#pm-advanced").click();
      await page.locator("#advanced").waitFor({ state: "visible" });
      await shot(page, `${orient}-14-advanced-steering`);
    });

    test("15 season standings panel", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      // Start a season race, finish it, then open standings from main menu
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await page.locator("#rs-go").click();
      await qualiToGrid(page);
      await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.locator("#res-menu").click();
      await page.waitForTimeout(300);
      await page.locator("#mb-standings").waitFor({ state: "visible" });
      await page.locator("#mb-standings").click();
      await page.locator("#standings").waitFor({ state: "visible" });
      await shot(page, `${orient}-15-standings`);
    });

    test("16 standings", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      // Start a season and go to standings
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-16-season-select`);
    });

    test("17 wet weather HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain", "day", "wet"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-17-hud-wet`);
    });

    test("18 night race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("singapore", "night", "dry"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-18-hud-night`);
    });

    test("19 cockpit camera", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        window.__apex.camera("cockpit");
        window.__apex.park(0.1);
        window.__apex.jump(0.1, 50, 0);
        window.__apex.snapCam();
      });
      await page.waitForTimeout(600);
      await shot(page, `${orient}-19-cockpit-cam`);
    });

    test("20 TT results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.tt("monza"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-20-results-tt`);
    });

    test("21 season results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await page.locator("#rs-go").click();
      await qualiToGrid(page);
      await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-21-results-season`);
    });

    test("22 advanced steering expanded", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        const rd = document.getElementById("rotate-device");
        if (rd) rd.hidden = true;
        document.getElementById("pausemenu").hidden = false;
      });
      await page.locator("#pm-settings").click();
      await page.locator("#pmsettings").waitFor({ state: "visible" });
      await page.locator("#pm-tab-more").click();
      await page.locator("#pm-advanced").click();
      await page.locator("#advanced").waitFor({ state: "visible" });
      await page.locator("#adv-more").click();
      await page.locator("#adv-extra").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-22-advanced-expanded`);
    });

    test("23 portrait rotate-device overlay", async ({ page }) => {
      if (orient === "landscape") { test.skip(true, "the rotate-device overlay only exists in portrait"); return; }
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
      // Do NOT hide rotate-device — that is the whole point of this test
      await page.evaluate(() => window.__apex.go());
      await page.waitForTimeout(500);
      await shot(page, `${orient}-23-rotate-device`);
    });

    test("24 data hub schedule tab", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await waitTabLoaded(page);
      await shot(page, `${orient}-24-datahub-schedule`);
    });

    test("25 data hub standings tab", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "STANDINGS" }).click();
      await waitTabLoaded(page);
      await shot(page, `${orient}-25-datahub-standings`);
    });

    test("26 data hub last race tab", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "LAST RACE" }).click();
      await waitTabLoaded(page);
      await shot(page, `${orient}-26-datahub-lastrace`);
    });

    test("27 data hub live tab", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "LIVE" }).click();
      await waitTabLoaded(page);
      // Wait for the live classification to populate (refresh fires automatically)
      await page.waitForFunction(() => !document.querySelector(".dh-spinner"), null, { polling: 100, timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, `${orient}-27-datahub-live`);
    });

    test("28 data hub telemetry tab", async ({ page }) => {
      await setupApiMocks(page);
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "TELEMETRY" }).click();
      await waitTabLoaded(page);  // waits for sessionDrivers to load (driver chips appear)
      // Click the first driver chip (NOR)
      await page.locator(".dh-dchip").first().click();
      // Wait for telemetry chart to finish loading
      await page.waitForFunction(() => !document.querySelector(".dh-spinner"), null, { polling: 100, timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, `${orient}-28-datahub-telemetry`);
    });

    // #career is one sheet in THREE states that share no layout: CAREER MODES is
    // two columns of save slots, the new-career setup is a form, the hub is a
    // dashboard. All three are shot.
    test("29 career modes", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-career").click();
      await page.locator("#career").waitFor({ state: "visible" });
      await shot(page, `${orient}-29-career-modes`);
    });

    test("29b career setup", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-career").click();
      await page.locator("#career").waitFor({ state: "visible" });
      // An empty driver slot is the way into the form.
      await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
      await shot(page, `${orient}-29b-career-setup`);
    });

    test("29c career guide", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-career").click();
      await page.locator("#cr-guide-myteam").click();
      await page.locator("#career-guide").waitFor({ state: "visible" });
      await shot(page, `${orient}-29c-career-guide-myteam`);
    });

    test("30 career hub", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      // Started through the hook: the shot is of the hub, not of filling the form in.
      await page.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 4242 }));
      await page.locator("#career").waitFor({ state: "visible" });
      await shot(page, `${orient}-30-career-hub`);
    });

    test("31 qualifying sheet", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await page.locator("#rs-go").click();
      // Before the session: the modelled field, with DRIVE MY LAP still on offer.
      await page.locator("#quali").waitFor({ state: "visible", timeout: 20_000 });
      await shot(page, `${orient}-31-quali`);
    });

    test("32 career offers", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => {
        window.__apex.career({ teamId: "haas", seat: 1, seed: 4242 });
        window.__apex.careerRollover();   // archive the year, put seats on the table
      });
      await page.locator("#career").waitFor({ state: "visible" });
      // The foot still reads GO RACING — the hub was built before the rollover, and
      // only the debug hook can roll over without rebuilding it. The handler is not
      // stale: pending offers outrank everything else in it.
      await page.locator("#cr-go").click();
      await page.locator("#career-offers").waitFor({ state: "visible" });
      await shot(page, `${orient}-32-career-offers`);
    });
  });
}

// ─── large screens ────────────────────────────────────────────────────────────
//
// Absorbed from the former ui-desktop.spec.js (deleted), which captured five screens
// at iPad and desktop sizes and asserted nothing — a strict subset of the
// screens above, in a second file, in the same group, contributing five more
// green ticks that meant "the page booted". One capture harness is enough.
//
// These five are a SUBSET on purpose rather than two more rows of the outer
// loop: running all 32 screens at four viewports would quadruple the slowest
// file in the suite to catch layout breakage that the portrait/landscape pair
// already surfaces. What large screens genuinely change is the menu shell and
// the HUD's use of the extra width, so those are what get shot.
const IPAD    = { width: 1024, height: 768 };
const DESKTOP = { width: 1280, height: 800 };

// The shared prologue for the in-race shots. park() freezes physics but the
// render loop keeps running, so give it time to present a settled frame.
async function raceParked(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.waitForTimeout(800);
}

for (const [label, vp] of [["ipad", IPAD], ["desktop", DESKTOP]]) {
  test.describe(`UI audit — ${label}`, () => {
    test.use({ viewport: vp });

    test("01 main menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await shot(page, `${label}-01-main-menu`);
    });

    test("02 select screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${label}-02-select`);
    });

    test("06 how to play", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-help").click();
      await page.locator("#howtoplay").waitFor({ state: "visible" });
      await shot(page, `${label}-06-howtoplay`);
    });

    test("07 in-race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await raceParked(page);
      await shot(page, `${label}-07-hud`);
    });

    test("08 pause menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await raceParked(page);
      await page.locator("#pausebtn").click();
      await page.locator("#pausemenu").waitFor({ state: "visible" });
      await shot(page, `${label}-08-pause`);
    });
  });
}
