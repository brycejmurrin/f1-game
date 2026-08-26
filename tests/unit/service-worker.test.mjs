import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SW_SOURCE = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
const ORIGIN = "https://apex.test";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function requestKey(value) {
  if (typeof value === "string") return new URL(value, `${ORIGIN}/`).href;
  return value.url;
}

function createHarness({ fetchImpl, putImpl, immediateTimeout = false, immediateTimeoutMs = null, navigator } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const deleted = [];
  let skipped = 0;
  let claimed = 0;

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  const caches = {
    async open(name) {
      const store = storeFor(name);
      return {
        async put(request, response) {
          if (putImpl) await putImpl(name, request, response);
          store.set(requestKey(request), response.clone());
        },
        async match(request) {
          return store.get(requestKey(request));
        },
      };
    },
    async match(request) {
      const key = requestKey(request);
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key).clone();
      }
      return undefined;
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      deleted.push(name);
      return stores.delete(name);
    },
  };

  const self = {
    location: { origin: ORIGIN },
    clients: {
      async claim() {
        claimed += 1;
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    skipWaiting() {
      skipped += 1;
    },
  };

  const context = vm.createContext({
    URL,
    AbortController,
    Request,
    Response,
    caches,
    fetch: fetchImpl || (() => Promise.reject(new Error("unexpected fetch"))),
    self,
    setTimeout: immediateTimeout
      ? (callback) => {
          queueMicrotask(callback);
          return 1;
        }
      : immediateTimeoutMs != null
        ? (callback, ms, ...args) => {
            if (ms === immediateTimeoutMs) { queueMicrotask(() => callback(...args)); return 1; }
            return setTimeout(callback, ms, ...args);
          }
      : setTimeout,
    clearTimeout,
    ...(navigator ? { navigator } : {}),
  });
  vm.runInContext(SW_SOURCE, context, { filename: "sw.js" });

  function lifecycleEvent(type) {
    const lifetimes = [];
    listeners.get(type)({
      waitUntil(promise) {
        lifetimes.push(Promise.resolve(promise));
      },
    });
    return {
      lifetimes,
      done: () => Promise.all(lifetimes),
    };
  }

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

  return {
    stores,
    deleted,
    get skipped() {
      return skipped;
    },
    get claimed() {
      return claimed;
    },
    lifecycleEvent,
    fetchEvent,
  };
}

function installFetch({ failEssential = false, failOptional = false } = {}) {
  return async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) {
      return new Response('{"build":321}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/index.html")) {
      return new Response(
        '<link rel="stylesheet" href="css/style.css?v=321">' +
          '<link rel="icon" href="assets/icon.png">' +
          '<script src="js/game.js?v=321"></script>',
        { status: 200 },
      );
    }
    if (failEssential && url.pathname.endsWith("/js/game.js")) {
      return new Response("missing", { status: 404 });
    }
    if (failOptional && url.pathname.endsWith("/assets/icon.png")) {
      return new Response("missing", { status: 404 });
    }
    return new Response("asset", { status: 200 });
  };
}

test("install rejects when an essential runtime asset cannot be cached", async () => {
  const harness = createHarness({ fetchImpl: installFetch({ failEssential: true }) });
  harness.stores.set("apex26-320", new Map([["healthy", new Response("old")]]));

  const install = harness.lifecycleEvent("install");

  await assert.rejects(install.done());
  assert.equal(harness.skipped, 0);
  assert.equal(harness.stores.get("apex26-320").has("healthy"), true);
});

test("install tolerates optional asset failures and waits for essential writes before skipping", async () => {
  const heldPut = deferred();
  let held = false;
  const harness = createHarness({
    fetchImpl: installFetch({ failOptional: true }),
    putImpl: async (_name, request) => {
      if (!held && requestKey(request).includes("js/game.js")) {
        held = true;
        await heldPut.promise;
      }
    },
  });

  const install = harness.lifecycleEvent("install");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.skipped, 0);

  heldPut.resolve();
  await install.done();

  assert.equal(harness.skipped, 1);
  const current = harness.stores.get("apex26-321");
  assert.equal(current.has(`${ORIGIN}/js/game.js?v=321`), true);
  assert.equal(current.has(`${ORIGIN}/assets/icon.png`), false);
});

