// @ts-check
// Phase 0 of multiplayer: the car role split, with no networking anywhere.
//
// `isPlayer` used to mean two different things at once — "this car is driven by
// a person" (which selects the full bicycle model, a world-space pose, the
// heavier collision mass, and an input source instead of the AI driver) and
// "this car is mine, on this screen" (camera, HUD, audio, haptics). One flag
// could carry both only while exactly one car was ever human. These specs pin
// the two apart:
//
//   human — c.human. Physics and authority.
//   local — c.local (and its retained alias c.isPlayer). Presentation.
//
// The invariant that matters most is the LAST one here: a human car must drive
// identically whether its controls arrive from the local Input or from
// somewhere else. If that ever stops being true, a networked rival will not
// drive the way its owner is driving it, and no amount of netcode fixes that.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("car roles: human vs local", () => {
  test.use({ viewport: LANDSCAPE });

  test("the player starts as both human and local; the AI is neither", async ({ page }) => {
    await load(page);
    const roles = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);
      A.reset(0.05, 40, 0, 1);
      return A.carRoles();
    });
    const humans = roles.filter((r) => r.human);
    const locals = roles.filter((r) => r.local);
    expect(humans).toHaveLength(1);
    expect(locals).toHaveLength(1);
    expect(humans[0].id).toBe(locals[0].id);
    // The alias every consumer outside game.js still reads.
    expect(locals[0].isPlayer).toBe(true);
    // Everyone else is AI: not human, not local.
    expect(roles.filter((r) => !r.human && !r.local)).toHaveLength(roles.length - 1);
  });

  test("promoting an AI car to human gives it the bicycle-model state", async ({ page }) => {
    await load(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);
      A.reset(0.05, 40, 0, 1);
      const me = A.carRoles().find((r) => r.local).id;
      const other = A.carRoles().find((r) => !r.human).id;

      // Driven by the AI, the car is kinematic in (s, x): the per-axle slip
      // model never runs, so vLat/yawRateCur stay at zero however it corners.
      A.aiPlace(other, 0.30, 55, 0);
      A.step(1 / 60, 120);
      const asAi = A.carRoles()[other];

      // Promote it and hand it controls. It must now develop real body slip
      // through the tyre model, like any other human-driven car.
      A.aiPlace(other, 0.30, 55, 0);
      A.carRole(other, { human: true, local: false });
      A.carInput(other, { steer: 0.6, throttle: true });
      A.step(1 / 60, 120);
      const asHuman = A.carRoles()[other];
      return { me, other, asAi, asHuman };
    });

    expect(out.other).not.toBe(out.me);
    expect(out.asAi.human).toBe(false);
    // The AI never runs the slip model.
    expect(out.asAi.vLat).toBe(0);
    expect(out.asAi.yawRateCur).toBe(0);
    // The same car under human control does.
    expect(out.asHuman.human).toBe(true);
    expect(out.asHuman.local).toBe(false);
    expect(out.asHuman.hasPose).toBe(true);
    expect(Math.abs(out.asHuman.yawRateCur)).toBeGreaterThan(0);
  });

  test("a non-local human car ignores the local Input entirely", async ({ page }) => {
    // Isolate the one variable: the LOCAL stick. The remote car is given the
    // same (empty) controls both times, so if any part of the local Input
    // reached it, the two trajectories would differ. Note we cannot assert the
    // remote car simply "goes straight" — with no steering it does exactly
    // that, which on a curving road means it leaves the centreline. Departing
    // from the road is correct here; departing DIFFERENTLY is the bug.
    await load(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);

      function runWithLocalStick(steer) {
        A.reset(0.05, 40, 0, 3);
        const other = A.carRoles().find((r) => !r.human).id;
        A.aiPlace(other, 0.30, 55, 0);
        A.carRole(other, { human: true, local: false });
        A.carInput(other, null);          // the remote car is given nothing
        A.setInput({ steer, throttle: true });   // ...while the LOCAL car is sawed
        A.step(1 / 60, 90);
        const remote = A.carAt(other);
        A.clearInput();
        A.carRole(other, { human: false, local: false });
        return { x: remote.x, s: remote.s, speed: remote.speed };
      }
      return { left: runWithLocalStick(-1), right: runWithLocalStick(1) };
    });

    // Full left lock vs full right lock on the local controls: the remote car
    // must not have noticed.
    expect(out.right.x).toBeCloseTo(out.left.x, 6);
    expect(out.right.s).toBeCloseTo(out.left.s, 6);
    expect(out.right.speed).toBeCloseTo(out.left.speed, 6);
  });

  test("part upgrades are per-car, not shared from the local player", async ({ page }) => {
    // The regression guard for the `playerMods` singleton: it was a module-level
    // object read inside the human branch, including by muBase. A second human
    // would have cornered, braked and accelerated on the LOCAL player's parts.
    await load(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);

      function runWith(mods) {
        A.reset(0.05, 40, 0, 1);
        const other = A.carRoles().find((r) => !r.human).id;
        A.aiPlace(other, 0.30, 70, 0);
        A.carRole(other, { human: true, local: false, mods });
        A.carInput(other, { steer: 0, throttle: false, brake: true });
        A.step(1 / 60, 60);
        return A.carAt(other).speed;
      }
      // Same car, same start, same input — only the braking multiplier differs.
      return { weak: runWith({ braking: 0.5 }), strong: runWith({ braking: 1.5 }) };
    });
    // Stronger brakes must actually scrub more speed off this car.
    expect(out.strong).toBeLessThan(out.weak - 1);
  });

  test("a human car drives identically from local Input and from fed input", async ({ page }) => {
    // THE core Phase 0 invariant. Same seed, same reset, same steer/throttle —
    // once via the local Input path (_testInput), once via the per-car input
    // source a networked rival uses. The two trajectories must agree.
    await load(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);
      const STEER = 0.35, N = 120;

      // 1) The ordinary local path.
      A.reset(0.05, 55, 0, 7);
      A.act({ steer: STEER, throttle: true }, 1 / 60, N);
      const meId = A.carRoles().find((r) => r.local).id;
      const viaInput = A.carAt(meId);
      A.clearInput();

      // 2) The same car, still human, but no longer local — so it reads the
      //    fed input instead. Nothing else about it changes.
      A.reset(0.05, 55, 0, 7);
      A.carRole(meId, { human: true, local: false });
      A.carInput(meId, { steer: STEER, throttle: true });
      A.step(1 / 60, N);
      const viaFed = A.carAt(meId);
      A.carRole(meId, { human: true, local: true });
      A.carInput(meId, null);

      return { viaInput, viaFed };
    });

    // Same physics, same integrator, same seed: these should be equal to well
    // inside a car length, not merely "similar".
    expect(out.viaFed.speed).toBeCloseTo(out.viaInput.speed, 3);
    expect(out.viaFed.x).toBeCloseTo(out.viaInput.x, 3);
    expect(out.viaFed.s).toBeCloseTo(out.viaInput.s, 2);
  });
});
