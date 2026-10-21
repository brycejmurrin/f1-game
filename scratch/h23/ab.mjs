#!/usr/bin/env node
// B·H23 phone renderer A/B — TLX (three, WebGL2 path = the iPhone path) vs GLX (webgl2),
// on a phone profile: 844x390 landscape, DPR 3, touch, iPhone Safari UA (=> GLX.isMobile, mobileTier).
//
//   node scratch/h23/ab.mjs stills --backend three|webgl2 --tier low|med [--only a,b]
//   node scratch/h23/ab.mjs mem    --backend three|webgl2
//   node scratch/h23/ab.mjs perf   --backend three|webgl2 [--tracks monza,monaco] [--secs 30] [--throttle 4]
//
// Output: scratch/h23/out/{stills,mem,perf}/...  One browser per invocation.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../../tools/lib/harness.mjs";
import { awaitPresentedFrame, openGarage } from "../../tools/shot/probe-page.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "scratch/h23/out");
const argv = process.argv.slice(2);
const mode = argv[0];
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const backend = flag("--backend", "three");
const tier = flag("--tier", "low");
const only = flag("--only", null)?.split(",");
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

async function boot() {
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--js-flags=--expose-gc"] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(({ be, tier }) => {
    try {
      localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three") localStorage.setItem("apex26.tlxForceGL", "1");   // the iPhone path (PHONE-GPU-TEST: backendPick.api webgl2)
      localStorage.setItem("apex26.resMode", JSON.stringify(tier));
      localStorage.setItem("apex26.spatialUpscale", tier === "med" ? "1" : "0");
    } catch (_) {}
    // reduced motion: no flyby, no view transitions (installProbeInit's trap list)
    try {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => String(q).includes("prefers-reduced-motion")
        ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }
        : orig(q);
    } catch (_) {}
    window.addEventListener("unhandledrejection", (e) => { if (String(e?.reason?.message || e?.reason).includes("Transition was skipped")) e.preventDefault(); }, true);
  }, { be: backend, tier });
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null && window.__apex.info().state === "menu", null, { polling: 200, timeout: 120_000 });
  await page.evaluate(async () => { if (typeof Assets !== "undefined" && Assets.loadModels) { try { await Assets.loadModels(); } catch (_) {} } });
  const cdp = await ctx.newCDPSession(page);
  return { srv, browser, page, cdp, errors };
}

async function env(page) {
  return page.evaluate(() => {
    const a = window.__apex, g = typeof GLX !== "undefined" ? GLX : {};
    let rs = null; try { rs = a.renderScale(); } catch (_) {}
    return { backend: g.backend || null, api: g.api || null, mobileTier: !!g.mobileTier, isMobile: !!g.isMobile,
      upscale: g.getSpatialUpscale ? !!g.getSpatialUpscale() : null, renderScale: rs,
      canvas: (() => { const c = document.getElementById("game"); return c ? [c.width, c.height] : null; })(),
      coarse: matchMedia("(pointer: coarse)").matches, dpr: devicePixelRatio };
  });
}

// ---------- stills ----------
const SCENES = [
  { id: "menu", kind: "menu" },
  { id: "garage", kind: "garage" },
  { id: "monza-grid", kind: "race", track: "monza", grid: true, cam: "chase" },
  { id: "monza-helmet", kind: "race", track: "monza", frac: 0.04, cam: "helmet" },
  { id: "monza-straight", kind: "race", track: "monza", frac: 0.04, cam: "chase" },
  { id: "monaco-kerb", kind: "race", track: "monaco", frac: 0.035, orbit: [200, 14, 22] },
  { id: "spa-chase", kind: "race", track: "spa", frac: 0.06, cam: "chase" },
  { id: "singapore-night", kind: "race", track: "singapore", frac: 0.05, tod: "night", cam: "chase" },
  { id: "spa-rain", kind: "race", track: "spa", frac: 0.06, weather: "rain", cam: "chase" },
  { id: "monza-mirror", kind: "race", track: "monza", frac: 0.04, hud: true, cam: "chase" },
];

