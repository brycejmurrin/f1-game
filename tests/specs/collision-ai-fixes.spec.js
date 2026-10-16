// @ts-check
// Regression tests for the June 2026 collision / AI / physics bug-fix audit.
// Each test targets a specific bug that was identified and fixed; failing tests
// here indicate a regression to the patched behaviour.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

// BOOT_MS, not a hand-rolled 8/10 s: a SwiftShader boot here measures 11-33 s
// (boot-guard specs, 2026-09-01) and the short waits failed 9 of 33 tests solo.
async function loadRace(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.jump(0.1, 40, 0));
  await page.waitForTimeout(100);
}

// ── Wrong-way detection (Bug #8 & #9) ────────────────────────────────────────
// Bug #8: threshold was 8 m/s — a slow reverse crawl to recover would trip it.
// Bug #9: no hysteresis — flag oscillated near the boundary.

test.describe("wrong-way detection thresholds", () => {
  test.use({ viewport: LANDSCAPE });

  test("slow reverse crawl below 15 m/s does not trigger wrong-way", async ({ page }) => {
    await loadRace(page);
    const wrongWay = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 0, 0);
      window.__apex.aim(180);   // face backwards along track
      // Accelerate gently — speed stays below 15 m/s for the test window
      for (let i = 0; i < 50; i++) {
        const obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (obs.speed > 13) break;   // cap well below 15 threshold
      }
      window.__apex.headless(false);
      return window.__apex.physState().wrongWay;
    });
    expect(wrongWay).toBe(false);
  });

  test("sustained backward driving at >15 m/s sets wrong-way within 0.6 s", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 25, 0);  // 25 m/s > threshold
      window.__apex.aim(180);           // now heading backwards
      let triggered = false, frames = 0;
      for (let i = 0; i < 60; i++) {   // 1 s window
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        frames++;
        if (window.__apex.physState().wrongWay) { triggered = true; break; }
      }
      window.__apex.headless(false);
      return { triggered, frames };
    });
    expect(result.triggered).toBe(true);
    expect(result.frames).toBeLessThanOrEqual(40);  // must fire well within 1 s
  });

  test("wrong-way clears within 0.5 s after car faces correct direction (hysteresis)", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Establish wrong-way state
      window.__apex.reset(0.3, 25, 0);
      window.__apex.aim(180);
      for (let i = 0; i < 50; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (window.__apex.physState().wrongWay) break;
      }
      const wasWrongWay = window.__apex.physState().wrongWay;
      // Turn around and drive forward — flag should clear within 0.5 s (30 frames)
      window.__apex.aim(0);
      let cleared = false;
      for (let i = 0; i < 35; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (!window.__apex.physState().wrongWay) { cleared = true; break; }
      }
      window.__apex.headless(false);
      return { wasWrongWay, cleared };
    });
    expect(result.wasWrongWay).toBe(true);
    expect(result.cleared).toBe(true);
  });

  test("obs().done is true when wrong-way is active", async ({ page }) => {
    await loadRace(page);
    const done = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 25, 0);
      window.__apex.aim(180);
      let obs;
      for (let i = 0; i < 80; i++) {
        obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (obs.wrongWay) break;
      }
      window.__apex.headless(false);
      return obs.done;
    });
    expect(done).toBe(true);
  });
});

// ── Wall contact on non-street circuits (Bug #11) ────────────────────────────
// Bug: wallT (auto-throttle suppression) was gated behind if(track.street),
// so barrier contact on Monza/Silverstone etc. left cars pinned with no penalty.
// wallT is not directly exposed; we test via the speed-scrub side-effect:
// when pinned against a barrier and steering into it, c.speed decreases.

