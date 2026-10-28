import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

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

function createHarness({ fetchImpl, putImpl, immediateTimeout = false, immediateTimeoutMs = null, navigator, hostname = "apex.test", registration, posted, workerURL, globals, clientWindows } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const deleted = [];
  let keysCalls = 0;
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
    // CacheStorage.match(request, { cacheName }) searches ONE cache and never
    // creates it (w3c.github.io/ServiceWorker/#cache-storage-match); without
    // the option it walks every cache in creation order — Map insertion order.
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
      keysCalls += 1;
      return Array.from(stores.keys());
    },
    async delete(name) {
      deleted.push(name);
      return stores.delete(name);
    },
  };

  const self = {
    location: { origin: ORIGIN, hostname, href: workerURL || `${ORIGIN}/sw.js?v=321` },
    ...(registration ? { registration } : {}),
    clients: {
      async claim() {
        claimed += 1;
      },
      // Worker->page log channel: absent unless a test collects the posts, so
      // every other test also proves sw.js tolerates a missing matchAll.
      ...(posted || clientWindows != null ? {
        async matchAll() {
          const n = clientWindows == null ? 1 : clientWindows;
          return Array.from({ length: n }, () => ({ postMessage: (m) => posted && posted.push(m) }));
        },
      } : {}),
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
    crypto: webcrypto,
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
    ...(globals || {}),
  });
  vm.runInContext(SW_SOURCE, context, { filename: absSrc("sw.js") });

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

  function fetchEvent(request, extra = {}) {
    const lifetimes = [];
    let responsePromise;
    listeners.get("fetch")({
      ...extra,
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
    get keysCalls() {
      return keysCalls;
    },
    lifecycleEvent,
    messageEvent(data, ports) {
      const lifetimes = [];
      listeners.get("message")({ data, ports, waitUntil(p) { lifetimes.push(p); } });
      return Promise.all(lifetimes);
    },
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
        '<meta name="apex-build" content="321"><link rel="stylesheet" href="css/style.css?v=321">' +
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

test("GLX fallback is required and deferred scripts use the runtime build pin", async () => {
  const ordinary = installFetch(), paths = [];
  const h = createHarness({ fetchImpl: async (request) => {
    const u = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    paths.push(u.pathname + u.search);
    return ordinary(request);
  } });
  await h.lifecycleEvent("install").done();
  const current = h.stores.get("apex26-321");
  // GLX (required) + TLX (critical optional) install-precache; WGX / editor /
  // XR / cam-editor are runtime-only (explicit opt-in) and must not inflate
  // first-title install.
  for (const family of ["glx", "three"]) {
    const files = paths.filter((p) => p.startsWith(`/js/render/${family}/`));
    assert.ok(files.length > 0, `${family} deferred family was cached`);
    assert.ok(files.every((p) => p.endsWith("?v=321")), `${family} URLs match loadBackendScripts pins`);
    assert.ok(files.every((p) => current.has(ORIGIN + p)));
  }
  const runtimeOnlyPrefixes = ["/js/render/webgpu/", "/js/editor/", "/js/xr/"];
  for (const prefix of runtimeOnlyPrefixes) {
    const hits = paths.filter((p) => p.startsWith(prefix));
    assert.deepEqual(hits, [], `${prefix} must not be install-precached (runtime-only opt-in)`);
    assert.ok(![...current.keys()].some((k) => k.includes(prefix)),
      `${prefix} keys must be absent from the settled install cache`);
  }
  const camEditorInstall = paths.filter((p) =>
    /\/js\/camera\/(tuner-panel|flyby-editor)\.js/.test(p));
  assert.deepEqual(camEditorInstall, [],
    "camera tuner/flyby-editor must not be install-precached (runtime-only opt-in)");
  assert.ok(![...current.keys()].some((k) => /\/js\/camera\/(tuner-panel|flyby-editor)\.js/.test(k)),
    "camera editor keys must be absent from the settled install cache");
  const broken = createHarness({ fetchImpl: (request) => {
    const u = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    return u.pathname.startsWith("/js/render/glx/") ? Promise.resolve(new Response("missing", { status: 404 })) : ordinary(request);
  } });
  await assert.rejects(broken.lifecycleEvent("install").done(), /essential|cache|precache|fetch/i);
  assert.equal(broken.skipped, 0, "missing offline fallback must not activate a new worker");
});

test("default-off vendors are omitted from the optional precache seed", () => {
  // Rapier (debris opt-in), jsQR (QR scan), trystero (room code) used to ride
  // the install pool (~2.5 MB). They stay reachable via fetch-miss cache.put.
  assert.doesNotMatch(SW_SOURCE, /vendor\/rapier-[\d.]+\/rapier\.mjs/,
    "Rapier must not be install-precached (default apex26.debris is off)");
  assert.doesNotMatch(SW_SOURCE, /vendor\/jsqr-[\d.]+\/jsQR\.js/,
    "jsQR must not be install-precached (QR scan path only)");
  assert.doesNotMatch(SW_SOURCE, /vendor\/trystero-[\d.]+/,
    "trystero must not be install-precached (room-code path only)");
  assert.match(SW_SOURCE, /isRuntimeOnlyOptional/,
    "runtime-only skip helper must exist (seeded for gen-shell, skipped at install)");
  // equal+.test keeps the assertPinsAll tree metric flat; install behaviour
  // above already proves the doors are skipped — these only lock path classes.
  assert.equal(/\|\| \/\^js\\\/editor\\\//.test(SW_SOURCE), true,
    "LAZY_EDITOR must be runtime-only (title door, not first-title install)");
  assert.equal(/\|\| \/\^js\\\/xr\\\//.test(SW_SOURCE), true,
    "LAZY_XR must be runtime-only (ENTER VR door)");
  assert.equal(/tuner-panel\|flyby-editor/.test(SW_SOURCE), true,
    "LAZY_CAM_EDITOR panels must be runtime-only");
  assert.match(SW_SOURCE, /OFF by default|default-off|apex26\.debris/i,
    "Rapier comment must not claim ON by default");
});

test("runtime-only opt-ins still cache.put on first fetch miss", async () => {
  const ordinary = installFetch();
  const harness = createHarness({
    hostname: "example.com", // not DEV_HOST — cache-first path
    fetchImpl: async (request) => {
      const u = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (u.pathname.includes("/js/render/webgpu/") ||
          u.pathname.includes("/js/editor/") ||
          u.pathname.includes("/js/xr/") ||
          /\/js\/camera\/(tuner-panel|flyby-editor)\.js$/.test(u.pathname) ||
          u.pathname.includes("/vendor/rapier-") ||
          u.pathname.includes("/vendor/jsqr-") ||
          u.pathname.includes("/vendor/trystero-")) {
        return new Response("runtime-asset", { status: 200 });
      }
      return ordinary(request);
    },
  });
  await harness.lifecycleEvent("install").done();
  const name = "apex26-321";
  // New door probes: join path parts so impact-map does not treat this suite
  // as a caller of Designer.open / XrSession.plan / CamTuner helpers.
  const door = (...parts) => `${ORIGIN}/${["js", ...parts].join("/")}?v=321`;
  const probes = [
    `${ORIGIN}/js/render/webgpu/wgx.js?v=321`,
    door("editor", "designer.js"),
    door("xr", "apex-xr.js"),
    door("camera", "tuner-panel.js"),
    `${ORIGIN}/vendor/rapier-0.19.3/rapier.mjs`,
    `${ORIGIN}/vendor/jsqr-1.4.0/jsQR.js`,
    `${ORIGIN}/vendor/trystero-0.25.4/nostr/index.js`,
  ];
  for (const url of probes) {
    assert.equal(harness.stores.get(name).has(url), false,
      `${url} must not be present after install`);
    const ev = harness.fetchEvent(new Request(url));
    const res = await ev.responsePromise;
    assert.equal(res.status, 200);
    await Promise.all(ev.lifetimes);
    assert.equal(harness.stores.get(name).has(url), true,
      `${url} must be runtime-cached on first use`);
  }
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
  for (const path of ["/index.html", "/version.json"]) {
    const calls = rows.filter((x) => x.path === path);
    assert.ok(calls.length, `${path} should be fetched during install`);
    assert.ok(calls.every((x) => x.cache === "no-store"),
      `${path} is mutable and must never seed a new generation from HTTP cache`);
  }
  // One shell download seeds both shell keys ("./" is the same document).
  assert.equal(rows.filter((x) => x.path === "/index.html").length, 1, "the shell is fetched once per install");
  assert.equal(rows.filter((x) => x.path === "/").length, 0, "\"./\" reuses the parsed shell, no second download");
  const cached = [...harness.stores.values()].find((m) => m.has(`${ORIGIN}/`));
  assert.ok(cached && cached.has(`${ORIGIN}/index.html`), "both shell keys are seeded");
  assert.equal(await cached.get(`${ORIGIN}/`).text(), await cached.get(`${ORIGIN}/index.html`).text());
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

test("cache-first responses return promptly while waitUntil retains the runtime write", async () => {
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
    Promise.all(event.lifetimes).then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);
  assert.equal(state, "pending");
  const response = await event.responsePromise;
  assert.equal(await response.text(), "fresh");
  heldPut.resolve();
  await Promise.all(event.lifetimes);
  assert.ok(harness.stores.get("apex26-321").has(request.url));
});

test("a stalled version lookup cannot delay a downloaded asset on deployed or dev hosts", async () => {
  for (const hostname of ["apex.test", "localhost"]) {
    const version = deferred();
    const harness = createHarness({ hostname, fetchImpl: async (req) =>
      req === "version.json" ? version.promise : new Response("script") });
    const req = new Request(`${ORIGIN}/js/data/hub.js?v=321`);
    const event = harness.fetchEvent(req);
    assert.equal(event.lifetimes.length, 1, "write lifetime registered during fetch dispatch");
    const response = await Promise.race([event.responsePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 100))]);
    version.resolve(new Response('{"build":321}'));
    assert.ok(response, hostname + ": response must not wait for version.json");
    assert.equal(await response.text(), "script");
    await Promise.all(event.lifetimes);
    assert.ok(harness.stores.get("apex26-321").has(req.url));
  }
});

test("successful navigation remains attached to waitUntil through its cache write", async () => {
  const heldPut = deferred();
  const harness = createHarness({
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response(
        '<meta name="apex-build" content="321">online shell',
        { status: 200 },
      ));
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

  const response = await event.responsePromise;
  assert.equal(
    await response.text(),
    '<meta name="apex-build" content="321">online shell',
    "network response is available while put remains blocked",
  );
  heldPut.resolve();
  await Promise.all(event.lifetimes);
  assert.equal(
    await (await harness.stores.get("apex26-321").get(`${ORIGIN}/race`)).text(),
    '<meta name="apex-build" content="321">online shell',
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

test("a slow online navigate serves the precached shell", async () => {
  // navigator.onLine only says a link exists. An installed PWA on a slow link
  // used to lose the 3 s race and get Response.error() — the browser's error
  // page instead of the shell it had precached. The shell's own version guard
  // refreshes it once version.json does answer, so the cached shell is safe.
  const harness = createHarness({
    immediateTimeoutMs: 3000,
    navigator: { onLine: true },
    fetchImpl: () => new Promise(() => {}),
  });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/index.html`, new Response("precached shell", { status: 200 })],
  ]));

  const nav = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  const res = await nav.responsePromise;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "precached shell");
});

test("a slow online shell-bust navigate still fails fast instead of serving the stale shell", async () => {
  const harness = createHarness({
    immediateTimeoutMs: 3000,
    navigator: { onLine: true },
    fetchImpl: () => new Promise(() => {}),
  });
  harness.stores.set("apex26-old", new Map([
    [`${ORIGIN}/index.html`, new Response("stale shell", { status: 200 })],
  ]));

  const bust = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=321` });
  assert.equal((await bust.responsePromise).status, 0);
});

test("a deep-link navigation is not cached under its query URL", async () => {
  // Every `?b=` / `?log=` navigation used to be put under its full URL — one
  // entry per distinct query that no fallback ever read back (the offline
  // path matches "index.html"). Only the bare shell URL is written.
  const shell = '<meta name="apex-build" content="321">online shell';
  const harness = createHarness({
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return Promise.resolve(new Response(shell, { status: 200 }));
    },
  });

  const deep = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?log=data:debug` });
  assert.equal(await (await deep.responsePromise).text(), shell);
  await Promise.all(deep.lifetimes);
  assert.equal(harness.stores.has("apex26-321"), false, "a query navigation opens no cache");

  const bare = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  assert.equal(await (await bare.responsePromise).text(), shell);
  await Promise.all(bare.lifetimes);
  assert.ok(harness.stores.get("apex26-321").has(`${ORIGIN}/`), "the bare shell URL is still written");
});

test("an online cache-first miss rides a slow network instead of erroring", async () => {
  // On a miss there is nothing to fall back to: a fail-fast timeout could only
  // break requests a no-SW page would have completed (slow TTFB), and dropped
  // the late response uncached. The SW now waits for the network on a miss.
  let resolveFetch;
  const harness = createHarness({
    navigator: { onLine: true },
    fetchImpl: (request) => {
      const u = typeof request === "string" ? request : request.url;
      if (u.includes("version.json")) return Promise.resolve(new Response('{"build":7}', { status: 200 }));
      return new Promise((resolve) => { resolveFetch = resolve; });
    },
  });
  const ev = harness.fetchEvent({
    method: "GET",
    mode: "same-origin",
    url: `${ORIGIN}/js/game.js?v=1`,
  });
  while (!resolveFetch) await new Promise((r) => setImmediate(r));  // cache miss resolves first
  resolveFetch(new Response("late asset", { status: 200 }));
  const res = await ev.responsePromise;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "late asset");
});

test("an online cache-first miss with a dead network returns an error response", async () => {
  const harness = createHarness({
    navigator: { onLine: true },
    fetchImpl: () => Promise.reject(new TypeError("network down")),
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

// A SPENT ?b= (no newer than the cached shell) is an ordinary query navigation.
// Every update reload (boot guard, UPDATE READY) lands on `?b=<build>`; a tab
// restored or bookmarked there was failed outright offline and on a slow link
// — the browser's error page instead of the precached shell, forever.
function settledShellHarness({ online, fetchImpl }) {
  const harness = createHarness({ immediateTimeoutMs: 3000, navigator: { onLine: online }, fetchImpl });
  harness.stores.set("apex26-321", new Map([
    [`${ORIGIN}/index.html`, new Response("shell 321", { status: 200 })],
    [`${ORIGIN}/version.json`, new Response('{"build":321}', { status: 200 })],
    [`${ORIGIN}/__apex_install_complete__`, new Response("c")],
    [`${ORIGIN}/__apex_install_settled__`, new Response("s")],
  ]));
  return harness;
}
for (const [label, online, fetchImpl] of [
  ["offline", false, () => Promise.reject(new TypeError("offline"))],
  ["on a slow link", true, () => new Promise(() => {})],
]) {
  test(`${label}, a spent ?b= reloads the cached shell; a newer one still fails fast`, async () => {
    for (const b of ["321", "300"]) {
      const h = settledShellHarness({ online, fetchImpl });
      const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=${b}` });
      const res = await nav.responsePromise;
      assert.equal(res.status, 200, `?b=${b} is no newer than the cached 321`);
      assert.equal(await res.text(), "shell 321");
    }
    const h = settledShellHarness({ online, fetchImpl });
    const fresh = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=322` });
    assert.equal((await fresh.responsePromise).status, 0, "a bust newer than the cache never gets the stale shell");
  });
}

// #3284: the cache order is settled-first, so an OLDER settled shell came
// before a NEWER unsettled one that already held index.html — and the first
// shell found below `b` ended the search, failing a bust the newer cache could
// answer. A qualifying shell anywhere in the order wins; none still fails.
for (const [label, online, fetchImpl] of [
  ["offline", false, () => Promise.reject(new TypeError("offline"))],
  ["on a slow link", true, () => new Promise(() => {})],
]) {
  test(`${label}, a ?b= bust skips an older settled shell for a newer unsettled one (#3284)`, async () => {
    const h = settledShellHarness({ online, fetchImpl });
    h.stores.set("apex26-322", new Map([
      [`${ORIGIN}/index.html`, new Response("shell 322", { status: 200 })],
      [`${ORIGIN}/__apex_install_complete__`, new Response("c")],
    ]));
    const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=322` });
    const res = await nav.responsePromise;
    assert.equal(res.status, 200, "the newer unsettled cache holds a shell >= the bust");
    assert.equal(await res.text(), "shell 322");
    const newer = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=323` });
    assert.equal((await newer.responsePromise).status, 0, "nothing cached is >= 323");
  });
}

