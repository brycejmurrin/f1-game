// #4529 part 1: SETTINGS › APPEARANCE › PORTRAIT & LANDSCAPE. SHARED (no apex26.appearanceShapes) is the
// shipped default and changes nothing for any existing save; SEPARATE keeps one set of sizes and looks per
// orientation. The eager watcher (AppearanceStudio) swaps only after SheetShape's ICB classifier
// (body[data-shape]) has SETTLED on the other shape with the tab visible: the reverted #4897 swapped on a
// stale Home-Screen boot shape (#5143, "UI squished, zoom remapped"). Bryce's 2026-11-10 export is the save.
//
// Run: node --test tests/unit/appearance-shapes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const STUDIO = "js/ui/appearance-studio.js", PRESETS = "js/ui/layout-presets.js";
const studioSrc = read(STUDIO).replace(/^const AppearanceStudio/m, "var AppearanceStudio");
const presetsSrc = read(PRESETS).replace(/^const LayoutPresets/m, "var LayoutPresets");
const exported = JSON.parse(read("tests/data/settings-live-export-2026-11-10.json"));
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Bryce's iPhone export, flattened to the store keys it sets. */
function bryceStore() {
  const out = {};
  for (const group of Object.values(exported.settings)) {
    if (group && typeof group === "object") for (const [k, v] of Object.entries(group)) if (v !== null) out[k] = structuredClone(v);
  }
  return out;
}

/** Real AppearanceStudio (+ LayoutPresets when `lazy`) over a fake store, body and clock. */
function boot(values, shape = "wide", { lazy = true } = {}) {
  const writes = [], observers = [], docListeners = {}, loads = [];
  const attrs = { "data-shape": shape };
  const body = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
  const store = { get: (k, d) => (k in values ? values[k] : d),
    set: (k, v) => { writes.push(k); if (v === undefined || v === null) delete values[k]; else values[k] = v; return true; } };
  let now = 0, seq = 0;
  const timers = new Map();
  const document = { readyState: "loading", hidden: false, body, getElementById: () => null,
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); } };
  const context = vm.createContext({
    GameStore: { store }, Log: { info() {}, warn() {} },
    HudLayout: { migrate: (v) => { const { v: _v, ...rest } = v; return rest; } },
    setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: now + (ms || 0) }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    AppearanceOpts: { restore() {} }, ScreenLooks: { normalize: (_id, v) => ({ ...v }), apply() {}, refresh() {} },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
    window: { matchMedia: () => ({ matches: false }) }, document,
  });
  // LayoutPresets is lazy (LAZY_UI_PRESETS): SettingsNav.presets() loads it on demand.
  const loadLazy = () => { if (vm.runInContext("typeof LayoutPresets", context) === "undefined") vm.runInContext(presetsSrc, context, { filename: absSrc(PRESETS) }); };
  context.SettingsNav = { presets: () => { loads.push(1); loadLazy(); return Promise.resolve(true); } };
  vm.runInContext(studioSrc, context, { filename: absSrc(STUDIO) });
  if (lazy) loadLazy();
  const lp = () => vm.runInContext("typeof LayoutPresets === 'undefined' ? null : LayoutPresets", context);
  /** Advance the fake clock by `ms`, running due timers in order. */
  const tick = async (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
      await Promise.resolve(); await Promise.resolve();
    }
    now = end;
  };
  const classify = (next) => { attrs["data-shape"] = next; for (const o of observers) o.fn(); };
  const rotate = async (next) => { classify(next); await tick(2500); };
  const setHidden = (h) => { document.hidden = h; for (const fn of docListeners.visibilitychange || []) fn(); };
  return { lp, appearance: context.AppearanceStudio, values, writes, loads, classify, rotate, tick, setHidden };
}

test("SHARED is the default: Bryce's save survives any boot shape and rotations with zero writes and no lazy load", async () => {
  const before = bryceStore();
  for (const shape of ["wide", "tall"]) {
    const t = boot(bryceStore(), shape, { lazy: false });
    await t.tick(5000);
    for (const s of ["tall", "wide", "tall", "wide"]) await t.rotate(s);
    assert.deepEqual(t.writes, [], "no key is written");
    assert.deepEqual(plain(t.values), before, "every value is the export's");
    assert.equal(t.loads.length, 0, "SHARED never loads the LAYOUT PRESET bundle");
  }
});

