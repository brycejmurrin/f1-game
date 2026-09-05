// @ts-check
// Canvas touch steering and on-screen pedal travel — js/input/input.js.
//
// NOTHING COVERED ANY OF THIS BEFORE. The whole touch path — the one steering
// mode aimed squarely at an iPad — had no spec at all: the only canvas
// `touchstart` anywhere in tests/ was an incidental one in gamepad.spec.js's
// blur-release case. So the binary screen-half rule ("touch the left half, get
// full left lock, instantly, forever") survived as long as it did partly
// because no assertion ever looked at it.
//
// These drive the real listeners with synthetic Touch/Pointer events and read
// the public Input surface the game loop uses. No race needs to start — the
// module is wired by Input.init() at load.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console instead of a bare "expected 1, got 0".
// Every neighbouring driving spec still takes the raw import and therefore gets
// none of that — this one is not following that example.
import { test, expect } from "../helpers/fixtures.js";

const TOUCH = { hasTouch: true, viewport: { width: 844, height: 390 } };

test.use(TOUCH);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.steer);
  await page.evaluate(() => { Input.reset(); Input.setSteerMode("touch"); });
});

// Dispatch a raw touch event at the canvas. The listeners read `changedTouches`
// and nothing else, so a plain Event carrying that property is enough and keeps
// the test independent of Touch-constructor availability.
const touchEvt = (page, type, points) =>
  page.evaluate(({ type, points }) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "changedTouches", { value: points });
    document.getElementById("game").dispatchEvent(e);
  }, { type, points });

const steer = (page) => page.evaluate(() => Input.steer());

// The ramps advance by rate x dt on each steer() call, and dt is CLAMPED to
// 100 ms so one call after a long pause cannot jump the wheel across. The game
// polls steer() once per physics step, so a test that wants a ramp to finish has
// to do the same rather than sleeping once and reading.
async function pump(page, ticks = 12, gapMs = 20) {
  let v = 0;
  for (let i = 0; i < ticks; i++) {
    v = await steer(page);
    if (i < ticks - 1) await page.waitForTimeout(gapMs);
  }
  return v;
}

test.describe("touch steering is an anchored drag, not a screen half", () => {
  test("a tap steers nothing — it only sets the anchor", async ({ page }) => {
    // The old rule made this full lock: clientX past the midpoint meant +1. A
    // stationary finger is not a steering request, and this is the single most
    // visible consequence of the change.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    expect(await steer(page)).toBe(0);
  });

  test("steering is proportional to how far the finger has travelled", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 400, clientY: 200 }]);
    const range = await page.evaluate(() => Input.debugState().touchRangePx);
    // Quarter of the way to full lock, then most of the way. The exact values
    // depend on the dead zone, so assert ORDER and bounds rather than numbers —
    // a sensitivity retune must not rewrite this test.
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 400 + range * 0.25, clientY: 200 }]);
    const quarter = await steer(page);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 400 + range * 0.8, clientY: 200 }]);
    const most = await steer(page);
    expect(quarter).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(quarter * 1.5);
    expect(most).toBeLessThan(1);
  });

  test("the drag is relative, so the same gesture works anywhere on the glass", async ({ page }) => {
    // Same displacement, opposite sides of the screen. Under the old rule these
    // two gestures produced -1 and +1; the point of anchoring is that where the
    // thumb lands carries no meaning at all.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 120, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 190, clientY: 200 }]);
    const left = await steer(page);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 190, clientY: 200 }]);
    await page.evaluate(() => Input.reset());

    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 700, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 2, clientX: 770, clientY: 200 }]);
    const right = await steer(page);
    expect(left).toBeCloseTo(right, 3);
  });

  test("dragging left steers left", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 500, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 380, clientY: 200 }]);
    expect(await steer(page)).toBeLessThan(0);
  });

  test("full lock is reachable and clamped", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 200, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("lifting off ramps back to centre instead of snapping", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    // The first read after release is still near lock — the wheel travels, it
    // does not teleport. That IS the assertion; a snap would read 0 here.
    const justAfter = await steer(page);
    expect(justAfter).toBeGreaterThan(0.3);
    expect(justAfter).toBeLessThan(1);
    expect(await pump(page)).toBe(0);    // KEY_RAMP_OUT = 8/s → home in ~125 ms
  });

  test("the most recently MOVED finger steers, not the most recently placed", async ({ page }) => {
    // The regression this exists for: `touches` is keyed by identifier and
    // Map.set() on an existing key does NOT move it to the end, so reading the
    // last entry returned the most recently STARTED touch. A first finger that
    // then dragged could never take control back from a later, idle one.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 400, clientY: 200 }]);
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 600, clientY: 300 }]);
    // Finger 2 is idle at its anchor (steer 0). Finger 1 — placed FIRST — drags.
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("tilt and button modes ignore canvas drags entirely", async ({ page }) => {
    for (const mode of ["tilt", "buttons"]) {
      await page.evaluate((m) => { Input.reset(); Input.setSteerMode(m); }, mode);
      await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
      await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
      expect(await steer(page), `${mode} mode must not steer from the canvas`).toBe(0);
    }
  });

  test("switching mode mid-drag cannot leave lock latched", async ({ page }) => {
    // Nothing in tilt/button mode calls touchSteering(), so a value left behind
    // by an interrupted drag would be held until something else overwrote it.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await page.evaluate(() => Input.setSteerMode("tilt"));
    expect(await steer(page)).toBe(0);
  });
});

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

