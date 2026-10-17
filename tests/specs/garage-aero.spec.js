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
// plus the ease, which clamps to exactly 0).
//
// openGarage always peels to the title and re-enters (that visit is what
// resets the turntable — skipping it left spin=false and broke "AIMS at the
// rear wing" on CI #3233). It retries the enter up to three times, and treats
// "#carsetup already showing" after a wait timeout as success: soft-present
// ReadPixels stalls can make waitForFunction miss a bay that is already up
// (Selected specs 2026-09-09). UNVERIFIED IN A BROWSER.
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

async function garageOpen(page) {
  return page.evaluate(() => {
    const el = document.getElementById("carsetup");
    return !!(el && !el.hidden);
  });
}

async function waitGarage(page, ms) {
  // Wall-clock polling — default rAF polling never fires under SwiftShader
  // (docs/TESTING.md). Soft-present ReadPixels can still stall the main
  // thread for seconds; a single long wait cannot recover a swallowed click.
  await page.waitForFunction(() => {
    const el = document.getElementById("carsetup");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: ms });
}

async function openGarage(page) {
  // Always title → #mb-garage. Re-entry resets the turntable (js/game.js
  // openGarage); short-circuiting when already open left spin=false and failed
  // "AIMS at the rear wing" on harden CI #3233.
  // evaluate click, not locator.click: a Playwright click on the title flyby
  // costs 80-113 s (docs/TESTING.md) and was the 120 s Selected-specs timeout
  // on 1e94cdf0 (garage-aero "MOVES the wing" 146 s / "WHOLE-CAR preset" 125 s).
  // Retry the enter (same shape as tools/shot/probe-page.mjs openGarage):
  // a click that never landed cannot be fixed by waiting longer. After a wait
  // timeout, if #carsetup is showing anyway, accept it — ReadPixels stalls can
  // block the poll while the bay is already up (Selected specs 2026-09-09).
  const tries = 3;
  const stepMs = 8_000;
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    await toMenu(page);
    await clickId(page, "mb-garage");
    try {
      await waitGarage(page, stepMs);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (await garageOpen(page)) {
        lastErr = null;
        break;
      }
    }
  }
  if (lastErr) throw lastErr;
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
    // REAR-WING is 4.6 m / el 0.50 so both endplates and the beam wing fit.
    // Whole-car is ~8.5 m, where the same 135 mm travel is ~10 px on a
    // landscape phone — the aim still has to leave that framing.
    expect(after.az, "rear-wing three-quarter").toBeCloseTo(Math.PI * 0.72, 5);
    expect(after.el, "slightly above the wing").toBeCloseTo(0.50, 5);
    expect(after.dist, "and frames the whole rear wing").toBeCloseTo(4.6, 5);
  });

  test("it also aims when a WHOLE-CAR preset is showing, not just the turntable", async ({ page }) => {
    await openGarage(page);
    await clickId(page, "cs-cam");
    await page.evaluate(() => document.querySelector('[data-cs-view="rear"]').click());
    const wide = await page.evaluate(() => window.__apex.garageCam());
    expect(wide.spin).toBe(false);
    expect(wide.dist).toBeGreaterThan(5);
    await clickId(page, "cs-aero");
    const aimed = await page.evaluate(() => window.__apex.garageCam());
    expect(aimed.az, "rear-wing three-quarter").toBeCloseTo(Math.PI * 0.72, 5);
    expect(aimed.dist, "and frames the whole rear wing").toBeCloseTo(4.6, 5);
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

  // Screen sun-shafts from the bay sky fill washed liveries white/sky-blue after
  // team switch + orbit (live garage sheet 2026-10-06). presentOpts must keep
  // shafts at 0 even when the Home track's LT.sunShaftMul is hot — a pixel
  // washout gate would need soft-present + luminance, which this suite cannot
  // afford; the live knob is the same contract and is assertable in one evaluate.
  test("presentOpts keeps screen sun-shafts off after team switches", async ({ page }) => {
    await openGarage(page);
    const teams = ["mercedes", "ferrari", "redbull", "astonmartin"];
    for (const id of teams) {
      const shaft = await page.evaluate((tid) => {
        const r = window.__apex.garageTeam(tid);
        if (!r || !r.ok) throw new Error("garageTeam " + tid + ": " + JSON.stringify(r));
        window.__apex.garageFrame("hero", { az: 1.1, el: 0.35 });
        window.__apex.garageStep(1 / 30, 24);
        return SetupCamera.presentOpts().tune.sunShaftMul;
      }, id);
      expect(shaft, `${id} sunShaftMul`).toBe(0);
    }
  });
});

