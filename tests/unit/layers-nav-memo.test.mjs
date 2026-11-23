// UiLayers.navOpen() is asked several times a tick; it must read layout once, not per call
// (gpu-census 38985693871: shownLayer was 3-6 % of CPU), and still see a layer the instant it opens.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot() {
  const reads = { rect: 0, style: 0, qsa: 0 };
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
      querySelectorAll: (sel) => { reads.qsa++; return sel === ":modal" ? [] : [...els.values()].filter((e) => !e.hidden && e.id === "pausemenu"); },
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/layers.js"), "utf8"), ctx, { filename: absSrc("js/ui/layers.js") });
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

test("top() is memoised like navOpen(): per-frame pad polls do not re-query (audit4 UB2)", () => {
  const t = boot();
  // top() finds layers by id (uihunt4 #6), so the title must really be closed for "nothing open".
  t.els.get("overlay").hidden = true;
  assert.equal(t.U.top(), null);
  const after = { ...t.reads };
  for (let i = 0; i < 20; i++) assert.equal(t.U.top(), null);
  assert.deepEqual(t.reads, after, "20 further top() calls must not querySelectorAll / getComputedStyle");
  const pause = t.els.get("pausemenu");
  pause.hidden = false; t.mutate(pause);
  assert.equal(t.U.top(), pause, "a layer opening is seen on the very next top() call");
  pause.hidden = true; t.mutate(pause);
  assert.equal(t.U.top(), null);
  pause.hidden = false;   // unreported: the time bound is the net
  assert.equal(t.U.top(), null);
  t.advance(1000);
  assert.equal(t.U.top(), pause);
  pause.isConnected = false;   // a detached answer is never returned from the memo
  assert.ok(t.reads.qsa > 0);
  const q = t.reads.qsa;
  t.U.top();
  assert.ok(t.reads.qsa > q, "a detached memo re-queries");
});

// uihunt4-flows-1030 #6: top() looks layers up by id, not with the comma query that
// walked the whole tree (3.6 ms a cold call at 5.3k nodes); a z-index tie still goes to
// the LATER element in DOCUMENT order, whatever order the layer table lists them in.
test("top() breaks a z-index tie by document order, not by the layer table's order", () => {
  for (const docOrder of [["overlay", "pausemenu"], ["pausemenu", "overlay"]]) {
    const t = boot();
    for (const [i, id] of ["rotate-device", ...docOrder].entries()) {
      t.els.get(id)._doc = i;
      t.els.get(id).compareDocumentPosition = function (b) { return b._doc > this._doc ? 4 : 2; };
    }
    t.els.get("pausemenu").hidden = false;
    assert.equal(t.U.top().id, docOrder[1], `document order ${docOrder.join(" < ")}`);
  }
});