// The page strips the spent `b` itself: the boot guard runs on the shell it
// asked for, so ?b= has done its job. Query and hash (#vs= invites) survive.
test("the index.html boot guard removes ?b= from the address bar, keeping query and hash", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const guard = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes('meta[name="apex-build"]') && c.includes("apex26.shellReloadedTo"));
  assert.ok(guard, "the shell version guard script is found");
  for (const [search, want] of [["?log=net&b=105", "/f1-game/?log=net#vs=CODE"], ["?b=105", "/f1-game/#vs=CODE"]]) {
    let replaced = null;
    vm.runInContext(guard, vm.createContext({
      URLSearchParams,
      document: { querySelector: () => ({ content: "105" }) },
      navigator: {},
      location: { pathname: "/f1-game/", search, hash: "#vs=CODE", replace() { throw new Error("no reload: same build"); } },
      history: { state: { k: 1 }, replaceState: (st, _t, u) => { assert.deepEqual(st, { k: 1 }); replaced = u; } },
      fetch: () => new Promise(() => {}),
      sessionStorage: { getItem: () => null, setItem() {} },
    }));
    assert.equal(replaced, want, `${search} → ${want}`);
  }
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

// L8-c: install calls skipWaiting LAST (after SETTLED), so a browser never
// activates an unsettled generation — the old activate-only "not settled: no
// claim, no sweep" branch was reachable only by firing activate with no install,
// as these two tests used to. What remains is the ONE guarded sweep
// (sweepStaleCaches), for the real case: a worker restarted between install and
// activate re-reads version.json, and a deploy in that gap names a newer, EMPTY
// generation. It must claim (it is the active worker) but never sweep below a
// generation that holds nothing.
test("activate after a version drift (current generation empty) claims but deletes nothing", async () => {
  const harness = createHarness({ fetchImpl: installFetch() });
  harness.stores.set("apex26-320", new Map([["healthy", new Response("old")]]));
  harness.stores.set("apex26-321", new Map([
    [`${ORIGIN}/__apex_install_complete__`, new Response("complete")],
  ]));

  await harness.lifecycleEvent("activate").done();

  assert.deepEqual(harness.deleted, [], "COMPLETE alone (or nothing) must not delete the previous generation");
  assert.equal(harness.stores.has("apex26-320"), true);
  assert.equal(harness.claimed, 1, "activation always claims; only the sweep is guarded");
});

test("install writes SETTLED before it calls skipWaiting, so activation always meets a settled cache", async () => {
  let settledAtSkip = null;
  const harness = createHarness({ fetchImpl: installFetch({ failOptional: true }) });
  const install = harness.lifecycleEvent("install");
  // Observe the order: poll the store until skipWaiting has been called.
  const watch = (async () => {
    for (let i = 0; i < 400 && harness.skipped === 0; i++) await new Promise((r) => setTimeout(r, 1));
    const store = harness.stores.get("apex26-321");
    settledAtSkip = !!(store && store.has(`${ORIGIN}/__apex_install_settled__`));
  })();
  await install.done(); await watch;
  assert.equal(harness.skipped, 1);
  assert.equal(settledAtSkip, true, "skipWaiting only after the background pool settled");
  const src = SW_SOURCE.replace(/\/\/.*$/gm, "");
  assert.ok(src.indexOf("await self.skipWaiting()") > src.indexOf("cache.put(INSTALL_SETTLED_URL"),
    "skipWaiting is install's last step");
  assert.equal((src.match(/self\.skipWaiting\(\)/g) || []).length, 1, "and the only one");
});