test.describe("wall contact penalty on open circuits", () => {
  test.use({ viewport: LANDSCAPE });

  test("speed is scrubbed when pinned against Monza barrier (pushIn penalty)", async ({ page }) => {
    await loadRace(page, "monza");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // One coasting episode: same start frac, same 20 m/s, same 10 ticks.
      const run = (lateralOf, steer) => {
        const obs0 = window.__apex.reset(0.05, 20, 0);
        window.__apex.jump(0.05, 20, lateralOf(obs0));
        let speed = 20;
        for (let i = 0; i < 10; i++) {
          const o = window.__apex.act({ steer, throttle: false, brake: false }, 1 / 60, 1);
          speed = o.speed;
        }
        return speed;
      };
      // Control: lane centre, steering straight — decays by coasting drag alone.
      const control = run(() => 0, 0);
      // Wall run: pinned past the right barrier, steering hard into it — decays
      // by the same drag PLUS the pushIn wall scrub this test exists to catch.
      const scrubbed = run((o) => o.wallR + 0.8, 1.0);
      window.__apex.headless(false);
      return { control, scrubbed };
    });
    // Anti-vacuity: the control run stayed a coasting run (drag alone cannot
    // eat a quarter of 20 m/s in 10 ticks; if it did, the margin below would
    // be measuring the wrong thing).
    expect(result.control).toBeGreaterThan(15);
    // The open-circuit pushIn scrub is pushIn * 16 m/s^2 (game.js updateCar),
    // so 10 ticks at full lock removes ~16 * 10/60 = 2.7 m/s beyond what the
    // control loses. Margin 1.0 m/s: well under the ~2.7 the scrub must
    // deliver (no false failure on retunes), well above drag/slip noise —
    // coasting drag alone (the old test's only discriminator) cannot produce
    // it, which is exactly what the control run makes this assert prove.
    expect(result.scrubbed).toBeLessThan(result.control - 1.0);
  });

  test("a car wedged against the barrier is auto-rescued back onto the track", async ({ page }) => {
    await loadRace(page, "monza");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Auto-rescue only fires when the car is stuck AND THROTTLE IS HELD — a
      // driver who lets off the gas is deliberately never rescued (the
      // `stoppedOnTrack = onThrottle && ...` guard in game.js updateCar). This
      // wedges the car against the right barrier and holds throttle + full steer
      // INTO the wall so it can't drive out; rescue must snap it back onto the
      // track within the window. (The old test drove with throttle:false and a
      // second open-track scenario — neither is a valid stuck state under the
      // current throttle-gated rescue, so both silently never fired.)
      window.__apex.reset(0.05, 0, 0);
      const obs0 = window.__apex.obs();
      window.__apex.jump(0.05, 0, obs0.wallR + 0.2);   // pinned against the right wall
      let rescuedX = null, rescueFrame = -1;
      for (let i = 0; i < 420; i++) {  // 7 s window
        window.__apex.act({ steer: 1.0, throttle: true, brake: false }, 1 / 60, 1);
        const x = window.__apex.probe().x;
        if (x < obs0.wallR - 3) { rescuedX = +x.toFixed(1); rescueFrame = i; break; }  // snapped back inboard
      }
      window.__apex.headless(false);
      return { rescueFrame, rescuedX, wallR: +obs0.wallR.toFixed(1) };
    });
    // Rescue fired (car moved well inboard of the wall it was pinned against).
    expect(result.rescueFrame).toBeGreaterThan(0);
    expect(result.rescuedX).toBeLessThan(result.wallR - 3);
  });
});

// ── rescueLastT reset in gridUp (Bug #7) ─────────────────────────────────────
// Bug: gridUp() did not initialise c.rescueLastT, so after a rescue the old
// timestamp blocked re-rescue for 4 s post-reset (raceT resets to 0 but
// rescueLastT stayed at the previous rescue time, making grace = true).

