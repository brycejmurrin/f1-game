/* title-layout — APPEARANCE › TITLE LAYOUT: move and size the title screen's
 * buttons, title and car drawing, plus button width / layout / side — one
 * layout per screen shape, and the drag-to-place editor on the title screen.
 * Runs the REAL module (and SettingRow) in node:vm over the mini DOM, and holds
 * index.html's first-paint copy of the arithmetic equal to the module's.
 *
 * Run: node --test tests/unit/title-layout.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SHELL = read("index.html");
const CSS = read("css/responsive.css");
const plain = (o) => JSON.parse(JSON.stringify(o));

function boot(stored = {}, { shape = "wide", editor = false } = {}) {
  const dom = makeDom();
  const panel = dom.byId("pm-panel-appearance");
  const replay = dom.byId("pm-replay-intro");
  panel.appendChild(replay);
  dom.body.setAttribute("data-shape", shape);
  // The title screen and the editor's shell layer, as index.html ships them.
  if (editor) {
    dom.byId("pmsettings").appendChild(panel);
    const overlay = dom.byId("overlay");
    for (const id of ["title-car", "menu-brand", "menu-buttons"]) overlay.appendChild(dom.byId(id));
    dom.byId("menu-buttons").appendChild(dom.byId("mb-race"));
    dom.byId("tl-editor").hidden = true;
    dom.byId("tl-editor").appendChild(dom.byId("tl-done"));
  }
  // mini-dom's getElementById creates on a miss; the module's mount-once
  // guard needs a real miss, so only ids that exist are found.
  const get = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? get(id) : null);
  const data = Object.assign({}, stored);
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { if (v === null) delete data[k]; else data[k] = v; } };
  const timers = [];
  const observers = [];
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(target, opts) { this.target = target; this.opts = opts; }
  }
  const sb = {
    document: dom.document, GameStore: { store }, Log: { info() {}, warn() {} }, MutationObserver,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    innerWidth: 1000, innerHeight: 500,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/ui/setting-row.js", "js/ui/title-layout.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const M = vm.runInContext("TitleLayout", ctx);
  /** Flip body[data-shape] the way sheet-shape.js does, and run the observer. */
  const rotate = (to) => {
    dom.body.setAttribute("data-shape", to);
    for (const o of observers) if (o.target === dom.body && o.opts.attributeFilter.includes("data-shape")) o.fn();
  };
  const mutated = (el) => { for (const o of observers) if (o.target === el) o.fn(); };
  return { dom, M, data, panel, html: dom.documentElement, timers, rotate, mutated };
}

test("normalize clamps every field and reads junk as shipped", () => {
  const { M } = boot();
  const d = plain(M.normalize(null));
  assert.deepEqual(d, { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 0, y: 0, size: 100 }, layout: "grid", side: "auto" });
  const n = plain(M.normalize({ btns: { x: 90, y: -90, size: 999, width: 5 }, title: { size: "big" }, art: { x: 12.6 }, layout: "diagonal", side: "left" }));
  assert.deepEqual(n.btns, { x: 50, y: -50, size: 200, width: 20 }, "clamped; a width under 20% of the screen is 20");
  assert.equal(n.title.size, 100, "junk is the shipped value");
  assert.equal(n.art.x, 13, "whole percents");
  assert.equal(n.layout, "grid"); assert.equal(n.side, "auto");
  assert.equal(M.isDefault(null), true); assert.equal(M.isDefault({ btns: { width: -4 } }), true, "a negative width is AUTO");
  assert.equal(M.isDefault({ side: "swap" }), false);
});

