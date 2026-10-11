#!/usr/bin/env node
// @doc Tap RACE! headless; record preparation, garage, flyby and first presented race frame. `--settle ms --invalidate`.
/*
 * loading-probe.mjs — DID THE PLAYER GET THE FLYBY?
 *
 * Observe preparation → garage leave → flyby/card → handoff → first presentation.
 * Reduced motion stays OFF and this player-flow probe opts out of the game's
 * webdriver shortcut, so it measures the cinematic rather than the test card.
 * A count/race state alone is insufficient: the plate must close after a ready
 * presentation. A lost graphics context never counts as a successful handoff.
 *
 *   node tools/shot/loading-probe.mjs                 # RACE! at once
 *   node tools/shot/loading-probe.mjs --settle 20000  # let the menu build first
 *   node tools/shot/loading-probe.mjs --invalidate    # change WEATHER, then RACE!: the build-under-card path
 *
 * Needs a server on :3456 (npx serve -l 3456 .). Timings are SwiftShader's:
 * read the PHASE ORDER, not the milliseconds (AGENTS.md §Seeing the game).
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { chromiumPath } from "../lib/chromium-path.mjs";
import { installProbeInit, gotoGame, chromiumArgsForBackend } from "./probe-page.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

// Serialized directly by Playwright; keep this predicate self-contained.
export function loadingProbeReady() {
  const a = window.__apex, plate = document.getElementById("loading");
  if (!a || !plate || !plate.hidden || !["count", "race"].includes(a.info().state)) return false;
  const marks = a.raceEntryProfile()?.marks || [];
  return marks.some(m => m.n === "present:ready") && marks.some(m => m.n === "handoff:lower")
    && !marks.some(m => m.n === "handoff:lower-lost");
}

async function main() {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `loading-probe — tap RACE! headless; record loading-screen phases

    node tools/shot/loading-probe.mjs [--settle MS] [--invalidate] [--backend webgl2] [--url URL]

  Needs a server on :3456. Read PHASE ORDER, not SwiftShader milliseconds.`);
  const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
  const SETTLE = +opt("settle", 0), BACKEND = opt("backend", "webgl2"), URL = opt("url", "http://localhost:3456/");
  const INVALIDATE = argv.includes("--invalidate");

  const browser = await chromium.launch({ executablePath: process.env.APEX_CHROMIUM || chromiumPath(), args: chromiumArgsForBackend(BACKEND) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    await installProbeInit(page, { backend: BACKEND, motion: true });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      try { localStorage.setItem("apex26.devApi", "1"); } catch (_) {}
    });
    await gotoGame(page, URL);
    const identity = await page.evaluate(() => ({ url: location.href, title: document.title,
      info: __apex.info(), help: __apex.agentHelp() }));
    // DOM clicks: with motion on, a menu's view transition can sit over the button.
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.locator("#select").waitFor({ state: "visible", timeout: 60000 });
    await page.evaluate(() => document.getElementById("sel-go").click());
    await page.locator("#race-settings").waitFor({ state: "visible", timeout: 60000 });
    if (SETTLE) await page.waitForTimeout(SETTLE);
    await page.evaluate((inv) => {
      const L = document.getElementById("loading"), t0 = performance.now();
      window.__ld = { phases: [], gaps: [], running: true };
      window.__ldObserver = new MutationObserver(() => window.__ld.phases.push([Math.round(performance.now() - t0), L.dataset.phase || "", L.hidden]));
      window.__ldObserver.observe(L, { attributes: true, attributeFilter: ["data-phase", "hidden"] });
      let last = t0;
      const tick = () => { const now = performance.now(); window.__ld.gaps.push(Math.round(now - last)); last = now; if (window.__ld.running) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      if (inv) document.getElementById("rs-weather-next").click();
      document.getElementById("rs-go").click();
    }, INVALIDATE);
    await page.waitForFunction(loadingProbeReady, null, { polling: 100, timeout: 300000 })
      .catch(() => errors.push("first presented race frame and closed loading plate not observed within 300 s"));
    const evidence = await page.evaluate(() => {
      window.__ld.running = false; window.__ldObserver.disconnect();
      return { loading: window.__ld, profile: __apex.raceEntryProfile(), state: __apex.info().state,
        loadingHidden: document.getElementById("loading").hidden };
    });
    const ld = evidence.loading;
    const order = ld.phases.map((p) => p[1] || "(closed)").filter((p, i, a) => p !== a[i - 1]);
    console.log(JSON.stringify({
      settleMs: SETTLE, invalidate: INVALIDATE, backend: BACKEND, identity, order, phases: ld.phases,
      firstPresentation: evidence.profile?.marks.find(m => m.n === "present:ready") || null,
      profile: evidence.profile, state: evidence.state, loadingHidden: evidence.loadingHidden,
      flyby: order.includes("run"), frames: ld.gaps.length, worstGapMs: Math.max(0, ...ld.gaps), errors,
    }, null, 1));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
