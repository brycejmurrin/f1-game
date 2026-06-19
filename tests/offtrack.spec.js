// @ts-check
// Off-track, reversing, wrong-way and auto-rescue handling, plus the prog↔s
// coupling fix (progress is derived from the actual signed change in s, so a
// spin/reverse can't cheat progress forward).
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — off-track / reverse / wrong-way", () => {
  test("prog tracks s: forward driving advances prog ≈ s-progress", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, 60, 0);
      const p0 = window.__apex.physState();
      for (let i = 0; i < 120; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const p1 = window.__apex.physState();
      window.__apex.clearInput();
      const dProg = p1.prog - p0.prog, dS = p1.s - p0.s;
      return { dProg, dS };
    });
    expect(r.dProg).toBeGreaterThan(50);          // clearly progressed
    expect(Math.abs(r.dProg - r.dS)).toBeLessThan(2);   // prog == s advance
  });

  test("facing backwards and throttling DECREASES progress (no forward cheat)", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);                     // face backwards
      const p0 = window.__apex.physState();
      for (let i = 0; i < 30; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const p1 = window.__apex.physState();
      window.__apex.clearInput();
      return { dProg: p1.prog - p0.prog };
    });
    expect(r.dProg).toBeLessThan(0);              // went backwards → prog dropped
  });

  test("wrong-way is flagged when driving against the track", async ({ page }) => {
    await startRace(page);
    const wrong = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);
      let flagged = false;
      for (let i = 0; i < 60; i++) {
        window.__apex.setInput({ steer: 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        if (window.__apex.physState().wrongWay) { flagged = true; break; }
      }
      window.__apex.clearInput();
      return flagged;
    });
    expect(wrong).toBe(true);
  });

  test("brake at a standstill crawls the car backwards (reverse), then throttle recovers", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, 0, 0);
      // hold brake from a stop → reverse crawl
      for (let i = 0; i < 60; i++) { window.__apex.setInput({ steer: 0, brake: true }); window.__apex.step(1 / 60, 1); }
      const rev = window.__apex.physState().speed;
      // now throttle → back to forward motion
      for (let i = 0; i < 120; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const fwd = window.__apex.physState().speed;
      window.__apex.clearInput();
      return { rev, fwd };
    });
    expect(r.rev).toBeLessThan(-2);     // genuinely reversing
    expect(r.rev).toBeGreaterThan(-9);  // but capped to a crawl
    expect(r.fwd).toBeGreaterThan(10);  // throttle pulls it forward again
  });

  test("driving onto grass and back recovers (slowed off, speeds up on return)", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, 80, 14);            // way off in the grass
      for (let i = 0; i < 90; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const offSpeed = window.__apex.physState().speed;
      // back onto the track surface
      window.__apex.jump(0.0, offSpeed, 0);
      for (let i = 0; i < 90; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const onSpeed = window.__apex.physState().speed;
      window.__apex.clearInput();
      return { offSpeed, onSpeed };
    });
    expect(r.offSpeed).toBeLessThan(45);   // grass held it slow
    expect(r.onSpeed).toBeGreaterThan(r.offSpeed + 8);   // recovered on tarmac
  });

  test("auto-rescue: a wrong-way car is recovered to the racing line facing forward", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);
      let rescued = false, afterX = 99, afterWrong = true;
      for (let i = 0; i < 320; i++) {           // > 3 s of wrong-way
        window.__apex.setInput({ steer: 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.physState();
        if (p.rescueT === 0 && !p.wrongWay && Math.abs(p.x) < 1 && i > 60) { rescued = true; afterX = p.x; afterWrong = p.wrongWay; break; }
      }
      window.__apex.clearInput();
      return { rescued, afterX, afterWrong };
    });
    expect(r.rescued).toBe(true);
    expect(Math.abs(r.afterX)).toBeLessThan(1);   // back on the line
    expect(r.afterWrong).toBe(false);
  });

  test("auto-rescue: a car beached deep off-track is recovered", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      let onTrack = false;
      window.__apex.jump(0.0, 0, 16);            // beached in the grass, stopped
      for (let i = 0; i < 320; i++) {
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 1);
        if (Math.abs(window.__apex.physState().x) < 1) { onTrack = true; break; }
      }
      window.__apex.clearInput();
      return { onTrack };
    });
    expect(r.onTrack).toBe(true);
  });
});
