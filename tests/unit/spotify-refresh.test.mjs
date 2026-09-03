import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/game/spotify.js"), "utf8");
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

function load(fetchImpl) {
  const disk = new Map([
    ["apex26.spotify.clientId", "client-1"],
    [TOKEN_KEY, JSON.stringify(token())],
  ]);
  const sandbox = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number,
    URL, URLSearchParams, TextEncoder, Uint8Array, Response,
    fetch: fetchImpl,
    location: {
      origin: "https://game.test", pathname: "/", hostname: "game.test",
      href: "https://game.test/", search: "",
    },
    history: { replaceState() {} },
    document: {
      readyState: "complete",
      getElementById() { return null; },
      addEventListener() {},
      createElement() { return {}; },
    },
    localStorage: {
      getItem: (key) => disk.get(key) || null,
      setItem: (key, value) => disk.set(key, String(value)),
      removeItem: (key) => disk.delete(key),
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    Log: { info() {}, warn() {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedStore(ctx);   // spotify.js keeps its keys through GameStore.store's raw lane, over the fake localStorage above
  vm.runInContext(SRC, ctx, { filename: "js/game/spotify.js" });
  return { SpotifyMusic: sandbox.SpotifyMusic, disk };
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
