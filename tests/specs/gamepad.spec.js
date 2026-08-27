// @ts-check
// Gamepad input tests for js/game/input.js (W3C Gamepad API, "standard" mapping).
//
// These mock navigator.getGamepads() with a synthetic pad snapshot, call the
// once-per-frame Input.poll(), then read the public Input surface the game loop
// uses (steer / throttle / braking and the edge-triggered consume* latches).
// No race needs to start — the input module is wired by Input.init() at load.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect } from "../helpers/fixtures.js";

// Build a standard-mapping gamepad with the given left-stick X/Y (axes 0/1)
// and a sparse {index: value} button map, install it as the sole connected
// pad, then poll. Returns whatever `read` extracts from the page afterwards.
async function poll(page, { axisX = 0, axisY = 0, axisRX = 0, axisRY = 0, buttons = {}, connected = true } = {}, read) {
  return page.evaluate(
    ({ axisX, axisY, axisRX, axisRY, buttons, connected, readSrc }) => {
      const btns = [];
      for (let i = 0; i < 17; i++) {
        const v = buttons[i] || 0;
        btns.push({ pressed: v >= 0.5, value: v, touched: v > 0 });
      }
      const pad = connected
        ? { connected: true, mapping: "standard", axes: [axisX, axisY, axisRX, axisRY], buttons: btns }
        : null;
      navigator.getGamepads = () => [pad, null, null, null];
      window.dispatchEvent(new Event(connected ? "gamepadconnected" : "gamepaddisconnected"));
      Input.poll();
      // eslint-disable-next-line no-eval
      return (0, eval)("(" + readSrc + ")")();
    },
    { axisX, axisY, axisRX, axisRY, buttons, connected, readSrc: read.toString() }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.poll, null, { polling: 100, timeout: 15000 });
  // clear any latched edges / held keys between cases
  await page.evaluate(() => Input.reset());
});

test("an idle pad does not steer and is reported connected", async ({ page }) => {
  const r = await poll(page, { axisX: 0 }, () => ({
    steer: Input.steer(),
    connected: Input.padConnected,
  }));
  expect(r.connected).toBe(true);
  expect(Math.abs(r.steer)).toBeLessThan(0.001);
});

test("left-stick deflection steers, with a centre dead zone", async ({ page }) => {
  const full = await poll(page, { axisX: -1 }, () => Input.steer());
  expect(full).toBeLessThan(-0.9);

  const right = await poll(page, { axisX: 1 }, () => Input.steer());
  expect(right).toBeGreaterThan(0.9);

  // inside the 0.14 dead zone → no steer
  const dz = await poll(page, { axisX: 0.1 }, () => Input.steer());
  expect(Math.abs(dz)).toBeLessThan(0.001);
});

test("d-pad gives a digital full-lock override", async ({ page }) => {
  const right = await poll(page, { buttons: { 15: 1 } }, () => Input.steer());
  expect(right).toBe(1);
  const left = await poll(page, { buttons: { 14: 1 } }, () => Input.steer());
  expect(left).toBe(-1);
});

test("triggers and face buttons drive throttle / brake", async ({ page }) => {
  const rt = await poll(page, { buttons: { 7: 1 } }, () => Input.throttle());
  expect(rt).toBe(true);
  const a = await poll(page, { buttons: { 0: 1 } }, () => Input.throttle());
  expect(a).toBe(true);
  const lt = await poll(page, { buttons: { 6: 1 } }, () => Input.braking());
  expect(lt).toBe(true);
  // a barely-touched trigger (below threshold) does not count
  const soft = await poll(page, { buttons: { 7: 0.05 } }, () => Input.throttle());
  expect(soft).toBe(false);
});

test("face/shoulder buttons fire edge-triggered actions exactly once", async ({ page }) => {
  // The driving latches are nav-gated: since the menus rounds made the TITLE
  // overlay a nav layer, UiLayers.navOpen() is true on a freshly loaded page
  // and Input.poll() routes pad buttons to menu navigation instead of the
  // consume* latches. Start a race (same boilerplate as the "drives the car
  // normally" regression guard below) so the latches are actually reachable.
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => {
    try { return window.__apex.info().track === "monza"; } catch (_) { return false; }
  }, null, { polling: 100, timeout: 20_000 });
  await page.evaluate(() => { window.__apex.go(); Input.reset(); });
  expect(await page.evaluate(() => window.UiLayers.navOpen())).toBe(false);
  // establish the released baseline so the next poll sees a rising edge
  await poll(page, { buttons: {} }, () => true);
  // press X (boost) — one rising edge
  const first = await poll(page, { buttons: { 2: 1 } }, () => Input.consumeBoostToggle());
  expect(first).toBe(true);
  // still held → no new edge
  const held = await poll(page, { buttons: { 2: 1 } }, () => Input.consumeBoostToggle());
  expect(held).toBe(false);

  await poll(page, { buttons: {} }, () => true);
  const ot = await poll(page, { buttons: { 3: 1 } }, () => Input.consumeOvertake());
  expect(ot).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const up = await poll(page, { buttons: { 5: 1 } }, () => Input.consumeShiftUp());
  expect(up).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const down = await poll(page, { buttons: { 4: 1 } }, () => Input.consumeShiftDown());
  expect(down).toBe(true);

  await poll(page, { buttons: {} }, () => true);
  const cam = await poll(page, { buttons: { 8: 1 } }, () => Input.consumeCameraCycle());
  expect(cam).toBe(true);
});