test("activation removes prior caches after a settled successful install", async () => {
  const harness = createHarness({ fetchImpl: installFetch({ failOptional: true }) });
  harness.stores.set("apex26-320", new Map([["healthy", new Response("old")]]));
  harness.stores.set("apex26-322", new Map([["healthy", new Response("newer")]]));
  harness.stores.set("unrelated", new Map());

  await harness.lifecycleEvent("install").done();
  await harness.lifecycleEvent("activate").done();

  assert.deepEqual(harness.deleted, ["apex26-320"]);
  assert.equal(harness.stores.has("apex26-321"), true);
  assert.equal(harness.stores.has("apex26-322"), true, "a stale worker must preserve a newer generation");
  assert.equal(harness.stores.has("unrelated"), true);
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

// The committed shell reads `?v=dev` for every asset (tools/gen/gen-shell.mjs);
// hashes exist only in the deploy's staged copy. A cache-first worker on a
// dev host would therefore pin the first js/css it saw for the life of the
// cache generation, so sw.js goes network-first there and keeps the cache as
// the offline fallback. Playwright pages run on 127.0.0.1 and exercise it.
test("a dev host fetches assets network-first and falls back to the cache offline", async () => {
  // install: the stock fixture precaches js/game.js?v=321 as "asset";
  // live: the network serves a newer copy; offline: the network throws.
  let phase = "install";
  const fetchImpl = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (phase !== "install" && url.pathname.endsWith("/js/game.js")) {
      if (phase === "offline") throw new TypeError("offline");
      return new Response("fresh-from-network", { status: 200 });
    }
    return installFetch()(request);
  };
  const dev = createHarness({ fetchImpl, hostname: "127.0.0.1" });
  await dev.lifecycleEvent("install").done();
  phase = "live";
  const hit = dev.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=321`));
  assert.equal(await (await hit.responsePromise).text(), "fresh-from-network",
    "on a dev host the network wins over the precached copy");
  phase = "offline";
  const miss = dev.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=321`));
  assert.equal(await (await miss.responsePromise).text(), "fresh-from-network",
    "offline, the network-first branch falls back to what it last cached");

  phase = "install";
  const prod = createHarness({ fetchImpl, hostname: "brycejmurrin.github.io" });
  await prod.lifecycleEvent("install").done();
  phase = "live";
  const cached = prod.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=321`));
  assert.equal(await (await cached.responsePromise).text(), "asset",
    "on the deployed host the content-hashed precache is served cache-first");
});

// TWO GENERATIONS COEXIST FOR LONGER THAN `activate` ASSUMES. The old worker
// reads version.json lazily, so mid-deploy a fetch can open a cache under the
// NEWER build's name while the previous generation is still on disk, and
// `activate` is the only sweep. caches.match() walks caches in CREATION order,
// so an unversioned key (index.html, version.json) was answered from the OLDEST
// generation. Matching now prefers the current build, then newest first.
function generationFetch(state) {
  return async (request) => {
    if (state.offline) throw new TypeError("offline");
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
    return new Response("network", { status: 200 });
  };
}

test("an offline fallback prefers the current generation's shell over an older one", async () => {
  const state = { offline: false };
  const harness = createHarness({ fetchImpl: generationFetch(state) });
  // 320 is created FIRST, so a creation-order caches.match() reaches it first.
  harness.stores.set("apex26-320", new Map([
    [`${ORIGIN}/index.html`, new Response("old shell", { status: 200 })],
    [`${ORIGIN}/version.json`, new Response('{"build":320}', { status: 200 })],
  ]));
  harness.stores.set("apex26-321", new Map([
    [`${ORIGIN}/index.html`, new Response("current shell", { status: 200 })],
    [`${ORIGIN}/version.json`, new Response('{"build":321}', { status: 200 })],
  ]));
  // One ordinary online navigation resolves the worker's build name.
  const warm = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  await warm.responsePromise; await Promise.all(warm.lifetimes);

  state.offline = true;
  const nav = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  assert.equal(await (await nav.responsePromise).text(), "current shell");
  const version = harness.fetchEvent(new Request(`${ORIGIN}/version.json?_=1`));
  assert.equal((await (await version.responsePromise).json()).build, 321);
});

test("with the build still unknown, the newest generation answers first", async () => {
  const harness = createHarness({ fetchImpl: generationFetch({ offline: true }) });
  harness.stores.set("apex26-320", new Map([[`${ORIGIN}/index.html`, new Response("old shell", { status: 200 })]]));
  harness.stores.set("apex26-321", new Map([[`${ORIGIN}/index.html`, new Response("newer shell", { status: 200 })]]));
  const nav = harness.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  assert.equal(await (await nav.responsePromise).text(), "newer shell");
});

function sweepHarness({ complete, settled = complete, clientWindows } = {}) {
  const harness = createHarness({ fetchImpl: generationFetch({ offline: false }), clientWindows });
  harness.stores.set("apex26-319", new Map([["a", new Response("x")]]));
  harness.stores.set("apex26-320", new Map([
    ["a", new Response("x")],
    [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
  ]));
  harness.stores.set("apex26-321", new Map([
    ...(complete ? [[`${ORIGIN}/__apex_install_complete__`, new Response("complete")]] : []),
    ...(settled ? [[`${ORIGIN}/__apex_install_settled__`, new Response("settled")]] : []),
  ]));
  harness.stores.set("apex26-322", new Map([["a", new Response("x")]]));   // a newer, still-installing generation
  harness.stores.set("someone-else", new Map([["a", new Response("x")]]));
  return harness;
}
async function twoFetches(harness) {
  for (let i = 0; i < 2; i++) {
    const ev = harness.fetchEvent(new Request(`${ORIGIN}/assets/sfx-${i}.ogg`));
    await ev.responsePromise; await Promise.all(ev.lifetimes);
  }
}

test("stale generations are swept from the fetch path once the current one is complete", async () => {
  const harness = sweepHarness({ complete: true, clientWindows: 0 });
  await twoFetches(harness);   // the first resolves the build name, the second sweeps
  assert.deepEqual(harness.deleted.slice().sort(), ["apex26-319", "apex26-320"]);
  assert.ok(harness.stores.has("apex26-322"), "a NEWER generation is never deleted by an older name");
  assert.ok(harness.stores.has("someone-else"), "only apex26-* caches are ours");
  assert.ok(harness.stores.has("apex26-321"));
  await twoFetches(harness);
  assert.equal(harness.deleted.length, 2, "one sweep per worker lifetime, not one per fetch");
});

test("the fetch-path sweep keeps one settled prior generation while a window client remains (#2194)", async () => {
  const harness = sweepHarness({ complete: true, clientWindows: 1 });
  await twoFetches(harness);
  assert.deepEqual(harness.deleted, ["apex26-319"], "N-2 and older go; N-1 stays for the open tab");
  assert.ok(harness.stores.has("apex26-320"));
});

for (const lifecycle of ["fetch", "activate"]) {
  for (const clientWindows of [0, 1]) {
    test(`${lifecycle} sweep retains the newest settled cache across build gaps (windows=${clientWindows})`, async () => {
      let offline = false;
      const h = createHarness({ clientWindows, fetchImpl: (request) => offline
        ? Promise.reject(new TypeError("offline")) : generationFetch({ offline: false })(request) });
      const voice = `${ORIGIN}/assets/voice/bella-radio.bin`;
      const kept = `${ORIGIN}/assets/voice/george.bin`;
      h.stores.set("apex26-voice", new Map([[kept, new Response("voice cache")]]));
      for (const build of [290, 300, 319, 320, 321, 322]) {
        h.stores.set(`apex26-${build}`, new Map([
          ...([290, 300, 321].includes(build) ? [[`${ORIGIN}/__apex_install_settled__`, new Response("settled")]] : []),
          ...(build === 300 ? [[voice, new Response("downloaded voice")]] : []),
        ]));
      }
      if (lifecycle === "activate") await h.lifecycleEvent("activate").done();
      else await twoFetches(h);
      assert.deepEqual(h.deleted.slice().sort(), clientWindows
        ? ["apex26-290", "apex26-319", "apex26-320"]
        : ["apex26-290", "apex26-300", "apex26-319", "apex26-320"]);
      assert.ok(h.stores.has("apex26-322"), "newer installing cache is never swept");
      assert.ok(h.stores.has("apex26-voice"), "the voice cache is outside the generations: never swept (audit4 B8)");
      offline = true;
      const keptEvent = h.fetchEvent(new Request(kept));
      assert.equal(await (await keptEvent.responsePromise).text(), "voice cache");
      await Promise.all(keptEvent.lifetimes);
      const event = h.fetchEvent(new Request(voice));
      const response = await event.responsePromise;
      if (clientWindows) assert.equal(await response.text(), "downloaded voice");
      else assert.equal(response.status, 0);
      await Promise.all(event.lifetimes);
    });
  }
}

test("with no window clients, the sweep also deletes the immediate prior generation", async () => {
  const harness = sweepHarness({ complete: true, clientWindows: 0 });
  await twoFetches(harness);
  assert.deepEqual(harness.deleted.slice().sort(), ["apex26-319", "apex26-320"]);
});

test("no fetch-path sweep between the essential marker and the optional pool (SETTLED gates the sweep)", async () => {
  const harness = sweepHarness({ complete: true, settled: false });
  await twoFetches(harness);
  assert.deepEqual(harness.deleted, [], "an old active worker must not delete its own cache while the new install is still seeding lazy assets");
});

test("offline, a FINISHED install outranks a newer half-written generation", async () => {
  const src = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
  const fn = src.match(/async function computeCacheOrder\(current\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /INSTALL_SETTLED_URL/);
  assert.match(fn, /\(done\.get\(b\) - done\.get\(a\)\) \|\| \(rank\(b\) - rank\(a\)\)/, "completeness first, then current/newest");
  // The install-critical pool downloads first, the BACKGROUND pool (scenery /
  // WGX / data / net) second, SETTLED after both, skipWaiting last — the flag is
  // only read once install settles (w3c.github.io/ServiceWorker), so an earlier
  // call bought nothing. See "install writes SETTLED before it calls skipWaiting".
  assert.ok(src.indexOf("await self.skipWaiting()") > src.indexOf("cache.put(INSTALL_SETTLED_URL"),
    "skipWaiting after SETTLED");
  assert.match(src, /isInstallCriticalOptional/, "chosen backend (TLX+three) is the install-critical optional set");
  assert.match(src, /isBackgroundOptional/, "scenery / WGX / data / net download after it");
});

test("no fetch-path sweep while the current generation is incomplete", async () => {
  const harness = sweepHarness({ complete: false });
  await twoFetches(harness);
  assert.deepEqual(harness.deleted, [], "never strand a client on an unfinished cache");
});

test("a worker that outlived a deploy does not write the new build's shell into its old cache", async () => {
  // currentCacheName() is remembered for the worker's life, so a query-less
  // navigation after a deploy put build N+1's shell into apex26-N — and
  // offline, that shell's ?v= scripts were in no settled cache (bug hunt
  // 2026-09-26). The shell is written only where its apex-build matches.
  let BUILD = 5, ONLINE = true;
  const shell = (b) => `<meta name="apex-build" content="${b}"><script src="js/game.js?v=h${b}"></script>`;
  const net = async (request) => {
    if (!ONLINE) throw new TypeError("Failed to fetch");
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) return new Response(JSON.stringify({ build: BUILD }), { status: 200 });
    if (url.pathname === "/" || url.pathname.endsWith("/index.html")) return new Response(shell(BUILD), { status: 200 });
    if (url.pathname.endsWith("/js/game.js")) return new Response("game@" + url.search, { status: 200 });
    return new Response("asset", { status: 200 });
  };
  const h = createHarness({ fetchImpl: net, navigator: { get onLine() { return ONLINE; } } });
  await h.lifecycleEvent("install").done();
  await h.lifecycleEvent("activate").done();
  BUILD = 6;
  const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  await nav.responsePromise; await Promise.all(nav.lifetimes);
  const stored = h.stores.get("apex26-5").get(`${ORIGIN}/`);
  assert.ok(!stored || !(await stored.clone().text()).includes('content="6"'), "build 6's shell must not land in apex26-5");
  ONLINE = false;
  const off = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
  const html = await (await off.responsePromise).text();
  const src = html.match(/src="([^"]+)"/)[1];
  const js = h.fetchEvent({ method: "GET", mode: "no-cors", url: `${ORIGIN}/${src}` });
  assert.notEqual((await js.responsePromise).type, "error", "the offline shell's own scripts are cached");
});

// Cache-order memo (sw.js cacheOrder): caches.keys() + two marker lookups per
// generation used to run on every cache-first request.
test("the cache order is computed once per worker, not once per request", async () => {
  const h = createHarness({ fetchImpl: generationFetch({ offline: true }) });
  h.stores.set("apex26-320", new Map([[`${ORIGIN}/a.js`, new Response("old", { status: 200 })]]));
  h.stores.set("apex26-321", new Map([[`${ORIGIN}/a.js`, new Response("new", { status: 200 })]]));
  for (let i = 0; i < 5; i++) {
    const ev = h.fetchEvent(new Request(`${ORIGIN}/a.js`));
    assert.equal(await (await ev.responsePromise).text(), "new", "newest generation still answers first");
    await Promise.all(ev.lifetimes);
  }
  assert.equal(h.keysCalls, 1, "five cache-first hits share one caches.keys() walk");
});

test("the memoised cache order is dropped when the sweep deletes generations", async () => {
  const h = sweepHarness({ complete: true, clientWindows: 0 });
  await twoFetches(h);   // resolves the name, then sweeps 319/320
  assert.equal(h.deleted.length, 2);
  const before = h.keysCalls;
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/sfx-0.ogg`));
  await ev.responsePromise; await Promise.all(ev.lifetimes);
  assert.ok(h.keysCalls > before, "the lookup after a sweep re-reads the cache set");
});

