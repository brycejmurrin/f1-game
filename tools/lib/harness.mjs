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
// WGX prefers full Chromium; some headless-shell builds also expose WebGPU.
// Test the adapter with the Vulkan/SwiftShader pins. The old `--use-angle=swiftshader
// --enable-unsafe-webgpu` pair alone refuses MSAA>1; see tools/gfx/wgx-validate.mjs.
//
// SwiftShader: Dawn validation oracle — native swapchain compositor blank; WGX
// soft-presents to visible #game via 2D blit. Lavapipe (+ xvfb-run for headed):
// three.js e2e recipe — real Vulkan ICD; same soft-present path as SwiftShader.
// Set VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json in env for Lavapipe.
//
// Dead local DISPLAY (:N with no /tmp/.X11-unix/XN) makes headless WebGL return
// null — launchChromium clears it via clearDeadDisplay() unless headed or
// APEX_KEEP_DISPLAY=1.
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

import { chromiumPath, normalizeBrowserFlavor, resolveChromium } from "./chromium-path.mjs";

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

/** CHROME / PW_CHROMIUM, else the Playwright build chromium-path.mjs derives
 *  from playwright-core's browsers.json revision (newest installed as the
 *  fallback), else a system Chrome; undefined → Playwright's bundled default. */
export function pickChromium(opts) {
  return chromiumPath(opts);
}

/**
 * Local `:N` / `:N.0` DISPLAY → `/tmp/.X11-unix/XN`. Remote hosts return null
 * (we cannot probe them from the socket dir and must leave DISPLAY alone).
 */
export function x11SocketPath(display) {
  if (display == null || display === "") return null;
  const m = String(display).match(/^:(\d+)/);
  if (!m) return null;
  return `/tmp/.X11-unix/X${m[1]}`;
}

/** True when DISPLAY points at a live local X11 unix socket. */
export function displaySocketAlive(display = process.env.DISPLAY) {
  const sock = x11SocketPath(display);
  return !!(sock && existsSync(sock));
}

/**
 * Stale DISPLAY kills headless SwiftShader WebGL: Chromium still talks to the
 * dead X, `getContext("webgl2")` returns null, and game.js never exposes
 * `__apex` (garage-angles then burns 120 s on waitForFunction). Measured
 * 2026-09-10 on Cursor Cloud with DISPLAY=:1 and no `/tmp/.X11-unix/X1`.
 * Clearing the env var restores software GL; `xvfb-run -a` also works because
 * it creates a real socket. Headed launches keep DISPLAY. Opt out with
 * APEX_KEEP_DISPLAY=1. `socketAlive` is injectable for unit tests.
 */
export function clearDeadDisplay({
  headed = false,
  env = process.env,
  socketAlive = displaySocketAlive,
  log = console.warn,
} = {}) {
  if (headed) return false;
  if (env.APEX_KEEP_DISPLAY === "1") return false;
  const d = env.DISPLAY;
  if (!d) return false;
  // Remote DISPLAY (host:0) — leave it; we only clear proven-dead local sockets.
  if (x11SocketPath(d) == null) return false;
  if (socketAlive(d)) return false;
  log(`DISPLAY=${d} has no X11 socket — clearing it so headless SwiftShader WebGL can start `
    + `(set APEX_KEEP_DISPLAY=1 to keep, or wrap with xvfb-run -a)`);
  delete env.DISPLAY;
  return true;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- teardown registry --------------------------------------------------
// Each entry: { close() → Promise (graceful), force() → void (sync, last resort
// from the 'exit' handler, where async work can no longer run) }.
const resources = new Set();
let handlersInstalled = false;
let pending = null;
let shutdownEpoch = 0;

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

async function boundedClose(close, force, ms = 5000) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(close),
      new Promise((resolve) => { timer = setTimeout(resolve, ms); }),
    ]);
  } finally {
    clearTimeout(timer);
    force();
  }
}

/** Register an owned teardown resource (also supports bounded non-browser probes). */
export function registerTeardownResource(entry) {
  if (!entry || typeof entry.close !== "function" || typeof entry.force !== "function") throw new TypeError("teardown resource requires close and force functions");
  return track(entry);
}

