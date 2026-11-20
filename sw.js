"use strict";
const CACHE_PREFIX = "apex26-";
const VOICE_CACHE = CACHE_PREFIX + "voice";
const VOICE_KEEP_IDS = 6;
const NAV_RACE_MS = 3000;
const SHELL_RACE_MS = 1000;
const BUST_WAIT_MS = 15000;
const OPTIONAL_ASSET_MS = 4000;
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test((self.location && self.location.hostname) || "");
const INSTALL_COMPLETE_URL = "__apex_install_complete__";
const INSTALL_SETTLED_URL = "__apex_install_settled__";
const OFFLINE_STATUS_URL = "__apex_offline_status__";
const offlineRetries = new Map();

const REQUIRED_LAZY = ["js/career/career-backup.js","js/career/career-planning-ui.js","js/career/career-ui.js"];
function isInstallCriticalOptional(u) {
  return /^js\/render\/three\//.test(u) || /^vendor\/three-/.test(u);
}
function isRuntimeOnlyOptional(u) {
  return /^js\/render\/webgpu\//.test(u)
    || /^js\/editor\//.test(u)
    || /^js\/xr\//.test(u)
    || /^js\/camera\/(tuner-panel|flyby-editor)\.js$/.test(u);
}
function isShellDocument(url) {
  return /\/index\.html$/.test(url.pathname) || !/\.[A-Za-z0-9]+$/.test(url.pathname);
}
function isBackgroundOptional(u) {
  return !isInstallCriticalOptional(u) && !isRuntimeOnlyOptional(u);
}

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
      _cacheNamePromise = null;
      throw e;
    });
  return _cacheNamePromise;
}

function swLog(level, msg) {
  try {
    const cl = self.clients;
    if (!cl || typeof cl.matchAll !== "function") return;
    Promise.resolve(cl.matchAll({ includeUncontrolled: true, type: "window" })).then((list) => {
      for (const c of list || []) {
        try { c.postMessage({ type: "apex-sw-log", level, msg: String(msg) }); } catch (_) {  }
      }
    }, () => {});
  } catch (_) {  }
}
const errMsg = (e) => (e && e.message) || String(e);
let _cacheWriteFails = 0;
function noteCacheWriteFail(e) {
  if (++_cacheWriteFails === 1) swLog("warn", "cache write failed: " + errMsg(e) + " (later failures in this worker are not reported)");
}

