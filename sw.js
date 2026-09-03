"use strict";
// Apex 26 — offline cache service worker.
//
// No build step (see CLAUDE.md), so this file deliberately does NOT hand-maintain
// a precache manifest that could drift out of sync with a JS/CSS edit. Instead:
//   - CORE assets (index.html, css/js it references, manifest, icons) are
//     discovered by fetching+parsing the shell's OWN <script src>/<link href>
//     tags at install time — whatever index.html actually loads is what gets
//     cached, automatically, forever in sync with the content-hashed `?v=` tags.
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
// A dev host serves the committed shell, whose asset tags all read `?v=dev`
// (see the fetch handler). Playwright pages run on 127.0.0.1, so the suite
// exercises this branch; the deployed site never does.
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test((self.location && self.location.hostname) || "");
const INSTALL_COMPLETE_URL = "__apex_install_complete__";

let _cacheNamePromise = null;
function currentCacheName() {
  if (_cacheNamePromise) return _cacheNamePromise;
  _cacheNamePromise = fetch("version.json", { cache: "no-store" })
    .then((r) => {
      if (!r || !r.ok) throw new Error("Unable to read the deployed build");
      return r.json();
    })
    .then((v) => {
      const build = Number(v && v.build);
      if (!Number.isSafeInteger(build) || build <= 0) throw new Error("Invalid deployed build");
      return CACHE_PREFIX + build;
    })
    .catch((e) => {
      // Never memoize a rejection: one offline/failed read poisoned the name
      // for the worker's whole lifetime, and the cache-first branch then
      // returned Response.error() even when the network response was fine.
      _cacheNamePromise = null;
      throw e;
    });
  return _cacheNamePromise;
}

