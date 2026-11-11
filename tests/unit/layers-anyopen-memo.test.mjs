// UiLayers.anyOpen() is latched by Input.poll() but still bursts during menu
// transitions; memoise it like navOpen() (survey #3248 / gpu-census shownLayer).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot() {
  const reads = { rect: 0, style: 0 };
  const mk = (id, shown) => ({
    id, hidden: false, children: [], shown, isConnected: true,
    getBoundingClientRect() { reads.rect++; return this.shown ? { width: 800, height: 600 } : { width: 0, height: 0 }; },
  });
  const els = new Map();
  for (const id of ["overlay", "rotate-device", "pausemenu", "pmsettings"]) els.set(id, mk(id, false));
  els.get("pausemenu").hidden = true;
  els.get("pmsettings").hidden = true;
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/layers.js"), "utf8"), ctx, { filename: absSrc("js/ui/layers.js") });
  return {
    U: ctx.window.UiLayers, els, reads, observed,
    mutate(el) { pending.push({ target: el }); },
    advance(ms) { now += ms; },
  };
}

test("anyOpen reads layout once per window, not once per call", () => {
  const t = boot();
  assert.equal(t.U.anyOpen(), false);
  const after = { ...t.reads };
  for (let i = 0; i < 20; i++) assert.equal(t.U.anyOpen(), false);
  assert.deepEqual(t.reads, after, "20 further calls must not touch getBoundingClientRect/getComputedStyle");
});

test("opening a gated layer is seen on the very next call", () => {
  const t = boot();
  assert.equal(t.U.anyOpen(), false);
  const settings = t.els.get("pmsettings");
  settings.hidden = false; settings.shown = true; t.mutate(settings);
  assert.equal(t.U.anyOpen(), true);
});

test("anyOpen consuming the dirty flag does not leave navOpen on a stale answer", () => {
  const t = boot();
  assert.equal(t.U.navOpen(), false);
  const overlay = t.els.get("overlay");
  overlay.shown = true; t.mutate(overlay);
  assert.equal(t.U.anyOpen(), false, "overlay is gate:false, so anyOpen stays false");
  assert.equal(t.U.navOpen(), true, "navOpen must still see the overlay opened before anyOpen ran");
});

test("a record pending at recompute never turns the fresh answer into undefined/null", () => {
  // top() and navOpen() used to drain AFTER computing; the drain drops the memo it
  // had just stored, so the caller got `undefined` (top) or `null` (navOpen).
  // custom-tracks' door and experience's photo swap compare top() before/after a
  // load, so `undefined !== null` read as "another screen took over" (#3888).
  const t = boot();
  t.els.get("overlay").hidden = true;   // top() finds layers by id (uihunt4 #6): really closed
  t.mutate(t.els.get("pausemenu"));
  assert.strictEqual(t.U.top(), null, "top() with nothing open is null, never undefined");
  t.advance(1000); t.mutate(t.els.get("pausemenu"));
  assert.strictEqual(t.U.top(), null, "an expired memo plus a pending record still answers null");
  const overlay = t.els.get("overlay");
  overlay.hidden = false; overlay.shown = true; t.advance(1000); t.mutate(overlay);
  assert.strictEqual(t.U.navOpen(), true, "navOpen returns the fresh answer, not the memo the drain dropped");
});