function cacheBuild(name) {
  if (typeof name !== "string" || !name.startsWith(CACHE_PREFIX)) return NaN;
  const n = Number(name.slice(CACHE_PREFIX.length));
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

let _cacheOrder = null;
function invalidateCacheOrder() { _cacheOrder = null; }
async function computeCacheOrder(current) {
  const names = await caches.keys();
  const done = new Map();
  await Promise.all(names.map(async (n) => {
    let d = 0;
    try {
      if (await caches.match(INSTALL_SETTLED_URL, { cacheName: n })) d = 2;
      else if (await caches.match(INSTALL_COMPLETE_URL, { cacheName: n })) d = 1;
    } catch (_) {  }
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
    (e) => { if (_cacheOrder === memo) _cacheOrder = null; throw e; });
  _cacheOrder = memo;
  return memo.promise;
}
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
  try { return await caches.match(req); } catch (_) { return undefined; }
}

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

let _sweepDone = false, _sweepBusy = false, _sweepHeld = false;
async function sweepStaleCaches() {
  const name = _cacheNameKnown;
  const build = cacheBuild(name);
  if (!(build > 0)) return;
  const keys = await caches.keys();
  if (!keys.includes(name)) return;
  if (!(await caches.match(INSTALL_SETTLED_URL, { cacheName: name }))) return;
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
  const stale = keys.filter((k) => {
    const b = cacheBuild(k);
    if (!(b > 0 && b < build)) return false;
    if (retainPrev && k === prevName) return false;
    return true;
  });
  await Promise.all(stale.map((k) => caches.delete(k)));
  if (stale.length) invalidateCacheOrder();
  if (retainPrev) _sweepHeld = true;
  else { _sweepHeld = false; _sweepDone = true; }
}
function maybeSweep(event, navigate) {
  if (_sweepDone || _sweepBusy || !_cacheNameKnown) return;
  if (_sweepHeld && !navigate) return;
  _sweepBusy = true;
  event.waitUntil(sweepStaleCaches().catch((e) => { swLog("warn", "stale-cache sweep failed: " + errMsg(e)); }).finally(() => { _sweepBusy = false; }));
}

async function precacheAssetLists() {
  const essential = new Set(["./", "index.html", "version.json"]);
  const optional = new Set(["manifest.json",
    "icons/icon-180.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/shortcut-96.png",
    ...["A", "B", "C", "D", "E", "F"].flatMap((s) => ["icons/shortcuts/" + s + "/favicon-32.png", "icons/shortcuts/" + s + "/apple-touch-180.png"]),
    "vendor/three-0.187.0/three.webgpu.min.js",
    "vendor/three-0.187.0/three.core.min.js",
    "vendor/three-0.187.0/three.tsl.min.js",
    "assets/fonts/titillium-web-latin-400-normal.woff2",
    "assets/fonts/titillium-web-latin-600-normal.woff2",
    "assets/fonts/titillium-web-latin-700-normal.woff2",
    "assets/fonts/titillium-web-latin-700-italic.woff2",
    "assets/fonts/barlow-condensed-latin-600-normal.woff2",
    "assets/fonts/barlow-condensed-latin-700-normal.woff2",
    "assets/fonts/saira-apex26-800-italic.woff2",
    "controller.html",
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
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tlx-shadow.js",
    "js/render/three/tlx-chunked.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tlx-mem.js",
    "js/render/three/tlx.js",
    "js/data/garage-entrance-motion.js",
    "js/garage/entrance-motion.js",
    "js/lighting/presets.js",
    "js/garage/garage-data.js",
    "js/garage/arrival-rows.js",
    "js/data/garage-departure-motion.js",
    "js/garage/departure-wheels.js",
    "js/race/reliability.js",
    "js/race/damage.js",
    "js/race/damage-handling.js",
    "js/race/duel.js",
    "js/race/session-records.js",
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
    "js/race/jump-start-penalty.js",
    "js/ui/podium-beat.js",
    "js/race/podium-beat.js",
    "js/race/parc-ferme.js",
    "js/race/cooldown-lap.js",
    "js/race/ceremony.js",
    "js/race/stopped-cars.js",
    "js/race/retired-card.js",
    "js/race/driving-coach.js",
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
    "js/track/scenery/build-props.js",
    "js/garage/exterior-geometry.js",
    "js/garage/exterior.js",
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
    "js/audio/announcer-recorded.js",
    "js/audio/announcer.js",
    "js/audio/panel.js",
    "js/audio/driving-cues.js",
    "js/track/build-worker.js",
    "js/workers/bitmap-decode-worker.js",
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
    "js/data/ics.js",
    "js/data/standings.js",
    "js/data/results.js",
    "js/data/live.js",
    "js/data/real-race-script.js",
    "js/data/real-race-fetch.js",
    "js/data/real-race-tab.js",
    "js/data/hub.js",
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
    "js/net/session.js",
    "js/net/quali-wire.js",
    "js/net/strategy-wire.js",
    "js/net/spectate.js",
    "js/net/netplay.js",
    "js/net/lobby.js",
    "js/input/phone-pad-codec.js",
    "js/input/phone-pad-page.js",
    "js/input/phone-pad.js",
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
    "js/xr/xr-plan.js",
    "js/xr/xr-rig.js",
    "js/xr/xr-input.js",
    "js/xr/xr-session.js",
    "js/xr/apex-xr.js",
    "js/xr/xr-ui.js",
    "js/camera/tuner-panel.js",
    "js/camera/flyby-editor.js",
    "js/career/career-backup.js",
    "js/career/career-planning-ui.js",
    "js/career/career-ui.js",
    "js/ui/look-avail.js",
    "js/ui/layout-presets.js",
    "js/share/share-card-chips.js",
    "js/ui/results-sheet.js",
    "js/ui/quali-sheet.js",
    "js/perf/soak-run.js",
    "js/perf/gpu-test-run.js",
    "js/perf/phone-recorder.js",
    "js/perf/bench-capture.js",
    "js/perf/bench-run.js",
    "js/perf/metrics-panel.js",
    "js/ui/watch-transport.js",
    "js/race/real-replay.js",
    "js/race/real-race-pace.js",
    "js/race/real-race.js",
    "locales/manifest.json",
  ]);
  const shell = await fetch("index.html", { cache: "no-store" });
  if (!shell || !shell.ok) throw new Error("Unable to fetch the application shell");
  const html = await shell.text();
  const shellHeaders = {};
  try { shell.headers.forEach((v, k) => { shellHeaders[k] = v; }); } catch (_) {  }
  const shellResponse = () => new Response(html, { status: 200, headers: shellHeaders });
  const lazyV = new Map();
  try {
    const block = html.match(/<script type="application\/json" id="apex-lazy-v">([\s\S]*?)<\/script>/);
    const parsed = block ? JSON.parse(block[1]) : null;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" && /^[0-9a-f]{12}$/.test(v)) lazyV.set(k, v);
    }
  } catch (_) {  }
  const re = /<(script|link)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const ref = m[0].match(/\b(?:src|href)="([^"]+)"/i);
    if (!ref) continue;
    const u = ref[1];
    if (/^([a-z]+:)?\/\//i.test(u)) continue;
    if (m[1].toLowerCase() === "script" || /\brel="stylesheet"/i.test(m[0])) {
      essential.add(u);
    } else {
      optional.add(u);
    }
  }
  const LAZY_AGENT = ["js/agent/agentview-raster.js","js/agent/agentview-corners.js","js/agent/agentview.js","js/agent/apex-net.js","js/agent/apex-cam.js","js/agent/apex-track.js","js/agent/apex-lobby.js","js/agent/apex-gpu-capture.js","js/agent/apex-lifecycle.js","js/perf/three-inspector.js","js/agent/apex.js","js/agent/apex-bridge.js","js/agent/bridge-link.js"];
  for (const u of [...essential]) {
    if (LAZY_AGENT.some((p) => u.includes(p))) essential.delete(u);
  }
  for (const u of essential) optional.delete(u);
  return { essential: Array.from(essential), optional: Array.from(optional), shellResponse, lazyV, shellBuild: (/<meta name="apex-build" content="(\d+)"/.exec(html) || [])[1] };
}

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
  } catch (_) { return false; }
}

