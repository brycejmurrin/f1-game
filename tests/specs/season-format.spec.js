// @ts-check
// SEASON MODE, CUSTOMISED: the calendar the player chose and the format they
// chose it under. tests/specs/season.spec.js covers the DEFAULT season (round
// progression, points, standings) and must keep passing untouched — this file is
// only about what changes when the config is not the default one.
//
// The config is SEEDED through localStorage rather than clicked into
// #season-setup. Two reasons: it is ~20 s a case cheaper, and it keeps the RULES
// under test separate from the SCREEN that writes them (the screen's own DOM is
// covered by menu-survey). js/game/season-cal.js normalises whatever it reads,
// so a seeded config is the same object the editor would have produced.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

/** Seed the season config, then boot to the title screen.
 *
 *  EVERY STATEMENT IN HERE MUST BE IDEMPOTENT. addInitScript runs before EVERY
 *  navigation in the page, reloads included — so a `removeItem("apex26.season")`
 *  here (which this had, to defend against nothing: Playwright hands each test a
 *  fresh context with empty storage) fires again on `page.reload()` and deletes
 *  the very save the reload was meant to prove had survived. Seeding is safe;
 *  clearing is not. */
async function boot(page, cfg) {
  await page.addInitScript((c) => {
    localStorage.setItem("apex26.seasonCfg", JSON.stringify(c));
    // Retirements off: these tests are about who SCORES what, and a gearbox
    // failure on the way to a scripted win is noise with a 1-in-N chance of
    // reading as a points bug.
    localStorage.setItem("apex26.reliability", JSON.stringify("off"));
  }, cfg);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, undefined, { timeout: BOOT_MS, polling: 100 });
  // Nothing here asserts a pixel, so stop drawing the 3D scene behind the menus —
  // under SwiftShader that is pure CPU. See tests/specs/season.spec.js.
  await page.evaluate(() => window.__apex.headless(true));
}

/** #mb-season → select → garage → race settings, stopping before GO. */
async function toRaceSettings(page) {
  await page.locator("#mb-season").click();
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator("#cs-done").click();
  await page.locator("#carsetup").waitFor({ state: "hidden" });
  await page.locator("#race-settings").waitFor({ state: "visible" });
}

/** GO, take the simulated qualifying lap if the weekend runs one, and grid up. */
async function toTheGrid(page, { quali = true } = {}) {
  await page.locator("#rs-go").click();
  if (quali) {
    await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
    await page.locator("#q-sim").click();
    await page.locator("#q-go").click();
  }
  await page.waitForFunction(() => window.__apex && window.__apex.info().track != null,
    undefined, { timeout: BOOT_MS, polling: 100 });
}

/** Win the race outright and land on #results. park(0.9) is the furthest-along
 *  car, and finishRace() classifies by progress.
 *
 *  WAIT ON park()'s OWN RETURN, not on the game state. `info().state` turns
 *  "count" the moment startRace() is entered, but park() answers falsy until the
 *  track is built and the player has a world pose — and the Grand Prix leg of a
 *  sprint weekend re-enters startRace() straight off the results screen, where
 *  that build is deferred. Parking on the state alone passed alone and failed
 *  under parallel load, which is the signature of exactly this race. */
async function winAndFinish(page) {
  await page.waitForFunction(() => !!window.__apex.park(0.9), undefined,
    { timeout: 20_000, polling: 100 });
  await page.evaluate(() => window.__apex.finishRace());
  await expect(page.locator("#results")).toBeVisible({ timeout: 10_000 });
}

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("apex26.season")));
const myPts = (s) => Math.max(0, ...Object.values(s.pts || {}).map(Number));

// ── the calendar ──────────────────────────────────────────────────────────────