test("install bypasses the HTTP cache only for mutable shell/version essentials", async () => {
  const seen = [];
  const ordinary = installFetch();
  const harness = createHarness({
    fetchImpl: async (request, init) => {
      seen.push({ request, init: init || {} });
      return ordinary(request);
    },
  });

  await harness.lifecycleEvent("install").done();
  const rows = seen.map((x) => ({
    path: new URL(typeof x.request === "string" ? x.request : x.request.url, `${ORIGIN}/`).pathname,
    cache: x.init.cache,
  }));
  for (const path of ["/", "/index.html", "/version.json"]) {
    const calls = rows.filter((x) => x.path === path);
    assert.ok(calls.length, `${path} should be fetched during install`);
    assert.ok(calls.every((x) => x.cache === "no-store"),
      `${path} is mutable and must never seed a new generation from HTTP cache`);
  }
  const script = rows.find((x) => x.path === "/js/game.js");
  assert.ok(script, "versioned script should be precached");
  assert.equal(script.cache, undefined,
    "versioned assets should still reuse the page's HTTP-cache download");
});

test("a never-settling optional fetch cannot block service-worker installation", async () => {
  const ordinary = installFetch();
  const harness = createHarness({
    immediateTimeoutMs: 4000,
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/assets/icon.png")) return new Promise(() => {});
      return ordinary(request);
    },
  });

  await harness.lifecycleEvent("install").done();
  assert.equal(harness.skipped, 1);
  assert.equal(harness.stores.get("apex26-321").has(`${ORIGIN}/assets/icon.png`), false);
});

test("timed-out optional fetches are aborted before the pool advances", async () => {
  const ordinary = installFetch();
  let aborted = 0;
  const harness = createHarness({
    immediateTimeoutMs: 4000,
    fetchImpl: (request, init = {}) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (!url.pathname.endsWith("/assets/icon.png")) return ordinary(request);
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          aborted++;
          reject(new Error("aborted"));
        }, { once: true });
      });
    },
  });

  await harness.lifecycleEvent("install").done();
  assert.equal(aborted, 1);
  assert.equal(harness.skipped, 1);
});

test("install icons have declared PNG dimensions and are seeded for offline use", async () => {
  const root = new URL("..", new URL("..", import.meta.url));
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const required = [
    { src: "icons/icon-192.png", width: 192, purpose: null },
    { src: "icons/icon-512.png", width: 512, purpose: null },
    { src: "icons/icon-maskable-512.png", width: 512, purpose: "maskable" },
  ];

  for (const expected of required) {
    const icon = manifest.icons.find((entry) => entry.src === expected.src);
    assert.ok(icon, `${expected.src} is missing from manifest.json`);
    assert.equal(icon.sizes, `${expected.width}x${expected.width}`);
    if (expected.purpose) assert.match(icon.purpose || "", new RegExp(`(^|\\s)${expected.purpose}(\\s|$)`));
    const png = await readFile(new URL(expected.src, root));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), expected.width);
    assert.equal(png.readUInt32BE(20), expected.width);
    assert.match(SW_SOURCE, new RegExp(`["]${expected.src.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["]`));
  }
});

test("cache-first responses remain pending until their runtime cache write completes", async () => {
  const heldPut = deferred();
  const harness = createHarness({
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return new Response("fresh", { status: 200 });
    },
    putImpl: async (_name, request) => {
      if (requestKey(request).endsWith("/assets/sfx.ogg")) await heldPut.promise;
    },
  });
  const request = new Request(`${ORIGIN}/assets/sfx.ogg`);

  const event = harness.fetchEvent(request);
  const state = await Promise.race([
    event.responsePromise.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);
  assert.equal(state, "pending");

  heldPut.resolve();
  const response = await event.responsePromise;
  assert.equal(await response.text(), "fresh");
});

test("successful navigation remains attached to waitUntil through its cache write", async () => {
  const heldPut = deferred();
  const harness = createHarness({
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response("online shell", { status: 200 }));
    },
    putImpl: async (_name, request) => {
      if (requestKey(request) === `${ORIGIN}/race`) await heldPut.promise;
    },
  });
  harness.stores.set(
    "apex26-320",
    new Map([[`${ORIGIN}/index.html`, new Response("offline shell", { status: 200 })]]),
  );

  const event = harness.fetchEvent({
    method: "GET",
    mode: "navigate",
    url: `${ORIGIN}/race`,
  });
  assert.equal(event.lifetimes.length, 1);

  const beforePut = await Promise.race([
    Promise.all(event.lifetimes).then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);
  assert.equal(beforePut, "pending");

  heldPut.resolve();
  const response = await event.responsePromise;
  assert.equal(await response.text(), "online shell");
  await Promise.all(event.lifetimes);
  assert.equal(
    await (await harness.stores.get("apex26-321").get(`${ORIGIN}/race`)).text(),
    "online shell",
  );
});

