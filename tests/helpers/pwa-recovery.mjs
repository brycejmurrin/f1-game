import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

/** Minimal, deterministic release data; the worker itself is the repository's real sw.js. */
export function recoveryRelease(build) {
  if (!Number.isSafeInteger(build) || build <= 0) throw new TypeError("positive integer build required");
  const script = `window.__pwaFixtureBuild = ${build};\n`;
  const hash = createHash("sha256").update(script).digest("hex").slice(0, 12);
  return {
    build, script, asset: `shell.js?v=${hash}`,
    html: `<!doctype html><meta name="apex-build" content="${build}"><title>PWA recovery fixture ${build}</title><script src="shell.js?v=${hash}"></script>`,
  };
}

/**
 * Real HTTP origin, including worker-owned fetches and main-script update requests.
 * Page routing / context.setOffline do not reliably cover those paths in Chromium.
 * Nothing is written to sw.js, the game shell or a developer's browser profile.
 */
export async function startPwaRecoveryServer() {
  const source = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  let release = recoveryRelease(91001), offline = false, failRequired = false;
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://fixture.invalid");
    const status = offline || (failRequired && url.pathname === "/shell.js") ? 503 : 200;
    if (requests.length < 4000) requests.push({ path: url.pathname + url.search, build: release.build, status });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Apex-Fixture-Build", String(release.build));
    res.statusCode = status;
    if (status !== 200) { res.end("fixture origin unavailable"); return; }
    if (url.pathname === "/sw.js") {
      res.setHeader("Content-Type", "application/javascript");
      // Update checking compares bytes. Preserve all production code, adding only a release marker.
      res.end(source + `\n// PWA recovery fixture release ${release.build}\n`);
    } else if (url.pathname === "/" || url.pathname === "/index.html") {
      res.setHeader("Content-Type", "text/html"); res.end(release.html);
    } else if (url.pathname === "/version.json") {
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ build: release.build }));
    } else {
      // Required GLX / career and optional roster requests are real network requests,
      // but their bodies are inert fixtures: this checks cache lifecycle, not game boot.
      res.setHeader("Content-Type", "application/javascript");
      res.end(url.pathname === "/shell.js" ? release.script : "/* inert precache fixture */\n");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind a TCP port");
  return {
    origin: `http://127.0.0.1:${address.port}`, sourceHash, requests,
    deploy(build, options = {}) { release = recoveryRelease(build); failRequired = options.failRequired === true; },
    setOffline(value) { offline = value === true; },
    async close() {
      const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

/** Bounded observations, read from the controlled page's actual origin. */
export async function pwaRecoverySnapshot(page) {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    const registration = await navigator.serviceWorker.getRegistration();
    const generations = [];
    for (const name of await caches.keys()) {
      if (!/^apex26-\d+$/.test(name)) continue;
      const cache = await caches.open(name);
      generations.push({ name, settled: !!(await cache.match("__apex_install_settled__")), complete: !!(await cache.match("__apex_install_complete__")) });
    }
    return {
      controller: controller ? { scriptURL: controller.scriptURL, state: controller.state } : null,
      active: registration?.active?.scriptURL || null,
      installing: registration?.installing?.scriptURL || null,
      waiting: registration?.waiting?.scriptURL || null,
      shellBuild: Number(document.querySelector('meta[name="apex-build"]')?.getAttribute("content")) || null,
      scriptURL: document.querySelector("script[src]")?.src || null,
      assetBuild: window.__pwaFixtureBuild || null,
      generations,
    };
  });
}

/** Production message contract, with an explicit failure rather than an unbounded hang. */
export async function pwaServedGeneration(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) { reject(new Error("page has no service-worker controller")); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("generation handshake timed out")); }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer); channel.port1.close();
      if (event.data?.type !== "apex-cache-generation" || !Number.isSafeInteger(event.data.build)) {
        reject(new Error("invalid generation handshake")); return;
      }
      resolve(event.data.build);
    };
    controller.postMessage({ type: "apex-cache-generation" }, [channel.port2]);
  }));
}
