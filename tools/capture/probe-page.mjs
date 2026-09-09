// Shared Playwright probe helpers for menu/garage capture tools.
// @doc Probe helpers: reduced-motion init, backend pick, garage open/settle, #game canvas shot.
import { writeFileSync } from "node:fs";
import { WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";

/** Chromium flags per renderer backend (must match backend-compare / gfx-probe). */
export function chromiumArgsForBackend(backend) {
  if (backend === "webgpu") return [...WEBGPU_CHROMIUM_ARGS];
  if (backend === "three") return ["--use-angle=swiftshader", "--no-sandbox"];
  return ["--use-angle=swiftshader", "--no-sandbox"];
}

/**
 * Runs before any page script. Pins backend/team and disables view transitions
 * (headless compositing rejects them → index.html error overlay blocks shots).
 */
export function installProbeInit(page, { backend = "webgl2", team = null, tlxForceGL = true } = {}) {
  return page.addInitScript(({ be, teamIdx, forceGl }) => {
    try {
      if (be === "webgl2") localStorage.removeItem("apex26.gfxBackend");
      else localStorage.setItem("apex26.gfxBackend", be);
      if (be === "three" && forceGl) localStorage.setItem("apex26.tlxForceGL", "1");
      if (be === "webgpu") {
        localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
        try { sessionStorage.setItem("apex26.wgxCapture", "1"); } catch (_) {}
      }
      if (teamIdx != null) localStorage.setItem("apex26.team", JSON.stringify(+teamIdx));
    } catch (_) {}

    try {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const m = orig(query);
        if (String(query).includes("prefers-reduced-motion")) {
          return {
            matches: true, media: query, onchange: null,
            addEventListener() {}, removeEventListener() {},
            addListener() {}, removeListener() {},
            dispatchEvent() { return false; },
          };
        }
        return m;
      };
    } catch (_) {}

    window.addEventListener("unhandledrejection", (e) => {
      const r = e && e.reason;
      const msg = (r && (r.message || r)) || "";
      if (String(msg).includes("Transition was skipped")) e.preventDefault();
    }, true);
  }, { be: backend, teamIdx: team, forceGl: tlxForceGL });
}

/** Boot wait — domcontentloaded; full load can hang on slow boxes. */
export async function gotoGame(page, url, waitMs = 120000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: waitMs });
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, {
    polling: 200,
    timeout: waitMs,
  });
}

/** One .screen visible? Resolves false on timeout instead of throwing. */
async function screenShown(page, id, timeout) {
  return page.waitForFunction((i) => {
    const el = document.getElementById(i);
    return !!el && !el.hidden;
  }, id, { polling: 100, timeout }).then(() => true).catch(() => false);
}

/** What the page looks like right now — so a timeout names its own cause. */
export async function uiState(page) {
  return page.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const g = $("game");
    const err = $("__err_overlay");
    return {
      state: window.__apex?.info?.().state ?? null,
      screens: [...document.querySelectorAll(".screen")].filter((e) => !e.hidden).map((e) => e.id),
      setupPreviewOn: window.__apex?.garageCam?.()?.on ?? null,
      gameVisibility: g ? getComputedStyle(g).visibility : "absent",
      overlay: err && err.style.display !== "none" ? (err.textContent || "").slice(0, 200) : null,
    };
  });
}

/**
 * Title → garage: mb-garage when present, else race → select → YOUR CAR.
 *
 * The two routes end on DIFFERENT screens: #mb-garage opens #carsetup directly
 * (game.js openGarage("menu")), while only #mb-race passes through #select
 * (openGarage("select") behind #sel-car). Waiting for #select after a garage
 * click can therefore never succeed — it burned the full waitMs and then failed
 * claiming the garage never opened. So branch on the route actually taken, and
 * when a click is swallowed (a menu still peeling, a transition mid-flight)
 * RE-ENTER rather than wait longer: waiting cannot fix a click that never
 * landed, and each attempt is bounded.
 */
export async function openGarage(page, { team = "mercedes", waitMs = 60000, tries = 3 } = {}) {
  const step = Math.max(8000, Math.floor(waitMs / tries));
  let route = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    route = await enterGarage(page, team);
    if (route === "garage") {
      if (await screenShown(page, "carsetup", step)) return;
    } else if (await screenShown(page, "select", step)) {
      await page.evaluate(() => document.getElementById("sel-car").click());
      if (await screenShown(page, "carsetup", step)) return;
    }
  }
  throw new Error(
    `probe: #carsetup never opened via the ${route} route after ${tries} attempts — ` +
    JSON.stringify(await uiState(page)));
}

