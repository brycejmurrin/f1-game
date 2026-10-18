"use strict";
// @doc NODE_COMPILE_CACHE env for tooling-fast / run-group child processes (off under coverage).

const path = require("path");

/** Extra env for child Node processes (tooling-fast, run-group, CI node-suites). */
function augmentNodeCompileCache(env = process.env, root) {
  if (env.NODE_DISABLE_COMPILE_CACHE === "1") return {};
  if (env.NODE_V8_COVERAGE || env.APEX_JS_COVERAGE === "1") return {};
  const base = root || path.resolve(__dirname, "../..");
  return { NODE_COMPILE_CACHE: path.join(base, "artifacts", ".node-compile-cache") };
}

module.exports = { augmentNodeCompileCache };
