/* cam-comfort.test.mjs — touch/XR auto comfort preset. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = { Log: { info() {} } };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/cam-comfort.js"), "utf8") + "\nthis.exported = CamComfort;",
    ctx);
  return ctx.exported;
}

function rawStore(initial) {
  const disk = new Map(Object.entries(initial || {}));
  return {
    raw(k) { return disk.has(k) ? disk.get(k) : null; },
    rawSet(k, v) { disk.set(k, v); return true; },
    get(k, d) { return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); return true; },
    _disk: disk,
  };
}

function loadCamTune() {
  const disk = new Map();
  const ctx = {
    GameStore: {
      store: {
        rev: 0,
        get(k, d) { return disk.has(k) ? disk.get(k) : d; },
        set(k, v) { disk.set(k, v); this.rev++; return true; },
      },
    },
    Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;",
    ctx);
  return ctx.exported;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("detectTouch / detectXr read navigator capabilities", () => {
  const CC = load();
  assert.equal(CC.detectTouch({ maxTouchPoints: 2 }, {}), true);
  assert.equal(CC.detectTouch({ maxTouchPoints: 0 }, {}), false);
  assert.equal(CC.detectTouch({ maxTouchPoints: 0 }, { ontouchstart: null }), true);
  assert.equal(CC.detectXr({ xr: {} }), true);
  assert.equal(CC.detectXr({}), false);
});

test("boot writes on when touch and key unset; never overwrites a choice", () => {
  const CC = load();
  const s1 = rawStore();
  assert.equal(CC.boot(s1, { maxTouchPoints: 5 }, {}), "on");
  assert.equal(s1.raw(CC.KEY), "on");
  assert.equal(CC.boot(s1, { maxTouchPoints: 5 }, {}), null, "second boot is a no-op");

  const s2 = rawStore({ [CC.KEY]: "off" });
  assert.equal(CC.boot(s2, { maxTouchPoints: 5 }, {}), null);
  assert.equal(s2.raw(CC.KEY), "off");
});

test("boot is a no-op on desktop without XR", () => {
  const CC = load();
  const s = rawStore();
  assert.equal(CC.boot(s, { maxTouchPoints: 0 }, {}), null);
  assert.equal(s.raw(CC.KEY), null);
});

test("reduced-motion boot preselects both renderer comfort hooks off", () => {
  const CC = load();
  assert.equal(CC.FX_DEFS.every((d) => d.unit === ""), true,
    "tuner formatting receives an empty unit instead of rendering undefined");
  const s = rawStore();
  const reduced = { matchMedia: (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) };
  CC.boot(s, { maxTouchPoints: 0 }, reduced);
  assert.equal(s.get("motionBlur"), 1, "notch 1 disables motion blur");
  assert.equal(s.get("speedLines"), 1, "notch 1 disables speed lines");

  s.set("motionBlur", 7);
  s.set("speedLines", 4);
  let applied = null;
  const G = { gfx: { setComfortFx(opts) { applied = opts; } } };
  assert.deepEqual({ ...CC.applyFx(G, s) }, { motionBlur: 7, speedLines: 4 });
  assert.deepEqual({ ...applied }, { motionBlur: 7, speedLines: 4 },
    "the persisted flags reach the optional renderer hook");
});

test("active follows the stored preference", () => {
  const CC = load();
  assert.equal(CC.active(rawStore({ [CC.KEY]: "on" })), true);
  assert.equal(CC.active(rawStore({ [CC.KEY]: "off" })), false);
  assert.equal(CC.active(rawStore()), false);
});

test("mode-switch boots CamComfort; game.js camComfort ORs it", () => {
  const ms = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  assert.match(ms, /CamComfort\.boot/);
  const g = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(g, /CamComfort\.active\(\)/);
});

test("boot ignores navigator.xr: desktop Chromium exposes it with no headset", () => {
  const CC = load();
  const s = rawStore();
  assert.equal(CC.boot(s, { maxTouchPoints: 0, xr: {} }, {}), null);
  assert.equal(s.raw(CC.KEY), null);
});

test("boot drops the old XR auto value on a non-touch device, keeps it on touch", () => {
  const CC = load();
  const withDel = (init) => { const s = rawStore(init); s.rawDel = (k) => { s._disk.delete(k); return true; }; return s; };
  const desk = withDel({ [CC.KEY]: "on" });
  assert.equal(CC.boot(desk, { maxTouchPoints: 0, xr: {} }, {}), null);
  assert.equal(desk.raw(CC.KEY), null);
  assert.equal(CC.active(desk), false);
  const phone = withDel({ [CC.KEY]: "on" });
  CC.boot(phone, { maxTouchPoints: 5 }, {});
  assert.equal(phone.raw(CC.KEY), "on");
});

test("an explicit REDUCE MOTION: OFF wins over the touch auto-pick", () => {
  const CC = load();
  const s = rawStore({ [CC.KEY]: "on" });
  let motion = null;
  s.get = (k, d) => (k === "motion" && motion !== null ? motion : d);
  assert.equal(CC.active(s), true);
  motion = "off";
  assert.equal(CC.active(s), false);
  motion = "reduce";
  assert.equal(CC.active(s), true);
});

test("active() is memoised on the store's rev / rawRev: no raw read per frame, every store write re-reads", () => {
  const CC = load();
  const disk = new Map([["camComfortPref", "on"]]);
  let reads = 0, motion = null;
  const s = {
    rev: 0, rawRev: 0,
    raw(k) { reads++; return disk.has(k) ? disk.get(k) : null; },
    rawSet(k, v) { this.rawRev++; disk.set(k, v); return true; },
    rawDel(k) { this.rawRev++; disk.delete(k); return true; },
    get(k, d) { return k === "motion" ? motion : d; },
  };
  assert.equal(CC.active(s), true);
  for (let i = 0; i < 100; i++) assert.equal(CC.active(s), true);
  assert.equal(reads, 1, "one raw read for 101 frames");
  CC.set(s, false);
  assert.equal(CC.active(s), false, "set() bumps rawRev");
  assert.equal(reads, 2);
  CC.set(s, true); motion = "off"; s.rev++;   // SETTINGS > REDUCE MOTION: OFF is a JSON-lane set(): rev
  assert.equal(CC.active(s), false, "an explicit REDUCE MOTION: OFF still wins");
  motion = null; s.rev++;
  assert.equal(CC.active(s), true);
  const plain = rawStore({ camComfortPref: "on" });   // a store with no revisions is never memoised
  assert.equal(CC.active(plain), true);
  plain._disk.set("camComfortPref", "off");
  assert.equal(CC.active(plain), false);
});

test("camera overrides resolve track over car over the existing global baseline", () => {
  const CamTune = loadCamTune();
  assert.equal(CamTune.importPack({
    v: 2,
    global: { dist: 1 },
    comfort: { bob: 0.8 },
    cars: {
      mclaren: { modes: { chase: { dist: 2 } }, comfort: { bob: 0.5 } },
    },
    tracks: {
      monza: { modes: { chase: { dist: 3 } }, comfort: { bob: 0.2 } },
    },
  }).ok, true);

  CamTune.setContext("monza", "mclaren");
  assert.equal(CamTune.get("chase", "dist"), 3);
  assert.equal(CamTune.comfortGet("bob"), 0.2);

  CamTune.setContext("spa", "mclaren");
  assert.equal(CamTune.get("chase", "dist"), 2);
  assert.equal(CamTune.comfortGet("bob"), 0.5);

  CamTune.setContext("spa", "ferrari");
  assert.equal(CamTune.get("chase", "dist"), 1);
  assert.equal(CamTune.comfortGet("bob"), 0.8);
});

test("JSON and APXC1 camera packs round-trip track and car overrides", () => {
  const source = loadCamTune();
  source.importPack({
    v: 2,
    cars: { mclaren: { modes: { cockpit: { height: 0.25 } }, comfort: { rollLean: 0.4 } } },
    tracks: { spa: { modes: { chase: { fov: 5 } }, comfort: { speedFov: 0.3 } } },
  });
  const pack = plain(source.exportPack());
  assert.deepEqual(pack.cars.mclaren.modes.cockpit, { height: 0.25 });
  assert.deepEqual(pack.tracks.spa.comfort, { speedFov: 0.3 });

  const restored = loadCamTune();
  const decoded = restored.decodeShare(source.encodeShare(pack));
  assert.equal(decoded.ok, true);
  assert.equal(restored.importPack(decoded.pack).ok, true);
  assert.deepEqual(plain(restored.exportPack()), pack);
});