test("navigation and version 5xx responses fall back to healthy cached entries", async () => {
  const harness = createHarness({
    fetchImpl: async () => new Response("server error", { status: 502 }),
  });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/index.html`, new Response("offline shell", { status: 200 })],
    [`${ORIGIN}/version.json`, new Response('{"build":320}', { status: 200 })],
  ]));

  const nav = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  assert.equal(await (await nav.responsePromise).text(), "offline shell");

  const version = harness.fetchEvent(new Request(`${ORIGIN}/version.json?_=${Date.now()}`));
  assert.equal(await (await version.responsePromise).json().then((v) => v.build), 320);
});

test("an online version.json fetch reject does not serve a stale precache", async () => {
  const harness = createHarness({
    navigator: { onLine: true },
    fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/version.json`, new Response('{"build":320}', { status: 200 })],
  ]));

  const version = harness.fetchEvent(new Request(`${ORIGIN}/version.json?_=${Date.now()}`));
  assert.equal((await version.responsePromise).status, 0);
});

test("an online navigate timeout does not serve a stale cached shell", async () => {
  const harness = createHarness({
    immediateTimeoutMs: 3000,
    navigator: { onLine: true },
    fetchImpl: () => new Promise(() => {}),
  });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/index.html`, new Response("stale shell", { status: 200 })],
  ]));

  const nav = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  assert.equal((await nav.responsePromise).status, 0);
});

test("an online cache-first miss timeout does not hang", async () => {
  const harness = createHarness({
    immediateTimeoutMs: 4000,
    navigator: { onLine: true },
    fetchImpl: () => new Promise(() => {}),
  });
  const ev = harness.fetchEvent({
    method: "GET",
    mode: "same-origin",
    url: `${ORIGIN}/js/game.js?v=1`,
  });
  assert.equal((await ev.responsePromise).status, 0);
});

test("a cache-bust navigation never falls back to the generic cached shell", async () => {
  const harness = createHarness({ fetchImpl: async () => new Response("server error", { status: 500 }) });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/index.html`, new Response("stale shell", { status: 200 })],
  ]));

  const bust = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=321` });
  assert.equal((await bust.responsePromise).status, 0);
});

test("install rejects a missing or invalid build instead of creating apex26-0", async () => {
  for (const body of ["{}", '{"build":0}', "not json"]) {
    const harness = createHarness({
      fetchImpl: async (request) => {
        const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
        if (url.pathname.endsWith("/version.json")) return new Response(body, { status: 200 });
        if (url.pathname.endsWith("/index.html")) return new Response("<script src=\"js/game.js?v=1\"></script>", { status: 200 });
        return new Response("asset", { status: 200 });
      },
    });
    await assert.rejects(harness.lifecycleEvent("install").done());
    assert.equal(harness.stores.has("apex26-0"), false);
    assert.equal(harness.skipped, 0);
  }
});

test("activation preserves prior caches unless the current generation is complete", async () => {
  const harness = createHarness({ fetchImpl: installFetch() });
  harness.stores.set("apex26-320", new Map([["healthy", new Response("old")]]));
  harness.stores.set("apex26-321", new Map());

  await harness.lifecycleEvent("activate").done();

  assert.deepEqual(harness.deleted, []);
  assert.equal(harness.stores.has("apex26-320"), true);
  assert.equal(harness.claimed, 0);
});

test("activation removes prior caches after a complete successful install", async () => {
  const harness = createHarness({ fetchImpl: installFetch({ failOptional: true }) });
  harness.stores.set("apex26-320", new Map([["healthy", new Response("old")]]));

  await harness.lifecycleEvent("install").done();
  await harness.lifecycleEvent("activate").done();

  assert.deepEqual(harness.deleted, ["apex26-320"]);
  assert.equal(harness.stores.has("apex26-321"), true);
  assert.equal(harness.claimed, 1);
});

test("a deploy-window cache-name failure must not discard a good response", async () => {
  // currentCacheName() reads version.json; during a Pages deploy window (or
  // behind a captive portal) that read rejects while the actual asset fetch
  // succeeded. The old shape awaited the cache write inside the same try as
  // the response return, so one flaky version.json hard-failed every uncached
  // GET and navigation with a 200 in hand.
  const harness = createHarness({
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) throw new Error("deploy window");
      return new Response("fresh", { status: 200 });
    },
    navigator: { onLine: true },
  });

  const asset = await harness.fetchEvent(new Request(`${ORIGIN}/assets/sfx.ogg`)).responsePromise;
  assert.equal(await asset.text(), "fresh", "cache-first GET must return the good response");

  const nav = await harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` }).responsePromise;
  assert.equal(await nav.text(), "fresh", "navigation must return the good response");
});

test("a quota-refused cache write must not discard a good response", async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return new Response("fresh", { status: 200 });
    },
    putImpl: async () => { throw new Error("QuotaExceededError"); },
    navigator: { onLine: true },
  });
  const asset = await harness.fetchEvent(new Request(`${ORIGIN}/assets/sfx.ogg`)).responsePromise;
  assert.equal(await asset.text(), "fresh");
});
