// Shared Playwright probe helpers for menu/garage capture tools.
// @doc Probe helpers: reduced-motion init, backend pick, garage open/settle, soft/#game CDP shot.
import { writeFileSync } from "node:fs";
import { WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";

/** Chromium flags per renderer backend (must match backend-compare / gfx-probe / carshot). */
export function chromiumArgsForBackend(backend) {
  // --enable-unsafe-swiftshader: Chromium 1xx blocks automatic SwiftShader
  // WebGL without it (carshot / gfx-probe already pin this; probe helpers did not).
  if (backend === "webgpu") return [...WEBGPU_CHROMIUM_ARGS];
  if (backend === "three") {
    return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
  }
  return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
}

/**
 * Runs before any page script. Pins backend/team and disables view transitions
 * (headless compositing rejects them → index.html error overlay blocks shots).
 */
export function installProbeInit(page, { backend = "webgl2", team = null, tlxForceGL = true } = {}) {
  return page.addInitScript(({ be, teamIdx, forceGl }) => {
    try {
      // Pin webgl2 explicitly. Clearing the key used to mean "GLX default", but
      // game.js now picks THREE on (pointer: coarse) when unset — Playwright's
      // blink pointer settings can trip that and hang boot on a deferred fetch.
      if (be === "webgl2") localStorage.setItem("apex26.gfxBackend", "webgl2");
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

/** Snapshot why boot stalled — bare waitForFunction timeouts never name WebGL. */
export async function gotoGameBootDiag(page) {
  return page.evaluate(() => {
    let gl2 = false;
    try {
      const c = document.createElement("canvas");
      gl2 = !!c.getContext("webgl2");
    } catch (_) { /* ignore */ }
    const err = document.getElementById("__err_overlay");
    return {
      apex: !!window.__apex,
      race: !!(window.__apex && window.__apex.race),
      gl2,
      Game: typeof window.Game,
      Teams: typeof window.Teams,
      overlay: err && err.style.display !== "none"
        ? (err.textContent || "").slice(0, 160) : null,
    };
  }).catch((e) => ({ evaluateError: String(e && e.message || e) }));
}

/** Boot wait — domcontentloaded; full load can hang on slow boxes. */
export async function gotoGame(page, url, waitMs = 120000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: waitMs });
  try {
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, {
      polling: 200,
      timeout: waitMs,
    });
  } catch (err) {
    const diag = await gotoGameBootDiag(page);
    const hints = [];
    if (diag && diag.gl2 === false) {
      hints.push("WebGL2 missing — a stale DISPLAY kills headless SwiftShader "
        + "(harness clears dead :N sockets; else unset DISPLAY or xvfb-run -a)");
    }
    if (diag && diag.overlay) hints.push("error overlay: " + diag.overlay);
    const detail = hints.length ? hints.join("; ") : "see diag";
    throw new Error(
      `gotoGame: __apex never appeared within ${waitMs}ms (${detail}). diag=${JSON.stringify(diag)}`,
      { cause: err },
    );
  }
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

/** Peel back to the title, pin team/driver, click in. Returns the route taken.
 * store.team is the NUMERIC INDEX (game.js `let teamIdx = store.get("team", 2)`).
 * Writing a team id string used to leave the boot default (McLaren) in place.
 * `G` is NOT a window global — `#mb-garage` does not re-read the store, so the
 * reliable pin is installProbeInit({ team: idx }) before first goto (or the
 * TEAM-tab garageTeam() path after the bay is open). */
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
    const ti = Teams.LIST.findIndex((x) => x.id === teamId);
    const idx = ti >= 0 ? ti : 2;
    S.set("team", idx);
    S.set("driver", 0);
    if ($("mb-garage")) { $("mb-garage").click(); return "garage"; }
    $("mb-race").click();
    return "race";
  }, team);
}

/** Step the preview loop; await soft-present when present.
 * One page.evaluate for N steps — per-frame round-trips used to dominate
 * multi-angle garage shoots (24× evaluate × 4 views ≈ a minute of IPC). */
