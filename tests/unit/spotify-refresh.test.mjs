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
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", dataset: {}, addEventListener(event, fn) { this[event] = fn; },
      appendChild() {},
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
    setInterval: () => 1, clearInterval: () => {},
    location: {
      origin: "https://game.test", pathname: "/", hostname: "game.test",
      href: "https://game.test/", search: opts.search || "",
    },
    history: { replaceState() {} },
    document: {
      readyState: "complete",
      getElementById(id) { return opts.dom && (id === "sp-search" || id === "sp-fwd") ? element(id) : null; },
      addEventListener() {},
      createElement() { return {}; },
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
    Log: { info() {}, warn() {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedStore(ctx);   // spotify.js keeps its keys through GameStore.store's raw lane, over the fake localStorage above
  vm.runInContext(SRC, ctx, { filename: "js/audio/spotify.js" });
  const flush = () => { const q = pending.splice(0); for (const fn of q) if (fn) fn(); };
  return { SpotifyMusic: sandbox.SpotifyMusic, disk, session, flush, element };
}

test("a retryable refresh failure preserves the long-lived Spotify session", async () => {
  const original = JSON.stringify(token());
  const { SpotifyMusic, disk } = load(() => Promise.reject(new Error("offline")));

  const result = await SpotifyMusic.check();
  assert.equal(result.reason, "refresh-failed");
  assert.equal(disk.get(TOKEN_KEY), original,
    "offline token refresh must not turn into a permanent sign-out");
});

test("a malformed token response is retryable and preserves the session", async () => {
  const original = JSON.stringify(token());
  const { SpotifyMusic, disk } = load(() => Promise.resolve(jsonResponse({}, 503)));
  const result = await SpotifyMusic.check();
  assert.equal(result.reason, "refresh-failed");
  assert.equal(disk.get(TOKEN_KEY), original);
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
