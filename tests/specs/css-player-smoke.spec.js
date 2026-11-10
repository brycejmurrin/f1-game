// @ts-check
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { exportStore } from "../helpers/title-fit.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

// One boot protects representative CSS hit targets and the real pause lifecycle.
// Keep shipped typography and theme defaults; buttons is a selectable steering mode.
test("trusted pointer can reach pause and resume repeatedly", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apex26.steerMode", JSON.stringify("buttons"));
    // Exercise the production modal click shield, including second-finger taps.
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null,
    { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => document.fonts.ready);
  const hitTarget = async (id) => {
    const button = page.locator("#" + id);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    // The title groups (Play, Garage, Watch & Explore, Create, Utilities) share one scroller on a short phone, so a
    // lower group is reached by scrolling; the check below still demands it fits and owns its pointer target.
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const target = document.elementFromPoint(x, y);
      return { x, y, width: r.width, height: r.height,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        reachable: !!target && (target === el || el.contains(target)) };
    });
    expect(hit.width).toBeGreaterThan(0);
    expect(hit.height).toBeGreaterThan(0);
    expect(hit.inside, id + " fits in the viewport").toBe(true);
    expect(hit.reachable, id + " owns its pointer target").toBe(true);
    return hit;
  };
  const pointerClick = async (id) => {
    const hit = await hitTarget(id);
    await page.mouse.click(hit.x, hit.y);
  };
  for (const id of ["mb-race", "mb-garage", "mb-settings"]) {
    // Destination groups share a scrolling column on short screens.
    await page.locator("#" + id).scrollIntoViewIfNeeded();
    await hitTarget(id);
  }
  await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null,
    { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.go();
    window.__trustedPauseClicks = [];
    for (const id of ["pausebtn", "pm-resume"]) {
      document.getElementById(id).addEventListener("click", (e) => {
        window.__trustedPauseClicks.push({ id, trusted: e.isTrusted });
      });
    }
  });
  await expect(page.locator("#loading")).toBeHidden({ timeout: BOOT_MS });
  expect(await page.evaluate(() => window.__apex.inputState().steerMode)).toBe("buttons");
  for (const id of ["btn-throttle", "btn-brake", "btn-steer-left", "btn-steer-right"]) {
    await hitTarget(id);
  }
  for (let visit = 0; visit < 2; visit++) {
    await pointerClick("pausebtn");
    await expect(page.locator("#pausemenu")).toBeVisible();
    expect(await page.evaluate(() => window.UiLayers.navOpen())).toBe(true);
    await pointerClick("pm-resume");
    await expect(page.locator("#pausemenu")).toBeHidden();
    expect(await page.evaluate(() => window.__apex.inputState().gate.anyOpen)).toBe(false);
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("race");
  }
  expect(await page.evaluate(() => window.__trustedPauseClicks)).toEqual([
    { id: "pausebtn", trusted: true }, { id: "pm-resume", trusted: true },
    { id: "pausebtn", trusted: true }, { id: "pm-resume", trusted: true },
  ]);

  // Compatibility clicks are absent for a second touch while GAS is held.
  // Check the actual camera change as well as the independent driving contact.
  const cdp = await page.context().newCDPSession(page);
  const contact = async (id, pointerId) => { const h = await hitTarget(id); return { x: h.x, y: h.y, id: pointerId }; };
  let contactOpen = false;
  const touch = async (type, points) => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    if (type === "touchStart") contactOpen = true;
    if (type === "touchCancel") contactOpen = false;
  };
  try {
    const gas = await contact("btn-throttle", 1), cam = await contact("btn-cam", 2);
    const before = await page.evaluate(() => window.__apex.camera().index);
    await touch("touchStart", [gas]); await touch("touchStart", [cam]);
    await touch("touchEnd", [cam]); // Chromium legacy route ends the named contact.
    const after = await page.evaluate(() => ({ camera: window.__apex.camera().index, throttle: window.__apex.inputState().btn.throttle }));
    expect(after.camera).not.toBe(before);
    expect(after.throttle).toBe(true);
    await touch("touchCancel", []);
    expect(await page.evaluate(() => window.__apex.inputState().btn.throttle)).toBe(false);

    const held = await contact("btn-throttle", 3), pause = await contact("pausebtn", 4);
    await touch("touchStart", [held]); await touch("touchStart", [pause]); await touch("touchEnd", [pause]);
    await expect(page.locator("#pausemenu")).toBeVisible();
    // The held contact stays tracked while the modal gates applied driving input.
    const paused = await page.evaluate(() => window.__apex.inputState());
    expect(paused.gate.anyOpen).toBe(true);
    expect(paused.throttle).toBe(false);
    expect(paused.throttleLevel).toBe(0);
    await touch("touchCancel", []);
    expect(await page.evaluate(() => window.__apex.inputState().btn.throttle)).toBe(false);
    await pointerClick("pm-resume");
    await expect(page.locator("#pausemenu")).toBeHidden();
  } finally { if (contactOpen) await touch("touchCancel", []); await cdp.detach(); }
});


