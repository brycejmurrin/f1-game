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
import { sharedTest as test, expect, BOOT_MS, resetSharedPage } from "../helpers/fixtures.js";
import { forgetStored } from "../helpers/shared-page.js";

/* DOM CLICKS, NOT locator.click(), AND THE REASON IS THE FRAME CLOCK.
   Playwright's actionability poll ticks on requestAnimationFrame, and this
   page's rAF collapses to ~2 frames/s under SwiftShader while the track and
   twenty cars build (playwright.config.js records the same measurement from
   the other direction). A locator click on #rs-go therefore spent its whole
   60 s actionTimeout waiting for "stable" on a button that had been ready from
   the moment it appeared -- every test in this file failed that way, and the
   call log says only "locator resolved to <button id=rs-go>" with no assertion
   to point at. Reproduced at --workers=1 on an idle box, so it is not
   contention; it is the frame clock the poll rides on.
   `.click()` through page.evaluate dispatches the same activation without the
   actionability wait. It is the idiom the rest of the suite already uses
   (gamepad, menu-keyboard, menu-baseline, quali, ui-redesign, shared-page), and
   each step still WAITS for the screen it asked for, so nothing races. */
/* ONE BOOT PER WORKER, not one per test. Each test here needs a live race, and
   paying the menu walk plus twenty car builds thirteen times is what pushed
   every test in this file past the 120 s budget on a SwiftShader box — the
   measured cost is ~20 s per page.evaluate and 30-90 s for the build alone
   (docs/TESTING.md: "CI has been measured taking 94 s just to boot a race on a
   starved runner"). sharedTest keeps one page per worker and resets input,
   camera and freeze between tests, which is all the isolation a spec that
   re-places the car with jump() on every run actually needs. */
async function startLiveRace(page) {
  // Empty the AI field: these cases measure the player's line alone. A packed
  // grid turns a held-lock slide into contact/rescue noise (CI 36649674195).
  const clearField = () => page.evaluate(() => {
    window.__apex.go();
    try { window.__apex.rivals([]); } catch (_) { /* older builds */ }
  });
  // The on-track window recipe is measured on bahrain. A shared worker that
  // previously raced another circuit (car-effects uses monza) must re-race —
  // reusing "any live track" left Monza loaded and held lock left the road
  // (CI 37082214838 / 37080085921: held.x 7.567 vs hw−0.5 6.3).
  const track = await page.evaluate(() => {
    try {
      const i = window.__apex && window.__apex.info();
      return i && i.track != null ? i.track : null;
    } catch (_) { return null; }
  });
  if (track === "bahrain") { await clearField(); return; }
  if (track != null) {
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(
      () => window.__apex && window.__apex.info().track === "bahrain",
      null, { polling: 100, timeout: BOOT_MS }
    );
    await clearField();
    return;
  }
  await page.goto("/");
  // Wait for boot BEFORE #mb-race: the click is a bare evaluate with no
  // actionability poll, so firing it before the title handlers attach leaves
  // the page on title and show("select") times out. CI #36646165077 on
  // 70b848ce9 failed three steering cases that way once select-specs pulled
  // this file in (Input.ready latch harden). Smoke / gamepad prove the same
  // #mb-race → #select path when they wait for __apex first.
  await page.waitForFunction(
    () => window.__apex != null && !!document.getElementById("mb-race"),
    null, { polling: 100, timeout: BOOT_MS }
  );
  const show = (id) => page.waitForFunction(
    (n) => { const el = document.getElementById(n); return !!el && !el.hidden; },
    id, { polling: 100, timeout: 30_000 }
  );
  await page.evaluate(() => document.getElementById("mb-race").click());
  await show("select");
  await page.evaluate(() => document.getElementById("sel-go").click());
  await show("race-settings");
  await page.evaluate(() => document.getElementById("rs-go").click());
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track === "bahrain",
    null, { polling: 100, timeout: BOOT_MS }
  );
  await clearField();
}

