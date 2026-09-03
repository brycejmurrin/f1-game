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
//   node tools/capture/apex-capture.mjs cameras [track] [outdir]
//   node tools/capture/apex-capture.mjs modes   [outdir]
//   node tools/capture/apex-capture.mjs tracks  [outdir] [id ...]
//   node tools/capture/apex-capture.mjs identity [outdir] [id ...]   # aerial+tour+eye
//   node tools/capture/apex-capture.mjs lap-tour [track] [speed] [outdir] [weather=wet] [tod=dusk]
//
// Env: APEX_WORKERS=N  (default 2 for identity/tracks — 4+ OOMs SwiftShader on laptops)
// Logs/redirects: use artifacts/tmp/ (never /tmp) — e.g.
//   node tools/capture/apex-capture.mjs identity scratch/captures/apex-capture/identity > artifacts/tmp/apex-identity.log 2>&1 &
// Default output roots when [outdir] is omitted:
//   cameras  -> scratch/captures/apex-capture/cameras
//   tracks   -> scratch/captures/apex-capture/tracks
//   identity -> scratch/captures/apex-capture/identity
//   lap-tour -> scratch/captures/apex-capture/lap-tour
//   modes    -> scratch/captures/apex-capture/modes
// A frame under ~5 KB is flagged blank:true.

import { mkdirSync, createReadStream, statSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { join, normalize, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const [cmd = "modes", ...rest] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAND = { width: 844, height: 390 };
const IDENTITY_VP = { width: 960, height: 540 };

function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

/** One async Node static server — concurrent GETs (unlike python -m http.server). */
async function startStaticServer() {
  const port = await freePort();
  const root = ROOT + sep;
  const server = createHttpServer((req, res) => {
    try {
      const u = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      let rel = decodeURIComponent(u.pathname);
      if (rel === "/") rel = "/index.html";
      const file = normalize(join(ROOT, rel));
      if (!file.startsWith(root) && file !== ROOT) {
        res.writeHead(403); res.end("forbidden"); return;
      }
      let st;
      try { st = statSync(file); } catch {
        res.writeHead(404); res.end("not found"); return;
      }
      if (!st.isFile()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-store",
      });
      createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e && e.message || e));
    }
  });
  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, "127.0.0.1", res);
  });
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    kill: () => new Promise((r) => server.close(() => r())),
  };
}

async function launchBrowser() {
  return launchChromium({
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
}

async function openPage(browser, baseUrl, viewport = LAND) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 20000 });
  return page;
}

async function race(page, track, settleMs = 1600) {
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 60000 });
  await sleep(settleMs);
}

async function waitFrames(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let i = 0;
    const tick = () => { if (++i >= count) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
}

async function shotPng(page, dir, name, sel = "canvas#game") {
  // Match survey-track.mjs: locator.screenshot reads the composited canvas.
  // Do NOT use canvas.toDataURL — WebGL clears the backbuffer (black frame).
  // Do NOT use page.screenshot({animations:'disabled'}) — hangs under SwiftShader.
  if (sel !== "canvas#game") {
    const buf = await page.locator(sel).screenshot({ path: `${dir}/${name}.png`, timeout: 60000 });
    return { name: `${name}.png`, bytes: buf.length, blank: buf.length < 5000 };
  }
  await waitFrames(page, 2);
  const buf = await page.locator("canvas#game").screenshot({
    path: `${dir}/${name}.png`,
    timeout: 60000,
  });
  return { name: `${name}.png`, bytes: buf.length, blank: buf.length < 5000 };
}

async function shotJpg(page, dir, name) {
  await waitFrames(page, 2);
  const buf = await page.locator("canvas#game").screenshot({
    path: `${dir}/${name}.jpg`,
    type: "jpeg",
    quality: 72,
    timeout: 60000,
  });
  return { name: `${name}.jpg`, bytes: buf.length, blank: buf.length < 5000 };
}

/**
 * N independent Chromium processes, each with one page on the shared server.
 * Returns { workers:[{id,browser,page,viewport}], kill, revive(w) }.
 */
async function startWorkerPool(n, baseUrl, viewport = LAND) {
  const workers = [];
  async function boot(id) {
    const browser = await launchBrowser();
    const page = await openPage(browser, baseUrl, viewport);
    page.on("crash", () => console.error(`[pool] w${id} PAGE CRASH`));
    browser.on("disconnected", () => console.error(`[pool] w${id} BROWSER DISCONNECTED`));
    return { id, browser, page, viewport, baseUrl };
  }
  for (let i = 0; i < n; i++) {
    workers.push(await boot(i));
    console.error(`[pool] worker ${i} ready`);
    if (i < n - 1) await sleep(400); // stagger launches — parallel SwiftShader OOMs easily
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
async function poolMap(workers, jobs, run, revive) {
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
        results[item.i] = { job: item.job, err: msg };
      }
    }
  }));
  return results;
}

