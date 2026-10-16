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
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { launchChromium, startStaticServer as serve, shutdown, chromiumLaunchInfo } from "../lib/harness.mjs";
import { defaultCaptureWorkers, captureCpuBudget } from "../lib/browser-workers.mjs";
import { screenshotPresentedCanvas, installProbeInit, gotoGame, awaitCaptureReady, mutateCaptureScene } from "./probe-page.mjs";
import { invoked, pixelEvidence } from "./capture-contract.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { parseCaptureOptions, captureContextOptions, captureLaunchOptions, captureExtension, captureScreenshotOptions, applyCaptureProfile } from "./capture-options.mjs";
import { captureBrowserDiagnostics, assertCaptureGpuCapability, startCaptureTrace } from "./capture-diagnostics.mjs";
import { menuReady } from "../ui/menu-readiness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `apex-capture — parallel headless screenshot sweep

  node tools/shot/apex-capture.mjs cameras [track] [outdir]
  node tools/shot/apex-capture.mjs modes   [outdir]
  node tools/shot/apex-capture.mjs tracks  [outdir] [id ...]
  node tools/shot/apex-capture.mjs identity [outdir] [id ...]
  node tools/shot/apex-capture.mjs lap-tour [track] [speed] [outdir]

Shared flags: --profile preview|comparison|custom --width N --height N --dpr N
  --scope scene|page --type png|jpeg --quality N --seed N
  --gpu swiftshader|llvmpipe|lavapipe|hardware --browser auto|chromium|shell
  --trace[=PATH] --cache-assets --reuse|--isolated
