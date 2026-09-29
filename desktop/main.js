"use strict";
/**
 * Electron main process for Apex 26 desktop.
 *
 * Serves the staged site (tools/desktop/stage.mjs → dist-site/) over a
 * privileged `app://apex/` origin so relative asset URLs and localStorage stay
 * stable. No build step for the game itself — packaging copies static files.
 *
 * Flags:
 *   --smoke   load index, wait for shell ready, print JSON, exit (CI / xvfb)
 */
const { app, BrowserWindow, protocol, net, globalShortcut } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "app";
const HOST = "apex";
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

// Autoplay + WebGPU where Chromium can; WebGL2 remains the game's fallback.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-features", "Vulkan,WebGPU");
// Soft-GL for headless CI / xvfb (Playwright _electron). Real GPU wins otherwise.
// Flag set mirrors Chromium software paths used by the web suite; WebGPU under
// SwiftShader is a community-reported combo (Electron #38189, 2023) — we try it
// and assert only that the app boots/renders, never GPU performance.
const softGl = process.env.APEX_DESKTOP_SOFT_GL === "1"
  || process.env.APEX_DESKTOP_SOFT_GL === "true"
  || (process.env.CI === "true" && process.platform === "linux");
if (softGl) {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  app.commandLine.appendSwitch("use-vulkan", "swiftshader");
  app.commandLine.appendSwitch("use-webgpu-adapter", "swiftshader");
  app.commandLine.appendSwitch("no-sandbox");
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".ico": "image/x-icon",
    ".map": "application/json",
  };
  return map[ext] || "application/octet-stream";
}

function resolveSitePath(pathname) {
  const root = siteRoot();
  let rel = decodeURIComponent(pathname || "/");
  if (rel === "/" || rel === "") rel = "/index.html";
  // Strip leading slash; refuse traversal.
  const cleaned = rel.replace(/^\/+/, "");
  const target = path.resolve(root, cleaned);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(rootPrefix)) return null;
  return target;
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (req) => {
    try {
      const url = new URL(req.url);
      if (url.hostname !== HOST) {
        return new Response("Bad host", { status: 400, headers: { "content-type": "text/plain" } });
      }
      const target = resolveSitePath(url.pathname);
      if (!target) {
        return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      // Prefer net.fetch(file:) so range/stream requests work for media/wasm.
      const res = await net.fetch(pathToFileURL(target).toString());
      const headers = new Headers(res.headers);
      if (!headers.has("content-type")) headers.set("content-type", mimeFor(target));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (err) {
      return new Response(String(err && err.message ? err.message : err), {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    }
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
  registerAppProtocol();
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