test("untouched, the page carries nothing; custom lands as --tl-* tokens and html attributes", () => {
  const { M, html, data } = boot();
  assert.equal(html.dataset.titleLayout, undefined);
  assert.deepEqual(plain(html.style._decls), {});
  M.set({ btns: { x: -10, y: 5, size: 120, width: 40 }, art: { size: 150 }, layout: "stack", side: "swap" });
  assert.equal(html.dataset.titleLayout, "on");
  assert.equal(html.dataset.titleSide, "swap");
  assert.equal(html.dataset.titleBtns, "stack");
  assert.equal(html.dataset.titleBtnw, "on");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "-10vw");
  assert.equal(html.style.getPropertyValue("--tl-btns-y"), "5vh");
  assert.equal(html.style.getPropertyValue("--tl-btns-size"), "1.2");
  assert.equal(html.style.getPropertyValue("--tl-btns-w"), "40");
  assert.equal(html.style.getPropertyValue("--tl-art-size"), "1.5");
  assert.ok(data.titleLayout, "stored");
  M.reset();
  assert.equal(data.titleLayout, undefined, "shipped stores null");
  assert.equal(html.dataset.titleLayout, undefined);
  assert.equal(html.dataset.titleSide, undefined);
  assert.deepEqual(plain(html.style._decls), {}, "every token taken back off");
});

test("a stored layout applies at eval", () => {
  const { html } = boot({ titleLayout: { title: { y: -20 }, layout: "row" } });
  assert.equal(html.dataset.titleLayout, "on");
  assert.equal(html.dataset.titleBtns, "row");
  assert.equal(html.style.getPropertyValue("--tl-title-y"), "-20vh");
});

test("index.html's first-paint copy writes exactly what the module writes", () => {
  const m = SHELL.match(/\/\/ Title layout: apex26\.titleLayout[\s\S]*?\n    try \{\n([\s\S]*?)\n    \} catch \(e\) \{ \/\* TitleLayout answers at eval \*\/ \}/);
  assert.ok(m, "the inline boot carries the title layout block");
  const A = { btns: { x: -10, y: 5, size: 120, width: 40 }, title: { x: 3, y: -4, size: 80 }, art: { x: 0, y: 12, size: 150 }, layout: "stack", side: "swap" };
  const B = { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 20, y: 0, size: 100 }, layout: "row", side: "auto" };
  // v1 (one layout, both shapes), a v2 pair, and a v2 with only the portrait shape custom.
  const cases = [A, B, { v: 2, wide: A, tall: B }, { v: 2, tall: A }];
  for (const stored of cases) for (const shape of ["wide", "tall"]) {
    const { M, html } = boot({ titleLayout: stored }, { shape });
    const de = { style: { _d: {}, setProperty(k, v) { this._d[k] = v; } }, dataset: {} };
    const sb = { localStorage: { getItem: (k) => (k === "apex26.titleLayout" ? JSON.stringify(stored) : null) }, document: { documentElement: de }, JSON,
      b: { getAttribute: (k) => (k === "data-shape" ? shape : null) } };
    vm.runInContext(m[1], vm.createContext(sb));
    const why = `${JSON.stringify(stored).slice(0, 40)}… on ${shape}`;
    assert.deepEqual(de.style._d, plain(html.style._decls), "same tokens: " + why);
    assert.deepEqual(de.dataset, plain(html.dataset), "same attributes: " + why);
    const want = M.isDefault(M.current()) ? {} : plain(M.vars(M.current()));
    assert.deepEqual(de.style._d, want, "and both are TitleLayout.vars of the shape's layout: " + why);
  }
  assert.ok(SHELL.indexOf("// Title layout: apex26.titleLayout") > SHELL.indexOf('b.setAttribute("data-shape"'), "it runs after data-shape is known");
});

test("v1 → v2: a one-layout store is BOTH shapes, and the next write keeps the untouched shape", () => {
  const v1 = { btns: { x: 12 }, layout: "stack" };
  const { M, data, html } = boot({ titleLayout: v1 });
  assert.deepEqual(plain(M.all().wide), plain(M.normalize(v1)));
  assert.deepEqual(plain(M.all().tall), plain(M.normalize(v1)), "the portrait shape inherits it");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "12vw");
  const l = M.current(); l.btns.x = -30;
  M.set(l);
  assert.equal(data.titleLayout.v, 2, "written back as v2");
  assert.equal(data.titleLayout.wide.btns.x, -30, "the shape the screen is in changed");
  assert.deepEqual(plain(data.titleLayout.tall), plain(M.normalize(v1)), "the other kept the v1 layout");
  M.resetShape("tall");
  assert.equal(data.titleLayout.tall, undefined, "a shipped shape is not stored");
  M.resetShape("wide");
  assert.equal(data.titleLayout, undefined, "both shipped stores null");
  assert.equal(M.isDefault(M.all().tall), true);
  assert.equal(boot({ titleLayout: { v: 2 } }).html.dataset.titleLayout, undefined, "an empty v2 is shipped");
  assert.equal(boot({ titleLayout: { v: 2, tall: "junk" } }).M.isDefault(M.current("tall")), true, "junk shape reads as shipped");
});

