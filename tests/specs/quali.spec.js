// @ts-check
// One-lap qualifying: the simulated field, the sheet, and the grid it produces.
// Qualifying is a `session`, not a game state — it reuses the time-trial path —
// so several of these also guard that a Grand Prix is left exactly as it was.
//
// DELIBERATELY ON THE VIRGIN-PAGE FIXTURE, same as tests/specs/career.spec.js. This
// was converted to `sharedTest` and reverted after measurement: 5 of its 20
// tests failed, all of them on the 120 s timeout. toQuali() below CLICKS its
// way from the main menu (#mb-season → #sel-go → #rs-go), and a
// shared page starts each test wherever the previous one left the app — so
// #mb-season is simply not there to click.
//
// The selection mistake worth not repeating: this spec was picked for reuse on
// the criterion "no localStorage coupling, one boot helper", which it satisfies.
// That is the wrong axis. What decides it is whether the spec drives MENU
// SCREENS, because screen state is the thing the shared-page reset cannot
// restore. Count the locator() calls before converting, not the goto()s.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

// A championship weekend: SEASON -> select -> race settings -> QUALIFYING.
async function toQuali(page) {
  await boot(page);
  await page.locator("#mb-season").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
}

const codes = () => [...document.querySelectorAll("#q-table .res-row")]
  .map((r) => r.querySelector(".res-name").innerText.trim().split(/\s+/)[0]);

// ── the session ──────────────────────────────────────────────────────────────

test.describe("Qualifying — the session", () => {
  test.use({ viewport: LANDSCAPE });

  test("a championship weekend opens with qualifying", async ({ page }) => {
    await toQuali(page);
    await expect(page.locator("#q-title")).toContainText("QUALIFYING");
    // Before the session you may drive it or take the simulated time.
    await expect(page.locator("#q-drive")).toBeVisible();
    await expect(page.locator("#q-sim")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("quali");
  });

  test("a one-off Grand Prix still goes straight to the race", async ({ page }) => {
    // The quick-blast mode keeps its P12 climb; only a weekend earns a grid.
    await boot(page);
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await expect(page.locator("#quali")).toBeHidden();
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.session).toBe("race");
    const pos = await page.evaluate(() => window.__apex.fieldState().find((c) => c.isPlayer).pos);
    expect(pos).toBe(12);
  });

  test("the field is classified with a plausible spread", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const rows = await page.evaluate(() => [...document.querySelectorAll("#q-table .res-row")]
      .map((r) => r.innerText.replace(/\n/g, " ")));
    expect(rows.length).toBe(22);
    // Pole carries an absolute lap time; everyone else a gap to it.
    expect(rows[0]).toMatch(/\d+:\d\d\.\d+/);
    expect(rows[1]).toMatch(/\+\d+\.\d{3}/);
    // Pole-to-last on a ~90 s lap should read like qualifying, not a lottery.
    const last = parseFloat(rows[21].match(/\+(\d+\.\d{3})/)[1]);
    expect(last).toBeGreaterThan(0.4);
    expect(last).toBeLessThan(12);
  });

  test("the model is deterministic — same track, same times", async ({ page }) => {
    // Through the PROBE, not the button: once the session has been run the sheet
    // flips to .q-done and hides SIMULATE, so clicking it twice waits forever on
    // an element CSS has taken away. qualiSim() is the non-destructive read, and
    // it leaves a real weekend's classification alone.
    await toQuali(page);
    const a = await page.evaluate(() => window.__apex.qualiSim().map((r) => r.code + ":" + r.t));
    const b = await page.evaluate(() => window.__apex.qualiSim().map((r) => r.code + ":" + r.t));
    expect(b).toEqual(a);
    expect(a.length).toBe(22);
  });

  test("running the session hides SIMULATE — it cannot be re-rolled", async ({ page }) => {
    await toQuali(page);
    await expect(page.locator("#q-sim")).toBeVisible();
    await page.locator("#q-sim").click();
    await expect(page.locator("#q-sim")).toBeHidden();
    await expect(page.locator("#q-drive")).toBeHidden();
    await expect(page.locator("#q-go")).toBeVisible();
  });
});

