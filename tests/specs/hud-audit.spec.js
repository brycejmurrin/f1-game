// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";

const LS = { width: 844, height: 390 };
const PT = { width: 390, height: 844 };

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}
async function startParked(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  const rd = await page.evaluate(() => { const e = document.getElementById("rotate-device"); if(e) e.hidden=true; });
  await page.evaluate(() => window.__apex.park(0.25));
  await page.waitForTimeout(600);
}

// Seed preferences before one boot. These are HUD DOM/canvas checks: headless
// leaves HUD updates live but skips the unrelated 3D render and rig/mirror warm.
async function loadWithMode(page, steerMode, manual = false) {
  await page.addInitScript(({ sm, m }) => {
    localStorage.setItem("apex26.steerMode", sm);
    localStorage.setItem("apex26.manual", m ? "true" : "false");
  }, { sm: steerMode, m: manual });
  await page.goto("/");
  await waitReady(page);
  await page.evaluate(() => window.__apex.headless(true));
  await startParked(page);
}

async function shot(page, name) {
  // The 3D canvas is intentionally frozen: these captures establish HUD/control
  // layout only, not renderer or world-camera coverage.
  await page.waitForTimeout(200);
  await page.screenshot({ path: galleryPath("hud-audit", `hud-audit-${name}.png`), fullPage: false });
}

// Assert the HUD actually rendered (not a blank/broken canvas that screenshots
// silently), and that button/touch modes show their on-screen controls. Without
// hasTouch:true (added to the describes below) the game applies body.desktop and
// HIDES the steer/gas buttons, so these shots used to capture the wrong thing.
async function assertHud(page, steerMode) {
  await expect(page.locator("#hud")).toBeVisible();
  if (steerMode === "buttons" || steerMode === "touch") {
    // In-race on-screen steering controls must be present in these modes.
    await expect(page.locator("#btn-steer-left, #btn-throttle").first()).toBeVisible();
  }
}

// ── LANDSCAPE ────────────────────────────────────────────
test.describe("HUD landscape", () => {
  test.use({ viewport: LS, hasTouch: true });

  test("tilt auto-gear", async ({ page }) => {
    await loadWithMode(page, "tilt", false);
    await assertHud(page, "tilt"); await shot(page, "ls-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await loadWithMode(page, "tilt", true);
    await assertHud(page, "tilt"); await shot(page, "ls-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await loadWithMode(page, "buttons", false);
    await assertHud(page, "buttons"); await shot(page, "ls-buttons");
  });
  test("touch", async ({ page }) => {
    await loadWithMode(page, "touch", false);
    await assertHud(page, "touch"); await shot(page, "ls-touch");
  });

  test("colourblind minimap labels follow the live preference without a reload", async ({ page }) => {
    await page.addInitScript(() => {
      const labels = new WeakMap(), ids = new WeakMap();
      const probe = { background: 0, draws: 0, labels: [] };
      let nextId = 0;
      Object.defineProperty(window, "__minimapCueProbe", { value: probe });
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (text === "S1" || text === "S2" || text === "S3") {
          const seen = labels.get(this.canvas) || [];
          if (seen.length < 12) seen.push(text);
          labels.set(this.canvas, seen);
        }
        return Reflect.apply(fillText, this, [text, ...args]);
      };
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        const target = this.canvas;
        if (target instanceof HTMLCanvasElement && target.id === "minimap" && image instanceof HTMLCanvasElement
            && image.width === target.width && image.height === target.height && image !== target) {
          if (!ids.has(image)) ids.set(image, ++nextId);
          probe.background = ids.get(image); probe.draws++;
          probe.labels = Array.from(labels.get(image) || []);
        }
        return Reflect.apply(drawImage, this, [image, ...args]);
      };
    });
    await loadWithMode(page, "touch", false);
    await page.evaluate(() => window.__apex.freeze(false)); // park freezes HUD refreshes; this case exercises live preference redraws.
    await assertHud(page, "touch");
    await expect(page.locator("#minimap")).toBeVisible();
    await page.evaluate("A11yOpts.setCb('off')");
    await page.waitForFunction(() => {
      const p = Reflect.get(window, "__minimapCueProbe");
      return p.draws > 0 && p.labels.length === 0;
    }, null, { polling: 100, timeout: BOOT_MS });
    const off = await page.evaluate(() => ({ ...Reflect.get(window, "__minimapCueProbe") }));
    expect(off.labels).toEqual([]);

    await page.evaluate("A11yOpts.setCb('on')");
    await expect(page.locator("html")).toHaveAttribute("data-cb-cues", "on");
    await page.waitForFunction((previous) => {
      const p = Reflect.get(window, "__minimapCueProbe");
      return p.background !== previous && p.labels.join(",") === "S1,S2,S3";
    }, off.background, { polling: 100, timeout: BOOT_MS });
    const on = await page.evaluate(() => ({ ...Reflect.get(window, "__minimapCueProbe") }));
    expect(on.draws).toBeGreaterThan(off.draws);
    await shot(page, "ls-cues-on");

    await page.evaluate("A11yOpts.setCb('off')");
    await expect(page.locator("html")).not.toHaveAttribute("data-cb-cues", "on");
    await page.waitForFunction((previous) => {
      const p = Reflect.get(window, "__minimapCueProbe");
      return p.background !== previous && p.labels.length === 0;
    }, on.background, { polling: 100, timeout: BOOT_MS });
    const restored = await page.evaluate(() => ({ ...Reflect.get(window, "__minimapCueProbe") }));
    expect(restored.draws).toBeGreaterThan(on.draws);
    await shot(page, "ls-cues-off-restored");
  });
});

// ── PORTRAIT ─────────────────────────────────────────────
test.describe("HUD portrait", () => {
  test.use({ viewport: PT, hasTouch: true });

  test("tilt auto-gear", async ({ page }) => {
    await loadWithMode(page, "tilt", false);
    await assertHud(page, "tilt"); await shot(page, "pt-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await loadWithMode(page, "tilt", true);
    await assertHud(page, "tilt"); await shot(page, "pt-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await loadWithMode(page, "buttons", false);
    await assertHud(page, "buttons"); await shot(page, "pt-buttons");
  });
  test("touch", async ({ page }) => {
    await loadWithMode(page, "touch", false);
    await assertHud(page, "touch"); await shot(page, "pt-touch");
  });
});
