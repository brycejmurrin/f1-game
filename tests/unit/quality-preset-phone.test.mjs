/* quality-preset-phone.test.mjs — phone-class GRAPHICS caps (D·IP1).
 *
 * BrowserStack 2026-10-21 (docs/perf/iphone-browserstack-2026-10-21.md): ULTRA
 * on iPhone 15 averaged 24.5 fps with no recovery; iPhone 13 idled ~25 fps on
 * the previous MEDIUM default. This file pins the phone ceiling (HIGH), the
 * disabled ULTRA row note, weak-phone LOW default, and set()/cycle skip.
 *
 * Run: node --test tests/unit/quality-preset-phone.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();

function loadQuality() {
  const qsrc = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  return eval(qsrc + ";GfxQuality");
}

test("capId / maxId: phones never keep ULTRA; desktop does", () => {
  const Q = loadQuality();
  assert.equal(Q.PHONE_MAX_ID, "high");
  assert.equal(Q.maxId(true), "high");
  assert.equal(Q.maxId(false), "ultra");
  assert.equal(Q.capId("ultra", true), "high");
  assert.equal(Q.capId("high", true), "high");
  assert.equal(Q.capId("medium", true), "medium");
  assert.equal(Q.capId("low", true), "low");
  assert.equal(Q.capId("ultra", false), "ultra");
  assert.equal(Q.capId("nope", true), "medium");
});

test("defaultId: weak phones LOW, capable MEDIUM, desktop HIGH, legacy phone HIGH", () => {
  const Q = loadQuality();
  GameStore.store.rawSet("apex26.gfxHigh", null);
  assert.equal(Q.defaultId(false), "high");
  assert.equal(Q.defaultId(true, { weak: false }), "medium");
  assert.equal(Q.defaultId(true, { weak: true }), "low");
  GameStore.store.rawSet("apex26.gfxHigh", "1");
  assert.equal(Q.defaultId(true, { weak: true }), "high",
    "legacy opt-in still cannot land ULTRA on a phone");
  GameStore.store.rawSet("apex26.gfxHigh", null);
});

test("isWeakPhone: deviceMemory < 4 and missing navigator.gpu", () => {
  const Q = loadQuality();
  assert.equal(Q.isWeakPhone(null), false);
  assert.equal(Q.isWeakPhone({}), false, "bare object without gpu key is not weak");
  assert.equal(Q.isWeakPhone({ deviceMemory: 2 }), true);
  assert.equal(Q.isWeakPhone({ deviceMemory: 8 }), false);
  assert.equal(Q.isWeakPhone({ gpu: undefined }), true,
    "own gpu:undefined (older Safari / no WebGPU) is weak");
  assert.equal(Q.isWeakPhone({ gpu: {} }), false);
});

test("set() on a phone clamps ULTRA to HIGH and skips it in cycle()", () => {
  const Q = loadQuality();
  const disk = new Map();
  globalThis.localStorage = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => disk.set(k, String(v)),
    removeItem: (k) => disk.delete(k),
  };
  globalThis.GLX = { isMobile: true };
  globalThis.PerfGov = { setUserTier() {} };
  GameStore.store.set("gfxPreset", null);
  GameStore.store.rawSet("apex26.gfxHigh", null);
  Q.init();
  assert.notEqual(Q.current(), "ultra");
  assert.equal(Q.set("ultra", { noReload: true }), true);
  assert.equal(Q.current(), "high", "set(ultra) on a phone lands on HIGH");
  assert.equal(GameStore.store.get("gfxPreset", null), "high");
  assert.notEqual(GameStore.store.raw("apex26.gfxHigh"), "1",
    "HIGH must not leave the desktop-memory boot bit set");

  // cycle must never visit ultra while isMobile
  const seen = new Set();
  for (let i = 0; i < 8; i++) { Q.cycle(); seen.add(Q.current()); }
  assert.equal(seen.has("ultra"), false, "cycle skips ULTRA on phones");
  assert.ok(seen.has("low") && seen.has("medium") && seen.has("high"));

  delete globalThis.GLX;
  delete globalThis.localStorage;
  delete globalThis.PerfGov;
});

test("PHONE_ULTRA_NOTE is the visible cap string SettingRow shows", () => {
  const Q = loadQuality();
  assert.match(Q.PHONE_ULTRA_NOTE, /NOT ON PHONES/);
  const src = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  assert.match(src, /phoneBlocked \? \[p\.id, text, true\]/,
    "ULTRA must be the disabled SettingRow option on phones");
  assert.match(src, /PHONE_CAP_TITLE/,
    "the row title explains the BrowserStack cap");
});