test.describe("on-screen pedals report travel, not just a press", () => {
  const press = (page, id, pointerId, y) => page.evaluate(({ id, pointerId, y }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointerdown", { pointerId, clientY: y, bubbles: true })),
    { id, pointerId, y });
  const slide = (page, id, pointerId, y) => page.evaluate(({ id, pointerId, y }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointermove", { pointerId, clientY: y, bubbles: true })),
    { id, pointerId, y });

  test("a plain press is still full travel", async ({ page }) => {
    // The compatibility promise: a player who taps the pedal and never discovers
    // the ease-off gesture gets exactly what they got before.
    await press(page, "btn-brake", 21, 300);
    expect(await page.evaluate(() => Input.brakeLevel())).toBe(1);
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("sliding up the screen eases the pedal off", async ({ page }) => {
    await press(page, "btn-brake", 22, 300);
    await slide(page, "btn-brake", 22, 260);       // 40 px up
    const part = await page.evaluate(() => Input.brakeLevel());
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    await slide(page, "btn-brake", 22, 150);       // far up
    expect(await page.evaluate(() => Input.brakeLevel())).toBeLessThan(part);
    // Still HELD, though — sliding is modulation, not release.
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("a small tremor does not modulate the pedal", async ({ page }) => {
    await press(page, "btn-throttle", 23, 300);
    await slide(page, "btn-throttle", 23, 292);    // inside PEDAL_DEAD_PX
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });

  test("throttle travel survives to the physics", async ({ page }) => {
    // throttleLevel() existed for a long time with NO consumer anywhere — the
    // pad's analog trigger was thresholded to a boolean and the travel thrown
    // away. This is the assertion that it now reaches the car.
    await press(page, "btn-throttle", 24, 300);
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
    await slide(page, "btn-throttle", 24, 180);
    const eased = await page.evaluate(() => Input.throttleLevel());
    expect(eased).toBeLessThan(0.6);
    expect(eased).toBeGreaterThan(0);
  });

  test("releasing clears travel", async ({ page }) => {
    await press(page, "btn-brake", 25, 300);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 25 })));
    expect(await page.evaluate(() => Input.brakeLevel())).toBe(0);
    expect(await page.evaluate(() => Input.braking())).toBe(false);
  });

  test("a keyboard press outranks a part-open pedal", async ({ page }) => {
    // A desktop player must never be modulated by something they aren't holding.
    await press(page, "btn-throttle", 26, 300);
    await slide(page, "btn-throttle", 26, 150);
    await page.evaluate(() => window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "ArrowUp", bubbles: true })));
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });
});

// THE INVARIANT BEHIND A REAL PLAYER REPORT: "throttle is always on regardless
// of if I'm pressing it", in BUTTONS mode, after an off-track recovery.
//
// Auto-throttle is the one mechanism in the game that legitimately drives the
// car with no input, and it is supposed to exist ONLY in touch mode — where the
// GAS button is hidden precisely because the car throttles itself. So the pair
// (autoThrottle, GAS visible) has exactly one illegal combination: auto-throttle
// ON while the button is still on screen. A player pressing a visible GAS button
// whose car accelerates anyway is describing that state exactly.
//
// The investigation found no path that reaches it — steerMode has a single
// writer that syncs Input and refreshes the controls, and `paused` is a separate
// flag from `state`, so a switch made in the PAUSE MENU mid-race still refreshes
// (the near-miss: setSteerMode only refreshes when state is race/count). This
// test is what stops that staying true by luck. It cycles every mode through the
// pause menu, in a race, and asserts the pair can never disagree.
test("auto-throttle and the GAS button can never disagree, across mode switches", async ({ page, loadTrack }) => {
  test.setTimeout(120_000);
  await loadTrack("monza");
  await page.evaluate(() => window.__apex.go());

  const readPair = () => page.evaluate(() => ({
    mode: window.__apex.inputState().steerMode,
    gasVisible: !document.getElementById("btn-throttle")?.hidden,
    // physState().speed with no input held is the observable half: in a mode
    // where the button is visible, nothing may accelerate the car on its own.
    speed: window.__apex.physState()?.speed ?? null,
  }));

  const seen = [];
  for (let i = 0; i < 4; i++) {                  // 3 modes + wrap, via the real UI
    const pair = await readPair();
    seen.push(pair);
    // The illegal state: the car throttles itself while the player still has a
    // GAS button to press. Auto-throttle is touch-only BY DESIGN.
    const autoOn = pair.mode === "touch";
    expect(autoOn && pair.gasVisible,
      `mode ${pair.mode}: auto-throttle ${autoOn} with GAS visible ${pair.gasVisible} — ` +
      "the car would accelerate regardless of the button").toBe(false);
    // Through the REAL pause menu, the way a player switches: the pause button
    // opens it, STEER cycles the mode, resume closes it. Driving setSteerMode()
    // directly would skip the very refresh this test exists to check.
    await page.evaluate(() => {
      document.getElementById("pausebtn")?.click();
      // STEERING INPUT is a setting row: › steps to the next mode.
      document.getElementById("pm-steer-next")?.click();
      document.getElementById("pm-resume")?.click();
    });
    await page.waitForTimeout(150);
  }
  // Anti-vacuity: the loop must actually have visited more than one mode, or it
  // proved the invariant for a single state and called it a sweep.
  expect(new Set(seen.map((s) => s.mode)).size).toBeGreaterThan(1);
});
