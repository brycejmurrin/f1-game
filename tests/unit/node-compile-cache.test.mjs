import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { augmentNodeCompileCache } = require("../../tools/lib/node-compile-cache.cjs");

test("NODE_COMPILE_CACHE is off when collecting coverage", () => {
  assert.deepEqual(augmentNodeCompileCache({ NODE_V8_COVERAGE: "/tmp/cov" }), {});
  assert.deepEqual(augmentNodeCompileCache({ APEX_JS_COVERAGE: "1" }), {});
});

test("NODE_COMPILE_CACHE points at artifacts/.node-compile-cache by default", () => {
  const extra = augmentNodeCompileCache({});
  assert.match(extra.NODE_COMPILE_CACHE, /artifacts[/\\]\.node-compile-cache$/);
});

// Multiple VM test processes share artifacts/.vmcache. Readers must never see
// half-written cachedData: V8 deserialization can abort the process, not throw.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { runScriptCached, cacheDir } = require("../../tools/lib/vm-script-cache.cjs");

function withVmCache(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-vm-cache-test-"));
  const previous = process.env.APEX_VM_COMPILE_CACHE;
  process.env.APEX_VM_COMPILE_CACHE = path.join(root, "cache");
  try { run(root); }
  finally {
    if (previous === undefined) delete process.env.APEX_VM_COMPILE_CACHE;
    else process.env.APEX_VM_COMPILE_CACHE = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("VM bytecode cache becomes visible only after its entire write completes", () => withVmCache(root => {
  const dir = cacheDir(root), write = fs.writeFileSync;
  let observed = false;
  fs.writeFileSync = function(file, data, ...args) {
    if (!String(file).startsWith(dir + path.sep)) return write.call(this, file, data, ...args);
    write.call(this, file, data.subarray(0, Math.floor(data.length / 2)), ...args);
    observed = true;
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.endsWith(".v8cache")), [],
      "a concurrent reader must not see partial cachedData");
    return write.call(this, file, data, ...args);
  };
  const src = "globalThis.answer = 6 * 7;";
  try { runScriptCached(src, vm.createContext({}), { filename: "cache-fixture.js", root }); }
  finally { fs.writeFileSync = write; }
  assert.equal(observed, true, "the write boundary was exercised");
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1, "successful writes leave only the committed cache");
  const script = new vm.Script(src, { cachedData: fs.readFileSync(path.join(dir, files[0])) });
  assert.equal(script.cachedDataRejected, false);
  const ctx = vm.createContext({}); script.runInContext(ctx);
  assert.equal(ctx.answer, 42);
}));

test("VM bytecode cache write failure leaves no partial entry and does not fail execution", () => withVmCache(root => {
  const dir = cacheDir(root), write = fs.writeFileSync;
  fs.writeFileSync = function(file, data, ...args) {
    if (!String(file).startsWith(dir + path.sep)) return write.call(this, file, data, ...args);
    write.call(this, file, data.subarray(0, 8), ...args);
    throw new Error("simulated interrupted cache write");
  };
  const ctx = vm.createContext({});
  try { runScriptCached("globalThis.answer = 42;", ctx, { filename: "cache-fixture.js", root }); }
  finally { fs.writeFileSync = write; }
  assert.equal(ctx.answer, 42, "cache persistence is optional");
  assert.deepEqual(fs.readdirSync(dir), [], "failed writes must not poison later readers or leak temporary files");
}));

test("VM bytecode cache ignores legacy non-atomic entries", () => withVmCache(root => {
  const crypto = require("node:crypto");
  const src = "globalThis.answer = 42;", dir = cacheDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const oldFile = path.join(dir, crypto.createHash("sha256").update(src).digest("hex") + ".v8cache");
  const interrupted = Buffer.from("partial old write");
  fs.writeFileSync(oldFile, interrupted);
  const ctx = vm.createContext({});
  runScriptCached(src, ctx, { filename: "cache-fixture.js", root });
  assert.equal(ctx.answer, 42);
  assert.deepEqual(fs.readFileSync(oldFile), interrupted, "legacy entries must not be opened or refreshed");
  assert.equal(fs.readdirSync(dir).length, 2, "a new safe-format cache is published separately");
}));