test("on the title overlay the pad routes to menu-nav, never the driving latches", async ({ page }) => {
  // The routing truth the test above works around: a fresh page sits on the
  // title overlay, which IS a nav layer, so a face-button edge must arm no
  // driving latch. This is what keeps a pad press on the menu from also
  // firing a boost/shift the moment a race later starts.
  expect(await page.evaluate(() => window.UiLayers.navOpen())).toBe(true);
  await poll(page, { buttons: {} }, () => true);
  const boost = await poll(page, { buttons: { 2: 1 } }, () => Input.consumeBoostToggle());
  expect(boost).toBe(false);
});

test("disconnecting the pad clears its state", async ({ page }) => {
  await poll(page, { axisX: -1 }, () => Input.steer());
  const r = await poll(page, { connected: false }, () => ({
    steer: Input.steer(),
    connected: Input.padConnected,
    throttle: Input.throttle(),
  }));
  expect(r.connected).toBe(false);
  expect(Math.abs(r.steer)).toBeLessThan(0.001);
  expect(r.throttle).toBe(false);
});

test("a transient getGamepads() hole recovers WITHOUT a gamepadconnected event", async ({ page }) => {
  // gamepadconnected only fires on connection / first input — it never
  // re-fires for a pad that stayed plugged in. A one-frame null (focus loss,
  // a second pad's unplug, a stale slot) therefore used to latch padConnected
  // false for the rest of the session. The poll now re-probes on a ~1 s
  // throttle while disconnected.
  await poll(page, { axisX: -1 }, () => Input.steer());          // pad live
  const r = await page.evaluate(() => {
    navigator.getGamepads = () => [null, null, null, null];      // transient hole
    Input.poll();
    const dropped = Input.padConnected;
    const pad = { connected: true, mapping: "standard", axes: [-1, 0, 0, 0],
                  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
    navigator.getGamepads = () => [pad, null, null, null];       // pad back, NO event
    for (let i = 0; i < 65; i++) Input.poll();                   // > the 60-frame re-probe throttle
    return { dropped, recovered: Input.padConnected, steer: Input.steer() };
  });
  expect(r.dropped).toBe(false);
  expect(r.recovered).toBe(true);
  expect(r.steer).toBeLessThan(-0.9);
});

test("keyboard driving remains active after using a HUD button", async ({ page }) => {
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => {
    window.__apex.go();
    Input.reset();
  });
  const camera = page.getByRole("button", { name: "Camera" });
  await expect(camera).toBeVisible();
  await camera.click();
  await expect(camera).toBeFocused();

  await page.keyboard.down("KeyW");
  expect(await page.evaluate(() => Input.throttle())).toBe(true);
  await page.keyboard.up("KeyW");
  expect(await page.evaluate(() => Input.throttle())).toBe(false);
});

async function holdKeyboardPointerAndTouch(page) {
  return page.evaluate(() => {
    Input.setSteerMode("touch");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowDown", bubbles: true }));
    document.getElementById("btn-throttle").dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 41, bubbles: true })
    );
    // Touch steering is an anchored DRAG, so holding lock takes a touchstart to
    // set the anchor and a touchmove to displace from it — a bare touchstart is
    // (correctly) worth zero steering. See tests/specs/touch-steer.spec.js.
    const send = (type, x) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "changedTouches", { value: [{ identifier: 7, clientX: x, clientY: 200 }] });
      document.getElementById("game").dispatchEvent(e);
    };
    send("touchstart", 10);
    send("touchmove", window.innerWidth + 4000);   // well past full lock, then clamped
    return { brake: Input.braking(), throttle: Input.throttle(), steer: Input.steer() };
  });
}

test("window blur releases held keyboard, pointer, and touch input", async ({ page }) => {
  const held = await holdKeyboardPointerAndTouch(page);
  expect(held).toEqual({ brake: true, throttle: true, steer: 1 });

  const released = await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    return { brake: Input.braking(), throttle: Input.throttle(), steer: Input.steer() };
  });
  expect(released).toEqual({ brake: false, throttle: false, steer: 0 });
});