test("per shape: each shape applies its own layout, and a rotation re-applies", () => {
  const { M, html, rotate, dom } = boot({ titleLayout: { v: 2, wide: { btns: { x: 10 } }, tall: { btns: { y: -20 }, side: "swap" } } }, { shape: "tall" });
  assert.equal(M.shape(), "tall");
  assert.equal(html.style.getPropertyValue("--tl-btns-y"), "-20vh", "portrait's layout at eval");
  assert.equal(html.dataset.titleSide, "swap");
  assert.equal(dom.byId("pm-tl-shape").textContent, "EDITING: PORTRAIT");
  assert.equal(dom.byId("pm-tl-copy").textContent, "COPY TO LANDSCAPE");
  assert.equal(dom.byId("pm-tl-btns-y").value, "-20", "the sliders show portrait's numbers");
  rotate("wide");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "10vw", "landscape's layout after the rotation");
  assert.equal(html.style.getPropertyValue("--tl-btns-y"), "0vh");
  assert.equal(html.dataset.titleSide, undefined, "portrait's SWAPPED went with it");
  assert.equal(dom.byId("pm-tl-shape").textContent, "EDITING: LANDSCAPE", "the fold follows the rotation");
  assert.equal(dom.byId("pm-tl-copy").textContent, "COPY TO PORTRAIT");
  assert.equal(dom.byId("pm-tl-btns-x").value, "10");
  M.set({ title: { size: 150 } }, "tall");
  assert.equal(html.style.getPropertyValue("--tl-title-size"), "1", "writing the OTHER shape leaves the page alone");
  rotate("tall");
  assert.equal(html.style.getPropertyValue("--tl-title-size"), "1.5");
});

test("COPY TO the other shape, RESET THIS SHAPE, RESET ALL, and the summary counts both shapes", () => {
  const { dom, data } = boot({}, { shape: "wide" });
  const sum = dom.byId("pm-titlelayout-sum");
  const x = dom.byId("pm-tl-btns-x");
  x.value = "15"; dom.dispatch(x, { type: "input" });
  dom.byId("pm-tl-copy").click();
  assert.deepEqual(plain(data.titleLayout.tall), plain(data.titleLayout.wide), "COPY TO PORTRAIT");
  dom.byId("pm-tl-reset-shape").click();
  assert.equal(data.titleLayout.wide, undefined, "RESET THIS SHAPE: landscape shipped");
  assert.equal(data.titleLayout.tall.btns.x, 15, "portrait kept");
  assert.equal(x.value, "0", "the sliders repaint");
  assert.equal(sum.textContent, "TITLE LAYOUT · CUSTOM", "either shape custom is CUSTOM");
  assert.equal(dom.byId("pm-tl-reset").textContent, "RESET ALL");
  dom.byId("pm-tl-reset").click();
  assert.equal(data.titleLayout, undefined, "RESET ALL");
  assert.equal(sum.textContent, "TITLE LAYOUT · SHIPPED");
});

/* ── EDIT ON TITLE SCREEN ─────────────────────────────────────────────────── */
function editing(stored = {}, opts = {}) {
  const h = boot(stored, Object.assign({ editor: true }, opts));
  const { dom } = h;
  dom.byId("menu-buttons")._rect = { left: 400, top: 300, right: 600, bottom: 500, width: 200, height: 200 };
  dom.byId("title-car")._rect = { left: 0, top: 100, right: 1000, bottom: 500, width: 1000, height: 400 };
  dom.byId("overlay")._rect = { left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 };
  dom.byId("pm-tl-edit").click();
  return h;
}
const ptr = (dom, el, type, x, y, id = 1) => { const ev = { type, clientX: x, clientY: y, pointerId: id, bubbles: true }; dom.dispatch(el, ev); return ev; };
const key = (dom, k, extra = {}) => { const ev = Object.assign({ type: "keydown", key: k, bubbles: true }, extra); dom.dispatch(dom.body, ev); return ev; };

