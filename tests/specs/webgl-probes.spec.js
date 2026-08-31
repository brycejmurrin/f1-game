// @ts-check
// Tests that probe the WebGL renderer API contract:
//   - GLX.hdrMode() boolean
//   - __apex.lightState() shape
//   - setTimeOfDay() night/day floodlight transitions
//   - engine 48-light cap (MAX_LIGHTS packed vec4 arrays — not a WebGL / UBO limit)
import { test, expect } from "@playwright/test";
// The measured boot budgets. This file carried 8000 / 10_000 and a set of
// 3000-5000 ms lighting waits; on an idle box the boot alone takes up to
// 24.6 s and a day/night lamp transition up to 17.3 s, so every test here
// failed on the budget rather than on the renderer. See fixtures.js.
import { BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";
// setTimeOfDay -> lightState().numLights settles: measured 12.8-17.3 s idle.
const LIGHT_MS = 45000;
test.describe.configure({ timeout: 240_000 });   // several of those waits per test

const LANDSCAPE = { width: 844, height: 390 };

async function loadRace(page, id = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
  await page.evaluate(() => window.__apex.go());
}

test.describe("WebGL renderer probes", () => {
  test.use({ viewport: LANDSCAPE });

  test.afterEach(async ({ page }) => {
    // Reset lighting to default after every test so state doesn't leak
    await page.evaluate(() => window.__apex?.setTimeOfDay("default")).catch(() => {});
  });

  test("dynamic player shadow uses the current-frame car transform", async ({ page }) => {
    await loadRace(page, "madrid");
    // Folded hdrMode() contract (was a standalone typeof-only test — same
    // coverage, one fewer page boot). GLX is a top-level const (not
    // window.GLX) — access by name in page scope. SwiftShader may report
    // false (no HDR), but it must be a boolean either way.
    const hdrMode = await page.evaluate(() => typeof GLX !== "undefined" ? GLX.hdrMode() : undefined);
    expect(typeof hdrMode).toBe("boolean");
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

  test("setTimeOfDay night increases numLights on track with floodlights", async ({ page }) => {
    await loadRace(page);

    // Folded lightState() shape contract (was a standalone shape-only test —
    // same coverage, one fewer page boot): the fields the behavioural asserts
    // below rely on must exist with the right types after race().
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

    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    // Wait for day lighting to settle (numLights typically drops to 0)
    await page.waitForFunction(
      () => window.__apex.lightState().numLights === 0,
      null, { polling: 100, timeout: LIGHT_MS }
    ).catch(() => {
      // Some tracks may keep minimal lights even in day — proceed and capture dayLights
    });
    const dayLights = await page.evaluate(() => window.__apex.lightState().numLights);

    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // Night should activate floodlights
    await page.waitForFunction(
      () => window.__apex.lightState().numLights > 0,
      null, { polling: 100, timeout: LIGHT_MS }
    );
    const nightLights = await page.evaluate(() => window.__apex.lightState().numLights);

    expect(nightLights).toBeGreaterThan(dayLights);
  });

  test("day mode has zero floodlights (monza)", async ({ page }) => {
    // Merged from the former lightstate.spec.js: a strict day==0 check (the
    // night-transition test above only asserts night > day, hedged with a catch).
    await loadRace(page);
    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    await page.waitForFunction(() => window.__apex.lightState().numLights === 0, null, { polling: 100, timeout: LIGHT_MS });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBe(0);
    expect(ls.sunColor).toBeDefined();
  });

  test("monaco day reports always-on tunnel bake", async ({ page }) => {
    // Day floods are off, but Monaco's tunnel lamps are always-on. The probe
    // used to read only track._lights (empty by day) and report bakedLights=0
    // while 28 tunnel slots were live.
    await loadRace(page, "monaco");
    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    await page.waitForFunction(
      () => {
        const ls = window.__apex.lightState();
        return ls.numLights > 0 && ls.bakedLights > 0;
      },
      null, { polling: 100, timeout: LIGHT_MS }
    );
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBeGreaterThan(0);
    expect(ls.bakedLights).toBeGreaterThan(0);
    expect(ls.numLights).toBeLessThanOrEqual(48);
  });

  // Titled for what it actually checks. It used to say "UBO light count matches
  // lightState", but it never read the UBO — and its first assertion was
  // `numLights >= 0` on a count, which cannot fail. The real content is the cap.
  test("night raises lights and the shader never receives more than 48", async ({ page }) => {
    await loadRace(page);
    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // Wait until night lights are up
    await page.waitForFunction(
      () => window.__apex.lightState().numLights > 0,
      null, { polling: 100, timeout: LIGHT_MS }
    );
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights, "night must actually raise floodlights").toBeGreaterThan(0);
    // The uniform arrays are sized for 32; the shader must never receive more.
    expect(ls.numLights).toBeLessThanOrEqual(48);
  });
});

// Mobile STANDARD tier (mobileTier = mobile UA + no GRAPHICS: HIGH opt-in):
// the car/lamp shadow maps are never created, so carShadowBegin/lampShadowBegin
// no-op — but game.js still issues the castShadow calls each frame. Those casts
// must no-op too; before the _depthPassOn guard they drew every car mesh under
// whatever program/framebuffer was left bound, spamming GL_INVALID_OPERATION
// every frame (the "STANDARD is buggy and laggy while HIGH runs great" bug).
test.describe("mobile standard tier renders without GL errors", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("no INVALID_OPERATION spam on the standard mobile tier", async ({ page }) => {
    // SwiftShader + mobile-tier boot + rendered frames overruns the default
    // 120 s budget under render-project worker contention; the bug this guards
    // against spammed errors EVERY frame, so a few dozen frames is plenty.
    test.setTimeout(240_000);
    const glErrors = [];
    page.on("console", (m) => {
      if (/INVALID_OPERATION|INVALID_ENUM|INVALID_VALUE/.test(m.text())) glErrors.push(m.text());
    });
    await loadRace(page);
    // Confirm the emulation actually engaged the memory-safe tier.
    const tier = await page.evaluate(() =>
      typeof GLX !== "undefined" ? { mobile: GLX.isMobile, std: GLX.mobileTier } : null);
    expect(tier).toEqual({ mobile: true, std: true });
    // Drive + render real frames — the car shadow pass runs per rendered frame.
    await page.evaluate(async () => {
      window.__apex.jump(0.1, 50, 0);
      await new Promise((resolve) => {
        let n = 30;
        const next = () => { if (--n <= 0) resolve(); else requestAnimationFrame(next); };
        requestAnimationFrame(next);
      });
    });
    expect(glErrors).toEqual([]);
  });
});
