#!/usr/bin/env node
// @doc Tap RACE! headless; record the loading screen's phases (build/run/card) and frame gaps. `--settle ms --invalidate`.
/*
 * loading-probe.mjs — DID THE PLAYER GET THE FLYBY?
 *
 * The loading screen (js/ui/loading-screen.js) has four phases: "build" (the
 * world is being built under the card — RACE! beat the menu's idle build),
 * "run" (the flyby), "card" (the no-world / reduced-motion fallback) and
 * "hold" (the flyby editor's preview). This taps RACE! the way a player does
 * and records every phase change with its time, plus the page's own frame
 * gaps, until the race owns the screen.
 *
 * Reduced motion is OFF here (installProbeInit's `motion: true`): every other
 * probe forces it on, and under it there is no flyby at all — a probe that
 * forgets this reports the bare card and looks like a bug.
 *
 *   node tools/shot/loading-probe.mjs                 # RACE! at once
 *   node tools/shot/loading-probe.mjs --settle 20000  # let the menu build first
 *   node tools/shot/loading-probe.mjs --invalidate    # change WEATHER, then RACE!: the build-under-card path
 *
 * Needs a server on :3456 (npx serve -l 3456 .). Timings are SwiftShader's:
 * read the PHASE ORDER, not the milliseconds (AGENTS.md §Seeing the game).
 */
import { chromium } from "playwright";
import { installProbeInit, gotoGame, chromiumArgsForBackend } from "./probe-page.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const SETTLE = +opt("settle", 0), BACKEND = opt("backend", "webgl2"), URL = opt("url", "http://localhost:3456/");
const INVALIDATE = argv.includes("--invalidate");

const browser = await chromium.launch({ executablePath: process.env.APEX_CHROMIUM || "/opt/pw-browsers/chromium", args: chromiumArgsForBackend(BACKEND) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await installProbeInit(page, { backend: BACKEND, motion: true });
  await gotoGame(page, URL);
  // DOM clicks: with motion on, a menu's view transition can sit over the button.
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.locator("#select").waitFor({ state: "visible", timeout: 60000 });
  await page.evaluate(() => document.getElementById("sel-go").click());
  await page.locator("#race-settings").waitFor({ state: "visible", timeout: 60000 });
  if (SETTLE) await page.waitForTimeout(SETTLE);
  await page.evaluate((inv) => {
    const L = document.getElementById("loading"), t0 = performance.now();
    window.__ld = { phases: [], gaps: [] };
    new MutationObserver(() => window.__ld.phases.push([Math.round(performance.now() - t0), L.dataset.phase || "", L.hidden]))
      .observe(L, { attributes: true, attributeFilter: ["data-phase", "hidden"] });
    let last = t0;
    const tick = () => { const now = performance.now(); window.__ld.gaps.push(Math.round(now - last)); last = now; if (now - t0 < 120000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (inv) document.getElementById("rs-weather-next").click();
    document.getElementById("rs-go").click();
  }, INVALIDATE);
  await page.waitForFunction(() => window.__apex && __apex.info && __apex.info().state !== "menu", null, { polling: 100, timeout: 300000 })
    .catch(() => errors.push("race never started within 300 s"));
  const ld = await page.evaluate(() => window.__ld);
  const order = ld.phases.map((p) => p[1] || "(closed)").filter((p, i, a) => p !== a[i - 1]);
  console.log(JSON.stringify({
    settleMs: SETTLE, invalidate: INVALIDATE, order, phases: ld.phases,
    flyby: order.includes("run"), frames: ld.gaps.length, worstGapMs: Math.max(0, ...ld.gaps), errors,
  }, null, 1));
  process.exitCode = errors.length ? 1 : 0;
} finally {
  await browser.close();
}