/** Tear down every tracked server/browser, including resources acquired during shutdown. */
export function shutdown() {
  if (!pending) {
    shutdownEpoch++;
    pending = (async () => {
      do {
        const entries = [...resources];
        await Promise.all(entries.map(async (r) => {
          // A wedged browser must not block the exit path — force-kill after 5 s.
          try { await Promise.race([r.close(), timeout(5000)]); } catch {}
          try { r.force(); } catch {}
          resources.delete(r);
        }));
        // A launch may resolve while prior closes await their deadline. Drain
        // that new owner too instead of forgetting it behind the pending promise.
      } while (resources.size);
    })().finally(() => { pending = null; });
  }
  return pending;
}

// ---- static server ------------------------------------------------------
const stamp = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");

function snapshotFiles(base) {
  const files = new Map();
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || ["node_modules", "artifacts", "scratch"].includes(e.name)) continue;
      const file = join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else if (e.isFile()) files.set(relative(base, file).split(sep).join("/"), stamp(statSync(file)));
    }
  };
  visit(base);
  return files;
}

/**
 * Serve `root` over HTTP from THIS process. Defaults to live bytes/no-store.
 * Opt-in immutableAssets pins static file metadata, then verified in-memory
 * bytes on first read. Its namespaced snapshotUrl permits immutable caching;
 * absolute/root URLs still serve the same pinned bytes with no-store, so a
 * game's absolute asset fetch cannot mix a mutable file into a snapshot run.
 * Changed-before-first-read files fail 409. Start a new server/namespace after
 * edits. Dynamic routes remain caller-owned and are never snapshot-cached.
 * Returns { port, url, snapshotUrl, close }.
 */
export async function startStaticServer(root, {
  port = 0,
  host = "127.0.0.1",
  route = null,
  allowPath = null,
  immutableAssets = null,
} = {}) {
  const base = resolve(root);
  const prefix = base + sep;
  let snapshotPrefix = null, snapshot = null;
  const cache = new Map();
  if (immutableAssets) {
    const namespace = immutableAssets.namespace ?? randomUUID();
    if (typeof namespace !== "string" || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(namespace)) {
      throw new Error("immutableAssets.namespace must be a safe nonempty URL token");
    }
    snapshotPrefix = `/__apex_snapshot/${namespace}/`;
    snapshot = snapshotFiles(base);
  }
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      // A caller-owned route gets first refusal — it is how a tool adds a
      // non-static endpoint (a POST collector) without reimplementing the MIME
      // table and the path-escape check below. Returning true claims the
      // request; anything else falls through to the static path.
      if (route && route(req, res, url) === true) return;
      const pinned = snapshotPrefix && url.pathname.startsWith(snapshotPrefix);
      if (url.pathname.startsWith("/__apex_snapshot/") && !pinned) { res.writeHead(404).end("not found"); return; }
      let rel = pinned ? url.pathname.slice(snapshotPrefix.length) : url.pathname;
      if (!rel || rel === "/") rel = "/index.html";
      else rel = decodeURIComponent(rel);
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
      if (snapshot) {
        if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { "Cache-Control": "no-store" }).end("GET or HEAD required"); return; }
        let item = cache.get(local);
        if (!item) {
          const expected = snapshot.get(local);
          if (!expected) { res.writeHead(404).end("not in snapshot"); return; }
          let current;
          try { current = stamp(statSync(file)); } catch { current = null; }
          if (current !== expected) { res.writeHead(409, { "Cache-Control": "no-store" }).end("snapshot changed; start a new snapshot"); return; }
          const bytes = readFileSync(file);
          if (stamp(statSync(file)) !== expected) { res.writeHead(409, { "Cache-Control": "no-store" }).end("snapshot changed during read"); return; }
          item = { bytes, etag: `"${createHash("sha256").update(bytes).digest("hex")}"` };
          cache.set(local, item);
        }
        const headers = { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
          "Cache-Control": pinned ? "private, max-age=31536000, immutable" : "no-store", ETag: item.etag };
        if (req.headers["if-none-match"] === item.etag) { res.writeHead(304, headers).end(); return; }
        res.writeHead(200, { ...headers, "Content-Length": item.bytes.length });
        res.end(req.method === "HEAD" ? undefined : item.bytes);
        return;
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
    snapshotUrl: snapshotPrefix ? `http://127.0.0.1:${actual}${snapshotPrefix}` : null,
    async close() { resources.delete(entry); await entry.close(); },
  };
}

// ---- browser ------------------------------------------------------------
function killGroup(child, kill = process.kill.bind(process)) {
  const pid = child?.pid;
  if (!pid || child.exitCode != null || child.signalCode != null) return;
  // Playwright spawns the browser detached, so the negative pid reaps the whole
  // group — renderers, GPU process and chrome_crashpad included.
  try { kill(-pid, "SIGKILL"); }
  catch { try { child.kill("SIGKILL"); } catch {} }
}

