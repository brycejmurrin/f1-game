import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
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

test("Albert Park runtime build emits required fountains and safe water geometry", () => {
  const expression = `(() => {
    const models = a.modelDiagnostics();
    const geometry = a.geometryDiagnostics();
    const requiredFailures = [
      ...models.invalid, ...models.suppressed, ...models.unsafe,
    ].filter((entry) => entry.required);
    return {
      requiredFailures,
      fountains: models.emitted
        .filter((entry) => entry.required && entry.id.startsWith("albert-lake-fountain-"))
        .map((entry) => ({ id: entry.id, vertices: entry.vertices })),
      lakeIds: models.emitted
        .filter((entry) => entry.water && entry.id.startsWith("albert-"))
        .map((entry) => entry.id),
      water: geometry.find((entry) => entry.name === "water"),
      badGeometry: geometry.filter((entry) => !entry.ok),
      spanClearances: models.emitted
        .filter((entry) => entry.overhead)
        .map((entry) => entry.clearance),
      ground: [0.04, 0.30, 0.62, 0.78, 0.97].flatMap((frac) =>
        [-12, 12].map((lat) => ({ frac, lat, gap: a.groundY(frac, lat).gap }))),
      walls: a.wallStats(),
    };
  })()`;
  const output = execFileSync(process.execPath, [
    "tools/apex-eval.mjs", "albert_park", expression, "--raw",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const result = JSON.parse(output);

  assert.deepEqual(result.requiredFailures, []);
  assert.equal(result.fountains.length, 2);
  assert.ok(result.fountains.every((entry) => entry.vertices > 0));
  assert.ok(result.lakeIds.includes("albert-lake-west"));
  assert.ok(result.lakeIds.includes("albert-lake-east"));
  assert.ok(result.lakeIds.length >= 8);
  assert.equal(result.water.ok, true);
  assert.ok(result.water.vertices > 0);
  assert.ok(result.water.indices > 0);
  assert.deepEqual(result.badGeometry, []);
  assert.ok(result.spanClearances.every((clearance) => clearance >= 4.8));
  assert.ok(result.ground.every(({ gap }) => gap === null || gap <= 0.18));
  assert.equal(result.walls.anyNaN, false);
  assert.ok(result.walls.minOverHw > -1.5);
});
