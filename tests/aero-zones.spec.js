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