test("document becoming hidden releases held keyboard, pointer, and touch input", async ({ page }) => {
  const held = await holdKeyboardPointerAndTouch(page);
  expect(held).toEqual({ brake: true, throttle: true, steer: 1 });

  const released = await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    return { brake: Input.braking(), throttle: Input.throttle(), steer: Input.steer() };
  });
  expect(released).toEqual({ brake: false, throttle: false, steer: 0 });
});

/* ---------------------------------------------------------------------------
 * GAMEPAD MENU NAVIGATION — the UWP gamepad/keyboard-parity mapping settled in
 * docs/research/PLATFORM-INPUT-NOTES.md §8, shipped in js/game/input.js
 * (padNavPoll / padActivate / padEscape / padSeedFocus). pollGamepad() dispatches REAL
 * synthetic KeyboardEvents at `document` when UiLayers.anyOpen() is true, so
 * these tests exercise the same seam a keyboard uses — js/game/menunav.js and
 * js/game/topmodal.js — rather than a second focus-mover. A newly-open menu
 * seeds one ArrowDown without waiting for a D-pad press (UWP "one focus visual
 * should always be visible"); menu sticks use PAD_NAV_DEADZONE (0.22), larger
 * than driving's PAD_DEADZONE (0.14).
 * ------------------------------------------------------------------------- */

async function openSelectForPad(page) {
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 8_000 });
  await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 5, null, { polling: 100, timeout: 8_000 });
}

