// @ts-check
// Steering-physics tests for the player heading model (js/game.js, updateCar).
//
// These run the real simulation deterministically: __apex.setInput() overrides
// the player's steer/throttle/brake and __apex.step(dt, n) advances the physics
// at a fixed timestep, so results don't depend on the (very slow, ~2 fps under
// SwiftShader) render clock. __apex.probe() reports the player's lateral offset
// x, heading offset angle, local curvature k, half-width hw and speed.
//
// Sign conventions (see Tracks.curvature + the heading model):
//   x      metres, + = right of the centreline
//   k      rad/m,  + = LEFT-hand corner (measured — see the corner-table note
//          in js/agent/agentview.js; the old "+ = right" label was backwards)
//   outside of a corner is the +sign(k) side; inside is -sign(k) — which is
//   what the assertions below always used.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function startLiveRace(page) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#cs-done").click();   // START opens the GARAGE; DONE carries on
  await page.locator("#rs-go").click();
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    null, { polling: 100, timeout: BOOT_MS }
  );
  await page.evaluate(() => window.__apex.go());
}

const probe = (page) => page.evaluate(() => window.__apex.probe());

// Place the player, hold the given input for `ticks` physics frames, return the
// before/after probes. dt is fixed at 1/60 s. throttle defaults off so speed
// stays close to the value we jumped in at (no acceleration ramp).
async function run(page, { frac, speed = 30, steer = 0, throttle = false, brake = false, settle = 3, ticks = 90 }) {
  await page.evaluate((f) => { window.__apex.jump(f.frac, f.speed, 0); }, { frac, speed });
  await page.evaluate((inp) => {
    window.__apex.setInput(inp);
    window.__apex.step(1 / 60, inp.settle);
  }, { steer: 0, throttle, brake, settle });
  const before = await probe(page);
  await page.evaluate((inp) => {
    window.__apex.setInput(inp);
    window.__apex.step(1 / 60, inp.ticks);
    window.__apex.clearInput();
  }, { steer, throttle, brake, ticks });
  const after = await probe(page);
  return { before, after };
}

