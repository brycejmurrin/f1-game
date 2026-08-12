// Shared process harness for the headless __apex tools — an in-process static
// server plus a Chromium launcher whose teardown actually runs.
//
// WHY this exists. Every tool used to hand-roll the same two-child setup and
// every one of them leaked processes until the box was pinned:
//
//   1. `spawn("python3", ["-m","http.server"], {stdio:"ignore"})` cleaned up from
//      `process.on("exit", …)`. 'exit' does NOT fire for a signalled process, so
//      `kill <tool-pid>` orphaned the server every single time. Serving from this
//      process removes the child entirely — the listener dies with the tool, even
//      under SIGKILL, and there is nothing left to `pgrep`.
//   2. `browser.close()` written as the last statement of a try block is skipped
//      the moment anything above it throws (a screenshot timeout, a page error),
//      stranding chrome + chrome_crashpad. Teardown here is registry-driven, so
//      it runs from finally, from the signal handlers and from 'exit' alike.
//   3. Playwright's own SIGTERM/SIGHUP handlers close the browser but never exit
//      the process — a signalled tool just hangs half-dead. We turn them off and
//      own the signal path, force-killing the browser's process GROUP (playwright
//      spawns it detached) so renderers and crashpad go with it.
//
// Usage:
//   import { startStaticServer, launchChromium, shutdown } from "./harness.mjs";
//   const srv = await startStaticServer(ROOT);
//   let browser;
//   try { browser = await launchChromium({ args: [...] }); … }
//   finally { await shutdown(); }

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain",
};

const CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  "/opt/google/chrome/chrome",
];

/** Preinstalled sandbox Chromium; undefined → playwright's bundled build. */
export function pickChromium() {
  return process.env.CHROME || process.env.PW_CHROMIUM || CHROMIUM_PATHS.find(existsSync);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- teardown registry --------------------------------------------------
// Each entry: { close() → Promise (graceful), force() → void (sync, last resort
// from the 'exit' handler, where async work can no longer run) }.
const resources = new Set();
let handlersInstalled = false;
let pending = null;

function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      // Installing any listener suppresses node's default terminate-on-signal,
      // so we must exit ourselves — otherwise the tool lingers holding a browser.
      shutdown().finally(() => process.exit(sig === "SIGINT" ? 130 : 143));
    });
  }
  process.on("exit", () => { for (const r of resources) { try { r.force(); } catch {} } });
}

function track(entry) {
  resources.add(entry);
  installHandlers();
  return entry;
}

const timeout = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

/** Tear down every tracked server/browser. Idempotent, safe to call twice. */
export function shutdown() {
  if (!pending) {
    const entries = [...resources];
    resources.clear();
    pending = Promise.all(entries.map(async (r) => {
      // A wedged browser must not block the exit path — force-kill after 5 s.
      try { await Promise.race([r.close(), timeout(5000)]); } catch {}
      try { r.force(); } catch {}
    })).finally(() => { pending = null; });
  }
  return pending;
}

// ---- static server ------------------------------------------------------
/**
 * Serve `root` over HTTP from THIS process (async, unlike `python -m
 * http.server`, which serialises requests). Returns { port, url, close }.
 */
export async function startStaticServer(root, { port = 0 } = {}) {
  const base = resolve(root);
  const prefix = base + sep;
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const rel = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = normalize(join(base, rel));
      if (!file.startsWith(prefix) && file !== base) { res.writeHead(403).end("forbidden"); return; }
      const st = statSync(file);
      if (!st.isFile()) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-store",
      });
      const stream = createReadStream(file);
      stream.on("error", () => res.destroy());
      res.on("close", () => { if (!res.writableEnded) stream.destroy(); });
      stream.pipe(res);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  // Unref'd: a tool that forgets to close must still be able to exit on its own.
  server.unref();
  const stop = () => { try { server.closeAllConnections?.(); server.close(); } catch {} };
  const entry = track({
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
    force: stop,
  });
  const actual = server.address().port;
  return {
    port: actual,
    url: `http://127.0.0.1:${actual}/`,
    async close() { resources.delete(entry); await entry.close(); },
  };
}

// ---- browser ------------------------------------------------------------
function killGroup(browser) {
  const pid = browser.process?.()?.pid;
  if (!pid) return;
  // Playwright spawns the browser detached, so the negative pid reaps the whole
  // group — renderers, GPU process and chrome_crashpad included.
  try { process.kill(-pid, "SIGKILL"); }
  catch { try { process.kill(pid, "SIGKILL"); } catch {} }
}

/** chromium.launch() with the sandbox executable, tracked for teardown. */
export async function launchChromium(opts = {}) {
  const { chromium } = require("playwright");
  const exe = pickChromium();
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    // We own SIGINT/SIGTERM/SIGHUP (see file header): playwright's handlers close
    // the browser but never exit, which is how these tools ended up wedged.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    ...opts,
  });
  const entry = track({ close: () => browser.close(), force: () => killGroup(browser) });
  const close = browser.close.bind(browser);
  browser.close = async (...a) => { resources.delete(entry); try { await close(...a); } finally { killGroup(browser); } };
  return browser;
}

/** Register any other cleanup (e.g. a browser this module didn't launch). */
export function onShutdown(close, force = () => {}) {
  return track({ close, force });
}
