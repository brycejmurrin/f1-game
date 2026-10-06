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
    Date: opts.fixedClock ? { now: () => 1234 } : Date,
    Math: opts.fixedClock ? { random: () => 0.5 } : Math,
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
  assert.match(writes[0].path, /^apex26-downloads\/[^/]+\/trace\.json$/);
  assert.equal(writes[0].recursive, true);
  assert.ok(writes[0].data);
  assert.equal(shares.length, 1);
  assert.ok(shares[0].url.includes("trace.json"));
  assert.equal(out.name, "trace.json");
  assert.equal(out.uri, "file://" + writes[0].path);
  assert.equal(shares[0].url, out.uri);
  assert.equal(shares[0].title, "trace.json");
  assert.equal(shares[0].dialogTitle, "Save trace.json");
});

function bytesBlob(bytes) {
  return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

test("same-name exports preserve bytes for delayed consumers, even after Share resolves", async () => {
  const { sandbox } = loadNative({ capacitor: true, fixedClock: true });
  const disk = new Map();
  const pending = [];
  const fs = sandbox.Capacitor.Plugins.Filesystem;
  fs.writeFile = async ({ path, data }) => {
    disk.set("file://" + path, data);
    return { uri: "file://" + path };
  };
  fs.deleteFile = async ({ path }) => disk.delete("file://" + path);
  sandbox.Capacitor.Plugins.Share.share = (args) => new Promise((resolve) => {
    pending.push({ uri: args.url, resolve });
  });
  const first = sandbox.NativeDownload.saveBlob(bytesBlob([1, 2, 3]), "backup.json");
  while (pending.length < 1) await new Promise((resolve) => setImmediate(resolve));
  const second = sandbox.NativeDownload.saveBlob(bytesBlob([4, 5, 6]), "backup.json");
  while (pending.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(pending[0].uri, pending[1].uri);
  assert.equal(disk.get(pending[0].uri), "AQID", "second write must not overwrite the outstanding first share");
  pending[1].resolve({});
  await second;
  pending[0].resolve({});
  await first;
  const third = sandbox.NativeDownload.saveBlob(bytesBlob([7, 8, 9]), "backup.json");
  while (pending.length < 3) await new Promise((resolve) => setImmediate(resolve));
  pending[2].resolve({});
  await third;
  assert.equal(new Set(pending.map((p) => p.uri)).size, 3);
  assert.deepEqual(pending.map((p) => disk.get(p.uri)), ["AQID", "BAUG", "BwgJ"],
    "receiving apps may read files after the share sheet has completed");
  for (const p of pending) assert.ok(p.uri.endsWith("/backup.json"));
});

test("iOS receives one attachment, matching SharePlugin's url + files accumulation", async () => {
  const { sandbox } = loadNative({ capacitor: true, capPlatform: "ios" });
  let items;
  sandbox.Capacitor.Plugins.Share.share = async (args) => {
    items = [];
    if (args.url) items.push(args.url);
    if (args.files) items.push(...args.files);
  };
  const out = await sandbox.NativeDownload.saveBlob(bytesBlob([1]), "photo.png");
  assert.deepEqual(items, [out.uri]);
});

test("writeFile's actual URI is used without optional getUri", async () => {
  const { sandbox, shares } = loadNative({ capacitor: true });
  const fs = sandbox.Capacitor.Plugins.Filesystem;
  delete fs.getUri;
  fs.writeFile = async () => ({ uri: "file:///actual/cache/trace.json" });
  const out = await sandbox.NativeDownload.saveBlob(bytesBlob([1]), "trace.json");
  assert.equal(out.uri, "file:///actual/cache/trace.json");
  assert.equal(shares[0].url, out.uri);
});

test("getUri is only a fallback for writeFile implementations without a URI", async () => {
  const { sandbox, shares } = loadNative({ capacitor: true });
  const fs = sandbox.Capacitor.Plugins.Filesystem;
  fs.writeFile = async () => ({});
  let lookup;
  fs.getUri = async (args) => { lookup = args; return { uri: "file:///resolved/cache/trace.json" }; };
  const out = await sandbox.NativeDownload.saveBlob(bytesBlob([1]), "trace.json");
  assert.match(lookup.path, /^apex26-downloads\/[^/]+\/trace\.json$/);
  assert.equal(lookup.directory, "CACHE");
  assert.equal(shares[0].url, out.uri);
  assert.equal(out.uri, "file:///resolved/cache/trace.json");
});

test("a returned writeFile URI takes precedence over getUri", async () => {
  const { sandbox } = loadNative({ capacitor: true });
  sandbox.Capacitor.Plugins.Filesystem.getUri = async () => { throw new Error("must not be called"); };
  assert.equal((await sandbox.NativeDownload.saveBlob(bytesBlob([1]), "trace.json")).ok, true);
});

test("missing file URI rejects instead of sharing a bare filename", async () => {
  for (const getUri of [undefined, async () => ({})]) {
    const { sandbox, shares } = loadNative({ capacitor: true });
    const fs = sandbox.Capacitor.Plugins.Filesystem;
    fs.writeFile = async () => ({});
    fs.getUri = getUri;
    await assert.rejects(sandbox.NativeDownload.saveBlob(bytesBlob([1]), "trace.json"), /file URI unavailable/);
    assert.equal(shares.length, 0);
  }
});

test("conversion, write, URI lookup and share failures remain rejected promises", async () => {
  for (const stage of ["conversion", "write", "uri", "share"]) {
    const { sandbox, shares } = loadNative({ capacitor: true });
    const plugs = sandbox.Capacitor.Plugins;
    const error = new Error(stage + " failed");
    let blob = bytesBlob([1]);
    if (stage === "conversion") blob = { arrayBuffer: async () => { throw error; } };
    if (stage === "write") plugs.Filesystem.writeFile = async () => { throw error; };
    if (stage === "uri") {
      plugs.Filesystem.writeFile = async () => ({});
      plugs.Filesystem.getUri = async () => { throw error; };
    }
    if (stage === "share") plugs.Share.share = async () => { throw error; };
    await assert.rejects(sandbox.NativeDownload.saveBlob(blob, "trace.json"), (err) => err === error);
    assert.equal(shares.length, 0);
  }
});

test("SettingsExport.download awaits the real native helper and surfaces write/share failures", async () => {
  const src = readFileSync(join(ROOT, "js/ui/settings-export.js"), "utf8");
  const download = src.slice(src.indexOf("async function download("), src.indexOf("function stamp()"));
  for (const stage of ["write", "share"]) {
    const { sandbox } = loadNative({ capacitor: true });
    const error = new Error(stage + " failed");
    let reject;
    const held = new Promise((resolve, fail) => { reject = () => fail(error); });
    sandbox.Capacitor.Plugins[stage === "write" ? "Filesystem" : "Share"][stage === "write" ? "writeFile" : "share"] = () => held;
    sandbox.Blob = Blob;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(download, ctx);
    let settled = false;
    const result = sandbox.download({ settings: true }, "settings.json");
    const rejected = assert.rejects(result, (err) => err === error);
    result.then(() => { settled = true; }, () => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "backup cannot complete before native I/O");
    reject();
    await rejected;
  }
});

test("UUID cache directories keep screenshot names and base64 bytes intact", async () => {
  const { sandbox, writes, shares } = loadNative({ capacitor: true });
  sandbox.crypto = { randomUUID: () => "test-uuid" };
  for (const bytes of [[], [0, 127, 128, 255]]) {
    const out = await sandbox.NativeDownload.saveBlob(bytesBlob(bytes), "apex26-tlx.png");
    assert.equal(out.name, "apex26-tlx.png");
    assert.equal(writes.at(-1).data, Buffer.from(bytes).toString("base64"));
    assert.match(writes.at(-1).path, /^apex26-downloads\/test-uuid-\d+\/apex26-tlx\.png$/);
    assert.equal(shares.at(-1).url, out.uri);
  }
  assert.notEqual(writes[0].path, writes[1].path);
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
  assert.equal(sandbox.NativeDownload.safeName("."), "apex26-download.bin");
  assert.equal(sandbox.NativeDownload.safeName(".."), "apex26-download.bin");
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
