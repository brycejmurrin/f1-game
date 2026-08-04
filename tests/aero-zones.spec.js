// @ts-check
// ACTIVATION ZONES. The 2026 rule is not "is the road ahead straight enough" —
// the FIA approves fixed zones per circuit and the standard ECU refuses to
// rotate the wings outside one. A zone only exists if it exceeds three seconds
// at racing speed, which is the clause that leaves MONACO with no zones and
// therefore no active aero at all.
//
// That distinction is the mechanic. A rolling look-ahead has no start and no
// end, so there is nothing to learn and nothing to show; a fixed zone is a
// PLACE, which is why the HUD can count down to it like a DRS board.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };
const X_ZONE_MIN = 210;   // m — X_STRAIGHT_T * X_ZONE_VREF in js/game.js

async function loadTrack(page, id) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 30_000 });
}

test.describe("active aero — activation zones", () => {
  test.use({ viewport: LANDSCAPE });

  test("a fast circuit has zones, and every one clears the three-second minimum", async ({ page }) => {
    await loadTrack(page, "monza");
    const zones = await page.evaluate(() => window.__apex.aeroZones());
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) expect(z.len, `zone at ${z.start}m`).toBeGreaterThanOrEqual(X_ZONE_MIN);
    // Monza's defining feature is a very long straight.
    expect(Math.max(...zones.map((z) => z.len))).toBeGreaterThan(700);
  });

  test("MONACO has no zone at all — no straight clears three seconds", async ({ page }) => {
    await loadTrack(page, "monaco");
    expect(await page.evaluate(() => window.__apex.aeroZones())).toEqual([]);
  });

  test("with no zone, the mode can never arm however hard it is asked for", async ({ page }) => {
    await loadTrack(page, "monaco");
    const r = await page.evaluate(() => {
      window.__apex.headless(true); window.__apex.go();
      const out = [];
      for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        window.__apex.jump(frac, 55, 0);
        window.__apex.step(1 / 60, 2);
        window.__apex.aero(true);
        window.__apex.act({ throttle: true }, 1 / 60, 40);
        const a = window.__apex.aero();
        out.push({ frac, armed: a.xArmed, aeroX: a.aeroX, zones: a.zones });
      }
      return out;
    });
    for (const p of r) {
      expect(p.zones, `zones at ${p.frac}`).toBe(0);
      expect(p.armed, `armed at ${p.frac}`).toBe(false);
      expect(p.aeroX, `flap at ${p.frac}`).toBe(0);
    }
  });

  test("zones are a property of the CIRCUIT — the pace slider cannot add or remove one", async ({ page }) => {
    // They are measured against a fixed reference speed on purpose: PACE scales
    // the car's real m/s, so measuring against the car would let the difficulty
    // setting silently redraw the track's zones.
    await loadTrack(page, "monza");
    const slow = await page.evaluate(() => {
      window.__apex.setPhysics({ pace: 0.5 });
      return window.__apex.aeroZones();
    });
    const fast = await page.evaluate(() => {
      window.__apex.setPhysics({ pace: 1.5 });
      return window.__apex.aeroZones();
    });
    expect(fast).toEqual(slow);
  });

  test("inZone and zoneAhead agree with the zone list, wrap included", async ({ page }) => {
    await loadTrack(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.headless(true); window.__apex.go();
      const zones = window.__apex.aeroZones();
      // A zone that crosses the start line reports endFrac < startFrac; aiming at
      // its midFrac is the only wrap-safe way to stand inside it.
      const z = zones.slice().sort((a, b) => b.len - a.len)[0];
      window.__apex.jump(z.midFrac, 60, 0);
      window.__apex.step(1 / 60, 2);
      const inside = window.__apex.aero();
      return { inside, wrapped: z.endFrac < z.startFrac };
    });
    expect(r.inside.inZone).toBe(true);
    expect(r.inside.zoneAhead, "zero distance while standing in one").toBe(0);
    expect(r.inside.xArmed).toBe(true);
  });

  test("outside a zone, zoneAhead counts down a real distance", async ({ page }) => {
    await loadTrack(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.headless(true); window.__apex.go();
      const seen = [];
      for (let i = 0; i < 40; i++) {
        window.__apex.jump(i / 40, 60, 0);
        window.__apex.step(1 / 60, 1);
        const a = window.__apex.aero();
        seen.push({ inZone: a.inZone, ahead: a.zoneAhead });
      }
      return seen;
    });
    // every sample is either inside a zone (0 m) or a finite distance from one
    for (const p of r) {
      if (p.inZone) expect(p.ahead).toBe(0);
      else { expect(p.ahead).toBeGreaterThan(0); expect(Number.isFinite(p.ahead)).toBe(true); }
    }
    expect(r.some((p) => p.inZone), "some of the lap is inside a zone").toBe(true);
    expect(r.some((p) => !p.inZone), "and some of it is not").toBe(true);
  });
});

