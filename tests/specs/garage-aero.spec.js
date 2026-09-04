// @ts-check
// The GARAGE active-aero demo. This exists because the feature shipped looking
// broken: the button said X-MODE and the car did not visibly change, and nothing
// in the suite could have caught it. The garage animation used to live entirely
// inside the rAF render, and a headless page composites no frames — measured,
// requestAnimationFrame fires ZERO times per second here — so the ease was
// unobservable from a test. __apex.garageStep() drives it directly instead.
//
// ONE BOOT PER WORKER (sharedTest): six boots became none. openGarage() walks
// the shared page back to the title and in through #mb-garage, which resets
// the camera on every visit (js/game.js openGarage: turntable, default
// distance, panel shut) — that part a fresh boot never had to do for us. The
// FLAP is different: setupPreviewXOn/AeroX are module-level and nothing on
// the way in touches them, so a test that left X open would hand the next one
// an open flap. The opener shuts it the way the game does (garageAero(false)
// plus the ease, which clamps to exactly 0). UNVERIFIED IN A BROWSER.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

async function clickId(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("garage-aero: missing #" + i);
    el.click();
  }, id);
}

async function openGarage(page) {
  await toMenu(page);
  // evaluate click, not locator.click: a Playwright click on the title flyby
  // costs 80-113 s (docs/TESTING.md) and was the 120 s Selected-specs timeout
  // on 1e94cdf0 (garage-aero "MOVES the wing" 146 s / "WHOLE-CAR preset" 125 s).
  await clickId(page, "mb-garage");
  await page.waitForFunction(() => {
    const el = document.getElementById("carsetup");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => {
    window.__apex.garageAero(false);
    window.__apex.garageStep(1 / 60, 120);   // 2 s of closing: X_CLOSE_RATE reaches 0 well inside it
  });
}

test.describe("garage active aero", () => {
  test.use({ viewport: LANDSCAPE });

  test("the demo starts shut", async ({ page }) => {
    await openGarage(page);
    const a = await page.evaluate(() => window.__apex.garageAero());
    expect(a).toEqual({ xOn: false, aeroX: 0, mode: "Z" });
  });

  test("the flap EASES open and reaches full travel, then slams shut faster", async ({ page }) => {
    await openGarage(page);
    const r = await page.evaluate(() => {
      const out = { opening: [] };
      window.__apex.garageAero(true);
      for (let i = 0; i < 4; i++) out.opening.push(window.__apex.garageStep(1 / 60, 3).aeroX);
      out.full = window.__apex.garageStep(1 / 60, 60).aeroX;
      // shut: the same number of ticks must remove MORE than opening added
      window.__apex.garageAero(false);
      out.afterShut6 = window.__apex.garageStep(1 / 60, 6).aeroX;
      return out;
    });
    // it travels rather than snapping
    expect(r.opening[0]).toBeGreaterThan(0);
    expect(r.opening[0]).toBeLessThan(1);
    for (let i = 1; i < r.opening.length; i++)
      expect(r.opening[i]).toBeGreaterThan(r.opening[i - 1]);
    expect(r.full).toBe(1);
    // closing is the faster direction, as on track
    expect(1 - r.afterShut6).toBeGreaterThan(r.opening[1]);
  });

  test("full travel actually MOVES the wing geometry, by a visible amount", async ({ page }) => {
    await openGarage(page);
    const moved = await page.evaluate(() => {
      // Where each element's leading edge sits at the two ends of the travel —
      // the same rotation-about-the-pivot the draw applies.
      const at = (e, d) => {
        const a = e.natural + d, u = (0 - e.hinge) * e.chord;
        return [e.z - u * Math.cos(a), e.y + u * Math.sin(a)];
      };
      return Car3D.aeroFlaps(2, null).map((e) => {
        const c = at(e, e.zAngle), o = at(e, e.xAngle);
        return { id: e.id, wing: e.wing, mm: Math.round(Math.hypot(o[0] - c[0], o[1] - c[1]) * 1000) };
      });
    });
    // Every moveable element must actually move, and the rear wing — the one a
    // player is looking at when they press the button — by a lot.
    for (const m of moved) expect(m.mm, `${m.id} leading edge travel`).toBeGreaterThan(5);
    const rear = moved.filter((m) => m.wing === "rear");
    expect(rear.length).toBeGreaterThan(0);
    for (const m of rear) expect(m.mm, `${m.id} leading edge travel`).toBeGreaterThan(80);
  });

  test("switching X on from the turntable AIMS at the rear wing", async ({ page }) => {
    await openGarage(page);
    const before = await page.evaluate(() => window.__apex.garageCam());
    expect(before.spin, "the garage opens on the turntable").toBe(true);

    await clickId(page, "cs-aero");
    const after = await page.evaluate(() => window.__apex.garageCam());
    // The flaps rotate about the car's X axis; the turntable looks very nearly
    // ALONG it, where the sweep projects to almost nothing. Pressing the button
    // has to put the player somewhere they can see it work.
    expect(after.spin, "aiming stops the turntable").toBe(false);
    // Close enough that the travel is actually legible. At the whole-car
    // framing the rear wing's 135 mm projects to ~10 px on a landscape phone,
    // which is why this had to move at all.
    expect(after.dist, "and moves in close").toBeLessThan(3.2);
  });

  test("it also aims when a WHOLE-CAR preset is showing, not just the turntable", async ({ page }) => {
    await openGarage(page);
    await clickId(page, "cs-cam");
    await page.evaluate(() => document.querySelector('[data-cs-view="rear"]').click());
    const wide = await page.evaluate(() => window.__apex.garageCam());
    expect(wide.spin).toBe(false);
    expect(wide.dist).toBeGreaterThan(5);
    await clickId(page, "cs-aero");
    expect((await page.evaluate(() => window.__apex.garageCam())).dist).toBeLessThan(3.2);
  });

  test("a player who has aimed the camera keeps their angle", async ({ page }) => {
    await openGarage(page);
    await clickId(page, "cs-cam");
    await page.evaluate(() => document.querySelector('[data-cs-view="side"]').click());
    // ...then move in close, which is the "I have aimed this deliberately" signal.
    await page.evaluate(() => { for (let i = 0; i < 24; i++) document.getElementById("cs-view-in").click(); });
    const chosen = await page.evaluate(() => window.__apex.garageCam());
    await clickId(page, "cs-aero");
    const after = await page.evaluate(() => window.__apex.garageCam());
    expect(after.az).toBeCloseTo(chosen.az, 5);
    expect(after.dist).toBeCloseTo(chosen.dist, 5);
  });
});
