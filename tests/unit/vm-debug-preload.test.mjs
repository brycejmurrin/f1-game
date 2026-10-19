/* vm-debug-preload.test.mjs — opt-in preload turns a brake-cue-style load
 * (no filename) into a file:// URL. Off by default; this file requires it.
 *
 * Run: node --test tests/unit/vm-debug-preload.test.mjs
 *   or: npm run debug:unit -- tests/unit/vm-debug-preload.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const preload = require("../../tools/lib/vm-debug-preload.cjs");

const BRAKE = path.join(ROOT, "js/physics/brake-cue.js");
const BRAKE_SRC = fs.readFileSync(BRAKE, "utf8").replace(/^const\b/gm, "var");
const BRAKE_URL = pathToFileURL(BRAKE).href;

function probeStack(src, opts) {
  const ctx = {
    window: {},
    performance: { now: () => 0 },
    M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
  };
  try {
    vm.runInNewContext(src + "\nthrow new Error(\"APEX_VM_DEBUG_PROBE\")", ctx, opts);
    assert.fail("expected probe throw");
  } catch (e) {
    assert.ok(e && e.stack, "probe must produce a stack");
    return String(e.stack);
  }
}

test("brake-cue-style load with no filename reports a file:// URL", () => {
  assert.ok(BRAKE_SRC.length > 200, "fixture source must be long enough for hash match");
  const before = { ...preload.stats };
  const stack = probeStack(BRAKE_SRC);
  assert.match(stack, /file:\/\//, `stack must carry a file:// URL:\n${stack}`);
  assert.ok(
    stack.includes("brake-cue.js") || stack.includes(BRAKE_URL) || stack.includes(BRAKE),
    `stack must name brake-cue.js:\n${stack}`,
  );
  assert.ok(preload.stats.hashFixed > before.hashFixed, "preload must count a hashFixed rewrite");
});

test("a relative js/ filename becomes absolute", () => {
  const before = { ...preload.stats };
  const stack = probeStack("throw new Error(\"APEX_VM_DEBUG_REL\")", { filename: "js/physics/brake-cue.js" });
  assert.match(stack, /file:\/\//, `relative filename must become file://:\n${stack}`);
  assert.ok(stack.includes("brake-cue.js"), `stack must name brake-cue.js:\n${stack}`);
  assert.ok(preload.stats.relFixed > before.relFixed, "preload must count a relFixed rewrite");
});

test("fix() returns absolute when given a relative that exists", () => {
  const o = preload.fix("1+1", { filename: "js/core/log.js" });
  assert.ok(path.isAbsolute(o.filename), o.filename);
  assert.ok(o.filename.endsWith(`${path.sep}js${path.sep}core${path.sep}log.js`), o.filename);
});
