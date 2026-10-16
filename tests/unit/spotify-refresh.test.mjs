import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/audio/spotify.js"), "utf8");
const TOKEN_KEY = "apex26.spotify.token";

function token(refresh = "old-refresh") {
  return { access_token: "expired", refresh_token: refresh, expires_at: 1, scope: "streaming" };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// opts: { search, session, disk } seed the OAuth landing (location.search plus
// the one-shot verifier/state) and any extra localStorage key; the returned
// `flush` runs whatever the module put on setTimeout, so a debounce can be
// stepped without a real clock. Defaults leave every existing test as it was.
function load(fetchImpl, opts = {}) {
  const disk = new Map([
    ["apex26.spotify.clientId", "client-1"],
    [TOKEN_KEY, JSON.stringify(token())],
  ]);
  for (const [k, v] of opts.disk || []) disk.set(k, v);
  const session = new Map(opts.session || []);
  const pending = [];   // setTimeout callbacks, in the order they were queued
  const elements = new Map();
  const scripts = opts.scripts || [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", dataset: {}, addEventListener(event, fn) { this[event] = fn; },
      appendChild(child) { this.childElementCount = (this.childElementCount || 0) + 1; this.children = (this.children || []).concat(child); },
      childElementCount: 0, children: [], hidden: false, textContent: "", style: {}, disabled: false,
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute(name, value) { this[name] = String(value); if (name === "src") this.src = String(value); },
      getAttribute(name) { return this[name] == null ? null : String(this[name]); },
      removeAttribute(name) { delete this[name]; },
    });
    return elements.get(id);
  };
  const sandbox = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number,
    URL, URLSearchParams, TextEncoder, Uint8Array, Response,
    fetch: fetchImpl,
    setTimeout: (fn) => pending.push(fn),
    clearTimeout: (id) => { if (id > 0) pending[id - 1] = null; },
    // The now-playing poll is a 10 s interval: registered, never fired here.
    setInterval: (fn) => { if (opts.intervals) opts.intervals.push(fn); return 1; }, clearInterval: () => {},
    location: {
      origin: "https://game.test", pathname: "/", hostname: "game.test",
      href: "https://game.test/", search: opts.search || "",
    },
    history: { replaceState() {} },
    document: {
      readyState: "complete",
      getElementById(id) {
        return opts.dom && (opts.dom === "art" || id === "sp-search" || id === "sp-fwd") ? element(id) : null;
      },
      addEventListener() {},
      createElement(tag) {
        if (tag === "script") {
          const script = { onerror: null, src: "" };
          scripts.push(script);
          return script;
        }
        return element("created-" + tag + "-" + scripts.length);
      },
      head: { appendChild() {} },
    },
    localStorage: {
      getItem: (key) => disk.get(key) || null,
      setItem: (key, value) => disk.set(key, String(value)),
      removeItem: (key) => disk.delete(key),
    },
    sessionStorage: {
      getItem: (k) => (session.has(k) ? session.get(k) : null),
      setItem: (k, v) => session.set(k, String(v)),
      removeItem: (k) => session.delete(k),
    },
    Log: { info() {}, warn() {}, debug() {} },
  };
  sandbox.window = sandbox;
  Object.assign(sandbox, opts.globals || {});   // e.g. a fake GameAudio that records setMusicBackend
  const ctx = vm.createContext(sandbox);
  seedStore(ctx);   // spotify.js keeps its keys through GameStore.store's raw lane, over the fake localStorage above
  vm.runInContext(SRC, ctx, { filename: "js/audio/spotify.js" });
  const flush = () => { const q = pending.splice(0); for (const fn of q) if (fn) fn(); };
  return { SpotifyMusic: sandbox.SpotifyMusic, disk, session, flush, element, scripts, window: sandbox };
}

test("a retryable refresh failure preserves the long-lived Spotify session", async () => {
  const original = JSON.stringify(token());
  const { SpotifyMusic, disk } = load(() => Promise.reject(new Error("offline")));

  const result = await SpotifyMusic.check();
  assert.equal(result.reason, "refresh-failed");
  assert.equal(disk.get(TOKEN_KEY), original,
    "offline token refresh must not turn into a permanent sign-out");
});