// ── the grid ─────────────────────────────────────────────────────────────────

test.describe("Qualifying — the grid", () => {
  test.use({ viewport: LANDSCAPE });

  test("the race grid IS the qualifying order, car for car", async ({ page }) => {
    // The regression this exists for: the classification used to hand back the
    // car objects it captured, but startRace() calls makeCars() again, so those
    // references were orphans by the time the grid was built. The real field was
    // never placed — and fieldState() reported Teams.LIST order, which looks
    // plausible enough that checking only "who is on pole" passes.
    await toQuali(page);
    await page.locator("#q-sim").click();
    const qOrder = await page.evaluate(codes);
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const gridOrder = await page.evaluate(() => window.__apex.fieldState().map((c) => c.code));
    expect(gridOrder).toEqual(qOrder);
  });

  test("the player starts where they qualified, not P12", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const qPos = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#q-table .res-row")];
      return rows.findIndex((r) => r.classList.contains("you")) + 1;
    });
    expect(qPos).toBeGreaterThan(0);
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const gridPos = await page.evaluate(() => window.__apex.fieldState().find((c) => c.isPlayer).pos);
    expect(gridPos).toBe(qPos);
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("race");
  });

  test("every round of a season qualifies, not just the first", async ({ page }) => {
    // The two heaviest tests in the file: each stages TWO circuits and runs a
    // race to the flag, all on software GL. Their nearest neighbour already
    // sits at ~86s against the 120s default, so they time out whenever the box
    // is doing anything else — which is a measurement of the machine, not of
    // the code.
    test.slow();
    // The results screen's NEXT ROUND went straight to startRace(), so rounds
    // 2..24 were never qualified for — and gridUp() lined them up on round 1's
    // classification, which Quali.order() remapped onto the new cars by driverId.
    // A stale grid that looks like a real one is the reason this checks the SHEET
    // rather than the order it produces.
    await toQuali(page);
    await page.locator("#q-sim").click();
    const r1 = await page.evaluate(codes);
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.park(0.9); window.__apex.finishRace(); });
    await expect(page.locator("#results")).toBeVisible({ timeout: 10_000 });
    await page.locator("#res-next").click();
    // Round 2 opens its own session rather than reusing round 1's grid.
    await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("quali");
    // A different circuit, so a different order: the sheet is genuinely re-run.
    await page.locator("#q-sim").click();
    const r2 = await page.evaluate(codes);
    expect(r2.length).toBe(r1.length);
    expect(r2).not.toEqual(r1);
  });

  test("a qualifying grid never leaks into the Grand Prix that follows it", async ({ page }) => {
    // The two heaviest tests in the file: each stages TWO circuits and runs a
    // race to the flag, all on software GL. Their nearest neighbour already
    // sits at ~86s against the 120s default, so they time out whenever the box
    // is doing anything else — which is a measurement of the machine, not of
    // the code.
    test.slow();
    // gridUp() accepts any preOrder whose length matches the field, and the
    // classification outlived quitToMenu() — so the next Grand Prix lined up on a
    // season's qualifying order and silently lost the P12 start that mode exists
    // for. Read as: qualify, quit, then start a plain GP and check the climb.
    await toQuali(page);
    await page.locator("#q-sim").click();
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.park(0.9); window.__apex.finishRace(); });
    await expect(page.locator("#results")).toBeVisible({ timeout: 10_000 });
    await page.locator("#res-menu").click();          // quitToMenu()
    await expect(page.locator("#overlay")).toBeVisible();
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const info = await page.evaluate(() => ({
      flow: window.__apex.info().flow,
      pos: window.__apex.fieldState().find((c) => c.isPlayer).pos,
    }));
    expect(info.flow).toBe("gp");
    expect(info.pos).toBe(12);   // the fun climb, not somebody else's grid
  });
});

// ── the lap-time model ───────────────────────────────────────────────────────

