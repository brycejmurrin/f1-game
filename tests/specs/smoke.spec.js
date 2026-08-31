// @ts-check
import { test, sharedTest, expect } from "../helpers/fixtures.js";

// Helper: wait for the game's __apex hook to report a non-null track,
// meaning loadTrack() has finished and the renderer is up.
// `polling: 100` for the same reason quietRenderer needs it (see below): this
// waits on a page that is actively building and drawing a circuit, which is
// exactly when rAF — waitForFunction's default clock — starves under SwiftShader
// and stops bounding the declared timeout.
// 2026-08-30: CI experienced 264s car builds under load. Default 10s does not
// accommodate overloaded runners — expanded to 480s to match the widened smoke
// job timeout, giving the build the same headroom CI's steps were tuned for.
async function waitForTrack(page, timeout = 480_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    null, { polling: 100, timeout }
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
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 60_000 });
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

// Helper: boot STRAIGHT INTO a race, skipping the menus entirely.
//
// For a spec whose subject is the rendered scene, the menu walk is pure setup
// cost — and the measurements say it is most of the cost. __apex.race() exists
// for precisely this ("Skips menus so a harness can render any track", see
// js/game/apex.js), and the menu path it bypasses is not lost coverage: three
// specs above still reach a race by clicking, and "the select screen is a circuit
// picker" asserts that flow in detail on purpose.
//
// MEASURED 2026-08-14, four variants end to end, 2 reps each, every one required
// to still produce a non-blank canvas (scratch/smoke-speedup-bench.mjs):
//     current path (menus + quiet shot)      43.8 s best / 53.1 s mean
//     menus quieted                          30.9 s      / 35.5 s
//     no menus, WITHOUT the quiet shot       33.6 s      / 33.7 s   -> 0 bytes, FAILS
//     no menus + quiet shot                  19.0 s      / 24.7 s   -> -57 %
// The third row is why the pairing matters: skipping the menus makes everything
// up to the screenshot fast, and then the screenshot times out, because it is
// left racing the render loop with no headless() to quiet it. Fast and blank is
// not a speedup — the two halves only work together.
//
// bahrain is the picker's own default, so these specs render the same circuit
// they rendered when they clicked through the menus to get here.
// bootRace for a page the sharedTest fixture has ALREADY booted: no goto, and
// no re-race when the circuit is already the one wanted. That is the whole
// saving — the second test in the shard skips a page boot AND a circuit build.
async function raceOnBootedPage(page, trackId = "bahrain") {
  const on = await page.evaluate(() => {
    const i = window.__apex && window.__apex.info();
    return i && i.track ? i.track : null;
  });
  if (on === trackId) return;
  await page.evaluate((t) => window.__apex.race(t), trackId);
  await waitForTrack(page, 180_000);
}

