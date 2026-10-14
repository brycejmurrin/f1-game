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
    Date: opts.clock || (opts.fixedClock ? { now: () => 1234 } : Date),
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
  assert.match(writes[0].path, /^apex26-downloads\/v2\/export-[^/]+\/trace\.json$/);
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
  assert.match(lookup.path, /^apex26-downloads\/v2\/export-[^/]+\/trace\.json$/);
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

test("generated cache directories preserve screenshot basenames and base64 bytes intact", async () => {
  const { sandbox, writes, shares } = loadNative({ capacitor: true });
  sandbox.crypto = { randomUUID: () => "test-uuid" };
  for (const bytes of [[], [0, 127, 128, 255]]) {
    const out = await sandbox.NativeDownload.saveBlob(bytesBlob(bytes), "apex26-tlx.png");
    assert.equal(out.name, "apex26-tlx.png");
    assert.equal(writes.at(-1).data, Buffer.from(bytes).toString("base64"));
    assert.match(writes.at(-1).path, /^apex26-downloads\/v2\/export-[^/]+\/apex26-tlx\.png$/);
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

test("blob:<a download> click refuses a non-ok fetch instead of saving the body", async () => {
  const writes = [];
  const logs = [];
  let clickHandler = null;
  const sandbox = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number, Uint8Array,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    Log: { info(_ch, msg) { logs.push(String(msg)); }, warn() {} },
    document: {
      addEventListener(type, fn) { if (type === "click") clickHandler = fn; },
    },
    location: { origin: "https://game.test" },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        Filesystem: {
          writeFile: async (args) => { writes.push(args); return { uri: "file://" + args.path }; },
          getUri: async (args) => ({ uri: "content://cache/" + args.path }),
        },
        Share: { share: async () => ({}) },
      },
    },
    fetch: async () => ({
      ok: false,
      status: 404,
      blob: async () => { throw new Error("must not blob a non-ok response"); },
    }),
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(NATIVE_SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/native.js" });
  vm.runInContext(DL_SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/native-download.js" });
  assert.equal(typeof clickHandler, "function");
  const a = {
    tagName: "A",
    getAttribute: (n) => (n === "href" ? "blob:https://game.test/x" : n === "download" ? "trace.json" : null),
    href: "blob:https://game.test/x",
  };
  clickHandler({ target: a, preventDefault() {}, stopPropagation() {} });
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 0, "a 404 body must not be written as the download");
  assert.ok(logs.some((m) => /native download failed:.*HTTP 404/.test(m)), logs.join(" | "));
});

test("renderer screenshot refuses a non-ok fetch instead of saving the body", async () => {
  const src = readFileSync(join(ROOT, "js/perf/renderer-picker.js"), "utf8");
  const fn = src.slice(src.indexOf("function saveScreenshot()"), src.indexOf("function ensureAdvHost()"));
  let saved = false;
  const button = { textContent: "SAVE SCREENSHOT" };
  const ctx = vm.createContext({
    document: {
      getElementById: (id) => id === "pm-save-shot" ? button
        : id === "game" ? { toDataURL: () => "data:image/png;base64,AQID" } : null,
      createElement() { throw new Error("non-ok fetch must not fall through to an anchor"); },
    },
    NativeDownload: { viable: () => true, saveBlob: async () => { saved = true; } },
    readBackend: () => "tlx",
    fetch: async () => ({
      ok: false,
      status: 503,
      blob: async () => { throw new Error("must not blob a non-ok response"); },
    }),
    setTimeout() {},
  });
  vm.runInContext(fn + "\nsaveScreenshot();", ctx);
  for (let i = 0; i < 40; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved, false);
  assert.match(button.textContent, /FAILED$/);
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


test("retention prunes exact owned old leaves and empty folders, preserving basenames", async () => {
  let now = 100000;
  const disk = new Map();
  const deleted = [], removed = [], cleanups = [];
  const wire = (sandbox) => {
    const fs = sandbox.Capacitor.Plugins.Filesystem;
    fs.writeFile = async ({ path, data }) => {
      const folder = path.slice(0, path.lastIndexOf("/"));
      disk.set(folder, { name: folder.split("/").at(-1), type: "directory" });
      disk.set(path, { name: path.split("/").at(-1), type: "file", data });
      return { uri: "file://" + path };
    };
    fs.readdir = async ({ path, directory }) => {
      assert.equal(directory, "CACHE");
      const files = [...disk.entries()].filter(([p]) => p.slice(0, p.lastIndexOf("/")) === path).map(([, e]) => e);
      cleanups.push(path); return { files };
    };
    fs.deleteFile = async ({ path, directory }) => { assert.equal(directory, "CACHE"); deleted.push(path); disk.delete(path); };
    fs.rmdir = async ({ path, directory, recursive }) => {
      assert.equal(directory, "CACHE"); assert.equal(recursive, false);
      assert.equal([...disk.keys()].some((p) => p.startsWith(path + "/")), false);
      removed.push(path); disk.delete(path);
    };
  };
  const first = loadNative({ capacitor: true, clock: { now: () => now } }); wire(first.sandbox);
  const old = await first.sandbox.NativeDownload.saveBlob(bytesBlob([1]), "backup.json");
  const oldPath = old.uri.slice(7), oldFolder = oldPath.slice(0, oldPath.lastIndexOf("/"));
  assert.equal(oldPath.split("/").at(-1), "backup.json");
  const mixedFolder = "apex26-downloads/v2/export-100000-255s-i-99--mixed.json";
  disk.set(mixedFolder, { name: mixedFolder.split("/").at(-1), type: "directory" });
  disk.set(mixedFolder + "/mixed.json", { name: "mixed.json", type: "file" });
  disk.set(mixedFolder + "/user.json", { name: "user.json", type: "file" });
  disk.set("apex26-downloads/legacy/backup.json", { name: "backup.json", type: "file" });
  for (const name of ["user", "export-100000-255s-i-2--..", "export-100000-255s-i-3--%2Fsecret", "../export-100000-255s-i-5--file.json"]) {
    disk.set("apex26-downloads/v2/" + name, { name, type: "directory" });
  }
  now += 8 * 24 * 60 * 60 * 1000;
  await first.sandbox.NativeDownload.saveBlob(bytesBlob([2]), "current.json");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(disk.has(oldPath), "current-session files remain protected past grace");
  assert.ok(disk.has(mixedFolder + "/user.json"));
  const second = loadNative({ capacitor: true, clock: { now: () => now } }); wire(second.sandbox);
  await second.sandbox.NativeDownload.saveBlob(bytesBlob([3]), "new.json");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(new Set(deleted), new Set([oldPath, mixedFolder + "/mixed.json"]));
  assert.deepEqual(removed, [oldFolder]);
  assert.ok(disk.has(mixedFolder + "/user.json"));
  assert.ok(disk.has("apex26-downloads/legacy/backup.json"));
  assert.equal(cleanups.some((p) => p.includes("%2Fsecret") || p.includes("/legacy/")), false);
});

test("missing or failing retention operations cannot block sharing", async () => {
  for (const stage of ["readdir", "deleteFile", "malformed"]) {
    const { sandbox, shares } = loadNative({ capacitor: true });
    const fs = sandbox.Capacitor.Plugins.Filesystem;
    fs.readdir = async ({ path }) => {
      if (path !== "apex26-downloads/v2") return { files: [{ name: "backup.json", type: "file" }] };
      if (stage === "readdir") throw new Error("cache denied");
      if (stage === "malformed") return { files: null };
      return { files: [{ name: "export-100000-255s-i-1--backup.json", type: "directory" }] };
    };
    fs.deleteFile = async () => { throw new Error("delete denied"); };
    assert.equal((await sandbox.NativeDownload.saveBlob(bytesBlob([1]), "backup.json")).ok, true);
    assert.equal(shares.length, 1);
  }
});
