"use strict";
// @doc Persist vm.Script cachedData for game-vm manifest eval (content-hash keyed).

// vm.Script cachedData persistence for game-vm / track harnesses.
// Keyed by sha256(source) so a stale cache cannot outlive an edit.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function cacheDir(root) {
  const base = process.env.APEX_VM_COMPILE_CACHE
    || path.join(root, "artifacts", ".vmcache");
  return base;
}

function cacheFile(dir, hash) {
  return path.join(dir, `${hash}.v8cache`);
}

/** Run `src` in `ctx` with optional persisted V8 code cache. */
function runScriptCached(src, ctx, { filename, root }) {
  const rootDir = root || path.resolve(__dirname, "../..");
  if (process.env.APEX_VM_COMPILE_CACHE === "0") {
    return vm.runInContext(src, ctx, { filename });
  }
  const dir = cacheDir(rootDir);
  const hash = crypto.createHash("sha256").update(src).digest("hex");
  const file = cacheFile(dir, hash);
  let cachedData;
  if (fs.existsSync(file)) {
    try { cachedData = fs.readFileSync(file); } catch (_) { cachedData = undefined; }
  }
  let script = new vm.Script(src, { filename, cachedData });
  if (script.cachedDataRejected && cachedData) {
    script = new vm.Script(src, { filename });
  }
  const result = script.runInContext(ctx);
  try {
    const fresh = script.createCachedData();
    if (fresh && fresh.length && (!cachedData || !fresh.equals(cachedData))) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, fresh);
    }
  } catch (_) { /* createCachedData unavailable — run without persisting */ }
  return result;
}

module.exports = { runScriptCached, cacheDir };
