// @ts-check
/**
 * Packaged Electron smoke — Playwright `_electron` against electron-builder --dir.
 *
 * Preconditions: `npm run pack` has produced dist/<platform>-unpacked/.
 * Linux CI must wrap with xvfb-run and set APEX_DESKTOP_SOFT_GL=1.
 *
 * Asserts shell behaviour only: boots, renders a canvas, advances rAF frames,
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

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Launch env: soft GL on Linux CI; never inherit ELECTRON_RUN_AS_NODE. */
function launchEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  env.APEX_DESKTOP_SOFT_GL = env.APEX_DESKTOP_SOFT_GL || "1";
  return env;
}

/**
 * @returns {Promise<import('playwright').ElectronApplication>}
 */
async function launchPackaged() {
  const { path: executablePath } = findUnpackedBinary({ desktopRoot: DESKTOP });
  return electron.launch({
    executablePath,
    env: launchEnv(),
    timeout: 90_000,
  });
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

  try {
    const packaged = await electronApp.evaluate(async ({ app }) => app.isPackaged);
    expect(packaged).toBe(true);

    const version = await electronApp.evaluate(async ({ app }) => app.getVersion());
    // sync-version stamps 0.<version.json build>.0 into package.json at pack time.
    const build = JSON.parse(fs.readFileSync(path.join(DESKTOP, "..", "version.json"), "utf8")).build;
    expect(version).toBe(`0.${build}.0`);

    const window = await electronApp.firstWindow();
    window.on("pageerror", (err) => pageErrors.push(String(err)));
    window.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await window.waitForLoadState("domcontentloaded");
    const title = await window.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).toMatch(/Apex/i);

    const href = await window.evaluate(() => location.href);
    expect(href).toMatch(/^app:\/\/apex\//);

    const native = await window.evaluate(() => window.__APEX_NATIVE__);
    expect(native && native.desktop).toBe(true);

    // Canvas present (may be visibility:hidden on the title screen — still in DOM).
    await expect(window.locator("#game")).toHaveCount(1);

    // Game loop advances N animation frames (title rAF is enough; no race boot).
    const frames = await window.evaluate(async () => {
      let n = 0;
      await new Promise((resolve) => {
        const tick = () => {
          n += 1;
          if (n >= 30) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return n;
    });
    expect(frames).toBeGreaterThanOrEqual(30);

    // Report the software renderer we actually got (evidence, not a pass gate on string).
    const glInfo = await window.evaluate(() => {
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
    test.info().annotations.push({
      type: "gl-renderer",
      description: JSON.stringify(glInfo),
    });
    // Soft assertion: we got *a* WebGL context. SwiftShader string varies by OS.
    expect(glInfo.ok, JSON.stringify(glInfo)).toBe(true);

    // Filter known Chromium noise under xvfb/soft-GL (dbus, GPU process exits).
    const serious = pageErrors.filter((e) => !/ResizeObserver|net::ERR_/i.test(e));
    expect(serious, serious.join("\n")).toEqual([]);
  } finally {
    await electronApp.close();
  }
});

test("packaged app: fullscreen toggle via main-process evaluate, then quit", async () => {
  const electronApp = await launchPackaged();
  try {
    await electronApp.firstWindow();
    const before = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return w ? w.isFullScreen() : null;
    });
    expect(before).toBe(false);

    const after = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return null;
      w.setFullScreen(true);
      return w.isFullScreen();
    });
    expect(after).toBe(true);

    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) w.setFullScreen(false);
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
    const href = await window.evaluate(() => location.href);
    expect(href).toMatch(/^app:\/\/apex\//);
    await expect(window.locator("#game")).toHaveCount(1);
    const native = await window.evaluate(() => window.__APEX_NATIVE__ && window.__APEX_NATIVE__.desktop);
    expect(native).toBe(true);
  } finally {
    await electronApp.close();
  }
});