test("album art hides a failed CDN image and does not resurrect it on refresh", () => {
  assert.match(SRC, /dataset\.apexArtFailed/);
  assert.match(SRC, /img\.onerror\s*=\s*next \? \(\) =>/);
  assert.match(SRC, /img\.removeAttribute\("src"\)/);
  assert.match(SRC, /img\.hidden = false/);
});

test("failed current artwork keeps the neutral swatch visible in the player DOM", async () => {
  const { SpotifyMusic, element } = load((url) => {
    const u = String(url);
    if (u.endsWith("/me/player")) return Promise.resolve(jsonResponse({
      item: { name: "Fallback Track", artists: [{ name: "Artist" }], duration_ms: 120000,
        album: { images: [{ url: "https://cdn.test/expired-art.jpg" }] } },
      is_playing: true, progress_ms: 0, device: { name: "Test device", volume_percent: 50 },
    }));
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("live-art")]], dom: "art" });

  await SpotifyMusic.connect();
  const img = element("sp-art");
  assert.equal(img.hidden, false, "loaded artwork is visible");
  const staleFailure = img.onerror;
  assert.equal(typeof staleFailure, "function");
  staleFailure();
  assert.equal(img.hidden, false, "a failed current image leaves its neutral background visible");
  assert.equal(img.getAttribute("src"), null, "the failed URL is removed so Chromium cannot paint a broken glyph");
});

test("a delayed account check cannot overwrite a replacement Spotify session", async () => {
  let resolveAccount;
  const account = new Promise((resolve) => { resolveAccount = resolve; });
  const { SpotifyMusic, disk } = load((url) => {
    if (String(url).endsWith("/me")) return account;
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, JSON.stringify({ access_token: "first", refresh_token: "first", expires_at: Date.now() + 3600000, scope: "streaming" })]] });

  const checking = SpotifyMusic.check();
  await new Promise((resolve) => setTimeout(resolve, 0));
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, JSON.stringify({ access_token: "replacement", refresh_token: "replacement", expires_at: Date.now() + 3600000, scope: "streaming" }));
  await SpotifyMusic.connect();
  assert.equal(SpotifyMusic.status().state, "connected");

  resolveAccount(jsonResponse({ product: "free", display_name: "Old account" }));
  const result = await checking;
  assert.equal(result.reason, "stale");
  assert.equal(SpotifyMusic.status().state, "connected");
  assert.doesNotMatch(SpotifyMusic.status().message, /Old account|Free/);
});

test("a malformed token response is retryable and preserves the session", async () => {
  const original = JSON.stringify(token());
  const { SpotifyMusic, disk } = load(() => Promise.resolve(jsonResponse({}, 503)));
  const result = await SpotifyMusic.check();
  assert.equal(result.reason, "refresh-failed");
  assert.equal(disk.get(TOKEN_KEY), original);
});

test("a token response whose body stalls settles as a retryable refresh failure", async () => {
  let signal, resolveBody;
  const body = new Promise((resolve) => { resolveBody = resolve; });
  const { SpotifyMusic, disk, flush } = load((url, opts) => {
    if (String(url).includes("/api/token")) {
      signal = opts.signal;
      return Promise.resolve({ ok: true, status: 200, json: () => body });
    }
    return Promise.resolve(jsonResponse({ product: "premium" }));
  }, { globals: { AbortController } });
  const checking = SpotifyMusic.check();
  await settle();
  flush();
  const result = await checking;
  assert.equal(signal.aborted, true, "the stalled token body must be aborted");
  assert.equal(result.reason, "refresh-failed");
  assert.ok(disk.has(TOKEN_KEY), "a body timeout must preserve the refresh token");
  resolveBody({ access_token: "late", refresh_token: "late", expires_in: 3600 });
  await Promise.resolve();
});

test("an account response whose body stalls settles as a network failure", async () => {
  let signal, resolveBody;
  const body = new Promise((resolve) => { resolveBody = resolve; });
  const { SpotifyMusic, flush } = load((url, opts) => {
    if (String(url).includes("/api/token")) return Promise.resolve(jsonResponse({
      access_token: "fresh", refresh_token: "fresh", expires_in: 3600,
    }));
    if (String(url).includes("/v1/me")) {
      signal = opts.signal;
      return Promise.resolve({ ok: true, status: 200, json: () => body });
    }
    return Promise.resolve(jsonResponse({ devices: [] }));
  }, { globals: { AbortController } });
  const checking = SpotifyMusic.check();
  await settle();
  flush();
  const result = await checking;
  assert.equal(signal.aborted, true, "the stalled account body must be aborted");
  assert.equal(result.reason, "network");
  resolveBody({ product: "premium" });
  await Promise.resolve();
});