// test.beforeEach (top of file) already did page.goto + Input.reset for every
// test in this file, including this describe block — no extra setup needed.
test.describe("Gamepad menu navigation", () => {
  test("D-pad down moves focus onto the open menu", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    await poll(page, { buttons: { 13: 1 } }, () => true);   // d-pad down
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("the left stick navigates too, past the steering dead zone", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());

    // axis 1 is left-stick Y; +1 is "down" on the standard mapping.
    await poll(page, { axisY: 1 }, () => true);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("D-pad left, right and up also seed focus", async ({ page }) => {
    await openSelectForPad(page);
    for (const btn of [14, 15, 12]) {
      await page.evaluate(() => document.activeElement.blur());
      await poll(page, { buttons: { [btn]: 1 } }, () => true);
      expect(await page.evaluate(() =>
        document.getElementById("select").contains(document.activeElement))).toBe(true);
    }
  });

  test("the right stick navigates when the left stick is centred", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());
    await poll(page, { axisRY: 1 }, () => true);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("trigger travel is analog", async ({ page }) => {
    const rt = await poll(page, { buttons: { 7: 0.4 } }, () => Input.throttleLevel());
    expect(rt).toBeCloseTo(0.4, 2);
    const lt = await poll(page, { buttons: { 6: 0.55 } }, () => Input.brakeLevel());
    expect(lt).toBeCloseTo(0.55, 2);
  });

  test("A activates the focused control", async ({ page }) => {
    await openSelectForPad(page);
    const picked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#sel-tracks .track-row")];
      const row = rows.find((r) => !r.classList.contains("active"));
      row.focus();
      return row.textContent.trim().replace(/\s+/g, " ").slice(0, 20);
    });
    await poll(page, { buttons: { 0: 1 } }, () => true);   // A
    await page.waitForTimeout(400);
    const active = await page.evaluate(() =>
      (document.querySelector("#sel-tracks .track-row.active") || {}).textContent
        ?.trim().replace(/\s+/g, " ").slice(0, 20));
    expect(active).toBe(picked);
  });

  test("A seeds focus rather than clicking when nothing is focused yet", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    await poll(page, { buttons: { 0: 1 } }, () => true);   // A, nothing focused
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("B closes a plain-div screen via its data-esc-close control", async ({ page }) => {
    await openSelectForPad(page);
    await poll(page, { buttons: { 1: 1 } }, () => true);   // B
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.getElementById("select").hidden)).toBe(true);
    expect(await page.evaluate(() => document.getElementById("overlay").hidden)).toBe(false);
  });

  /* THE ONE THAT ISN'T OBVIOUS. A native <dialog>'s "Escape closes it" is a
     browser DEFAULT ACTION tied to a TRUSTED key event (Chromium's
     CloseWatcher takes the key's release — PLATFORM-INPUT-NOTES.md §1) and
     does NOT fire for a synthetic, untrusted KeyboardEvent — measured directly
     against a bare <dialog> with no listeners while building this feature.
     B must instead dispatch the `cancel` Event TopModal already listens for
     on every dialog.screen (js/game/topmodal.js wire()), which is what this
     pins: that #pausemenu (a real <dialog>) actually closes. */
  test("B closes a native <dialog> screen (pause menu)", async ({ page }) => {
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => {
      try { return window.__apex.info().track === "monza"; } catch (_) { return false; }
    }, null, { polling: 100, timeout: 20_000 });
    await page.evaluate(() => {
      window.__apex.park(0.1);
      const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
      document.getElementById("pausemenu").hidden = false;
    });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.getElementById("pausemenu").matches(":modal"))).toBe(true);
    await page.evaluate(() => Input.reset());

    await poll(page, { buttons: { 1: 1 } }, () => true);   // B
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.getElementById("pausemenu").hidden)).toBe(true);
  });

  test("bumpers page the menu instead of shifting gears", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.getElementById("sel-go").focus());

    await poll(page, { buttons: { 5: 1 } }, () => true);   // RB
    expect(
      await page.evaluate(() => Input.consumeShiftUp()),
      "RB must not also fire the driving shift-up edge while a menu is open"
    ).toBe(false);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("triggers dispatch PageUp/PageDown, not the driving pedals", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => {
      window.__padKeys = [];
      document.addEventListener("keydown", (e) => window.__padKeys.push(e.key), true);
    });

    await poll(page, { buttons: { 7: 1 } }, () => true);   // RT
    await poll(page, { buttons: {} }, () => true);         // release, arms the next edge
    await poll(page, { buttons: { 6: 1 } }, () => true);   // LT
    const keys = await page.evaluate(() => window.__padKeys);
    expect(keys).toContain("PageDown");
    expect(keys).toContain("PageUp");
  });

  test("gamepad drives the car normally with no menu open (regression guard)", async ({ page }) => {
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => {
      try { return window.__apex.info().track === "monza"; } catch (_) { return false; }
    }, null, { polling: 100, timeout: 20_000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); Input.reset(); });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.UiLayers.anyOpen())).toBe(false);

    const r = await poll(page, { axisX: -1, buttons: { 7: 1 } }, () => ({
      steer: Input.steer(),
      throttle: Input.throttle(),
    }));
    expect(r.steer).toBeLessThan(-0.9);
    expect(r.throttle).toBe(true);

    // Shoulder/trigger buttons still drive (shift/camera), exactly as before.
    await poll(page, { buttons: {} }, () => true);
    const up = await poll(page, { buttons: { 5: 1 } }, () => Input.consumeShiftUp());
    expect(up).toBe(true);
  });

  test("a held D-pad direction repeats after the initial delay, not before", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());

    // First poll: the "first press" behaviour — seeds focus onto the current
    // selection, same as a real key (see MenuNav.currentItem()).
    await poll(page, { buttons: { 13: 1 } }, () => true);
    const seeded = await page.evaluate(() => document.activeElement.textContent);
    expect(seeded).toBeTruthy();

    // Poll again immediately with the SAME held direction: negligible real
    // time has passed (well under the ~450ms initial delay), so this must
    // NOT move focus again — that is the repeat guard under test.
    await poll(page, { buttons: { 13: 1 } }, () => true);
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe(seeded);

    // Wait past the initial delay and poll again: now a repeat should fire.
    await page.waitForTimeout(600);
    await poll(page, { buttons: { 13: 1 } }, () => true);
    const moved = await page.evaluate(() => document.activeElement.textContent);
    expect(moved).not.toBe(seeded);

    // Releasing the direction (neutral) clears the repeat state instantly.
    await poll(page, { buttons: {} }, () => true);
  });

  test("an idle pad seeds focus when a menu opens, without a D-pad press", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    await poll(page, { buttons: {} }, () => true);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("a later idle poll does not re-seed after focus is cleared", async ({ page }) => {
    await openSelectForPad(page);
    await page.evaluate(() => document.activeElement.blur());
    await poll(page, { buttons: {} }, () => true);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);

    await page.evaluate(() => document.activeElement.blur());
    await poll(page, { buttons: {} }, () => true);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test("menu stick nav uses a larger deadzone than driving; right stick still falls back", async ({ page }) => {
    // 0.18 is past PAD_DEADZONE (0.14) but inside PAD_NAV_DEADZONE (0.22).
    const drive = await poll(page, { axisX: 0.18 }, () => Input.steer());
    expect(Math.abs(drive)).toBeGreaterThan(0.001);

    await openSelectForPad(page);
    await poll(page, { buttons: {} }, () => true);   // seed once
    const seeded = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    expect(seeded).toBeTruthy();

    await poll(page, { axisY: 0.18 }, () => true);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.textContent)).toBe(seeded);

    await page.evaluate(() => document.activeElement.blur());
    await poll(page, { axisX: 0.18, axisY: 0, axisRY: 1 }, () => true);
    expect(await page.evaluate(() =>
      document.getElementById("select").contains(document.activeElement))).toBe(true);
  });
});
