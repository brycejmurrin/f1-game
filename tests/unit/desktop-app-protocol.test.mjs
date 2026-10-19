/* desktop-app-protocol.test.mjs — Range/MIME/path helpers for app:// handler.
 *
 * Pure Node: app-protocol.js lazy-requires electron only inside register/handle.
 * Research B1.1 (2026-09-29): net.fetch(file:) returns 200 without Content-Range
 * (Electron #38749); keep manual 206 / suffix / 416 + traversal rejection.
 *
 * Run: node --test tests/unit/desktop-app-protocol.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Load via a path relative to this file so docs-integrity / cross-file-paths
// resolve to desktop/app-protocol.js (not a missing tests/unit sibling).
const require = createRequire(import.meta.url);
const proto = require("../../desktop/app-protocol.js");

const {
  MIME,
  parseByteRange,
  resolveSafePath,
  mimeFor,
} = proto;

test("MIME map covers game asset extensions (js/mjs/wasm/ktx2/glb/mp3/…)", () => {
  const need = [
    ".js", ".mjs", ".json", ".wasm", ".ktx2", ".glb", ".mp3", ".ogg",
    ".woff2", ".svg", ".webmanifest", ".html", ".css", ".png",
  ];
  for (const ext of need) {
    assert.ok(MIME[ext], `MIME missing ${ext}`);
    assert.equal(mimeFor(`/x/y/file${ext}`), MIME[ext]);
  }
  assert.equal(mimeFor("/no-ext"), "application/octet-stream");
  assert.equal(mimeFor("/x.UNKNOWN"), "application/octet-stream");
});

test("parseByteRange handles closed, open-end, suffix, and unsatisfiable", () => {
  assert.equal(parseByteRange(null, 1000), null);
  assert.equal(parseByteRange("", 1000), null);
  assert.equal(parseByteRange("bytes=", 1000), null);

  assert.deepEqual(parseByteRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(parseByteRange("bytes=100-", 1000), { start: 100, end: 999 });
  assert.deepEqual(parseByteRange("bytes=-200", 1000), { start: 800, end: 999 });

  assert.deepEqual(parseByteRange("bytes=999-999", 1000), { start: 999, end: 999 });
  assert.deepEqual(parseByteRange("bytes=1000-1001", 1000), { unsatisfiable: true });
  assert.deepEqual(parseByteRange("bytes=500-100", 1000), { unsatisfiable: true });
  assert.deepEqual(parseByteRange("bytes=0-10", 0), { unsatisfiable: true });
});

test("resolveSafePath maps / to index.html and rejects traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "apex-proto-"));
  try {
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    mkdirSync(join(root, "js"));
    writeFileSync(join(root, "js", "game.js"), "// ok");

    assert.equal(resolveSafePath(root, "/"), join(root, "index.html"));
    assert.equal(resolveSafePath(root, ""), join(root, "index.html"));
    assert.equal(resolveSafePath(root, "/js/game.js"), join(root, "js", "game.js"));

    assert.equal(resolveSafePath(root, "/../etc/passwd"), null);
    assert.equal(resolveSafePath(root, "/%2e%2e/etc/passwd"), null);
    assert.equal(resolveSafePath(root, "/js/../../etc/passwd"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("app-protocol exports registerScheme / handleScheme for main.js", () => {
  assert.equal(typeof proto.registerScheme, "function");
  assert.equal(typeof proto.handleScheme, "function");
  assert.equal(proto.SCHEME, "app");
  assert.equal(proto.HOST, "apex");
});

test("desktop package.json ships app-protocol.js, pins Electron to one exact version, locks the fuses", () => {
  const pkg = JSON.parse(
    require("node:fs").readFileSync(join(ROOT, "desktop/package.json"), "utf8"),
  );
  const cfg = require("../../desktop/electron-builder.config.cjs");
  // Exact pin, not a copied number: a routine bump must not red this test, a range ("^44") must.
  assert.match(pkg.devDependencies.electron, /^\d+\.\d+\.\d+$/, "electron must be pinned to one exact version");
  assert.ok(cfg.files.includes("app-protocol.js"));
  assert.equal(cfg.electronFuses.enableNodeCliInspectArguments, false);
  assert.equal(cfg.electronFuses.grantFileProtocolExtraPrivileges, false);
  assert.ok(pkg.scripts["pack:test"]);
});

// handleScheme against a fake electron: the 206 / 416 / traversal handling
// that desktop users hit was never executed (T2-14).
async function withHandler(fn) {
  const Module = require("node:module");
  let handler = null;
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return { protocol: { handle: (scheme, h) => { assert.equal(scheme, "app"); handler = h; } } };
    return realLoad.call(this, request, ...rest);
  };
  const root = mkdtempSync(join(tmpdir(), "apex-scheme-"));
  try {
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    writeFileSync(join(root, "data.bin"), "0123456789");
    writeFileSync(join(tmpdir(), `apex-scheme-secret-${process.pid}.txt`), "secret");
    proto.handleScheme(root);
    assert.equal(typeof handler, "function", "handleScheme must register a handler for the scheme");
    await fn((pathname, headers = {}, host = "apex") => handler(new Request(`app://${host}${pathname}`, { headers })));
  } finally {
    Module._load = realLoad;
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), `apex-scheme-secret-${process.pid}.txt`), { force: true });
  }
}

test("handleScheme: 200 full body, 206 range, suffix range, 416, 404, 403 traversal, 400 bad host", async () => {
  await withHandler(async (get) => {
    let r = await get("/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.equal(r.headers.get("accept-ranges"), "bytes");

    r = await get("/data.bin", { range: "bytes=2-5" });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "2345");
    assert.equal(r.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(r.headers.get("content-length"), "4");

    r = await get("/data.bin", { range: "bytes=-3" });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), "789");
    assert.equal(r.headers.get("content-range"), "bytes 7-9/10");

    r = await get("/data.bin", { range: "bytes=50-60" });
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("content-range"), "bytes */10");

    assert.equal((await get("/missing.js")).status, 404);
    assert.equal((await get("/..%2fapex-scheme-secret-" + process.pid + ".txt")).status, 403, "traversal must be refused");
    assert.equal((await get("/", {}, "evil")).status, 400);
  });
});
