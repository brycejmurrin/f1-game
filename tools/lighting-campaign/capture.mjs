// @doc lighting-campaign: the Playwright capture leg — static server, campaign page, configured views per condition.
// @skill lighting-tuner
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { CAMERA_FRACTIONS, REGIONS } from "./config.mjs";
import { evaluateGates, measurePixels } from "./metrics.mjs";
import { launchChromium } from "../harness.mjs";

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
const RETRY_BROWSER = Symbol("campaignRetryBrowser");

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

export async function captureConfiguredViews(track, captureView) {
  const fractions = CAMERA_FRACTIONS[track];
  if (!fractions || fractions.length !== 3) {
    throw new Error(`capture requires exactly three camera views: ${track}`);
  }
  const views = [];
  for (let index = 0; index < fractions.length; index++) {
    views.push(await captureView(fractions[index], index));
  }
  return views;
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
  let lightState = null;

  const views = await captureConfiguredViews(condition.track, async (frac, index) => {
    await page.evaluate((viewFrac) => {
      window.__apex.park(viewFrac);
      window.__apex.hud(false);
      window.__apex.eyeAt(viewFrac, 0.2, 1.35);
    }, frac);
    await waitForTwoFrames(page);

    const image = join(viewDir, `${index + 1}-f${frac.toFixed(2)}.png`);
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
    return {
      frac,
      image,
      metrics,
      webglError: frameState.webglError,
      pageErrors,
      gates,
    };
  });

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

export async function createCampaignRetryPage(page, hooks = {}) {
  const { port } = page[PAGE_META];
  const launchBrowser = hooks.launchBrowser || launchCampaignBrowser;
  const createPage = hooks.createPage || createCampaignPage;
  const browser = await launchBrowser();
  try {
    const retryPage = await createPage(browser, port);
    retryPage[RETRY_BROWSER] = browser;
    return retryPage;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function closeCampaignRetryPage(page) {
  const browser = page[RETRY_BROWSER];
  if (browser) await browser.close();
  else await page.close();
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
  return launchChromium({
    args: ["--use-angle=swiftshader", "--enable-webgl"],
  });
}

export async function createCampaignPage(browser, port) {
  const viewport = { width: 960, height: 540 };
  const ownedContext = typeof browser.newContext === "function"
    ? await browser.newContext({ viewport })
    : null;
  let page;
  try {
    page = ownedContext
      ? await ownedContext.newPage()
      : await browser.newPage({ viewport });
    page[PAGE_ERRORS] = [];
    page[PAGE_META] = { port };
    page.on("pageerror", (error) => {
      page[PAGE_ERRORS].push(String(error?.message || error));
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") page[PAGE_ERRORS].push(msg.text());
    });
    await page.addInitScript(() => localStorage.setItem("apex26.gfxBackend", "webgl2"));
    await page.goto(`http://127.0.0.1:${port}/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(() =>
      window.__apex && document.querySelector("#game")?.getContext("webgl2"), null, { timeout: 60_000 });
    page[PAGE_META].hdrMode = await page.evaluate(() => !!window.GLX?.hdrMode?.());
    return page;
  } catch (error) {
    if (ownedContext) await ownedContext.close();
    else if (page) await page.close();
    throw error;
  }
}

export async function captureCondition(page, condition, profile, outDir, hooks = {}) {
  const attemptCapture = hooks.captureAttempt || captureAttempt;
  const createRetryPage = hooks.createRetryPage || createCampaignRetryPage;
  let currentPage = page;
  let lastResult = null;
  let lastError = null;
  const ownedRetryPages = new Set();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await attemptCapture(currentPage, condition, profile, outDir);
        if (result.gates.ok) return result;
        lastResult = result;
        lastError = new Error(`capture gates failed: ${result.gates.failures.join(",")}`);
      } catch (error) {
        lastError = error;
      }
      if (currentPage !== page) {
        await closeCampaignRetryPage(currentPage);
        ownedRetryPages.delete(currentPage);
      }
      if (attempt < 2) {
        try {
          currentPage = await createRetryPage(page);
          ownedRetryPages.add(currentPage);
        } catch (error) {
          lastError = error;
          break;
        }
      }
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
  } finally {
    await Promise.allSettled(
      Array.from(ownedRetryPages, (retryPage) => closeCampaignRetryPage(retryPage)),
    );
  }
}
