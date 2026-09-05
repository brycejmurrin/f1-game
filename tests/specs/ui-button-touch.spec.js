// @ts-check
// Tests for button/touch steer mode: auto-throttle, disabled calibrate button,
// stable settings-menu layout, and race-settings layout (portrait + landscape).
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";

const PORTRAIT  = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

// A sheet enters with `sheet-in` (0.19s, translateY(10px) scale(0.985) — see
// css/components.css), so a sheet measured or photographed mid-flight is
// genuinely 0.985x its final size and 10px low. Read as layout, that is a
// phantom shift of exactly the kind "buttons keep their positions" exists to
// catch — it was comparing a still-animating sheet against a settled one.
// Waiting it out does not work: the game parks its rAF loop behind the menu, so
// the document stops producing frames and the animation clock stops with it —
// the entrance sits frozen at t=0 until some input forces a frame. Turn the
// motion off instead. css/components.css gates every sheet animation behind
// `prefers-reduced-motion: no-preference`, so the reduced mode lands the final
// layout on the first frame; these are layout and behaviour tests and none of
// them assert motion. It has to be this per-page call — `test.use({
// reducedMotion })` does not reach the page under this config (matchMedia still
// reports no-preference).
async function waitReady(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

async function openPauseMenu(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.waitForTimeout(1000);
  await page.locator("#pausebtn").click();
  await page.locator("#pausemenu").waitFor({ state: "visible" });
}

// Steering / lighting / gears controls now live on the SETTINGS sub-menu.
async function openPauseSettings(page) {
  await openPauseMenu(page);
  await page.locator("#pm-settings").click();
  await page.locator("#pmsettings").waitFor({ state: "visible" });
}

async function openPauseControls(page) {
  await openPauseSettings(page);
  await page.locator("#pm-open-controls").click();
  await page.locator("#pm-panel-controls").waitFor({ state: "visible" });
}

async function cycleToPauseSteerMode(page, targetText) {
  // STEERING INPUT is a setting row: pick the mode in its select.
  await page.locator("#pm-steer-sel").selectOption(targetText.toLowerCase(), { force: true });
  await page.waitForTimeout(300);
}

async function openLightingPhotoMode(page) {
  await openPauseSettings(page);
  await page.locator("#pm-lighting").click();
  await page.locator("#pc-toggle").click();
  await expect(page.locator("body")).toHaveClass(/lt-open/);
  await expect(page.locator("body")).toHaveClass(/photo-mode/);
}

async function expectNormalRaceControls(page) {
  const state = await page.evaluate(() => ({
    lightingHidden: document.getElementById("lighting").hidden,
    pauseHidden: document.getElementById("pausemenu").hidden,
    photoControlsHidden: document.getElementById("photo-controls").hidden,
    ltOpen: document.body.classList.contains("lt-open"),
    photoMode: document.body.classList.contains("photo-mode"),
    pauseButtonHidden: document.getElementById("pausebtn").hidden,
  }));
  expect(state).toEqual({
    lightingHidden: true,
    pauseHidden: true,
    photoControlsHidden: true,
    ltOpen: false,
    photoMode: false,
    pauseButtonHidden: false,
  });
}

test.describe("Lighting tuner — pause lifecycle", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  // ESCAPE IS ONE STEP BACK, not the emergency exit it used to be. It called
  // setPaused(false), which threw away the fly-cam, the tuner panel AND the
  // pause in a single press — three screens for one key. #photo-controls is a
  // layer in its own right now (js/ui/layers.js) carrying
  // data-esc-close="pc-exit", so the first press lands you back on the panel
  // you opened the camera from. The pause key and gamepad Start below keep the
  // old all-the-way-out behaviour, which is the point of the distinction.
  test("Escape leaves tuner-owned photo mode and leaves the tuner open", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/photo-mode/);
    await expect(page.locator("body")).toHaveClass(/lt-open/);
    expect(await page.evaluate(() => document.getElementById("lighting").hidden)).toBe(false);
    expect(await page.evaluate(() => document.getElementById("photo-controls").hidden)).toBe(true);
  });

  // …and pressing it again walks the rest of the way out, one screen per press.
  test("Escape walks free cam -> tuner -> settings -> pause -> racing", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    const where = async () => page.evaluate(() => {
      const $ = (id) => document.getElementById(id);
      return {
        photo: document.body.classList.contains("photo-mode"),
        lighting: !$("lighting").hidden,
        settings: !$("pmsettings").hidden,
        pause: !$("pausemenu").hidden,
      };
    });
    await page.keyboard.press("Escape");
    expect(await where()).toEqual({ photo: false, lighting: true, settings: false, pause: false });
    await page.keyboard.press("Escape");
    expect(await where()).toEqual({ photo: false, lighting: false, settings: true, pause: false });
    await page.keyboard.press("Escape");
    expect(await where()).toEqual({ photo: false, lighting: false, settings: false, pause: true });
    await page.keyboard.press("Escape");
    expect(await where()).toEqual({ photo: false, lighting: false, settings: false, pause: false });
  });

  /* ESCAPE MUST BE ABLE TO PAUSE AT ALL, which is not as obvious as it sounds:
     #pausemenu is a <dialog>, so opening it from a keydown handler hands Chrome
     a close-watcher mid-keypress and the watcher consumes the KEYUP of the very
     Escape that opened it. Measured before the fix: shown on keydown, hidden
     again on keyup, i.e. one press did nothing at all. js/input/input.js
     preventDefaults the Escape it spends on PAUSE, which suppresses the close
     request. Without that line this test fails and the ladder above still
     passes, so it earns its place. */
  test("Escape pauses a running race, and the menu survives the keyup", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40, 0); });
    await page.waitForTimeout(400);
    // focus must be off the pause BUTTON, or this measures the button's own key
    // handling rather than the global one.
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById("pausemenu").hidden)).toBe(false);
  });

  test("pause key leaves tuner-owned photo mode and restores race controls", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.evaluate(() => window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyP", bubbles: true })
    ));
    await expectNormalRaceControls(page);
  });

  test("gamepad pause leaves tuner-owned photo mode and restores race controls", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.evaluate(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
      const pad = { connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons };
      navigator.getGamepads = () => [pad, null, null, null];
      window.dispatchEvent(new Event("gamepadconnected"));
      Input.poll();
      buttons[9] = { pressed: true, value: 1, touched: true };
      Input.poll();
    });
    await expectNormalRaceControls(page);
  });
});

