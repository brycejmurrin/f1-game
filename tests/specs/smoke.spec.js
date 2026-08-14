// @ts-check
import { test, expect } from "../helpers/fixtures.js";

// Helper: wait for the game's __apex hook to report a non-null track,
// meaning loadTrack() has finished and the renderer is up.
async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout }
  );
}

// Helper: stop the render loop, for a phase that does not look at the canvas.
//
// THE MENUS ARE THE EXPENSIVE PART OF THIS FILE, not the rendering they sit in
// front of. playwright.config.js already records half of why: Playwright's
// actionability poll ticks on rAF, so every .click() waits on the page's frame
// clock, and under SwiftShader that clock is driven by a full 3D redraw running
// behind the menu. Its conclusion was "CPU headroom is the lever" — this is the
// other way to get headroom: stop the redraw instead of rationing workers.
//
// MEASURED 2026-08-14 (scratch/corner-approach-phases.mjs, one browser, idle box)
// on "corner approach renders a non-blank frame", 44.2 s end to end:
//     menu clicks                     29.3 s   66 %
//     canvas screenshot               11.1 s   25 %
//     page load                        2.3 s    5 %
//     waitForTrack (track build)      0.02 s    0 %
//     corners() + park()              0.009 s   0 %   <- the part it is named for
// Quieting the renderer across the clicks took the same run to 29.6 s (-33 %),
// and the whole-variant benchmark (scratch/smoke-speedup-bench.mjs, 2 reps) put
// it at 30.9 s best / 35.5 s mean against 43.8 s / 53.1 s for the current path.
//
// CI is where this matters: run 1415 needed 357.7 s for "the select screen is a
// circuit picker", a spec that is ~pure menu navigation and asserts nothing about
// the canvas — the single most expensive test in the suite, spending all of it on
// clicks waiting for frames nobody looks at.
// `polling: 100` is REQUIRED here, not decoration (tests/unit/wait-polling.test.mjs
// ratchets it). waitForFunction's default polling is rAF — and this particular wait
// runs while the render loop is still going, which is the exact condition that
// starves rAF under SwiftShader, so a declared timeout would never fire. It is the
// same starvation this helper exists to remove; polling on a wall clock instead of
// on frames is the only way to wait for the hook that turns it off.
async function quietRenderer(page) {
  await page.waitForFunction(() => !!window.__apex, { polling: 100, timeout: 60_000 });
  await page.evaluate(() => window.__apex.headless(true));
}

// Helper: navigate to the page, click RACE, then click START.
// Returns after startRace() completes (state === "count").
//
// The renderer is quiet for the CLICKS ONLY and is switched back on before this
// returns, so every caller sees exactly the state it saw before — the screenshot
// specs still get a live scene to park in, and the minimap/HUD specs still get a
// drawn canvas. Leaving it off would be faster still and would silently blank
// the three specs that actually read pixels.
async function goToRace(page) {
  await page.goto("/");
  await quietRenderer(page);
  // Dismiss any overlay — the RACE button lives in the main menu
  await page.locator("#mb-race").click();
  // Leave the circuit at its default; START opens the GARAGE...
  await page.locator("#sel-go").click();
  // ...and DONE carries on to the race settings, which we accept as they are.
  await page.locator("#cs-done").click();
  await page.locator("#rs-go").click();
  // Renderer back on BEFORE the track wait, so callers get the live scene.
  await page.evaluate(() => window.__apex.headless(false));
  await waitForTrack(page);
}

// Helper: skip the countdown, clear the AI pack, and park the player
// at `frac` (0–1) of the lap so the camera points at that corner.
async function park(page, frac = 0) {
  await page.evaluate((f) => window.__apex.park(f), frac);
  // Let the renderer flush at least two frames (~32 ms at 60 fps)
  await page.waitForTimeout(100);
}