test("editor: the fold's button trades the settings page for the title screen and a docked bar", () => {
  const { dom, M, html } = editing();
  assert.equal(M.editing, true);
  assert.equal(dom.byId("pmsettings").hidden, true, "the settings page steps aside");
  assert.equal(dom.byId("pm-panel-appearance").hidden, true);
  assert.equal(html.hasAttribute("data-tl-edit"), true);
  const bar = dom.byId("tl-editor");
  assert.equal(bar.hidden, false);
  assert.deepEqual(bar.children.map((c) => c.id), ["tl-piece", "tl-size-dn", "tl-size-up", "tl-width-dn", "tl-width-up", "tl-reset-piece", "tl-done", "tl-handle"], "DONE adopted into the bar");
  assert.equal(dom.byId("tl-piece").textContent, "BUTTONS · LANDSCAPE · 100% · AUTO WIDTH");
  assert.equal(dom.byId("menu-buttons").hasAttribute("data-tl-sel"), true, "the buttons start selected");
  const art = dom.byId("tl-art");
  assert.equal(art.parentNode, dom.byId("overlay"), "the drawing's proxy lives in #overlay, under the doors");
  assert.equal(art.hidden, false);
  assert.deepEqual([art.style.getPropertyValue("left"), art.style.getPropertyValue("top"), art.style.getPropertyValue("width"), art.style.getPropertyValue("height")],
    ["0px", "100px", "1000px", "400px"], "laid over the drawing's box");
  const hd = dom.byId("tl-handle");
  assert.equal(hd.hidden, false);
  assert.deepEqual([hd.style.getPropertyValue("left"), hd.style.getPropertyValue("top")], ["600px", "500px"], "the handle on the selected piece's corner");
  assert.equal(M.enter(), false, "entered once");
});

test("editor: a pointer drag moves a piece in screen percent, the corner handle sizes it, and door clicks are swallowed", () => {
  const { dom, data, html } = editing();
  const btns = dom.byId("menu-buttons");
  const d = ptr(dom, btns, "pointerdown", 500, 400);
  assert.equal(d.defaultPrevented, true, "no focus, no text selection");
  ptr(dom, btns, "pointermove", 600, 350);
  assert.equal(data.titleLayout.wide.btns.x, 10, "100 px of 1000 is 10vw");
  assert.equal(data.titleLayout.wide.btns.y, -10, "-50 px of 500 is -10vh");
  ptr(dom, btns, "pointermove", 650, 400, 2);
  assert.equal(data.titleLayout.wide.btns.x, 10, "another pointer does not steer it");
  ptr(dom, btns, "pointerup", 600, 350);
  ptr(dom, btns, "pointermove", 900, 350);
  assert.equal(data.titleLayout.wide.btns.x, 10, "released");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "10vw");
  // The corner handle: twice as far from the centre is twice the size.
  ptr(dom, dom.byId("tl-handle"), "pointerdown", 600, 500);
  ptr(dom, dom.byId("tl-handle"), "pointermove", 700, 600);
  ptr(dom, dom.byId("tl-handle"), "pointerup", 700, 600);
  assert.equal(data.titleLayout.wide.btns.size, 200);
  // The drawing, through its proxy; dragging selects it.
  const art = dom.byId("tl-art");
  ptr(dom, art, "pointerdown", 100, 400);
  assert.equal(art.hasAttribute("data-tl-sel"), true);
  assert.equal(btns.hasAttribute("data-tl-sel"), false);
  ptr(dom, art, "pointermove", 100 - 2000, 400);
  ptr(dom, art, "pointerup", 0, 0);
  assert.equal(data.titleLayout.wide.art.x, -50, "clamped");
  assert.equal(dom.byId("tl-width-up").disabled, true, "WIDTH is the buttons' alone");
  const click = { type: "click", bubbles: true };
  dom.dispatch(dom.byId("mb-race"), click);
  assert.ok(click.defaultPrevented && click.propagationStopped, "a door's click is swallowed while editing");
});