test("a timed-out SDK load restores a pre-existing ready hook for retry", async () => {
  const scripts = [];
  const { SpotifyMusic, flush, window } = load(() => Promise.resolve(jsonResponse({})), {
    disk: [[TOKEN_KEY, JSON.stringify({ access_token: "live", refresh_token: "r-1", expires_at: Date.now() + 3600000, scope: "streaming" })]],
    scripts,
  });
  const foreign = () => {};
  window.onSpotifyWebPlaybackSDKReady = foreign;

  const connecting = SpotifyMusic.setMode("browser") && SpotifyMusic.connect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(scripts.length, 1, "the browser mode boot should append one SDK script");
  flush();
  await connecting;
  assert.equal(window.onSpotifyWebPlaybackSDKReady, foreign,
    "timeout cleanup must restore the callback that was installed before the attempt");
});

test("concurrent callers share one rotating refresh request", async () => {
  let refreshRequests = 0;
  const { SpotifyMusic, disk } = load((url) => {
    if (String(url).includes("/api/token")) {
      refreshRequests++;
      return Promise.resolve(jsonResponse({
        access_token: "new-access", refresh_token: "new-refresh",
        expires_in: 3600, scope: "streaming",
      }));
    }
    return Promise.resolve(jsonResponse({ product: "premium", display_name: "Player" }));
  });

  await Promise.all([SpotifyMusic.check(), SpotifyMusic.check()]);
  assert.equal(refreshRequests, 1, "one expired token must produce one refresh flight");
  assert.equal(JSON.parse(disk.get(TOKEN_KEY)).refresh_token, "new-refresh");
});

test("a stale invalid_grant cannot erase a replacement refresh token", async () => {
  let resolveRefresh;
  const held = new Promise((resolve) => { resolveRefresh = resolve; });
  const { SpotifyMusic, disk } = load((url) => {
    if (String(url).includes("/api/token")) return held;
    return Promise.resolve(jsonResponse({ product: "premium" }));
  });

  const checking = SpotifyMusic.check();
  const replacement = token("replacement-refresh");
  replacement.access_token = "replacement-access";
  replacement.expires_at = Date.now() + 3600000;
  disk.set(TOKEN_KEY, JSON.stringify(replacement));
  resolveRefresh(jsonResponse({ error: "invalid_grant" }));
  await checking;

  assert.equal(JSON.parse(disk.get(TOKEN_KEY)).refresh_token, "replacement-refresh");
});

test("invalid_grant for the current token still signs the dead session out", async () => {
  const { SpotifyMusic, disk } = load(() => Promise.resolve(jsonResponse({ error: "invalid_grant" })));
  await SpotifyMusic.check();
  assert.equal(disk.has(TOKEN_KEY), false);
});

// ── the sign-in landing: `streaming` is the SDK's scope, not remote's ─────────

/** A landing with the one-shot verifier/state in place and `?code=` on the URL. */
function landing(fetchImpl, extraDisk = []) {
  return load(fetchImpl, {
    search: "?code=auth-code&state=st-1",
    session: [["apex26.spotify.verifier", "v-1"], ["apex26.spotify.state", "st-1"]],
    disk: extraDisk,
  });
}
// handleRedirect() resolves when the EXCHANGE resolves; connectRemote()'s own
// chain (validToken -> the Web API calls) settles a few microtask turns later,
// so every assertion about what went out has to let those turns run first.
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A token exchange that grants everything EXCEPT `streaming`. */
const noStreaming = (seen) => (url) => {
  seen.push(String(url));
  return Promise.resolve(String(url).includes("/api/token")
    ? jsonResponse({ access_token: "fresh", refresh_token: "r-1", expires_in: 3600,
                     scope: "user-read-playback-state user-modify-playback-state" })
    : jsonResponse({ devices: [], items: [] }));
};

