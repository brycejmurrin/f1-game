#!/usr/bin/env node
// gfx-probe.mjs — test WEBGPU (WGX) and THREE (TLX) with real screenshots.
//
// Playwright path with the correct Chromium flags (tools/webgpu-chrome-args.cjs).
// MCP chrome-devtools uses the same flags via chrome-devtools-mcp.sh.
//
// Usage:
//   node tools/gfx-probe.mjs [--backend webgpu|three] [--lite] [--iphone]
//                            [--retries N] [--retry-delay MS]
//                            [trackId] [--cam orbit|eye|park] [--out DIR]
//
// Logs go to stderr (live) and <out>/probe.log (always). Final JSON on stdout.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startStaticServer, launchChromium, shutdown, sleep, WEBGPU_CHROMIUM_ARGS,
} from "./harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

function parseArgs(argv) {
  const o = {
    backend: "webgpu",
    track: "montreal",
    cam: "orbit",
    lite: false,
    iphone: false,
    outDir: null,
    retries: 2,
    retryDelayMs: 3000,
  };
  const skip = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--backend") { o.backend = next(); skip.add(o.backend); }
    else if (a === "--cam") { o.cam = next(); skip.add(o.cam); }
    else if (a === "--out") { o.outDir = next(); skip.add(o.outDir); }
    else if (a === "--retries") o.retries = Math.max(1, parseInt(next(), 10) || 1);
    else if (a === "--retry-delay") o.retryDelayMs = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === "--lite") o.lite = true;
    else if (a === "--iphone") o.iphone = true;
    else if (a === "--help" || a === "-h") {
      console.log(`gfx-probe — WEBGPU/THREE screenshot probe with logging + retry

  node tools/gfx-probe.mjs [--backend webgpu|three] [--lite] [--iphone]
                           [--retries N] [--retry-delay MS]
                           [track] [--cam orbit|eye|park] [--out DIR]

  stderr + <out>/probe.log: phased progress; stdout: final JSON result.`);
      process.exit(0);
    } else if (!a.startsWith("--") && !skip.has(a)) {
      o.track = a;
      skip.add(a);
    }
  }
  if (!o.outDir) {
    o.outDir = join("artifacts", "tmp", "gfx-probe",
      `${o.backend}${o.lite ? "-lite" : ""}${o.iphone ? "-iphone" : ""}-${o.track}`);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.backend !== "webgpu" && opts.backend !== "three") {
  console.error("gfx-probe: --backend must be webgpu or three");
  process.exit(1);
}

mkdirSync(opts.outDir, { recursive: true });
const logPath = join(opts.outDir, "probe.log");
writeFileSync(logPath, "", "utf8");

function log(phase, msg, extra) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = extra !== undefined
    ? `[gfx-probe ${ts}] ${phase}: ${msg} ${JSON.stringify(extra)}`
    : `[gfx-probe ${ts}] ${phase}: ${msg}`;
  process.stderr.write(line + "\n");
  appendFileSync(logPath, line + "\n", "utf8");
}

function isRetryable(err) {
  const m = String((err && err.message) || err || "");
  return /timeout|timed out|Target closed|Execution context|ECONNRESET|detached|crashed|interrupted/i.test(m);
}