test.describe("Season — a custom calendar", () => {
  test.use({ viewport: LANDSCAPE });

  test("runs the circuits it names, in the order it names them", async ({ page }) => {
    await boot(page, { trackIds: ["monza", "monaco", "silverstone"] });
    await page.locator("#mb-season").click();
    await page.locator("#select").waitFor({ state: "visible" });
    // The select screen's own account of the calendar: its length, and round 1.
    await expect(page.locator("#sel-preview-rec")).toContainText("of 3");
    await expect(page.locator("#sel-tracks")).toContainText("MONACO");
    await page.locator("#sel-go").click();
    await page.locator("#cs-done").click();
    await toTheGrid(page);
    // info().track is the circuit ID, and only while a session is live.
    expect(await page.evaluate(() => window.__apex.info().track)).toBe("monza");
  });

  test("a classic circuit is a legal round", async ({ page }) => {
    // Classics are playable but are never a round of the BUILT-IN championship
    // (js/track/tracks.js SEASON filters them out). A player's calendar may name
    // them, which is the whole point of letting them build one.
    await boot(page, { trackIds: ["kyalami", "monza"] });
    await toRaceSettings(page);
    await toTheGrid(page);
    expect(await page.evaluate(() => window.__apex.info().track)).toBe("kyalami");
  });

  test("a shortened calendar crowns its champion at ITS last round", async ({ page }) => {
    // ONE round, deliberately. The claim under test is that the season ends at the
    // calendar's OWN length instead of at Tracks.SEASON's 24, and one round proves
    // that as sharply as two — while a second full weekend (menu → garage → quali
    // → race again) is another ~60 s and put this case at the 120 s test ceiling.
    // Round-to-round advancement is covered by the sprint cases below, which race
    // twice on one round, and by season.spec.js.
    await boot(page, { trackIds: ["monza"] });
    await toRaceSettings(page);
    await toTheGrid(page);
    await winAndFinish(page);
    expect((await saved(page)).round).toBe(1);
    // The last round is run, so the button offers to END the season rather than
    // to start round 2 of a calendar that has none.
    await expect(page.locator("#res-next")).toHaveText("FINISH SEASON");
    await page.locator("#res-next").click();
    // …and the FIRST click builds the champion panel in place rather than leaving
    // the results screen.
    await expect(page.locator("#results-title")).toHaveText("WORLD CHAMPION");
  });
});

// ── the weekend format ────────────────────────────────────────────────────────

test.describe("Season — the weekend format", () => {
  test.use({ viewport: LANDSCAPE });

  test("qualifying OFF grids the race without ever opening the sheet", async ({ page }) => {
    await boot(page, { trackIds: ["monza", "monaco"], quali: false });
    await toRaceSettings(page);
    await toTheGrid(page, { quali: false });
    expect(await page.locator("#quali").isHidden()).toBe(true);
    await winAndFinish(page);
    expect((await saved(page)).round).toBe(1);
  });

  test("the classic points table pays 10 for a win, not 25", async ({ page }) => {
    await boot(page, { trackIds: ["monza", "monaco"], points: "classic" });
    await toRaceSettings(page);
    await toTheGrid(page);
    await winAndFinish(page);
    expect(myPts(await saved(page))).toBe(10);
  });

  test("the format PRESELECTS the lap chips without taking them over", async ({ page }) => {
    // The distance is a format choice, but #rs-laps stays the one source of truth
    // for THIS race — three tests in season.spec.js set a chip and assert the race
    // honours it, and that has to keep working inside a customised season.
    await boot(page, { trackIds: ["monza", "monaco"], laps: 10 });
    await toRaceSettings(page);
    await expect(page.locator("#rs-laps .sel-chip.active")).toHaveText("10");
    await page.locator("#rs-laps .sel-chip").filter({ hasText: /^5$/ }).click();
    await toTheGrid(page);
    expect(await page.evaluate(() => window.__apex.info().lapsTarget)).toBe(5);
  });
});

// ── the sprint ────────────────────────────────────────────────────────────────