test("remote mode connects on a token with no streaming scope", async () => {
  // `streaming` is what the Web Playback SDK needs, and remote mode never loads
  // the SDK — it drives a device you already have open through the Web API. The
  // scope check ran in BOTH modes, so a remote user signed in and got a dead
  // transport with an error telling them to tick a Web Playback box they do not
  // need. Remote is also the DEFAULT mode, so this was the common path.
  const seen = [];
  const { SpotifyMusic } = landing(noStreaming(seen));
  await SpotifyMusic.handleRedirect();
  await settle();
  assert.ok(seen.some((u) => u.includes("/me/player")),
            "remote mode never reached the Web API: " + seen.join(" "));
});

test("browser mode still refuses a token with no streaming scope", async () => {
  const seen = [];
  const { SpotifyMusic } = landing(noStreaming(seen), [["apex26.spotify.mode", "browser"]]);
  await SpotifyMusic.handleRedirect();
  await settle();
  assert.equal(seen.filter((u) => u.includes("/me/player")).length, 0,
               "the SDK cannot play without `streaming`: the sign-in must stop here");
});

test("a volume drag sends ONE PUT, carrying the value it ended on", async () => {
  // Both sliders fire per `oninput`, so a sweep across the track used to send a
  // PUT per pixel into a rate-limited endpoint that answers out of order.
  const seen = [];
  const { SpotifyMusic, flush } = landing((url) => {
    seen.push(String(url));
    return Promise.resolve(String(url).includes("/api/token")
      ? jsonResponse({ access_token: "fresh", refresh_token: "r-1", expires_in: 3600,
                       scope: "streaming user-modify-playback-state" })
      : jsonResponse({ devices: [], items: [] }));
  });
  await SpotifyMusic.handleRedirect();
  await settle();
  seen.length = 0;
  for (const pct of [10, 25, 40, 55, 70]) SpotifyMusic.setDeviceVolume(pct);
  assert.deepEqual(seen.filter((u) => u.includes("/volume")), [],
                   "nothing goes out until the drag settles");
  flush();
  await settle();   // the coalesced call still goes out through api()'s validToken chain
  const puts = seen.filter((u) => u.includes("/volume"));
  assert.equal(puts.length, 1, "five slider events sent " + puts.length + " requests");
  assert.match(puts[0], /volume_percent=70/, "the coalesced PUT must carry the LAST value");
});

test("a debounced volume PUT stays on the device selected when the drag started", async () => {
  const seen = [];
  const { SpotifyMusic, flush } = landing((url) => {
    seen.push(String(url));
    return Promise.resolve(String(url).includes("/api/token")
      ? jsonResponse({ access_token: "fresh", refresh_token: "r-1", expires_in: 3600,
                       scope: "streaming user-modify-playback-state" })
      : jsonResponse({ devices: [], items: [] }));
  }, [["apex26.spotify.device", "old-device"]]);
  await SpotifyMusic.handleRedirect();
  await settle();
  seen.length = 0;

  SpotifyMusic.setDevice("old-device");
  SpotifyMusic.setDeviceVolume(70);
  SpotifyMusic.setDevice("new-device");
  flush();
  await settle();

  const puts = seen.filter((u) => u.includes("/volume"));
  assert.equal(puts.length, 1);
  assert.match(puts[0], /volume_percent=70/);
  assert.match(puts[0], /device_id=old-device/, "the pending drag belongs to the old device");
  assert.doesNotMatch(puts[0], /device_id=new-device/);
});

const liveToken = (access) => JSON.stringify({ access_token: access, refresh_token: access,
  expires_at: Date.now() + 3600000, scope: "streaming" });

test("disconnect cancels queued volume and search callbacks across reconnect", async () => {
  const requests = [];
  const { SpotifyMusic, disk, flush, element } = load((url, opts) => {
    requests.push([String(url), opts]);
    return Promise.resolve(jsonResponse({ devices: [{ id: "new-device", is_active: true }], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("first")]], dom: true });
  await SpotifyMusic.connect();
  await settle();
  requests.length = 0;
  SpotifyMusic.setDeviceVolume(77);
  element("sp-search").input({ target: { value: "old query" } });
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, liveToken("second"));
  await SpotifyMusic.connect();
  await settle();
  flush();
  await settle();
  assert.equal(requests.filter(([url]) => /\/volume|\/search\?/.test(url)).length, 0,
    "old timers must not send requests with the replacement session's token/device");
});

