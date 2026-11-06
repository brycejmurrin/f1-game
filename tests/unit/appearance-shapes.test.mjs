// #4529 part 1: portrait and landscape keep separate appearance values on the
// same device (LayoutPresets SHAPE_KEYS + apex26.appearanceShapes, loaded by AppearanceStudio).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const STUDIO = "js/ui/appearance-studio.js", PRESETS = "js/ui/layout-presets.js";
const studioSrc = read(STUDIO).replace(/^const AppearanceStudio/m, "var AppearanceStudio");
const presetsSrc = read(PRESETS).replace(/^const LayoutPresets/m, "var LayoutPresets");
const exported = JSON.parse(fs.readFileSync(new URL("../data/settings-defaults-export.json", import.meta.url), "utf8"));

/** Bryce's real iPhone export, flattened to the store keys it sets. */
function bryceStore() {
  const out = {};
  for (const group of Object.values(exported.settings)) {
    if (group && typeof group === "object") for (const [k, v] of Object.entries(group)) if (v !== null) out[k] = structuredClone(v);
  }
  return out;
}

function boot(values, shape = "wide") {
  const writes = [], observers = [];
  const attrs = { "data-shape": shape };
  const body = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
  const store = { get: (k, d) => (k in values ? values[k] : d), set: (k, v) => { writes.push(k); if (v === undefined) delete values[k]; else values[k] = v; return true; } };
  const context = vm.createContext({
    GameStore: { store }, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    AppearanceOpts: { restore() {} }, ScreenLooks: { normalize: (_id, v) => ({ ...v }), apply() {}, refresh() {} },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
    window: { matchMedia: () => ({ matches: false }) },
    document: { readyState: "loading", addEventListener() {}, body, getElementById: () => null },
  });
  // The lazy half first, as if SettingsNav.presets() had already loaded it.
  vm.runInContext(presetsSrc, context, { filename: absSrc(PRESETS) });
  vm.runInContext(studioSrc, context, { filename: absSrc(STUDIO) });
  const rotate = (next) => { attrs["data-shape"] = next; for (const o of observers) o.fn(); };
  return { studio: context.LayoutPresets, values, writes, rotate };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test("an existing save boots unchanged and writes nothing (migration is lossless)", () => {
  const before = bryceStore();
  for (const shape of ["wide", "tall"]) {
    const { values, writes, rotate } = boot(bryceStore(), shape);
    assert.deepEqual(writes, [], "boot writes no key");
    assert.deepEqual(plain(values), before);
    rotate(shape === "wide" ? "tall" : "wide");
    // The first rotation only parks the outgoing copy: every live value is kept.
    assert.deepEqual(writes, ["appearanceShapes"]);
    for (const k of Object.keys(before)) assert.deepEqual(plain(values[k]), before[k], k);
  }
});

test("portrait and landscape keep separate values for the shape keys", () => {
  const { studio, values, rotate } = boot(bryceStore(), "wide");
  rotate("tall");
  // Portrait edits: a shorter garage panel, smaller touch buttons.
  values.lookGarage = { ...values.lookGarage, ph: 60 }; values.hudBtnScale = 180;
  rotate("wide");
  assert.equal(values.hudBtnScale, 245, "landscape gets Bryce's 245% back");
  assert.deepEqual(plain(values.lookGarage), { btn: 125, pw: 135, glass: "solid" });
  assert.equal(studio.shapes().live, "wide");
  rotate("tall");
  assert.equal(values.hudBtnScale, 180);
  assert.equal(values.lookGarage.ph, 60);
  // Device-wide keys never swap.
  assert.equal(values.menuAccent, exported.settings.appearance.menuAccent);
  assert.deepEqual(plain(values.titleLayout), exported.settings.appearance.titleLayout);
});

test("a stored state for the other shape applies at boot", async () => {
  const first = boot(bryceStore(), "wide");
  first.rotate("tall"); first.values.hudScale = 100; first.rotate("wide");
  const saved = plain(first.values);
  const again = boot(structuredClone(saved), "tall");
  await Promise.resolve(); await Promise.resolve();   // the boot swap waits for AppearanceStudio to exist
  assert.equal(again.values.hudScale, 100, "booting in portrait reads portrait's copy");
  assert.equal(again.studio.shapes().park.hudScale, 155.25, "landscape's copy is parked");
});

test("SHARED stops the swap and keeps the current values for both shapes", () => {
  const { studio, values, rotate } = boot(bryceStore(), "wide");
  rotate("tall"); values.hudBtnScale = 150;
  studio.setShapeSplit(false);
  rotate("wide");
  assert.equal(values.hudBtnScale, 150);
  assert.equal(studio.shapes().split, false);
  studio.setShapeSplit(true);
  rotate("tall"); values.hudBtnScale = 120; rotate("wide");
  assert.equal(values.hudBtnScale, 150);
});

test("junk in the stored state reads as SEPARATE with nothing parked", () => {
  const { studio } = boot({ appearanceShapes: { v: 9, park: "x" } });
  assert.deepEqual(plain(studio.normalizeShapes({ v: 9 })), { split: true, live: null, park: null });
  assert.equal(studio.shapes().park, null);
  const n = studio.normalizeShapes({ v: 1, split: false, live: "sideways", park: { hudScale: 9999, menuAccent: "lime" } });
  assert.equal(n.split, false); assert.equal(n.live, null);
  assert.equal(n.park.hudScale, 200, "clamped like the live key");
  assert.ok(!("menuAccent" in n.park), "only shape keys are parked");
});

test("eager AppearanceStudio loads the lazy swap on a rotation, and at boot only for a stale saved shape", async () => {
  const run = (values, shape) => {
    const calls = [], observers = [], attrs = { "data-shape": shape };
    const store = { get: (k, d) => (k in values ? values[k] : d), set: () => true };
    const context = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
      SettingsNav: { presets: () => { calls.push(1); return Promise.resolve(false); } },
      MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
      window: { matchMedia: () => ({ matches: false }) },
      document: { readyState: "loading", addEventListener() {}, body: { getAttribute: (k) => attrs[k] ?? null }, getElementById: () => null } });
    vm.runInContext(studioSrc, context, { filename: absSrc(STUDIO) });
    return { calls, rotate: (s) => { attrs["data-shape"] = s; for (const fn of observers) fn(); } };
  };
  const fresh = run(bryceStore(), "tall");
  await Promise.resolve();
  assert.equal(fresh.calls.length, 0, "an untouched save loads nothing at boot");
  fresh.rotate("wide");
  assert.equal(fresh.calls.length, 1, "a rotation loads the APPEARANCE bundle");
  const stale = run({ ...bryceStore(), appearanceShapes: { v: 1, split: true, live: "wide", park: null } }, "tall");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(stale.calls.length, 1, "booting in the other shape loads it");
});
