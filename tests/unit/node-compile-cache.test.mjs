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
