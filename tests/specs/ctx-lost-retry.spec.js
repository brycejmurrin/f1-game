// @ts-check
// ctx-lost-retry — TLX WebGL2 (apex26.tlxForceGL=1, SwiftShader): past the reload
// budget, race-entry ctx loss must quit to menu; Retry reloads and the next start
// reaches the grid instead of looping quitToMenuAfterCtxLost.
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

test.describe.configure({ timeout: BOOT_MS + TRACK_MS + 120_000 });
test.slow();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.gfxBootStepMs", "45000");
      sessionStorage.setItem("apex26.ctxLostReloads", "3");
    } catch (_) { /* private mode */ }
  });
});

async function bootMenu(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.name = (window.name ? window.name + "\n" : "") + "apex26.ctxLostReloads=3";
  });
}

async function startBahrainRace(page) {
  await page.evaluate(() => {
    __apex.headless(false);
    const apex = window.__apex;
    const race = apex.race.bind(apex);
    apex.race = function (id, ...rest) {
      setTimeout(() => {
        try { apex.lifecycle({ loseContext: true }); } catch (_) { /* harness */ }
      }, 1500);
      return race(id, ...rest);
    };
    return apex.race("bahrain");
  });
}

test("TLX WebGL2: Retry reloads after budget-exhausted race-entry ctx loss (backend three, tlxForceGL=1)", async ({ page }) => {
  await bootMenu(page);
  await startBahrainRace(page);
  await page.waitForFunction(
    () => window.__apex && __apex.info().state === "menu" && document.getElementById("ctx-lost-notice") && !document.getElementById("ctx-lost-notice").hidden,
    null,
    { polling: 200, timeout: TRACK_MS },
  );
  const stuck = await page.evaluate(() => ({
    state: __apex.info().state,
    track: __apex.info().track,
    lost: __apex.lifecycle().contextLost,
    detail: document.getElementById("ctx-lost-notice-detail")?.textContent || "",
  }));
  expect(stuck.state).toBe("menu");
  expect(stuck.track).toBeNull();
  expect(stuck.lost).toBe(true);
  expect(stuck.detail).toMatch(/reload or pick another RENDERER/i);

  const nav = page.waitForEvent("framenavigated", { timeout: 60_000 });
  await page.locator("#ctx-lost-retry").click();
  await nav;
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

  await page.evaluate(() => {
    __apex.headless(true);
    return __apex.race("bahrain");
  });
  await page.waitForFunction(
    () => window.__apex && __apex.info().state === "race" && __apex.info().track === "bahrain",
    null,
    { polling: 200, timeout: TRACK_MS },
  );
  const after = await page.evaluate(() => ({
    state: __apex.info().state,
    track: __apex.info().track,
    lost: __apex.lifecycle().contextLost,
  }));
  expect(after).toEqual({ state: "race", track: "bahrain", lost: false });
});