/** Peel back to the title, pin team/driver, click in. Returns the route taken. */
function enterGarage(page, team) {
  return page.evaluate((teamId) => {
    const $ = (id) => document.getElementById(id);
    const vis = (id) => { const el = $(id); return !!el && !el.hidden; };
    const peel = () => {
      const a = window.__apex;
      if (a?.info?.().state !== "menu") { $("pm-quit")?.click(); return true; }
      if (vis("carsetup")) { $("cs-back").click(); return true; }
      if (vis("select")) { $("sel-back").click(); return true; }
      const stray = [...document.querySelectorAll(".screen")].filter((el) => !el.hidden && el.id !== "overlay");
      if (stray.length) { for (const el of stray) el.hidden = true; return true; }
      if (!vis("overlay")) { $("overlay").hidden = false; return true; }
      return false;
    };
    for (let i = 0; i < 12 && peel(); i++) {}
    const S = GameStore.store;
    const t = Teams.LIST.find((x) => x.id === teamId) || Teams.LIST[2];
    S.set("team", t.id);
    S.set("driver", 0);
    if ($("mb-garage")) { $("mb-garage").click(); return "garage"; }
    $("mb-race").click();
    return "race";
  }, team);
}

/** Step the preview loop; await WGX soft-present when present. */
export async function settleGarage(page, { frames = 90, sleepFn } = {}) {
  const pause = sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => window.__apex.step(1 / 60));
    if (i % 15 === 14) await pause(50);
  }
  await page.evaluate(async () => {
    if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) {
      try { await GLX.awaitSoftPresent(12000); } catch (_) {}
    }
  });
}

/** JSON diagnostics: backend binding, garageCam, and the gap-sample geometry. */
export async function garageDiagnostics(page) {
  return page.evaluate(() => {
    const a = window.__apex;
    const el = document.getElementById("game");
    const env = a.diag ? (a.diag({ download: false }).env || {}) : {};
    // NO ctx.drawImage(#game) READBACK HERE. Under HeadlessChrome GLX now sets
    // preserveDrawingBuffer and soft-blits onto #game-soft, but drawImage from
    // the WebGL canvas outside the frame is still the wrong oracle (and older
    // builds clear the buffer). The old gapSample did exactly that, and
    // assertGarageInterior passes an all-black sample (its flat-wall rule needs
    // darkFrac BELOW the floor, and black scores 1.0), so the gate that exists
    // to reject bad frames was vacuous — it reported interior.ok on meanRgb
    // [0,0,0]. The gate now samples the CAPTURED PNG; this returns only the
    // geometry that sampling needs.
    const panel = document.getElementById("cs-inner");
    const pr = panel?.getBoundingClientRect();
    const panelFrac = (el && el.clientWidth > 0 && pr) ? Math.min(pr.width / el.clientWidth, 0.85) : 0;

    const overlay = document.getElementById("__err_overlay");
    return {
      backend: env.backend || (typeof GLX !== "undefined" ? GLX.backend : null),
      gpuErrors: typeof GLX !== "undefined" && GLX.gpuErrors ? GLX.gpuErrors() : 0,
      cam: a.garageCam ? a.garageCam() : null,
      aspect: typeof GLX !== "undefined" ? GLX.aspect : null,
      panelFrac,
      canvas: el ? { w: el.width, h: el.height } : null,
      carsetupVisible: !!(document.getElementById("carsetup") && !document.getElementById("carsetup").hidden),
      overlay: overlay && overlay.style.display !== "none" ? overlay.textContent.slice(0, 200) : null,
    };
  });
}

/**
 * Wait until #game is actually PAINTING.
 *
 * game.js render() (the `menuBlank` gate) sets the canvas to
 * visibility:hidden whenever the menu has nothing to draw — an undrawn canvas
 * keeps its LAST frame, so the garage car used to sit behind the title. It
 * clears only once setupPreviewOn (or a race / the race-settings flyby) is up
 * AND a render frame has run since. So #game can be attached, unhidden and a
 * full 1440x900 rect while still being invisible, and a hidden element paints
 * nothing into a screenshot.
 *
 * This is what made the webgl2 leg of garage-frame fail: locator.boundingBox()
 * re-runs Playwright's own visibility actionability check, so it blocked the
 * full 30 s and reported only "waiting for locator('#game')" — a message that
 * points at the selector rather than at the render gate. Wait for the real
 * condition, and say so when it never arrives.
 */
