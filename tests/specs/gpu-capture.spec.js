// @ts-check
// gpu-capture.spec.js — __apex.gpuCapture Spector / webgl-lint toggle (#2964).
// Off by default; enable returns JSON capture summary or lint findings on
// SwiftShader (GLX WebGL2). Does not touch gfx.js / tlx.js.
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

test.describe.configure({ timeout: 120_000 });

const LANDSCAPE = { width: 844, height: 390 };

async function bootGlx(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) { /* private */ }
    try { localStorage.removeItem("apex26.gpuCapture"); } catch (_) { /* private */ }
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("GPU capture hooks", () => {
  test.use({ viewport: LANDSCAPE });

  test("gpuCapture is off by default and costs no Spector/webgl-lint script", async ({ page }) => {
    await bootGlx(page);
    const st = await page.evaluate(() => window.__apex.gpuCapture());
    expect(st.on).toBe(false);
    expect(st.mode).toBeNull();
    const scripts = await page.evaluate(() =>
      [...document.querySelectorAll("script[data-apex-gpu-capture]")].map((s) => s.dataset.apexGpuCapture));
    expect(scripts).toEqual([]);
  });

  test("spector mode returns a capture summary JSON on SwiftShader", async ({ page }) => {
    await bootGlx(page);
    await page.evaluate((t) => window.__apex.race(t), "monza");
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
    await page.evaluate(() => window.__apex.go());
    // A few frames so Spector has GL traffic to record.
    await page.evaluate(() => new Promise((r) => {
      let n = 0; const tick = () => (++n >= 8 ? r() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));

    const enabled = await page.evaluate(async () => {
      const st = await window.__apex.gpuCapture("spector");
      return st;
    });
    expect(enabled.on).toBe(true);
    expect(enabled.mode).toBe("spector");

    const summary = await page.evaluate(async () => window.__apex.gpuCapture("capture"));
    expect(summary && typeof summary === "object").toBe(true);
    // Soft adapter / missing canvas still returns structured JSON (ok:false + reason).
    expect(summary).toHaveProperty("ok");
    if (summary.ok) {
      expect(typeof summary.commandCount).toBe("number");
      expect(Array.isArray(summary.commandNames)).toBe(true);
      expect(summary.mode).toBe("spector");
    } else {
      expect(typeof summary.reason).toBe("string");
    }
  });

  test("webgl-lint mode returns findings JSON", async ({ page }) => {
    await bootGlx(page);
    await page.evaluate((t) => window.__apex.race(t), "monza");
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => new Promise((r) => {
      let n = 0; const tick = () => (++n >= 4 ? r() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));

    const enabled = await page.evaluate(async () => window.__apex.gpuCapture("webgl-lint"));
    expect(enabled.on).toBe(true);
    expect(enabled.mode).toBe("webgl-lint");

    const report = await page.evaluate(() => window.__apex.gpuCapture("findings"));
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("webgl-lint");
    expect(Array.isArray(report.findings)).toBe(true);
    expect(typeof report.findingCount).toBe("number");
  });
});