async function bootRace(page, trackId = "bahrain") {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 60_000 });
  await page.evaluate((t) => window.__apex.race(t), trackId);
  // Generous: the menu walk used to absorb the circuit build, and this does not.
  // CI has been measured taking 94 s just to boot a race on a starved runner.
  await waitForTrack(page, 180_000);
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
  // pixel comparison belongs in tests/manual/tracks-visual.spec.js).
  // A rendered 3D scene PNG is tens of KB; a blank/solid canvas is < ~2 KB.
  test("grid start renders a non-blank frame", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await bootRace(page);
    await parkForScreenshot(page, 0);

    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("corner approach renders a non-blank frame", async ({ page }) => {
    await bootRace(page);

    // Find the first corner on the track and park there
    const corners = await page.evaluate(() => window.__apex.corners());
    const frac = corners.length > 0 ? corners[0] : 0.15;
    await parkForScreenshot(page, frac);

    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("jump() sets player speed and lateral offset", async ({ page }) => {
    await bootRace(page);
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

// THE HUD PAIR SHARES ONE BOOTED PAGE. These two tests are `--shard=4/4` — the
// pole the sharding comment in ci.yml names ("speed readout 109 s, minimap 81 s
// are the pole on their own") — and both of them paid the SAME fixture: a page
// boot, a circuit build and a park under SwiftShader. Their own comments say
// that fixture is the entire cost ("goToRace + park alone is most of the budget
// before this test asserts anything"), and shard 4 paid it twice.
//
// Measured on an idle box, shard 4 as CI runs it: 125.6 s + 112.2 s, with the
// first test FAILING the 120 s default. The same test alone took 26.9 s — a
// 4.7x spread that is the variance the fixture carries, not the assertion.
//
// sharedTest is safe for exactly these two and not for the rest of the file:
// fixtures.js warns it off "anything asserting FIRST-LOAD behaviour", which is
// what the other seven smoke tests are for. These two assert HUD content AFTER
// a race, and the minimap test re-parks at s=0 itself, so it does not care that
// the speed test left the car at 80 m/s.
sharedTest.describe("Apex 26 — HUD", () => {
  sharedTest("speed readout updates after jump() at speed", async ({ page }) => {
    // BUDGET, not contention. Re-run ALONE on an idle box (tools/test-solo.mjs,
    // which refuses to start above load 2) this took 98.5 s of the 120 s default
    // — 82 % of budget with nothing else on the machine — and it is reliably the
    // first test to fail the moment anything else touches the CPU. The cost is
    // the fixture: booting the page, building a circuit and parking a car under
    // SwiftShader, none of which this assertion can avoid. The sibling test below
    // reached the same conclusion. CI now supplies a measured 420 s timeout;
    // test.slow() must not override it because Playwright triples the command-line
    // budget and turns one attempt into a 21-minute hang allowance.
    await raceOnBootedPage(page);
    await park(page, 0);
    await page.evaluate(() => window.__apex.jump(0, 80, 0));
    // Wait for the HUD tick to flush the new speed value into the DOM.
    // `polling` IS LOAD-BEARING, not decoration. Playwright polls a predicate on
    // requestAnimationFrame by default, and this page is running the game loop
    // under SwiftShader — which starves that poll badly enough that the declared
    // bound never gets to fire (AGENTS.md measures a 3 s wait running 109,665 ms).
    // Measured here: solo on a quiet box this test took 102.7 s of a 120 s
    // budget, i.e. 14% from failing with zero contention, and it is the test that
    // failed first the moment anything else touched the CPU.
    await page.waitForFunction(
      () => parseInt(document.getElementById("hud-speed-n").textContent, 10) > 0,
      // DERIVED from the test's own budget, not pinned. This wait has now been
      // wrong twice: 3000 ms failed Pages #1849/#1850/#1851, and the 30000 that
      // replaced it still failed #1855 — where the asset pack alone took 55 s
      // and car builds landed at 165-182 s of page time, against seconds
      // locally. Every one of those dumped `apex-state` showing speed: 80: the
      // physics had the value and the HUD had not repainted yet. A constant
      // here is a guess about a machine, and the machine keeps getting slower.
      //
      // test.info().timeout IS the budget CI hands this spec (900 s there, the
      // 120 s default locally), so a quarter of it scales with whatever the
      // workflow sets and needs no edit the next time that moves. The ASSERTION
      // below is untouched, and this still cannot mask a hung HUD — the test
      // budget itself remains the backstop, and a readout that never updates
      // fails at 4x this wait.
      null, { polling: 100, timeout: Math.max(30_000, Math.floor(test.info().timeout / 4)) }
    );

    const speed = await page.locator("#hud-speed-n").innerText();
    // 80 m/s ≈ 288 km/h — should show a non-zero value
    expect(parseInt(speed, 10)).toBeGreaterThan(0);
  });

  sharedTest("minimap canvas has content after race starts", async ({ page }) => {
    // THE SLOWEST TEST IN THE GROUP, and on CI's software renderer it exceeded
    // the 240 s budget twice (328 s, then 356 s on retry) while asserting
    // nothing — a bare timeout, with the car correctly parked at s=0. The other
    // smoke tests show why: "select screen is a circuit picker" measures 179 s
    // on that runner and "grid start renders a non-blank frame" 164 s, against
    // seconds here. goToRace + park alone is most of the budget before this test
    // asserts anything. Keep the workflow's explicit 420 s timeout as the bound;
    // test.slow() would silently triple it.
    await raceOnBootedPage(page);
    await park(page, 0);

    // park() force-publishes the HUD/minimap before it returns. Read the canvas
    // once and assert the actual contract; sampled scanlines produced false
    // blanks for a visibly painted Bahrain outline in CI traces, while polling
    // also turned that bad oracle into minutes of retry time.
    const painted = await page.locator("canvas#minimap").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(200);
  });
});
