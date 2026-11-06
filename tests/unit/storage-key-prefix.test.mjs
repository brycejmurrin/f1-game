import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AGENTS.md: localStorage keys are prefixed `apex26.` — a rule stated for the
// whole tree and, until round 6, enforced nowhere (a census found all ~185
// call sites compliant BY LUCK). This scan pins it: every STRING-LITERAL key
// handed to localStorage/sessionStorage get/set/remove must carry the prefix.
// Keys routed through GameStore.store are exempt by construction (store.js
// prefixes on both read and write — cam-tune's "camTune" and season-cal's
// "seasonCfg" are that shape and never reach the raw API), so only direct
// literal calls are in scope, which is exactly where a wrong key can land.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Allowlist: repo-relative file -> { key -> reason }. A new entry REQUIRES a
// reason string; an empty reason fails the test.
const ALLOW = {
  "js/car/ghost.js": {
    "apex_ghost_v1": "pre-convention key, READ+REMOVED once by the one-shot migrateKey(); new writes go to apex26.ghost.v1",
  },
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("every literal localStorage/sessionStorage key is apex26.-prefixed (or allowlisted with a reason)", () => {
  const bad = [];
  for (const p of walk(path.join(ROOT, "js"))) {
    const rel = path.relative(ROOT, p).split(path.sep).join("/");
    const src = fs.readFileSync(p, "utf8");
    for (const m of src.matchAll(
      /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["']([^"']+)["']/g)) {
      const key = m[1];
      if (key.startsWith("apex26.")) continue;
      const reason = ALLOW[rel] && ALLOW[rel][key];
      if (reason && reason.length > 10) continue;
      const line = src.slice(0, m.index).split("\n").length;
      bad.push(`${rel}:${line} "${key}"`);
    }
  }
  assert.deepEqual(bad, [],
    "un-prefixed storage keys — prefix with apex26., route through GameStore.store, " +
    "or allowlist WITH a reason: " + bad.join(", "));
});

test("the allowlist does not hold entries the tree no longer needs", () => {
  for (const [rel, keys] of Object.entries(ALLOW)) {
    const p = path.join(ROOT, rel);
    assert.ok(fs.existsSync(p), `allowlist names ${rel}, which does not exist`);
    const src = fs.readFileSync(p, "utf8");
    for (const key of Object.keys(keys)) {
      assert.ok(src.includes(`"${key}"`) || src.includes(`'${key}'`),
        `allowlist carries ${rel} "${key}" but the file no longer uses it — drop the entry`);
    }
  }
});
