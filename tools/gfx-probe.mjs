#!/usr/bin/env node
// gfx-probe.mjs — WEBGPU (WGX) and THREE (TLX) screenshot probe with logging.
//
// Software adapters (WGX + TLX WebGPU): primary gate is visible #game /
// #game-soft after GLX.awaitSoftPresent() (soft-present 2D blit). THREE
// pins tlxForceGL=1 unless --tlx-webgpu. capturePixels readback →
// frame.png is optional and runs AFTER the visible check. Playwright uses
// tools/webgpu-chrome-args.cjs; MCP chrome-devtools uses the same flags.
//
// Usage:
//   node tools/gfx-probe.mjs [--backend webgpu|three] [--lite] [--iphone]
//                            [--tlx-webgpu] [--lavapipe]
//                            [--retries N] [--retry-delay MS]
//                            [trackId] [--cam orbit|eye|park] [--out DIR]
//
// --backend three defaults to apex26.tlxForceGL=1 (SwiftShader WebGL2 — the
// spec pin). --tlx-webgpu unpins that (apex26.tlxForceGL=0) and launches with
// the Dawn flags so three's WebGPU backend can claim the canvas. SwiftShader
// Dawn still dies on three's mappedAtCreation uploads; pair --tlx-webgpu with
// --lavapipe (Mesa ICD + WEBGPU_LAVAPE_*) for a software WebGPU TLX probe.
//
// Logs go to stderr (live) and <out>/probe.log (always). Final JSON on stdout.

import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startStaticServer, launchChromium, shutdown, sleep,
  WEBGPU_CHROMIUM_ARGS, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV,
} from "./harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

