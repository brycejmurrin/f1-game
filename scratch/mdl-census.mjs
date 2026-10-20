#!/usr/bin/env node
// TLX-WebGPU mobile-tier device.lost census (B·W10 2026-10-20). Census request leg `tlx-devlost`.
// Per arm: boot the game on three-WebGPU with the arm's localStorage, enter a race, then WATCH for
// WATCH_S seconds recording device.lost (hooked on requestDevice), uncapturederror, console, navigations.
import { startStaticServer, launchChromium, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../tools/lib/harness.mjs";
import { gotoGame } from "../tools/shot/probe-page.mjs";
import { raceGate } from "../tools/lib/census-entry.mjs";
import { writeFileSync } from "node:fs";

const WATCH_S = +(process.env.MDL_WATCH || 70);
const TRACK = process.env.MDL_TRACK || "monaco";
const OUT = process.env.MDL_OUT || "tlx-devlost.json";
const SOFT = process.env.MDL_SOFT === "1";
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false };
const HI = { "apex26.forceMobileTier": "1", "apex26.gfxHigh": "1" };
const ALL = {
  base: { v: DESK, ls: HI },
  U8off: { v: DESK, ls: { ...HI, "apex26.dbgU8off": "1" } },
  ShadowFull: { v: DESK, ls: { ...HI, "apex26.dbgShadowFull": "1" } },
  PostFull: { v: DESK, ls: { ...HI, "apex26.dbgPostFull": "1" } },
  InstPass: { v: DESK, ls: { ...HI, "apex26.dbgInstPass": "1" } },
  all: { v: DESK, ls: { ...HI, "apex26.dbgU8off": "1", "apex26.dbgShadowFull": "1", "apex26.dbgPostFull": "1", "apex26.dbgInstPass": "1" } },
  mobile: { v: DESK, ls: { "apex26.forceMobileTier": "1" } },
  mobilePhone: { v: PHONE, ls: { "apex26.forceMobileTier": "1" } },
  mobileHigh: { v: DESK, ls: { "apex26.forceMobileTier": "1", "apex26.gfxHigh": "1" } },
  control: { v: DESK, ls: {} },
  controlPhone: { v: PHONE, ls: {} },
};
const ARMS = (process.env.MDL_ARMS || "base,U8off,ShadowFull,PostFull,InstPass,all").split(",").filter((a) => ALL[a]);
const report = { started: new Date().toISOString(), watchS: WATCH_S, track: TRACK, rows: [] };
const save = () => writeFileSync(OUT, JSON.stringify(report, null, 2));
const log = (m) => console.log("[mdl] " + m);

function hook() {
  window.__mdl = { lost: [], uncaptured: [], devices: 0 };
  try {
    const orig = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (d) {
      const dev = await orig.call(this, d);
      const n = ++window.__mdl.devices, t0 = performance.now();
      dev.lost.then((i) => window.__mdl.lost.push({ n, atSincePageS: +(performance.now() / 1000).toFixed(1), reason: i.reason, message: String(i.message).slice(0, 400) }));
      dev.addEventListener("uncapturederror", (e) => { if (window.__mdl.uncaptured.length < 20) window.__mdl.uncaptured.push(String(e.error && e.error.message).slice(0, 400)); });
      return dev;
    };
  } catch (_) {}
}

async function runArm(browser, server, name) {
  const A = ALL[name], row = { arm: name, cons: [], ticks: [] };
  report.rows.push(row);
  const ctx = await browser.newContext({ viewport: A.v.viewport, deviceScaleFactor: A.v.deviceScaleFactor, hasTouch: A.v.hasTouch, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const t0 = Date.now(); const T = () => +((Date.now() - t0) / 1000).toFixed(1);
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && row.cons.length < 60) row.cons.push(T() + "s " + m.type() + ": " + m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { if (row.cons.length < 60) row.cons.push(T() + "s pageerror: " + String(e && e.message).slice(0, 300)); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) row.cons.push(T() + "s NAV " + f.url().slice(-40)); });
  await page.addInitScript((ls) => {
    window.__TEST_MODE = true;
    localStorage.setItem("apex26.gfxBackend", "three");
    localStorage.setItem("apex26.tlxForceGL", "0");
    localStorage.setItem("apex26.wgxCapture", "0");
    try { sessionStorage.setItem("apex26.wgxCapture", "0"); } catch (_) {}
    for (const k of Object.keys(ls)) localStorage.setItem(k, ls[k]);
  }, A.ls);
  await page.addInitScript(hook);
  await gotoGame(page, server.url, 180000);
  await page.evaluate(async (t) => { await window.__apex.race(t); window.__apex.go(); }, TRACK);
  await page.waitForFunction(raceGate, null, { polling: 500, timeout: 300000 });
  row.gateAtS = T();
  for (let s = 0; s < WATCH_S; s += 5) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const g = typeof GLX !== "undefined" ? GLX : null, t = g && g.__tlx; let bs = null;
      try { bs = t && t.backendState && t.backendState(); } catch (_) {}
      return JSON.stringify({ st: window.__apex.info().state, api: bs && bs.api, mt: bs && bs.mobileTier, im: bs && bs.isMobile, lite: bs && bs.liteGpu,
        lost: window.__mdl && window.__mdl.lost.length, dev: window.__mdl && window.__mdl.devices, ge: bs && bs.gpuErrors,
        sess: sessionStorage.getItem("apex26.ctxLostReloads"), auto: sessionStorage.getItem("apex26.tlxAutoGL") });
    }).catch((e) => "EVALFAIL " + String(e.message).slice(0, 80));
    row.ticks.push(T() + "s " + st);
  }
  row.mdl = await page.evaluate(() => window.__mdl).catch(() => null);
  save();
  log(`${name}: ticks ${row.ticks.length}, lost ${JSON.stringify(row.mdl && row.mdl.lost)} cons ${row.cons.length}`);
  await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 15000))]);
}

const server = await startStaticServer(process.cwd());
const browser = await launchChromium(SOFT ? { args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"], env: { ...process.env, ...(WEBGPU_LAVAPE_ENV || {}) } }
  : { args: ["--enable-unsafe-webgpu", "--disable-background-timer-throttling"] });
try {
  for (const a of ARMS) { try { await runArm(browser, server, a); } catch (e) { report.rows.push({ arm: a, error: String((e && e.stack) || e).slice(0, 500) }); log("FAILED " + a + " " + String(e).slice(0, 300)); save(); } }
} finally {
  save();
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]);
  server.close && server.close();
  process.exit(0);
}