export async function waitGameVisible(page, timeout = 30000) {
  const shown = await page.waitForFunction(() => {
    const g = document.getElementById("game");
    if (!g) return false;
    const r = g.getBoundingClientRect();
    return getComputedStyle(g).visibility !== "hidden" && r.width > 0 && r.height > 0;
  }, null, { polling: 100, timeout }).then(() => true).catch(() => false);
  if (!shown) {
    throw new Error(
      "probe: #game never became visible — game.js render() shows the canvas only " +
      "while a race, the race-settings flyby or the garage preview is drawing; " +
      JSON.stringify(await uiState(page)));
  }
}

/**
 * Wait for a NEW software present WHILE THE LOOP STILL RUNS.
 * GLX/TLX present() drives the overlay; headless(true) skips render/present,
 * so a freeze-then-wait can never observe gen > start and times out.
 */
export async function awaitPresentedFrame(page, timeoutMs = 8000) {
  await page.evaluate(async (ms) => {
    if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) {
      try { await GLX.awaitSoftPresent(ms); } catch (_) {}
    }
  }, timeoutMs);
}

/**
 * Clip of the canvas the compositor actually shows.
 * HeadlessChrome GLX (and TLX-WebGPU) hide #game and blit onto #game-soft;
 * WGX blits onto #game. locator("#game").screenshot() is the uncomposited
 * GPU buffer — often black even with preserveDrawingBuffer.
 */
export async function presentedCanvasClip(page) {
  return page.evaluate(() => {
    const soft = document.getElementById("game-soft");
    const game = document.getElementById("game");
    const el = (soft && soft.width > 0) ? soft : game;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height, id: el.id };
  });
}

/**
 * Compositor PNG of the presented canvas. Awaits a fresh blit first unless
 * `skipAwait` — pass that when the caller already froze after awaitPresentedFrame
 * (a second wait after headless(true) hangs on GLX).
 *
 * Uses CDP Page.captureScreenshot, not Playwright page.screenshot(). The
 * Playwright path waits on document.fonts.ready ("waiting for fonts to load…")
 * and that wait never finished on GHA smoke shards 2/3 after freeze: 60 s
 * timeout, retry still hung. Fonts are irrelevant to a 3D canvas clip; CDP
 * is the same compositor grab without the font barrier. locator("#game")
 * was the green pre-helper path (element screenshot + preserveDrawingBuffer).
 */
export async function screenshotPresentedCanvas(page, opts = {}) {
  if (!opts.skipAwait) await awaitPresentedFrame(page, opts.awaitMs);
  const box = await presentedCanvasClip(page);
  if (!box) throw new Error("probe: presented canvas has no bounding box");
  const format = opts.type === "jpeg" ? "jpeg" : "png";
  const clip = {
    x: box.x, y: box.y,
    width: Math.max(1, box.width), height: Math.max(1, box.height),
    scale: 1,
  };
  const session = await page.context().newCDPSession(page);
  let buf;
  try {
    const params = { format, clip, captureBeyondViewport: false };
    if (format === "jpeg" && opts.quality != null) params.quality = opts.quality;
    const { data } = await session.send("Page.captureScreenshot", params);
    buf = Buffer.from(data, "base64");
  } finally {
    try { await session.detach(); } catch (_) { /* already closed */ }
  }
  if (opts.path) writeFileSync(opts.path, buf);
  return { buf, bytes: buf.length, clip: box, id: box.id };
}

/** Fade the setup panel and clip the presented canvas for a clean garage shot. */
export async function screenshotGameCanvas(page, outPath) {
  await page.evaluate(() => {
    const c = document.getElementById("carsetup");
    if (c) c.style.opacity = "0";
  });
  await waitGameVisible(page);
  // Wait for a NEW blit WHILE THE LOOP STILL RUNS. GLX (and TLX) present()
  // is what drives the overlay; headless(true) skips render/present, so a
  // freeze-then-wait can never observe gen > start and times out. WGX can
  // still complete an in-flight mapAsync after freeze; GLX cannot.
  await awaitPresentedFrame(page);
  // FREEZE THE LOOP ACROSS THE CAPTURE. CDP still needs a quiet compositor:
  // a GLX garage frame on SwiftShader keeps the renderer's main thread hot
  // enough that Playwright page.screenshot starved on document.fonts.ready
  // ("waiting for fonts to load"). screenshotPresentedCanvas now uses CDP,
  // and headless(true) still keeps the last blit on #game-soft. Restored in
  // `finally`, or every later step would probe a frozen page.
  await page.evaluate(() => { try { window.__apex.headless(true); } catch (_) {} });
  try {
    const shot = await screenshotPresentedCanvas(page, { path: outPath, skipAwait: true });
    return { bytes: shot.bytes, clip: shot.clip };
  } finally {
    await page.evaluate(() => { try { window.__apex.headless(false); } catch (_) {} });
  }
}
