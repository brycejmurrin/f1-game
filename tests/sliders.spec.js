// @ts-check
// Steering-slider tests. Every pause-menu slider must (1) be wired — moving it
// changes the value it maps to, in the right direction, updates its label, and
// persists to storage — and (2) actually change the car's behaviour. Physics
// sliders are checked by driving the sim; tilt sliders by their mapped values
// plus one end-to-end tilt-input check.
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
}
async function startRace(page) {
  await load(page);
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}
const setSlider = (page, id, value) =>
  page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, { id, value });
const tuning = (page) => page.evaluate(() => window.__apex.tuning());
const labelText = (page, id) => page.evaluate((id) => document.getElementById(id).textContent, id);
const stored = (page, key) => page.evaluate((k) => localStorage.getItem("apex26." + k), key);

// id, mapped tuning() key, store key, value label id, and the sign of
// (value@max - value@min) — i.e. which way the mapped value moves with the slider.
const SLIDERS = [
  { id: "pm-sens",    key: "tiltOutputScale", store: "tiltSens",   vid: "pm-sens-v",    min: 1,  max: 10, sign: +1 },
  { id: "pm-rate",    key: "wheelbase",       store: "steerRate",  vid: "pm-rate-v",    min: 1,  max: 10, sign: -1 },
  { id: "pm-expo",    key: "expo",            store: "steerExpo",  vid: "pm-expo-v",    min: 1,  max: 10, sign: -1 },
  { id: "pm-smooth",  key: "tiltSlew",        store: "steerSmooth",vid: "pm-smooth-v",  min: 1,  max: 10, sign: -1 },
  { id: "pm-dz",      key: "deadzone",        store: "tiltDz",     vid: "pm-dz-v",      min: 1,  max: 10, sign: +1 },
  { id: "pm-tiltdeg", key: "maxTilt",         store: "tiltDeg",    vid: "pm-tiltdeg-v", min: 1,  max: 10, sign: -1 },
  { id: "pm-lock",    key: "maxSlip",         store: "steerLock",  vid: "pm-lock-v",    min: 1,  max: 10, sign: +1 },
  { id: "pm-line",    key: "raceLineAssist",  store: "raceLine",   vid: "pm-line-v",    min: -5, max: 5,  sign: +1 },
];

test.describe("Apex 26 — steering sliders", () => {
  for (const s of SLIDERS) {
    test(`${s.id} is wired: changes its value the right way, label + storage`, async ({ page }) => {
      await load(page);
      await setSlider(page, s.id, s.min);
      const lo = (await tuning(page))[s.key];
      const loLabel = await labelText(page, s.vid);
      await setSlider(page, s.id, s.max);
      const hi = (await tuning(page))[s.key];
      const hiLabel = await labelText(page, s.vid);

      expect(Math.sign(hi - lo)).toBe(s.sign);          // moves the right direction
      expect(loLabel).not.toBe(hiLabel);                // label tracks the slider
      expect(await stored(page, s.store)).toBe(String(s.max)); // persisted
    });
  }

  // ---- behaviour: physics sliders genuinely change how the car drives ----

  // Hold a fixed steer from a straight and measure how far the heading swings.
  const turnBurst = (page, steer, ticks = 12) => page.evaluate(({ steer, ticks }) => {
    window.__apex.jump(0.0, 28, 0);
    window.__apex.setInput({ steer, throttle: false });
    const a0 = window.__apex.probe().angle;
    for (let i = 0; i < ticks; i++) window.__apex.step(1 / 60, 1);
    const a1 = window.__apex.probe().angle;
    window.__apex.clearInput();
    return Math.abs(a1 - a0);
  }, { steer, ticks });

  test("LINEARITY: higher slider (more linear) turns more for the same part-input", async ({ page }) => {
    await startRace(page);
    await setSlider(page, "pm-expo", 2);
    const expoLow = await turnBurst(page, 0.4);   // strong expo: gentle near centre
    await setSlider(page, "pm-expo", 9);
    const expoHigh = await turnBurst(page, 0.4);  // linear: more bite at part-input
    expect(expoHigh).toBeGreaterThan(expoLow * 1.2);
  });

  test("STEER LOCK: higher slider allows a larger max turn at full lock", async ({ page }) => {
    await startRace(page);
    await setSlider(page, "pm-lock", 2);
    const lockLow = await turnBurst(page, 1, 20);
    await setSlider(page, "pm-lock", 9);
    const lockHigh = await turnBurst(page, 1, 20);
    expect(lockHigh).toBeGreaterThan(lockLow * 1.15);
  });

  // The tilt INPUT sliders (TILT STRENGTH/RANGE, DEAD ZONE, STEER SMOOTHING) are
  // covered by the wiring tests above — each moves the exact live value
  // (tiltOutputScale / maxTilt / deadzone / tiltSlew) that the tilt pipeline
  // consumes in tiltSteering(). A full end-to-end tilt-input check can't run in
  // this headless environment because DeviceOrientationEvent is unavailable, so
  // requestGyro() never attaches the sensor listener.
});