// Static shard fanout for same-track multi-shot (cameras) — one browser, N pages.
async function fanoutPages(pages, jobs, run) {
  const queues = pages.map(() => []);
  jobs.forEach((j, i) => queues[i % pages.length].push(j));
  const all = await Promise.all(pages.map((pg, i) => (async () => {
    const r = [];
    for (const j of queues[i]) r.push(await run(pg, j).catch((e) => ({ job: j, err: e.message })));
    return r;
  })()));
  return all.flat();
}

function workersEnv(def = 2) {
  return Math.max(1, Math.min(8, parseInt(process.env.APEX_WORKERS || String(def), 10) || def));
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

  try {
    if (cmd === "cameras") {
      // Same track loaded once per page — tabs in one browser are fine here.
      const track = rest[0] && !rest[0].includes("/") && !rest[0].startsWith(".") ? rest[0] : "monza";
      const dir = (rest[1] || `${ROOT}/scratch/captures/apex-capture/cameras`); mkdirSync(dir, { recursive: true });
      const CAMS = ["chase","far","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"];
      const staticSrv = await startStaticServer();
      cleanup = async () => { await staticSrv.kill(); };
      const browser = await launchBrowser();
      const pages = await Promise.all([0, 1, 2, 3].map(() => openPage(browser, staticSrv.url)));
      await Promise.all(pages.map((pg) => race(pg, track).then(() => pg.evaluate(() => window.__apex.park(0.1)))));
      manifest = await fanoutPages(pages, CAMS, async (pg, m) => {
        await pg.evaluate((mm) => { window.__apex.camera(mm); window.__apex.snapCam && window.__apex.snapCam(); }, m);
        await sleep(180);
        return shotPng(pg, dir, `cam-${m}`);
      });
      await browser.close();
      await staticSrv.kill();
      cleanup = async () => {};
    } else if (cmd === "tracks" || cmd === "identity") {
      const isIdentity = cmd === "identity";
      const dirArg = rest[0] && (rest[0].includes("/") || rest[0].startsWith(".")) ? rest.shift() : null;
      const dir = dirArg || `${ROOT}/scratch/captures/apex-capture/${isIdentity ? "identity" : "tracks"}`;
      mkdirSync(dir, { recursive: true });
      const n = workersEnv(2);
      const staticSrv = await startStaticServer();
      console.error(`[${cmd}] static server :${staticSrv.port}, ${n} Chromium workers`);
      const pool = await startWorkerPool(n, staticSrv.url, isIdentity ? IDENTITY_VP : LAND);
      const { workers, kill: killPool, revive } = pool;
      cleanup = async () => { await killPool(); await staticSrv.kill(); };

      let ids = rest.filter((x) => !x.includes("/"));
      if (!ids.length) {
        ids = await workers[0].page.evaluate(() => window.__apex.tracks().map((t) => t.id || t));
      }
      console.error(`[${cmd}] ${ids.length} tracks → ${dir}`);

      if (isIdentity) {
        manifest = await poolMap(workers, ids, async (w, id) => {
          const t1 = Date.now();
          console.error(`[identity] w${w.id} start ${id}`);
          await race(w.page, id, 1400); // same settle as survey-track.mjs
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
          return out;
        }, revive);
        manifest = manifest.flat();
      } else {
        manifest = await poolMap(workers, ids, async (w, id) => {
          const t1 = Date.now();
          console.error(`[tracks] w${w.id} start ${id}`);
          await race(w.page, id, 700);
          await w.page.evaluate(() => { window.__apex.park(0.1); window.__apex.orbit(0.1, 50, 22, 70); });
          await sleep(150);
          const s = await shotPng(w.page, dir, `track-${id}`);
          console.error(`[tracks] w${w.id} done  ${id} (${Date.now() - t1}ms)`);
          return s;
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
      const staticSrv = await startStaticServer();
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
      // Independent scenes — one Chromium per job (real parallelism).
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
          await pg.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 15000 }); await sleep(1600);
          await pg.evaluate(() => { window.__apex.go && window.__apex.go(); window.__apex.jump(0.25, 60, 0); window.__apex.hud(true); });
          await sleep(400); return [await shotPng(pg, dir, "mode-timetrial")];
        } },
      ];
      const browsers = [];
      cleanup = async () => {
        await Promise.all(browsers.map(async (b) => { try { await b.close(); } catch {} }));
        await staticSrv.kill();
      };
      const out = await Promise.all(jobs.map(async (j) => {
        const browser = await launchBrowser();
        browsers.push(browser);
        const pg = await openPage(browser, staticSrv.url, j.viewport || LAND);
        return j.fn(pg).catch((e) => [{ err: e.message, job: j.name }]);
      }));
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
  console.log(JSON.stringify({ cmd, ms, shots: manifest }, null, 2));
  console.error(`[${cmd}] finished in ${(ms / 1000).toFixed(1)}s — ${manifest.length} shot(s)`);
  const bad = (manifest || []).filter((m) => m && (m.blank || m.err));
  if (bad.length) {
    console.error(`\n⚠ ${bad.length} blank/failed:`, bad.map((b) => b.name || b.job || b.err).join(", "));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