function parseArgs(argv) {
  const o = {
    backend: "webgpu",
    track: "montreal",
    cam: "park",
    lite: false,
    iphone: false,
    tod: null,
    tlxWebgpu: false,
    lavapipe: false,
    outDir: null,
    retries: 2,
    retryDelayMs: 3000,
    ls: [],
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
    else if (a === "--tod") { o.tod = next(); skip.add(o.tod); }
    else if (a === "--lite") o.lite = true;
    else if (a === "--iphone") o.iphone = true;
    else if (a === "--tlx-webgpu") o.tlxWebgpu = true;
    else if (a === "--lavapipe") o.lavapipe = true;
    else if (a === "--ls") { const kv = next(); skip.add(kv); if (kv) o.ls.push(kv); }
    else if (a === "--help" || a === "-h") {
      console.log(`gfx-probe — WEBGPU/THREE screenshot probe with logging + retry

  node tools/gfx-probe.mjs [--backend webgpu|three] [--lite] [--iphone]
                           [--tod day|dusk|dawn|night] [--tlx-webgpu] [--lavapipe]
                           [--retries N] [--retry-delay MS]
                           [track] [--cam orbit|eye|park] [--out DIR]

  --tlx-webgpu  with --backend three, unpin tlxForceGL (three's WebGPU path)
  --lavapipe    Dawn via Mesa Lavapipe ICD (pair with --tlx-webgpu on Cloud)
  --ls k=v      set a localStorage key before boot (repeatable)

  stderr + <out>/probe.log: phased progress; stdout: final JSON result.`);
      process.exit(0);
    } else if (!a.startsWith("--") && !skip.has(a)) {
      o.track = a;
      skip.add(a);
    }
  }
  if (!o.outDir) {
    o.outDir = join("artifacts", "tmp", "gfx-probe",
      `${o.backend}${o.lite ? "-lite" : ""}${o.iphone ? "-iphone" : ""}` +
      `${o.tlxWebgpu ? "-tlxgpu" : ""}${o.lavapipe ? "-lvp" : ""}-${o.track}`);
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

const ATTEMPT_ARTIFACTS = ["canvas.png", "frame.png", "page-hud.png", "state.json", "console.txt"];

function clearAttemptArtifacts() {
  // The default output directory is stable across runs. Remove only files this
  // tool owns so a failed optional readback cannot masquerade as a fresh frame.
  for (const name of ATTEMPT_ARTIFACTS) rmSync(join(opts.outDir, name), { force: true });
}

function artifactFiles() {
  // state.json is written immediately after the result object is assembled.
  return [...ATTEMPT_ARTIFACTS, "probe.log"]
    .filter((name) => name === "state.json" || existsSync(join(opts.outDir, name)));
}

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

  let launchArgs;
  let launchEnv;
  if (opts.lavapipe) {
    launchArgs = [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"];
    launchEnv = { ...process.env, ...WEBGPU_LAVAPE_ENV };
  } else if (opts.backend === "webgpu" || opts.tlxWebgpu) {
    launchArgs = [...WEBGPU_CHROMIUM_ARGS];
  } else {
    launchArgs = ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
  }
  log("browser", "launch", {
    args: launchArgs.length,
    lavapipe: opts.lavapipe,
    tlxWebgpu: opts.tlxWebgpu,
  });

  const browser = await launchChromium({
    args: launchArgs,
    ...(launchEnv ? { env: launchEnv } : {}),
  });
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

    await page.addInitScript(([be, wantLite, wantTlxGpu, extraLs]) => {
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
        localStorage.setItem("apex26.tlxForceGL", wantTlxGpu ? "0" : "1");
        if (wantTlxGpu) sessionStorage.setItem("apex26.wgxCapture", "1");
      }
      // --ls key=value (repeatable): any apex26.* knob, set AFTER the backend
      // pins so a probe can drive a switch the pins do not know about.
      for (const kv of extraLs || []) {
        const i = kv.indexOf("=");
        if (i > 0) localStorage.setItem(kv.slice(0, i), kv.slice(i + 1));
      }
    }, [opts.backend, opts.lite, opts.tlxWebgpu, opts.ls]);

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

    await page.evaluate(({ id, tod }) => {
      if (tod) __apex.race(id, tod, "dry");
      else __apex.race(id);
      __apex.go();
    }, { id: opts.track, tod: opts.tod });
    log("race", `started track=${opts.track}` + (opts.tod ? ` tod=${opts.tod}` : ""));

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
      __apex.jump(0.12, 65);
      if (camMode !== "orbit") __apex.snapCam();
    }, { camMode: opts.cam });
    log("camera", opts.cam);

    // Live rAF renders — step() is physics-only and headless() skips render(),
    // which left soft-present showing a stale / blown-out frame (orbit into
    // Montreal floodlights read as solid white). wgx-capture.mjs uses this path.
    log("frames", "rAF 45");
    await page.evaluate((n) => new Promise((res) => {
      let i = 0;
      const tick = () => { if (++i > n) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), 45);

    const canvasPath = join(opts.outDir, "canvas.png");
    const pagePath = join(opts.outDir, "page-hud.png");

    if (opts.backend === "webgpu" || opts.tlxWebgpu) {
      // Visible #game is the 2D soft-present blit — check it BEFORE capturePixels
      // (concurrent mapAsync readbacks on SwiftShader can poison the device).
      // TLX WebGPU uses the same WGX-style blit (softOutRT → putImageData).
      await retryStep("soft-present", () => page.evaluate(async () => {
        if (typeof GLX === "undefined" || !GLX.awaitSoftPresent) {
          throw new Error("no GLX.awaitSoftPresent on software-WebGPU backend");
        }
        await GLX.awaitSoftPresent(60000);
        // WGX blits onto #game itself; TLX inserts a SEPARATE #game-soft 2D
        // sibling and leaves #game as the WebGPU-claimed node (see tlx.js
        // "Soft-present overlay"). Looking only at #game therefore measured the
        // wrong element on the TLX-WebGPU path — a blank read there said
        // nothing about whether a frame was presented.
        const soft = document.getElementById("game-soft");
        const g = soft || document.getElementById("game");
        const which = soft ? "#game-soft" : "#game";
        const ctx = g && g.getContext("2d");
        if (!ctx) throw new Error(which + " has no 2D display context");
        // SAMPLE THE WHOLE FRAME, not the top-left 64x64. That corner is SKY on
        // every circuit, and a dusk/night sky is near-black — so the old read
        // reported maxLuma=0 for frames that were fully rendered everywhere
        // else. It cost this session several rounds of chasing a "black" frame
        // that measured mean-luma 32.6 with 0.5% near-black pixels once the
        // whole canvas was measured. Stride the full canvas instead.
        const id = ctx.getImageData(0, 0, g.width, g.height);
        let max = 0, sum = 0, n = 0;
        for (let i = 0; i < id.data.length; i += 4) {
          const l = id.data[i] + id.data[i + 1] + id.data[i + 2];
          if (l > max) max = l;
          sum += l; n++;
        }
        const mean = n ? sum / n : 0;
        if (max < 8) {
          throw new Error("visible " + which + " blank after soft-present (maxLuma=" + max +
            ", meanLuma=" + mean.toFixed(1) +
            ", size=" + g.width + "x" + g.height +
            ", softPresent=" + (GLX.softPresent ? GLX.softPresent() : "n/a") + ")");
        }
      }), { attempts: 2, delayMs: 2000 });
      // putImageData keeps mutating #game — Playwright's locator screenshot
      // waits for "stability" and times out. Dump the 2D bitmap instead.
      const canvasB64 = await page.evaluate(() => {
        // Same element the blank-check read — see the #game-soft note above.
        const g = document.getElementById("game-soft") || document.getElementById("game");
        if (!g || typeof g.toDataURL !== "function") throw new Error("presented canvas has no toDataURL");
        return g.toDataURL("image/png").split(",")[1];
      });
      writeFileSync(canvasPath, Buffer.from(canvasB64, "base64"));
      log("canvas", "visible #game canvas.png saved");

      // TLX's blit already used mapAsync on softOutRT. A second
      // capturePixels races that readback and times out on Lavapipe
      // (~90 s) without adding a better picture than #game.
      if (!opts.tlxWebgpu) {
      let frameCap = null;
      try {
        frameCap = await retryStep("capture-pixels", () => page.evaluate(async () => {
          if (typeof GLX === "undefined" || !GLX.capturePixels) {
            throw new Error("no GLX.capturePixels on live backend");
          }
          const cap = await Promise.race([
            GLX.capturePixels(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("capturePixels timeout")), 90000)),
          ]);
          const c = document.createElement("canvas");
          c.width = cap.width; c.height = cap.height;
          c.getContext("2d").putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
          let sum = 0, max = 0, n = 0;
          for (let i = 0; i < cap.data.length; i += 401 * 4) {
            const l = (cap.data[i] + cap.data[i + 1] + cap.data[i + 2]) / 3;
            sum += l; if (l > max) max = l;
            n++;
          }
          if (max < 8) throw new Error("capturePixels frame blank (maxLuma=" + max + ")");
          return {
            png: c.toDataURL("image/png").split(",")[1],
            width: cap.width, height: cap.height,
            meanLuma: sum / n, maxLuma: max,
          };
        }), { attempts: 1, delayMs: 0 });
        writeFileSync(join(opts.outDir, "frame.png"), Buffer.from(frameCap.png, "base64"));
        log("capture", `capturePixels ${frameCap.width}x${frameCap.height} meanLuma=${frameCap.meanLuma.toFixed(1)} maxLuma=${frameCap.maxLuma}`);
      } catch (e) {
        log("capture", "skipped (optional GPU readback)", { error: String(e.message || e).slice(0, 120) });
      }
      }
    } else {
      await retryStep("soft-present", () => page.evaluate(async () => {
        if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) {
          await GLX.awaitSoftPresent(15000);
        }
      }));
      await retryStep("screenshot-canvas", () =>
        page.locator("#game").screenshot({ path: canvasPath, type: "png", timeout: 60000 }));
      try {
        const frameCap = await retryStep("capture-pixels", () => page.evaluate(async () => {
          if (typeof GLX === "undefined" || !GLX.capturePixels) {
            throw new Error("no GLX.capturePixels on live backend");
          }
          const cap = await Promise.race([
            GLX.capturePixels(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("capturePixels timeout")), 30000)),
          ]);
          const c = document.createElement("canvas");
          c.width = cap.width; c.height = cap.height;
          c.getContext("2d").putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
          let sum = 0, max = 0, n = 0;
          for (let i = 0; i < cap.data.length; i += 401 * 4) {
            const l = (cap.data[i] + cap.data[i + 1] + cap.data[i + 2]) / 3;
            sum += l; if (l > max) max = l;
            n++;
          }
          if (max < 8) throw new Error("capturePixels frame blank (maxLuma=" + max + ")");
          return {
            png: c.toDataURL("image/png").split(",")[1],
            width: cap.width, height: cap.height,
            meanLuma: sum / n, maxLuma: max,
          };
        }), { attempts: 1, delayMs: 0 });
        writeFileSync(join(opts.outDir, "frame.png"), Buffer.from(frameCap.png, "base64"));
        log("capture", `capturePixels ${frameCap.width}x${frameCap.height} meanLuma=${frameCap.meanLuma.toFixed(1)} maxLuma=${frameCap.maxLuma}`);
      } catch (e) {
        log("capture", "skipped (optional GPU readback)", { error: String(e.message || e).slice(0, 120) });
      }
    }

    await retryStep("screenshot-page", () =>
      page.screenshot({ path: pagePath, type: "png", timeout: 60000 }));

    const payload = await page.evaluate(() => {
      const diag = __apex.diag({ download: false });
      const env = diag.env || {};
      const view = __apex.render({ what: "view", cols: 80, rows: 24 });
      const lutSrc = (typeof WGX !== "undefined" && WGX.roadLutReady) ? WGX
        : ((typeof GLX !== "undefined" && GLX.roadLutReady) ? GLX : null);
      return {
        backend: env.backend,
        pick: (() => { try { return localStorage.getItem("apex26.gfxBackend"); } catch { return null; } })(),
        bound: (() => { try { return sessionStorage.getItem("apex26.gfxBound"); } catch { return null; } })(),
        fail: (() => { try { return localStorage.getItem("apex26.gfxWgxFail"); } catch { return null; } })(),
        msaa: env.msaa,
        mobile: env.mobile,
        // Ask the BOUND backend, not just WGX. This read was WGX-only, so on
        // the three backend the field could never be anything but null — and a
        // black TLX-WebGPU frame was reported for a whole session as
        // "gpuErrors: null", which read as "no errors" and meant "no reader".
        // GLX carries the bound backend's methods (game.js descriptor-copy).
        gpuErrors:
          (typeof GLX !== "undefined" && GLX.gpuErrors) ? GLX.gpuErrors()
          : (typeof WGX !== "undefined" && WGX.gpuErrors) ? WGX.gpuErrors()
          : null,
        gpuFirstError:
          (typeof GLX !== "undefined" && GLX.gpuFirstError) ? GLX.gpuFirstError() : null,
        hasWGX: typeof WGX !== "undefined",
        hasTLX: typeof TLX !== "undefined",
        hasGpu: !!navigator.gpu,
        coveragePct: view && view.coveragePct,
        roadLutReady: lutSrc ? lutSrc.roadLutReady() : null,
        softPresent: (typeof GLX !== "undefined" && GLX.softPresentState)
          ? GLX.softPresentState() : null,
        sky: (function () {
          const g = document.getElementById("game");
          const ctx = g && g.getContext("2d");
          if (!ctx) return null;
          const p = ctx.getImageData(g.width >> 1, 8, 1, 1).data;
          return [p[0], p[1], p[2]];
        })(),
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
  tlxWebgpu: opts.tlxWebgpu, lavapipe: opts.lavapipe,
  cam: opts.cam, outDir: opts.outDir, retries: opts.retries,
}));

for (let attempt = 1; attempt <= opts.retries; attempt++) {
  clearAttemptArtifacts();
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
      tlxWebgpu: opts.tlxWebgpu,
      lavapipe: opts.lavapipe,
      cam: opts.cam,
      logPath,
      ...payload,
      files: artifactFiles(),
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
      tlxWebgpu: opts.tlxWebgpu,
      lavapipe: opts.lavapipe,
      cam: opts.cam,
      logPath,
      error: String(e.message || e),
      files: artifactFiles(),
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
