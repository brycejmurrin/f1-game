#!/usr/bin/env node
// track-sweep — parallel data sweep across circuits (JSON, no screenshots).
//
// Boots a shared static server + a small worker pool of Chromium processes
// (like apex-capture's tracks/identity pool), loads each circuit, and pulls a
// compact geometry/audit snapshot via __apex. Useful for cross-checking
// docs/tracks/<id>.md claims (corner counts, elevation, wall issues) against
// live data, or spotting an outlier circuit at a glance.
//
//   node tools/track-sweep.mjs                     # every circuit
//   node tools/track-sweep.mjs spa monza vegas      # just these
//   node tools/track-sweep.mjs --raw > out.json     # full trackProfile/wallStats, not just the summary
//
// Env: APEX_WORKERS=N (default 3 — 4+ can OOM SwiftShader on small boxes)

import { launchChromium, shutdown, sleep, startStaticServer } from "./harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const raw = argv.includes("--raw");
const ids = argv.filter((a) => a !== "--raw");

function workers(def = 3) {
  return Math.max(1, Math.min(8, parseInt(process.env.APEX_WORKERS || String(def), 10) || def));
}

async function bootWorker(baseUrl, id) {
  const browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__apex != null, { timeout: 20000 });
  return { id, browser, page };
}

async function sweepOne(page, id) {
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction((t) => window.__apex.info().track === t, id, { timeout: 30000 });
  await sleep(1600); // mesh build settle
  return page.evaluate((raw) => {
    const a = window.__apex;
    const info = a.info();
    const corners = a.corners();
    const profile = a.trackProfile(60);
    const wall = a.wallStats();
    const light = a.lightState();
    const ys = profile.map((p) => p.y);
    const ks = profile.map((p) => Math.abs(p.k));
    const out = {
      id: info.track,
      totalM: +info.total.toFixed(1),
      nCorners: corners.length,
      elevMinM: +Math.min(...ys).toFixed(1),
      elevMaxM: +Math.max(...ys).toFixed(1),
      elevRangeM: +(Math.max(...ys) - Math.min(...ys)).toFixed(1),
      maxCurvature: +Math.max(...ks).toFixed(4),
      wallOk: !wall.anyNaN && wall.minOverHw > 0,
      wallStats: wall,
      numLights: light.numLights,
    };
    return raw ? { ...out, corners, profile } : out;
  }, raw);
}

(async () => {
  const srv = await startStaticServer(ROOT);
  try {
    let trackIds = ids;
    if (!trackIds.length) {
      const boot = await bootWorker(srv.url, "list");
      trackIds = await boot.page.evaluate(() => window.__apex.tracks().map((t) => t.id));
      await boot.browser.close();
    }

    const n = Math.min(workers(), trackIds.length);
    const pool = [];
    for (let i = 0; i < n; i++) {
      pool.push(await bootWorker(srv.url, i));
      console.error(`[track-sweep] worker ${i} ready`);
      if (i < n - 1) await sleep(400); // stagger — parallel SwiftShader boots contend
    }

    const results = new Array(trackIds.length);
    let cursor = 0;
    await Promise.all(pool.map(async (w) => {
      for (;;) {
        const i = cursor++;
        if (i >= trackIds.length) break;
        const id = trackIds[i];
        try {
          results[i] = await sweepOne(w.page, id);
          console.error(`[track-sweep] w${w.id} ${id} done`);
        } catch (e) {
          results[i] = { id, err: e.message };
          console.error(`[track-sweep] w${w.id} ${id} FAILED: ${e.message}`);
        }
      }
    }));

    await Promise.all(pool.map((w) => w.browser.close()));
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error("track-sweep failed:", e.message);
    process.exitCode = 1;
  } finally {
    await shutdown();
  }
})();
