/**
 * #3293 — navigation cacheWrite must not store a 200 HTML page that lacks a
 * matching apex-build meta (captive portal / interstitial). Harness mirrors
 * the createHarness shape in service-worker.test.mjs so this file stays
 * OWNED without editing that HELD module.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { recoveryRelease, startPwaRecoveryServer } from "../helpers/pwa-recovery.mjs";

const SW_SOURCE = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
const ORIGIN = "https://apex.test";

function requestKey(value) {
  if (typeof value === "string") return new URL(value, `${ORIGIN}/`).href;
  return value.url;
}

function createHarness({ fetchImpl } = {}) {
  const listeners = new Map();
  const stores = new Map();

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  const caches = {
    async open(name) {
      const store = storeFor(name);
      return {
        async put(request, response) {
          store.set(requestKey(request), response.clone());
        },
        async match(request) {
          return store.get(requestKey(request));
        },
      };
    },
    async match(request, options) {
      const key = requestKey(request);
      if (options && options.cacheName != null) {
        const store = stores.get(options.cacheName);
        return store && store.has(key) ? store.get(key).clone() : undefined;
      }
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key).clone();
      }
      return undefined;
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
  };

  const self = {
    location: { origin: ORIGIN, hostname: "apex.test", href: `${ORIGIN}/sw.js?v=321` },
    clients: { async claim() {} },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    skipWaiting() {},
  };

  const context = vm.createContext({
    URL,
    crypto: webcrypto,
    AbortController,
    Request,
    Response,
    caches,
    fetch: fetchImpl || (() => Promise.reject(new Error("unexpected fetch"))),
    self,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(SW_SOURCE, context, { filename: absSrc("sw.js") });

  function fetchEvent(request) {
    const lifetimes = [];
    let responsePromise;
    listeners.get("fetch")({
      request,
      respondWith(promise) {
        responsePromise = Promise.resolve(promise);
      },
      waitUntil(promise) {
        lifetimes.push(Promise.resolve(promise));
      },
    });
    return { lifetimes, responsePromise };
  }

  return { stores, fetchEvent };
}

test("query-less navigation with no apex-build meta is not written to the shell cache (#3293)", async () => {
  const portal = "<!doctype html><title>Sign in to Wi‑Fi</title><body>captive portal</body>";
  const prior = '<meta name="apex-build" content="321">good shell';
  const h = createHarness({
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response(portal, { status: 200, headers: { "content-type": "text/html" } }));
    },
  });
  h.stores.set("apex26-321", new Map([
    [`${ORIGIN}/`, new Response(prior, { status: 200 })],
    [`${ORIGIN}/index.html`, new Response(prior, { status: 200 })],
  ]));

  const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  assert.equal(await (await nav.responsePromise).text(), portal, "network still reaches the page");
  await Promise.all(nav.lifetimes);

  const stored = h.stores.get("apex26-321").get(`${ORIGIN}/`);
  assert.ok(stored, "prior shell entry remains");
  assert.equal(await stored.clone().text(), prior, "captive portal must not replace the cached shell");
});

test("query-less navigation with a matching apex-build meta is still written", async () => {
  const shell = '<meta name="apex-build" content="321">fresh shell';
  const h = createHarness({
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response(shell, { status: 200 }));
    },
  });

  const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  assert.equal(await (await nav.responsePromise).text(), shell);
  await Promise.all(nav.lifetimes);
  assert.equal(await h.stores.get("apex26-321").get(`${ORIGIN}/`).text(), shell);
});

test("offline after a no-meta 200 still serves the prior precached shell", async () => {
  const portal = "<html><head></head><body>interstitial</body></html>";
  const prior = '<meta name="apex-build" content="321">precached shell';
  let online = true;
  const h = createHarness({
    fetchImpl: (request) => {
      if (!online) return Promise.reject(new TypeError("Failed to fetch"));
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response(portal, { status: 200 }));
    },
  });
  h.stores.set("apex26-321", new Map([
    [`${ORIGIN}/index.html`, new Response(prior, { status: 200 })],
  ]));

  const first = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  await first.responsePromise;
  await Promise.all(first.lifetimes);

  online = false;
  const off = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  assert.equal(await (await off.responsePromise).text(), prior);
});

test("PWA recovery release rejects invalid generations and stamps actual asset bytes", async () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, "91001"]) assert.throws(() => recoveryRelease(value), TypeError);
  const release = recoveryRelease(91001);
  const digest = Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(release.script))).toString("hex").slice(0, 12);
  assert.equal(release.asset, `shell.js?v=${digest}`);
  // The browser matrix checks parsed meta, exact hashed script URL and executed
  // script build without duplicating the HTML's source shape here.
});

test("PWA recovery origin serves production SW bytes and fails worker-owned requests at the server", async () => {
  const server = await startPwaRecoveryServer();
  try {
    const workerA = await (await fetch(`${server.origin}/sw.js?v=91001`)).text();
    assert.equal(workerA, SW_SOURCE + "\n// PWA recovery fixture release 91001\n");
    assert.equal(server.sourceHash.length, 64);
    server.deploy(91002, { failRequired: true });
    assert.equal((await fetch(`${server.origin}/shell.js?v=fixture`)).status, 503);
    assert.equal((await fetch(`${server.origin}/version.json`)).status, 200);
    assert.equal((await (await fetch(`${server.origin}/version.json`)).json()).build, 91002);
    server.setOffline(true);
    for (const path of ["/", "/sw.js?v=91002", "/version.json", "/js/render/glx/glx.js?v=91002"]) {
      assert.equal((await fetch(server.origin + path)).status, 503, path);
    }
    server.setOffline(false);
    server.deploy(91002);
    assert.equal((await fetch(`${server.origin}/shell.js?v=fixture`)).status, 200);
    assert.ok(server.requests.some((r) => r.build === 91002 && r.status === 503));
    assert.equal(await (await fetch(`${server.origin}/sw.js?v=91002`)).text(), SW_SOURCE + "\n// PWA recovery fixture release 91002\n");
  } finally { await server.close(); }
});
