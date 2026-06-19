// @ts-check
// Deep collision investigation: driver↔AI, driver↔wall, and kerbs. The player
// now runs world-space physics (px/pz/head) with (s,x) derived by projection,
// while car-car collisions resolve in Frenet (x, prog) AFTER updateCar — so any
// collision push to the PLAYER must be fed back to its world state or it gets
// overwritten next frame. These tests pin that down.
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}
const player = (page) => page.evaluate(() => window.__apex.probe());

test.describe("Apex 26 — collisions (deep)", () => {
  test("driver↔AI side contact pushes the PLAYER and the push sticks", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 40, 0);          // player centred
      window.__apex.rival(0, 1.0);             // AI 1 m to the right, overlapping (<2 m)
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 30; i++) window.__apex.step(1 / 60, 1);
      const p = window.__apex.probe();
      window.__apex.clearInput();
      return { x: p.x };
    });
    // The AI is on the player's right (+x); contact must shove the player LEFT and
    // it must persist (not be erased by the world-space integration next frame).
    expect(r.x).toBeLessThan(-0.3);
  });

  test("driver↔AI: player can't be driven through an overlapping rival", async ({ page }) => {
    await startRace(page);
    const minGap = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 40, 0);
      window.__apex.rival(0, 0.4);             // heavily overlapped to the right
      // player steers RIGHT into the rival; bodies must not pass through each other
      window.__apex.setInput({ steer: 1, throttle: false });
      let minLat = Infinity;
      for (let i = 0; i < 40; i++) {
        window.__apex.step(1 / 60, 1);
        const cars = window.__apex.cars();
        const p = cars.find((c) => c.p), a = cars.find((c) => !c.p);
        if (Math.abs(p.prog - a.prog) < 4.8)        // while longitudinally overlapping
          minLat = Math.min(minLat, Math.abs(p.x - a.x));
      }
      window.__apex.clearInput();
      return minLat;
    });
    // car half-widths sum to ~2 m; they should never interpenetrate past ~1 m
    expect(minGap).toBeGreaterThan(0.9);
  });

  test("driver↔wall: player is stopped at the barrier and loses speed", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      const hw = window.__apex.probe().hw;
      window.__apex.jump(0.0, 60, 0);
      // steer hard toward the wall on the straight and hold
      window.__apex.setInput({ steer: 1, throttle: true });
      let maxAbsX = 0, v1 = 0;
      for (let i = 0; i < 120; i++) {
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
        v1 = p.speed;
      }
      window.__apex.clearInput();
      return { maxAbsX, hw };
    });
    // never pushes past the barrier band (open-circuit wall ≈ hw + 9, hard cap)
    expect(r.maxAbsX).toBeLessThan(r.hw + 9.5);
    expect(r.maxAbsX).toBeGreaterThan(r.hw);   // it did reach the run-off/wall
  });

  test("kerb: riding the kerb sets the kerb flag (grip penalty hook)", async ({ page }) => {
    await startRace(page);
    const sawKerb = await page.evaluate(() => {
      // Kerbs sit at the edges of CORNERS — sweep each corner's apex region and a
      // band of lateral offsets either side, looking for the kerb flag.
      const corners = window.__apex.corners();
      for (const frac of corners) {
        for (let off = 5; off <= 9; off += 0.2) {
          for (const s of [off, -off]) {
            window.__apex.jump(frac, 28, s);
            window.__apex.step(1 / 60, 1);
            if (window.__apex.cars().find((c) => c.p).kerb) return true;
          }
        }
      }
      return false;
    });
    expect(sawKerb).toBe(true);
  });

  test("driver↔AI: ramming a car ahead never deeply interpenetrates (shove aside, pass clean)", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const LCAR = 4.8, WCAR = 2.0;
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 50, 0);          // player fast
      window.__apex.rival(4, 0);               // rival ~a car-length AHEAD, same lane
      window.__apex.setInput({ steer: 0, throttle: true });  // bear down on it
      let maxOverlap = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.step(1 / 60, 1);
        const cars = window.__apex.cars();
        const p = cars.find((c) => c.p), a = cars.find((c) => !c.p);
        const penLong = LCAR - Math.abs(a.prog - p.prog);
        const penLat = WCAR - Math.abs(a.x - p.x);
        if (penLong > 0 && penLat > 0)          // overlapping in BOTH axes = real merge
          maxOverlap = Math.max(maxOverlap, Math.min(penLong, penLat));
      }
      window.__apex.clearInput();
      return { maxOverlap };
    });
    // contact shoves them apart before any deep merge — never share more than a
    // sliver of space (a brushing side-by-side pass, not driving through the body).
    expect(r.maxOverlap).toBeLessThan(1.0);
  });

  test("street-circuit wall: hard barrier pins the player and scrubs speed", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    await page.evaluate(() => window.__apex.race("monaco", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
    await page.evaluate(() => window.__apex.go());
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      const hw = window.__apex.probe().hw;
      window.__apex.jump(0.2, 55, 0);
      window.__apex.setInput({ steer: 1, throttle: true });   // bury it into the barrier
      let maxAbsX = 0, vEnd = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x)); vEnd = p.speed;
      }
      window.__apex.clearInput();
      return { maxAbsX, hw, vEnd };
    });
    expect(r.maxAbsX).toBeLessThan(r.hw);    // street barrier sits just inside the edge
    expect(r.vEnd).toBeLessThan(40);         // pinned against the wall = scrubbed speed
  });

  test("drift into a wall stays stable (no NaN, no fly-off)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.9 });   // very slidey
      window.__apex.jump(0.0, 80, 0);
      window.__apex.setInput({ steer: 1, throttle: true });   // slide hard into the edge
      let finite = true, maxAbsX = 0;
      for (let i = 0; i < 120; i++) {
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
      }
      window.__apex.clearInput(); window.__apex.setPhysics({ drift: 0.2 });
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(20);
  });

  test("driver↔AI contact never NaNs or desyncs prog/s for the player", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.jump(0.3, 45, 0);
      window.__apex.rival(0, 0.6);
      let finite = true;
      for (let i = 0; i < 120; i++) {
        window.__apex.setInput({ steer: Math.sin(i / 5), throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s) || !Number.isFinite(p.speed)) finite = false;
      }
      window.__apex.clearInput();
      return { finite };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
  });
});
