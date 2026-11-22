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
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();

function loadQuality(navigator = globalThis.navigator) {
  const qsrc = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  return eval(qsrc + ";GfxQuality");
}

test("facade applies the phone memory cap on the first legacy/import boot", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/render/shared/glx-facade.js"), "utf8");
  const boot = (ua, high, touch = 0) => vm.runInNewContext(src + ";GLX", {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    localStorage: { getItem: (key) => key === "apex26.gfxHigh" ? high : null },
  }, { filename: absSrc("js/render/shared/glx-facade.js") });
  assert.equal(boot("iPhone", "1").mobileTier, true);
  assert.equal(boot("iPhone", null).mobileTier, true);
  assert.equal(boot("Macintosh", "1", 5).mobileTier, true);
  assert.equal(boot("Macintosh", "1").mobileTier, false);
  assert.equal(boot("Macintosh", null).mobileTier, false);
});

test("capId / maxId: phones never keep ULTRA; desktop does", () => {
  const Q = loadQuality();
  assert.equal(Q.PHONE_MAX_ID, "high");
  assert.equal(Q.maxId(true), "high");
  assert.equal(Q.maxId(false), "extreme");
  assert.equal(Q.capId("extreme", false), "extreme");
  assert.equal(Q.capId("extreme", true), "high");
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

test("a fresh WebGPU-capable iPhone uses LOW; an iPad or Android phone uses MEDIUM", () => {
  for (const [userAgent, expected] of [["Mozilla/5.0 (iPhone; CPU iPhone OS 18)", "low"], ["iPad", "medium"], ["Android", "medium"]]) {
    assert.equal(loadQuality({ userAgent, gpu: {} }).defaultId(true), expected);
  }
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

test("phone ULTRA row is disabled with the NOT ON PHONES note", () => {
  const Q = loadQuality();
  assert.ok(Q.PHONE_ULTRA_NOTE.includes("NOT ON PHONES"));
  // Drive the real paint path: SettingRow.paint gets [id, label, disabled].
  const painted = [];
  globalThis.SettingRow = {
    paint(_row, _cur, values) { painted.push(values); },
    build(_id, _label, values) {
      painted.push(values);
      return { row: { title: "" } };
    },
    wire() {},
  };
  const disk = new Map();
  globalThis.localStorage = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => disk.set(k, String(v)),
    removeItem: (k) => disk.delete(k),
  };
  globalThis.document = {
    readyState: "complete",
    getElementById: (id) => (id === "pm-gfx"
      ? { parentNode: { replaceChild(a) { this._row = a; } }, title: "", hidden: true, textContent: "" }
      : null),
    addEventListener() {},
  };
  globalThis.GLX = { isMobile: true };
  globalThis.PerfGov = { setUserTier() {} };
  GameStore.store.set("gfxPreset", "medium");
  GameStore.store.rawSet("apex26.gfxHigh", null);
  Q.init();
  assert.ok(painted.length >= 1, "SettingRow must receive the GRAPHICS values");
  const ultra = painted[painted.length - 1].find((row) => row[0] === "ultra");
  assert.ok(ultra, "ULTRA stays in the list");
  assert.equal(ultra[2], true, "ULTRA is the disabled option on phones");
  assert.ok(String(ultra[1]).includes("NOT ON PHONES"), "disabled label carries the cap note");
  const extremePhone = painted[painted.length - 1].find((row) => row[0] === "extreme");
  assert.equal(extremePhone[2], true, "EXTREME is disabled on phones too");
  assert.ok(!String(extremePhone[1]).includes(Q.EXTREME_NOTE), "a phone shows the cap note, not the desktop note");
  delete globalThis.SettingRow;
  delete globalThis.GLX;
  delete globalThis.localStorage;
  delete globalThis.document;
  delete globalThis.PerfGov;
});

// DESKTOP DETAIL SEAM: detail() is a boot-time level, feature() gates every extra, the governor's
// setShed() drops extras from the end of SHED_ORDER, and apex26.gfxx.<name> forces one off / on.
test("desktop EXTREME row says desktop / THREE.JS WebGPU only, in the phone note style", () => {
  const Q = loadQuality();
  const painted = [];
  let built = null;
  globalThis.SettingRow = {
    paint(_row, _cur, values) { painted.push(values); },
    build(_id, _label, values) { painted.push(values); built = { title: "" }; return { row: built }; },
    wire() {},
  };
  globalThis.document = {
    readyState: "complete",
    getElementById: (id) => (id === "pm-gfx"
      ? { parentNode: { replaceChild() {} }, title: "", hidden: true, textContent: "" }
      : null),
    addEventListener() {},
  };
  globalThis.GLX = { isMobile: false };
  globalThis.PerfGov = { setUserTier() {} };
  GameStore.store.set("gfxPreset", "high");
  Q.init();
  const rows = painted[painted.length - 1];
  const extreme = rows.find((row) => row[0] === "extreme");
  assert.equal(extreme[2], undefined, "EXTREME is selectable on desktop");
  assert.equal(extreme[1], "EXTREME" + Q.EXTREME_NOTE);
  assert.equal(rows.find((row) => row[0] === "ultra")[1], "ULTRA", "ULTRA's label is unchanged");
  assert.equal(built.title.includes("looks like ULTRA"), true, "the row title explains GLX / WGX equal ULTRA");
  delete globalThis.SettingRow;
  delete globalThis.GLX;
  delete globalThis.document;
  delete globalThis.PerfGov;
});

test("detail / feature: HIGH 0, ULTRA 1, EXTREME 2; phones 0; shed, cinema and the per-feature override", () => {
  const boot = (preset, mobile, raw = {}) => {
    const store = { get: (k, d) => (k === "gfxPreset" ? preset : d), raw: (k) => (k in raw ? raw[k] : null), set() {}, rawSet() {} };
    const src = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
    return vm.runInNewContext(src + ";GfxQuality", { GameStore: { store }, GLX: { isMobile: !!mobile }, Log: { info() {} } },
      { filename: absSrc("js/perf/quality-preset.js") });
  };
  const hi = boot("high"), ul = boot("ultra"), ex = boot("extreme"), ph = boot("extreme", true);
  assert.deepEqual([hi.detail(), ul.detail(), ex.detail(), ph.detail()], [0, 1, 2, 0]);
  for (const name of Object.keys(ex.FEATURES)) assert.equal(hi.feature(name), false, `${name} is off on HIGH`);
  for (const name of Object.keys(ex.FEATURES)) assert.equal(ph.feature(name), false, `${name} is off on a phone`);
  assert.equal(ul.feature("mirrorHi"), true);
  assert.equal(ul.feature("csm"), false);
  assert.equal(ex.feature("csm"), true);
  assert.equal(ex.feature("nope"), false);
  assert.equal(ex.feature("dof"), false, "CINEMA extras wait for setCinema");
  ex.setCinema(true);
  assert.equal(ex.feature("dof"), true);
  ul.setCinema(true);
  assert.equal(ul.feature("dof"), false, "CINEMA needs EXTREME");
  const last = ex.SHED_ORDER[ex.SHED_ORDER.length - 1], first = ex.SHED_ORDER[0];
  assert.equal(ex.feature(last), true);
  ex.setShed(1);
  assert.equal(ex.feature(last), false, "the last extra sheds first");
  assert.equal(ex.feature(first), true);
  ex.setShed(99);
  assert.equal(ex.shed(), ex.SHED_ORDER.length);
  assert.equal(ex.feature(first), false);
  assert.equal(ex.feature("csm"), true, "an extra outside SHED_ORDER never sheds");
  for (const name of ex.SHED_ORDER) assert.ok(ex.FEATURES[name], `${name} is a feature`);
  assert.equal(boot("high", false, { "apex26.gfxx.csm": "1" }).feature("csm"), true);
  assert.equal(boot("high", false, { "apex26.gfxDetail": "2" }).detail(), 2, "the numeric override forces the level on a desktop");
  assert.equal(boot("extreme", false, { "apex26.gfxDetail": "0" }).detail(), 0);
  assert.equal(boot("high", true, { "apex26.gfxDetail": "2" }).detail(), 0, "never on a phone");
  assert.equal(boot("ultra", false, { "apex26.gfxDetail": "9" }).detail(), 1, "an unknown value is ignored");
  const held = boot("extreme", false, { "apex26.gfxHoldExtras": "1" });
  held.setShed(99);
  for (const name of held.SHED_ORDER) assert.equal(held.feature(name), true, `${name} stays on while the extras are held`);
  assert.equal(held.feature("dof"), false, "holding the extras does not turn CINEMA on");
  assert.equal(boot("extreme", false, { "apex26.gfxx.csm": "0" }).feature("csm"), false);
});

test("desktop scene effects are independent opt-ins, including on the cinema preset", () => {
  const names = ["garageProbeParallax", "rainCurtains", "rivalLiveryLod", "circuitSurfaces", "tyreWearVisual"];
  const src = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  for (const mobile of [true, false]) {
    for (const selected of names) {
      const store = { get: (key) => key === "gfxPreset" ? "extreme" : { [selected]: true }, raw: () => null };
      const q = vm.runInNewContext(src + ";GfxQuality", { GameStore: { store }, GLX: { isMobile: mobile } });
      q.setCinema(true);
      for (const name of names) {
        assert.equal(q.supportsOption(name), !mobile);
        assert.equal(q.feature(name), !mobile && name === selected);
      }
    }
  }
});