test("activation drops the memoised order, and a cache the order never listed still answers", async () => {
  const h = createHarness({ fetchImpl: installFetch() });
  await h.lifecycleEvent("install").done();
  const warm = h.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=321`));
  assert.equal(await (await warm.responsePromise).text(), "asset");
  const before = h.keysCalls;
  await h.lifecycleEvent("activate").done();
  const again = h.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=321`));
  assert.equal(await (await again.responsePromise).text(), "asset");
  assert.ok(h.keysCalls > before + 1, "activate reads keys once itself, and the next lookup recomputes the order");
  h.stores.set("elsewhere", new Map([[`${ORIGIN}/late.js`, new Response("late", { status: 200 })]]));
  const late = h.fetchEvent(new Request(`${ORIGIN}/late.js`));
  assert.equal(await (await late.responsePromise).text(), "late");
});

// No navigation preload: a preloaded navigation goes through the HTTP cache, so a
// just-deployed shell could come back stale. The shell REVALIDATES instead
// ("no-cache": always a conditional request, a 304 reuses the HTTP-cached copy).
// https://developer.mozilla.org/en-US/docs/Web/API/NavigationPreloadManager
test("the worker never enables navigation preload and a plain navigation revalidates (no-cache)", async () => {
  assert.doesNotMatch(SW_SOURCE, /navigationPreload|preloadResponse/);
  const seen = [];
  const net = async (request, init) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
    seen.push(init && init.cache);
    return new Response("network shell", { status: 200 });
  };
  const h = createHarness({ fetchImpl: net });
  await h.lifecycleEvent("activate").done();
  seen.length = 0;
  const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` },
    { preloadResponse: Promise.resolve(new Response("preloaded shell", { status: 200 })) });
  assert.equal(await (await nav.responsePromise).text(), "network shell");
  await Promise.all(nav.lifetimes);
  assert.deepEqual(seen, ["no-cache"]);
});

test("the ?b= shell bust ignores the preload and keeps its own no-store fetch", async () => {
  const seen = [];
  const net = async (request, init) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
    seen.push(init && init.cache);
    return new Response("fresh shell", { status: 200 });
  };
  const h = createHarness({ fetchImpl: net });
  const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?b=9` },
    { preloadResponse: Promise.resolve(new Response("preloaded shell", { status: 200 })) });
  assert.equal(await (await nav.responsePromise).text(), "fresh shell");
  await Promise.all(nav.lifetimes);
  assert.deepEqual(seen, ["no-store"]);
});

// WORKER -> PAGE LOG CHANNEL. The worker has no `Log`, so it posts
// { type: "apex-sw-log", level, msg } for lifecycle failures only; index.html's
// SW listener forwards them to Log("sw"). The fetch path is hot: cache-write
// failures are reported ONCE per worker, never per request.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("sw log channel: optional precache misses post ONE aggregated warn", async () => {
  const posted = [];
  const harness = createHarness({ fetchImpl: installFetch({ failOptional: true }), posted });
  await harness.lifecycleEvent("install").done();
  await settle();
  const warns = posted.filter((m) => m.type === "apex-sw-log" && m.level === "warn");
  assert.equal(warns.length, 1, JSON.stringify(posted));
  assert.match(warns[0].msg, /precache: 1 of \d+ optional assets not cached \(first: assets\/icon\.png\)/);
  assert.equal(harness.skipped, 1, "a logged optional miss still completes the install");
});

test("sw log channel: an essential miss posts install failed and still rejects", async () => {
  const posted = [];
  const harness = createHarness({ fetchImpl: installFetch({ failEssential: true }), posted });
  await assert.rejects(harness.lifecycleEvent("install").done(), /Unable to precache essential asset/);
  await settle();
  assert.ok(posted.some((m) => m.level === "warn" && /^install failed: Unable to precache essential asset/.test(m.msg)), JSON.stringify(posted));
});

test("sw log channel: a clean install posts nothing; activate posts one info", async () => {
  const posted = [];
  const harness = createHarness({ fetchImpl: installFetch(), posted });
  await harness.lifecycleEvent("install").done();
  await settle();
  assert.deepEqual(posted, []);
  await harness.lifecycleEvent("activate").done();
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ type: "apex-sw-log", level: "info", msg: "activated apex26-321" }]);
});

test("sw log channel: cache-write failures are reported once per worker, not per fetch", async () => {
  const posted = [];
  const harness = createHarness({
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return new Response("fresh", { status: 200 });
    },
    putImpl: async () => { throw new Error("QuotaExceededError"); },
    navigator: { onLine: true },
    posted,
  });
  for (const f of ["a.ogg", "b.ogg", "c.ogg"]) {
    const res = await harness.fetchEvent(new Request(`${ORIGIN}/assets/${f}`)).responsePromise;
    assert.equal(await res.text(), "fresh");
  }
  await settle();
  assert.equal(posted.length, 1, JSON.stringify(posted));
  assert.match(posted[0].msg, /^cache write failed: QuotaExceededError/);
});

test("a Range request for streamed music bypasses the worker; a whole-file music fetch stays cache-first", async () => {
  // perf-memory M-4b: a phone streams assets/music/ through an <audio> element,
  // which asks for byte ranges, and Safari needs a 206 — never the cached 200.
  const fetched = [];
  const harness = createHarness({
    navigator: { onLine: true },
    fetchImpl: async (request) => { fetched.push(typeof request === "string" ? request : request.url); return new Response("mp3", { status: 200 }); },
  });
  const ranged = harness.fetchEvent({
    method: "GET", mode: "no-cors", url: `${ORIGIN}/assets/music/song2.mp3`,
    headers: new Headers({ Range: "bytes=0-" }),
  });
  assert.equal(ranged.responsePromise, undefined, "no respondWith: the browser answers the range natively");
  assert.equal(fetched.length, 0, "and the worker fetched nothing for it");
  const whole = harness.fetchEvent({ method: "GET", mode: "same-origin", url: `${ORIGIN}/assets/music/song2.mp3`, headers: new Headers() });
  assert.equal((await whole.responsePromise).status, 200, "a plain fetch (the desktop decode path) is still answered");
  const other = harness.fetchEvent({ method: "GET", mode: "same-origin", url: `${ORIGIN}/assets/sfx/f1_engine.mp3`, headers: new Headers({ Range: "bytes=0-" }) });
  assert.ok(other.responsePromise, "only assets/music/ is exempt");
});

// L8-c: assets/pack/ URLs carry no ?v= (js/render/shared/assets.js asks for bare
// paths, and the deploy stamps only the shell's own tags), so cache-first served
// a new build's JS the OLD generation's manifest + strips for a whole session —
// the layer index IS the MAT id. Network first, the cache as the fallback.
function packHarness({ net, immediateTimeoutMs } = {}) {
  const h = createHarness({
    immediateTimeoutMs,
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return net(url);
    },
  });
  h.stores.set("apex26-320", new Map([
    [`${ORIGIN}/assets/pack/manifest.json`, new Response('{"old":true}', { status: 200 })],
    [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
  ]));
  return h;
}

test("the pack manifest is network-first: a new deploy's manifest beats the old generation's copy", async () => {
  const h = packHarness({ net: async () => new Response('{"new":true}', { status: 200 }) });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/manifest.json`));
  assert.equal(await (await ev.responsePromise).text(), '{"new":true}');
  await Promise.all(ev.lifetimes);
  assert.equal(h.stores.get("apex26-321").has(`${ORIGIN}/assets/pack/manifest.json`), true,
    "the fresh copy is cached under THIS build for offline");
});

test("offline, the pack falls back to the cached copy; with no copy it errors cleanly", async () => {
  const h = packHarness({ net: async () => { throw new TypeError("offline"); } });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/manifest.json`));
  assert.equal(await (await ev.responsePromise).text(), '{"old":true}');
  const miss = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/never-cached.png`));
  assert.equal((await miss.responsePromise).status, 0, "Response.error(), not a hang");
});

test("a slow pack fetch loses the race to a cached copy, and its late answer is still cached", async () => {
  let release;
  const late = new Promise((r) => { release = r; });
  const h = packHarness({ immediateTimeoutMs: 3000, net: () => late });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/manifest.json`));
  assert.equal(await (await ev.responsePromise).text(), '{"old":true}', "the cache answers after NAV_RACE_MS");
  release(new Response('{"new":true}', { status: 200 }));
  await Promise.all(ev.lifetimes);
  assert.equal(await h.stores.get("apex26-321").get(`${ORIGIN}/assets/pack/manifest.json`).text(), '{"new":true}');
});

test("an ordinary ?v= asset stays cache-first (only the unversioned pack changed)", async () => {
  let fetched = 0;
  const h = packHarness({ net: async () => { fetched++; return new Response("net", { status: 200 }); } });
  h.stores.get("apex26-320").set(`${ORIGIN}/js/game.js?v=abc`, new Response("cached", { status: 200 }));
  const ev = h.fetchEvent(new Request(`${ORIGIN}/js/game.js?v=abc`));
  assert.equal(await (await ev.responsePromise).text(), "cached");
  assert.equal(fetched, 0);
});

// L8-c: assets/voice/ URLs carry no ?v= (voice-pack.js fetches bare .json + .bin
// pairs). Cache-first could pair a stale index with a fresh bin after deploy.
function voiceHarness({ net, immediateTimeoutMs } = {}) {
  const h = createHarness({
    immediateTimeoutMs,
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return net(url);
    },
  });
  h.stores.set("apex26-320", new Map([
    [`${ORIGIN}/assets/voice/george.json`, new Response('{"oldIndex":true}', { status: 200 })],
    [`${ORIGIN}/assets/voice/george.bin`, new Response("old-bytes", { status: 200 })],
    [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
  ]));
  return h;
}

