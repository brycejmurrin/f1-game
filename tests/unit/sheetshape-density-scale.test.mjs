/* sheetshape-density-scale.test.mjs — roomOwn must use declared --ui-scale.
 *
 * classifyBody() divides the viewport by getComputedStyle(--ui-scale) and is
 * correct on the same reclassify pass that left a sheet stuck. Sheets used
 * CssZoom.of (currentCSSZoom), which can still read 1 on the turn a
 * --ui-scale write lands; ResizeObserver often skips zoom-driven box changes,
 * so hysteresis latched data-density="compact" while the visual box was
 * already scaled (CI scheduled Smoke shard 2 on ce3ec4db: body "normal",
 * #cs-inner "compact", panelW 210 after uiScale(50)).
 *
 * BEHAVIOURAL: VM + mini-dom with a scriptable getComputedStyle and a host
 * taller than --compact-at once divided by the declared scale.
 *
 * Run: node --test tests/unit/sheetshape-density-scale.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot() {
  const dom = makeDom();
  const props = new Map(); // el -> { compactAt, sheetScale, uiScale, padTop, padBottom }

  class RO { observe() {} unobserve() {} disconnect() {} }
  class MO { observe() {} disconnect() {} }

  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet,
    RegExp, Date, parseFloat, parseInt, isFinite, Infinity, NaN,
    ResizeObserver: RO,
    MutationObserver: MO,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: (el) => {
      const p = props.get(el) || {};
      return {
        paddingTop: p.padTop || "0px",
        paddingBottom: p.padBottom || "0px",
        getPropertyValue: (k) => {
          if (k === "--compact-at") return p.compactAt || "";
          if (k === "--sheet-scale") return p.sheetScale || "";
          if (k === "--ui-scale") return p.uiScale || "";
          if (k === "--pair-at" || k === "--rail-at" || k === "--fit-at" ||
              k === "--pair-compact" || k === "--wide-at" || k === "--tall-at") return "";
          return "";
        },
        get zoom() { return p.uiScale || "1"; },
      };
    },
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 1, clearTimeout: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    visualViewport: null,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    // Host room 490; at UI SIZE 50% that is 980 own units (above 480+40).
    innerWidth: 1000, innerHeight: 490, devicePixelRatio: 1,
    document: dom.document,
    CssZoom: {
      of: (el) => (el && el.currentCSSZoom) || 1,
      localBox: (el) => ({ w: el.clientWidth || 0, h: el.clientHeight || 0 }),
    },
  };
  sb.window = sb;
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/sheet-shape.js"), "utf8"),
    sb, { filename: "sheetshape.js" });

  return { dom, sheet: sb.SheetShape, props, sb };
}

test("sheet density releases compact at UI SIZE 50% even when currentCSSZoom is stale", () => {
  const { dom, sheet, props, sb } = boot();

  const host = dom.document.createElement("div");
  host.id = "carsetup";
  // Unzoomed host content box ≈ SHORT_WIDE garage screen.
  host._client = 490;
  host._rect = { left: 0, top: 0, right: 1000, bottom: 490, width: 1000, height: 490 };
  host.currentCSSZoom = 1;

  const el = dom.document.createElement("div");
  el.id = "cs-inner";
  el.className = "sheet";
  el.classList.add("sheet");
  // Content-sized compact sheet: short in own units (the latch that roomOwn exists to break).
  el._client = 400;
  el._rect = { left: 0, top: 0, right: 418, bottom: 400, width: 418, height: 400 };
  // THE BUG INPUT: zoom API still reports 1 after --ui-scale became 0.5.
  el.currentCSSZoom = 1;

  dom.document.body.appendChild(host);
  host.appendChild(el);

  props.set(el, { compactAt: "480px", padTop: "0px", padBottom: "0px" });
  props.set(host, { padTop: "8px", padBottom: "8px" });
  props.set(dom.document.documentElement, { uiScale: "1" });
  props.set(dom.document.body, { compactAt: "380px", uiScale: "1" });

  sheet.observe(el);
  assert.equal(el.dataset.density, "compact",
    "490-pad host with a 400px content sheet is compact at UI SIZE 100%");

  // Player drops UI SIZE to 50%. Declared scale updates; currentCSSZoom stays 1.
  props.get(dom.document.documentElement).uiScale = "0.5";
  props.get(dom.document.body).uiScale = "0.5";
  // Visual box halves; local client box may not have grown yet (content-sized).
  el._rect = { left: 0, top: 0, right: 209, bottom: 200, width: 209, height: 200 };

  sheet.reclassify();

  assert.equal(el.dataset.density, "normal",
    "declared --ui-scale 0.5 must make host room ~948 own units and release compact");
  assert.equal(sb.document.body.dataset.density, "normal",
    "body density (already --ui-scale-based) agrees");
});