test("an old now-playing response cannot overwrite the new connection", async () => {
  let resolveOld;
  const oldPoll = new Promise((resolve) => { resolveOld = resolve; });
  const requests = [];
  const { SpotifyMusic, disk } = load((url, opts) => {
    requests.push([String(url), opts]);
    if (String(url).endsWith("/me/player") && opts.headers.Authorization === "Bearer first") return oldPoll;
    if (String(url).endsWith("/me/player")) return Promise.resolve(jsonResponse({
      item: { name: "New track", artists: [{ name: "New artist" }] }, is_playing: true,
    }));
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("first")]] });
  await SpotifyMusic.connect();
  await settle();
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, liveToken("second"));
  await SpotifyMusic.connect();
  await settle();
  assert.equal(SpotifyMusic.status().track, "New track — New artist",
    "the new poll must not be blocked by the previous session's in-flight guard");
  resolveOld(jsonResponse({ item: { name: "Old track", artists: [] }, is_playing: true }));
  await settle();
  assert.equal(SpotifyMusic.status().track, "New track — New artist");
});

test("stale device and playlist search responses do not alter the replacement session", async () => {
  let resolveDevices, resolveSearch;
  const oldDevices = new Promise((resolve) => { resolveDevices = resolve; });
  const oldSearch = new Promise((resolve) => { resolveSearch = resolve; });
  const { SpotifyMusic, disk } = load((url, opts) => {
    const old = opts.headers.Authorization === "Bearer first";
    if (String(url).includes("/me/player/devices")) return old ? oldDevices
      : Promise.resolve(jsonResponse({ devices: [{ id: "current", is_active: true }] }));
    if (String(url).includes("/search?")) return old ? oldSearch
      : Promise.resolve(jsonResponse({ playlists: { items: [{ name: "Current", uri: "new" }] } }));
    return Promise.resolve(jsonResponse({ items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("first")]] });
  const firstConnect = SpotifyMusic.connect();
  await settle();
  const firstSearch = SpotifyMusic.searchPlaylists("old");
  await settle();
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, liveToken("second"));
  await SpotifyMusic.connect();
  await settle();
  assert.deepEqual([...SpotifyMusic.deviceList()].map((d) => d.id), ["current"]);
  const currentSearch = await SpotifyMusic.searchPlaylists("new");
  assert.equal(currentSearch[0].uri, "new");
  resolveDevices(jsonResponse({ devices: [{ id: "obsolete", is_active: true }] }));
  resolveSearch(jsonResponse({ playlists: { items: [{ name: "Obsolete", uri: "old" }] } }));
  await Promise.all([firstConnect, firstSearch]);
  assert.deepEqual([...SpotifyMusic.deviceList()].map((d) => d.id), ["current"]);
  assert.equal(disk.get("apex26.spotify.device"), "current");
  assert.equal((await SpotifyMusic.searchPlaylists("new"))[0].uri, "new");
});

test("a pending connect and delayed command do not resurrect a disconnected session", async () => {
  let resolveRefresh;
  const refresh = new Promise((resolve) => { resolveRefresh = resolve; });
  const requests = [];
  const { SpotifyMusic, disk, flush, element } = load((url, opts) => {
    requests.push([String(url), opts]);
    if (String(url).includes("/api/token")) return refresh;
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { dom: true });
  const connecting = SpotifyMusic.connect();
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, liveToken("replacement"));
  resolveRefresh(jsonResponse({ access_token: "original", refresh_token: "rotated", expires_in: 3600 }));
  await connecting;
  assert.equal(SpotifyMusic.status().state, "configured");
  await SpotifyMusic.connect();
  await settle();
  requests.length = 0;
  element("sp-fwd").click();
  await settle();
  SpotifyMusic.disconnect();
  disk.set(TOKEN_KEY, liveToken("third"));
  await SpotifyMusic.connect();
  await settle();
  requests.length = 0;
  flush();
  await settle();
  assert.equal(requests.filter(([url]) => url.endsWith("/me/player")).length, 0,
    "old command's delayed poll must not poll the new session");
});

// ── 401 and 429 from the Web API (2026-10-04) ──────────────────────────────
// Refresh ran only on LOCAL expiry, so a token refused early stayed dead until
// its expires_at while the poll repeated the 401; and the poll ignored 429's
// Retry-After, asking again every 10 s under a modest quota.
const bearer = (opts) => opts && opts.headers && opts.headers.Authorization;