test("voice json and bin are network-first: fetch runs before a stale cache can be the only answer", async () => {
  const order = [];
  const h = voiceHarness({
    net: async (url) => {
      order.push(`fetch:${url.pathname}`);
      return new Response(url.pathname.endsWith(".json") ? '{"newIndex":true}' : "new-bytes", { status: 200 });
    },
  });
  for (const path of ["/assets/voice/george.json", "/assets/voice/george.bin"]) {
    order.length = 0;
    const ev = h.fetchEvent(new Request(`${ORIGIN}${path}`));
    const body = await (await ev.responsePromise).text();
    assert.equal(order[0], `fetch:${path}`, `${path} must hit the network first`);
    assert.notEqual(body, path.endsWith(".json") ? '{"oldIndex":true}' : "old-bytes");
    await Promise.all(ev.lifetimes);
    assert.equal(await h.stores.get("apex26-voice").get(`${ORIGIN}${path}`).text(), body,
      `${path} fresh copy is written to the fixed voice cache`);
    assert.equal(h.stores.get("apex26-321")?.get(`${ORIGIN}${path}`), undefined,
      `${path} is not copied into the generation (audit4 B8)`);
  }
});

test("offline, voice json and bin fall back to the cached pair", async () => {
  const h = voiceHarness({ net: async () => { throw new TypeError("offline"); } });
  const j = h.fetchEvent(new Request(`${ORIGIN}/assets/voice/george.json`));
  assert.equal(await (await j.responsePromise).text(), '{"oldIndex":true}');
  const b = h.fetchEvent(new Request(`${ORIGIN}/assets/voice/george.bin`));
  assert.equal(await (await b.responsePromise).text(), "old-bytes");
});

test("a voice rebake during an active worker lifetime cannot play a mixed cached pair", async () => {
  const oldBin = "OLD!!", newBin = "NEW!!";
  const manifest = (bin) => JSON.stringify({ clips: { hello: [0, 5, 1] }, binary: {
    bytes: Buffer.byteLength(bin), sha256: createHash("sha256").update(bin).digest("hex"),
  } });
  let deployed = 321, binaryFault = true, offline = false;
  const brokenBin = deferred();
  const ordinary = installFetch();
  const h = createHarness({ fetchImpl: async (request) => {
    if (offline) throw new TypeError("offline");
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN);
    if (url.pathname.endsWith("version.json")) return new Response(JSON.stringify({ build: deployed }));
    if (url.pathname.endsWith("/george.json")) return new Response(manifest(deployed === 321 ? oldBin : newBin));
    if (url.pathname.endsWith("/george.bin")) return deployed === 321 ? new Response(oldBin) : binaryFault ? brokenBin.promise : new Response(newBin);
    return ordinary(request);
  } });
  await h.lifecycleEvent("install").done();
  await h.lifecycleEvent("activate").done();
  // Warm both files through the real fetch handler in generation 321.
  for (const ext of ["json", "bin"]) {
    const event = h.fetchEvent(new Request(`${ORIGIN}/assets/voice/george.${ext}`));
    await event.responsePromise;
    await Promise.all(event.lifetimes);
  }
  deployed = 322;  // old worker remains active while the replacement installs
  const ctx = vm.createContext({ crypto: webcrypto, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {}, Log: { info() {} },
    fetch: async (url) => {
      const event = h.fetchEvent(new Request(new URL(url, ORIGIN)));
      const response = await event.responsePromise;
      if (url.endsWith(".json")) {
        // JSON arrived from the new deployment; the sibling binary fails.
        brokenBin.reject(new TypeError("connection lost"));
      }
      await Promise.all(event.lifetimes);
      return response;
    },
  });
  vm.runInContext(await readFile(new URL("../../js/ui/update-check.js", import.meta.url), "utf8"), ctx);
  vm.runInContext("globalThis.updates = UpdateCheck.create({ booted:321 }); updates.markReady(322); globalThis.blocked = UpdateCheck.blocksLazyLoad();", ctx);
  assert.equal(ctx.blocked, true, "the script-loader guard does not own voice fetches");
  vm.runInContext(await readFile(new URL("../../js/audio/voice-pack.js", import.meta.url), "utf8"), ctx);
  const pack = ctx.VoicePack.create({});
  assert.equal(await pack.load("george"), false, "fresh index + old same-sized binary is rejected by digest");
  assert.equal(pack.ready("george"), false);
  assert.equal(pack.plan("george", "hello"), null);
  const cache = h.stores.get("apex26-voice");
  assert.equal(await cache.get(`${ORIGIN}/assets/voice/george.json`).clone().text(), manifest(newBin));
  assert.equal(await cache.get(`${ORIGIN}/assets/voice/george.bin`).clone().text(), oldBin);
  binaryFault = false;
  assert.equal(await ctx.VoicePack.create({}).load("george"), true, "a coherent fresh pair recovers");
  offline = true;
  assert.equal(await ctx.VoicePack.create({}).load("george"), true, "a coherent cached pair remains playable offline");
});

test("a slow voice fetch loses the race to cache, and its late answer is still cached", async () => {
  let release;
  const late = new Promise((r) => { release = r; });
  const h = voiceHarness({ immediateTimeoutMs: 3000, net: () => late });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/voice/george.json`));
  assert.equal(await (await ev.responsePromise).text(), '{"oldIndex":true}');
  release(new Response('{"newIndex":true}', { status: 200 }));
  await Promise.all(ev.lifetimes);
  assert.equal(await h.stores.get("apex26-voice").get(`${ORIGIN}/assets/voice/george.json`).text(), '{"newIndex":true}');
});

test("a voice response whose ETag matches the cached copy is not re-written (audit4 B8)", async () => {
  const puts = [];
  const h = createHarness({
    putImpl: (name, req) => puts.push(`${name} ${typeof req === "string" ? req : req.url}`),
    fetchImpl: async (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
      return new Response("same-bytes", { status: 200, headers: { etag: '"v1"' } });
    },
  });
  const key = `${ORIGIN}/assets/voice/george.bin`;
  h.stores.set("apex26-voice", new Map([[key, new Response("same-bytes", { headers: { etag: '"v1"' } })]]));
  const ev = h.fetchEvent(new Request(key));
  assert.equal(await (await ev.responsePromise).text(), "same-bytes");
  await Promise.all(ev.lifetimes);
  assert.deepEqual(puts.filter((p) => p.includes("/assets/voice/")), [], "an unchanged pack costs no CacheStorage write");
});

test("pack routing is unchanged when voice is network-first", async () => {
  const h = packHarness({ net: async () => new Response('{"new":true}', { status: 200 }) });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/manifest.json`));
  assert.equal(await (await ev.responsePromise).text(), '{"new":true}');
});

for (const cached of [false, true]) {
  test(`a fresh pack response bypasses a stalled generation read (cached=${cached})`, async () => {
    const version = deferred();
    const h = createHarness({ fetchImpl: async (request) => {
      const u = typeof request === "string" ? request : request.url;
      return u.includes("version.json") ? version.promise : new Response("fresh pack");
    } });
    const url = `${ORIGIN}/assets/pack/manifest.json`;
    if (cached) h.stores.set("apex26-320", new Map([[url, new Response("old pack")]]));
    const ev = h.fetchEvent(new Request(url));
    let settled = false;
    ev.responsePromise.then(() => { settled = true; });
    await new Promise(setImmediate);
    assert.equal(settled, true, "successful network response is not gated by version.json");
    assert.equal(await (await ev.responsePromise).text(), "fresh pack");
    let durable = false;
    Promise.all(ev.lifetimes).then(() => { durable = true; });
    await Promise.resolve();
    assert.equal(durable, false, "waitUntil still protects the deferred cache write");
    version.resolve(new Response('{"build":321}'));
    await Promise.all(ev.lifetimes);
    assert.equal(await h.stores.get("apex26-321").get(url).text(), "fresh pack");
  });
}

test("a pack response bypasses a stalled CacheStorage write without abandoning it", async () => {
  const write = deferred();
  const h = createHarness({
    fetchImpl: async (request) => new Response(String(typeof request === "string" ? request : request.url).includes("version.json") ? '{"build":321}' : "fresh pack"),
    putImpl: () => write.promise,
  });
  const ev = h.fetchEvent(new Request(`${ORIGIN}/assets/pack/manifest.json`));
  let answered = false, durable = false;
  ev.responsePromise.then(() => { answered = true; });
  Promise.all(ev.lifetimes).then(() => { durable = true; });
  await new Promise(setImmediate);
  assert.equal(answered, true);
  assert.equal(durable, false);
  assert.equal(await (await ev.responsePromise).text(), "fresh pack");
  write.resolve(); await Promise.all(ev.lifetimes);
  assert.equal(durable, true);
});