/* THIS FILE COSTS MORE THAN THE PROJECT DEFAULT ALLOWS, and says so here
   rather than letting every test report "Test timeout of 120000ms exceeded"
   with no clue which step was slow.
   Every test needs a LIVE race - the real sim, twenty cars built, the physics
   stepped - and under SwiftShader a single page.evaluate against it measures
   20-28 s while the build alone takes 30-90 s. playwright.config.js's own note
   asks that a case needing materially more than the shared budget declare it
   at its own site; this is that declaration. It does NOT paper over a hang:
   actionTimeout stays 60 s, so a stuck locator still fails in a minute.
   Was 480 s when road-follow alone measured 343.5 s (assist leak across
   sharedTest). After shared-page assist reset (#564) the whole file is ~32 s
   wall locally (heaviest case 8.3 s, 2026-09-30); 170 s is the re-time so
   select-specs can bill the file under the 180 s selected gate. */
test.describe.configure({ timeout: 170_000 });

const probe = (page) => page.evaluate(() => window.__apex.probe());

// Place the player, hold the given input for `ticks` physics frames, return the
// before/after probes. dt is fixed at 1/60 s. throttle defaults off so speed
// stays close to the value we jumped in at (no acceleration ramp).
// ONE EVALUATE: a multi-evaluate jump/settle/step/probe chain lets the page's
// frame loop insert uncounted ticks between CDP round-trips (DEFECT-LEDGER
// 2026-09-22 item 2; symmetry case CI 36817162914). Pair with freeze(true) for
// recipes that assert an absolute on-track window.
async function run(page, { frac, speed = 30, steer = 0, throttle = false, brake = false, settle = 3, ticks = 90 }) {
  return page.evaluate((f) => {
    window.__apex.jump(f.frac, f.speed, 0);
    window.__apex.setInput({ steer: 0, throttle: f.throttle, brake: f.brake });
    window.__apex.step(1 / 60, f.settle);
    const before = window.__apex.probe();
    window.__apex.setInput({ steer: f.steer, throttle: f.throttle, brake: f.brake });
    window.__apex.step(1 / 60, f.ticks);
    window.__apex.clearInput();
    const after = window.__apex.probe();
    return { before, after };
  }, { frac, speed, steer, throttle, brake, settle, ticks });
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

// Park every AI car half a lap ahead so a packed shared-page race cannot shove
// the measured line while step() advances the whole field (CI 37088930611).
async function parkField(page, frac) {
  await page.evaluate((f) => {
    const n = window.__apex.carState().length;
    for (let i = 0; i < n; i++) window.__apex.aiPlace(i, f + 0.5 + i * 0.004, 0, 0);
  }, frac);
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

// A reasonably straight stretch: minimise INTEGRATED zero-steer yaw drift over
// the same window the symmetry case measures (6 ticks @ 30 m/s), not just the
// instantaneous |k| at the jump. Instantaneous |k| can still leave a signed
// heading creep that eats into the 15 % bound once left/right are compared.
async function findStraight(page, { speed = 30, settle = 3, ticks = 6 } = {}) {
  return page.evaluate(({ speed, settle, ticks }) => {
    let best = 0, bestDrift = Infinity, bestK = Infinity;
    for (let i = 0; i < 100; i++) {
      const f = i / 100;
      window.__apex.jump(f, speed, 0);
      window.__apex.setInput({ steer: 0, throttle: false, brake: false });
      window.__apex.step(1 / 60, settle);
      const before = window.__apex.probe();
      window.__apex.step(1 / 60, ticks);
      const after = window.__apex.probe();
      window.__apex.clearInput();
      const drift = Math.abs(after.angle - before.angle);
      const k = Math.abs(before.k);
      if (drift < bestDrift || (drift === bestDrift && k < bestK)) {
        bestDrift = drift; bestK = k; best = f;
      }
    }
    return { frac: best, k: bestK, drift: bestDrift };
  }, { speed, settle, ticks });
}

test.describe("Apex 26 — steering", () => {
  // SHARED-PAGE ISOLATION (2026-09-30). sharedTest keeps ONE page per worker;
  // a test that leaves ROAD_FOLLOW or the racing-line slider non-zero used to
  // poison every later case on that worker (DEFECT-LEDGER 2026-09-22: wrong
  // restore of roadFollow to 0.7). resetSharedPage is what the fixture runs
  // between tests — this case calls it after a deliberate leak so the assert
  // would fail if the helper stopped restoring the shipped defaults.
  test("shared-page reset restores shipped assist defaults after a deliberate leak", async ({ page }) => {
    await startLiveRace(page);
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0.7 }));
    await setRaceLine(page, 5);
    expect(await page.evaluate(() => window.__apex.tuning().roadFollow)).toBe(0.7);
    expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBeGreaterThan(0);
    await resetSharedPage(page);
    expect(await page.evaluate(() => window.__apex.tuning().roadFollow)).toBe(0);
    expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBe(0);
  });

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
    // Isolate the DRIVER's authority from the DRIVING-HELP assist: with the
    // assist off, held lock toward the INSIDE must move the car clearly further
    // inward than coasting (which runs wide) — proving manual steering fights
    // the curvature drift. Under the measured convention +k = LEFT turn, so
    // inside is -sign(k) and outside is +sign(k) (file header; road-follow
    // sibling). lockDir = +sign(k) was a sign bug that steered further out and
    // saturated the wall (DEFECT-LEDGER 2026-09-22; CI 37082214838 on monza
    // inheritance: held.after.x 7.567 vs hw−0.5 = 6.3).
    //
    // ON-TRACK WINDOW. At the old 22 m/s × 75 ticks even coasting can leave the
    // road; 18 m/s × 55 ticks was enough until tip scenery/elevation moved
    // Bahrain's first corner (CI 38031749839: coast |x|=6.53 vs hw−0.5=6.5).
    // 16 m/s × 45 ticks keeps BOTH runs inside |x| < hw − 0.5 while still
    // clearing the 2 m authority bar.
    //
    // FROZEN + ONE EVALUATE: corner pick + both bursts share one frozen
    // evaluate so exactly 3 + 55 ticks run per arm (no page-loop ticks between
    // CDP round-trips). Assertions unchanged.
    await page.evaluate(() => {
      window.__apex.setPhysics({ roadFollow: 0 });
      window.__apex.freeze(true);
    });
    let measured;
    try {
      measured = await page.evaluate(() => {
        const corners = window.__apex.corners();
        let frac = corners[0], k0 = 0;
        for (const f of corners) {
          window.__apex.jump(f, 24, 0);
          const p = window.__apex.probe();
          if (Math.abs(p.k) > 0.02) { frac = f; k0 = p.k; break; }
        }
        if (Math.abs(k0) <= 0.02) return { ok: false, k0 };
        const lockDir = -Math.sign(k0); // inside — fight the curvature drift
        const burst = (steer) => {
          window.__apex.jump(frac, 16, 0);
          window.__apex.setInput({ steer: 0, throttle: false, brake: false });
          window.__apex.step(1 / 60, 3);
          const before = window.__apex.probe();
          window.__apex.setInput({ steer, throttle: false, brake: false });
          window.__apex.step(1 / 60, 45);
          window.__apex.clearInput();
          return { before, after: window.__apex.probe() };
        };
        return { ok: true, k0, lockDir, zero: burst(0), held: burst(lockDir) };
      });
    } finally {
      await page.evaluate(() => { window.__apex.freeze(false); window.__apex.setPhysics({ roadFollow: 0 }); });
    }

    expect(measured.ok).toBe(true);
    expect(Math.abs(measured.k0)).toBeGreaterThan(0.02);
    const { zero, held, lockDir } = measured;
    const dxZero = zero.after.x - zero.before.x;
    const dxHeld = held.after.x - held.before.x;   // should be far more toward lockDir
    expect(Math.abs(held.after.x)).toBeLessThan(held.before.hw - 0.5); // still on track
    expect(Math.abs(zero.after.x)).toBeLessThan(zero.before.hw - 0.5);
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
    // Assists add a signed bias that does not flip with steer; pin them off
    // so the comparison is left/right input alone (sharedTest reset is shallow).
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
    await setRaceLine(page, 0);
    const { frac } = await findStraight(page);

    // FROZEN + ONE EVALUATE (same class as the authority recipe). Residual
    // track curvature adds the SAME signed drift to both directions — subtract
    // a zero-steer control so the 15 % bound measures input symmetry, not the
    // straight's leftover k (CI 36807856916: |aR+aL|=0.016 vs max*0.15=0.012).
    // Without freeze, run()'s multi-evaluate gaps let the page loop insert
    // uncounted ticks; on a loaded selected shard left and right see different
    // extras and zero-steer alone is not enough (CI 36817162914: |aR+aL|=0.017
    // vs 0.15·max=0.011 AFTER that subtraction). Bound unchanged.
    await page.evaluate(() => window.__apex.freeze(true));
    let measured;
    try {
      measured = await page.evaluate((f) => {
        const burst = (steer) => {
          window.__apex.jump(f, 30, 0);
          window.__apex.setInput({ steer: 0, throttle: false, brake: false });
          window.__apex.step(1 / 60, 3);
          const before = window.__apex.probe().angle;
          window.__apex.setInput({ steer, throttle: false, brake: false });
          window.__apex.step(1 / 60, 6);
          window.__apex.clearInput();
          return window.__apex.probe().angle - before;
        };
        const a0 = burst(0);
        return { aR: burst(1) - a0, aL: burst(-1) - a0 };
      }, frac);
    } finally {
      await page.evaluate(() => {
        window.__apex.freeze(false);
        window.__apex.setPhysics({ roadFollow: 0 });
      });
    }

    expect(measured.aR).toBeGreaterThan(0);
    expect(measured.aL).toBeLessThan(0);
    // Within 15 % of each other.
    expect(Math.abs(measured.aR + measured.aL)).toBeLessThan(Math.max(measured.aR, -measured.aL) * 0.15);
  });

  test("racing-line assist off by default", async ({ page }) => {
    await startLiveRace(page);
    /* ESTABLISH THE DEFAULT, do not assume it. On a worker-scoped page an
       earlier test's setRaceLine() is still in the store, so "the store is
       empty" stopped being true the moment this file started sharing a boot.
       Assert the two halves separately and honestly:
         1. with the key GONE (forgetStored drops it AND GameStore's cached
            copy - a bare removeItem leaves the game answering from memory)
            the stored default really is 0; and
         2. the LIVE assist is 0, which is what the physics below depends on.
       game.js keeps applySteerTuning in its own closure, so the only way to
       push a store value into the running sim is the slider's own handler,
       which is what setRaceLine is. */
    await forgetStored(page, ["raceLine"]);
    const storedDefault = await page.evaluate(() => GameStore.store.get("raceLine", 0));
    expect(storedDefault).toBe(0);
    await setRaceLine(page, 0);
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
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
    // FROZEN + ONE EVALUATE (same class as the symmetry recipe). Bound stays
    // 0.5 m — without freeze, run()'s multi-evaluate gaps let the page loop
    // insert uncounted ticks between the two identical bursts (CI 36830854397:
    // |Δdx|=0.533 vs 0.5 on llvmpipe selected).
    await page.evaluate(() => window.__apex.freeze(true));
    let deltaDx;
    try {
      deltaDx = await page.evaluate((f) => {
        const park = () => {
          const n = window.__apex.carState().length;
          for (let i = 0; i < n; i++) window.__apex.aiPlace(i, f + 0.5 + i * 0.004, 0, 0);
        };
        const burst = () => {
          park();
          window.__apex.jump(f, 16, 0);
          window.__apex.setInput({ steer: 0, throttle: false, brake: false });
          window.__apex.step(1 / 60, 3);
          const before = window.__apex.probe().x;
          window.__apex.setInput({ steer: 0, throttle: false, brake: false });
          window.__apex.step(1 / 60, 60);
          window.__apex.clearInput();
          return window.__apex.probe().x - before;
        };
        return Math.abs(burst() - burst());
      }, frac);
    } finally {
      await page.evaluate(() => {
        window.__apex.freeze(false);
        window.__apex.setPhysics({ roadFollow: 0 });
      });
    }
    expect(deltaDx).toBeLessThan(0.5);
  });

  test("racing-line assist: PULL eases toward the line, PUSH sends it wider", async ({ page }) => {
    await startLiveRace(page);
    // Assists other than the racing-line slider must stay off: roadFollow
    // compounds the line, and without freeze run()'s multi-evaluate gaps let
    // the page loop drive the car into the verge where offAssistFade crushes
    // PUSH (CI 36943859283: (dxPush-dxOff)*inside = -0.1275 vs -0.2; apex-state
    // x≈-8.1). Same freeze + roadFollow:0 isolation as the sibling cases.
    await page.evaluate(() => window.__apex.setPhysics({ roadFollow: 0 }));
    const { frac, k } = await firstCorner(page);
    expect(Math.abs(k)).toBeGreaterThan(0.02);

    await page.evaluate(() => window.__apex.freeze(true));
    let off, pull, push;
    try {
      // Tip Bahrain T1 (post live-scenery / elevation) throws a 24 m/s × 60
      // tick coast into the verge where rescue zeros the PULL/PUSH delta
      // (CI 38031749839: (dxPull-dxOff)*toward ≈ -0.018). Shorter slower
      // bursts keep the car on the asphalt long enough for the assist to show.
      await setRaceLine(page, 0);
      expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBe(0);
      await parkField(page, frac);
      off = await run(page, { frac, speed: 18, steer: 0, ticks: 45 });
      await setRaceLine(page, 5);
      expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBe(1);
      await parkField(page, frac);
      pull = await run(page, { frac, speed: 18, steer: 0, ticks: 45 });
      await setRaceLine(page, -5);
      expect(await page.evaluate(() => window.__apex.tuning().raceLineAssist)).toBe(-1);
      await parkField(page, frac);
      push = await run(page, { frac, speed: 18, steer: 0, ticks: 45 });
      await setRaceLine(page, 0); // restore
    } finally {
      await page.evaluate(() => {
        window.__apex.freeze(false);
        window.__apex.setPhysics({ roadFollow: 0 });
      });
    }

    const dxOff = off.after.x - off.before.x;
    const dxPull = pull.after.x - pull.before.x;
    const dxPush = push.after.x - push.before.x;
    // TOWARD THE LINE, not toward -sign(k): the assist pursues the AI line
    // 25-90 m ahead, and at a curvature peak that is already the track-out
    // when the corner is short. #878 moved Bahrain's start line (startFrac
    // 0.225 -> 0), so corners() now leads with the T1 hairpin apex, where the
    // target sits 4 m OUTSIDE and PULL correctly moved the car out (-1.395).
    const gap = off.before.lineAhead - off.before.x;
    expect(Math.abs(gap)).toBeGreaterThan(1);   // premise: the line is off the car
    const toward = Math.sign(gap);
    // PULL ends up clearly nearer the line than no assist...
    expect((dxPull - dxOff) * toward).toBeGreaterThan(0.5);
    // ...and PUSH clearly further from it.
    expect((dxPush - dxOff) * toward).toBeLessThan(-0.2);
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
    // Input.ready(), not bare Input: the façade exists at input.js eval, before
    // init() wires onKey. Same boot-race class as CI #6199 / touch-pedals.
    await page.waitForFunction(
      () => window.__apex != null && typeof Input !== "undefined" && Input.ready && Input.ready(),
      null, { polling: 100, timeout: BOOT_MS });
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
    // wireHold attaches in init(); Input.ready() is the gate (CI #6199 class).
    await page.waitForFunction(
      () => window.__apex != null && typeof Input !== "undefined" && Input.ready && Input.ready(),
      null, { polling: 100, timeout: BOOT_MS });
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
    await page.waitForFunction(
      () => window.__apex != null && typeof Input !== "undefined" && Input.ready && Input.ready(),
      null, { polling: 100, timeout: BOOT_MS });
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
    await page.waitForFunction(
      () => window.__apex != null && typeof Input !== "undefined" && Input.ready && Input.ready(),
      null, { polling: 100, timeout: BOOT_MS });
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