const PATH_PINNED = /^(?:vendor\/[a-z0-9_-]+-\d+\.\d+\.\d+\/|assets\/fonts\/[^/?]+\.woff2$)/;
async function reusePinned(cache, url) {
  if (!PATH_PINNED.test(url) || url.includes("?")) return false;
  try {
    const old = await caches.match(url);
    if (!old || !old.ok) return false;
    await cache.put(url, old);
    return true;
  } catch (_) { return false; }
}

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
    const rel = url.href.slice(new URL("./", self.location.href).href.length);
    if (url.search || PATH_PINNED.test(rel)) await cache.put(req, old);
    return;
  }
  const headers = {};
  if (etag) headers["If-None-Match"] = etag;
  if (modified) headers["If-Modified-Since"] = modified;
  let timeout = null;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  try {
    const expired = new Promise((resolve) => {
      timeout = setTimeout(() => { if (ctrl) ctrl.abort(); resolve(null); }, OPTIONAL_ASSET_MS);
    });
    const init = { cache: "no-store", headers, priority: "low" };
    if (ctrl) init.signal = ctrl.signal;
    let res = null;
    try { res = await Promise.race([fetch(url.href, init), expired]); } catch (_) { res = null; }
    if (!res) { await cache.put(req, old); return; }
    const same = res.status === 304 || (res.ok && (etag ? res.headers.get("ETag") === etag : res.headers.get("Last-Modified") === modified));
    if (same) { await cache.put(req, old); return; }
    if (res.ok && !url.search) await cache.put(req, res);
  } finally { if (timeout !== null) clearTimeout(timeout); }
}
async function carryRuntime(cache, name) {
  const build = cacheBuild(name);
  const sources = (await caches.keys())
    .filter((k) => cacheBuild(k) > 0 && cacheBuild(k) < build)
    .sort((a, b) => cacheBuild(b) - cacheBuild(a));
  const seen = new Set();
  const jobs = [];
  for (const k of sources) {
    const src = await caches.open(k);
    for (const req of await src.keys()) {
      if (seen.has(req.url) || !isCarriedRuntime(new URL(req.url))) continue;
      seen.add(req.url);
      jobs.push({ src, req });
    }
  }
  let carried = 0;
  await pooled(jobs, CARRY_POOL, async ({ src, req }) => {
    try {
      if (await cache.match(req)) return;
      const old = await src.match(req);
      if (old && old.ok) { await carryEntry(cache, req, old); carried++; }
    } catch (_) {  }
  });
  return carried;
}

