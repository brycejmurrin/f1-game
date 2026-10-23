// Quit-to-menu readback oracle — GLX + SwiftShader, CPU 10×.
// @doc Measures readPixels and stall watchdog after Bahrain race start → pause → QUIT.
// Usage:
//   node tools/gfx/readback-quit-menu-oracle.mjs
// Env: APEX_PROFILE_WAIT_MS (default 120000), APEX_CPU_RATE (default 10)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `readback-quit-menu-oracle — GLX SwiftShader quit-to-menu TTI + readPixels

  node tools/gfx/readback-quit-menu-oracle.mjs

Writes artifacts/logs/readback-quit-menu-oracle.json`);
const WAIT_MS = Math.max(60000, +process.env.APEX_PROFILE_WAIT_MS || 120000);
const CPU_RATE = Math.max(1, +process.env.APEX_CPU_RATE || 10);
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

async function setPhase(page, phase) {
  await page.evaluate((p) => { window.__readbackOracle.phase(p); }, phase);
}

async function startBahrainRace(page) {
  await setPhase(page, "menu");
  await page.evaluate(() => {
    window.__quitRace = Promise.resolve(window.__apex.race("bahrain", "day", "dry"));
  });
  await setPhase(page, "race-entry");
  await page.waitForFunction(
    () => window.__apex && window.__apex.info && window.__apex.info().track === "bahrain",
    null,
    { timeout: WAIT_MS, polling: 200 },
  );
  await page.waitForFunction(
    () => {
      const s = window.__apex.info().state;
      return s === "race" || s === "count";
    },
    null,
    { timeout: WAIT_MS, polling: 200 },
  );
  await sleep(1500);
}

async function quitToMenu(page) {
  await setPhase(page, "pause");
  await page.click("#pausebtn", { timeout: 30000 }).catch(() => {});
  await page.waitForSelector("#pausemenu:not([hidden])", { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const q = document.getElementById("pm-quit");
    if (!q) throw new Error("no pm-quit");
    q.click();
    if (q.classList.contains("armed")) q.click();
  });
  await setPhase(page, "quit");
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      const ov = document.getElementById("overlay");
      const a = window.__apex;
      return ov && !ov.hidden && a && a.info && a.info().state === "menu"
        && document.getElementById("pausemenu")?.hidden !== false;
    },
    null,
    { timeout: WAIT_MS, polling: 100 },
  );
  return Date.now() - t0;
}

const srv = await startStaticServer(ROOT);
let browser;
const report = { cpuRate: CPU_RATE, at: new Date().toISOString() };
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
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

  await page.evaluate(() => { window.__readbackOracle.log.length = 0; });
  await startBahrainRace(page);
  const ttiMs = await quitToMenu(page);
  await sleep(2000);
  await setPhase(page, "post-quit");

  const slice = await page.evaluate(() => {
    const stall = typeof LoopHealth !== "undefined" ? LoopHealth.state().stall : null;
    const soft = typeof GLX !== "undefined" && GLX.softBlitGen ? GLX.softBlitGen() : null;
    const sw = typeof PerfGov !== "undefined" && PerfGov.softwareRaster ? PerfGov.softwareRaster() : null;
    const reloads = (() => { try { return parseInt(sessionStorage.getItem("apex26.stallReloads"), 10) || 0; } catch (_) { return 0; } })();
    const teardown = typeof MenuTeardown !== "undefined" && MenuTeardown.report ? MenuTeardown.report() : null;
    return {
      summary: window.__readbackOracle.summary(),
      stall,
      softBlitGen: soft,
      softwareRaster: sw,
      stallReloads: reloads,
      ttiMs,
      teardown,
    };
  });
  report.quit = slice;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log("= oracle", JSON.stringify(report.quit));
} finally {
  await shutdown();
}
