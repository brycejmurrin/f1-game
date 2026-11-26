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
//     normal play session — and each deploy's install carries those entries
//     into its new generation (carryRuntime, #5007), so it survives the sweep.
//
// Cache name embeds version.json's build number. There is no manual cache
// bump: the deploy (pages.yml) stamps the build and content-hashes every `?v=`
// tag while staging, so each release automatically starts a fresh cache
// generation and the old one is swept on activate.
const CACHE_PREFIX = "apex26-";
// RECORDED VOICES LIVE OUTSIDE THE GENERATIONS (audit4 B8). A voice pack is 2-7 MB
// and unversioned; filed into apex26-<build> it was re-written into every new
// generation and doubled while a prior settled one was retained. cacheBuild()
// reads this name as NaN, so the stale sweep never deletes it; index.html's own
// recovery reset deletes one failed asset per apex26-<n> and leaves apex26-voice (#4479).
const VOICE_CACHE = CACHE_PREFIX + "voice";
// VOICE_CACHE IS A BOUNDED LRU of voice ids (#4219 B): a persona is ~14-18 MB and
// assets/voice ~111 MB, so every pack ever ensured must not stay forever. Keep
// the 6 most recently WRITTEN ids (four role defaults + room for a custom pick);
// an evicted id loses its .json, .bin and .opus.bin together. Recency is the
// Cache.keys() insertion order (https://w3c.github.io/ServiceWorker/#cache-keys;
// a re-put moves a key to the end). An ETag-equal response skips its write, so
// a pack in steady use keeps its slot only until 6 newer ids land; a miss is
// just a network re-download. Pruned after a put, never on the read path.
const VOICE_KEEP_IDS = 6;
// A navigation / version.json fetch races this before the cache answers.
const NAV_RACE_MS = 3000;
// A plain shell navigation that HAS a cached shell stops waiting for the network here: on a link that does not
// answer, an installed app opened to 3 s of nothing. The shell's own version guard still reloads onto a newer build
// when version.json comes through. With no cached shell (the first launch) the full race above still applies.
const SHELL_RACE_MS = 1000;
// A `?b=` bust with NO cached shell at or above b has nothing to fall back to, so
// a 3 s fail-fast only dropped a slow-but-alive fetch (#4924); it waits this long.
const BUST_WAIT_MS = 15000;
// An OPTIONAL precache asset is abandoned (and aborted) after this long WITHOUT
// PROGRESS: no headers yet, or no body chunk since the last one (#6823 17d). A
// slow link that keeps delivering is never cut off; a stalled one still is.
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
const OFFLINE_STATUS_URL = "__apex_offline_status__";
const offlineRetries = new Map();

// Default chosen backend at install: TLX (three) is the shipped picker default.
// GLX stays in the required pool separately. Scenery + data/net are the
// background pool, fetched after it (download priority only — see install).
// Runtime-only doors (WGX, track designer, XR, camera editors) stay in the
// optional Set for gen-shell lockstep with DEFERRED/LAZY_*, but are skipped at
// install — explicit opt-in; fetch handler runtime-caches on use.
// @gen-shell:sw-required-lazy
const REQUIRED_LAZY = ["js/career/career-backup.js","js/career/career-planning-ui.js","js/career/career-ui.js"];
// /@gen-shell:sw-required-lazy
const PACK_MANIFEST_KEY_PREFIX = "assets/pack/manifest.json?b=";
function isInstallCriticalOptional(u) {
  return /^js\/render\/three\//.test(u) || /^vendor\/three-/.test(u) || u.startsWith(PACK_MANIFEST_KEY_PREFIX);
}
// Default-off / explicit opt-in: still seeded in `optional` when gen-shell
// requires lockstep, but never install-precached. WGX + LAZY_EDITOR / LAZY_XR /
// LAZY_CAM_EDITOR (~510 KB raw) are title doors a race session never opens.
// Hand-authored vendors (Rapier, jsQR, trystero) are omitted from the Set
// entirely — same outcome.
function isRuntimeOnlyOptional(u) {
  return /^js\/render\/webgpu\//.test(u)
    || /^js\/editor\//.test(u)
    || /^js\/xr\//.test(u)
    || /^js\/camera\/(tuner-panel|flyby-editor)\.js$/.test(u);
}
// Each Learn lesson has its own index.html; it must never boot the game as a fallback.
function isShellDocument(url) {
  if (/\/learn\/[^/]+\/index\.html$/.test(url.pathname)) return false;
  return /\/index\.html$/.test(url.pathname) || !/\.[A-Za-z0-9]+$/.test(url.pathname);
}
function isBackgroundOptional(u) {
  return !isInstallCriticalOptional(u) && !isRuntimeOnlyOptional(u);
}

// KILL SWITCH. A deploy whose version.json carries `"swKill": true` retires
// this worker: on the next version.json it sees (the page's boot guard and
// UpdateCheck read it on every launch and foreground) it unregisters itself and
// deletes every apex26-* cache, voice included; a fresh install under the flag
// refuses to install, so the re-registration the shell makes is a no-op. Remove
// the flag in a later deploy and the next launch installs normally. Only a
// worker that already has this code can honour it.
let _killed = false;
const isKillFlag = (v) => !!(v && v.swKill === true);
async function killWorker() {
  if (_killed) return;
  _killed = true;
  swLog("warn", "kill switch: version.json asked this worker to retire; unregistering and clearing caches");
  try { if (self.registration && typeof self.registration.unregister === "function") await self.registration.unregister(); }
  catch (e) { swLog("warn", "kill switch: unregister failed: " + errMsg(e)); }
  const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
  await Promise.all(names.map((n) => caches.delete(n)));
  invalidateCacheOrder();
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
      if (isKillFlag(v)) throw new Error("Service worker retired by version.json swKill");
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

function parseLazyVersions(html) {
  const lazyV = new Map();
  try {
    const block = html.match(/<script type="application\/json" id="apex-lazy-v">([\s\S]*?)<\/script>/);
    const parsed = block ? JSON.parse(block[1]) : null;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" && /^[0-9a-f]{12}$/.test(v)) lazyV.set(k, v);
    }
  } catch (_) { /* malformed: build-keyed */ }
  return lazyV;
}

// The standalone Telemetry Detective lesson loads these scripts through stable URLs.
// Reuse the active shell's pinned bytes instead of precaching another copy.
async function matchLearnScript(url) {
  if (url.search || !/\/(?:core\/mat4|data\/telemetry-model)\.js$/.test(url.pathname)) return undefined;
  const mat4 = new URL("js/core/mat4.js", self.location.href);
  const telemetry = new URL("js/data/telemetry-model.js", self.location.href);
  if (url.href !== mat4.href && url.href !== telemetry.href) return undefined;
  const shell = await matchPreferCurrent("index.html");
  if (!shell) return undefined;
  const html = await shell.text();
  const version = url.href === mat4.href
    ? /<script\b[^>]*\bsrc="js\/core\/mat4\.js\?v=([^"]+)"/.exec(html)?.[1]
    : parseLazyVersions(html).get("js/data/telemetry-model.js") ||
      /<meta name="apex-build" content="(\d+)"/.exec(html)?.[1];
  if (!version) return undefined;
  const pinned = new URL(url.href);
  pinned.searchParams.set("v", version);
  return matchPreferCurrent(pinned.href);
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
// ~300 script requests paid for ~300 identical sorts. The order changes only
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
async function matchPreferCurrent(req, accept) {
  let ordered;
  try { ordered = await cacheOrder(); } catch (_) { ordered = []; }
  for (const name of ordered) {
    const hit = await caches.match(req, { cacheName: name });
    if (hit && (!accept || await accept(hit))) return hit;
  }
  try {
    // A different worker may have created a new generation since the order was
    // memoised. A rejected legacy entry can mask that new hit in an all-cache lookup.
    if (!accept) return await caches.match(req);
    for (const name of await caches.keys()) {
      if (ordered.includes(name)) continue;
      const hit = await caches.match(req, { cacheName: name });
      if (hit && await accept(hit)) return hit;
    }
  } catch (_) { /* cache unavailable: let the caller use the network */ }
}

// THE CACHED SHELL, ONLY WHEN IT IS AT LEAST BUILD `b`: the first generation
// in cacheOrder() holding an index.html of build >= b — a shell is only ever
// written into its own build's cache, so the cache name IS its build. The
// order is settled-first, so an older settled shell is skipped, not returned
// as a miss, when a newer unsettled cache already holds a qualifying shell
// (#3284). None (or only unnumbered caches) → undefined: a `?b=` bust newer
// than anything cached must never be answered by a stale shell, because the
// boot guard's one-shot sessionStorage key blocks a retry.
async function shellAtLeast(b) {
  const want = Number(b);
  if (!Number.isFinite(want)) return undefined;
  let ordered;
  try { ordered = await cacheOrder(); } catch (_) { return undefined; }
  for (const name of ordered) {
    if (!(cacheBuild(name) >= want)) continue;
    const hit = await caches.match("index.html", { cacheName: name });
    if (hit) return hit;
  }
  return undefined;
}