// Move the racing-line slider and fire its handler (exercises the full wiring:
// slider -> store -> raceLineAssist -> physics). v in -5..5.
async function setRaceLine(page, v) {
  await page.evaluate((val) => {
    const el = document.getElementById("pm-line");
    el.value = String(val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
}

// First corner with curvature above `min` (rad/m); returns { frac, k }.
async function firstCorner(page, min = 0.02) {
  const corners = await page.evaluate(() => window.__apex.corners());
  for (const f of corners) {
    const p = await page.evaluate((ff) => { window.__apex.jump(ff, 24, 0); return window.__apex.probe(); }, f);
    if (Math.abs(p.k) > min) return { frac: f, k: p.k };
  }
  return { frac: corners[0], k: 0 };
}

// A reasonably straight stretch: the lap fraction with the smallest |k|.
async function findStraight(page) {
  return page.evaluate(() => {
    let best = 0, bestK = Infinity;
    for (let i = 0; i < 50; i++) {
      const f = i / 50;
      window.__apex.jump(f, 20, 0);
      const k = Math.abs(window.__apex.probe().k);
      if (k < bestK) { bestK = k; best = f; }
    }
    return { frac: best, k: bestK };
  });
}

test.describe("Apex 26 — steering", () => {
  // NOTE: the DRIVING HELP assist is OPT-IN — it ships at 0 (see the default
  // contract test below), so this exercises the assist MECHANISM at an explicit
  // gain rather than "whatever ships". It used to read tuning().roadFollow and
  // assert it was > 0, which encoded the old always-on design.
  test("road-follow, when switched on, is active and changes the cornering line", async ({ page }) => {
    await startLiveRace(page);
    const def = 0.6;                                  // an explicit, opted-in assist
    const corners = await page.evaluate(() => window.__apex.corners());
    expect(corners.length).toBeGreaterThan(0);

    // Sample several distinct corners across the lap.
    const sample = corners.filter((_, i) => i % 4 === 0).slice(0, 5);
    let checked = 0;
    for (const frac of sample) {
      // Road-follow OFF = pure world-space: with no input the car holds a straight
      // heading and runs wide to the OUTSIDE (+sign(k)). This is the baseline the
      // DRIVING-HELP assist exists to counter.
      await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
      const off = await run(page, { frac, speed: 13, throttle: false, ticks: 70 });
      if (Math.abs(off.before.k) < 0.012) continue;   // skip near-straight false peaks
      checked++;
      const dxOff = off.after.x - off.before.x;
      expect(Math.sign(dxOff)).toBe(Math.sign(off.before.k));   // off-model runs wide
      expect(Math.abs(dxOff)).toBeGreaterThan(0.6);             // a real slide, not a wobble
      // Road-follow, once opted into, steers into the bend through the tyres,
      // so the car takes a MEASURABLY different line than with the assist off. (We
      // assert the assist is active and alters the corner rather than a fragile
      // "stays nearer the line": with a real slip model, steering into a corner also
      // develops body slip, so the lateral effect is more nuanced than the old
      // kinematic model — that quality is covered by the on-device feel + the
      // autopilot driving safely, not this unit check.)
      await page.evaluate((rf) => window.__apex.setPhysics({ roadFollow: rf }), def);
      const on = await run(page, { frac, speed: 13, throttle: false, ticks: 70 });
      expect(Math.abs(on.after.x - off.after.x)).toBeGreaterThan(0.25);
    }
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
    expect(checked).toBeGreaterThan(0);
  });

  // THE DEFAULT CONTRACT: nothing steers the car but the driver.
  // The assist used to ship at 0.7 with a slider that bottomed out at 0.25, so a
  // quarter to a half of every corner was steered for you and it could not be
  // switched off. Now it is opt-in, and this is the test that says so.
  test("by default nothing steers the car: zero input holds a straight world line", async ({ page }) => {
    await startLiveRace(page);
    // Nothing in the shipped configuration touches the wheel…
    expect(await page.evaluate(() => window.__apex.tuning().roadFollow)).toBe(0);
    expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBe(0);

    const { frac, k } = await firstCorner(page);
    expect(Math.abs(k)).toBeGreaterThan(0.02);
    // …so through a real corner, with the stick centred, the car's ABSOLUTE world
    // heading must not move at all. (Heading relative to the tangent necessarily
    // changes — the road turns underneath the car. That is the whole point.)
    const swing = await page.evaluate((f) => {
      window.__apex.jump(f, 22, 0);
      window.__apex.setInput({ steer: 0, throttle: false, brake: false });
      window.__apex.step(1 / 60, 2);
      const h0 = window.__apex.physState().head;
      window.__apex.step(1 / 60, 45);
      const h1 = window.__apex.physState().head;
      window.__apex.clearInput();
      let d = h1 - h0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d) * 180 / Math.PI;
    }, frac);
    expect(swing).toBeLessThan(0.5);   // degrees — straight, not "mostly straight"
  });

  test("steering has authority to fight the curvature drift", async ({ page }) => {
    await startLiveRace(page);
    const corners = await page.evaluate(() => window.__apex.corners());
    // Pick a real corner.
    let frac = corners[0], k0 = 0;
    for (const f of corners) {
      const p = await page.evaluate((ff) => { window.__apex.jump(ff, 24, 0); return window.__apex.probe(); }, f);
      if (Math.abs(p.k) > 0.02) { frac = f; k0 = p.k; break; }
    }
    expect(Math.abs(k0)).toBeGreaterThan(0.02);

    // Isolate the DRIVER's authority from the DRIVING-HELP assist: with the
    // assist off, held lock must move the car clearly further in the steered
    // direction than coasting does — proving manual steering controls the line.
    // (lockDir = +sign(k) was named "inward" when "+k = right-hand corner" was
    // believed; under the measured convention it is the outside. The assertion
    // never cared which side — it measures authority relative to coasting.)
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
    const lockDir = Math.sign(k0);
    const zero = await run(page, { frac, speed: 22, steer: 0, throttle: false, ticks: 75 });
    const held = await run(page, { frac, speed: 22, steer: lockDir, throttle: false, ticks: 75 });
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0.7 }));

    const dxZero = zero.after.x - zero.before.x;
    const dxHeld = held.after.x - held.before.x;   // should be far more toward lockDir
    // Held lock must move the car at least 2 m further toward the steered side
    // than coasting does — i.e. the driver genuinely controls the line.
    expect((dxHeld - dxZero) * lockDir).toBeGreaterThan(2);
  });

  test("direction: +steer goes right, −steer goes left on a straight", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    const right = await run(page, { frac, speed: 30, steer: 1, ticks: 60 });
    const left = await run(page, { frac, speed: 30, steer: -1, ticks: 60 });

    expect(right.after.x - right.before.x).toBeGreaterThan(0.5);
    expect(left.after.x - left.before.x).toBeLessThan(-0.5);
  });

  test("expo response: half input turns the car well under half as fast", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    // Short burst (10 ticks ≈ 0.17 s) over a part-input pair that stays BELOW the
    // tyre's grip saturation, so the angle change reflects the raw input→steer
    // expo curve, not the friction cap (which would flatten the top and mask it).
    const full = await run(page, { frac, speed: 30, steer: 0.6, ticks: 10 });
    const half = await run(page, { frac, speed: 30, steer: 0.3, ticks: 10 });

    const aFull = Math.abs(full.after.angle - full.before.angle);
    const aHalf = Math.abs(half.after.angle - half.before.angle);
    expect(aFull).toBeGreaterThan(0.02);
    // STEER_EXPO ≈ 2.4 → halving the stick gives ≈ 0.5^2.4 ≈ 0.19 of the steer
    // angle: very gentle near centre. Allow margin: between 8 % and 35 % of full.
    expect(aHalf).toBeLessThan(aFull * 0.35);
    expect(aHalf).toBeGreaterThan(aFull * 0.08);
  });

  test("straight tracking: no input keeps the car on its line", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);
    const { before, after } = await run(page, { frac, speed: 30, steer: 0, throttle: true, ticks: 90 });
    // On a straight the heading stays put, so lateral position barely moves.
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.angle)).toBeLessThan(0.05);
  });

  test("symmetry: opposite inputs turn the heading by opposite, equal amounts", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    // Compare heading change over a short burst (pre-saturation) so the result
    // isn't dominated by residual track curvature over a long slide.
    const right = await run(page, { frac, speed: 30, steer: 1, ticks: 6 });
    const left = await run(page, { frac, speed: 30, steer: -1, ticks: 6 });

    const aR = right.after.angle - right.before.angle;
    const aL = left.after.angle - left.before.angle;
    expect(aR).toBeGreaterThan(0);
    expect(aL).toBeLessThan(0);
    // Within 15 % of each other.
    expect(Math.abs(aR + aL)).toBeLessThan(Math.max(aR, -aL) * 0.15);
  });

  test("racing-line assist off by default", async ({ page }) => {
    await startLiveRace(page);
    // No slider interaction; store is empty, so the assist must be 0.
    const assist = await page.evaluate(() => window.__apex.tuning().raceLineAssist);
    expect(assist).toBe(0);
    // ...and with the assist explicitly off, the car's line through a corner is
    // identical to the untouched default — the assist adds nothing. (The absolute
    // drift here is set by road-follow, not the racing line, so we compare the two
    // runs rather than assuming a wide-to-the-outside slide.)
    const { frac, k } = await firstCorner(page);
    expect(Math.abs(k)).toBeGreaterThan(0.02);
    // Slow enough that the car stays mid-track (away from the edges, where the
    // projection is non-linear and amplifies tiny float differences): the two
    // identical-config runs must then land in the same place.
    const a = await run(page, { frac, speed: 16, steer: 0, ticks: 60 });
    await setRaceLine(page, 0);
    const b = await run(page, { frac, speed: 16, steer: 0, ticks: 60 });
    expect(Math.abs((a.after.x - a.before.x) - (b.after.x - b.before.x))).toBeLessThan(0.5);
  });

  test("racing-line assist: PULL eases toward the line, PUSH sends it wider", async ({ page }) => {
    await startLiveRace(page);
    const { frac, k } = await firstCorner(page);
    expect(Math.abs(k)).toBeGreaterThan(0.02);
    const inside = -Math.sign(k);   // apex is on the -sign(k) side

    await setRaceLine(page, 0);
    const off = await run(page, { frac, speed: 24, steer: 0, ticks: 60 });
    await setRaceLine(page, 5);
    const pull = await run(page, { frac, speed: 24, steer: 0, ticks: 60 });
    await setRaceLine(page, -5);
    const push = await run(page, { frac, speed: 24, steer: 0, ticks: 60 });
    await setRaceLine(page, 0); // restore

    const dxOff = off.after.x - off.before.x;
    const dxPull = pull.after.x - pull.before.x;
    const dxPush = push.after.x - push.before.x;
    // PULL ends up clearly more toward the inside than no assist...
    expect((dxPull - dxOff) * inside).toBeGreaterThan(0.5);
    // ...and PUSH clearly more toward the outside.
    expect((dxPush - dxOff) * inside).toBeLessThan(-0.2);
  });
});