async function shoot(page, name) {
  const dir = resolve(OUT, "stills"); mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}-${tier}-${backend}.png`);
  await page.screenshot({ path, timeout: 90_000 });
  return path;
}

async function stills() {
  const { srv, browser, page, errors } = await boot();
  const rows = [];
  try {
    let curTrack = null, curKey = null;
    for (const sc of SCENES) {
      if (only && !only.includes(sc.id)) continue;
      const t0 = Date.now();
      if (sc.kind === "menu") {
        await page.evaluate(() => { const x = document.getElementById("ios-install-x"); if (x && !document.getElementById("ios-install").hidden) x.click(); });
        await sleep(4000); await awaitPresentedFrame(page, 15000); await sleep(800);
      } else if (sc.kind === "garage") {
        await openGarage(page, { team: "mercedes" });
        await sleep(10000);   // let the arrival camera settle, then reset to the default framing
        await page.evaluate(() => document.getElementById("cs-view-reset")?.click());
        await sleep(6000); await awaitPresentedFrame(page, 20000); await sleep(800);
      } else {
        const key = `${sc.track}|${sc.tod || "day"}|${sc.weather || "dry"}`;
        if (key !== curKey) {
          await page.evaluate(({ t, tod, w }) => window.__apex.race(t, tod || "day", w || "dry", { grid: "tier" }), { t: sc.track, tod: sc.tod, w: sc.weather });
          await page.waitForFunction((t) => window.__apex.info().track === t || window.__apex.info().track?.id === t || !!window.__apex.info().track, sc.track, { polling: 200, timeout: 120_000 });
          if (sc.grid) await page.evaluate(() => window.__apex.freeze(true));   // lights stay at their pre-start state on both backends
          await sleep(3000);
          curKey = key; curTrack = sc.track;
        }
        await page.evaluate(() => { if (typeof PerfGov !== "undefined" && PerfGov.setTierHold) PerfGov.setTierHold(true); });
        await page.evaluate((sc) => {
          const a = window.__apex;
          a.headless(false);
          if (a.lightTune) a.lightTune({ lampWarmup: 0, lampFlicker: 0 });
          if (a.hud) a.hud(!!sc.hud);
          if (sc.cam) a.camera(sc.cam);
          if (!sc.grid) { a.go(); a.park(sc.frac); a.freeze(true); }
          if (sc.orbit) a.orbit(sc.frac, sc.orbit[0], sc.orbit[1], sc.orbit[2]); else a.snapCam();
          a.step && a.step(1 / 60, 4);
        }, sc);
        await sleep(2500);
        // re-park: a slow first build can let the start sequence put the car back on the grid after park()
        if (!sc.grid) await page.evaluate((sc) => { const a = window.__apex; a.park(sc.frac); a.freeze(true); if (sc.orbit) a.orbit(sc.frac, sc.orbit[0], sc.orbit[1], sc.orbit[2]); }, sc);
        await sleep(1200);
        if (!sc.orbit) { await page.evaluate(() => window.__apex.snapCam()); await sleep(300); }
        await awaitPresentedFrame(page, 30000);
        await page.evaluate(() => window.__apex.headless(true));
        await sleep(200);
      }
      const e = await env(page);
      const extra = sc.hud ? await page.evaluate(() => { try { return window.__apex.mirror(); } catch (x) { return String(x); } }) : null;
      const path = await shoot(page, sc.id);
      rows.push({ scene: sc.id, path, ms: Date.now() - t0, env: e, mirror: extra });
      console.log(JSON.stringify({ scene: sc.id, ms: Date.now() - t0, env: e }));
    }
  } finally {
    writeFileSync(resolve(OUT, `stills-${tier}-${backend}.json`), JSON.stringify({ backend, tier, rows, errors }, null, 1));
    await browser.close(); srv.close?.();
  }
}

// ---------- memory ----------
async function sample(cdp, page, label) {
  for (let i = 0; i < 3; i++) { await cdp.send("HeapProfiler.collectGarbage"); await sleep(300); }
  const h = await cdp.send("Runtime.getHeapUsage");
  const tlx = await page.evaluate(() => { try { const m = GLX.__tlx?.memState?.(); return m ? { geometries: m.geometries ?? m.geo, textures: m.textures ?? m.tex, progs: m.progs } : null; } catch (_) { return null; } });
  const st = await page.evaluate(() => window.__apex.info().state);
  const pm = await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1) : null);
  const row = { label, state: st, usedMB: +(h.usedSize / 2 ** 20).toFixed(1), arrayBufMB: +((h.backingStorageSize || 0) / 2 ** 20).toFixed(1),
    embedderMB: +((h.embedderHeapUsedSize || 0) / 2 ** 20).toFixed(1), totalMB: +(((h.usedSize || 0) + (h.backingStorageSize || 0)) / 2 ** 20).toFixed(1), perfMemMB: pm, tlx };
  console.log(JSON.stringify(row));
  return row;
}

// race() from a live race can throw "Race start did not reach the grid": freeze first, retry once.
async function raceTo(page, t) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.evaluate(() => { try { window.__h23?.stop?.(); window.__apex.freeze(true); } catch (_) {} });
      await page.evaluate((t) => window.__apex.race(t, "day", "dry", { grid: "tier" }), t);
      await page.waitForFunction(() => !!window.__apex.info().track, null, { polling: 200, timeout: 120_000 });
      await page.evaluate(() => window.__apex.freeze(false));
      return;
    } catch (e) { console.error("race retry", t, String(e.message).slice(0, 120)); await sleep(3000); }
  }
  throw new Error("race() failed 3x for " + t);
}

async function toMenu(page) {
  await page.evaluate(() => { const a = window.__apex; if (a.menu) a.menu(); else if (a.quit) a.quit(); else if (a.toMenu) a.toMenu(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
}

async function mem() {
  const { srv, browser, page, cdp, errors } = await boot();
  const rows = [];
  try {
    await sleep(6000);
    rows.push(await sample(cdp, page, "menu"));
    const tracks = ["monza", "monaco", "spa"];
    for (let c = 0; c < 3; c++) {
      const t = tracks[c];
      await raceTo(page, t);
      await page.evaluate(() => { const a = window.__apex; a.go(); });
      await sleep(10_000);
      rows.push(await sample(cdp, page, `race${c + 1}-${t}`));
    }
  } finally {
    writeFileSync(resolve(OUT, `mem-${backend}.json`), JSON.stringify({ backend, tier, env: await env(page).catch(() => null), rows, errors }, null, 1));
    await browser.close(); srv.close?.();
  }
}

// ---------- perf ----------
async function perf() {
  const tracks = flag("--tracks", "monza,monaco").split(",");
  const secs = +flag("--secs", "30"), throttle = +flag("--throttle", "4");
  const { srv, browser, page, cdp, errors } = await boot();
  const rows = [];
  try {
    for (const t of tracks) {
      await raceTo(page, t);
      await sleep(4000);
      await page.evaluate(installDriver);
      await page.evaluate(() => window.__h23.start());
      await sleep(3000);   // roll off the grid before timing
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      await page.evaluate(() => window.__h23.mark());
      await sleep(secs * 1000);
      const r = await page.evaluate(() => window.__h23.stop());
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const e = await env(page);
      const row = { track: t, throttle, secs, ...r, env: e };
      console.log(JSON.stringify(row)); rows.push(row);
    }
  } finally {
    writeFileSync(resolve(OUT, `perf-${tier}-${backend}.json`), JSON.stringify({ backend, tier, rows, errors }, null, 1));
    await browser.close(); srv.close?.();
  }
}

// gpu-game-check's closed-loop driver (autopilot.spec law) + a rAF interval recorder.
function installDriver() {
  const raf = window.requestAnimationFrame.bind(window);
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const VMAX = 94, A_LAT = 13, A_BRAKE = 24, KP = 2.4;
  let on = false, prev = 0, hold = 30, stalled = 0, lastProg = null, dts = [], s0 = null, sLast = null, dist = 0, last = 0;
  const tick = (ts) => {
    if (!on) return; raf(tick);
    if (last) dts.push(ts - last); last = ts;
    const A = window.__apex; const dt = prev ? Math.min(0.1, Math.max(0.001, (ts - prev) / 1000)) : 1 / 60; prev = ts;
    let p, pts; try { p = A.probe(); pts = p ? A.scan(DISTS) : null; } catch (_) { return; }
    if (!p || !pts) return;
    let kSteer = p.k; const look = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(A_LAT / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < pts.length; j++) { const d = DISTS[j], k = Math.abs(pts[j].k); if (d <= look) kSteer = pts[j].k;
      const vc = k > 1e-4 ? Math.sqrt(A_LAT / k) : VMAX; const va = Math.sqrt(vc * vc + 2 * A_BRAKE * d); if (va < vT) vT = va; }
    vT = Math.max(11, Math.min(VMAX, vT)); hold = Math.min(vT, hold + 30 * dt); vT = hold;
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    let steer = Math.max(-1, Math.min(1, KP * (Math.atan2(kSteer * L * L * 0.5 - p.x, L) - p.angle)));
    if (lastProg != null && p.s - lastProg < 0.05 && p.speed < 3) stalled++; else stalled = 0; lastProg = p.s;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
    if (stalled > 10) { steer = Math.max(-0.4, Math.min(0.4, steer)); throttle = true; brake = false; }
    else if (Math.abs(p.x) - p.hw > 0.4) throttle = false;
    try { A.setInput({ steer, throttle, brake }); } catch (_) {}
    if (sLast != null) { const ds = p.s - sLast; if (ds > 0 && ds < 50) dist += ds; } sLast = p.s;
  };
  window.__h23 = {
    start() { const A = window.__apex; try { A.freeze(false); A.go(); A.hud(true); } catch (_) {} on = true; raf(tick); },
    mark() { dts = []; dist = 0; },
    stop() {
      on = false; const a = dts.slice().sort((x, y) => x - y); const q = (f) => +(a[Math.min(a.length - 1, Math.floor(f * a.length))] || 0).toFixed(1);
      let perfSnap = null; try { const p = window.__apex.perf(); perfSnap = { tier: p.tier, scale: p.scale, auto: p.auto }; } catch (_) {}
      return { frames: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), fps: +(1000 / (a.reduce((s, x) => s + x, 0) / Math.max(1, a.length))).toFixed(1), metres: Math.round(dist), gov: perfSnap };
    },
  };
}

try {
  mkdirSync(OUT, { recursive: true });
  if (mode === "stills") await stills();
  else if (mode === "mem") await mem();
  else if (mode === "perf") await perf();
  else { console.error("mode: stills|mem|perf"); process.exitCode = 2; }
} finally { shutdown?.(); }
