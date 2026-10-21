// B·H12 live-memory harness: phone profile (844x390, touch, isMobile), TLX default.
// Cycle: menu -> race(monza, 5 laps, headless autopilot) with one rendered window
// (GC trace + sampling allocation profile) -> pause/quit to menu -> garage open/close
// -> race(spa) -> quit. Post-GC heap, DOM counters and renderer.info at every step.
// usage: node scratch/h12/leak-run.mjs [--cycles 3] [--laps 5] [--render-s 20] [--out scratch/h12/run.json] [--snap DIR]
import { writeFileSync, mkdirSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, launchChromium, shutdown, sleep } from "../../tools/lib/harness.mjs";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = (() => { const i = process.argv.indexOf("--root"); return i > 0 ? resolve(process.argv[i + 1]) : HERE; })();
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const CYCLES = +arg("cycles", 3), LAPS = +arg("laps", 5), RENDER_S = +arg("render-s", 20);
const OUT = arg("out", join(HERE, "scratch/h12/run.json")), SNAP = arg("snap", null);
const TRACK = arg("track", "monza"), TRACK2 = arg("track2", "spa");

const rows = [], errors = [], t0 = Date.now();
const log = (o) => { o.t = +((Date.now() - t0) / 1000).toFixed(1); rows.push(o); console.log(JSON.stringify(o)); };

async function sample(page, cdp, step) {
  await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage");
  const h = await cdp.send("Runtime.getHeapUsage");
  const d = await cdp.send("Memory.getDOMCounters");
  const pg = await page.evaluate(() => {
    const r = window.renderer, m = r && r.info && r.info.memory;
    let st = null; try { st = window.__apex.info().state; } catch (_) {}
    let sets = null; try { const w = window.__h12sets; if (!w && typeof GameStore !== "undefined") { const S = GameStore.store, o = S.set; window.__h12sets = { n: 0, keys: {} }; S.set = function (k, v, opt) { const z = window.__h12sets; z.n++; z.keys[k] = (z.keys[k] || 0) + 1; return o.call(this, k, v, opt); }; } if (w) { sets = { n: w.n, rev: GameStore.store.rev, top: Object.entries(w.keys).sort((a, b) => b[1] - a[1]).slice(0, 6) }; w.n = 0; w.keys = {}; } } catch (_) {}
    return { sets, state: st, rGeo: m ? m.geometries : null, rTex: m ? m.textures : null, rProg: m ? m.programs : null,
      rTotalMB: m && m.total != null ? +(m.total / 1048576).toFixed(1) : null,
      rObj: r && r._objects && r._objects._renderObjects ? r._objects._renderObjects.size : null };
  });
  log({ step, heapMB: +(h.usedSize / 1048576).toFixed(2), embedMB: +((h.embedderHeapUsedSize || 0) / 1048576).toFixed(2),
    backMB: +((h.backingStorageSize || 0) / 1048576).toFixed(2), nodes: d.nodes, listeners: d.jsEventListeners, docs: d.documents, ...pg });
}

async function snap(cdp, file) {
  mkdirSync(dirname(file), { recursive: true });
  const ws = createWriteStream(file);
  const on = (p) => ws.write(p.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); } finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", on); await new Promise((r) => ws.end(r)); }
}

// The autopilot spec's closed loop (tests/specs/autopilot.spec.js), stepped headless.
const DRIVE = (frames) => {
  const A = window.__apex, dt = 1 / 60, VMAX = 94, aLat = 13, A_BRAKE = 24, Kp = 2.4;
  const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
  const st = window.__h12st || (window.__h12st = { hold: 30, stalled: 0, last: null });
  for (let f = 0; f < frames; f++) {
    const p = A.probe(); if (!p) return { err: "no probe" };
    const pts = A.scan(DISTS); let kSteer = p.k; const look = Math.max(9, p.speed * 0.4);
    let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(aLat / Math.abs(p.k)) : VMAX;
    for (let j = 0; j < pts.length; j++) { const d = DISTS[j], k = Math.abs(pts[j].k); if (d <= look) kSteer = pts[j].k;
      const vc = k > 1e-4 ? Math.sqrt(aLat / k) : VMAX; const va = Math.sqrt(vc * vc + 2 * A_BRAKE * d); if (va < vT) vT = va; }
    vT = Math.max(11, Math.min(VMAX, vT)); st.hold = Math.min(vT, st.hold + 30 * dt); vT = st.hold;
    const L = Math.max(8, Math.min(38, p.speed * 0.6));
    let steer = Math.max(-1, Math.min(1, Kp * (Math.atan2(kSteer * L * L * 0.5 - p.x, L) - p.angle)));
    if (st.last != null && p.s - st.last < 0.05 && p.s >= st.last) st.stalled++; else st.stalled = 0; st.last = p.s;
    let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
    if (st.stalled > 10) { steer = Math.max(-0.4, Math.min(0.4, steer)); throttle = true; brake = false; }
    else if (Math.abs(p.x) - p.hw > 0.4) throttle = false;
    A.setInput({ steer, throttle, brake }); A.step(dt, 1);
  }
  const ps = A.physState(); return { lap: ps.lap, prog: ps.prog, state: A.info().state };
};

