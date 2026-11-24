/* gfx-preset-rule.test.mjs — GfxQuality.presetRule / presetDefault (the "Use preset · On|Off" text and the
 * "Preset:" help line of SETTINGS › GRAPHICS › Graphics details) agree with what each option's consumer
 * actually turns on, for every row the UI lists, at all five presets, with no overrides and nothing shed.
 *
 * Run: node --test tests/unit/gfx-preset-rule.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();
const QSRC = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
const UI = fs.readFileSync(path.join(ROOT, "js/ui/desktop-graphics.js"), "utf8");
// The rows the UI lists: `name: ["Label", "Explanation"]` entries of the groups table.
const ROWS = [...UI.matchAll(/^\s+(\w+): \["[^"]+", "/gm)].map(m => m[1]);
const PRESETS = ["low", "medium", "high", "ultra", "extreme"];

function boot(preset) {
  GameStore.store.set("gfxPreset", preset);
  GameStore.store.set("gfxFeatureOverrides", {});
  for (const k of ["apex26.gfxDetail", "apex26.gfxHoldExtras", "apex26.tlxAgx"]) GameStore.store.rawSet(k, "");
  return eval(QSRC + ";GfxQuality");
}
// What the consumer turns on with no override: feature() for FEATURES / automatic / opt-in rows; the reads named in
// quality-preset.js's PRESET_FROM comment for the rest.
function consumer(Q, name) {
  if (["msaa", "sunMap", "carMap", "envMap", "envProbe", "anisotropy", "rivalLod"].includes(name)) return Q.option(name, Q.detail() > 0);
  if (["hexTiling", "wallBlend", "detailNormal", "gravelRelief"].includes(name)) return Q.option(name, Q.feature("matDetail"));
  if (name === "agx") return Q.option(name, Q.detail() >= 2 && GameStore.store.raw("apex26.tlxAgx") === "1");
  if (Q.FEATURES[name] === 3) { Q.setCinema(true); const on = Q.feature(name); Q.setCinema(false); return on; }
  return Q.feature(name);
}

test("the UI table parses to every row", () => {
  assert.ok(ROWS.length >= 50, `rows ${ROWS.length}`);
  assert.deepEqual(["msaa", "agx", "dof", "gravelDebris", "hexTiling", "rivalLiveryLod"].filter(n => !ROWS.includes(n)), []);
});

for (const preset of PRESETS) {
  test(`presetDefault matches the consumer on ${preset.toUpperCase()}`, () => {
    const Q = boot(preset);
    for (const name of ROWS) assert.equal(Q.presetDefault(name, preset), consumer(Q, name), `${name} on ${preset}`);
  });
}

test("presetRule names the lowest preset that turns a row on", () => {
  const Q = boot("high");
  const order = { high: 2, ultra: 3, extreme: 4, cinema: 4 };
  for (const name of ROWS) {
    const rule = Q.presetRule(name);
    const first = PRESETS.findIndex(p => Q.presetDefault(name, p));
    assert.equal(rule == null ? -1 : order[rule], first, name);
  }
  assert.equal(Q.presetRule("gravelDebris"), "high");
  assert.equal(Q.presetRule("msaa"), "ultra");
  assert.equal(Q.presetRule("hexTiling"), "extreme");
  assert.equal(Q.presetRule("dof"), "cinema");
  assert.equal(Q.presetRule("agx"), null);
  assert.equal(Q.presetRule("tyreWearVisual"), null);
});

test("phones: every shown row is off unless turned on, at every preset", () => {
  globalThis.GLX = { isMobile: true };
  try {
    for (const preset of ["low", "medium", "high"]) {
      const Q = boot(preset);
      const shown = ROWS.filter(n => Q.supportsOption(n));
      assert.ok(shown.length >= 10, `phone rows ${shown.length}`);
      for (const name of shown) {
        assert.equal(Q.presetRule(name), null, name);
        assert.equal(Q.presetDefault(name, preset), false, `${name} ${preset}`);
        assert.equal(consumer(Q, name), false, `consumer ${name} ${preset}`);
      }
    }
  } finally { delete globalThis.GLX; }
});
