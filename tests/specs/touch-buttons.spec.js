// @ts-check
// On-screen steering BUTTONS — the arrow ramps and the adaptive analog triggers (js/input/input.js).
//
// PART TWO OF THREE. touch-steer.spec.js declared 25 tests against the
// change-aware gate's 10-test capacity, which made it `unreachable` — bigger
// than the whole cap, so no budget could admit it and a js/input/ diff selected
// nothing. Its timeout was never the problem (120 s against a 180 s cap); the
// COUNT was. The shared setup lives in ../helpers/touch-input.js and the reason
// for the split is written there.
//
// Keep this file under 10 tests.
import { test, expect } from "../helpers/fixtures.js";
import { useTouchCanvas, steer, pump } from "../helpers/touch-input.js";

useTouchCanvas(test);

test.describe("on-screen arrows ramp like a key, not a switch", () => {
  test("holding an arrow builds toward lock over time", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await page.evaluate(() => document.getElementById("btn-steer-right")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 11, bubbles: true })));
    const first = await steer(page);
    expect(first).toBeLessThan(1);          // used to be a bare 1 on the first read
    const later = await pump(page);
    expect(later).toBeGreaterThan(first);   // KEY_RAMP_IN = 6/s → full lock in ~167 ms
    expect(later).toBe(1);
  });

  test("releasing returns to centre", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await page.evaluate(() => document.getElementById("btn-steer-left")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 12, bubbles: true })));
    expect(await pump(page)).toBe(-1);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12 })));
    expect(await pump(page)).toBe(0);
  });

  // THE PLAYER REPORT: buttons mode, thumb on GAS, tap LEFT/RIGHT to turn,
  // throttle dies. Two real fingers are two pointerIds. WebKit then fires
  // lostpointercapture / pointerleave on the FIRST button — setPointerCapture
  // on the turn arrow steals the only capture slot, and the anti-latch nets
  // treated that as "finger up". The first thumb is still on the glass.
  test("holding GAS survives tapping a turn arrow", async ({ page }) => {
    const r = await page.evaluate(() => {
      Input.reset();
      Input.setSteerMode("buttons");
      const gas = document.getElementById("btn-throttle");
      const left = document.getElementById("btn-steer-left");
      gas.hidden = false;
      left.hidden = false;
      if (gas.parentElement) gas.parentElement.hidden = false;
      if (left.parentElement) left.parentElement.hidden = false;
      const pe = (el, type, id, extra) => el.dispatchEvent(new PointerEvent(type, {
        pointerId: id, bubbles: true, cancelable: true, ...extra,
      }));
      pe(gas, "pointerdown", 41);
      const held = Input.throttle();
      pe(left, "pointerdown", 42);
      // Capture steal: GAS is still shown, thumb still down (buttons: 1).
      pe(gas, "lostpointercapture", 41, { buttons: 1 });
      const afterSteal = Input.throttle();
      // setPointerCapture also fires a boundary pointerleave (see holdSetupCtl
      // in js/game.js — they already refuse to release on that event).
      pe(gas, "pointerleave", 41, { buttons: 1 });
      const afterLeave = Input.throttle();
      const turning = Input.debugState().btn.left;
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 42 }));
      const afterTurnUp = Input.throttle();
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 41 }));
      const afterGasUp = Input.throttle();
      return { held, afterSteal, afterLeave, turning, afterTurnUp, afterGasUp };
    });
    expect(r.held).toBe(true);
    expect(r.afterSteal).toBe(true);
    expect(r.afterLeave).toBe(true);
    expect(r.turning).toBe(true);
    expect(r.afterTurnUp).toBe(true);
    expect(r.afterGasUp).toBe(false);
  });
});
test.describe("adaptive buttons are analog triggers for digital steer", () => {
  const pressAt = (page, id, pointerId, x) => page.evaluate(({ id, pointerId, x }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointerdown", { pointerId, clientX: x, bubbles: true })),
    { id, pointerId, x });
  const slideX = (page, id, pointerId, x) => page.evaluate(({ id, pointerId, x }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointermove", { pointerId, clientX: x, bubbles: true })),
    { id, pointerId, x });

  test("at rest, adaptive still reaches lock at the old rate", async ({ page }) => {
    await page.evaluate(() => {
      Input.reset();
      Input.setSteerMode("buttons");
      Input.setAdaptiveButtons(true);
      Input.setSteerSpeedRef(42);
      Input.setSpeedStd(0);
    });
    await page.evaluate(() => document.getElementById("btn-steer-right")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 31, bubbles: true })));
    expect(await pump(page)).toBe(1);
  });

  test("at speed a tap is a correction, not an instant yank", async ({ page }) => {
    await page.evaluate(() => {
      Input.reset();
      Input.setSteerMode("buttons");
      Input.setAdaptiveButtons(true);
      Input.setSteerSpeedRef(42);
      Input.setSpeedStd(72);
    });
    await page.evaluate(() => document.getElementById("btn-steer-right")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 32, bubbles: true })));
    const later = await pump(page);
    expect(later).toBeGreaterThan(0.15);
    expect(later).toBeLessThan(0.75);   // the same pump reaches 1 with adaptive off
  });

  test("sliding opposite the steer direction eases like an analog trigger", async ({ page }) => {
    await page.evaluate(() => {
      Input.reset();
      Input.setSteerMode("buttons");
      Input.setAdaptiveButtons(true);
      Input.setSpeedStd(0);
    });
    await pressAt(page, "btn-steer-right", 33, 400);
    expect(await page.evaluate(() => Input.debugState().btn.rightVal)).toBe(1);
    await slideX(page, "btn-steer-right", 33, 310);   // 90 px back toward centre
    const eased = await page.evaluate(() => Input.debugState().btn.rightVal);
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(0.5);
  });

  test("adaptive off ignores analog travel — a tap still aims at full lock", async ({ page }) => {
    await page.evaluate(() => {
      Input.reset();
      Input.setSteerMode("buttons");
      Input.setAdaptiveButtons(false);
    });
    await pressAt(page, "btn-steer-right", 34, 400);
    await slideX(page, "btn-steer-right", 34, 310);
    expect(await pump(page)).toBe(1);
  });

  test("the Advanced slider persists and the label tracks it", async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById("adv-details").open = true;
      const el = document.getElementById("pm-adaptbtn");
      el.value = "10";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await page.evaluate(() => Input.debugState().adaptiveMix)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.adaptiveButtons")))).toBe(10);
    expect(await page.evaluate(() => document.getElementById("pm-adaptbtn-v").textContent)).toBe("10");
    await page.evaluate(() => {
      const el = document.getElementById("pm-adaptbtn");
      el.value = "1";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await page.evaluate(() => Input.debugState().adaptiveMix)).toBe(0);
    expect(await page.evaluate(() => document.getElementById("pm-adaptbtn-v").textContent)).toBe("OFF");
  });

  test("a mid slider is slower than off and faster than full, at the same speed", async ({ page }) => {
    const run = (mix) => page.evaluate(async (m) => {
      Input.reset();
      Input.setSteerMode("buttons");
      Input.setAdaptiveButtons(m);
      Input.setSteerSpeedRef(42);
      Input.setSpeedStd(72);
      document.getElementById("btn-steer-right")
        .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 40 + Math.round(m * 10), bubbles: true }));
      let v = 0;
      for (let i = 0; i < 12; i++) {
        v = Input.steer();
        if (i < 11) await new Promise((r) => setTimeout(r, 20));
      }
      return v;
    }, mix);
    const off = await run(0);
    const mid = await run(0.5);
    const full = await run(1);
    expect(off).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(full);
    expect(full).toBeGreaterThan(0.1);
  });
});