test.describe("Qualifying — lap times", () => {
  test.use({ viewport: LANDSCAPE });

  test("a faster car and a better driver both make the lap quicker", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const rows = await page.evaluate(() => [...document.querySelectorAll("#q-table .res-row")]
      .map((r, i) => ({ pos: i + 1, code: r.querySelector(".res-name").innerText.trim().split(/\s+/)[0] })));
    const at = (c) => rows.find((r) => r.code === c).pos;
    // Tier 4 back-markers cannot out-qualify the tier-0 car in a dry session.
    expect(at("RUS")).toBeLessThan(at("STR"));
    expect(at("LEC")).toBeLessThan(at("BOR"));
    // …and within a team, the higher-rated driver comes out ahead more often
    // than not, which is what the ratings are for.
    expect(at("VER")).toBeLessThan(at("HAD"));
  });

  test("the model responds to the circuit, not just the car", async ({ page }) => {
    // Monaco and Spa are ~30 s apart in reality; a length-independent estimate
    // would put them on top of each other.
    await boot(page);
    const t = await page.evaluate(() => {
      const out = {};
      for (const id of ["monaco", "spa"]) {
        window.__apex.race(id);
        out[id] = window.__apex.qualiSim()[0].t;
      }
      return out;
    });
    expect(t.spa).toBeGreaterThan(t.monaco * 1.2);
  });
});

// ── driving the lap ──────────────────────────────────────────────────────────
// The session is ONE lap, which forces it to be a FLYING one. Two laps used to
// buy the flying lap with a standing out-lap; with only one, the car has to
// already be at racing speed when the lights go out — otherwise the driven time
// is a standing-start time measured against a field modelled on flying laps, and
// no amount of driving closes a gap that is purely the launch.

test.describe("Qualifying — the lap itself", () => {
  test.use({ viewport: LANDSCAPE });

  async function driveQuali(page) {
    await toQuali(page);
    await page.evaluate(() => document.getElementById("q-drive").click());
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  }

  test("the session is one lap, not two", async ({ page }) => {
    await driveQuali(page);
    expect(await page.evaluate(() => window.__apex.info().lapsTarget)).toBe(1);
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("quali");
  });

  test("the car starts from REST on the line, like the real thing", async ({ page }) => {
    // It used to launch at racing speed, because the simulated field is
    // modelled on a flying lap and timing a standing lap against a flying one
    // loses you the launch by construction. That is paid on the other side now
    // — quali.js charges every modelled lap the same standing start — so the
    // session can begin the way its name says it does.
    await driveQuali(page);
    const out = await page.evaluate(() => {
      // Pump the countdown deterministically rather than waiting on real time:
      // under software GL the wall clock is not a reliable way to reach
      // lights-out inside a test budget.
      for (let i = 0; i < 900 && window.__apex.info().state !== "race"; i++) window.__apex.step(1 / 60, 1);
      const c = window.__apex.carAt(0);
      return { state: window.__apex.info().state, speed: c.speed, x: c.x };
    });
    expect(out.state).toBe("race");
    expect(out.speed).toBeLessThan(5);    // from rest, not launched
    expect(Math.abs(out.x)).toBeLessThan(1.5);   // on the line, not in a grid slot
  });

  test("a Grand Prix still starts from a standstill", async ({ page }) => {
    // The launch is qualifying-only. A race that began at 300 km/h would be a
    // different game.
    await boot(page);
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const speed = await page.evaluate(() => {
      for (let i = 0; i < 900 && window.__apex.info().state !== "race"; i++) window.__apex.step(1 / 60, 1);
      return window.__apex.carAt(0).speed;
    });
    expect(speed).toBeLessThan(5);
  });
});

// ── backing out ──────────────────────────────────────────────────────────────
// The sheet commits you to a grid, so it needs a way out — but only BEFORE the
// session. Once a lap is driven or taken, the classification IS the grid and
// there is nothing left to reconsider.

