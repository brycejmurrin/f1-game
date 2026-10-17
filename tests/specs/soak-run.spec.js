// @ts-check
// AUTO SOAK (#1633): one call builds a wet Monza race, the player car drives itself
// (input only), PhoneRecorder records, the soak stops itself and leaves valid JSON.
// A 0.2 min soak keeps this to one race build plus ~12 s of driving.
import { test, expect, BOOT_MS, RACE_BUILD_MS } from "../helpers/fixtures.js";

test.describe("auto soak — hands-free recorded race", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("drives the player car, records, stops itself and leaves SHARE-able JSON", async ({ page }) => {
    test.setTimeout(RACE_BUILD_MS + 180000);
    await page.goto("/");
    await page.waitForFunction(() => typeof SoakRun !== "undefined" && typeof PhoneRecorder !== "undefined" && !!window.__apex,
      null, { polling: 200, timeout: BOOT_MS });

    expect(await page.evaluate(() => SoakRun.active())).toBe(false);
    expect(await page.evaluate(() => SoakRun.start({ minutes: 0.2 }))).toBe(true);

    await page.waitForFunction(() => SoakRun.status().state === "racing", null, { polling: 500, timeout: RACE_BUILD_MS });
    const early = await page.evaluate(() => ({ s: window.__apex.obs().s, wx: window.__apex.weather(), cam: window.__apex.camera().mode }));
    expect(early.wx).toBe("wet");
    expect(early.cam).toBe("chase");

    await page.waitForFunction(() => SoakRun.status().state === "done", null, { polling: 500, timeout: 60000 });
    const out = await page.evaluate(() => ({ st: SoakRun.status(), json: PhoneRecorder.json()}));
    expect(out.st.reason).toBe("complete");
    const rec = JSON.parse(out.json);
    expect(rec.schema).toBe("apex26.phone-soak/1");
    expect(rec.samples.length).toBeGreaterThanOrEqual(2);
    expect(rec.samples[0].circuit).toBe("monza");
    expect(rec.samples[0].weather).toBe("wet");
    expect(rec.samples[rec.samples.length - 1].trigger).toBe("stop");
    expect(rec.samples[rec.samples.length - 1].frame.frames).toBeGreaterThan(100);
    // The car actually drove itself: it advanced along the circuit with no player input.
    expect(rec.samples[rec.samples.length - 1].frames).toBeGreaterThan(300);
  });
});