test.describe("Season — sprint weekends", () => {
  test.use({ viewport: LANDSCAPE });

  test("a sprint scores its own table and leaves the round open", async ({ page }) => {
    await boot(page, { trackIds: ["monza", "monaco"], sprint: true, laps: 10 });
    await toRaceSettings(page);
    await toTheGrid(page);
    // A third of the distance, and the results sheet says which session this was.
    expect(await page.evaluate(() => window.__apex.info().lapsTarget)).toBe(3);
    await winAndFinish(page);
    await expect(page.locator("#results-title")).toContainText("SPRINT");
    const afterSprint = await saved(page);
    expect(myPts(afterSprint), "a sprint win pays 8").toBe(8);
    expect(afterSprint.round, "…and the weekend is not over").toBe(0);
    expect(afterSprint.stage, "…the Grand Prix is what is owed").toBe("race");
    await expect(page.locator("#res-next")).toHaveText("TO THE GRAND PRIX");
  });

  test("the Grand Prix follows on the SAME circuit and closes the round", async ({ page }) => {
    await boot(page, { trackIds: ["monza", "monaco"], sprint: true, laps: 10 });
    await toRaceSettings(page);
    await toTheGrid(page);
    const circuit = await page.evaluate(() => window.__apex.info().track);
    await winAndFinish(page);

    // No second qualifying session: one per weekend, exactly as in the real
    // thing. res-next goes straight to the grid.
    await page.locator("#res-next").click();
    await page.waitForFunction(() => window.__apex.info().state === "count"
      || window.__apex.info().state === "race", undefined, { timeout: 20_000, polling: 100 });
    expect(await page.evaluate(() => window.__apex.info().track)).toEqual(circuit);
    expect(await page.evaluate(() => window.__apex.info().lapsTarget), "full distance now").toBe(10);

    await winAndFinish(page);
    const s = await saved(page);
    expect(myPts(s), "8 for the sprint plus 25 for the Grand Prix").toBe(33);
    expect(s.round, "…and NOW the round is closed").toBe(1);
    expect(s.stage, "…with the next weekend back at its sprint").toBeUndefined();
  });

  test("a sprint's points survive quitting to the menu mid-weekend", async ({ page }) => {
    // The stage lives on the season SAVE, written in the same store.set() that
    // banks the points — so a weekend that has already paid its sprint cannot
    // come back and pay it a second time.
    await boot(page, { trackIds: ["monza", "monaco"], sprint: true });
    await toRaceSettings(page);
    await toTheGrid(page);
    await winAndFinish(page);
    await page.locator("#res-menu").click();
    await page.waitForTimeout(300);
    // Scored, so STANDINGS is offered even though the round is still 0.
    await expect(page.locator("#mb-standings")).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, undefined, { timeout: BOOT_MS, polling: 100 });
    const s = await saved(page);
    expect(s.stage).toBe("race");
    expect(myPts(s)).toBe(8);
  });
});

test.describe("Season — completed championship", () => {
  test.use({ viewport: LANDSCAPE });

  test("shows a terminal screen and opens final standings instead of another race", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.season", JSON.stringify({
        round: 1,
        pts: { "ferrari:0": 25 },
        teamPts: { ferrari: 25 },
        driverCodes: { "ferrari:0": "LEC" },
      }));
    });
    await boot(page, { trackIds: ["monza"] });
    await page.locator("#mb-season").click();
    await expect(page.locator("#select-title")).toHaveText("SEASON COMPLETE");
    await expect(page.locator("#sel-go")).toHaveText("VIEW FINAL STANDINGS");
    await expect(page.locator("#sel-customise")).toHaveText("START NEW SEASON");

    await page.locator("#sel-go").click();
    await expect(page.locator("#standings")).toBeVisible();
    await expect(page.locator("#standings-title")).toHaveText("FINAL CHAMPIONSHIP");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.season")).round)).toBe(1);
    await expect(page.locator("#race-settings")).toBeHidden();
  });
});