// Helper: like park(), but for a test that is about to SCREENSHOT the canvas.
//
// park() freezes PHYSICS, not rendering — js/game.js keeps redrawing every rAF
// tick so sky/cloud animation continues (frame() runs even while `frozen`).
// Under SwiftShader that redraw is CPU-heavy and never idles, so a `.screenshot()`
// issued while it is still running has to queue behind an ongoing, endless
// render loop instead of a quiet compositor.
//
// MEASURED on this box, solo (no sibling worker): an otherwise-identical
// goToRace()+park() test with no screenshot takes 30-70s; the SAME test with a
// screenshot but no headless(true) took 88-96s; under a real 2-worker suite run
// the same pair reached 154-214s, past Playwright's 120s budget. Stopping the
// render loop before the shot (below) cut it back to 29-32s solo — screenshot
// cost becomes negligible once it is reading a quiet compositor instead of
// racing an endless one.
//
// `headless(true)` (js/game/apex.js) stops render() entirely and the compositor
// keeps the LAST drawn frame — tests/helpers/track-helpers.js's tracks-visual capture
// already relies on exactly this to get a stable, quickly-readable frame. Give
// the scene time to actually present one real frame first (300ms — 100ms is not
// reliably enough for a full frame on a heavy circuit under SwiftShader), THEN
// stop the loop, so the screenshot reads a quiet canvas instead of racing it.
async function parkForScreenshot(page, frac = 0) {
  await park(page, frac);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__apex.headless(true));
  await page.waitForTimeout(50);
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe("Apex 26 — smoke", () => {
  test("page loads without WebGL error", async ({ page, pageErrors }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");

    // Main menu overlay must be visible
    await expect(page.locator("#overlay")).toBeVisible();

    // WebGL2 unavailable banner must stay hidden
    await expect(page.locator("#nogl")).toBeHidden();

    // Canvas must have non-zero dimensions (GLX.resize() ran)
    const box = await page.locator("canvas#game").boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    // No console errors during load
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
    expect(pageErrors).toEqual([]);
  });

  test("the select screen is a circuit picker, and START opens the garage", async ({ page }) => {
    await page.goto("/");
    // Every assertion below is DOM — visibility, counts, which sheet is open.
    // Nothing here reads the canvas, so the 3D redraw behind these menus is pure
    // cost: this spec took 357.7 s in CI run 1415, the slowest in the suite, and
    // it is the one test in it that never looks at a rendered pixel.
    await quietRenderer(page);
    await page.locator("#mb-race").click();

    await expect(page.locator("#select")).toBeVisible();
    // ONE question: where. The YOUR CAR summary and its GARAGE button used to
    // share this screen and it won at neither — on a landscape phone the
    // circuit list got half the sheet, and the summary was a poorer copy of
    // what the garage shows anyway.
    await expect(page.locator("#sel-team-card")).toHaveCount(0);
    await expect(page.locator("#sel-setup")).toHaveCount(0);
    await expect(page.locator("#sel-tracks .track-row").first()).toBeVisible();
    // DIFFICULTY moved to RACE SETTINGS (with laps/weather/time of day) — it is
    // a property of the race, not of the driver you pick.
    await expect(page.locator("#sel-diff")).toHaveCount(0);

    // Choosing a car is a STEP now, not a side door: START goes to the garage.
    await page.locator("#sel-go").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await expect(page.locator("#select")).toBeHidden();
    // ...and the team picker lives there, on the TEAM & DRIVER tab.
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
    await page.locator("#cs-team-card").click();
    await expect(page.locator("#teampicker")).toBeVisible();
    await expect(page.locator("#sel-teams .team-tile").first()).toBeVisible();
    await page.locator("#tp-close").click();
    await expect(page.locator("#teampicker")).toBeHidden();
    // DONE carries ON to the race settings rather than back to a question
    // already answered.
    await page.locator("#cs-done").click();
    await expect(page.locator("#race-settings")).toBeVisible();
    // DIFFICULTY is here, beside the other per-race choices.
    await expect(page.locator("#rs-diff .sel-chip").first()).toBeVisible();
    await expect(page.locator("#rs-diff .sel-chip.active")).toHaveCount(1);
  });

  test("race starts and __apex hook is available", async ({ page }) => {
    await goToRace(page);

    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toMatch(/count|race/);
    expect(typeof info.track).toBe("string");
    expect(info.total).toBeGreaterThan(0);
  });

  test("park() skips countdown and positions player", async ({ page }) => {
    await goToRace(page);
    await park(page, 0);

    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toBe("race");

    // HUD should be visible in-race
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#lights")).toBeHidden();
  });
});