// Parse the shell's own tags so the precache lists cannot drift from what
// index.html actually loads. The shell and executable styles/scripts are
// essential; metadata and icons improve the install but are best-effort.
async function precacheAssetLists() {
  const essential = new Set(["./", "index.html", "version.json"]);
  // Vendored three.js (TLX backend) is fetched by DYNAMIC import() through the
  // inline importmap, so the tag parser below never sees it. Seed it as
  // OPTIONAL: TLX is opt-in — install success for GLX users must not depend on
  // ~1 MB of vendor they never run (promote to essential at the Phase D flip).
  const optional = new Set(["manifest.json",
    // All declared install icons must work offline even though only the 180px
    // browser favicon is linked from index.html and visible to the tag parser.
    "icons/icon-180.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "vendor/three-0.185.1/three.webgpu.min.js",
    "vendor/three-0.185.1/three.core.min.js",
    "vendor/three-0.185.1/three.tsl.min.js",
    // addons/tsl/display/BloomNode.js is deliberately NOT precached: nothing
    // imports it today (TLX bloom lives in tsl-post.js) — it stays on disk and
    // in the importmap's three/addons/ prefix for a future consumer, but 16 KB
    // in every PWA install with zero readers earns no cache slot.
    // The QR reader (js/net/scan.js) injects this ON DEMAND the first time
    // someone scans an answer code, so the tag parser below never sees it.
    // OPTIONAL for the same reason as three.js: most sessions never scan, and
    // an install must not fail over 257 KB they will not run.
    "vendor/jsqr-1.4.0/jsQR.js",
    // Rapier (js/physics/debris-world.js) is dynamic-import()ed, never tagged, so
    // the parser below cannot find it either. Unlike the entries around it this
    // one is ON by default — an installed-but-not-yet-raced PWA that never
    // seeded it loses debris/incident physics offline. Still OPTIONAL, not
    // essential: debrisworld degrades to "no side world" on a load failure, so
    // an install must not fail over it.
    "vendor/rapier-0.19.3/rapier.mjs",
    // Trystero + its schnorr dependency, reached by dynamic import() through
    // the importmap for the room-code path only. OPTIONAL for the same reason
    // as three.js: most sessions never open a room code, and an install must
    // not fail over ~170 KB they will not run.
    "vendor/trystero-0.25.3/nostr/index.js",
    "vendor/trystero-0.25.3/core/index.js",
    "vendor/trystero-0.25.3/noble-secp256k1.js",
    // Self-hosted fonts (referenced from css/tokens.css @font-face, so the tag
    // parser below never sees them). Immutable vendored assets — no ?v=. Seeded
    // as OPTIONAL: font-display:swap means a missed precache just falls back to
    // the system stack, so an install must not fail if one is unreachable.
    "assets/fonts/titillium-web-latin-400-normal.woff2",
    "assets/fonts/titillium-web-latin-600-normal.woff2",
    "assets/fonts/titillium-web-latin-700-normal.woff2",
    "assets/fonts/titillium-web-latin-700-italic.woff2",
    "assets/fonts/rajdhani-latin-500-normal.woff2",
    "assets/fonts/rajdhani-latin-600-normal.woff2",
    "assets/fonts/rajdhani-latin-700-normal.woff2",
    // @gen-shell:sw-optional
    // DEFERRED renderer backends (no <script> tag; injected on opt-in)
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx.js",
    "js/render/three/tsl-chunks.js",
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tlx-shadow.js",
    "js/render/three/tlx-chunked.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tlx.js",
    // LAZY_RACE + LAZY_SCENERY — the race payload; a miss builds a bare circuit offline
    "js/lighting/presets.js",
    "js/circuits/scenery/bahrain.js",
    "js/circuits/scenery/monaco.js",
    "js/circuits/scenery/silverstone.js",
    "js/circuits/scenery/spa.js",
    "js/circuits/scenery/monza.js",
    "js/circuits/scenery/suzuka.js",
    "js/circuits/scenery/singapore.js",
    "js/circuits/scenery/cota.js",
    "js/circuits/scenery/interlagos.js",
    "js/circuits/scenery/vegas.js",
    "js/circuits/scenery/madrid.js",
    "js/circuits/scenery/zandvoort.js",
    "js/circuits/scenery/jeddah.js",
    "js/circuits/scenery/albert_park.js",
    "js/circuits/scenery/shanghai.js",
    "js/circuits/scenery/miami.js",
    "js/circuits/scenery/imola.js",
    "js/circuits/scenery/montreal.js",
    "js/circuits/scenery/redbull.js",
    "js/circuits/scenery/hungaroring.js",
    "js/circuits/scenery/baku.js",
    "js/circuits/scenery/mexico.js",
    "js/circuits/scenery/qatar.js",
    "js/circuits/scenery/abudhabi.js",
    "js/circuits/scenery/hockenheim.js",
    "js/circuits/scenery/nurburgring.js",
    "js/circuits/scenery/catalunya.js",
    "js/circuits/scenery/sepang.js",
    "js/circuits/scenery/istanbul.js",
    "js/circuits/scenery/paul_ricard.js",
    "js/circuits/scenery/portimao.js",
    "js/circuits/scenery/sochi.js",
    "js/circuits/scenery/mugello.js",
    "js/circuits/scenery/magny_cours.js",
    "js/circuits/scenery/estoril.js",
    "js/circuits/scenery/kyalami.js",
    "js/circuits/scenery/watkins_glen.js",
    "js/circuits/scenery/indianapolis.js",
    "js/circuits/scenery/buenos_aires.js",
    "js/circuits/scenery/jacarepagua.js",
    // LAZY_DATA — the data hub bundle behind the DATA button
    "js/data/api.js",
    "js/data/telemetry.js",
    "js/data/export.js",
    "js/data/schedule.js",
    "js/data/standings.js",
    "js/data/lastrace.js",
    "js/data/live.js",
    "js/data/hub.js",
    // LAZY_NET — the multiplayer stack behind VS FRIEND
    "js/net/nostr.js",
    "js/net/rendezvous.js",
    "js/net/sdp.js",
    "js/net/qr.js",
    "js/net/scan.js",
    "js/net/transport.js",
    "js/net/handshake.js",
    "js/net/snapshot.js",
    "js/net/session.js",
    "js/net/netplay.js",
    "js/net/lobby.js",
    // /@gen-shell:sw-optional
  ]);
  const shell = await fetch("index.html", { cache: "no-store" });
  if (!shell || !shell.ok) throw new Error("Unable to fetch the application shell");
  const html = await shell.text();
  const re = /<(script|link)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const ref = m[0].match(/\b(?:src|href)="([^"]+)"/i);
    if (!ref) continue;
    const u = ref[1];
    if (/^([a-z]+:)?\/\//i.test(u)) continue;   // skip any absolute/cross-origin URL
    if (m[1].toLowerCase() === "script" || /\brel="stylesheet"/i.test(m[0])) {
      essential.add(u);
    } else {
      optional.add(u);
    }
  }
  // Cache API put during install makes V8 build a "full" code cache of every
  // script (v8.dev). These three are LAZY_AGENT (no <script> tag) — belt and
  // suspenders if a tag is re-added. Do NOT add them to optional: that is
  // still an install-time put. Fetch-miss still cache.put on first use.
  // @gen-shell:sw-lazy-agent
  const LAZY_AGENT = ["js/game/agentview-raster.js","js/game/agentview.js","js/game/apex.js"];
  // /@gen-shell:sw-lazy-agent
  for (const u of [...essential]) {
    if (LAZY_AGENT.some((p) => u.includes(p))) essential.delete(u);
  }
  return { essential: Array.from(essential), optional: Array.from(optional) };
}