async function cacheOptionalAsset(cache, url, verifyGeneration = false) {
  let timeout = null;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  try {
    const expired = new Promise((resolve) => {
      timeout = setTimeout(() => {
        if (ctrl) ctrl.abort();
        resolve(null);
      }, OPTIONAL_ASSET_MS);
    });
    const init = { priority: "low" };
    if (ctrl) init.signal = ctrl.signal;
    const res = await Promise.race([fetch(url, init), expired]);
    if (res && res.ok) {
      if (verifyGeneration && /^js\//.test(url) && !/\?v=([0-9a-f]{12})$/.test(url)) return false;
      const checked = await Promise.race([verifyHashedResponse(url, res).then(() => true), expired]);
      if (!checked) return false;
      await cache.put(url, res); return true;
    }
    return false;
  } catch (_) {  }
  finally { if (timeout !== null) clearTimeout(timeout); }
  return false;
}

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
    const build = name.slice(CACHE_PREFIX.length);
    if (urls.shellBuild !== build) throw new Error("Application shell build does not match cache build " + build);
    const cache = await openCache(name);
    const isRequiredLazy = (u) => /^js\/render\/glx\//.test(u) || REQUIRED_LAZY.includes(u);
    const isShell = (u) => u === "./" || u === "index.html";
    const lazyV = urls.lazyV || new Map();
    const stampKey = (u) => u + "?v=" + (lazyV.get(u) || build);
    const required = urls.essential.filter((u) => !isShell(u)).concat(urls.optional.filter(isRequiredLazy).map(stampKey));
    await Promise.all(["./", "index.html"].map((u) => cache.put(u, urls.shellResponse())));
    await pooled(required, 6, async (u) => { if (!(await reuseHashed(cache, u)) && !(await reusePinned(cache, u))) await cacheRequiredAsset(cache, u); });
    await cache.put(INSTALL_COMPLETE_URL, new Response("complete"));
    invalidateCacheOrder();
    const stamped = urls.optional.map((u) =>
      /^js\/render\/(glx|webgpu|three)\/|^js\/circuits\/|^js\/audio\/|^js\/race\/|^js\/data\/|^js\/garage\/(departure-wheels|entrance-motion|arrival-rows|exterior(?:-geometry)?)\.js$|^js\/net\/|^js\/editor\/|^js\/xr\/|^js\/camera\/(tuner-panel|flyby-editor)\.js$|^js\/career\/career-(ui|planning-ui|backup)\.js$|^js\/perf\/(soak-run|gpu-test-run|phone-recorder|bench-capture|bench-run|metrics-panel)\.js$|^js\/input\/phone-pad(?:-codec|-page)?\.js$|^js\/ui\/(podium-beat|layout-presets|look-avail|results-sheet|quali-sheet|watch-transport)\.js$|^js\/share\/share-card-chips\.js$|^js\/lighting\/presets\.js$|^js\/garage\/garage-data\.js$|^js\/track\/(build-worker\.js$|scenery\/|core\/hidden-faces\.js$)|^js\/workers\//.test(u)
        ? stampKey(u) : u).filter((u) => {
          const bare = u.replace(/\?v=.*$/, "");
          return !isRequiredLazy(bare) && !isRuntimeOnlyOptional(bare);
        });
    const critical = stamped.filter((u) => isInstallCriticalOptional(u.replace(/\?v=.*$/, "")));
    const background = stamped.filter((u) => isBackgroundOptional(u.replace(/\?v=.*$/, "")));
    let optionalMissed = 0, firstMissed = "";
    for (const pool of [critical, background]) {
      await pooled(pool, 4, async (u) => {
        if (!(await reuseHashed(cache, u)) && !(await reusePinned(cache, u)) && !(await cacheOptionalAsset(cache, u)) && !optionalMissed++) firstMissed = u;
      });
    }
    await pooled(urls.optional.filter(isRuntimeOnlyOptional).map(stampKey), 4, (u) => reuseHashed(cache, u));
    try { await carryRuntime(cache, name); } catch (e) { swLog("warn", "runtime carry: " + errMsg(e)); }
    if (optionalMissed) swLog("warn", "precache: " + optionalMissed + " of " + stamped.length + " optional assets not cached (first: " + firstMissed + ")");
    await cache.put(OFFLINE_STATUS_URL, new Response(JSON.stringify({
      build: Number(build), required: ["./", "index.html", ...required], optional: stamped,
    }), { headers: { "Content-Type": "application/json" } }));
    await cache.put(INSTALL_SETTLED_URL, new Response("settled"));
    invalidateCacheOrder();
    await self.skipWaiting();
  })().catch((e) => {
    swLog("warn", "install failed: " + errMsg(e));
    throw e;
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const name = await currentCacheName();
    await sweepStaleCaches();
    invalidateCacheOrder();
    await self.clients.claim();
    swLog("info", "activated " + name);
  })().catch((e) => { swLog("warn", "activate failed: " + errMsg(e)); throw e; }));
});