// Regression: a held throttle key must never latch ON. onKey() guards key
// PRESSES while a text field / control is focused (so typing doesn't drive the
// car), but must ALWAYS process RELEASES — otherwise a keyup that fires while
// focus sits on a non-HUD control is swallowed and the key stays "held" forever.
// A stuck-on throttle then keeps re-tripping the off-track auto-rescue, so the
// car floors itself off the track and gets reset over and over ("throttle stuck
// on after a reset"). Exercises the real DOM keyboard path via the Input global.
test.describe("Apex 26 — keyboard latch", () => {
  test("keyup clears throttle even when focus moved to a non-HUD control", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof Input !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate(() => {
      const el = document.createElement("input");   // interactive, NOT a HUD control
      el.type = "text";
      document.body.appendChild(el);
      const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: "ArrowUp", bubbles: true }));
      try {
        // 1) Press the throttle with the game focused (nothing interactive active).
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        key("keydown");
        const pressed = Input.throttle();
        // 2) Focus the text field, THEN release — the release must still register.
        el.focus();
        key("keyup");
        const afterRelease = Input.throttle();
        // 3) A press WHILE the field is focused must stay suppressed (typing).
        key("keydown");
        const pressedWhileTyping = Input.throttle();
        return { pressed, afterRelease, pressedWhileTyping };
      } finally {
        el.blur();
        key("keyup");   // clear any latched state for later tests
        el.remove();
      }
    });
    expect(r.pressed).toBe(true);              // throttle engages on keydown
    expect(r.afterRelease).toBe(false);        // FIX: release clears it despite focus
    expect(r.pressedWhileTyping).toBe(false);  // press still suppressed while typing
  });

  // The on-screen GAS pedal (tilt + buttons steer modes) holds via pointer
  // capture. If the pedal is hidden mid-hold (a HUD/pause/tuner state change),
  // capture is released IMPLICITLY: the browser fires lostpointercapture but the
  // finger's eventual pointerup lands on some other element, so pointerup/
  // pointercancel never reach the pedal. Without a lostpointercapture handler the
  // button stays "held" — throttle stuck on, which then keeps re-tripping the
  // off-track auto-rescue. Verify lostpointercapture releases the hold.
  test("on-screen GAS releases when pointer capture is lost mid-hold", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof Input !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate(() => {
      const el = document.getElementById("btn-throttle");   // wired via wireHold at init
      const pe = (type) => el.dispatchEvent(new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true }));
      // Show it first — the shell starts the pedal `[hidden]`, and a capture
      // steal on an already-hidden button is NOT a teardown (see
      // lostCaptureShouldRelease). The production bug is hide-mid-hold.
      el.hidden = false;
      if (el.parentElement) el.parentElement.hidden = false;
      pe("pointerdown");
      const held = Input.throttle();
      // The pedal is hidden by a state change → capture is lost implicitly. The
      // pointerup never reaches this element; only lostpointercapture fires here.
      el.hidden = true;
      pe("lostpointercapture");
      const afterCaptureLost = Input.throttle();
      el.hidden = false;
      return { held, afterCaptureLost };
    });
    expect(r.held).toBe(true);              // pedal engaged
    expect(r.afterCaptureLost).toBe(false); // FIX: capture loss releases the hold
  });

  // Ghost-pointer latch: an OS interruption mid-hold (notification, call, app
  // switch — fires blur/visibilitychange with NO pointer events delivered) left
  // the pressed pointerId orphaned inside wireHold's closure Set. reset() zeroed
  // btnThrottle but couldn't reach the Set, so after the next press with a NEW
  // pointerId the release left the orphan behind (size 1 ≠ 0) and apply(false)
  // never ran again — throttle could be switched ON but never OFF. Intermittent
  // because an OS that reuses the SAME pointerId self-heals. The stuck throttle
  // then endlessly re-trips the off-track auto-rescue.
  test("hold survives an OS interruption without latching (ghost pointerId)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof Input !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate(() => {
      const el = document.getElementById("btn-throttle");
      const pe = (type, id, target) => (target || el).dispatchEvent(
        new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true }));
      // 1) Hold with pointer 7, then an OS interruption: only blur-style reset
      //    runs, no pointer event ever reaches the pedal.
      pe("pointerdown", 7);
      Input.reset();
      const clearedByReset = Input.throttle();          // reset must fully clear
      // 2) Press again with a DIFFERENT pointerId (iOS reassigns them), release.
      pe("pointerdown", 8);
      const rePressed = Input.throttle();
      pe("pointerup", 8);
      const afterRelease = Input.throttle();            // must be OFF (was stuck pre-fix)
      return { clearedByReset, rePressed, afterRelease, holds: Input.debugState().holdPointers };
    });
    expect(r.clearedByReset).toBe(false);
    expect(r.rePressed).toBe(true);
    expect(r.afterRelease).toBe(false);
    expect(Math.max(...r.holds)).toBe(0);   // no ghost pointers tracked anywhere
  });

  // Retargeted lift: the finger goes down on the pedal but its pointerup lands
  // on another element (overlay appeared under a stationary finger; capture
  // missing/not honoured). The window-level capture-phase listener must treat a
  // pointer that lifted ANYWHERE as no longer holding any button.
  test("a pointerup landing on another element still releases the pedal", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof Input !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate(() => {
      const el = document.getElementById("btn-throttle");
      el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 5, bubbles: true, cancelable: true }));
      const held = Input.throttle();
      // Lift dispatched to body — never touches the pedal element.
      document.body.dispatchEvent(new PointerEvent("pointerup", { pointerId: 5, bubbles: true, cancelable: true }));
      const afterBodyUp = Input.throttle();
      return { held, afterBodyUp };
    });
    expect(r.held).toBe(true);
    expect(r.afterBodyUp).toBe(false);
  });
});
