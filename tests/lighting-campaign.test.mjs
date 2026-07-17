import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TRACKS, TODS, WEATHERS, CAMERA_FRACTIONS, SHARDS, SLIDER_GROUPS, REGIONS,
  conditionKey, enumerateConditions, validateConfig,
} from "../tools/lighting-campaign/config.mjs";
import { measurePixels, evaluateGates } from "../tools/lighting-campaign/metrics.mjs";
import {
  validateProfile,
  validateRecord,
  mergeRecords,
  mergeFragments,
  readJsonLines,
  appendJsonLine,
} from "../tools/lighting-campaign/io.mjs";

const TEST_TUNE_DEFS = [
  { id: "ambientMul", min: 0, max: 4 },
  { id: "tint", min: -1, max: 1 },
];

function makeRecord(overrides = {}) {
  const condition = enumerateConditions([TRACKS[0]])[0];
  const record = {
    schema: "apex26.lighting-campaign/v1",
    track: condition.track,
    tod: condition.tod,
    weather: condition.weather,
    key: condition.key,
    views: [{ camera: 0 }, { camera: 1 }, { camera: 2 }],
    profile: { ambientMul: 1.2 },
    gates: { ok: true, failures: [] },
  };
  return { ...record, ...overrides };
}

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

test("profile validation rejects unknown and out-of-range controls", () => {
  assert.deepEqual(validateProfile({ ambientMul: 1.2 }, TEST_TUNE_DEFS), { ambientMul: 1.2 });
  assert.throws(() => validateProfile({ missing: 1 }, TEST_TUNE_DEFS), /unknown slider/i);
  assert.throws(() => validateProfile({ tint: 2 }, TEST_TUNE_DEFS), /out of range/i);
});

test("record validation requires schema, canonical key, three views, and passing gates", () => {
  assert.doesNotThrow(() => validateRecord(makeRecord()));
  assert.throws(() => validateRecord(makeRecord({ schema: "wrong" })), /schema/i);
  assert.throws(() => validateRecord(makeRecord({ key: "wrong|key|value" })), /key/i);
  assert.throws(() => validateRecord(makeRecord({ views: [{}, {}] })), /three views/i);
  assert.throws(() => validateRecord(makeRecord({ gates: { ok: false, failures: ["black-clip"] } })), /gate/i);
});

test("record merge requires one unique complete matrix record per key", () => {
  const rows = enumerateConditions().map((condition) => ({
    schema: "apex26.lighting-campaign/v1",
    ...condition,
    views: [{ camera: 0 }, { camera: 1 }, { camera: 2 }],
    profile: {},
    gates: { ok: true, failures: [] },
  }));
  const result = mergeRecords(rows.slice().reverse(), TEST_TUNE_DEFS);
  const keys = Object.keys(result.presets);
  assert.equal(keys.length, 480);
  assert.deepEqual(keys, keys.slice().sort());
  assert.equal(result.records.length, 480);
  assert.equal(result.summary.totalRecords, 480);
  assert.equal(result.summary.totalConditions, 480);
  assert.equal(result.summary.missingConditions, 0);
  assert.throws(() => mergeRecords([...rows, rows[0]], TEST_TUNE_DEFS), /duplicate condition/i);
  assert.throws(() => mergeRecords(rows.slice(1), TEST_TUNE_DEFS), /missing condition/i);
});

test("json line fragments append, reread, and merge deterministically", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lighting-campaign-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const shardA = join(dir, "a.jsonl");
  const shardB = join(dir, "b.jsonl");
  const rows = enumerateConditions();

  appendJsonLine(shardA, makeRecord(rows[1]));
  appendJsonLine(shardB, makeRecord(rows[0]));

  assert.deepEqual(readJsonLines(shardA), [makeRecord(rows[1])]);
  const merged = mergeFragments([shardA, shardB], TEST_TUNE_DEFS, { expectedConditions: rows.slice(0, 2) });
  assert.deepEqual(Object.keys(merged.presets), [rows[0].key, rows[1].key]);
  assert.equal(merged.summary.fragmentCount, 2);
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
