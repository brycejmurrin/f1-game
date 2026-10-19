// @ts-check
// WebKit iPhone-path boot probe — JavaScriptCore + WebKit WebGL as a proxy for
// the phone's three-WebGL2 path (`apex26.gfxBackend=three` + `tlxForceGL=1`).
//
// Selected ONLY by Playwright project `webkit` (`npm run test:webkit` /
// `.github/workflows/webkit-leg.yml`). Default Chromium projects ignore this
// file. Playwright-core 1.63.0 pins WebKit 26.6 — a proxy, not iOS Safari.
//
// Writes artifacts/webkit-leg/report.json (boot, first race frame, short
// frame-time sample, heap after two race cycles) for the workflow summary.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";
import { awaitPresentedFrame } from "../helpers/presented-canvas.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "artifacts", "webkit-leg");
const TRACK = process.env.APEX_WEBKIT_TRACK || "montreal";
const FRAME_WARM_MS = 2_000;
const FRAME_SAMPLE_MS = 5_000;

test.describe.configure({ timeout: 360_000 });

/** Pin the iPhone TLX-WebGL2 path before any game script runs. */
async function pinIphonePath(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.gfxBootStepMs", "45000");
    } catch (_) { /* private mode */ }
  });
}

/** Sample rAF deltas for `ms` wall time after a short warm window. */
async function sampleFrameTimes(page, { warmMs, sampleMs }) {
  return page.evaluate(async ({ warmMs: w, sampleMs: s }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(w);
    const deltas = [];
    let last = performance.now();
    const end = last + s;
    await new Promise((resolve) => {
      const tick = (t) => {
        deltas.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].sort((a, b) => a - b);
    const q = (p) => {
      if (!sorted.length) return null;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
    };
    const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
    return {
      n: deltas.length,
      p50: r2(q(0.5)),
      p95: r2(q(0.95)),
      p99: r2(q(0.99)),
      max: r2(sorted.length ? sorted[sorted.length - 1] : null),
      warmMs: w,
      sampleMs: s,
    };
  }, { warmMs, sampleMs });
}

function heapSnapshot() {
  return {
    usedJSHeapSize: (() => {
      try {
        const m = performance.memory;
        return m && typeof m.usedJSHeapSize === "number" ? m.usedJSHeapSize : null;
      } catch (_) { return null; }
    })(),
    // WebKit often lacks performance.memory; still report what we can.
    jsHeapSizeLimit: (() => {
      try {
        const m = performance.memory;
        return m && typeof m.jsHeapSizeLimit === "number" ? m.jsHeapSizeLimit : null;
      } catch (_) { return null; }
    })(),
  };
}

async function bootRace(page, track) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
  await page.evaluate(() => window.__apex.go());
  await awaitPresentedFrame(page);
}

test.describe("WebKit iPhone-path boot", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("boots three+tlxForceGL, race frame, frame-time sample, two-cycle heap", async ({ page }, testInfo) => {
    // Only the webkit project should collect this file; refuse a silent Chromium run.
    test.skip(testInfo.project.name !== "webkit",
      `webkit-boot runs only under --project=webkit (got ${testInfo.project.name})`);

    await pinIphonePath(page);

    const browserVersion = page.context().browser()?.version() || "unknown";
    console.log(`[webkit-leg] browser.version()=${browserVersion} (Playwright WebKit proxy, not iOS Safari)`);

    await bootRace(page, TRACK);

    const boot = await page.evaluate(() => {
      const info = window.__apex.info();
      let bound = null;
      try { bound = sessionStorage.getItem("apex26.gfxBound"); } catch (_) { /* */ }
      const backend = typeof GLX !== "undefined" ? GLX.backend : null;
      const backendState = (typeof GLX !== "undefined" && typeof GLX.backendState === "function")
        ? GLX.backendState() : null;
      return {
        track: info.track,
        state: info.state,
        backend,
        bound,
        backendState,
        hasApex: !!window.__apex,
      };
    });

    expect(boot.track, "info().track after race()").toBe(TRACK);
    expect(boot.backend === "three" || boot.bound === "three",
      `expected three backend (backend=${boot.backend} bound=${boot.bound})`).toBeTruthy();

    const firstFrame = await page.evaluate(() => {
      const cv = document.querySelector("canvas#game") || document.querySelector("canvas#game-soft");
      return {
        canvas: cv ? { id: cv.id, w: cv.width, h: cv.height } : null,
        presented: !!(cv && cv.width > 0 && cv.height > 0),
      };
    });
    expect(firstFrame.presented, "first race frame has a live canvas").toBe(true);

    const frameTimes = await sampleFrameTimes(page, {
      warmMs: FRAME_WARM_MS,
      sampleMs: FRAME_SAMPLE_MS,
    });
    expect(frameTimes.n, "frame-time sample collected rAF deltas").toBeGreaterThan(10);

    // Second race cycle — heap after two race()+go() builds (issue #2705).
    await bootRace(page, TRACK);
    const heap = await page.evaluate(heapSnapshot);

    const report = {
      type: "webkit-leg",
      proxy: true,
      note: "Playwright WebKit is a JavaScriptCore + WebKit WebGL proxy (ANGLE-Metal on macos-latest), not the phone's Safari engine",
      playwrightCore: "1.63.0",
      browserVersion,
      project: testInfo.project.name,
      track: TRACK,
      pins: { "apex26.gfxBackend": "three", "apex26.tlxForceGL": "1" },
      boot,
      firstFrame,
      frameTimes,
      heapAfterTwoRaceCycles: heap,
      passCensus: {
        ran: false,
        blocked: "tools/gfx/pass-census.mjs launches Chromium via tools/lib/harness.mjs (launchChromium); it is not WebKit-capable. This Playwright WebKit boot is the proxy leg instead.",
      },
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const reportPath = path.join(OUT_DIR, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    await testInfo.attach("webkit-leg-report.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });

    console.log(`[webkit-leg] report ${reportPath}`);
    console.log(`[webkit-leg] = webkit-leg ${JSON.stringify({
      browserVersion,
      track: boot.track,
      backend: boot.backend,
      bound: boot.bound,
      frameP50: frameTimes.p50,
      frameN: frameTimes.n,
      heap: heap.usedJSHeapSize,
    })}`);
  });
});
