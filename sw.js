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
// Cache name embeds version.json's build number. There is no manual cache
// bump: the deploy (pages.yml) stamps the build and content-hashes every `?v=`
// tag while staging, so each release automatically starts a fresh cache
// generation and the old one is swept on activate.
const CACHE_PREFIX = "apex26-";
// A navigation / version.json fetch races this before the cache answers.
const NAV_RACE_MS = 3000;
// An OPTIONAL precache asset is abandoned (and aborted) after this long.
const OPTIONAL_ASSET_MS = 4000;
// A dev host serves the committed shell, whose asset tags all read `?v=dev`
// (see the fetch handler). Playwright pages run on 127.0.0.1, so the suite
// exercises this branch; the deployed site never does.
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test((self.location && self.location.hostname) || "");
const INSTALL_COMPLETE_URL = "__apex_install_complete__";
// Written after the BACKGROUND optional pool: the cache holds everything this
// build install-precaches (not runtime-only opt-ins). Every sweep (fetch path
// and activate) waits for it; install calls skipWaiting only after writing it.
const INSTALL_SETTLED_URL = "__apex_install_settled__";

// Default chosen backend at install: TLX (three) is the shipped picker default.
// GLX stays in the required pool separately. Scenery + data/net are the
// background pool, fetched after it (download priority only — see install).
// WGX stays in the optional Set (gen-shell lockstep with DEFERRED) but is
// skipped at install — explicit opt-in; fetch handler runtime-caches on use.
function isInstallCriticalOptional(u) {
  return /^js\/render\/three\//.test(u) || /^vendor\/three-/.test(u);
}
// Default-off / explicit opt-in: still seeded in `optional` when gen-shell
// requires lockstep (WGX), but never install-precached. Hand-authored vendors
// (Rapier, jsQR, trystero) are omitted from the Set entirely — same outcome.
function isRuntimeOnlyOptional(u) {
  return /^js\/render\/webgpu\//.test(u);
}
function isBackgroundOptional(u) {
  return !isInstallCriticalOptional(u) && !isRuntimeOnlyOptional(u);
}

let _cacheNamePromise = null;
// The RESOLVED name, readable without awaiting: cache matching must never wait
// on a version.json round trip (offline, that fetch can hang for as long as the
// link does), so it prefers the current generation only once it is known.
let _cacheNameKnown = null;
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
      _cacheNameKnown = CACHE_PREFIX + build;
      return _cacheNameKnown;
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

// WORKER → PAGE LOG CHANNEL. `Log` (js/core/log.js) does not exist in the
// worker, so the rare failures worth a trace are posted to every same-origin
// window as { type: "apex-sw-log", level, msg } and index.html's SW listener
// forwards them to Log under "sw". Lifecycle only (install, activate, the
// stale sweep) plus ONE cache-write failure per worker — never a message per
// fetch, and a rejected network fetch (offline) is expected, so never logged.
// Fire-and-forget: it can never reject or delay the event it reports on.
function swLog(level, msg) {
  try {
    const cl = self.clients;
    if (!cl || typeof cl.matchAll !== "function") return;
    Promise.resolve(cl.matchAll({ includeUncontrolled: true, type: "window" })).then((list) => {
      for (const c of list || []) {
        try { c.postMessage({ type: "apex-sw-log", level, msg: String(msg) }); } catch (_) { /* closed client */ }
      }
    }, () => {});
  } catch (_) { /* logging must never break the worker */ }
}
const errMsg = (e) => (e && e.message) || String(e);
// Runtime cache writes fail in bulk when they fail at all (quota, a
// deploy-window version.json miss), so only the FIRST one per worker is posted.
let _cacheWriteFails = 0;
function noteCacheWriteFail(e) {
  if (++_cacheWriteFails === 1) swLog("warn", "cache write failed: " + errMsg(e) + " (later failures in this worker are not reported)");
}

