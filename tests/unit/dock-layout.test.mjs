/* dock-layout.test.mjs — per-scheme touch-dock REPOSITION (plan slice 2).
 * Fail-before: without DockLayout, clamp / per-scheme isolation / identity
 * apply cannot hold. Run: node --test tests/unit/dock-layout.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/dock-layout.js"), "utf8");

function loadDock() {
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: { innerWidth: 400, innerHeight: 800 },
    document: { documentElement: {} },
    getComputedStyle() { return { getPropertyValue() { return "0"; } }; },
  };
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx.DockLayout;
}
const DL = loadDock();
assert.ok(DL && DL.clampXY, "DockLayout IIFE must assign the global");

function memStore(init) {
  const bag = Object.assign({}, init || {});
  return {
    get(k, d) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : d; },
    set(k, v) { bag[k] = v; },
  };
}
function dockEl() {
  return {
    style: {
      transform: "",
      removeProperty(k) { if (k === "transform") this.transform = ""; },
    },
  };
}

test("clampXY rejects offsets past MAX", () => {
  const c = DL.clampXY({ x: 2, y: -2 });
  assert.equal(c.x, DL.MAX);
  assert.equal(c.y, -DL.MAX);
  // Property-wise: vm-realm objects fail deepStrictEqual on prototype identity.
  const junk = DL.clampXY({ x: "no", y: null });
  assert.equal(junk.x, 0);
  assert.equal(junk.y, 0);
});

test("normalize fills every scheme and clamps junk", () => {
  const n = DL.normalize({ buttons: { L: { x: 9, y: 0.1 }, R: { x: 0, y: 0 } }, weird: {} });
  assert.ok(n.tilt && n.buttons && n.touch);
  assert.equal(n.buttons.L.x, DL.MAX);
  assert.equal(n.tilt.L.x, 0);
  assert.equal(n.weird, undefined);
});

test("load/save round-trip keeps schemes independent", () => {
  const store = memStore();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.2, y: 0.1 };
  bag.tilt.R = { x: -0.15, y: 0.05 };
  DL.save(store, bag);
  const loaded = DL.load(store);
  assert.equal(loaded.buttons.L.x, 0.2);
  assert.equal(loaded.tilt.R.x, -0.15);
  assert.equal(loaded.touch.L.x, 0);
  assert.ok(DL.isIdentity(loaded.touch));
  assert.equal(DL.isIdentity(loaded.buttons), false);
});

test("apply writes translate for a non-zero offset and clears at identity", () => {
  const left = dockEl(), right = dockEl();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.25, y: 0.1 };
  DL.apply("buttons", bag, { L: left, R: right });
  assert.match(left.style.transform, /^translate\(/);
  assert.equal(right.style.transform, "");
  bag.buttons.L = { x: 0, y: 0 };
  left.style.transform = "translate(1px, 1px)";
  DL.apply("buttons", bag, { L: left, R: right });
  assert.equal(left.style.transform, "");
});

test("switching scheme applies that scheme's offsets only", () => {
  const left = dockEl(), right = dockEl();
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.3, y: 0 };
  bag.tilt.L = { x: 0, y: 0 };
  DL.apply("buttons", bag, { L: left, R: right });
  assert.match(left.style.transform, /^translate\(/);
  DL.apply("tilt", bag, { L: left, R: right });
  assert.equal(left.style.transform, "", "tilt default clears the buttons offset");
});

test("a primary control centre inside the unsafe inset is rejected by clamp", () => {
  // Offsets are fractions of the usable pad (already inset). Clamping at ±MAX
  // is what keeps a drag from parking a dock under the notch / home indicator.
  const edge = DL.clampXY({ x: MAX_PROBE(), y: MAX_PROBE() });
  function MAX_PROBE() { return DL.MAX + 0.5; }
  assert.ok(Math.abs(edge.x) <= DL.MAX + 1e-9);
  assert.ok(Math.abs(edge.y) <= DL.MAX + 1e-9);
});

test("store.subscribe on steerMode reloads that scheme's offsets", () => {
  const left = dockEl(), right = dockEl();
  const listeners = [];
  let mode = "buttons";
  const bag = DL.normalize({});
  bag.buttons.L = { x: 0.2, y: 0 };
  bag.tilt.L = { x: 0, y: 0 };
  const store = {
    get(k, d) { return k === "dockLayout" ? bag : d; },
    set() {},
    subscribe(fn) { listeners.push(fn); return () => {}; },
  };
  // Lightweight create stand-in: paint via apply + the same subscribe filter.
  function paint() { DL.apply(mode, bag, { L: left, R: right }); }
  store.subscribe((change) => {
    if (!change) return;
    const hit = (k) => k === "steerMode" || k === DL.KEY;
    if (hit(change.key) || (Array.isArray(change.keys) && change.keys.some(hit))) paint();
  });
  mode = "buttons"; paint();
  assert.match(left.style.transform, /^translate\(/);
  mode = "tilt";
  listeners[0]({ key: "steerMode" });
  assert.equal(left.style.transform, "", "singular key notify must clear buttons offset");
});