// OVERTAKE'S RULES ARE NOT ACTIVE AERO'S, and the whole point of this block is
// that the two must not be conflated. Overtake mode is the 2026 successor to
// DRS as the PROXIMITY-gated overtaking aid, so it inherits DRS's safety
// restrictions: nothing on the opening lap (it arms once the LEADER completes
// it) and nothing while the race is neutralised. Active aero inherits none of
// them — every driver gets it on every lap in every approved zone, leader and
// backmarker alike, with no proximity requirement at all.
test.describe("overtake mode — the rules active aero does NOT share", () => {
  test.use({ viewport: LANDSCAPE });

  test("stays disabled for the whole opening lap, then arms when the LEADER starts lap 2", async ({ page }) => {
    await loadTrack(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.go();
      window.__apex.jump(0, 60, 0);
      window.__apex.setInput({ throttle: true });
      const trail = [];
      for (let i = 0; i < 220; i++) {
        window.__apex.step(1 / 60, 60);        // 1 s of sim per iteration
        trail.push({ leaderLap: Math.max(...window.__apex.cars().map((c) => c.lap)),
                     on: window.__apex.carAt().otEnabled });
      }
      return trail;
    });
    // The gate must never be open while the leader is still on the opening lap,
    // and must be open once it is not. Stated as an invariant over every sample
    // rather than as a moment, so it also catches a gate that flickers.
    for (const s of r) expect(s.on).toBe(s.leaderLap > 1);
    expect(r.some((s) => !s.on), "the opening lap is covered").toBe(true);
    expect(r.some((s) => s.on), "and the race gets past it").toBe(true);
  });

  test("active aero is NOT gated by the opening lap — it arms inside a zone on lap 1", async ({ page }) => {
    await loadTrack(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.go();
      // Park in the middle of the longest zone, still on the opening lap.
      const z = window.__apex.aeroZones().sort((a, b) => b.len - a.len)[0];
      window.__apex.jump(z.midFrac, 60, 0);
      window.__apex.step(1 / 60, 2);
      // aero() and carAt() BOTH mean the player; carAt(0) would be cars[0],
      // which is an AI car and reports its own arming, not yours.
      return { leaderLap: Math.max(...window.__apex.cars().map((x) => x.lap)),
               xArmed: window.__apex.aero().xArmed,
               otEnabled: window.__apex.carAt().otEnabled };
    });
    expect(r.leaderLap, "still the opening lap").toBeLessThan(2);
    expect(r.xArmed, "active aero is available anyway").toBe(true);
    expect(r.otEnabled, "overtake is not").toBe(false);
  });
});

// THE TRADE ITSELF: top speed bought with downforce, in the numbers the model
// actually applies. Both halves were unobservable until physState() carried
// them — the constants live deep inside updateCar, and you cannot measure them
// by DRIVING: full lock at 78 m/s puts the car 30 m into a field, which drops
// xArmed and closes the flaps, so the "X-mode" sample is not X-mode at all.
// (That is exactly how the first attempt at this test lied.)
test.describe("active aero — downforce traded for top speed", () => {
  test.use({ viewport: LANDSCAPE });

  test("X-mode buys X_VMAX_GAIN of vmax and gives up X_DF_LOSS of the aero load", async ({ page }) => {
    await loadTrack(page, "monza");
    const r = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true); A.go();
      const zone = A.aeroZones().slice().sort((a, b) => b.len - a.len)[0];
      const read = (wantX) => {
        A.reset(zone.midFrac, 70, 0);
        A.setInput({ throttle: true });
        // the flap TRAVELS (~0.45 s open): sample after it has arrived
        for (let i = 0; i < 60; i++) { A.aero(wantX); A.step(1 / 60, 1); }
        const ps = A.physState();
        A.clearInput();
        return { aeroX: ps.aeroX, vmaxNow: ps.vmaxNow, aeroGrip: ps.aeroGrip,
                 aeroDf: ps.aeroDf, onTrack: Math.abs(ps.x) < 8 };
      };
      return { z: read(false), x: read(true) };
    });
    // The measurement is only meaningful with the car on the road and the flaps
    // where they were asked to be.
    expect(r.z.onTrack && r.x.onTrack, "both samples taken on track").toBe(true);
    expect(r.z.aeroX).toBe(0);
    expect(r.x.aeroX).toBe(1);

    // TOP SPEED: +X_VMAX_GAIN (0.075), exactly — it is a plain multiplier.
    expect(r.x.vmaxNow / r.z.vmaxNow).toBeCloseTo(1.075, 3);
    // DOWNFORCE: the aero-load term keeps 1 - X_DF_LOSS (0.55) of itself.
    expect(r.z.aeroDf).toBeCloseTo(1, 3);
    expect(r.x.aeroDf).toBeCloseTo(0.45, 3);
    // And the grip the car actually gets must FALL, not merely be scaled on
    // paper: the aero term is what multiplies lateral grip.
    expect(r.x.aeroGrip).toBeLessThan(r.z.aeroGrip);
    expect(r.z.aeroGrip).toBeGreaterThan(1);
  });
});
