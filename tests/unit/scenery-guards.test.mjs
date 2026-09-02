// scenery-guards.test.mjs — the on-track guards must drop what is ON the road,
// not everything with a normal gap. Bug hunt 2026-09-02 found two guards whose
// margin was geometrically impossible to satisfy: the guardrail post test used
// a fixed 0.5 m against posts anchored at gap 0.4/0.5 (every Monaco armco post
// — 220 of them — suppressed while the driving limit was still recorded), and
// the billboard test used the panel's ALONG-track length as a radial margin
// (all 44 Qatar boards, all 7 Monaco boards dead). The counts are per-kind
// guard drops from the real build (modelDiagnostics.suppressedCounts).
//
// Run: node --test tests/unit/scenery-guards.test.mjs   (npm run test:tooling)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/verify-track.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const counts = (Tracks, id) => {
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, `${id} exists`);
  const track = Tracks.build(def);
  return track.modelDiagnostics.suppressedCounts || {};
};

test("Monaco's armco keeps its posts: the guardrail guard margin stays below the gap", () => {
  const Tracks = buildContext();
  const c = counts(Tracks, "monaco");
  assert.equal(c.guardrail || 0, 0, `monaco guardrail suppressed=${c.guardrail}`);
});

test("billboards with a normal gap are built: Qatar and Monaco lose none to the guard", () => {
  const Tracks = buildContext();
  for (const id of ["qatar", "monaco"]) {
    const c = counts(Tracks, id);
    assert.equal(c.billboard || 0, 0, `${id} billboard suppressed=${c.billboard}`);
  }
});

test("bakedModel rides the scenery transform like the fallback it replaces", () => {
  // A baked asset stands in for a WRAPPED procedural call at the same (k, side),
  // so it must take the same origin shift and reverse flip; unwrapped it stood
  // 2/3 of a lap away on every shifted circuit that ships one.
  const src = fs.readFileSync(path.join(ROOT, "js/track/tracks.js"), "utf8");
  const i = src.indexOf("function transformSceneryApi(");
  assert.ok(i >= 0);
  const kSide = src.slice(i).match(/for \(const name of \[([^\]]*)\]\) \{\s*const f = api\[name\]; if \(f\) w\[name\] = \(k, side, \.\.\.r\)/);
  assert.ok(kSide, "the (k, side) wrapper list exists");
  assert.match(kSide[1], /"bakedModel"/);
});

test("the backdrop guard RECORDS its drops — it was the one emitter that did not", () => {
  // Every other suppression site calls ctx.noteSuppressed, which lands the drop
  // in modelDiagnostics.suppressedCounts. `backdrop` called a bare Log.info, so
  // its drops reached no test, no tool and no __apex hook: verify-track cannot
  // fail on a diagnostic it never receives, and this very file could not have
  // caught them. The moment it was given a counter it reported 539 suppressed
  // backdrops fleet-wide — 295 at redbull alone, 43 % of that circuit's calls.
  //
  // This asserts the WIRING, not the margin. The margin is separately suspect
  // (it uses the box's along-track length as a radial margin, the same shape
  // this file's header describes for billboards) and is left alone on purpose —
  // an oriented test suppresses MORE, not fewer. Numbers: PERF-FINDINGS 2u.
  const Tracks = buildContext();
  const c = counts(Tracks, "redbull");
  assert.ok(c.backdrop > 0,
    "redbull drops backdrops and the count must be visible — a bare Log.info " +
    "makes the drop unobservable, which is how 539 of them went unnoticed");
  // Ratchet: this number moving means the guard's behaviour moved. That is
  // allowed, but it must be a deliberate edit with a rendered look behind it,
  // not a side effect. Raise or lower it in the same commit that changes it.
  assert.equal(c.backdrop, 295,
    `redbull backdrop drops = ${c.backdrop}, expected 295 — if you changed the ` +
    `guard, re-measure and update this with the reason`);
});
