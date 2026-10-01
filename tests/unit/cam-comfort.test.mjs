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
    _disk: disk,
  };
}

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