// The build number an apex26-<n> cache belongs to, or NaN for any other name.
function cacheBuild(name) {
  if (typeof name !== "string" || !name.startsWith(CACHE_PREFIX)) return NaN;
  const n = Number(name.slice(CACHE_PREFIX.length));
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

// CURRENT GENERATION FIRST. `caches.match()` walks every cache in CREATION
// order, so while two generations coexist — `activate` is the only sweep, and
// a fetch can open a cache under a NEWER build's name mid-deploy (the worker
// reads version.json lazily) — an unversioned key (index.html, version.json,
// the path-pinned fonts) was answered from the OLDEST build's copy. The known
// current name is searched first, then every other apex26 generation newest
// first, then anything else, which is `caches.match()`'s own last resort.
// Per-cache matches use the `cacheName` option, so a lookup never CREATES a
// cache the way `caches.open()` would.
//
// THE ORDER IS COMPUTED ONCE PER WORKER, not per request: `caches.keys()` plus
// two marker lookups per generation ran on EVERY cache-first fetch — a boot's
// ~150 script requests paid for ~150 identical sorts. The order changes only
// when this worker changes the cache set or a marker (install, activate, the
// sweep, a fetch opening a generation it has not seen) or learns the current
// name, so `_cacheOrder` is keyed on `_cacheNameKnown` and dropped by
// invalidateCacheOrder() at exactly those points. A cache another worker
// creates later is still reached: a miss across the ordered list falls back to
// `caches.match()`'s own all-caches walk, so a stale order costs preference,
// never a hit.
let _cacheOrder = null;   // { current, names: string[] | null, promise }
function invalidateCacheOrder() { _cacheOrder = null; }
async function computeCacheOrder(current) {
  const names = await caches.keys();
  // A FINISHED install outranks a newer name: a fetch mid-deploy opens the next
  // build's cache and writes its shell before that build installs, and an app
  // closed then and relaunched offline got the new shell with none of its lazy
  // `?v=<new>` payloads — while the previous, complete generation sat unused.
  const done = new Map();
  await Promise.all(names.map(async (n) => {
    let d = 0;
    try {
      if (await caches.match(INSTALL_SETTLED_URL, { cacheName: n })) d = 2;
      else if (await caches.match(INSTALL_COMPLETE_URL, { cacheName: n })) d = 1;
    } catch (_) { /* unreadable: rank it last */ }
    done.set(n, d);
  }));
  const rank = (n) => (n === current ? Infinity : (cacheBuild(n) || 0));
  return names.slice().sort((a, b) => (done.get(b) - done.get(a)) || (rank(b) - rank(a)));
}
function cacheOrder() {
  const current = _cacheNameKnown;
  if (_cacheOrder && _cacheOrder.current === current) return _cacheOrder.promise;
  const memo = { current, names: null, promise: null };
  memo.promise = computeCacheOrder(current).then(
    (names) => { memo.names = names; return names; },
    (e) => { if (_cacheOrder === memo) _cacheOrder = null; throw e; });   // never memoize a rejection
  _cacheOrder = memo;
  return memo.promise;
}
// caches.open() CREATES a missing cache, so opening a name the memoised order
// has not seen changes the cache set: drop the order before it is written to.
async function openCache(name) {
  const known = _cacheOrder && _cacheOrder.names;
  if (!known || !known.includes(name)) invalidateCacheOrder();
  return caches.open(name);
}
async function matchPreferCurrent(req) {
  let ordered;
  try { ordered = await cacheOrder(); } catch (_) { return caches.match(req); }
  for (const name of ordered) {
    const hit = await caches.match(req, { cacheName: name });
    if (hit) return hit;
  }
  // Only a cache the memoised order never listed can answer here.
  try { return await caches.match(req); } catch (_) { return undefined; }
}

// THE CACHED SHELL, ONLY WHEN IT IS AT LEAST BUILD `b`. The shell a plain
// offline navigation would get (the first generation in cacheOrder() holding
// index.html) — a shell is only ever written into its own build's cache, so
// the cache name IS its build. Older (or an unnumbered cache) → undefined: a
// `?b=` bust newer than anything cached must never be answered by a stale
// shell, because the boot guard's one-shot sessionStorage key blocks a retry.
async function shellAtLeast(b) {
  const want = Number(b);
  if (!Number.isFinite(want)) return undefined;
  let ordered;
  try { ordered = await cacheOrder(); } catch (_) { return undefined; }
  for (const name of ordered) {
    const hit = await caches.match("index.html", { cacheName: name });
    if (hit) return cacheBuild(name) >= want ? hit : undefined;
  }
  return undefined;
}

// OPPORTUNISTIC SWEEP. `activate` deletes older generations once, but a worker
// that outlives a deploy — or a fetch that opened a newer build's cache before
// that build's worker installed — leaves stale apex26-* caches behind until
// the next activate. Swept from the fetch path, at most once per worker
// lifetime once it succeeds, under the same rules `activate` keeps:
//   - only when the CURRENT generation finished its install (never strand a
//     client on an incomplete cache — the test holds activate to that too), and
//   - only generations OLDER than the current one: a worker whose memoised
//     name is stale must never delete the newer cache the next worker is
//     installing into.
let _sweepDone = false, _sweepBusy = false;
async function sweepStaleCaches() {
  const name = _cacheNameKnown;
  const build = cacheBuild(name);
  if (!(build > 0)) return;
  const keys = await caches.keys();
  if (!keys.includes(name)) return;
  // SETTLED, not just complete: the complete marker lands before the optional
  // pool, and an OLD active worker that has learned the new name would sweep its
  // own cache while the new install is still seeding (an old-shell tab offline
  // then lost its lazy ?v=<old> assets).
  if (!(await caches.match(INSTALL_SETTLED_URL, { cacheName: name }))) return;
  const stale = keys.filter((k) => cacheBuild(k) < build);
  await Promise.all(stale.map((k) => caches.delete(k)));
  if (stale.length) invalidateCacheOrder();
  _sweepDone = true;
}
function maybeSweep(event) {
  if (_sweepDone || _sweepBusy || !_cacheNameKnown) return;
  _sweepBusy = true;
  event.waitUntil(sweepStaleCaches().catch((e) => { swLog("warn", "stale-cache sweep failed: " + errMsg(e)); }).finally(() => { _sweepBusy = false; }));
}

// Parse the shell's own tags so the precache lists cannot drift from what
// index.html actually loads. The shell and executable styles/scripts are
// essential; metadata and icons improve the install but are best-effort.
async function precacheAssetLists() {
  const essential = new Set(["./", "index.html", "version.json"]);
  // Vendored three.js (TLX backend) is fetched by DYNAMIC import() through the
  // inline importmap, so the tag parser below never sees it.
  const optional = new Set(["manifest.json",
    // All declared install icons must work offline even though only the 180px
    // browser favicon is linked from index.html and visible to the tag parser.
    "icons/icon-180.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    // The vendored three.js island TLX imports at runtime. Hand-authored
    // because it is reached through the importmap, not a <script> tag, so
    // the parser below cannot see it. OPTIONAL: an install must not fail
    // over a backend most sessions never select.
    "vendor/three-0.186.0/three.webgpu.min.js",
    "vendor/three-0.186.0/three.core.min.js",
    "vendor/three-0.186.0/three.tsl.min.js",
    // jsQR / Rapier / trystero are NOT install-precached. Each is default-off
    // or path-only (QR scan, apex26.debris==="1", room code): ~2.5 MB that a
    // title/garage/race session never needs. Fetch-miss still cache.put on
    // first use (same as LAZY_AGENT). debris-world degrades to "no side world"
    // when Rapier is absent; scan/room code load on demand.
    // Self-hosted fonts (referenced from css/tokens.css @font-face, so the tag
    // parser below never sees them). Immutable vendored assets — no ?v=. Seeded
    // as OPTIONAL: font-display:swap means a missed precache just falls back to
    // the system stack, so an install must not fail if one is unreachable.
    "assets/fonts/titillium-web-latin-400-normal.woff2",
    "assets/fonts/titillium-web-latin-600-normal.woff2",
    "assets/fonts/titillium-web-latin-700-normal.woff2",
    "assets/fonts/titillium-web-latin-700-italic.woff2",
    "assets/fonts/barlow-condensed-latin-500-normal.woff2",
    "assets/fonts/barlow-condensed-latin-600-normal.woff2",
    "assets/fonts/barlow-condensed-latin-700-normal.woff2",
    "assets/fonts/saira-apex26-800-italic.woff2",
    // @gen-shell:sw-optional
    // DEFERRED renderer backends (no <script> tag; injected on opt-in)
    "js/render/glx/shaders/glsl-chunks.js",
    "js/render/glx/shaders/glsl-lit.js",
    "js/render/glx/shaders/glsl-sky.js",
    "js/render/glx/shaders/glsl-fx.js",
    "js/render/glx/shaders/glsl-post.js",
    "js/render/glx/post.js",
    "js/render/glx/shadow.js",
    "js/render/glx/chunked.js",
    "js/render/glx/glx.js",
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx-shadow.js",
    "js/render/webgpu/wgx-chunked.js",
    "js/render/webgpu/wgx-post.js",
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
    // LAZY_RACE + LAZY_CIRCUIT + LAZY_SCENERY — race payload; a miss builds a bare/meta circuit offline
    "js/lighting/presets.js",
    "js/circuits/bahrain.js",
    "js/circuits/monaco.js",
    "js/circuits/silverstone.js",
    "js/circuits/spa.js",
    "js/circuits/monza.js",
    "js/circuits/suzuka.js",
    "js/circuits/singapore.js",
    "js/circuits/cota.js",
    "js/circuits/interlagos.js",
    "js/circuits/vegas.js",
    "js/circuits/madrid.js",
    "js/circuits/zandvoort.js",
    "js/circuits/jeddah.js",
    "js/circuits/albert_park.js",
    "js/circuits/shanghai.js",
    "js/circuits/miami.js",
    "js/circuits/imola.js",
    "js/circuits/montreal.js",
    "js/circuits/redbull.js",
    "js/circuits/hungaroring.js",
    "js/circuits/baku.js",
    "js/circuits/mexico.js",
    "js/circuits/qatar.js",
    "js/circuits/abudhabi.js",
    "js/circuits/hockenheim.js",
    "js/circuits/nurburgring.js",
    "js/circuits/catalunya.js",
    "js/circuits/sepang.js",
    "js/circuits/istanbul.js",
    "js/circuits/paul_ricard.js",
    "js/circuits/portimao.js",
    "js/circuits/sochi.js",
    "js/circuits/mugello.js",
    "js/circuits/magny_cours.js",
    "js/circuits/estoril.js",
    "js/circuits/kyalami.js",
    "js/circuits/watkins_glen.js",
    "js/circuits/indianapolis.js",
    "js/circuits/buenos_aires.js",
    "js/circuits/jacarepagua.js",
    "js/circuits/fuji.js",
    "js/circuits/okayama.js",
    "js/circuits/korea.js",
    "js/circuits/jerez.js",
    "js/circuits/donington.js",
    "js/circuits/anderstorp.js",
    "js/circuits/brands_hatch.js",
    "js/circuits/zolder.js",
    "js/circuits/dijon.js",
    "js/circuits/buddh.js",
    "js/circuits/mont_tremblant.js",
    "js/circuits/mosport.js",
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
    "js/circuits/scenery/fuji.js",
    "js/circuits/scenery/okayama.js",
    "js/circuits/scenery/korea.js",
    "js/circuits/scenery/jerez.js",
    "js/circuits/scenery/donington.js",
    "js/circuits/scenery/anderstorp.js",
    "js/circuits/scenery/brands_hatch.js",
    "js/circuits/scenery/zolder.js",
    "js/circuits/scenery/dijon.js",
    "js/circuits/scenery/buddh.js",
    "js/circuits/scenery/mont_tremblant.js",
    "js/circuits/scenery/mosport.js",
    // LAZY_RACE_SESSION — pit/radio/reliability behind startRace (title boots stub)
    "js/race/reliability.js",
    "js/race/damage.js",
    "js/race/duel.js",
    "js/race/session-records.js",
    "js/race/pit-lane.js",
    "js/race/engineer.js",
    "js/race/radio-lines.js",
    "js/race/race-facts.js",
    "js/race/spotter.js",
    "js/race/race-radio.js",
    "js/race/start-lights.js",
    "js/race/marshal-panels.js",
    "js/race/flying-start.js",
    // LAZY_AUDIO — engine/panel/voice behind first sound gesture or race start
    "js/audio/signal.js",
    "js/audio/soundtrack.js",
    "js/audio/radio-fx.js",
    "js/audio/tone-model.js",
    "js/audio/engine.js",
    "js/audio/music-lib.js",
    "js/audio/spotify.js",
    "js/audio/rivals.js",
    "js/audio/car-sfx.js",
    "js/audio/voice-pack.js",
    "js/audio/radio-voice.js",
    "js/audio/announcer-recorded.js",
    "js/audio/announcer.js",
    "js/audio/panel.js",
    "js/audio/driving-cues.js",
    // LAZY_DATA — the data hub bundle behind the DATA button
    "js/data/tab-utils.js",
    "js/data/api-transport.js",
    "js/data/api.js",
    "js/data/telemetry-model.js",
    "js/data/telemetry-render.js",
    "js/data/telemetry-player.js",
    "js/data/telemetry-view.js",
    "js/data/telemetry.js",
    "js/data/export.js",
    "js/data/schedule.js",
    "js/data/standings.js",
    "js/data/results.js",
    "js/data/live.js",
    "js/data/real-race-tab.js",
    "js/data/hub.js",
    // LAZY_NET — the multiplayer stack behind VS FRIEND
    "js/net/bytes.js",
    "js/net/nostr.js",
    "js/net/rendezvous.js",
    "js/net/sdp.js",
    "js/net/qr.js",
    "js/net/scan.js",
    "js/net/transport.js",
    "js/net/handshake.js",
    "js/net/lobby-codes.js",
    "js/net/snapshot.js",
    "js/net/session.js",
    "js/net/netplay.js",
    "js/net/lobby.js",
    "js/input/phone-pad.js",
    // LAZY_WORKER — worker entry scripts (new Worker, never a page tag)
    "js/track/build-worker.js",
    "js/workers/bitmap-decode-worker.js",
    // LAZY_EDITOR — the track designer behind the TRACK DESIGNER door
    "js/editor/shape.js",
    "js/editor/stamps.js",
    "js/editor/randomise.js",
    "js/editor/validate.js",
    "js/editor/insight.js",
    "js/editor/fixes.js",
    "js/editor/codec.js",
    "js/editor/scenery-preview.js",
    "js/editor/canvas.js",
    "js/editor/elev-presets.js",
    "js/editor/profile.js",
    "js/editor/selection-panel.js",
    "js/editor/scenery-panel.js",
    "js/editor/designer.js",
    // LAZY_XR — WebXR session behind navigator.xr / ENTER VR
    "js/xr/xr-plan.js",
    "js/xr/xr-rig.js",
    "js/xr/xr-input.js",
    "js/xr/xr-session.js",
    "js/xr/apex-xr.js",
    "js/xr/xr-ui.js",
    // LAZY_CAM_EDITOR — camera tuner + flyby shot editor panels
    "js/camera/tuner-panel.js",
    "js/camera/flyby-editor.js",
    // LAZY_CAREER_UI — CAREER screen behind the title CAREER door
    "js/career/career-ui.js",
    // /@gen-shell:sw-optional
  ]);
  const shell = await fetch("index.html", { cache: "no-store" });
  if (!shell || !shell.ok) throw new Error("Unable to fetch the application shell");
  const html = await shell.text();
  // ONE shell download seeds both shell keys: "./" and "index.html" are the
  // same document, and the install used to fetch it three times (this parse
  // plus one per key). A fresh Response per key, built from these bytes, also
  // drops any redirect the server answered "index.html" with (a redirected
  // response cannot answer a navigation).
  const shellHeaders = {};
  try { shell.headers.forEach((v, k) => { shellHeaders[k] = v; }); } catch (_) { /* header-less test double */ }
  const shellResponse = () => new Response(html, { status: 200, headers: shellHeaders });
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
  const LAZY_AGENT = ["js/agent/agentview-raster.js","js/agent/agentview.js","js/agent/apex.js"];
  // /@gen-shell:sw-lazy-agent
  for (const u of [...essential]) {
    if (LAZY_AGENT.some((p) => u.includes(p))) essential.delete(u);
  }
  return { essential: Array.from(essential), optional: Array.from(optional), shellResponse };
}

// Precache reads THROUGH the HTTP cache, deliberately. Both lists hold only
// immutable URLs — executable essentials carry a content-derived `?v=` token,
// and the optionals are version-pinned by PATH (the content-named woff2s) — which is the exact condition the fetch handler below
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
      }, OPTIONAL_ASSET_MS);
    });
    const res = await Promise.race([fetch(url, ctrl ? { signal: ctrl.signal } : undefined), expired]);
    if (res && res.ok) { await cache.put(url, res); return true; }
    return false;   // 4xx/5xx or timed out: counted by install, one aggregated log line
  } catch (_) { /* optional assets must not invalidate an otherwise healthy install */ }
  finally { if (timeout !== null) clearTimeout(timeout); }
  return false;
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
    const cache = await openCache(name);
    const build = name.slice(CACHE_PREFIX.length);
    // GLX is the fallback renderer every device can run: when TLX/WGX are not
    // cached (or fail), an offline boot without it is "graphics unavailable".
    // So its deferred files are ESSENTIAL, stamped as loadBackendScripts asks.
    const isGlx = (u) => /^js\/render\/glx\//.test(u);
    const isShell = (u) => u === "./" || u === "index.html";
    const required = urls.essential.filter((u) => !isShell(u)).concat(urls.optional.filter(isGlx).map((u) => u + "?v=" + build));
    await Promise.all(["./", "index.html"].map((u) => cache.put(u, urls.shellResponse())));
    await pooled(required, 6, (u) => cacheRequiredAsset(cache, u));
    await cache.put(INSTALL_COMPLETE_URL, new Response("complete"));
    invalidateCacheOrder();   // a marker is a rank input (computeCacheOrder)
    // The DEFERRED backends are the one group in `optional` that is NOT pinned
    // by path — js/game.js:loadBackendScripts injects them as `<path>?v=<build>`,
    // mirroring the shell's tags. Seeded bare they were cached under a key
    // nothing ever requests: the fetch handler matches without `ignoreSearch`,
    // so offline the query'd URL missed, the fetch rejected, the script's
    // onerror resolved with the global absent, and an opted-in TLX/WGX player
    // silently fell back to GLX. Stamp the same build here. Safe against
    // staleness because the cache NAME already carries the build and `activate`
    // deletes older generations, so a key inside this cache can only ever
    // be this build's. Everything else in the list stays bare — the vendored
    // three.js reaches the network through the importmap with no query at all.
    // Everything loadBackendScripts() injects is requested as `<path>?v=<build>`,
    // so it must be SEEDED under that key: the DEFERRED backends, and now the
    // race payload (light-presets + the per-circuit scenery closures) too.
    // Stamp regex covers ScriptLoader injects: DEFERRED + LAZY_* incl. js/race/
    // (LAZY_RACE_SESSION) and js/workers/ (bitmap-decode). Keep both path classes.
    const stamped = urls.optional.map((u) =>
      /^js\/render\/(glx|webgpu|three)\/|^js\/circuits\/|^js\/audio\/|^js\/race\/|^js\/data\/|^js\/net\/|^js\/editor\/|^js\/xr\/|^js\/camera\/(tuner-panel|flyby-editor)\.js$|^js\/career\/career-ui\.js$|^js\/input\/phone-pad\.js$|^js\/lighting\/presets\.js$|^js\/track\/build-worker\.js$|^js\/workers\//.test(u)
        ? u + "?v=" + build : u).filter((u) => {
          const bare = u.replace(/\?v=.*$/, "");
          // GLX went in `required` above; WGX is runtime-only (opt-in).
          return !isGlx(bare) && !isRuntimeOnlyOptional(bare);
        });
    // INSTALL-CRITICAL first (chosen backend = TLX + three.js), then the
    // BACKGROUND pool (scenery / data / net — not WGX), then SETTLED, then
    // skipWaiting. The order of the pools is a download priority, nothing
    // more: skipWaiting() only SETS A FLAG, and the browser reads it after
    // every install extend-lifetime promise has settled
    // (https://w3c.github.io/ServiceWorker/ — Install, then Try Activate). A
    // skipWaiting between the pools — the old layout — activated nothing early
    // and only read as if it did; activation always followed SETTLED.
    const critical = stamped.filter((u) => isInstallCriticalOptional(u.replace(/\?v=.*$/, "")));
    const background = stamped.filter((u) => isBackgroundOptional(u.replace(/\?v=.*$/, "")));
    let optionalMissed = 0, firstMissed = "";
    for (const pool of [critical, background]) {
      await pooled(pool, 4, async (u) => {
        if (!(await cacheOptionalAsset(cache, u)) && !optionalMissed++) firstMissed = u;
      });
    }
    if (optionalMissed) swLog("warn", "precache: " + optionalMissed + " of " + stamped.length + " optional assets not cached (first: " + firstMissed + ")");
    await cache.put(INSTALL_SETTLED_URL, new Response("settled"));
    invalidateCacheOrder();
    await self.skipWaiting();
  })().catch((e) => {
    // An essential miss or an unreadable build aborts the install (the old
    // worker and its cache stay in charge). Say so, then keep the rejection.
    swLog("warn", "install failed: " + errMsg(e));
    throw e;
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const name = await currentCacheName();
    // Activation follows a SETTLED install (skipWaiting is install's last step,
    // and the spec activates only once install has settled), so this is the
    // ordinary stale sweep — the SAME guarded one the fetch path runs. There is
    // no separate "not settled yet: no claim, no sweep" branch any more: it
    // could not fire in a browser. The guard inside sweepStaleCaches() still
    // matters for one real case — a worker restarted between install and
    // activate re-reads version.json, and a deploy in that gap names a newer,
    // EMPTY generation; sweeping below it would delete the cache just
    // installed.
    await sweepStaleCaches();
    invalidateCacheOrder();   // a new active worker ranks the generations afresh
    await self.clients.claim();
    swLog("info", "activated " + name);
  })().catch((e) => { swLog("warn", "activate failed: " + errMsg(e)); throw e; }));
});