test("editor: keys nudge, size and cycle the pieces; the bar's steps and RESET PIECE", () => {
  const { dom, data } = editing({}, { shape: "tall" });
  const right = key(dom, "ArrowRight");
  assert.equal(right.defaultPrevented, true, "the key is the editor's");
  key(dom, "ArrowDown"); key(dom, "ArrowDown");
  assert.deepEqual([data.titleLayout.tall.btns.x, data.titleLayout.tall.btns.y], [1, 2], "arrows move 1% (the portrait shape)");
  assert.equal(data.titleLayout.wide, undefined, "landscape untouched");
  key(dom, "+"); key(dom, "=");
  assert.equal(data.titleLayout.tall.btns.size, 110);
  key(dom, "-");
  assert.equal(data.titleLayout.tall.btns.size, 105);
  key(dom, "Tab");
  assert.equal(dom.byId("menu-brand").hasAttribute("data-tl-sel"), true, "Tab: the title");
  key(dom, "Tab", { shiftKey: true }); key(dom, "Tab", { shiftKey: true });
  assert.equal(dom.byId("tl-art").hasAttribute("data-tl-sel"), true, "Shift+Tab back round to the drawing");
  key(dom, "ArrowLeft");
  assert.equal(data.titleLayout.tall.art.x, -1);
  assert.equal(key(dom, "Escape").defaultPrevented, undefined, "Escape is left to data-esc-close (DONE)");
  key(dom, "Tab");
  dom.byId("tl-size-up").click();
  assert.equal(data.titleLayout.tall.btns.size, 110);
  dom.byId("tl-width-up").click();
  assert.equal(data.titleLayout.tall.btns.width, 25, "from AUTO, the width the buttons have now (200 px of 1000) plus a step");
  dom.byId("tl-width-dn").click(); dom.byId("tl-width-dn").click();
  assert.equal(data.titleLayout.tall.btns.width, 0, "under 20% is AUTO again");
  dom.byId("tl-reset-piece").click();
  assert.deepEqual(plain(data.titleLayout.tall.btns), { x: 0, y: 0, size: 100, width: 0 }, "RESET PIECE");
  assert.equal(data.titleLayout.tall.art.x, -1, "and only that piece");
});

test("editor: DONE gives the settings page back, opens the fold and focuses its button; mid-race it cannot open", () => {
  const { dom, M, html, timers, mutated } = editing();
  key(dom, "ArrowRight");
  dom.byId("tl-done").click();
  assert.equal(M.editing, false);
  assert.equal(html.hasAttribute("data-tl-edit"), false);
  assert.equal(dom.byId("tl-editor").hidden, true);
  assert.equal(dom.byId("tl-art").hidden, true);
  assert.equal(dom.byId("menu-buttons").hasAttribute("data-tl-sel"), false);
  assert.equal(dom.byId("pmsettings").hidden, false, "settings back");
  assert.equal(dom.byId("pm-panel-appearance").hidden, false);
  assert.equal(dom.byId("pm-titlelayout").open, true, "the fold open");
  assert.equal(dom.byId("pm-tl-btns-x").value, "1", "its sliders repainted");
  timers.at(-1).fn();
  assert.equal(dom.document.activeElement, dom.byId("pm-tl-edit"), "focus back on EDIT ON TITLE SCREEN");
  const was = key(dom, "ArrowRight");
  assert.equal(was.defaultPrevented, undefined, "keys are nobody's business once DONE");
  const click = { type: "click", bubbles: true };
  dom.dispatch(dom.byId("mb-race"), click);
  assert.equal(click.defaultPrevented, undefined, "doors click again");
  dom.byId("overlay").hidden = true; mutated(dom.byId("overlay"));
  assert.equal(dom.byId("pm-tl-edit").disabled, true, "disabled mid-race (#overlay hidden)");
  assert.equal(M.enter(), false);
  assert.match(SHELL, /<div id="tl-editor" role="region" aria-label="Title layout editor" data-esc-close="tl-done" hidden>\s*<button id="tl-done" type="button">DONE<\/button>\s*<\/div>/);
});

