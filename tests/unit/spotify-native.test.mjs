/* spotify-native.test.mjs — SpotifyMusic under a native (Capacitor) shell in a VM.
 * Moved out of mobile-native-download.test.mjs (T3-16): it never touched Native/NativeDownload.
 *
 * Run: node --test tests/unit/spotify-native.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPOTIFY = readFileSync(join(ROOT, "js/audio/spotify.js"), "utf8");

function loadSpotify(opts = {}) {
  const disk = new Map(opts.disk || [["apex26.spotify.clientId", "client-1"]]);
  const sandbox = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number,
    URL, URLSearchParams, TextEncoder, Uint8Array, Response,
    fetch: () => Promise.reject(new Error("no network in unit test")),
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    location: {
      origin: "https://localhost",
      pathname: "/",
      hostname: "localhost",
      href: "https://localhost/",
      search: "",
    },
    history: { replaceState() {} },
    document: {
      readyState: "complete",
      getElementById() { return null; },
      addEventListener() {},
      createElement() { return {}; },
    },
    localStorage: {
      getItem: (k) => disk.get(k) || null,
      setItem: (k, v) => disk.set(k, String(v)),
      removeItem: (k) => disk.delete(k),
    },
    sessionStorage: {
      getItem: () => null, setItem: () => {}, removeItem: () => {},
    },
    Log: { info() {}, warn() {} },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedStore(ctx);
  vm.runInContext(SPOTIFY, ctx, { filename: "js/audio/spotify.js" });
  return sandbox.SpotifyMusic;
}

test("Spotify available() is false under Capacitor even with a client id", () => {
  const sp = loadSpotify();
  assert.equal(sp.available(), false);
  assert.equal(sp.status().state, "off");
});
