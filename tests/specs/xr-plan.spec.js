/**
 * Task 20 — XRPlan boot path (IWER). Asserts armed webgl2 ⇒ GLX xrCompatible
 * and ApexXR.stats().path; armed webgpu without XRGPUBinding falls back.
 * Spec-level only — not Quest GPU evidence.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import {
  installIwer, waitXrReady, IWER_VENDOR, IWER_VERSION,
} from "../helpers/iwer-install.mjs";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  test.skip(!fs.existsSync(IWER_VENDOR), `pinned IWER ${IWER_VERSION} missing under tests/vendor/`);
  await installIwer(page, { stereo: true });
});

test("armed webgl2: ApexXR path is webgl2 and GL context is xrCompatible when navigator.xr", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.xr", "1");
      localStorage.setItem("apex26.xrBackend", "webgl2");
      localStorage.setItem("apex26.xrCaps", "1");
      // Prefer GLX so getContextAttributes is ours (bootPick also forces webgl2).
      localStorage.setItem("apex26.gfxBackend", "webgl2");
    } catch (_) { /* */ }
  });
  await page.goto("/");
  await waitXrReady(page);

  const info = await page.evaluate(async () => {
    if (typeof ApexXR !== "undefined" && ApexXR.detect) await ApexXR.detect();
    const stats = (typeof ApexXR !== "undefined" && ApexXR.stats) ? ApexXR.stats() : null;
    const pick = (typeof ApexXR !== "undefined" && ApexXR.bootPick) ? ApexXR.bootPick() : null;
    const gfxBackend = localStorage.getItem("apex26.gfxBackend");
    let xrCompatible = null;
    try {
      const c = document.getElementById("game");
      const gl = c && (c.getContext("webgl2") || null);
      if (gl && gl.getContextAttributes) xrCompatible = !!gl.getContextAttributes().xrCompatible;
    } catch (_) { xrCompatible = null; }
    return { stats, pick, gfxBackend, xrCompatible, hasXr: !!navigator.xr };
  });

  expect(info.pick, JSON.stringify(info)).toBe("webgl2");
  expect(info.stats && info.stats.path, JSON.stringify(info)).toBe("webgl2");
  expect(info.gfxBackend).toBe("webgl2");
  if (info.hasXr) {
    expect(info.xrCompatible, "GLX should request xrCompatible when navigator.xr exists").toBe(true);
  }
});

test("armed webgpu without XRGPUBinding: path falls back to webgl2 with a fallback entry", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.xr", "1");
      localStorage.setItem("apex26.xrBackend", "webgpu");
      localStorage.setItem("apex26.xrCaps", "1");
      localStorage.setItem("apex26.gfxBackend", "webgl2");
    } catch (_) { /* */ }
  });
  await page.goto("/");
  await waitXrReady(page);

  const info = await page.evaluate(async () => {
    if (typeof ApexXR !== "undefined" && ApexXR.detect) await ApexXR.detect();
    const stats = ApexXR.stats();
    const hasBinding = typeof globalThis.XRGPUBinding !== "undefined";
    return {
      path: stats.path,
      fallbacks: stats.fallbacks,
      hasBinding,
      gfxBackend: localStorage.getItem("apex26.gfxBackend"),
    };
  });

  // IWER / SwiftShader typically has no XRGPUBinding — expect the ladder.
  if (!info.hasBinding) {
    expect(info.path).toBe("webgl2");
    expect(info.fallbacks.length).toBeGreaterThan(0);
  } else {
    // If a binding exists in this Chromium, either path is acceptable — record it.
    expect(["webgl2", "webgpu"]).toContain(info.path);
  }
  expect(info.gfxBackend).toBe("webgl2");
});
