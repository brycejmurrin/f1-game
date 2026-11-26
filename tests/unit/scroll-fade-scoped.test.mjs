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
