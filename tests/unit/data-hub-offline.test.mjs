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

// #2190: a tab built from the API's stored copy (refetch failed) dates its
// footnote by that copy and says so; a node that knows when it goes stale
// (Schedule's NEXT) is rebuilt then, not after MAX_AGE.
test("footnote dates a stale-cache serve and flags it; reuse honours node.nextFlipAt", () => {
  assert.match(HUB, /staleApi\.staleMark\(\)/);
  assert.match(HUB, /dataAt: staleAt,\s*offlineCopy: staleAt != null/);
  assert.match(HUB, /footnote\(st\.dataAt \|\| st\.at, st\.offlineCopy\)/);
  assert.match(HUB, /if \(offlineCopy \|\| navigator\.onLine === false\) txt \+= " · offline copy"/);
  assert.match(HUB, /!\(Date\.now\(\) >= st\.node\.nextFlipAt\)/);
});