async function startRace(page, id, laps) {
  await page.evaluate(([tid, l]) => { window.__h12st = null; return window.__apex.race(tid, null, null, { laps: l }); }, [id, laps]);
  await page.waitForFunction((tid) => { try { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); } catch (_) { return false; } }, id, { polling: 200, timeout: 300000 });
  await page.evaluate(() => window.__apex.go());
}

async function quitToMenu(page) {
  await page.evaluate(() => { window.__apex.clearInput(); window.__apex.headless(false); });
  if (await page.evaluate(() => window.__apex.info().state === "results")) {
    await sleep(4000);   // the results screen as a player sees it, then MENU
    const r = await page.evaluate(() => { const b = document.getElementById("res-menu"); if (!b || b.offsetParent === null) return false; b.click(); return true; });
    await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 200, timeout: 60000 }).catch(() => {});
    return r ? "res-menu" : false;
  }
  await page.keyboard.press("Escape"); await sleep(600);
  const ok = await page.evaluate(() => { const b = document.getElementById("pm-quit"); if (!b || b.offsetParent === null) return false; b.click(); return true; });
  await sleep(800);
  // a confirm dialog, if one opens
  await page.evaluate(() => { const b = [...document.querySelectorAll("dialog[open] button, .modal:not([hidden]) button")].find((x) => /QUIT|YES|CONFIRM|LEAVE/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForFunction(() => { try { const s = window.__apex.info().state; return s !== "race" && s !== "count"; } catch (_) { return false; } }, null, { polling: 200, timeout: 60000 });
  return ok;
}

async function renderWindow(page, cdp, browser, label) {
  await page.evaluate(() => window.__apex.headless(false));
  // keep the car moving under real rAF: drive one step-equivalent input per frame via rAF loop
  await page.evaluate(() => { const A = window.__apex; window.__h12raf = true;
    const tick = () => { if (!window.__h12raf) return; try { const p = A.probe(); if (p) { const st = Math.max(-1, Math.min(1, 2.4 * (Math.atan2(A.probe().k * 200 - p.x, 20) - p.angle))); A.setInput({ steer: st, throttle: p.speed < 45, brake: p.speed > 50 }); } } catch (_) {} requestAnimationFrame(tick); };
    requestAnimationFrame(tick); });
  await sleep(3000);
  const tracePath = join(HERE, `scratch/h12/trace-${label}.json`);
  await browser.startTracing(page, { path: tracePath, categories: ["v8", "disabled-by-default-v8.gc", "devtools.timeline", "blink.user_timing"] });
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 2048 });
  const h0 = await cdp.send("Runtime.getHeapUsage");
  const f0 = await page.evaluate(() => window.__apex.renderClock ? null : null);
  const fr0 = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const c = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(c); else r(n); }; requestAnimationFrame(c); }));
  await page.evaluate(() => { window.__h12fr = 0; const c = () => { if (window.__h12raf) { window.__h12fr++; requestAnimationFrame(c); } }; requestAnimationFrame(c); });
  await sleep(RENDER_S * 1000);
  const frames = await page.evaluate(() => window.__h12fr);
  const prof = await cdp.send("HeapProfiler.stopSampling");
  await browser.stopTracing();
  await page.evaluate(() => { window.__h12raf = false; window.__apex.clearInput(); });
  // top allocation sites (self size) from the sampling profile
  const sites = new Map();
  const walk = (n, stack) => { const cf = n.callFrame; const key = `${cf.functionName || "(anon)"} ${(cf.url || "").replace(/^.*\/(js|vendor)\//, "$1/").replace(/\?.*$/, "")}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    if (n.selfSize) sites.set(key, (sites.get(key) || 0) + n.selfSize); for (const c of n.children || []) walk(c); };
  walk(prof.profile.head);
  const total = [...sites.values()].reduce((a, b) => a + b, 0);
  const top = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ site: k, KB: +(v / 1024).toFixed(0), pct: +(100 * v / total).toFixed(1) }));
  writeFileSync(join(HERE, `scratch/h12/alloc-${label}.json`), JSON.stringify(prof.profile));
  log({ step: `render:${label}`, fps1s: fr0, frames, KBperFrame: +(total / 1024 / Math.max(1, frames)).toFixed(1), sampledMB: +(total / 1048576).toFixed(2), sampledMBperMin: +(total / 1048576 / (RENDER_S / 60)).toFixed(1), top, trace: tracePath });
}

async function main() {
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info", "--use-angle=swiftshader"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
    await ctx.addInitScript(() => { window.__TEST_MODE = true; try { localStorage.setItem("apex26.tyreWear", JSON.stringify("off")); } catch (_) {} });
    await ctx.route("https://api.jolpi.ca/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("https://api.openf1.org/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    await page.goto(srv.url + (srv.url.includes("?") ? "&" : "?") + "three-devtools=1", { waitUntil: "load" });
    await page.waitForFunction(() => window.__apex && window.__apex.info && typeof Tracks !== "undefined", null, { polling: 200, timeout: 180000 });
    await sleep(5000);
    log({ step: "env", diag: await page.evaluate(() => { try { const d = window.__apex.diag(); return { backend: d.env && d.env.backend, why: d.env && d.env.backendFallback, tier: d.env && d.env.tier, dpr: devicePixelRatio, mobile: !!(window.PerfGov && PerfGov.tier && PerfGov.tier()) }; } catch (e) { return String(e); } }) });
    await sample(page, cdp, "boot");
    for (let c = 1; c <= CYCLES; c++) {
      await startRace(page, TRACK, LAPS);
      await sample(page, cdp, `${c}:race-start`);
      await page.evaluate(() => window.__apex.headless(true));
      let lastLap = -1, guard = 0;
      while (guard++ < 400) {
        const r = await page.evaluate(DRIVE, 600);
        if (r.err) { log({ step: `${c}:drive-err`, r }); break; }
        if (r.lap !== lastLap) { lastLap = r.lap; await sample(page, cdp, `${c}:lap${r.lap}`); if (SNAP && c >= 2 && r.lap === 1) await snap(cdp, join(SNAP, `cycle${c}-lap1.heapsnapshot`)); if (c === 1 && r.lap === 2) await renderWindow(page, cdp, browser, `c${c}-lap2`); if (c === CYCLES && r.lap === 2 && CYCLES > 1) await renderWindow(page, cdp, browser, `c${c}-lap2`); await page.evaluate(() => window.__apex.headless(true)); }
        if (r.state !== "race" && r.state !== "count") break;
        if (r.lap > LAPS) break;
      }
      await sample(page, cdp, `${c}:race-end`);
      const q = await quitToMenu(page);
      await sleep(3000);
      await sample(page, cdp, `${c}:menu${q ? "" : "(no-pm-quit)"}`);
      if (SNAP) await snap(cdp, join(SNAP, `cycle${c}-menu1.heapsnapshot`));
      const g = await page.evaluate(() => { const b = document.getElementById("mb-garage"); if (!b) return false; b.click(); return true; });
      await sleep(8000);
      await sample(page, cdp, `${c}:garage${g ? "" : "(no-btn)"}`);
      await page.evaluate(() => { const b = document.getElementById("ga-close"); if (b) b.click(); });
      await sleep(3000);
      await sample(page, cdp, `${c}:garage-closed`);
      await startRace(page, TRACK2, 1);
      await page.evaluate(() => window.__apex.headless(true));
      await page.evaluate(DRIVE, 1200);
      await sample(page, cdp, `${c}:${TRACK2}`);
      if (SNAP) await snap(cdp, join(SNAP, `cycle${c}-race.heapsnapshot`));
      await quitToMenu(page); await sleep(3000);
      await sample(page, cdp, `${c}:menu2`);
      if (SNAP) await snap(cdp, join(SNAP, `cycle${c}.heapsnapshot`));
    }
  } catch (e) { errors.push("FATAL " + String(e && e.stack || e).slice(0, 600)); console.error(e); }
  finally {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ rows, errors }, null, 2));
    console.log("= h12 done errors=" + errors.length + " " + JSON.stringify(errors.slice(0, 5)));
    await shutdown();
  }
}
main();
