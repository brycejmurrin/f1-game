// Shrink-only ratchet: a modelGroup whose footprint the road guard rejects on
// every build ("footprint rejected" in verify-track's diagnostics, pit-complex
// supersessions excluded) must be in tests/data/footprint-rejected-baseline.json,
// and a row that lands now must be removed. tools/track/footprint-rejected.cjs
// is the CLI (`--all --update` drops stale rows and never adds one). The fleet
// test is narrowed by APEX_CIRCUITS like every sweep (tools/lib/circuit-scope.cjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FR = require("../../tools/track/footprint-rejected.cjs");
const MANIFEST = require("../../tools/manifest.cjs");
const { scope } = require("../../tools/lib/circuit-scope.cjs");

test("rejectedIds keeps only non-pit footprint rejections, once each", () => {
  const track = { modelDiagnostics: { suppressed: [
    { id: "b", reason: "footprint rejected" },
    { id: "a", reason: "emitted footprint rejected" },
    { id: "b", reason: "footprint rejected" },
    { id: "pit-garages-10", reason: "superseded by the pit complex" },
    { id: "pit-x", reason: "emitted footprint superseded by the pit complex" },
  ] } };
  assert.deepEqual(FR.rejectedIds(track), ["a", "b"]);
  assert.deepEqual(FR.rejectedIds({}), []);
});

test("compare flags a new id and a stale row; shrink only removes", () => {
  const baseline = { _why: "x", c1: ["old", "kept"], c2: ["gone"] };
  const measured = { c1: ["kept", "new"] };
  const { added, stale } = FR.compare(measured, baseline, ["c1", "c2"]);
  assert.deepEqual(added, ["c1: new"]);
  assert.deepEqual(stale.sort(), ["c1: old", "c2: gone"]);
  const next = FR.shrink(measured, baseline, ["c1", "c2"]);
  assert.deepEqual(next, { _why: "x", c1: ["kept"] }, "never adds 'new', drops emptied circuits");
});

test("baseline names only real circuits and lists each id once", () => {
  const base = FR.readBaseline();
  const roster = new Set(MANIFEST.CIRCUITS);
  for (const [k, ids] of Object.entries(base)) {
    if (k === "_why") continue;
    assert.ok(roster.has(k), `${k} is a circuit`);
    assert.ok(Array.isArray(ids) && ids.length > 0, `${k}: non-empty list`);
    assert.equal(new Set(ids).size, ids.length, `${k}: no duplicates`);
  }
});

test("no new never-landing modelGroup, and no stale baseline row (fleet)", { timeout: 900000 }, () => {
  const { buildContext } = require("../../tools/track/verify-track.cjs");
  const Tracks = buildContext(null, { quiet: true });
  const ids = scope(MANIFEST.CIRCUITS);
  assert.ok(ids.length > 0, "measured at least one circuit");
  const measured = FR.measure(ids, Tracks);
  const { added, stale } = FR.compare(measured, FR.readBaseline(), ids);
  assert.deepEqual(added, [], "a new 'footprint rejected' modelGroup: move it clear of the road");
  assert.deepEqual(stale, [], "a baseline row lands now: node tools/track/footprint-rejected.cjs --all --update");
});