test("a 401 from the Web API forces one refresh and retries once with the new token", async () => {
  const seen = [];
  const { SpotifyMusic, disk } = load((url, opts) => {
    const u = String(url);
    seen.push([u.includes("/api/token") ? "token" : u.split("/v1")[1], bearer(opts)]);
    if (u.includes("/api/token")) return Promise.resolve(jsonResponse({ access_token: "fresh", refresh_token: "r-2", expires_in: 3600 }));
    if (bearer(opts) === "Bearer revoked") return Promise.resolve(jsonResponse({ error: { status: 401 } }, 401));
    return Promise.resolve(jsonResponse({ devices: [{ id: "d1" }] }));
  }, { disk: [[TOKEN_KEY, liveToken("revoked")]] });
  const got = await SpotifyMusic.devices();
  assert.deepEqual(seen, [["/me/player/devices", "Bearer revoked"], ["token", undefined], ["/me/player/devices", "Bearer fresh"]],
    "refused, refreshed, retried — although the stored token was not locally expired");
  assert.equal(got.devices[0].id, "d1");
  assert.equal(JSON.parse(disk.get(TOKEN_KEY)).access_token, "fresh");
});

test("a second 401 after the forced refresh is returned, not retried forever", async () => {
  let calls = 0;
  const { SpotifyMusic } = load((url) => {
    if (String(url).includes("/api/token")) return Promise.resolve(jsonResponse({ access_token: "also-bad", refresh_token: "r-3", expires_in: 3600 }));
    calls++;
    return Promise.resolve(jsonResponse({}, 401));
  }, { disk: [[TOKEN_KEY, liveToken("revoked")]] });
  const got = await SpotifyMusic.devices();
  assert.equal(calls, 2, "one request, one retry");
  assert.equal(got.httpStatus, 401);
});

test("the now-playing poll waits out a 429's Retry-After", async () => {
  const intervals = [];
  let polls = 0, limited = true;
  const { SpotifyMusic } = load((url, opts) => {
    const u = String(url);
    if (u.endsWith("/me/player")) {
      polls++;
      if (limited) return Promise.resolve(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
      return Promise.resolve(jsonResponse({ item: { name: "Track", artists: [] }, is_playing: true }));
    }
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("live")]], intervals });
  await SpotifyMusic.connect();
  await settle();
  assert.equal(polls, 1, "precondition: the first poll went out and was rate limited");
  assert.equal(intervals.length, 1, "precondition: the 10 s poll interval is registered");
  limited = false;
  for (let i = 0; i < 5; i++) { await intervals[0](); await settle(); }
  assert.equal(polls, 1, "no poll inside the 120 s Retry-After window");
});

test("now-playing polling recovers when response headers arrive but JSON body stalls", async () => {
  const intervals = [];
  let polls = 0;
  let stalledSignal;
  let resolveStalled;
  const stalledBody = new Promise((resolve) => { resolveStalled = resolve; });
  const { SpotifyMusic, flush } = load((url, opts) => {
    if (String(url).endsWith("/me/player")) {
      polls++;
      if (polls === 1) stalledSignal = opts.signal;
      return Promise.resolve(polls === 1
        ? { ok: true, status: 200, json: () => stalledBody }
        : jsonResponse({ item: { name: "Recovered", artists: [] }, is_playing: true }));
    }
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("live")]], intervals, globals: { AbortController } });
  await SpotifyMusic.connect();
  await settle();
  assert.equal(polls, 1);
  flush(); // fire the fake 15 s watchdog
  await settle();
  assert.equal(stalledSignal.aborted, true, "the timeout must release the stalled network body");
  await intervals[0]();
  await settle();
  assert.equal(polls, 2, "a stalled body must not hold the poll's in-flight guard forever");
  assert.equal(SpotifyMusic.status().track, "Recovered — ");
  resolveStalled({ item: { name: "Obsolete", artists: [] }, is_playing: true });
  await settle();
  assert.equal(SpotifyMusic.status().track, "Recovered — ", "a late body cannot replace newer playback state");
});