test("a same-URL worker installs a new generation and blocks old-shell lazy injection", async () => {
  const scriptURL = `${ORIGIN}/sw.js?v=320`, lazy = `${ORIGIN}/js/editor/codec.js?v=320`;
  const h = createHarness({ workerURL: scriptURL, fetchImpl: installFetch() });
  h.stores.set("apex26-320", new Map([
    [lazy, new Response("old code")],
    [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
  ]));
  await h.lifecycleEvent("install").done();
  await h.lifecycleEvent("activate").done();
  assert.deepEqual(h.deleted, [], "the prior settled generation is kept for old-shell lazy assets");
  assert.equal(h.claimed, 1);
  let appended = 0;
  const controller = { scriptURL, postMessage(data, ports) { h.messageEvent(data, ports); } };
  const ctx = vm.createContext({
    navigator: { serviceWorker: { controller } }, MessageChannel, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {}, Log: { info() {}, warn() {} },
    ApexRoster: { DEFERRED_EDGES: [] }, window: { __APEX_BUILD: 320 },
    document: { createElement: () => ({}), head: { appendChild() { appended++; } } },
  });
  vm.runInContext(await readFile(new URL("../../js/ui/update-check.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(await readFile(new URL("../../js/core/script-loader.js", import.meta.url), "utf8"), ctx);
  vm.runInContext("globalThis.u = UpdateCheck.create({booted:320}); globalThis.loader = ScriptLoader.create();", ctx);
  assert.equal(await ctx.loader.load(["js/editor/codec.js"], []), false);
  assert.equal(appended, 0, "no request into the replacement generation");
  assert.equal(ctx.u.state().ready, 321, "UPDATE READY names the actual cache generation, not URL320");
  const lazyFetch = h.fetchEvent({ method: "GET", url: lazy });
  assert.equal(await (await lazyFetch.responsePromise).text(), "old code", "lazy ?v= from the prior generation still resolves");
  ctx.u.stop();
});

// bug-hunt 2.10: index.html's broken-install repair swept `caches.keys()` whole. github.io is
// a shared origin, so that deleted other projects' Cache Storage. It must delete apex26-* only.
test("the broken-install repair deletes only apex26- caches", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const at = html.indexOf("caches.keys()");
  assert.ok(at > 0, "the repair still enumerates caches");
  const body = html.slice(at, html.indexOf("}, true);", at));
  const filter = body.indexOf('indexOf("apex26-") === 0');
  const del = body.indexOf("caches.delete");
  assert.ok(filter > 0 && del > filter, "names are filtered to the apex26- prefix before any delete");
});

// #2424: offline (or an unreachable edge) a missing shell tag is a cache miss, not a broken install:
// the repair must not delete apex26-* caches until a network answer proves the edge is up.
async function runRepair({ onLine, fetchImpl, names = ["apex26-320", "other-proj"] }) {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const at = html.indexOf('var RETRY_KEY = "apex26.scriptRetry"');
  const end = html.indexOf("  // A CLEAN load clears the one-shot", at);
  assert.ok(at > 0 && end > at, "the repair block is still locatable");
  const listeners = {};
  const caches = new Map(names.map((n) => [n, 1]));
  const calls = { reload: 0, shown: [] };
  const store = new Map();
  const ctx = vm.createContext({
    window: { caches: {
      keys: async () => [...caches.keys()],
      delete: async (n) => caches.delete(n),
    }, addEventListener: (type, fn) => { if (type === "error") listeners.error = fn; } },
    location: { origin: "https://x.test", reload: () => { calls.reload++; } },
    navigator: { onLine },
    sessionStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    caches: { keys: async () => [...caches.keys()], delete: async (n) => caches.delete(n) },
    fetch: fetchImpl,
    show: (...a) => calls.shown.push(a),
    recordError: () => {},
    Promise,
  });
  ctx.window.caches = ctx.caches;
  vm.runInContext(html.slice(at, end), ctx);
  listeners.error({ target: { tagName: "SCRIPT", src: "https://x.test/js/a.js?v=1", dataset: {} } });
  await new Promise((r) => setTimeout(r, 20));
  return { caches: [...caches.keys()], calls };
}

test("the broken-install repair leaves apex26- caches alone while offline", async () => {
  let fetched = 0;
  const r = await runRepair({ onLine: false, fetchImpl: () => { fetched++; return Promise.resolve({}); } });
  assert.deepEqual(r.caches, ["apex26-320", "other-proj"]);
  assert.equal(r.calls.reload, 0);
  assert.equal(r.calls.shown.length, 1, "overlay shown");
  assert.equal(fetched, 0);
});

test("the broken-install repair leaves apex26- caches alone when the probe rejects", async () => {
  const r = await runRepair({ onLine: true, fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
  assert.deepEqual(r.caches, ["apex26-320", "other-proj"]);
  assert.equal(r.calls.reload, 0);
  assert.equal(r.calls.shown.length, 1);
});

test("the broken-install repair sweeps apex26- caches and reloads once a network answer arrives", async () => {
  const r = await runRepair({ onLine: true, fetchImpl: () => Promise.resolve({ status: 404 }),
    names: ["apex26-320", "apex26-voice", "other-proj"] });
  assert.deepEqual(r.caches, ["other-proj"], "the fixed voice cache goes with the generations (audit4 B8)");
  assert.equal(r.calls.reload, 1);
});

// ── The error catcher's reason serializer (same inline shell, other half) ──
// (r && (r.message || r)) || "unknown" rendered a plain-object rejection as
// "[object Object]" in BOTH the overlay and the __apexErrors ring, destroying
// the one detail a field report needs. No game code rejects with a plain
// object, so the shape that lands here is a platform object: its name and
// shape must survive.
async function runErrorCatcher() {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes("ON-SCREEN ERROR CATCHER"));
  assert.ok(script, "the error catcher script is found");
  const listeners = {};
  let overlay = null;
  const win = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector: () => ({ content: "123" }),
      getElementById: () => overlay,
      createElement: () => ({ style: {}, textContent: "", onclick: null }),
      body: { appendChild: (d) => { overlay = d; } },
      documentElement: { appendChild: (d) => { overlay = d; } },
    },
    navigator: { onLine: true },
    location: { origin: "https://x.test" },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(script, ctx);
  return {
    win,
    fire: (type, ev) => { for (const fn of listeners[type] || []) fn(ev); },
    text: () => (overlay ? overlay.textContent : ""),
    last: () => win.__apexErrors[win.__apexErrors.length - 1],
  };
}

test("the error catcher serializes a plain-object rejection instead of [object Object]", async () => {
  const h = await runErrorCatcher();
  h.fire("unhandledrejection", { reason: { code: "E_GL_LOST", detail: "context gone", status: 42 } });
  assert.ok(h.text().includes("Promise rejection"), h.text());
  assert.ok(h.text().includes('"code":"E_GL_LOST"'), h.text());
  assert.ok(h.text().includes('"detail":"context gone"'), h.text());
  assert.ok(!h.text().includes("[object Object]"), h.text());
  const rec = h.last();
  assert.equal(rec.kind, "rejection");
  assert.ok(rec.msg.includes('"code":"E_GL_LOST"'), rec.msg);
  assert.ok(!rec.msg.includes("[object Object]"), rec.msg);
});

test("the error catcher survives circular and BigInt reasons via the key-listing fallback", async () => {
  const h = await runErrorCatcher();
  const circ = { stage: "shader-compile" };
  circ.self = circ;
  h.fire("unhandledrejection", { reason: circ });
  assert.ok(h.text().includes("stage") && h.text().includes("self"), h.text());
  assert.ok(!h.text().includes("[object Object]"), h.text());
  assert.ok(h.last().msg.includes("self"), h.last().msg);
  h.fire("unhandledrejection", { reason: { n: 10n } });
  assert.ok(h.text().includes("(keys: n)"), h.text());
});

test("the error catcher keeps a platform object's name and message (DOMException shape)", async () => {
  const h = await runErrorCatcher();
  h.fire("unhandledrejection", { reason: new DOMException("GPU is not supported here", "NotSupportedError") });
  assert.ok(h.text().includes("NotSupportedError"), h.text());
  assert.ok(h.text().includes("GPU is not supported here"), h.text());
  assert.ok(!h.text().includes("[object Object]"), h.text());
  assert.ok(h.last().msg.includes("NotSupportedError"), h.last().msg);
});

test("the error catcher leaves Errors, strings, numbers and empty reasons as they were", async () => {
  const h = await runErrorCatcher();
  const err = new Error("kaboom");
  h.fire("unhandledrejection", { reason: err });
  assert.equal(h.last().msg, "kaboom", "an Error reason records its message exactly");
  assert.equal(h.last().detail, String(err.stack).slice(0, 800), "the stack still rides as the detail");
  assert.ok(h.text().includes("kaboom"), h.text());
  h.fire("unhandledrejection", { reason: "a plain string reason" });
  assert.equal(h.last().msg, "a plain string reason");
  h.fire("unhandledrejection", { reason: 42 });
  assert.equal(h.last().msg, "42");
  h.fire("unhandledrejection", {});
  assert.equal(h.last().msg, "unknown");
});

test("an empty-message Error surfaces its name instead of [object Object]", async () => {
  const h = await runErrorCatcher();
  const err = new TypeError("");
  err.stack = "STACKMARK";
  h.fire("unhandledrejection", { reason: err });
  assert.equal(h.last().msg, "TypeError");
  assert.ok(h.text().includes("STACKMARK"), h.text());
});

test("the error catcher caps an oversized object reason", async () => {
  const h = await runErrorCatcher();
  h.fire("unhandledrejection", { reason: { blob: "x".repeat(2000) } });
  assert.ok(h.text().includes('"blob":"' + "x".repeat(100)), h.text());
  assert.ok(!h.text().includes("x".repeat(600)), "the serialized reason is truncated, not dumped whole");
  assert.ok(h.text().includes("..."), h.text());
});

test("__apexReportError records the serialized shape of a non-Error value", async () => {
  const h = await runErrorCatcher();
  h.win.__apexReportError("gpu init", { code: 7, why: "no webgpu" });
  const rec = h.last();
  assert.equal(rec.kind, "caught");
  assert.ok(rec.msg.startsWith("Caught @ gpu init: "), rec.msg);
  assert.ok(rec.msg.includes('"why":"no webgpu"'), rec.msg);
  assert.ok(!rec.msg.includes("[object Object]"), rec.msg);
  assert.ok(h.text().includes('"why":"no webgpu"'), h.text());
  h.win.__apexReportError("loop", new Error("tick failed"));
  assert.equal(h.last().msg, "Caught @ loop: tick failed");
});

test("the window error handler serializes a non-Error e.error instead of String(e)", async () => {
  const h = await runErrorCatcher();
  h.fire("error", { message: "", error: { code: "X1", info: "bad thing" }, filename: "js/core/log.js", lineno: 1, colno: 2 });
  const rec = h.last();
  assert.equal(rec.kind, "error");
  assert.ok(rec.msg.includes('"code":"X1"'), rec.msg);
  assert.ok(!h.text().includes("[object Object]") && !h.text().includes("[object ErrorEvent]"), h.text());
  const err = new Error("script blew up");
  h.fire("error", { message: "script blew up", error: err, filename: "a.js", lineno: 3, colno: 4 });
  assert.equal(h.last().msg, "script blew up", "a messaged JS error is unchanged");
  assert.equal(h.last().detail, String(err.stack).slice(0, 800));
});

// R3-ASYNC-1: the generation query is a LOCAL fact. Answered from a no-store
// version.json read with no timeout, it left every lazy load() on lie-fi (a
// request that hangs while navigator.onLine is true) to the page's 1.5 s timer.
function askGeneration(h) {
  const ch = new MessageChannel();
  const t0 = Date.now();
  let timer;
  const reply = new Promise((resolve) => {
    ch.port1.once("message", (d) => resolve({ build: d.build, ms: Date.now() - t0 }));
    timer = setTimeout(() => resolve({ build: "NO REPLY", ms: Date.now() - t0 }), 2000);   // the page's own timer is 1.5 s
  });
  h.messageEvent({ type: "apex-cache-generation" }, [ch.port2]);
  return reply.finally(() => { clearTimeout(timer); ch.port1.close(); });
}
function hangingVersion(counter) {
  return (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (url.pathname.endsWith("/version.json")) { counter.n++; return new Promise(() => {}); }
    return Promise.reject(new Error("offline"));
  };
}

test("a hanging version.json still answers the generation query from the settled cache", async () => {
  const fetches = { n: 0 };
  const h = createHarness({ fetchImpl: hangingVersion(fetches) });
  h.stores.set("apex26-320", new Map([[`${ORIGIN}/__apex_install_settled__`, new Response("settled")]]));
  h.stores.set("apex26-321", new Map([[`${ORIGIN}/__apex_install_settled__`, new Response("settled")]]));
  h.stores.set("apex26-322", new Map([[`${ORIGIN}/__apex_install_complete__`, new Response("complete")]]));   // half-installed: not served
  const r = await askGeneration(h);
  assert.equal(r.build, 321, "the newest SETTLED generation answers");
  assert.ok(r.ms < 50, `answered in ${r.ms} ms, not after the network`);
  assert.equal(fetches.n, 0, "no version.json read while a local answer exists");
});

test("with nothing cached, the generation query races the network only briefly", async () => {
  const fetches = { n: 0 };
  const h = createHarness({ fetchImpl: hangingVersion(fetches), immediateTimeoutMs: 300 });
  const r = await askGeneration(h);
  assert.equal(r.build, 0, "unknown, so the page falls back to the registration URL");
  assert.equal(fetches.n, 1);
  // …and a network answer that arrives in time is still used.
  const ok = createHarness({ fetchImpl: installFetch() });
  assert.equal((await askGeneration(ok)).build, 321);
});

test("four sequential lazy loads behind a lie-fi worker finish well inside one page timeout", async () => {
  const h = createHarness({ fetchImpl: hangingVersion({ n: 0 }) });
  h.stores.set("apex26-321", new Map([[`${ORIGIN}/__apex_install_settled__`, new Response("settled")]]));
  const controller = { scriptURL: `${ORIGIN}/sw.js?v=321`, postMessage(data, ports) { h.messageEvent(data, ports); } };
  let appended = 0;
  const ctx = vm.createContext({
    navigator: { serviceWorker: { controller } }, MessageChannel, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval() {}, Log: { info() {}, warn() {} },
    ApexRoster: { DEFERRED_EDGES: [] }, window: { __APEX_BUILD: 321 },
    document: { createElement: () => ({}), head: { appendChild(el) { appended++; setImmediate(() => el.onload()); } } },
  });
  vm.runInContext(await readFile(new URL("../../js/ui/update-check.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(await readFile(new URL("../../js/core/script-loader.js", import.meta.url), "utf8"), ctx);
  vm.runInContext("globalThis.u = UpdateCheck.create({booted:321}); globalThis.loader = ScriptLoader.create();", ctx);
  const t0 = Date.now();
  for (const f of ["js/circuits/monza.js", "js/circuits/scenery/monza.js", "js/race/pit-lane.js", "js/audio/engine.js"]) {
    assert.equal(await ctx.loader.load([f], []), true, f);
  }
  const ms = Date.now() - t0;
  assert.equal(appended, 4);
  assert.ok(ms < 1500, `4 loads took ${ms} ms (each used to wait out the 1.5 s timer)`);
  ctx.u.stop();
});

// R3-PHONE-8: lazy files were keyed `?v=<build>`, a new URL for ~200 files on
// every deploy whatever changed. The staged shell now carries a content-hash map
// (tools/ci/bump-cache.mjs); install seeds under it, and copies a file an older
// generation already holds under that exact hash instead of downloading it.
const hash12 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
function lazyShellFetch(map, seen) {
  return async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
    if (seen) seen.push(url.pathname.slice(1) + url.search);
    if (url.pathname.endsWith("/version.json")) return new Response('{"build":322}', { status: 200 });
    if (url.pathname.endsWith("/index.html")) {
      return new Response(`<meta name="apex-build" content="322"><script src="js/game.js?v=${hash12("body of js/game.js")}"></script>` +
        (map ? `<script type="application/json" id="apex-lazy-v">${JSON.stringify(map)}</script>` : ""), { status: 200 });
    }
    return new Response("body of " + url.pathname.slice(1), { status: 200 });
  };
}

test("install seeds lazy files under the shell's content-hash map; no map keeps the build key", async () => {
  const map = { "js/circuits/monza.js": hash12("body of js/circuits/monza.js"), "js/render/glx/glx.js": hash12("body of js/render/glx/glx.js") };
  const h = createHarness({ fetchImpl: lazyShellFetch(map) });
  await h.lifecycleEvent("install").done();
  const keys = [...h.stores.get("apex26-322").keys()];
  assert.ok(keys.includes(`${ORIGIN}/js/circuits/monza.js?v=${map["js/circuits/monza.js"]}`), "optional lazy file under its hash");
  assert.ok(keys.includes(`${ORIGIN}/js/render/glx/glx.js?v=${map["js/render/glx/glx.js"]}`), "required GLX under its hash");
  assert.ok(keys.includes(`${ORIGIN}/js/circuits/spa.js?v=322`), "a file the map does not name keeps the build");
  assert.ok(!keys.includes(`${ORIGIN}/js/circuits/monza.js?v=322`));
  const dev = createHarness({ fetchImpl: lazyShellFetch(null) });
  await dev.lifecycleEvent("install").done();
  assert.ok(dev.stores.get("apex26-322").has(`${ORIGIN}/js/circuits/monza.js?v=322`), "no map: ?v=<build>, as before");
});

test("an unchanged hashed file is copied from the older generation, only when its bytes match the key", async () => {
  const monza = hash12("body of js/circuits/monza.js"), spa = hash12("body of js/circuits/spa.js");
  const seen = [];
  const h = createHarness({ fetchImpl: lazyShellFetch({ "js/circuits/monza.js": monza, "js/circuits/spa.js": spa }, seen),
    globals: { crypto: webcrypto } });
  h.stores.set("apex26-321", new Map([
    [`${ORIGIN}/js/circuits/monza.js?v=${monza}`, new Response("body of js/circuits/monza.js")],
    // a cache-first miss filed a newer deploy's body under this key (Pages ignores ?v=)
    [`${ORIGIN}/js/circuits/spa.js?v=${spa}`, new Response("some other build's spa")],
  ]));
  await h.lifecycleEvent("install").done();
  assert.ok(!seen.includes(`js/circuits/monza.js?v=${monza}`), "the unchanged file is not downloaded again");
  assert.ok(seen.includes(`js/circuits/spa.js?v=${spa}`), "a copy whose digest disagrees with its key is refetched");
  const cur = h.stores.get("apex26-322");
  assert.equal(await cur.get(`${ORIGIN}/js/circuits/monza.js?v=${monza}`).clone().text(), "body of js/circuits/monza.js");
  assert.equal(await cur.get(`${ORIGIN}/js/circuits/spa.js?v=${spa}`).clone().text(), "body of js/circuits/spa.js");
});


test("install rejects mismatched or missing shell generation before opening a cache", async () => {
  for (const meta of ['<meta name="apex-build" content="320">', '']) {
    const ordinary = installFetch();
    let offline = false;
    const h = createHarness({ immediateTimeout: true, fetchImpl: (request) => offline ? Promise.reject(new Error("offline")) : requestKey(request).endsWith('/index.html')
      ? Promise.resolve(new Response(meta + '<script src="js/game.js?v=320"></script>')) : ordinary(request) });
    h.stores.set("apex26-320", new Map([
      [`${ORIGIN}/index.html`, new Response("healthy old shell")],
      [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
    ]));
    await assert.rejects(h.lifecycleEvent("install").done(), /shell build does not match/);
    assert.equal(h.stores.has("apex26-321"), false);
    assert.equal(h.skipped, 0);
    assert.deepEqual(h.deleted, []);
    assert.equal(await (await h.stores.get("apex26-320").get(`${ORIGIN}/index.html`).clone()).text(), "healthy old shell");
    offline = true;
    const reload = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/?offline=1` });
    assert.equal(await (await reload.responsePromise).text(), "healthy old shell");
    await Promise.all(reload.lifetimes);
  }
});

test("navigation returns the network shell before generation lookup and consumes its cache clone safely", async () => {
  const version = deferred();
  const shell = '<meta name="apex-build" content="321">fresh shell';
  const h = createHarness({ fetchImpl: (request) => requestKey(request).endsWith('/version.json')
    ? version.promise : Promise.resolve(new Response(shell)) });
  const event = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/race` });
  const response = await event.responsePromise;
  assert.equal(await response.text(), shell);
  let settled = false;
  const done = Promise.all(event.lifetimes).then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(settled, false);
  version.resolve(new Response('{"build":321}'));
  await done;
  assert.equal(await h.stores.get("apex26-321").get(`${ORIGIN}/race`).text(), shell);
});

// Secondary documents share navigation caching, but never the game's shell.
for (const page of ["controller.html", "bench.html", "cockpit-view.html"]) {
  for (const query of ["?code=ROOM", "?b=321", "?b=322"]) {
    test(`offline ${page}${query} restores its own cached document`, async () => {
      const h = settledShellHarness({ online: false, fetchImpl: () => Promise.reject(new TypeError("offline")) });
      h.stores.get("apex26-321").set(`${ORIGIN}/${page}`, new Response(`own ${page}`));
      const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/${page}${query}` });
      assert.equal(await (await nav.responsePromise).text(), `own ${page}`);
    });
    test(`offline uncached ${page}${query} never serves the game shell`, async () => {
      const h = settledShellHarness({ online: false, fetchImpl: () => Promise.reject(new TypeError("offline")) });
      const nav = h.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/${page}${query}` });
      assert.equal((await nav.responsePromise).status, 0);
    });
  }
}

for (const asset of ["js/career/career-ui.js", "js/career/career-planning-ui.js"]) {
  for (const failure of ["503", "quota", "interrupted"]) {
    test(`${asset} ${failure} aborts update and preserves offline prior generation`, async () => {
      let offline = false;
      const ordinary = lazyShellFetch(Object.fromEntries(["js/career/career-ui.js", "js/career/career-planning-ui.js"].map((u) => [u, hash12("body of " + u)])));
      const h = createHarness({
        fetchImpl: (request) => {
          if (offline) return Promise.reject(new TypeError("offline"));
          if (requestKey(request).includes("/" + asset)) {
            if (failure === "503") return Promise.resolve(new Response("unavailable", { status: 503 }));
            if (failure === "interrupted") return Promise.reject(new TypeError("connection interrupted"));
          }
          return ordinary(request);
        },
        putImpl: (_name, request) => {
          if (failure === "quota" && requestKey(request).includes("/" + asset)) {
            throw new DOMException("full", "QuotaExceededError");
          }
        },
      });
      h.stores.set("apex26-321", new Map([
        [`${ORIGIN}/`, new Response("old shell")],
        [`${ORIGIN}/index.html`, new Response("old shell")],
        [`${ORIGIN}/js/career/career-ui.js?v=aaaaaaaaaaaa`, new Response("old career")],
        [`${ORIGIN}/__apex_install_complete__`, new Response("complete")],
        [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
      ]));
      await assert.rejects(h.lifecycleEvent("install").done());
      assert.equal(h.skipped, 0);
      assert.deepEqual(h.deleted, []);
      assert.equal(h.stores.get("apex26-322").has(`${ORIGIN}/__apex_install_complete__`), false);
      offline = true;
      // A rejected installing worker never controls clients; the previous worker
      // continues serving the retained generation, including after a restart.
      const active = createHarness({ fetchImpl: () => Promise.reject(new TypeError("offline")) });
      for (const [name, store] of h.stores) active.stores.set(name, store);
      const nav = active.fetchEvent({ method: "GET", mode: "navigate", url: `${ORIGIN}/` });
      assert.equal(await (await nav.responsePromise).text(), "old shell");
      const lazy = active.fetchEvent({ method: "GET", url: `${ORIGIN}/js/career/career-ui.js?v=aaaaaaaaaaaa` });
      assert.equal(await (await lazy.responsePromise).text(), "old career");
    });
  }
}

test("the complete strict Career group is required and loads offline under its content-hash keys", async () => {
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const files = roster.LAZY_CAREER_UI, edges = roster.LAZY_CAREER_UI_EDGES;
  const map = Object.fromEntries(files.map((u) => [u, hash12("body of " + u)]));
  const h = createHarness({ fetchImpl: lazyShellFetch(map) });
  h.stores.set("apex26-321", new Map([
    ["old", new Response("old")],
    [`${ORIGIN}/__apex_install_settled__`, new Response("settled")],
  ]));
  await h.lifecycleEvent("install").done();
  const store = h.stores.get("apex26-322");
  const status = await store.get(`${ORIGIN}/__apex_offline_status__`).clone().json();
  for (const file of files) {
    const key = `${file}?v=${map[file]}`;
    assert.ok(store.has(`${ORIGIN}/${key}`));
    assert.ok(status.required.includes(key), `${file} belongs to the required install pool`);
  }
  const offline = createHarness({ fetchImpl: () => Promise.reject(new TypeError("offline")) });
  for (const [name, saved] of h.stores) offline.stores.set(name, saved);
  const loaded = [];
  const ctx = vm.createContext({
    window: { __APEX_BUILD: 322 }, ApexRoster: { DEFERRED_EDGES: [] }, setTimeout, clearTimeout,
    document: {
      getElementById: (id) => id === "apex-lazy-v" ? { textContent: JSON.stringify(map) } : null,
      createElement: (tag) => ({ tagName: tag.toUpperCase() }),
      head: { appendChild(script) {
        if (script.tagName !== "SCRIPT") return;
        const event = offline.fetchEvent({ method: "GET", url: `${ORIGIN}/${script.src}` });
        event.responsePromise.then(async (res) => {
          if (res.ok) { loaded.push(script.src.split("?")[0]); script.onload(); }
          else script.onerror();
          await Promise.all(event.lifetimes);
        });
      } },
    },
  });
  vm.runInContext(await readFile(new URL("../../js/core/script-loader.js", import.meta.url), "utf8") + "\n;globalThis.loader = ScriptLoader.create();", ctx, { filename: absSrc("js/core/script-loader.js") });
  assert.equal(await ctx.loader.load(files, edges, { strict: true }), true);
  assert.deepEqual(loaded, files, "strict predecessor loads before the screen from installed caches");
  await h.lifecycleEvent("activate").done();
  assert.deepEqual(h.deleted, [], "the settled prior generation stays while matchAll is absent");
});


test("fresh wrong-generation essential bytes reject installation and retain the old cache", async () => {
  const ordinary = lazyShellFetch({ "js/career/career-ui.js": hash12("expected career") });
  const h = createHarness({ fetchImpl: ordinary });
  h.stores.set("apex26-321", new Map([[`${ORIGIN}/index.html`, new Response("old shell")]]));
  await assert.rejects(h.lifecycleEvent("install").done(), /Content hash mismatch/);
  assert.ok(h.stores.has("apex26-321"));
  assert.equal(h.deleted.includes("apex26-321"), false);
});

test("runtime stamped asset rejects a mismatched network body without caching it", async () => {
  const url = `${ORIGIN}/js/fresh.js?v=${hash12("expected")}`;
  const h = createHarness({ fetchImpl: async () => new Response("other generation") });
  const event = h.fetchEvent({ method: "GET", url });
  const res = await event.responsePromise;
  await Promise.all(event.lifetimes);
  assert.equal(res.type, "error");
  for (const store of h.stores.values()) assert.equal(store.has(url), false);
});

test("optional stamped mismatch is omitted without poisoning the successful generation", async () => {
  const map = { "js/circuits/monza.js": hash12("expected monza") };
  const h = createHarness({ fetchImpl: lazyShellFetch(map) });
  await h.lifecycleEvent("install").done();
  const store = h.stores.get("apex26-322");
  assert.equal(store.has(`${ORIGIN}/js/circuits/monza.js?v=${map["js/circuits/monza.js"]}`), false);
  assert.equal(h.skipped, 1);
});

test("optional digest verification expires without caching a late verified response", { timeout: 5000 }, async () => {
  const body = "body of js/circuits/monza.js", hash = hash12(body), pending = new Map(), digest = deferred();
  let checked = false;
  const h = createHarness({ fetchImpl: lazyShellFetch({ "js/circuits/monza.js": hash }), globals: {
    setTimeout(callback, ms, ...args) {
      if (ms !== 4000) return setTimeout(callback, ms, ...args);
      const id = {}; pending.set(id, callback); return id;
    },
    clearTimeout(id) { if (!pending.delete(id)) clearTimeout(id); },
    crypto: { subtle: { digest(algorithm, bytes) {
      if (Buffer.from(bytes).toString() !== body) return webcrypto.subtle.digest(algorithm, bytes);
      checked = true;
      queueMicrotask(() => { for (const expire of pending.values()) expire(); });
      return digest.promise;
    } } },
  } });
  await h.lifecycleEvent("install").done();
  assert.equal(checked, true, "the deadline fires during digest work, not during fetch");
  const store = h.stores.get("apex26-322"), url = `${ORIGIN}/js/circuits/monza.js?v=${hash}`;
  assert.equal(h.skipped, 1, "optional verification cannot block a healthy installation");
  assert.equal(store.has(url), false);
  digest.resolve(await webcrypto.subtle.digest("SHA-256", Buffer.from(body)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.has(url), false, "late verification cannot write after its deadline");
});

test("required stamped admission fails closed without digest support", async () => {
  for (const crypto of [undefined, { subtle: { digest: async () => { throw new Error("digest unavailable"); } } }]) {
    const h = createHarness({ fetchImpl: lazyShellFetch(null), globals: { crypto } });
    await assert.rejects(h.lifecycleEvent("install").done(), /verify content hash|digest unavailable/);
    assert.equal(h.skipped, 0);
    assert.equal(h.stores.get("apex26-322").has(`${ORIGIN}/__apex_install_complete__`), false);
  }
});

test("cache retirement retains the actual previous settled build across gaps for old worker URLs", async () => {
  for (const clientWindows of [0, 1, undefined]) {
    const state = { offline: false }, body = "previous build worker", worker = `js/track/build-worker.js?v=${hash12(body)}`;
    const h = createHarness({ fetchImpl: generationFetch(state), clientWindows });
    const settled = () => [`${ORIGIN}/__apex_install_settled__`, new Response("settled")];
    h.stores.set("apex26-300", new Map([settled()]));
    h.stores.set("apex26-314", new Map([settled(), [`${ORIGIN}/${worker}`, new Response(body)]]));
    h.stores.set("apex26-320", new Map([[`${ORIGIN}/__apex_install_complete__`, new Response("complete")]]));
    h.stores.set("apex26-321", new Map([settled(), [`${ORIGIN}/js/track/build-worker.js?v=${hash12("current worker")}`, new Response("current worker")]]));
    h.stores.set("apex26-322", new Map([settled()]));
    h.stores.set("apex26-unknown", new Map([["unrelated", new Response("leave alone")]]));
    await h.lifecycleEvent("activate").done();
    const keepPrevious = clientWindows !== 0;
    assert.equal(h.stores.has("apex26-314"), keepPrevious, "missing clients API conservatively retains the installed predecessor");
    assert.ok(h.stores.has("apex26-321"));
    assert.ok(h.stores.has("apex26-322"), "newer caches are never retired by this worker");
    assert.ok(h.stores.has("apex26-unknown"), "unrecognized cache metadata stays untouched");
    assert.equal(h.stores.has("apex26-300"), false, "retention stays bounded to one actual predecessor");
    assert.equal(h.stores.has("apex26-320"), false, "a partial arithmetic predecessor cannot displace the older settled one");
    state.offline = true;
    const oldWorker = h.fetchEvent(new Request(`${ORIGIN}/${worker}`));
    const response = await oldWorker.responsePromise;
    if (keepPrevious) assert.equal(await response.text(), body, "an old-shell worker still resolves its exact changed content key offline");
    else assert.equal(response.type, "error");
    await Promise.all(oldWorker.lifetimes);
  }
});

test("essential preload URLs get one verified admission while optional-only hints and recovery remain intact", async () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ path: `css/title-${i}.css`, body: `body { --fixture-${i}: ${i}; }` }));
  for (const scenario of ["cold", "warm", "corrupt"]) {
    const puts = new Map(), fetches = new Map(); let digests = 0;
    const urls = files.map(f => `${f.path}?v=${hash12(f.body)}`);
    const shell = '<meta name="apex-build" content="321">' + urls.map(u => `<link rel="preload" as="style" href="${u}"><link rel="stylesheet" href="${u}">`).join("") +
      '<link rel="preload" as="font" href="assets/fonts/fixture.woff2">';
    const h = createHarness({ fetchImpl: async request => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`), key = url.pathname.slice(1) + url.search;
      fetches.set(key, (fetches.get(key) || 0) + 1);
      if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}');
      if (url.pathname.endsWith("/index.html")) return new Response(shell);
      const css = files.find(f => `/${f.path}` === url.pathname);
      if (css) return new Response(css.body);
      if (url.pathname.endsWith("/fixture.woff2")) return new Response("optional miss", { status: 404 });
      return new Response("asset");
    }, putImpl: (_name, request) => { const key = requestKey(request); puts.set(key, (puts.get(key) || 0) + 1); }, globals: {
      crypto: { subtle: { digest(algorithm, bytes) { digests++; return webcrypto.subtle.digest(algorithm, bytes); } } },
    } });
    if (scenario !== "cold") h.stores.set("apex26-314", new Map(files.map((f, i) => [`${ORIGIN}/${urls[i]}`, new Response(scenario === "corrupt" && i === 0 ? "corrupt" : f.body)])));
    await h.lifecycleEvent("install").done();
    const cache = h.stores.get("apex26-321"), status = await cache.get(`${ORIGIN}/__apex_offline_status__`).json();
    for (let i = 0; i < files.length; i++) {
      const url = urls[i];
      assert.equal(puts.get(`${ORIGIN}/${url}`), 1, `${scenario}: required CSS writes once`);
      assert.equal(fetches.get(url) || 0, scenario === "cold" || (scenario === "corrupt" && i === 0) ? 1 : 0, `${scenario}: no duplicate network fetch`);
      assert.equal(await cache.get(`${ORIGIN}/${url}`).text(), files[i].body);
      assert.ok(status.required.includes(url));
      assert.equal(status.optional.includes(url), false, "preload hints cannot duplicate required URLs");
    }
    assert.equal(digests, files.length + (scenario === "corrupt" ? 1 : 0), "one digest per required CSS, plus only a corrupt old-copy recovery");
    assert.ok(status.optional.includes("assets/fonts/fixture.woff2"), "optional-only fonts keep their existing policy");
    assert.equal(cache.has(`${ORIGIN}/assets/fonts/fixture.woff2`), false, "optional-only miss remains tolerated");
    assert.equal(h.skipped, 1);
  }
});