const GENERATION_NET_MS = 300;
async function localGeneration() {
  if (_cacheNameKnown && await caches.match(INSTALL_SETTLED_URL, { cacheName: _cacheNameKnown })) return cacheBuild(_cacheNameKnown);
  let best = 0;
  for (const n of await caches.keys()) {
    const b = cacheBuild(n);
    if (b > best && await caches.match(INSTALL_SETTLED_URL, { cacheName: n })) best = b;
  }
  return best;
}
async function servedGeneration() {
  try { const local = await localGeneration(); if (local > 0) return local; } catch (_) {  }
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(0), GENERATION_NET_MS); });
  try { return await Promise.race([currentCacheName().then(cacheBuild, () => 0), late]); }
  finally { clearTimeout(timer); }
}
self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (event.data && ["apex-offline-status", "apex-offline-retry"].includes(event.data.type) && port) {
    event.waitUntil((async () => {
      try {
        const status = await offlineStatus();
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

function voiceIdOf(req) {
  return new URL(req.url).pathname.split("/").pop().split(".")[0];
}
async function pruneVoiceCache(cache) {
  const keys = await cache.keys();
  const last = new Map();
  keys.forEach((r, i) => last.set(voiceIdOf(r), i));
  if (last.size <= VOICE_KEEP_IDS) return;
  const keep = new Set([...last].sort((a, b) => b[1] - a[1]).slice(0, VOICE_KEEP_IDS).map((e) => e[0]));
  await Promise.all(keys.filter((r) => !keep.has(voiceIdOf(r))).map((r) => cache.delete(r)));
}
function packNetworkFirst(event, req, fixedCache, staleFirst) {
  let cacheWrite = Promise.resolve();
  const network = fetch(req).then((res) => {
    if (res && res.ok) {
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
  event.waitUntil(network.then(() => cacheWrite, () => undefined));
  event.respondWith((async () => {
    const cached = fixedCache
      ? caches.match(req, { cacheName: fixedCache }).then((hit) => hit || matchPreferCurrent(req))
      : matchPreferCurrent(req);
    if (staleFirst) { const early = await cached; if (early) return early; }
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_RACE_MS));
    try {
      const res = await Promise.race([network, timeout]);
      if (res && res.ok) return res;
    } catch (_) {  }
    const hit = await cached;
    if (hit) return hit;
    try { return await network; } catch (_) { return Response.error(); }
  })());
}

const PACK_HASHED = /^\?h=[0-9a-f]{32}$/;
function isHashedPackRequest(url) {
  return PACK_HASHED.test(url.search) && url.pathname.includes("/assets/pack/") &&
    !url.pathname.endsWith("/manifest.json");
}
const PACK_BUILD_KEY = /^\?b=[1-9][0-9]{0,9}$/;
function isBuildKeyedManifest(url) {
  return PACK_BUILD_KEY.test(url.search) && url.pathname.endsWith("/assets/pack/manifest.json");
}
function packCacheFirst(event, req) {
  let cacheWrite = Promise.resolve();
  const response = (async () => {
    const hit = await matchPreferCurrent(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        cacheWrite = (async () => {
          const cache = await openCache(await currentCacheName());
          await cache.put(req, copy);
        })().catch(noteCacheWriteFail);
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
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;
  if (_killed) return;
  maybeSweep(event, req.mode === "navigate");

  if (url.pathname.includes("/assets/music/") && req.headers && req.headers.get && req.headers.get("range")) return;

  const isVersion = url.pathname.endsWith("version.json");
  const isShellBust = req.mode === "navigate" && isShellDocument(url) && url.searchParams.has("b");
  if (req.mode === "navigate" || isVersion) {
    let cacheWrite = Promise.resolve();
    const network = fetch(req, { cache: isVersion || isShellBust ? "no-store" : "no-cache" }).then((res) => {
      if (res && res.ok && isVersion) {
        const copy = res.clone();
        cacheWrite = copy.json().then((v) => { if (isKillFlag(v)) return killWorker(); }, () => {})
          .catch((e) => swLog("warn", "kill switch failed: " + errMsg(e)));
      }
      if (res && res.ok && !isVersion && url.search === "") {
        const copy = res.clone();
        cacheWrite = (async () => {
          const name = await currentCacheName();
          const m = /<meta name="apex-build" content="(\d+)"/.exec(await copy.clone().text());
          if (m && CACHE_PREFIX + m[1] === name) {
            const cache = await openCache(name);
            await cache.put(req, copy);
          }
        })().catch(noteCacheWriteFail);
      }
      return res;
    });
    event.waitUntil(network.then(() => cacheWrite, () => undefined));
    event.respondWith((async () => {
      const online = typeof navigator !== "undefined" && navigator.onLine;
      const bustShell = isShellBust ? await shellAtLeast(url.searchParams.get("b")) : undefined;
      const failFast = online && (isVersion || (isShellBust && !bustShell));
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
        if (res == null && failFast && !isShellBust) return Response.error();
      } catch (_) {
        if (failFast && !isShellBust) return Response.error();
      }
      if (isVersion) return (await matchPreferCurrent("version.json")) || Response.error();
      if (isShellBust) return bustShell || (await matchPreferCurrent("index.html")) || Response.error();
      const ownURL = new URL(url.href);
      ownURL.search = "";
      ownURL.hash = "";
      const own = (await matchPreferCurrent(req)) || (url.search && await matchPreferCurrent(ownURL.href));
      if (own) return own;
      if (isShellDocument(url)) return (await matchPreferCurrent("index.html")) || Response.error();
      try { const late = await network; if (late) return late; } catch (_) {  }
      return Response.error();
    })());
    return;
  }

  if (url.pathname.includes("/assets/pack/") && !DEV_HOST) {
    if (isHashedPackRequest(url)) packCacheFirst(event, req);
    else packNetworkFirst(event, req, null, isBuildKeyedManifest(url));
    return;
  }

  if (url.pathname.includes("/assets/voice/") && !DEV_HOST) {
    packNetworkFirst(event, req, VOICE_CACHE);
    return;
  }

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
      } catch (_) {  }
    }
    const cached = await matchPreferCurrent(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        await verifyHashedResponse(req, res);
        remember(res, true);
      }
      return res;
    } catch (_) {  }
    return Response.error();
  })();
  event.waitUntil(response.then(() => cacheWrite));
  event.respondWith(response);
});
