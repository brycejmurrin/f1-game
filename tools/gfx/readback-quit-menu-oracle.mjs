// Quit-to-menu readback oracle — GLX + SwiftShader, CPU 10×, live-shaped flow.
// @doc Garage close → UI Start Race (Bahrain) → grid + ~20s throttle → pause → 2-tap quit.
// Usage:
//   node tools/gfx/readback-quit-menu-oracle.mjs
// Env: APEX_PROFILE_WAIT_MS (default 600000), APEX_CPU_RATE (default 10), APEX_DRIVE_MS (default 20000)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = process.env.APEX_ORACLE_ROOT
  ? resolve(process.env.APEX_ORACLE_ROOT)
  : fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `readback-quit-menu-oracle — GLX SwiftShader live-shaped quit TTI

  node tools/gfx/readback-quit-menu-oracle.mjs

Writes artifacts/logs/readback-quit-menu-oracle.json (override APEX_ORACLE_OUT).`);
const WAIT_MS = Math.max(120000, +process.env.APEX_PROFILE_WAIT_MS || 900000);
const CPU_RATE = Math.max(1, +process.env.APEX_CPU_RATE || 10);
const DRIVE_MS = Math.max(5000, +process.env.APEX_DRIVE_MS || 20000);
const OUT = process.env.APEX_ORACLE_OUT || join(ROOT, "artifacts/logs/readback-quit-menu-oracle.json");

const READPIXELS_HOOK = () => {
  if (window.__readbackOracle) return;
  const log = [];
  const t0 = performance.now();
  let phase = "boot";
  const mark = (site) => {
    const row = { t: Math.round(performance.now() - t0), phase, site };
    log.push(row);
    return row;
  };
  const wrapGl = (ctx, label) => {
    if (!ctx || ctx.__rbHooked) return;
    const raw = ctx.readPixels.bind(ctx);
    ctx.readPixels = function (...args) {
      const row = mark(label);
      const s = performance.now();
      raw(...args);
      const ms = performance.now() - s;
      if (ms > 50) row.ms = Math.round(ms);
    };
    ctx.__rbHooked = true;
  };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const ctx = origGetContext.call(this, type, opts);
    if (ctx && (type === "webgl" || type === "webgl2" || type === "experimental-webgl")) wrapGl(ctx, type);
    return ctx;
  };
  window.__readbackOracle = {
    log,
    phase: (p) => { phase = p; },
    summary: () => {
      const byPhase = {};
      let worst = 0;
      for (const e of log) {
        byPhase[e.phase] = (byPhase[e.phase] || 0) + 1;
        if (e.ms && e.ms > worst) worst = e.ms;
      }
      return { n: log.length, byPhase, worstMs: worst };
    },
  };
};

async function waitApex(page) {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: WAIT_MS });
}

async function assertSoftwareRaster(page, label) {
  const ok = await page.evaluate((where) => {
    const st = typeof GLX !== "undefined" && GLX.backendState ? GLX.backendState() : null;
    const gov = typeof PerfGov !== "undefined" && PerfGov.softwareRaster && PerfGov.softwareRaster();
    let renderer = "";
    try {
      const c = document.getElementById("game");
      const gl = c && c.getContext && (c.getContext("webgl2") || c.getContext("webgl"));
      const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      if (ext && gl) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
    } catch (_) { /* no canvas */ }
    const swift = /swiftshader/i.test(renderer);
    const soft = !!(st && st.softPresent) || swift || !!gov;
    return { soft, gov: !!gov, st, renderer, where };
  }, label);
  if (!ok.soft) {
    const err = new Error(`software raster not active at ${label}: ${JSON.stringify(ok)}`);
    err.code = "SOFTWARE_RASTER";
    throw err;
  }
}

async function setPhase(page, phase) {
  await page.evaluate((p) => { window.__readbackOracle.phase(p); }, phase);
}

