// @ts-check
// Garage entry must paint a non-black bay with ZERO panel input.
// Bryce: canvas stayed black until a garage panel tap — first present only
// started (or became visible) on that input. Covers reduce-motion on and off
// (Home vt race + TLX noEnv HDR path). Each test starts a fresh TLX page.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { screenshotPresentedCanvas } from "../helpers/presented-canvas.js";
import { frameContent, screenshotPixels } from "../helpers/visual-oracle.js";
import { toMenu } from "../helpers/shared-page.js";
import fs from "fs";
import path from "path";

const OUT = path.resolve("artifacts/garage-first-frame-spec");
fs.mkdirSync(OUT, { recursive: true });

async function clickId(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("garage-first-frame: missing #" + i);
    el.click();
  }, id);
}

/** Sample #game-soft (GLX headless) without arming a new soft blit. */
async function sampleSoft(page) {
  return page.evaluate(() => {
    const soft = document.getElementById("game-soft");
    const game = document.getElementById("game");
    const a = window.__apex;
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    let avg = 0, max = 0, nz = 0, n = 0;
    if (soft && soft.width > 8 && soft.getContext) {
      const d = soft.getContext("2d").getImageData(0, 0, soft.width, soft.height).data;
      for (let i = 0; i < d.length; i += 32) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        avg += L; n++; if (L > max) max = L; if (L > 8) nz++;
      }
      if (n) avg /= n;
    }
    return {
      avg, max, nz, n,
      softOp: soft ? soft.style.opacity : null,
      softW: soft ? soft.width : 0,
      visGame: game ? game.style.visibility : null,
      visSoft: soft ? soft.style.visibility : null,
      softSt: st,
      cam: a.garageCam ? a.garageCam() : null,
      first: a.garagePrebuild ? a.garagePrebuild().firstFrame : null,
    };
  });
}

async function openGarageNoPanelInput(page) {
  await toMenu(page);
  const previousGen = await page.evaluate(() => {
    const st = typeof GLX !== "undefined" && GLX.softPresentState ? GLX.softPresentState() : null;
    return st?.gen ?? 0;
  });
  await clickId(page, "mb-garage");
  await page.waitForFunction(() => {
    const cs = document.getElementById("carsetup");
    return !!(cs && !cs.hidden);
  }, null, { polling: 100, timeout: 30_000 });
  // Wait for the entry present our openGarage kick (or the loop) recorded —
  // do NOT click any #cs-* control and do NOT call snapCam here (that would
  // mask a missing entry blit).
  await page.waitForFunction((previousGen) => {
    const a = window.__apex;
    const ff = a.garagePrebuild && a.garagePrebuild().firstFrame;
    const cam = a.garageCam && a.garageCam();
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    const vis = document.getElementById("game")?.style.visibility;
    return !!(cam && cam.on && vis !== "hidden" && ff && ff.from === "menu"
      && (!st?.on || (st.gen > previousGen)));
  }, previousGen, { polling: 100, timeout: 45_000 });
}

async function assertNonBlack(page, label) {
  // Give the on-demand soft blit from enterGarage's invalidateSoftPresent one
  // more present cycle without a panel click.
  await page.waitForFunction(() => {
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    if (!st || !st.on) return true; // hardware pixels are checked below
    return st.gen > 0;
  }, null, { polling: 100, timeout: 30_000 });
  const s = await sampleSoft(page);
  expect(s.cam?.on, `${label}: garage preview on`).toBe(true);
  expect(s.visGame, `${label}: #game must not stay hidden`).not.toBe("hidden");
  if (s.softSt?.on) {
    expect(s.softSt.gen, `${label}: soft blit must be presented`).toBeGreaterThan(0);
    expect(s.max, `${label}: soft canvas max luma`).toBeGreaterThan(8);
    expect(s.nz, `${label}: soft canvas non-black samples`).toBeGreaterThan(100);
  }
  // skipAwait is essential: the capture must observe the entry frame without
  // requesting a soft blit or calling snapCam (which would repair this bug).
  // CDP captures composited pixels on hardware: hide chrome so text on a
  // black canvas cannot satisfy the content assertion. This changes no game
  // state, requests no render and sends no garage input.
  const chrome = await page.addStyleTag({ content: "body > :not(canvas):not(script):not(style) { visibility:hidden !important } dialog::backdrop { background:transparent !important }" });
  try {
    const shot = await screenshotPresentedCanvas(page, { skipAwait: true, timeout: 30_000 });
    expect(frameContent(await screenshotPixels(page, shot.buf)).nonblank,
      `${label}: actual presented garage pixels must contain visible detail`).toBe(true);
  } finally { await chrome.evaluate(el => el.remove()); }
  return s;
}

async function saveShot(page, name) {
  const b64 = await page.evaluate(() => {
    const c = document.getElementById("game-soft") || document.getElementById("game");
    if (!c || !c.toDataURL) return null;
    return c.toDataURL("image/png").slice(22);
  });
  if (b64) fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(b64, "base64"));
}

test.describe("garage first frame on entry (no panel input)", () => {
  test.use({ viewport: { width: 640, height: 360 } });
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.removeItem("apex26.tlxForceGL");
    });
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate(() => GLX.backend), "garage regression must exercise TLX").toBe("three");
  });

  test("reduce-motion on: bay is non-black after Home → GARAGE", async ({ page }) => {
    // Suite default pins reducedMotion:"reduce"; re-assert for clarity.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGarageNoPanelInput(page);
    const s = await assertNonBlack(page, "reduce");
    await saveShot(page, "entry-reduce");
    expect(s.first?.from, "firstFrame measured from menu tap").toBe("menu");
  });

  test("reduce-motion off: bay is non-black after Home → GARAGE (vt path)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Write the in-game motion pick (TitleFx) after boot
    // so vt() uses startViewTransition instead of the reduce bypass.
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "on");
      document.documentElement.removeAttribute("data-motion");
    });
    await openGarageNoPanelInput(page);
    const s = await assertNonBlack(page, "motion");
    await saveShot(page, "entry-motion");
    expect(s.first?.from, "firstFrame measured from menu tap").toBe("menu");
  });
});