export async function settleGarage(page, { frames = 90, sleepFn, awaitMs = 12000 } = {}) {
  const pause = sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const n = Math.max(0, frames | 0);
  if (n > 0) {
    await page.evaluate((count) => {
      for (let i = 0; i < count; i++) window.__apex.step(1 / 60);
    }, n);
  }
  // Yield so the compositor can finish the last blit before we await it.
  if (n >= 8) await pause(30);
  await awaitPresentedFrame(page, awaitMs);
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
 * Fast path: PNG/JPEG bytes from the presented canvas without CDP.
 * Prefer `#game-soft` / carview `#view` (2D blit). Fall back to `#game` —
 * Playwright's Desktop Chrome project spoofs a headed UA, so GLX never arms
 * soft-present; after `__apex.headless(true)` the WebGL backbuffer keeps the
 * last frame and toDataURL works even without preserveDrawingBuffer.
 * Returns `{ b64, id }` or null. Optional `clip` is CSS-viewport pixels.
 */
export async function readSoftCanvasBytes(page, {
  type = "png", quality = 92, preferView = false, clip = null,
} = {}) {
  return page.evaluate(({ fmt, q, preferView: pv, clip: cl }) => {
    const soft = document.getElementById("game-soft");
    const view = document.getElementById("view");
    const game = document.getElementById("game");
    const g = (pv && view && view.width > 0) ? view
      : (soft && soft.width > 0 && soft.height > 0) ? soft
      : (view && view.width > 0) ? view
      : (game && game.width > 0) ? game
      : null;
    if (!g || typeof g.toDataURL !== "function") return null;
    try {
      const mime = fmt === "jpeg" ? "image/jpeg" : "image/png";
      const q01 = Math.min(1, Math.max(0.05, q / 100));
      let target = g;
      if (cl && cl.width > 0 && cl.height > 0) {
        const r = g.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return null;
        // WebGL #game cannot be drawImage'd into a 2D crop — crop via CDP instead.
        if (g === game && g.getContext && g.getContext("webgl2")) return null;
        const sx = (cl.x - r.x) * (g.width / r.width);
        const sy = (cl.y - r.y) * (g.height / r.height);
        const sw = cl.width * (g.width / r.width);
        const sh = cl.height * (g.height / r.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(sw));
        c.height = Math.max(1, Math.round(sh));
        const ctx = c.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(g, sx, sy, sw, sh, 0, 0, c.width, c.height);
        target = c;
      }
      const url = fmt === "jpeg" ? target.toDataURL(mime, q01) : target.toDataURL(mime);
      const b64 = url.split(",")[1] || null;
      return b64 ? { b64, id: g.id || "canvas" } : null;
    } catch (_) { return null; }
  }, { fmt: type, q: quality, preferView, clip });
}

/**
 * Compositor bytes of the presented canvas. Awaits a fresh blit first unless
 * `skipAwait` — pass that when the caller already froze after awaitPresentedFrame
 * (a second wait after headless(true) hangs on GLX).
 *
 * Order: soft/#view/#game toDataURL (fast) → CDP Page.captureScreenshot.
 * Never Playwright's screenshot API — it waits on document.fonts.ready and that
 * hung GHA smoke shards 2/3 after freeze.
 *
 * `opts.timeout` (ms) is OPTIONAL. When set, it bounds the CDP leg (and soft
 * await when `awaitMs` omitted). Default CDP is unbounded — smoke under GHA
 * Desktop Chrome often needs >60s for CDP when soft is unarmed; a hard 60s
 * race turned a 339s green into a false red.
 * `opts.clip` overrides the presented-canvas box (CSS viewport pixels).
 * `opts.preferView` prefers carview `#view` for soft capture.
 * `opts.forceCdp` skips the soft path (tests / known-bad soft).
 */
export async function screenshotPresentedCanvas(page, opts = {}) {
  const awaitMs = opts.awaitMs != null ? opts.awaitMs
    : (opts.timeout != null ? Math.min(opts.timeout, 12000) : 8000);
  if (!opts.skipAwait) await awaitPresentedFrame(page, awaitMs);

  const type = opts.type === "jpeg" ? "jpeg" : "png";
  const quality = opts.quality != null ? opts.quality : 92;
  if (!opts.forceCdp) {
    const soft = await readSoftCanvasBytes(page, {
      type, quality, preferView: !!opts.preferView, clip: opts.clip || null,
    });
    if (soft) {
      const buf = Buffer.from(soft.b64, "base64");
      if (opts.path) writeFileSync(opts.path, buf);
      const via = soft.id === "view" ? "view"
        : soft.id === "game" ? "game"
        : "game-soft";
      return { buf, bytes: buf.length, clip: opts.clip || null, id: soft.id, via };
    }
  }

  const box = opts.clip
    ? { x: opts.clip.x, y: opts.clip.y, width: opts.clip.width, height: opts.clip.height, id: "clip" }
    : await presentedCanvasClip(page);
  if (!box) throw new Error("probe: presented canvas has no bounding box");
  const format = type;
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
    const capture = session.send("Page.captureScreenshot", params)
      .then(({ data }) => Buffer.from(data, "base64"));
    // Bound CDP only when the caller asked — smoke omits timeout on purpose.
    if (opts.timeout != null) {
      const budget = opts.timeout;
      buf = await Promise.race([
        capture,
        new Promise((_, rej) => setTimeout(() => rej(new Error(
          `probe: CDP captureScreenshot timed out after ${budget}ms`)), budget)),
      ]);
    } else {
      buf = await capture;
    }
  } finally {
    try { await session.detach(); } catch (_) { /* already closed */ }
  }
  if (opts.path) writeFileSync(opts.path, buf);
  return { buf, bytes: buf.length, clip: box, id: box.id, via: "cdp" };
}

/** Fade the setup panel and capture the presented canvas for a clean garage shot.
 * Prefer #game-soft toDataURL while the loop still runs (fast multi-angle path).
 * Fall back to freeze + CDP Page.captureScreenshot — never the Playwright
 * screenshot API (document.fonts.ready hung GHA smoke shards 2/3). */
export async function screenshotGameCanvas(page, outPath, opts = {}) {
  await page.evaluate(() => {
    const c = document.getElementById("carsetup");
    if (c) c.style.opacity = "0";
  });
  if (!opts.skipVisible) await waitGameVisible(page);
  if (!opts.skipAwait) await awaitPresentedFrame(page, opts.awaitMs ?? 8000);
  const soft = await readSoftCanvasBytes(page, { type: "png" });
  if (soft) {
    const buf = Buffer.from(soft.b64, "base64");
    writeFileSync(outPath, buf);
    return { bytes: buf.length, clip: null, via: "game-soft" };
  }
  // FREEZE across CDP capture — live GLX keeps the main thread hot enough that
  // Playwright's screenshot path starved on fonts. Restored in finally.
  await page.evaluate(() => { try { window.__apex.headless(true); } catch (_) {} });
  try {
    const shot = await screenshotPresentedCanvas(page, {
      path: outPath, skipAwait: true, forceCdp: true, timeout: 60000,
    });
    return { bytes: shot.bytes, clip: shot.clip, via: shot.via || shot.id || "cdp" };
  } finally {
    await page.evaluate(() => { try { window.__apex.headless(false); } catch (_) {} });
  }
}
