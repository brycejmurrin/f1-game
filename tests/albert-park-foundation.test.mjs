import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACK_FILE = path.join(ROOT, "js/tracks/albert_park.js");

function loadDefinition() {
  const window = { TrackDefs: [] };
  vm.runInNewContext(fs.readFileSync(TRACK_FILE, "utf8"), { window }, {
    filename: "js/tracks/albert_park.js",
  });
  return window.TrackDefs[0];
}

test("Albert Park uses an explicit essentially-flat racing-space terrain contract", () => {
  const def = loadDefinition();
  assert.equal(def.sceneryCoordinates, "racing");
  assert.equal(def.flatTerrain, true);
  assert.ok(def.terrainOuter >= 90);
  assert.ok(def.elevations?.length >= 2);
  assert.ok(def.elevations.every((zone) => Math.abs(zone.rise) <= 0.75));
  const rises = def.elevations.map((zone) => zone.rise);
  assert.ok(Math.max(...rises) - Math.min(...rises) <= 1.2);
});

test("Albert Park excludes shared dressing replaced by bespoke park dressing", () => {
  const def = loadDefinition();
  const fullLapKinds = new Set(
    def.dressingExclusions
      ?.filter((rule) => rule.s0 === 0 && rule.s1 === 1)
      .flatMap((rule) => rule.kinds || [rule.kind])
  );
  for (const kind of ["foliage", "lamps", "floodlights"])
    assert.ok(fullLapKinds.has(kind), `missing full-lap ${kind} exclusion`);
});

test("Albert Park uses typed foundation helpers for water and grounded runoff", () => {
  const source = fs.readFileSync(TRACK_FILE, "utf8");
  assert.match(source, /\bwaterSurface\s*\(/);
  assert.match(source, /\bgroundPatch\s*\(/);
  assert.doesNotMatch(source, /\bgroundPlane\s*\(/);
});