Default cmd=modes. Env APEX_WORKERS=N (GL-aware default via browser-workers.mjs).`);
const options = parseCaptureOptions(argv);
const [cmd = "modes", ...rest] = options.positionals;
const browserRuns = [];
let outputRoot = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAND = { width: 844, height: 390 };
const IDENTITY_VP = { width: 960, height: 540 };

async function startStaticServer() {
  const server = await serve(ROOT, options.cacheAssets ? { immutableAssets: { namespace: randomUUID() } } : {});
  return { ...server, url: server.snapshotUrl || server.url, kill: () => server.close() };
}

async function launchBrowser({ workers = workersEnv() } = {}) {
  const browser = await launchChromium(captureLaunchOptions(options, { workers }));
  const ownerPid = chromiumLaunchInfo(browser)?.pid;
  if (process.send && ownerPid) process.send({ type: "capture-browser-owned", pid: ownerPid });
  const run = { id: browserRuns.length, browser, trace: null, diagnostics: null };
  browserRuns.push(run);
  try {
    // Start before navigation so shader warmup and the first scene are included.
    if (options.trace) {
      const path = options.tracePath
        ? resolve(options.tracePath.replace(/\.json$/, "") + `-${run.id}.json`)
        : resolve(outputRoot || `${ROOT}/artifacts/capture-traces`, `chromium-${run.id}-${randomUUID()}.trace.json`);
      run.trace = await startCaptureTrace(browser, { path });
    }
    run.diagnostics = await captureBrowserDiagnostics(browser, {
      requested: { gpu: options.gpu, flavor: options.browser }, executable: chromiumLaunchInfo(browser),
    });
    assertCaptureGpuCapability(run.diagnostics, options);
    const close = browser.close.bind(browser);
    browser.close = async (...args) => {
      if (run.trace) {
        try { run.traceResult = await run.trace.stop(); }
        catch (error) { run.traceResult = { error: error.message }; }
        run.trace = null;
      }
      try { return await close(...args); }
      finally { if (process.send && ownerPid && process.connected) process.send({ type: "capture-browser-closed", pid: ownerPid }); }
    };
    return browser;
  } catch (error) {
    if (run.trace) await run.trace.stop().catch(() => {});
    await browser.close().catch(() => {});
    if (process.send && ownerPid && process.connected) process.send({ type: "capture-browser-closed", pid: ownerPid });
    throw error;
  }
}

export async function openPage(browser, baseUrl, viewport = LAND) {
  const page = await browser.newPage(captureContextOptions(options, viewport));
  try {
    await installProbeInit(page, { backend: "three", tlxForceGL: options.gpu === "llvmpipe" });
    const url = new URL(baseUrl);
    if (options.seed != null) url.searchParams.set("seed", options.seed);
    await gotoGame(page, url.href, 60000);
    await applyCaptureProfile(page, options);
  } catch (err) { await page.context().close().catch(() => {}); throw err; }
  return page;
}

async function race(page, track) {
  await mutateCaptureScene(page, (t) => window.__apex.race(t), track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 60000, polling: 100 });
}

/** The helper rejects stale async readbacks and checks native render progress. */
export async function waitCaptureFrame(page, timeout = 60000) {
  return awaitCaptureReady(page, { timeoutMs: timeout });
}

async function captureState(page) {
  return page.evaluate(() => {
    const a = window.__apex;
    const diag = a.diag?.({ download: false });
    const camera = a.cameraState?.();
    const cv = document.getElementById("game-soft") || document.getElementById("game");
    return { seed: a.seed?.(), info: a.info(), camera: a.camera(),
      backend: diag?.env?.backend, backendState: diag?.env?.backendState,
      render: a.renderScale?.(), renderClock: a.renderClock?.(), tier: a.govHold?.(),
      canvas: cv && { id: cv.id, width: cv.width, height: cv.height },
      clocks: camera && { renderFrame: camera.renderFrame, renderTime: camera.renderTime, simulationTime: camera.simulationTime },
      dpr: devicePixelRatio };
  });
}

export async function captureShot(page, dir, name, { fallbackType = "png", pageScope = false } = {}) {
  const started = Date.now();
  let readiness;
  if (pageScope) await page.waitForFunction(menuReady, "body", { polling: 100, timeout: 30000 });
  else readiness = await waitCaptureFrame(page);
  const presentMs = Date.now() - started;
  const shotOptions = captureScreenshotOptions(options, fallbackType);
  const extension = captureExtension(options, fallbackType);
  const fullPage = pageScope || shotOptions.scope === "page";
  const shot = await screenshotPresentedCanvas(page, {
    ...shotOptions, path: `${dir}/${name}.${extension}`, skipAwait: true, pauseRender: !pageScope, timeout: 60000,
    ...(fullPage ? { forceCdp: true, clip: { x: 0, y: 0, ...page.viewportSize() } } : {}),
    ...(shotOptions.type === "jpeg" ? { quality: shotOptions.quality ?? (fallbackType === "jpeg" ? 72 : 80) } : {}),
  });
  const pixels = await pixelEvidence(shot.buf);
  return { name: `${name}.${extension}`, bytes: shot.bytes, blank: !pixels.meaningful, pixels,
    via: shot.via, scope: fullPage ? "page" : "scene", readiness, state: await captureState(page),
    timings: { ...shot.timings, presentMs, totalMs: Date.now() - started } };
}
const shotPng = (page, dir, name, selector = "canvas#game") => captureShot(page, dir, name, { pageScope: selector !== "canvas#game" });
const shotJpg = (page, dir, name) => captureShot(page, dir, name, { fallbackType: "jpeg" });

/**
 * N independent Chromium processes, each with one page on the shared server.
 * Returns { workers:[{id,browser,page,viewport}], kill, revive(w) }.
 */
export async function startWorkerPool(n, baseUrl, viewport = LAND, { launch = () => launchBrowser({ workers: n }), open = openPage, pause = sleep } = {}) {
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
  return defaultCaptureWorkers({ defSwift: def, jobs, env: { ...process.env, APEX_GL: options.gpu } });
}

async function prepCleanChrome(page) {
  await mutateCaptureScene(page, () => {
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
  if (rest.some((arg) => arg.startsWith("--"))) throw new Error(`unknown capture flag: ${rest.find((arg) => arg.startsWith("--"))}`);

  try {
    if (cmd === "cameras") {
      // Each worker owns a Chromium process; shared tabs contend on software GL.
      const track = rest[0] && !rest[0].includes("/") && !rest[0].startsWith(".") ? rest[0] : "monza";
      const dir = (rest[1] || `${ROOT}/scratch/captures/apex-capture/cameras`); mkdirSync(dir, { recursive: true });
      const CAMS = ["chase","far","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"];
      const staticSrv = await startStaticServer();
      cleanup = async () => { await staticSrv.kill(); };
      outputDir = dir; outputRoot = dir;
      const pool = await startWorkerPool(workersEnv(2, CAMS.length), staticSrv.url);
      cleanup = async () => { await pool.kill(); await staticSrv.kill(); };
      workerTimings.push(...pool.workers.map((w) => ({ id: w.id, bootMs: w.bootMs })));
      await Promise.all(pool.workers.map((w) => race(w.page, track).then(() => mutateCaptureScene(w.page, () => window.__apex.park(0.1)))));
      manifest = await poolMap(pool.workers, CAMS, async (w, m) => {
        const pg = w.page;
        await mutateCaptureScene(pg, (mm) => { window.__apex.camera(mm); window.__apex.snapCam && window.__apex.snapCam(); }, m);
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
      outputDir = dir; outputRoot = dir;
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
          await race(w.page, id);
          const raceMs = Date.now() - t1;
          await prepCleanChrome(w.page);
          const out = [];
          await mutateCaptureScene(w.page, () => window.__apex.view());
          out.push(await shotJpg(w.page, dir, `${id}-aerial`));
          await mutateCaptureScene(w.page, () => {
            const a = window.__apex;
            const s = (a.tourShots(1, { atCorners: true, dist: 55, el: 16 })[0])
              || { frac: 0.3, az: 45, el: 16, dist: 50 };
            a.orbit(s.frac, s.az, s.el, s.dist);
          });
          out.push(await shotJpg(w.page, dir, `${id}-tour`));
          await mutateCaptureScene(w.page, () => window.__apex.eyeAt(0.4, 0, 2.2));
          out.push(await shotJpg(w.page, dir, `${id}-eye`));
          console.error(`[identity] w${w.id} done  ${id} (${Date.now() - t1}ms)`);
          return out.map((shot) => ({ ...shot, workerId: w.id, raceMs, jobMs: Date.now() - t1 }));
        }, revive);
        manifest = manifest.flat();
      } else {
        manifest = await poolMap(workers, ids, async (w, id) => {
          const t1 = Date.now();
          console.error(`[tracks] w${w.id} start ${id}`);
          await race(w.page, id);
          const raceMs = Date.now() - t1;
          await mutateCaptureScene(w.page, () => { window.__apex.park(0.1); window.__apex.orbit(0.1, 50, 22, 70); });
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
      outputDir = dir; outputRoot = dir;
      const staticSrv = await startStaticServer();
      cleanup = async () => { await staticSrv.kill(); };
      const browser = await launchBrowser({ workers: 1 });
      cleanup = async () => { try { await browser.close(); } catch {} await staticSrv.kill(); };
      const page = await openPage(browser, staticSrv.url);
      await race(page, track);
      await mutateCaptureScene(page, () => { window.__apex.go(); });
      if (weather || tod) {
        await mutateCaptureScene(page, ({ weather, tod }) => {
          if (weather) window.__apex.weather(weather);
          if (tod) window.__apex.setTimeOfDay(tod);
        }, { weather, tod });
      }
      manifest = [];
      const STEPS = 20;
      const suffix = [weather, tod].filter(Boolean).join("-");
      for (let i = 0; i < STEPS; i++) {
        const frac = i / STEPS;
        await mutateCaptureScene(page, ({ f, s }) => {
          window.__apex.jump(f, s, 0);
          window.__apex.camera("chase");
          window.__apex.snapCam && window.__apex.snapCam();
        }, { f: frac, s: speed });
        const label = `${String(i + 1).padStart(2, "0")}-f${frac.toFixed(2)}` + (suffix ? `-${suffix}` : "");
        manifest.push(await shotPng(page, dir, label));
      }
      await browser.close();
      await staticSrv.kill();
      cleanup = async () => {};
    } else { // modes
      const dir = (rest[0] || `${ROOT}/scratch/captures/apex-capture/modes`); mkdirSync(dir, { recursive: true });
      outputDir = dir; outputRoot = dir;
      // Compatible race/TT jobs reuse a page; independent screens stay isolated.
      // Independent scenes — one Chromium per slot, fresh page/context per job.
      const staticSrv = await startStaticServer();
      const jobs = [
        { name: "menu", fn: async (pg) => {
          return [await shotPng(pg, dir, "screen-menu", "body")];
        }, viewport: { width: 1100, height: 720 } },
        { name: "race", reuseKey: "race", fn: async (pg) => {
          const r = []; await race(pg, "monza");
          await mutateCaptureScene(pg, () => { window.__apex.go(); window.__apex.jump(0.18, 60, 0); window.__apex.hud(true); });
          r.push(await shotPng(pg, dir, "mode-race-day"));
          await mutateCaptureScene(pg, () => window.__apex.weather("wet")); r.push(await shotPng(pg, dir, "mode-race-wet"));
          await mutateCaptureScene(pg, () => { window.__apex.weather("dry"); window.__apex.setTimeOfDay("night"); });
          await mutateCaptureScene(pg, () => window.__apex.jump(0.18, 60, 0));
          r.push(await shotPng(pg, dir, "mode-race-night")); return r;
        } },
        { name: "results", fn: async (pg) => {
          await race(pg, "spa");
          await mutateCaptureScene(pg, () => { window.__apex.go(); window.__apex.setLap && window.__apex.setLap(3); window.__apex.finishRace(); });
          return [await shotPng(pg, dir, "screen-results", "body")];
        }, viewport: { width: 1100, height: 600 } },
        { name: "tt", reuseKey: "race", fn: async (pg) => {
          await mutateCaptureScene(pg, async () => {
            const a = window.__apex;
            a.freeze(false); a.weather("dry"); a.setTimeOfDay("default");
            await a.tt("suzuka");
          });
          // 45 s, not 15: a TLX build of monza measures 16.6 s on this
          // container's SwiftShader (2026-09-21), and TLX is the default
          // backend — the same budget that broke apex-eval.mjs. Timer polling
          // with it, so the bound can actually fire (wait-polling-lint.mjs).
          await pg.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 45000, polling: 100 });
          await mutateCaptureScene(pg, () => { window.__apex.go && window.__apex.go(); window.__apex.jump(0.25, 60, 0); window.__apex.hud(true); });
          return [await shotPng(pg, dir, "mode-timetrial")];
        } },
      ];
      const browsers = [];
      cleanup = async () => {
        await Promise.all(browsers.map(async (b) => { try { await b.close(); } catch {} }));
        await staticSrv.kill();
      };
      const slots = Array.from({ length: workersEnv(2, jobs.length) }, (_, id) => ({ id, pages: new Map() }));
      const out = await poolMap(slots, jobs, async (w, j) => {
        if (!w.browser) { w.browser = await launchBrowser({ workers: slots.length }); browsers.push(w.browser); }
        const started = Date.now();
        const key = options.reuse && j.reuseKey ? JSON.stringify([j.reuseKey, captureContextOptions(options, j.viewport || LAND)]) : null;
        let pg = key ? w.pages.get(key) : null;
        const reused = !!pg;
        if (!pg) { pg = await openPage(w.browser, staticSrv.url, j.viewport || LAND); if (key) w.pages.set(key, pg); }
        if (reused) await pg.evaluate(() => window.__apex.headless(false));
        workerTimings.push({ id: w.id, job: j.name, reused, bootMs: Date.now() - started });
        try { return (await j.fn(pg)).map((shot) => ({ ...shot, workerId: w.id, reused })); }
        catch (error) { if (key) w.pages.delete(key); await pg.context().close().catch(() => {}); throw error; }
        finally {
          if (!key) await pg.context().close();
          else await pg.evaluate(() => window.__apex.headless(true)).catch(() => {});
        }
      });
      manifest = out.flat();
      await Promise.all(browsers.map((b) => b.close().catch(() => {})));
      await staticSrv.kill();
      cleanup = async () => {};
    }
  } catch (e) {
    await cleanup().catch(() => {});
    if (outputDir) writeFileSync(`${outputDir}/manifest.json`, JSON.stringify({ cmd, failed: true, error: e.message, options,
      browsers: browserRuns.map(({ id, diagnostics, traceResult }) => ({ id, diagnostics, trace: traceResult || null })), shots: manifest || [] }, null, 2) + "\n");
    throw e;
  }

  const ms = Date.now() - t0;
  const result = { cmd, ms, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean),
    options, requestedGl: options.gpu, cpuBudget: captureCpuBudget(), workerTimings,
    browsers: browserRuns.map(({ id, diagnostics, traceResult }) => ({ id, diagnostics, trace: traceResult || null })), shots: manifest };
  if (outputDir) writeFileSync(`${outputDir}/manifest.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.error(`[${cmd}] finished in ${(ms / 1000).toFixed(1)}s — ${manifest.length} shot(s)`);
  const bad = (manifest || []).filter((m) => m && (m.blank || m.err));
  const traceFailures = options.trace ? browserRuns.filter((run) => run.traceResult?.error) : [];
  if (traceFailures.length) { console.error("capture trace failed:", traceFailures.map((run) => run.traceResult.error).join(", ")); process.exitCode = 1; }
  if (bad.length) {
    console.error(`\n⚠ ${bad.length} blank/failed:`, bad.map((b) => b.name || b.job || b.err).join(", "));
    process.exitCode = 1;
  }
}

if (invoked(import.meta.url)) main().finally(shutdown)
  .catch((e) => { console.error("FATAL", e); process.exitCode = 1; });