test.describe("Apex 26 — rendering", () => {
  // These are SMOKE checks: confirm the WebGL scene actually renders a non-blank
  // frame, not a pixel-exact regression (the scene has procedural scenery /
  // time-of-day variation, so it differs 10-30% run-to-run under SwiftShader —
  // pixel comparison belongs in tests/specs/tracks-visual.spec.js).
  // A rendered 3D scene PNG is tens of KB; a blank/solid canvas is < ~2 KB.
  test("grid start renders a non-blank frame", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await goToRace(page);
    await parkForScreenshot(page, 0);

    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("corner approach renders a non-blank frame", async ({ page }) => {
    await goToRace(page);

    // Find the first corner on the track and park there
    const corners = await page.evaluate(() => window.__apex.corners());
    const frac = corners.length > 0 ? corners[0] : 0.15;
    await parkForScreenshot(page, frac);

    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("jump() sets player speed and lateral offset", async ({ page }) => {
    await goToRace(page);
    // Enter race state first
    await park(page, 0);
    // Then jump to mid-lap at 60 m/s, 2 m right of centre
    await page.evaluate(() => window.__apex.jump(0.5, 60, 2));
    await page.waitForTimeout(100);

    const info = await page.evaluate(() => window.__apex.info());
    const probe = await page.evaluate(() => window.__apex.probe());
    expect(info.state).toBe("race");
    expect(info.total).toBeGreaterThan(0);
    expect(probe.s / info.total).toBeCloseTo(0.5, 2);
    expect(probe.speed).toBeCloseTo(60, 1);
    expect(probe.x).toBeCloseTo(2, 1);
  });
});

test.describe("Apex 26 — HUD", () => {
  test("speed readout updates after jump() at speed", async ({ page }) => {
    // BUDGET, not contention. Re-run ALONE on an idle box (tools/test-solo.mjs,
    // which refuses to start above load 2) this took 98.5 s of the 120 s default
    // — 82 % of budget with nothing else on the machine — and it is reliably the
    // first test to fail the moment anything else touches the CPU. The cost is
    // the fixture: booting the page, building a circuit and parking a car under
    // SwiftShader, none of which this assertion can avoid. The sibling test below
    // reached the same conclusion and already carries test.slow(); this one was
    // simply left behind, so it failed as a "flake" that was really a too-tight
    // clock. test.slow() triples the budget rather than loosening the assertion.
    test.slow();
    await goToRace(page);
    await park(page, 0);
    await page.evaluate(() => window.__apex.jump(0, 80, 0));
    // Wait for the HUD tick to flush the new speed value into the DOM.
    // `polling` IS LOAD-BEARING, not decoration. Playwright polls a predicate on
    // requestAnimationFrame by default, and this page is running the game loop
    // under SwiftShader — which starves that poll badly enough that the declared
    // bound never gets to fire (CLAUDE.md measures a 3 s wait running 109,665 ms).
    // Measured here: solo on a quiet box this test took 102.7 s of a 120 s
    // budget, i.e. 14% from failing with zero contention, and it is the test that
    // failed first the moment anything else touched the CPU.
    await page.waitForFunction(
      () => parseInt(document.getElementById("hud-speed-n").textContent, 10) > 0,
      { polling: 100, timeout: 3000 }
    );

    const speed = await page.locator("#hud-speed-n").innerText();
    // 80 m/s ≈ 288 km/h — should show a non-zero value
    expect(parseInt(speed, 10)).toBeGreaterThan(0);
  });

  test("minimap canvas has content after race starts", async ({ page }) => {
    // THE SLOWEST TEST IN THE GROUP, and on CI's software renderer it exceeded
    // the 240 s budget twice (328 s, then 356 s on retry) while asserting
    // nothing — a bare timeout, with the car correctly parked at s=0. The other
    // smoke tests show why: "select screen is a circuit picker" measures 179 s
    // on that runner and "grid start renders a non-blank frame" 164 s, against
    // seconds here. goToRace + park alone is most of the budget before this
    // test asserts anything.
    test.slow();
    await goToRace(page);
    await park(page, 0);

    // The HUD tick (~10 Hz) blits the pre-rendered track outline onto the 2D
    // minimap canvas — wait for that first paint rather than racing it.
    //
    // POLL CHEAPLY. This used to read back the WHOLE canvas on every poll, and
    // Chromium says what that costs: "Multiple readback operations using
    // getImageData are faster with the willReadFrequently attribute set to
    // true" — a warning that appeared in the CI console on both attempts. The
    // context belongs to the game, so the test cannot set that attribute; what
    // it can do is stop asking for every pixel just to learn whether ANY pixel
    // is painted. Five 1-pixel strips spread down the canvas cost ~5/height of
    // a full readback; a closed lap outline cannot cross none of them, and the
    // exact count below is unchanged. (A SINGLE middle strip would be cheaper
    // still and is the wrong trade: if it happened to miss, the poll would time
    // out at 5 s and report a blank minimap that is actually painted.)
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas#minimap");
      if (!c || !c.width) return false;
      const ctx = c.getContext("2d");
      for (let k = 1; k <= 5; k++) {
        const y = Math.floor((c.height * k) / 6);
        const d = ctx.getImageData(0, y, c.width, 1).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      }
      return false;
    }, { timeout: 5000 });

    // A drawn outline is a 2px stroke around the whole lap, so a painted map
    // has hundreds of non-transparent pixels; a blank canvas has zero. Count
    // above a small floor rather than matching exact colours — sector tints
    // and car dots vary per run.
    const painted = await page.locator("canvas#minimap").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(200);
  });
});
