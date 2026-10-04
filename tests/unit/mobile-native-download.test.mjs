/* mobile-native-download.test.mjs — Native + NativeDownload in a VM with fake Capacitor.Plugins.
 *
 * Run: node --test tests/unit/mobile-native-download.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NATIVE_SRC = readFileSync(join(ROOT, "js/core/native.js"), "utf8");
const DL_SRC = readFileSync(join(ROOT, "js/core/native-download.js"), "utf8");
const SPOTIFY = readFileSync(join(ROOT, "js/audio/spotify.js"), "utf8");

function loadNative(opts = {}) {
  const writes = [];
  const shares = [];
  const sandbox = {
    console,
    Promise,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Uint8Array,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    Log: { info() {}, warn() {} },
    document: {
      addEventListener() {},
    },
    location: { origin: "https://game.test" },
  };
  if (opts.desktop) {
    sandbox.__APEX_NATIVE__ = { desktop: true, platform: "linux" };
  }
  if (opts.capacitor) {
    sandbox.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => opts.capPlatform || "android",
      Plugins: {
        Filesystem: {
          writeFile: async (args) => { writes.push(args); return { uri: "file://" + args.path }; },
          getUri: async (args) => ({ uri: "content://cache/" + args.path }),
        },
        Share: {
          share: async (args) => { shares.push(args); return {}; },
        },
      },
    };
  }
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(NATIVE_SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/native.js" });
  vm.runInContext(DL_SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/native-download.js" });
  return { sandbox, writes, shares };
}

test("Native.platform is web without a shell", () => {
  const { sandbox } = loadNative();
  assert.equal(sandbox.Native.isNative(), false);
  assert.equal(sandbox.Native.platform(), "web");
  assert.equal(sandbox.Native.canonicalOrigin(), "https://game.test");
});

test("Native.platform is desktop under __APEX_NATIVE__.desktop", () => {
  const { sandbox } = loadNative({ desktop: true });
  assert.equal(sandbox.Native.isNative(), true);
  assert.equal(sandbox.Native.platform(), "desktop");
  assert.equal(sandbox.Native.canonicalOrigin(), "app://apex");
});

test("Native.platform is android under Capacitor.isNativePlatform", () => {
  const { sandbox } = loadNative({ capacitor: true });
  assert.equal(sandbox.Native.isNative(), true);
  assert.equal(sandbox.Native.platform(), "android");
  assert.equal(sandbox.Native.canonicalOrigin(), "https://localhost");
});

test("NativeDownload.viable is true only with Filesystem+Share on mobile", () => {
  const web = loadNative();
  assert.equal(web.sandbox.NativeDownload.viable(), false);
  const desk = loadNative({ desktop: true });
  assert.equal(desk.sandbox.NativeDownload.viable(), false);
  const and = loadNative({ capacitor: true });
  assert.equal(and.sandbox.NativeDownload.viable(), true);
});

test("NativeDownload.saveBlob writes CACHE then Share.share", async () => {
  const { sandbox, writes, shares } = loadNative({ capacitor: true });
  const blob = {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  const out = await sandbox.NativeDownload.saveBlob(blob, "trace.json");
  assert.equal(out.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].directory, "CACHE");
  assert.equal(writes[0].path, "trace.json");
  assert.ok(writes[0].data);
  assert.equal(shares.length, 1);
  assert.ok(shares[0].url.includes("trace.json"));
});

test("renderer screenshots await native saving and report its failure", async () => {
  const src = readFileSync(join(ROOT, "js/perf/renderer-picker.js"), "utf8");
  const fn = src.slice(src.indexOf("function saveScreenshot()"), src.indexOf("function ensureAdvHost()"));
  for (const fail of [false, true]) {
    let release, saved;
    const held = new Promise((resolve, reject) => { release = () => fail ? reject(new Error("disk full")) : resolve(); });
    const button = { textContent: "SAVE SCREENSHOT" };
    const ctx = vm.createContext({
      document: { getElementById: (id) => id === "pm-save-shot" ? button : id === "game" ? { toDataURL: () => "data:image/png;base64,AQID" } : null,
        createElement() { throw new Error("native screenshot must not use a download anchor"); } },
      NativeDownload: { viable: () => true, saveBlob: async (blob, name) => { saved = { blob, name }; await held; } },
      readBackend: () => "tlx", fetch, setTimeout() {},
    });
    vm.runInContext(fn + "\nsaveScreenshot();", ctx);
    for (let i = 0; i < 20 && !saved; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.ok(saved);
    assert.equal(saved.name, "apex26-tlx.png");
    assert.deepEqual([...new Uint8Array(await saved.blob.arrayBuffer())], [1, 2, 3]);
    assert.equal(button.textContent, "SAVE SCREENSHOT", "no success before the share completes");
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(button.textContent, fail ? /FAILED$/ : /SAVED$/);
  }
});

test("safeName strips path separators", () => {
  const { sandbox } = loadNative();
  assert.equal(sandbox.NativeDownload.safeName("../../x.json"), ".._.._x.json");
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