test("a leftover #4897 v:1 appearanceShapes (SEPARATE by default) reads SHARED and never swaps", async () => {
  const stale = { ...bryceStore(), appearanceShapes: { v: 1, split: true, live: "wide", park: { uiScale: 100, hudBtnScale: 245 } } };
  const t = boot(stale, "tall");
  await t.tick(5000); await t.rotate("wide"); await t.rotate("tall");
  assert.deepEqual(t.writes, []);
  assert.equal(t.values.uiScale, 70); assert.equal(t.values.hudBtnScale, 143.25);
  assert.equal(t.lp().shapes().separate, false);
});

test("SEPARATE: portrait and landscape keep their own sizes and looks; device-wide keys never swap", async () => {
  const t = boot(bryceStore(), "wide");
  assert.equal(t.lp().setShapeMode("separate"), true);
  assert.deepEqual(plain(t.values.appearanceShapes), { v: 2, mode: "separate", live: "wide", park: null });
  await t.rotate("tall");
  // The first rotation only parks landscape: portrait starts from the same values.
  assert.equal(t.values.uiScale, 70); assert.equal(t.values.hudBtnScale, 143.25);
  assert.deepEqual(plain(t.values.lookGarage), { btn: 80, pw: 110, stats: "hide" });
  const park = t.lp().shapes().park;
  assert.equal(park.uiScale, 70); assert.equal(park.hudBtnScale, 143.25);
  assert.deepEqual(plain(park.lookGarage), { btn: 80, pw: 110, stats: "hide" });
  // Portrait edits: a shorter, narrower garage panel, bigger UI, smaller HUD buttons.
  t.values.lookGarage = { btn: 80, pw: 70, ph: 60, stats: "hide" }; t.values.uiScale = 85; t.values.hudBtnScale = 120;
  await t.rotate("wide");
  assert.equal(t.values.uiScale, 70); assert.equal(t.values.hudBtnScale, 143.25);
  assert.deepEqual(plain(t.values.lookGarage), { btn: 80, pw: 110, stats: "hide" });
  assert.deepEqual(plain(t.values.lookSelect), { w: 125, tile: 95 });
  assert.equal(t.values.appearanceShapes.live, "wide");
  await t.rotate("tall");
  assert.equal(t.values.uiScale, 85); assert.equal(t.values.hudBtnScale, 120);
  assert.deepEqual(plain(t.values.lookGarage), { btn: 80, pw: 70, ph: 60, stats: "hide" });
  const wide = bryceStore();
  for (const k of ["menuAccent", "textSize", "uiContrast", "homeScene", "titleLayout"]) assert.deepEqual(plain(t.values[k]), wide[k], k);
});

test("never on a stale boot shape: a boot that reads the other shape and then reclassifies inside the settle swaps nothing", async () => {
  const saved = { ...bryceStore(), appearanceShapes: { v: 2, mode: "separate", live: "wide", park: { uiScale: 85, hudBtnScale: 120 } } };
  const t = boot(structuredClone(saved), "tall");   // a Home-Screen launch reporting the portrait pair first
  await t.tick(300);
  t.classify("wide");                                // the ICB settles on landscape
  await t.tick(5000);
  assert.deepEqual(t.writes, [], "no swap, no write");
  assert.equal(t.values.uiScale, 70); assert.equal(t.values.hudBtnScale, 143.25);
});

test("a real portrait boot swaps once, after the settle, and the lazy bundle loads only then", async () => {
  const saved = { ...bryceStore(), appearanceShapes: { v: 2, mode: "separate", live: "wide", park: { uiScale: 85, hudBtnScale: 120 } } };
  const t = boot(structuredClone(saved), "tall", { lazy: false });
  await t.tick(1900);
  assert.equal(t.values.uiScale, 70, "nothing moves before the settle");
  assert.equal(t.loads.length, 0);
  await t.tick(200);
  assert.equal(t.loads.length, 1);
  assert.equal(t.values.uiScale, 85); assert.equal(t.values.hudBtnScale, 120);
  assert.equal(t.values.appearanceShapes.live, "tall");
  assert.equal(t.values.appearanceShapes.park.uiScale, 70, "landscape's copy is parked");
  assert.equal(t.values.appearanceShapes.park.hudBtnScale, 143.25);
});

