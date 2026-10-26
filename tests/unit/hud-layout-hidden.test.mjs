/* #3273 — MOVE & SIZE greys sliders for elements the active preset hides.
   Under SETTINGS the race HUD is off, so body.hud-prof-* / hud-met-* lag the
   store; hiddenReason must still hard-flag those chips and paintHidden must
   disable the numeric fields. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAMG = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8");
const SRC = CAMG + "\n" + fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");

function fakeEl() {
  const props = {}, attrs = {};
  return {
    props, attrs,
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; }, getPropertyValue(k) { return props[k] || ""; } },
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
  };
}

function loadHidden({ stored = {}, classes = [], live = false } = {}) {
  const written = Object.assign({}, stored);
  const els = {};
  const cls = new Set(classes);
  const hud = { hidden: !live };
  const body = {
    classList: {
      contains: (c) => cls.has(c),
      add: (c) => { cls.add(c); },
      remove: (c) => { cls.delete(c); },
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
    },
    getAttribute: () => null,
    hasAttribute: () => false,
  };
  const doc = {
    readyState: "complete", body, documentElement: { hasAttribute: () => false },
    getElementById: (id) => (id === "hud" ? hud : null),
    querySelector: (sel) => (els[sel] || (els[sel] = fakeEl())),
    addEventListener() {},
  };
  const ctx = {
    console, document: doc,
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx, { filename: absSrc("js/ui/hud-layout.js") });
  return { H: ctx.HudLayout, written, els, cls, hud };
}

function foldEditor(stored = {}) {
  const dom = makeDom({ readyState: "loading" }), document = dom.document;
  const lookup = document.getElementById, create = document.createElement;
  document.getElementById = (id) => (dom.has(id) ? lookup(id) : null);
  document.createElement = (tag) => {
    const el = create(tag);
    if (tag === "select") Object.defineProperty(el, "options", { get: () => el.children });
    return el;
  };
  const host = dom.makeElement("details", "pm-hud-details");
  dom.body.appendChild(host);
  // Menus: race HUD off; no hud-prof-* / hud-met-* on the body — only the store.
  const hud = { hidden: true };
  const origGet = document.getElementById;
  document.getElementById = (id) => (id === "hud" ? hud : origGet(id));
  const written = Object.assign({}, stored);
  const listeners = [], timers = [];
  const store = {
    get: (k, d) => (k in written ? written[k] : d),
    set(k, v) { written[k] = v; for (const fn of listeners) fn({ key: k }); },
    subscribe: (fn) => listeners.push(fn),
  };
  const ctx = {
    document, GameStore: { store },
    setTimeout: (fn) => timers.push(fn),
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/setting-row.js"), "utf8"), ctx, { filename: absSrc("js/ui/setting-row.js") });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/hud-elements.js"), "utf8") + "; this.HudElements = HudElements;", ctx, { filename: absSrc("js/ui/hud-elements.js") });
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx, { filename: absSrc("js/ui/hud-layout.js") });
  ctx.HudLayout.build();
  const choose = (id, value) => {
    const el = document.getElementById(id);
    assert.ok(el, id);
    el.value = value;
    dom.dispatch(el, { type: "change", bubbles: true });
  };
  return { H: ctx.HudLayout, document, choose, written, flush() { while (timers.length) timers.shift()(); } };
}

test("menus: store MINIMAL hard-hides chips without body.hud-prof-minimal (#3273)", () => {
  const { H } = loadHidden({ stored: { hudProfile: "minimal" }, classes: ["desktop"], live: false });
  for (const id of ["ot", "aero", "energy", "bb", "sectors", "damage", "rel", "strat", "inputs"]) {
    const r = H.hiddenReason(id);
    assert.ok(r && !r.soft, id + ": " + JSON.stringify(r));
    assert.equal(r.reason, "MINIMAL style", id);
  }
  assert.equal(H.hiddenReason("tower"), null, "tower stays on MINIMAL");
  assert.equal(H.hiddenReason("map"), null, "map uses its own MAP rule, not style");
});

test("menus: store COMPACT hard-hides tyre/sectors/chips without hud-met-compact (#3273)", () => {
  const { H } = loadHidden({
    stored: { hudProfile: "standard", hudMetricsLayout: "compact" },
    classes: ["desktop"],
    live: false,
  });
  for (const id of ["tyre", "sectors", "ot", "aero", "energy", "bb"]) {
    const r = H.hiddenReason(id);
    assert.ok(r && !r.soft, id + ": " + JSON.stringify(r));
    assert.equal(r.reason, "LAYOUT is COMPACT", id);
  }
  assert.equal(H.hiddenReason("tower"), null);
});

test("MOVE & SIZE fold disables numeric fields when the selected chip is preset-hidden", () => {
  const e = foldEditor({ hudProfile: "minimal" });
  const fold = e.document.getElementById("pm-hudlayout");
  fold.open = true;
  e.choose("pm-hl-el-sel", "ot");
  const [x, y, s] = ["x", "y", "s"].map((k) => e.document.getElementById("pm-hl-" + k));
  assert.equal(x.disabled, true, "LEFT/RIGHT greyed for hidden OT");
  assert.equal(y.disabled, true);
  assert.equal(s.disabled, true);
  assert.equal(e.document.getElementById("pm-hl-reset-el").disabled, true);
  const why = e.document.getElementById("pm-hl-why");
  assert.equal(why.textContent, "Not drawn now: MINIMAL style. Its controls come back when it shows.");

  e.choose("pm-hl-el-sel", "tower");
  assert.equal(x.disabled, false, "tower stays editable on MINIMAL");
  assert.equal(why.textContent, "");

  e.written.hudProfile = "standard";
  e.written.hudMetricsLayout = "compact";
  // Store subscribe fires on set(); poke the host change path used by STYLE rows.
  e.choose("pm-hl-el-sel", "tyre");
  assert.equal(x.disabled, true, "COMPACT greys TYRE without a body class");
  assert.equal(
    e.document.getElementById("pm-hl-why").textContent,
    "Not drawn now: LAYOUT is COMPACT. Its controls come back when it shows.",
  );
});
