// @ts-check
/**
 * Packaged Electron smoke — Playwright `_electron` against electron-builder --dir.
 *
 * Preconditions: `npm run pack` has produced dist/<platform>-unpacked/.
 * Linux CI must wrap with xvfb-run and set APEX_DESKTOP_SOFT_GL=1.
 *
 * Asserts shell behaviour only: boots, renders a canvas, advances real game ticks,
 * no page errors. Does NOT claim GPU performance or real WebGPU (hosted runners
 * have no GPU — research B2/B4).
 *
 * Refs:
 *   https://playwright.dev/docs/api/class-electron
 *   https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci
 *   https://www.electron.build/docs/cli/
 */
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnpackedBinary } from "../scripts/unpacked-bin.mjs";
import { createRequire } from "node:module";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { resolveSiteDir } = createRequire(import.meta.url)("../lib/site.cjs");
const { switchArgs } = createRequire(import.meta.url)("../lib/debug-flags.cjs");

/** Launch env: soft GL (not on macOS) + explicit no-sandbox for CI/xvfb (turned into argv); never inherit ELECTRON_RUN_AS_NODE. */
function launchEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  env.APEX_DESKTOP_SOFT_GL = env.APEX_DESKTOP_SOFT_GL || "1";
  // macOS: the SwiftShader ANGLE switches leave the packaged app with NO WebGL2 and a
  // WebGPU adapter that cannot make a context ("Failed to create WebGPU Context
  // Provider"), so no renderer binds and the game loop never ticks (desktop.yml run
  // 43950525465, boot-diagnostics: webgl2 false, frame null). The macOS runner has a
  // real Metal GPU and needs no xvfb, so it runs on the GPU like a player's Mac,
  // whatever the workflow's env asks for.
  if (process.platform === "darwin") env.APEX_DESKTOP_SOFT_GL = "0";
  env.APEX_DESKTOP_NO_SANDBOX = env.APEX_DESKTOP_NO_SANDBOX || "1";
  return env;
}

/**
 * @returns {Promise<import('playwright').ElectronApplication>}
 */
async function launchPackaged() {
  const { path: executablePath } = findUnpackedBinary({ desktopRoot: DESKTOP });
  const env = launchEnv();
  return electron.launch({
    executablePath,
    // A packaged build ignores the APEX_DESKTOP_* env flags (lib/debug-flags.cjs),
    // so the harness passes the same Chromium switches as argv.
    args: switchArgs(env),
    env,
    timeout: 90_000,
  });
}

/**
 * Run `probe` against the SETTLED shell. The boot may reload the page once on its
 * own (renderer-boot.js reloadOnceIntoGlx: a refused or hung renderer claim reloads
 * behind a one-shot session latch), and a reload between two probes destroys the
 * execution context the next `evaluate` needs (macOS Pack smoke, run 43067909592:
 * "Execution context was destroyed" at the href / __APEX_NATIVE__ reads). So wait
 * for the bar `main.js --smoke` uses (complete + native flag + app:// href), run the
 * probes, and start over when a navigation cut them off. Two restarts at most: the
 * app's own reload is capped at one, and a page that keeps navigating is a failure.
 * Any other error (an `expect`, a timeout) is rethrown untouched.
 * @template T
 * @param {import('playwright').Page} window
 * @param {() => Promise<T>} probe
 * @returns {Promise<T>}
 */
async function onSettledShell(window, probe) {
  for (let restarts = 0; ; restarts++) {
    try {
      await window.waitForFunction(
        () => document.readyState === "complete"
          && window.__APEX_NATIVE__ && window.__APEX_NATIVE__.desktop === true
          && /^app:\/\/apex\//.test(String(location.href)),
        null,
        { timeout: 60_000, polling: 100 },
      );
      return await probe();
    } catch (e) {
      const cut = /Execution context was destroyed/.test(String(e && e.message));
      if (!cut || restarts >= 2) throw e;
    }
  }
}

/**
 * What the shell looks like from inside when a probe failed. Evidence only: every
 * read is guarded, and a page that cannot answer returns the error instead of throwing.
 * @param {import('playwright').Page} window
 * @returns {Promise<object>}
 */
