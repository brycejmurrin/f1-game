// @ts-check
/** Software-GL stall watchdog — stressed on fix head (CI).
 *
 * Matched deploy-tip vs fix-head: `node tools/gfx/stall-reload-sw-oracle.mjs`
 */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import fs from "node:fs";
import path from "node:path";
import {
  stallReloadStressInitScript,
  runStressedStallProbe,
} from "../helpers/stall-reload-stress.mjs";

const ARTIFACT_DIR = "artifacts/stall-reload-sw";

test.describe("stall reload — software GL race shed", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("stressed cold Bahrain records budget-sw, not reload", async ({ page }) => {
    test.setTimeout(600_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(stallReloadStressInitScript);
    await page.goto("/?stallwatch=1");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

    const result = await runStressedStallProbe(page, { bootMs: BOOT_MS, stressMs: 300_000 });
    const body = result.stall?.act ? result : (result.peak?.stall?.act ? result.peak : result);
    expect(result.timedOut, "watchdog must act under stress").toBe(false);
    const backend = body.backend || result.peak?.backend || result.backend;
    expect(backend?.api, "tlxForceGL pins WebGL2 on software GL").toBe("webgl2");
    if (backend?.backend) expect(backend.backend, "three.js backend").toBe("three");

    const stall = body.stall || {};
    expect(stall.act, "software shed skips reload").toBe("budget-sw");
    expect(result.reloads, "fix head must not reload").toBe(0);
    expect(result.reloaded, "fix head must not navigate reload").toBe(false);

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const artifact = path.join(ARTIFACT_DIR, "spec-stressed-head.json");
    fs.writeFileSync(artifact, JSON.stringify({ at: new Date().toISOString(), result }, null, 2));
    await test.info().attach("stall-reload-sw-stressed.json", { path: artifact, contentType: "application/json" });

    test.info().annotations.push({
      type: "perf-stall-reload-sw",
      description: `backend=${result.backend?.backend}/${result.backend?.api} gridMs=${result.gridMs} reloads=${result.reloads} act=${stall.act} sheds=${stall.sheds} worstMs=${stall.worstMs}`,
    });
  });
});
