import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TRACKS, TODS, WEATHERS, CAMERA_FRACTIONS, SHARDS, SLIDER_GROUPS, REGIONS,
  conditionKey, enumerateConditions, validateConfig,
} from "../tools/lighting-campaign/config.mjs";
import { measurePixels, evaluateGates } from "../tools/lighting-campaign/metrics.mjs";

async function importModifiedConfig(search, replacement) {
  const source = await readFile(new URL("../tools/lighting-campaign/config.mjs", import.meta.url), "utf8");
  assert.ok(source.includes(search), `config fixture contains ${search}`);
  return import(`data:text/javascript,${encodeURIComponent(source.replace(search, replacement))}`);
}

test("lighting campaign enumerates the complete unique matrix", () => {
  const rows = enumerateConditions();
  assert.equal(TRACKS.length, 24);
  assert.deepEqual(TODS, ["dawn", "day", "dusk", "night"]);
  assert.deepEqual(WEATHERS, ["dry", "wet", "rain", "fog", "overcast"]);
  assert.equal(rows.length, 480);
  assert.equal(new Set(rows.map((row) => row.key)).size, 480);
  assert.equal(rows.filter((row) => row.track === "monaco").length, 20);
  assert.deepEqual(
    rows.map((row) => row.key),
    TRACKS.flatMap((track) => TODS.flatMap((tod) =>
      WEATHERS.map((weather) => `${track}|${tod}|${weather}`))),
  );
  assert.deepEqual(rows.slice(0, 6).map((row) => row.key), [
    "abudhabi|dawn|dry",
    "abudhabi|dawn|wet",
    "abudhabi|dawn|rain",
    "abudhabi|dawn|fog",
    "abudhabi|dawn|overcast",
    "abudhabi|day|dry",
  ]);
  assert.deepEqual(rows.slice(-6).map((row) => row.key), [
    "zandvoort|dusk|overcast",
    "zandvoort|night|dry",
    "zandvoort|night|wet",
    "zandvoort|night|rain",
    "zandvoort|night|fog",
    "zandvoort|night|overcast",
  ]);
});

test("every track has exactly three legal camera fractions and one shard", () => {
  validateConfig();
  for (const track of TRACKS) {
    assert.equal(CAMERA_FRACTIONS[track].length, 3);
    assert.ok(CAMERA_FRACTIONS[track].every((v) => v >= 0 && v < 1));
    assert.equal(SHARDS.filter((ids) => ids.includes(track)).length, 1);
  }
  assert.equal(new Set(SHARDS.flat()).size, 24);
});

test("validation rejects unknown, duplicate, missing, and illegal config entries", async () => {
  const unknownShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort", "unknown"]',
  );
  assert.throws(() => unknownShard.validateConfig(), /invalid shard coverage/);

  const duplicateShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort", "vegas"]',
  );
  assert.throws(() => duplicateShard.validateConfig(), /invalid shard coverage/);

  const missingShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort"]',
  );
  assert.throws(() => missingShard.validateConfig(), /invalid shard coverage/);

  const illegalCamera = await importModifiedConfig(
    "monaco: [0.05, 0.22, 0.45]",
    "monaco: [0.05, 0.22, 1.00]",
  );
  assert.throws(() => illegalCamera.validateConfig(), /invalid camera coverage: monaco/);

  const duplicateCamera = await importModifiedConfig(
    "monaco: [0.05, 0.22, 0.45]",
    "monaco: [0.05, 0.22, 0.22]",
  );
  assert.throws(() => duplicateCamera.validateConfig(), /invalid camera coverage: monaco/);
});

test("nested exported configuration is immutable", () => {
  assert.ok(Object.values(CAMERA_FRACTIONS).every(Object.isFrozen));
  assert.ok(SLIDER_GROUPS.every((group) => Object.isFrozen(group) && Object.isFrozen(group.labels)));
  assert.ok(Object.values(REGIONS).every(Object.isFrozen));
});

test("condition keys use the shipped preset format", () => {
  assert.equal(conditionKey("monaco", "dusk", "wet"), "monaco|dusk|wet");
  assert.throws(() => conditionKey("../bad", "day", "dry"), /unknown track/);
});

test("pixel metrics report percentiles, clipping, and named regions", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 32, 32, 32, 255,
    128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  const result = measurePixels(data, 2, 2, { frame: [0, 0, 1, 1] });
  assert.equal(result.frame.count, 4);
  assert.equal(result.frame.blackClipFraction, 0.25);
  assert.equal(result.frame.whiteClipFraction, 0.25);
  assert.ok(result.frame.p95 > result.frame.p05);
});

test("hard gates reject clipping, WebGL errors, and missing night lights", () => {
  const bad = evaluateGates({
    metrics: { frame: { blackClipFraction: 0.09, whiteClipFraction: 0, p05: 0, p95: 100 } },
    lightState: { numLights: 0, ambientSky: [0.1, 0.1, 0.1] },
    webglError: 1282, pageErrors: [], tod: "night",
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(new Set(bad.failures), new Set(["black-clip", "webgl-error", "night-lights"]));
});

test("pixel metrics bound regions beyond the frame to a deterministic edge pixel", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 32, 32, 32, 255,
    128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  const result = measurePixels(data, 2, 2, { beyond: [1.2, 1.4, 0.1, 0.1] });
  assert.equal(result.beyond.count, 1);
  assert.ok(Math.abs(result.beyond.mean - 255) < 1e-12);
  assert.equal(result.beyond.p05, result.beyond.mean);
  assert.equal(result.beyond.p50, result.beyond.mean);
  assert.equal(result.beyond.p95, result.beyond.mean);
  assert.equal(result.beyond.blackClipFraction, 0);
  assert.equal(result.beyond.whiteClipFraction, 1);
  assert.equal(result.beyond.edgeEnergy, 0);
});

test("pixel metrics report mean absolute horizontal edge energy", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 10, 10, 10, 255, 40, 40, 40, 255,
  ]);
  const result = measurePixels(data, 3, 1, { frame: [0, 0, 1, 1] });
  assert.ok(Math.abs(result.frame.edgeEnergy - 20) < 1e-12);
});

test("hard gates report white clipping, narrow tonal range, and page errors", () => {
  const bad = evaluateGates({
    metrics: { frame: { blackClipFraction: 0, whiteClipFraction: 0.03, p05: 20, p95: 64 } },
    lightState: { numLights: 0, ambientSky: [0.1, 0.1, 0.1] },
    webglError: 0, pageErrors: ["render failed"], tod: "day",
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(new Set(bad.failures), new Set(["white-clip", "tonal-range", "page-error"]));
});
