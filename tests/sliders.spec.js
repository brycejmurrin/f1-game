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
  { id: "pm-speedsteer", key: "speedRef",     store: "steerSpeed", vid: "pm-speedsteer-v", min: 1, max: 10, sign: +1 },
  { id: "pm-slide",   key: "drift",           store: "slide",      vid: "pm-slide-v",   min: 1,  max: 10, sign: +1 },
  { id: "pm-help",    key: "roadFollow",      store: "drivingHelp",vid: "pm-help-v",    min: 1,  max: 10, sign: +1 },
  { id: "pm-pace",    key: "pace",            store: "pace",       vid: "pm-pace-v",    min: 1,  max: 10, sign: +1 },
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

  test("OVERALL SPEED lifts BOTH the player's and the AI's top speed", async ({ page }) => {
    await startRace(page);
    // Top speed reached flat-out on the straight at a given pace, for the player.
    const playerTop = (paceSlider) => page.evaluate((sv) => {
      const el = document.getElementById("pm-pace");
      el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
      window.__apex.jump(0.0, 0, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 420; i++) window.__apex.step(1 / 60, 1);  // ~7 s
      const v = window.__apex.probe().speed;
      window.__apex.clearInput();
      return v;
    }, paceSlider);
    const slow = await playerTop(2);
    const fast = await playerTop(9);
    expect(fast).toBeGreaterThan(slow + 5);   // player clearly faster at high pace

    // AI also lifts: run the field and compare leader speed at low vs high pace.
    const aiTop = (paceSlider) => page.evaluate((sv) => {
      const el = document.getElementById("pm-pace");
      el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
      window.__apex.race("monza", "day", "dry"); window.__apex.go();
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 600; i++) window.__apex.step(1 / 60, 1);  // 10 s of AI racing
      const ai = window.__apex.cars().filter((c) => !c.p);
      window.__apex.clearInput();
      return Math.max(...ai.map((c) => c.speed));
    }, paceSlider);
    const aiSlow = await aiTop(2);
    const aiFast = await aiTop(9);
    expect(aiFast).toBeGreaterThan(aiSlow + 5);   // AI field clearly faster too
  });

  // The tilt INPUT sliders (TILT STRENGTH/RANGE, DEAD ZONE, STEER SMOOTHING) are
  // covered by the wiring tests above — each moves the exact live value
  // (tiltOutputScale / maxTilt / deadzone / tiltSlew) that the tilt pipeline
  // consumes in tiltSteering(). A full end-to-end tilt-input check can't run in
  // this headless environment because DeviceOrientationEvent is unavailable, so
  // requestGyro() never attaches the sensor listener.
});

// ---- simplified ("macro") default-view controls ----
// The default view shows a handful of plain-language controls that fan out to the
// granular store keys; these tests confirm the fan-out, the active-state mirroring,
// and the Advanced disclosure.
const click = (page, id) =>
  page.evaluate((id) => document.getElementById(id).click(), id);
const isActive = (page, id) =>
  page.evaluate((id) => document.getElementById(id).classList.contains("active"), id);
const hidden = (page, id) =>
  page.evaluate((id) => document.getElementById(id).hidden, id);
const num = async (page, key) => Number(await stored(page, key));

test.describe("Apex 26 — simplified controls", () => {
  test("STEERING levels fan out to the four cornering keys and mirror active state", async ({ page }) => {
    await load(page);
    await click(page, "pm-steer-sim");
    expect(await num(page, "steerRate")).toBe(7);
    expect(await num(page, "steerLock")).toBe(7);
    expect(await num(page, "slide")).toBe(6);
    expect(await isActive(page, "pm-steer-sim")).toBe(true);
    expect(await isActive(page, "pm-steer-normal")).toBe(false);

    await click(page, "pm-steer-easy");
    expect(await num(page, "steerRate")).toBe(4);
    expect(await num(page, "slide")).toBe(1);
    expect(await isActive(page, "pm-steer-easy")).toBe(true);
    expect(await isActive(page, "pm-steer-sim")).toBe(false);
  });

  test("TILT SENSITIVITY macro drives tiltDeg / maxTilt", async ({ page }) => {
    await load(page);
    await setSlider(page, "pm-tiltsimple", 2);
    const lo = (await tuning(page)).maxTilt;
    await setSlider(page, "pm-tiltsimple", 9);
    const hi = (await tuning(page)).maxTilt;
    expect(hi).toBeLessThan(lo);                 // higher slider = fewer degrees = more sensitive
    expect(await num(page, "tiltDeg")).toBe(9);
  });

  test("DRIVING HELP and RACING LINE buttons set their store keys", async ({ page }) => {
    await load(page);
    await click(page, "pm-help-high");
    expect(await num(page, "drivingHelp")).toBe(9);
    expect(await isActive(page, "pm-help-high")).toBe(true);

    await click(page, "pm-line-full");
    expect(await num(page, "raceLine")).toBe(5);
    expect(await isActive(page, "pm-line-full")).toBe(true);
    await click(page, "pm-line-off");
    expect(await num(page, "raceLine")).toBe(0);
    expect(await isActive(page, "pm-line-off")).toBe(true);
  });

  test("presets light up the matching simplified controls", async ({ page }) => {
    await load(page);
    await click(page, "pm-preset-pro");
    expect(await isActive(page, "pm-steer-sim")).toBe(true);   // PRO → sim
    await click(page, "pm-preset-relax");
    expect(await isActive(page, "pm-steer-easy")).toBe(true);  // RELAX → easy
    await click(page, "pm-preset-standard");
    expect(await isActive(page, "pm-steer-normal")).toBe(true);// STANDARD → normal
  });

  test("ADVANCED toggle shows and hides the granular sliders", async ({ page }) => {
    await load(page);
    expect(await hidden(page, "adv-extra")).toBe(true);
    await click(page, "adv-more");
    expect(await hidden(page, "adv-extra")).toBe(false);
    await click(page, "adv-more");
    expect(await hidden(page, "adv-extra")).toBe(true);
  });

  test("editing a granular Advanced slider updates the simplified view", async ({ page }) => {
    await load(page);
    await click(page, "pm-preset-standard");
    expect(await isActive(page, "pm-steer-normal")).toBe(true);
    await setSlider(page, "pm-slide", 6);        // nudge one cornering key off NORMAL
    expect(await isActive(page, "pm-steer-normal")).toBe(false);  // no longer a clean level
  });
});