// THE OWNER'S PHONE, NOT THE HOUSE VIEWPORT. Every bug reported from the phone in the week of 2026-11-03 shipped
// with the test above green, because it boots 844x390 on the default profile with no safe-area insets and asserts
// that a control can be tapped, never how big it paints (#5179: PAUSE ~55 px and CAM ~97x55 at BUTTON 245 %) or
// whether a sheet's doors can be hit (#5200). This cell is the iPhone Home Screen app in landscape: 852x393, real
// env() insets 59/21/59 through CDP, touch, and the settings export in tests/data/settings-defaults-export.json
// (HUD 155 %, BUTTON 245 %, large text, high contrast, buttons steering). Sizes are asserted with an upper bound
// and every door by elementFromPoint, opened by a trusted tap on #pausebtn rather than `hidden = false`.
// Not covered here, by measurement on e808230: at UI SIZE 50 RESUME has an on-screen rect but the tap lands on
// the sheet (#5200, fixed by its own PR, which owns ui-resize.spec.js); display-mode standalone cannot be emulated.
// The renderer stays the fixture's pinned GLX: this is a layout cell.
test.describe("owner phone: 852x393 Home Screen app, insets 59/21/59, exported profile", () => {
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  const INSETS = { top: 0, left: 59, bottom: 21, right: 59 };

  test("race chrome keeps a fixed size and the pause doors can be tapped", async ({ page }) => {
    const store = exportStore();
    delete store.json.gfxBackend; delete store.raw.gfxBackend;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    await page.addInitScript(({ json, raw }) => {
      try {
        for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
        for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
      } catch (_) { /* storage off */ }
      Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
    }, store);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => document.fonts.ready);
    const env = await page.evaluate(() => ({
      sal: getComputedStyle(document.documentElement).getPropertyValue("--sal").trim(),
      coarse: matchMedia("(pointer: coarse)").matches,
      hud: localStorage.getItem("apex26.hudScale"), btn: localStorage.getItem("apex26.hudBtnScale"),
    }));
    expect(env, "the cell is the owner's: env() insets, a coarse pointer and his stored sizes reached the page")
      .toEqual({ sal: "59px", coarse: true, hud: "155.25", btn: "245" });

    await page.evaluate(() => window.__apex.headless(true));
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.go());
    await expect(page.locator("#loading")).toBeHidden({ timeout: BOOT_MS });
    expect(await page.evaluate(() => window.__apex.inputState().steerMode)).toBe("buttons");

    const probe = (id) => page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const t = document.elementFromPoint(x, y);
      return { x, y, w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        hit: !!t && (t === el || el.contains(t)), hitBy: t ? (t.id || String(t.className) || t.tagName) : "nothing" };
    }, id);
    const door = async (id, safe) => {
      const p = await probe(id);
      expect(p, id + " exists").not.toBeNull();
      expect(p.hit, `${id} owns its own centre point (elementFromPoint gave ${p.hitBy})`).toBe(true);
      expect(p.top >= 0 && p.bottom <= 393 && p.left >= 0 && p.right <= 852, `${id} is inside the window: ${JSON.stringify(p)}`).toBe(true);
      if (safe) expect(p.left >= INSETS.left - 0.5 && p.right <= 852 - INSETS.right + 0.5, `${id} clears the notch and the corner (${p.left}..${p.right})`).toBe(true);
      return p;
    };

    // #5179. Top-band chrome is a fixed tap target at his BUTTON 245 % / HUD 155 %, not a scaled one.
    const pause = await door("pausebtn", true), cam = await door("btn-cam", true);
    expect(pause.h, "PAUSE is a 44-48 px target, whatever BUTTON SIZE says").toBeGreaterThanOrEqual(44);
    expect(pause.h, "PAUSE is a 44-48 px target, whatever BUTTON SIZE says").toBeLessThanOrEqual(48);
    expect(Math.abs(pause.w - pause.h), "PAUSE is square").toBeLessThanOrEqual(0.5);
    expect(Math.abs(cam.h - pause.h), "CAM is exactly as tall as PAUSE").toBeLessThanOrEqual(0.5);
    expect(Math.abs(cam.top - pause.top), "CAM and PAUSE share a top edge").toBeLessThanOrEqual(0.5);
    expect(cam.w, "CAM is a pill, not a banner").toBeLessThanOrEqual(110);
    expect(cam.right, "CAM sits left of PAUSE without touching it").toBeLessThan(pause.left);
    // The driving controls he steers with: on screen, inside the safe box, and nothing painted over their centres.
    for (const id of ["btn-throttle", "btn-brake", "btn-steer-left", "btn-steer-right"]) {
      const p = await door(id, true);
      expect(Math.min(p.w, p.h), id + " is at least a 44 px target").toBeGreaterThanOrEqual(44);
    }

    // #5200. Open PAUSE the way a thumb does, then hit-test every door: a rect inside the window is not enough
    // (a clipped or covered button still has one).
    await page.mouse.click(pause.x, pause.y);
    await expect(page.locator("#pausemenu")).toBeVisible();
    for (const id of ["pm-resume", "pm-restart", "pm-settings", "pm-quit"]) {
      const p = await door(id, false);
      expect(p.h, id + " is at least a 44 px target").toBeGreaterThanOrEqual(44);
    }
    const body = await page.evaluate(() => {
      const e = document.querySelector("#pausemenu .sheet-body");
      return { scroll: e.scrollHeight, client: e.clientHeight };
    });
    expect(body.scroll, `the pause sheet fits, never scrolls (${JSON.stringify(body)})`).toBeLessThanOrEqual(body.client + 1);
    const resume = await probe("pm-resume");
    await page.mouse.click(resume.x, resume.y);
    await expect(page.locator("#pausemenu")).toBeHidden();
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("race");
    await cdp.detach();
  });
});