test("a stalled now-playing body can reject after cancellation without an unhandled rejection", async () => {
  let rejectBody;
  let signal;
  const body = new Promise((_, reject) => { rejectBody = reject; });
  const { SpotifyMusic, flush } = load((url, opts) => {
    if (String(url).endsWith("/me/player")) {
      signal = opts.signal;
      return Promise.resolve({ ok: true, status: 200, json: () => body });
    }
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("live")]], globals: { AbortController } });
  await SpotifyMusic.connect();
  await settle();
  flush();
  await settle();
  assert.equal(signal.aborted, true);
  rejectBody(new Error("body aborted after timeout"));
  await settle();
  assert.equal(SpotifyMusic.status().state, "connected");
});

/** A fake GameAudio that records the music backend the module installs/removes. */
function fakeAudio() {
  const a = { backend: null, sets: [] };
  a.GameAudio = {
    setMusicBackend(b) { a.backend = b; a.sets.push(b); },
    musicBackend() { return a.backend; },
    setSessionType() {},
  };
  return a;
}

test("a transient refresh failure on a connected remote session keeps it connected, backend installed (H12)", async () => {
  const audio = fakeAudio();
  let tokenFails = false;
  const { SpotifyMusic, disk } = load((url) => {
    if (String(url).includes("/api/token")) {
      return tokenFails ? Promise.reject(new Error("offline"))
        : Promise.resolve(jsonResponse({ access_token: "fresh", refresh_token: "r-1", expires_in: 3600,
                                         scope: "user-modify-playback-state" }));
    }
    return Promise.resolve(jsonResponse({ devices: [], items: [], product: "premium" }));
  }, {
    search: "?code=auth-code&state=st-1",
    session: [["apex26.spotify.verifier", "v-1"], ["apex26.spotify.state", "st-1"]],
    globals: { GameAudio: audio.GameAudio },
  });
  await SpotifyMusic.handleRedirect();
  await settle();
  assert.equal(SpotifyMusic.status().state, "connected");
  assert.ok(audio.backend, "connecting installs the music backend");
  // The access token ages out and the network blips: refresh() fails TRANSIENTLY.
  disk.set(TOKEN_KEY, JSON.stringify(token("r-1")));
  tokenFails = true;
  await SpotifyMusic.check();
  assert.equal(SpotifyMusic.status().state, "connected",
    "demoting to configured left the backend installed but inactive: the game's music stayed silenced");
  assert.ok(audio.backend && audio.backend.active(), "an installed backend must stay active");
  assert.ok(disk.has(TOKEN_KEY), "the long-lived session survives");
});

test("switching play mode tears the OLD transport down before the stored mode flips (H25)", async () => {
  const audio = fakeAudio();
  const real = audio.GameAudio.setMusicBackend;
  // Like soundtrack.js: replacing/removing the backend stops the one being dropped.
  audio.GameAudio.setMusicBackend = (b) => { const old = audio.backend; if (old && old !== b) old.stop(); real(b); };
  const seen = [];
  const { SpotifyMusic } = load((url, o) => {
    seen.push(((o && o.method) || "GET") + " " + String(url));
    return Promise.resolve(String(url).includes("/api/token")
      ? jsonResponse({ access_token: "fresh", refresh_token: "r-1", expires_in: 3600, scope: "user-modify-playback-state" })
      : jsonResponse({ devices: [], items: [], product: "premium" }));
  }, {
    search: "?code=auth-code&state=st-1",
    session: [["apex26.spotify.verifier", "v-1"], ["apex26.spotify.state", "st-1"]],
    globals: { GameAudio: audio.GameAudio },
  });
  await SpotifyMusic.handleRedirect();
  await settle();
  assert.equal(SpotifyMusic.status().state, "connected");
  assert.equal(seen.some((u) => u.includes("/me/player/pause")), false);
  SpotifyMusic.setMode("browser");
  await settle();
  assert.equal(SpotifyMusic.mode(), "browser");
  assert.ok(seen.some((u) => u.startsWith("PUT ") && u.includes("/me/player/pause")),
    "the remote device was never paused: stop() ran against the already-flipped mode");
});