test.describe("Qualifying — BACK", () => {
  test.use({ viewport: LANDSCAPE });

  test("BACK returns to race settings, one step, with nothing run", async ({ page }) => {
    await toQuali(page);
    await expect(page.locator("#q-back")).toBeVisible();
    await page.evaluate(() => document.getElementById("q-back").click());
    await expect(page.locator("#race-settings")).toBeVisible();
    await expect(page.locator("#quali")).toBeHidden();
    // The flow stops claiming a qualifying session is running.
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("race");
    expect(await page.evaluate(() => window.__apex.info().state)).not.toBe("race");
  });

  test("...and the weekend can be entered again from there", async ({ page }) => {
    await toQuali(page);
    await page.evaluate(() => document.getElementById("q-back").click());
    await expect(page.locator("#race-settings")).toBeVisible();
    await page.evaluate(() => document.getElementById("rs-go").click());
    await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
    // A fresh sheet, with both choices offered again.
    await expect(page.locator("#q-drive")).toBeVisible();
    await expect(page.locator("#q-sim")).toBeVisible();
    expect(await page.evaluate(codes)).toHaveLength(22);
  });

  test("BACK disappears once the session has been run", async ({ page }) => {
    // Backing out after a result would silently throw it away.
    await toQuali(page);
    await page.evaluate(() => document.getElementById("q-sim").click());
    await expect(page.locator("#q-go")).toBeVisible();
    await expect(page.locator("#q-back")).toBeHidden();
    await expect(page.locator("#q-drive")).toBeHidden();
  });
});

// A one-off Grand Prix has always dropped the player at P12 and gone straight to
// the lights — the only mode where where you START owes nothing to how fast you
// are. QUALIFYING LAP lets it run the same one-lap session a championship
// weekend does. It lives in RACE SETTINGS, beside LAPS and WEATHER, because it
// is a property of the race rather than a control preference.
test.describe("QUALIFYING LAP: a one-off race can qualify", () => {
  test.use({ viewport: LANDSCAPE });

  // GRAND PRIX -> circuit -> garage -> race settings.
  async function toSettings(page) {
    await boot(page);
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await expect(page.locator("#race-settings")).toBeVisible();
  }
  // GRID is a setting row (js/ui/setting-row.js): option 0 is the pace-order
  // grid and option 1 the qualifying lap, picked by index as the chips were.
  const pickGrid = (page, i) => page.locator("#rs-quali-sel").selectOption({ index: i });

  test("OFF goes straight to the lights from P12, as it always has", async ({ page }) => {
    await toSettings(page);
    await expect(page.locator("#rs-quali")).toBeVisible();
    await pickGrid(page, 0);
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: 60_000 });
    // No qualifying session was staged, and the flow is a plain race.
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("race");
  });

  test("ON runs the session and the grid comes out of it", async ({ page }) => {
    test.slow();   // stages a circuit twice over software GL
    await toSettings(page);
    await pickGrid(page, 1);
    await page.locator("#rs-go").click();
    await expect(page.locator("#quali")).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(codes)).toHaveLength(22);

    await page.locator("#q-sim").click();
    await page.locator("#q-go").click();
    await page.waitForFunction(() => ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: 60_000 });

    const out = await page.evaluate(() => ({
      pos: window.__apex.timing().pos,
      field: window.__apex.fieldState().length,
    }));
    expect(out.field).toBe(22);
    // The whole point: the start slot is earned, not the hard-coded P12.
    expect(out.pos).not.toBe(12);
  });

  test("a championship forces it on, and says so rather than hiding it", async ({ page }) => {
    // The choice is not the player's in a season — the weekend decides the grid
    // — but "why did this race qualify" is a question the screen should answer.
    // Dead ON/OFF chips looked tappable and did nothing; now the row is
    // DISABLED and reads QUALIFYING LAP — the setting is shown, not offered.
    await boot(page);
    await page.locator("#mb-season").click();
    await page.locator("#sel-go").click();
    await expect(page.locator("#rs-quali")).toBeVisible();
    const sel = page.locator("#rs-quali-sel");
    await expect(sel).toBeDisabled();
    await expect(sel).toHaveValue("quali");
    await expect(page.locator("#rs-quali-next")).toBeDisabled();
  });
});
