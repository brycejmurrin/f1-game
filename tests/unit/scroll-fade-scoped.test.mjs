/* scroll-fade-scoped.test.mjs — #6754 row 4: paintAll(root) measures only the
 * regions under root, a full call still measures everything, and the overflow
 * axis is read from getComputedStyle once per region until a resize.
 * Run: node --test tests/unit/scroll-fade-scoped.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "js/ui/scroll-fade.js"), "utf8");

function rig() {
  const reads = [];
  const classes = new Map();
  let csCalls = 0;
  const mk = (id, scrollHeight) => {
    const el = {
      id, scrollHeight, scrollWidth: 100, scrollTop: 0, scrollLeft: 0, clientWidth: 100,
      isConnected: true, closest: () => null, matches: () => true,
      classList: { toggle: (c, on) => classes.set(id + "." + c, !!on) },
      style: { setProperty() {}, removeProperty() {} },
    };
    Object.defineProperty(el, "clientHeight", { get() { reads.push(id); return 100; } });
    return el;
  };
  const a = mk("a", 300), b = mk("b", 100);
  const rootA = { querySelectorAll: () => [a], matches: () => false };
  const timers = [];
  const win = { addEventListener() {} };
  const ctx = {
    Log: { info() {} }, window: win,
    ResizeObserver: class { observe() {} unobserve() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    document: {
      readyState: "complete", addEventListener() {}, getElementById: () => null,
      querySelectorAll: () => [a, b],
    },
    getComputedStyle: () => { csCalls++; return { overflowY: "auto", overflowX: "visible", paddingRight: "0" }; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: absSrc("js/ui/scroll-fade.js") });
  timers.length = 0;
  return { win, reads, classes, rootA, a, b, cs: () => csCalls, clear: () => { reads.length = 0; } };
}

test("paintAll(root) measures only nodes under root; full call measures all", () => {
  const r = rig();
  r.clear();
  r.win.ScrollFade.paintAll(r.rootA);
  assert.deepEqual([...new Set(r.reads)], ["a"], "scoped paint reads only the root's region");
  r.clear();
  r.win.ScrollFade.paintAll();
  assert.deepEqual([...new Set(r.reads)].sort(), ["a", "b"], "full paint (resize) still reads every region");
});

test("scoped paint yields the same classes as a full paint", () => {
  const r = rig();
  r.win.ScrollFade.paintAll();
  const full = new Map(r.classes);
  r.classes.clear();
  r.win.ScrollFade.paintAll(r.rootA);
  assert.equal(r.classes.get("a.sf-b"), full.get("a.sf-b"));
  assert.equal(r.classes.get("a.sf-scroll"), true);
  assert.equal(r.classes.has("b.sf-b"), false, "b untouched by the scoped paint");
});

test("overflow axis is cached per region until refresh()", () => {
  const r = rig();
  r.win.ScrollFade.paintAll();
  const n = r.cs();
  r.win.ScrollFade.paintAll(); r.win.ScrollFade.paintAll(r.rootA);
  assert.equal(r.cs(), n, "no further getComputedStyle for known regions");
  r.win.ScrollFade.refresh();
  r.win.ScrollFade.paintAll();
  assert.ok(r.cs() > n, "refresh()/resize re-resolves the style");
});

test("a mutation batch over two layers paints both; a layerless record widens to the document", () => {
  const timers = [], cbs = [], reads = [];
  const mk = (id) => {
    const el = { id, scrollHeight: 300, scrollWidth: 100, scrollTop: 0, scrollLeft: 0, clientWidth: 100, isConnected: true,
      closest: () => null, matches: () => true, classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} } };
    Object.defineProperty(el, "clientHeight", { get() { reads.push(id); return 100; } });
    return el;
  };
  const a = mk("a"), b = mk("b"), c = mk("c");
  const layer = (el) => ({ isConnected: true, querySelectorAll: () => [el], matches: () => false });
  const la = layer(a), lb = layer(b);
  const tgt = (l) => ({ closest: () => l });
  const ctx = {
    Log: { info() {} }, addEventListener() {}, ResizeObserver: class { observe() {} unobserve() {} },
    MutationObserver: class { constructor(cb) { cbs.push(cb); } observe() {} disconnect() {} },
    document: { readyState: "complete", addEventListener() {}, getElementById: () => null, querySelectorAll: () => [a, b, c] },
    getComputedStyle: () => ({ overflowY: "auto", overflowX: "visible", paddingRight: "0" }),
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: absSrc("js/ui/scroll-fade.js") });
  const drain = () => { while (timers.length) timers.shift()(); };
  drain();
  const contentCb = cbs[0];   // contentMo is created first
  reads.length = 0;
  contentCb([{ target: tgt(la) }, { target: tgt(lb) }]);
  drain();
  assert.deepEqual([...new Set(reads)].sort(), ["a", "b"], "both layers painted, not just the first record's");
  reads.length = 0;
  contentCb([{ target: tgt(la) }, { target: tgt(null) }]);
  drain();
  assert.deepEqual([...new Set(reads)].sort(), ["a", "b", "c"], "a layerless record paints the whole document");
});

test("a content-driven paint re-resolves a pane's overflow after a class flip", () => {
  const r = rig();
  r.win.ScrollFade.paintAll();
  r.classes.clear();
  // overflow flips (cache would keep the old axis); a full refresh() re-resolves it
  r.win.ScrollFade.refresh();
  r.win.ScrollFade.paintAll();
  assert.equal(r.classes.get("a.sf-scroll"), true);
});

// #7497 rows 3 and 4, on a fake clock. Row 3: one shared 120/400 ms pair meant
// a second screen settling inside 400 ms cancelled the first screen's late
// repaints. Row 4: a full paint zeroed the 48 ms flush timer without clearing
// it, so the orphaned timer ran a second full flush after the burst.
function clockRig() {
  let now = 0, seq = 0;
  const timers = [], cbs = [], reads = [];
  const mk = (id) => {
    const el = { id, scrollHeight: 300, scrollWidth: 100, scrollTop: 0, scrollLeft: 0, clientWidth: 100, isConnected: true,
      closest: () => null, matches: () => true, classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} } };
    Object.defineProperty(el, "clientHeight", { get() { reads.push(id + "@" + now); return 100; } });
    return el;
  };
  const a = mk("a"), b = mk("b"), c = mk("c");
  const layer = (el) => ({ isConnected: true, querySelectorAll: () => [el], matches: () => false });
  const la = layer(a), lb = layer(b);
  const ctx = {
    Log: { info() {} }, addEventListener() {}, ResizeObserver: class { observe() {} unobserve() {} },
    MutationObserver: class { constructor(cb) { cbs.push(cb); } observe() {} disconnect() {} },
    document: { readyState: "complete", addEventListener() {}, getElementById: () => null, querySelectorAll: () => [a, b, c] },
    getComputedStyle: () => ({ overflowY: "auto", overflowX: "visible", paddingRight: "0" }),
    setTimeout: (fn, ms) => { timers.push({ id: ++seq, at: now + (ms || 0), fn }); return seq; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: absSrc("js/ui/scroll-fade.js") });
  const advance = (to) => {
    for (;;) {
      timers.sort((x, y) => x.at - y.at || x.id - y.id);
      if (!timers.length || timers[0].at > to) break;
      const t = timers.shift(); now = t.at; t.fn();
    }
    now = to;
  };
  const hits = (id, from, to) => new Set(reads.filter((r) => {
    const [n, at] = r.split("@"); return n === id && +at >= from && +at <= to;
  }).map((r) => r.split("@")[1])).size;
  return { advance, hits, contentCb: cbs[0], screenCb: cbs[1], la, lb, tgt: (l) => ({ closest: () => l }) };
}

test("a second screen settling inside 400 ms keeps the first screen's late repaint (#7497 row 3)", () => {
  const r = clockRig();
  r.advance(1000);                               // init's own settle has drained
  r.screenCb([{ target: r.tgt(r.la) }]);         // screen A flips at t=1000
  r.advance(1050);
  r.screenCb([{ target: r.tgt(r.lb) }]);         // screen B flips 50 ms later
  r.advance(2000);
  assert.equal(r.hits("a", 1400, 1400), 1, "A is repainted at its own 400 ms mark");
  assert.equal(r.hits("a", 1120, 1120), 1, "and at its own 120 ms mark");
  assert.equal(r.hits("b", 1450, 1450), 1, "B keeps its late repaint too");
});

test("a full late repaint cancels a pending flush instead of orphaning it (#7497 row 4)", () => {
  const r = clockRig();
  r.advance(380);                                // init: full flush at 48 and 120, full late paint due at 400
  r.contentCb([{ target: r.tgt(r.la) }]);        // a mutation arms the 48 ms flush, due at 428
  r.advance(1000);
  assert.equal(r.hits("c", 381, 1000), 1, "one burst, one full paint: the 400 ms paint covers the pending flush");
});
