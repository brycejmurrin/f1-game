// Garage open/close readback oracle — GLX + SwiftShader, CPU 10×.
// @doc Measures readPixels during menu→garage→close; optional race-entry path.
// Usage:
//   node tools/gfx/readback-garage-oracle.mjs [--path garage|race|both]
// Env: APEX_PROFILE_WAIT_MS (default 90000), APEX_ORACLE_PATH, APEX_CPU_RATE (default 10)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `readback-garage-oracle — GLX SwiftShader readPixels during garage or race entry

  node tools/gfx/readback-garage-oracle.mjs [--path garage|race|both]

Writes artifacts/logs/readback-garage-oracle.json (override with APEX_ORACLE_OUT).`);
const pathArg = (argv.find((a) => a.startsWith("--path=")) || "").split("=")[1]
  || process.env.APEX_ORACLE_PATH || "garage";
const WAIT_MS = Math.max(30000, +process.env.APEX_PROFILE_WAIT_MS || 90000);
const CPU_RATE = Math.max(1, +process.env.APEX_CPU_RATE || 10);
const OUT = process.env.APEX_ORACLE_OUT || join(ROOT, "artifacts/logs/readback-garage-oracle.json");

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

async function runGarage(page) {
  await setPhase(page, "menu");
  await page.click("#mb-garage", { timeout: WAIT_MS });
  await setPhase(page, "garage-open");
  await page.waitForSelector("#carsetup:not([hidden])", { timeout: WAIT_MS });
  await page.waitForTimeout(8000);
  await setPhase(page, "garage-close");
  let closeClicks = 0;
  await page.evaluate(() => {
    const done = document.getElementById("cs-done");
    if (!done) throw new Error("no cs-done");
    done.addEventListener("click", () => { window.__garageCloseClicks = (window.__garageCloseClicks || 0) + 1; }, true);
  });
  const tClose = Date.now();
  await page.locator("#cs-done").click({ timeout: 60000, force: true });
  await page.waitForSelector("#carsetup[hidden]", { timeout: WAIT_MS }).catch(() => {});
  closeClicks = await page.evaluate(() => window.__garageCloseClicks || 1);
  const closeMs = Date.now() - tClose;
  await page.waitForTimeout(3000);
  await setPhase(page, "post-close");
  return { closeClicks, closeMs };
}

async function runRaceEntry(page) {
  await setPhase(page, "menu");
  await page.click("#mb-race", { timeout: WAIT_MS });
  await setPhase(page, "race-setup");
  await page.waitForSelector("#race-settings:not([hidden])", { timeout: WAIT_MS });
  await page.click("#rs-go", { timeout: WAIT_MS });
  await setPhase(page, "race-entry");
  await page.waitForSelector("#loading:not([hidden])", { timeout: 15000 }).catch(() => {});
  await page.waitForSelector("#loading[hidden]", { timeout: WAIT_MS }).catch(() => {});
  await setPhase(page, "post-entry");
}

const srv = await startStaticServer(ROOT);
let browser;
const report = { cpuRate: CPU_RATE, paths: {}, at: new Date().toISOString() };
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

  const paths = pathArg === "both" ? ["garage", "race"] : [pathArg];
  for (const p of paths) {
    let garageClose = null;
    if (p === "garage") {
      await page.evaluate(() => { window.__readbackOracle.log.length = 0; });
      garageClose = await runGarage(page);
    } else if (p === "race") {
      await page.evaluate(() => { window.__readbackOracle.log.length = 0; });
      await runRaceEntry(page);
    }
    const slice = await page.evaluate(() => {
      const stall = typeof LoopHealth !== "undefined" ? LoopHealth.state().stall : null;
      const soft = typeof GLX !== "undefined" && GLX.softBlitGen ? GLX.softBlitGen() : null;
      const sw = typeof PerfGov !== "undefined" && PerfGov.softwareRaster ? PerfGov.softwareRaster() : null;
      return { summary: window.__readbackOracle.summary(), stall, softBlitGen: soft, softwareRaster: sw };
    });
    if (garageClose) slice.garageClose = garageClose;
    report.paths[p] = slice;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log("= oracle", JSON.stringify(report.paths));
} finally {
  await shutdown();
}
