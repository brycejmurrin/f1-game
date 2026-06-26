#!/usr/bin/env node
// apex-capture — parallel headless screenshot capture to VALIDATE cameras, game
// modes, and tracks. Boots N static servers + one Chromium, runs pages
// concurrently, writes PNGs, and prints a JSON manifest (bytes + blank flag, so
// you can spot a broken/blank render without opening every file).
//
//   node tools/apex-capture.mjs cameras [track] [outdir]    # 12 camera modes
//   node tools/apex-capture.mjs modes   [outdir]            # menu/race day,wet,night/results/timetrial
//   node tools/apex-capture.mjs tracks  [outdir] [id ...]   # one orbit shot per track (default: all 24)
//
// A frame under ~5 KB is flagged blank:true. Runs locally and in the web sandbox
// (Chromium is preinstalled; this picks it via executablePath).

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const [cmd = "modes", ...rest] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAND = { width: 844, height: 390 };

function chrome() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
  return undefined;
}
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
async function startServers(n) {
  const ports = [];
  const procs = [];
  for (let i = 0; i < n; i++) {
    const port = await freePort();
    procs.push(spawn("python3", ["-m", "http.server", String(port)], { cwd: ROOT, stdio: "ignore" }));
    ports.push(port);
  }
  await sleep(700);
  return { ports, kill: () => procs.forEach((p) => { try { p.kill(); } catch {} }) };
}
async function open(browser, port, viewport = LAND) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  return page;
}
async function race(page, track) {
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction((t) => window.__apex.info().track === t, track, { timeout: 15000 });
  await sleep(1600);
}
async function shot(page, dir, name, sel = "canvas#game") {
  const buf = await page.locator(sel).screenshot({ path: `${dir}/${name}.png` });
  return { name, bytes: buf.length, blank: buf.length < 5000 };
}

// chunk an array of jobs across `pages`, run pages concurrently
async function fanout(pages, jobs, run) {
  const queues = pages.map(() => []);
  jobs.forEach((j, i) => queues[i % pages.length].push(j));
  const all = await Promise.all(pages.map((pg, i) => (async () => {
    const r = [];
    for (const j of queues[i]) r.push(await run(pg, j).catch((e) => ({ job: j, err: e.message })));
    return r;
  })()));
  return all.flat();
}

async function main() {
  const CAMS = ["chase","far","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"];
  const browser = await chromium.launch({
    executablePath: chrome(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu", "--disable-background-timer-throttling"],
  });
  const t0 = Date.now();
  let manifest;

  if (cmd === "cameras") {
    const track = rest[0] && !rest[0].includes("/") && !rest[0].startsWith(".") ? rest[0] : "monza";
    const dir = (rest[1] || `${ROOT}/scratch/cameras`); mkdirSync(dir, { recursive: true });
    const { ports, kill } = await startServers(4);
    const pages = await Promise.all(ports.map((p) => open(browser, p)));
    await Promise.all(pages.map((pg) => race(pg, track).then(() => pg.evaluate(() => window.__apex.park(0.1)))));
    manifest = await fanout(pages, CAMS, async (pg, m) => {
      await pg.evaluate((mm) => { window.__apex.camera(mm); window.__apex.snapCam && window.__apex.snapCam(); }, m);
      await sleep(180);
      return shot(pg, dir, `cam-${m}`);
    });
    kill();
  } else if (cmd === "tracks") {
    const dir = (rest[0] && (rest[0].includes("/") || rest[0].startsWith(".")) ? rest.shift() : `${ROOT}/scratch/tracks`);
    mkdirSync(dir, { recursive: true });
    const { ports, kill } = await startServers(4);
    const pages = await Promise.all(ports.map((p) => open(browser, p)));
    let ids = rest.filter((x) => !x.includes("/"));
    if (!ids.length) ids = await pages[0].evaluate(() => window.__apex.tracks().map((t) => t.id || t));
    manifest = await fanout(pages, ids, async (pg, id) => {
      await race(pg, id);
      await pg.evaluate(() => { window.__apex.park(0.1); window.__apex.orbit(0.1, 50, 22, 70); });
      await sleep(250);
      return shot(pg, dir, `track-${id}`);
    });
    kill();
  } else { // modes
    const dir = (rest[0] || `${ROOT}/scratch/modes`); mkdirSync(dir, { recursive: true });
    const { ports, kill } = await startServers(4);
    const jobs = [
      { srv: 0, fn: async (pg) => { await sleep(900); return [await shot(pg, dir, "screen-menu", "body")]; }, viewport: { width: 1100, height: 720 } },
      { srv: 1, fn: async (pg) => {
        const r = []; await race(pg, "monza");
        await pg.evaluate(() => { window.__apex.go(); window.__apex.jump(0.18, 60, 0); window.__apex.hud(true); });
        await sleep(400); r.push(await shot(pg, dir, "mode-race-day"));
        await pg.evaluate(() => window.__apex.weather("wet")); await sleep(500); r.push(await shot(pg, dir, "mode-race-wet"));
        await pg.evaluate(() => { window.__apex.weather("dry"); window.__apex.setTimeOfDay("night"); });
        await sleep(1400); await pg.evaluate(() => window.__apex.jump(0.18, 60, 0)); await sleep(400);
        r.push(await shot(pg, dir, "mode-race-night")); return r; } },
      { srv: 2, fn: async (pg) => {
        await race(pg, "spa");
        await pg.evaluate(() => { window.__apex.go(); window.__apex.setLap && window.__apex.setLap(3); window.__apex.finishRace(); });
        await sleep(900); return [await shot(pg, dir, "screen-results", "body")]; }, viewport: { width: 1100, height: 600 } },
      { srv: 3, fn: async (pg) => {
        const r = [];
        await pg.evaluate(() => window.__apex.tt && window.__apex.tt("suzuka"));
        await pg.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 }); await sleep(1600);
        await pg.evaluate(() => { window.__apex.go && window.__apex.go(); window.__apex.jump(0.25, 60, 0); window.__apex.hud(true); });
        await sleep(400); r.push(await shot(pg, dir, "mode-timetrial")); return r; } },
    ];
    const out = await Promise.all(jobs.map(async (j) => {
      const pg = await open(browser, ports[j.srv], j.viewport || LAND);
      const res = await j.fn(pg).catch((e) => [{ err: e.message }]);
      await pg.close(); return res;
    }));
    manifest = out.flat();
    kill();
  }

  await browser.close();
  console.log(JSON.stringify({ cmd, ms: Date.now() - t0, shots: manifest }, null, 2));
  const bad = manifest.filter((m) => m.blank || m.err);
  if (bad.length) { console.error(`\n⚠ ${bad.length} blank/failed:`, bad.map((b) => b.name || b.job).join(", ")); process.exitCode = 1; }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
