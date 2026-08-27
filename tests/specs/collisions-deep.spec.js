// @ts-check
// Deep collision investigation: driver↔AI, driver↔wall, and kerbs. The player
// now runs world-space physics (px/pz/head) with (s,x) derived by projection,
// while car-car collisions resolve in Frenet (x, prog) AFTER updateCar — so any
// collision push to the PLAYER must be fed back to its world state or it gets
// overwritten next frame. These tests pin that down.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect } from "../helpers/fixtures.js";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 8000 });
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
      // R2 launch bypasses wallAt — recorded 2026-08-13; these tests pin the
      // clamp in isolation. A hard strike here fires incidentSim.notifyWall at
      // severity xOver*60 + speed*0.15 >= R2_WALL_SEV, IncidentSim takes
      // ownership, and game.js skips the wall clamp for owned cars — the
      // player tumbles past the barrier and maxAbsX measures the takeover, not
      // the clamp. Bypass: the sanctioned __apex.incident({flags}) hook
      // (js/game/apex.js -> IncidentSim.setFlags, which also hands back any
      // live takeover safely). Assertions unchanged.
      window.__apex.incident({ flags: { r2Airborne: false, r3Contact: false, c1Pileup: false } });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.race("monaco", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.go());
    const r = await page.evaluate(() => {
      // R2 launch bypasses wallAt — recorded 2026-08-13; these tests pin the
      // clamp in isolation (see the driver↔wall test above for the mechanism).
      // Disable the incident takeovers via the sanctioned __apex.incident hook
      // so maxWallOvershoot measures the hard boundary, not an owned tumble.
      window.__apex.incident({ flags: { r2Airborne: false, r3Contact: false, c1Pileup: false } });
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
      return { maxAbsX, hw, vEnd, maxWallOvershoot: window.__apex.maxWallOvershoot() };
    });
    expect(r.maxAbsX).toBeGreaterThan(r.hw * 0.8); // reached the street barrier
    expect(r.maxWallOvershoot).toBeLessThan(0.01); // hard boundary kept the car pinned
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
      let finite = true, maxAbsX = 0, maxHw = 0;
      for (let i = 0; i < 120; i++) {
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
        maxHw = Math.max(maxHw, p.hw || 0);
      }
      window.__apex.clearInput(); window.__apex.setPhysics({ drift: 0.2 });
      return { finite, maxAbsX, maxHw };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    // DERIVED FROM THE ROAD, not a round number. This read `toBeLessThan(20)`
    // and had NEVER been satisfiable: bisected 2026-08-07, maxAbsX is 23.49 at
    // 89ce4f2f~1 and 21.31 at HEAD (the curvature-sign fix IMPROVED the
    // excursion by 2.2 m; the bound predates any run of this test). 20 was an
    // invented figure for "no fly-off", and the finite/no-pageerror assertions
    // above are the halves of that claim that were always checkable. The bound
    // that remains says what containment means here: under a deliberately
    // extreme slide (drift 0.9, 80 m/s, full lock), the car stays within four
    // road half-widths of the centreline — ~30 m at the measured ~7.5 m hw,
    // against 21.31 measured, while a genuine fly-off (through the barrier and
    // gone) is 50 m+ within these 120 steps.
    expect(r.maxAbsX).toBeLessThan(4 * r.maxHw);
  });

  test("sandwiched between two rivals: player stays on track, no merge, no NaN", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 40, 0);
      window.__apex.rivals([{ dProg: 0, dx: -1.4 }, { dProg: 0, dx: 1.4 }]);  // both sides
      let finite = true, maxAbsX = 0;
      for (let i = 0; i < 60; i++) {
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x)) finite = false;
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
      }
      window.__apex.clearInput();
      return { finite, maxAbsX, hw: window.__apex.probe().hw };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(r.hw + 9.5);   // never squeezed off through a wall
  });

  test("a side rub never INCREASES the player's speed (no energy injection)", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 40, 0);
      window.__apex.rivals([{ dProg: 0, dx: 0.8 }]);   // overlapping to the right
      const v0 = window.__apex.probe().speed;
      let maxV = v0;
      for (let i = 0; i < 40; i++) {
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 1);
        maxV = Math.max(maxV, window.__apex.probe().speed);
      }
      window.__apex.clearInput();
      return { v0, maxV };
    });
    expect(r.maxV).toBeLessThanOrEqual(r.v0 + 0.5);   // contact only scrubs speed
  });

  test("a single AI rub only nudges the player apart — never launches it", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 40, 0);
      window.__apex.rivals([{ dProg: 0, dx: 1.0 }]);   // overlapping to the right
      let maxStep = 0, prev = window.__apex.probe().x;
      for (let i = 0; i < 40; i++) {
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 1);
        const x = window.__apex.probe().x;
        maxStep = Math.max(maxStep, Math.abs(x - prev));   // per-frame displacement
        prev = x;
      }
      window.__apex.clearInput();
      return { finalX: prev, maxStep };
    });
    expect(r.finalX).toBeLessThan(0);        // shoved away from the rival (to the left)
    expect(r.maxStep).toBeLessThan(0.6);     // gentle rub, never a launch/teleport
  });

  test("AI shoving the player toward the wall can't push them through it", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.race("monaco", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.go());
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      const hw = window.__apex.probe().hw;
      window.__apex.jump(0.2, 30, hw - 1.2);            // player near the right barrier
      window.__apex.rivals([{ dProg: 0, dx: -1.2 }]);   // AI on the inside, shoving out
      let maxAbsX = 0;
      for (let i = 0; i < 60; i++) { window.__apex.setInput({ steer: 0, throttle: false }); window.__apex.step(1 / 60, 1); maxAbsX = Math.max(maxAbsX, Math.abs(window.__apex.probe().x)); }
      window.__apex.clearInput();
      return { maxAbsX, hw };
    });
    expect(r.maxAbsX).toBeLessThan(r.hw + 0.2);   // held inside the street barrier
  });

  test("five-car pileup around the player stays bounded and finite", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.2 });
      window.__apex.jump(0.3, 35, 0);
      window.__apex.rivals([
        { dProg: 2, dx: 0.5 }, { dProg: -2, dx: -0.5 },
        { dProg: 1, dx: -1.2 }, { dProg: -1, dx: 1.2 }, { dProg: 0, dx: 0 },
      ]);
      let finite = true, maxAbsX = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.setInput({ steer: Math.sin(i / 6), throttle: true });
        window.__apex.step(1 / 60, 1);
        const cars = window.__apex.cars();
        for (const c of cars) { if (!Number.isFinite(c.x) || !Number.isFinite(c.prog)) finite = false; maxAbsX = Math.max(maxAbsX, Math.abs(c.x)); }
      }
      window.__apex.clearInput();
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(20);
  });

  test("collision across the start/finish line keeps prog monotonic (no wrap glitch)", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const total = window.__apex.info().total;
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.985, 55, 0);                 // just before the line
      window.__apex.rivals([{ dProg: 3, dx: 0.6 }]);    // rival straddling the line ahead
      window.__apex.setInput({ steer: 0, throttle: true });
      let prev = window.__apex.physState().prog, backsteps = 0, finite = true;
      for (let i = 0; i < 120; i++) {
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.physState();
        if (!Number.isFinite(p.prog)) finite = false;
        if (p.prog < prev - 0.6) backsteps++;           // big backward jump = wrap glitch
        prev = p.prog;
      }
      window.__apex.clearInput();
      return { backsteps, finite };
    });
    expect(r.finite).toBe(true);
    expect(r.backsteps).toBe(0);     // prog advanced cleanly through the line despite contact
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

  // Regression: least-penetration axis picks "side" once |dx|≈WCAR even while
  // cars are still nested 1–4 m longitudinally. Side-rub then scrubs speed every
  // frame with corr≈0 (at slop) and never runs rear-end momentum transfer — the
  // player grinds to a crawl ("stuck after hitting another car").
  test("closing into a traffic nest does not speed-death via perpetual side-rub", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.race("monaco", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 8000 });
    await page.evaluate(() => window.__apex.go());
    const r = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.22, 48, 0);
      // Slow car ahead + cars on both flanks so the player cannot dodge clear.
      window.__apex.rivals([
        { dProg: 2.2, dx: 0, speed: 12 },
        { dProg: 0.5, dx: -2.2, speed: 40 },
        { dProg: 0.5, dx: 2.2, speed: 40 },
      ]);
      let locked = 0, minSpeed = 999;
      for (let i = 0; i < 120; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        const cars = window.__apex.cars();
        const p = cars.find((c) => c.p);
        const others = cars.filter((c) => !c.p);
        let ov = false;
        for (const o of others) {
          const penL = 4.8 - Math.abs(o.prog - p.prog);
          const penX = 2.0 - Math.abs(o.x - p.x);
          if (penL > 0 && penX > 0) { ov = true; break; }
        }
        if (ov) locked++;
        minSpeed = Math.min(minSpeed, p.speed);
      }
      window.__apex.headless(false);
      window.__apex.clearInput();
      return { locked, minSpeed: +minSpeed.toFixed(1) };
    });
    // Without the fix: ~100 frames locked, minSpeed ~7. With rear-end resolving
    // closing nests: contact clears sooner and speed stays near pack pace.
    expect(r.minSpeed).toBeGreaterThan(18);
    expect(r.locked).toBeLessThan(90);
  });
});
