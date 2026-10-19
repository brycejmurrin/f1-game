"use strict";
// @doc Opt-in NODE_OPTIONS=--require preload: rewrite vm filenames to absolute file:// URLs for debug/coverage.
// @skill check-changes
//
// Off by default. Loaded with:
//   NODE_OPTIONS="--require ./tools/lib/vm-debug-preload.cjs" node --test tests/unit/<file>.test.mjs
//   npm run debug:unit -- tests/unit/<file>.test.mjs
//
// 1. A relative filename that exists under ROOT (or js/) becomes absolute so V8
//    reports a file:// URL that breakpoints and --experimental-test-coverage hit.
// 2. No filename: sha1 of the source (raw and after ^const→var) is matched against
//    js/**/*.js, with a 400-char prefix fallback, and becomes absolute.
// Line numbers are unchanged; columns shift by 2 on top-level `const` lines (the
// harness rewrite). Prototype: Node debugging research Appendix on PR #2959 (#2960).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { syncBuiltinESMExports } = require("module");

const ROOT = path.resolve(__dirname, process.env.APEX_VM_DEBUG_ROOT || "../..");
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

let index = null;
function byHash(src) {
  if (!index) {
    index = new Map();
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!/vendor|three/.test(e.name)) walk(p);
          continue;
        }
        if (!e.name.endsWith(".js")) continue;
        const t = fs.readFileSync(p, "utf8");
        for (const v of [t, t.replace(/^const\b/gm, "var")]) {
          index.set(sha(v), p);
          if (v.length > 400) index.set("p:" + sha(v.slice(0, 400)), p);
        }
      }
    };
    walk(path.join(ROOT, "js"));
  }
  const s = String(src);
  return index.get(sha(s)) || (s.length > 400 ? index.get("p:" + sha(s.slice(0, 400))) : undefined);
}

const stats = { abs: 0, relFixed: 0, hashFixed: 0, unknown: 0 };

function fix(src, opts) {
  const o = typeof opts === "string" ? { filename: opts } : { ...(opts || {}) };
  const f = o.filename;
  if (f && path.isAbsolute(f)) {
    stats.abs++;
    return o;
  }
  if (f && !/^evalmachine/.test(f)) {
    for (const cand of [path.join(ROOT, f), path.join(ROOT, "js", f)]) {
      if (fs.existsSync(cand)) {
        o.filename = cand;
        stats.relFixed++;
        return o;
      }
    }
  }
  const hit = typeof src === "string" && src.length > 200 ? byHash(src) : null;
  if (hit) {
    o.filename = hit;
    stats.hashFixed++;
  } else {
    stats.unknown++;
  }
  return o;
}

const wrap = (name, argIdx) => {
  const orig = vm[name];
  vm[name] = function (...a) {
    a[argIdx] = fix(a[0], a[argIdx]);
    return orig.apply(this, a);
  };
};
wrap("runInContext", 2);
wrap("runInNewContext", 2);
wrap("runInThisContext", 1);

const OrigScript = vm.Script;
vm.Script = class Script extends OrigScript {
  constructor(src, opts) {
    super(src, fix(src, opts));
  }
};
syncBuiltinESMExports();

if (process.env.APEX_VM_DEBUG_STATS) {
  process.on("exit", () => process._rawDebug("vm-debug-preload " + JSON.stringify(stats)));
}

module.exports = { ROOT, stats, fix, byHash };
