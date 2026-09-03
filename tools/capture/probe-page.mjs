// Shared Playwright probe helpers for menu/garage capture tools.
// @doc Probe helpers: reduced-motion init, backend pick, garage open/settle, #game canvas shot.
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
      if (be === "webgpu") {
        try { sessionStorage.setItem("apex26.wgxCapture", "1"); } catch (_) {}
      }
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

/** Title → garage: mb-garage when present, else race → select → YOUR CAR. */
export async function openGarage(page, { team = "mercedes", waitMs = 60000 } = {}) {
  await page.evaluate((teamId) => {
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
    if ($("mb-garage")) $("mb-garage").click();
    else $("mb-race").click();
  }, team);
  const direct = await page.waitForFunction(() => {
    const el = document.getElementById("carsetup");
    return el && !el.hidden;
  }, null, { polling: 100, timeout: 8000 }).then(() => true).catch(() => false);
  if (!direct) {
    await page.waitForFunction(() => {
      const el = document.getElementById("select");
      return el && !el.hidden;
    }, null, { polling: 100, timeout: waitMs });
    await page.evaluate(() => document.getElementById("sel-car").click());
    await page.waitForFunction(() => {
      const el = document.getElementById("carsetup");
      return el && !el.hidden;
    }, null, { polling: 100, timeout: waitMs });
  }
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

/** JSON diagnostics: backend binding, garageCam, gap-region pixel stats. */
export async function garageDiagnostics(page) {
  return page.evaluate(() => {
    const a = window.__apex;
    const el = document.getElementById("game");
    const env = a.diag ? (a.diag({ download: false }).env || {}) : {};
    let gapSample = null;
    if (el && el.width > 0 && el.height > 0) {
      const c2 = document.createElement("canvas");
      c2.width = el.width;
      c2.height = el.height;
      const ctx = c2.getContext("2d");
      ctx.drawImage(el, 0, 0);
      const panel = document.getElementById("cs-inner");
      const pr = panel?.getBoundingClientRect();
      const panelFrac = (el.clientWidth > 0 && pr) ? Math.min(pr.width / el.clientWidth, 0.85) : 0;
      const x0 = Math.floor(el.width * 0.04);
      const x1 = Math.floor(el.width * Math.max(0.58 - panelFrac * 0.5, 0.35));
      const y0 = Math.floor(el.height * 0.18);
      const y1 = Math.floor(el.height * 0.82);
      const pixels = [];
      const stepX = Math.max(6, Math.floor((x1 - x0) / 10));
      const stepY = Math.max(6, Math.floor((y1 - y0) / 8));
      const d = ctx.getImageData(0, 0, el.width, el.height).data;
      for (let y = y0; y < y1; y += stepY) {
        const ny = (y - y0) / Math.max(y1 - y0, 1);
        for (let x = x0; x < x1; x += stepX) {
          const i = (y * el.width + x) * 4;
          pixels.push({ rgb: [d[i], d[i + 1], d[i + 2]], ny });
        }
      }
      gapSample = { panelFrac, n: pixels.length, pixels };
    }
    const overlay = document.getElementById("__err_overlay");
    return {
      backend: env.backend || (typeof GLX !== "undefined" ? GLX.backend : null),
      gpuErrors: typeof GLX !== "undefined" && GLX.gpuErrors ? GLX.gpuErrors() : 0,
      cam: a.garageCam ? a.garageCam() : null,
      aspect: typeof GLX !== "undefined" ? GLX.aspect : null,
      gapSample,
      carsetupVisible: !!(document.getElementById("carsetup") && !document.getElementById("carsetup").hidden),
      overlay: overlay && overlay.style.display !== "none" ? overlay.textContent.slice(0, 200) : null,
    };
  });
}

/** Fade the setup panel and clip #game for a clean shot. */
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
