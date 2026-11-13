/* track-accuracy-circuits.test.mjs — node port of the shape and direction
 * verdict in tests/specs/f1-track-accuracy.spec.js (#3039 TK2-10). Every
 * shipped circuit, built in the headless track VM (tools/track/verify-track.cjs),
 * against its pinned bacinger/f1-circuits reference
 * (tests/data/f1-circuit-reference.geojson) under the same MAX_SHAPE_ERROR.
 * The browser spec stays: it also proves the hydrate gate (ensureCircuit) and
 * renders the overview gallery. This port checks two inputs:
 *   1. the authored `path.pts` the spec reads, and
 *   2. the BUILT centreline sampled the way __apex.trackShape() samples it
 *      (Tracks.sample at n even lap fractions), so a build-pipeline distortion
 *      (spline, startFrac, reverse) fails here too, in seconds.
 * Run: node --test tests/unit/track-accuracy-circuits.test.mjs */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { compareCircuit, MAX_SHAPE_ERROR, signedArea, validateMappings }
  from "../../tools/track/track-accuracy-validator.mjs";
import { CIRCUIT_MAP, RACE_DIRECTION_OVERRIDES } from "../helpers/track-accuracy-map.mjs";

const require2 = createRequire(import.meta.url);
const { buildContext } = require2("../../tools/track/verify-track.cjs");
const Tracks = buildContext(undefined, { quiet: true });
const REFERENCE = JSON.parse(fs.readFileSync(new URL("../data/f1-circuit-reference.geojson", import.meta.url), "utf8"));
const references = new Map(REFERENCE.features.map((f) => [f.properties.id, f]));
const shipped = Tracks.LIST.filter((d) => !d.custom);

function referenceCoords(referenceId) {
  let coords = references.get(referenceId).geometry.coordinates;
  const want = RACE_DIRECTION_OVERRIDES[referenceId];
  const have = signedArea(coords) < 0 ? "CW" : "CCW";
  if (want && have !== want) coords = [...coords].reverse();
  return coords;
}

// __apex.trackShape()'s sampling (js/agent/apex.js), in east/north: the game's
// +z is south, so z is negated, as the spec does for path.pts.
function builtEastNorth(def, steps = 400) {
  const t = Tracks.buildCenterline(def, { line: false });   // the road only: the racing-line bake is not shape
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  const out = [];
  for (let i = 0; i < steps; i++) { Tracks.sample(t, (i / steps) * t.total, smp); out.push([smp.p[0], -smp.p[2]]); }
  return out;
}

function verdicts(shapeOf) {
  const bad = [];
  for (const [gameId, referenceId] of Object.entries(CIRCUIT_MAP)) {
    const def = shipped.find((d) => d.id === gameId);
    const r = compareCircuit(referenceCoords(referenceId), shapeOf(def));
    if (!r.directionMatch) bad.push(`${gameId}: direction ${r.gameDirection} vs ${r.referenceDirection}`);
    if (!(r.shapeError <= MAX_SHAPE_ERROR)) bad.push(`${gameId}: shape ${r.shapeError.toFixed(3)} > ${MAX_SHAPE_ERROR}`);
  }
  return bad;
}

test("the circuit map covers every shipped circuit and every pinned reference, once", () => {
  const game = Object.fromEntries(shipped.map((d) => [d.id, { pts: d.path.pts, len: d.path.len, reverse: !!d.reverse }]));
  assert.deepEqual(validateMappings(CIRCUIT_MAP, game, references), []);
  assert.deepEqual(Object.keys(game).sort(), Object.keys(CIRCUIT_MAP).sort());
  assert.equal(references.size, Object.keys(CIRCUIT_MAP).length);
});

test("every authored path matches its reference in direction and shape (the spec's verdict)", () => {
  assert.deepEqual(verdicts((def) => {
    const en = def.path.pts.map(([x, z]) => [x, -z]);
    return def.reverse ? [...en].reverse() : en;
  }), []);
});

test("every BUILT centreline (trackShape sampling) matches its reference in direction and shape", () => {
  assert.deepEqual(verdicts((def) => builtEastNorth(def)), []);
});