test("a rotation flicker, or a flip while the tab is hidden, waits for a settled visible shape", async () => {
  const t = boot(bryceStore(), "wide");
  t.lp().setShapeMode("separate");
  t.values.appearanceShapes = { v: 2, mode: "separate", live: "wide", park: { uiScale: 85 } };
  t.classify("tall"); await t.tick(800); t.classify("wide"); await t.tick(5000);
  assert.equal(t.values.uiScale, 70, "tall for 0.8 s is not a rotation");
  t.setHidden(true); await t.rotate("tall");
  assert.equal(t.values.uiScale, 70, "no swap while hidden");
  t.setHidden(false); await t.tick(2500);
  assert.equal(t.values.uiScale, 85, "the visible, settled shape swaps");
});

test("SHARED again removes the key: the current values serve both orientations", async () => {
  const t = boot(bryceStore(), "wide");
  t.lp().setShapeMode("separate");
  await t.rotate("tall"); t.values.uiScale = 85; await t.rotate("wide");
  assert.equal(t.values.uiScale, 70);
  t.lp().setShapeMode("shared");
  assert.equal("appearanceShapes" in t.values, false);
  await t.rotate("tall");
  assert.equal(t.values.uiScale, 70);
  t.lp().setShapeMode("separate");
  assert.equal(t.values.appearanceShapes.park, null, "SEPARATE starts again from the current values");
});

test("a swap drops the Studio UNDO: its entries are the other orientation's (#4919)", async () => {
  const t = boot(bryceStore(), "wide");
  t.lp().setShapeMode("separate");
  await t.rotate("tall"); t.values.uiScale = 85; await t.rotate("wide");
  t.appearance.applyPreset("broadcast");
  await t.rotate("tall");
  assert.equal(t.values.uiScale, 85);
  assert.equal(t.appearance.undo(), false, "no cross-orientation UNDO");
});

test("normalizeShapes: junk reads SHARED; a park is clamped like the live keys and holds only shape keys", () => {
  const { lp } = boot({});
  assert.deepEqual(plain(lp().normalizeShapes({ v: 9 })), { separate: false, live: null, park: null });
  assert.deepEqual(plain(lp().normalizeShapes({ v: 2, mode: "shared", live: "wide" })), { separate: false, live: null, park: null });
  const n = lp().normalizeShapes({ v: 2, mode: "separate", live: "sideways", park: { hudScale: 9999, uiScale: 10, menuAccent: "lime" } });
  assert.equal(n.separate, true); assert.equal(n.live, null);
  assert.equal(n.park.hudScale, 200); assert.equal(n.park.uiScale, 40);
  assert.equal("menuAccent" in n.park, false);
  assert.deepEqual(plain(lp().SHAPE_KEYS.filter((k) => k.startsWith("look"))),
    ["lookPause", "lookDatahub", "lookSelect", "lookRace", "lookCareer", "lookGarage", "lookPopups", "lookDesigner"]);
});

test("#6598 SEPARATE parks hudLayout per orientation: his landscape HELMET offsets never reach portrait", async () => {
  const live = JSON.parse(read("tests/data/settings-live-export-2026-11-25.json")).settings.hud.hudLayout;
  assert.ok(live && live.standard.helmet.map, "his export carries the landscape map drag");
  const t = boot({ ...bryceStore(), hudLayout: structuredClone(live), appearanceShapes: { v: 2, mode: "separate", live: "wide", park: null } });
  assert.ok(t.lp().SHAPE_KEYS.includes("hudLayout"));
  await t.rotate("tall");
  assert.equal(t.values.hudLayout ?? null, null, "portrait starts on the shipped layout");
  assert.deepEqual(plain(t.lp().shapes().park.hudLayout.standard.helmet.map), plain(live.standard.helmet.map));
  await t.rotate("wide");
  assert.deepEqual(plain(t.values.hudLayout), plain(live), "landscape comes back byte for byte");
});
