// @ts-check
// BOOST's first press must not be the first time the page draws #btn-boost.on (js/ui/hud.js boostWarmFrame).
//
// Bryce, 2026-10-23: "whenever I am in buttons steering mode and I take my finger off of throttle to hit boost the
// game lags". On a real iPhone 18 Pro Max (AWS Device Farm, three.js WebGPU) the first BOOST tap of a Safari
// process froze one frame for ~0.74 s; every later tap, and every tap after a reload in the same process, was
// 19-25 ms, and the game tick itself never passed 24 ms (docs/notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md). The
// HUD now draws the on-state for two frames the first time the button is on screen, so WebKit pays that one-time
// cost at race reveal. Chromium cannot show the stall; what this pins is the mechanism: the warm-up happens once,
// before any input, clears itself, leaves the car's BOOST off, and does not desync the HUD's class cache so a real
// press still lights the button.
import { test, expect } from "../helpers/fixtures.js";
import { TOUCH } from "../helpers/touch-input.js";

test.use(TOUCH);

test("BOOST's on-state is drawn once before any press, then a real press still lights it", async ({ page, loadTrack }) => {
  test.setTimeout(150_000);
  // Record every class flip of #btn-boost from the first document on, so a warm-up that ran before loadTrack
  // returned is still seen.
  await page.addInitScript(() => {
    const flips = (window.__boostFlips = []);
    let last = false;   // the shell ships #btn-boost without .on
    new MutationObserver(() => {
      const b = document.getElementById("btn-boost");
      if (!b) return;
      const on = b.classList.contains("on");
      if (on !== last) { last = on; flips.push(on); }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  await loadTrack("monza");
  await page.evaluate(() => window.__apex.go());

  const warmed = () => window.__apex.logs().filter((l) => /boost on-state warmed/.test(l.msg)).length;
  await page.waitForFunction(warmed, null, { polling: 100, timeout: 90_000 });

  const after = await page.evaluate(() => ({
    warms: window.__apex.logs().filter((l) => /boost on-state warmed/.test(l.msg)).length,
    flips: window.__boostFlips.slice(),
    on: document.getElementById("btn-boost").classList.contains("on"),
    hidden: document.getElementById("btn-boost").hidden,
    boostOn: window.__apex.carState().some((c) => c.boostOn),
  }));
  expect(after.hidden).toBe(false);
  expect(after.warms).toBe(1);
  // The first flip is the warm-up's ON, and it has already been taken back off.
  expect(after.flips[0]).toBe(true);
  expect(after.on).toBe(false);
  // The warm-up is paint only: no car's BOOST was switched on by it.
  expect(after.boostOn).toBe(false);

  // A real press after the warm-up must still light the button (hToggle's cache saw the warm-up ON and OFF).
  await page.evaluate(() => document.getElementById("btn-boost")
    .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 51, pointerType: "touch", bubbles: true })));
  await page.waitForFunction(() => document.getElementById("btn-boost").classList.contains("on"), null,
    { polling: 100, timeout: 60_000 });
  expect(await page.evaluate(() => window.__apex.logs().filter((l) => /boost on-state warmed/.test(l.msg)).length)).toBe(1);
});