async function retryStep(label, fn, { attempts = 3, delayMs = 1500 } = {}) {
  let last;
  for (let n = 1; n <= attempts; n++) {
    try {
      log(label, n === 1 ? "start" : `retry ${n}/${attempts}`);
      const v = await fn(n);
      log(label, "ok");
      return v;
    } catch (e) {
      last = e;
      log(label, `fail (${n}/${attempts})`, { error: String(e.message || e).slice(0, 240) });
      if (n < attempts && isRetryable(e)) {
        await sleep(delayMs * n);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function runProbeAttempt(attemptNum) {
  const srv = await startStaticServer(ROOT);
  log("attempt", `${attemptNum}/${opts.retries} — server ${srv.url}`);

  const launchArgs = opts.backend === "webgpu"
    ? [...WEBGPU_CHROMIUM_ARGS]
    : ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
  log("browser", "launch", { args: launchArgs.length });

  const browser = await launchChromium({ args: launchArgs });
  const consoleLines = [];
  try {
    const viewport = opts.iphone
      ? { width: 844, height: 390 }
      : { width: 1280, height: 720 };
    const page = await browser.newPage({
      viewport,
      userAgent: opts.iphone ? IPHONE_UA : undefined,
      isMobile: opts.iphone,
      hasTouch: opts.iphone,
      deviceScaleFactor: opts.iphone ? 3 : 1,
    });
    page.on("console", (m) => {
      const t = m.type();
      const text = m.text();
      if (t === "error" || t === "warning" || /WGX|TLX|gfx/i.test(text)) {
        consoleLines.push(`[${t}] ${text.slice(0, 400)}`);
      }
    });
    page.on("pageerror", (e) => {
      consoleLines.push(`[pageerror] ${String(e).slice(0, 400)}`);
    });

    await page.addInitScript(([be, wantLite]) => {
      localStorage.removeItem("apex26.gfxWgxFail");
      localStorage.removeItem("apex26.gfxWgxLevel");
      localStorage.removeItem("apex26.gfxBackendProbe");
      localStorage.removeItem("apex26.gfxTlxFail");
      sessionStorage.removeItem("apex26.gfxBound");
      sessionStorage.removeItem("apex26.gfxClaimFail");
      if (be === "webgpu") {
        localStorage.setItem("apex26.gfxBackend", "webgpu");
        localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
        sessionStorage.setItem("apex26.wgxCapture", "1");
        if (wantLite) localStorage.setItem("apex26.gfxWgxLite", "1");
        else localStorage.removeItem("apex26.gfxWgxLite");
      } else {
        localStorage.setItem("apex26.gfxBackend", "three");
        localStorage.setItem("apex26.tlxForceGL", "1");
      }
    }, [opts.backend, opts.lite]);

    const url = srv.url + "index.html";
    await retryStep("goto", () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }));

    await retryStep("boot", () => page.waitForFunction(
      () => window.__apex,
      null, { polling: 100, timeout: 90000 },
    ));

    log("assets", "loadModels start");
    await page.evaluate(async () => {
      if (typeof Assets !== "undefined" && Assets.loadModels) {
        try { await Assets.loadModels(); } catch (_) { /* pack optional */ }
      }
    });
    log("assets", "loadModels done");

    await page.evaluate((id) => { __apex.race(id); __apex.go(); }, opts.track);
    log("race", `started track=${opts.track}`);

    await retryStep("track-ready", () => page.waitForFunction(
      () => { try { return !!__apex.info().track; } catch { return false; } },
      null, { polling: 100, timeout: 180000 },
    ), { attempts: 2, delayMs: 4000 });

    await sleep(2000);

    await page.evaluate(({ camMode }) => {
      __apex.park(0.12);
      __apex.freeze(true);
      if (camMode === "eye") __apex.eyeAt(0.12, 0, 2.5);
      else if (camMode === "orbit") __apex.orbit(0.12, 45, 18, 55);
      else __apex.snapCam();
      __apex.jump(0.12, 65);
    }, { camMode: opts.cam });
    log("camera", opts.cam);

    log("frames", "step 60");
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        try { __apex.step(1 / 60); } catch (_) { /* menu / boot edge */ }
      }
    }, 60);
    await sleep(500);

    log("headless", "freeze loop");
    await page.evaluate(() => { try { __apex.headless(true); } catch (_) {} });
    await sleep(200);

    if (opts.backend === "webgpu") {
      await retryStep("canvas-pixels", () => page.evaluate(async () => {
        if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) {
          await GLX.awaitSoftPresent(15000);
        }
        const c = document.getElementById("game");
        if (!c || c.width < 8) throw new Error("canvas not sized");
        const tmp = document.createElement("canvas");
        tmp.width = c.width; tmp.height = c.height;
        tmp.getContext("2d").drawImage(c, 0, 0);
        const d = tmp.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        if (d[0] + d[1] + d[2] <= 30) throw new Error("canvas still black after awaitSoftPresent");
        return [d[0], d[1], d[2], d[3]];
      }), { attempts: 3, delayMs: 2000 });
    }

    const canvasPath = join(opts.outDir, "canvas.png");
    const pagePath = join(opts.outDir, "page-hud.png");
    await retryStep("screenshot-canvas", () =>
      page.locator("#game").screenshot({ path: canvasPath, type: "png", timeout: 60000 }));
    await retryStep("screenshot-page", () =>
      page.screenshot({ path: pagePath, type: "png", timeout: 60000 }));

    const payload = await page.evaluate(() => {
      const diag = __apex.diag({ download: false });
      const env = diag.env || {};
      const view = __apex.render({ what: "view", cols: 80, rows: 24 });
      return {
        backend: env.backend,
        pick: (() => { try { return localStorage.getItem("apex26.gfxBackend"); } catch { return null; } })(),
        bound: (() => { try { return sessionStorage.getItem("apex26.gfxBound"); } catch { return null; } })(),
        fail: (() => { try { return localStorage.getItem("apex26.gfxWgxFail"); } catch { return null; } })(),
        msaa: env.msaa,
        mobile: env.mobile,
        gpuErrors: (typeof WGX !== "undefined" && WGX.gpuErrors) ? WGX.gpuErrors() : null,
        hasWGX: typeof WGX !== "undefined",
        hasTLX: typeof TLX !== "undefined",
        hasGpu: !!navigator.gpu,
        coveragePct: view && view.coveragePct,
      };
    });

    const expectBackend = opts.backend === "webgpu" ? "webgpu" : "three";
    const boundOk = payload.backend === expectBackend ||
      (payload.backend && String(payload.backend).startsWith(expectBackend));
    if (!boundOk) {
      throw new Error(`backend mismatch: expected ${expectBackend}, got ${payload.backend}` +
        (payload.bound ? ` (gfxBound=${payload.bound})` : "") +
        (payload.fail ? ` (gfxWgxFail=${payload.fail})` : ""));
    }

    if (consoleLines.length) {
      writeFileSync(join(opts.outDir, "console.txt"), consoleLines.join("\n") + "\n", "utf8");
      log("console", `${consoleLines.length} lines → console.txt`);
    }

    return payload;
  } finally {
    await browser.close();
  }
}