test.describe("garage arrival preview touch exit", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test.setTimeout(180_000);

  test("PREVIEW IN and OUT can be stopped by a visible touch control", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.garageArrival", JSON.stringify({ enabled: true, speed: 0.5 }));
      localStorage.setItem("apex26.tlxForceGL", "1");
    });
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
    await toMenu(page);
    expect(await page.evaluate(() => GLX.backend)).toBe("three");
    expect(await page.evaluate(() => GLX.backendState().api)).toBe("webgl2");
    await clickId(page, "mb-settings");
    await clickId(page, "pm-open-visual");
    await page.locator("#pm-garrival").tap();
    for (const dir of ["in", "out"]) {
      const tools = page.locator("#garrival .ew-tools");
      if (await tools.count() && !await tools.evaluate(el => el.open)) {
        await tools.locator(":scope > summary").tap();
      }
      await page.locator("#ga-preview-" + dir).tap();
      await expect(page.locator("#garrival-inner")).toBeHidden();
      const stop = page.locator("#ga-preview-stop");
      await expect(stop).toBeVisible();
      const box = await stop.boundingBox();
      expect(box?.height, "stop remains a phone-sized target").toBeGreaterThanOrEqual(44);
      // A real tap verifies ancestor visibility, hit testing and pointer-events;
      // invoking onclick through evaluate hid the original untappable DONE.
      await stop.tap();
      await expect(stop).toBeHidden();
      await expect(page.locator("#garrival-inner")).toBeVisible();
      await expect(page.locator("#ga-preview-" + dir)).toBeFocused();
      expect(await page.evaluate(() => window.__apex.garageCam().on)).toBe(false);
    }
    await page.locator("#ga-close").tap();
    await expect(page.locator("#garrival")).toBeHidden();
    await expect(page.locator("#pmsettings")).toBeVisible();
  });
});

test.describe("garage touch gesture lifecycle", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test.setTimeout(180_000);
  const pageErrors = new WeakMap();
  test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.garageArrival", JSON.stringify({ enabled: false }));
    });
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.agentHelp());
    await openGarageNoPanelInput(page);
    expect(await page.evaluate(() => ({ backend: GLX.backend, api: GLX.backendState().api })))
      .toEqual({ backend: "three", api: "webgl2" });
  });
  test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page), "gesture paths produce no page errors").toEqual([]);
  });

  // Dispatch browser PointerEvents to exercise the installed listeners with
  // overlapping touch IDs. This is event integration, not a native Safari or
  // compositor performance test; no render/timing improvement is claimed.
  async function pointer(page, type, id, x) {
    await page.evaluate(({ type, id, x }) => {
      const target = type === "pointerdown" ? document.getElementById("game") : window;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: "touch", clientX: x, clientY: 200 }));
    }, { type, id, x });
  }
  async function leaveTwoFingers(page) {
    await pointer(page, "pointerdown", 11, 100);
    await pointer(page, "pointerdown", 12, 200);
  }
  async function resetGestureCamera(page) {
    if (await page.locator("#cs-cam-panel").isHidden()) await page.locator("#cs-cam").tap();
    await page.locator("#cs-view-reset").tap();
    await expect(page.locator("#cs-view-spin")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#cs-cam").tap();
    await expect(page.locator("#cs-cam-panel")).toBeHidden();
  }
  async function freshDragAndPinch(page) {
    await pointer(page, "pointerdown", 31, 100);
    const before = await page.evaluate(() => window.__apex.garageCam());
    await pointer(page, "pointermove", 31, 150);
    const dragged = await page.evaluate(() => window.__apex.garageCam());
    expect(dragged.az, "fresh finger orbits instead of joining stale pinch IDs").toBeLessThan(before.az);
    expect(dragged.dist, "one-finger orbit keeps zoom unchanged").toBe(before.dist);
    await pointer(page, "pointerdown", 32, 250);
    await pointer(page, "pointermove", 32, 350);
    const pinched = await page.evaluate(() => window.__apex.garageCam());
    expect(pinched.dist, "genuine new two-finger pinch still zooms").toBeLessThan(dragged.dist);
    await pointer(page, "pointercancel", 31, 150);
    await pointer(page, "pointerup", 32, 350);
  }

  test("blur and pagehide abandon old pinch IDs before the next gesture", async ({ page }) => {
    for (const type of ["blur", "pagehide"]) {
      // Reset BEFORE the old gesture, never after the lifecycle event: doing
      // it afterwards would mask a failure to clear stale pointer IDs.
      await resetGestureCamera(page);
      await leaveTwoFingers(page);
      await page.evaluate(type => window.dispatchEvent(new Event(type)), type);
      await freshDragAndPinch(page);
    }
  });

  test("closing and reopening garage abandons the previous gesture", async ({ page }) => {
    await leaveTwoFingers(page);
    await page.locator("#cs-done").tap();
    await expect(page.locator("#carsetup")).toBeHidden();
    await openGarageNoPanelInput(page);
    await freshDragAndPinch(page);
  });
});

