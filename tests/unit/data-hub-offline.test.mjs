/* Data Hub errorBlock — offline vs upstream vs cached copy. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HUB = fs.readFileSync(path.join(ROOT, "js/data/hub.js"), "utf8");

test("errorBlock distinguishes offline, upstream, and cached copy", () => {
  assert.match(HUB, /OFFLINE/);
  assert.match(HUB, /SERVICE UNAVAILABLE/);
  assert.match(HUB, /OFFLINE · CACHED/);
  assert.match(HUB, /REFRESH FAILED · CACHED/);
  assert.match(HUB, /dataset\.reason = reason/);
  assert.match(HUB, /offline-cached/);
  assert.match(HUB, /upstream-cached/);
  assert.match(HUB, /offline copy/);
});

test("errorBlock still keeps stale node path in loadTab", () => {
  assert.match(HUB, /KEEP the stale node/);
  assert.match(HUB, /hasStale/);
  assert.match(HUB, /Showing the last data/);
});
