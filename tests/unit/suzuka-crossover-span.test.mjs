// Suzuka figure-8 green span must sit ON the lifted ribbon, not hover above it.
// Brief: a prior overheadSpan at frac 0.845 with clearance 8.6 hung ~8 m above
// the SRTM-lifted back-straight. Edge beams use clearance ≤ 0.5 m (flush).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifyTrack, buildContext } = require("../../tools/track/verify-track.cjs");

test("suzuka-crossover-green-span emits flush with the upper ribbon", () => {
  const Tracks = buildContext(null, { quiet: true });
  const def = Tracks.LIST.find((d) => d.id === "suzuka");
  assert.ok(def, "suzuka def");
  const track = Tracks.build(def);
  const md = track.modelDiagnostics;
  assert.ok(md, "modelDiagnostics");

  const green = md.emitted.filter((e) => e.id === "suzuka-crossover-green-span");
  assert.equal(green.length, 1, "green-span must emit exactly once");
  assert.ok(green[0].overhead, "green-span is an overheadSpan");
  assert.ok(
    green[0].clearance <= 0.5,
    `green-span clearance ${green[0].clearance} must be ≤ 0.5 m (flush with ribbon)`,
  );

  const deck = md.emitted.find((e) => e.id === "suzuka-crossover-deck");
  assert.ok(deck, "dark soffit deck still emits");
  assert.ok(deck.clearance >= 4.8, "lower-road clearance ≥ 4.8 m");

  const portal = md.emitted.find((e) => e.id === "suzuka-crossover-portal");
  assert.ok(portal, "crossover portal still emits");

  const hard = []
    .concat(md.invalid.filter((d) => d.required))
    .concat(md.unsafe.filter((d) => d.required))
    .concat(md.suppressed.filter((d) => d.required));
  assert.deepEqual(hard, [], "no required model diagnostics failures");
});

test("suzuka still verifies after the crossover flush fix", () => {
  assert.doesNotThrow(() => verifyTrack("suzuka", { quiet: true }));
});