/* THE FREE CAMERA'S TOUCH CONTROLS — the half of the tuner nothing had ever
   exercised. Everything above drives photo mode's LIFECYCLE (does it open, does
   it close); nothing pressed #pc-move or #pc-look or asserted that photoMove /
   photoLook ever became non-zero, so the sticks could break outright and CI
   would stay green. They did break, on iPad specifically, and each test here
   pins one of the reasons.

   Pointer events are dispatched rather than driven through page.touchscreen
   because these are about the HANDLERS' bookkeeping — which pointer owns a
   drag, what happens when one is taken away mid-hold — and that needs pointerId
   control the high-level helper does not offer. */
test.describe("Lighting tuner — free camera touch controls", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  // Press a stick `dy` px above its centre and report what the handler stored.
  const pressStick = (page, id, dy) => page.evaluate(({ id, dy }) => {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opts = (cy) => ({ pointerId: 7, pointerType: "touch", isPrimary: true,
      bubbles: true, cancelable: true, clientX: x, clientY: cy, buttons: 1 });
    el.dispatchEvent(new PointerEvent("pointerdown", opts(y)));
    el.dispatchEvent(new PointerEvent("pointermove", opts(y + dy)));
    return { rect: { w: r.width, h: r.height }, nub: el.querySelector(".pc-nub").style.transform };
  }, { id, dy });

  test("a touch drag on the MOVE stick registers", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    const res = await pressStick(page, "pc-move", -30);
    expect(res.rect.w, "the stick is laid out and hittable").toBeGreaterThan(10);
    // The nub tracking the finger is the observable proof the handler ran to
    // completion — it is set on the same line that writes the movement vector,
    // AFTER the setPointerCapture that used to be able to throw and abort here.
    expect(res.nub).toMatch(/translate\(0px, *-\d/);
  });

  /* THE LATCH. css/hud.css display:none's the whole overlay the moment a
     .screen.dim opens, and HIDE HUD does the same — both can fire with a thumb
     down. A touch pointer holds IMPLICIT capture, so removing the element loses
     the capture instead of delivering a pointerup: the vector kept its last
     value and updatePhotoCam flew the camera away for good, with no control
     left on screen to stop it. wirePhotoStick listens for lostpointercapture. */
  test("a stick taken away mid-hold does not latch the camera on", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await pressStick(page, "pc-move", -30);
    const held = await page.evaluate(() => document.querySelector("#pc-move .pc-nub").style.transform);
    expect(held, "the stick is held before we yank it").toMatch(/translate\(0px, *-\d/);

    const after = await page.evaluate(async () => {
      const el = document.getElementById("pc-move");
      // What the CSS does when a modal opens over the fly-cam.
      document.getElementById("photo-controls").style.display = "none";
      el.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 7, bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      return el.querySelector(".pc-nub").style.transform;
    });
    // The browser normalises the `translate(0,0)` the code writes into
    // `translate(0px, 0px)`, so match on "no offset" rather than on the literal.
    expect(after.replace(/\s|px/g, "")).toBe("translate(0,0)");
  });

  /* THE CANCELLED DRAG. iOS fires pointercancel with no pointerup whenever the
     system claims a touch. photoMouse.drag latched true, and because the window
     pointermove handler accepted ANY pointer, the finger working a thumbstick
     then also fed the look-drag and the view whipped between two positions —
     which reads as "the sticks don't work". */
  test("a cancelled scene drag releases, and a foreign pointer cannot move it", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    // camState() is the observable: the fly-cam publishes through dbgCam, so
    // "did that pointer move the view" is answerable without reading privates.
    const eye = () => page.evaluate(() => window.__apex.camState().eye.slice());
    const settle = () => page.waitForTimeout(250);

    const ev = (type, id, x, y, onCanvas) => page.evaluate(({ type, id, x, y, onCanvas }) => {
      const target = onCanvas ? document.getElementById("game") : window;
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch",
        isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1 }));
    }, { type, id, x, y, onCanvas });

    // A drag owned by pointer 3 must ignore pointer 9 entirely.
    await ev("pointerdown", 3, 400, 200, true);
    const before = await eye();
    await ev("pointermove", 9, 760, 340, false);
    await settle();
    expect(await eye(), "a pointer that never touched the canvas must not steer the view")
      .toEqual(before);

    // Cancel with no pointerup — the iOS case — must release the drag.
    await ev("pointercancel", 3, 400, 200, true);
    await ev("pointermove", 3, 820, 420, false);
    await settle();
    expect(await eye(), "a cancelled drag is over; later moves are inert").toEqual(before);
  });

  /* THE LAYOUT, and the one bug that could only ever show on a touch device.
     #lighting-inner is a `.sheet`, and css/components.css puts
     `zoom: var(--ui-scale)` on every sheet — so the panel PAINTS --dock-w x
     --ui-scale wide, while css/hud.css positioned the LOOK stick and the
     climb/dive column from the unscaled --dock-w. --ui-scale ships at 1 on every
     pointer (it used to be 1.15 under `(pointer: coarse)`), so the arithmetic
     was exact on every desktop and short by 15-30% when a player raised UI SIZE:
     measured, the stick cleared the panel by ~13px at 115% and sat ON it at
     UI SIZE 130%. */
  for (const scale of ["1", "1.15", "1.3"]) {
    test(`the LOOK stick clears the tuner panel at UI scale ${scale}`, async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await openLightingPhotoMode(page);
      const box = await page.evaluate((s) => {
        document.documentElement.style.setProperty("--ui-scale", s);
        // force layout after the custom-property change
        void document.body.offsetWidth;
        const panel = document.getElementById("lighting-inner").getBoundingClientRect();
        const look = document.getElementById("pc-look").getBoundingClientRect();
        const alt = document.querySelector(".pc-altcol").getBoundingClientRect();
        return { panelLeft: panel.left, panelW: panel.width, lookRight: look.right, altRight: alt.right };
      }, scale);
      expect(box.panelW, "the panel is actually laid out").toBeGreaterThan(10);
      expect(box.lookRight,
        `LOOK stick (right ${box.lookRight}) must stay left of the panel (left ${box.panelLeft})`)
        .toBeLessThanOrEqual(box.panelLeft);
      expect(box.altRight,
        `climb/dive column (right ${box.altRight}) must stay left of the panel (left ${box.panelLeft})`)
        .toBeLessThanOrEqual(box.panelLeft);
    });
  }
});