async function bootDiagnostics(window) {
  try {
    return await window.evaluate(() => {
      const safe = (fn) => { try { return fn(); } catch (e) { return "threw: " + String(e && e.message); } };
      const shown = (el) => !!el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
      return {
        href: String(location.href),
        hidden: document.hidden,
        visibility: document.visibilityState,
        focused: safe(() => document.hasFocus()),
        frame: safe(() => (typeof PerfSpans === "undefined" ? "no PerfSpans" : PerfSpans.stats().frame || null)),
        webgl2: safe(() => !!document.createElement("canvas").getContext("webgl2")),
        gpu: typeof navigator.gpu !== "undefined",
        claimFail: safe(() => sessionStorage.getItem("apex26.gfxClaimFail")),
        backendProbe: safe(() => localStorage.getItem("apex26.gfxBackendProbe")),
        info: safe(() => (typeof __apex !== "undefined" && __apex.info ? JSON.stringify(__apex.info()).slice(0, 1500) : "no __apex.info")),
        screens: safe(() => Array.from(document.querySelectorAll(".screen, dialog, [role=dialog], [role=alertdialog]"))
          .filter(shown).map((el) => el.id || el.className).slice(0, 12)),
      };
    });
  } catch (e) {
    return { error: String(e && e.message) };
  }
}

test.describe.configure({ mode: "serial" });

test("fuses: EnableNodeCliInspectArguments stays on for the build under test", () => {
  const { path: bin } = findUnpackedBinary({ desktopRoot: DESKTOP });
  // On macOS @electron/fuses wants the .app bundle; on others the binary works.
  let appPath = bin;
  if (process.platform === "darwin") {
    const appIdx = bin.indexOf(".app/");
    if (appIdx >= 0) appPath = bin.slice(0, appIdx + 4);
  }
  const binJs = path.join(DESKTOP, "node_modules/@electron/fuses/dist/bin.js");
  const r = spawnSync(process.execPath, [binJs, "read", "--app", appPath], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");
  const out = stripAnsi((r.stdout || "") + (r.stderr || ""));
  expect(r.status, out).toBe(0);
  expect(out).toMatch(/EnableNodeCliInspectArguments is Enabled/);
});

test("packaged app: window opens, isPackaged, title/version, canvas, frames, no errors", async () => {
  const electronApp = await launchPackaged();
  const pageErrors = [];
  const consoleErrors = [];
  /** Every main-frame URL this launch committed: the evidence for a boot-navigation race. */
  const navigations = [];
  /** The last console lines of any level: read only when the test fails. */
  const consoleTail = [];
  /** @type {import('playwright').Page | null} */
  let shell = null;
  let passed = false;

  try {
    const packaged = await electronApp.evaluate(async ({ app }) => app.isPackaged);
    expect(packaged).toBe(true);

    const version = await electronApp.evaluate(async ({ app }) => app.getVersion());
    // The app is stamped from the STAGED site's version.json (scripts/set-version.mjs
    // readBuild, run by prebuild after `npm run stage`), which since 2026-10-10 carries
    // the Pages build (2000 + rev-list count; tools/desktop/stage.mjs pagesBuild) — not
    // the repo-root file, frozen at 1695. Read the same file set-version does.
    const siteVer = path.join(resolveSiteDir(DESKTOP), "version.json");
    const verSrc = fs.existsSync(siteVer) ? siteVer : path.join(DESKTOP, "..", "version.json");
    const build = JSON.parse(fs.readFileSync(verSrc, "utf8")).build;
    expect(version).toBe(`1.0.${build}`);

    const window = await electronApp.firstWindow();
    window.on("pageerror", (err) => pageErrors.push(String(err)));
    shell = window;
    window.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
      consoleTail.push(`${msg.type()}: ${msg.text().slice(0, 300)}`);
      if (consoleTail.length > 40) consoleTail.shift();
    });

    window.on("framenavigated", (frame) => {
      if (frame === window.mainFrame()) navigations.push(frame.url());
    });

    await window.waitForLoadState("domcontentloaded");

    const glInfo = await onSettledShell(window, async () => {
      const title = await window.title();
      expect(title.length).toBeGreaterThan(0);
      expect(title).toMatch(/Apex/i);

      const href = await window.evaluate(() => location.href);
      expect(href).toMatch(/^app:\/\/apex\//);

      const native = await window.evaluate(() => window.__APEX_NATIVE__);
      expect(native && native.desktop).toBe(true);

      // Canvas present (may be visibility:hidden on the title screen — still in DOM).
      await expect(window.locator("#game")).toHaveCount(1);

      // Observe the game's own tick instrumentation; a separate rAF counter can
      // advance even when game boot failed or its tick loop stopped.
      await window.waitForFunction(() => typeof PerfSpans !== "undefined", null, { timeout: 60_000, polling: 100 });
      await window.evaluate(() => { PerfSpans.reset(); PerfSpans.on(true); });
      try {
        await window.waitForFunction(() => (PerfSpans.stats().frame?.n || 0) >= 30, null,
          { timeout: 60_000, polling: 100 });
      } finally {
        // After a navigation the fresh page may not have PerfSpans yet; that must
        // not replace the error onSettledShell reads.
        await window.evaluate(() => PerfSpans.on(false)).catch(() => {});
      }

      // Report the renderer we actually got: SwiftShader, or Metal on macOS (evidence, not a pass gate on string).
      return window.evaluate(() => {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return { ok: false, reason: "no-webgl" };
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
        const vendor = ext
          ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR);
        return { ok: true, renderer: String(renderer), vendor: String(vendor) };
      });
    });
    test.info().annotations.push({
      type: "gl-renderer",
      description: JSON.stringify(glInfo),
    });
    // Soft assertion: we got *a* WebGL context. SwiftShader string varies by OS.
    expect(glInfo.ok, JSON.stringify(glInfo)).toBe(true);

    // Filter known Chromium noise under xvfb/soft-GL (dbus, GPU process exits).
    const serious = pageErrors.filter((e) => !/ResizeObserver|net::ERR_/i.test(e));
    expect(serious, serious.join("\n")).toEqual([]);
    passed = true;
  } finally {
    test.info().annotations.push({ type: "navigations", description: JSON.stringify(navigations) });
    if (!passed) {
      // A red here has no screen to look at (macOS Pack smoke runs only on schedule or
      // dispatch), so say what the shell was doing: hidden window, no WebGL, no ticks.
      const state = shell ? await bootDiagnostics(shell) : { error: "no window" };
      test.info().annotations.push({
        type: "boot-diagnostics",
        description: JSON.stringify({ state, pageErrors, consoleTail }).slice(0, 12_000),
      });
    }
    await electronApp.close();
  }
});

