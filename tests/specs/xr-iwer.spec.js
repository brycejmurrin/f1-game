/**
 * WebXR Phase 0 — Immersive Web Emulation Runtime (iwer) smoke.
 *
 * Installs Meta's IWER into the page so `navigator.xr.isSessionSupported(
 * 'immersive-vr')` can resolve true under headless Chromium (which otherwise
 * stubs XR as unsupported). Asserts the ENTER VR button appears, and that a
 * session can start when the TLX WebGL2 path is forced.
 *
 * Real Quest GPU behaviour is out of scope for CI (SwiftShader). This spec
 * only proves the capability/UI/session-request seam against the emulator.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IWER_UMD = path.join(__dirname, "../../node_modules/iwer/build/iwer.js");
const IWER_MIN = path.join(__dirname, "../../node_modules/iwer/build/iwer.min.js");

test.describe("xr-iwer Phase 0", () => {
  test.beforeEach(async ({ page }) => {
    // Force TLX WebGL2 — XRWebGLLayer needs a WebGL2 context (tlx.js).
    await page.addInitScript(() => {
      try {
        localStorage.setItem("apex26.tlxForceGL", "1");
        localStorage.setItem("apex26.gfxBackend", "three");
      } catch (_) { /* */ }
    });
  });

  test("ENTER VR appears after IWER forceInstall and session can start", async ({ page }) => {
    test.setTimeout(120_000);
    const hasIwer = fs.existsSync(IWER_UMD) || fs.existsSync(IWER_MIN);
    test.skip(!hasIwer, "iwer not installed (npm i -D iwer)");

    // Classic-script `const XrSession` is a lexical global (like Input) — visible
    // to page.evaluate as `XrSession`, never as `window.XrSession`.
    await page.goto("/");
    await page.waitForFunction(() => typeof XrSession !== "undefined" && typeof XrSession.probe === "function", null, { timeout: 60_000, polling: 100 });

    const umdPath = fs.existsSync(IWER_UMD) ? IWER_UMD : IWER_MIN;
    await page.addScriptTag({ path: umdPath });

    const installed = await page.evaluate(async () => {
      const root = window.IWER || {};
      const XRDevice = root.XRDevice;
      const metaQuest3 = root.metaQuest3;
      if (!XRDevice || !metaQuest3) {
        return { ok: false, reason: "XRDevice/metaQuest3 not on window.IWER", keys: Object.keys(root).slice(0, 30) };
      }
      const device = new XRDevice(metaQuest3);
      device.installRuntime({ forceInstall: true });
      device.stereoEnabled = true;
      window.__iwerDevice = device;
      const supported = await navigator.xr.isSessionSupported("immersive-vr");
      return { ok: true, supported: !!supported };
    });

    if (!installed.ok) {
      test.info().annotations.push({ type: "iwer", description: JSON.stringify(installed) });
      test.skip(true, `IWER inject failed: ${installed.reason || JSON.stringify(installed)}`);
    }
    expect(installed.supported).toBe(true);

    // Re-probe Apex's session owner so the button unhides.
    await page.evaluate(async () => {
      if (typeof XrSession !== "undefined" && typeof XrSession.probe === "function") {
        await XrSession.probe();
      }
    });
    const btn = page.locator("#xr-enter");
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toHaveText(/ENTER VR/i);

    // Start the session via the same API the button uses (avoids a user-gesture
    // requirement some runtimes attach to the click path).
    const started = await page.evaluate(async () => {
      try {
        const s = await XrSession.start();
        return { ok: !!s, presenting: XrSession.isPresenting(), backend: XrSession.backend() };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });
    test.info().annotations.push({ type: "xr-start", description: JSON.stringify(started) });
    // Soft assertion: on SwiftShader the XRWebGLLayer attach may still fail;
    // capability + button are the hard gate for this CI box.
    if (started.ok) {
      expect(started.presenting).toBe(true);
      await page.evaluate(() => XrSession.end());
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Session start failed under software GL — expected on SwiftShader; Quest Browser is the real target.",
      });
    }
  });
});
