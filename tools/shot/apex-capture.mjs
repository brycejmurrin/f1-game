#!/usr/bin/env node
// apex-capture — parallel headless screenshot capture.
// @doc Parallel headless screenshot sweep across cameras/tracks/modes → `scratch/captures/apex-capture/<purpose>/`.
// @skill playwright-probe
//
// Architecture (identity / tracks):
//   • ONE shared Node static server (async — not python -m http.server)
//   • N separate Chromium PROCESSES (not N tabs in one browser)
//   • Dynamic job queue — workers pull the next track as they finish
//
// Why: __apex.race() → Tracks.build is CPU + SwiftShader-bound. Tabs in a
// single browser share a GPU process and contend; N chromium.launch()s
// actually parallelize. Extra Python servers only helped asset fetch.
//
//   node tools/shot/apex-capture.mjs cameras [track] [outdir]
//   node tools/shot/apex-capture.mjs modes   [outdir]
//   node tools/shot/apex-capture.mjs tracks  [outdir] [id ...]
//   node tools/shot/apex-capture.mjs identity [outdir] [id ...]   # aerial+tour+eye
//   node tools/shot/apex-capture.mjs lap-tour [track] [speed] [outdir] [weather=wet] [tod=dusk]
//
// Env: APEX_WORKERS=N (default: 1 per 4 CPUs, cap 2 on SwiftShader;
// up to 4 on APEX_GL=llvmpipe — see browser-workers.mjs). Pools cap at job count.
// Logs/redirects: use artifacts/tmp/ (never /tmp) — e.g.
//   node tools/shot/apex-capture.mjs identity scratch/captures/apex-capture/identity > artifacts/tmp/apex-identity.log 2>&1 &
// Default output roots when [outdir] is omitted:
//   cameras  -> scratch/captures/apex-capture/cameras
//   tracks   -> scratch/captures/apex-capture/tracks
//   identity -> scratch/captures/apex-capture/identity
//   lap-tour -> scratch/captures/apex-capture/lap-tour
//   modes    -> scratch/captures/apex-capture/modes
// Decode the saved bytes for blank / HUD-only evidence on either capture path.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchChromium, startStaticServer as serve, shutdown } from "../lib/harness.mjs";
import { defaultCaptureWorkers, captureChromiumArgs, glStack, captureCpuBudget } from "../lib/browser-workers.mjs";
import { screenshotPresentedCanvas, installProbeInit, gotoGame, awaitPresentedFrame } from "./probe-page.mjs";
import { invoked, pixelEvidence } from "./capture-contract.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `apex-capture — parallel headless screenshot sweep

  node tools/shot/apex-capture.mjs cameras [track] [outdir]
  node tools/shot/apex-capture.mjs modes   [outdir]
  node tools/shot/apex-capture.mjs tracks  [outdir] [id ...]
  node tools/shot/apex-capture.mjs identity [outdir] [id ...]
  node tools/shot/apex-capture.mjs lap-tour [track] [speed] [outdir]

