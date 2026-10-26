import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs");
const TRACK_REL = MANIFEST.circuitPath("albert_park");
const TRACK_FILE = path.join(ROOT, TRACK_REL);
// The bespoke scenery closure lives in js/circuits/scenery/ now (LAZY_SCENERY —
// it is 1,083 KB across 40 circuits and only one is ever built). Both halves are
// this circuit's source as far as these assertions are concerned, so read both;
// otherwise every scenery-body assertion below silently stops seeing its target.
const SCENERY_REL = MANIFEST.sceneryPath("albert_park");
const SCENERY_FILE = path.join(ROOT, SCENERY_REL);

function loadDefinition() {
  const window = { TrackDefs: [] };
  vm.runInNewContext(fs.readFileSync(TRACK_FILE, "utf8"), { window }, {
    filename: absSrc(TRACK_REL),
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

test("Albert Park excludes shared foliage for bespoke park densification", () => {
  const def = loadDefinition();
  const fullLapKinds = new Set(
    def.dressingExclusions
      ?.filter((rule) => rule.s0 === 0 && rule.s1 === 1)
      .flatMap((rule) => rule.kinds || [rule.kind])
  );
  assert.ok(fullLapKinds.has("foliage"), "missing full-lap foliage exclusion");
  // Generic mast pass owns night lamps — do not blanket-exclude lighting.
  assert.ok(!fullLapKinds.has("lamps") && !fullLapKinds.has("floodlights") && !fullLapKinds.has("lighting"),
    "must not exclude lighting full-lap (generic masts provide night lamps)");
});

test("Albert Park uses typed foundation helpers for water and grounded runoff", () => {
  const source = fs.readFileSync(TRACK_FILE, "utf8") + fs.readFileSync(SCENERY_FILE, "utf8");
  assert.match(source, /\bwaterSurface\s*\(/);
  assert.match(source, /\bgroundPatch\s*\(/);
});

// #3349 — cityFront was voided; CBD read as abstract tower stubs on the
// lakeside horizon. Require a live lakeside call (side -1) and no void.
// Prefer equal/behaviour checks so this does not raise the pin ceiling.
test("Albert Park CBD skyline uses cityFront beyond the lake (#3349)", () => {
  const source = fs.readFileSync(SCENERY_FILE, "utf8");
  const voided = /\bvoid\s+cityFront\b/.test(source);
  const calls = (source.match(/\bcityFront\s*\(/g) || []).length;
  const lakeside = /\bcityFront\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*-1\s*,/.test(source);
  assert.equal(voided, false, "cityFront must not be voided (#3349)");
  assert.equal(calls >= 1 && lakeside, true,
    `need ≥1 lakeside cityFront(…, -1, …); got calls=${calls} lakeside=${lakeside}`);
});