test("the APPEARANCE fold: built before REPLAY INTRO, sliders store and PEEK, choices wire, RESET clears", () => {
  const { dom, M, data, panel, html, timers } = boot();
  const fold = dom.byId("pm-titlelayout");
  assert.ok(fold, "built");
  assert.equal(panel.children.indexOf(fold) + 1, panel.children.indexOf(dom.byId("pm-replay-intro")), "just before REPLAY INTRO");
  const sum = dom.byId("pm-titlelayout-sum");
  assert.equal(sum.textContent, "TITLE LAYOUT · SHIPPED");
  for (const id of ["pm-tl-btns-size", "pm-tl-btns-width", "pm-tl-btns-x", "pm-tl-btns-y", "pm-tl-title-size", "pm-tl-title-x", "pm-tl-title-y", "pm-tl-art-size", "pm-tl-art-x", "pm-tl-art-y", "pm-tl-layout", "pm-tl-side", "pm-tl-reset", "pm-tl-reset-shape", "pm-tl-copy", "pm-tl-edit", "pm-tl-shape"])
    assert.ok(dom.has(id), id);
  assert.equal(dom.byId("pm-tl-btns-width-v").textContent, "AUTO");
  const x = dom.byId("pm-tl-btns-x");
  dom.dispatch(x, { type: "pointerdown" });
  assert.ok(dom.body.hasAttribute("data-tl-peek"), "holding a slider shows the title screen");
  x.value = "-25"; dom.dispatch(x, { type: "input" });
  assert.equal(data.titleLayout.wide.btns.x, -25, "stored for the shape the screen is in");
  assert.equal(html.style.getPropertyValue("--tl-btns-x"), "-25vw");
  assert.equal(dom.byId("pm-tl-btns-x-v").textContent, "25% left");
  assert.equal(sum.textContent, "TITLE LAYOUT · CUSTOM");
  timers.at(-1).fn();
  assert.equal(dom.body.hasAttribute("data-tl-peek"), false, "and lets go of it after");
  const side = dom.byId("pm-tl-side-sel");
  side.value = "swap"; dom.dispatch(side, { type: "change" });
  assert.equal(data.titleLayout.wide.side, "swap");
  assert.equal(html.dataset.titleSide, "swap");
  dom.byId("pm-tl-reset").click();
  assert.equal(data.titleLayout, undefined);
  assert.equal(sum.textContent, "TITLE LAYOUT · SHIPPED");
  assert.equal(x.value, "0", "sliders repaint to shipped");
  M.build();
  assert.equal(panel.children.filter((c) => c === fold).length, 1, "mount once");
});

test("CSS: every TITLE LAYOUT rule is gated on a custom layout (or the peek) and lives in the overlays layer", () => {
  const start = CSS.indexOf("/* ---------- TITLE LAYOUT player setting");
  const end = CSS.indexOf("} /* @layer overlays */");
  assert.ok(start > 0 && end > start, "the block sits inside @layer overlays");
  const block = CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = [...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
  assert.ok(sels.length >= 12, "rules found");
  // Gated at the front, or (inside the large-landscape block, whose selectors
  // must START with the density guard) by a :where(:root[data-title-side]) clause.
  for (const s of sels) assert.match(s, /^(:root\[data-title-(layout|btnw|btns|side)|:root\[data-tl-edit\]|body\[data-tl-peek\]|:where\(body:not\(\[data-density="compact"\]\)\):where\(:root\[data-title-side="swap"\] \*\))/, `gated: ${s}`);
  assert.match(block, /:root\[data-title-layout\] #menu-buttons \{[^}]*translate: var\(--tl-btns-x, 0\) var\(--tl-btns-y, 0\)/);
  assert.match(block, /zoom: calc\(var\(--ui-scale\) \* var\(--tl-btns-size, 1\)\)/);
  assert.match(block, /#title-car \{[^}]*scale: var\(--tl-art-size, 1\)/);
});

test("registered: manifest, export key, and the shell loads it", () => {
  assert.match(read("tools/manifest.cjs"), /"js\/ui\/title-layout\.js",/);
  assert.match(read("tools/manifest.cjs"), /\["js\/core\/store\.js", "js\/ui\/title-layout\.js"\]/);
  assert.match(read("js/ui/settings-export.js"), /k: "titleLayout", lane: "json", group: "appearance", def: null/);
  assert.match(SHELL, /<script defer crossorigin="anonymous" src="js\/ui\/title-layout\.js\?v=dev"><\/script>/);
});