// Real pointer activation protects the narrow UI contract; evaluate-clicks
// would bypass the footer that previously covered Camera on a short phone.
test("garage camera stays clickable and its drawer stays bounded on phones", async ({ page }) => {
  await page.evaluate(() => window.__apex.headless(true));
  for (const side of ["right", "left"]) {
  await page.evaluate((side) => document.documentElement.setAttribute("data-look-garage-side", side), side);
  for (const viewport of [{ width: 393, height: 659 }, { width: 734, height: 343 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(({ width, height }) => {
      const style = document.documentElement.style;
      style.setProperty("--sat", height > width ? "59px" : "0px");
      style.setProperty("--sab", height > width ? "34px" : "21px");
      style.setProperty("--sal", height > width ? "0px" : "59px");
      style.setProperty("--sar", height > width ? "0px" : "59px");
    }, viewport);
    await openGarage(page);
    // Opening/resize can repaint safe-area tokens; measure the settled sheet,
    // including the <400 local-pixel width that previously made basis=height.
    await page.evaluate(({ width, height }) => {
      const style = document.documentElement.style;
      style.setProperty("--sat", height > width ? "59px" : "0px");
      style.setProperty("--sab", height > width ? "34px" : "21px");
      style.setProperty("--sal", height > width ? "0px" : "59px");
      style.setProperty("--sar", height > width ? "0px" : "59px");
      window.SheetShape.reclassify();
    }, viewport);
    await expect.poll(() => page.locator("#cs-options").evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect.poll(() => page.locator("#cs-tabs").evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const layout = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const sheet = r("cs-inner"), bar = r("cs-stack");
      return { overlap: Math.max(0, Math.min(sheet.right, bar.right) - Math.max(sheet.left, bar.left)) * Math.max(0, Math.min(sheet.bottom, bar.bottom) - Math.max(sheet.top, bar.top)) };
    });
    expect(layout.overlap).toBeLessThanOrEqual(1);
    await page.locator("#cs-tab-engine").click();
    await expect(page.locator("#cs-tab-engine")).toHaveAttribute("aria-selected", "true");
    await page.locator("#cs-cam").click();
    await expect(page.locator("#cs-cam-panel")).toBeVisible();
    const metrics = await page.evaluate(() => {
      const panel = document.getElementById("cs-cam-panel");
      const r = panel.getBoundingClientRect();
      const options = document.getElementById("cs-options").getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        xOverflow: panel.scrollWidth - panel.clientWidth, optionsHeight: options.height,
        width: innerWidth, height: innerHeight };
    });
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.height);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.width);
    expect(metrics.xOverflow).toBeLessThanOrEqual(1);
    expect(metrics.optionsHeight).toBeGreaterThanOrEqual(44);
    await page.locator("#cs-view-reset").click();
    await page.locator("#cs-cam").click();
    await expect(page.locator("#cs-cam-panel")).toBeHidden();
    if (viewport.width === 568) {
      await page.locator("#cs-tab-livery").click();
      await page.locator(".cs-liv-create").click();
      await expect(page.locator(".cs-liv-editor")).toBeVisible();
      await expect(page.locator("#cs-tabs")).toBeHidden();
      const editor = await page.evaluate(() => {
        const host = document.getElementById("cs-body");
        const body = host.getBoundingClientRect(), style = getComputedStyle(host);
        const options = document.getElementById("cs-options").getBoundingClientRect();
        const scale = body.width / host.offsetWidth;
        const padding = (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) * scale;
        return { widthDelta: Math.abs(body.width - padding - options.width), height: options.height };
      });
      expect(editor.widthDelta).toBeLessThanOrEqual(1);
      expect(editor.height).toBeGreaterThanOrEqual(44);
      await page.locator(".cs-liv-ed-cancel").click();
    }
    await page.locator("#cs-done").click();
    await expect(page.locator("#carsetup")).toBeHidden();
  }
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-look-garage-side"));
});