const browserLaunches = new WeakMap();
export const chromiumLaunchInfo = (browser) => browserLaunches.get(browser) || null;
const browserOwners = new WeakMap();

/** Register ownership before connect, and retain it through graceful/forced close. */
function ownBrowserServer(owner, { entry = null, closeTimeoutMs = 5000,
  kill = process.kill.bind(process) } = {}) {
  const existing = browserOwners.get(owner);
  if (existing) return existing;
  const child = owner.process();
  let browserClose = null, closing = null, attached = null;
  const force = () => {
    killGroup(child, kill);
    // BrowserServer.kill also releases its websocket listener. The owned child
    // handle permits synchronous group cleanup in an exit handler.
    try { Promise.resolve(owner.kill?.()).catch(() => {}); } catch {}
  };
  const close = (...args) => closing ||= boundedClose(async () => {
    try { if (browserClose) await browserClose(...args); }
    finally { await owner.close(); }
  }, force, closeTimeoutMs).finally(() => resources.delete(entry));
  entry ||= {};
  entry.close = close; entry.force = force;
  track(entry);
  const control = { child, entry, close, get closing() { return closing; },
    attach(browser) {
      if (attached === browser) return browser;
      if (attached) throw new Error("BrowserServer already owns another Browser facade");
      attached = browser;
      browserClose = browser.close.bind(browser);
      browser.close = close;
      browser.on?.("disconnected", () => { close().catch(() => {}); });
      return browser;
    } };
  browserOwners.set(owner, control);
  return control;
}

/** Retain the supported BrowserServer owner until graceful close settles.
 * A caller may pass its already-registered pre-connect entry. */
export function trackBrowserOwner(browser, owner, entry) {
  return ownBrowserServer(owner, { entry }).attach(browser);
}

/** Own BrowserServer's supported process handle while returning the usual Browser.
 * https://playwright.dev/docs/api/class-browserserver#browser-server-process
 * https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server */
export async function launchChromium(opts = {}, {
  chromium = require("playwright").chromium, closeTimeoutMs = 5000, kill = process.kill.bind(process),
} = {}) {
  const startedEpoch = shutdownEpoch;
  const { browserFlavor = "auto", ...launchOptions } = opts;
  const flavor = normalizeBrowserFlavor(browserFlavor);
  const selected = launchOptions.executablePath ? { path: launchOptions.executablePath, source: "option:executablePath" }
    : resolveChromium({ browserFlavor: flavor });
  if (!selected && flavor !== "auto") throw new Error(`requested ${flavor} browser is not installed`);
  const exe = selected?.path;
  // Headless defaults true when omitted — same as Playwright. A dead DISPLAY
  // must be cleared before launch or WebGL never comes up (see clearDeadDisplay).
  const headed = opts.headless === false;
  const launchEnv = launchOptions.env ? { ...launchOptions.env } : process.env;
  clearDeadDisplay({ headed, env: launchEnv });
  if (launchOptions.env) launchOptions.env = launchEnv;
  const owner = await chromium.launchServer({
    ...(exe ? { executablePath: exe } : {}),
    // We own SIGINT/SIGTERM/SIGHUP (see file header): playwright's handlers close
    // the browser but never exit, which is how these tools ended up wedged.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    ...launchOptions,
    host: "127.0.0.1",
  });
  const control = ownBrowserServer(owner, { closeTimeoutMs, kill });
  let browser;
  if (startedEpoch !== shutdownEpoch) { await control.close().catch(() => {}); throw new Error("browser acquisition interrupted by shutdown"); }
  try { browser = await chromium.connect(owner.wsEndpoint(), { timeout: launchOptions.timeout || 30000 }); }
  catch (err) { await control.close().catch(() => {}); throw err; }
  if (control.closing) { await control.closing.catch(() => {}); throw new Error("browser acquisition interrupted by shutdown"); }
  trackBrowserOwner(browser, owner, control.entry);
  browserLaunches.set(browser, Object.freeze({ requestedFlavor: flavor, executablePath: exe || null,
    source: selected?.source || "playwright-default", flavor: exe ? (/headless[-_]shell/.test(exe) ? "shell" : "chromium") : "playwright-default", pid: control.child.pid }));
  return browser;
}
