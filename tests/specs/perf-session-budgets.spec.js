/* Software-GL session budgets: garage first draw, race grid, first-30s frames, quit heap.
 *
 * Hang ceilings (tools/perf/session-budgets.mjs) fail the run. Phone-class
 * lines are recorded on the annotation and the artifact, and fail only with
 * APEX_PERF_SESSION_STRICT=1. The renderer pin is three.js forced onto WebGL2
 * (apex26.tlxForceGL=1) because this container's GL is software. The report
 * names the backend that actually bound.
 *
 * Run: node tools/ci/test-bg.mjs --spec tests/specs/perf-session-budgets.spec.js
 *      npm run test:perf-session
 * Docs: docs/notes/PERF-SESSION-BUDGETS.md
 */
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import {
  RACE_WINDOW_MS, TRACK, sessionReport,
  installSessionPins, readBackend, menuQuiet, garageFirstDraw, timeToGrid,
  sampleRaceWindow, quitToMenu, heapMB, writeArtifact,
} from "../helpers/perf-session.mjs";

const ARTIFACT_DIR = "artifacts/perf-session";

test.describe("perf session budgets — software GL", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("garage, grid, first 30s and quit-to-menu heap", async ({ page }) => {
    test.setTimeout(720_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(installSessionPins);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

    const backend = await page.evaluate(readBackend);
    expect(backend.backend, "session budget must run on three.js").toBe("three");
    expect(backend.api, "software GL forces TLX onto WebGL2 via apex26.tlxForceGL=1").toBe("webgl2");

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable");

    const garage = await garageFirstDraw(page);
    expect(garage.from, "first garage frame is the menu tap").toBe("menu");
    expect(garage.tapMs).toBeGreaterThan(0);

    await page.evaluate(() => document.getElementById("cs-back").click());
    await page.waitForFunction(() => {
      const cs = document.getElementById("carsetup");
      return window.__apex.info().state === "menu" && (!cs || cs.hidden);
    }, null, { polling: 100, timeout: 30_000 });

    const beforeQuiet = await menuQuiet(page);
    const before = await heapMB(page, cdp);

    const grid = await timeToGrid(page, TRACK);
    expect(["count", "race"], "grid wait must land on the formation or the race").toContain(grid.state);
    expect(grid.ms).toBeGreaterThan(0);

    const sampled = await sampleRaceWindow(page, RACE_WINDOW_MS);
    const frames = sampled.samples;

    await quitToMenu(page);
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("menu");
    const afterQuiet = await menuQuiet(page);
    const after = await heapMB(page, cdp);

    const measured = {
      garageFirstDrawMs: garage.tapMs,
      raceGridMs: grid.ms,
      frames,
      heapBeforeMB: before.mb,
      heapAfterMB: after.mb,
      heapGate: beforeQuiet.quiet && afterQuiet.quiet && before.mb != null && after.mb != null,
    };
    const report = sessionReport(measured);
    const payload = {
      at: new Date().toISOString(),
      backend,
      garage,
      grid,
      frames: report.frames,
      frameSamples: frames.length,
      frameCoveredMs: sampled.coveredMs,
      lights: sampled.lights,
      frameDeltas: frames.length > 80 ? frames.slice(0, 40) : frames,
      governor: sampled.governor,
      heap: { before, after, growth: report.heap, beforeQuiet, afterQuiet, gated: measured.heapGate },
      report: report.rows,
      pass: report.pass,
      strict: report.strict,
    };
    const artifactFile = writeArtifact(ARTIFACT_DIR, payload);
    await test.info().attach("perf-session.json", { path: artifactFile, contentType: "application/json" });
    test.info().annotations.push({
      type: "perf-session-backend",
      description: `backend=${backend.backend} api=${backend.api} gl=${backend.gl || "n/a"}`,
    });
    for (const row of report.rows) {
      test.info().annotations.push({ type: "perf-session", description: row.detail });
    }
    if (!measured.heapGate) {
      test.info().annotations.push({
        type: "perf-session-heap-recorded",
        description: `heap ${report.heap.growthMB} MB not gated (quiet before=${beforeQuiet.quiet} after=${afterQuiet.quiet})`,
      });
    }
    expect(frames.length, "the race window produced no animation frames").toBeGreaterThan(0);
    expect(sampled.coveredMs, `rAF deltas covered ${sampled.coveredMs} ms of the ${RACE_WINDOW_MS} ms window`).toBeGreaterThan(RACE_WINDOW_MS * 0.5);
    expect(report.pass, report.rows.map((r) => r.detail).join(" | ")).toBe(true);
  });
});
