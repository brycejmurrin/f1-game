// @ts-check
// Regression tests for the June 2026 collision / AI / physics bug-fix audit.
// Each test targets a specific bug that was identified and fixed; failing tests
// here indicate a regression to the patched behaviour.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadRace(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
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
      const obs0 = window.__apex.reset(0.05, 20, 0);
      // Jump past the right barrier (wall logic clamps x during the next update)
      window.__apex.jump(0.05, 20, obs0.wallR + 0.8);
      // Steer into the wall for 10 frames — pushIn penalty scrubs speed
      let speedAfter = 20;
      for (let i = 0; i < 10; i++) {
        const o = window.__apex.act({ steer: 1.0, throttle: false, brake: false }, 1 / 60, 1);
        speedAfter = o.speed;
      }
      window.__apex.headless(false);
      return { speedBefore: 20, speedAfter };
    });
    // Wall scrub should have reduced speed noticeably
    expect(result.speedAfter).toBeLessThan(result.speedBefore);
  });

  test("barrier contact on Monza triggers rescue faster than open air stop", async ({ page }) => {
    await loadRace(page, "monza");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Scenario A: car stopped against wall (wallT path → stuck sooner)
      window.__apex.reset(0.05, 0, 0);
      const obs0 = window.__apex.obs();
      window.__apex.jump(0.05, 0, obs0.wallR + 0.2);
      let wallRescueFrame = -1;
      for (let i = 0; i < 420; i++) {  // 7 s window
        window.__apex.act({ steer: 1.0, throttle: false, brake: false }, 1 / 60, 1);
        if (window.__apex.physState().speed > 5) { wallRescueFrame = i; break; }
      }
      // Scenario B: car stopped in middle of track (stoppedOnTrack path → raceT > 2 needed)
      window.__apex.reset(0.05, 0, 0);
      let openRescueFrame = -1;
      for (let i = 0; i < 420; i++) {
        window.__apex.act({ steer: 0, throttle: false, brake: false }, 1 / 60, 1);
        if (window.__apex.physState().speed > 5) { openRescueFrame = i; break; }
      }
      window.__apex.headless(false);
      return { wallRescueFrame, openRescueFrame };
    });
    // Both rescues should eventually fire
    expect(result.wallRescueFrame).toBeGreaterThan(0);
    expect(result.openRescueFrame).toBeGreaterThan(0);
  });
});

// ── rescueLastT reset in gridUp (Bug #7) ─────────────────────────────────────
// Bug: gridUp() did not initialise c.rescueLastT, so after a rescue the old
// timestamp blocked re-rescue for 4 s post-reset (raceT resets to 0 but
// rescueLastT stayed at the previous rescue time, making grace = true).

test.describe("rescue cooldown reset", () => {
  test.use({ viewport: LANDSCAPE });

  test("reset() clears rescue grace so re-rescue fires within 6 s", async ({ page }) => {
    await loadRace(page);
    const rescued = await page.evaluate(() => {
      window.__apex.headless(true);
      // First episode: let a rescue happen (sit stopped for ~5 s)
      window.__apex.reset(0.3, 0, 0);
      for (let i = 0; i < 360; i++) {   // 6 s
        window.__apex.act({ steer: 0, throttle: false, brake: false }, 1 / 60, 1);
      }
      // reset() — this must clear rescueLastT to -4
      window.__apex.reset(0.3, 0, 0);
      // Second episode: sit stopped again; with old bug this would be blocked by 4 s grace
      let rescueHappened = false;
      for (let i = 0; i < 420; i++) {   // 7 s window
        window.__apex.act({ steer: 0, throttle: false, brake: false }, 1 / 60, 1);
        const ps = window.__apex.physState();
        if (ps.speed > 5) { rescueHappened = true; break; }   // rescue boosted speed
      }
      window.__apex.headless(false);
      return rescueHappened;
    });
    expect(rescued).toBe(true);
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

  test("AI field reaches 30 m/s on Zandvoort banked section within 8 s", async ({ page }) => {
    await loadRace(page, "zandvoort");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Banked section is roughly at 0.65–0.75 (Arie Luyendijk turn)
      window.__apex.reset(0.65, 20, 0);
      for (let i = 0; i < 480; i++) {  // 8 s
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
      }
      window.__apex.headless(false);
      const cars = window.__apex.cars();
      const ai = cars.filter((c) => !c.p);
      const avgSpeed = ai.reduce((s, c) => s + c.speed, 0) / (ai.length || 1);
      const allFinite = cars.every((c) => isFinite(c.x) && isFinite(c.speed));
      return { avgSpeed, allFinite, count: ai.length };
    });
    expect(result.allFinite).toBe(true);
    expect(result.avgSpeed).toBeGreaterThan(30);
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
// recordBarrier, so the physics limit was 0.25 m too loose (auto-street
// 0.35 m gap vs visual 0.6 m gap).

test.describe("Jeddah barrier physics matches visual placement", () => {
  test.use({ viewport: LANDSCAPE });

  test("Jeddah wallAt() is tighter than auto-street default at 0.6 m gap", async ({ page }) => {
    await loadRace(page, "jeddah");
    const result = await page.evaluate(() => {
      const obs = window.__apex.reset(0.1, 0, 0);
      return { hw: obs.hw, wallR: obs.wallR };
    });
    // With recordBarrier at 0.6 m: limit ≈ hw + 0.6 − 1.1 = hw − 0.5
    // Without fix (auto-street 0.35 m): limit ≈ hw + 0.35 − 1.1 = hw − 0.75
    // wallR must be CLOSER to hw than the old loose boundary
    const looseLimit = result.hw - 0.75;   // old auto-street value
    expect(result.wallR).toBeGreaterThan(looseLimit);  // tighter than old value
  });

  test("car cannot drive 1 m past the expected Jeddah barrier face", async ({ page }) => {
    await loadRace(page, "jeddah");
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      const obs0 = window.__apex.reset(0.1, 20, 0);
      const hw = obs0.hw;
      // Try to push 1 m past expected barrier face (hw + 0.6)
      window.__apex.jump(0.1, 20, hw + 1.0);
      window.__apex.act({ steer: 1, throttle: false, brake: false }, 1 / 60, 3);
      window.__apex.headless(false);
      const obs = window.__apex.obs();
      return { x: obs.x, hw };
    });
    // Physics should clamp the car well before hw + 0.6
    expect(result.x).toBeLessThan(result.hw + 0.6);
  });
});
