/* share-card-data.test.mjs — pure, privacy-bounded card models. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Object, Array, String, Number, JSON, Math, isFinite });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-data.js"), "utf8"), ctx);
  return vm.runInContext("ShareCardData", ctx);
}

test("fromDaily returns a frozen JSON-safe model with only the card schema", () => {
  const data = load();
  const model = data.fromDaily(
    { day: "2026-10-17", trackId: "spa", trackName: "Spa\u0000-Francorchamps", weather: "wet", tod: "dusk" },
    { best: 81.345, secret: "drop me" },
    "gold",
    4,
    { link: "https://example.test/#share=APXD1.x", displayName: "  DRIVER 7\u0007  " },
  );
  assert.deepEqual(Object.keys(model), Array.from(data.MODEL_KEYS));
  assert.equal(model.kind, "daily");
  assert.equal(model.trackName, "Spa -Francorchamps");
  assert.equal(model.hero.value, "1:21.345");
  assert.equal(model.hero.medal, "GOLD");
  assert.equal(model.hero.streak, 4);
  assert.equal(model.display.name, "DRIVER 7");
  assert.equal(model.secret, undefined);
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.hero) && Object.isFrozen(model.display));
  assert.deepEqual(JSON.parse(JSON.stringify(model)), JSON.parse(JSON.stringify(model)));
});

test("fromDaily defaults to anonymous DRIVER and rejects dishonest values", () => {
  const data = load();
  const model = data.fromDaily(
    { day: "bad", trackId: "x".repeat(100), trackName: "FORMULA 1", weather: "rain", tod: "night" },
    { best: -1 },
    "platinum",
    -5,
  );
  assert.equal(model.dayKey, null);
  assert.equal(model.trackId.length, 48);
  assert.equal(model.hero.value, "NO LAP");
  assert.equal(model.hero.medal, null);
  assert.equal(model.hero.streak, null);
  assert.equal(model.display.name, "DRIVER");
  assert.doesNotMatch(JSON.stringify(model), /FORMULA 1/i);
});