test("browser SDK next, previous and volume handle asynchronous and synchronous failures", async () => {
  const backendBlock = SRC.slice(SRC.indexOf("const BACKEND ="), SRC.indexOf("// Guarded on the global AND"));
  const prevBlock = SRC.slice(SRC.indexOf("function prev()"), SRC.indexOf("function toggle()"));
  let caught = 0;
  const rejecting = () => { const p = Promise.reject(new Error("device unavailable")); const original = p.catch.bind(p);
    p.catch = (fn) => { caught++; return original(fn); }; return p; };
  const player = { nextTrack: rejecting, previousTrack: rejecting, setVolume: rejecting };
  const ctx = vm.createContext({ player, state: "connected", ready: true, mode: () => "browser", track: "song", vol: 0.5, Math });
  vm.runInContext(backendBlock + prevBlock + "; BACKEND.skip(); prev(); BACKEND.setVolume(0.3);", ctx);
  await Promise.resolve();
  assert.equal(caught, 3, "all three SDK promises attach rejection observers");
  for (const k of Object.keys(player)) player[k] = () => { throw new Error("SDK failed synchronously"); };
  assert.doesNotThrow(() => vm.runInContext("BACKEND.skip(); prev(); BACKEND.setVolume(0.3);", ctx));
});

function soundtrackAudio() {
  const ctx = vm.createContext({ Promise, Math });
  vm.runInContext(readFileSync(join(ROOT, "js/audio/soundtrack.js"), "utf8"), ctx);
  return ctx.GameAudioSoundtrack.create({ context: () => null, enabled: () => false });
}

test("the real soundtrack previous control delegates to Spotify's backend", async () => {
  const audio = soundtrackAudio();
  const seen = [];
  const { SpotifyMusic } = load((url) => {
    seen.push(String(url));
    return Promise.resolve(jsonResponse({ devices: [{ id: "fake-device", is_active: true }], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("fake-old")]], globals: { GameAudio: audio } });
  await SpotifyMusic.connect();
  seen.length = 0;
  audio.prevTrack();
  await settle();
  assert.equal(seen.filter((u) => u.endsWith("/previous?device_id=fake-device")).length, 1);
});

for (const action of ["disconnect", "replace-client", "clear-client"]) {
  test(action + " pauses the owned remote transport before clearing credentials, with no late retry", async () => {
    const audio = soundtrackAudio();
    const seen = [];
    let finishPause, pauseSignal;
    const { SpotifyMusic, disk, flush } = load((url, opts) => {
      seen.push([String(url), opts.headers.Authorization]);
      if (String(url).includes("/pause")) {
        pauseSignal = opts.signal;
        return new Promise((resolve) => { finishPause = resolve; });
      }
      return Promise.resolve(jsonResponse({ devices: [{ id: "fake-old-device", is_active: true }], items: [] }));
    }, { disk: [[TOKEN_KEY, liveToken("fake-old")]], globals: { GameAudio: audio, AbortController } });
    await SpotifyMusic.connect();
    seen.length = 0;
    if (action === "disconnect") SpotifyMusic.disconnect();
    else SpotifyMusic.setClientId(action === "replace-client" ? "fake-new-client" : "");
    assert.equal(disk.has(TOKEN_KEY), false, "credential cleanup is synchronous");
    assert.equal(audio.musicBackend(), null, "backend removal is synchronous");
    assert.deepEqual(seen, [["https://api.spotify.com/v1/me/player/pause?device_id=fake-old-device", "Bearer fake-old"]],
      "pause starts synchronously using only the outgoing token and device");
    if (action === "clear-client") SpotifyMusic.setClientId("fake-new-client");
    disk.set(TOKEN_KEY, liveToken("fake-new"));
    await SpotifyMusic.connect();
    flush();
    await settle(); // let the replacement backend's own volume setup finish
    const snapshot = seen.length;
    assert.equal(pauseSignal.aborted, true, "outgoing pause is bounded by the request watchdog");
    finishPause(jsonResponse({}, 401));
    await settle();
    assert.equal(seen.length, snapshot, "late 401 must not refresh, retry, or poll the new session");
    assert.equal(JSON.parse(disk.get(TOKEN_KEY)).access_token, "fake-new");
  });
}

test("disconnect does not pause Spotify when the local soundtrack already owns music", async () => {
  const audio = soundtrackAudio();
  const seen = [];
  const { SpotifyMusic } = load((url) => {
    seen.push(String(url));
    return Promise.resolve(jsonResponse({ devices: [], items: [] }));
  }, { disk: [[TOKEN_KEY, liveToken("fake")]], globals: { GameAudio: audio } });
  await SpotifyMusic.connect();
  SpotifyMusic.useAsMusic(false);
  await settle();
  seen.length = 0;
  SpotifyMusic.disconnect();
  await settle();
  assert.deepEqual(seen, []);
});
