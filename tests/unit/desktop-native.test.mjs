/* desktop-native.test.mjs — native-detect flag gates SW registration and Spotify.
 *
 * Run: node --test tests/unit/desktop-native.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = readFileSync(join(ROOT, "index.html"), "utf8");
const SPOTIFY = readFileSync(join(ROOT, "js/audio/spotify.js"), "utf8");
const PRELOAD = readFileSync(join(ROOT, "desktop/preload.js"), "utf8");
const MAIN = readFileSync(join(ROOT, "desktop/main.js"), "utf8");

test("index.html skips service-worker registration when __APEX_NATIVE__.desktop", () => {
  assert.match(HTML, /__APEX_NATIVE__/);
  assert.match(HTML, /nativeDesktop/);
  assert.match(HTML, /serviceWorker" in navigator && !nativeDesktop/);
});

test("desktop preload exposes a frozen __APEX_NATIVE__ with desktop:true", () => {
  assert.match(PRELOAD, /contextBridge\.exposeInMainWorld\("__APEX_NATIVE__"/);
  assert.match(PRELOAD, /desktop:\s*true/);
});

test("desktop main uses privileged app:// via app-protocol (Range handler)", () => {
  assert.match(MAIN, /require\(["']\.\/app-protocol["']\)/);
  assert.match(MAIN, /registerScheme\s*\(/);
  assert.match(MAIN, /handleScheme\s*\(/);
  // Autoplay: no CLI flag needed (research B1.4); set webPreferences explicitly.
  assert.doesNotMatch(MAIN, /appendSwitch\(\s*["']autoplay-policy["']/);
  assert.match(MAIN, /autoplayPolicy:\s*["']no-user-gesture-required["']/);
  // Soft-GL CI gets enable-unsafe-webgpu; do not claim unverified Linux Vulkan.
  assert.match(MAIN, /enable-unsafe-webgpu/);
  assert.doesNotMatch(MAIN, /VulkanFromANGLE|DefaultANGLEVulkan|use-vulkan/);
});

test("app-protocol keeps allowServiceWorkers false (cache.addAll fails on app:)", () => {
  const PROTO = readFileSync(join(ROOT, "desktop/app-protocol.js"), "utf8");
  assert.match(PROTO, /allowServiceWorkers:\s*false/);
  assert.match(PROTO, /parseByteRange/);
  assert.match(PROTO, /status:\s*206/);
  assert.match(PROTO, /status:\s*416/);
  // Comments may mention net.fetch (why we avoid it); the handler body must not call it.
  const body = PROTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(body, /\bnet\.fetch\b/);
});

function loadSpotify(opts = {}) {
  const disk = new Map(opts.disk || [["apex26.spotify.clientId", "client-1"]]);
  const sandbox = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number,
    URL, URLSearchParams, TextEncoder, Uint8Array, Response,
    fetch: () => Promise.reject(new Error("no network in unit test")),
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    location: {
      origin: opts.origin || "https://game.test",
      pathname: "/",
      hostname: "game.test",
      href: (opts.origin || "https://game.test") + "/",
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
  };
  if (opts.native) {
    sandbox.__APEX_NATIVE__ = { desktop: true, platform: "linux" };
  }
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedStore(ctx);
  vm.runInContext(SPOTIFY, ctx, { filename: "js/audio/spotify.js" });
  return sandbox.SpotifyMusic;
}

test("Spotify available() is false under __APEX_NATIVE__.desktop even with a client id", () => {
  const web = loadSpotify({ native: false });
  assert.equal(web.available(), true, "web build with a stored client id must stay available");
  const desk = loadSpotify({ native: true });
  assert.equal(desk.available(), false, "desktop must refuse Spotify OAuth");
  assert.match(desk.status().message || desk.debug().message || "", /redirect|web build|off/i);
});

test("Spotify copy under native names the redirect-URI limitation", () => {
  const desk = loadSpotify({ native: true });
  // Force the off message through status after init path.
  const st = desk.status();
  assert.equal(st.state, "off");
  assert.match(st.message, /browser redirect|web build/i);
});

test("desktop workflow is PR pack-smoke + tag/dispatch release (not ship-branch push)", () => {
  const yml = readFileSync(join(ROOT, ".github/workflows/desktop.yml"), "utf8");
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /desktop-v\*/);
  assert.match(yml, /pull_request:/);
  assert.match(yml, /pack-smoke:/);
  assert.doesNotMatch(yml, /branches:\s*\n\s*-\s*claude\/f1-game-project-26h3ng/);
  // Must not share the pages concurrency group.
  assert.doesNotMatch(yml, /group:\s*pages\b/);
});