test("packaged app: fullscreen toggle via main-process evaluate, then quit", async () => {
  const electronApp = await launchPackaged();
  try {
    await electronApp.firstWindow();
    const before = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return w ? { full: w.isFullScreen(), simple: w.isSimpleFullScreen() } : null;
    });
    expect(before).not.toBeNull();
    expect(before.full || before.simple).toBe(false);

    // macOS setFullScreen() can BLOCK the main process waiting for a Space
    // transition that never finishes on GitHub-hosted runners (test timeout
    // 180s with no evaluate return). Prefer simpleFullScreen there; elsewhere
    // try setFullScreen with a short poll, then fall back.
    const after = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return { ok: false, reason: "no-window" };
      const plat = process.platform;
      if (plat === "darwin") {
        w.setSimpleFullScreen(true);
        return {
          ok: w.isSimpleFullScreen(),
          full: w.isFullScreen(),
          simple: w.isSimpleFullScreen(),
          via: "simple",
        };
      }
      w.setFullScreen(true);
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (w.isFullScreen()) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      let via = "full";
      if (!w.isFullScreen()) {
        w.setSimpleFullScreen(true);
        via = "simple-fallback";
      }
      return {
        ok: !!(w.isFullScreen() || w.isSimpleFullScreen()),
        full: w.isFullScreen(),
        simple: w.isSimpleFullScreen(),
        via,
      };
    });
    expect(after.ok, JSON.stringify(after)).toBe(true);

    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return;
      if (w.isSimpleFullScreen()) w.setSimpleFullScreen(false);
      if (w.isFullScreen()) w.setFullScreen(false);
    });
  } finally {
    await electronApp.close();
  }
});

test("packaged app: offline start still loads the shell (assets bundled)", async () => {
  const electronApp = await launchPackaged();
  try {
    const window = await electronApp.firstWindow();
    const ctx = window.context();
    await ctx.setOffline(true);
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await onSettledShell(window, async () => {
      const href = await window.evaluate(() => location.href);
      expect(href).toMatch(/^app:\/\/apex\//);
      await expect(window.locator("#game")).toHaveCount(1);
      const native = await window.evaluate(() => window.__APEX_NATIVE__ && window.__APEX_NATIVE__.desktop);
      expect(native).toBe(true);
    });
  } finally {
    await electronApp.close();
  }
});
