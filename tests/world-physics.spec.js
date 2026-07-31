// @ts-check
// World-space physics migration: the player car integrates a bicycle model in
// Cartesian world space (px/pz/head) and derives the Frenet (s, x) each frame by
// projecting onto the centreline. These tests lock in the observable contract:
// progress advances with speed, steering direction is correct, the car runs wide
// to the geometric OUTSIDE with no input, and teleports stay consistent.
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — world-space player physics", () => {
  test("loads and runs a race with no uncaught errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await startRace(page);
    await page.evaluate(() => {
      window.__apex.setInput({ steer: 0.4, throttle: true });
      for (let i = 0; i < 300; i++) window.__apex.step(1 / 60, 1);
      window.__apex.clearInput();
    });
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });

  test("progress advances ~linearly with speed", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.jump(0.30, 50, 0);
      window.__apex.setInput({ steer: 0, throttle: false });
      const s0 = window.__apex.probe().s;
      for (let i = 0; i < 60; i++) window.__apex.step(1 / 60, 1);  // 1 s
      const p = window.__apex.probe();
      window.__apex.clearInput();
      return { s0, s1: p.s, x: p.x };
    });
    const ds = ((r.s1 - r.s0) + 1e6) % 1e6;
    expect(ds).toBeGreaterThan(35);          // ~46 m at ~46 m/s
    expect(Number.isFinite(r.x)).toBe(true);
  });

  test("steer direction: +steer goes right (+x), -steer goes left", async ({ page }) => {
    await startRace(page);
    const measure = (steer) => page.evaluate((s) => {
      window.__apex.jump(0.0, 40, 0);
      window.__apex.setInput({ steer: s, throttle: false });
      const x0 = window.__apex.probe().x;
      for (let i = 0; i < 30; i++) window.__apex.step(1 / 60, 1);
      const x1 = window.__apex.probe().x;
      window.__apex.clearInput();
      return x1 - x0;
    }, steer);
    expect(await measure(0.5)).toBeGreaterThan(0);
    expect(await measure(-0.5)).toBeLessThan(0);
  });

  // The assist is opt-in now (ships at 0), so the "on" leg uses an explicit gain
  // instead of the shipped default — this tests the mechanism, not the default.
  test("no input runs wide with road-follow off; tracks the corner once switched on", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const def = 0.6;                      // explicit opted-in assist
      const corners = window.__apex.corners();
      const meas = (frac, rf) => {
        window.__apex.setPhysics({ roadFollow: rf });
        window.__apex.jump(frac, 24, 0);
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 3);
        const b = window.__apex.probe();
        window.__apex.step(1 / 60, 40);
        const a = window.__apex.probe();
        window.__apex.clearInput();
        return { k: b.k, dx: a.x - b.x };
      };
      const out = [];
      for (const frac of corners.slice(0, 12)) {
        const off = meas(frac, 0);            // pure world-space: no auto-steer
        if (Math.abs(off.k) < 0.012) continue;
        const on = meas(frac, def);           // opted in: road-follow tracks
        out.push({ k: off.k, dxOff: off.dx, dxOn: on.dx });
      }
      window.__apex.setPhysics({ roadFollow: 0 });   // restore the shipped default
      return out;
    });
    expect(r.length).toBeGreaterThan(0);
    for (const { k, dxOff, dxOn } of r) {
      // Road-follow OFF (the shipped default): the car holds a straight world line
      // and runs wide to the OUTSIDE (+sign(k)). Switched on, it tracks the bend and
      // stays much closer to the line — that is what the DRIVING HELP slider buys.
      expect(Math.sign(dxOff)).toBe(Math.sign(k));
      expect(Math.abs(dxOn)).toBeLessThan(Math.abs(dxOff));
    }
  });

  test("RESPONSE slider changes turn-in (wheelbase): high = snappier", async ({ page }) => {
    await startRace(page);
    // Hold the same steer from a straight at each RESPONSE extreme and compare
    // how far the heading swings in a short burst. Higher slider must turn more.
    const turnAt = (slider) => page.evaluate((s) => {
      const el = document.getElementById("pm-rate");
      el.value = String(s);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      window.__apex.jump(0.0, 40, 0);
      window.__apex.setInput({ steer: 1, throttle: false });
      const a0 = window.__apex.probe().angle;
      for (let i = 0; i < 10; i++) window.__apex.step(1 / 60, 1);
      const a1 = window.__apex.probe().angle;
      window.__apex.clearInput();
      return Math.abs(a1 - a0);
    }, slider);
    const low = await turnAt(2);    // long wheelbase = lazy
    const high = await turnAt(9);   // short wheelbase = snappy
    expect(high).toBeGreaterThan(low * 1.15);
  });

  test("AI stays on track and progresses after the racing-line flip", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      // This test judges the AI, so BOTH its metrics must be AI-only. It used to
      // hold the player flat-out with no steering merely to let the race run,
      // which only stayed on track because the assist was on by default; with the
      // assist now shipping at 0 the un-steered player leaves the road and tripped
      // the |x| > 18 count. Simply not driving the player is worse — it parks a
      // stationary car in the middle of the grid and the field piles into it
      // (measured: minProg -120 after 10 s, i.e. the AI never got away).
      // So drive the player as before and judge only the AI, below.
      //
      // STILL FAILING, and left failing rather than guessed at further. minProg
      // after 10 s measures: -120 with the player parked in the pack (it blocks
      // the grid), 16.8 driving through them as here, 6.9 with the player
      // teleported half a lap away — so removing the player made it WORSE, which
      // contradicts the blocking explanation and means the cause is not
      // understood. Note the AI rubber-band reads player.prog
      // (`gap = player.prog - c.prog`), so where the player is changes AI pace;
      // that is the thread to pull. The 70 m threshold assumes a field that gets
      // away cleanly, and something about the grid start no longer does.
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 600; i++) window.__apex.step(1 / 60, 1);  // ~10 s
      window.__apex.clearInput();
      const cars = window.__apex.cars();
      const ai = cars.filter((c) => !c.p);   // the player is hand-driven here
      return {
        offTrack: ai.filter((c) => Math.abs(c.x) > 18).length,   // AI only — see above
        minProg: Math.min(...ai.map((c) => c.prog)),
      };
    });
    expect(r.offTrack).toBe(0);
    expect(r.minProg).toBeGreaterThan(70);
  });
});
