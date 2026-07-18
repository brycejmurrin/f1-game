import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { CAMERA_FRACTIONS, REGIONS } from "./config.mjs";
import { evaluateGates, measurePixels } from "./metrics.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

const PAGE_ERRORS = Symbol("campaignPageErrors");
const PAGE_META = Symbol("campaignPageMeta");

function safeClose(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

function assertInsideRoot(root, candidate) {
  const normalizedRoot = root.endsWith(sep) ? root : root + sep;
  if (candidate !== root && !candidate.startsWith(normalizedRoot)) {
    const error = new Error("path traversal rejected");
    error.statusCode = 403;
    throw error;
  }
}

function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const relativePath = pathname.replace(/^\/+/, "");
  const absolutePath = resolve(root, relativePath);
  assertInsideRoot(root, absolutePath);
  return absolutePath;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function waitForTwoFrames(page) {
  return page.evaluate(() => new Promise((resolveFrames) =>
    requestAnimationFrame(() => requestAnimationFrame(resolveFrames))));
}

async function readPngPixels(page, imagePath) {
  const b64 = readFileSync(imagePath).toString("base64");
  return page.evaluate(async (encoded) => {
    const img = new Image();
    img.src = "data:image/png;base64," + encoded;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const cx = canvas.getContext("2d");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  }, b64);
}

async function sampleFrameState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#game");
    const gl = canvas?.getContext("webgl2");
    const lightState = window.__apex.lightState();
    return {
      hdrMode: !!window.GLX?.hdrMode?.(),
      lightState,
      webglError: gl ? gl.getError() : -1,
    };
  });
}

async function captureAttempt(page, condition, profile, outDir) {
  page[PAGE_ERRORS].length = 0;
  mkdirSync(outDir, { recursive: true });

  await page.evaluate(({ track, tod, weather }) => {
    window.__apex.race(track, tod, weather);
  }, condition);
  await page.waitForFunction(({ track, tod, weather }) => {
    const info = window.__apex?.info?.();
    return info?.track === track &&
      window.__apex?.setTimeOfDay?.() === tod &&
      window.__apex?.weather?.() === weather;
  }, condition, { timeout: 45_000 });

  const resolved = await page.evaluate((nextProfile) => window.__apex.lightTune(nextProfile), profile);
  await wait(2_600);

  const viewDir = join(outDir, condition.key.replace(/[^a-z0-9|_-]+/gi, "_").replace(/\|/g, "__"));
  mkdirSync(viewDir, { recursive: true });
  const views = [];
  let lightState = null;

  for (const frac of CAMERA_FRACTIONS[condition.track]) {
    await page.evaluate((viewFrac) => {
      window.__apex.park(viewFrac);
      window.__apex.hud(false);
      window.__apex.eyeAt(viewFrac, 0.2, 1.35);
    }, frac);
    await waitForTwoFrames(page);

    const image = join(viewDir, `${views.length + 1}-f${frac.toFixed(2)}.png`);
    await page.locator("canvas#game").screenshot({ path: image, type: "png" });
    const pixels = await readPngPixels(page, image);
    const metrics = measurePixels(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height, REGIONS);
    const frameState = await sampleFrameState(page);
    lightState = { ...frameState.lightState, hdrMode: frameState.hdrMode };
    const pageErrors = Array.from(new Set(page[PAGE_ERRORS]));
    const gates = evaluateGates({
      metrics,
      lightState: frameState.lightState,
      pageErrors,
      tod: condition.tod,
      webglError: frameState.webglError,
    });
    views.push({
      frac,
      image,
      metrics,
      webglError: frameState.webglError,
      pageErrors,
      gates,
    });
  }

  const failures = Array.from(new Set(views.flatMap((view) => view.gates.failures)));
  return {
    condition,
    profile,
    resolved,
    lightState,
    views,
    gates: { ok: failures.length === 0, failures },
  };
}

async function freshRetryPage(page) {
  const browser = page.context().browser();
  const { port } = page[PAGE_META];
  await page.close();
  return createCampaignPage(browser, port);
}

export async function startStaticServer(root) {
  const absoluteRoot = resolve(root);
  const server = createServer((req, res) => {
    try {
      const filePath = resolveRequestPath(absoluteRoot, req.url);
      const body = readFileSync(filePath);
      res.writeHead(200, {
        "content-type": MIME[extname(filePath)] || "application/octet-stream",
      });
      res.end(body);
    } catch (error) {
      const statusCode = error?.statusCode || (error?.code === "ENOENT" ? 404 : 500);
      res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error?.message || error));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });

  return {
    server,
    port: server.address().port,
    close: () => safeClose(server),
  };
}

export async function launchCampaignBrowser() {
  return chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ["--use-angle=swiftshader", "--enable-webgl"],
  });
}

export async function createCampaignPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page[PAGE_ERRORS] = [];
  page[PAGE_META] = { port };
  page.on("pageerror", (error) => {
    page[PAGE_ERRORS].push(String(error?.message || error));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") page[PAGE_ERRORS].push(msg.text());
  });
  await page.addInitScript(() => localStorage.setItem("apex26.gfxBackend", "webgl2"));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    window.__apex && document.querySelector("#game")?.getContext("webgl2"));
  page[PAGE_META].hdrMode = await page.evaluate(() => !!window.GLX?.hdrMode?.());
  return page;
}

export async function captureCondition(page, condition, profile, outDir) {
  let currentPage = page;
  let lastResult = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await captureAttempt(currentPage, condition, profile, outDir);
      if (result.gates.ok) return result;
      lastResult = result;
      lastError = new Error(`capture gates failed: ${result.gates.failures.join(",")}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) currentPage = await freshRetryPage(currentPage);
  }

  if (lastResult) {
    const failures = Array.from(new Set(["blocked", ...lastResult.gates.failures]));
    return { ...lastResult, gates: { ok: false, failures } };
  }

  return {
    condition,
    profile,
    resolved: null,
    lightState: null,
    views: [],
    gates: {
      ok: false,
      failures: ["blocked", "capture-error", String(lastError?.message || lastError || "unknown-error")],
    },
  };
}