// hasTouch prevents game from adding body.desktop class (which hides steer/calib btns)
test.describe("Pause menu — tilt mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button enabled in tilt mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseControls(page);
    await cycleToPauseSteerMode(page, "tilt");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeVisible();
    await expect(calib).toBeEnabled();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-tilt-landscape.png") });
  });
});

test.describe("Pause menu — button mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button disabled (still visible) in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseControls(page);
    await cycleToPauseSteerMode(page, "button");
    await page.waitForTimeout(200);
    // Disabled, NOT hidden — hiding it reflowed the settings grid so the next
    // tap landed on a different button (see setSteerMode in game.js).
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeVisible();
    await expect(calib).toBeDisabled();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-button-landscape.png") });
  });
});

test.describe("Pause menu — touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button disabled (still visible) in touch mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseControls(page);
    await cycleToPauseSteerMode(page, "touch");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeVisible();
    await expect(calib).toBeDisabled();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-touch-landscape.png") });
  });
});

// Regression: changing STEER used to hide pm-calib/pm-gears, reflowing the
// settings grid mid-interaction — the next tap aimed at one button landed on
// another (worst case HIDE HUD, which closed the whole menu). Every settings
// button must keep its exact position across a steer-mode change.
test.describe("Pause settings — stable layout", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("buttons keep their positions when steer mode changes", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseControls(page);
    await cycleToPauseSteerMode(page, "tilt");
    await page.waitForTimeout(200);

    const ids = ["pm-steer", "pm-calib", "pm-gears", "pm-aero", "pm-settings-close"];
    const grab = () => page.evaluate((ids) => {
      const out = {};
      for (const id of ids) {
        const r = document.getElementById(id).getBoundingClientRect();
        out[id] = { x: Math.round(r.x), y: Math.round(r.y) };
      }
      return out;
    }, ids);

    const before = await grab();
    await page.locator("#pm-steer-next").click();   // tilt -> buttons (hides nothing now)
    await page.waitForTimeout(200);
    const after = await grab();
    expect(after).toEqual(before);

    // and the control aimed at AFTER the change still receives the tap. RESOLUTION
    // replaces the old SOUND toggle here: it is a same-grid setting row, so it
    // still proves the tap landed on the control the thumb was aimed at.
    await page.locator("#pm-settings-close").click();
    await page.locator("#pm-open-display").click();
    await page.locator("#pm-display-adv > summary").click();
    const resBefore = await page.locator("#pm-res-sel").inputValue();
    await page.locator("#pm-res-next").click();
    await expect(page.locator("#pm-res-sel")).not.toHaveValue(resBefore);
    await expect(page.locator("#pmsettings")).toBeVisible();   // menu did not collapse
  });
});

