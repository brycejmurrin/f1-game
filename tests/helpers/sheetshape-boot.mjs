/* Shared VM boot for the sheetshape-* unit tests: js/ui/sheet-shape.js against
 * the mini-dom. Each test supplies only what differs (observers, rAF/timer
 * policy, viewport, getComputedStyle) via `overrides(dom)`; the rest is the
 * common sandbox. Returns { dom, sb, sheet }. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "./mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

class NoopObserver { observe() {} unobserve() {} disconnect() {} }

export function bootSheetShape(overrides = () => ({})) {
  const dom = makeDom();
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet,
    RegExp, Date, parseFloat, parseInt, isFinite, Infinity, NaN,
    ResizeObserver: NoopObserver,
    MutationObserver: NoopObserver,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 1, clearTimeout: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    visualViewport: null,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    document: dom.document,
    ...overrides(dom),
  };
  sb.window = sb;
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/sheet-shape.js"), "utf8"),
    sb, { filename: path.join(ROOT, "js/ui/sheet-shape.js") });
  return { dom, sb, sheet: sb.SheetShape };
}
