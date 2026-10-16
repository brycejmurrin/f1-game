/* menu-nav-spatial.test.mjs — ArrowLeft/Right from a scrollable column
 * must reach a header / adjacent column that does not vertically overlap
 * the current row. Vertical moves stay in-band (the Zandvoort trap).
 *
 * Two legs:
 *   1. source-lock step()'s fallback order so a later edit cannot sneak an
 *      out-of-band dy pass back in, or drop the sideways pass after an
 *      in-band miss;
 *   2. load MenuNav in a VM (no browser) and call pickSideways / step with
 *      fake getBoundingClientRect boxes — the shipped functions, not a
 *      reimplementation (same extract-or-eval idiom as debris-hazard-hint).
 *
 * Run: node --test tests/unit/menu-nav-spatial.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_PATH = path.join(ROOT, "js/ui/menu-nav.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in js/ui/menu-nav.js — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

function loadMenuNav({ document, layer, zoom } = {}) {
  const ctx = {
    window: null,
    document: document || { readyState: "loading", addEventListener() {} },
    Log: { info() {} },
    getComputedStyle: (el) => ({ overflowY: el._overflowY || "auto", overflowX: "hidden" }),
  };
  ctx.window = ctx;
  ctx.window.UiLayers = { shown: () => true, top: () => layer || null };
  ctx.window.Log = ctx.Log;
  if (zoom) ctx.window.CssZoom = { of: () => zoom, toLocalDelta: (_el, px) => px / zoom };
  ctx.window.addEventListener = () => {};
  vm.runInNewContext(SRC, ctx, { filename: "menunav.js" });
  return ctx.window.MenuNav;
}

function el(id, left, top, width, height, extra = {}) {
  return {
    id,
    getBoundingClientRect: () => ({
      left, top, right: left + width, bottom: top + height, width, height,
    }),
    closest: extra.closest || (() => null),
    ...extra,
  };
}

test("MenuNav leaves spatial-editor arrows to the control while retaining paging navigation", () => {
  const { ownsArrows } = loadMenuNav();
  const button = { tagName: "BUTTON", dataset: { arrows: "own" }, getAttribute: () => null };
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.equal(ownsArrows(button, key, { isTrusted: true }), true);
    assert.equal(ownsArrows(button, key, { isTrusted: false }), false, 'D-pad can leave MOVE');
  }
  for (const key of ["Home", "End", "PageDown", "PageUp", "Tab"]) assert.equal(ownsArrows(button, key), false);
  assert.equal(ownsArrows({ ...button, dataset: {} }, "ArrowRight"), false);
  const select = { ...button, tagName: "SELECT" };
  for (const key of ["ArrowUp", "ArrowDown"]) {
    assert.equal(ownsArrows(select, key, { isTrusted: true }), true);
    assert.equal(ownsArrows(select, key, { isTrusted: false }), false, 'D-pad can leave the selector');
  }
  assert.equal(ownsArrows(select, 'ArrowRight', { isTrusted: false }), true, 'pad-menu owns horizontal value stepping');
});

test("MenuNav leaves owned listbox option keys to the widget without exempting unrelated buttons or grids", () => {
  const { ownsArrows } = loadMenuNav();
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  const option = { tagName: "BUTTON", dataset: { arrows: "listbox" }, getAttribute: key => key === "role" ? "option" : null,
    closest: selector => selector === '[role="listbox"]' ? {} : null };
  for (const key of keys) assert.equal(ownsArrows(option, key), true, key);
  for (const key of keys) {
    assert.equal(ownsArrows(option, key, { isTrusted: true }), true, key + " belongs to the keyboard listbox");
    assert.equal(ownsArrows(option, key, { isTrusted: false }), key !== "ArrowUp" && key !== "ArrowDown", key + " uses the pad's axis");
  }
  assert.equal(ownsArrows(option, "PageDown"), false);
  assert.equal(ownsArrows(option, "Tab"), false);
  for (const plain of [{ ...option, dataset: {} }, { ...option, getAttribute: () => null }, { ...option, closest: () => null }]) {
    for (const key of keys) assert.equal(ownsArrows(plain, key), false, key + " belongs to spatial navigation");
  }
});

test("spatial entry uses the selected listbox stop; synthetic vertical keys leave and keyboard keys stay", () => {
  const dom = makeDom({ readyState: "loading" });
  const layer = dom.byId("overlay"), listbox = dom.makeElement("div");
  listbox.setAttribute("role", "listbox");
  const add = (parent, id, x, y) => {
    const node = dom.makeElement("button"); node.id = id;
    node._rect = { left: x, top: y, right: x + 100, bottom: y + 30, width: 100, height: 30 };
    parent.appendChild(node); return node;
  };
  const above = add(layer, "above", 0, 0); above._rect.width = 300; above._rect.right = 300;
  layer.appendChild(listbox);
  const first = add(listbox, "first", 0, 50), selected = add(listbox, "selected", 100, 50);
  for (const node of [first, selected]) { node.dataset.arrows = "listbox"; node.setAttribute("role", "option"); }
  selected.tabIndex = 0; selected.setAttribute("aria-selected", "true");
  const below = add(layer, "below", 0, 100); below._rect.width = 300; below._rect.right = 300;
  const plainOption = add(layer, "plain-option", 0, 160); plainOption.setAttribute("role", "option");
  const orphan = add(layer, "orphan", 0, 210); orphan.dataset.arrows = "listbox"; orphan.setAttribute("role", "option");
  const nav = loadMenuNav({ document: dom.document, layer });
  assert.deepEqual([...nav.items(layer)].map(node => node.id), ["above", "selected", "below", "plain-option", "orphan"]);
  const key = (name, isTrusted) => {
    const e = { key: name, isTrusted, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    nav.onKeyDown(e); return e;
  };
  above.focus(); key("ArrowDown", false);
  assert.equal(dom.document.activeElement, selected, "the nearer unselected option is skipped on spatial entry");
  assert.equal(key("ArrowDown", true).defaultPrevented, false, "trusted Down reaches the option handler");
  assert.equal(dom.document.activeElement, selected);
  key("ArrowDown", false); assert.equal(dom.document.activeElement, below, "pad Down exits the list");
  key("ArrowUp", false); assert.equal(dom.document.activeElement, selected, "pad Up re-enters at selection");
  key("ArrowUp", false); assert.equal(dom.document.activeElement, above, "pad Up exits above");

  // Pane-scoped Home has its own candidate path; it must apply the same filter.
  const pane = dom.makeElement("div"); pane.className = "pane"; pane.scrollHeight = 400; pane._client = 100;
  layer.appendChild(pane); listbox.remove(); pane.appendChild(listbox); below.remove(); pane.appendChild(below);
  below.focus(); key("Home", true); assert.equal(dom.document.activeElement, selected);
  below.remove(); pane.insertBefore(below, listbox);
  below.focus(); key("End", true); assert.equal(dom.document.activeElement, selected);
});

test("step() fallback order: in-band, then dx sideways, then dy wrap, then DOM wrap", () => {
  const stepSrc = extractFn(SRC, "step");
  const parts = stepSrc.split(/if \(best\) return best;/);
  assert.equal(parts.length, 2, "in-band nearest still wins via `if (best) return best`");
  const after = parts[1];

  assert.match(after, /if \(dx\)/,
    "after an in-band miss, a dx-gated second pass must exist");
  assert.match(after, /pickSideways\s*\(/,
    "the dx second pass must call pickSideways");
  assert.match(after, /if \(dy && edge\) return edge/,
    "vertical wrap via `if (dy && edge) return edge` stays");
  assert.match(after, /return n \? list\[\(\(j % n\) \+ n\) % n\] : null/,
    "DOM wrap remains the last resort so a press is never a no-op");

  const iDx = after.search(/if \(dx\)/);
  const iDy = after.search(/if \(dy && edge\) return edge/);
  const iWrap = after.search(/return n \? list\[\(\(j % n\) \+ n\) % n\] : null/);
  assert.ok(iDx < iDy && iDy < iWrap,
    "sideways pass, then dy wrap, then DOM wrap — not some other order");

  assert.doesNotMatch(after, /inBand/,
    "no second in-band / out-of-band geometry loop after the first miss");
  assert.doesNotMatch(after, /if \(dy && !best\)/,
    "dy must not grow an out-of-band phase (ArrowDown from BACK → Zandvoort)");
});

test("pickSideways weights Y lightly and only considers items really to that side", () => {
  const sideSrc = extractFn(SRC, "pickSideways");
  assert.match(sideSrc, /along\s*=\s*\(b\.x\s*-\s*a\.x\)\s*\*\s*dx/,
    "along = (b.x - a.x) * dx");
  assert.match(sideSrc, /along\s*>\s*1|along\s*<=\s*1/,
    "candidates must be really to that side (along > 1)");
  assert.match(sideSrc, /across\s*\*\s*0\.25/,
    "Y is a light tie-break (~0.25), not the in-band * 2");
  assert.doesNotMatch(sideSrc, /across\s*\*\s*2/,
    "must not reuse the in-band across * 2 weight");
});

test("MenuNav exports step so tests can call the spatial walker", () => {
  assert.match(SRC,
    /return \{ activeLayer, nearestPane, onWheel, onKeyDown, FOCUSABLE, step/,
    "step (and the rest of the surface) must stay on the MenuNav return object");
});

test("onWheel pans a horizontal strip before the vertical ancestor walk", () => {
  const wheel = extractFn(SRC, "onWheel");
  const stripAt = wheel.indexOf("const overStrip");
  const walkAt = wheel.indexOf("for (let el = e.target");
  assert.ok(stripAt >= 0 && walkAt >= 0, "overStrip and the ancestor walk are both in onWheel");
  assert.ok(stripAt < walkAt, "strip hit is decided before canScroll/isRegion can no-op the gesture");
  assert.match(wheel, /if \(overStrip\) \{[\s\S]*scrollStrip\(strip, dy\)/);
});

for (const horizontal of [true, false]) for (const zoom of [0.4, 1, 2]) {
  test(`page keys carry focus through a ${horizontal ? "horizontal strip" : "vertical pane"} at ${zoom} scale`, () => {
    const dom = makeDom({ readyState: "loading" });
    const layer = dom.byId("overlay"), pane = dom.makeElement("div");
    layer.appendChild(pane);
    if (horizontal) pane.setAttribute("data-orientation", "horizontal");
    else pane.className = "pane";
    const scroll = horizontal ? "scrollLeft" : "scrollTop";
    pane[scroll] = 0;
    Object.defineProperty(pane, "clientWidth", { value: horizontal ? 300 : 100 });
    Object.defineProperty(pane, "clientHeight", { value: horizontal ? 100 : 300 });
    pane.scrollWidth = horizontal ? 2000 : 100;
    pane.scrollHeight = horizontal ? 100 : 2000;
    const rect = (along, size) => {
      const left = 20 + (horizontal ? along : 0) * zoom;
      const top = 30 + (horizontal ? 0 : along) * zoom;
      const width = (horizontal ? size : 100) * zoom;
      const height = (horizontal ? 100 : size) * zoom;
      return { left, top, right: left + width, bottom: top + height, width, height };
    };
    pane.getBoundingClientRect = () => rect(0, 300);
    const controls = Array.from({ length: 20 }, (_, i) => {
      const button = dom.makeElement("button");
      button.id = `circuit-${i}`;
      pane.appendChild(button);
      button.getBoundingClientRect = () => rect(i * 100 - pane[scroll], 80);
      // Model nearest scrolling: a stale focus after paging would snap back
      // when the following arrow calls focusItem's scrollIntoView.
      button.scrollIntoView = () => {
        const pos = i * 100;
        if (pos < pane[scroll]) pane[scroll] = pos;
        else if (pos + 80 > pane[scroll] + 300) pane[scroll] = pos + 80 - 300;
      };
      const focus = button.focus;
      button.focus = options => {
        focus();
        if (!options?.preventScroll) button.scrollIntoView();
      };
      return button;
    });
    const nav = loadMenuNav({ document: dom.document, layer, zoom });
    const key = name => {
      const event = { key: name, preventDefault() { this.defaultPrevented = true; } };
      nav.onKeyDown(event);
      assert.equal(event.defaultPrevented, true, `${name} is handled`);
    };
    controls[0].focus({ preventScroll: true });
    key("PageDown");
    assert.equal(pane[scroll], 270, "page distance remains 90% in local pixels at every scale");
    assert.equal(dom.document.activeElement, controls[3], "focus moves to the first fully visible control");
    key(horizontal ? "ArrowRight" : "ArrowDown");
    assert.equal(dom.document.activeElement, controls[4]);
    assert.equal(pane[scroll], 270, "next arrow stays on the new page instead of snapping back");

    pane[scroll] = 900;
    controls[11].focus({ preventScroll: true });
    key("PageUp");
    assert.equal(pane[scroll], 630, "focus transfer does not reverse the backward page");
    assert.equal(dom.document.activeElement, controls[7], "backward paging also keeps focus visible");
    key(horizontal ? "ArrowLeft" : "ArrowUp");
    assert.equal(dom.document.activeElement, controls[6]);
    assert.equal(pane[scroll], 600, "the next arrow continues backward from the new page");
  });
}

test("pickSideways: mid-list ArrowLeft lands in the adjacent column at similar height", () => {
  const { pickSideways } = loadMenuNav();
  const from = { id: "zandvoort", x: 400, y: 300 };
  const header = { id: "back", x: 100, y: 40 };
  const filters = { id: "filters", x: 100, y: 80 };
  const preview = { id: "preview", x: 100, y: 220 };
  const start = { id: "start", x: 100, y: 480 };
  const farRight = { id: "dom-next", x: 620, y: 305 };
  const hit = pickSideways(from, [header, filters, preview, start, farRight], -1);
  assert.equal(hit && hit.id, "preview",
    "closest-Y neighbour to the left wins; a far DOM neighbour to the right is ignored");
});

test("pickSideways: nothing to that side returns null (DOM wrap is step()'s job)", () => {
  const { pickSideways } = loadMenuNav();
  const from = { id: "leftmost", x: 40, y: 200 };
  const right = { id: "right", x: 400, y: 200 };
  assert.equal(pickSideways(from, [right], -1), null);
  assert.equal(pickSideways(from, [right], 1) && pickSideways(from, [right], 1).id, "right");
});

test("step(): in-band neighbour still beats an out-of-band header", () => {
  const { step } = loadMenuNav();
  const from = el("mid", 300, 286, 180, 28);
  const inBand = el("in-band-left", 200, 286, 80, 28);
  const header = el("header", 20, 10, 80, 28);
  assert.equal(step(from, -1, 0, [header, inBand, from]).id, "in-band-left");
});

test("step(): ArrowLeft from mid-list reaches a non-overlapping left column", () => {
  const { step } = loadMenuNav();
  const back = el("back", 20, 10, 80, 28);
  const filters = el("filters", 20, 48, 80, 28);
  const preview = el("preview", 20, 200, 80, 28);
  const start = el("start", 20, 460, 80, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const below = el("spa", 300, 320, 180, 28);
  const list = [back, filters, preview, mid, below, start];
  assert.equal(step(mid, -1, 0, list).id, "preview",
    "out-of-band left column at similar height, not DOM wrap to spa/start");
});

test("step(): ArrowDown stays in-band and does not jump to a sideways header", () => {
  const { step } = loadMenuNav();
  const back = el("back", 20, 10, 80, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const below = el("spa", 300, 320, 180, 28);
  const far = el("far-down-left", 20, 500, 80, 28);
  assert.equal(step(mid, 0, 1, [back, mid, below, far]).id, "spa");
});

test("step(): vertical wrap still uses the in-band edge, not an out-of-band item", () => {
  const { step } = loadMenuNav();
  const top = el("bahrain", 300, 40, 180, 28);
  const mid = el("zandvoort", 300, 286, 180, 28);
  const last = el("spa", 300, 320, 180, 28);
  const otherCol = el("start", 20, 460, 80, 28);
  assert.equal(step(last, 0, 1, [top, mid, last, otherCol]).id, "bahrain");
});

test("step(): chip-row Left/Right stay in-group until an end, then fall through", () => {
  const { step } = loadMenuNav();
  const a = el("chip-a", 40, 80, 48, 24);
  const b = el("chip-b", 96, 80, 48, 24);
  const side = el("rail", 20, 200, 80, 28);
  const row = { contains: (n) => n === a || n === b };
  a.closest = (sel) => sel === ".chip-row" ? row : null;
  b.closest = (sel) => sel === ".chip-row" ? row : null;
  const list = [side, a, b];
  assert.equal(step(a, 1, 0, list).id, "chip-b", "Right inside the group");
  assert.equal(step(b, -1, 0, list).id, "chip-a", "Left inside the group");
  assert.equal(step(a, -1, 0, list).id, "rail",
    "Left off the first chip falls through to the spatial sideways pass");
});

for (const className of ["dh-tpopup-body", "dh-telem-main", "dh-telem-side"]) {
  test(`telemetry modal pages its ${className} region and contains wheel gestures at the edge`, () => {
    const dom = makeDom({ readyState: "loading" });
    const hub = dom.byId("datahub"), popup = dom.makeElement("dialog"), pane = dom.makeElement("div");
    hub.appendChild(popup); popup.appendChild(pane); pane.className = className;
    Object.defineProperty(pane, "clientHeight", { value: 200 }); pane.scrollHeight = 800;
    const first = dom.makeElement("button"), last = dom.makeElement("button");
    pane.append(first, last);
    first._rect = { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
    last._rect = { left: 0, top: 300, right: 100, bottom: 340, width: 100, height: 40 };
    const close = dom.makeElement("button"); popup.appendChild(close);
    const nav = loadMenuNav({ document: dom.document, layer: popup });
    first.focus();
    const key = { key: "PageDown", preventDefault() { this.defaultPrevented = true; } };
    nav.onKeyDown(key);
    assert.equal(pane.scrollTop, 180, "paging addresses the popup region");
    assert.equal(key.defaultPrevented, true);
    const end = { key: "End", preventDefault() {} }; nav.onKeyDown(end);
    assert.equal(dom.document.activeElement, last, "End stays in the region, not the header or the hub");
    pane.scrollTop = 600;
    let redirects = 0;
    popup.querySelectorAll = () => { redirects++; return []; };
    nav.onWheel({ target: first, deltaY: 100, deltaMode: 0, preventDefault() {} });
    assert.equal(redirects, 1, "edge wheel only checks horizontal strips; it must not seek another pane");
    assert.equal(pane.scrollTop, 600);
  });
}
