"use strict";
// Apex 26 — offline cache service worker.
//
// No build step (see CLAUDE.md), so this file deliberately does NOT hand-maintain
// a precache manifest that could drift out of sync with a JS/CSS edit. Instead:
//   - CORE assets (index.html, css/js it references, manifest, icons) are
//     discovered by fetching+parsing the shell's OWN <script src>/<link href>
//     tags at install time — whatever index.html actually loads is what gets
//     cached, automatically, forever in sync with the existing `?v=N` bump.
//   - Everything else (audio/sfx under assets/, the Jolpica/OpenF1 API is
//     cross-origin and never touched) is cached opportunistically the first
//     time it's fetched, so a full offline install follows naturally from one
//     normal play session.
//
// Cache name embeds version.json's build number, so every cache-bust bump
// (already required for any JS/CSS change per CLAUDE.md) automatically starts
// a fresh cache generation and the old one is swept on activate — no manual
// cache-invalidation step to remember.
const CACHE_PREFIX = "apex26-";

let _cacheNamePromise = null;
function currentCacheName() {
  if (_cacheNamePromise) return _cacheNamePromise;
  _cacheNamePromise = fetch("version.json", { cache: "no-store" })
    .then((r) => r.json())
    .then((v) => CACHE_PREFIX + (v && v.build ? v.build : "0"))
    .catch(() => CACHE_PREFIX + "0");
  return _cacheNamePromise;
}

// Parse the shell's own tags so the core precache list can never drift from
// what index.html actually loads (adding/removing a <script> just works).
async function coreAssetList() {
  const urls = new Set(["./", "index.html", "manifest.json", "version.json"]);
  try {
    const html = await (await fetch("index.html", { cache: "no-store" })).text();
    const re = /<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      if (/^([a-z]+:)?\/\//i.test(u)) continue;   // skip any absolute/cross-origin URL
      urls.add(u);
    }
  } catch (_) { /* offline install (rare) — the shell itself is likely already cached */ }
  return Array.from(urls);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const [name, urls] = await Promise.all([currentCacheName(), coreAssetList()]);
    const cache = await caches.open(name);
    // Cache each individually — cache.addAll() is all-or-nothing, so one
    // missing/renamed asset would otherwise fail the entire install.
    await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(u, { cache: "no-store" });
        if (res && res.ok) await cache.put(u, res);
      } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const [name, keys] = await Promise.all([currentCacheName(), caches.keys()]);
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== name).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch cross-origin (Jolpica/OpenF1 data hub)

  // Network-first for the HTML shell + version.json: the existing "SHELL
  // VERSION GUARD" in index.html depends on version.json always reflecting the
  // true latest deploy when online, so this SW must never let a cached
  // version.json mask a newer build. It only serves the cache when the
  // network is actually unavailable — that's the offline win.
  //
  // Racing the fetch against a short timeout (rather than only reacting to a
  // rejected promise) matters because "no network" doesn't always fail fast —
  // a dead/very slow connection can leave fetch() pending far longer than a
  // user will wait, and offline emulation in some embedding contexts (e.g. a
  // browser automation harness) can behave the same way. Either way the cache
  // fallback should win once it's clearly not going to resolve promptly; the
  // real network response, if it does eventually land, still gets cached.
  if (req.mode === "navigate" || url.pathname.endsWith("version.json")) {
    event.respondWith((async () => {
      const network = fetch(req, { cache: "no-store" }).then(async (res) => {
        if (res && res.ok) (await caches.open(await currentCacheName())).put(req, res.clone());
        return res;
      });
      // A late rejection/resolution after the timeout already won the race is
      // expected (slow connection catching up) — swallow it so it never
      // surfaces as an unhandled promise rejection.
      network.catch(() => {});
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
      try {
        const res = await Promise.race([network, timeout]);
        if (res) return res;
      } catch (_) { /* network rejected — fall through to cache */ }
      return (await caches.match(req)) || (await caches.match("index.html")) || Response.error();
    })());
    return;
  }

  // Cache-first for everything else. Every ?v=N URL is immutable content by
  // this project's own cache-busting convention, and audio/sfx never change
  // post-release, so a cache hit is always correct — no revalidation needed.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) (await caches.open(await currentCacheName())).put(req, res.clone());
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
