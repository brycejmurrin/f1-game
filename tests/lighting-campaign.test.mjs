import test from "node:test";
import assert from "node:assert/strict";
import {
  TRACKS, TODS, WEATHERS, CAMERA_FRACTIONS, SHARDS,
  conditionKey, enumerateConditions, validateConfig,
} from "../tools/lighting-campaign/config.mjs";

test("lighting campaign enumerates the complete unique matrix", () => {
  const rows = enumerateConditions();
  assert.equal(TRACKS.length, 24);
  assert.deepEqual(TODS, ["dawn", "day", "dusk", "night"]);
  assert.deepEqual(WEATHERS, ["dry", "wet", "rain", "fog", "overcast"]);
  assert.equal(rows.length, 480);
  assert.equal(new Set(rows.map((row) => row.key)).size, 480);
  assert.equal(rows.filter((row) => row.track === "monaco").length, 20);
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

test("condition keys use the shipped preset format", () => {
  assert.equal(conditionKey("monaco", "dusk", "wet"), "monaco|dusk|wet");
  assert.throws(() => conditionKey("../bad", "day", "dry"), /unknown track/);
});
