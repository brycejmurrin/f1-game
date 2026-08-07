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

function createHarness({ fetchImpl, putImpl, immediateTimeout = false } = {}) {
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
      : setTimeout,
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

test("cache-first responses remain pending until their runtime cache write completes", async () => {
  const heldPut = deferred();
  const harness = createHarness({
    fetchImpl: async () => new Response("fresh", { status: 200 }),
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

test("late navigation refresh is attached to waitUntil through its cache write", async () => {
  const network = deferred();
  const heldPut = deferred();
  const harness = createHarness({
    immediateTimeout: true,
    fetchImpl: (request) => {
      const url = new URL(typeof request === "string" ? request : request.url, `${ORIGIN}/`);
      if (url.pathname.endsWith("/version.json")) {
        return Promise.resolve(new Response('{"build":321}', { status: 200 }));
      }
      return network.promise;
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
  const fallback = await event.responsePromise;
  assert.equal(await fallback.text(), "offline shell");
  assert.equal(event.lifetimes.length, 1);

  network.resolve(new Response("online shell", { status: 200 }));
  const beforePut = await Promise.race([
    Promise.all(event.lifetimes).then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
  ]);
  assert.equal(beforePut, "pending");

  heldPut.resolve();
  await Promise.all(event.lifetimes);
  assert.equal(
    await (await harness.stores.get("apex26-321").get(`${ORIGIN}/race`)).text(),
    "online shell",
  );
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
