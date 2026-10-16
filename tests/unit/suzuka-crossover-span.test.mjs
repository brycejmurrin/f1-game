// Suzuka figure-8 green span must sit ON the lifted ribbon, not hover above it.
// Brief: clearance 5.5 left the soffit topping at y≈15 while the SRTM+bridges
// upper ribbon sits near y≈20 (≈5 m unsupported blob). Edge beams stay flush
// (clearance ≤ 0.5 m); soffit clearance tracks (upper − lower − thickness).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifyTrack, buildContext } = require("../../tools/track/verify-track.cjs");

function blockYRange(track, id) {
  const geo = track.propsGeo;
  const b = (geo.__blocks || []).find((x) => x.id === id);
  if (!b) return null;
  const pos = geo.pos;
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < b.count; i++) {
    const y = pos[(b.base + i) * 3 + 1];
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return { ymin, ymax };
}

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

  const cheek = md.emitted.find((e) => e.id === "suzuka-crossover-green-cheek-left");
  assert.ok(cheek, "green cheek pier must emit (was onTrack-skipped on the figure-8 left)");

  const hard = []
    .concat(md.invalid.filter((d) => d.required))
    .concat(md.unsafe.filter((d) => d.required))
    .concat(md.suppressed.filter((d) => d.required));
  assert.deepEqual(hard, [], "no required model diagnostics failures");
});

test("suzuka-crossover-deck soffit seats under the upper ribbon", () => {
  const Tracks = buildContext(null, { quiet: true });
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === "suzuka"));
  const n = track.n;
  const upperY = track.py[Math.round(0.845 * n) % n];
  const lowerY = track.py[Math.round(0.437 * n) % n];
  const md = track.modelDiagnostics;
  const deckMeta = md.emitted.find((e) => e.id === "suzuka-crossover-deck");
  assert.ok(deckMeta, "deck meta");
  // Declared clearance tracks the upper−lower rise (was hardcoded 5.5 → mid-gap).
  const rise = upperY - lowerY;
  assert.ok(
    deckMeta.clearance >= 4.8 && deckMeta.clearance >= rise - 3.0,
    `deck clearance ${deckMeta.clearance.toFixed(2)} should track rise ${rise.toFixed(2)}`,
  );
  const deck = blockYRange(track, "suzuka-crossover-deck");
  assert.ok(deck, "deck block present");
  // Soffit top within 1.0 m under the upper ribbon — was ~5 m mid-gap blob.
  // (ymin includes support piers to grade; do not assert underside from AABB.)
  const gap = upperY - deck.ymax;
  assert.ok(
    gap >= -0.15 && gap <= 1.0,
    `deck top ${deck.ymax.toFixed(2)} must sit under upper ${upperY.toFixed(2)} (gap ${gap.toFixed(2)})`,
  );
});

test("suzuka still verifies after the crossover flush fix", () => {
  assert.doesNotThrow(() => verifyTrack("suzuka", { quiet: true }));
});
