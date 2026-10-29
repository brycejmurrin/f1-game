// @ts-check
/** Software-GL stall watchdog — first Start Race must not reload to the title (#4180 shed).
 *
 * Playwright + SwiftShader, three forced to WebGL2 (apex26.tlxForceGL=1), ?stallwatch=1.
 * Before fix (tip b67866b): stallReloads 1 ~30 s into the first cold Bahrain race.
 * After fix: reload budget stays 0; a glacial shed records act budget-sw.
 *
 * Run: node tools/ci/test-bg.mjs --spec tests/specs/stall-reload-sw.spec.js
 */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = "artifacts/stall-reload-sw";
const GRID_TIMEOUT_MS = 240_000;

function installPins() {
  window.__TEST_MODE = true;
  try {
    sessionStorage.removeItem("apex26.stallReloads");
    sessionStorage.removeItem("apex26.ctxLostNotice");
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "1");
    localStorage.removeItem("apex26.envProbeOff");
    localStorage.removeItem("apex26.perChunkOff");
  } catch (_) { /* private mode */ }
}

function readBackend() {
  let backend = null, api = null, gl = null;
  try {
    if (typeof GLX !== "undefined") {
      backend = GLX.backend || null;
      const st = GLX.backendState ? GLX.backendState() : null;
      api = st && st.api ? st.api : null;
    }
  } catch (_) { /* identity stays null */ }
  try {
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (g) {
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      gl = String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER));
    }
  } catch (_) { gl = null; }
  return { backend, api, gl };
}

test.describe("stall reload — software GL race shed", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("cold Bahrain race reaches the grid without a stall reload", async ({ page }) => {
    test.setTimeout(GRID_TIMEOUT_MS + BOOT_MS + 60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(installPins);
    await page.goto("/?stallwatch=1");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

    const backend = await page.evaluate(readBackend);
    expect(backend.backend, "probe runs on three.js").toBe("three");
    expect(backend.api, "tlxForceGL pins WebGL2 on software GL").toBe("webgl2");

    const t0 = await page.evaluate(() => performance.now());
    const started = await page.evaluate(() => {
      try { window.__apex.headless(true); } catch (_) { /* optional */ }
      return !!window.__apex.race("bahrain", "day", "wet");
    });
    expect(started).toBe(true);

    await page.waitForFunction(() => {
      const info = window.__apex.info();
      return info && info.track === "bahrain" && (info.state === "count" || info.state === "race");
    }, null, { polling: 250, timeout: GRID_TIMEOUT_MS });

    const result = await page.evaluate((start) => {
      const info = window.__apex.info();
      const stall = typeof LoopHealth !== "undefined" ? LoopHealth.state().stall : null;
      let reloads = 0;
      try { reloads = parseInt(sessionStorage.getItem("apex26.stallReloads"), 10) || 0; } catch (_) { reloads = 0; }
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        gridMs: Math.round(performance.now() - start),
        state: info.state,
        reloads,
        navType: nav && nav.type,
        stall,
      };
    }, t0);

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const artifact = path.join(ARTIFACT_DIR, "after-fix.json");
    fs.writeFileSync(artifact, JSON.stringify({ at: new Date().toISOString(), backend, result, before: { reloads: 1, gridMsApprox: 97000, tip: "b67866b" } }, null, 2));
    await test.info().attach("stall-reload-sw.json", { path: artifact, contentType: "application/json" });

    test.info().annotations.push({
      type: "perf-stall-reload-sw",
      description: `backend=${backend.backend}/${backend.api} gl=${backend.gl || "?"} gridMs=${result.gridMs} reloads=${result.reloads} act=${result.stall && result.stall.act}`,
    });

    expect(result.reloads, "first cold race must not spend the stall reload budget").toBe(0);
    expect(result.navType, "must not navigate away to the title").not.toBe("reload");
    if (result.stall && result.stall.act) {
      expect(result.stall.act, "software shed path records budget-sw, not reload").not.toBe("reload");
    }
  });
});
