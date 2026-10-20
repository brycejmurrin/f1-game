"use strict";
// @doc Persist vm.Script cachedData for game-vm manifest eval (content-hash keyed).

// vm.Script cachedData persistence for game-vm / track harnesses.
// Keyed by format + sha256(source) so stale or legacy non-atomic entries are
// never handed back to V8 after this cache format changes.

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
  const hash = crypto.createHash("sha256").update("atomic-v1:").update(src).digest("hex");
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
      // Parallel VM suites read the same source key. Never expose a partially
      // written blob to V8: malformed cachedData can abort outside JS recovery.
      const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      try {
        fs.writeFileSync(temp, fresh);
        fs.renameSync(temp, file);
      } finally {
        try { fs.unlinkSync(temp); } catch (_) { /* renamed or never created */ }
      }
    }
  } catch (_) { /* createCachedData unavailable — run without persisting */ }
  return result;
}

module.exports = { runScriptCached, cacheDir };
