"use strict";
/**
 * Electron main process for Apex 26 desktop.
 *
 * Serves the staged site (tools/desktop/stage.mjs → dist-site/) over a
 * privileged `app://apex/` origin so relative asset URLs and localStorage stay
 * stable. No build step for the game itself — packaging copies static files.
 *
 * Protocol: desktop/app-protocol.js (manual Range 206/416 — net.fetch(file:)
 * returns 200 without Content-Range; Electron #38749).
 *
 * Flags:
 *   --smoke   load index, wait for shell ready, print JSON, exit (CI / xvfb)
 *
 * Research (2026-09-29): Electron 44.4.5 / Chromium 152; autoplay needs no
 * CLI flag (webPreferences default); WebGPU without a GPU needs
 * enable-unsafe-webgpu for a software adapter; Steam deferred.
 */
const { app, BrowserWindow, globalShortcut } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  SCHEME,
  HOST,
  registerScheme,
  handleScheme,
} = require("./app-protocol");

const ORIGIN = `${SCHEME}://${HOST}`;
const SMOKE = process.argv.includes("--smoke");

/** Directory that holds the staged site (index.html, js/, …). */
function siteRoot() {
  // Packaged: extraResources → resources/site
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "site");
  }
  // Dev: desktop/dist-site produced by `npm run stage`
  return path.join(__dirname, "dist-site");
}

// Must run before app ready (once).
registerScheme();

// Soft-GL for headless CI / xvfb (Playwright _electron). Real GPU wins otherwise.
// Research B1.3: without a GPU, requestAdapter() is null unless enable-unsafe-webgpu
// is set (then a SwiftShader software adapter). Linux Vulkan feature flags were
// unverified on the research box — do not enable them by default.
const softGl = process.env.APEX_DESKTOP_SOFT_GL === "1"
  || process.env.APEX_DESKTOP_SOFT_GL === "true"
  || (process.env.CI === "true" && process.platform === "linux");
if (softGl) {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  // Containers often have tiny or odd /dev/shm; SwiftShader aborts without this.
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  app.commandLine.appendSwitch("no-sandbox");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#0c0c14",
    title: "Apex 26",
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Explicit: Electron already defaults to no-user-gesture-required
      // (research B1.4); naming it documents the audio/engine expectation.
      autoplayPolicy: "no-user-gesture-required",
      // Gamepad API works in Chromium; keep webSecurity on with our privileged scheme.
      webSecurity: true,
    },
  });

  win.setMenuBarVisibility(false);

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  win.loadURL(`${ORIGIN}/`);

  if (SMOKE) {
    const deadline = Date.now() + 60000;
    const tick = async () => {
      try {
        const result = await win.webContents.executeJavaScript(`
          (function () {
            var meta = document.querySelector('meta[name="apex-build"]');
            var native = window.__APEX_NATIVE__ || null;
            return {
              readyState: document.readyState,
              title: document.title || "",
              build: meta ? meta.content : null,
              href: location.href,
              native: native,
              hasServiceWorker: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
            };
          })();
        `, true);
        const ok = result && result.readyState === "complete" && result.native && result.native.desktop === true
          && typeof result.href === "string" && result.href.indexOf("app://apex/") === 0;
        if (ok || Date.now() > deadline) {
          process.stdout.write(JSON.stringify({ smoke: ok ? "ok" : "timeout", ...result }) + "\n");
          app.exit(ok ? 0 : 1);
          return;
        }
      } catch (_) { /* page still loading */ }
      setTimeout(tick, 250);
    };
    win.webContents.once("did-finish-load", () => setTimeout(tick, 200));
    win.webContents.once("did-fail-load", (_e, code, desc) => {
      process.stdout.write(JSON.stringify({ smoke: "fail", code, desc }) + "\n");
      app.exit(1);
    });
  }

  return win;
}

app.whenReady().then(() => {
  const root = siteRoot();
  if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(`desktop: staged site missing at ${root} — run: npm run stage`);
    app.exit(2);
    return;
  }
  handleScheme(root);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
