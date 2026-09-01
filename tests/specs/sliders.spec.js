// @ts-check
// Steering-slider tests. Every pause-menu slider must (1) be wired — moving it
// changes the value it maps to, in the right direction, updates its label, and
// persists to storage — and (2) actually change the car's behaviour. Physics
// sliders are checked by driving the sim; tilt sliders by their mapped values
// plus one end-to-end tilt-input check.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function load(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}
async function startRace(page) {
  await load(page);
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
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
  { id: "pm-rate",    key: "wheelbase",       store: "steerRate",  vid: "pm-rate-v",    min: 1,  max: 10, sign: -1 },
  { id: "pm-expo",    key: "expo",            store: "steerExpo",  vid: "pm-expo-v",    min: 1,  max: 10, sign: -1 },
  { id: "pm-smooth",  key: "tiltCutoff",      store: "steerSmooth",vid: "pm-smooth-v",  min: 1,  max: 10, sign: -1 },
  { id: "pm-tiltdeg", key: "maxTilt",         store: "tiltDeg",    vid: "pm-tiltdeg-v", min: 1,  max: 10, sign: -1 },
  { id: "pm-lock",    key: "maxSlip",         store: "steerLock",  vid: "pm-lock-v",    min: 1,  max: 10, sign: +1 },
  { id: "pm-speedsteer", key: "speedRef",     store: "steerSpeed", vid: "pm-speedsteer-v", min: 1, max: 10, sign: +1 },
  { id: "pm-help",    key: "roadFollow",      store: "drivingHelp",vid: "pm-help-v",    min: 1,  max: 10, sign: +1 },
  // RACE PACE is the one slider with a wider control: the geometric 6 %/notch
  // grid needs 19 notches to cover the same span, anchored so notch 14 is
  // exactly 1.0 (the vTop()/vStd() reference). Its label is a percentage of
  // reference pace, not a notch number — see paceLabel() in steer-tuning.js.
  { id: "pm-pace",    key: "pace",            store: "pace",       vid: "pm-pace-v",    min: 1,  max: 19, sign: +1 },
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

  // Every one of these store keys feeds a plain linear (or, for pace, geometric)
  // interpolation with no floor or ceiling of its own — wheelbaseFromSlider,
  // lockFromSlider, speedRefFromSlider, paceFromSlider, etc. (js/game/steer-
  // tuning.js). applySteerTuning() runs on every boot, reading straight from
  // localStorage, and until this test existed nothing clamped that read: a
  // steerRate of 999 (a direct localStorage edit, or a downgrade from a build
  // with a wider range) computed a NEGATIVE wheelbase and fed it straight into
  // G.WHEELBASE, not an error and not a defensive floor.
  //
  // One combined test rather than one per slider: the interesting cost here is
  // page loads, not assertions, and a single addInitScript can seed all nine
  // keys for one reload.
  test("a store value outside a slider's own range clamps to its boundary notch, not an extrapolation", async ({ page }) => {
    // The LEGITIMATE result at each slider's own min/max, measured by driving
    // the real DOM control — this is what a corrupted store SHOULD resolve to
    // once clamped, not whatever the interpolation reaches if followed past
    // where the slider itself can ever go.
    await load(page);
    const atMax = {}, atMin = {};
    for (const s of SLIDERS) {
      await setSlider(page, s.id, s.max);
      atMax[s.store] = (await tuning(page))[s.key];
    }
    for (const s of SLIDERS) {
      await setSlider(page, s.id, s.min);
      atMin[s.store] = (await tuning(page))[s.key];
    }

    await page.addInitScript((seeds) => {
      for (const [k, v] of seeds) localStorage.setItem("apex26." + k, String(v));
    }, SLIDERS.map((s) => [s.store, s.max + 500]));
    await load(page);
    const overHigh = await tuning(page);
    for (const s of SLIDERS)
      expect(overHigh[s.key], `${s.store} over max`).toBeCloseTo(atMax[s.store], 6);

    // addInitScript calls accumulate (Playwright runs every registered script,
    // in order, before each navigation) — registering this second one and
    // reloading again means BOTH run, and this one (same keys, later) wins.
    await page.addInitScript((seeds) => {
      for (const [k, v] of seeds) localStorage.setItem("apex26." + k, String(v));
    }, SLIDERS.map((s) => [s.store, s.min - 500]));
    await load(page);
    const underLow = await tuning(page);
    for (const s of SLIDERS)
      expect(underLow[s.key], `${s.store} under min`).toBeCloseTo(atMin[s.store], 6);
  });

  // ---- behaviour: physics sliders genuinely change how the car drives ----

  // Hold a fixed steer from a straight and measure how far the heading swings.
  const turnBurst = (page, steer, ticks = 12, speed = 28) => page.evaluate(({ steer, ticks, speed }) => {
    window.__apex.jump(0.0, speed, 0);
    window.__apex.setInput({ steer, throttle: false });
    const a0 = window.__apex.probe().angle;
    for (let i = 0; i < ticks; i++) window.__apex.step(1 / 60, 1);
    const a1 = window.__apex.probe().angle;
    window.__apex.clearInput();
    return Math.abs(a1 - a0);
  }, { steer, ticks, speed });

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
    // Measured at low speed, where the tyres aren't yet grip-limited, so a bigger
    // road-wheel lock genuinely tightens the turn (at racing speed the friction
    // limit caps it — correct, but not what this slider is for).
    await setSlider(page, "pm-lock", 2);
    const lockLow = await turnBurst(page, 1, 20, 12);
    await setSlider(page, "pm-lock", 9);
    const lockHigh = await turnBurst(page, 1, 20, 12);
    expect(lockHigh).toBeGreaterThan(lockLow * 1.15);
  });

  test("OVERALL SPEED lifts BOTH the player's and the AI's top speed", async ({ page }) => {
    await startRace(page);
    // Top speed reached flat-out on the straight at a given pace, for the player.
    // Measure the player ALONE. This used to jump into the middle of the live
    // 22-car grid at s = 0 with zero speed, so what it actually measured was a car
    // stuck in traffic: ~40-85 m of progress in 7 s, usually ending on the grass at
    // the off-track floor, and different every run. Both pace settings returned the
    // same pinned speed and the test failed regardless of the slider. Shove the
    // field out of the way (park() does exactly this) and give the car clear road.
    const playerTop = (paceSlider) => page.evaluate((sv) => {
      const el = document.getElementById("pm-pace");
      el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
      window.__apex.park(0.0);            // clears the field, freezes
      window.__apex.freeze(false);        // ...but we want to drive
      window.__apex.jump(0.0, 0, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      // PEAK speed, not the final one. Un-steered, the car eventually leaves the
      // road and settles at the off-track floor (10.8 m/s) — which erased whatever
      // it had actually reached and made both pace settings report the same
      // number. What the slider changes is how fast the car CAN go, so measure
      // the maximum it got to.
      let peak = 0;
      for (let i = 0; i < 420; i++) {
        window.__apex.step(1 / 60, 1);
        peak = Math.max(peak, window.__apex.probe().speed);
      }
      window.__apex.clearInput();
      return peak;
    }, paceSlider);
    // Notches 6 and 18 on the 19-notch geometric grid: pace 0.627 vs 1.262, the
    // same two paces this asserted against on the old 1..10 grid (notches 2 and
    // 9). What is under test is that the slider moves ground speed at all, so
    // only the paces have to be far apart — the notch numbers are incidental.
    const slow = await playerTop(6);
    const fast = await playerTop(18);
    expect(fast).toBeGreaterThan(slow + 5);   // player clearly faster at high pace

    // AI also lifts: run the field and compare leader speed at low vs high pace.
    const aiTop = (paceSlider) => page.evaluate((sv) => {
      const el = document.getElementById("pm-pace");
      el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
      // NOTE: race() rebuilds the track asynchronously; go() and step() used to run
      // immediately after it, so this raced the build. Reuse the already-loaded
      // track instead — the pace slider is what is under test, not a reload.
      window.__apex.go();
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 600; i++) window.__apex.step(1 / 60, 1);  // 10 s of AI racing
      const ai = window.__apex.cars().filter((c) => !c.p);
      window.__apex.clearInput();
      return Math.max(...ai.map((c) => c.speed));
    }, paceSlider);
    const aiSlow = await aiTop(6);
    const aiFast = await aiTop(18);
    expect(aiFast).toBeGreaterThan(aiSlow + 5);   // AI field clearly faster too
  });

  // ...but it must lift the GROUND speed only. OVERALL SPEED used to shrink the
  // whole envelope the player sees along with it, because gear tops and every
  // speed normaliser were fractions of the bare VMAX = 72, which knows nothing
  // about PACE. At pace 0.63 (top ~45 m/s) 7th and 8th were simply unreachable and
  // the dial stopped at ~162 km/h. PACE now scales the envelope too (vTop/vStd in
  // game.js). The three tests below pin that down: the dial→gear mapping, the
  // envelope actually reached under power, and the manual-gearbox limiter.

  // The mapping itself, measured without driving: plant the car at the speeds that
  // put the dial at a given km/h and read the gearbox back. Same dial reading =>
  // same gear, at every pace.
  test("OVERALL SPEED leaves the dial→gear mapping identical", async ({ page }) => {
    await startRace(page);
    const rows = await page.evaluate(() => {
      const DIAL = [30, 90, 150, 210, 250];   // km/h on the dial
      const out = [];
      // Both ends of the 19-notch grid (0.469 and 1.338), the 1.0 reference at
      // 14, and the two notches nearest the old 2 / 9 samples. The claim is that
      // the dial→gear mapping is pace-INDEPENDENT, so the sample only has to span
      // the slider.
      for (const sv of [1, 6, 14, 18, 19]) {
        const el = document.getElementById("pm-pace");
        el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
        window.__apex.park(0.1); window.__apex.freeze(false);
        // dashKph is speed/PACE*3.6, so this is the ground speed that shows `kph`.
        const pace = window.__apex.tuning().pace;
        const gears = [], dials = [];
        for (const kph of DIAL) {
          window.__apex.jump(0.1, kph / 3.6 * pace, 0);
          window.__apex.setInput({ steer: 0, throttle: false });
          // TWO reads, deliberately not one obs(). The gearbox needs a couple of
          // frames to choose, but those frames COAST — the car sheds
          // COAST_DRAG * 2/60 = 0.2 m/s — and COAST_DRAG is an absolute force
          // (that is what makes low pace forgiving) while dashKph divides by
          // pace. So a dial read after the settle loses 0.2/pace*3.6 km/h: 1.54
          // at pace 0.47 against 0.54 at 1.34. Reading both from one obs() made
          // this spec measure the mapping PLUS that decay, and the `< 1 km/h`
          // tolerance below silently absorbed it until the 19-notch grid widened
          // the sweep and took the spread from 0.886 to 0.998.
          dials.push(window.__apex.obs().dashKph);
          window.__apex.step(1 / 60, 2);     // let the auto box pick its gear
          gears.push(window.__apex.obs().gear);
        }
        window.__apex.clearInput();
        out.push({ sv, gears, dials });
      }
      return out;
    });
    const ref = rows[0];
    for (const r of rows) {
      expect(r.gears, `gears at pace ${r.sv}`).toEqual(ref.gears);
      // ...and the dial agrees to within a km/h across the whole slider range.
      r.dials.forEach((d, i) => expect(Math.abs(d - ref.dials[i])).toBeLessThan(1));
    }
    expect(ref.gears[ref.gears.length - 1]).toBe(8);   // 250 km/h is top gear
  });

  // The same thing under power: hold the throttle down and see what the car
  // actually reaches. Re-planting it at the same point each block keeps it on
  // clear road (un-steered it would run wide and settle on the grass floor, which
  // erased the peak), and setLap keeps the long run from tripping the flag.
  test("OVERALL SPEED reaches the full gearbox and dial at every setting", async ({ page }) => {
    await startRace(page);
    const flatOut = (paceSlider) => page.evaluate((sv) => {
      const el = document.getElementById("pm-pace");
      el.value = String(sv); el.dispatchEvent(new Event("input", { bubbles: true }));
      window.__apex.park(0.1); window.__apex.freeze(false);
      window.__apex.jump(0.1, 0, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      let gear = 1, dash = 0, speed = 0;
      for (let b = 0; b < 20; b++) {
        window.__apex.setLap(1);
        window.__apex.jump(0.1, window.__apex.probe().speed, 0);
        window.__apex.step(1 / 60, 60);
        const o = window.__apex.obs();
        gear = Math.max(gear, o.gear); dash = Math.max(dash, o.dashKph);
        speed = Math.max(speed, o.speedKph);
      }
      window.__apex.clearInput();
      return { gear, dash, speed };
    }, paceSlider);

    const slow = await flatOut(6);    // 0.627
    const mid  = await flatOut(14);   // 1.000 — the vTop()/vStd() reference
    const fast = await flatOut(18);   // 1.262

    // The gearbox sweeps all the way up whatever the slider says...
    for (const e of [slow, mid, fast]) expect(e.gear).toBe(8);
    // ...and so does the dial. The approach to vmax has a pace-INDEPENDENT time
    // constant (ACCEL*PACE / (VMAX*PACE) cancels), so equal ticks means an equal
    // fraction of the envelope — these land within a fraction of a percent.
    const dashes = [slow.dash, mid.dash, fast.dash];
    expect(Math.min(...dashes)).toBeGreaterThan(Math.max(...dashes) * 0.95);
    // What the slider DOES change is real ground speed, by far more than that.
    expect(fast.speed).toBeGreaterThan(slow.speed * 1.5);
  });

  // The pace > 1 half of the same bug, and the worst of it: in MANUAL gears the
  // top-gear limiter clamped speedCap to gearHi(8) + 1.5 = 73.5 m/s, so a
  // manual-shifting player was pinned at ~264 km/h wherever the slider sat while
  // the auto/AI cars scaled past it. gearHi() tracks pace now.
  test("OVERALL SPEED clears the old top-gear limiter in MANUAL gears", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      // Desktop viewport => touchControlsNeeded() is false => gearsManual() goes
      // live as soon as the pause-menu toggle flips manualMode on.
      const btn = document.getElementById("pm-gears");
      if (!/MANUAL/.test(btn.textContent)) btn.click();
      const el = document.getElementById("pm-pace");
      el.value = "19"; el.dispatchEvent(new Event("input", { bubbles: true }));   // top of the grid, pace 1.338
      window.__apex.park(0.1); window.__apex.freeze(false);
      window.__apex.jump(0.1, 0, 0);
      // Shift up to top while STOPPED: in manual the box never picks its own gear,
      // and the limiter would dump a fast car back to first gear's ceiling.
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 10; i++) {          // 7 upshifts + slack; shiftT is 0.1 s
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
        window.__apex.step(1 / 60, 8);
      }
      // Now plant it just above the OLD clamp and hold the throttle. Before the
      // fix speedCap pinned this to 73.5 m/s on the very first tick.
      window.__apex.jump(0.1, 80, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let b = 0; b < 6; b++) {
        window.__apex.setLap(1);
        window.__apex.jump(0.1, window.__apex.probe().speed, 0);
        window.__apex.step(1 / 60, 30);
      }
      const out = { gear: window.__apex.obs().gear, speed: window.__apex.probe().speed };
      window.__apex.clearInput();
      return out;
    });
    expect(r.gear).toBe(8);
    // DERIVED FROM THE PIN IT RETIRES, not a fresh literal. The claim is "no
    // longer pinned at the old clamp", so the bound is the documented 73.5 pin
    // plus a clear margin — a bare 78 was a second absolute speed that would
    // drift with the driving model for reasons unrelated to the clamp.
    const OLD_CLAMP_PIN = 73.5;
    expect(r.speed).toBeGreaterThan(OLD_CLAMP_PIN + 3);
  });

  // The tilt INPUT sliders (TILT RANGE, STEER SMOOTHING) are covered by the wiring
  // tests above — each moves the exact live value (maxTilt / tiltCutoff) that the
  // tilt pipeline consumes in tiltSteering(). Tilt sensitivity is the single
  // MAX_TILT knob; the output gain is a fixed constant and the dead zone is fixed
  // small, so neither is a slider anymore. A full end-to-end tilt-input check
  // can't run headless (DeviceOrientationEvent is unavailable, so requestGyro()
  // never attaches the sensor listener).
});