test.describe("Pause — HOW TO PLAY", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("opens the help sheet over the pause menu and BACK returns to it", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseMenu(page);

    await page.locator("#pm-howto").click();
    await expect(page.locator("#howtoplay")).toBeVisible();
    expect(await page.evaluate(() => document.getElementById("pausemenu").hidden)).toBe(false);

    await page.locator("#htp-close").click();
    await expect(page.locator("#howtoplay")).toBeHidden();
    await expect(page.locator("#pausemenu")).toBeVisible();

    // A pause press closes the innermost sheet first — the help sheet, not the
    // menu under it (which would strand the help sheet over the race). Gamepad
    // Start is the path that reaches the pause callback here: the on-screen
    // pause button only ever pauses, and a keyboard Esc is swallowed while a
    // menu sheet is open (input.js's menuOverlayOpen gate).
    await page.locator("#pm-howto").click();
    await expect(page.locator("#howtoplay")).toBeVisible();
    await page.evaluate(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
      const pad = { connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons };
      navigator.getGamepads = () => [pad, null, null, null];
      window.dispatchEvent(new Event("gamepadconnected"));
      Input.poll();
      buttons[9] = { pressed: true, value: 1, touched: true };   // Start
      Input.poll();
    });
    await expect(page.locator("#howtoplay")).toBeHidden();
    await expect(page.locator("#pausemenu")).toBeVisible();

    // Resuming never leaves it up.
    await page.locator("#pm-howto").click();
    await expect(page.locator("#howtoplay")).toBeVisible();
    await page.evaluate(() => document.getElementById("pm-resume").click());
    await expect(page.locator("#howtoplay")).toBeHidden();
  });
});

