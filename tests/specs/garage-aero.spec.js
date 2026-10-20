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
// (Selected specs 2026-09-09).
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

  // P2-32: a call made with the garage shut used to answer a bare null.
  test("with the garage closed, garageAero and garageStep say so", async ({ page }) => {
    await toMenu(page);
    const r = await page.evaluate(() => ({
      on: window.__apex.garageCam().on,
      aero: window.__apex.garageAero(true),
      step: window.__apex.garageStep(1 / 60, 2),
    }));
    expect(r.on, "the title has no garage preview up").toBe(false);
    expect(r.aero).toEqual({ ok: false, error: "garage_closed" });
    expect(r.step).toEqual({ ok: false, error: "garage_closed" });
  });

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
      // The rear stack shares one pivot, off most elements' chord lines (FIA
      // C3.11.6), so rotate the design-pose LE about it.
      const at = (e, d) => {
        const dy = e.le[1] - e.y, dz = e.le[0] - e.z, c = Math.cos(d), s = Math.sin(d);
        return [dy * s + dz * c + e.z, dy * c - dz * s + e.y];
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

  // P2-32: the button's own branch (setup-camera.js setSetupAero: lit class,
  // aria-pressed, the CORNER/STRAIGHT label) is reachable only by clicking it —
  // garageAero() sets the same state without proving the control shows it.
  test("the AERO button drives the flap and shows its state", async ({ page }) => {
    await openGarage(page);
    const read = () => page.evaluate(() => {
      const b = document.getElementById("cs-aero");
      const v = b.querySelector(".cs-aero-val");
      return { pressed: b.getAttribute("aria-pressed"), lit: b.classList.contains("active"),
               label: v ? v.textContent : null, xOn: window.__apex.garageAero().xOn };
    });
    expect(await read()).toEqual({ pressed: "false", lit: false, label: "CORNER MODE", xOn: false });
    await clickId(page, "cs-aero");
    expect(await read()).toEqual({ pressed: "true", lit: true, label: "STRAIGHT MODE", xOn: true });
    // The click starts the real ease, not a snap.
    const opened = await page.evaluate(() => window.__apex.garageStep(1 / 60, 60));
    expect(opened.aeroX).toBe(1);
    await clickId(page, "cs-aero");
    expect(await read()).toEqual({ pressed: "false", lit: false, label: "CORNER MODE", xOn: false });
    const shut = await page.evaluate(() => window.__apex.garageStep(1 / 60, 120));
    expect(shut).toEqual({ xOn: false, aeroX: 0, mode: "Z" });
  });

  // Bryce 2026-10-20: the AERO button used to snap the view to the rear wing.
  // It now changes the flaps only; the camera stays wherever the player left it.
  test("the AERO button never moves the camera (turntable and whole-car preset)", async ({ page }) => {
    await openGarage(page);
    const pose = () => page.evaluate(() => { const c = window.__apex.garageCam(); return { az: c.az, el: c.el, dist: c.dist, spin: c.spin }; });
    const before = await pose();
    expect(before.spin, "the garage opens on the turntable").toBe(true);
    await clickId(page, "cs-aero");
    const turntable = await pose();
    expect(turntable.spin, "the turntable keeps running").toBe(true);
    expect(turntable.dist).toBeCloseTo(before.dist, 5);
    await clickId(page, "cs-aero");
    await clickId(page, "cs-cam");
    await page.evaluate(() => document.querySelector('[data-cs-view="rear"]').click());
    const chosen = await pose();
    expect(chosen.dist).toBeGreaterThan(5);
    await clickId(page, "cs-aero");
    expect(await pose()).toEqual(chosen);
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