let exitCode = 0;
let result = null;
let lastError = null;

log("start", JSON.stringify({
  backend: opts.backend, track: opts.track, lite: opts.lite, iphone: opts.iphone,
  cam: opts.cam, outDir: opts.outDir, retries: opts.retries,
}));

for (let attempt = 1; attempt <= opts.retries; attempt++) {
  try {
    const payload = await runProbeAttempt(attempt);
    result = {
      ok: true,
      attempt,
      outDir: opts.outDir,
      track: opts.track,
      backend: opts.backend,
      lite: opts.lite,
      iphone: opts.iphone,
      cam: opts.cam,
      logPath,
      ...payload,
      files: ["canvas.png", "page-hud.png", "state.json", "probe.log"],
    };
    writeFileSync(join(opts.outDir, "state.json"), JSON.stringify(result, null, 2));
    log("done", "PASS", { attempt, backend: payload.backend });
    break;
  } catch (e) {
    lastError = e;
    log("attempt", `FAIL ${attempt}/${opts.retries}`, { error: String(e.message || e).slice(0, 300) });
    if (attempt < opts.retries) {
      log("attempt", `waiting ${opts.retryDelayMs}ms before retry`);
      await sleep(opts.retryDelayMs);
      await shutdown();
      continue;
    }
    exitCode = 1;
    result = {
      ok: false,
      attempt,
      outDir: opts.outDir,
      track: opts.track,
      backend: opts.backend,
      lite: opts.lite,
      iphone: opts.iphone,
      cam: opts.cam,
      logPath,
      error: String(e.message || e),
      files: ["probe.log"],
    };
    writeFileSync(join(opts.outDir, "state.json"), JSON.stringify(result, null, 2));
    log("done", "FAIL", { error: result.error });
  }
}

try {
  console.log(JSON.stringify(result, null, 2));
} finally {
  await shutdown();
}
process.exit(exitCode);
