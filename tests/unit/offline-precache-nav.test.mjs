// S4 (round-2 shell hunt): a slow or offline navigation to ANOTHER root page
// (controller.html: the manifest's "Phone controller" shortcut and the QR landing
// page) used to be answered with the GAME shell. The fallback to index.html is
// the shell's own address only; controller.html is also precached as optional
// (tools/gen/gen-shell.mjs SW_ROOT_PAGES). Companion to the browser check
// tools/check/offline-precache-check.cjs, which cannot cover a stalled fetch.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SW_SOURCE = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
const ORIGIN = "https://apex.test";
const key = (v) => (typeof v === "string" ? new URL(v, `${ORIGIN}/`).href : v.url);

function harness({ fetchImpl, seed = {} }) {
  const listeners = new Map();
  const stores = new Map([["apex26-321", new Map(Object.entries(seed).map(([k, v]) => [key(k), new Response(v)]))]]);
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { async put(r, res) { store.set(key(r), res.clone()); }, async match(r) { return store.get(key(r)); } };
    },
    async match(r, o) {
      for (const [n, store] of stores) if ((!o || o.cacheName == null || o.cacheName === n) && store.has(key(r))) return store.get(key(r)).clone();
    },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); },
  };
  const ctx = vm.createContext({
    URL, AbortController, Request, Response, caches, fetch: fetchImpl,
    self: { location: { origin: ORIGIN, hostname: "apex.test", href: `${ORIGIN}/sw.js?v=321` }, clients: { async claim() {} },
      addEventListener(t, l) { listeners.set(t, l); }, skipWaiting() {} },
    // the 3 s navigation race loses at once; every other timer is real
    setTimeout: (cb, ms, ...a) => (ms === 3000 ? (queueMicrotask(() => cb(...a)), 1) : setTimeout(cb, ms, ...a)),
    clearTimeout,
    navigator: { onLine: true },
  });
  vm.runInContext(SW_SOURCE, ctx, { filename: "sw.js" });
  const nav = (path) => {
    let p;
    listeners.get("fetch")({ request: { method: "GET", mode: "navigate", url: `${ORIGIN}${path}` }, respondWith(x) { p = Promise.resolve(x); }, waitUntil() {} });
    return p;
  };
  const install = () => {
    const l = [];
    listeners.get("install")({ waitUntil(x) { l.push(Promise.resolve(x)); } });
    return Promise.all(l);
  };
  return { nav, install, stores };
}

const GAME = "the game shell";

test("a stalled controller.html navigation is never answered with the game shell (late network wins)", async () => {
  let release;
  const h = harness({
    seed: { "index.html": GAME },
    fetchImpl: (r) => {
      const url = typeof r === "string" ? r : r.url;
      if (url.endsWith("version.json")) return Promise.resolve(new Response('{"build":321}'));
      return new Promise((res) => { release = () => res(new Response("controller page", { status: 200 })); });
    },
  });
  const p = h.nav("/controller.html");
  let settled = false;
  p.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false, "the race was lost; the shell must NOT be substituted");
  release();
  assert.equal(await (await p).text(), "controller page");
});

test("offline, an uncached controller.html fails honestly instead of opening the game", async () => {
  const h = harness({ seed: { "index.html": GAME }, fetchImpl: () => Promise.reject(new TypeError("offline")) });
  const res = await h.nav("/controller.html");
  assert.equal(res.status, 0, "Response.error()");
});

test("offline, a precached controller.html answers under its own URL", async () => {
  const h = harness({ seed: { "index.html": GAME, "controller.html": "cached controller" }, fetchImpl: () => Promise.reject(new TypeError("offline")) });
  assert.equal(await (await h.nav("/controller.html")).text(), "cached controller");
});

test("the game's own addresses still fall back to the precached shell on a slow link", async () => {
  for (const path of ["/", "/index.html", "/f1-game/", "/f1-game/index.html"]) {
    const h = harness({ seed: { "index.html": GAME }, fetchImpl: () => new Promise(() => {}) });
    assert.equal(await (await h.nav(path)).text(), GAME, path);
  }
});

test("install seeds controller.html as an optional (non-fatal) precache", async () => {
  const fetched = [];
  const h = harness({
    fetchImpl: async (r) => {
      const u = new URL(typeof r === "string" ? r : r.url, `${ORIGIN}/`);
      fetched.push(u.pathname);
      if (u.pathname.endsWith("/version.json")) return new Response('{"build":321}');
      if (u.pathname.endsWith("/index.html")) return new Response('<meta name="apex-build" content="321"><script src="js/game.js?v=321"></script>');
      if (u.pathname.endsWith("/controller.html")) return new Response("controller page");
      return new Response("asset");
    },
  });
  await h.install();
  assert.ok(h.stores.get("apex26-321").has(`${ORIGIN}/controller.html`), "controller.html is in the install cache");
});

test("an install where controller.html 404s still completes (optional, not essential)", async () => {
  const h = harness({
    fetchImpl: async (r) => {
      const u = new URL(typeof r === "string" ? r : r.url, `${ORIGIN}/`);
      if (u.pathname.endsWith("/version.json")) return new Response('{"build":321}');
      if (u.pathname.endsWith("/index.html")) return new Response('<script src="js/game.js?v=321"></script>');
      if (u.pathname.endsWith("/controller.html")) return new Response("nope", { status: 404 });
      return new Response("asset");
    },
  });
  await h.install();
  assert.ok(!h.stores.get("apex26-321").has(`${ORIGIN}/controller.html`));
});