Default cmd=modes. Env APEX_WORKERS=N (GL-aware default via browser-workers.mjs).`);
const [cmd = "modes", ...rest] = argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAND = { width: 844, height: 390 };
const IDENTITY_VP = { width: 960, height: 540 };

async function startStaticServer() {
  const server = await serve(ROOT);
  return { ...server, kill: () => server.close() };
}

async function launchBrowser() {
  return launchChromium({
    args: captureChromiumArgs(),
  });
}

export async function openPage(browser, baseUrl, viewport = LAND) {
  const page = await browser.newPage({ viewport });
  // Keep Three's shipped backend selection and skip transitional flybys.
  try {
    await installProbeInit(page, { backend: "three", tlxForceGL: false });
    await gotoGame(page, baseUrl, 60000);
  } catch (err) { await page.context().close().catch(() => {}); throw err; }
  return page;
}

async function race(page, track, settleMs = 1600) {
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 60000, polling: 100 });
  await sleep(settleMs);
}

/** Two soft presents flush a readback that was already in flight at the move.
 * A native canvas has no soft barrier, so wait two actual game render frames.
 * Never snapCam here: it clears fixed orbit/view/eyeAt framing. */
export async function waitCaptureFrame(page, timeout = 60000) {
  const started = Date.now();
  const soft = await page.evaluate(() => typeof GLX !== "undefined" &&
    typeof GLX.softPresent === "function" && GLX.softPresent());
  if (!soft) {
    const before = await page.evaluate(() => window.__apex.cameraState().renderFrame);
    await page.waitForFunction((frame) => window.__apex.cameraState().renderFrame >= frame + 2, before, { polling: 100, timeout });
    return;
  }
  for (let i = 0; i < 2; i++) {
    const remaining = timeout - (Date.now() - started);
    const presented = remaining > 0 ? await awaitPresentedFrame(page, remaining) : false;
    if (presented === null) {
      const before = await page.evaluate(() => window.__apex.cameraState().renderFrame);
      await page.waitForFunction((frame) => window.__apex.cameraState().renderFrame >= frame + 2, before, { polling: 100, timeout: remaining });
      return;
    }
    if (presented === false) {
      throw new Error("capture: no fresh presented frame after camera change");
    }
  }
}

async function shotPng(page, dir, name, sel = "canvas#game") {
  // Match survey-track.mjs: compositor clip of the presented canvas.
  // Do NOT use canvas.toDataURL — WebGL clears the backbuffer (black frame).
  // Do NOT use locator("canvas#game").screenshot() — HeadlessChrome GLX hides
  // #game and blits onto #game-soft (black GPU buffer).
  // Do NOT use page.screenshot({animations:'disabled'}) — hangs under SwiftShader.
  if (sel !== "canvas#game") {
    const buf = await page.locator(sel).screenshot({ path: `${dir}/${name}.png`, timeout: 60000 });
    return { name: `${name}.png`, bytes: buf.length, blank: !(await pixelEvidence(buf)).meaningful };
  }
  const presentStart = Date.now();
  await waitCaptureFrame(page);
  const presentMs = Date.now() - presentStart;
  const shot = await screenshotPresentedCanvas(page, { path: `${dir}/${name}.png`, skipAwait: true, pauseRender: true, timeout: 60000 });
  return { name: `${name}.png`, bytes: shot.bytes, blank: !(await pixelEvidence(shot.buf)).meaningful, via: shot.via, timings: { ...shot.timings, presentMs } };
}

async function shotJpg(page, dir, name) {
  const presentStart = Date.now();
  await waitCaptureFrame(page);
  const presentMs = Date.now() - presentStart;
  const shot = await screenshotPresentedCanvas(page, {
    skipAwait: true,
    pauseRender: true,
    path: `${dir}/${name}.jpg`,
    type: "jpeg",
    quality: 72,
    timeout: 60000,
  });
  return { name: `${name}.jpg`, bytes: shot.bytes, blank: !(await pixelEvidence(shot.buf)).meaningful, via: shot.via, timings: { ...shot.timings, presentMs } };
}

/**
 * N independent Chromium processes, each with one page on the shared server.
 * Returns { workers:[{id,browser,page,viewport}], kill, revive(w) }.
 */
export async function startWorkerPool(n, baseUrl, viewport = LAND, { launch = launchBrowser, open = openPage, pause = sleep } = {}) {
  const workers = [];
  async function boot(id) {
    const started = Date.now();
    const browser = await launch();
    let page;
    try { page = await open(browser, baseUrl, viewport); }
    catch (err) { await browser.close().catch(() => {}); throw err; }
    page.on("crash", () => console.error(`[pool] w${id} PAGE CRASH`));
    browser.on("disconnected", () => console.error(`[pool] w${id} BROWSER DISCONNECTED`));
    return { id, browser, page, viewport, baseUrl, bootMs: Date.now() - started };
  }
  try {
    for (let i = 0; i < n; i++) {
      workers.push(await boot(i));
      console.error(`[pool] worker ${i} ready`);
      if (i < n - 1) await pause(400); // bounded stagger avoids software GL OOM
    }
  } catch (err) {
    await Promise.all(workers.map((w) => w.browser.close().catch(() => {})));
    throw err;
  }
  return {
    workers,
    revive: async (w) => {
      try { await w.browser.close(); } catch {}
      const next = await boot(w.id);
      Object.assign(w, next);
      console.error(`[pool] worker ${w.id} revived`);
    },
    kill: async () => {
      await Promise.all(workers.map(async (w) => {
        try { await w.browser.close(); } catch {}
      }));
    },
  };
}

/** Dynamic queue — idle workers pull the next job (better than static shards). */
export async function poolMap(workers, jobs, run, revive) {
  const queue = jobs.slice();
  const results = new Array(jobs.length);
  let cursor = 0;
  const take = () => {
    const i = cursor++;
    return i < queue.length ? { i, job: queue[i] } : null;
  };
  await Promise.all(workers.map(async (w) => {
    for (;;) {
      const item = take();
      if (!item) break;
      try {
        results[item.i] = await run(w, item.job);
      } catch (e) {
        const msg = e && e.message || String(e);
        const dead = /has been closed|Target crashed|Browser closed/i.test(msg);
        if (dead && revive) {
          console.error(`[pool] w${w.id} died on ${item.job}: ${msg.slice(0, 80)} — retry`);
          try {
            await revive(w);
            results[item.i] = await run(w, item.job);
            continue;
          } catch (e2) {
            results[item.i] = { job: item.job, err: e2.message };
            try { await revive(w); } catch {}
            continue;
          }
        }
        results[item.i] = { job: item.job?.name ?? item.job, err: msg };
      }
    }
  }));
  return results;
}

function workersEnv(def = 2, jobs = Infinity) {
  return defaultCaptureWorkers({ defSwift: def, jobs });
}

async function prepCleanChrome(page) {
  await page.evaluate(() => {
    const a = window.__apex;
    a.hud(false);
    a.park(0.15);
    const cam = document.getElementById("btn-cam");
    if (cam) cam.style.display = "none";
    const lights = document.getElementById("lights");
    if (lights) lights.style.display = "none";
  });
}

async function main() {
  const t0 = Date.now();
  let manifest;
  let cleanup = async () => {};
  const workerTimings = [];
  let outputDir;

  try {
    if (cmd === "cameras") {
      // Each worker owns a Chromium process; shared tabs contend on software GL.
      const track = rest[0] && !rest[0].includes("/") && !rest[0].startsWith(".") ? rest[0] : "monza";
      const dir = (rest[1] || `${ROOT}/scratch/captures/apex-capture/cameras`); mkdirSync(dir, { recursive: true });
      const CAMS = ["chase","far","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"];
      const staticSrv = await startStaticServer();
      cleanup = async () => { await staticSrv.kill(); };
      outputDir = dir;
      const pool = await startWorkerPool(workersEnv(2, CAMS.length), staticSrv.url);
      cleanup = async () => { await pool.kill(); await staticSrv.kill(); };
      workerTimings.push(...pool.workers.map((w) => ({ id: w.id, bootMs: w.bootMs })));
      await Promise.all(pool.workers.map((w) => race(w.page, track).then(() => w.page.evaluate(() => window.__apex.park(0.1)))));
      manifest = await poolMap(pool.workers, CAMS, async (w, m) => {
        const pg = w.page;
        await pg.evaluate((mm) => { window.__apex.camera(mm); window.__apex.snapCam && window.__apex.snapCam(); }, m);
        await sleep(180);
        return shotPng(pg, dir, `cam-${m}`);
      });
      await pool.kill();
      await staticSrv.kill();
      cleanup = async () => {};
    } else if (cmd === "tracks" || cmd === "identity") {
      const isIdentity = cmd === "identity";
      const dirArg = rest[0] && (rest[0].includes("/") || rest[0].startsWith(".")) ? rest.shift() : null;
      const dir = dirArg || `${ROOT}/scratch/captures/apex-capture/${isIdentity ? "identity" : "tracks"}`;
      mkdirSync(dir, { recursive: true });
      outputDir = dir;
      let ids = rest.filter((x) => !x.includes("/"));
      const n = workersEnv(2, ids.length || Infinity);
      const staticSrv = await startStaticServer();
      console.error(`[${cmd}] static server :${staticSrv.port}, ${n} Chromium workers`);
      cleanup = async () => { await staticSrv.kill(); };
      const pool = await startWorkerPool(n, staticSrv.url, isIdentity ? IDENTITY_VP : LAND);
      workerTimings.push(...pool.workers.map((w) => ({ id: w.id, bootMs: w.bootMs })));
      const { workers, kill: killPool, revive } = pool;
      cleanup = async () => { await killPool(); await staticSrv.kill(); };

      if (!ids.length) {
        ids = await workers[0].page.evaluate(() => window.__apex.tracks().map((t) => t.id || t));
      }
      console.error(`[${cmd}] ${ids.length} tracks → ${dir}`);

      if (isIdentity) {
        manifest = await poolMap(workers, ids, async (w, id) => {
          const t1 = Date.now();
          console.error(`[identity] w${w.id} start ${id}`);
          await race(w.page, id, 1400); // same settle as survey-track.mjs
          const raceMs = Date.now() - t1;
          await prepCleanChrome(w.page);
          const out = [];
          await w.page.evaluate(() => window.__apex.view());
          await sleep(50);
          out.push(await shotJpg(w.page, dir, `${id}-aerial`));
          await w.page.evaluate(() => {
            const a = window.__apex;
            const s = (a.tourShots(1, { atCorners: true, dist: 55, el: 16 })[0])
              || { frac: 0.3, az: 45, el: 16, dist: 50 };
            a.orbit(s.frac, s.az, s.el, s.dist);
          });
          await sleep(50);
          out.push(await shotJpg(w.page, dir, `${id}-tour`));
          await w.page.evaluate(() => window.__apex.eyeAt(0.4, 0, 2.2));
          await sleep(50);
          out.push(await shotJpg(w.page, dir, `${id}-eye`));
          console.error(`[identity] w${w.id} done  ${id} (${Date.now() - t1}ms)`);
          return out.map((shot) => ({ ...shot, workerId: w.id, raceMs, jobMs: Date.now() - t1 }));
        }, revive);
        manifest = manifest.flat();
      } else {
        manifest = await poolMap(workers, ids, async (w, id) => {
          const t1 = Date.now();
          console.error(`[tracks] w${w.id} start ${id}`);
          await race(w.page, id, 700);
          const raceMs = Date.now() - t1;
          await w.page.evaluate(() => { window.__apex.park(0.1); window.__apex.orbit(0.1, 50, 22, 70); });
          await sleep(150);
          const s = await shotPng(w.page, dir, `track-${id}`);
          console.error(`[tracks] w${w.id} done  ${id} (${Date.now() - t1}ms)`);
          return { ...s, workerId: w.id, raceMs, jobMs: Date.now() - t1 };
        }, revive);
      }

      await killPool();
      await staticSrv.kill();
      cleanup = async () => {};
    } else if (cmd === "lap-tour") {
      const weatherArg = rest.find((x) => x.startsWith("weather="));
      const todArg = rest.find((x) => x.startsWith("tod="));
      const positional = rest.filter((x) => !x.startsWith("weather=") && !x.startsWith("tod="));
      const track = positional.find((x) => !x.includes("/") && !x.startsWith(".") && !/^\d/.test(x)) || "monza";
      const speed = parseFloat(positional.find((x) => /^\d+(\.\d+)?$/.test(x)) || "60");
      const dir = positional.find((x) => x.includes("/") || x.startsWith(".")) || `${ROOT}/scratch/captures/apex-capture/lap-tour`;
      const weather = weatherArg && weatherArg.split("=")[1];
      const tod = todArg && todArg.split("=")[1];
      mkdirSync(dir, { recursive: true });
      outputDir = dir;
      const staticSrv = await startStaticServer();
      cleanup = async () => { await staticSrv.kill(); };
      const browser = await launchBrowser();
      cleanup = async () => { try { await browser.close(); } catch {} await staticSrv.kill(); };
      const page = await openPage(browser, staticSrv.url);
      await race(page, track);
      await page.evaluate(() => { window.__apex.go(); });
      await sleep(300);
      if (weather || tod) {
        await page.evaluate(({ weather, tod }) => {
          if (weather) window.__apex.weather(weather);
          if (tod) window.__apex.setTimeOfDay(tod);
        }, { weather, tod });
        await sleep(900); // weather/lighting rebuild settle
      }
      manifest = [];
      const STEPS = 20;
      const suffix = [weather, tod].filter(Boolean).join("-");
      for (let i = 0; i < STEPS; i++) {
        const frac = i / STEPS;
        await page.evaluate(({ f, s }) => {
          window.__apex.jump(f, s, 0);
          window.__apex.camera("chase");
          window.__apex.snapCam && window.__apex.snapCam();
        }, { f: frac, s: speed });
        await sleep(220);
        const label = `${String(i + 1).padStart(2, "0")}-f${frac.toFixed(2)}` + (suffix ? `-${suffix}` : "");
        manifest.push(await shotPng(page, dir, label));
      }
      await browser.close();
      await staticSrv.kill();
      cleanup = async () => {};
    } else { // modes
      const dir = (rest[0] || `${ROOT}/scratch/captures/apex-capture/modes`); mkdirSync(dir, { recursive: true });
      outputDir = dir;
      // Independent scenes — one Chromium per slot, fresh page/context per job.
      const staticSrv = await startStaticServer();
      const jobs = [
        { name: "menu", fn: async (pg) => {
          await sleep(900);
          return [await shotPng(pg, dir, "screen-menu", "body")];
        }, viewport: { width: 1100, height: 720 } },
        { name: "race", fn: async (pg) => {
          const r = []; await race(pg, "monza");
          await pg.evaluate(() => { window.__apex.go(); window.__apex.jump(0.18, 60, 0); window.__apex.hud(true); });
          await sleep(400); r.push(await shotPng(pg, dir, "mode-race-day"));
          await pg.evaluate(() => window.__apex.weather("wet")); await sleep(500); r.push(await shotPng(pg, dir, "mode-race-wet"));
          await pg.evaluate(() => { window.__apex.weather("dry"); window.__apex.setTimeOfDay("night"); });
          await sleep(1400); await pg.evaluate(() => window.__apex.jump(0.18, 60, 0)); await sleep(400);
          r.push(await shotPng(pg, dir, "mode-race-night")); return r;
        } },
        { name: "results", fn: async (pg) => {
          await race(pg, "spa");
          await pg.evaluate(() => { window.__apex.go(); window.__apex.setLap && window.__apex.setLap(3); window.__apex.finishRace(); });
          await sleep(900); return [await shotPng(pg, dir, "screen-results", "body")];
        }, viewport: { width: 1100, height: 600 } },
        { name: "tt", fn: async (pg) => {
          await pg.evaluate(() => window.__apex.tt && window.__apex.tt("suzuka"));
          // 45 s, not 15: a TLX build of monza measures 16.6 s on this
          // container's SwiftShader (2026-09-21), and TLX is the default
          // backend — the same budget that broke apex-eval.mjs. Timer polling
          // with it, so the bound can actually fire (wait-polling-lint.mjs).
          await pg.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 45000, polling: 100 }); await sleep(1600);
          await pg.evaluate(() => { window.__apex.go && window.__apex.go(); window.__apex.jump(0.25, 60, 0); window.__apex.hud(true); });
          await sleep(400); return [await shotPng(pg, dir, "mode-timetrial")];
        } },
      ];
      const browsers = [];
      cleanup = async () => {
        await Promise.all(browsers.map(async (b) => { try { await b.close(); } catch {} }));
        await staticSrv.kill();
      };
      const slots = Array.from({ length: workersEnv(2, jobs.length) }, (_, id) => ({ id }));
      const out = await poolMap(slots, jobs, async (w, j) => {
        if (!w.browser) { w.browser = await launchBrowser(); browsers.push(w.browser); }
        const started = Date.now();
        const pg = await openPage(w.browser, staticSrv.url, j.viewport || LAND);
        workerTimings.push({ id: w.id, job: j.name, bootMs: Date.now() - started });
        try { return await j.fn(pg); }
        finally { await pg.context().close(); }
      });
      manifest = out.flat();
      await Promise.all(browsers.map((b) => b.close().catch(() => {})));
      await staticSrv.kill();
      cleanup = async () => {};
    }
  } catch (e) {
    await cleanup().catch(() => {});
    throw e;
  }

  const ms = Date.now() - t0;
  const result = { cmd, ms, requestedGl: glStack(), cpuBudget: captureCpuBudget(), workerTimings, shots: manifest };
  if (outputDir) writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.error(`[${cmd}] finished in ${(ms / 1000).toFixed(1)}s — ${manifest.length} shot(s)`);
  const bad = (manifest || []).filter((m) => m && (m.blank || m.err));
  if (bad.length) {
    console.error(`\n⚠ ${bad.length} blank/failed:`, bad.map((b) => b.name || b.job || b.err).join(", "));
    process.exitCode = 1;
  }
}

if (invoked(import.meta.url)) main().finally(shutdown)
  .catch((e) => { console.error("FATAL", e); process.exitCode = 1; });