test.describe("rescue cooldown reset", () => {
  test.use({ viewport: LANDSCAPE });

  test("reset() clears rescue grace so a second rescue fires within the window", async ({ page }) => {
    await loadRace(page, "monza");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Wedge against the barrier with throttle held — the only valid stuck state
      // (rescue is throttle-gated; a car that lets off gas is never rescued). The
      // old test drove throttle:false in both episodes, so NO rescue ever fired
      // and it couldn't actually exercise the grace-period reset (Bug #7).
      const wedgeUntilRescue = () => {
        const o = window.__apex.obs();
        window.__apex.jump(0.05, 0, o.wallR + 0.2);
        for (let i = 0; i < 420; i++) {
          window.__apex.act({ steer: 1.0, throttle: true, brake: false }, 1 / 60, 1);
          if (window.__apex.probe().x < o.wallR - 3) return i;   // rescued back inboard
        }
        return -1;
      };
      // Episode 1: a rescue happens (sets rescueLastT).
      window.__apex.reset(0.05, 0, 0);
      const first = wedgeUntilRescue();
      // reset() must clear rescueLastT so the 4 s post-rescue grace doesn't carry
      // over and block the next episode's rescue.
      window.__apex.reset(0.05, 0, 0);
      const second = wedgeUntilRescue();
      window.__apex.headless(false);
      return { first, second };
    });
    // Both episodes rescue — the second proves reset() cleared the grace period.
    expect(result.first).toBeGreaterThan(0);
    expect(result.second).toBeGreaterThan(0);
  });
});

// ── Rear-end collision contactT (Bug #3) ─────────────────────────────────────
// Bug: contactT was only set in the side-rub branch; rear-end contacts left
// both cars with contactT=0 so AI did not ease off steering after a hit.

test.describe("rear-end collision contactT", () => {
  test.use({ viewport: LANDSCAPE });

  test("rear-end collision sets contactT on both cars", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Place player at 20 m/s; rival 0.5 m behind going 30 m/s (closing fast)
      window.__apex.reset(0.3, 20, 0);
      const r = window.__apex.rival(-0.5, 0);
      if (!r) return null;
      const rivalIdx = r.rival;
      // Step a few frames for the rear-end contact to be detected
      for (let i = 0; i < 6; i++) {
        window.__apex.act({ steer: 0, throttle: false, brake: false }, 1 / 60, 1);
      }
      const cars = window.__apex.cars();
      const playerCar = cars.find((c) => c.p);
      const rivalCar  = cars[rivalIdx];
      window.__apex.headless(false);
      return {
        playerCt: playerCar ? playerCar.ct : -1,
        rivalCt:  rivalCar  ? rivalCar.ct  : -1,
      };
    });
    expect(result).not.toBeNull();
    // Both cars should register contact
    expect(result.playerCt).toBeGreaterThan(0);
    expect(result.rivalCt).toBeGreaterThan(0);
  });
});

// ── Separation window (Bug #2) ───────────────────────────────────────────────
// Bug: separation pass used j <= i+6, so packs of >6 cars could have
// unresolved penetrations that caused jitter / exploding positions.

test.describe("separation pass with large packs", () => {
  test.use({ viewport: LANDSCAPE });

  test("10-car pack digs out within 5 s — no NaN positions", async ({ page }) => {
    await loadRace(page);
    const ok = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.jam(10);   // stack 10 cars at the same point
      for (let i = 0; i < 300; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
      }
      window.__apex.headless(false);
      const cars = window.__apex.cars();
      return cars.every((c) => isFinite(c.x) && isFinite(c.prog) && isFinite(c.speed));
    });
    expect(ok).toBe(true);
  });

  test("10-car pack reaches >10 m/s average speed within 5 s", async ({ page }) => {
    await loadRace(page);
    const avgSpeed = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.jam(10);
      for (let i = 0; i < 300; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
      }
      window.__apex.headless(false);
      const cars = window.__apex.cars();
      return cars.reduce((s, c) => s + c.speed, 0) / cars.length;
    });
    expect(avgSpeed).toBeGreaterThan(10);
  });
});

// ── AI banking grip (elevation audit Bug #1) ─────────────────────────────────
// Bug: bankMu was computed inside the player-only block; AI cars had flat
// lateral grip through banked corners (Zandvoort, Madrid).