// A `?b=` BUST THE NETWORK COULD NOT ANSWER, with no shell at or above b cached
// (#6627). Response.error() left the installed iOS app on an error page with no
// URL bar or reload: the player had to kill it. The callers spend their one-shot
// sessionStorage key before navigating, so no answer here can loop. Never the
// stale shell itself under the bust URL (#3284's rule): a tiny page that
// replaces the location with the same address minus `b` (other query params and
// the #fragment kept, as the boot guard and UpdateCheck.apply keep them), a
// plain navigation that tries the network once more and falls back to the
// cached shell, whose next foreground update check retries the build. The meta
// refresh is the no-script fallback. No cached shell at all → undefined.
async function bustFallback(url) {
  try { if (!(await matchPreferCurrent("index.html"))) return undefined; } catch (_) { return undefined; }
  const target = new URL(url.href);
  target.searchParams.delete("b");
  target.hash = "";
  const to = target.href;
  const attr = to.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const js = JSON.stringify(to).replace(/</g, "\\u003c");
  return new Response('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=' + attr + '"><title>Apex 26</title>'
    + "<script>location.replace(" + js + " + location.hash)</script>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// OPPORTUNISTIC SWEEP. `activate` deletes older generations once, but a worker
// that outlives a deploy — or a fetch that opened a newer build's cache before
// that build's worker installed — leaves stale apex26-* caches behind until
// the next activate. Swept from the fetch path under the same rules `activate`
// keeps:
//   - only when the CURRENT generation finished its install (never strand a
//     client on an incomplete cache — the test holds activate to that too), and
//   - generations OLDER than the current one (never the single prior SETTLED
//     generation while a window client remains — #2194 lazy ?v= keys), and
//   - NEWER generations only when nothing can still own them (#6633 L6): a
//     partial cache a killed install left, or a rolled-back deploy's. Those
//     stayed forever, ranked, and shellAtLeast could serve them. A worker whose
//     memoised name is stale must never delete the newer cache the next worker
//     is installing into, so newerSweepable() requires this worker to BE the
//     current build's, active, with no worker installing or waiting.
// A sweep that had to KEEP that predecessor (a window was still open) does not
// latch done. Asset fetches stay quiet; the next navigation rechecks. Once
// matchAll is empty the predecessor goes. Latching done on the first sweep
// left that generation on disk for the rest of the worker's life, which is
// the common case: the first fetch happens while the tab that installed it
// is still open.
let _sweepDone = false, _sweepBusy = false, _sweepHeld = false;
// Read after caches.keys(): a newer cache in that list was created by an install
// that is still `installing`, then `waiting`, then `active`, so a registration
// that shows none of those for anyone but this worker proves it is orphaned.
// An unknown registration (none exposed) keeps everything.
function newerSweepable(build) {
  if (ownBuild() !== build) return false;
  const reg = self.registration;
  if (!reg || reg.installing || reg.waiting) return false;
  return !reg.active || reg.active.scriptURL === self.location.href;
}
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
  // #2194: an old tab still runs the previous shell after activate; its lazy
  // non-script fetches keep the booted ?v= keys. Keep exactly one prior SETTLED
  // generation while any window client remains (closed tabs → matchAll is
  // empty and the predecessor can go). Published build numbers can skip;
  // choose the newest settled generation actually present on this device.
  let prevName = null;
  const older = keys.filter((k) => cacheBuild(k) > 0 && cacheBuild(k) < build)
    .sort((a, b) => cacheBuild(b) - cacheBuild(a));
  for (const k of older) {
    if (await caches.match(INSTALL_SETTLED_URL, { cacheName: k })) { prevName = k; break; }
  }
  let retainPrev = false;
  if (prevName) {
    const cl = self.clients;
    if (cl && typeof cl.matchAll === "function") {
      const list = await cl.matchAll({ includeUncontrolled: true, type: "window" });
      retainPrev = list.length > 0;
    } else retainPrev = true;
  }
  const sweepNewer = keys.some((k) => cacheBuild(k) > build) && newerSweepable(build);
  const stale = keys.filter((k) => {
    const b = cacheBuild(k);
    if (b > build) return sweepNewer;
    if (!(b > 0 && b < build)) return false;
    if (retainPrev && k === prevName) return false;
    return true;
  });
  await Promise.all(stale.map((k) => caches.delete(k)));
  if (stale.length) invalidateCacheOrder();
  // Held, not done: a later navigation retries once the windows are gone.
  // Done: nothing older remains that a closed tab would still need.
  if (retainPrev) _sweepHeld = true;
  else { _sweepHeld = false; _sweepDone = true; }
}
function maybeSweep(event, navigate) {
  if (_sweepDone || _sweepBusy || !_cacheNameKnown) return;
  // The predecessor is retained for an open window. Recheck on navigation
  // only — an asset fetch must not walk caches.keys() again.
  if (_sweepHeld && !navigate) return;
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
    // Manifest shortcuts (Quick race / Daily / Next GP / Controller / Garage)
    // all share this 96px icon. OS usually fetches it at install, but an
    // offline re-open of the installed app still asks the SW for it (audit4 L7).
    "icons/shortcut-96.png",
    // In-game APP ICON picker sets (appearance-opts.js).
    ...["A", "B", "C", "D", "E", "F"].flatMap((s) => ["icons/shortcuts/" + s + "/favicon-32.png", "icons/shortcuts/" + s + "/apple-touch-180.png"]),
    // The vendored three.js island TLX imports at runtime. Hand-authored
    // because it is reached through the importmap, not a <script> tag, so
    // the parser below cannot see it. OPTIONAL: an install must not fail
    // over a backend most sessions never select.
    "vendor/three-0.187.0/three.webgpu.min.js",
    "vendor/three-0.187.0/three.core.min.js",
    "vendor/three-0.187.0/three.tsl.min.js",
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
    "assets/fonts/barlow-condensed-latin-600-normal.woff2",
    "assets/fonts/barlow-condensed-latin-700-normal.woff2",
    "assets/fonts/saira-apex26-800-italic.woff2",
    // @gen-shell:sw-optional
    // ROOT PAGES — answered offline under their own URL, never by the game shell
    "controller.html",
    // Shared companion scripts outside the game shell
    "js/ui/companion-return.js",
    // DEFERRED renderer backends (no <script> tag; injected on opt-in)
    "js/render/glx/shaders/glsl-chunks.js",
    "js/render/glx/shaders/glsl-lit.js",
    "js/render/glx/shaders/glsl-sky.js",
    "js/render/glx/shaders/glsl-fx.js",
    "js/render/glx/shaders/glsl-post.js",
    "js/render/glx/post.js",
    "js/render/glx/shadow.js",
    "js/render/glx/chunked.js",
    "js/render/glx/soft.js",
    "js/render/glx/glx.js",
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
    "js/render/webgpu/wgx-shadow.js",
    "js/render/webgpu/wgx-chunked.js",
    "js/render/webgpu/wgx-post.js",
    "js/render/webgpu/wgx-roadlut.js",
    "js/render/webgpu/wgx-debug-labels.js",
    "js/render/webgpu/wgx.js",
    "js/render/three/tsl-chunks.js",
    "js/render/three/tsl-viewport.js",
    "js/render/three/tsl-carsurf.js",
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
    "js/render/three/tsl-gi.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tsl-aa.js",
    "js/render/three/tlx-shadow.js",
    "js/render/three/tlx-chunked.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tlx-mem.js",
    "js/render/three/tlx-util.js",
    "js/render/three/tlx-texpool.js",
    "js/render/three/tlx.js",
    // LAZY_RACE — race payload every race needs
    "js/data/garage-entrance-motion.js",
    "js/garage/entrance-motion.js",
    "js/lighting/presets.js",
    "js/garage/garage-data.js",
    "js/garage/arrival-rows.js",
    "js/garage/hi-prims.js",
    // LAZY_RACE_SESSION — pit/radio/reliability behind startRace (title boots stub)
    "js/fx/visor-optics.js",
    "js/input/touch-button-actions.js",
    "js/data/garage-departure-motion.js",
    "js/garage/departure-wheels.js",
    "js/race/reliability.js",
    "js/core/sim-state.js",
    "js/race/damage.js",
    "js/race/damage-handling.js",
    "js/race/duel.js",
    "js/race/session-records.js",
    "js/race/medal-ledger.js",
    "js/race/pit-geom.js",
    "js/race/pit-lane.js",
    "js/race/engineer.js",
    "js/race/radio-lines.js",
    "js/race/race-facts.js",
    "js/race/spotter.js",
    "js/race/race-radio.js",
    "js/race/start-lights.js",
    "js/race/marshal-panels.js",
    "js/race/flying-start.js",
    "js/race/lap-retry.js",
    "js/race/jump-start-penalty.js",
    "js/camera/extra-rigs.js",
    "js/camera/trackside.js",
    "js/camera/cam-avoid.js",
    "js/ui/podium-beat.js",
    "js/race/podium-beat.js",
    "js/race/parc-ferme.js",
    "js/race/cooldown-lap.js",
    "js/race/ceremony.js",
    "js/race/stopped-cars.js",
    "js/race/retired-card.js",
    "js/race/driving-coach.js",
    "js/ui/hud-inputs.js",
    // LAZY_TRACK_BUILD — scenery toolkit behind ensureScenery / first Tracks.build
    "js/render/shared/mesh-detail.js",
    "js/track/scenery/graph.js",
    "js/track/scenery/models.js",
    "js/track/scenery/themes.js",
    "js/track/scenery/landmark-kit.js",
    "js/track/scenery/circuit-kit.js",
    "js/track/core/hidden-faces.js",
    "js/track/scenery/landforms.js",
    "js/track/scenery/nature.js",
    "js/track/scenery/stands.js",
    "js/track/scenery/structures.js",
    "js/track/scenery/facade.js",
    "js/track/scenery/city.js",
    "js/track/scenery/identity.js",
    "js/track/scenery/pits.js",
    "js/track/scenery/venue.js",
    "js/track/scenery/guards.js",
    "js/track/scenery/api-wrap.js",
    "js/track/scenery/region.js",
    "js/track/scenery/detail.js",
    "js/track/scenery/build-props.js",
    // LAZY_GARAGE_EXTERIOR — optional selected-circuit pit slice
    "js/garage/exterior-geometry.js",
    "js/garage/exterior.js",
    // LAZY_AUDIO — engine/panel/voice behind first sound gesture or race start
    "js/audio/signal.js",
    "js/audio/soundtrack.js",
    "js/audio/race-mix-audition.js",
    "js/audio/radio-fx.js",
    "js/audio/tone-model.js",
    "js/audio/ers-layer.js",
    "js/audio/mix-duck.js",
    "js/audio/engine.js",
    "js/audio/music-lib.js",
    "js/audio/spotify.js",
    "js/audio/rivals.js",
    "js/audio/crowd.js",
    "js/audio/car-sfx.js",
    "js/audio/voice-pack.js",
    "js/audio/battle-earcon.js",
    "js/audio/radio-voice.js",
    "js/data/circuit-lore.js",
    "js/audio/announcer-recorded.js",
    "js/audio/announcer.js",
    "js/audio/panel.js",
    "js/audio/driving-cues.js",
    // LAZY_WORKER — worker entry scripts (new Worker, never a page tag)
    "js/track/build-worker.js",
    "js/workers/bitmap-decode-worker.js",
    // LAZY_CIRCUIT + LAZY_SCENERY — per-circuit payload; a miss builds a bare/meta circuit offline
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
    // LAZY_DATA — the data hub bundle behind the DATA button
    "js/data/tab-utils.js",
    "js/data/api-transport.js",
    "js/data/api.js",
    "js/data/telemetry-context.js",
    "js/data/telemetry-replay.js",
    "js/data/telemetry-model.js",
    "js/data/telemetry-render.js",
    "js/data/telemetry-player.js",
    "js/data/telemetry-view.js",
    "js/data/telemetry.js",
    "js/data/export.js",
    "js/data/schedule.js",
    "js/data/ics.js",
    "js/data/standings.js",
    "js/data/results.js",
    "js/data/live.js",
    "js/data/real-race-script.js",
    "js/data/real-race-fetch.js",
    "js/data/real-race-tab.js",
    "js/data/hub.js",
    // LAZY_NET — the multiplayer stack behind VS FRIEND
    "js/net/bytes.js",
    "js/net/nostr.js",
    "js/net/rendezvous.js",
    "js/net/sdp.js",
    "js/net/qr.js",
    "js/net/scan.js",
    "js/net/ice.js",
    "js/net/transport.js",
    "js/net/handshake.js",
    "js/net/lobby-codes.js",
    "js/net/lobby-roster.js",
    "js/net/lobby-settings.js",
    "js/net/interp.js",
    "js/net/snapshot.js",
    "js/net/wire-schema.js",
    "js/net/session.js",
    "js/net/quali-wire.js",
    "js/net/strategy-wire.js",
    "js/net/spectate.js",
    "js/net/netplay.js",
    "js/net/lobby.js",
    "js/input/phone-pad-codec.js",
    "js/ui/touch-button-settings.js",
    "js/input/phone-pad-page.js",
    "js/input/phone-pad.js",
    "js/net/phone-pairing-ui.js",
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
    "js/editor/zones.js",
    "js/editor/profile.js",
    "js/editor/selection-panel.js",
    "js/editor/followup-tools.js",
    "js/editor/scenery-panel.js",
    "js/editor/bridge-panel.js",
    "js/editor/workspace.js",
    "js/editor/designer.js",
    // LAZY_XR — WebXR session behind navigator.xr / ENTER VR
    "js/xr/xr-plan.js",
    "js/xr/xr-rig.js",
    "js/xr/xr-input.js",
    "js/xr/xr-session.js",
    "js/xr/apex-xr.js",
    "js/xr/xr-ui.js",
    // LAZY_CAM_EDITOR — camera tuner + flyby shot editor panels
    "js/lighting/tuner-panel.js",
    "js/camera/tuner-panel.js",
    "js/camera/flyby-editor.js",
    // LAZY_CAREER_UI — CAREER screen behind the title CAREER door
    "js/career/career-backup.js",
    "js/career/career-planning-ui.js",
    "js/career/career-ui.js",
    // LAZY_UI_PRESETS — APPEARANCE LAYOUT PRESET row behind the first APPEARANCE enter
    "js/ui/desktop-graphics.js",
    "js/ui/screen-regions.js",
    "js/ui/screen-placement.js",
    "js/ui/screen-arranger.js",
    "js/ui/circuit-details-panel.js",
    "js/ui/hud-layout-editor.js",
    "js/ui/dock-toolbar.js",
    "js/ui/hud-arrange.js",
    "js/ui/look-avail.js",
    "js/ui/layout-presets.js",
    "js/ui/appearance-arrangement-picker.js",
    "js/ui/appearance-studio-ui.js",
    "js/ui/photo-studio-ui.js",
    // LAZY_SAVES_DATA — SAVES & DATA body (collect / apply / files UI) behind the SettingsExport façade
    "js/ui/save-health.js",
    "js/ui/progress-backup.js",
    "js/ui/settings-export-body.js",
    // LAZY_RESULTS_SHEET — results / TT / standings DOM behind startRace
    "js/share/share-card-data.js",
    "js/share/share-card-layout.js",
    "js/share/share-card.js",
    "js/share/share-card-chips.js",
    "js/ui/results-sheet.js",
    "js/ui/quali-sheet.js",
    // LAZY_GFX_HI — desktop EXTREME / CINEMA detail, fetched beside the backend when GfxQuality.detail() >= 2
    "js/render/shared/gfx-hi.js",
    "js/car/car-hero.js",
    "js/render/three/tsl-surface.js",
    // LAZY_PERF — BENCHMARK / PHONE TEST rig, idle-loaded after boot
    "js/perf/thermal-drift.js",
    "js/perf/soak-run.js",
    "js/perf/gpu-test-run.js",
    "js/perf/phone-recorder.js",
    "js/perf/bench-capture.js",
    "js/perf/bench-run.js",
    "js/perf/metrics-panel.js",
    // LAZY_REAL_RACE — the Data Hub real-race engine (JUMP IN / WATCH / HIGHLIGHTS)
    "js/race/tv-graphics.js",
    "js/race/replay-broadcast.js",
    "js/ui/watch-transport.js",
    "js/race/real-replay.js",
    "js/race/real-race-pace.js",
    "js/race/real-race.js",
    // LEARN — the Learn modal and bare lesson assets
    "js/learn-drills/registry.js",
    "js/ui/learn-door.js",
    "js/ui/thumb-trainer.js",
    "js/learn-drills/thumb-drill.js",
    "learn/appearance.js",
    "learn/replay.js",
    "learn/replay.css",
    "learn/sandbox.js",
    "learn/sandbox.css",
    "learn/chassis/index.html",
    "learn/chassis/lab.js",
    "learn/suspension/index.html",
    "learn/suspension/lab.js",
    "learn/deployment/index.html",
    "learn/deployment/lab.js",
    "learn/hybrid/index.html",
    "learn/hybrid/lab.js",
    "learn/brake-blend/index.html",
    "learn/brake-blend/lab.js",
    "learn/tyre-heat/index.html",
    "learn/tyre-heat/lab.js",
    "learn/racing-line/index.html",
    "learn/racing-line/lab.js",
    "learn/rain/index.html",
    "learn/rain/lab.js",
    "learn/pit-duel/index.html",
    "learn/pit-duel/lab.js",
    "learn/stint/index.html",
    "learn/stint/lab.js",
    "learn/buttons/index.html",
    "learn/buttons/lab.js",
    "learn/braking/index.html",
    "learn/braking/style.css",
    "learn/braking/lab.js",
    "learn/aero/index.html",
    "learn/aero/style.css",
    "learn/aero/lab.js",
    "learn/vsc/index.html",
    "learn/vsc/style.css",
    "learn/vsc/model.js",
    "learn/vsc/lab.js",
    "learn/telemetry/index.html",
    "learn/telemetry/style.css",
    "learn/telemetry/model.js",
    "learn/telemetry/lab.js",
    // LOCALES — manifest only until a non-English language ships
    "locales/manifest.json",
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
  // The deploy's lazy-file content hashes (tools/ci/bump-cache.mjs writes them
  // into the staged shell; R3-PHONE-8): each lazy file is seeded under the key
  // ScriptLoader.url() asks for. No block (a dev server, the committed shell) →
  // every lazy key stays `?v=<build>`, as before.
  const lazyV = parseLazyVersions(html);
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
  // script (v8.dev). LAZY_AGENT files have no <script> tag — belt and
  // suspenders if a tag is re-added. Do NOT add them to optional: that is
  // still an install-time put. Fetch-miss still cache.put on first use.
  // @gen-shell:sw-lazy-agent
  const LAZY_AGENT = ["js/render/shared/puddles.js","js/agent/agentview-raster.js","js/agent/agentview-corners.js","js/agent/agentview.js","js/agent/apex-net.js","js/agent/apex-cam.js","js/agent/apex-track.js","js/agent/apex-lobby.js","js/agent/apex-play.js","js/agent/apex-gpu-capture.js","js/agent/apex-lifecycle.js","js/perf/three-inspector.js","js/agent/apex.js","js/agent/apex-bridge.js","js/agent/bridge-link.js"];
  // /@gen-shell:sw-lazy-agent
  for (const u of [...essential]) {
    if (LAZY_AGENT.some((p) => u.includes(p))) essential.delete(u);
  }
  // A preload and its required stylesheet share one admission. Required wins;
  // leave optional-only hints/fonts in the background pool.
  for (const u of essential) optional.delete(u);
  return { essential: Array.from(essential), optional: Array.from(optional), shellResponse, lazyV, shellBuild: (/<meta name="apex-build" content="(\d+)"/.exec(html) || [])[1] };
}

// Precache reads THROUGH the HTTP cache, deliberately. Both lists hold only
// immutable URLs — executable essentials carry a content-derived `?v=` token,
// and the optionals are version-pinned by PATH (the content-named woff2s) — which is the exact condition the fetch handler below
// already relies on when it says a cache hit is always correct without
// revalidation. `cache: "no-store"` here contradicted that and made a cold
// first visit download the whole app TWICE: the page's own ~310 script tags
// (~3.3 MB raw on a measured live shell) then the same bytes again for the
// install, in parallel, on one connection. Nothing in the history justifies
// it — it arrived inside an unrelated commit and no comment defends it.
//
// The application shell is still fetched with `no-store` (see
// precacheAssetLists) because index.html is the one genuinely mutable document
// here and it is the source of truth for the tag list.
// A stamped URL is an integrity promise, including fresh network responses.
async function verifyHashedResponse(url, res) {
  const key = typeof url === "string" ? url : url.url;
  const want = /[?&]v=([0-9a-f]{12})(?:&|$)/.exec(key);
  if (!want) return;
  const subtle = typeof crypto !== "undefined" && crypto && crypto.subtle;
  if (!subtle) throw new Error("Cannot verify content hash: " + key);
  const body = await res.clone().arrayBuffer();
  const hex = Array.from(new Uint8Array(await subtle.digest("SHA-256", body)), (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.slice(0, 12) !== want[1]) throw new Error("Content hash mismatch: " + key);
}

async function cacheRequiredAsset(cache, url) {
  const mutable = url === "./" || url === "index.html" || url === "version.json";
  const res = await fetch(url, mutable ? { cache: "no-store" } : undefined);
  if (!res || !res.ok) throw new Error("Unable to precache essential asset: " + url);
  await verifyHashedResponse(url, res);
  await cache.put(url, res);
}

// A CONTENT-HASHED KEY ANOTHER GENERATION ALREADY HOLDS IS NOT DOWNLOADED AGAIN.
// `?v=<12 hex>` names the bytes, so the copy an older apex26-* cache keeps for
// that exact URL is this deploy's file — once its digest says so: a cache-first
// miss can file a NEWER deploy's body under an old key (Pages ignores the
// query), so the bytes are checked against the key before they are trusted.
// Every lazy file a deploy did not change then costs a CacheStorage copy, not
// the network (R3-PHONE-8: ~1.9 MB gzip per deploy on a returning phone).
async function reuseHashed(cache, url) {
  const want = /\?v=([0-9a-f]{12})$/.exec(url);
  const subtle = typeof crypto !== "undefined" && crypto && crypto.subtle;
  if (!want || !subtle) return false;
  try {
    const old = await caches.match(url);
    if (!old || !old.ok) return false;
    const body = await old.arrayBuffer();
    const hex = Array.from(new Uint8Array(await subtle.digest("SHA-256", body)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (hex.slice(0, 12) !== want[1]) return false;
    await cache.put(url, new Response(body, { status: 200, headers: old.headers }));
    return true;
  } catch (_) { return false; }   // the network path below still runs
}

// A PATH-PINNED FILE ANOTHER GENERATION HOLDS IS NOT DOWNLOADED AGAIN EITHER (#5007).
// `vendor/<name>-<x.y.z>/` and the content-named fonts change only by changing
// the path, so the copy any apex26-* cache keeps is this deploy's file. Before
// this, the three.js island (~1.2 MB raw) re-downloaded at every deploy.
const PATH_PINNED = /^(?:vendor\/[a-z0-9_-]+-\d+\.\d+\.\d+\/|assets\/fonts\/[^/?]+\.woff2$)/;
async function reusePinned(cache, url) {
  if (!PATH_PINNED.test(url) || url.includes("?")) return false;
  try {
    const old = await caches.match(url);
    if (!old || !old.ok) return false;
    await cache.put(url, old);
    return true;
  } catch (_) { return false; }   // the network path still runs
}

// RUNTIME ENTRIES OUTLIVE A DEPLOY (#5007). Sfx, the baked pack (`?h=<md5>`),
// streamed music and opt-in vendors (Rapier, jsQR, trystero) are cached on
// first use, never by install, so each new generation started without them and
// the sweep deleted the only copy: offline lost them, online re-downloaded them
// (~2.5 MB pack + sfx) after every deploy. Install carries them forward from the
// older generations it is about to replace, each checked against the network
// with its own validators so a changed or deleted file is not kept forever:
//   304 → the cached bytes are current: copied, no body crosses the network;
//   200 → changed: a bare URL stores the fresh body (it IS the file now), a
//         `?h=` URL is dropped (Pages ignores the query, so those bytes are a
//         different hash than the key names);
//   other status → gone from the deploy: dropped;
//   no answer → kept as is (the copy was good when written; offline beats none).
// An explicit If-None-Match / If-Modified-Since with cache "no-store" hands the
// 304 to script (https://fetch.spec.whatwg.org/ — HTTP-network-or-cache fetch);
// a 200 whose validator equals the stored one counts as unchanged too.
// Voices live in VOICE_CACHE (never swept); everything else under /assets/ or
// /vendor/ is a runtime class. Shell, ?v= script keys and markers are not
// carried: install lists those itself.
const CARRY_POOL = 4;
function isCarriedRuntime(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.includes("/assets/voice/") || isBuildKeyedManifest(url)) return false;
  return p.includes("/assets/") || p.includes("/vendor/");
}
async function carryEntry(cache, req, old) {
  const url = new URL(req.url);
  const etag = old.headers.get("ETag"), modified = old.headers.get("Last-Modified");
  if (!etag && !modified) {
    // Nothing to ask with: only an address that names its content is safe to keep.
    const rel = url.href.slice(new URL("./", self.location.href).href.length);
    if (url.search || PATH_PINNED.test(rel)) await cache.put(req, old);
    return;
  }
  const headers = {};
  if (etag) headers["If-None-Match"] = etag;
  if (modified) headers["If-Modified-Since"] = modified;
  const idle = idleDeadline();
  try {
    const init = { cache: "no-store", headers, priority: "low" };
    if (idle.signal) init.signal = idle.signal;
    let res = null;
    try { res = await Promise.race([fetch(url.href, init), idle.expired]); } catch (_) { res = null; }
    if (!res) { idle.clear(); await cache.put(req, old); return; } // no answer: keep
    // Unchanged: a 304, or a 200 carrying the same validator (an engine that
    // answered the conditional from its own HTTP cache instead of passing the
    // 304 through still reports the stored ETag / Last-Modified). Decided from
    // the headers, so an unchanged body is never read.
    const same = res.status === 304 || (res.ok && (etag ? res.headers.get("ETag") === etag : res.headers.get("Last-Modified") === modified));
    if (same) { idle.clear(); await cache.put(req, old); return; }
    if (!res.ok || url.search) return;                             // removed, or a keyed file that changed: drop
    // Changed: the new body, idle-bounded per chunk; a stall keeps the old copy.
    let fresh = null;
    try { fresh = await readIdle(res, idle); } catch (_) { fresh = null; }
    idle.clear();
    await cache.put(req, fresh || old);
  } finally { idle.clear(); }
}
async function carryRuntime(cache, name) {
  const build = cacheBuild(name);
  const sources = (await caches.keys())
    .filter((k) => cacheBuild(k) > 0 && cacheBuild(k) < build)
    .sort((a, b) => cacheBuild(b) - cacheBuild(a));
  // Keep one job per URL. For a hashed key, keep older candidates in order:
  // a legacy worker could have cached a rebaked file under the original hash.
  const jobs = new Map();
  for (const k of sources) {
    const src = await caches.open(k);
    for (const req of await src.keys()) {
      const url = new URL(req.url);
      if (!isCarriedRuntime(url)) continue;
      const job = jobs.get(req.url);
      if (!job) jobs.set(req.url, { req, hash: isHashedPackRequest(url) ? url.search.slice(3) : null, older: [src] });
      else if (job.hash) job.older.push(src);
    }
  }
  await pooled([...jobs.values()], CARRY_POOL, async ({ req, hash, older }) => {
    try {
      let current;
      try { current = await cache.match(req); } catch (_) { if (!hash) return; }
      if (current) {
        if (!hash) return;
        // An older active worker can also pre-fill the incoming generation.
        const checked = await checkedCachedPack(current, hash);
        if (checked) {
          if (checked !== current) await cache.put(req, checked);
          return;
        }
      }
      for (const src of older) {
        let old = await src.match(req).catch(() => undefined);
        if (!old || !old.ok) continue;
        if (hash) {
          old = await checkedCachedPack(old, hash);
          if (!old) continue;
        }
        // The newest valid candidate owns the HTTP validator decision, even a deletion.
        await carryEntry(cache, req, old);
        return;
      }
    } catch (_) { /* one entry never fails the install */ }
  });
}

// THE OPTIONAL DEADLINE IS AN IDLE TIMER (#6823 17d): arm() restarts it, so it
// fires only after OPTIONAL_ASSET_MS with no progress, then aborts the fetch and
// resolves `expired` with null. A 4 s wall clock dropped a large module that was
// still arriving on a slow phone link, and its retry started from byte zero.
function idleDeadline() {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null, fire = null;
  const expired = new Promise((resolve) => { fire = resolve; });
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const arm = () => {
    clear();
    timer = setTimeout(() => { timer = null; if (ctrl) ctrl.abort(); fire(null); }, OPTIONAL_ASSET_MS);
  };
  arm();
  return { signal: ctrl ? ctrl.signal : undefined, expired, arm, clear };
}
// Reads an ok response's body chunk by chunk, re-arming `idle` on each one, and
// returns an in-memory copy (null on a stall). Buffered, the later digest and
// cache.put never touch the network, so no deadline can abort them mid-write.
async function readIdle(res, idle) {
  const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
  let body;
  if (!reader) {
    idle.arm();   // one fresh idle window for an engine without a readable body stream
    body = await Promise.race([res.arrayBuffer(), idle.expired]);
    if (!body) return null;
  } else {
    const parts = [];
    let size = 0;
    for (;;) {
      idle.arm();
      const step = await Promise.race([reader.read(), idle.expired]);
      if (!step) { reader.cancel().catch(() => {}); return null; }
      if (step.done) break;
      parts.push(step.value); size += step.value.byteLength;
    }
    body = new Uint8Array(size);
    let at = 0;
    for (const part of parts) { body.set(part, at); at += part.byteLength; }
  }
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function cacheOptionalAsset(cache, url, verifyGeneration = false) {
  const idle = idleDeadline();
  try {
    // priority:"low" — a background precache must not compete with the page's own
    // loads; an engine without Fetch Priority ignores the unknown member
    // (https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#priority).
    const init = { priority: "low" };
    if (url.startsWith(PACK_MANIFEST_KEY_PREFIX)) init.cache = "no-store";
    if (idle.signal) init.signal = idle.signal;
    let res = await Promise.race([fetch(url, init), idle.expired]);
    if (res && res.ok) {
      // Retried scripts need a stamped generation; every stamped response is
      // verified, including initial optional installs. Bound body/hash work too.
      if (verifyGeneration && /^js\//.test(url) && !/\?v=([0-9a-f]{12})$/.test(url)) return false;
      res = await readIdle(res, idle);
      if (!res) return false;
      // The digest runs on the buffered body under one more idle window.
      idle.arm();
      const checked = await Promise.race([verifyHashedResponse(url, res).then(() => true), idle.expired]);
      if (!checked) return false;
      // Verified: the deadline is spent. Clear it before the put, or an abort
      // mid-write kills a good body and the asset counts as missing (#6633 L5).
      idle.clear();
      await cache.put(url, res); return true;
    }
    return false;   // 4xx/5xx or timed out: counted by install, one aggregated log line
  } catch (_) { /* optional assets must not invalidate an otherwise healthy install */ }
  finally { idle.clear(); }
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

// THE PRECACHE BODY: install runs it, and so does repairGeneration() (#6629)
// when an active worker finds its own generation evicted or unsettled.
// `onName` learns the target before the first write, so a failed install can
// clean up after itself (#6625).
async function precacheGeneration(onName) {
  const [name, urls] = await Promise.all([currentCacheName(), precacheAssetLists()]);
  if (onName) onName(name);
  const build = name.slice(CACHE_PREFIX.length);
  if (urls.shellBuild !== build) throw new Error("Application shell build does not match cache build " + build);
  const cache = await openCache(name);
  // GLX is the fallback renderer every device can run: when TLX/WGX are not
  // cached (or fail), an offline boot without it is "graphics unavailable".
  // Career UI is also required: an update must not replace working offline
  // career access with a shell whose strict lazy group was not fully cached.
  // Stamp these files exactly as ScriptLoader requests them.
  const isRequiredLazy = (u) => /^js\/render\/glx\//.test(u) || REQUIRED_LAZY.includes(u);
  const isShell = (u) => u === "./" || u === "index.html";
  // A lazy file's key: its content hash from the shell's map, else the build.
  const lazyV = urls.lazyV || new Map();
  const stampKey = (u) => u + "?v=" + (lazyV.get(u) || build);
  const required = urls.essential.filter((u) => !isShell(u)).concat(urls.optional.filter(isRequiredLazy).map(stampKey));
  await Promise.all(["./", "index.html"].map((u) => cache.put(u, urls.shellResponse())));
  await pooled(required, 6, async (u) => { if (!(await reuseHashed(cache, u)) && !(await reusePinned(cache, u))) await cacheRequiredAsset(cache, u); });
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
  // (LAZY_RACE_SESSION), js/workers/ (bitmap-decode), and the phone-pad trio
  // (codec, page, session — all three are injected, none is a shell tag).
  // Keep both path classes.
  // The stamp is the deploy's CONTENT HASH where the shell's map names one
  // (stampKey above), so an unchanged file keeps its key across deploys.
  // Seed the new build's own manifest before activation. Carrying the older
  // manifest or relying on the first online boot loses the pack after an update.
  const packManifest = PACK_MANIFEST_KEY_PREFIX + build;
  const stamped = urls.optional.map((u) =>
    /^js\/render\/(glx|webgpu|three)\/|^js\/circuits\/|^js\/core\/sim-state\.js$|^js\/audio\/|^js\/race\/|^js\/fx\/visor-optics\.js$|^js\/data\/|^js\/render\/shared\/(?:mesh-detail|gfx-hi)\.js$|^js\/car\/car-hero\.js$|^js\/garage\/(departure-wheels|entrance-motion|arrival-rows|hi-prims|exterior(?:-geometry)?)\.js$|^js\/net\/|^js\/editor\/|^js\/xr\/|^js\/camera\/(tuner-panel|flyby-editor|extra-rigs|trackside|cam-avoid)\.js$|^js\/career\/career-(ui|planning-ui|backup)\.js$|^js\/perf\/(thermal-drift|soak-run|gpu-test-run|phone-recorder|bench-capture|bench-run|metrics-panel)\.js$|^js\/input\/(?:phone-pad(?:-codec|-page)?|touch-button-actions)\.js$|^js\/ui\/(podium-beat|layout-presets|look-avail|touch-button-settings|appearance-(?:studio-ui|arrangement-picker)|companion-return|photo-studio-ui|results-sheet|quali-sheet|watch-transport|progress-backup|save-health|settings-export-body|learn-door|thumb-trainer|circuit-details-panel|hud-inputs|screen-(regions|placement|arranger)|hud-arrange|hud-layout-editor|desktop-graphics|dock-toolbar)\.js$|^js\/share\/share-card(?:-chips|-data|-layout)?\.js$|^js\/lighting\/(presets|tuner-panel)\.js$|^js\/garage\/garage-data\.js$|^js\/track\/(build-worker\.js$|scenery\/|core\/hidden-faces\.js$)|^js\/workers\/|^js\/learn-drills\//.test(u)
      ? stampKey(u) : u).filter((u) => {
        const bare = u.replace(/\?v=.*$/, "");
        // GLX and career UI went in `required`; runtime-only doors are skipped.
        return !isRequiredLazy(bare) && !isRuntimeOnlyOptional(bare);
      }).concat(packManifest);
  // INSTALL-CRITICAL first (chosen backend = TLX + three.js), then the
  // BACKGROUND pool (in the seed's order: race-entry bundles, then circuits +
  // scenery, then data / net — not runtime-only doors), then
  // SETTLED, then skipWaiting. The order of the pools is a download priority,
  // nothing more: skipWaiting() only SETS A FLAG, and the browser reads it
  // after every install extend-lifetime promise has settled
  // (https://w3c.github.io/ServiceWorker/ — Install, then Try Activate). A
  // skipWaiting between the pools — the old layout — activated nothing early
  // and only read as if it did; activation always followed SETTLED.
  const critical = stamped.filter((u) => isInstallCriticalOptional(u.replace(/\?v=.*$/, "")));
  const background = stamped.filter((u) => isBackgroundOptional(u.replace(/\?v=.*$/, "")));
  let optionalMissed = 0, firstMissed = "";
  for (const pool of [critical, background]) {
    await pooled(pool, 4, async (u) => {
      if (!(await reuseHashed(cache, u)) && !(await reusePinned(cache, u)) && !(await cacheOptionalAsset(cache, u)) && !optionalMissed++) firstMissed = u;
    });
  }
  // Runtime-only doors (WGX, designer, XR, camera editors) are never fetched
  // here, but a door the player opened keeps its file across a deploy that
  // left its content hash alone (#5007): a CacheStorage copy, never the network.
  await pooled(urls.optional.filter(isRuntimeOnlyOptional).map(stampKey), 4, (u) => reuseHashed(cache, u));
  try { await carryRuntime(cache, name); } catch (e) { swLog("warn", "runtime carry: " + errMsg(e)); }
  if (optionalMissed) swLog("warn", "precache: " + optionalMissed + " of " + stamped.length + " optional assets not cached (first: " + firstMissed + ")");
  await cache.put(OFFLINE_STATUS_URL, new Response(JSON.stringify({
    build: Number(build), required: ["./", "index.html", ...required], optional: stamped,
  }), { headers: { "Content-Type": "application/json" } }));
  await cache.put(INSTALL_SETTLED_URL, new Response("settled"));
  invalidateCacheOrder();
  return name;
}

// A FAILED INSTALL TAKES ITS PARTIAL CACHE WITH IT (#6625). The shell is written
// before the required set, so a rejected install left apex26-<N+1> holding
// index.html and part of the rest: shellAtLeast(N+1) answered the next `?b=`
// bust from it, offline the new shell's missing ?v= files missed, and it held
// iOS quota. Deleted only when unsettled AND an older SETTLED generation
// remains to serve; a first install keeps whatever it got (nothing else exists).
async function dropFailedGeneration(name) {
  const build = cacheBuild(name);
  if (!(build > 0)) return;
  const keys = await caches.keys();
  if (!keys.includes(name) || await caches.match(INSTALL_SETTLED_URL, { cacheName: name })) return;
  for (const k of keys) {
    const b = cacheBuild(k);
    if (b > 0 && b < build && await caches.match(INSTALL_SETTLED_URL, { cacheName: k })) {
      await caches.delete(name);
      invalidateCacheOrder();
      swLog("warn", "install failed: removed partial " + name + " (kept " + k + ")");
      return;
    }
  }
}

self.addEventListener("install", (event) => {
  let target = null;
  event.waitUntil((async () => {
    try { await precacheGeneration((n) => { target = n; }); } catch (e) {
      // An essential miss or an unreadable build aborts the install (the old
      // worker and its cache stay in charge). Say so, then keep the rejection.
      swLog("warn", "install failed: " + errMsg(e));
      if (target) { try { await dropFailedGeneration(target); } catch (err) { swLog("warn", "install cleanup: " + errMsg(err)); } }
      throw e;
    }
    await self.skipWaiting();
  })());
});

// SELF-REPAIR (#6629). WebKit can drop a Home Screen app's Cache Storage under
// storage pressure while keeping the registration. Install never re-runs (the
// worker bytes are unchanged), runtime puts used to re-create a marker-less
// apex26-<N>, and offline stayed broken until the next deploy. An ACTIVE worker
// that finds the generation it was registered for (`sw.js?v=<build>`) without
// INSTALL_SETTLED, with no newer worker installing or waiting, re-runs the
// precache body into it. A newer deploy fails the body's shell-build check and
// changes nothing. One attempt in flight; a settled generation is checked once;
// a failed attempt (an essential 404, a full quota) waits REPAIR_RETRY_MS before
// the next, so every launch does not re-download the whole set. `force` (the
// page saw known && !coreReady: required files gone under a SETTLED marker)
// re-runs it anyway; hashed entries already present are reused, not refetched.
const REPAIR_RETRY_MS = 10 * 60 * 1000;
let _repair = null, _repairOk = "", _repairFailedAt = -Infinity;
function ownBuild() {
  try { return Number(new URL(self.location.href).searchParams.get("v")); } catch (_) { return NaN; }
}
async function repairGeneration(force) {
  if (DEV_HOST || _killed || Date.now() - _repairFailedAt < REPAIR_RETRY_MS) return false;
  const name = await currentCacheName();
  if ((name === _repairOk && !force) || cacheBuild(name) !== ownBuild()) return false;
  const reg = self.registration;
  if (reg && (reg.installing || reg.waiting)) return false;
  if (!force && await caches.match(INSTALL_SETTLED_URL, { cacheName: name })) { _repairOk = name; return false; }
  swLog("warn", "offline cache " + name + " is incomplete; re-precaching");
  await precacheGeneration();
  _repairOk = name;
  return true;
}
function maybeRepair(force) {
  if (!_repair) {
    _repair = repairGeneration(force === true)
      .catch((e) => { _repairFailedAt = Date.now(); swLog("warn", "offline repair failed: " + errMsg(e)); return false; })
      .finally(() => { _repair = null; });
  }
  return _repair;
}

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

// THE GENERATION THIS WORKER SERVES IS A LOCAL FACT. The page asks it before
// every lazy load() (update-check.js prepareLazyLoad), and answering it with a
// NETWORK version.json read made every load wait out the page's 1.5 s timer on
// lie-fi (requests that hang while navigator.onLine is true) or a slow link —
// four one-file loads at a cold RACE! took 6 s. So: the name this worker
// already knows, else the newest SETTLED apex26-* generation (the one
// matchPreferCurrent serves first while the name is unknown), and only with
// nothing local does the network read get GENERATION_NET_MS before the answer
// is "unknown" (0: the page falls back to the registration URL's build).
const GENERATION_NET_MS = 300;
async function localGeneration() {
  if (_cacheNameKnown) return cacheBuild(_cacheNameKnown);
  let best = 0;
  for (const n of await caches.keys()) {
    const b = cacheBuild(n);
    if (b > best && await caches.match(INSTALL_SETTLED_URL, { cacheName: n })) best = b;
  }
  return best;
}
async function servedGeneration() {
  try { const local = await localGeneration(); if (local > 0) return local; } catch (_) { /* unreadable: ask the network */ }
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(0), GENERATION_NET_MS); });
  try { return await Promise.race([currentCacheName().then(cacheBuild, () => 0), late]); }
  finally { clearTimeout(timer); }
}
// Reply on the transferred port, so a page can bind the answer to the exact
// controller it queried. scriptURL's ?v= is only the registration URL: browser
// updates can execute new bytes at that SAME URL.
self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (event.data && ["apex-offline-status", "apex-offline-retry"].includes(event.data.type) && port) {
    event.waitUntil((async () => {
      try {
        const status = await offlineStatus();
        // Unknown or core-incomplete: the generation may have been evicted (#6629).
        if (!status.known || !status.coreReady) event.waitUntil(maybeRepair(!!status.known));
        if (event.data.type === "apex-offline-retry" && status._cache && status.coreReady && status._missing.length) {
          const name = CACHE_PREFIX + status.build;
          if (!offlineRetries.has(name)) {
            const retry = pooled(status._missing, 4, (u) => cacheOptionalAsset(status._cache, u, true))
              .catch((e) => swLog("warn", "offline retry: " + e.message))
              .finally(() => offlineRetries.delete(name));
            offlineRetries.set(name, retry);
            event.waitUntil(retry);
          }
          status.retrying = true;
        }
        const { _cache, _missing, ...reply } = status;
        port.postMessage({ type: "apex-offline-status", ...reply });
      } catch (_) { port.postMessage({ type: "apex-offline-status", known: false }); }
      finally { port.close(); }
    })());
    return;
  }
  if (!event.data || event.data.type !== "apex-cache-generation" || !port) return;
  event.waitUntil((async () => {
    try {
      port.postMessage({ type: "apex-cache-generation", build: (await servedGeneration()) || 0 });
    } catch (_) { port.postMessage({ type: "apex-cache-generation", build: 0 }); }
    finally { port.close(); }
  })());
});

async function offlineStatus() {
  const build = await servedGeneration();
  const name = CACHE_PREFIX + build;
  if (!build || !(await caches.keys()).includes(name)) return { known: false };
  const cache = await openCache(name), hit = await cache.match(OFFLINE_STATUS_URL);
  if (!hit) return { known: false, build };
  const record = await hit.json();
  if (record.build !== build || !Array.isArray(record.required) || !Array.isArray(record.optional)
    || record.required.length + record.optional.length > 2000
    || [...record.required, ...record.optional].some((u) => typeof u !== "string" || u.startsWith("/") || u.includes(":") || u.includes(".."))) return { known: false, build };
  const requiredHits = await Promise.all(record.required.map((u) => cache.match(u)));
  const optionalHits = await Promise.all(record.optional.map((u) => cache.match(u)));
  const missing = record.optional.filter((_, i) => !optionalHits[i]);
  return { known: true, build, coreReady: requiredHits.every(Boolean), optionalTotal: record.optional.length,
    optionalMissing: missing.length, retrying: offlineRetries.has(name), _missing: missing, _cache: cache };
}

// Unversioned same-origin assets (no ?v= on the wire): network-first with cache
// fallback. Used for assets/pack/ (MAT layer index) and assets/voice/ (.json +
// .bin pairs from voice-pack.js).
// `fixedCache` (voice): write there, skip the write when the cached copy carries
// the same ETag, and read it before the generations (older ones hold legacy copies).
// A voice key's id is its file name up to the first dot: george-radio.json,
// george-radio.bin and george-radio.opus.bin are one id.
function voiceIdOf(req) {
  return new URL(req.url).pathname.split("/").pop().split(".")[0];
}
async function pruneVoiceCache(cache) {
  const keys = await cache.keys();
  const last = new Map();   // id -> index of its newest key
  keys.forEach((r, i) => last.set(voiceIdOf(r), i));
  if (last.size <= VOICE_KEEP_IDS) return;
  const keep = new Set([...last].sort((a, b) => b[1] - a[1]).slice(0, VOICE_KEEP_IDS).map((e) => e[0]));
  await Promise.all(keys.filter((r) => !keep.has(voiceIdOf(r))).map((r) => cache.delete(r)));
}
// `staleFirst` (the build-keyed pack manifest, isBuildKeyedManifest): a cached
// copy answers at once and the network revalidates behind it.
function packNetworkFirst(event, req, fixedCache, staleFirst) {
  let cacheWrite = Promise.resolve();
  const network = fetch(req).then((res) => {
    if (res && res.ok) {
      // Clone before returning the body to the page. Neither version.json nor
      // a slow CacheStorage write may hold a successful download hostage.
      const copy = res.clone();
      cacheWrite = (async () => {
        if (fixedCache) {
          const tag = copy.headers.get("etag");
          const had = tag && await caches.match(req, { cacheName: fixedCache });
          if (had && had.headers.get("etag") === tag) return;
        }
        const cache = await openCache(fixedCache || await currentCacheName());
        await cache.put(req, copy);
        if (fixedCache === VOICE_CACHE) await pruneVoiceCache(cache).catch(() => {});
      })().catch(noteCacheWriteFail);
    }
    return res;
  });
  // Register synchronously; the late write survives even if cached content won.
  event.waitUntil(network.then(() => cacheWrite, () => undefined));
  event.respondWith((async () => {
    // A CacheStorage read that rejects (an iOS storage error) is a miss, never a
    // rejected respondWith: the awaits below sit outside any try (#6633 L4).
    const cached = (fixedCache
      ? caches.match(req, { cacheName: fixedCache }).then((hit) => hit || matchPreferCurrent(req))
      : matchPreferCurrent(req)).catch(() => undefined);
    if (staleFirst) { const early = await cached; if (early) return early; }
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

// Content-addressed pack files: assets.js asks for `assets/pack/<file>?h=<md5>`
// with the md5 the manifest records. The URL names the content, so
// a cached copy is always right and no revalidation round trip is owed; a
// rebake changes the md5, hence the URL, hence misses the old entry.
const PACK_HASHED = /^\?h=[0-9a-f]{32}$/;
function isHashedPackRequest(url) {
  return PACK_HASHED.test(url.search) && url.pathname.includes("/assets/pack/") &&
    !url.pathname.endsWith("/manifest.json");
}

// The baked manifest uses MD5 to identify bytes. Web Crypto has no MD5, so
// compute the RFC 1321 digest here before returning or storing a cache miss.
const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_CONSTANTS = Int32Array.from({ length: 64 }, (_, i) => Math.floor(2 ** 32 * Math.abs(Math.sin(i + 1))));
function packDigest(bytes) {
  const body = new DataView(bytes);
  const state = new Int32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const words = new Int32Array(16);
  function processBlock(input, offset) {
    for (let i = 0; i < 16; i++) words[i] = input.getInt32(offset + i * 4, true);
    let a = state[0], b = state[1], c = state[2], d = state[3];
    for (let i = 0; i < 64; i++) {
      let mix, word;
      if (i < 16) { mix = (b & c) | (~b & d); word = i; }
      else if (i < 32) { mix = (d & b) | (~d & c); word = (5 * i + 1) % 16; }
      else if (i < 48) { mix = b ^ c ^ d; word = (3 * i + 5) % 16; }
      else { mix = c ^ (b | ~d); word = (7 * i) % 16; }
      const shift = MD5_SHIFTS[(i >> 4) * 4 + (i % 4)];
      const sum = (a + mix + MD5_CONSTANTS[i] + words[word]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    state[0] += a; state[1] += b; state[2] += c; state[3] += d;
  }
  const end = bytes.byteLength - bytes.byteLength % 64;
  for (let offset = 0; offset < end; offset += 64) processBlock(body, offset);
  const remainder = bytes.byteLength - end;
  const tail = new Uint8Array(remainder < 56 ? 64 : 128);
  tail.set(new Uint8Array(bytes, end));
  tail[remainder] = 0x80;
  const padded = new DataView(tail.buffer);
  const bits = bytes.byteLength * 8;
  padded.setUint32(tail.length - 8, bits, true);
  padded.setUint32(tail.length - 4, Math.floor(bits / 2 ** 32), true);
  for (let offset = 0; offset < tail.length; offset += 64) processBlock(padded, offset);
  let hex = "";
  for (const word of state) {
    for (let shift = 0; shift < 32; shift += 8) hex += ((word >>> shift) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}
// Stamp only copies admitted to CacheStorage. A retained legacy generation
// (or a newer cache opened early by its old worker) may contain unverified bytes.
const VERIFIED_PACK_HEADER = "X-Apex-Verified-Pack-MD5";
async function verifiedPackCopy(response, hash) {
  const body = await response.clone().arrayBuffer();
  if (packDigest(body) !== hash) return null;
  const copy = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  copy.headers.set(VERIFIED_PACK_HEADER, hash);
  return copy;
}
async function checkedCachedPack(response, hash) {
  if (response.headers.get(VERIFIED_PACK_HEADER) === hash) return response;
  try { return await verifiedPackCopy(response, hash); } catch (_) { return null; }
}
// THE PACK MANIFEST UNDER THE PAGE'S BUILD (#5629): assets.js asks for
// `assets/pack/manifest.json?b=<shell build>`. One deploy ships one manifest, so
// a copy cached under that key was this build's (or, when the fetch crossed a
// deploy, the newer one, which network-first served as well): it answers at
// once and the network revalidates behind it, instead of a stalled link holding
// the pack — and the models waiting on it — for NAV_RACE_MS. The key is the
// shell's build, not this worker's memoised version.json read, so a worker that
// outlived a deploy cannot hand the new shell the old layer index. A new build
// asks a new key, so the key is never carried into the next generation.
const PACK_BUILD_KEY = /^\?b=[1-9][0-9]{0,9}$/;
function isBuildKeyedManifest(url) {
  return PACK_BUILD_KEY.test(url.search) && url.pathname.endsWith("/assets/pack/manifest.json");
}
function packCacheFirst(event, req, hash) {
  let cacheWrite = Promise.resolve();
  function store(copy) {
    cacheWrite = (async () => {
      const cache = await openCache(await currentCacheName());
      await cache.put(req, copy);
    })().catch(noteCacheWriteFail);
  }
  const response = (async () => {
    const hit = await matchPreferCurrent(req, async (candidate) => {
      const checked = await checkedCachedPack(candidate, hash);
      if (!checked) return false;
      if (checked !== candidate) store(checked);   // warm hits need neither a body read nor a digest
      return true;
    }).catch(() => undefined);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const checked = await verifiedPackCopy(res, hash);
        if (!checked) return Response.error();
        store(checked);
      }
      return res;
    } catch (_) { return Response.error(); }
  })();
  event.waitUntil(response.then(() => cacheWrite, () => undefined));
  event.respondWith(response);
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
  if (_killed) return;   // retired: the network answers until this page navigates away
  maybeSweep(event, req.mode === "navigate");

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
  const isShellBust = req.mode === "navigate" && isShellDocument(url) && url.searchParams.has("b");
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
    let cacheWrite = Promise.resolve();
    const network = fetch(req, { cache: isVersion || isShellBust ? "no-store" : "no-cache" }).then((res) => {
      if (res && res.ok && isVersion) {
        // The kill switch is read off the version.json the page already asks for.
        const copy = res.clone();
        cacheWrite = copy.json().then((v) => { if (isKillFlag(v)) return killWorker(); }, () => {})
          .catch((e) => swLog("warn", "kill switch failed: " + errMsg(e)));
      }
      if (res && res.ok && !isVersion && url.search === "") {
        // Clone before the page can consume the body. Maintenance belongs to
        // waitUntil, so generation lookup and slow puts cannot delay navigation.
        const copy = res.clone();
        cacheWrite = (async () => {
          const name = await currentCacheName();
          // Require a matching apex-build meta. A captive portal / interstitial
          // that returns HTTP 200 HTML without the marker must not replace the
          // shell (#3293). Missing meta used to fall through via `!m` and get
          // stored as this generation's index.html.
          const m = /<meta name="apex-build" content="(\d+)"/.exec(await copy.clone().text());
          if (m && CACHE_PREFIX + m[1] === name) {
            const cache = await openCache(name);
            await cache.put(req, copy);
          }
        })().catch(noteCacheWriteFail);
      }
      return res;
    });
    // Register during dispatch, including when a cache fallback wins the race.
    const written = network.then(() => cacheWrite, () => undefined);
    const answer = (async () => {
      const online = typeof navigator !== "undefined" && navigator.onLine;
      // FAIL FAST ONLY WHERE A STALE ANSWER IS WORSE THAN NO ANSWER: version.json
      // (a stale build number makes the shell guard skip its reload). The `?b=`
      // bust used to fail fast too, but in the installed iOS app an error page
      // has no reload control: a bust the network cannot answer (non-ok, slow
      // past BUST_WAIT_MS, offline) now gets bustFallback()'s hop to "./" (#6627). A PLAIN
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
      const failFast = online && isVersion;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), isShellBust && !bustShell ? BUST_WAIT_MS : NAV_RACE_MS));
      try {
        let res;
        if (req.mode === "navigate" && !isShellBust && isShellDocument(url)) {
          const early = new Promise((resolve) => setTimeout(() => resolve(undefined), SHELL_RACE_MS));
          res = await Promise.race([network, early]);
          if (res === undefined) {
            const bare = new URL(url.href);
            bare.search = ""; bare.hash = "";
            const shell = (await matchPreferCurrent(req)) || (url.search && await matchPreferCurrent(bare.href)) || (await matchPreferCurrent("index.html"));
            if (shell) return shell;
            res = await Promise.race([network, timeout]);
          }
        } else res = await Promise.race([network, timeout]);
        if (res && res.ok) return res;
        // A NON-OK version.json while online (a 503 or 404 mid-deploy) is passed
        // through as-is: the cached copy below would hand the guard a stale build
        // number, which is exactly what failing fast exists to prevent (#6633 L3).
        if (failFast) return res || Response.error();
      } catch (_) {
        if (failFast) return Response.error();
      }
      // Offline: the version request reads the PRECACHED bare key. Without this
      // it fell through to the index.html fallback below and answered a JSON
      // request with the shell's HTML (survivable only because the version
      // guard swallows the parse error).
      if (isVersion) return (await matchPreferCurrent("version.json")) || Response.error();
      if (isShellBust) return bustShell || (await bustFallback(url)) || Response.error();
      const ownURL = new URL(url.href);
      ownURL.search = "";
      ownURL.hash = "";
      const own = (await matchPreferCurrent(req)) || (url.search && await matchPreferCurrent(ownURL.href));
      if (own) return own;
      // The GAME shell answers only the game's own address ("/", a directory
      // URL, "/index.html", or an extensionless deep link). Another root page
      // (controller.html — the "Phone controller" shortcut and the QR landing
      // page — bench.html, cockpit-view.html) that lost the race used to open
      // the game instead; let its late network answer win, else fail honestly.
      if (isShellDocument(url)) {
        const shell = await matchPreferCurrent("index.html");
        if (shell) return shell;
      }
      try { const late = await network; if (late) return late; } catch (_) { /* offline: nothing to show */ }
      return Response.error();
    })();
    event.respondWith(answer);
    // After the page has its answer, a plain online launch checks that this
    // worker's generation is still whole and re-precaches it if not (#6629).
    const repair = req.mode === "navigate" && url.search === "" && isShellDocument(url)
      && !(typeof navigator !== "undefined" && navigator.onLine === false);
    event.waitUntil(repair ? Promise.all([written, answer.then(maybeRepair, maybeRepair)]) : written);
    return;
  }

  // THE BAKED ASSET PACK IS NETWORK-FIRST. assets/pack/ URLs carry no ?v= (the
  // deploy's rewrite stamps only the shell's own tags, and js/render/shared/
  // assets.js asks for bare paths), so cache-first answered a new build's JS
  // with the OLD generation's manifest and strips for the whole first session
  // after a deploy — the layer index IS the MAT id. Network first (HTTP
  // revalidation makes an unchanged file a 304), the cache when the network
  // fails or a cached copy exists and the network is slower than NAV_RACE_MS.
  // The exception is a `?h=<md5>` file (isHashedPackRequest): content-addressed,
  // so cache-first. The build-keyed manifest also answers from cache while
  // revalidating in the background.
  if (url.pathname.includes("/assets/pack/") && !DEV_HOST) {
    if (isHashedPackRequest(url)) packCacheFirst(event, req, url.search.slice(3));
    else packNetworkFirst(event, req, null, isBuildKeyedManifest(url));
    return;
  }

  // RECORDED RADIO VOICES ARE NETWORK-FIRST. assets/voice/*.json and *.bin are
  // fetched as unversioned pairs (js/audio/voice-pack.js); cache-first could
  // keep a rebaked voice stale for the whole cache generation. Same strategy
  // as pack, but filed in the fixed VOICE_CACHE (not each generation). Each response
  // races independently; voice-pack.js verifies the manifest's binary digest
  // before accepting a pair (including old bare keys).
  if (url.pathname.includes("/assets/voice/") && !DEV_HOST) {
    packNetworkFirst(event, req, VOICE_CACHE);
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
  const remember = (res, verified = false) => {
    const copy = res.clone();
    cacheWrite = (async () => {
      if (!verified) await verifyHashedResponse(req, copy);
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
    const cached = await matchLearnScript(url) || await matchPreferCurrent(req);
    if (cached) return cached;
    // On a miss there is nothing to fall back to, so a timeout race could only
    // FAIL a slow-but-alive request (and drop its late response uncached) — a
    // no-SW page would have loaded it. Ride the network; error only on reject.
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        await verifyHashedResponse(req, res);
        remember(res, true);
      }
      return res;
    } catch (_) { /* network rejected or content hash mismatched */ }
    return Response.error();
  })();
  // Keep the write alive without delaying a good response on version.json or
  // CacheStorage. Register synchronously while the fetch event is dispatching.
  event.waitUntil(response.then(() => cacheWrite));
  event.respondWith(response);
});
