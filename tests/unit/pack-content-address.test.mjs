/**
 * L3 (LOAD-HUNT-2026-10-24) — assets/pack/ files are content-addressed.
 * assets.js requests `<file>?h=<md5>` from the manifest's hashes; sw.js answers
 * those cache-first and keeps the manifest itself network-first. A rebake
 * changes the md5, so the URL changes and a stale entry can never be served.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const SW_SOURCE = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
const ASSETS_SOURCE = await readFile(new URL("../../js/render/shared/assets.js", import.meta.url), "utf8");
const ORIGIN = "https://apex.test";
const H1 = "a".repeat(32);
const H2 = "b".repeat(32);
const key = (r) => (typeof r === "string" ? new URL(r, `${ORIGIN}/`).href : r.url);

function swHarness({ net, stores0 = {}, immediateTimeoutMs } = {}) {
  const listeners = new Map();
  const stores = new Map(Object.entries(stores0).map(([n, e]) => [n, new Map(Object.entries(e))]));
  const store = (n) => (stores.has(n) ? stores.get(n) : (stores.set(n, new Map()), stores.get(n)));
  const caches = {
    async open(name) {
      const s = store(name);
      return { async put(r, res) { s.set(key(r), res.clone()); }, async match(r) { return s.get(key(r)); } };
    },
    async match(r, o) {
      const k = key(r);
      if (o && o.cacheName != null) { const s = stores.get(o.cacheName); return s && s.has(k) ? s.get(k).clone() : undefined; }
      for (const s of stores.values()) if (s.has(k)) return s.get(k).clone();
      return undefined;
    },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); },
  };
  const calls = [];
  const fetchImpl = async (request) => {
    const url = new URL(key(request));
    if (url.pathname.endsWith("/version.json")) return new Response('{"build":321}', { status: 200 });
    calls.push(url.pathname + url.search);
    return net(url);
  };
  const self = {
    location: { origin: ORIGIN, hostname: "apex.test", href: `${ORIGIN}/sw.js?v=321` },
    clients: { async claim() {} },
    addEventListener(t, l) { listeners.set(t, l); },
    skipWaiting() {},
  };
  const context = vm.createContext({
    URL, crypto: webcrypto, AbortController, Request, Response, caches, fetch: fetchImpl, self, clearTimeout,
    setTimeout: immediateTimeoutMs != null
      ? (cb, ms, ...a) => (ms === immediateTimeoutMs ? (queueMicrotask(() => cb(...a)), 1) : setTimeout(cb, ms, ...a))
      : setTimeout,
  });
  vm.runInContext(SW_SOURCE, context, { filename: absSrc("sw.js") });
  function fetchEvent(url) {
    const lifetimes = [];
    let responsePromise;
    listeners.get("fetch")({
      request: new Request(url),
      respondWith(p) { responsePromise = Promise.resolve(p); },
      waitUntil(p) { lifetimes.push(Promise.resolve(p)); },
    });
    return { lifetimes, responsePromise };
  }
  return { stores, calls, fetchEvent };
}

const NAV_RACE_MS = Number(/const NAV_RACE_MS = (\d+);/.exec(SW_SOURCE)[1]);
const BIN = `${ORIGIN}/assets/pack/models/x.bin`;

// (b) the SW half
test("a ?h=<md5> pack URL is answered from the cache with no network request", async () => {
  const h = swHarness({
    net: () => { throw new Error("must not touch the network"); },
    stores0: { "apex26-320": { [`${BIN}?h=${H1}`]: new Response("cached", { status: 200 }) } },
  });
  const ev = h.fetchEvent(`${BIN}?h=${H1}`);
  assert.equal(await (await ev.responsePromise).text(), "cached");
  await Promise.all(ev.lifetimes);
  assert.deepEqual(h.calls, []);
});

test("a ?h= pack miss fetches once and stores under the hashed URL; the next request is a hit", async () => {
  const h = swHarness({ net: () => new Response("fresh", { status: 200 }) });
  const first = h.fetchEvent(`${BIN}?h=${H1}`);
  assert.equal(await (await first.responsePromise).text(), "fresh");
  await Promise.all(first.lifetimes);
  assert.equal(await h.stores.get("apex26-321").get(`${BIN}?h=${H1}`).clone().text(), "fresh");
  const second = h.fetchEvent(`${BIN}?h=${H1}`);
  assert.equal(await (await second.responsePromise).text(), "fresh");
  await Promise.all(second.lifetimes);
  assert.deepEqual(h.calls, [`/assets/pack/models/x.bin?h=${H1}`], "one network request for two loads");
});

test("the manifest and bare pack URLs stay network-first", async () => {
  const h = swHarness({
    net: () => new Response("net", { status: 200 }),
    stores0: { "apex26-320": {
      [`${ORIGIN}/assets/pack/manifest.json`]: new Response("old", { status: 200 }),
      [BIN]: new Response("old", { status: 200 }),
    } },
  });
  for (const u of [`${ORIGIN}/assets/pack/manifest.json`, `${ORIGIN}/assets/pack/manifest.json?h=${H1}`, BIN, `${BIN}?h=nothex`]) {
    const ev = h.fetchEvent(u);
    assert.equal(await (await ev.responsePromise).text(), "net", u);
    await Promise.all(ev.lifetimes);
  }
  assert.equal(h.calls.length, 4, "every one of them went to the network");
});

// (c) a stale md5 cannot pin an old file
test("a rebaked md5 is a different URL, so the old cached entry cannot answer it", async () => {
  const h = swHarness({
    net: () => new Response("rebaked", { status: 200 }),
    stores0: { "apex26-321": { [`${BIN}?h=${H1}`]: new Response("old bake", { status: 200 }) } },
  });
  const ev = h.fetchEvent(`${BIN}?h=${H2}`);
  assert.equal(await (await ev.responsePromise).text(), "rebaked");
  await Promise.all(ev.lifetimes);
  assert.equal(await h.stores.get("apex26-321").get(`${BIN}?h=${H1}`).clone().text(), "old bake", "old entry untouched");
});

test("a failed hashed fetch is an error response, never a cached error", async () => {
  const h = swHarness({ net: () => new Response("nope", { status: 404 }) });
  const ev = h.fetchEvent(`${BIN}?h=${H1}`);
  assert.equal((await ev.responsePromise).status, 404);
  await Promise.all(ev.lifetimes);
  assert.equal(h.stores.has("apex26-321") && h.stores.get("apex26-321").has(`${BIN}?h=${H1}`), false);
});

// (a) the loader half
function assetsHarness(manifest) {
  const urls = [];
  const ctx = vm.createContext({
    window: {},
    fetch: async (u) => {
      urls.push(String(u));
      if (String(u).endsWith("manifest.json")) return { ok: true, json: async () => manifest };
      return { ok: false };
    },
    performance: { now: () => 0 },
  });
  const A = vm.runInContext(`${ASSETS_SOURCE};Assets`, ctx, { filename: absSrc("js/render/shared/assets.js") });
  return { A, urls };
}

test("model and strip requests carry ?h=<md5> from the manifest", async () => {
  const manifest = {
    models: { x: { file: "models/x.bin", md5: H1 }, nohash: { file: "models/n.bin" } },
    materials: { size: 8, albedo: "a.png", normal: "n.png", albedoMd5: H1, normalMd5: H2, layers: [{ mat: 1, scale: 1 }] },
  };
  const { A, urls } = assetsHarness(manifest);
  await A.model("x");
  await A.model("nohash");
  A.init({ createTextureArray() { return null; }, setMaterialMaps() {} });
  assert.equal(await A.load({ tier: "high" }), false, "strip fetches answer not-ok -> no pack");
  const has = (u) => assert.notEqual(urls.indexOf(u), -1, urls.join());
  has(`assets/pack/models/x.bin?h=${H1}`);
  has("assets/pack/models/n.bin");
  has(`assets/pack/a.png?h=${H1}`);
  has(`assets/pack/n.png?h=${H2}`);
  has("assets/pack/manifest.json");
});

test("the committed manifest hashes every model and strip it names", async () => {
  const m = JSON.parse(await readFile(new URL("../../assets/pack/manifest.json", import.meta.url), "utf8"));
  const hex32 = (s, label = s) => assert.ok(/^[0-9a-f]{32}$/.test(s), label);
  for (const [id, r] of Object.entries(m.models)) hex32(r.md5, id);
  for (const t of [m.materials, m.materials.low].filter(Boolean)) {
    hex32(t.albedoMd5);
    hex32(t.normalMd5);
  }
});
