// Shared Playwright probe helpers for menu/garage capture tools.
// @doc Probe helpers: reduced-motion init (no view-transition overlay), backend pick, garage open/settle, #game canvas shot.
import { WEBGPU_CHROMIUM_ARGS } from "../harness.mjs";

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
      if (teamIdx != null) localStorage.setItem("apex26.team", JSON.stringify(+teamIdx));
      sessionStorage.clear();
    } catch (_) {}

    // menus.js vt() reads this at module load — patch matchMedia first.
    try {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const m = orig(query);
        if (String(query).includes("prefers-reduced-motion")) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() { return false; },
          };
        }
        return m;
      };
    } catch (_) {}

    // Belt-and-suspenders: swallow the rejection the overlay would pin.
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

/** Title → select → garage via in-page clicks (shared-page idiom). */
export async function openGarage(page, { team = 2, waitMs = 60000 } = {}) {
  await page.evaluate((teamIdx) => {
    const S = GameStore.store;
    S.set("team", teamIdx);
    S.set("driver", 0);
    document.getElementById("mb-race").click();
  }, team);
  await page.waitForFunction(() => {
    const el = document.getElementById("select");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: waitMs });
  await page.evaluate(() => document.getElementById("sel-go").click());
  await page.waitForFunction(() => {
    const el = document.getElementById("carsetup");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: waitMs });
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

/** JSON diagnostics: backend binding, garageCam, centre pixel via 2D readback. */
export async function garageDiagnostics(page) {
  return page.evaluate(() => {
    const a = window.__apex;
    const el = document.getElementById("game");
    const env = a.diag ? (a.diag({ download: false }).env || {}) : {};
    let centerPx = null;
    if (el && el.width > 0 && el.height > 0) {
      const c2 = document.createElement("canvas");
      c2.width = el.width;
      c2.height = el.height;
      const ctx = c2.getContext("2d");
      ctx.drawImage(el, 0, 0);
      const cx = (el.width / 2) | 0;
      const cy = (el.height / 2) | 0;
      const p = ctx.getImageData(cx, cy, 1, 1).data;
      centerPx = [p[0], p[1], p[2], p[3]];
    }
    const overlay = document.getElementById("__err_overlay");
    return {
      backend: env.backend || (typeof GLX !== "undefined" ? GLX.backend : null),
      gpuErrors: typeof GLX !== "undefined" && GLX.gpuErrors ? GLX.gpuErrors() : 0,
      cam: a.garageCam ? a.garageCam() : null,
      aspect: typeof GLX !== "undefined" ? GLX.aspect : null,
      centerPx,
      carsetupVisible: !!(document.getElementById("carsetup") && !document.getElementById("carsetup").hidden),
      overlay: overlay && overlay.style.display !== "none" ? overlay.textContent.slice(0, 200) : null,
    };
  });
}

/** Fade the setup panel (do not hide — that stops the preview) and clip #game. */
export async function screenshotGameCanvas(page, outPath) {
  await page.evaluate(() => {
    const c = document.getElementById("carsetup");
    if (c) c.style.opacity = "0";
  });
  const box = await page.locator("#game").boundingBox();
  if (!box) throw new Error("probe: #game has no bounding box");
  const buf = await page.screenshot({ path: outPath, clip: box, timeout: 60000 });
  return { bytes: buf.length, clip: box };
}
