#!/usr/bin/env node
// Parallel, LOGGED screenshot sweep.
//
// Why this exists: a serial sweep that reloads the page per track is slow and
// silent — it looks hung. This boots ONE server, runs N pages concurrently, and
// prints a timestamped line at every step so progress is always visible.
//
// Uses the documented deterministic-shot pattern (see playwright-probe skill):
//   park(frac)  -> stationary + frozen
//   snapCam()   -> REQUIRED, bypasses the camera's exponential ease. Without it
//                  you photograph a camera still flying toward the car.
// Each shot self-checks: eye-to-car distance (chase ~5.8 m, cockpit/hood ~0.3-0.6)
// and PNG size, so a mid-ease or blank frame is flagged rather than shipped.
//
// Usage: node tools/shot-sweep.mjs [concurrency]      (default 3)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "scratch/captures/pipeline");
fs.mkdirSync(OUT, { recursive: true });
const CONC = Math.max(1, Math.min(4, parseInt(process.argv[2] || "3", 10)));

const t0 = Date.now();
const log = (...m) => {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  process.stdout.write(`[${s}s] ${m.join(" ")}\n`);
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
    res.end(d);
  });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
log(`server on :${port}  concurrency ${CONC}`);

const JOBS = [
  { track: "monza",     tod: "day",   cam: "chase",   frac: 0.12 },
  { track: "monaco",    tod: "day",   cam: "cockpit", frac: 0.30 },
  { track: "spa",       tod: "day",   cam: "chase",   frac: 0.18 },
  { track: "zandvoort", tod: "day",   cam: "chase",   frac: 0.55 },
  { track: "suzuka",    tod: "day",   cam: "hood",    frac: 0.40 },
  { track: "vegas",     tod: "night", cam: "chase",   frac: 0.20 },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader"],
});
log("browser up");

const results = [];
let next = 0;
async function worker(id) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(180000);
  page.on("pageerror", e => log(`w${id} PAGEERR ${e.message}`));
  while (true) {
    const i = next++;
    if (i >= JOBS.length) break;
    const j = JOBS[i];
    const tag = `${j.track}/${j.cam}`;
    try {
      log(`w${id} ${tag} loading`);
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.__apex != null);
      log(`w${id} ${tag} building track`);
      await page.evaluate(o => window.__apex.race(o.track, o.tod, "dry"), j);
      await page.waitForFunction(t => window.__apex.info().track === t, j.track);
      await page.waitForTimeout(1600);                    // mesh build settle
      log(`w${id} ${tag} parking + snapCam`);
      const m = await page.evaluate(o => {
        window.__apex.camera(o.cam);
        window.__apex.park(o.frac);
        window.__apex.snapCam();
        window.__apex.hud(false);
        const cs = window.__apex.camState(), ws = window.__apex.wsInfo();
        return { eyeToCar: +Math.hypot(cs.eye[0] - ws.pos[0], cs.eye[2] - ws.pos[1]).toFixed(2) };
      }, j);
      await page.waitForTimeout(500);
      const name = `${j.track}-${j.tod}-${j.cam}.png`;
      log(`w${id} ${tag} shooting`);
      const buf = await page.screenshot({ path: path.join(OUT, name), animations: "disabled" });
      const kb = Math.round(buf.length / 1024);
      const suspect = m.eyeToCar > 30 || kb < 40;
      log(`w${id} ${tag} ${suspect ? "SUSPECT" : "ok"}  eye→car ${m.eyeToCar}m  ${kb}kB`);
      results.push({ shot: name, eyeToCarM: m.eyeToCar, kb, suspect });
    } catch (e) {
      log(`w${id} ${tag} FAILED ${e.message.split("\n")[0]}`);
      results.push({ shot: `${j.track}-${j.cam}`, error: e.message.split("\n")[0] });
    }
  }
  await page.close();
  log(`w${id} done`);
}
await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i + 1)));
console.table(results);
const bad = results.filter(r => r.suspect || r.error);
log(bad.length ? `${bad.length}/${results.length} SUSPECT` : `all ${results.length} shots framed + non-blank`);
await browser.close();
server.close();