// ---- simplified ("macro") default-view controls ----
// The default view shows a handful of plain-language controls that fan out to the
// granular store keys; these tests confirm the fan-out, the active-state mirroring,
// and the Advanced disclosure.
const click = (page, id) =>
  page.evaluate((id) => document.getElementById(id).click(), id);
const isActive = (page, id) =>
  page.evaluate((id) => document.getElementById(id).classList.contains("active"), id);
const num = async (page, key) => Number(await stored(page, key));

test.describe("Apex 26 — simplified controls", () => {
  test("STEERING levels fan out to the cornering keys and mirror active state", async ({ page }) => {
    await load(page);
    await click(page, "pm-steer-sim");
    expect(await num(page, "steerRate")).toBe(7);
    expect(await num(page, "steerLock")).toBe(7);
    expect(await num(page, "steerSpeed")).toBe(7);
    expect(await isActive(page, "pm-steer-sim")).toBe(true);
    expect(await isActive(page, "pm-steer-normal")).toBe(false);

    await click(page, "pm-steer-easy");
    expect(await num(page, "steerRate")).toBe(4);
    expect(await num(page, "steerSpeed")).toBe(4);
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
    // #adv-extra is a native <details> disclosure now — .open, not .hidden,
    // is the state that changes; the div never sets its own hidden attribute.
    const open = () => page.evaluate(() => document.getElementById("adv-details").open);
    expect(await open()).toBe(false);
    await click(page, "adv-more");
    expect(await open()).toBe(true);
    await click(page, "adv-more");
    expect(await open()).toBe(false);
  });

  test("editing a granular Advanced slider updates the simplified view", async ({ page }) => {
    await load(page);
    await click(page, "pm-preset-standard");
    expect(await isActive(page, "pm-steer-normal")).toBe(true);
    await setSlider(page, "pm-speedsteer", 8);   // nudge one cornering key off NORMAL
    expect(await isActive(page, "pm-steer-normal")).toBe(false);  // no longer a clean level
  });
});