test.describe("AI banking grip on banked circuits", () => {
  test.use({ viewport: LANDSCAPE });

  test("AI carry banked-corner speed comparable to a flat straight (banking grip applies to AI)", async ({ page }) => {
    // Regression for the bug where bankMu was player-only, so AI had FLAT lateral
    // grip in banked corners and scrubbed speed there. Relative check (no magic
    // 30 m/s): AI average speed through the banked section must be a healthy
    // fraction of the average speed they build on a flat straight — proving the
    // bank isn't collapsing their grip. Survives any PACE/grip retune.
    await loadRace(page, "zandvoort");
    const result = await page.evaluate(() => {
      const runAvg = (frac) => {
        window.__apex.headless(true);
        window.__apex.reset(frac, 20, 0);
        for (let i = 0; i < 480; i++) window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        window.__apex.headless(false);
        const ai = window.__apex.cars().filter((c) => !c.p);
        return {
          avg: ai.reduce((s, c) => s + c.speed, 0) / (ai.length || 1),
          finite: window.__apex.cars().every((c) => isFinite(c.x) && isFinite(c.speed)),
        };
      };
      const flat   = runAvg(0.0);    // start/finish straight — the grip reference
      const banked = runAvg(0.65);   // Arie Luyendijk banked turn (~0.65–0.75)
      return { flat: flat.avg, banked: banked.avg, allFinite: flat.finite && banked.finite };
    });
    expect(result.allFinite).toBe(true);
    // AI hold at least half their flat-straight pace through the bank. With the
    // bug (flat grip) they'd understeer wide and scrub far more than that.
    expect(result.banked).toBeGreaterThan(result.flat * 0.5);
  });

  test("player with racing-line assist stays on banked Zandvoort section", async ({ page }) => {
    await loadRace(page, "zandvoort");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.65, 30, 0);  // enter banking at moderate speed
      let obs;
      let minClearR = Infinity, minClearL = Infinity;
      for (let i = 0; i < 240; i++) {  // 4 s
        obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        minClearR = Math.min(minClearR, obs.clearR);
        minClearL = Math.min(minClearL, obs.clearL);
      }
      window.__apex.headless(false);
      return { hw: obs.hw, minClearR, minClearL, speed: obs.speed };
    });
    // Car should not be off-track (clearances may go negative if on kerbs but not deeply off)
    expect(result.minClearR).toBeGreaterThan(-3);  // at most 3 m past right edge
    expect(result.minClearL).toBeGreaterThan(-3);  // at most 3 m past left edge
    expect(result.speed).toBeGreaterThan(5);       // not stopped
  });
});

// ── Jeddah barrier physics (barrier audit) ───────────────────────────────────
// Bug: Jeddah's custom addBox barrier panels were not registered with
// recordBarrier. The migrated wall clearance must keep the physics boundary
// aligned with the visible wall after curved-panel road intrusions are removed.

test.describe("Jeddah barrier physics matches visual placement", () => {
  test.use({ viewport: LANDSCAPE });

  test("Jeddah wallAt() matches the migrated visual wall clearance", async ({ page }) => {
    await loadRace(page, "jeddah");
    const result = await page.evaluate(() => {
      const obs = window.__apex.reset(0.1, 0, 0);
      const barrierGap = Tracks.LIST.find((entry) => entry.id === "jeddah").barrierGap;
      return { hw: obs.hw, wallR: obs.wallR, barrierGap };
    });
    expect(result.barrierGap).toBe(3.4);
    expect(result.wallR).toBeCloseTo(result.hw + result.barrierGap - 1.1, 1);
  });

  test("car cannot drive past the migrated Jeddah barrier face", async ({ page }) => {
    await loadRace(page, "jeddah");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      const obs0 = window.__apex.reset(0.1, 20, 0);
      const hw = obs0.hw;
      const barrierGap = Tracks.LIST.find((entry) => entry.id === "jeddah").barrierGap;
      window.__apex.jump(0.1, 20, hw + barrierGap + 0.4);
      window.__apex.act({ steer: 1, throttle: false, brake: false }, 1 / 60, 3);
      window.__apex.headless(false);
      const obs = window.__apex.obs();
      return { x: obs.x, hw, barrierGap };
    });
    expect(result.x).toBeLessThan(result.hw + result.barrierGap);
  });
});
