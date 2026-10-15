// @ts-check
// SwiftShader frame-time regression lane — fixed race, warm ~5 s, sample ~20 s.
// Soft by default (report via annotation); APEX_PERF_FRAMETIME_STRICT=1 fails on
// large deltas vs tests/data/perf-frametime-baseline.json.
//
// Measurement follows bench.html (rAF deltas in the live game loop + closed-loop
// driver) and agent-drive-bench boot patterns (fixtures, pinned GLX, landscape).
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { pinFactorySeat } from "../helpers/factory-seat.js";
import {
  SCENARIO,
  BASELINE_PATH,
  STRICT,
  compareToBaseline,
  writeArtifact,
  loadBaseline,
} from "../helpers/perf-frametime.mjs";
import { blessing } from "../helpers/baseline-blessing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const UPDATING = !!process.env.APEX_UPDATE_BASELINE;
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "perf-frametime");

if (!UPDATING && !fs.existsSync(BASELINE_PATH)) {
  throw new Error(`missing baseline ${path.relative(ROOT, BASELINE_PATH)} — run once with APEX_UPDATE_BASELINE=1`);
}

test.describe("perf frametime — SwiftShader race regression", () => {
  test.use({ viewport: SCENARIO.viewport });

  test("records p50/p95/p99, long tasks, and heap vs baseline", async ({ page }) => {
    test.setTimeout(600_000);

    await pinFactorySeat(page);
    await page.addInitScript((preset) => {
      try {
        localStorage.setItem("apex26.gfxPreset", JSON.stringify(preset));
      } catch (_) { /* private mode */ }
    }, SCENARIO.gfxPreset);

    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(({ track, tod, wx }) => window.__apex.race(track, tod, wx), {
      track: SCENARIO.track,
      tod: SCENARIO.tod,
      wx: SCENARIO.wx,
    });
    await awaitTrackBuild(page);
    await page.evaluate(() => window.__apex.go());

    await page.evaluate((cfg) => {
      const A = window.__apex;
      try {
        if (typeof GfxQuality !== "undefined" && GfxQuality.set) GfxQuality.set(cfg.gfxPreset, { noReload: true });
      } catch (_) { /* harness */ }
      A.safeMode(false);
      A.renderScale(cfg.renderScale);
      A.govHold(true);
      A.seed(cfg.seed);
      A.reset(cfg.startFrac, 55, 0, cfg.seed);
      A.aim(0);
      A.snapCam();

      const DISTS = [];
      for (let d = 5; d <= 160; d += 6) DISTS.push(d);
      const VMAX = 94;
      const A_BRAKE = 24;
      const A_LAT = 13;
      const KP = 2.4;
      let vHold = 30;
      let slow = 0;

      const tick = () => {
        let p;
        let pts;
        try {
          p = A.probe();
          if (!p) return;
          pts = A.scan(DISTS);
        } catch (_) {
          return;
        }
        let kSteer = p.k;
        const steerLook = Math.max(9, p.speed * 0.4);
        let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
        for (let j = 0; j < pts.length; j++) {
          const d = DISTS[j];
          const k = Math.abs(pts[j].k);
          if (d <= steerLook) kSteer = pts[j].k;
          const vCorner = k > 1e-4 ? Math.sqrt(A_LAT / k) : VMAX;
          const vAllow = Math.sqrt(vCorner * vCorner + 2 * A_BRAKE * d);
          if (vAllow < vT) vT = vAllow;
        }
        vT = Math.max(11, Math.min(VMAX, vT));
        vHold = Math.min(vT, vHold + 0.5);
        vT = vHold;
        const L = Math.max(8, Math.min(38, p.speed * 0.6));
        let steer = KP * (Math.atan2(kSteer * L * L * 0.5 - p.x, L) - p.angle);
        steer = Math.max(-1, Math.min(1, steer));
        let throttle = p.speed < vT;
        let brake = p.speed > vT * 1.04;
        if (p.speed < 3) slow++;
        else slow = 0;
        if (slow > 40) {
          steer = Math.max(-0.4, Math.min(0.4, steer));
          throttle = true;
          brake = false;
        } else if (Math.abs(p.x) - p.hw > 0.4) throttle = false;
        try {
          A.setInput({ steer, throttle, brake });
        } catch (_) { /* */ }
      };

      window.__apexPerfDriver = setInterval(tick, 16);
      requestAnimationFrame(() => tick());
    }, SCENARIO);

    await delay(SCENARIO.warmMs);
    await page.evaluate(() => window.__apex.frametimeBench("reset"));
    await delay(SCENARIO.sampleMs);
    const prep = await page.evaluate(() => {
      clearInterval(window.__apexPerfDriver);
      try {
        window.__apex.clearInput();
      } catch (_) { /* */ }
      const snap = window.__apex.frametimeBench("snapshot");
      const info = window.__apex.info() || {};
      const perf = window.__apex.perf() || {};
      const cars = (() => {
        try {
          const list = window.__apex.cars();
          return Array.isArray(list) ? list.length : null;
        } catch (_) {
          return null;
        }
      })();
      return {
        snap,
        cars,
        track: info.track,
        perf,
      };
    });

    expect(prep.snap, "frametimeBench snapshot").toBeTruthy();
    expect(prep.snap.frames, "PerfGov frame history (SwiftShader may be <1 fps)").toBeGreaterThan(4);

    const measured = {
      p50: prep.snap.p50,
      p95: prep.snap.p95,
      p99: prep.snap.p99,
      max: prep.snap.max,
      frames: prep.snap.frames,
      longTasks: prep.snap.longTasks,
      heapUsedMB: prep.snap.heapUsedMB,
      heapTotalMB: prep.snap.heapTotalMB,
    };

    const env = await page.evaluate(() => ({
      build: (document.querySelector('meta[name="apex-build"]') || {}).content || null,
      sha: (document.querySelector('meta[name="apex-sha"]') || {}).content || null,
    }));

    const payload = {
      at: new Date().toISOString(),
      scenario: { ...SCENARIO, cars: prep.cars, trackBuilt: prep.track },
      env,
      metrics: measured,
      perfSnapshot: prep.perf,
    };

    const artifactFile = writeArtifact(ARTIFACT_DIR, payload);
    await test.info().attach("perf-frametime.json", {
      path: artifactFile,
      contentType: "application/json",
    });

    test.info().annotations.push({
      type: "perf-frametime",
      description: `p50=${measured.p50} p95=${measured.p95} p99=${measured.p99} longTasks=${measured.longTasks} heapMB=${measured.heapUsedMB}`,
    });

    if (UPDATING) {
      const reason = (process.env.APEX_BASELINE_REASON || "").trim();
      if (!reason) {
        throw new Error("APEX_UPDATE_BASELINE=1 requires APEX_BASELINE_REASON");
      }
      const body = {
        scenario: payload.scenario,
        metrics: measured,
        _blessed: blessing({ scenario: payload.scenario, metrics: measured }, reason),
      };
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(body, null, 2) + "\n");
      test.info().annotations.push({ type: "baseline", description: `wrote ${BASELINE_PATH}` });
      return;
    }

    const baseline = loadBaseline();
    expect(baseline).toBeTruthy();
    const report = compareToBaseline(measured, baseline);
    test.info().annotations.push({
      type: "perf-regression-report",
      description: JSON.stringify(report.deltas),
    });

    if (report.regressions.length) {
      const msg = report.regressions.join("; ");
      if (STRICT) {
        expect(report.regressions, msg).toHaveLength(0);
      } else {
        test.info().annotations.push({ type: "perf-soft-warning", description: msg });
        console.log(`[perf-frametime soft] ${msg}`);
      }
    }
  });
});