test.describe("Auto-throttle in button/touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("throttle button visible in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseControls(page);
    await cycleToPauseSteerMode(page, "button");
    await page.locator("#pm-settings-close").click();   // CONTROLS → home
    await page.locator("#pm-settings-close").click();   // home → pause
    await page.locator("#pm-resume").click();
    await page.locator("#pausemenu").waitFor({ state: "hidden" });

    // Button mode exposes an explicit GAS button for manual throttle control.
    // Unconditional: wrapped in a count() guard this passed even with the
    // button deleted, which is the regression the test exists to catch.
    await expect(page.locator("#btn-throttle")).toBeVisible();
    await page.screenshot({ path: galleryPath("ui-button-touch", "hud-button-mode.png") });
  });
});

test.describe("Race settings — portrait layout", () => {
  test.use({ viewport: PORTRAIT });

  test("chips are compact inline and RACE! button is visible", async ({ page }) => {
    // STOP THE RENDER LOOP BEFORE CLICKING. Playwright's actionability check
    // waits for two stable animation frames, and this app's rAF-driven render
    // loop starves them under SwiftShader — so `#sel-go` measured visible,
    // stable, enabled and hit-testing to itself, and `.click()` still timed out.
    // `headless(true)` is the idiom the rest of the suite already uses. These
    // two tests assert DOM geometry, so a scene that does not paint costs them
    // nothing; it is the whole reason they were the two that hung.
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    // NEXT on the select screen opens race settings. YOUR CAR is the garage
    // door beside it — this spec is about the settings sheet, not the garage.
    await page.locator("#sel-go").click();
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    // RACE! button must be visible without scrolling
    await expect(page.locator("#rs-go")).toBeVisible();
    await page.screenshot({ path: galleryPath("ui-button-touch", "race-settings-portrait.png") });
  });
});

test.describe("Selection screen — iOS tablet portrait layout", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("track list owns an independent vertical scroll area", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });

    const before = await page.locator("#sel-tracks").evaluate((list) => ({
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      overflowY: getComputedStyle(list).overflowY,
    }));
    expect(before.overflowY).toBe("auto");
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await page.locator("#sel-tracks").evaluate((list) => { list.scrollTop = 120; });
    await expect.poll(() => page.locator("#sel-tracks").evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe("Selection screen — iOS phone portrait touch scrolling", () => {
  test.use({ viewport: PORTRAIT, hasTouch: true });

  test("track list contains vertical scroll gestures", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });

    const list = await page.locator("#sel-tracks").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overscrollY: getComputedStyle(element).overscrollBehaviorY,
    }));
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(list.overscrollY).toBe("contain");
  });
});

test.describe("Race settings — landscape layout", () => {
  test.use({ viewport: LANDSCAPE });

  test("fits without scrolling in landscape", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => window.__apex.headless(true));   // see the portrait twin
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    // NEXT on the select screen opens race settings. YOUR CAR is the garage
    // door beside it — this spec is about the settings sheet, not the garage.
    await page.locator("#sel-go").click();
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    // Panel must not overflow
    const scrollable = await page.evaluate(() => {
      const panel = document.getElementById("race-settings");
      return panel ? panel.scrollHeight > panel.clientHeight : false;
    });
    expect(scrollable).toBe(false);
    await page.screenshot({ path: galleryPath("ui-button-touch", "race-settings-landscape.png") });
  });
});

// HOW TO PLAY is the one screen a new player opens to find out what the game
// IS, and it listed RACE, SEASON and TIME TRIAL only — so the long game and the
// only way to play against another person were both invisible from it. This is
// the guard that a mode added later gets a line here too.
test("HOW TO PLAY names every way to play", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.locator("#mb-help").click();
  await expect(page.locator("#howtoplay")).toBeVisible();
  const body = await page.locator("#howtoplay .sheet-body").innerText();
  for (const mode of ["RACE", "SEASON", "TIME TRIAL", "CAREER", "QUALIFYING", "RACE A FRIEND"])
    expect(body).toContain(mode);
  // The title screen's own buttons are the list it has to keep up with.
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("#menu-hero button, #menu-primary button")]
      .map((b) => b.innerText.trim()).filter(Boolean));
  expect(buttons.length).toBeGreaterThan(3);
});
