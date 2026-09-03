// Shared process harness for the headless __apex tools — an in-process static
// @doc Shared harness for the headless `__apex` tools: in-process static server + Chromium launch with teardown-safe shutdown.
// @skill playwright-probe
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
//   import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "./harness.mjs";
//   const srv = await startStaticServer(ROOT);
//   let browser;
//   try { browser = await launchChromium({ args: [...WEBGPU_CHROMIUM_ARGS] }); … }
//   finally { await shutdown(); }
//
// WGX needs the FULL Chromium binary (not the headless shell — no navigator.gpu)
// plus Vulkan/SwiftShader pins. The old `--use-angle=swiftshader
// --enable-unsafe-webgpu` pair alone refuses MSAA>1; see spike/backends/tools/wgx-validate.mjs.
//
// SwiftShader: Dawn validation oracle — native swapchain compositor blank; WGX
// soft-presents to visible #game via 2D blit. Lavapipe (+ xvfb-run for headed):
// three.js e2e recipe — real Vulkan ICD; same soft-present path as SwiftShader.
// Set VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json in env for Lavapipe.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const _wgpuArgs = require("./webgpu-chrome-args.cjs");
export const WEBGPU_CHROMIUM_ARGS = _wgpuArgs.WEBGPU_CHROMIUM_ARGS;
export const WEBGPU_LAVAPE_CHROMIUM_ARGS = _wgpuArgs.WEBGPU_LAVAPE_CHROMIUM_ARGS;
export const WEBGPU_LAVAPE_ENV = _wgpuArgs.WEBGPU_LAVAPE_ENV;

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
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/** Preinstalled sandbox Chromium; undefined → playwright's bundled build. */
function fromPlaywrightBrowsersPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  let dirs;
  try { dirs = readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse(); }
  catch { return undefined; }
  for (const d of dirs) {
    for (const rel of [
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      const exe = join(root, d, rel);
      if (existsSync(exe)) return exe;
    }
  }
}

export function pickChromium() {
  return process.env.CHROME || process.env.PW_CHROMIUM
    || CHROMIUM_PATHS.find(existsSync)
    || fromPlaywrightBrowsersPath();
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
export async function startStaticServer(root, {
  port = 0,
  host = "127.0.0.1",
  route = null,
  allowPath = null,
} = {}) {
  const base = resolve(root);
  const prefix = base + sep;
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      // A caller-owned route gets first refusal — it is how a tool adds a
      // non-static endpoint (a POST collector) without reimplementing the MIME
      // table and the path-escape check below. Returning true claims the
      // request; anything else falls through to the static path.
      if (route && route(req, res, url) === true) return;
      const rel = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const file = normalize(join(base, rel));
      if (!file.startsWith(prefix) && file !== base) { res.writeHead(403).end("forbidden"); return; }
      const local = relative(base, file).split(sep).join("/");
      // A static test server never needs repository control files. This also
      // protects callers that deliberately bind to the LAN: URL containment
      // alone kept traversal out, but still served .git/config and dot-prefixed
      // tool state because those files genuinely live below `base`.
      if (local.split("/").some((part) => part.startsWith("."))) {
        res.writeHead(404).end("not found"); return;
      }
      if (allowPath && allowPath(local, req, url) !== true) {
        res.writeHead(404).end("not found"); return;
      }
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
    // host defaults to loopback: a test server must not appear on the LAN just
    // because it exists. A tool that WANTS to be reachable from a phone passes
    // "0.0.0.0" deliberately (tools/mcp/report-server.mjs).
    server.listen(port, host, ok);
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
