/**
 * IWER install helpers for Playwright XR specs.
 *
 * Loads the pinned UMD under tests/vendor/ via addInitScript (before any Apex
 * script probes navigator.xr), then force-installs the metaQuest3 profile.
 * Production pages must never reference this path.
 *
 * Sources:
 *   https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html
 *   playwright-webxr README (forceInstall + SwiftShader canvas gotchas)
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const IWER_VENDOR = path.join(HERE, "../vendor/iwer-2.5.0.min.js");
export const IWER_VERSION = "2.5.0";

/** Chromium launch args for software-GL XR (playwright-webxr guidance). */
export const XR_LAUNCH_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--enable-unsafe-webgpu",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
];

/**
 * Inject pinned IWER + forceInstall metaQuest3 before first navigation.
 * Call from test.beforeEach / before page.goto.
 */
export async function installIwer(page, opts = {}) {
  if (!fs.existsSync(IWER_VENDOR)) {
    throw new Error(`pinned IWER missing: ${IWER_VENDOR} (see tests/vendor/README.md)`);
  }
  await page.addInitScript({ path: IWER_VENDOR });
  const stereo = opts.stereo !== false;
  await page.addInitScript((stereoOn) => {
    try {
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.gfxBackend", "three");
    } catch (_) { /* */ }
    const root = globalThis.IWER || {};
    if (!root.XRDevice || !root.metaQuest3) {
      globalThis.__iwerInstall = { ok: false, reason: "IWER UMD missing XRDevice/metaQuest3", keys: Object.keys(root).slice(0, 20) };
      return;
    }
    const device = new root.XRDevice(root.metaQuest3);
    device.installRuntime({ forceInstall: true });
    device.stereoEnabled = !!stereoOn;
    globalThis.__iwerDevice = device;
    globalThis.__iwerInstall = { ok: true, stereo: !!stereoOn };
  }, stereo);
}

/**
 * Wait until XrSession exists AND XrBoot.bind() has run. Starting a session
 * before bind leaves no XRWebGLLayer — IWER then delivers zero frames.
 */
export async function waitXrReady(page, timeout = 60_000) {
  await page.waitForFunction(
    () => typeof XrSession !== "undefined"
      && typeof XrSession.probe === "function"
      && typeof XrBoot !== "undefined"
      && typeof XrBoot.isBound === "function"
      && XrBoot.isBound(),
    null,
    { timeout, polling: 100 },
  );
}

/** Capture the game canvas via toDataURL inside rAF (page.screenshot can hang under software GL). */
export async function captureCanvasDataUrl(page, selector = "#game") {
  return page.evaluate(async (sel) => {
    const c = document.querySelector(sel);
    if (!c || typeof c.toDataURL !== "function") return null;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { return c.toDataURL("image/png"); } catch (_) { return null; }
  }, selector);
}

/**
 * Sample the seated left-eye position on the next XR frame.
 * XRFrame is only valid inside the session rAF that produced it — calling
 * eyeFrames() from a plain page.evaluate always returns null. Pass that
 * callback's frame into eyeFrames/recenter.
 */
export async function sampleXrEye(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const s = typeof XrSession !== "undefined" && XrSession.getSession && XrSession.getSession();
    if (!s || typeof s.requestAnimationFrame !== "function") return resolve(null);
    s.requestAnimationFrame((_t, frame) => {
      try {
        const gfx = (typeof GLX !== "undefined") ? GLX : null;
        const layer = gfx && typeof gfx.xrLayer === "function" ? gfx.xrLayer() : null;
        const eyes = XrSession.eyeFrames(layer, frame);
        if (!eyes || !eyes[0] || !eyes[0].eye) return resolve(null);
        resolve({
          eye: Array.from(eyes[0].eye),
          vw: eyes[0].viewport ? eyes[0].viewport.width : null,
          vh: eyes[0].viewport ? eyes[0].viewport.height : null,
          n: eyes.length,
          views: eyes.map((e) => ({
            hasEye: !!(e && e.eye),
            vw: e && e.viewport ? e.viewport.width : null,
            vh: e && e.viewport ? e.viewport.height : null,
          })),
        });
      } catch (_) { resolve(null); }
    });
  }));
}