async function runGarageClose(page) {
  await setPhase(page, "menu");
  await page.click("#mb-garage", { timeout: WAIT_MS });
  await setPhase(page, "garage-open");
  await page.waitForSelector("#carsetup:not([hidden])", { timeout: WAIT_MS });
  await sleep(8000);
  await setPhase(page, "garage-close");
  await page.evaluate(() => { window.__garageCloseClicks = 0; });
  await page.evaluate(() => {
    const done = document.getElementById("cs-done");
    if (!done) throw new Error("no cs-done");
    done.addEventListener("click", () => { window.__garageCloseClicks = (window.__garageCloseClicks || 0) + 1; }, true);
  });
  const tClose = Date.now();
  await page.locator("#cs-done").click({ timeout: 120000, force: true });
  await page.waitForSelector("#carsetup[hidden]", { timeout: WAIT_MS }).catch(() => {});
  const closeClicks = await page.evaluate(() => window.__garageCloseClicks || 1);
  await page.waitForSelector("#carsetup[hidden]", { timeout: WAIT_MS });
  await page.waitForSelector("#loading[hidden]", { timeout: WAIT_MS });
  await page.waitForFunction(
    () => {
      const o = document.getElementById("overlay");
      const sel = document.getElementById("select");
      return o && !o.hidden && sel && !sel.hidden;
    },
    null,
    { timeout: WAIT_MS, polling: 200 },
  );
  const closeMs = Date.now() - tClose;
  return { closeClicks, closeMs };
}

async function startBahrainRaceUi(page, fromMenuGarage) {
  await setPhase(page, "race-ui");
  // Menu GARAGE → CLOSE lands on #select (buildSelect), not the title — skip #mb-race.
  if (!fromMenuGarage) {
    await page.click("#mb-race", { timeout: WAIT_MS });
    await page.waitForSelector("#select:not([hidden])", { timeout: WAIT_MS });
  }
  const bahrainIdx = await page.evaluate(() => Tracks.LIST.findIndex((t) => t.id === "bahrain"));
  if (bahrainIdx < 0) throw new Error("no bahrain in Tracks.LIST");
  await page.locator(`.track-row[data-track-idx="${bahrainIdx}"]`).scrollIntoViewIfNeeded();
  await page.locator(`.track-row[data-track-idx="${bahrainIdx}"]`).click({ timeout: WAIT_MS });
  await page.click("#sel-go", { timeout: WAIT_MS });
  await page.waitForSelector("#race-settings:not([hidden])", { timeout: WAIT_MS });
  await page.click("#rs-go", { timeout: WAIT_MS });
  await setPhase(page, "race-entry");
  await page.evaluate(() => { if (window.__apex && window.__apex.headless) window.__apex.headless(false); });
  await page.waitForSelector("#loading[hidden]", { timeout: WAIT_MS }).catch(() => {});
  const trackWait = Math.max(WAIT_MS, 480000);
  await page.waitForFunction(
    () => window.__apex && window.__apex.info && window.__apex.info().track === "bahrain",
    null,
    { timeout: trackWait, polling: 100 },
  );
  await page.evaluate(() => { if (window.__apex && window.__apex.go) window.__apex.go(); });
  await page.waitForFunction(
    () => window.__apex.info().state === "race",
    null,
    { timeout: trackWait, polling: 100 },
  );
  await page.waitForSelector("#pausebtn", { timeout: trackWait, state: "visible" });
}

async function driveRace(page, ms) {
  await setPhase(page, "drive");
  await page.evaluate(async (dur) => {
    const A = window.__apex;
    if (!A) return;
    A.setInput({ steer: 0, throttle: true, brake: false });
    const t0 = performance.now();
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    while (performance.now() - t0 < dur) {
      const t = (performance.now() - t0) / 1000;
      A.setInput({ steer: Math.sin(t * 0.7) * 0.4, throttle: true, brake: false });
      await raf();
    }
    A.setInput({ steer: 0, throttle: false, brake: false });
  }, ms);
}

