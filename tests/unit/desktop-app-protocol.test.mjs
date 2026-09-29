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

test("desktop package.json ships app-protocol.js and pins Electron 44.4.5", () => {
  const pkg = JSON.parse(
    require("node:fs").readFileSync(join(ROOT, "desktop/package.json"), "utf8"),
  );
  assert.equal(pkg.devDependencies.electron, "44.4.5");
  assert.ok(pkg.build.files.includes("app-protocol.js"));
  assert.equal(pkg.build.electronFuses.enableNodeCliInspectArguments, false);
  assert.equal(pkg.build.electronFuses.grantFileProtocolExtraPrivileges, false);
  assert.ok(pkg.scripts["pack:test"]);
  assert.ok(
    require("node:fs").existsSync(join(ROOT, "desktop/app-protocol.js")),
  );
  assert.ok(String(pathToFileURL(join(ROOT, "desktop/app-protocol.js"))).startsWith("file:"));
});