// Reply on the transferred port, so a page can bind the answer to the exact
// controller it queried. scriptURL's ?v= is only the registration URL: browser
// updates can execute new bytes at that SAME URL.
self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (!event.data || event.data.type !== "apex-cache-generation" || !port) return;
  event.waitUntil((async () => {
    try {
      const name = await currentCacheName();
      port.postMessage({ type: "apex-cache-generation", build: cacheBuild(name) });
    } catch (_) { port.postMessage({ type: "apex-cache-generation", build: 0 }); }
    finally { port.close(); }
  })());
});

// Unversioned same-origin assets (no ?v= on the wire): network-first with cache
// fallback. Used for assets/pack/ (MAT layer index) and assets/voice/ (.json +
// .bin pairs from voice-pack.js).
function packNetworkFirst(event, req) {
  let cacheWrite = Promise.resolve();
  const network = fetch(req).then((res) => {
    if (res && res.ok) {
      // Clone before returning the body to the page. Neither version.json nor
      // a slow CacheStorage write may hold a successful download hostage.
      const copy = res.clone();
      cacheWrite = (async () => {
        const cache = await openCache(await currentCacheName());
        await cache.put(req, copy);
      })().catch(noteCacheWriteFail);
    }
    return res;
  });
  // Register synchronously; the late write survives even if cached content won.
  event.waitUntil(network.then(() => cacheWrite, () => undefined));
  event.respondWith((async () => {
    const cached = matchPreferCurrent(req);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_RACE_MS));
    try {
      const res = await Promise.race([network, timeout]);
      if (res && res.ok) return res;
    } catch (_) { /* offline: the cache below */ }
    const hit = await cached;
    if (hit) return hit;
    // No cached copy: a slow network is still the only answer there is.
    try { return await network; } catch (_) { return Response.error(); }
  })());
}

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
  maybeSweep(event);

  // STREAMED MUSIC ASKS FOR BYTE RANGES (perf-memory M-4b). A phone plays
  // assets/music/ through an <audio> element (js/audio/soundtrack.js
  // streamMusic), and media elements fetch with `Range:` — Safari requires a
  // 206 answer and will not play a whole 200. The cache below holds whole 200s
  // (caches.match ignores Range, and cache.put refuses a 206), so such a request
  // is LEFT TO THE NETWORK: no respondWith, the browser answers it natively.
  // Chosen over slicing a 206 out of a cached body because a streaming phone
  // never fetches a whole track to cache — the cost is that streamed music does
  // not play offline (it skips, then stops); the desktop decode path's plain
  // fetch is still cached as before.
  if (url.pathname.includes("/assets/music/") && req.headers && req.headers.get && req.headers.get("range")) return;

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
    // Only a QUERY-LESS navigation is written, and it is written under its own
    // URL. Every deep link (`?b=` shell bust, `?log=`, `?track=`) used to be
    // put under its full URL — one more entry per distinct query, none of
    // which caches.match(req) ever hit again from the fallback below, which
    // reads "index.html". A query navigation is served from the network and,
    // offline, from the precached shell like everything else.
    // The shell REVALIDATES ("no-cache": a conditional request, a 304 reuses
    // the HTTP-cached bytes) — never served unvalidated, so the version guard
    // sees exactly what "no-store" did, minus re-downloading an unchanged
    // shell every launch. version.json and the ?b= bust keep "no-store": they
    // are the fail-fast answers below, where the cheaper path buys nothing.
    // https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
    const network = fetch(req, { cache: isVersion || isShellBust ? "no-store" : "no-cache" }).then(async (res) => {
      if (res && res.ok && !isVersion && url.search === "") {
        // The write is awaited (the waitUntil below depends on that) but must
        // never reject the chain: a version.json hiccup (deploy window,
        // captive portal) or a quota-refused put was turning a SUCCESSFUL
        // navigation into Response.error() through the online check below.
        try {
          const name = await currentCacheName();
          // The shell goes only into ITS OWN build's cache. A worker that
          // outlived a deploy remembers the old name, and writing the new
          // shell there served it offline beside the old build's scripts —
          // whose ?v= hashes it no longer names, so the boot failed.
          const m = /<meta name="apex-build" content="(\d+)"/.exec(await res.clone().text());
          if (!m || CACHE_PREFIX + m[1] === name) {
            const cache = await openCache(name);
            await cache.put(req, res.clone());
          }
        } catch (e) { noteCacheWriteFail(e); /* a failed cache write must not fail a good response */ }
      }
      return res;
    });
    // If the timeout wins, respondWith() no longer protects the late refresh.
    // Keep the worker alive until both the fetch and its cache write settle.
    event.waitUntil(network.then(() => undefined, () => undefined));
    event.respondWith((async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_RACE_MS));
      const online = typeof navigator !== "undefined" && navigator.onLine;
      // FAIL FAST ONLY WHERE A STALE ANSWER IS WORSE THAN NO ANSWER: version.json
      // (a stale build number makes the shell guard skip its reload) and the
      // `?b=` shell bust (the one-shot guard blocks a second try). A PLAIN
      // navigation that loses the race while navigator.onLine is true used to
      // return Response.error() too — an installed PWA on a slow link opened to
      // the browser's error page instead of the shell it had precached, and
      // "online" says only that a link exists, not that the host answers. The
      // precached shell is the right answer there: its own version guard
      // refreshes it the moment version.json does come through.
      // A SPENT BUST IS NOT A BUST: a `b` no newer than the shell this cache
      // would serve already landed (the page strips it, but a tab restored or
      // bookmarked on `?b=<n>` still carries it), so it falls back like any
      // query navigation — failing it left that URL on the browser's error
      // page offline and on a slow link, for good.
      const bustShell = isShellBust ? await shellAtLeast(url.searchParams.get("b")) : undefined;
      const failFast = online && (isVersion || (isShellBust && !bustShell));
      try {
        const res = await Promise.race([network, timeout]);
        if (res && res.ok) return res;
        if (res == null && failFast) return Response.error();
      } catch (_) {
        if (failFast) return Response.error();
      }
      // Offline: the version request reads the PRECACHED bare key. Without this
      // it fell through to the index.html fallback below and answered a JSON
      // request with the shell's HTML (survivable only because the version
      // guard swallows the parse error).
      if (isVersion) return (await matchPreferCurrent("version.json")) || Response.error();
      if (isShellBust) return bustShell || Response.error();
      return (await matchPreferCurrent(req)) || (await matchPreferCurrent("index.html")) || Response.error();
    })());
    return;
  }

  // THE BAKED ASSET PACK IS NETWORK-FIRST. assets/pack/ URLs carry no ?v= (the
  // deploy's rewrite stamps only the shell's own tags, and js/render/shared/
  // assets.js asks for bare paths), so cache-first answered a new build's JS
  // with the OLD generation's manifest and strips for the whole first session
  // after a deploy — the layer index IS the MAT id. Network first (HTTP
  // revalidation makes an unchanged file a 304), the cache when the network
  // fails or a cached copy exists and the network is slower than NAV_RACE_MS.
  if (url.pathname.includes("/assets/pack/") && !DEV_HOST) {
    packNetworkFirst(event, req);
    return;
  }

  // RECORDED RADIO VOICES ARE NETWORK-FIRST. assets/voice/*.json and *.bin are
  // fetched as unversioned pairs (js/audio/voice-pack.js); cache-first could
  // serve a stale index with a fresh bin (or the reverse) after a deploy and
  // corrupt clip offsets for the whole cache generation. Same strategy as pack.
  if (url.pathname.includes("/assets/voice/") && !DEV_HOST) {
    packNetworkFirst(event, req);
    return;
  }

  // Cache-first for everything else. Every DEPLOYED ?v= URL carries a content
  // hash (pages.yml stamps it while staging), and audio/sfx never change
  // post-release, so a cache hit is always correct — no revalidation needed.
  //
  // EXCEPT on a dev host. The committed shell reads `?v=dev` for every asset
  // (tools/gen/gen-shell.mjs; hashes exist only in the deploy's staged copy), so a
  // cache-first worker on localhost would pin the first js/css it saw for the
  // life of the cache generation. Network-first there, cache as the offline
  // fallback — tools/check/offline-precache-check.cjs still passes because the
  // fallback is the precache.
  let cacheWrite = Promise.resolve();
  const remember = (res) => {
    const copy = res.clone();
    cacheWrite = (async () => {
      const cache = await openCache(await currentCacheName());
      await cache.put(req, copy);
    })().catch(noteCacheWriteFail);
  };
  const response = (async () => {
    if (DEV_HOST && url.origin === self.location.origin) {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          remember(res);
          return res;
        }
      } catch (_) { /* offline: fall through to the cache */ }
    }
    const cached = await matchPreferCurrent(req);
    if (cached) return cached;
    // On a miss there is nothing to fall back to, so a timeout race could only
    // FAIL a slow-but-alive request (and drop its late response uncached) — a
    // no-SW page would have loaded it. Ride the network; error only on reject.
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        remember(res);
      }
      return res;
    } catch (_) { /* network rejected */ }
    return Response.error();
  })();
  // Keep the write alive without delaying a good response on version.json or
  // CacheStorage. Register synchronously while the fetch event is dispatching.
  event.waitUntil(response.then(() => cacheWrite));
  event.respondWith(response);
});
