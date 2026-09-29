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
 * Soft-GL / no-sandbox are OPT-IN via env (never implied by CI= alone, and
 * never required for a packaged release the user downloads).
 */
const { app, BrowserWindow, globalShortcut, shell } = require("electron");
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

function envFlag(name) {
  const v = process.env[name];
  return v === "1" || v === "true";
}

/** Directory that holds the staged site (index.html, js/, …). */
function siteRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "site");
  }
  return path.join(__dirname, "dist-site");
}

registerScheme();

// Soft-GL for headless / xvfb Playwright — opt-in only (APEX_DESKTOP_SOFT_GL).
// Do NOT key off CI=true: that would disable the Chromium sandbox whenever a
// packaged Linux build happened to see CI in the environment.
const softGl = envFlag("APEX_DESKTOP_SOFT_GL");
if (softGl) {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}
// no-sandbox: explicit test env only (never release / packaged-by-default).
if (envFlag("APEX_DESKTOP_NO_SANDBOX")) {
  app.commandLine.appendSwitch("no-sandbox");
}

/** Deny-by-default session permissions; open http(s) externally only. */
function hardenWebContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        shell.openExternal(url).catch(() => {});
      }
    } catch (_) { /* ignore bad URLs */ }
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    const ok = typeof url === "string"
      && (url === ORIGIN || url === `${ORIGIN}/` || url.startsWith(`${ORIGIN}/`));
    if (!ok) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
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
      autoplayPolicy: "no-user-gesture-required",
      webSecurity: true,
    },
  });

  win.setMenuBarVisibility(false);
  hardenWebContents(win.webContents);

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

app.on("web-contents-created", (_event, contents) => {
  hardenWebContents(contents);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