// Precache reads THROUGH the HTTP cache, deliberately. Both lists hold only
// immutable URLs — executable essentials carry a content-derived `?v=` token,
// and the optionals are version-pinned by PATH (vendor/three-0.185.1/…, the
// content-named woff2s) — which is the exact condition the fetch handler below
// already relies on when it says a cache hit is always correct without
// revalidation. `cache: "no-store"` here contradicted that and made a cold
// first visit download the whole app TWICE: ~5.8 MB for the page's own 145
// script tags, then the same ~5.8 MB again for the install, in parallel, on one
// connection. Nothing in the history justifies it — it arrived inside an
// unrelated commit and no comment defends it.
//
// The application shell is still fetched with `no-store` (see
// precacheAssetLists) because index.html is the one genuinely mutable document
// here and it is the source of truth for the tag list.
async function cacheRequiredAsset(cache, url) {
  const mutable = url === "./" || url === "index.html" || url === "version.json";
  const res = await fetch(url, mutable ? { cache: "no-store" } : undefined);
  if (!res || !res.ok) throw new Error("Unable to precache essential asset: " + url);
  await cache.put(url, res);
}

async function cacheOptionalAsset(cache, url) {
  let timeout = null;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  try {
    const expired = new Promise((resolve) => {
      timeout = setTimeout(() => {
        if (ctrl) ctrl.abort();
        resolve(null);
      }, 4000);
    });
    const res = await Promise.race([fetch(url, ctrl ? { signal: ctrl.signal } : undefined), expired]);
    if (res && res.ok) await cache.put(url, res);
  } catch (_) { /* optional assets must not invalidate an otherwise healthy install */ }
  finally { if (timeout !== null) clearTimeout(timeout); }
}

