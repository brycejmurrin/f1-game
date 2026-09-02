// @ts-check
// Car-to-car collision tests. The collision model runs in Frenet space (prog +
// lateral x) and must: separate overlapping cars without exploding, keep them on
// the track, and let a jammed pack dig itself out and resume racing. These use
// the __apex.pair()/jam() staging hooks and the cars() telemetry.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s
// (boot-guard specs, 2026-09-01) and the 8 s wait failed 9 of 33 tests solo.
async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
}
const step = (page, n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__apex.step(1 / 60, 1); }, n);
const cars = (page) => page.evaluate(() => window.__apex.cars());

test.describe("Apex 26 — collisions", () => {
  test("two overlapping cars push apart and settle without exploding", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const ids = await page.evaluate(() => window.__apex.pair(0.3, 55));
    // Start clearly overlapped (pair() sets x = +0.6 / -0.6, ~1.2 m apart).
    //
    // Measure the separation over the window in which the two are actually
    // ALONGSIDE. This used to sample the lateral gap once, at t = 2 s, and by
    // then the pair is ~5 m apart along the road and each is simply driving its
    // own line — the number it read (measured 1.367) was two independent AI
    // positions, not a separation. The push itself is prompt and correct:
    // 1.2 -> 1.97 m within 0.25 s, held at ~2.0 m for the second the cars are
    // still side by side.
    const before = await cars(page);
    const gap0 = Math.abs(before[ids.a].x - before[ids.b].x);
    const peak = await page.evaluate((p) => {
      let best = 0;
      for (let i = 0; i < 60; i++) {          // 1 s, while still overlapped
        window.__apex.step(1 / 60, 1);
        const cs = window.__apex.cars();
        const a = cs.find((c) => c.id === p.a), b = cs.find((c) => c.id === p.b);
        if (Math.abs(a.prog - b.prog) > 4) break;   // no longer side by side
        best = Math.max(best, Math.abs(a.x - b.x));
      }
      return best;
    }, ids);
    await step(page, 60);    // out to 2 s total, for the stability checks below
    const after = await cars(page);

    expect(errors).toEqual([]);
    expect(peak).toBeGreaterThan(gap0);                       // they separated
    expect(peak).toBeGreaterThan(1.6);                        // to ~a car width+
    for (const id of [ids.a, ids.b]) {
      expect(Number.isFinite(after[id].x)).toBe(true);        // no NaN blow-up
      expect(Math.abs(after[id].x)).toBeLessThan(12);         // stayed on track
    }
  });

  test("a jammed pack digs out and resumes speed", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const ids = await page.evaluate(() => window.__apex.jam(5));
    await step(page, 360);   // ~6 s — generous margin (AI dig-out has randomness)
    const after = await cars(page);
    const jammed = after.filter((c) => ids.includes(c.id));

    expect(errors).toEqual([]);
    // Every previously-jammed car should be moving again...
    for (const c of jammed) {
      // DELIBERATELY ABSOLUTE, with the reason written down (the PACE rule
      // demands one): this is a LIVENESS bound — a car that was jammed at ~0
      // has resumed racing six seconds later — not a performance envelope.
      // 12 m/s is walking-out-of-a-jam pace at any tier; the failure mode it
      // catches is a car still wedged, which reads 0-2, not 11.
      expect(c.speed).toBeGreaterThan(12);
      expect(Math.abs(c.x)).toBeLessThan(12);                 // and on track
    }
    // ...and no two should still be sitting on top of each other.
    for (let i = 0; i < jammed.length; i++)
      for (let j = i + 1; j < jammed.length; j++) {
        const dProg = Math.abs(jammed[i].prog - jammed[j].prog);
        const dX = Math.abs(jammed[i].x - jammed[j].x);
        expect(dProg > 3 || dX > 1.4).toBe(true);             // not overlapping
      }
  });

  test("a full pack racing for 10 s never piles off-track or NaNs", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    await page.evaluate(() => window.__apex.setInput({ steer: 0, throttle: true }));
    await step(page, 600);
    await page.evaluate(() => window.__apex.clearInput());
    const all = await cars(page);
    expect(errors).toEqual([]);
    for (const c of all) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.prog)).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(18);
    }
  });
});
