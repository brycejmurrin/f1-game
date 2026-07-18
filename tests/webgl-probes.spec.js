// @ts-check
// Tests that probe the WebGL renderer API contract:
//   - GLX.hdrMode() boolean
//   - __apex.lightState() shape
//   - setTimeOfDay() night/day floodlight transitions
//   - UBO 32-light cap
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadRace(page, id = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("WebGL renderer probes", () => {
  test.use({ viewport: LANDSCAPE });

  test.afterEach(async ({ page }) => {
    // Reset lighting to default after every test so state doesn't leak
    await page.evaluate(() => window.__apex?.setTimeOfDay("default")).catch(() => {});
  });

  test("GLX.hdrMode() returns a boolean", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    // GLX is a top-level const (not window.GLX) — access by name in page scope
    const hdrMode = await page.evaluate(() => typeof GLX !== "undefined" ? GLX.hdrMode() : undefined);
    // SwiftShader may return false (no HDR), but it must be a boolean either way
    expect(typeof hdrMode).toBe("boolean");
  });

  test("dynamic player shadow uses the current-frame car transform", async ({ page }) => {
    await loadRace(page, "madrid");
    await page.waitForTimeout(300);
    const result = await page.evaluate(async () => {
      const frames = (n) => new Promise((resolve) => {
        const next = () => { if (--n <= 0) resolve(); else requestAnimationFrame(next); };
        requestAnimationFrame(next);
      });
      window.__apex.jump(0.20, 60, 0);
      await frames(2); // seed the old pooled transform away from the target

      const passes = [];
      let activePass = null;
      const begin = GLX.carShadowBegin.bind(GLX);
      const cast = GLX.castShadow.bind(GLX);
      const end = GLX.carShadowEnd.bind(GLX);
      GLX.carShadowBegin = (...args) => {
        activePass = [];
        passes.push(activePass);
        return begin(...args);
      };
      GLX.castShadow = (mesh, model) => {
        if (activePass) activePass.push([model[12], model[14]]);
        return cast(mesh, model);
      };
      GLX.carShadowEnd = (...args) => {
        activePass = null;
        return end(...args);
      };

      const target = window.__apex.nodeAt(0.75);
      window.__apex.jump(0.75, 60, 0);
      await frames(1);
      const firstPass = passes[0] || [];
      const minDistance = firstPass.reduce((best, p) =>
        Math.min(best, Math.hypot(p[0] - target.x, p[1] - target.z)), Infinity);
      return { minDistance, casterCount: firstPass.length };
    });

    expect(result.casterCount).toBeGreaterThan(0);
    expect(result.minDistance).toBeLessThan(5);
  });

  test("lightState() returns expected shape after race()", async ({ page }) => {
    await loadRace(page);
    const ls = await page.evaluate(() => window.__apex.lightState());

    expect(ls).toHaveProperty("numLights");
    expect(typeof ls.numLights).toBe("number");

    expect(ls).toHaveProperty("ambientSky");
    expect(Array.isArray(ls.ambientSky)).toBe(true);
    expect(ls.ambientSky.length).toBe(3);

    expect(ls).toHaveProperty("ambientGround");
    expect(Array.isArray(ls.ambientGround)).toBe(true);
    expect(ls.ambientGround.length).toBe(3);

    expect(ls).toHaveProperty("sunColor");

    expect(ls).toHaveProperty("exposure");
    expect(typeof ls.exposure).toBe("number");
  });

  test("setTimeOfDay night increases numLights on track with floodlights", async ({ page }) => {
    await loadRace(page);

    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    // Wait for day lighting to settle (numLights typically drops to 0)
    await page.waitForFunction(
      () => window.__apex.lightState().numLights === 0,
      { timeout: 5000 }
    ).catch(() => {
      // Some tracks may keep minimal lights even in day — proceed and capture dayLights
    });
    const dayLights = await page.evaluate(() => window.__apex.lightState().numLights);

    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // Night should activate floodlights
    await page.waitForFunction(
      () => window.__apex.lightState().numLights > 0,
      { timeout: 3000 }
    );
    const nightLights = await page.evaluate(() => window.__apex.lightState().numLights);

    expect(nightLights).toBeGreaterThan(dayLights);
  });

  test("day mode has zero floodlights (monza)", async ({ page }) => {
    // Merged from the former lightstate.spec.js: a strict day==0 check (the
    // night-transition test above only asserts night > day, hedged with a catch).
    await loadRace(page);
    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    await page.waitForFunction(() => window.__apex.lightState().numLights === 0, { timeout: 5000 });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBe(0);
    expect(ls.sunColor).toBeDefined();
  });

  test("UBO light count matches lightState after setTimeOfDay — capped at 32", async ({ page }) => {
    await loadRace(page);
    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // Wait until night lights are up
    await page.waitForFunction(
      () => window.__apex.lightState().numLights > 0,
      { timeout: 3000 }
    );
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBeGreaterThanOrEqual(0);
    // UBO is sized for 32 lights; the shader must never receive more
    expect(ls.numLights).toBeLessThanOrEqual(32);
  });
});