// Install fan-out, bounded. `Promise.all` over the whole list opened ~190
// concurrent requests against the same connection the page was still loading
// through; a small pool gets the same total throughput without starving first
// paint. Rejections still propagate, so an essential miss fails the install
// exactly as before.
async function pooled(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const [name, urls] = await Promise.all([currentCacheName(), precacheAssetLists()]);
    const cache = await caches.open(name);
    await pooled(urls.essential, 6, (u) => cacheRequiredAsset(cache, u));
    await cache.put(INSTALL_COMPLETE_URL, new Response("complete"));
    // The DEFERRED backends are the one group in `optional` that is NOT pinned
    // by path — js/game.js:loadBackendScripts injects them as `<path>?v=<build>`,
    // mirroring the shell's tags. Seeded bare they were cached under a key
    // nothing ever requests: the fetch handler matches without `ignoreSearch`,
    // so offline the query'd URL missed, the fetch rejected, the script's
    // onerror resolved with the global absent, and an opted-in TLX/WGX player
    // silently fell back to GLX. Stamp the same build here. Safe against
    // staleness because the cache NAME already carries the build and `activate`
    // deletes every other generation, so a key inside this cache can only ever
    // be this build's. Everything else in the list stays bare — the vendored
    // three.js reaches the network through the importmap with no query at all.
    const build = name.slice(CACHE_PREFIX.length);
    // Everything loadBackendScripts() injects is requested as `<path>?v=<build>`,
    // so it must be SEEDED under that key: the DEFERRED backends, and now the
    // race payload (light-presets + the per-circuit scenery closures) too.
    const stamped = urls.optional.map((u) =>
      /^js\/render\/(three|webgpu)\/|^js\/circuits\/scenery\/|^js\/data\/|^js\/net\/|^js\/lighting\/presets\.js$/.test(u)
        ? u + "?v=" + build : u);
    await pooled(stamped, 4, (u) => cacheOptionalAsset(cache, u));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const name = await currentCacheName();
    const cache = await caches.open(name);
    // No claim and no sweep for an incomplete generation — deliberate, and
    // test-asserted (service-worker.test.mjs "activation preserves prior
    // caches…"): don't seize clients onto a cache that never finished.
    if (!(await cache.match(INSTALL_COMPLETE_URL))) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== name).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // blob: URLs (the player's uploaded music, js/audio/music-lib.js) report the
  // PAGE's origin, so the same-origin test below would wave them through — and
  // cache.put() throws on any non-HTTP scheme, which would fail the request
  // instead of just declining to cache it. Spec says a SW never sees these;
  // the guard is here so that stays true if it ever does.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
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
  const isVersion = url.pathname.endsWith("version.json");
  // Shell bust navigations (?b= from index.html's version guard) must never
  // fall back to precached index.html — a slow/dead network would serve the
  // stale shell, and the one-shot sessionStorage guard blocks a second try.
  const isShellBust = req.mode === "navigate" && url.searchParams.has("b");
  if (req.mode === "navigate" || isVersion) {
    // version.json is NEVER written to the cache here. index.html fetches it as
    // "version.json?_=<Date.now()>", so every launch would put one more entry
    // under a URL (query included) that caches.match can never hit again — an
    // entry per launch until the next build bump sweeps the generation. The
    // precache already holds the bare "version.json" key, which is what the
    // offline fallback below reads.
    const network = fetch(req, { cache: "no-store" }).then(async (res) => {
      if (res && res.ok && !isVersion) {
        // The write is awaited (the waitUntil below depends on that) but must
        // never reject the chain: a version.json hiccup (deploy window,
        // captive portal) or a quota-refused put was turning a SUCCESSFUL
        // navigation into Response.error() through the online check below.
        try {
          const cache = await caches.open(await currentCacheName());
          await cache.put(req, res.clone());
        } catch (_) { /* a failed cache write must not fail a good response */ }
      }
      return res;
    });
    // If the timeout wins, respondWith() no longer protects the late refresh.
    // Keep the worker alive until both the fetch and its cache write settle.
    event.waitUntil(network.then(() => undefined, () => undefined));
    event.respondWith((async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
      const online = typeof navigator !== "undefined" && navigator.onLine;
      try {
        const res = await Promise.race([network, timeout]);
        if (res && res.ok) return res;
        // A timeout (null) or a thrown fetch while online must not advertise a
        // stale version.json as network truth — the shell guard then skips reload.
        if (res == null && online && (isVersion || req.mode === "navigate")) return Response.error();
      } catch (_) {
        if (online && (isVersion || req.mode === "navigate")) return Response.error();
      }
      // Offline: the version request reads the PRECACHED bare key. Without this
      // it fell through to the index.html fallback below and answered a JSON
      // request with the shell's HTML (survivable only because the version
      // guard swallows the parse error).
      if (isVersion) return (await caches.match("version.json")) || Response.error();
      if (isShellBust) return (await caches.match(req)) || Response.error();
      return (await caches.match(req)) || (await caches.match("index.html")) || Response.error();
    })());
    return;
  }

  // Cache-first for everything else. Every DEPLOYED ?v= URL carries a content
  // hash (pages.yml stamps it while staging), and audio/sfx never change
  // post-release, so a cache hit is always correct — no revalidation needed.
  //
  // EXCEPT on a dev host. The committed shell reads `?v=dev` for every asset
  // (tools/gen-shell.mjs; hashes exist only in the deploy's staged copy), so a
  // cache-first worker on localhost would pin the first js/css it saw for the
  // life of the cache generation. Network-first there, cache as the offline
  // fallback — tools/offline-precache-check.cjs still passes because the
  // fallback is the precache.
  event.respondWith((async () => {
    if (DEV_HOST && url.origin === self.location.origin) {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try {
            const cache = await caches.open(await currentCacheName());
            await cache.put(req, res.clone());
          } catch (_) { /* a failed cache write must not fail a good response */ }
          return res;
        }
      } catch (_) { /* offline: fall through to the cache */ }
    }
    const cached = await caches.match(req);
    if (cached) return cached;
    // On a miss there is nothing to fall back to, so a timeout race could only
    // FAIL a slow-but-alive request (and drop its late response uncached) — a
    // no-SW page would have loaded it. Ride the network; error only on reject.
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        try {
          const cache = await caches.open(await currentCacheName());
          await cache.put(req, res.clone());
        } catch (_) { /* a failed cache write must not fail a good response */ }
      }
      return res;
    } catch (_) { /* network rejected */ }
    return Response.error();
  })());
});
