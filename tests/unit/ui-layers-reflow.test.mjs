// UiLayers.shownLayer must not force layout after a style write (survey #3248 / ForcedReflow).
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
  const styleWrites = { n: 0 };
  const mk = (id, extra = {}) => {
    const style = {};
    return {
      id,
      hidden: false,
      open: false,
      children: [],
      isConnected: true,
      style: new Proxy(style, {
        set(t, k, v) { styleWrites.n++; t[k] = v; return true; },
      }),
      getBoundingClientRect() {
        reads.rect++;
        return this._box || { width: 800, height: 600 };
      },
      ...extra,
    };
  };
  const els = new Map();
  for (const id of ["overlay", "rotate-device", "pausemenu", "pmsettings", "lighting"]) {
    els.set(id, mk(id));
  }
  els.get("pausemenu").hidden = true;
  els.get("pmsettings").hidden = true;
  els.get("lighting").hidden = true;
  els.get("lighting")._box = { width: 0, height: 820 };
  // Overlay starts "open" for title; hide rotate-device's box so navOpen is
  // decided by overlay alone when we need it.
  els.get("rotate-device")._box = { width: 0, height: 0 };
  let pending = [];
  class MO {
    constructor() {}
    observe() {}
    takeRecords() { const r = pending; pending = []; return r; }
  }
  let now = 1000;
  const ctx = {
    window: { addEventListener() {} },
    document: {
      documentElement: { id: "html" },
      body: { id: "body" },
      querySelectorAll: (sel) => {
        // top() queries ALL_SEL — return non-hidden layers by id list.
        const out = [];
        for (const el of els.values()) {
          if (!el.hidden) out.push(el);
        }
        return out;
      },
      getElementById: (id) => els.get(id) || null,
      addEventListener() {},
    },
    MutationObserver: MO,
    performance: { now: () => now },
    getComputedStyle: (el) => {
      reads.style++;
      return { visibility: "visible", zIndex: el && el.id === "pmsettings" ? "20" : "1" };
    },
    Log: { info() {}, warn() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/layers.js"), "utf8"), ctx, {
    filename: absSrc("js/ui/layers.js"),
  });
  return {
    U: ctx.window.UiLayers,
    els,
    reads,
    styleWrites,
    mutate(el) { pending.push({ target: el }); },
  };
}

test("shownLayer: open dialog skips layout after a style write (Settings path)", () => {
  const t = boot();
  const settings = t.els.get("pmsettings");
  settings.hidden = false;
  settings.open = true;
  // Simulate TopModal / focus work that dirties style before anyOpen reads.
  settings.style.opacity = "1";
  assert.ok(t.styleWrites.n >= 1, "style write landed");
  const before = { ...t.reads };
  assert.equal(t.U.anyOpen(), true);
  assert.equal(t.reads.rect, before.rect, "no getBoundingClientRect after style write");
  assert.equal(t.reads.style, before.style, "no getComputedStyle after style write");
});

test("top(): ordinary layers skip layout after a style write (focusin path)", () => {
  const t = boot();
  const overlay = t.els.get("overlay");
  const settings = t.els.get("pmsettings");
  const rotate = t.els.get("rotate-device");
  rotate.hidden = true; // out of the ranking set; title path has no in-race
  settings.hidden = false;
  settings.open = true;
  settings.matches = (sel) => sel === ":modal"; // live showModal dialog
  // Dirtied the way TopModal.syncMenuIsolation writes inert/aria on #overlay.
  overlay.style.pointerEvents = "none";
  assert.ok(t.styleWrites.n >= 1, "style write landed");
  const before = { ...t.reads };
  const top = t.U.top();
  assert.ok(top === settings || (top && top.id === "pmsettings"), "settings ranks on top");
  // Ranking must not measure overlay (or settings via shownLayer) after the write.
  assert.equal(t.reads.rect, before.rect, "top() must not getBoundingClientRect after style write");
  assert.equal(t.reads.style, before.style, "top() must not getComputedStyle sheets behind a :modal");
});

test("shownLayer: zero-size wrapper still measures children", () => {
  const t = boot();
  const lighting = t.els.get("lighting");
  lighting.hidden = false;
  const child = {
    hidden: false,
    children: [],
    getBoundingClientRect() { t.reads.rect++; return { width: 437, height: 600 }; },
  };
  lighting.children = [child];
  t.mutate(lighting);
  const before = t.reads.rect;
  assert.equal(t.U.anyOpen(), true);
  assert.ok(t.reads.rect > before, "lighting still pays a layout read for the child walk");
});

test("shownLayer without open still measures ordinary layers (VM memo pins)", () => {
  const t = boot();
  const overlay = t.els.get("overlay");
  overlay.hidden = false;
  overlay._box = { width: 0, height: 0 };
  assert.equal(t.U.navOpen(), false, "zero-size overlay stays closed without el.open");
  assert.ok(t.reads.rect > 0 || t.reads.style > 0, "non-dialog path still touches layout APIs");
});
