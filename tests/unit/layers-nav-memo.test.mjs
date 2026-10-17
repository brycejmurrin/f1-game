// UiLayers.navOpen() is asked several times a tick; it must read layout once, not per call
// (gpu-census 38985693871: shownLayer was 3-6 % of CPU), and still see a layer the instant it opens.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot() {
  const reads = { rect: 0, style: 0 };
  const mk = (id, shown) => ({
    id, hidden: false, children: [], shown, isConnected: true,
    getBoundingClientRect() { reads.rect++; return this.shown ? { width: 800, height: 600 } : { width: 0, height: 0 }; },
  });
  const els = new Map();
  for (const id of ["overlay", "rotate-device", "pausemenu"]) els.set(id, mk(id, false));
  els.get("pausemenu").hidden = true;
  let pending = [];
  const observed = new Set();
  class MO {
    constructor() {}
    observe(el) { observed.add(el); }
    takeRecords() { const r = pending; pending = []; return r; }
  }
  let now = 1000;
  const ctx = {
    window: { addEventListener() {} },
    document: {
      documentElement: { id: "html" }, body: { id: "body" },
      querySelectorAll: () => [],
      getElementById: (id) => els.get(id) || null,
      addEventListener() {},
    },
    MutationObserver: MO,
    performance: { now: () => now },
    getComputedStyle: () => { reads.style++; return { visibility: "visible", zIndex: "auto" }; },
    Log: { info() {}, warn() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/layers.js"), "utf8"), ctx);
  return {
    U: ctx.window.UiLayers, els, reads, observed,
    mutate(el) { pending.push({ target: el }); },
    advance(ms) { now += ms; },
  };
}

test("navOpen reads layout once per window, not once per call", () => {
  const t = boot();
  assert.equal(t.U.navOpen(), false);
  const after = { ...t.reads };
  for (let i = 0; i < 20; i++) assert.equal(t.U.navOpen(), false);
  assert.deepEqual(t.reads, after, "20 further calls must not touch getBoundingClientRect/getComputedStyle");
  assert.ok(after.rect > 0 && after.style > 0, "the first call does measure");
});

test("a layer opening is seen on the very next call (observer record drops the memo)", () => {
  const t = boot();
  assert.equal(t.U.navOpen(), false);
  const pause = t.els.get("pausemenu");
  pause.hidden = false; pause.shown = true; t.mutate(pause);
  assert.equal(t.U.navOpen(), true);
  pause.hidden = true; t.mutate(pause);
  assert.equal(t.U.navOpen(), false);
});

test("the zero-size wrapper rule still holds: a child that is shown opens the layer", () => {
  const t = boot();
  const child = { hidden: false, children: [], getBoundingClientRect: () => ({ width: 400, height: 300 }) };
  const ov = t.els.get("overlay");
  assert.equal(t.U.navOpen(), false);
  ov.children = [child]; t.mutate(ov);
  assert.equal(t.U.navOpen(), true);
});

test("the memo expires on its own, and the layers are watched", () => {
  const t = boot();
  t.U.navOpen();
  t.els.get("rotate-device").shown = true; // a change the observer never reported
  assert.equal(t.U.navOpen(), false);
  t.advance(1000);
  assert.equal(t.U.navOpen(), true);
  for (const id of ["overlay", "rotate-device", "pausemenu"]) assert.ok(t.observed.has(t.els.get(id)), id + " observed");
});
