/* span-kinds.test.mjs — the agent view's span vocabulary must not fall behind
 * the emitters that produce it.
 *
 * WHY THIS EXISTS. `worldModel().spans` is how an agent sees linear furniture —
 * barriers, fences, grandstands — as a handful of runs instead of thousands of
 * 3-6 m segments. Each run carries the `kind` its emitter passed to
 * `ctx.noteSpan(...)`, and tests/specs/agent-view.spec.js asserts every kind it sees
 * is one it recognises.
 *
 * That assertion listed four kinds — guardrail, fence, tyreWall, wall — while
 * js/track/scenery/structures.js had grown to eight: the grandstand family
 * (bleacher, scaffoldStand, terrace, tieredBowl) became spans later, and the
 * spec was never updated. So the spec failed on any circuit that placed a
 * tiered bowl, and it failed with "tieredBowl is not in the list" rather than
 * anything that pointed at the real cause.
 *
 * The failure mode is the interesting part: the list can only ever be WRONG in
 * the direction of being stale, and the spec that consumes it runs in a browser
 * against one circuit — so whether it fires at all depends on which circuit
 * happens to place which furniture. This check is deterministic and free.
 *
 * Run: node --test tests/unit/span-kinds.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Every kind any emitter can hand to noteSpan, read off the call sites.
function emittedKinds() {
  // RECURSIVE: the emitters live in js/track/scenery/ since the 2026-09-03
  // move window, and a flat readdir of js/track/ silently found zero of them.
  const kinds = new Set();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!e.name.endsWith(".js")) continue;
      for (const m of fs.readFileSync(abs, "utf8").matchAll(/\bnoteSpan\(\s*"([a-zA-Z][\w-]*)"/g)) kinds.add(m[1]);
    }
  })(path.join(ROOT, "js/track"));
  return kinds;
}

// The list the spec asserts against.
function specKinds() {
  const src = read("tests/specs/agent-view.spec.js");
  const m = src.match(/const SPAN_KINDS = \[([\s\S]*?)\];/);
  assert.ok(m, "tests/specs/agent-view.spec.js must declare a SPAN_KINDS array");
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

test("every kind an emitter can produce is one the agent view recognises", () => {
  const emitted = emittedKinds();
  const known = specKinds();
  assert.ok(emitted.size >= 4, `found only ${emitted.size} noteSpan kinds — did the emitters move?`);
  const missing = [...emitted].filter((k) => !known.has(k)).sort();
  assert.deepEqual(missing, [],
    "an emitter can produce a span kind that agent-view.spec.js does not accept — add it to SPAN_KINDS");
});

test("the spec does not list kinds nothing emits", () => {
  // The other direction. A stale entry is harmless at runtime but it means the
  // list has stopped describing the code, which is how it drifted last time.
  const emitted = emittedKinds();
  const extra = [...specKinds()].filter((k) => !emitted.has(k)).sort();
  assert.deepEqual(extra, [],
    "SPAN_KINDS names a kind no emitter produces — remove it, or the list is fiction");
});