async function quitToMenu(page) {
  await setPhase(page, "pause");
  await page.click("#pausebtn", { timeout: 60000 });
  await page.waitForSelector("#pausemenu:not([hidden])", { timeout: 60000 });
  const t0 = Date.now();
  await page.locator("#pm-quit").click({ timeout: 30000 });
  await sleep(400);   // > PauseOpts.ARM_MIN_MS: a younger real press is a swallowed double tap
  await page.locator("#pm-quit").click({ timeout: 30000 });
  await setPhase(page, "quit");
  await page.waitForFunction(
    () => {
      const ov = document.getElementById("overlay");
      const a = window.__apex;
      const pm = document.getElementById("pausemenu");
      return ov && !ov.hidden && a && a.info && a.info().state === "menu"
        && (!pm || pm.hidden);
    },
    null,
    { timeout: WAIT_MS, polling: 100 },
  );
  return Date.now() - t0;
}

const srv = await startStaticServer(ROOT);
let browser;
const report = { cpuRate: CPU_RATE, driveMs: DRIVE_MS, at: new Date().toISOString() };
try {
  browser = await launchChromium({
    args: ["--use-angle=swiftshader", "--disable-background-timer-throttling"],
  });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.addInitScript(READPIXELS_HOOK);
  await page.goto(`${srv.url}?gfx=glx&stallwatch=1`);
  await waitApex(page);
  await page.waitForFunction(
    () => {
      const st = typeof GLX !== "undefined" && GLX.backendState && GLX.backendState();
      return !!(st && st.softPresent);
    },
    null,
    { timeout: 180000, polling: 500 },
  );
  await assertSoftwareRaster(page, "post-boot");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

  await page.evaluate(() => { window.__readbackOracle.log.length = 0; });
  const garageClose = await runGarageClose(page);
  await assertSoftwareRaster(page, "post-garage");
  await startBahrainRaceUi(page, true);
  await assertSoftwareRaster(page, "post-race-start");
  await driveRace(page, DRIVE_MS);
  const ttiMs = await quitToMenu(page);
  await sleep(2000);
  await setPhase(page, "post-quit");
  await assertSoftwareRaster(page, "post-quit");

  const slice = await page.evaluate((quitTtiMs) => {
    const stall = typeof LoopHealth !== "undefined" ? LoopHealth.state().stall : null;
    const st = typeof GLX !== "undefined" && GLX.backendState ? GLX.backendState() : null;
    const soft = st && st.softBlitGen != null ? st.softBlitGen : null;
    let renderer = "";
    try {
      const c = document.getElementById("game");
      const gl = c && c.getContext && (c.getContext("webgl2") || c.getContext("webgl"));
      const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      if (ext && gl) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
    } catch (_) { /* harness */ }
    const softwareRaster = !!(st && st.softPresent) && /swiftshader/i.test(renderer);
    const reloads = (() => { try { return parseInt(sessionStorage.getItem("apex26.stallReloads"), 10) || 0; } catch (_) { return 0; } })();
    const teardown = typeof MenuTeardown !== "undefined" && MenuTeardown.report ? MenuTeardown.report() : null;
    return {
      summary: window.__readbackOracle.summary(),
      stall,
      softBlitGen: soft,
      softwareRaster,
      renderer,
      softPresent: !!(st && st.softPresent),
      stallReloads: reloads,
      ttiMs: quitTtiMs,
      teardown,
    };
  }, ttiMs);
  if (slice.softwareRaster !== true) {
    throw new Error(`softwareRaster:not true (softPresent=${slice.softPresent} renderer=${slice.renderer})`);
  }
  report.garageClose = garageClose;
  report.quit = { ...slice, ttiMs };
  report.softwareRaster = true;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log("= oracle", JSON.stringify({ softwareRaster: true, garageClose, quit: { ttiMs, stall: slice.stall, stallReloads: slice.stallReloads } }));
} finally {
  await shutdown();
}
